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
let bot = null;
export function startPremiumSync(client) {
  bot = client;
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

// ===================== Paiement validé à la main sur Discord =====================
// L'appli envoie « j'ai payé » (nom PayPal) : une carte arrive dans #paiement-verif (visible du chef seulement),
// avec toutes les infos. ✅ active le pack 31 jours, ❌ refuse. Rien n'est activé sans ce clic.
const VERIF = '💳・paiement-verif';
let verifP = null;
const verifChannel = () => (verifP ??= findOrCreateVerif().then((c) => c ?? (verifP = null)));
async function findOrCreateVerif() {
  const guild = await bot?.guilds.fetch(HOME_GUILD).catch(() => null);
  if (!guild) return null;
  const { ChannelType, PermissionFlagsBits } = await import('discord.js');
  return guild.channels.cache.find((c) => c.name === VERIF) ?? guild.channels.create({ name: VERIF, type: ChannelType.GuildText, reason: 'Paiements Premium à vérifier',
    permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: config.ownerId, allow: [PermissionFlagsBits.ViewChannel] }, { id: bot.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] }).catch(() => null);
}
export async function requestValidation(compte, pack, paypal, shot) {
  if (!PACKS[pack]) return { status: 400, error: 'Pack inconnu.' };
  const pp = String(paypal ?? '').trim().slice(0, 120);
  if (pp.length < 2) return { status: 400, error: 'Indique le nom ou l’e-mail de ton compte PayPal.' };
  const img = /^data:image\/jpeg;base64,/.test(String(shot ?? '')) ? Buffer.from(String(shot).split(',')[1], 'base64') : null;
  if (!img || img.length > 1_200_000) return { status: 400, error: 'Ajoute la capture d’écran du paiement PayPal.' };
  if (pending.has(compte.id)) return { status: 200, ok: true }; // même demande envoyée deux fois : un seul message
  pending.add(compte.id);
  try { return await postRequest(compte, pack, pp, img); } finally { setTimeout(() => pending.delete(compte.id), 60_000); }
}
const pending = new Set();
async function postRequest(compte, pack, pp, img) {
  const all = (await load('premium-demandes', {})) ?? {};
  if (Object.values(all).filter((d) => d.account === compte.id && d.status === 'attente').length >= 3) return { status: 429, error: 'Tu as déjà des paiements en attente de vérification.' };
  const ch = await verifChannel();
  if (!ch) return { status: 503, error: 'Vérification indisponible pour le moment, réessaie plus tard.' };
  const a = (await findAccount(compte.id)) ?? compte;
  const cur = await premiumOf(a);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
  await ch.send({
    content: `<@${config.ownerId}> nouveau paiement à vérifier`,
    embeds: [{ color: 0xffc439, title: `${PACKS[pack].emoji} ${PACKS[pack].label} · ${PACKS[pack].price.replace('.', ',')} €`, description: 'Vérifie dans PayPal qu’un paiement de ce montant est bien arrivé avec ce nom, puis valide.',
      fields: [
        { name: 'Nom / e-mail PayPal déclaré', value: pp, inline: false },
        { name: 'Compte History', value: `${a.pseudo}\n${a.email ?? '—'}`, inline: true },
        { name: 'Discord lié', value: a.discordId ? `<@${a.discordId}>` : 'non', inline: true },
        { name: 'Premium actuel', value: cur.ia || cur.opti ? ['ia', 'opti'].filter((k) => cur[k]).join(' + ') : 'aucun', inline: true },
        { name: 'Identifiant du compte', value: `\`${a.id}\``, inline: false },
      ], image: { url: 'attachment://paiement.jpg' }, timestamp: new Date().toISOString(), footer: { text: `Demande ${id}` } }],
    files: [{ attachment: img, name: 'paiement.jpg' }],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`prem:ok:${id}`).setLabel('Paiement reçu : activer').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`prem:no:${id}`).setLabel('Refuser').setStyle(ButtonStyle.Danger))],
    allowedMentions: { users: [config.ownerId] },
  });
  all[id] = { account: a.id, pack, paypal: pp, at: Date.now(), status: 'attente' };
  await save('premium-demandes', all);
  return { status: 200, ok: true };
}
export async function onPremiumInteraction(interaction) {
  if (interaction.user.id !== config.ownerId) return interaction.reply({ content: 'Réservé au chef.', ephemeral: true });
  const [, act, id] = interaction.customId.split(':');
  const all = (await load('premium-demandes', {})) ?? {};
  const d = all[id];
  if (!d || d.status !== 'attente') return interaction.reply({ content: 'Demande déjà traitée ou introuvable.', ephemeral: true });
  d.status = act === 'ok' ? 'validé' : 'refusé';
  const row = act === 'ok' ? await grantPack(d.account, d.pack, `manuel-${id}`) : null;
  await save('premium-demandes', all);
  await interaction.update({ content: act === 'ok' ? `✅ Activé jusqu’au ${new Date(row.jusqua).toLocaleDateString('fr-FR')}` : '❌ Refusé', components: [] });
  const a = await findAccount(d.account);
  if (a?.discordId) await (await bot.users.fetch(a.discordId).catch(() => null))?.send(act === 'ok' ? `⭐ Paiement reçu : **${PACKS[d.pack].label}** est actif dans History Launcher. Merci !` : 'Ton paiement Premium n’a pas pu être vérifié. Écris au support dans History Launcher si besoin.').catch(() => {});
}
