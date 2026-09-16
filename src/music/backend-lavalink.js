// Lecture via un serveur Lavalink : c'est lui qui récupère le son et l'envoie dans le vocal Discord.
import { config } from '../config.js';
import { anchorChannel, releaseExternalVoice, takeVoiceForExternal } from '../features/voice.js';
import { lavalinkFilters, speedOf } from './filters.js';
import { lavalink, NoAudioNodeError } from './lavalink.js';
import { MusicError } from './ytdlp.js';

const START_TIMEOUT_MS = 25_000;
const START_GRACE_MS = 2_500; // certains serveurs annoncent le démarrage puis échouent juste après
const NODE_BROKEN_MS = 10 * 60_000;
const NODE_STALLS_BEFORE_BREAK = 3; // coupures en pleine lecture sur un serveur avant de le mettre de côté
const FAST_PLAYBACK_BAN_MS = 60 * 60_000;
const FAST_RATIO = 1.7; // le son avance 1,7x plus vite que l'horloge : le serveur audio déraille
const EARLY_END_MARGIN_S = 15;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shortError = (text = '') => text.split('\n')[0].slice(0, 120);

const SOURCE_NAMES = {
  youtube: 'youtube', ytmusic: 'youtube', youtubemusic: 'youtube', soundcloud: 'soundcloud',
  spotify: 'spotify', applemusic: 'apple', deezer: 'deezer',
};

export class LavalinkBackend {
  constructor(player) {
    this.player = player;
    this.guild = player.guild;
    this.liveControls = true; // volume / effets / avance sans relancer le son
    this.node = null;
    this.voice = null;
    this.voiceChannelId = null;
    this.currentEncoded = null;
    this.currentItem = null;
    this.pending = null;
    this.lastState = { position: 0, at: Date.now() };
    this.endTimer = null;
    this.leaving = false;
    this.recovering = false;
    this.connecting = false;
    this.lastVoiceKey = null;
    this.speedSample = null;
    this.fastStrikes = 0;
    this.voiceBroken = false; // la connexion vocale du serveur audio a lâché pendant qu'aucun son jouait
  }

  get name() {
    return `Lavalink · ${this.node?.name ?? '?'}`;
  }

  // ===== Connexion vocale =====

  /** Salon où Discord dit que le bot est VRAIMENT (et pas celui qu'on croit). */
  actualVoiceChannelId() {
    return lavalink.voiceStates.get(this.guild.id)?.channelId ?? this.guild.members.me?.voice?.channelId ?? null;
  }

  async connect(voiceChannel) {
    if (!this.node?.usable) this.node = lavalink.bestNode();
    if (!this.node) throw new NoAudioNodeError('aucun serveur audio disponible');
    lavalink.attach(this.guild.id, this);
    const actual = this.actualVoiceChannelId();
    if (this.voice && !this.voiceBroken && this.voiceChannelId === voiceChannel.id && actual === voiceChannel.id) return;

    this.connecting = true;
    try {
      // Session vocale morte : on sort et on revient pour en avoir une neuve
      if (this.voiceBroken && actual) {
        this.leaving = true;
        this.guild.shard.send({ op: 4, d: { guild_id: this.guild.id, channel_id: null, self_mute: false, self_deaf: true } });
        await sleep(900);
        this.leaving = false;
      }
      this.voiceBroken = false;
      this.voice = null;
      await this.joinVoice(voiceChannel.id);
    } catch (err) {
      // Échec du passage de relais : on rend le vocal au mode 24h/24
      this.leaving = false;
      lavalink.detach(this.guild.id, this);
      await releaseExternalVoice(this.guild);
      throw err;
    } finally {
      this.connecting = false;
    }
  }

  async joinVoice(channelId) {
    await takeVoiceForExternal(this.guild);

    // Le bot est déjà dans ce salon (vocal 24h/24) : on réutilise sa session, il ne quitte pas le vocal
    const cached = lavalink.cachedVoice(this.guild.id, channelId);
    if (cached) {
      this.voice = cached;
      this.voiceChannelId = channelId;
      return this.sendVoice();
    }

    const waiting = lavalink.waitForVoice(this.guild.id, channelId);
    this.guild.shard.send({ op: 4, d: { guild_id: this.guild.id, channel_id: channelId, self_mute: false, self_deaf: true } });
    this.voice = await waiting;
    this.voiceChannelId = channelId;
    return this.sendVoice();
  }

