// Économie du serveur, façon pirates : les pièces d'or 🪙 (une bourse par serveur, séparée des jetons du casino).
//
// GAGNER (lentement, exprès) : 200 pièces par niveau, la récompense du jour, les quêtes, les jeux gagnés,
// une suggestion acceptée, les dons (taxés 5 %). Voir aussi treasury.js (banque, quêtes, marché, enchères…).
//
// DÉPENSER : le comptoir du capitaine. Tout ce qu'on achète va dans sa CALE (inventaire) : on l'utilise
// quand on veut, on peut l'offrir ou le revendre au marché. Pas de rôles à acheter, sauf le rôle personnalisé.
// - Chaque jour, un article est en promo (-30 %). Les objets rares ont un stock limité par mois.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits as P, StringSelectMenuBuilder } from 'discord.js';
import { load, save } from '../storage.js';
import { art, buildModal, field as f, readModal } from '../panels/ui.js';
import { cfg } from './guildConfig.js';
import { COLORS } from './tickets.js';

const KEY = 'tresor';
const META = '__meta'; // données du serveur (coffre commun, stocks, marché…) à côté des bourses
const PRIVATE = { flags: MessageFlags.Ephemeral };
const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const LEVEL_REWARD = 200;
export const TAX = 0.05;
export const GOLD = 0xd9a441;
export const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
export const dayKey = (at = Date.now()) => new Date(at).toISOString().slice(0, 10);
const monthKey = () => new Date().toISOString().slice(0, 7);

let store = null; // { [guildId]: { [userId]: bourse }, __meta: { [guildId]: {...} } }
let dirty = false;
export async function data() {
  store ??= (await load(KEY, {}).catch(() => ({}))) ?? {};
  store[META] ??= {};
  return store;
}
export function purse(guildId, userId) {
  const g = (store[guildId] ??= {});
  const p = (g[userId] ??= {});
  // Champs ajoutés au fil des versions : on complète les anciennes bourses
  return Object.assign(p, {
    gold: p.gold ?? 0, bank: p.bank ?? 0, inv: p.inv ?? {}, history: p.history ?? [], badges: p.badges ?? [], cardTheme: p.cardTheme ?? null,
    immuneUntil: p.immuneUntil ?? 0, xpBoostUntil: p.xpBoostUntil ?? 0, dailyBoostUntil: p.dailyBoostUntil ?? 0, lastRemoval: p.lastRemoval ?? 0,
    chests: p.chests ?? { day: '', count: 0 }, earned: p.earned ?? 0, spent: p.spent ?? 0, lastRob: p.lastRob ?? 0, robbedAt: p.robbedAt ?? 0,
    wins: p.wins ?? { day: '', count: 0 }, quests: p.quests ?? null, casino: p.casino ?? { day: '', bet: 0 },
  });
}
export function meta(guildId) {
  const m = (store[META][guildId] ??= {});
  return Object.assign(m, { chest: m.chest ?? 0, stock: m.stock ?? { month: '', sold: {} }, market: m.market ?? [], auctions: m.auctions ?? [], lottery: m.lottery ?? null, lastTaxWeek: m.lastTaxWeek ?? '', lastBoardDay: m.lastBoardDay ?? '' });
}
export const members = (guildId) => Object.entries(store?.[guildId] ?? {});
setInterval(() => { if (dirty) { dirty = false; save(KEY, store); } }, 20_000).unref();
export const persist = () => { dirty = true; };

