// Lecteur de musique d'un serveur : file d'attente, lecture via ffmpeg, effets, volume, boucle, autoplay, panneau.
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
} from '@discordjs/voice';
import { connectForMusic, onVoiceReady, releaseMusic } from '../features/voice.js';
import { FFMPEG_PATH } from './binaries.js';
import { filterChain, normalizeFilters, speedOf } from './filters.js';
import { prepareTrack, recommendNext } from './sources.js';
import { endedPayload, nowPlayingPayload } from './ui.js';
import { MUSIC_PROXY } from './ytdlp.js';

const DEFAULT_VOLUME = 100;
const BUFFER_BYTES = 2 * 1024 * 1024; // ~3 min d'audio d'avance
const PREBUFFER_BYTES = 48 * 1024; // ~4 s avant de lancer le son
const MAX_STALL_FRAMES = 500; // tolère 10 s de ralentissement avant de considérer le son fini
const MAX_HISTORY = 50;
const IDLE_RELEASE_MS = 3 * 60_000;
const ALONE_STOP_MS = 2 * 60_000;
const PANEL_REFRESH_MS = 15_000;
const players = new Map();

/** Attend d'avoir quelques secondes d'audio en réserve (ou la fin du flux / 8 s max). */
function waitForBuffer(stream, ffmpeg) {
  return new Promise((resolve) => {
    const done = () => {
      clearInterval(check);
      clearTimeout(timer);
      resolve();
    };
    const check = setInterval(() => {
      if (stream.readableLength >= PREBUFFER_BYTES || stream.writableEnded || ffmpeg.exitCode !== null) done();
    }, 50);
    const timer = setTimeout(done, 8_000);
  });
}

export const getPlayer = (guildId) => players.get(guildId) ?? null;

export function getOrCreatePlayer(client, guild) {
  if (!players.has(guild.id)) players.set(guild.id, new GuildPlayer(client, guild));
  return players.get(guild.id);
}

// Si la connexion vocale est recréée (coupure réseau, /admin voc...), on rebranche le lecteur
onVoiceReady((guild, connection) => {
  const player = players.get(guild.id);
  if (player) connection.subscribe(player.audio);
});

