// Comptes History Launcher : inscription, connexion, profil. Hébergés par le bot (même stockage que le reste).
// - Mot de passe : jamais gardé, seulement son empreinte scrypt (sel aléatoire), comparée en temps constant.
// - Session : jeton aléatoire de 256 bits ; seule son empreinte SHA-256 est gardée ; 90 jours.
// - Tentatives limitées par adresse IP et par e-mail ; messages d'erreur qui ne disent pas si l'e-mail existe.
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { load, save } from '../storage.js';
import { allowAttempt } from '../dashboard/auth.js';
import { checkMailCode, checkTotp, codeMail, codeRecord, hashValue, mailCode, mailReady, newTotpSecret, otpauthUrl, recoveryCodes, sendMail } from './launcherSecurity.js';

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
  d.tickets ??= {}; // étape double authentification : empreinte -> { id, exp, tries }
  return d;
}

const cleanEmail = (e) => String(e ?? '').trim().toLowerCase();
export function validate({ pseudo, email, motDePasse }) {
  if (!/^[\p{L}\p{N} ._-]{3,20}$/u.test(String(pseudo ?? '').trim())) return 'Le pseudo doit faire 3 à 20 caractères (lettres, chiffres, espace, . _ -).';
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(cleanEmail(email))) return 'Adresse e-mail invalide.';
  return passwordProblem(motDePasse);
}

