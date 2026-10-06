// Comptes History Launcher : inscription, connexion, profil. Hébergés par le bot (même stockage que le reste).
// - Mot de passe : jamais gardé, seulement son empreinte scrypt (sel aléatoire), comparée en temps constant.
// - Session : jeton aléatoire de 256 bits ; seule son empreinte SHA-256 est gardée ; 90 jours.
// - Tentatives limitées par adresse IP et par e-mail ; messages d'erreur qui ne disent pas si l'e-mail existe.
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { delBlob, deleteRows, getBlob, load, putBlob, save, storageBackend, upsertRows } from '../storage.js';
import { allowAttempt } from '../dashboard/auth.js';
import { checkMailCode, checkTotp, codeMail, codeRecord, hashValue, mailCode, mailReady, newTotpSecret, otpauthUrl, recoveryCodes, sendMail } from './launcherSecurity.js';

const scrypt = promisify(scryptCb);
const KEY = 'launcher-comptes';
const SESSION_MS = 90 * 86_400_000;
const sha = (v) => createHash('sha256').update(v).digest('hex');
const creating = new Set(); // e-mails en cours d'inscription (deux inscriptions simultanées)

// Images (photo, bannière, images des discussions) : fichiers dans Supabase Storage (ou dossier local sans Supabase)
export async function saveImage(kind, id, img) { await putBlob(`${kind}/${id}`, Buffer.from(img.data, 'base64'), img.mime); }
export function dropImage(kind, id) { delBlob(`${kind}/${id}`).catch(() => {}); save(`launcher-${kind === 'image' ? 'img' : kind}-${id}`, {}); }

// Comptes recopiés dans une vraie table Supabase « launcher_comptes » (lisible dans le tableau de bord) :
// jamais de mot de passe, de clé de double authentification ni de jeton, seulement le profil et l'activité.
const mirrorSeen = new Map();
let mirrorTimer = null;
function store(d) {
  save(KEY, d);
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => mirrorAccounts(d).catch((err) => console.warn('[comptes] recopie Supabase :', err.message)), 4000);
}
export async function mirrorAccounts(d) {
  if (storageBackend !== 'Supabase') return { rows: 0 };
  const social = (await load('launcher-social', null)) ?? {};
  const rows = Object.values(d.accounts ?? {}).map((a) => {
    const p = a.profile ?? {};
    const pres = social.presence?.[a.id] ?? {};
    const last = Math.max(...Object.values(d.sessions ?? {}).filter((x) => x.id === a.id).map((x) => x.seen ?? x.at), pres.seen ?? 0, 0);
    return {
      id: a.id, pseudo: a.pseudo, email: a.email, cree_le: new Date(a.createdAt ?? Date.now()).toISOString(), email_verifie: a.verified !== false,
      double_auth: Boolean(a.totp?.on), discord_lie: Boolean(a.discordId), photo: Boolean(p.av), couleur: p.color ?? null, bio: p.bio ?? null, jeu_prefere: p.favGame ?? null,
      amis: (social.friends?.[a.id] ?? []).length, appareils: (a.devices ?? []).length, derniere_activite: last ? new Date(last).toISOString() : null, joue_a: pres.playing ?? null,
      version_launcher: a.appLauncher ?? null, version_clips: a.appClips ?? null, version_vue_le: a.appSeen ? new Date(a.appSeen).toISOString() : null,
    };
  });
  const changed = rows.filter((r) => { const h = JSON.stringify(r); if (mirrorSeen.get(r.id) === h) return false; mirrorSeen.set(r.id, h); return true; });
  const gone = [...mirrorSeen.keys()].filter((id) => !d.accounts?.[id]);
  const VCOLS = ['version_launcher', 'version_clips', 'version_vue_le'];
  for (let i = 0; i < changed.length; i += 200) {
    const part = changed.slice(i, i + 200);
    if (await upsertRows('launcher_comptes', part)) continue;
    // Colonnes des versions absentes (supabase.sql pas encore relancé) : le reste est quand même recopié
    console.warn('[comptes] colonnes version_* absentes : lance supabase.sql dans Supabase › SQL Editor');
    if (!(await upsertRows('launcher_comptes', part.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !VCOLS.includes(k))))))) { for (const r of changed) mirrorSeen.delete(r.id); return { rows: 0, error: true }; }
  }
  if (gone.length && await deleteRows('launcher_comptes', gone)) for (const id of gone) mirrorSeen.delete(id);
  return { rows: changed.length };
}
let mirroredOnce = false;
async function data() {
  const d = (await load(KEY, null)) ?? {};
  d.accounts ??= {}; // id -> compte
  d.byEmail ??= {}; // e-mail -> id
  d.sessions ??= {}; // empreinte du jeton -> { id, at, seen }
  d.tickets ??= {}; // étape double authentification : empreinte -> { id, exp, tries }
  d.discordCodes ??= {}; // code de liaison Discord -> { id, exp }
  d.pairs ??= {}; // connexion par code depuis un autre PC : empreinte du ticket -> { code, exp, device, id, name }
  if (!mirroredOnce) { mirroredOnce = true; setTimeout(() => mirrorAccounts(d).catch(() => {}), 10_000); } // comptes déjà existants recopiés au démarrage
  return d;
}