  /** Fin de la musique : le bot reste avec le chef (ou retourne dans son vocal) sans se déconnecter. */
  async moveToHome() {
    const home = anchorChannel(this.guild);
    if (!home || !config.voice.enabled) return this.destroy();
    await this.stopTrack();
    return this.moveTo(home.id).catch(() => {});
  }

  /** Change de salon vocal sans quitter : la musique continue dans le nouveau salon. */
  async moveTo(channelId) {
    if (!channelId || (this.voiceChannelId === channelId && this.actualVoiceChannelId() === channelId)) return;
    this.connecting = true;
    try {
      const waiting = lavalink.waitForVoice(this.guild.id, channelId, 10_000).catch(() => null);
      this.guild.shard.send({ op: 4, d: { guild_id: this.guild.id, channel_id: channelId, self_mute: false, self_deaf: true } });
      const voice = await waiting;
      this.voiceChannelId = channelId;
      if (voice) this.voice = voice;
      if (this.voice) await this.sendVoice().catch(() => {});
      this.speedSample = null;
    } finally {
      this.connecting = false;
    }
  }

  sendVoice() {
    const voice = { token: this.voice.token, endpoint: this.voice.endpoint, sessionId: this.voice.sessionId, channelId: this.voiceChannelId };
    // Le même accès vocal envoyé deux fois fait dérailler certains serveurs audio (son accéléré) : on ne l'envoie qu'une fois
    const key = [this.node.name, this.node.sessionId, voice.token, voice.endpoint, voice.sessionId, voice.channelId].join('|');
    if (key === this.lastVoiceKey) return Promise.resolve();
    this.lastVoiceKey = key;
    return this.node.updatePlayer(this.guild.id, {
      voice,
      volume: this.player.volume,
      filters: lavalinkFilters(this.player.filters, this.node),
    }).catch((err) => {
      this.lastVoiceKey = null;
      throw err;
    });
  }

  /** Redemande une session vocale neuve (changement de serveur audio, coupure...). */
  async refreshVoice() {
    const channelId = this.voiceChannelId;
    if (!channelId) return;
    this.leaving = true;
    this.guild.shard.send({ op: 4, d: { guild_id: this.guild.id, channel_id: null, self_mute: false, self_deaf: true } });
    await sleep(900);
    this.leaving = false;
    this.voice = null;
    await this.joinVoice(channelId);
  }

  // ===== Recherche du son sur le serveur audio =====

  candidates(track) {
    const query = track.query || `${track.artist ?? ''} ${track.title}`.trim();
    return [...new Set([
      ...(track.playUrl ? [track.playUrl] : []),
      `ytmsearch:${query}`,
      `ytsearch:${query}`,
      `scsearch:${query}`,
    ])];
  }

  /** Choisit le meilleur résultat : bonne durée, et jamais un extrait de 30 s. */
  pick(result, track, isSearch) {
    let items = [];
    if (result.loadType === 'track') items = [result.data];
    else if (result.loadType === 'search') items = result.data;
    else if (result.loadType === 'playlist') items = result.data.tracks;
    // Les versions qui ont déjà planté sur ce serveur sont écartées
    items = items.filter((item) => item && !track.badItems?.has(this.itemKey(item)));

    const full = items.filter((item) => item.info.isStream || !track.duration || item.info.length / 1000 >= Math.min(35, track.duration * 0.6));
    if (!isSearch) return full[0] ?? null;
    const close = full.find((item) => !track.duration || item.info.isStream || Math.abs(item.info.length / 1000 - track.duration) <= 30);
    return close ?? full[0] ?? null;
  }

  itemKey(item) {
    return `${this.node?.name}|${item.info.identifier ?? item.info.uri}`;
  }

  /** Cette version du son a planté sur ce serveur : on ne la reprendra plus pour ce son. */
  markBad(track, item) {
    if (!item) return;
    track.badItems ??= new Set();
    track.badItems.add(this.itemKey(item));
  }

