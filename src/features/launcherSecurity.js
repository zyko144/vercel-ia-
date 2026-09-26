// Sécurité des comptes History Launcher :
// - vérification de l'e-mail par code (envoyé avec Resend), mot de passe oublié par code ;
// - double authentification (application d'authentification : Google Authenticator, Authy, 2FAS…) par QR code,
//   codes TOTP de 6 chiffres (RFC 6238) + 8 codes de secours à usage unique.
// Les codes sont gardés sous forme d'empreinte, expirent vite et ont un nombre d'essais limité.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const sha = (v) => createHash('sha256').update(String(v)).digest('hex');
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const out = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Code TOTP à 6 chiffres pour un pas de 30 s donné. */
export function totp(secret, step = Math.floor(Date.now() / 30_000)) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}
/** Vérifie un code (±30 s de décalage d'horloge toléré) ; renvoie le pas utilisé (anti-rejeu) ou null. */
export function checkTotp(secret, code, lastStep = -1, now = Date.now()) {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(now / 30_000);
  for (const s of [step - 1, step, step + 1]) {
    if (s <= lastStep) continue;
    const a = Buffer.from(totp(secret, s)); const b = Buffer.from(c);
    if (timingSafeEqual(a, b)) return s;
  }
  return null;
}
export const newTotpSecret = () => base32Encode(randomBytes(20));
export const otpauthUrl = (secret, email) => `otpauth://totp/${encodeURIComponent(`History:${email}`)}?secret=${secret}&issuer=History&algorithm=SHA1&digits=6&period=30`;
export function recoveryCodes(n = 8) {
  return Array.from({ length: n }, () => `${randomBytes(3).toString('hex')}-${randomBytes(3).toString('hex')}`.toUpperCase());
}

// ---------- Codes envoyés par e-mail (vérification, mot de passe oublié) ----------
export const mailCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const codeRecord = (code, ttl = 15 * 60_000) => ({ hash: sha(code), exp: Date.now() + ttl, tries: 0 });
/** Vérifie un code reçu par e-mail (5 essais max, expiré après 15 min). */
export function checkMailCode(rec, code) {
  if (!rec || Date.now() > rec.exp || rec.tries >= 5) return 'expired';
  rec.tries += 1;
  const a = Buffer.from(sha(String(code ?? '').trim())); const b = Buffer.from(rec.hash);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'bad';
}

export const mailReady = () => Boolean(process.env.RESEND_API_KEY);

/** Envoie un e-mail avec Resend (clé RESEND_API_KEY dans l'environnement du serveur, jamais dans le code). */
export async function sendMail(to, subject, html, fetchImpl = fetch) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'E-mails non configurés sur le serveur.' };
  const r = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.RESEND_FROM || 'History <onboarding@resend.dev>', to: [to], subject, html }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return r?.ok ? { ok: true } : { ok: false, error: 'Envoi de l’e-mail impossible, réessaie plus tard.' };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** E-mail aux couleurs du launcher (verre sombre, dégradé bleu). */
export function codeMail(pseudo, code, kind) {
  const title = kind === 'reset' ? 'Réinitialise ton mot de passe' : 'Confirme ton adresse e-mail';
  const line = kind === 'reset' ? 'Voici ton code pour choisir un nouveau mot de passe :' : 'Bienvenue sur History ! Voici ton code de vérification :';
  return {
    subject: `${code} · ${title} (History)`,
    html: `<div style="background:#0b0910;padding:36px 16px;font-family:Segoe UI,Arial,sans-serif;color:#f4f1f6">
<div style="max-width:440px;margin:auto;padding:30px;border-radius:22px;background:linear-gradient(160deg,#1b1826,#121018);border:1px solid #2b2638;text-align:center">
<div style="font-size:13px;letter-spacing:3px;color:#22d3ee;font-weight:700">HISTORY</div>
<h1 style="font-size:22px;margin:14px 0 6px">${title}</h1>
<p style="color:#b8b0c2;margin:0 0 22px">Salut ${esc(pseudo)} 👋 ${line}</p>
<div style="font-size:36px;letter-spacing:10px;font-weight:800;padding:16px;border-radius:14px;background:linear-gradient(90deg,#2f8bff,#1554d1);color:#fff">${code}</div>
<p style="color:#948d9c;font-size:12.5px;margin:22px 0 0">Ce code expire dans 15 minutes. Si tu n’as rien demandé, ignore cet e-mail : ton compte reste protégé.</p>
</div></div>`,
  };
}
export { sha as hashValue };
