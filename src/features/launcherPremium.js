// Premium de History Launcher : packs IA, Opti, ou les deux (thème jaune dans l'appli).
// - Payé avec PayPal (/payer-launcher) : activé tout seul 31 jours (voir payments.js, IPN).
// - Le plus simple : Supabase › launcher_comptes › cocher « premium » (tout, à vie).
// - Ajouté à la main : Supabase › Table editor › « premium » › Insert row
//   (compte = pseudo, e-mail ou identifiant du compte ; pack = ia, opti ou pack ; jusqua vide = à vie).
//   Effet en moins d'une minute, sans mise à jour de l'appli. Supprimer la ligne retire le premium.
import { config } from '../config.js';
import { load, save } from '../storage.js';
import { findAccount, linkedAccounts } from './launcherAccounts.js';
import { premiumUsers } from './limits.js';
import { HOME_GUILD } from './launcherServers.js';

export const PACKS = {
  ia: { label: 'History IA', emoji: '🤖', price: '2.49', gives: ['ia'] },
  opti: { label: 'Opti Pro', emoji: '🚀', price: '2.49', gives: ['opti'] },
  pack: { label: 'Pack Premium', emoji: '⭐', price: '3.99', gives: ['ia', 'opti'] },
};
export const DAYS = 31;
const KEY = 'launcher-premium'; // secours sans Supabase
const SB = config.supabase?.url && config.supabase?.key ? { url: `${config.supabase.url}/rest/v1/premium`, headers: { apikey: config.supabase.key, 'Content-Type': 'application/json', ...(config.supabase.key.startsWith('eyJ') ? { Authorization: `Bearer ${config.supabase.key}` } : {}) } } : null;
const base = () => (config.publicUrl || 'https://vercel-ia.onrender.com').replace(/\/+$/, '');
export const payLink = (pack, compte) => `${base()}/payer-launcher?pack=${pack}${compte ? `&compte=${encodeURIComponent(compte)}` : ''}`;

let cache = { at: 0, rows: [], sb: false };
async function rows() {
  if (Date.now() - cache.at < 30_000) return cache.rows;
  const r = SB ? await fetch(`${SB.url}?select=compte,pack,jusqua,note`, { headers: SB.headers }).catch(() => null) : null;
  const list = r?.ok ? await r.json().catch(() => null) : null;
  // Case « premium » cochée dans la table des comptes (launcher_comptes) : tout le Premium, à vie
  const ticked = SB ? await fetch(`${config.supabase.url}/rest/v1/launcher_comptes?select=id&premium=eq.true`, { headers: SB.headers }).then((x) => (x.ok ? x.json() : [])).catch(() => []) : [];
  if (Array.isArray(list) && Array.isArray(ticked)) list.push(...ticked.map((c) => ({ compte: c.id, pack: 'pack', jusqua: null })));
  cache = { at: Date.now(), rows: Array.isArray(list) ? list : ((await load(KEY, [])) ?? []), sb: Array.isArray(list) };
  return cache.rows;
}

/** Packs actifs d'un compte : { ia, opti, until: { ia, opti } } (until null = à vie). Le chef a tout. */
export async function premiumOf(compte) {
  const a = (await findAccount(compte.id)) ?? compte;
  const out = { ia: false, opti: false, until: { ia: undefined, opti: undefined } };
  if (a.discordId && a.discordId === config.ownerId) return { ia: true, opti: true, until: { ia: null, opti: null } };
  const keys = new Set([a.id, a.pseudo, a.email, a.discordId].filter(Boolean).map((k) => String(k).toLowerCase()));
  for (const r of await rows()) {
    if (!keys.has(String(r.compte ?? '').trim().toLowerCase()) || !PACKS[r.pack]) continue;
    const until = r.jusqua ? Date.parse(r.jusqua) : null;
    if (until !== null && !(until > Date.now())) continue;
    for (const g of PACKS[r.pack].gives) {
      out[g] = true;
      out.until[g] = out.until[g] === null || until === null ? null : Math.max(out.until[g] ?? 0, until);
    }
  }
  return out;
}

