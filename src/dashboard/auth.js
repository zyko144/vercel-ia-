// Sécurité du tableau de bord.
//
// - Pas de mot de passe : on se connecte avec un lien à usage unique (10 min) que le bot
//   envoie en message privé, ou avec /admin dashboard. Seuls le chef et les comptes de
//   DASHBOARD_ADMINS peuvent en recevoir un.
// - Le lien n'est jamais « consommé » par une simple visite (Discord ouvre les liens pour
//   faire des aperçus) : il faut cliquer sur « Se connecter », qui l'envoie en POST.
// - Session : identifiant aléatoire de 256 bits dans un cookie HttpOnly, SameSite=Strict,
//   Secure en HTTPS. Côté serveur on ne garde que son empreinte SHA-256. 2 h d'inactivité ou
//   12 h au total, et elle expire. Sessions et liens sont gardés dans le stockage (empreintes
//   seulement) : un redémarrage ou un redéploiement du bot ne déconnecte plus personne.
// - Chaque modification passe par un POST en JSON, avec un en-tête propre au tableau de
//   bord et une origine vérifiée : une autre page ne peut pas agir à ta place.
// - Tentatives limitées par adresse IP, et chaque action est inscrite au journal.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { load, save } from '../storage.js';

const LINK_TTL_MS = 10 * 60_000;
const IDLE_MS = 2 * 60 * 60_000;
const MAX_AGE_MS = 12 * 60 * 60_000;
const AUDIT_KEPT = 300;

const sha = (value) => createHash('sha256').update(value).digest('hex');
const newSecret = () => randomBytes(32).toString('base64url');

/** Qui a le droit d'entrer : le chef, plus les comptes listés dans DASHBOARD_ADMINS. */
export function isAllowed(userId) {
  return typeof userId === 'string' && /^\d{15,21}$/.test(userId) && (userId === config.ownerId || config.dashboard.admins.includes(userId));
}

// ===================== Liens de connexion =====================

const links = new Map(); // empreinte du jeton -> { userId, expiresAt }
const sessions = new Map(); // empreinte de l'identifiant -> session

// ===================== Sauvegarde (sessions + liens) =====================

const STATE_KEY = 'dashboard-sessions';
let stateTimer = null;
function persistState() {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => {
    const now = Date.now();
    for (const [h, l] of links) if (l.expiresAt < now) links.delete(h);
    for (const [h, s] of sessions) if (now - s.lastSeen > IDLE_MS || now - s.createdAt > MAX_AGE_MS) sessions.delete(h);
    save(STATE_KEY, { links: Object.fromEntries(links), sessions: Object.fromEntries(sessions) });
  }, 1500);
}
/** Recharge sessions et liens (au démarrage, ou quand un lien a été créé par une autre copie du bot). */
export async function loadAuthState() {
  const saved = await load(STATE_KEY, null).catch(() => null);
  if (!saved || typeof saved !== 'object') return;
  for (const [h, l] of Object.entries(saved.links ?? {})) if (!links.has(h)) links.set(h, l);
  for (const [h, s] of Object.entries(saved.sessions ?? {})) if (!sessions.has(h)) sessions.set(h, s);
}

/** Crée un lien de connexion pour un compte autorisé. Renvoie le jeton (à mettre dans l'URL). */
export function createLoginToken(userId) {
  if (!isAllowed(userId)) throw new Error('compte non autorisé');
  const now = Date.now();
  for (const [hash, link] of links) if (link.expiresAt < now || link.userId === userId) links.delete(hash);
  const token = newSecret();
  links.set(sha(token), { userId, expiresAt: now + LINK_TTL_MS });
  persistState();
  return token;
}

/** Utilise un jeton : il ne marche qu'une fois. Renvoie le compte, ou null. */
export async function consumeLoginToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const hash = sha(token);
  if (!links.has(hash)) await loadAuthState();
  const link = links.get(hash);
  links.delete(hash);
  persistState();
  if (!link || link.expiresAt < Date.now() || !isAllowed(link.userId)) return null;
  return link.userId;
}

/** Adresse de base des liens envoyés. Jamais tirée de la requête : un en-tête Host truqué
 *  ferait envoyer au chef un lien vers un autre site, qui récupérerait le jeton. */
export function dashboardBaseUrl() {
  return (config.publicUrl || `http://localhost:${config.port}`).replace(/\/+$/, '');
}

/**
 * Un lien de connexion prêt à cliquer. Le jeton est après le « # » : le navigateur ne
 * l'envoie jamais au serveur dans l'adresse, il n'apparaît donc dans aucun journal.
 */
export function loginLinkFor(userId) {
  return `${dashboardBaseUrl()}/dashboard/connexion#${createLoginToken(userId)}`;
}

// ===================== Sessions =====================

export const isSecure = (req) => req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket?.encrypted);
const cookieName = (req) => (isSecure(req) ? '__Host-aiv_session' : 'aiv_session');

export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'inconnue';
}