// Alerte de connexion : un e-mail quand le compte se connecte depuis un PC jamais vu (identifiant d'appareil aléatoire du launcher)
const cleanDevice = (v) => (/^[\w-]{8,64}$/.test(String(v ?? '')) ? String(v) : null);
async function deviceCheck(a, device, ip) {
  if (!device) return;
  const h = sha(`appareil:${device}`);
  a.devices ??= [];
  const known = a.devices.find((x) => x.h === h);
  if (known) { known.at = Date.now(); return; }
  const hadOthers = a.devices.length > 0;
  a.devices = [...a.devices, { h, at: Date.now() }].slice(-20);
  if (!hadOthers || !mailReady()) return;
  const when = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short' });
  const html = `<div style="background:#0b0910;padding:36px 16px;font-family:Segoe UI,Arial,sans-serif;color:#f4f1f6"><div style="max-width:440px;margin:auto;padding:30px;border-radius:22px;background:linear-gradient(160deg,#1b1826,#121018);border:1px solid #2b2638">
<div style="font-size:13px;letter-spacing:3px;color:#22d3ee;font-weight:700;text-align:center">HISTORY</div><h1 style="font-size:21px;margin:14px 0 8px;text-align:center">Nouvelle connexion à ton compte</h1>
<p style="color:#b8b0c2">Salut ${String(a.pseudo).replace(/[<>&"]/g, '')}, ton compte History vient d’être ouvert sur un nouveau PC :</p>
<p style="color:#f4f1f6">🕒 ${when}<br>🌐 Adresse IP : ${String(ip ?? '?').replace(/[^\w.:]/g, '')}</p>
<p style="color:#948d9c;font-size:13px">C’est toi ? Rien à faire. Sinon, change ton mot de passe tout de suite (Paramètres › Compte) et active la double authentification.</p></div></div>`;
  sendMail(a.email, 'Nouvelle connexion à ton compte History', html).catch(() => {});
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

let sessionApp = 'History Launcher'; // appli qui ouvre la session (historique des connexions)
async function newSession(d, id) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  for (const [h, s] of Object.entries(d.sessions)) if (now - (s.seen ?? s.at) > SESSION_MS) delete d.sessions[h];
  d.sessions[sha(token)] = { id, at: now, seen: now, app: sessionApp };
  return token;
}
// Profil personnalisé : photo (servie à part, en cache), couleur, bio. Visible par les amis.
export const PUBLIC_BASE = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://vercel-ia.onrender.com').replace(/\/+$/, '');
// Choix possibles (vérifiés côté serveur : rien d'autre ne passe)
export const PROFILE_CHOICES = {
  frame: ['aucun', 'perso', 'neon', 'or', 'arcenciel', 'feu', 'glace', 'toxique', 'galaxie'],
  nameFx: ['aucun', 'degrade', 'neon', 'or', 'arcenciel'],
  banner: ['nuit', 'aurore', 'coucher', 'ocean', 'foret', 'lave', 'neige', 'synthwave', 'carbone', 'rose'],
  badges: ['fondateur', 'nuit', 'rp', 'fps', 'streamer', 'collection', 'social', 'compet', 'chill', 'createur', 'speedrun', 'coop'],
  links: ['discord', 'twitch', 'youtube', 'tiktok', 'steam', 'instagram'],
};
export const profileOf = (a) => {
  const p = a?.profile ?? {};
  return {
    avatar: p.av ? `${PUBLIC_BASE}/api/compte/avatar/${a.id}?v=${p.av}` : null,
    bannerImg: p.bv ? `${PUBLIC_BASE}/api/compte/banniere/${a.id}?v=${p.bv}` : null,
    color: p.color ?? null, bio: p.bio ?? null, banner: p.banner ?? null, frame: p.frame ?? null, frameColor: p.frameColor ?? null, cardBg: p.cardBg ?? null, hide: p.hide ?? [], nameFx: p.nameFx ?? null,
    favGame: p.favGame ?? null, badges: p.badges ?? [], links: p.links ?? {}, since: a?.createdAt ?? null,
  };
};
const publicAccount = (a) => ({ id: a.id, pseudo: a.pseudo, email: a.email, createdAt: a.createdAt, verified: a.verified !== false, twoFactor: Boolean(a.totp?.on), discord: Boolean(a.discordId), profile: profileOf(a) });
const AVATAR_MAX = 150 * 1024;
/** Image envoyée par le launcher : format annoncé ET signature du fichier vérifiés, taille plafonnée. */
export function checkImage(dataUrl, max) {
  const m = String(dataUrl ?? '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return 'Image illisible (PNG, JPG ou WEBP).';
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > max) return `Image trop lourde (${Math.round(max / 1024)} Ko maximum).`;
  const ok = m[1] === 'png' ? buf.subarray(0, 4).toString('hex') === '89504e47' : m[1] === 'jpeg' ? buf.subarray(0, 2).toString('hex') === 'ffd8' : buf.subarray(8, 12).toString() === 'WEBP';
  return ok ? { mime: `image/${m[1]}`, data: m[2] } : 'Image illisible (PNG, JPG ou WEBP).';
}
// Réseaux : on garde le pseudo (ou le lien collé, ramené au pseudo) ; le launcher en refait un lien propre
const LINK_URL = {
  twitch: /^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([\w.-]+)/i,
  youtube: /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(?:@|c\/|user\/|channel\/)?([\w.-]+)/i,
  tiktok: /^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([\w.-]+)/i,
  steam: /^(?:https?:\/\/)?steamcommunity\.com\/(?:id|profiles)\/([\w.-]+)/i,
  instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([\w.-]+)/i,
  discord: /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite)\/([\w-]+)/i,
};
export function linkHandle(kind, raw) {
  const v = String(raw ?? '').trim();
  const m = v.match(LINK_URL[kind] ?? /$^/);
  if (m) return kind === 'discord' ? `gg/${m[1]}` : m[1].slice(0, 40);
  const h = v.replace(/^@/, '');
  if (kind === 'discord') return /^(gg\/)?[\w.#-]{2,40}$/.test(h) ? h : null;
  return /^[\w.-]{2,40}$/.test(h) ? h : null;
}
async function saveProfile(a, body) {
  const p = (a.profile ??= {});
  if ('couleur' in body) p.color = /^#[0-9a-f]{6}$/i.test(String(body.couleur ?? '')) ? String(body.couleur).toLowerCase() : null;
  if ('bio' in body) p.bio = String(body.bio ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 140) || null;
  const pick = (v, list) => (list.includes(String(v)) && String(v) !== 'aucun' ? String(v) : null);
  if ('cadre' in body) p.frame = pick(body.cadre, PROFILE_CHOICES.frame);
  if ('fond' in body) p.cardBg = /^#[0-9a-f]{6}$/i.test(String(body.fond ?? '')) ? String(body.fond).toLowerCase() : null;
  if ('cacher' in body) p.hide = [...new Set((Array.isArray(body.cacher) ? body.cacher : []).map(String))].filter((x) => ['semaine', 'top', 'bench'].includes(x));
  if ('cadreCouleur' in body) p.frameColor = /^#[0-9a-f]{6}$/i.test(String(body.cadreCouleur ?? '')) ? String(body.cadreCouleur).toLowerCase() : null;
  if ('effet' in body) p.nameFx = pick(body.effet, PROFILE_CHOICES.nameFx);
  if ('banniere' in body) p.banner = pick(body.banniere, PROFILE_CHOICES.banner);
  if ('jeu' in body) p.favGame = String(body.jeu ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 60) || null;
  if ('badges' in body) p.badges = [...new Set((Array.isArray(body.badges) ? body.badges : []).map(String))].filter((b) => PROFILE_CHOICES.badges.includes(b)).slice(0, 3);
  if ('liens' in body && body.liens && typeof body.liens === 'object') {
    p.links = {};
    for (const k of PROFILE_CHOICES.links) { const v = linkHandle(k, body.liens[k]); if (v) p.links[k] = v; }
  }
  if ('banniereImg' in body) {
    if (body.banniereImg === null) { delete p.bv; dropImage('banniere', a.id); }
    else {
      const img = checkImage(body.banniereImg, 300 * 1024);
      if (typeof img === 'string') return img.replace('Image', 'Bannière');
      try { await saveImage('banniere', a.id, img); } catch { return 'Bannière non enregistrée, réessaie dans un instant.'; }
      p.bv = Date.now();
    }
  }
  if ('avatar' in body) {
    if (body.avatar === null) { delete p.av; dropImage('avatar', a.id); }
    else {
      const img = checkImage(body.avatar, AVATAR_MAX);
      if (typeof img === 'string') return img;
      try { await saveImage('avatar', a.id, img); } catch { return 'Photo non enregistrée, réessaie dans un instant.'; }
      p.av = Date.now();
    }
  }
  return null;
}

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
    store(d);
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
    d.tickets[sha(ticket)] = { id: account.id, exp: Date.now() + 5 * 60_000, tries: 0, device: cleanDevice(body.appareil) };
    for (const [k, t] of Object.entries(d.tickets)) if (Date.now() > t.exp) delete d.tickets[k];
    store(d);
    return { status: 200, need2fa: true, ticket };
  }
  const token = await newSession(d, account.id);
  await deviceCheck(account, cleanDevice(body.appareil), ip);
  store(d);
  return { status: 200, token, compte: publicAccount(account) };
}

