// Tableau de bord public (/app), comme MEE6 : connexion avec Discord, puis chaque personne gère
// les serveurs où elle a « Gérer le serveur » et où le bot est présent.
//
// - Connexion OAuth2 Discord (scopes identify + guilds). Il faut DISCORD_CLIENT_SECRET, et l'adresse
//   <PUBLIC_URL>/app/callback ajoutée dans le portail Discord (OAuth2 › Redirects).
// - Aucun jeton Discord n'est gardé : à la connexion on note seulement qui est la personne et la liste
//   de ses serveurs. Les droits sont revérifiés à chaque demande avec le bot (membre + permission).
// - Session : cookie HttpOnly aléatoire (256 bits), seule son empreinte est gardée, dans le stockage
//   (un redémarrage du bot ne déconnecte personne). 30 jours, 7 jours d'inactivité.
// - Offres : les fonctions gratuites sont ouvertes ; les menus premium sont visibles mais verrouillés
//   tant que le serveur n'a pas l'offre (ou l'essai de 7 jours, avec sa vraie date de fin).
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { config } from '../config.js';
import { load, save } from '../storage.js';
import { SECTIONS, guildSettings, setGuildSettings } from '../features/guildConfig.js';
import {
  PLANS, TRIAL_DAYS, VOICES, allServers, planOf, rawBranding, rawGuardOptions, setBranding, setGuardOptions, setReportWanted, setVoice, startTrial,
} from '../features/premium.js';
import { COLORS, openTickets, publishFromWeb, ticketPanels } from '../features/tickets.js';
import { allowAttempt, clientIp, isSecure } from './auth.js';

const WEB = path.resolve('web/app');
const STATIC = { 'app.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8' };
const KEY = 'app-sessions';
const MAX_AGE = 30 * 86_400_000;
const IDLE = 7 * 86_400_000;
const MAX_BODY = 16 * 1024;
const API = 'https://discord.com/api/v10';

let client = null;
export const setAppClient = (c) => { client = c; };

const sha = (v) => createHash('sha256').update(v).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const base = () => (config.publicUrl || `http://localhost:${config.port}`).replace(/\/+$/, '');
const redirectUri = () => `${base()}/app/callback`;
const clientSecret = () => (process.env.DISCORD_CLIENT_SECRET ?? '').trim();
const inviteUrl = (guildId) => `https://discord.com/oauth2/authorize?client_id=${client?.user?.id ?? ''}&scope=bot%20applications.commands&permissions=8${guildId ? `&guild_id=${guildId}&disable_guild_select=true` : ''}`;

// ===================== Sessions (gardées dans le stockage) =====================

let sessions = null; // empreinte -> { userId, name, avatar, guilds: [{ id, name, icon, manage }], createdAt, lastSeen }
let saveTimer = null;
async function allSessions() {
  if (!sessions) {
    const saved = await load(KEY, {}).catch(() => ({}));
    sessions = new Map(Object.entries(saved && typeof saved === 'object' ? saved : {}));
  }
  return sessions;
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const now = Date.now();
    for (const [h, s] of sessions) if (now - s.lastSeen > IDLE || now - s.createdAt > MAX_AGE) sessions.delete(h);
    save(KEY, Object.fromEntries(sessions));
  }, 2000);
}