/** Adresse IP à moitié masquée (assez pour reconnaître ses appareils, pas plus). */
export function maskIp(ip) {
  const v4 = ip.replace(/^::ffff:/, '').match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  return ip.includes(':') ? `${ip.split(':').slice(0, 2).join(':')}:…` : ip;
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function setCookie(req, res, value, maxAgeSeconds) {
  const attrs = [`${cookieName(req)}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
  if (isSecure(req)) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

/** Ouvre une session pour ce compte et pose le cookie. */
export function openSession(req, res, userId) {
  const secret = newSecret();
  const hash = sha(secret);
  const now = Date.now();
  sessions.set(hash, {
    id: hash.slice(0, 12), userId, createdAt: now, lastSeen: now,
    ip: maskIp(clientIp(req)), agent: String(req.headers['user-agent'] ?? '').slice(0, 160),
  });
  setCookie(req, res, secret, Math.floor(MAX_AGE_MS / 1000));
  persistState();
  return sessions.get(hash);
}

/** La session de cette requête, si elle est valide (et on note l'activité). */
export function currentSession(req) {
  const secret = readCookie(req, cookieName(req));
  if (!secret || !/^[A-Za-z0-9_-]{40,50}$/.test(secret)) return null;
  const hash = sha(secret);
  const session = sessions.get(hash);
  const now = Date.now();
  if (!session) return null;
  if (now - session.lastSeen > IDLE_MS || now - session.createdAt > MAX_AGE_MS || !isAllowed(session.userId)) {
    sessions.delete(hash);
    persistState();
    return null;
  }
  if (now - session.lastSeen > 60_000) persistState();
  session.lastSeen = now;
  return session;
}

export function closeSession(req, res) {
  const secret = readCookie(req, cookieName(req));
  if (secret) sessions.delete(sha(secret));
  persistState();
  setCookie(req, res, '', 0);
}

/** Ferme une session par son identifiant public (celui affiché dans le tableau de bord). */
export function closeSessionById(id) {
  for (const [hash, session] of sessions) {
    if (session.id === id) {
      sessions.delete(hash);
      persistState();
      return true;
    }
  }
  return false;
}

/** Ferme toutes les sessions, sauf éventuellement celle qu'on garde. */
export function closeAllSessions(exceptId = null) {
  let count = 0;
  for (const [hash, session] of sessions) {
    if (session.id !== exceptId) {
      sessions.delete(hash);
      count++;
    }
  }
  persistState();
  return count;
}

export function listSessions() {
  const now = Date.now();
  return [...sessions.values()]
    .filter((s) => now - s.lastSeen <= IDLE_MS && now - s.createdAt <= MAX_AGE_MS)
    .map((s) => ({ ...s, expiresAt: Math.min(s.lastSeen + IDLE_MS, s.createdAt + MAX_AGE_MS) }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

// ===================== Requêtes =====================

/**
 * Une modification doit venir du tableau de bord lui-même : POST, JSON, en-tête
 * X-Dashboard, et (si le navigateur l'indique) la même origine que la page.
 */
export function sameOriginWrite(req) {
  if (req.method !== 'POST') return false;
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return false;
  if (req.headers['x-dashboard'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  return trustedOrigin(req, origin);
}

/**
 * Origines acceptées : l'adresse vue par le serveur, plus le site public (SITE_URL, APP_URL, PUBLIC_URL)
 * quand le site passe par un relais (Vercel envoie les requêtes à Render).
 */
export function trustedOrigin(req, origin) {
  const own = `${isSecure(req) ? 'https' : 'http'}://${req.headers.host}`;
  const allowed = [own, config.publicUrl, config.site.url, process.env.APP_URL]
    .filter(Boolean).map((u) => { try { return new URL(u).origin; } catch { return null; } }).filter(Boolean);
  const a = Buffer.from(String(origin));
  return allowed.some((o) => { const b = Buffer.from(o); return a.length === b.length && timingSafeEqual(a, b); });
}

// ===================== Limites de tentatives =====================

const hits = new Map(); // « nom:clé » -> dates des tentatives

/** true si la tentative est permise (et on la compte), false si la limite est atteinte. */
export function allowAttempt(name, key, max, windowMs) {
  const id = `${name}:${key}`;
  const now = Date.now();
  const recent = (hits.get(id) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= max) {
    hits.set(id, recent);
    return false;
  }
  recent.push(now);
  hits.set(id, recent);
  if (hits.size > 5000) for (const [k, list] of hits) if (!list.some((at) => now - at < 60 * 60_000)) hits.delete(k);
  return true;
}

// ===================== Journal des actions =====================

let journal = [];
let journalLoaded = false;

export async function loadAudit() {
  const saved = await load('dashboard-audit', []).catch(() => []);
  if (Array.isArray(saved)) journal = [...saved, ...journal].slice(-AUDIT_KEPT);
  journalLoaded = true;
}

/** Inscrit une action au journal : qui, quoi, quand, d'où. */
export function audit({ userId = null, action, detail = '', req = null }) {
  journal.push({ at: Date.now(), userId, action, detail: String(detail).slice(0, 300), ip: req ? maskIp(clientIp(req)) : null });
  if (journal.length > AUDIT_KEPT) journal = journal.slice(-AUDIT_KEPT);
  if (journalLoaded) save('dashboard-audit', journal);
}

export const auditLog = () => [...journal].reverse();
