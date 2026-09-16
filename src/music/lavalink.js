// Connexion aux serveurs audio Lavalink (API v4) : ils cherchent le son et l'envoient directement dans le vocal Discord.
// Plusieurs serveurs sont configurés : si l'un tombe ou n'arrive pas à lire un son, on passe au suivant.
import WebSocket from 'ws';
import { config } from '../config.js';

const RECONNECT_MIN_MS = 5_000;
const RECONNECT_MAX_MS = 5 * 60_000;
const RESUME_TIMEOUT_S = 60;
const LOG_SIZE = 25;

export class NoAudioNodeError extends Error {}

class LavalinkNode {
  constructor(options, manager, priority) {
    this.name = options.name ?? options.host;
    this.host = options.host;
    this.port = options.port;
    this.password = options.password;
    this.secure = Boolean(options.secure);
    this.priority = priority;
    this.manager = manager;

    this.ws = null;
    this.connected = false;
    this.sessionId = null;
    this.version = null;
    this.plugins = [];
    this.stats = null;
    this.attempts = 0;
    this.brokenUntil = 0; // n'arrive plus à lire les sons : on l'évite un moment
    this.incompatible = false; // refusé par Discord (chiffrement vocal)
    this.lastError = null;
  }

  get baseUrl() {
    return `${this.secure ? 'https' : 'http'}://${this.host}:${this.port}`;
  }

  connect() {
    const headers = {
      Authorization: this.password,
      'User-Id': this.manager.userId,
      'Client-Name': 'AI-Vercel/1.0',
      ...(this.sessionId ? { 'Session-Id': this.sessionId } : {}),
    };
    const ws = new WebSocket(`${this.secure ? 'wss' : 'ws'}://${this.host}:${this.port}/v4/websocket`, { headers, handshakeTimeout: 15_000 });
    this.ws = ws;

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return;
      }
      this.handle(message).catch((err) => this.manager.log(`${this.name} : ${err.message}`));
    });
    ws.on('error', (err) => {
      this.lastError = err.message;
    });
    ws.on('close', (code) => {
      if (this.ws !== ws) return;
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.manager.log(`${this.name} déconnecté (code ${code})`);
      this.manager.nodeDown(this);
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** Math.min(this.attempts++, 6));
      setTimeout(() => this.connect(), delay);
    });
  }

  async handle(message) {
    switch (message.op) {
      case 'ready': {
        this.connected = true;
        this.attempts = 0;
        this.sessionId = message.sessionId;
        this.manager.log(`${this.name} connecté${message.resumed ? ' (session reprise)' : ''}`);
        // Si la connexion saute, le serveur garde les lecteurs 60 s le temps qu'on revienne
        await this.request('PATCH', `/v4/sessions/${this.sessionId}`, { resuming: true, timeout: RESUME_TIMEOUT_S }).catch(() => {});
        const info = await this.request('GET', '/v4/info').catch(() => null);
        this.version = info?.version?.semver ?? this.version;
        this.plugins = (info?.plugins ?? []).map((p) => p.name);
        break;
      }
      case 'stats':
        this.stats = message;
        break;
      case 'playerUpdate':
        this.manager.players.get(message.guildId)?.onPlayerUpdate(message.state ?? {});
        break;
      case 'event':
        this.manager.players.get(message.guildId)?.onEvent(message, this);
        break;
      default:
    }
  }

  async request(method, path, body) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: this.password, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
    return data;
  }

  loadTracks(identifier) {
    return this.request('GET', `/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`);
  }

  updatePlayer(guildId, data) {
    if (!this.sessionId || !this.connected) return Promise.reject(new Error(`${this.name} n'est pas connecté`));
    return this.request('PATCH', `/v4/sessions/${this.sessionId}/players/${guildId}?noReplace=false`, data);
  }

  destroyPlayer(guildId) {
    if (!this.sessionId) return Promise.resolve();
    return this.request('DELETE', `/v4/sessions/${this.sessionId}/players/${guildId}`).catch(() => {});
  }

  get usable() {
    return this.connected && !this.incompatible;
  }

  /** Plus c'est bas, mieux c'est : ordre de préférence + charge du serveur. */
  get penalty() {
    const cpu = this.stats?.cpu?.systemLoad ?? 0;
    const players = this.stats?.playingPlayers ?? 0;
    return this.priority * 10 + (Date.now() < this.brokenUntil ? 1000 : 0) + (cpu > 0.9 ? 50 : 0) + players * 0.01;
  }
}

