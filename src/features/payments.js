// Paiement PayPal, parrainage et page de statut publique.
//
// PAIEMENT
// - /payer?serveur=<id>&offre=veilleur|gardien : page qui envoie vers PayPal.
// - Avec PAYPAL_EMAIL (l'adresse du compte PayPal qui reçoit l'argent) : bouton PayPal classique, et PayPal
//   prévient le bot (/paypal/ipn). Le bot vérifie le paiement auprès de PayPal, puis active l'offre 31 jours
//   tout seul (et récompense le parrain).
// - Sans PAYPAL_EMAIL : lien paypal.me (PAYPAL_ME, « steamapp » par défaut) ; le chef active à la main.
//
// PARRAINAGE : chaque serveur a un code. Un nouveau serveur entre le code de celui qui l'a invité ;
// au premier paiement du nouveau serveur, le parrain gagne 1 mois offert.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { load, save } from '../storage.js';
import { PLANS, planOf, setPlan } from './premium.js';

const PRICES = { veilleur: '4.99', gardien: '9.99' };
const DAYS = 31;
const PAYPAL_EMAIL = (process.env.PAYPAL_EMAIL ?? '').trim();
const PAYPAL_ME = (process.env.PAYPAL_ME ?? 'steamapp').trim();
const IPN_VERIFY = 'https://ipnpb.paypal.com/cgi-bin/webscr';
const ID = /^\d{15,21}$/;

let client = null;
export function setPaymentsClient(c) {
  client = c;
}
const base = () => (config.publicUrl || 'https://vercel-ia.onrender.com').replace(/\/+$/, '');
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ===================== Parrainage =====================

/** Code de parrainage d'un serveur : court, stable, impossible à deviner sans l'identifiant. */
export function referralCode(guildId) {
  return `VERCEL-${crypto.createHash('sha256').update(`parrain:${guildId}`).digest('hex').slice(0, 6).toUpperCase()}`;
}

async function referrals() {
  return (await load('parrainages', {}).catch(() => ({}))) ?? {};
}

/** Le serveur guildId indique qu'il vient de la part du serveur qui a ce code. */
export async function useReferral(guildId, code) {
  const all = await referrals();
  if (all[guildId]?.by) return { error: 'Un code de parrainage a déjà été entré pour ce serveur.' };
  const wanted = String(code ?? '').trim().toUpperCase();
  const sponsor = client?.guilds.cache.find((g) => referralCode(g.id) === wanted);
  if (!sponsor) return { error: 'Code inconnu (le serveur parrain doit avoir le bot).' };
  if (sponsor.id === guildId) return { error: 'Tu ne peux pas être ton propre parrain 😄' };
  all[guildId] = { by: sponsor.id, at: Date.now(), rewarded: false };
  save('parrainages', all);
  return { sponsor };
}

export async function referralStats(guildId) {
  const all = await referrals();
  const sponsored = Object.entries(all).filter(([, r]) => r.by === guildId);
  return { code: referralCode(guildId), invited: sponsored.length, paid: sponsored.filter(([, r]) => r.rewarded).length, by: all[guildId]?.by ?? null };
}

/** Premier paiement d'un serveur parrainé : 1 mois offert au parrain. */
async function rewardSponsor(guildId) {
  const all = await referrals();
  const r = all[guildId];
  if (!r || r.rewarded) return null;
  r.rewarded = true;
  save('parrainages', all);
  const current = planOf(r.by);
  const plan = setPlan(r.by, current.key === 'gratuit' || current.trial ? 'veilleur' : current.key, DAYS);
  console.log(`[parrainage] ${r.by} gagne 1 mois (${plan.label}) grâce à ${guildId}`);
  const sponsor = client?.guilds.cache.get(r.by);
  const owner = await sponsor?.fetchOwner().catch(() => null);
  await owner?.send(`🎁 Merci pour le parrainage ! Un serveur que tu as invité vient de s’abonner : **1 mois de ${plan.label}** offert sur **${sponsor.name}**.`).catch(() => {});
  return plan;
}

// ===================== PayPal =====================