export async function goldOf(guildId, userId) {
  await data();
  return purse(guildId, userId).gold;
}
/** Ajoute (ou retire, si négatif) des pièces, avec la raison (historique). Renvoie le nouveau solde. */
export async function addGold(guildId, userId, amount, reason = null) {
  await data();
  const p = purse(guildId, userId);
  const n = Math.round(amount);
  p.gold = Math.max(0, p.gold + n);
  if (n > 0) p.earned += n;
  else p.spent -= n;
  if (n) {
    p.history.unshift({ at: Date.now(), n, why: reason ?? (n > 0 ? 'Gain' : 'Dépense') });
    p.history.length = Math.min(p.history.length, 40);
  }
  persist();
  return p.gold;
}
/** Le coffre commun du serveur (taxes, amendes) : redistribué par le staff lors des événements. */
export async function addToChest(guildId, amount) {
  await data();
  meta(guildId).chest += Math.max(0, Math.round(amount));
  persist();
}
export async function richest(guildId, n = 10) {
  await data();
  return members(guildId).map(([userId]) => ({ userId, gold: purse(guildId, userId).gold })).sort((a, b) => b.gold - a.gold).slice(0, n);
}

// Effets en cours (lus par les niveaux, la récompense du jour et la sécurité)
export function isImmune(guildId, userId) {
  return (store?.[guildId]?.[userId]?.immuneUntil ?? 0) > Date.now();
}
export function xpMultiplier(guildId, userId) {
  return (store?.[guildId]?.[userId]?.xpBoostUntil ?? 0) > Date.now() ? 2 : 1;
}
export function dailyMultiplier(guildId, userId) {
  return (store?.[guildId]?.[userId]?.dailyBoostUntil ?? 0) > Date.now() ? 2 : 1;
}
/** Fond de carte et badges achetés (affichés sur la carte de profil). */
export function cosmeticsOf(guildId, userId) {
  const p = store?.[guildId]?.[userId];
  return { theme: p?.cardTheme ?? null, badges: p?.badges ?? [] };
}
export async function effectsOf(guildId, userId) {
  await data();
  const p = purse(guildId, userId);
  const now = Date.now();
  return [
    p.immuneUntil > now ? `🛡️ Immunité jusqu’à <t:${Math.round(p.immuneUntil / 1000)}:t>` : null,
    p.xpBoostUntil > now ? `⚡ XP ×2 jusqu’à <t:${Math.round(p.xpBoostUntil / 1000)}:t>` : null,
    p.dailyBoostUntil > now ? `🎁 Récompense doublée jusqu’au <t:${Math.round(p.dailyBoostUntil / 1000)}:d>` : null,
  ].filter(Boolean);
}

// ===================== Le comptoir du capitaine =====================

const CHEST = [[200, 40], [500, 30], [1000, 20], [2000, 8], [5000, 2]]; // gain moyen ≈ 690 pour 750 : le coffre fait un peu perdre
export const THEMES = { ocean: { name: 'Océan', colors: ['#cfe8e4', '#7fb7b0', '#1f5f5a'] }, sang: { name: 'Pavillon rouge', colors: ['#f1d2c8', '#c77b6b', '#6b1a12'] }, nuit: { name: 'Nuit sans lune', colors: ['#d8d3e8', '#8a82ad', '#2a2342'] } };

