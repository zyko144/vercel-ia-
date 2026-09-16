// Lecteur de musique d'un serveur : file d'attente, boucle, autoplay, panneau.
// La lecture elle-même passe par un "moteur" : Lavalink (serveur audio externe) ou le lecteur local.
import { config } from '../config.js';
import { dmOwner } from '../features/escalation.js';
import { followedChannel } from '../features/voice.js';
import { LavalinkBackend } from './backend-lavalink.js';
import { LocalBackend } from './backend-local.js';
import { lavalink, NoAudioNodeError } from './lavalink.js';
import { normalizeFilters } from './filters.js';
import { recommendNext } from './sources.js';
import { recordPlay } from './stats.js';
import { saveSession, clearSession } from './session.js';
import { endedPayload, nowPlayingPayload } from './ui.js';

const DEFAULT_VOLUME = 100;
const MAX_HISTORY = 50;
const IDLE_RELEASE_MS = 3 * 60_000;
const ALONE_STOP_MS = 2 * 60_000;

const OWNER_PING_COOLDOWN_MS = 10 * 60_000;
const MAX_TRACK_RETRIES = 3; // reprises d'un son coupé en pleine lecture avant d'abandonner
const players = new Map();
let lastOwnerPing = 0;

export const getPlayer = (guildId) => players.get(guildId) ?? null;

export function getOrCreatePlayer(client, guild) {
  if (!players.has(guild.id)) players.set(guild.id, new GuildPlayer(client, guild));
  return players.get(guild.id);
}