/** Page /payer : formulaire PayPal (envoyé tout seul), ou lien paypal.me. */
export function paymentPage(url) {
  const guildId = url.searchParams.get('serveur') ?? '';
  const plan = url.searchParams.get('offre') ?? '';
  const valid = ID.test(guildId) && PRICES[plan];
  const guildName = client?.guilds.cache.get(guildId)?.name ?? null;
  const body = !valid
    ? `<h1>Lien incomplet</h1><p>Dans Discord : <b>/serveur</b> › Offre du serveur › Payer, ou reviens sur le site et choisis une offre.</p>`
    : PAYPAL_EMAIL
      ? `<h1>${esc(PLANS[plan].emoji)} ${esc(PLANS[plan].label)} · ${PRICES[plan].replace('.', ',')} €</h1>
<p>Pour ${guildName ? `le serveur <b>${esc(guildName)}</b>` : `le serveur <code>${esc(guildId)}</code>`}, pendant ${DAYS} jours. Activation automatique après le paiement.</p>
<form id="pp" method="post" action="https://www.paypal.com/cgi-bin/webscr">
<input type="hidden" name="cmd" value="_xclick"><input type="hidden" name="business" value="${esc(PAYPAL_EMAIL)}">
<input type="hidden" name="item_name" value="AI Vercel ${esc(PLANS[plan].label)} (${DAYS} jours)"><input type="hidden" name="amount" value="${PRICES[plan]}">
<input type="hidden" name="currency_code" value="EUR"><input type="hidden" name="no_shipping" value="1">
<input type="hidden" name="custom" value="${esc(`${guildId}|${plan}`)}"><input type="hidden" name="notify_url" value="${esc(`${base()}/paypal/ipn`)}">
<input type="hidden" name="return" value="${esc(`${base()}/merci`)}"><input type="hidden" name="cancel_return" value="${esc(`${base()}/#offres`)}">
<button type="submit">Payer avec PayPal</button></form>`
      : `<h1>${esc(PLANS[plan].emoji)} ${esc(PLANS[plan].label)} · ${PRICES[plan].replace('.', ',')} €</h1>
<p>Paie avec PayPal, et <b>mets l’identifiant du serveur dans le message du paiement</b> : <code>${esc(guildId)}</code></p>
<p><a class="bouton" href="https://paypal.me/${encodeURIComponent(PAYPAL_ME)}/${PRICES[plan]}EUR">Payer ${PRICES[plan].replace('.', ',')} € sur PayPal</a></p>
<p class="petit">L’offre est activée dès que le paiement est vu (en général dans l’heure).</p>`;
  return page('Paiement', body);
}

export function thanksPage() {
  return page('Merci', '<h1>🎉 Merci !</h1><p>Le paiement est en cours de vérification par PayPal. L’offre s’active toute seule dans quelques instants : regarde <b>/serveur</b> › Offre du serveur.</p><p><a class="bouton" href="/">Retour au site</a></p>');
}

function page(title, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · AI Vercel</title>
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07060d;color:#e9e3ff;font:16px/1.5 system-ui,sans-serif;padding:24px}
main{max-width:560px;padding:32px;border-radius:18px;background:#120d1c;box-shadow:0 0 0 1px #5ff0ff66,0 0 40px #5ff0ff22}
h1{margin:0 0 12px;font-size:26px}code{background:#1f1830;padding:2px 6px;border-radius:6px}
button,.bouton{display:inline-block;margin-top:12px;background:#ffc439;color:#111;border:0;border-radius:999px;padding:12px 22px;font-weight:700;font-size:16px;cursor:pointer;text-decoration:none}
.petit{color:#a9b0c0;font-size:14px}</style></head><body><main>${body}</main>
${body.includes('id="pp"') ? '<script>setTimeout(function(){document.getElementById("pp").submit()},1200)</script>' : ''}</body></html>`;
}

async function payments() {
  return (await load('paiements', {}).catch(() => ({}))) ?? {};
}

/**
 * Notification de PayPal (IPN). On renvoie le message tel quel à PayPal, qui répond VERIFIED
 * seulement s'il vient vraiment de lui. Ensuite : bon destinataire, bon montant, en euros, pas déjà vu.
 */