const cookieName = (req) => (isSecure(req) ? '__Host-vercel_app' : 'vercel_app');
function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}
function cookie(req, name, value, maxAgeSec) {
  return [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`, ...(isSecure(req) ? ['Secure'] : [])].join('; ');
}

async function currentSession(req) {
  const raw = readCookie(req, cookieName(req));
  if (!raw || !/^[A-Za-z0-9_-]{40,50}$/.test(raw)) return null;
  const all = await allSessions();
  const s = all.get(sha(raw));
  const now = Date.now();
  if (!s) return null;
  if (now - s.lastSeen > IDLE || now - s.createdAt > MAX_AGE) {
    all.delete(sha(raw));
    persist();
    return null;
  }
  if (now - s.lastSeen > 60_000) { s.lastSeen = now; persist(); }
  return s;
}

// ===================== Outils HTTP =====================

function headers(res) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://cdn.discordapp.com; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
}
function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}
function redirect(res, to, cookies = []) {
  res.writeHead(302, { Location: to, ...(cookies.length ? { 'Set-Cookie': cookies } : {}) });
  res.end();
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('trop gros')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('JSON invalide')); }
    });
    req.on('error', reject);
  });
}
/** Une modification vient forcément de la page elle-même (POST JSON + en-tête + même origine). */
function sameOrigin(req) {
  if (req.method !== 'POST' || !String(req.headers['content-type'] ?? '').startsWith('application/json') || req.headers['x-app'] !== '1') return false;
  const origin = req.headers.origin;
  return !origin || origin === `${isSecure(req) ? 'https' : 'http'}://${req.headers.host}`;
}

// ===================== Connexion Discord =====================

async function discord(pathname, token) {
  const res = await fetch(`${API}${pathname}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Discord ${res.status}`);
  return res.json();
}

async function login(req, res) {
  if (!clientSecret()) return redirect(res, '/app?erreur=config');
  const state = secret();
  const params = new URLSearchParams({ client_id: client.user.id, redirect_uri: redirectUri(), response_type: 'code', scope: 'identify guilds', state, prompt: 'none' });
  return redirect(res, `https://discord.com/oauth2/authorize?${params}`, [cookie(req, 'vercel_state', state, 600)]);
}

async function callback(req, res, url) {
  const state = readCookie(req, 'vercel_state');
  const clear = cookie(req, 'vercel_state', '', 0);
  if (!state || state !== url.searchParams.get('state') || !url.searchParams.get('code')) return redirect(res, '/app?erreur=etat', [clear]);
  if (!allowAttempt('app-login', clientIp(req), 20, 15 * 60_000)) return redirect(res, '/app?erreur=trop', [clear]);
  try {
    const tokenRes = await fetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: client.user.id, client_secret: clientSecret(), grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirectUri() }),
    });
    if (!tokenRes.ok) throw new Error(`échange du code : ${tokenRes.status}`);
    const { access_token: token } = await tokenRes.json();
    const [user, guilds] = await Promise.all([discord('/users/@me', token), discord('/users/@me/guilds', token)]);
    // Le jeton Discord n'est pas gardé : on le révoque tout de suite.
    fetch(`${API}/oauth2/token/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.user.id, client_secret: clientSecret(), token }) }).catch(() => {});
    const manage = (g) => g.owner || (BigInt(g.permissions ?? 0) & (P.ManageGuild | P.Administrator)) !== 0n;
    const raw = secret();
    const now = Date.now();
    (await allSessions()).set(sha(raw), {
      userId: user.id, name: user.global_name ?? user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
      guilds: guilds.filter(manage).map((g) => ({ id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null })),
      createdAt: now, lastSeen: now,
    });
    persist();
    console.log(`[app] connexion de ${user.username} (${user.id})`);
    return redirect(res, '/app', [clear, cookie(req, cookieName(req), raw, Math.floor(MAX_AGE / 1000))]);
  } catch (err) {
    console.warn('[app] connexion impossible :', err.message);
    return redirect(res, '/app?erreur=discord', [clear]);
  }
}

// ===================== Droits et données =====================

/** Le serveur, si la personne peut le gérer ET que le bot y est. Sinon une erreur claire. */
async function manageable(session, guildId) {
  const guild = client.guilds.cache.get(String(guildId ?? ''));
  if (!guild) return { error: 'Le bot n’est pas sur ce serveur.', status: 404 };
  const member = await guild.members.fetch(session.userId).catch(() => null);
  if (!member || !(guild.ownerId === session.userId || member.permissions.has(P.ManageGuild))) return { error: 'Il te faut la permission « Gérer le serveur ».', status: 403 };
  return { guild, member };
}

function planInfo(guildId) {
  const plan = planOf(guildId);
  return {
    key: plan.key, label: plan.label, trial: plan.trial, until: plan.until, trialUsed: Boolean(allServers()[guildId]?.trialUsed), trialDays: TRIAL_DAYS,
    features: { voices: plan.voices, branding: plan.branding, report: plan.report, guard: plan.guard, voiceMinutes: plan.voiceMinutes === Infinity ? 'illimitée' : plan.voiceMinutes },
    offers: Object.entries(PLANS).filter(([k]) => k !== 'gratuit').map(([k, p]) => ({ key: k, label: p.label, price: p.price, pay: `${base()}/payer?serveur=${guildId}&offre=${k}` })),
  };
}

async function serverDetail(guild) {
  const channels = guild.channels.cache
    .filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildCategory].includes(c.type))
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ id: c.id, name: c.name, type: c.type === ChannelType.GuildCategory ? 'category' : c.type === ChannelType.GuildVoice ? 'voice' : 'text' }));
  const roles = guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed).sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null }));
  const brand = rawBranding(guild.id) ?? {};
  const [panels, open] = await Promise.all([ticketPanels(guild.id), openTickets(guild.id)]);
  return {
    id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }), members: guild.memberCount,
    plan: planInfo(guild.id), sections: SECTIONS, settings: guildSettings(guild.id), channels, roles,
    colors: Object.entries(COLORS).map(([key, c]) => ({ key, label: c.label, hex: `#${c.value.toString(16).padStart(6, '0')}` })),
    premium: {
      branding: { name: brand.name ?? '', color: brand.color ? `#${brand.color.toString(16).padStart(6, '0')}` : '' },
      voice: { current: allServers()[guild.id]?.voice ?? null, voices: Object.entries(VOICES).map(([key, label]) => ({ key, label })) },
      report: allServers()[guild.id]?.report !== false,
      guard: rawGuardOptions(guild.id),
    },
    tickets: {
      panels: panels.map((p) => ({ id: p.id, title: p.title, channel: guild.channels.cache.get(p.channelId)?.name ?? null, at: p.at })),
      open: open.map((t) => ({ channel: guild.channels.cache.get(t.channelId)?.name ?? null, user: t.userId ? client.users.cache.get(t.userId)?.username ?? t.userId : null, at: t.at ?? null })),
    },
  };
}

