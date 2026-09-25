// Économie du serveur, façon pirates : les pièces d'or 🪙 (une bourse par serveur, séparée des jetons du casino).
//
// GAGNER (lentement, exprès) :
// - 200 pièces à chaque niveau (les niveaux sont de plus en plus longs à monter) ;
// - la récompense du jour (100 + 15 par jour de série, plafonnée à 7 jours) ;
// - un don d'un autre membre (taxé 5 % : l'or qui part à la mer évite l'inflation).
//
// DÉPENSER (le comptoir du capitaine) : pas de rôles à acheter, sauf le rôle personnalisé.
// - Immunité 24 h contre les exclusions automatiques (anti-spam, filtres) ;
// - XP doublée 24 h, récompense du jour doublée 7 jours ;
// - effacer un avertissement (une fois par semaine), changer de pseudo, coffre au trésor (au hasard, 3 par jour) ;
// - rôle personnalisé (20 000, validé par le staff, remboursé si refusé).
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits as P, StringSelectMenuBuilder } from 'discord.js';
import { load, save } from '../storage.js';
import { art, buildModal, field as f, readModal } from '../panels/ui.js';
import { cfg } from './guildConfig.js';
import { COLORS } from './tickets.js';

const KEY = 'tresor';
const PRIVATE = { flags: MessageFlags.Ephemeral };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const LEVEL_REWARD = 200;
const GIFT_TAX = 0.05;
const GOLD = 0xd9a441;
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

let store = null; // { [guildId]: { [userId]: { gold, immuneUntil, xpBoostUntil, dailyBoostUntil, lastRemoval, chests: { day, count }, earned, spent } } }
let dirty = false;
async function data() {
  store ??= (await load(KEY, {}).catch(() => ({}))) ?? {};
  return store;
}
function purse(guildId, userId) {
  const g = (store[guildId] ??= {});
  return (g[userId] ??= { gold: 0, immuneUntil: 0, xpBoostUntil: 0, dailyBoostUntil: 0, lastRemoval: 0, chests: { day: '', count: 0 }, earned: 0, spent: 0 });
}
setInterval(() => { if (dirty) { dirty = false; save(KEY, store); } }, 20_000).unref();
const persist = () => { dirty = true; };