class LavalinkManager {
  constructor() {
    this.nodes = [];
    this.players = new Map(); // guildId -> LavalinkBackend
    this.waiters = new Set();
    this.lastServer = new Map(); // guildId -> dernier VOICE_SERVER_UPDATE
    this.logs = [];
    this.userId = null;
  }

  init(client) {
    if (this.userId || config.music.engine === 'local') return;
    this.userId = client.user.id;
    this.nodes = config.music.lavalinkNodes.map((options, i) => new LavalinkNode(options, this, i));
    for (const node of this.nodes) node.connect();
  }

  get available() {
    return this.nodes.some((node) => node.usable);
  }

  /** Meilleur serveur disponible, en évitant ceux déjà essayés. */
  bestNode(exclude = []) {
    return this.nodes
      .filter((node) => node.usable && !exclude.includes(node.name))
      .sort((a, b) => a.penalty - b.penalty)[0] ?? null;
  }

  /** Charge un lien / une recherche sur le premier serveur qui répond avec un résultat. */
  async loadAny(identifier) {
    for (const node of [...this.nodes].filter((n) => n.usable).sort((a, b) => a.penalty - b.penalty)) {
      try {
        const result = await node.loadTracks(identifier);
        if (result && !['empty', 'error'].includes(result.loadType)) return { node, result };
      } catch (err) {
        this.log(`${node.name} : chargement impossible (${err.message})`);
      }
    }
    return null;
  }

  attach(guildId, backend) {
    this.players.set(guildId, backend);
  }

  detach(guildId, backend) {
    if (this.players.get(guildId) === backend) this.players.delete(guildId);
  }

  nodeDown(node) {
    for (const backend of this.players.values()) {
      if (backend.node === node) backend.onNodeDown();
    }
  }

  /** Événements vocaux bruts de Discord (le serveur audio en a besoin pour se connecter au vocal). */
  handleRaw(packet) {
    if (!this.userId || !packet?.t) return;
    if (packet.t === 'VOICE_STATE_UPDATE' && packet.d?.user_id === this.userId && packet.d.guild_id) {
      for (const waiter of this.waiters) if (waiter.guildId === packet.d.guild_id) waiter.onState(packet.d);
      this.players.get(packet.d.guild_id)?.onVoiceState(packet.d);
    } else if (packet.t === 'VOICE_SERVER_UPDATE' && packet.d?.guild_id) {
      if (packet.d.endpoint) this.lastServer.set(packet.d.guild_id, packet.d);
      for (const waiter of this.waiters) if (waiter.guildId === packet.d.guild_id) waiter.onServer(packet.d);
      this.players.get(packet.d.guild_id)?.onVoiceServer(packet.d);
    }
  }

  /** Attend que Discord donne la session vocale après une demande de connexion. */
  waitForVoice(guildId, channelId, timeout = 15_000) {
    return new Promise((resolve, reject) => {
      const waiter = { guildId, state: null, server: null, fallback: null };
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(waiter.fallback);
        this.waiters.delete(waiter);
      };
      const check = () => {
        if (!waiter.state || !waiter.server) return;
        cleanup();
        resolve({ sessionId: waiter.state.session_id, token: waiter.server.token, endpoint: waiter.server.endpoint, channelId });
      };
      waiter.onState = (d) => {
        if (d.channel_id !== channelId) return;
        waiter.state = d;
        check();
        // Changement de salon sans nouveau serveur vocal : on réutilise le dernier
        waiter.fallback ??= setTimeout(() => {
          if (!waiter.server && this.lastServer.has(guildId)) {
            waiter.server = this.lastServer.get(guildId);
            check();
          }
        }, 4_000);
      };
      waiter.onServer = (d) => {
        if (!d.endpoint) return;
        waiter.server = d;
        check();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Discord n'a pas donné l'accès au vocal à temps"));
      }, timeout);
      this.waiters.add(waiter);
    });
  }

  log(text) {
    this.logs.push({ at: Date.now(), text });
    if (this.logs.length > LOG_SIZE) this.logs.shift();
    console.log(`[lavalink] ${text}`);
  }

  status() {
    return this.nodes.map((node) => ({
      name: node.name,
      connected: node.connected,
      incompatible: node.incompatible,
      broken: Date.now() < node.brokenUntil,
      version: node.version,
      players: node.stats?.playingPlayers ?? 0,
      cpu: node.stats?.cpu?.systemLoad ?? null,
      secure: node.secure,
    }));
  }
}

export const lavalink = new LavalinkManager();