// Mots de passe beaucoup trop courants (refusés même s'ils font 8 caractères)
const TOO_COMMON = new Set(['12345678', '123456789', '1234567890', 'password', 'motdepasse', 'azertyui', 'azertyuiop', 'qwertyui', 'qwertyuiop', '00000000', '11111111', 'password1', 'motdepasse1', 'azerty123', 'abcd1234', 'iloveyou', 'baseball', 'football']);
/** Règle simple et claire : 8 caractères minimum ; s'il n'y a que des lettres (ou que des chiffres), 10 minimum. */
export function passwordProblem(motDePasse) {
  const p = String(motDePasse ?? '');
  if (p.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (p.length > 128) return 'Le mot de passe doit faire moins de 128 caractères.';
  if (TOO_COMMON.has(p.toLowerCase()) || /^(.)\1+$/.test(p)) return 'Ce mot de passe est trop facile à deviner, choisis-en un autre.';
  const kinds = [/\p{L}/u, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(p)).length;
  if (kinds < 2 && p.length < 10) return 'Ajoute un chiffre ou un symbole (ou fais au moins 10 caractères).';
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
const publicAccount = (a) => ({ id: a.id, pseudo: a.pseudo, email: a.email, createdAt: a.createdAt, verified: a.verified !== false, twoFactor: Boolean(a.totp?.on) });

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
    // E-mail à confirmer par code (seulement si l'envoi d'e-mails est configuré, sinon personne n'est bloqué)
    if (mailReady()) {
      const code = mailCode();
      d.accounts[id].verified = false;
      d.accounts[id].verif = codeRecord(code);
      const m = codeMail(d.accounts[id].pseudo, code, 'verif');
      sendMail(email, m.subject, m.html).catch(() => {});
    }
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
  // Double authentification : pas de session tant que le code de l'application n'est pas donné
  if (account.totp?.on) {
    const ticket = randomBytes(24).toString('base64url');
    d.tickets[sha(ticket)] = { id: account.id, exp: Date.now() + 5 * 60_000, tries: 0 };
    for (const [k, t] of Object.entries(d.tickets)) if (Date.now() > t.exp) delete d.tickets[k];
    save(KEY, d);
    return { status: 200, need2fa: true, ticket };
  }
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

const accountOf = async (d, token) => {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const s = d.sessions[sha(token)];
  return s && Date.now() - s.at <= SESSION_MS ? d.accounts[s.id] ?? null : null;
};

/** Vérification e-mail, mot de passe oublié, double authentification. */
export async function securityRoute(route, body, token, ip) {
  const d = await data();
  if (route === 'POST /api/compte/connexion/2fa') {
    const t = d.tickets[sha(String(body.ticket ?? ''))];
    if (!t || Date.now() > t.exp || t.tries >= 5) return { status: 401, error: 'Reconnecte-toi (code expiré).' };
    t.tries += 1;
    const a = d.accounts[t.id];
    const code = String(body.code ?? '').trim().toUpperCase();
    const step = a?.totp?.on ? checkTotp(a.totp.secret, code, a.totp.lastStep ?? -1) : null;
    const recovery = !step && a?.totp?.recovery?.includes(hashValue(code));
    if (!a || (step == null && !recovery)) { save(KEY, d); return { status: 401, error: 'Code incorrect.' }; }
    if (step != null) a.totp.lastStep = step;
    if (recovery) a.totp.recovery = a.totp.recovery.filter((h) => h !== hashValue(code));
    delete d.tickets[sha(String(body.ticket))];
    const tok = await newSession(d, a.id);
    save(KEY, d);
    return { status: 200, token: tok, compte: publicAccount(a), recoveryLeft: recovery ? a.totp.recovery.length : undefined };
  }
  if (route === 'POST /api/compte/mdp/oubli') {
    if (!allowAttempt('compte-oubli-ip', ip, 5, 60 * 60_000)) return { status: 429, error: 'Trop de demandes, réessaie plus tard.' };
    const a = d.accounts[d.byEmail[cleanEmail(body.email)]];
    if (a && mailReady()) {
      const code = mailCode();
      a.reset = codeRecord(code);
      save(KEY, d);
      const m = codeMail(a.pseudo, code, 'reset');
      await sendMail(a.email, m.subject, m.html);
    }
    // Même réponse que le compte existe ou non
    return { status: 200, ok: true, mail: mailReady() };
  }
  if (route === 'POST /api/compte/mdp/nouveau') {
    const a = d.accounts[d.byEmail[cleanEmail(body.email)]];
    const pb = passwordProblem(body.motDePasse);
    if (pb) return { status: 400, error: pb };
    const r = a ? checkMailCode(a.reset, body.code) : 'bad';
    if (r !== 'ok') { save(KEY, d); return { status: 400, error: r === 'expired' ? 'Code expiré : redemande un code.' : 'Code incorrect.' }; }
    a.salt = randomBytes(16).toString('hex');
    a.hash = await hashPassword(body.motDePasse, a.salt);
    delete a.reset;
    a.verified = true; // le code reçu par e-mail prouve l'adresse
    for (const [k, s] of Object.entries(d.sessions)) if (s.id === a.id) delete d.sessions[k]; // déconnecte partout
    save(KEY, d);
    return { status: 200, ok: true };
  }
  // Routes qui demandent d'être connecté
  const a = await accountOf(d, token);
  if (!a) return { status: 401, error: 'Session expirée, reconnecte-toi.' };
  if (!allowAttempt('compte-secu', a.id, 30, 15 * 60_000)) return { status: 429, error: 'Trop de tentatives, réessaie dans 15 minutes.' };
  if (route === 'POST /api/compte/verif/envoyer') {
    if (a.verified !== false) return { status: 200, ok: true, deja: true };
    if (!mailReady()) return { status: 503, error: 'E-mails non configurés sur le serveur.' };
    const code = mailCode();
    a.verif = codeRecord(code);
    save(KEY, d);
    const m = codeMail(a.pseudo, code, 'verif');
    const r = await sendMail(a.email, m.subject, m.html);
    return r.ok ? { status: 200, ok: true } : { status: 502, error: r.error };
  }
  if (route === 'POST /api/compte/verif') {
    const r = checkMailCode(a.verif, body.code);
    if (r !== 'ok') { save(KEY, d); return { status: 400, error: r === 'expired' ? 'Code expiré : demande un nouveau code.' : 'Code incorrect.' }; }
    a.verified = true;
    delete a.verif;
    save(KEY, d);
    return { status: 200, ok: true, compte: publicAccount(a) };
  }
  if (route === 'POST /api/compte/2fa/debut') {
    if (a.totp?.on) return { status: 409, error: 'La double authentification est déjà activée.' };
    a.totp = { on: false, secret: newTotpSecret() };
    save(KEY, d);
    return { status: 200, secret: a.totp.secret, url: otpauthUrl(a.totp.secret, a.email) };
  }
  if (route === 'POST /api/compte/2fa/activer') {
    if (!a.totp?.secret || a.totp.on) return { status: 400, error: 'Recommence l’activation.' };
    const step = checkTotp(a.totp.secret, body.code);
    if (step == null) return { status: 400, error: 'Code incorrect : vérifie l’heure de ton téléphone et réessaie.' };
    const codes = recoveryCodes();
    a.totp = { on: true, secret: a.totp.secret, lastStep: step, recovery: codes.map(hashValue), since: Date.now() };
    save(KEY, d);
    return { status: 200, ok: true, recovery: codes, compte: publicAccount(a) };
  }
  if (route === 'POST /api/compte/2fa/desactiver') {
    if (!a.totp?.on) return { status: 200, ok: true };
    const pw = Buffer.from(await hashPassword(body.motDePasse ?? '', a.salt), 'hex');
    const good = Buffer.from(a.hash, 'hex');
    if (pw.length !== good.length || !timingSafeEqual(pw, good)) return { status: 401, error: 'Mot de passe incorrect.' };
    if (checkTotp(a.totp.secret, body.code, a.totp.lastStep ?? -1) == null && !a.totp.recovery?.includes(hashValue(String(body.code ?? '').trim().toUpperCase()))) return { status: 401, error: 'Code incorrect.' };
    delete a.totp;
    save(KEY, d);
    return { status: 200, ok: true, compte: publicAccount(a) };
  }
  return { status: 404, error: 'route inconnue' };
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
    if (url.pathname.startsWith('/api/compte/verif') || url.pathname.startsWith('/api/compte/mdp') || url.pathname.startsWith('/api/compte/2fa') || route === 'POST /api/compte/connexion/2fa') {
      const r = await securityRoute(route, await readJson(req), token, ip); return send(res, r.status, r);
    }
    if (route === 'GET /api/compte/moi') { const c = await me(token); return c ? send(res, 200, { compte: c }) : send(res, 401, { error: 'Session expirée, reconnecte-toi.' }); }
    if (url.pathname === '/api/compte/sauvegarde' && ['GET', 'POST'].includes(req.method)) {
      const { handleBackupApi } = await import('./launcherBackup.js');
      return await handleBackupApi(req, res, { readJson, send });
    }
    if (route === 'POST /api/compte/ia') {
      const { handleLauncherAi } = await import('./launcherAi.js');
      return await handleLauncherAi(req, res, { readJson, send });
    }
    if (/^\/api\/compte\/(amis|presence|soirees|boite|messages|inviter|appel|benchmark)(\/|$)/.test(url.pathname)) {
      const { handleSocialApi } = await import('./launcherSocial.js');
      return await handleSocialApi(req, res, url, { readJson, send });
    }
  } catch {
    return send(res, 400, { error: 'Demande illisible.' });
  }
  return send(res, 404, { error: 'route inconnue' });
}