export function allPlayers() {
  return [...players.values()];
}

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

    this.backend = null;
    this.textChannelId = null;
    this.panel = null;
    this.lastPanelEdit = 0;
    this.timers = {};
    this.skipLoop = false;
    this.failures = 0;
    this.playToken = 0;
    this.blind = false; // blind test : on n'affiche pas le panneau (ça donnerait la réponse)
    this.onStarted = null;
    this.onBlindEnd = null; // blind test : son fini ou illisible (sans dévoiler le titre dans le salon)
    this.skipVotes = new Set();
  }

  // ===== Connexion =====

  /** Choisit le moteur : Lavalink si un serveur audio répond, sinon le lecteur local. */
  async connect(voiceChannel, { force = false } = {}) {
    // Le bot ne quitte jamais le chef : si le chef est en vocal, la musique se joue dans son salon
    if (!force) voiceChannel = followedChannel(this.guild) ?? voiceChannel;
    const wantLavalink = config.music.engine !== 'local' && lavalink.available;
    const isLavalink = this.backend instanceof LavalinkBackend;

    if (wantLavalink && !isLavalink) await this.useBackend(new LavalinkBackend(this));
    else if (!wantLavalink && !this.backend) await this.useBackend(new LocalBackend(this));

    try {
      await this.backend.connect(voiceChannel);
    } catch (err) {
      if (!(this.backend instanceof LavalinkBackend) || config.music.engine === 'lavalink') throw err;
      console.warn('[musique] Lavalink indisponible, passage au lecteur local :', err.message);
      await this.useBackend(new LocalBackend(this));
      await this.backend.connect(voiceChannel);
    }
    clearTimeout(this.timers.idle);
  }

  async useBackend(backend) {
    if (this.backend) await this.backend.destroy();
    this.backend = backend;
  }

  get botVoiceChannelId() {
    return this.backend?.voiceChannelId ?? null;
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
    this.skipVotes.clear();
    const start = next.seekTo ?? 0;
    delete next.seekTo;
    return this.startCurrent(start, { newTrack: true });
  }

  async startCurrent(seek = 0, { newTrack = false } = {}) {
    const track = this.current;
    if (!track || !this.backend) return;
    const token = ++this.playToken;

    try {
      if (!(await this.backend.play(track, seek, token))) {
        if (this.blind) console.log(`[blindtest] lecture de "${track.title}" abandonnée (remplacée)`);
        return;
      }
      if (token !== this.playToken || this.current !== track) return;
      this.failures = 0;
      if (newTrack) await this.sendNewPanel();
      else this.refreshPanel(true);
      this.preloadNext();
      // Sert au blind test : le chrono ne démarre qu'une fois le son vraiment lancé
      if (newTrack) this.onStarted?.(track);
    } catch (err) {
      if (token !== this.playToken) return;

      // Plus aucun serveur audio : on bascule sur le lecteur local
      if (err instanceof NoAudioNodeError && this.backend instanceof LavalinkBackend && config.music.engine === 'auto') {
        const voiceChannel = this.guild.channels.cache.get(this.backend.voiceChannelId);
        console.warn('[musique] plus de serveur audio, passage au lecteur local');
        await this.useBackend(new LocalBackend(this));
        if (voiceChannel) {
          try {
            await this.backend.connect(voiceChannel);
            return await this.startCurrent(seek, { newTrack });
          } catch (localErr) {
            console.warn('[musique] lecteur local indisponible :', localErr.message);
          }
        }
      }

      console.warn(`[musique] impossible de lire "${track.title}" :`, err.message);
      if (this.blind) {
        this.current = null;
        return this.onBlindEnd?.({ failed: true, error: err });
      }
      this.notify(`⚠️ Impossible de lire **${track.title}** (${err.message}), je passe au suivant.`);
      this.alertOwner(track, err);
      this.current = null;
      if (++this.failures >= 5) {
        this.notify("❌ Trop d'erreurs d'affilée, j'arrête la musique.");
        return this.stop();
      }
      return this.startNext();
    }
    return undefined;
  }

  /** Appelé par le moteur quand un son se termine (ou plante). */
  async onTrackEnd({ failed = false, error = null } = {}) {
    const track = this.current;

    // Coupure en pleine lecture : on reprend au même endroit, avec une autre version / un autre serveur audio
    if (track && failed && (track.retries ?? 0) < MAX_TRACK_RETRIES) {
      track.retries = (track.retries ?? 0) + 1;
      const position = Math.max(0, this.position() - 2);
      console.warn(`[musique] "${track.title}" coupé à ${Math.round(position)}s (${error?.message ?? 'erreur'}), reprise ${track.retries}/${MAX_TRACK_RETRIES}`);
      this.backend?.invalidate?.(track);
      return this.startCurrent(track.isLive ? 0 : position);
    }
    if (track) track.retries = 0;
    if (this.blind) {
      this.current = null;
      return this.onBlindEnd?.({ failed, error });
    }
    if (track && failed) {
      // Plus jamais d'arrêt silencieux : le salon et le chef sont prévenus
      const reason = error ?? new Error('coupé en pleine lecture');
      console.warn(`[musique] "${track.title}" abandonné :`, reason.message);
      this.notify(`⚠️ **${track.title}** a coupé ${MAX_TRACK_RETRIES + 1} fois (${reason.message}), je passe au suivant.`);
      this.alertOwner(track, reason);
    }

    if (track && !failed && this.loop === 'track' && !this.skipLoop) return this.startCurrent(0);
    this.skipLoop = false;

    if (track && !failed) {
      recordPlay(this.guild.id, track, Math.min(this.position() || track.duration || 0, track.duration || 0)).catch(() => {});
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
    this.backend?.preload?.(this.queue[0]);
  }

  /** Un son n'a pas pu être joué : le chef est prévenu (MP + ping, comme pour les questions sans réponse). */
  async alertOwner(track, error) {
    const requester = track.requestedBy && track.requestedBy !== 'autoplay' ? `<@${track.requestedBy}>` : '♾️ Autoplay';
    await dmOwner(this.client, {
      title: "🎵 Un son n'a pas pu être joué",
      description: `**${track.title}**${track.artist ? ` — ${track.artist}` : ''}\n\`${error.message}\`${track.url ? `\n${track.url}` : ''}`,
      fields: [
        { name: 'Demandé par', value: requester, inline: true },
        { name: 'Serveur', value: this.guild.name, inline: true },
        { name: 'Moteur', value: this.backend?.name ?? '—', inline: true },
      ],
      link: this.textChannelId ? `https://discord.com/channels/${this.guild.id}/${this.textChannelId}` : undefined,
    });

    // Ping public limité : pas de spam si toute une playlist plante
    if (Date.now() - lastOwnerPing < OWNER_PING_COOLDOWN_MS) return;
    lastOwnerPing = Date.now();
    const channel = await this.textChannel();
    await channel?.send({
      content: `🔔 <@${config.ownerId}> un son n'a pas pu être joué (**${track.title}**), jt'ai envoyé le détail en MP.`,
      allowedMentions: { users: [config.ownerId] },
    }).catch(() => {});
  }

  /** Position dans le son, en secondes. */
  position() {
    return this.backend?.position() ?? 0;
  }

  // ===== Contrôles =====

  togglePause() {
    if (!this.current) return false;
    this.paused = !this.paused;
    this.backend?.pause(this.paused);
    return this.paused;
  }

  skip(count = 1) {
    if (!this.current) return false;
    if (count > 1) this.queue.splice(0, count - 1);
    this.skipLoop = true;
    this.paused = false;
    this.backend?.stopTrack();
    this.onTrackEnd({ failed: false });
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
    const position = Math.min(Math.max(0, seconds), max || seconds);
    if (this.backend?.liveControls) await this.backend.seek(position);
    else await this.startCurrent(position);
    this.refreshPanel(true);
    return true;
  }

  setVolume(volume) {
    this.volume = Math.round(Math.min(Math.max(volume, 0), 150));
    if (this.backend?.liveControls) this.backend.applyVolume(this.volume);
    else this.scheduleRestart();
    return this.volume;
  }

  setFilters(keys) {
    this.filters = normalizeFilters(keys);
    if (this.backend?.liveControls) this.backend.applyFilters(this.filters);
    else this.scheduleRestart();
    return this.filters;
  }

  toggleFilter(key) {
    return this.setFilters(this.filters.includes(key) ? this.filters.filter((k) => k !== key) : [...this.filters, key]);
  }

  /** Lecteur local : volume et effets demandent de relancer ffmpeg au même endroit. */
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

  /** Remplace tout de suite le son en cours (blind test) : aucun blanc entre deux sons. */
  playNow(track) {
    this.queue = [track];
    this.paused = false;
    clearTimeout(this.timers.idle);
    return this.startNext();
  }

  stop() {
    this.queue = [];
    this.current = null;
    this.paused = false;
    this.playToken++;
    this.backend?.stopTrack();
    return this.finish({ home: true });
  }

  // ===== Fin / départ =====

  async finish({ home = false } = {}) {
    this.current = null;
    this.paused = false;
    clearInterval(this.timers.panel);
    clearTimeout(this.timers.restart);
    if (this.panel) {
      const last = this.history.at(-1);
      await this.panel.edit(endedPayload(last)).catch(() => {});
      this.panel = null;
    }
    if (home) return this.goHome();
    this.scheduleIdle();
    return undefined;
  }

  /** Sans musique pendant 3 min : le bot retourne dans son vocal habituel (sans se déconnecter). */
  scheduleIdle() {
    clearTimeout(this.timers.idle);
    this.timers.idle = setTimeout(() => {
      if (!this.current) this.goHome();
    }, IDLE_RELEASE_MS);
  }

  /** Retour au vocal habituel en gardant la connexion : le prochain /play démarre tout de suite. */
  async goHome() {
    clearSession(this.guild.id).catch(() => {});
    if (this.backend?.moveToHome && config.voice.enabled) {
      await this.backend.moveToHome().catch((err) => console.warn('[musique] retour au vocal :', err.message));
      return;
    }
    await this.destroy();
  }

  async destroy() {
    for (const timer of Object.values(this.timers)) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.playToken++;
    players.delete(this.guild.id);
    await this.backend?.destroy();
    this.backend = null;
  }

  /** Personne dans le vocal : on coupe au bout de 2 min. */
  checkAlone() {
    const humansInVoice = () => this.guild.channels.cache.get(this.botVoiceChannelId)?.members.filter((m) => !m.user.bot).size ?? 0;
    if (humansInVoice() > 0 || !this.current) {
      clearTimeout(this.timers.alone);
      this.timers.alone = null;
      return;
    }
    if (this.timers.alone) return;
    this.timers.alone = setTimeout(() => {
      this.timers.alone = null;
      if (humansInVoice() === 0 && this.current) {
        this.notify("👋 Plus personne dans le vocal, j'arrête la musique.");
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
    saveSession(this).catch(() => {});
    if (this.blind) return;
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
    }, config.music.panelRefreshMs);
    clearInterval(this.timers.session);
    this.timers.session = setInterval(() => saveSession(this).catch(() => {}), 15_000);
  }

  refreshPanel(force = false) {
    if (!this.panel || !this.current || this.blind) return;
    if (!force && Date.now() - this.lastPanelEdit < 1_000) return;
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