export const ITEMS = {
  immunite: { emoji: '🛡️', name: 'Immunité 24 h', price: 6000, desc: 'Les exclusions automatiques du bot (anti-spam, liens, arnaques) ne te touchent pas pendant 24 h. Le staff peut toujours sanctionner.' },
  xp: { emoji: '⚡', name: 'XP doublée 24 h', price: 2500, desc: 'Chaque message et chaque minute de vocal rapportent deux fois plus d’XP pendant 24 h.' },
  quotidien: { emoji: '🎁', name: 'Récompense doublée 7 jours', price: 3000, desc: 'Ta récompense du jour vaut double pendant 7 jours.' },
  pardon: { emoji: '🧽', name: 'Effacer un avertissement', price: 5000, desc: 'Retire ton avertissement le plus récent. Une fois par semaine au maximum.' },
  pseudo: { emoji: '✏️', name: 'Changer de pseudo', price: 1000, desc: 'Le bot change ton pseudo sur le serveur (32 caractères max).' },
  coffre: { emoji: '📦', name: 'Coffre au trésor', price: 750, desc: 'Au hasard : 200, 500, 1 000, 2 000 ou 5 000 pièces. Trois coffres ouverts par jour.' },
  'fond-ocean': { emoji: '🌊', name: 'Carte de profil : Océan', price: 4000, desc: 'Ta carte de niveau et de profil prend les couleurs de l’océan.', cosmetic: true },
  'fond-sang': { emoji: '🏴‍☠️', name: 'Carte de profil : Pavillon rouge', price: 4000, desc: 'Ta carte prend le rouge du pavillon pirate.', cosmetic: true },
  'fond-nuit': { emoji: '🌙', name: 'Carte de profil : Nuit sans lune', price: 4000, desc: 'Ta carte prend les couleurs de la nuit.', cosmetic: true },
  carte: { emoji: '🗺️', name: 'Carte au trésor (rare)', price: 6000, stock: 10, desc: 'Donne 3 coffres au trésor. Seulement 10 par mois sur le serveur.' },
  perroquet: { emoji: '🦜', name: 'Badge Perroquet (rare)', price: 8000, stock: 10, desc: 'Un badge PERROQUET sur ta carte de profil, pour toujours. 10 par mois.', cosmetic: true },
  kraken: { emoji: '🐙', name: 'Badge Kraken (légendaire)', price: 15000, stock: 5, desc: 'Le badge KRAKEN sur ta carte, pour toujours. 5 par mois seulement.', cosmetic: true },
};

