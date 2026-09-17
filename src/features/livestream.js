// Son du PC du chef diffusé en direct dans le vocal : un petit programme sur son ordinateur capte
// la sortie audio (Spotify compris) et l'envoie ici en MP3 ; le bot le joue tel quel, sans passer par YouTube.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { WebSocketServer } from 'ws';
import { config } from '../config.js';
import { lockedChannel } from './voice.js';
import { LavalinkBackend } from '../music/backend-lavalink.js';
import { LocalBackend } from '../music/backend-local.js';
import { getOrCreatePlayer, getPlayer } from '../music/player.js';

const MAX_BUFFER = 1 << 20; // 1 Mo d'avance au maximum par auditeur
const STOP_AFTER_MS = 4_000; // plus rien ne rentre : on arrête la diffusion

let live = null; // { userId, since, listeners:Set<PassThrough>, lastChunk }
let stopTimer = null;
let client = null;

/** Clé du flux : impossible à deviner sans le token du bot. */
export const streamKey = () => createHmac('sha256', config.discordToken).update('vercel-stream').digest('hex').slice(0, 32);

const keyOk = (given) => {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(streamKey());
  return a.length === b.length && timingSafeEqual(a, b);
};

export const isLive = () => Boolean(live);
export const liveInfo = () => (live ? { userId: live.userId, since: live.since, auditeurs: live.listeners.size } : null);

/** Adresse publique (secours) et adresse locale : le bot se sert de la locale, sans détour par internet. */
export const liveUrl = () => `${config.publicUrl}/live/audio.mp3?key=${streamKey()}`;
const localUrl = () => `http://127.0.0.1:${config.port}/live/audio.mp3?key=${streamKey()}`;

export function setLiveClient(discordClient) {
  client = discordClient;
}

// ===================== Réception depuis le PC =====================

export function attachLiveServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== '/live/push') return;
    if (!keyOk(url.searchParams.get('key'))) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const userId = url.searchParams.get('user') || config.ownerId;
      startLive(ws, userId);
    });
  });
}

function startLive(ws, userId) {
  stopLive('nouvelle diffusion');
  live = { userId, since: Date.now(), listeners: new Set(), ws };
  console.log(`[direct] diffusion du son du PC démarrée (${userId})`);
  playInVoice().catch((err) => console.warn('[direct] lecture :', err.message));

  ws.on('message', (data) => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    clearTimeout(stopTimer);
    stopTimer = setTimeout(() => stopLive('plus rien ne rentre'), STOP_AFTER_MS);
    for (const listener of live.listeners) {
      if (listener.writableLength < MAX_BUFFER) listener.write(chunk);
    }
  });
  ws.on('close', () => stopLive('le PC a coupé'));
  ws.on('error', () => stopLive('erreur de connexion'));
}

export function stopLive(reason = 'arrêt') {
  clearTimeout(stopTimer);
  if (!live) return false;
  const previous = live;
  live = null;
  for (const listener of previous.listeners) listener.end();
  try {
    previous.ws?.close();
  } catch {
    // déjà fermé
  }
  console.log(`[direct] diffusion arrêtée (${reason})`);
  const player = client && getPlayer(guildId());
  if (player?.current?.isLiveStream) {
    // Retour au serveur audio habituel pour la musique
    restoreBackend(player).catch((err) => console.warn('[direct] retour au serveur audio :', err.message));
    // On rend la musique d'avant telle qu'elle était
    const before = previous.before;
    if (before?.current) {
      player.queue = before.queue;
      player.playNow({ ...before.current, seekTo: before.position });
    } else {
      player.stop();
    }
  }
  return true;
}

// ===================== Envoi vers le serveur audio =====================

/** Le serveur audio (ou n'importe quel lecteur) vient chercher le flux ici. */
export function serveLive(req, res, url) {
  if (!keyOk(url.searchParams.get('key'))) {
    res.writeHead(401);
    return res.end('clé invalide');
  }
  if (!live) {
    res.writeHead(503);
    return res.end('aucune diffusion en cours');
  }
  const listener = new PassThrough({ highWaterMark: MAX_BUFFER });
  live.listeners.add(listener);
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'close',
  });
  listener.pipe(res);
  const remove = () => {
    live?.listeners.delete(listener);
    listener.destroy();
  };
  req.on('close', remove);
  res.on('close', remove);
  return undefined;
}

/** Après un direct : on rend la main au serveur audio (meilleure qualité pour la musique). */
async function restoreBackend(player) {
  if (!(player.backend instanceof LocalBackend)) return;
  const guild = player.guild;
  const voiceChannel = lockedChannel(guild) ?? guild.channels.cache.get(config.voice.channelId);
  await player.useBackend(new LavalinkBackend(player));
  if (voiceChannel) await player.backend.connect(voiceChannel).catch(() => {});
}

// ===================== Lecture dans le vocal =====================

const guildId = () => client?.guilds.cache.first()?.id;

async function playInVoice() {
  if (!client || !live) return;
  const guild = client.guilds.cache.get(guildId());
  const voiceChannel = lockedChannel(guild) ?? guild?.channels.cache.get(config.voice.channelId);
  if (!guild || !voiceChannel) return;
  const player = getOrCreatePlayer(client, guild);
  await player.connect(voiceChannel);
  // Ce qui jouait avant : on le remettra à la fin de la diffusion
  if (!player.current?.isLiveStream) live.before = { current: player.current, queue: [...player.queue], position: Math.round(player.position()) };

  // Lecture par le bot lui-même : le son va du PC au vocal sans passer par le serveur audio public
  if (!(player.backend instanceof LocalBackend)) {
    await player.useBackend(new LocalBackend(player));
    await player.backend.connect(voiceChannel);
  }
  const name = guild.members.cache.get(live.userId)?.displayName ?? 'le chef';
  player.playNow({
    title: `Son du PC de ${name}`,
    artist: 'en direct',
    url: null,
    playUrl: localUrl(),
    streamUrl: localUrl(),
    source: 'web',
    isLive: true,
    isLiveStream: true,
    lowLatency: true,
    duration: 0,
    requestedBy: live.userId,
  });
}
