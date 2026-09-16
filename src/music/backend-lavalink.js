// Lecture via un serveur Lavalink : c'est lui qui récupère le son et l'envoie dans le vocal Discord.
import { releaseExternalVoice, takeVoiceForExternal } from '../features/voice.js';
import { lavalinkFilters, speedOf } from './filters.js';
import { lavalink, NoAudioNodeError } from './lavalink.js';
import { MusicError } from './ytdlp.js';

const START_TIMEOUT_MS = 25_000;
const START_GRACE_MS = 2_500; // certains serveurs annoncent le démarrage puis échouent juste après
const NODE_BROKEN_MS = 10 * 60_000;
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
    this.pending = null;
    this.lastState = { position: 0, at: Date.now() };
    this.endTimer = null;
    this.leaving = false;
    this.recovering = false;
  }

  get name() {
    return `Lavalink · ${this.node?.name ?? '?'}`;
  }

  // ===== Connexion vocale =====

  async connect(voiceChannel) {
    if (!this.node?.usable) this.node = lavalink.bestNode();
    if (!this.node) throw new NoAudioNodeError('aucun serveur audio disponible');
    lavalink.attach(this.guild.id, this);
    if (this.voice && this.voiceChannelId === voiceChannel.id) return;
    try {
      await this.joinVoice(voiceChannel.id);
    } catch (err) {
      // Échec du passage de relais : on rend le vocal au mode 24h/24
      lavalink.detach(this.guild.id, this);
      await releaseExternalVoice(this.guild);
      throw err;
    }
  }

  async joinVoice(channelId) {
    await takeVoiceForExternal(this.guild);
    const waiting = lavalink.waitForVoice(this.guild.id, channelId);
    this.guild.shard.send({ op: 4, d: { guild_id: this.guild.id, channel_id: channelId, self_mute: false, self_deaf: true } });
    this.voice = await waiting;
    this.voiceChannelId = channelId;
    await this.sendVoice();
  }

  sendVoice() {
    return this.node.updatePlayer(this.guild.id, {
      voice: { token: this.voice.token, endpoint: this.voice.endpoint, sessionId: this.voice.sessionId, channelId: this.voiceChannelId },
      volume: this.player.volume,
      filters: lavalinkFilters(this.player.filters, this.node),
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
    items = items.filter(Boolean);

    const full = items.filter((item) => item.info.isStream || !track.duration || item.info.length / 1000 >= Math.min(35, track.duration * 0.6));
    if (!isSearch) return full[0] ?? null;
    const close = full.find((item) => !track.duration || item.info.isStream || Math.abs(item.info.length / 1000 - track.duration) <= 30);
    return close ?? full[0] ?? null;
  }

  applyMetadata(track, item) {
    const info = item.info;
    track.url ??= info.uri;
    track.playUrl ??= info.uri;
    track.thumbnail ??= info.artworkUrl ?? null;
    track.title ||= info.title;
    track.artist ||= info.author;
    track.duration ||= Math.round((info.length ?? 0) / 1000);
    track.isLive = Boolean(info.isStream);
    if (track.source === 'deezer') track.source = SOURCE_NAMES[info.sourceName?.toLowerCase()] ?? 'youtube';
  }

  // ===== Lecture =====

  async play(track, seek, token) {
    const triedNodes = new Set();
    const tried = new Set();
    let lastError = null;

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
    previous?.destroyPlayer(this.guild.id);
    this.node = next;
    this.currentEncoded = null;
    if (this.voiceChannelId) await this.refreshVoice();
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
        const error = new Error(message.exception?.message ?? 'son bloqué');
        if (pending) return pending.finish(error);
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
        if ([4006, 4009, 4014, 4015].includes(message.code)) return this.recover(`connexion vocale perdue (code ${message.code})`);
        break;
      }
      default:
    }
    return undefined;
  }

  onPlayerUpdate(state) {
    if (typeof state.position === 'number') this.lastState = { position: state.position, at: Date.now() };
    this.watchEnd();
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
    if (!this.player.current) return;
    // Le serveur garde les lecteurs 60 s : on lui laisse le temps de revenir
    setTimeout(() => {
      if (!this.node?.usable) this.recover('serveur audio déconnecté');
    }, 15_000);
  }

  onVoiceServer(data) {
    if (!this.voice || this.pending?.joining || !data.endpoint) return;
    this.voice = { ...this.voice, token: data.token, endpoint: data.endpoint };
    this.sendVoice().catch(() => {});
  }

  onVoiceState(data) {
    if (this.leaving || !this.voiceChannelId) return;
    if (!data.channel_id) {
      // Le bot a été déconnecté du vocal : on revient
      setTimeout(() => {
        if (!this.leaving && this.player.current) this.recover('déconnecté du vocal');
      }, 2_000);
      return;
    }
    if (data.channel_id !== this.voiceChannelId) {
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

  invalidate(track) {
    track.playUrl = track.source === 'youtube' || track.source === 'soundcloud' ? track.playUrl : null;
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