  applyMetadata(track, item) {
    const info = item.info;
    track.url ??= info.uri;
    track.playUrl ??= info.uri;
    track.thumbnail ??= info.artworkUrl ?? null;
    track.title ||= info.title;
    track.artist ||= info.author;
    // Durée de la version vraiment jouée (sinon la barre déborde et la fin est mal calculée)
    if (info.length && !info.isStream) track.duration = Math.round(info.length / 1000);
    track.isLive = Boolean(info.isStream);
    if (track.source === 'deezer') track.source = SOURCE_NAMES[info.sourceName?.toLowerCase()] ?? 'youtube';
  }

  // ===== Lecture =====

  async play(track, seek, token) {
    const triedNodes = new Set();
    const tried = new Set();
    let lastError = null;

    // Ce serveur coupe trop en ce moment : on passe sur un autre qui va bien
    if (this.node && Date.now() < this.node.brokenUntil) {
      const other = lavalink.bestNode([this.node.name]);
      if (other && Date.now() >= other.brokenUntil) {
        triedNodes.add(this.node.name);
        await this.switchNode(triedNodes).catch(() => {});
      }
    }

    // Son déjà préparé pendant le précédent : on démarre tout de suite (enchaînement quasi instantané)
    if (track.lavalinkReady?.node === this.node?.name) {
      const ready = track.lavalinkReady;
      track.lavalinkReady = null;
      try {
        await this.start(ready.item, seek);
        this.applyMetadata(track, ready.item);
        return true;
      } catch (err) {
        lastError = err;
        this.markBad(track, ready.item);
        if (token !== this.player.playToken) return false;
      }
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      if (token !== this.player.playToken) return false;
      if (!this.node?.usable && !(await this.switchNode(triedNodes))) break;

      for (const identifier of this.candidates(track)) {
        const key = `${this.node.name}|${identifier}`;
        if (tried.has(key)) continue;
        tried.add(key);

        let item = null;
        try {
          const result = await this.node.loadTracks(identifier);
          item = this.pick(result, track, /^\w+search:/.test(identifier));
        } catch (err) {
          lastError = err;
          continue;
        }
        if (!item) continue;
        if (token !== this.player.playToken) return false;

        try {
          await this.start(item, seek);
          this.applyMetadata(track, item);
          return true;
        } catch (err) {
          lastError = err;
          this.markBad(track, item);
          lavalink.log(`${this.node.name} n'a pas pu lire "${track.title}" : ${shortError(err.message)}`);
          if (token !== this.player.playToken) return false;
        }
      }

      // Ce serveur n'y arrive pas : on passe au suivant
      this.node.brokenUntil = Date.now() + NODE_BROKEN_MS;
      triedNodes.add(this.node.name);
      if (!(await this.switchNode(triedNodes))) break;
    }

    throw new MusicError(lastError ? `aucun serveur audio n'a pu le lire (${shortError(lastError.message)})` : 'aucun serveur audio disponible');
  }

  start(item, seek) {
    return new Promise((resolve, reject) => {
      const pending = { encoded: item.encoded, graceTimer: null };
      pending.finish = (err) => {
        if (this.pending !== pending) return;
        this.pending = null;
        clearTimeout(pending.timer);
        clearTimeout(pending.graceTimer);
        if (err) reject(err);
        else resolve();
      };
      pending.timer = setTimeout(() => pending.finish(new Error('le serveur audio ne répond pas')), START_TIMEOUT_MS);
      this.pending = pending;
      clearTimeout(this.endTimer);
      this.endTimer = null;
      this.currentEncoded = item.encoded;
      this.currentItem = item;
      this.lastState = { position: seek * 1000, at: Date.now() };

      this.node.updatePlayer(this.guild.id, {
        track: { encoded: item.encoded },
        position: Math.round(seek * 1000),
        paused: this.player.paused,
        volume: this.player.volume,
        filters: lavalinkFilters(this.player.filters, this.node),
      }).catch((err) => pending.finish(err));
    });
  }