/** L'article en promo aujourd'hui (-30 %), le même pour tout le serveur. */
export function promoOf(guildId, day = dayKey()) {
  const keys = Object.keys(ITEMS).filter((k) => !ITEMS[k].stock && itemOn(guildId, k));
  let h = 0;
  for (const c of `${guildId}${day}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return keys[h % keys.length];
}
// Réglages de la boutique par serveur (tableau de bord) : prix changés, articles retirés
export const shopOverrides = (guildId) => cfg(guildId, 'shop.overrides') ?? { prices: {}, disabled: [] };
export const basePrice = (guildId, key) => Number(shopOverrides(guildId).prices?.[key]) || ITEMS[key].price;
export const itemOn = (guildId, key) => !(shopOverrides(guildId).disabled ?? []).includes(key);
export const shopKeys = (guildId) => Object.keys(ITEMS).filter((k) => itemOn(guildId, k));
export const priceOf = (guildId, key) => Math.round(basePrice(guildId, key) * (promoOf(guildId) === key ? 0.7 : 1));
function stockLeft(guildId, key) {
  const m = meta(guildId);
  if (m.stock.month !== monthKey()) m.stock = { month: monthKey(), sold: {} };
  return ITEMS[key].stock ? ITEMS[key].stock - (m.stock.sold[key] ?? 0) : Infinity;
}

export async function shopMessage(guild, userId) {
  await data();
  const p = purse(guild.id, userId);
  const custom = cfg(guild.id, 'shop.customRolePrice') || 20000;
  const promo = promoOf(guild.id);
  const effects = await effectsOf(guild.id, userId);
  const line = (key) => {
    const i = ITEMS[key];
    const left = stockLeft(guild.id, key);
    return { name: `${i.emoji} ${i.name} · 🪙 ${fmt(priceOf(guild.id, key))}${key === promo ? ` ~~${fmt(basePrice(guild.id, key))}~~ 🔥 PROMO` : ''}${i.stock ? ` · ${left > 0 ? `reste ${left}` : 'épuisé ce mois'}` : ''}`, value: i.desc };
  };
  const embed = new EmbedBuilder().setColor(GOLD).setTitle('🏴‍☠️ Le comptoir du capitaine')
    .setDescription([
      `Ta bourse : **🪙 ${fmt(p.gold)} pièces d’or**${p.bank ? ` · à la banque : 🏦 ${fmt(p.bank)}` : ''}`,
      `🔥 Promo du jour : **${ITEMS[promo].emoji} ${ITEMS[promo].name}** à -30 %`,
      '-# Tout ce que tu achètes va dans ta **cale** : utilise-le quand tu veux, offre-le ou revends-le au marché.',
      effects.length ? `\n**En cours**\n${effects.join('\n')}` : null,
    ].filter(Boolean).join('\n'))
    .addFields(...shopKeys(guild.id).map(line), { name: `🎨 Rôle personnalisé · 🪙 ${fmt(custom)}`, value: 'Ton nom et ta couleur, validés par le staff. Remboursé s’il refuse.' })
    .setFooter({ text: 'Les pièces ne s’achètent pas avec de l’argent · 200 pièces par niveau' });
  const gif = art('panneaux', 'boutique');
  embed.setImage(gif.url);
  return {
    embeds: [embed],
    files: gif.files,
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sh:buy').setPlaceholder('🪙 Acheter un article')
        .addOptions(shopKeys(guild.id).map((value) => [value, ITEMS[value]]).map(([value, i]) => ({ label: `${i.name} · ${fmt(priceOf(guild.id, value))}`.slice(0, 100), value, emoji: i.emoji, description: i.desc.slice(0, 100) })))),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sh:hold').setLabel('Ma cale').setEmoji('🧰').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('sh:custom').setLabel(`Rôle perso · ${fmt(custom)}`).setEmoji('🎨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('sh:gift').setLabel('Donner des pièces').setEmoji('🤝').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

/** La cale : ce qu'on possède, à utiliser, offrir ou revendre. */
export async function holdMessage(guild, userId) {
  await data();
  const p = purse(guild.id, userId);
  const owned = Object.entries(p.inv).filter(([k, n]) => n > 0 && ITEMS[k]);
  const embed = new EmbedBuilder().setColor(GOLD).setTitle('🧰 Ta cale')
    .setDescription(owned.length ? owned.map(([k, n]) => `${ITEMS[k].emoji} **${ITEMS[k].name}** × ${n}`).join('\n') : 'Ta cale est vide. Passe au comptoir du capitaine (**/serveur** › Boutique).')
    .addFields({ name: 'Bourse', value: `🪙 ${fmt(p.gold)} · 🏦 ${fmt(p.bank)}`, inline: true }, { name: 'Badges', value: p.badges.length ? p.badges.join(' · ') : '—', inline: true });
  if (!owned.length) return { embeds: [embed] };
  const opts = owned.map(([k, n]) => ({ label: `${ITEMS[k].name} (× ${n})`.slice(0, 100), value: k, emoji: ITEMS[k].emoji }));
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sh:use').setPlaceholder('✨ Utiliser un objet').addOptions(opts)),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sh:giftitem').setPlaceholder('🎁 Offrir un objet à un membre').addOptions(opts)),
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tr:sell').setPlaceholder('⚖️ Revendre au marché').addOptions(opts)),
    ],
  };
}

const CUSTOM_FIELDS = () => [
  f.text('nom', 'Nom du rôle', { req: true, max: 40, ph: 'Ex : 👑 Le Boss' }),
  f.choice('couleur', 'Couleur', Object.entries(COLORS).map(([value, c]) => ({ label: c.label, value, emoji: c.emoji }))),
  f.text('hex', 'Ou une couleur précise (#RRGGBB)', { max: 7, ph: '#ff5fd2' }),
];
const NICK_FIELDS = () => [f.text('pseudo', 'Nouveau pseudo', { req: true, max: 32 })];
const GIFT_FIELDS = () => [f.user('membre', 'À qui', { req: true }), f.int('montant', 'Combien de pièces (50 minimum)', { req: true, min: 50, top: 1_000_000 })];
const GIFT_ITEM_FIELDS = () => [f.user('membre', 'À qui', { req: true })];

export const ok = (text) => ({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setDescription(text)], ...PRIVATE });
export const ko = (text) => ({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${text}`)], ...PRIVATE });

/** Donne un objet (achat, enchère, marché, cadeau). */
export async function giveItem(guildId, userId, key, n = 1) {
  await data();
  const p = purse(guildId, userId);
  p.inv[key] = (p.inv[key] ?? 0) + n;
  persist();
}

