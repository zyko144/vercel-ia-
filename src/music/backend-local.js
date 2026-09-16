// Lecture "maison" : yt-dlp récupère le flux, ffmpeg applique les effets, le bot envoie l'audio lui-même.
// Sert de secours quand aucun serveur Lavalink n'est disponible.
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
import { filterChain, speedOf } from './filters.js';
import { prepareTrack } from './sources.js';
import { MUSIC_PROXY } from './ytdlp.js';

const BUFFER_BYTES = 2 * 1024 * 1024; // ~3 min d'audio d'avance
const PREBUFFER_BYTES = 48 * 1024; // ~4 s avant de lancer le son
const MAX_STALL_FRAMES = 500; // tolère 10 s de ralentissement avant de considérer le son fini
const backends = new Map(); // guildId -> LocalBackend

// Connexion vocale recréée (coupure réseau, /admin voc...) : on rebranche l'audio
onVoiceReady((guild, connection) => {
  const backend = backends.get(guild.id);
  if (backend) connection.subscribe(backend.audio);
});

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

export class LocalBackend {
  constructor(player) {
    this.player = player;
    this.guild = player.guild;
    this.liveControls = false; // volume / effets demandent de relancer ffmpeg
    this.ffmpeg = null;
    this.resource = null;
    this.seekOffset = 0;
    this.speed = 1;
    this.lastError = null;
    this.ffmpegErrors = null;

    this.audio = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause, maxMissedFrames: MAX_STALL_FRAMES } });
    this.audio.on('stateChange', (oldState, newState) => {
      if (newState.status !== AudioPlayerStatus.Idle || oldState.status === AudioPlayerStatus.Idle) return;
      if (!oldState.resource || oldState.resource !== this.resource) return;
      const playedMs = oldState.resource.playbackDuration ?? 0;
      const failed = playedMs < 3_000 && Boolean(this.lastError || this.ffmpegErrors?.());
      this.resource = null;
      this.player.onTrackEnd({ failed, error: this.lastError });
    });
    this.audio.on('error', (err) => {
      this.lastError = err;
      console.warn('[musique] erreur de lecture :', err.message);
    });
    backends.set(this.guild.id, this);
  }

  get name() {
    return 'Lecteur local (yt-dlp)';
  }

  get voiceChannelId() {
    return getVoiceConnection(this.guild.id)?.joinConfig.channelId ?? null;
  }

  async connect(voiceChannel) {
    const connection = await connectForMusic(this.guild, voiceChannel);
    connection.subscribe(this.audio);
  }

  async play(track, seek, token) {
    await prepareTrack(track);
    if (token !== this.player.playToken) return false;
    return this.spawnStream(track, seek, token);
  }

  /**
   * Lance ffmpeg et la lecture. On garde une réserve d'audio d'avance pour que les ralentissements
   * (CPU limité, réseau) ne coupent pas le son.
   */
  async spawnStream(track, seek, token) {
    const isHttp = /^https?:/i.test(track.streamUrl);
    // Son déjà en Opus, sans effet ni volume modifié : on recopie l'audio sans le réencoder (presque 0 CPU)
    const copy = track.acodec === 'opus' && !this.player.filters.length && this.player.volume === 100 && !/m3u8/i.test(track.protocol ?? '');
    const args = [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      ...(isHttp ? ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '10'] : []),
      ...(isHttp && /^http:\/\//i.test(MUSIC_PROXY) ? ['-http_proxy', MUSIC_PROXY] : []),
      ...(seek > 0 ? ['-ss', seek.toFixed(2)] : []),
      '-i', track.streamUrl,
      '-vn',
      ...(copy
        ? ['-c:a', 'copy']
        : ['-af', filterChain(this.player.filters, this.player.volume), '-c:a', 'libopus', '-b:a', '96k', '-compression_level', '5',
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

    const buffer = new PassThrough({ highWaterMark: BUFFER_BYTES });
    ffmpeg.stdout.on('error', () => {});
    buffer.on('error', () => {});
    ffmpeg.stdout.pipe(buffer);
    await waitForBuffer(buffer, ffmpeg);

    if (token !== this.player.playToken) {
      ffmpeg.kill('SIGKILL');
      return false;
    }

    const resource = createAudioResource(buffer, { inputType: StreamType.OggOpus, metadata: track });
    const previous = this.ffmpeg;
    this.ffmpeg = ffmpeg;
    this.ffmpegErrors = () => stderr;
    this.resource = resource;
    this.seekOffset = seek;
    this.speed = speedOf(this.player.filters);
    this.lastError = null;
    this.audio.play(resource);
    if (this.player.paused) this.audio.pause();
    previous?.kill('SIGKILL');
    return true;
  }

  position() {
    if (!this.player.current || !this.resource) return 0;
    return this.seekOffset + (this.resource.playbackDuration / 1000) * this.speed;
  }

  pause(paused) {
    if (paused) this.audio.pause();
    else this.audio.unpause();
  }

  stopTrack() {
    this.resource = null; // évite de déclencher la fin de son
    this.audio.stop(true);
    this.ffmpeg?.kill('SIGKILL');
    this.ffmpeg = null;
  }

  invalidate(track) {
    track.streamUrl = null;
  }

  preload(track) {
    if (track && !track.streamUrl) prepareTrack(track).catch(() => {});
  }

  destroy() {
    this.stopTrack();
    if (backends.get(this.guild.id) === this) backends.delete(this.guild.id);
    releaseMusic(this.guild);
  }
}
