// Tableau de bord de l'IA : la page (/dashboard) et son API (/dashboard/api/…), servies par le bot.
// La page est dans web/dashboard/. Toutes les données passent par ici, après vérification de la session.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events } from 'discord.js';
import { config } from '../config.js';
import { chat, webSearchAvailable } from '../ai/gemini.js';
import { systemPrompt } from '../ai/persona.js';
import { leaderboard } from '../casinho/economy.js';
import { voiceStatus } from '../features/voice.js';
import { forget, forgetAll, listConversations, memoryStats } from '../features/memory.js';
import { imagesToday } from '../features/limits.js';
import { runningGames, stopRunningGame } from '../games/common.js';
import { lavalink } from '../music/lavalink.js';
import { allPlayers, getPlayer } from '../music/player.js';
import { storageBackend } from '../storage.js';
import { recentLogs } from '../utils/logbuffer.js';
import { voiceAssistantState } from '../voice-ai/assistant.js';
import {
  allowAttempt, audit, auditLog, clientIp, closeAllSessions, closeSession, closeSessionById, consumeLoginToken,
  createLoginToken, currentSession, dashboardBaseUrl, isAllowed, isSecure, listSessions, loadAudit, openSession, sameOriginWrite,
} from './auth.js';
import { aiMetrics, loadMetrics, redact } from './metrics.js';
import { currentSettings, loadSettings, updateSettings } from './settings.js';

const WEB = path.resolve('web/dashboard');
const STATIC = { 'app.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8' };
const MAX_BODY = 32 * 1024;
const MINUTE = 60_000;

// En-têtes posés sur chaque réponse du tableau de bord.
function securityHeaders(req, res) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data: https://cdn.discordapp.com",
    "connect-src 'self'", "font-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  if (isSecure(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

// Au-delà de MAX_BODY on arrête de garder le corps et on répondra « trop gros » ;
// au-delà de 10 fois, c'est un abus : on coupe la connexion.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY * 10) {
        req.destroy();
        reject(new Error('trop gros'));
        return;
      }
      if (size <= MAX_BODY) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY) {
        reject(new Error('trop gros'));
        return;
      }
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

/** Envoie un lien de connexion en MP à un compte autorisé. */
export async function sendLoginLink(client, userId) {
  const token = createLoginToken(userId);
  const url = `${dashboardBaseUrl()}/dashboard/connexion#${token}`; // voir loginLinkFor
  const user = await client.users.fetch(userId);
  await user.send({
    embeds: [new EmbedBuilder()
      .setColor(0xf2c46d)
      .setTitle('🔐 Connexion au tableau de bord')
      .setDescription([
        'Clique sur le bouton pour ouvrir le tableau de bord de l’IA.',
        '• Le lien marche **une seule fois**, pendant **10 minutes**.',
        '• Ne le partage à personne : il donne accès aux réglages du bot.',
        '• Si tu n’as rien demandé, ignore ce message.',
      ].join('\n'))],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel('Ouvrir le tableau de bord').setEmoji('📊'))],
  });
  return url;
}

const who = (client, userId) => {
  const user = client.users.cache.get(userId);
  return { id: userId, name: user?.globalName ?? user?.username ?? 'Compte inconnu', avatar: user?.displayAvatarURL({ size: 64 }) ?? null };
};