/** Utilise un objet de la cale. Renvoie { text } ou { error }. (Le pseudo passe par une fenêtre.) */
async function useItem(interaction, key) {
  const guild = interaction.guild;
  const p = purse(guild.id, interaction.user.id);
  if (!(p.inv[key] > 0)) return { error: 'Tu n’as pas cet objet dans ta cale.' };
  const now = Date.now();
  let text;
  if (key === 'immunite') {
    if (p.immuneUntil > now) return { error: 'Ton immunité est déjà active.' };
    p.immuneUntil = now + DAY;
    text = 'Tu es immunisé contre les exclusions automatiques pendant **24 h**.';
  } else if (key === 'xp') {
    if (p.xpBoostUntil > now) return { error: 'Ton XP doublée est déjà active.' };
    p.xpBoostUntil = now + DAY;
    text = 'Ton XP est **doublée pendant 24 h**.';
  } else if (key === 'quotidien') {
    if (p.dailyBoostUntil > now) return { error: 'C’est déjà actif.' };
    p.dailyBoostUntil = now + 7 * DAY;
    text = 'Ta récompense du jour est **doublée pendant 7 jours**.';
  } else if (key === 'pardon') {
    if (now - p.lastRemoval < 7 * DAY) return { error: `Une fois par semaine : réessaie <t:${Math.round((p.lastRemoval + 7 * DAY) / 1000)}:R>.` };
    const all = (await load('warnings', {}).catch(() => ({}))) ?? {};
    const list = all[guild.id]?.[interaction.user.id];
    if (!list?.length) return { error: 'Tu n’as aucun avertissement à effacer.' };
    list.pop();
    save('warnings', all);
    p.lastRemoval = now;
    text = `Ton dernier avertissement est effacé. Il t’en reste **${list.length}**.`;
  } else if (key === 'coffre') {
    if (p.chests.day !== dayKey()) p.chests = { day: dayKey(), count: 0 };
    if (p.chests.count >= 3) return { error: 'Trois coffres par jour maximum, reviens demain.' };
    p.chests.count += 1;
    p.inv[key] -= 1;
    let roll = Math.random() * 100;
    const [won] = CHEST.find(([, weight]) => (roll -= weight) < 0) ?? CHEST[0];
    await addGold(guild.id, interaction.user.id, won, 'Coffre au trésor');
    return { text: `Le coffre s’ouvre… **🪙 ${fmt(won)} pièces** ${won >= 1000 ? '💰' : ''}\nCoffres ouverts aujourd’hui : ${p.chests.count}/3` };
  } else if (key === 'carte') {
    p.inv.coffre = (p.inv.coffre ?? 0) + 3;
    text = 'La carte mène à **3 coffres au trésor**, rangés dans ta cale.';
  } else if (key.startsWith('fond-')) {
    p.cardTheme = key.slice(5);
    text = `Ta carte de profil prend le style **${THEMES[p.cardTheme].name}**.`;
  } else if (key === 'perroquet' || key === 'kraken') {
    const badge = key === 'kraken' ? 'KRAKEN' : 'PERROQUET';
    if (p.badges.includes(badge)) return { error: 'Tu as déjà ce badge.' };
    p.badges.push(badge);
    text = `Le badge **${badge}** brille maintenant sur ta carte de profil.`;
  } else {
    return { error: 'Objet inconnu.' };
  }
  p.inv[key] -= 1;
  persist();
  return { text };
}

export const isShopComponent = (interaction) => /^sh:/.test(interaction.customId ?? '');