  async switchNode(exclude) {
    const next = lavalink.bestNode([...exclude]);
    if (!next || next === this.node) return false;
    const previous = this.node;
    lavalink.log(`Bascule ${previous?.name ?? '?'} → ${next.name}`);
    await previous?.destroyPlayer(this.guild.id);
    this.node = next;
    this.currentEncoded = null;
    this.speedSample = null;
    if (this.voiceChannelId && this.voice) {
      // Même session vocale passée au nouveau serveur : le bot ne quitte pas le vocal
      await sleep(400);
      try {
        await this.sendVoice();
      } catch {
        await this.refreshVoice();
      }
    } else if (this.voiceChannelId) {
      await this.refreshVoice();
    }
    return true;
  }

  // ===== Événements du serveur audio =====

  onEvent(message) {
    const pending = this.pending;
    const sameTrack = !message.track?.encoded || message.track.encoded === this.currentEncoded;

    switch (message.type) {
      case 'TrackStartEvent':
        if (pending && sameTrack) {
          pending.graceTimer = setTimeout(() => pending.finish(), START_GRACE_MS);
        }
        break;

      case 'TrackExceptionEvent':
      case 'TrackStuckEvent': {
        if (!sameTrack) return;
        const error = new Error(message.type === 'TrackStuckEvent' ? 'le son a calé (plus de données)' : message.exception?.message ?? 'erreur de lecture');
        if (pending) return pending.finish(error);
        lavalink.log(`${this.node?.name} : "${this.player.current?.title}" coupé à ${Math.round(this.position())}s (${shortError(error.message)})`);
        this.currentEncoded = null;
        return this.player.onTrackEnd({ failed: true, error });
      }

      case 'TrackEndEvent': {
        if (!sameTrack || ['replaced', 'stopped'].includes(message.reason)) return;
        if (message.reason === 'loadFailed') {
          const error = new Error('le serveur audio n\'a pas réussi à charger le son');
          if (pending) return pending.finish(error);
          this.currentEncoded = null;
          return this.player.onTrackEnd({ failed: true, error });
        }
        if (pending) return; // fin bizarre pendant le démarrage : le délai gère
        // Le serveur dit "fini" alors qu'il restait un bon bout : c'est une coupure
        if (message.reason === 'finished' && this.endedTooEarly()) {
          lavalink.log(`${this.node?.name} : "${this.player.current?.title}" arrêté à ${Math.round(this.position())}s sur ${Math.round(this.currentItem.info.length / 1000)}s`);
          this.currentEncoded = null;
          return this.player.onTrackEnd({ failed: true, error: new Error("le son s'est coupé avant la fin") });
        }
        this.currentEncoded = null;
        return this.player.onTrackEnd({ failed: message.reason === 'cleanup' });
      }

      case 'WebSocketClosedEvent': {
        if (this.leaving || this.recovering) return;
        // 4016 / 4017 : Discord refuse ce serveur (chiffrement vocal non géré)
        if ([4016, 4017].includes(message.code)) {
          lavalink.log(`${this.node?.name} refusé par Discord (chiffrement vocal, code ${message.code})`);
          if (this.node) this.node.incompatible = true;
          return this.recover('serveur incompatible');
        }
        // 4014 alors que le bot est toujours dans un salon = simple déplacement : on renvoie l'accès vocal, sans quitter
        if (message.code === 4014 && this.actualVoiceChannelId()) {
          setTimeout(() => {
            if (!this.actualVoiceChannelId() || this.leaving) return;
            this.lastVoiceKey = null;
            if (this.voice) this.sendVoice().catch(() => {});
          }, 1_500);
          return undefined;
        }
        if ([4006, 4009, 4014, 4015].includes(message.code)) {
          lavalink.log(`Connexion vocale fermée (code ${message.code})${this.player.current ? '' : ' sans musique en cours'}`);
          // Rien ne joue : on retient qu'il faudra une session neuve au prochain /play
          if (!this.player.current) {
            this.voiceBroken = true;
            return undefined;
          }
          return this.recover(`connexion vocale perdue (code ${message.code})`);
        }
        break;
      }
      default:
    }
    return undefined;
  }