export async function handleIpn(rawBody) {
  const verify = await fetch(IPN_VERIFY, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AI-Vercel-IPN' }, body: `cmd=_notify-validate&${rawBody}` })
    .then((r) => r.text()).catch(() => 'ERREUR');
  const p = new URLSearchParams(rawBody);
  if (verify.trim() !== 'VERIFIED') return { ok: false, why: `PayPal ne confirme pas (${verify.trim().slice(0, 20)})` };
  if (p.get('payment_status') !== 'Completed') return { ok: false, why: `statut ${p.get('payment_status')}` };
  if (!PAYPAL_EMAIL || (p.get('receiver_email') ?? '').toLowerCase() !== PAYPAL_EMAIL.toLowerCase()) return { ok: false, why: 'mauvais destinataire' };
  const [guildId, plan] = String(p.get('custom') ?? '').split('|');
  if (!ID.test(guildId) || !PRICES[plan]) return { ok: false, why: 'serveur ou offre inconnus' };
  if (p.get('mc_currency') !== 'EUR' || Number(p.get('mc_gross')) + 0.001 < Number(PRICES[plan])) return { ok: false, why: 'montant incorrect' };
  const all = await payments();
  const txn = p.get('txn_id');
  if (!txn || all[txn]) return { ok: false, why: 'paiement déjà traité' };
  all[txn] = { guildId, plan, amount: p.get('mc_gross'), payer: p.get('payer_email') ?? null, at: Date.now() };
  save('paiements', all);
  const result = setPlan(guildId, plan, DAYS);
  console.log(`[paypal] ${guildId} : ${plan} activé ${DAYS} jours (${p.get('mc_gross')} €)`);
  await rewardSponsor(guildId).catch(() => {});
  const guild = client?.guilds.cache.get(guildId);
  const owner = await guild?.fetchOwner().catch(() => null);
  await owner?.send(`✅ Paiement reçu, merci ! **${PLANS[plan].emoji} ${PLANS[plan].label}** est actif sur **${guild?.name ?? guildId}** jusqu’au ${new Date(result.until).toLocaleDateString('fr-FR')}.`).catch(() => {});
  const chef = await client?.users.fetch(config.ownerId).catch(() => null);
  await chef?.send(`💶 Nouveau paiement PayPal : ${p.get('mc_gross')} € · ${PLANS[plan].label} · ${guild?.name ?? guildId}`).catch(() => {});
  return { ok: true, plan: result };
}

export async function paymentHistory() {
  return Object.entries(await payments()).map(([txn, x]) => ({ txn, ...x })).sort((a, b) => b.at - a.at);
}
export const paypalMode = () => (PAYPAL_EMAIL ? 'automatique' : `manuel (paypal.me/${PAYPAL_ME})`);
export const paymentLink = (guildId, plan) => `${base()}/payer?serveur=${guildId}&offre=${plan}`;

// ===================== Photo de profil du bot =====================

let avatarCache = { at: 0, png: null };
const FALLBACK_AVATAR = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#5865f2"/><path d="M18 18h7l7 20 7-20h7L36 48h-8z" fill="#fff"/></svg>');
/** La photo de profil d'AI Vercel, servie par le bot lui-même (le site et le tableau de bord l'affichent partout). */
export async function botAvatar() {
  if (avatarCache.png && Date.now() - avatarCache.at < 3_600_000) return { type: 'image/png', body: avatarCache.png };
  const url = client?.user?.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
  const res = url ? await fetch(url).catch(() => null) : null;
  if (res?.ok) {
    avatarCache = { at: Date.now(), png: Buffer.from(await res.arrayBuffer()) };
    return { type: 'image/png', body: avatarCache.png };
  }
  return { type: 'image/svg+xml', body: avatarCache.png ?? FALLBACK_AVATAR };
}

// ===================== Statut public =====================

const startedAt = Date.now();
export function statusJson() {
  const ready = Boolean(client?.isReady());
  return {
    enLigne: ready,
    nom: client?.user?.username ?? 'AI Vercel',
    avatar: client?.user?.displayAvatarURL({ size: 256 }) ?? null,
    latenceMs: ready ? Math.round(client.ws.ping) : null,
    serveurs: client?.guilds.cache.size ?? 0,
    membres: client?.guilds.cache.reduce((n, g) => n + (g.memberCount ?? 0), 0) ?? 0,
    enLigneDepuis: startedAt,
  };
}

export function statusPage() {
  const s = statusJson();
  const uptime = Math.round((Date.now() - s.enLigneDepuis) / 3_600_000);
  return page('Statut', `<h1>${s.enLigne ? '🟢' : '🔴'} ${esc(s.nom)} est ${s.enLigne ? 'en ligne' : 'hors ligne'}</h1>
<p>Latence : <b>${s.latenceMs ?? '—'} ms</b> · Serveurs : <b>${s.serveurs}</b> · Membres : <b>${s.membres.toLocaleString('fr-FR')}</b></p>
<p class="petit">Allumé depuis ${uptime} h · page mise à jour toutes les 30 secondes · <a href="/api/statut" style="color:#5ff0ff">en JSON</a></p>
<script>setTimeout(function(){location.reload()},30000)</script>`);
}