export async function handleShopComponent(client, interaction) {
  const [, what, ref] = interaction.customId.split(':');
  const guild = interaction.guild;
  await data();
  const p = purse(guild.id, interaction.user.id);

  if (what === 'buy') {
    const key = interaction.values[0];
    const item = ITEMS[key];
    if (!item) return interaction.reply(ko('Cet article n’existe plus.'));
    if (!itemOn(guild.id, key)) return interaction.reply(ko('Cet article n’est plus vendu sur ce serveur.'));
    const price = priceOf(guild.id, key);
    if (stockLeft(guild.id, key) <= 0) return interaction.reply(ko('Épuisé pour ce mois-ci, reviens le mois prochain.'));
    if (p.gold < price) return interaction.reply(ko(`Il te faut 🪙 ${fmt(price)} (tu as 🪙 ${fmt(p.gold)}).`));
    await addGold(guild.id, interaction.user.id, -price, `Achat : ${item.name}`);
    await giveItem(guild.id, interaction.user.id, key);
    if (item.stock) meta(guild.id).stock.sold[key] = (meta(guild.id).stock.sold[key] ?? 0) + 1;
    persist();
    return interaction.reply({
      ...ok(`${item.emoji} **${item.name}** est dans ta cale. Bourse : 🪙 ${fmt(p.gold)}.`),
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sh:usenow:${key}`).setLabel('Utiliser maintenant').setEmoji('✨').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('sh:hold').setLabel('Ma cale').setEmoji('🧰').setStyle(ButtonStyle.Secondary),
      )],
    });
  }

  if (what === 'hold') return interaction.reply({ ...(await holdMessage(guild, interaction.user.id)), ...PRIVATE });

  if (what === 'use' || what === 'usenow') {
    const key = what === 'use' ? interaction.values[0] : ref;
    if (key === 'pseudo') {
      if (!(p.inv.pseudo > 0)) return interaction.reply(ko('Tu n’as pas cet objet dans ta cale.'));
      return interaction.showModal(buildModal('sh:nick', '✏️ Nouveau pseudo', NICK_FIELDS()));
    }
    const r = await useItem(interaction, key);
    if (r.error) return interaction.reply(ko(r.error));
    return interaction.reply(ok(`${ITEMS[key].emoji} ${r.text}`));
  }

  if (what === 'nick') {
    const { values, error } = await readModal(interaction, NICK_FIELDS());
    if (error) return interaction.reply(ko(error));
    if (!(p.inv.pseudo > 0)) return interaction.reply(ko('Tu n’as plus cet objet.'));
    const done = await interaction.member.setNickname(values.pseudo.slice(0, 32), 'Boutique : changement de pseudo').then(() => true, () => false);
    if (!done) return interaction.reply(ko('Je ne peux pas changer ton pseudo (ton rôle est au-dessus du mien, ou tu es le propriétaire). L’objet reste dans ta cale.'));
    p.inv.pseudo -= 1;
    persist();
    return interaction.reply(ok(`✏️ Ton pseudo est maintenant **${values.pseudo}**.`));
  }

  if (what === 'giftitem') {
    const key = interaction.values[0];
    return interaction.showModal(buildModal(`sh:giftitemsend:${key}`, `🎁 Offrir : ${ITEMS[key]?.name ?? 'objet'}`.slice(0, 45), GIFT_ITEM_FIELDS()));
  }
  if (what === 'giftitemsend') {
    const { values, error } = await readModal(interaction, GIFT_ITEM_FIELDS());
    if (error) return interaction.reply(ko(error));
    const to = values.membre.user;
    if (to.bot || to.id === interaction.user.id) return interaction.reply(ko('Choisis un autre membre.'));
    if (!(p.inv[ref] > 0)) return interaction.reply(ko('Tu n’as plus cet objet.'));
    p.inv[ref] -= 1;
    await giveItem(guild.id, to.id, ref);
    await to.send(`🎁 ${interaction.user.username} t’a offert **${ITEMS[ref].emoji} ${ITEMS[ref].name}** sur **${guild.name}** (dans ta cale : /serveur › Ma cale).`).catch(() => {});
    return interaction.reply(ok(`🎁 ${to} reçoit **${ITEMS[ref].emoji} ${ITEMS[ref].name}**.`));
  }

  if (what === 'gift') return interaction.showModal(buildModal('sh:giftsend', '🤝 Donner des pièces', GIFT_FIELDS()));
  if (what === 'giftsend') {
    const { values, error } = await readModal(interaction, GIFT_FIELDS());
    if (error) return interaction.reply(ko(error));
    const to = values.membre.user;
    if (to.bot || to.id === interaction.user.id) return interaction.reply(ko('Choisis un autre membre (pas un bot, pas toi).'));
    if (p.gold < values.montant) return interaction.reply(ko(`Tu n’as que 🪙 ${fmt(p.gold)}.`));
    const received = Math.floor(values.montant * (1 - TAX));
    await addGold(guild.id, interaction.user.id, -values.montant, `Don à ${to.username}`);
    await addGold(guild.id, to.id, received, `Don de ${interaction.user.username}`);
    await addToChest(guild.id, values.montant - received);
    await to.send(`🤝 ${interaction.user.username} t’a donné **🪙 ${fmt(received)} pièces d’or** sur **${guild.name}**.`).catch(() => {});
    return interaction.reply(ok(`🤝 ${to} reçoit **🪙 ${fmt(received)}** (taxe de 5 % versée au coffre commun : 🪙 ${fmt(values.montant - received)}). Bourse : 🪙 ${fmt(p.gold)}.`));
  }

  if (what === 'custom') return interaction.showModal(buildModal('sh:customsend', '🎨 Mon rôle personnalisé', CUSTOM_FIELDS()));
  if (what === 'customsend') {
    const { values, error } = await readModal(interaction, CUSTOM_FIELDS());
    if (error) return interaction.reply(ko(error));
    const price = cfg(guild.id, 'shop.customRolePrice') || 20000;
    const hex = /^#?[0-9a-f]{6}$/i.test(values.hex ?? '') ? parseInt(values.hex.replace('#', ''), 16) : COLORS[values.couleur]?.value ?? COLORS.violet.value;
    const channel = guild.channels.cache.get(cfg(guild.id, 'shop.requestsChannelId') ?? '');
    if (!channel?.isTextBased?.()) return interaction.reply(ko('Le salon des demandes n’est pas réglé (tableau de bord › Boutique).'));
    if (p.gold < price) return interaction.reply(ko(`Il te faut 🪙 ${fmt(price)} (tu as 🪙 ${fmt(p.gold)}).`));
    await addGold(guild.id, interaction.user.id, -price, 'Rôle personnalisé'); // remboursé si le staff refuse
    const id = Math.random().toString(36).slice(2, 10);
    const all = (await load('demandes-roles', {}).catch(() => ({}))) ?? {};
    all[id] = { guildId: guild.id, userId: interaction.user.id, name: values.nom, color: hex, price, at: Date.now(), currency: 'or' };
    save('demandes-roles', all);
    await channel.send({
      embeds: [new EmbedBuilder().setColor(hex).setTitle('🎨 Demande de rôle personnalisé')
        .setDescription(`${interaction.user} veut le rôle **${values.nom}**`)
        .addFields({ name: 'Couleur', value: `#${hex.toString(16).padStart(6, '0')} (couleur de cet embed)`, inline: true }, { name: 'Payé', value: `🪙 ${fmt(price)} pièces d’or`, inline: true })
        .setThumbnail(interaction.user.displayAvatarURL({ size: 64 }))],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sh:accept:${id}`).setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sh:refuse:${id}`).setLabel('Refuser (remboursé)').setEmoji('✖️').setStyle(ButtonStyle.Danger),
      )],
      allowedMentions: { parse: [] },
    });
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(hex).setDescription(`📨 Demande envoyée au staff : **${values.nom}**. Tu seras prévenu en MP (remboursé si c’est refusé).`)], ...PRIVATE });
  }

  if (what === 'accept' || what === 'refuse') {
    if (!interaction.memberPermissions?.has(P.ManageRoles)) return interaction.reply({ content: '🔒 Il faut pouvoir gérer les rôles.', ...PRIVATE });
    const all = (await load('demandes-roles', {}).catch(() => ({}))) ?? {};
    const req = all[ref];
    if (!req) return interaction.reply({ content: 'Cette demande a déjà été traitée.', ...PRIVATE });
    delete all[ref];
    save('demandes-roles', all);
    const user = await client.users.fetch(req.userId).catch(() => null);
    if (what === 'refuse') {
      await addGold(req.guildId, req.userId, req.price, 'Rôle perso refusé (remboursé)');
      await user?.send(`✖️ Ta demande de rôle **${req.name}** sur **${guild.name}** a été refusée. Tes 🪙 ${fmt(req.price)} pièces te sont rendues.`).catch(() => {});
      return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `Refusé par ${interaction.user.username} · remboursé` })], components: [] });
    }
    const me = guild.members.me;
    const role = await guild.roles.create({ name: req.name, color: req.color, position: Math.max(1, me.roles.highest.position - 1), reason: `Rôle personnalisé accepté par ${interaction.user.username}` }).catch(() => null);
    if (!role) return interaction.reply({ content: '❌ Impossible de créer le rôle (permission « Gérer les rôles » ?).', ...PRIVATE });
    const member = await guild.members.fetch(req.userId).catch(() => null);
    await member?.roles.add(role).catch(() => {});
    await user?.send(`✅ Ton rôle **${req.name}** sur **${guild.name}** est accepté et t’a été donné 🎉`).catch(() => {});
    return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `Accepté par ${interaction.user.username}` })], components: [] });
  }
  return undefined;
}