  endedTooEarly() {
    const info = this.currentItem?.info;
    if (!info?.length || info.isStream) return false;
    return this.position() < info.length / 1000 - EARLY_END_MARGIN_S;
  }

  onPlayerUpdate(state) {
    if (typeof state.position === 'number') {
      this.checkSpeed(state.position);
      this.lastState = { position: state.position, at: Date.now() };
    }
    this.watchEnd();
  }

  /** Certains serveurs audio se mettent à jouer le son en accéléré : on le repère et on change de serveur. */
  checkSpeed(position) {
    const now = Date.now();
    const previous = this.speedSample;
    this.speedSample = { position, at: now, encoded: this.currentEncoded };
    if (!previous || previous.encoded !== this.currentEncoded || this.pending || this.player.paused || !this.player.current || this.recovering) {
      this.fastStrikes = 0;
      return;
    }
    const wall = now - previous.at;
    if (wall < 2_000) return;
    const ratio = (position - previous.position) / wall / speedOf(this.player.filters);
    if (ratio < FAST_RATIO) {
      this.fastStrikes = 0;
      return;
    }
    if (++this.fastStrikes === 1) this.fastFrom = previous.position;
    if (this.fastStrikes < 2) return;

    const node = this.node;
    lavalink.log(`${node?.name} joue le son en accéléré (x${ratio.toFixed(1)}) : mis de côté 1 h`);
    console.warn(`[musique] ${node?.name} : son accéléré x${ratio.toFixed(1)}, changement de serveur audio`);
    if (node) node.brokenUntil = Date.now() + FAST_PLAYBACK_BAN_MS;
    this.fastStrikes = 0;
    this.speedSample = null;
    const resumeAt = Math.max(0, (this.fastFrom ?? 0) / 1000 - 2);
    this.recovering = true;
    this.switchNode(new Set(node ? [node.name] : []))
      .then((switched) => this.player.startCurrent(switched ? resumeAt : resumeAt))
      .catch((err) => this.player.onTrackEnd({ failed: true, error: err }))
      .finally(() => { this.recovering = false; });
  }

  /**
   * Filet de sécurité : si un serveur audio oublie d'annoncer la fin d'un son,
   * on enchaîne quand même sur le suivant.
   */
  watchEnd() {
    const track = this.player.current;
    if (!track?.duration || track.isLive || this.pending || this.endTimer || this.player.paused) return;
    const remaining = track.duration * 1000 - this.lastState.position;
    if (remaining > 4_000) return;
    this.endTimer = setTimeout(() => {
      this.endTimer = null;
      if (this.player.current !== track || !this.currentEncoded) return;
      if (this.position() < track.duration - 2) return;
      lavalink.log('Fin de son non signalée : on passe au suivant');
      this.currentEncoded = null;
      this.player.onTrackEnd({ failed: false });
    }, Math.max(1_000, remaining) + 5_000);
  }

  onNodeDown() {
    // Le serveur garde les lecteurs 60 s : on lui laisse le temps de revenir
    setTimeout(() => {
      if (this.node?.usable) return;
      if (this.player.current) return this.recover('serveur audio déconnecté');
      // Rien en cours : on rend le vocal au mode 24h/24
      return this.player.destroy().catch(() => {});
    }, 15_000);
  }

  onVoiceServer(data) {
    if (!this.voice || this.connecting || this.leaving || this.pending?.joining || !data.endpoint) return;
    this.voice = { ...this.voice, token: data.token, endpoint: data.endpoint };
    this.sendVoice().catch(() => {});
  }

  onVoiceState(data) {
    if (this.leaving || !this.voiceChannelId) return;
    if (!data.channel_id) {
      // Le bot a été déconnecté du vocal
      setTimeout(() => {
        if (this.leaving || this.connecting || lavalink.players.get(this.guild.id) !== this) return;
        if (this.actualVoiceChannelId()) return; // déjà revenu entre-temps
        if (this.player.current) return this.recover('déconnecté du vocal');
        // Rien ne joue : on rend la main au vocal 24h/24, qui le fait revenir direct dans son salon
        lavalink.log('Sorti du vocal sans musique : retour au vocal 24h/24');
        return this.player.destroy().catch(() => {});
      }, 2_000);
      return;
    }
    if (data.channel_id !== this.voiceChannelId && !this.connecting) {
      this.voiceChannelId = data.channel_id;
      this.voice = { ...this.voice, sessionId: data.session_id };
      this.sendVoice().catch(() => {});
    }
  }