export class GuildPlayer {
  constructor(client, guild) {
    this.client = client;
    this.guild = guild;
    this.queue = [];
    this.history = [];
    this.current = null;
    this.volume = DEFAULT_VOLUME;
    this.loop = 'off'; // off | track | queue
    this.filters = [];
    this.autoplay = false;
    this.paused = false;

    this.textChannelId = null;
    this.voiceChannelId = null;
    this.panel = null;
    this.lastPanelEdit = 0;
    this.timers = {};

    this.ffmpeg = null;
    this.resource = null;
    this.seekOffset = 0;
    this.speed = 1;
    this.skipLoop = false;
    this.failures = 0;
    this.playToken = 0;

    this.audio = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause, maxMissedFrames: MAX_STALL_FRAMES } });
    this.audio.on('stateChange', (oldState, newState) => {
      if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle
        && oldState.resource && oldState.resource === this.resource) {
        this.handleEnd().catch((err) => console.warn('[musique] fin de son :', err.message));
      }
    });
    this.audio.on('error', (err) => {
      this.lastError = err;
      console.warn('[musique] erreur de lecture :', err.message);
    });
  }

  // ===== Connexion =====

  async connect(voiceChannel) {
    const connection = await connectForMusic(this.guild, voiceChannel);
    connection.subscribe(this.audio);
    this.voiceChannelId = voiceChannel.id;
    clearTimeout(this.timers.idle);
  }

  get botVoiceChannelId() {
    return getVoiceConnection(this.guild.id)?.joinConfig.channelId ?? null;
  }

  // ===== File d'attente =====

  add(tracks, { next = false } = {}) {
    if (next) this.queue.unshift(...tracks);
    else this.queue.push(...tracks);
    clearTimeout(this.timers.idle);
    if (!this.current) {
      this.startNext();
    } else {
      this.refreshPanel();
      this.preloadNext();
    }
  }

  async startNext() {
    const next = this.queue.shift();
    if (!next) return this.finish();
    this.current = next;
    return this.startCurrent(0, { newTrack: true });
  }

  async startCurrent(seek = 0, { newTrack = false } = {}) {
    const track = this.current;
    if (!track) return;
    const token = ++this.playToken;

    try {
      await prepareTrack(track);
      if (token !== this.playToken || this.current !== track) return; // un autre son a été lancé entre temps
      if (!(await this.spawnStream(track, seek, token))) return;
      this.failures = 0;
      if (newTrack) await this.sendNewPanel();
      else this.refreshPanel(true);
      this.preloadNext();
    } catch (err) {
      if (token !== this.playToken) return;
      console.warn(`[musique] impossible de lire "${track.title}" :`, err.message);
      this.notify(`⚠️ Impossible de lire **${track.title}** (${err.message}), je passe au suivant.`);
      this.current = null;
      if (++this.failures >= 5) {
        this.notify("❌ Trop d'erreurs d'affilée, j'arrête la musique.");
        return this.stop();
      }
      return this.startNext();
    }
  }

  /**
   * Lance ffmpeg et la lecture. On garde une réserve d'audio d'avance pour que les ralentissements
   * (CPU limité, réseau) ne coupent pas le son.
   */
  async spawnStream(track, seek, token) {
    const isHttp = /^https?:/i.test(track.streamUrl);
    // Son déjà en Opus, sans effet ni volume modifié : on recopie l'audio sans le réencoder (presque 0 CPU)
    const copy = track.acodec === 'opus' && !this.filters.length && this.volume === 100 && !/m3u8/i.test(track.protocol ?? '');
    const args = [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      ...(isHttp ? ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '10'] : []),
      ...(isHttp && /^http:\/\//i.test(MUSIC_PROXY) ? ['-http_proxy', MUSIC_PROXY] : []),
      ...(seek > 0 ? ['-ss', seek.toFixed(2)] : []),
      '-i', track.streamUrl,
      '-vn',
      ...(copy
        ? ['-c:a', 'copy']
        : ['-af', filterChain(this.filters, this.volume), '-c:a', 'libopus', '-b:a', '96k', '-compression_level', '5',
          '-frame_duration', '20', '-application', 'audio', '-ar', '48000', '-ac', '2']),
      '-f', 'ogg', 'pipe:1',
    ];

    const ffmpeg = spawn(FFMPEG_PATH, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-1500); });
    ffmpeg.on('error', (err) => console.warn('[musique] ffmpeg :', err.message));
    ffmpeg.on('close', (code) => {
      if (code && stderr && ffmpeg === this.ffmpeg) console.warn('[musique] ffmpeg :', stderr.trim().split('\n').pop());
    });

    // Réserve : ffmpeg peut prendre jusqu'à ~3 min d'avance
    const buffer = new PassThrough({ highWaterMark: BUFFER_BYTES });
    ffmpeg.stdout.on('error', () => {});
    buffer.on('error', () => {});
    ffmpeg.stdout.pipe(buffer);
    await waitForBuffer(buffer, ffmpeg);

    if (token !== this.playToken) {
      ffmpeg.kill('SIGKILL');
      return false;
    }

    const resource = createAudioResource(buffer, { inputType: StreamType.OggOpus, metadata: track });
    const previous = this.ffmpeg;
    this.ffmpeg = ffmpeg;
    this.ffmpegErrors = () => stderr;
    this.resource = resource;
    this.seekOffset = seek;
    this.speed = speedOf(this.filters);
    this.lastError = null;
    this.audio.play(resource);
    if (this.paused) this.audio.pause();
    previous?.kill('SIGKILL');
    return true;
  }

  async handleEnd() {
    const track = this.current;
    const playedMs = this.resource?.playbackDuration ?? 0;
    const failed = Boolean(track) && !this.skipLoop && playedMs < 3_000 && Boolean(this.lastError || this.ffmpegErrors?.());

    // Flux expiré ou coupé : on réessaie une fois au même endroit
    if (track && failed && !track.retried) {
      track.retried = true;
      track.streamUrl = null;
      return this.startCurrent(this.seekOffset);
    }
    if (track) track.retried = false;

    if (track && !failed && this.loop === 'track' && !this.skipLoop) return this.startCurrent(0);
    this.skipLoop = false;

    if (track && !failed) {
      this.history.push(track);
      if (this.history.length > MAX_HISTORY) this.history.shift();
      if (this.loop === 'queue') this.queue.push(track);
    }
    this.current = null;

    if (this.queue.length) return this.startNext();

    if (this.autoplay && track) {
      const recommended = await recommendNext(track, this.history).catch(() => null);
      if (recommended) {
        this.queue.push({ ...recommended, requestedBy: 'autoplay' });
        return this.startNext();
      }
    }
    return this.finish();
  }

  preloadNext() {
    const next = this.queue[0];
    if (next && !next.streamUrl) prepareTrack(next).catch(() => {});
  }

  /** Position dans le son, en secondes. */
  position() {
    if (!this.current || !this.resource) return 0;
    return this.seekOffset + (this.resource.playbackDuration / 1000) * this.speed;
  }

  // ===== Contrôles =====

  togglePause() {
    if (!this.current) return false;
    this.paused = !this.paused;
    if (this.paused) this.audio.pause();
    else this.audio.unpause();
    return this.paused;
  }

  skip(count = 1) {
    if (!this.current) return false;
    if (count > 1) this.queue.splice(0, count - 1);
    this.skipLoop = true;
    this.paused = false;
    this.audio.stop(true);
    return true;
  }

  async previous() {
    if (!this.current && !this.history.length) return false;
    if (this.current && (this.position() > 5 || !this.history.length)) {
      await this.startCurrent(0);
      return true;
    }
    const previous = this.history.pop();
    if (this.current) this.queue.unshift(this.current);
    this.current = previous;
    this.paused = false;
    await this.startCurrent(0, { newTrack: true });
    return true;
  }

  async seek(seconds) {
    if (!this.current || this.current.isLive) return false;
    const max = Math.max(0, (this.current.duration || 0) - 2);
    await this.startCurrent(Math.min(Math.max(0, seconds), max || seconds));
    return true;
  }

  setVolume(volume) {
    this.volume = Math.round(Math.min(Math.max(volume, 0), 150));
    this.scheduleRestart();
    return this.volume;
  }

  setFilters(keys) {
    this.filters = normalizeFilters(keys);
    this.scheduleRestart();
    return this.filters;
  }

  toggleFilter(key) {
    return this.setFilters(this.filters.includes(key) ? this.filters.filter((k) => k !== key) : [...this.filters, key]);
  }

  /** Volume / effets : on relance ffmpeg au même endroit (regroupé si plusieurs clics rapides). */
  scheduleRestart() {
    if (!this.current) return;
    clearTimeout(this.timers.restart);
    this.timers.restart = setTimeout(() => {
      if (this.current) this.startCurrent(this.position()).catch(() => {});
    }, 350);
  }

  cycleLoop() {
    this.loop = { off: 'track', track: 'queue', queue: 'off' }[this.loop];
    return this.loop;
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  remove(position) {
    return this.queue.splice(position - 1, 1)[0] ?? null;
  }

  move(from, to) {
    const [track] = this.queue.splice(from - 1, 1);
    if (!track) return null;
    this.queue.splice(Math.min(Math.max(to - 1, 0), this.queue.length), 0, track);
    return track;
  }

  stop() {
    this.queue = [];
    this.current = null;
    this.paused = false;
    this.playToken++;
    this.resource = null; // évite de déclencher la fin de son
    this.audio.stop(true);
    this.ffmpeg?.kill('SIGKILL');
    this.ffmpeg = null;
    return this.finish({ release: true });
  }

  // ===== Fin / départ =====

  async finish({ release = false } = {}) {
    this.current = null;
    this.paused = false;
    clearInterval(this.timers.panel);
    clearTimeout(this.timers.restart);
    if (this.panel) {
      const last = this.history.at(-1);
      await this.panel.edit(endedPayload(last)).catch(() => {});
      this.panel = null;
    }
    if (release) return this.destroy();
    this.scheduleIdle();
  }

  /** Sans musique pendant 3 min : le bot retourne dans son vocal habituel. */
  scheduleIdle() {
    clearTimeout(this.timers.idle);
    this.timers.idle = setTimeout(() => {
      if (!this.current) this.destroy();
    }, IDLE_RELEASE_MS);
  }

  destroy() {
    for (const timer of Object.values(this.timers)) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.playToken++;
    this.resource = null;
    this.audio.stop(true);
    this.ffmpeg?.kill('SIGKILL');
    players.delete(this.guild.id);
    releaseMusic(this.guild);
  }

  /** Personne dans le vocal : on coupe au bout de 2 min. */
  checkAlone() {
    const channel = this.guild.channels.cache.get(this.botVoiceChannelId);
    const humans = channel?.members.filter((m) => !m.user.bot).size ?? 0;
    if (humans > 0 || !this.current) {
      clearTimeout(this.timers.alone);
      this.timers.alone = null;
      return;
    }
    if (this.timers.alone) return;
    this.timers.alone = setTimeout(() => {
      this.timers.alone = null;
      const stillEmpty = (this.guild.channels.cache.get(this.botVoiceChannelId)?.members.filter((m) => !m.user.bot).size ?? 0) === 0;
      if (stillEmpty && this.current) {
        this.notify('👋 Plus personne dans le vocal, j\'arrête la musique.');
        this.stop();
      }
    }, ALONE_STOP_MS);
  }

  // ===== Panneau "en cours de lecture" =====

  async textChannel() {
    if (!this.textChannelId) return null;
    return this.client.channels.fetch(this.textChannelId).catch(() => null);
  }

  async sendNewPanel() {
    const channel = await this.textChannel();
    if (!channel) return;
    const old = this.panel;
    this.panel = null;
    old?.delete().catch(() => {});
    this.panel = await channel.send(nowPlayingPayload(this)).catch((err) => {
      console.warn('[musique] panneau impossible à envoyer :', err.message);
      return null;
    });
    this.lastPanelEdit = Date.now();
    clearInterval(this.timers.panel);
    this.timers.panel = setInterval(() => {
      if (this.current && !this.paused) this.refreshPanel();
    }, PANEL_REFRESH_MS);
  }

  refreshPanel(force = false) {
    if (!this.panel || !this.current) return;
    if (!force && Date.now() - this.lastPanelEdit < 2_000) return;
    this.lastPanelEdit = Date.now();
    this.panel.edit(nowPlayingPayload(this)).catch((err) => {
      if (err.code === 10008) this.panel = null; // message supprimé
    });
  }

  async notify(content) {
    const channel = await this.textChannel();
    const message = await channel?.send({ content, allowedMentions: { parse: [] } }).catch(() => null);
    if (message) setTimeout(() => message.delete().catch(() => {}), 20_000);
  }
}
