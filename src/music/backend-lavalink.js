// Lecture via un serveur Lavalink : c'est lui qui récupère le son et l'envoie dans le vocal Discord.
import { config } from '../config.js';
import { anchorChannel, releaseExternalVoice, takeVoiceForExternal } from '../features/voice.js';
import { deezer, matchRatio } from './deezer.js';
import { lavalinkFilters, speedOf } from './filters.js';
import { lavalink, NoAudioNodeError } from './lavalink.js';
import { isBadSoundVideo, isWorkVariant } from './blindworks.js';
import { MusicError } from './ytdlp.js';

const START_TIMEOUT_MS = 25_000;
const START_GRACE_MS = 2_500; // certains serveurs annoncent le démarrage puis échouent juste après
const NODE_BROKEN_MS = 10 * 60_000;
const NODE_STALLS_BEFORE_BREAK = 2; // coupures en pleine lecture sur un serveur avant de le mettre de côté
const YOUTUBE_TROUBLE_MS = 5 * 60_000; // YouTube bloque parfois les serveurs publics : on passe par SoundCloud pendant ce temps
const FAST_PLAYBACK_BAN_MS = 60 * 60_000;
const FAST_RATIO = 1.07; // le son avance plus vite que l'horloge du serveur (voix aiguës) : le serveur audio déraille
const FAST_RATIO_NO_CLOCK = 1.5; // sans l'horloge du serveur, les mesures sont moins précises
// Versions qui ne sont pas le son original (sauf si c'est justement ce qui est demandé)
const VARIANT = /\b(sped ?up|speed ?up|slowed|reverb|nightcore|8d|bass ?boost(ed)?|karaok[eé]|instrumental|acapella|a cappella|mashup|cover|remix|extended|live|1[.,]\d+ ?x|x ?1[.,]\d+|lyrics?|paroles|tiktok|version|reggae|edit|mix)\b/i;
// Chaînes qui ne publient que des versions modifiées
const VARIANT_AUTHOR = /\b(sped ?up|slowed|nightcore|8d|karaok[eé]|reverb|lyrics?|paroles|remix(es)?|tiktok)\b/i;
// Mots qu'on trouve dans les titres des vraies vidéos officielles sans que ce soit une autre version
const NOISE = new Set(['feat', 'ft', 'featuring', 'official', 'officiel', 'officielle', 'audio', 'video', 'clip', 'music', 'musique', 'visualizer', 'visualiser', 'prod', 'by', 'hd', 'hq', '4k', 'topic', 'x', 'et', 'and', 'with', 'avec', 'the', 'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'remastered', 'remaster', 'explicit', 'mv']);
const normalizeText = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => normalizeText(s).split(' ').filter(Boolean);
const cleanTitle = (text = '') => text.replace(/\s*[([].*?[)\]]/g, ' ').replace(/\s+-\s+.*$/, ' ').replace(/\s*(feat|ft)\.?\s.*$/i, ' ').trim();
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
    const curatedYoutube = Boolean(track.strict && track.curated && !track.isrc);
    return [...new Set([
      // Le code ISRC désigne exactement l'enregistrement : c'est la recherche la plus sûre
      ...(track.isrc ? [`ytmsearch:"${track.isrc}"`] : []),
      ...(track.playUrl ? [track.playUrl] : []),
      // Musique / son de jeu pas sur Deezer : YouTube classique d'abord (jamais YouTube Music pour un effet sonore)
      ...(curatedYoutube ? [`ytsearch:${query}`] : []),
      ...(curatedYoutube && track.sfx ? [`scsearch:${query}`] : [`ytmsearch:${query}`]),
      // Recherche YouTube classique / SoundCloud : pleine d'uploads de fans (accélérés, pitchés) -> jamais en blind test
      ...(track.strict ? [] : [`ytsearch:${query}`, `scsearch:${query}`]),
      // Dernier recours quand YouTube Music ne donne rien : recherche YouTube (le choix reste aussi strict)
      ...(track.strict && !track.curated ? [`ytsearch:${query}`, `scsearch:${query}`] : []),
    ])];
  }

  /** Les recherches à essayer, SoundCloud en premier si YouTube ne se lance plus sur ce serveur. */
  searchOrder(track) {
    const list = this.candidates(track);
    if (!this.youtubeInTrouble()) return list;
    const query = track.query || `${track.artist ?? ''} ${track.title}`.trim();
    const soundcloud = `scsearch:${query}`;
    return [...new Set([soundcloud, ...list])];
  }

  /** Choisit le meilleur résultat : le bon morceau (titre + artiste), bonne durée, jamais un extrait de 30 s. */
  pick(result, track, isSearch, identifier = '') {
    let items = [];
    if (result.loadType === 'track') items = [result.data];
    else if (result.loadType === 'search') items = result.data;
    else if (result.loadType === 'playlist') items = result.data.tracks;
    // Les versions qui ont déjà planté sur ce serveur sont écartées
    items = items.filter((item) => item && !track.badItems?.has(this.itemKey(item)));

    const full = items.filter((item) => item.info.isStream || !track.duration || item.info.length / 1000 >= Math.min(35, track.duration * 0.6));
    if (!isSearch) return full[0] ?? null;

    // Son connu (Deezer, Spotify...) : on vérifie que c'est bien lui, pas un autre son de l'artiste ni une version accélérée
    const known = Boolean(track.deezerId || track.spotifyId || track.isrc || track.appleId);
    if (known) {
      const byIsrc = track.isrc && identifier.includes(track.isrc);
      const scored = full.map((item) => ({ item, ...this.matchScore(item, track) })).filter((s) => !s.variant);
      // Version d'origine : même enregistrement (ISRC), ou chaîne de l'artiste + même titre sans mots en trop + même durée
      const original = scored
        .filter((s) => (byIsrc
          ? s.title >= 0.75 && s.keyTitle >= 1 && s.extra <= 0.35 && (s.author >= 0.5 || s.artist >= 0.5) && s.gap <= 6
          : s.title >= 0.8 && s.keyTitle >= 1 && s.author >= 0.5 && s.extra <= 0.2 && s.gap <= 5))
        .sort((a, b) => (b.title + b.author) - (a.title + a.author) || a.gap - b.gap);
      if (original[0]) return original[0].item;
      if (track.strict) return null;
      // Musique normale : clip de la chaîne de l'artiste (quelques secondes d'intro en plus accepté),
      // ou re-upload avec exactement la même durée (une version accélérée / pitchée change la durée)
      const official = scored
        .filter((s) => s.keyTitle >= 1 && !s.variant
          && ((s.author >= 0.5 && s.extra <= 0.35 && s.gap <= 12) || (s.artist >= 0.5 && s.extra <= 0.15 && s.gap <= 4)))
        .sort((a, b) => (b.title + b.author) - (a.title + a.author) || a.gap - b.gap);
      return official[0]?.item ?? null;
    }

    if (track.curated) {
      // Effet sonore : court, pas une compilation ; musique : entre 30 s et 12 min, pas une version modifiée
      const clean = full
        .filter((item) => !item.info.isStream && (track.sfx
          ? item.info.length >= 800 && item.info.length <= 30_000 && !isBadSoundVideo(item.info.title)
          : item.info.length >= 30_000 && item.info.length <= 12 * 60_000 && !isWorkVariant(`${item.info.title} ${item.info.author}`)))
        .map((item) => {
          const text = `${item.info.title ?? ''} ${item.info.author ?? ''}`;
          return {
            item,
            title: matchRatio(cleanTitle(track.title) || track.title, item.info.title ?? ''),
            work: track.work ? matchRatio(track.work, text) : 1,
            artist: track.sfx ? 0 : matchRatio(track.artist ?? '', text),
          };
        })
        .filter((s) => s.title >= (track.sfx ? 0.5 : 0.6) && (track.sfx ? s.work >= 0.5 : s.work >= 0.5 || s.artist >= 0.5))
        .sort((a, b) => (b.title + (b.work + b.artist) / 2) - (a.title + (a.work + a.artist) / 2));
      return clean[0]?.item ?? null;
    }
    const close = full.find((item) => !track.duration || item.info.isStream || Math.abs(item.info.length / 1000 - track.duration) <= 30);
    return close ?? full[0] ?? null;
  }

  /** Ressemblance entre un résultat et le son attendu. */
  matchScore(item, track) {
    const { info } = item;
    const expectedTitle = cleanTitle(track.title) || track.title;
    // Mots du titre de la vidéo qui ne viennent ni du titre, ni des artistes (ex : "paroles", "reggae", un pseudo de fan)
    const allowed = new Set(words(`${track.title} ${track.artist ?? ''} ${(track.contributors ?? []).join(' ')}`));
    const itemWords = words(info.title ?? '').filter((w) => !NOISE.has(w) && !/^\d{4}$/.test(w));
    const unexplained = itemWords.filter((w) => !allowed.has(w) && ![...allowed].some((a) => a.length >= 4 && w.length >= 4 && (a.startsWith(w) || w.startsWith(a))));
    return {
      variant: (VARIANT.test(info.title ?? '') && !VARIANT.test(track.title ?? '')) || VARIANT_AUTHOR.test(info.author ?? ''),
      title: matchRatio(expectedTitle, info.title ?? ''),
      // Les mots importants du titre (3 lettres et +) doivent tous y être : "à moi" ≠ "à nous"
      keyTitle: (() => {
        const key = words(expectedTitle).filter((w) => w.length >= 3);
        return key.length ? matchRatio(key.join(' '), info.title ?? '') : 1;
      })(),
      artist: track.artist ? matchRatio(track.artist, `${info.author ?? ''} ${info.title ?? ''}`) : 1,
      author: track.artist ? Math.max(matchRatio(track.artist, info.author ?? ''), ...(track.contributors ?? []).map((name) => matchRatio(name, info.author ?? ''))) : 1,
      extra: itemWords.length ? unexplained.length / itemWords.length : 0,
      gap: track.duration && info.length && !info.isStream ? Math.abs(info.length / 1000 - track.duration) : 0,
    };
  }

  /** YouTube refuse de se lancer sur ce serveur en ce moment ? (les serveurs publics se font bloquer par moments) */
  youtubeInTrouble() {
    const fails = (this.node?.youtubeFails ?? []).filter((at) => Date.now() - at < YOUTUBE_TROUBLE_MS);
    if (this.node) this.node.youtubeFails = fails;
    return fails.length >= 3;
  }

  noteYoutubeFail(item) {
    if (!this.node || !/youtube/i.test(item?.info?.sourceName ?? '')) return;
    this.node.youtubeFails = [...(this.node.youtubeFails ?? []), Date.now()].slice(-10);
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
    let serverError = false;
    await this.ensureIsrc(track);

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
        this.noteYoutubeFail(ready.item);
        if (token !== this.player.playToken) return false;
        // Blind test : le son a déjà été entendu, on ne met pas une autre version en douce (la partie relance proprement)
        if (this.player.blind && err.announced && this.player.blindRunning?.()) throw new MusicError('le son a coupé juste après le départ');
      }
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      if (token !== this.player.playToken) return false;
      if (!this.node?.usable && !(await this.switchNode(triedNodes))) break;

      for (const identifier of this.searchOrder(track)) {
        const key = `${this.node.name}|${identifier}`;
        if (tried.has(key)) continue;
        tried.add(key);

        let item = null;
        try {
          const result = await this.node.loadTracks(identifier);
          item = this.pick(result, track, /^\w+search:/.test(identifier), identifier);
        } catch (err) {
          lastError = err;
          serverError = true;
          continue;
        }
        if (!item) continue;
        if (token !== this.player.playToken) return false;

        try {
          if (this.player.blind) console.log(`[lavalink] ${this.node.name} lance "${item.info.author} - ${item.info.title}" via ${identifier} à ${Math.round(seek)}s`);
          await this.start(item, seek);
          this.applyMetadata(track, item);
          return true;
        } catch (err) {
          lastError = err;
          serverError = true;
          this.markBad(track, item);
          this.noteYoutubeFail(item);
          lavalink.log(`${this.node.name} n'a pas pu lire "${track.title}" : ${shortError(err.message)}`);
          if (token !== this.player.playToken) return false;
          if (this.player.blind && err.announced && this.player.blindRunning?.()) throw new MusicError('le son a coupé juste après le départ');
        }
      }

      // Aucune version d'origine trouvée : ce n'est pas la faute du serveur, on ne change pas de serveur pour rien...
      if (!serverError) {
        // ...sauf si la bonne version a planté sur CE serveur : sur un autre, elle a sa chance
        if (!track.badItems?.size || !(await this.switchNode(new Set([...triedNodes, this.node.name])))) break;
        triedNodes.add(this.node.name);
        continue;
      }
      // Le serveur a vraiment eu des erreurs : on passe au suivant
      this.node.brokenUntil = Date.now() + NODE_BROKEN_MS;
      triedNodes.add(this.node.name);
      if (!(await this.switchNode(triedNodes))) break;
    }

    if (!serverError && this.node?.usable) throw new MusicError("pas de version d'origine fiable trouvée pour ce son");
    throw new MusicError(lastError ? `aucun serveur audio n'a pu le lire (${shortError(lastError.message)})` : 'aucun serveur audio disponible');
  }

  /** Code ISRC du son (Deezer) : c'est la recherche la plus sûre pour tomber sur l'enregistrement d'origine. */
  async ensureIsrc(track) {
    if (track.isrc || !track.deezerId || track.isrcChecked) return;
    track.isrcChecked = true;
    const details = await deezer.track(track.deezerId).catch(() => null);
    track.isrc = details?.isrc ?? null;
    if (!track.contributors?.length) track.contributors = (details?.contributors ?? []).map((c) => c.name);
  }

  start(item, seek) {
    return new Promise((resolve, reject) => {
      const pending = { encoded: item.encoded, graceTimer: null };
      pending.finish = (err) => {
        if (this.pending !== pending) return;
        this.pending = null;
        clearTimeout(pending.timer);
        clearTimeout(pending.graceTimer);
        if (err) err.announced = pending.announced;
        if (err) reject(err);
        else resolve();
      };
      pending.timer = setTimeout(() => pending.finish(new Error('le serveur audio ne répond pas')), START_TIMEOUT_MS);
      this.pending = pending;
      clearTimeout(this.endTimer);
      this.endTimer = null;
      this.currentEncoded = item.encoded;
      this.currentItem = item;
      this.startedAt = Date.now();
      if (!this.watchdog) this.startWatchdog();
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

  /**
   * Filet de sécurité : si le serveur audio ne donne plus de nouvelles d'un son "en cours",
   * on lui demande s'il le joue encore ; sinon on passe à la suite (la file ne reste jamais bloquée).
   */
  startWatchdog() {
    this.watchdog = setInterval(async () => {
      const track = this.player.current;
      if (!track || this.pending || this.player.paused || !this.currentEncoded || this.recovering) return;
      // Le son avance côté serveur mais plus rien n'arrive dans Discord : on refait la connexion vocale
      if (await this.voiceLinkDead()) {
        lavalink.log(`${this.node?.name} : le son n'arrive plus dans le vocal, reconnexion`);
        this.voiceDeadSince = 0;
        return this.recover('son bloqué avant Discord');
      }
      if (Date.now() - this.lastState.at < 12_000) return;
      const state = await this.fetchState().catch(() => undefined);
      // Pas de réponse (serveur injoignable) = on ne sait pas : on ne touche à rien
      if (!state || state.track || this.player.current !== track || this.pending || !this.currentEncoded) return;
      lavalink.log(`${this.node?.name} : "${track.title}" n'est plus joué, passage à la suite`);
      this.currentEncoded = null;
      this.player.onTrackEnd({ failed: false });
    }, 5_000);
    this.watchdog.unref?.();
  }

  /**
   * Le serveur audio joue mais Discord ne reçoit rien : sa connexion vocale répond plus (ping -1)
   * ou il se dit déconnecté. Vrai seulement si ça dure (pour ne pas couper sur un simple à-coup).
   */
  async voiceLinkDead() {
    const state = await this.fetchState().catch(() => null);
    if (!state?.track) return false;
    const broken = state.state.connected === false || state.state.ping < 0;
    if (!broken) {
      this.voiceDeadSince = 0;
      return false;
    }
    this.voiceDeadSince ||= Date.now();
    return Date.now() - this.voiceDeadSince > 6_000;
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
    const eventTrack = message.track;
    // Les serveurs audio réécrivent le code du son dans leurs événements : on reconnaît le son à l'identifiant de la vidéo
    const sameTrack = !eventTrack?.encoded
      || eventTrack.encoded === this.currentEncoded
      || Boolean(this.currentEncoded && eventTrack.info?.identifier && eventTrack.info.identifier === this.currentItem?.info?.identifier);

    switch (message.type) {
      case 'TrackStartEvent':
        if (sameTrack) this.player.onAudioStart?.(this.player.current);
        if (pending && sameTrack) {
          pending.announced = true;
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
        if (pending) {
          if (message.reason !== 'finished') return;
          const info = this.currentItem?.info;
          // Un vrai son (plus de 30 s) fini dès le départ : le flux est cassé, on essaie une autre version
          if (info?.length > 30_000 && !info.isStream) return pending.finish(new Error('son terminé dès le départ'));
          // Son très court fini avant la fin du démarrage : démarrage validé, puis passage à la suite
          const encoded = this.currentEncoded;
          pending.finish();
          setTimeout(() => {
            if (this.currentEncoded !== encoded) return;
            this.currentEncoded = null;
            this.player.onTrackEnd({ failed: false });
          }, 50);
          return undefined;
        }
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
    if (!info?.length || info.isStream || info.length > 12 * 3600_000) return false;
    return this.position() < info.length / 1000 - EARLY_END_MARGIN_S;
  }

  onPlayerUpdate(state) {
    // Juste après un changement de son, le serveur renvoie encore la position de l'ancien : on l'ignore
    if (this.pending || Date.now() - (this.startedAt ?? 0) < 2_000) return;
    if (typeof state.position === 'number') {
      this.checkSpeed(state.position, state.time);
      this.lastState = { position: state.position, at: Date.now() };
    }
    this.watchEnd();
  }

  /** Certains serveurs audio se mettent à jouer le son en accéléré : on le repère et on change de serveur. */
  checkSpeed(position, serverTime) {
    const clock = Boolean(serverTime);
    const now = serverTime || Date.now();
    const previous = this.speedSample;
    this.speedSample = { position, at: now, clock, encoded: this.currentEncoded };
    if (!previous || previous.clock !== clock || previous.encoded !== this.currentEncoded || this.pending || this.player.paused || !this.player.current || this.recovering) {
      this.fastStrikes = 0;
      return;
    }
    const wall = now - previous.at;
    if (wall < 2_000) return;
    const ratio = (position - previous.position) / wall / speedOf(this.player.filters);
    if (ratio < (clock ? FAST_RATIO : FAST_RATIO_NO_CLOCK)) {
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

  /** Trouve et valide la bonne version d'un son à l'avance. true = prêt à démarrer instantanément. */
  async prepare(track) {
    await this.ensureIsrc(track);
    if (!this.node?.usable) this.node = lavalink.bestNode();
    if (!this.node) return false;
    if (track.lavalinkReady?.node === this.node.name) return true;
    // Le serveur audio du moment d'abord, puis les autres : un serveur qui rame ne fait pas sauter le son
    const nodes = [this.node, ...lavalink.nodes.filter((node) => node.usable && node !== this.node)];
    for (const node of nodes) {
      for (const identifier of this.searchOrder(track)) {
        const result = await node.loadTracks(identifier).catch(() => null);
        const item = result && this.pick(result, track, /^\w+search:/.test(identifier), identifier);
        if (item) {
          track.lavalinkReady = { node: node.name, item };
          this.applyMetadata(track, item);
          if (track.strict) console.log(`[blindtest] version : "${item.info.author} - ${item.info.title}" (${Math.round(item.info.length / 1000)}s) pour "${track.artist} - ${track.title}" via ${identifier.includes('"') ? 'ISRC' : identifier}${node === this.node ? '' : ` (${node.name})`}`);
          // Le son est prêt sur un autre serveur : on bascule dessus pour le jouer
          if (node !== this.node && !this.player.current) this.node = node;
          return true;
        }
      }
    }
    return false;
  }

  /** État du lecteur vu par le serveur audio : position réelle du son, connexion au vocal. */
  fetchState() {
    if (!this.node?.sessionId || !this.node.connected) return Promise.resolve(null);
    return this.node.request('GET', `/v4/sessions/${this.node.sessionId}/players/${this.guild.id}`);
  }

  /** Prépare le son suivant pendant que le son actuel joue : le passage devient instantané. */
  async preload(track) {
    if (!track || !this.node?.usable || track.preloading) return;
    if (track.lavalinkReady?.node === this.node.name) return;
    track.preloading = true;
    try {
      for (const identifier of this.candidates(track)) {
        const result = await this.node.loadTracks(identifier).catch(() => null);
        const item = result && this.pick(result, track, /^\w+search:/.test(identifier), identifier);
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
    clearInterval(this.watchdog);
    this.watchdog = null;
    clearTimeout(this.endTimer);
    this.endTimer = null;
    lavalink.detach(this.guild.id, this);
    this.pending?.finish(new Error('lecteur fermé'));
    this.node?.destroyPlayer(this.guild.id);
    this.currentEncoded = null;
    return releaseExternalVoice(this.guild);
  }
}