/** Paiement PayPal vérifié : ajoute (ou prolonge) le pack de 31 jours. */
export async function grantPack(accountId, pack, txn) {
  const cur = await premiumOf({ id: accountId });
  const ends = PACKS[pack].gives.map((g) => cur.until[g]).filter((u) => typeof u === 'number');
  const from = ends.length === PACKS[pack].gives.length ? Math.max(Date.now(), Math.min(...ends)) : Date.now();
  const row = { compte: accountId, pack, jusqua: new Date(from + DAYS * 86_400_000).toISOString(), note: `PayPal ${txn}` };
  await rows();
  if (cache.sb) await fetch(SB.url, { method: 'POST', headers: SB.headers, body: JSON.stringify(row) });
  else await save(KEY, [...((await load(KEY, [])) ?? []), row]);
  cache.at = 0;
  return row;
}

/** Remboursement ou litige PayPal : la ligne de ce paiement est retirée. */
export async function revokePack(txn) {
  await rows();
  if (cache.sb) await fetch(`${SB.url}?note=eq.${encodeURIComponent(`PayPal ${txn}`)}`, { method: 'DELETE', headers: SB.headers });
  else await save(KEY, ((await load(KEY, [])) ?? []).filter((r) => r.note !== `PayPal ${txn}`));
  cache.at = 0;
}

/** Compte du lien de paiement : identifiant (depuis l'appli) ou pseudo / e-mail (depuis le site). */
export const accountForPayment = (q) => findAccount(q);

// ===================== Avantages sur le bot History IA =====================
// Compte Premium lié à Discord (Paramètres › Compte) : rôle « ⭐ Premium » doré sur le serveur History,
// IA du bot sans attente et 4× plus d'images par jour, rappel en MP 3 jours avant la fin.
const ROLE = '⭐ Premium';
export function startPremiumSync(client) {
  const tick = async () => {
    const ids = new Map();
    for (const a of await linkedAccounts()) {
      const p = await premiumOf(a);
      if (p.ia || p.opti) ids.set(a.discordId, p);
    }
    premiumUsers.clear();
    for (const id of ids.keys()) premiumUsers.add(id);
    const guild = await client.guilds.fetch(HOME_GUILD).catch(() => null);
    const role = guild && (guild.roles.cache.find((r) => r.name === ROLE) ?? await guild.roles.create({ name: ROLE, color: 0xffc439, hoist: true, reason: 'History Premium' }).catch(() => null));
    if (role) {
      for (const id of ids.keys()) {
        const m = await guild.members.fetch(id).catch(() => null);
        if (m && !m.roles.cache.has(role.id)) await m.roles.add(role, 'History Premium').catch(() => {});
      }
      for (const m of role.members.values()) if (!ids.has(m.id)) await m.roles.remove(role, 'Premium terminé').catch(() => {});
    }
    // Rappel en MP 3 jours avant la fin (une fois par date de fin ; pas pour les Premium à vie)
    const sent = (await load('premium-rappels', {})) ?? {};
    for (const [id, p] of ids) {
      const ends = ['ia', 'opti'].filter((k) => p[k]).map((k) => p.until[k]);
      if (ends.includes(null)) continue;
      const end = Math.max(...ends);
      if (end - Date.now() > 3 * 86_400_000 || sent[id] === end) continue;
      sent[id] = end;
      const u = await client.users.fetch(id).catch(() => null);
      await u?.send(`⭐ Ton History Premium se termine le **${new Date(end).toLocaleDateString('fr-FR')}**. Pour le garder : ⭐ Premium dans History Launcher, ou ${payLink(p.ia && p.opti ? 'pack' : p.ia ? 'ia' : 'opti', null)}`).catch(() => {});
    }
    await save('premium-rappels', sent);
  };
  const run = () => tick().catch((err) => console.warn('[premium]', err.message));
  run();
  setInterval(run, 5 * 60_000).unref?.();
}