/** Version de History Launcher / History Clips de chaque compte (envoyée par les applis), visible dans Supabase › launcher_comptes. */
async function noteVersion(token, launcher, clips) {
  const ok = (v) => (/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(v ?? '')) ? String(v) : null);
  const l = ok(launcher), c = ok(clips);
  if ((!l && !c) || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return;
  const d = await data();
  const a = d.accounts[d.sessions[sha(token)]?.id];
  if (!a) return;
  const now = Date.now();
  if ((l && a.appLauncher !== l) || (c && a.appClips !== c) || now - (a.appSeen ?? 0) > 3_600_000) {
    if (l) a.appLauncher = l; if (c) a.appClips = c; a.appSeen = now; store(d);
  }
}
export async function me(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const d = await data();
  const s = d.sessions[sha(token)];
  // Session glissante : 90 jours sans ouvrir le launcher avant de devoir se reconnecter (et redonner le code 2FA)
  if (!s || Date.now() - (s.seen ?? s.at) > SESSION_MS) return null;
  s.seen = Date.now();
  const account = d.accounts[s.id];
  return account ? publicAccount(account) : null;
}

export async function logout(token) {
  const d = await data();
  if (typeof token === 'string') delete d.sessions[sha(token)];
  store(d);
  return { status: 200, ok: true };
}