  /** Reprend la lecture après un problème (serveur tombé, vocal coupé). */
  async recover(reason) {
    if (this.recovering || !this.player.current) return;
    this.recovering = true;
    const position = this.position();
    lavalink.log(`Reprise en cours (${reason})`);
    try {
      if (!this.node?.usable) {
        if (!(await this.switchNode(new Set(this.node ? [this.node.name] : [])))) throw new NoAudioNodeError('plus aucun serveur audio');
      } else {
        await this.refreshVoice();
      }
      await this.player.startCurrent(position);
    } catch (err) {
      this.player.onTrackEnd({ failed: true, error: err });
    } finally {
      this.recovering = false;
    }
  }

  // ===== Contrôles =====

  position() {
    const { position, at } = this.lastState;
    if (!this.player.current) return 0;
    if (this.player.paused) return position / 1000;
    return (position + (Date.now() - at) * speedOf(this.player.filters)) / 1000;
  }

  pause(paused) {
    this.lastState = { position: this.position() * 1000, at: Date.now() };
    return this.node?.updatePlayer(this.guild.id, { paused }).catch(() => {});
  }

  applyVolume(volume) {
    return this.node?.updatePlayer(this.guild.id, { volume }).catch(() => {});
  }

  applyFilters(filters) {
    this.lastState = { position: this.position() * 1000, at: Date.now() };
    return this.node?.updatePlayer(this.guild.id, { filters: lavalinkFilters(filters, this.node) }).catch(() => {});
  }

  async seek(seconds) {
    const position = Math.max(0, Math.round(seconds * 1000));
    this.speedSample = null;
    await this.node?.updatePlayer(this.guild.id, { position });
    this.lastState = { position, at: Date.now() };
  }

  stopTrack() {
    this.currentEncoded = null;
    this.pending?.finish(new Error('lecture arrêtée'));
    return this.node?.updatePlayer(this.guild.id, { track: { encoded: null } }).catch(() => {});
  }

  /** Prépare le son suivant pendant que le son actuel joue : le passage devient instantané. */
  async preload(track) {
    if (!track || !this.node?.usable || track.preloading) return;
    if (track.lavalinkReady?.node === this.node.name) return;
    track.preloading = true;
    try {
      for (const identifier of this.candidates(track)) {
        const result = await this.node.loadTracks(identifier).catch(() => null);
        const item = result && this.pick(result, track, /^\w+search:/.test(identifier));
        if (item) {
          track.lavalinkReady = { node: this.node.name, item };
          this.applyMetadata(track, item);
          return;
        }
      }
    } finally {
      track.preloading = false;
    }
  }

  /** Le son a planté en pleine lecture : on reprendra avec une autre version, et si ce serveur coupe souvent, sur un autre. */
  invalidate(track) {
    this.markBad(track, this.currentItem);
    track.lavalinkReady = null;
    track.playUrl = track.source === 'youtube' || track.source === 'soundcloud' ? track.playUrl : null;

    const node = this.node;
    if (!node) return;
    const now = Date.now();
    node.stalls = (node.stalls ?? []).filter((at) => now - at < NODE_BROKEN_MS);
    node.stalls.push(now);
    if (node.stalls.length >= NODE_STALLS_BEFORE_BREAK) {
      node.brokenUntil = now + NODE_BROKEN_MS;
      node.stalls = [];
      lavalink.log(`${node.name} coupe les sons trop souvent : mis de côté 10 min`);
    }
  }

  destroy() {
    clearTimeout(this.endTimer);
    this.endTimer = null;
    lavalink.detach(this.guild.id, this);
    this.pending?.finish(new Error('lecteur fermé'));
    this.node?.destroyPlayer(this.guild.id);
    this.currentEncoded = null;
    return releaseExternalVoice(this.guild);
  }
}