export async function goldOf(guildId, userId) {
  await data();
  return purse(guildId, userId).gold;
}
/** Ajoute (ou retire, si négatif) des pièces. Renvoie le nouveau solde. */
export async function addGold(guildId, userId, amount) {
  await data();
  const p = purse(guildId, userId);
  p.gold = Math.max(0, p.gold + Math.round(amount));
  if (amount > 0) p.earned += Math.round(amount);
  else p.spent -= Math.round(amount);
  persist();
  return p.gold;
}
export async function richest(guildId, n = 10) {
  await data();
  return Object.entries(store[guildId] ?? {}).sort((a, b) => b[1].gold - a[1].gold).slice(0, n).map(([userId, p]) => ({ userId, gold: p.gold }));
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

const dayKey = () => new Date().toISOString().slice(0, 10);
const CHEST = [[200, 40], [500, 30], [1000, 20], [2000, 8], [5000, 2]]; // gain moyen ≈ 690 pour 750 : le coffre fait un peu perdre

export const ITEMS = {
  immunite: {
    emoji: '🛡️', name: 'Immunité 24 h', price: 6000,
    desc: 'Les exclusions automatiques du bot (anti-spam, liens, arnaques) ne te touchent pas pendant 24 h. Le staff peut toujours sanctionner.',
    buy: (p) => (p.immuneUntil > Date.now() ? { error: 'Ton immunité est déjà active.' } : (p.immuneUntil = Date.now() + DAY, { text: 'Tu es immunisé contre les exclusions automatiques pendant **24 h**.' })),
  },
  xp: {
    emoji: '⚡', name: 'XP doublée 24 h', price: 2500,
    desc: 'Chaque message et chaque minute de vocal rapportent deux fois plus d’XP pendant 24 h.',
    buy: (p) => (p.xpBoostUntil > Date.now() ? { error: 'Ton XP doublée est déjà active.' } : (p.xpBoostUntil = Date.now() + DAY, { text: 'Ton XP est **doublée pendant 24 h**.' })),
  },
  quotidien: {
    emoji: '🎁', name: 'Récompense doublée 7 jours', price: 3000,
    desc: 'Ta récompense du jour vaut double pendant 7 jours. Rentable si tu passes chaque jour.',
    buy: (p) => (p.dailyBoostUntil > Date.now() ? { error: 'C’est déjà actif.' } : (p.dailyBoostUntil = Date.now() + 7 * DAY, { text: 'Ta récompense du jour est **doublée pendant 7 jours**.' })),
  },
  pardon: {
    emoji: '🧽', name: 'Effacer un avertissement', price: 5000,
    desc: 'Retire ton avertissement le plus récent. Une fois par semaine au maximum.',
    special: true,
  },
  pseudo: {
    emoji: '✏️', name: 'Changer de pseudo', price: 1000,
    desc: 'Le bot change ton pseudo sur le serveur (32 caractères max, remboursé si impossible).',
    special: true,
  },
  coffre: {
    emoji: '📦', name: 'Coffre au trésor', price: 750,
    desc: 'Au hasard : 200, 500, 1 000, 2 000 ou 5 000 pièces. Trois coffres par jour.',
    special: true,
  },
};

export async function shopMessage(guild, userId) {
  await data();
  const p = purse(guild.id, userId);
  const custom = cfg(guild.id, 'shop.customRolePrice') || 20000;
  const effects = await effectsOf(guild.id, userId);
  const embed = new EmbedBuilder().setColor(GOLD).setTitle('🏴‍☠️ Le comptoir du capitaine')
    .setDescription([
      `Ta bourse : **🪙 ${fmt(p.gold)} pièces d’or**`,
      `-# Tu gagnes **${LEVEL_REWARD} pièces** à chaque niveau, plus la récompense du jour.`,
      effects.length ? `\n**En cours**\n${effects.join('\n')}` : null,
    ].filter(Boolean).join('\n'))
    .addFields(
      ...Object.values(ITEMS).map((i) => ({ name: `${i.emoji} ${i.name} · 🪙 ${fmt(i.price)}`, value: i.desc })),
      { name: `🎨 Rôle personnalisé · 🪙 ${fmt(custom)}`, value: 'Ton nom et ta couleur, validés par le staff. Remboursé s’il refuse.' },
    )
    .setFooter({ text: 'Choisis un article dans le menu · les pièces ne s’achètent pas avec de l’argent' });
  // Bannière animée du comptoir (assets/panneaux/boutique.gif, tools/make-shop-gif.mjs)
  const gif = art('panneaux', 'boutique');
  embed.setImage(gif.url);
  return {
    embeds: [embed],
    files: gif.files,
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sh:buy').setPlaceholder('🪙 Acheter un article')
        .addOptions(Object.entries(ITEMS).map(([value, i]) => ({ label: `${i.name} · ${fmt(i.price)}`, value, emoji: i.emoji, description: i.desc.slice(0, 100) })))),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sh:custom').setLabel(`Rôle personnalisé · ${fmt(custom)}`).setEmoji('🎨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('sh:gift').setLabel('Donner des pièces').setEmoji('🤝').setStyle(ButtonStyle.Secondary),
      ),
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

const ok = (text) => ({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setDescription(text)], ...PRIVATE });
const ko = (text) => ({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${text}`)], ...PRIVATE });

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
    if (p.gold < item.price) return interaction.reply(ko(`Il te faut 🪙 ${fmt(item.price)} (tu as 🪙 ${fmt(p.gold)}).`));
    if (key === 'pseudo') return interaction.showModal(buildModal('sh:nick', '✏️ Nouveau pseudo', NICK_FIELDS()));
    if (key === 'pardon') {
      if (Date.now() - p.lastRemoval < 7 * DAY) return interaction.reply(ko(`Une fois par semaine : réessaie <t:${Math.round((p.lastRemoval + 7 * DAY) / 1000)}:R>.`));
      const all = (await load('warnings', {}).catch(() => ({}))) ?? {};
      const list = all[guild.id]?.[interaction.user.id];
      if (!list?.length) return interaction.reply(ko('Tu n’as aucun avertissement à effacer.'));
      list.pop();
      save('warnings', all);
      p.lastRemoval = Date.now();
      await addGold(guild.id, interaction.user.id, -item.price);
      return interaction.reply(ok(`🧽 Ton dernier avertissement est effacé. Il t’en reste **${list.length}**. Bourse : 🪙 ${fmt(p.gold)}.`));
    }
    if (key === 'coffre') {
      if (p.chests.day !== dayKey()) p.chests = { day: dayKey(), count: 0 };
      if (p.chests.count >= 3) return interaction.reply(ko('Trois coffres par jour maximum, reviens demain.'));
      p.chests.count += 1;
      await addGold(guild.id, interaction.user.id, -item.price);
      let roll = Math.random() * 100;
      const [won] = CHEST.find(([, weight]) => (roll -= weight) < 0) ?? CHEST[0];
      await addGold(guild.id, interaction.user.id, won);
      return interaction.reply(ok(`📦 Le coffre s’ouvre… **🪙 ${fmt(won)} pièces** ${won > item.price ? '💰' : ''}\nBourse : 🪙 ${fmt(p.gold)} · coffres aujourd’hui : ${p.chests.count}/3`));
    }
    const result = item.buy(p);
    if (result.error) return interaction.reply(ko(result.error));
    await addGold(guild.id, interaction.user.id, -item.price);
    return interaction.reply(ok(`${item.emoji} ${result.text}\nBourse : 🪙 ${fmt(p.gold)}.`));
  }

  if (what === 'nick') {
    const { values, error } = await readModal(interaction, NICK_FIELDS());
    if (error) return interaction.reply(ko(error));
    const price = ITEMS.pseudo.price;
    if (p.gold < price) return interaction.reply(ko(`Il te faut 🪙 ${fmt(price)}.`));
    const done = await interaction.member.setNickname(values.pseudo.slice(0, 32), 'Boutique : changement de pseudo').then(() => true, () => false);
    if (!done) return interaction.reply(ko('Je ne peux pas changer ton pseudo (ton rôle est au-dessus du mien, ou tu es le propriétaire). Rien n’a été payé.'));
    await addGold(guild.id, interaction.user.id, -price);
    return interaction.reply(ok(`✏️ Ton pseudo est maintenant **${values.pseudo}**. Bourse : 🪙 ${fmt(p.gold)}.`));
  }

  if (what === 'gift') return interaction.showModal(buildModal('sh:giftsend', '🤝 Donner des pièces', GIFT_FIELDS()));
  if (what === 'giftsend') {
    const { values, error } = await readModal(interaction, GIFT_FIELDS());
    if (error) return interaction.reply(ko(error));
    const to = values.membre.user;
    if (to.bot || to.id === interaction.user.id) return interaction.reply(ko('Choisis un autre membre (pas un bot, pas toi).'));
    if (p.gold < values.montant) return interaction.reply(ko(`Tu n’as que 🪙 ${fmt(p.gold)}.`));
    const received = Math.floor(values.montant * (1 - GIFT_TAX));
    await addGold(guild.id, interaction.user.id, -values.montant);
    await addGold(guild.id, to.id, received);
    await to.send(`🤝 ${interaction.user.username} t’a donné **🪙 ${fmt(received)} pièces d’or** sur **${guild.name}**.`).catch(() => {});
    return interaction.reply(ok(`🤝 ${to} reçoit **🪙 ${fmt(received)}** (taxe de 5 % : 🪙 ${fmt(values.montant - received)}). Bourse : 🪙 ${fmt(p.gold)}.`));
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
    await addGold(guild.id, interaction.user.id, -price); // remboursé si le staff refuse
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
      await addGold(req.guildId, req.userId, req.price);
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

/** Vue d'ensemble d'un serveur : or en circulation, classement, effets en cours. */
export async function economyOverview(guildId) {
  await data();
  const all = Object.entries(store[guildId] ?? {});
  const now = Date.now();
  return {
    total: all.reduce((n, [, p]) => n + p.gold, 0),
    holders: all.filter(([, p]) => p.gold > 0).length,
    earned: all.reduce((n, [, p]) => n + (p.earned ?? 0), 0),
    spent: all.reduce((n, [, p]) => n + (p.spent ?? 0), 0),
    top: all.sort((a, b) => b[1].gold - a[1].gold).slice(0, 25).map(([userId, p]) => ({
      userId, gold: p.gold, earned: p.earned ?? 0, spent: p.spent ?? 0,
      effects: [p.immuneUntil > now ? 'immunite' : null, p.xpBoostUntil > now ? 'xp' : null, p.dailyBoostUntil > now ? 'quotidien' : null].filter(Boolean),
    })),
    items: Object.entries(ITEMS).map(([key, i]) => ({ key, name: i.name, emoji: i.emoji, price: i.price })),
  };
}
/** Remet une bourse à zéro (or et effets). */
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

export const _test = { purse: (g, u) => purse(g, u), data, CHEST };