const accountOf = async (d, token) => {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const s = d.sessions[sha(token)];
  return s && Date.now() - (s.seen ?? s.at) <= SESSION_MS ? d.accounts[s.id] ?? null : null;
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
    if (!a || (step == null && !recovery)) { store(d); return { status: 401, error: 'Code incorrect.' }; }
    if (step != null) a.totp.lastStep = step;
    if (recovery) a.totp.recovery = a.totp.recovery.filter((h) => h !== hashValue(code));
    delete d.tickets[sha(String(body.ticket))];
    const tok = await newSession(d, a.id);
    await deviceCheck(a, t.device, ip);
    store(d);
    return { status: 200, token: tok, compte: publicAccount(a), recoveryLeft: recovery ? a.totp.recovery.length : undefined };
  }
  if (route === 'POST /api/compte/mdp/oubli') {
    if (!allowAttempt('compte-oubli-ip', ip, 5, 60 * 60_000)) return { status: 429, error: 'Trop de demandes, réessaie plus tard.' };
    const a = d.accounts[d.byEmail[cleanEmail(body.email)]];
    if (a && mailReady()) {
      const code = mailCode();
      a.reset = codeRecord(code);
      store(d);
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
    if (r !== 'ok') { store(d); return { status: 400, error: r === 'expired' ? 'Code expiré : redemande un code.' : 'Code incorrect.' }; }
    a.salt = randomBytes(16).toString('hex');
    a.hash = await hashPassword(body.motDePasse, a.salt);
    delete a.reset;
    a.verified = true; // le code reçu par e-mail prouve l'adresse
    for (const [k, s] of Object.entries(d.sessions)) if (s.id === a.id) delete d.sessions[k]; // déconnecte partout
    store(d);
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
    store(d);
    const m = codeMail(a.pseudo, code, 'verif');
    const r = await sendMail(a.email, m.subject, m.html);
    return r.ok ? { status: 200, ok: true } : { status: 502, error: r.error };
  }
  if (route === 'POST /api/compte/verif') {
    const r = checkMailCode(a.verif, body.code);
    if (r !== 'ok') { store(d); return { status: 400, error: r === 'expired' ? 'Code expiré : demande un nouveau code.' : 'Code incorrect.' }; }
    a.verified = true;
    delete a.verif;
    store(d);
    return { status: 200, ok: true, compte: publicAccount(a) };
  }
  if (route === 'POST /api/compte/2fa/debut') {
    if (a.totp?.on) return { status: 409, error: 'La double authentification est déjà activée.' };
    a.totp = { on: false, secret: newTotpSecret() };
    store(d);
    return { status: 200, secret: a.totp.secret, url: otpauthUrl(a.totp.secret, a.email) };
  }
  if (route === 'POST /api/compte/2fa/activer') {
    if (!a.totp?.secret || a.totp.on) return { status: 400, error: 'Recommence l’activation.' };
    const step = checkTotp(a.totp.secret, body.code);
    if (step == null) return { status: 400, error: 'Code incorrect : vérifie l’heure de ton téléphone et réessaie.' };
    const codes = recoveryCodes();
    a.totp = { on: true, secret: a.totp.secret, lastStep: step, recovery: codes.map(hashValue), since: Date.now() };
    // Les autres appareils déjà connectés sont déconnectés : ils devront donner le code pour revenir
    for (const [h, sess] of Object.entries(d.sessions)) if (sess.id === a.id && h !== sha(String(token ?? ''))) delete d.sessions[h];
    store(d);
    return { status: 200, ok: true, recovery: codes, compte: publicAccount(a) };
  }
  // Déverrouillage du launcher à l'ouverture (compte avec double authentification)
  if (route === 'POST /api/compte/2fa/verifier') {
    if (!a.totp?.on) return { status: 200, ok: true };
    const code = String(body.code ?? '').trim().toUpperCase();
    const step = checkTotp(a.totp.secret, code, a.totp.lastStep ?? -1);
    const recovery = step == null && a.totp.recovery?.includes(hashValue(code));
    if (step == null && !recovery) return { status: 401, error: 'Code incorrect.' };
    if (step != null) a.totp.lastStep = step;
    if (recovery) a.totp.recovery = a.totp.recovery.filter((h) => h !== hashValue(code));
    store(d);
    return { status: 200, ok: true, recoveryLeft: recovery ? a.totp.recovery.length : undefined };
  }
  if (route === 'POST /api/compte/2fa/desactiver') {
    if (!a.totp?.on) return { status: 200, ok: true };
    const pw = Buffer.from(await hashPassword(body.motDePasse ?? '', a.salt), 'hex');
    const good = Buffer.from(a.hash, 'hex');
    if (pw.length !== good.length || !timingSafeEqual(pw, good)) return { status: 401, error: 'Mot de passe incorrect.' };
    if (checkTotp(a.totp.secret, body.code, a.totp.lastStep ?? -1) == null && !a.totp.recovery?.includes(hashValue(String(body.code ?? '').trim().toUpperCase()))) return { status: 401, error: 'Code incorrect.' };
    delete a.totp;
    store(d);
    return { status: 200, ok: true, compte: publicAccount(a) };
  }
  return { status: 404, error: 'route inconnue' };
}

