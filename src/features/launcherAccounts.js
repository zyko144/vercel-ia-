// Comptes History Launcher : inscription, connexion, profil. Hébergés par le bot (même stockage que le reste).
// - Mot de passe : jamais gardé, seulement son empreinte scrypt (sel aléatoire), comparée en temps constant.
// - Session : jeton aléatoire de 256 bits ; seule son empreinte SHA-256 est gardée ; 90 jours.
// - Tentatives limitées par adresse IP et par e-mail ; messages d'erreur qui ne disent pas si l'e-mail existe.
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { load, save } from '../storage.js';
import { allowAttempt } from '../dashboard/auth.js';

const scrypt = promisify(scryptCb);
const KEY = 'launcher-comptes';
const SESSION_MS = 90 * 86_400_000;
const sha = (v) => createHash('sha256').update(v).digest('hex');
const creating = new Set(); // e-mails en cours d'inscription (deux inscriptions simultanées)

async function data() {
  const d = (await load(KEY, null)) ?? {};
  d.accounts ??= {}; // id -> compte
  d.byEmail ??= {}; // e-mail -> id
  d.sessions ??= {}; // empreinte du jeton -> { id, at, seen }
  return d;
}

const cleanEmail = (e) => String(e ?? '').trim().toLowerCase();
export function validate({ pseudo, email, motDePasse }) {
  if (!/^[\p{L}\p{N} ._-]{3,20}$/u.test(String(pseudo ?? '').trim())) return 'Le pseudo doit faire 3 à 20 caractères (lettres, chiffres, espace, . _ -).';
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(cleanEmail(email))) return 'Adresse e-mail invalide.';
  const p = String(motDePasse ?? '');
  if (p.length < 8 || p.length > 128) return 'Le mot de passe doit faire entre 8 et 128 caractères.';
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  return null;
}

const hashPassword = async (password, salt) => (await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 })).toString('hex');

async function newSession(d, id) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  for (const [h, s] of Object.entries(d.sessions)) if (now - s.at > SESSION_MS) delete d.sessions[h];
  d.sessions[sha(token)] = { id, at: now, seen: now };
  return token;
}
const publicAccount = (a) => ({ id: a.id, pseudo: a.pseudo, email: a.email, createdAt: a.createdAt });

export async function register(body, ip) {
  if (!allowAttempt('compte-inscription', ip, 5, 60 * 60_000)) return { status: 429, error: 'Trop d’inscriptions depuis cette connexion, réessaie plus tard.' };
  const problem = validate(body);
  if (problem) return { status: 400, error: problem };
  const email = cleanEmail(body.email);
  if (creating.has(email)) return { status: 409, error: 'Inscription déjà en cours.' };
  creating.add(email);
  try {
    const d = await data();
    if (d.byEmail[email]) return { status: 409, error: 'Un compte existe déjà avec cet e-mail.' };
    const salt = randomBytes(16).toString('hex');
    const id = randomUUID();
    d.accounts[id] = { id, pseudo: String(body.pseudo).trim(), email, salt, hash: await hashPassword(body.motDePasse, salt), createdAt: Date.now() };
    d.byEmail[email] = id;
    const token = await newSession(d, id);
    save(KEY, d);
    return { status: 201, token, compte: publicAccount(d.accounts[id]) };
  } finally {
    creating.delete(email);
  }
}

export async function login(body, ip) {
  const email = cleanEmail(body.email);
  if (!allowAttempt('compte-connexion-ip', ip, 20, 15 * 60_000) || !allowAttempt('compte-connexion-mail', email, 8, 15 * 60_000)) {
    return { status: 429, error: 'Trop de tentatives, réessaie dans 15 minutes.' };
  }
  const d = await data();
  const account = d.accounts[d.byEmail[email]];
  // Même calcul (et même durée) que le compte existe ou non
  const salt = account?.salt ?? 'sel-factice-pour-temps-constant';
  const hash = Buffer.from(await hashPassword(body.motDePasse ?? '', salt), 'hex');
  const expected = Buffer.from(account?.hash ?? '0'.repeat(128), 'hex');
  if (!account || hash.length !== expected.length || !timingSafeEqual(hash, expected)) return { status: 401, error: 'E-mail ou mot de passe incorrect.' };
  const token = await newSession(d, account.id);
  save(KEY, d);
  return { status: 200, token, compte: publicAccount(account) };
}

export async function me(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const d = await data();
  const s = d.sessions[sha(token)];
  if (!s || Date.now() - s.at > SESSION_MS) return null;
  s.seen = Date.now();
  const account = d.accounts[s.id];
  return account ? publicAccount(account) : null;
}

export async function logout(token) {
  const d = await data();
  if (typeof token === 'string') delete d.sessions[sha(token)];
  save(KEY, d);
  return { status: 200, ok: true };
}

/** Routes /api/compte/… (appelées par le launcher). */
export async function handleAccountApi(req, res, url, { readJson, send, clientIp }) {
  const route = `${req.method} ${url.pathname}`;
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  const ip = clientIp(req);
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (route === 'POST /api/compte/inscription') { const r = await register(await readJson(req), ip); return send(res, r.status, r); }
    if (route === 'POST /api/compte/connexion') { const r = await login(await readJson(req), ip); return send(res, r.status, r); }
    if (route === 'POST /api/compte/deconnexion') { const r = await logout(token); return send(res, r.status, r); }
    if (route === 'GET /api/compte/moi') { const c = await me(token); return c ? send(res, 200, { compte: c }) : send(res, 401, { error: 'Session expirée, reconnecte-toi.' }); }
  } catch {
    return send(res, 400, { error: 'Demande illisible.' });
  }
  return send(res, 404, { error: 'route inconnue' });
}