// Menus premium : ce que chaque fonction demande dans l'offre du serveur.
const PREMIUM = {
  branding: (guildId, d) => {
    const color = /^#?[0-9a-f]{6}$/i.test(d.color ?? '') ? Number.parseInt(d.color.replace('#', ''), 16) : undefined;
    const name = typeof d.name === 'string' ? d.name.trim().slice(0, 60) || null : undefined;
    setBranding(guildId, { name, color });
  },
  voices: (guildId, d) => { if (!setVoice(guildId, d.voice)) throw new Error('Voix inconnue.'); },
  report: (guildId, d) => setReportWanted(guildId, Boolean(d.enabled)),
  guard: (guildId, d) => setGuardOptions(guildId, {
    protectedIds: String(d.protectedIds ?? '').match(/\d{15,21}/g) ?? [],
    words: String(d.words ?? '').split(/\n|,/),
  }),
};

// ===================== Routes =====================

const routes = {
  'GET me': async (req, res, s) => json(res, 200, {
    connected: Boolean(s), oauth: Boolean(clientSecret()),
    user: s ? { id: s.userId, name: s.name, avatar: s.avatar } : null,
    bot: { name: client.user?.username ?? 'AI Vercel', avatar: client.user?.displayAvatarURL({ size: 64 }) ?? null },
  }),
  'GET servers': async (req, res, s) => json(res, 200, {
    servers: s.guilds.map((g) => {
      const botIn = client.guilds.cache.has(g.id);
      return { ...g, botIn, plan: botIn ? planOf(g.id).label : null, invite: botIn ? null : inviteUrl(g.id) };
    }).sort((a, b) => Number(b.botIn) - Number(a.botIn) || a.name.localeCompare(b.name)),
  }),
  'GET server': async (req, res, s, url) => {
    const m = await manageable(s, url.searchParams.get('id'));
    return m.error ? json(res, m.status, { error: m.error }) : json(res, 200, await serverDetail(m.guild));
  },
  'POST server/settings': async (req, res, s, url, body) => {
    const m = await manageable(s, body.guildId);
    if (m.error) return json(res, m.status, { error: m.error });
    const result = setGuildSettings(m.guild.id, body.changes);
    if (!result.ok) return json(res, 400, { error: 'Certains réglages sont refusés.', errors: result.errors });
    return json(res, 200, { ok: true, changed: result.changed });
  },
  'POST server/trial': async (req, res, s, url, body) => {
    const m = await manageable(s, body.guildId);
    if (m.error) return json(res, m.status, { error: m.error });
    const r = startTrial(m.guild.id, s.userId);
    if (r.error) return json(res, 400, { error: r.error });
    console.log(`[app] essai ${TRIAL_DAYS} jours activé sur ${m.guild.name} par ${s.name}`);
    return json(res, 200, { ok: true, plan: planInfo(m.guild.id) });
  },
  'POST server/premium': async (req, res, s, url, body) => {
    const m = await manageable(s, body.guildId);
    if (m.error) return json(res, m.status, { error: m.error });
    const apply = PREMIUM[body.feature];
    if (!apply) return json(res, 400, { error: 'Fonction inconnue.' });
    // Vérifié côté serveur : sans l'offre, rien n'est enregistré, même si la page a été modifiée.
    if (!planOf(m.guild.id)[body.feature]) return json(res, 402, { error: 'Débloque le premium (ou l’essai gratuit) pour utiliser cette fonction.' });
    try {
      apply(m.guild.id, body.data ?? {});
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
    return json(res, 200, { ok: true });
  },
  'POST server/publish': async (req, res, s, url, body) => {
    const m = await manageable(s, body.guildId);
    if (m.error) return json(res, m.status, { error: m.error });
    if (!allowAttempt('app-publish', s.userId, 10, 10 * 60_000)) return json(res, 429, { error: 'Trop de publications, attends quelques minutes.' });
    const r = await publishFromWeb(client, m.guild, s.userId, body);
    return r.error ? json(res, 400, { error: r.error }) : json(res, 200, r);
  },
  'POST logout': async (req, res) => {
    const raw = readCookie(req, cookieName(req));
    if (raw) { (await allSessions()).delete(sha(raw)); persist(); }
    res.setHeader('Set-Cookie', cookie(req, cookieName(req), '', 0));
    return json(res, 200, { ok: true });
  },
};

/** Gère /app et /app/… Renvoie true si la requête était pour le tableau de bord public. */
export async function handleUserApp(req, res, url) {
  if (url.pathname !== '/app' && !url.pathname.startsWith('/app/')) return false;
  headers(res);
  if (!client?.isReady()) return json(res, 503, { error: 'Le bot démarre, réessaie dans un instant.' }), true;
  const sub = url.pathname.slice(5);
  if (url.pathname === '/app' || sub === '') {
    const html = await readFile(path.join(WEB, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html), true;
  }
  if (STATIC[sub]) {
    const file = await readFile(path.join(WEB, sub)).catch(() => null);
    if (!file) return json(res, 404, { error: 'introuvable' }), true;
    res.writeHead(200, { 'Content-Type': STATIC[sub] });
    return res.end(file), true;
  }
  if (sub === 'login' && req.method === 'GET') return login(req, res), true;
  if (sub === 'callback' && req.method === 'GET') return callback(req, res, url), true;
  if (!sub.startsWith('api/')) return json(res, 404, { error: 'introuvable' }), true;
  const route = routes[`${req.method} ${sub.slice(4)}`];
  if (!route) return json(res, 404, { error: 'Route inconnue.' }), true;
  if (req.method === 'POST' && !sameOrigin(req)) return json(res, 403, { error: 'Requête refusée.' }), true;
  const session = await currentSession(req);
  if (!session && sub !== 'api/me') return json(res, 401, { error: 'Connecte-toi avec Discord.' }), true;
  if (session && !allowAttempt('app-api', session.userId, 120, 60_000)) return json(res, 429, { error: 'Trop de requêtes, ralentis un peu.' }), true;
  let body = {};
  if (req.method === 'POST') {
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Demande illisible.' }), true; }
  }
  try {
    await route(req, res, session, url, body);
  } catch (err) {
    console.error('[app]', err);
    if (!res.headersSent) json(res, 500, { error: 'Erreur du serveur, réessaie.' });
  }
  return true;
}

export const _test = { sessions: () => sessions, sha };