/** Routes /api/compte/… (appelées par le launcher). */
export async function handleAccountApi(req, res, url, { readJson, readBinary, send, clientIp }) {
  const route = `${req.method} ${url.pathname}`;
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  const ip = clientIp(req);
  res.setHeader('Cache-Control', 'no-store');
  noteVersion(token, req.headers['x-history-version'], req.headers['x-history-clips-version']).catch(() => {});
  sessionApp = req.headers['x-history-clips-version'] ? 'History Clips' : req.headers['x-history-version'] ? 'History Launcher' : 'Navigateur';
  try {
    if (route === 'POST /api/compte/inscription') { const r = await register(await readJson(req), ip); return send(res, r.status, r); }
    if (route === 'POST /api/compte/connexion') { const r = await login(await readJson(req), ip); return send(res, r.status, r); }
    if (route === 'POST /api/compte/deconnexion') { const r = await logout(token); return send(res, r.status, r); }
    if (url.pathname.startsWith('/api/compte/verif') || url.pathname.startsWith('/api/compte/mdp') || url.pathname.startsWith('/api/compte/2fa') || route === 'POST /api/compte/connexion/2fa') {
      const r = await securityRoute(route, await readJson(req), token, ip); return send(res, r.status, r);
    }
    // État du stockage (sans rien de secret) : le launcher affiche si les comptes sont bien gardés sur Supabase
    if (route === 'GET /api/compte/etat') {
      const d = await data();
      return send(res, 200, { stockage: storageBackend, supabase: storageBackend === 'Supabase', comptes: Object.keys(d.accounts).length });
    }
    // Connexion par code : le nouveau PC affiche un code, un PC déjà connecté le valide (pas de mot de passe à taper)
    if (route === 'POST /api/compte/lien/demande') {
      if (!allowAttempt('compte-lien-demande', ip, 10, 10 * 60_000)) return send(res, 429, { error: 'Trop de demandes, réessaie dans quelques minutes.' });
      const body = await readJson(req);
      const d = await data();
      for (const [k, x] of Object.entries(d.pairs)) if (Date.now() > x.exp) delete d.pairs[k];
      const code = Array.from(randomBytes(8), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('').replace(/^(.{4})/, '$1-');
      const ticket = randomBytes(24).toString('base64url');
      d.pairs[sha(ticket)] = { code, exp: Date.now() + 5 * 60_000, device: cleanDevice(body.appareil), name: String(body.nom ?? 'PC').replace(/[^\w .'-]/g, '').slice(0, 40) || 'PC', id: null };
      store(d);
      return send(res, 200, { ok: true, code, ticket, exp: d.pairs[sha(ticket)].exp });
    }
    if (route === 'GET /api/compte/lien/attente') {
      const d = await data();
      const k = sha(String(url.searchParams.get('ticket') ?? ''));
      const pr = d.pairs[k];
      if (!pr || Date.now() > pr.exp) { delete d.pairs[k]; return send(res, 410, { error: 'Code expiré, demande-en un nouveau.' }); }
      if (!pr.id) return send(res, 200, { waiting: true });
      const a = d.accounts[pr.id];
      delete d.pairs[k];
      if (!a) return send(res, 410, { error: 'Compte introuvable.' });
      const tok = await newSession(d, a.id);
      if (pr.device) { const h = sha(`appareil:${pr.device}`); a.devices = [...(a.devices ?? []).filter((x) => x.h !== h), { h, at: Date.now() }].slice(-20); }
      store(d);
      return send(res, 200, { ok: true, token: tok, compte: publicAccount(a) });
    }
    // QR du launcher : un code à usage unique (2 min) qui connecte le téléphone au compte ET à ce PC, en un scan
    // ---------- Passkeys (Windows Hello, Face ID, empreinte) sur l'appli web https ----------
    if (url.pathname.startsWith('/api/compte/passkey')) {
      const wa = await import('@simplewebauthn/server');
      const RP = 'zyko144.github.io', ORIGIN = 'https://zyko144.github.io';
      const d = await data(); d.passkeys ??= {}; d.waChal ??= {};
      for (const [k, x] of Object.entries(d.waChal)) if (Date.now() > x.exp) delete d.waChal[k];
      const b = req.method === 'POST' ? await readJson(req) : {};
      const a = await accountOf(d, token);
      const mine = () => Object.values(d.passkeys).filter((p) => p.owner === a?.id);
      if (route === 'GET /api/compte/passkey') return a ? send(res, 200, { passkeys: mine().map((p) => ({ id: p.id, name: p.name, at: p.at, used: p.used ?? null })) }) : send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
      if (route === 'POST /api/compte/passkey/supprimer') { if (!a) return send(res, 401, { error: 'Session expirée.' }); if (d.passkeys[b.id]?.owner === a.id) delete d.passkeys[b.id]; store(d); return send(res, 200, { ok: true }); }
      if (route === 'POST /api/compte/passkey/options-ajout') {
        if (!a) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
        const o = await wa.generateRegistrationOptions({ rpName: 'History', rpID: RP, userName: a.email ?? a.pseudo, userDisplayName: a.pseudo ?? a.email, attestationType: 'none', excludeCredentials: mine().map((p) => ({ id: p.id })), authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' } });
        d.waChal[`add:${a.id}`] = { c: o.challenge, exp: Date.now() + 5 * 60_000 }; store(d); return send(res, 200, o);
      }
      if (route === 'POST /api/compte/passkey/ajout') {
        if (!a) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
        const ch = d.waChal[`add:${a.id}`]; delete d.waChal[`add:${a.id}`];
        const v = ch ? await wa.verifyRegistrationResponse({ response: b.response, expectedChallenge: ch.c, expectedOrigin: ORIGIN, expectedRPID: RP }).catch(() => null) : null;
        if (!v?.verified) { store(d); return send(res, 400, { error: 'Passkey refusée, réessaie.' }); }
        const c = v.registrationInfo.credential;
        d.passkeys[c.id] = { id: c.id, owner: a.id, key: Buffer.from(c.publicKey).toString('base64url'), counter: c.counter, transports: c.transports ?? [], name: String(b.name ?? 'Passkey').slice(0, 40), at: Date.now() };
        store(d); return send(res, 200, { ok: true });
      }
      if (route === 'POST /api/compte/passkey/options-connexion') {
        if (!allowAttempt('compte-passkey', ip, 30, 10 * 60_000)) return send(res, 429, { error: 'Trop d’essais.' });
        const o = await wa.generateAuthenticationOptions({ rpID: RP, userVerification: 'preferred' });
        const ticket = randomBytes(16).toString('base64url'); d.waChal[`in:${ticket}`] = { c: o.challenge, exp: Date.now() + 5 * 60_000 }; store(d);
        return send(res, 200, { ...o, ticket });
      }
      if (route === 'POST /api/compte/passkey/connexion') {
        const ch = d.waChal[`in:${b.ticket}`]; delete d.waChal[`in:${b.ticket}`];
        const p = d.passkeys[b.response?.id];
        const v = ch && p ? await wa.verifyAuthenticationResponse({ response: b.response, expectedChallenge: ch.c, expectedOrigin: ORIGIN, expectedRPID: RP, credential: { id: p.id, publicKey: Buffer.from(p.key, 'base64url'), counter: p.counter, transports: p.transports } }).catch(() => null) : null;
        if (!v?.verified || !d.accounts[p.owner]) { store(d); return send(res, 401, { error: 'Passkey non reconnue.' }); }
        p.counter = v.authenticationInfo.newCounter; p.used = Date.now();
        sessionApp = 'Navigateur (passkey)'; const tok = await newSession(d, p.owner); store(d);
        return send(res, 200, { ok: true, token: tok, compte: publicAccount(d.accounts[p.owner]) });
      }
      return send(res, 404, { error: 'route inconnue' });
    }
    // ---------- Connexion du launcher par le navigateur (passkey, ou compte déjà ouvert sur le téléphone) ----------
    if (route === 'POST /api/compte/lien/appareil') {
      if (!allowAttempt('compte-appareil', ip, 20, 10 * 60_000)) return send(res, 429, { error: 'Trop d’essais.' });
      const d = await data(); d.dev ??= {}; for (const [k, x] of Object.entries(d.dev)) if (Date.now() > x.exp) delete d.dev[k];
      const code = randomBytes(18).toString('base64url'), check = randomBytes(3).toString('hex').toUpperCase();
      d.dev[sha(code)] = { check, exp: Date.now() + 5 * 60_000, id: null }; store(d);
      return send(res, 200, { code, check });
    }
    if (route === 'POST /api/compte/lien/appareil/infos') { const d = await data(); const x = d.dev?.[sha(String((await readJson(req)).code ?? ''))]; return x && Date.now() < x.exp ? send(res, 200, { check: x.check }) : send(res, 410, { error: 'Lien expiré : relance la connexion depuis le launcher.' }); }
    if (route === 'POST /api/compte/lien/appareil/valider') {
      const d = await data(); const a = await accountOf(d, token); if (!a) return send(res, 401, { error: 'Connecte-toi d’abord.' });
      const x = d.dev?.[sha(String((await readJson(req)).code ?? ''))];
      if (!x || Date.now() > x.exp) return send(res, 410, { error: 'Lien expiré : relance la connexion depuis le launcher.' });
      x.id = a.id; store(d); return send(res, 200, { ok: true });
    }
    if (route === 'POST /api/compte/lien/appareil/attendre') {
      const d = await data(); const k = sha(String((await readJson(req)).code ?? '')), x = d.dev?.[k];
      if (!x || Date.now() > x.exp) return send(res, 410, { error: 'Délai dépassé.' });
      if (!x.id || !d.accounts[x.id]) return send(res, 200, { waiting: true });
      delete d.dev[k]; sessionApp = 'History Launcher'; const tok = await newSession(d, x.id); store(d);
      return send(res, 200, { ok: true, token: tok, compte: publicAccount(d.accounts[x.id]) });
    }
    if (route === 'POST /api/compte/lien/qr') {
      const d = await data(); const a = await accountOf(d, token);
      if (!a) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
      if (!allowAttempt('compte-lien-qr', a.id, 20, 10 * 60_000)) return send(res, 429, { error: 'Trop de QR, réessaie dans quelques minutes.' });
      const b = await readJson(req); d.qr ??= {};
      for (const [k, x] of Object.entries(d.qr)) if (Date.now() > x.exp) delete d.qr[k];
      const code = randomBytes(18).toString('base64url');
      d.qr[sha(code)] = { id: a.id, pc: String(b.pc ?? '').replace(/[^\w-]/g, '').slice(0, 40), exp: Date.now() + 2 * 60_000 };
      store(d); return send(res, 200, { ok: true, code });
    }
    if (route === 'POST /api/compte/lien/qr/utiliser') {
      if (!allowAttempt('compte-lien-qr-use', ip, 20, 10 * 60_000)) return send(res, 429, { error: 'Trop d’essais.' });
      const d = await data(); d.qr ??= {}; const k = sha(String((await readJson(req)).code ?? ''));
      const x = d.qr[k]; delete d.qr[k];
      if (!x || Date.now() > x.exp || !d.accounts[x.id]) { store(d); return send(res, 410, { error: 'QR expiré : affiche-le à nouveau dans le launcher.' }); }
      sessionApp = 'Téléphone'; const tok = await newSession(d, x.id); store(d);
      return send(res, 200, { ok: true, token: tok, pc: x.pc, compte: publicAccount(d.accounts[x.id]) });
    }
    // Contrôle du PC depuis le téléphone, par le serveur (marche en 4G) : le launcher envoie son état et récupère les ordres
    if (url.pathname.startsWith('/api/compte/pc')) {
      const c = await me(token); if (!c) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
      const { pcRoute } = await import('./launcherPhone.js');
      return pcRoute(req, res, url, c, { readJson, send });
    }
    if (route === 'POST /api/compte/lien/valider') {
      const d = await data();
      const a = await accountOf(d, token);
      if (!a) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
      if (!allowAttempt('compte-lien-valider', a.id, 10, 10 * 60_000)) return send(res, 429, { error: 'Trop d’essais, réessaie dans quelques minutes.' });
      const code = String((await readJson(req)).code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})/, '$1-');
      const pr = Object.values(d.pairs).find((x) => x.code === code && Date.now() <= x.exp && !x.id);
      if (!pr) return send(res, 404, { error: 'Code inconnu ou expiré.' });
      pr.id = a.id;
      store(d);
      return send(res, 200, { ok: true, nom: pr.name });
    }
    if (route === 'POST /api/compte/discord/code' || route === 'POST /api/compte/discord/delier') {
      const d = await data();
      const a = await accountOf(d, token);
      if (!a) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
      if (route.endsWith('delier')) { delete a.discordId; store(d); return send(res, 200, { ok: true }); }
      for (const [c, x] of Object.entries(d.discordCodes)) if (Date.now() > x.exp || x.id === a.id) delete d.discordCodes[c];
      const code = Array.from(randomBytes(6), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
      d.discordCodes[code] = { id: a.id, exp: Date.now() + 10 * 60_000 };
      store(d);
      return send(res, 200, { ok: true, code, lie: Boolean(a.discordId) });
    }
    // Photo de profil : publique (identifiant aléatoire), gardée en cache par le navigateur
    const avm = url.pathname.match(/^\/api\/compte\/(avatar|banniere|img)\/([\w-]{8,64})$/);
    if (avm && req.method === 'GET') {
      const kind = avm[1] === 'img' ? 'image' : avm[1];
      let blob = await getBlob(`${kind}/${avm[2]}`);
      if (!blob) { // anciennes images gardées dans la table clé/valeur
        const old = await load(`launcher-${avm[1]}-${avm[2]}`, null);
        if (old?.data) blob = { buf: Buffer.from(old.data, 'base64'), mime: old.mime };
      }
      if (!blob || !/^image\/(png|jpeg|webp)$/.test(blob.mime)) return send(res, 404, { error: 'Pas de photo.' });
      res.writeHead(200, { 'Content-Type': blob.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
      res.end(blob.buf);
      return;
    }
    if (route === 'POST /api/compte/profil') {
      const d = await data();
      const a = await accountOf(d, token);
      if (!a) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
      if (!allowAttempt('compte-profil', a.id, 30, 60 * 60_000)) return send(res, 429, { error: 'Trop de changements, réessaie plus tard.' });
      const err = await saveProfile(a, await readJson(req));
      if (err) return send(res, 400, { error: err });
      store(d);
      return send(res, 200, { ok: true, compte: publicAccount(a) });
    }
    // Appareils connectés (historique des sessions) : voir et déconnecter un appareil, ou tous les autres
    if (route === 'GET /api/compte/sessions' || route === 'POST /api/compte/sessions/fin') {
      const c = await me(token); if (!c) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
      const d = await data(), mine = sha(token);
      if (req.method === 'POST') { const b = await readJson(req); for (const [h, x] of Object.entries(d.sessions)) if (x.id === c.id && h !== mine && (b.tout || h.slice(0, 12) === String(b.k))) delete d.sessions[h]; store(d); }
      return send(res, 200, { sessions: Object.entries(d.sessions).filter(([, x]) => x.id === c.id).map(([h, x]) => ({ k: h.slice(0, 12), app: x.app ?? 'History Launcher', at: x.at, seen: x.seen ?? x.at, actuelle: h === mine })).sort((a, b) => b.seen - a.seen) });
    }
    // RGPD : export de toutes mes données (JSON) et suppression du compte (mot de passe demandé)
    if (route === 'GET /api/compte/export') {
      const c = await me(token); if (!c) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
      const { load } = await import('../storage.js');
      const [soc, saves, specs] = await Promise.all(['launcher-social', 'cloud-saves', 'opti-pro-specs'].map((k) => load(k, {}).catch(() => ({}))));
      const prem = await (await import('./launcherPremium.js')).premiumOf(c).catch(() => null);
      const pick = (o) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, v?.[c.id]]).filter(([, v]) => v !== undefined));
      return send(res, 200, { exporte_le: new Date().toISOString(), compte: c, social: pick(soc), sauvegardes_cloud: Object.values(saves?.[c.id] ?? {}), premium: prem, opti_pro: specs?.[c.id] ?? null });
    }
    if (route === 'POST /api/compte/supprimer') {
      const c = await me(token); if (!c) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
      if (!allowAttempt('compte-suppr', c.id, 5, 3_600_000)) return send(res, 429, { error: 'Trop d’essais.' });
      const b = await readJson(req), d = await data(), a = d.accounts[c.id];
      const pw = Buffer.from(await hashPassword(b.motDePasse ?? '', a.salt), 'hex'), good = Buffer.from(a.hash, 'hex');
      if (pw.length !== good.length || !timingSafeEqual(pw, good)) return send(res, 401, { error: 'Mot de passe incorrect.' });
      for (const [h, x] of Object.entries(d.sessions)) if (x.id === c.id) delete d.sessions[h];
      delete d.accounts[c.id]; store(d);
      const { load, save } = await import('../storage.js');
      const saves = (await load('cloud-saves', {})) ?? {}; if (saves[c.id]) { delete saves[c.id]; save('cloud-saves', saves); }
      return send(res, 200, { ok: true });
    }
    if (route === 'GET /api/compte/moi') { const c = await me(token); return c ? send(res, 200, { compte: c }) : send(res, 401, { error: 'Session expirée, reconnecte-toi.' }); }
    if (url.pathname === '/api/compte/sauvegarde' && ['GET', 'POST'].includes(req.method)) {
      const { handleBackupApi } = await import('./launcherBackup.js');
      return await handleBackupApi(req, res, { readJson, send });
    }
    if (url.pathname === '/api/compte/optipro' || url.pathname === '/api/compte/optipro/action') {
      const compte = await me(token);
      if (!compte) return send(res, 401, { error: 'Connecte-toi à ton compte History.' });
      return await (await import('./optiPro.js')).handleOptiProApi(req, res, url, compte, { readJson, send });
    }
    if (url.pathname === '/api/compte/support') {
      const { handleSupportApi } = await import('./launcherSupport.js');
      return await handleSupportApi(req, res, url, { readJson, send });
    }
    if (route === 'GET /api/compte/premium') {
      const compte = await me(token);
      if (!compte) return send(res, 401, { error: 'Non connecté.' });
      const { premiumOf, PACKS, payLink, takeNews, friendCode, trialUsed, promoOf, sponsorStats } = await import('./launcherPremium.js');
      return send(res, 200, { ...(await premiumOf(compte)), news: await takeNews(compte.id), packs: PACKS, promo: promoOf(), parrain: await sponsorStats(compte.id), code: friendCode(compte.id), trialUsed: await trialUsed(compte.id), pay: Object.fromEntries(Object.keys(PACKS).map((k) => [k, payLink(k, compte.id)])) });
    }
    if (route === 'POST /api/compte/premium/note') {
      const compte = await me(token);
      if (!compte) return send(res, 401, { error: 'Connecte-toi à ton compte History.' });
      const b = await readJson(req);
      const r = await (await import('./launcherPremium.js')).paymentNote(compte, String(b.pack ?? ''), { code: String(b.code ?? '').slice(0, 20), gift: Boolean(b.gift), annual: Boolean(b.annual) });
      return send(res, r.status, r);
    }
    if (route === 'POST /api/compte/premium/essai' || route === 'POST /api/compte/premium/cadeau') {
      const compte = await me(token);
      if (!compte) return send(res, 401, { error: 'Connecte-toi à ton compte History.' });
      if (!allowAttempt('premium-code', compte.id, 10, 3_600_000)) return send(res, 429, { error: 'Trop d’essais, réessaie plus tard.' });
      const m = await import('./launcherPremium.js');
      const r = route.endsWith('essai') ? await m.startTrial(compte) : await m.redeemGift(compte, (await readJson(req)).code);
      return send(res, r.status, r);
    }
    if (route === 'POST /api/compte/premium/demande') {
      const compte = await me(token);
      if (!compte) return send(res, 401, { error: 'Connecte-toi à ton compte History.' });
      const b = await readJson(req);
      const r = await (await import('./launcherPremium.js')).requestValidation(compte, String(b.pack ?? ''), b.paypal, b.shot);
      return send(res, r.status, r);
    }
    if (route === 'GET /api/compte/esport/img') {
      const type = url.searchParams.get('type'), name = String(url.searchParams.get('nom') ?? '').slice(0, 80);
      if (!allowAttempt('esport-img', ip, 300, 10 * 60_000)) return send(res, 429, { error: 'Trop de demandes.' });
      const img = await (await import('./launcherEsport.js')).esportImage(type, name).catch(() => null);
      if (!img) return send(res, 404, { error: 'Pas d’image.' });
      res.writeHead(200, { 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
      return res.end(img.buf);
    }
    if (route === 'POST /api/compte/traduire') {
      if (!allowAttempt('compte-traduire', ip, 120, 10 * 60_000)) return send(res, 429, { error: 'Trop de demandes.' });
      const { translate } = await import('./launcherI18n.js');
      return send(res, 200, { en: await translate((await readJson(req)).texts) });
    }
    if (route === 'POST /api/compte/ia') {
      const { handleLauncherAi } = await import('./launcherAi.js');
      return await handleLauncherAi(req, res, { readJson, send });
    }
    if (/^\/api\/compte\/(amis|presence|soirees|boite|messages|inviter|appel|benchmark|groupes|fps|alertes|partage|fichier|discord\/clip|clip|lfg)(\/|$)/.test(url.pathname)) {
      const { handleSocialApi } = await import('./launcherSocial.js');
      return await handleSocialApi(req, res, url, { readJson, readBinary, send });
    }
  } catch {
    return send(res, 400, { error: 'Demande illisible.' });
  }
  return send(res, 404, { error: 'route inconnue' });
}

// ---------- Pour le bot Discord (/launcher) ----------
/** Lie un compte Discord avec le code affiché dans le launcher (valable 10 min, une seule fois). */
export async function linkDiscord(code, discordId) {
  const d = await data();
  const c = String(code ?? '').trim().toUpperCase();
  const x = d.discordCodes[c];
  if (!x || Date.now() > x.exp) return { ok: false, error: 'Code inconnu ou expiré : génère-en un nouveau dans le launcher (Paramètres › Compte).' };
  delete d.discordCodes[c];
  for (const acc of Object.values(d.accounts)) if (acc.discordId === discordId) delete acc.discordId;
  const a = d.accounts[x.id];
  if (!a) return { ok: false, error: 'Compte introuvable.' };
  a.discordId = String(discordId);
  store(d);
  return { ok: true, pseudo: a.pseudo, id: a.id };
}
/** Compte par identifiant, pseudo, e-mail ou identifiant Discord (premium ajouté à la main, paiement depuis le site). */
export async function findAccount(q) {
  const k = String(q ?? '').trim().toLowerCase();
  if (!k) return null;
  const d = await data();
  return d.accounts[String(q).trim()] ?? Object.values(d.accounts).find((a) => [a.pseudo, a.email, a.discordId].some((v) => String(v ?? '').toLowerCase() === k)) ?? null;
}
export async function accountByDiscord(discordId) {
  const d = await data();
  return Object.values(d.accounts).find((a) => a.discordId === String(discordId)) ?? null;
}
export async function linkedAccounts() {
  const d = await data();
  return Object.values(d.accounts).filter((a) => a.discordId).map((a) => ({ id: a.id, pseudo: a.pseudo, discordId: a.discordId }));
}