// ===================== Administration (tableau de bord du chef) =====================

/** Vue d'ensemble d'un serveur : or en circulation, classement, effets en cours, achats. */
export async function economyOverview(guildId) {
  await data();
  const all = members(guildId).map(([userId]) => [userId, purse(guildId, userId)]);
  const now = Date.now();
  return {
    total: all.reduce((n, [, p]) => n + p.gold + p.bank, 0),
    holders: all.filter(([, p]) => p.gold > 0).length,
    earned: all.reduce((n, [, p]) => n + p.earned, 0),
    spent: all.reduce((n, [, p]) => n + p.spent, 0),
    chest: meta(guildId).chest,
    series: meta(guildId).series ?? [],
    top: all.sort((a, b) => b[1].gold - a[1].gold).slice(0, 25).map(([userId, p]) => ({
      userId, gold: p.gold, bank: p.bank, earned: p.earned, spent: p.spent,
      effects: [p.immuneUntil > now ? 'immunite' : null, p.xpBoostUntil > now ? 'xp' : null, p.dailyBoostUntil > now ? 'quotidien' : null].filter(Boolean),
    })),
    items: Object.entries(ITEMS).map(([key, i]) => ({ key, name: i.name, emoji: i.emoji, price: basePrice(guildId, key), defaultPrice: i.price, on: itemOn(guildId, key), desc: i.desc, promo: promoOf(guildId) === key, stock: i.stock ? stockLeft(guildId, key) : null })),
    purchases: all.flatMap(([userId, p]) => p.history.filter((h) => /^Achat/.test(h.why)).map((h) => ({ userId, ...h }))).sort((a, b) => b.at - a.at).slice(0, 50),
  };
}
/** Remet une bourse à zéro (or, banque, cale et effets). */
export async function resetPurse(guildId, userId) {
  await data();
  const before = store[guildId]?.[userId]?.gold ?? 0;
  if (store[guildId]) delete store[guildId][userId];
  persist();
  return before;
}
/** Offre un effet de la boutique sans le faire payer (immunité, XP ×2, récompense doublée). */
export async function giftEffect(guildId, userId, key) {
  await data();
  const p = purse(guildId, userId);
  const until = { immunite: ['immuneUntil', DAY], xp: ['xpBoostUntil', DAY], quotidien: ['dailyBoostUntil', 7 * DAY] }[key];
  if (!until) throw new Error('Effet inconnu.');
  p[until[0]] = Math.max(p[until[0]], Date.now()) + until[1];
  persist();
  return new Date(p[until[0]]);
}

export const _test = { purse: (g, u) => purse(g, u), data, CHEST, meta: (g) => meta(g) };