export function createDashboard(client) {
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  loadAudit();
  loadMetrics();
  // Les réglages enregistrés s'appliquent dès que le bot est connecté (le statut en a besoin).
  if (client.isReady()) loadSettings(client);
  else client.once(Events.ClientReady, () => loadSettings(client));

  // ===================== Données =====================

  async function overview() {
    const ai = aiMetrics();
    const players = allPlayers();
    const nodes = lavalink.status();
    const voiceAi = voiceAssistantState();
    const mem = process.memoryUsage();
    const guilds = client.guilds.cache.map((g) => ({
      id: g.id, name: g.name, members: g.memberCount, icon: g.iconURL({ size: 64 }), voice: voiceStatus(g),
    }));
    const alerts = [];
    if (!client.isReady()) alerts.push({ level: 'critique', text: 'Le bot n’est pas connecté à Discord.' });
    if (config.ai.paused) alerts.push({ level: 'attention', text: 'L’IA est en pause : elle ne répond plus aux membres.' });
    if (ai.today.requests >= 10 && ai.today.errors / ai.today.requests > 0.2) alerts.push({ level: 'critique', text: `Beaucoup d’erreurs aujourd’hui (${ai.today.errors} sur ${ai.today.requests} demandes).` });
    if (ai.lastFallbackAt && Date.now() - ai.lastFallbackAt < 60 * MINUTE) alerts.push({ level: 'attention', text: 'Le modèle principal a saturé dans la dernière heure : le modèle de secours a pris le relais.' });
    if (config.models.webSearch && !webSearchAvailable()) alerts.push({ level: 'info', text: 'La recherche Google est refusée par le quota : l’IA répond sans, pendant une heure.' });
    if (storageBackend !== 'Supabase') alerts.push({ level: 'info', text: 'Sans Supabase, les réglages, rappels et playlists sont perdus à chaque redémarrage sur Render.' });
    if (nodes.length && !nodes.some((n) => n.connected)) alerts.push({ level: 'attention', text: 'Aucun serveur audio (Lavalink) n’est joignable : la musique passe par le lecteur local.' });
    if (!config.publicUrl) alerts.push({ level: 'info', text: 'Adresse publique inconnue : les liens de connexion pointent vers localhost.' });
    return {
      bot: {
        name: client.user?.username ?? null, avatar: client.user?.displayAvatarURL({ size: 128 }) ?? null, ready: client.isReady(),
        ping: Math.round(client.ws.ping), uptime: Math.round(process.uptime()), ramMb: Math.round(mem.rss / 1048576),
        heapMb: Math.round(mem.heapUsed / 1048576), loopMs: Math.round(loop.mean / 1e6), node: process.version,
      },
      ai: {
        model: config.models.chat, fallback: config.models.fallback, thinking: config.models.thinkingLevel,
        paused: config.ai.paused, webSearch: config.models.webSearch, webSearchAvailable: webSearchAvailable(),
        imagesEnabled: config.limits.imagesEnabled, imagesToday: await imagesToday().catch(() => 0),
        conversations: memoryStats(), today: ai.today, last24: ai.last24, hours: ai.hours, latency: ai.latency, lastModel: ai.lastModel,
      },
      guilds,
      music: { players: players.filter((p) => p.current).length, nodesOnline: nodes.filter((n) => n.connected).length, nodes: nodes.length },
      games: runningGames().length,
      voiceAi: { enabled: voiceAi.enabled, voice: voiceAi.voice, busy: Boolean(voiceAi.session) },
      services: {
        gemini: Boolean(config.geminiKey), storage: storageBackend, casino: Boolean(config.casinho.token),
        voiceAi: Boolean(config.voiceAi.token), site: config.site.url || null, publicUrl: config.publicUrl || null,
      },
      alerts,
      recent: auditLog().slice(0, 6).map((e) => ({ ...e, user: e.userId ? who(client, e.userId) : null })),
    };
  }

  function music() {
    return {
      players: allPlayers().map((p) => ({
        guildId: p.guild.id, guild: p.guild.name,
        current: p.current ? { title: p.current.title, artist: p.current.artist ?? null, duration: p.current.duration ?? 0, source: p.current.source ?? null, live: Boolean(p.current.isLive) } : null,
        position: Math.round(p.position()), paused: Boolean(p.paused), queue: p.queue.length, filters: p.filters ?? [],
        volume: p.volume ?? null, backend: p.backend?.name ?? null, node: p.backend?.node?.name ?? null,
      })),
      nodes: lavalink.status(),
      events: (lavalink.logs ?? []).slice(-15).reverse().map((l) => ({ at: l.at, text: redact(l.text) })),
    };
  }

  function logs(url) {
    const count = Math.min(1000, Math.max(20, Number(url.searchParams.get('n')) || 300));
    const filter = String(url.searchParams.get('filtre') ?? '').slice(0, 80);
    const level = url.searchParams.get('niveau');
    const lines = recentLogs({ count: 1500, grep: filter }).split('\n').filter(Boolean).map((line) => ({
      time: line.slice(0, 12), level: line[13] === 'E' ? 'erreur' : line[13] === 'W' ? 'attention' : 'info', text: redact(line.slice(15)),
    }));
    const kept = level === 'erreur' ? lines.filter((l) => l.level === 'erreur') : level === 'attention' ? lines.filter((l) => l.level !== 'info') : lines;
    return { lines: kept.slice(-count) };
  }

  // ===================== Routes =====================

  const open = {
    // Connexion avec le jeton reçu en MP. Limité : 10 essais par quart d'heure et par adresse.
    'POST login': async (req, res, body) => {
      if (!allowAttempt('login', clientIp(req), 10, 15 * MINUTE)) return json(res, 429, { error: 'Trop d’essais. Réessaie dans un quart d’heure.' });
      const userId = consumeLoginToken(body.jeton);
      if (!userId) return json(res, 401, { error: 'Ce lien n’est plus valable (déjà utilisé ou plus de 10 minutes). Demande-en un nouveau.' });
      const session = openSession(req, res, userId);
      audit({ userId, action: 'Connexion', detail: `session ${session.id}`, req });
      return json(res, 200, { ok: true });
    },
    // Demande d'un lien par MP. La réponse est la même que le compte soit autorisé ou non :
    // la page ne révèle pas qui a accès.
    'POST lien': async (req, res, body) => {
      const id = String(body.discordId ?? '').trim();
      if (!allowAttempt('lien-ip', clientIp(req), 3, 10 * MINUTE)) return json(res, 429, { error: 'Trop de demandes. Réessaie dans 10 minutes.' });
      if (isAllowed(id) && allowAttempt('lien-compte', id, 3, 30 * MINUTE)) {
        await sendLoginLink(client, id).then(
          () => audit({ userId: id, action: 'Lien de connexion envoyé en MP', req }),
          (err) => console.warn('[tableau de bord] MP impossible :', err.message),
        );
      }
      return json(res, 200, { ok: true, message: 'Si ce compte a accès au tableau de bord, le lien arrive en message privé.' });
    },
    'GET moi': async (req, res, body, session) => json(res, 200, session
      ? { connecte: true, user: who(client, session.userId), session: { id: session.id, createdAt: session.createdAt }, bot: { name: client.user?.username ?? 'Le bot', avatar: client.user?.displayAvatarURL({ size: 64 }) ?? null } }
      : { connecte: false, bot: { name: client.user?.username ?? 'Le bot', avatar: client.user?.displayAvatarURL({ size: 64 }) ?? null } }),
  };

  const protectedRoutes = {
    'POST logout': async (req, res, body, session) => {
      audit({ userId: session.userId, action: 'Déconnexion', req });
      closeSession(req, res);
      return json(res, 200, { ok: true });
    },
    'GET apercu': async (req, res) => json(res, 200, await overview()),
    'GET ia': async (req, res) => {
      const m = aiMetrics();
      return json(res, 200, { metrics: m, settings: currentSettings(), conversations: memoryStats() });
    },
    'POST ia/reglages': async (req, res, body, session) => {
      const result = updateSettings(body.changes, client);
      if (!result.ok) return json(res, 400, { error: 'Certains réglages sont refusés.', errors: result.errors });
      for (const c of result.changed) {
        const show = (v) => (typeof v === 'string' && v.length > 60 ? `${v.slice(0, 60)}…` : JSON.stringify(v));
        audit({ userId: session.userId, action: `Réglage modifié : ${c.key}`, detail: `${show(c.from)} → ${show(c.to)}`, req });
      }
      return json(res, 200, { ok: true, changed: result.changed.map((c) => c.key), settings: currentSettings() });
    },
    // Essai de l'IA avec la vraie personnalité du bot. Une demande toutes les 5 secondes.
    'POST ia/tester': async (req, res, body, session) => {
      const prompt = String(body.prompt ?? '').trim();
      if (!prompt || prompt.length > 1500) return json(res, 400, { error: 'Écris une question (1500 caractères maximum).' });
      if (!allowAttempt('test', session.id, 1, 5000)) return json(res, 429, { error: 'Une question toutes les 5 secondes.' });
      audit({ userId: session.userId, action: 'Test de l’IA', detail: prompt.slice(0, 80), req });
      let system = systemPrompt({ botName: client.user?.username ?? 'le bot', guildName: 'le tableau de bord' });
      if (config.ai.extraInstructions) system += `\n\nCONSIGNES DU SERVEUR (données par le staff)\n${config.ai.extraInstructions}`;
      const started = Date.now();
      try {
        const { text } = await chat({ system, content: [{ type: 'text', text: prompt }], web: false, tag: 'test' });
        return json(res, 200, { text, ms: Date.now() - started, model: config.models.chat });
      } catch (err) {
        return json(res, 502, { error: `L’IA n’a pas répondu : ${redact(err.message).slice(0, 200)}` });
      }
    },
    'GET conversations': async (req, res) => json(res, 200, {
      conversations: listConversations().map((c) => ({ ...c, user: c.userId ? who(client, c.userId) : null })),
    }),
    'POST conversations/effacer': async (req, res, body, session) => {
      if (body.tout === true) {
        const count = forgetAll();
        audit({ userId: session.userId, action: 'Mémoire de l’IA effacée', detail: `${count} conversation(s)`, req });
        return json(res, 200, { ok: true, count });
      }
      const key = String(body.key ?? '');
      if (!/^u:\d{15,21}$/.test(key)) return json(res, 400, { error: 'Conversation inconnue.' });
      const ok = forget(key);
      audit({ userId: session.userId, action: 'Conversation effacée', detail: key.slice(2), req });
      return json(res, 200, { ok });
    },
    'GET jeux': async (req, res) => json(res, 200, { games: runningGames() }),
    'POST jeux/arreter': async (req, res, body, session) => {
      const id = String(body.id ?? '');
      const game = runningGames().find((g) => g.id === id);
      if (!game) return json(res, 404, { error: 'Cette partie est déjà finie.' });
      await stopRunningGame(id);
      audit({ userId: session.userId, action: 'Partie arrêtée', detail: `${game.kind} (${game.players} joueurs)`, req });
      return json(res, 200, { ok: true });
    },
    'GET musique': async (req, res) => json(res, 200, music()),
    'POST musique/action': async (req, res, body, session) => {
      const player = getPlayer(String(body.guildId ?? ''));
      if (!player?.current) return json(res, 404, { error: 'Rien ne joue sur ce serveur.' });
      const actions = { pause: () => player.togglePause(), passer: () => player.skip(), arreter: () => player.stop() };
      if (!actions[body.action]) return json(res, 400, { error: 'Action inconnue.' });
      const title = player.current.title;
      await actions[body.action]();
      audit({ userId: session.userId, action: `Musique : ${body.action}`, detail: `${player.guild.name} · ${title}`, req });
      return json(res, 200, { ok: true });
    },
    'GET casino': async (req, res) => {
      const top = await leaderboard(10).catch(() => []);
      return json(res, 200, { enabled: Boolean(config.casinho.token), top: top.map((p) => ({ ...who(client, p.id), chips: p.chips, played: p.played ?? p.games ?? null })) });
    },
    'GET journaux': async (req, res, body, session, url) => json(res, 200, logs(url)),
    'GET securite': async (req, res, body, session) => json(res, 200, {
      you: session.id,
      sessions: listSessions().map((s) => ({ id: s.id, user: who(client, s.userId), createdAt: s.createdAt, lastSeen: s.lastSeen, expiresAt: s.expiresAt, ip: s.ip, agent: s.agent })),
      admins: [config.ownerId, ...config.dashboard.admins.filter((id) => id !== config.ownerId)].map((id) => ({ ...who(client, id), owner: id === config.ownerId })),
      journal: auditLog().slice(0, 150).map((e) => ({ ...e, user: e.userId ? who(client, e.userId) : null })),
      https: isSecure(req),
    }),
    'POST securite/deconnecter': async (req, res, body, session) => {
      if (body.toutes === true) {
        const count = closeAllSessions(session.id);
        audit({ userId: session.userId, action: 'Toutes les autres sessions fermées', detail: `${count} session(s)`, req });
        return json(res, 200, { ok: true, count });
      }
      const id = String(body.id ?? '');
      if (id === session.id) return json(res, 400, { error: 'Pour ta propre session, utilise « Se déconnecter ».' });
      const ok = closeSessionById(id);
      audit({ userId: session.userId, action: 'Session fermée', detail: id, req });
      return json(res, 200, { ok });
    },
  };

  /** Renvoie true si la requête concerne le tableau de bord (et y a répondu). */
  return async function handleDashboard(req, res, url) {
    if (url.pathname !== '/dashboard' && !url.pathname.startsWith('/dashboard/')) return false;
    securityHeaders(req, res);
    const rest = url.pathname.slice('/dashboard'.length).replace(/^\/+/, '');

    if (!rest.startsWith('api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Méthode refusée.' }), true;
      const file = STATIC[rest] ? rest : 'index.html';
      try {
        const data = await readFile(path.join(WEB, file));
        res.writeHead(200, { 'Content-Type': STATIC[file] ?? 'text/html; charset=utf-8', 'Content-Length': data.length });
        res.end(req.method === 'HEAD' ? undefined : data);
      } catch {
        json(res, 500, { error: 'Fichiers du tableau de bord introuvables.' });
      }
      return true;
    }

    const key = `${req.method} ${rest.slice(4)}`;
    const route = open[key] ?? protectedRoutes[key];
    if (!route) return json(res, 404, { error: 'Route inconnue.' }), true;
    if (req.method === 'POST' && !sameOriginWrite(req)) return json(res, 403, { error: 'Requête refusée (origine non vérifiée).' }), true;
    const session = currentSession(req);
    if (protectedRoutes[key]) {
      if (!session) return json(res, 401, { error: 'Connexion nécessaire.' }), true;
      if (!allowAttempt('api', session.id, 240, MINUTE)) return json(res, 429, { error: 'Trop de requêtes, ralentis un peu.' }), true;
    }
    let body = {};
    if (req.method === 'POST') {
      try {
        body = await readBody(req);
      } catch (err) {
        if (err.message === 'trop gros') return json(res, 413, { error: 'Demande trop grosse.' }), true;
        return json(res, 400, { error: 'Demande illisible.' }), true;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Demande illisible.' }), true;
    }
    try {
      await route(req, res, body, session, url);
    } catch (err) {
      console.warn('[tableau de bord]', key, err.message);
      if (!res.headersSent) json(res, 500, { error: 'Erreur interne. Regarde les journaux du bot.' });
    }
    return true;
  };
}
