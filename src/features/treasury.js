// Le trésor : tout ce qui fait vivre l'économie en pièces d'or au-delà de la boutique.
// - Quêtes du jour (3) et de la semaine (1), suivies automatiquement (messages, vocal, jeux, récompense du jour).
// - Banque : l'or déposé est à l'abri des abordages et rapporte 1 % par semaine (1 000 pièces max).
// - Impôt de fortune : chaque lundi, 2 % de ce qui dépasse 50 000 pièces part au coffre commun.
// - Coffre commun : taxes et amendes ; le staff le redistribue (événements, gagnants).
// - Marché entre membres (5 % de taxe), enchères lancées par le staff, loterie de la semaine.
// - Abordage : tenter de voler 10 % de la bourse d'un membre (risqué : amende en cas d'échec).
// - Classement des plus riches publié chaque soir dans le salon du trésor.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits as P, StringSelectMenuBuilder } from 'discord.js';
import { buildModal, field as f, readModal } from '../panels/ui.js';
import { cfg } from './guildConfig.js';
import {
  DAY, GOLD, ITEMS, TAX, addGold, addToChest, data, dayKey, fmt, giveItem, ko, members, meta, ok, persist, purse,
} from './economy.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const HOUR = 3_600_000;
const TZ = 'Europe/Paris';
let client = null;

const weekKey = (at = Date.now()) => {
  const d = new Date(at);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
};
const parisHour = () => Number(new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
const treasuryChannel = (guild) => {
  const c = guild.channels.cache.get(cfg(guild.id, 'economy.channelId') ?? '');
  return c?.isTextBased?.() ? c : null;
};

// ===================== Quêtes =====================

const DAILY_POOL = [
  { id: 'msg', label: 'Envoyer 20 messages', kind: 'msg', goal: 20 },
  { id: 'voc', label: 'Passer 30 min en vocal', kind: 'voc', goal: 30 },
  { id: 'jeu', label: 'Jouer 2 parties', kind: 'jeu', goal: 2 },
  { id: 'daily', label: 'Prendre la récompense du jour', kind: 'daily', goal: 1 },
  { id: 'msg2', label: 'Envoyer 50 messages', kind: 'msg', goal: 50 },
  { id: 'win', label: 'Gagner une partie', kind: 'win', goal: 1 },
];
const WEEKLY_POOL = [
  { id: 'wmsg', label: 'Envoyer 300 messages', kind: 'msg', goal: 300 },
  { id: 'wvoc', label: 'Passer 5 h en vocal', kind: 'voc', goal: 300 },
  { id: 'wjeu', label: 'Jouer 10 parties', kind: 'jeu', goal: 10 },
];
const DAILY_REWARD = 150;
const DAILY_BONUS = 200;
const WEEKLY_REWARD = 1500;

function seeded(seed, list, n) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const copy = [...list];
  const out = [];
  while (out.length < n && copy.length) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(copy.splice(h % copy.length, 1)[0]);
  }
  return out;
}
function questsOf(guildId, userId) {
  const p = purse(guildId, userId);
  const day = dayKey();
  const week = weekKey();
  if (!p.quests || p.quests.day !== day) {
    p.quests = { ...(p.quests ?? {}), day, daily: seeded(`${userId}${day}`, DAILY_POOL, 3).map((q) => ({ ...q, done: 0, paid: false })), bonusPaid: false };
  }
  if (p.quests.week !== week) {
    p.quests.week = week;
    p.quests.weekly = { ...seeded(`${userId}${week}`, WEEKLY_POOL, 1)[0], done: 0, paid: false };
  }
  return p.quests;
}

/** Appelé par les messages, le vocal, les jeux et la récompense du jour. */
export async function questProgress(guildId, userId, kind, n = 1) {
  if (!guildId || !userId) return;
  await data();
  const q = questsOf(guildId, userId);
  const rewards = [];
  for (const quest of [...q.daily, q.weekly]) {
    if (quest.kind !== kind || quest.paid) continue;
    quest.done = Math.min(quest.goal, quest.done + n);
    if (quest.done >= quest.goal) {
      quest.paid = true;
      const reward = quest === q.weekly ? WEEKLY_REWARD : DAILY_REWARD;
      await addGold(guildId, userId, reward, `Quête : ${quest.label}`);
      rewards.push(reward);
    }
  }
  if (!q.bonusPaid && q.daily.every((x) => x.paid)) {
    q.bonusPaid = true;
    await addGold(guildId, userId, DAILY_BONUS, 'Bonus : toutes les quêtes du jour');
  }
  persist();
  return rewards;
}

async function questsMessage(guild, userId) {
  await data();
  const q = questsOf(guild.id, userId);
  const bar = (x) => `${'▰'.repeat(Math.round((x.done / x.goal) * 8))}${'▱'.repeat(8 - Math.round((x.done / x.goal) * 8))}`;
  const line = (x, reward) => `${x.paid ? '✅' : '🗺️'} **${x.label}** · ${bar(x)} ${x.done}/${x.goal} · 🪙 ${fmt(reward)}`;
  return {
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🗺️ Tes quêtes')
      .setDescription([
        '**Du jour** (nouvelles chaque jour)', ...q.daily.map((x) => line(x, DAILY_REWARD)),
        `${q.bonusPaid ? '✅' : '⭐'} Les 3 finies : **+🪙 ${DAILY_BONUS}**`, '',
        '**De la semaine**', line(q.weekly, WEEKLY_REWARD),
      ].join('\n'))
      .setFooter({ text: 'Les récompenses tombent toutes seules dans ta bourse' })],
  };
}

// ===================== Bourse, historique, banque =====================

async function walletMessage(guild, userId) {
  await data();
  const p = purse(guild.id, userId);
  const history = p.history.slice(0, 10).map((h) => `<t:${Math.round(h.at / 1000)}:R> · ${h.n > 0 ? '+' : ''}${fmt(h.n)} · ${h.why}`);
  return {
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle('💰 Ta bourse')
      .addFields(
        { name: 'Pièces d’or', value: `🪙 ${fmt(p.gold)}`, inline: true },
        { name: 'À la banque', value: `🏦 ${fmt(p.bank)}`, inline: true },
        { name: 'Gagné / dépensé', value: `${fmt(p.earned)} / ${fmt(p.spent)}`, inline: true },
        { name: 'Derniers mouvements', value: history.join('\n') || 'Rien pour l’instant.' },
      )
      .setFooter({ text: 'La banque protège des abordages et rapporte 1 % par semaine' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tr:deposit').setLabel('Déposer').setEmoji('🏦').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('tr:withdraw').setLabel('Retirer').setEmoji('💸').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tr:quests').setLabel('Mes quêtes').setEmoji('🗺️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('sh:hold').setLabel('Ma cale').setEmoji('🧰').setStyle(ButtonStyle.Secondary),
    )],
  };
}
const AMOUNT = () => [f.int('montant', 'Combien de pièces', { req: true, min: 1, top: 10_000_000 })];

// ===================== Marché =====================

async function marketMessage(guild) {
  await data();
  const m = meta(guild.id);
  const list = m.market.filter((l) => ITEMS[l.key]).sort((a, b) => a.price - b.price).slice(0, 25);
  const embed = new EmbedBuilder().setColor(GOLD).setTitle('⚖️ Le marché du port')
    .setDescription(list.length ? list.map((l) => `${ITEMS[l.key].emoji} **${ITEMS[l.key].name}** · 🪙 ${fmt(l.price)} · vendu par <@${l.seller}>`).join('\n') : 'Rien à vendre pour l’instant. Mets un objet en vente depuis ta cale.')
    .setFooter({ text: `Taxe de ${TAX * 100} % sur chaque vente, versée au coffre commun` });
  if (!list.length) return { embeds: [embed] };
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tr:buy').setPlaceholder('🪙 Acheter')
        .addOptions(list.map((l) => ({ label: `${ITEMS[l.key].name} · ${fmt(l.price)}`.slice(0, 100), value: l.id, emoji: ITEMS[l.key].emoji })))),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tr:unlist').setLabel('Retirer mes ventes').setEmoji('↩️').setStyle(ButtonStyle.Secondary)),
    ],
  };
}
const SELL_FIELDS = () => [f.int('prix', 'Prix de vente (pièces)', { req: true, min: 50, top: 1_000_000 })];

// ===================== Enchères =====================

function auctionEmbed(a) {
  const item = ITEMS[a.key];
  return new EmbedBuilder().setColor(GOLD).setTitle(`🔨 Enchère : ${item.emoji} ${item.name}`)
    .setDescription([
      item.desc,
      '',
      a.bidder ? `Meilleure offre : **🪙 ${fmt(a.bid)}** par <@${a.bidder}>` : `Mise de départ : **🪙 ${fmt(a.bid)}**`,
      a.ended ? `**Terminée** ${a.bidder ? `· gagnée par <@${a.bidder}> 🎉` : '· personne n’a enchéri'}` : `Fin <t:${Math.round(a.endsAt / 1000)}:R>`,
    ].join('\n'))
    .setFooter({ text: 'Ton offre est réservée ; elle t’est rendue si quelqu’un enchérit plus haut' });
}
const bidRow = (a) => new ActionRowBuilder().addComponents([100, 500, 1000, 5000].map((n) => new ButtonBuilder().setCustomId(`tr:bid:${a.id}:${n}`).setLabel(`+${fmt(n)}`).setEmoji('🪙').setStyle(ButtonStyle.Success)));

export async function createAuction(guild, key, minutes, start, byId) {
  await data();
  const channel = treasuryChannel(guild);
  if (!channel) return { error: 'Règle d’abord le salon du trésor (tableau de bord › Boutique, ou /pannel › Installer les salons du bot).' };
  const a = { id: Math.random().toString(36).slice(2, 9), key, bid: start, bidder: null, endsAt: Date.now() + minutes * 60_000, channelId: channel.id, messageId: null, by: byId };
  const msg = await channel.send({ embeds: [auctionEmbed(a)], components: [bidRow(a)] });
  a.messageId = msg.id;
  meta(guild.id).auctions.push(a);
  persist();
  return { url: msg.url };
}

async function closeAuction(guild, a) {
  a.ended = true;
  if (a.bidder) {
    await giveItem(guild.id, a.bidder, a.key);
    await addToChest(guild.id, Math.round(a.bid * 0.5)); // la moitié de l'enchère revient au coffre commun
  }
  const channel = guild.channels.cache.get(a.channelId);
  const msg = await channel?.messages.fetch(a.messageId).catch(() => null);
  await msg?.edit({ embeds: [auctionEmbed(a)], components: [] }).catch(() => {});
  if (a.bidder) await channel?.send({ content: `🔨 <@${a.bidder}> remporte **${ITEMS[a.key].emoji} ${ITEMS[a.key].name}** pour 🪙 ${fmt(a.bid)} ! (dans ta cale)`, allowedMentions: { users: [a.bidder] } }).catch(() => {});
  meta(guild.id).auctions = meta(guild.id).auctions.filter((x) => x.id !== a.id);
  persist();
}

// ===================== Loterie de la semaine =====================

const TICKET = 100;
function lotteryOf(guildId) {
  const m = meta(guildId);
  if (!m.lottery || m.lottery.week !== weekKey()) m.lottery = { week: weekKey(), tickets: {}, ...(m.lottery && m.lottery.week !== weekKey() ? { previous: m.lottery } : {}) };
  return m.lottery;
}
async function lotteryMessage(guild, userId) {
  await data();
  const l = lotteryOf(guild.id);
  const total = Object.values(l.tickets).reduce((a, b) => a + b, 0);
  return {
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🎟️ Loterie de la semaine')
      .setDescription(`Le ticket : **🪙 ${TICKET}**. Tirage chaque lundi matin : le gagnant emporte **90 %** de la cagnotte (10 % au coffre commun).\n\nCagnotte : **🪙 ${fmt(total * TICKET)}** · ${total} ticket(s) · tu en as **${l.tickets[userId] ?? 0}**`)],
    components: [new ActionRowBuilder().addComponents(
      [1, 5, 10].map((n) => new ButtonBuilder().setCustomId(`tr:ticket:${n}`).setLabel(`${n} ticket${n > 1 ? 's' : ''} · ${fmt(n * TICKET)}`).setEmoji('🎟️').setStyle(ButtonStyle.Success)),
    )],
  };
}
async function drawLottery(guild, l) {
  const entries = Object.entries(l.tickets);
  const total = entries.reduce((a, [, n]) => a + n, 0);
  if (!total) return;
  let roll = Math.random() * total;
  const [winner] = entries.find(([, n]) => (roll -= n) < 0) ?? entries[0];
  const pot = total * TICKET;
  await addGold(guild.id, winner, Math.round(pot * 0.9), 'Loterie gagnée');
  await addToChest(guild.id, pot - Math.round(pot * 0.9));
  await treasuryChannel(guild)?.send({ content: `🎟️ **Loterie de la semaine** : <@${winner}> gagne **🪙 ${fmt(Math.round(pot * 0.9))}** ! (${total} tickets)`, allowedMentions: { users: [winner] } }).catch(() => {});
}

// ===================== Abordage =====================

const ROB_COOLDOWN = 6 * HOUR;
async function robbery(interaction, target) {
  const guild = interaction.guild;
  await data();
  const me = purse(guild.id, interaction.user.id);
  const them = purse(guild.id, target.id);
  const now = Date.now();
  if (target.bot || target.id === interaction.user.id) return ko('Choisis un autre membre.');
  if (now - me.lastRob < ROB_COOLDOWN) return ko(`Ton équipage se repose : prochain abordage <t:${Math.round((me.lastRob + ROB_COOLDOWN) / 1000)}:R>.`);
  if (me.gold < 200) return ko('Il te faut au moins 🪙 200 pour payer l’équipage (et l’amende si ça rate).');
  if (them.gold < 500) return ko('Sa bourse est trop légère, ça ne vaut pas le coup.');
  if (now - them.robbedAt < 2 * HOUR) return ko('Ce navire vient déjà d’être abordé, il est sur ses gardes.');
  if (them.immuneUntil > now) return ko('Ce membre est protégé par une immunité.');
  me.lastRob = now;
  if (Math.random() < 0.4) {
    const loot = Math.min(3000, Math.round(them.gold * 0.1));
    them.robbedAt = now;
    await addGold(guild.id, target.id, -loot, `Abordé par ${interaction.user.username}`);
    await addGold(guild.id, interaction.user.id, loot, `Abordage de ${target.username}`);
    await target.send(`🏴‍☠️ ${interaction.user.username} a abordé ton navire sur **${guild.name}** et t’a volé 🪙 ${fmt(loot)}. Pense à la banque !`).catch(() => {});
    return ok(`🏴‍☠️ **Abordage réussi !** Tu voles **🪙 ${fmt(loot)}** à ${target}.`);
  }
  const fine = Math.max(200, Math.round(me.gold * 0.1));
  await addGold(guild.id, interaction.user.id, -fine, 'Abordage raté (amende)');
  await addToChest(guild.id, fine);
  return ko(`L’abordage échoue : ton équipage est capturé. Amende de 🪙 ${fmt(fine)} versée au coffre commun.`);
}

// ===================== Coffre commun =====================

async function chestMessage(guild) {
  await data();
  return { embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🏦 Coffre commun du serveur').setDescription(`Il contient **🪙 ${fmt(meta(guild.id).chest)}**.\nIl se remplit avec les taxes (dons, marché), l’impôt de fortune et les amendes. Le staff le redistribue pour les événements.`)] };
}

// ===================== Actions des panneaux =====================

export const TREASURY_ACTIONS = [
  { id: 'bourse', label: 'Ma bourse', emoji: '💰', desc: 'Solde, banque, derniers mouvements', run: async (c, i) => i.reply({ ...(await walletMessage(i.guild, i.user.id)), ...PRIVATE }) },
  { id: 'quetes', label: 'Mes quêtes', emoji: '🗺️', desc: '3 du jour, 1 de la semaine', run: async (c, i) => i.reply({ ...(await questsMessage(i.guild, i.user.id)), ...PRIVATE }) },
  { id: 'cale', label: 'Ma cale', emoji: '🧰', desc: 'Utiliser, offrir ou revendre tes objets', run: async (c, i) => { const { holdMessage } = await import('./economy.js'); return i.reply({ ...(await holdMessage(i.guild, i.user.id)), ...PRIVATE }); } },
  { id: 'marche', label: 'Le marché', emoji: '⚖️', desc: 'Acheter les objets des autres membres', run: async (c, i) => i.reply({ ...(await marketMessage(i.guild)), ...PRIVATE }) },
  { id: 'loterie', label: 'Loterie de la semaine', emoji: '🎟️', desc: `Ticket à ${TICKET} pièces, tirage le lundi`, run: async (c, i) => i.reply({ ...(await lotteryMessage(i.guild, i.user.id)), ...PRIVATE }) },
  {
    id: 'abordage', label: 'Abordage', emoji: '🏴‍☠️', desc: 'Voler 10 % d’une bourse (40 % de réussite)',
    fields: [f.user('cible', 'Quel navire aborder ?', { req: true })],
    run: async (c, i, v) => i.reply(await robbery(i, v.cible.user)),
  },
  { id: 'coffre', label: 'Coffre commun', emoji: '🏦', desc: 'Ce que contient le coffre du serveur', run: async (c, i) => i.reply({ ...(await chestMessage(i.guild)), ...PRIVATE }) },
  {
    id: 'encherir', label: 'Lancer une enchère (staff)', emoji: '🔨', desc: 'Mettre un objet aux enchères', perm: P.ManageGuild,
    fields: [
      f.choice('objet', 'Objet', Object.entries(ITEMS).map(([value, it]) => ({ label: it.name, value, emoji: it.emoji })), { req: true }),
      f.int('minutes', 'Durée en minutes (5 à 1440)', { req: true, min: 5, top: 1440, value: 60 }),
      f.int('depart', 'Mise de départ (pièces)', { req: true, min: 1, top: 1_000_000, value: 500 }),
    ],
    run: async (c, i, v) => {
      const r = await createAuction(i.guild, v.objet, v.minutes, v.depart, i.user.id);
      return i.reply(r.error ? ko(r.error) : ok(`🔨 Enchère lancée : [voir le message](${r.url})`));
    },
  },
  {
    id: 'distribuer', label: 'Distribuer le coffre commun (staff)', emoji: '🎁', desc: 'Donner de l’or du coffre à un membre', perm: P.ManageGuild,
    fields: [f.user('membre', 'À qui', { req: true }), f.int('montant', 'Combien', { req: true, min: 1, top: 10_000_000 })],
    run: async (c, i, v) => {
      await data();
      const m = meta(i.guildId);
      if (v.montant > m.chest) return i.reply(ko(`Le coffre ne contient que 🪙 ${fmt(m.chest)}.`));
      m.chest -= v.montant;
      await addGold(i.guildId, v.membre.user.id, v.montant, 'Récompense du coffre commun');
      return i.reply(ok(`🎁 ${v.membre.user} reçoit **🪙 ${fmt(v.montant)}** du coffre commun (reste 🪙 ${fmt(m.chest)}).`));
    },
  },
];

// ===================== Boutons et fenêtres (préfixe tr:) =====================

export const isTreasuryComponent = (interaction) => /^tr:/.test(interaction.customId ?? '');

export async function handleTreasuryComponent(c, interaction) {
  const [, what, ref, extra] = interaction.customId.split(':');
  const guild = interaction.guild;
  await data();
  const p = purse(guild.id, interaction.user.id);

  if (what === 'quests') return interaction.reply({ ...(await questsMessage(guild, interaction.user.id)), ...PRIVATE });
  if (what === 'deposit' || what === 'withdraw') return interaction.showModal(buildModal(`tr:${what}send`, what === 'deposit' ? '🏦 Déposer à la banque' : '💸 Retirer de la banque', AMOUNT()));
  if (what === 'depositsend' || what === 'withdrawsend') {
    const { values, error } = await readModal(interaction, AMOUNT());
    if (error) return interaction.reply(ko(error));
    if (what === 'depositsend') {
      if (p.gold < values.montant) return interaction.reply(ko(`Tu n’as que 🪙 ${fmt(p.gold)}.`));
      await addGold(guild.id, interaction.user.id, -values.montant, 'Dépôt à la banque');
      p.bank += values.montant;
    } else {
      if (p.bank < values.montant) return interaction.reply(ko(`Tu n’as que 🏦 ${fmt(p.bank)} à la banque.`));
      p.bank -= values.montant;
      await addGold(guild.id, interaction.user.id, values.montant, 'Retrait de la banque');
    }
    persist();
    return interaction.reply(ok(`🏦 Fait. Bourse : 🪙 ${fmt(p.gold)} · banque : 🏦 ${fmt(p.bank)}.`));
  }

  if (what === 'sell') {
    const key = interaction.values[0];
    return interaction.showModal(buildModal(`tr:sellsend:${key}`, `⚖️ Vendre : ${ITEMS[key]?.name ?? 'objet'}`.slice(0, 45), SELL_FIELDS()));
  }
  if (what === 'sellsend') {
    const { values, error } = await readModal(interaction, SELL_FIELDS());
    if (error) return interaction.reply(ko(error));
    if (!(p.inv[ref] > 0)) return interaction.reply(ko('Tu n’as plus cet objet.'));
    p.inv[ref] -= 1;
    meta(guild.id).market.push({ id: Math.random().toString(36).slice(2, 9), seller: interaction.user.id, key: ref, price: values.prix, at: Date.now() });
    persist();
    return interaction.reply(ok(`⚖️ **${ITEMS[ref].name}** est en vente au marché pour 🪙 ${fmt(values.prix)}.`));
  }
  if (what === 'buy') {
    const m = meta(guild.id);
    const l = m.market.find((x) => x.id === interaction.values[0]);
    if (!l) return interaction.reply(ko('Déjà vendu.'));
    if (l.seller === interaction.user.id) return interaction.reply(ko('C’est ta propre vente (utilise « Retirer mes ventes »).'));
    if (p.gold < l.price) return interaction.reply(ko(`Il te faut 🪙 ${fmt(l.price)}.`));
    m.market = m.market.filter((x) => x.id !== l.id);
    const fee = Math.round(l.price * TAX);
    await addGold(guild.id, interaction.user.id, -l.price, `Marché : ${ITEMS[l.key].name}`);
    await addGold(guild.id, l.seller, l.price - fee, `Vente au marché : ${ITEMS[l.key].name}`);
    await addToChest(guild.id, fee);
    await giveItem(guild.id, interaction.user.id, l.key);
    return interaction.reply(ok(`⚖️ Tu achètes **${ITEMS[l.key].emoji} ${ITEMS[l.key].name}** (dans ta cale).`));
  }
  if (what === 'unlist') {
    const m = meta(guild.id);
    const mine = m.market.filter((x) => x.seller === interaction.user.id);
    for (const l of mine) p.inv[l.key] = (p.inv[l.key] ?? 0) + 1;
    m.market = m.market.filter((x) => x.seller !== interaction.user.id);
    persist();
    return interaction.reply(ok(mine.length ? `↩️ ${mine.length} objet(s) revenu(s) dans ta cale.` : 'Tu n’as rien en vente.'));
  }

  if (what === 'bid') {
    const a = meta(guild.id).auctions.find((x) => x.id === ref);
    if (!a || a.ended || Date.now() > a.endsAt) return interaction.reply(ko('Cette enchère est terminée.'));
    const offer = (a.bidder ? a.bid : a.bid - Number(extra)) + Number(extra);
    if (a.bidder === interaction.user.id) return interaction.reply(ko('Tu as déjà la meilleure offre.'));
    if (p.gold < offer) return interaction.reply(ko(`Il te faut 🪙 ${fmt(offer)}.`));
    if (a.bidder) await addGold(guild.id, a.bidder, a.bid, 'Enchère dépassée (rendue)');
    await addGold(guild.id, interaction.user.id, -offer, `Enchère : ${ITEMS[a.key].name}`);
    a.bid = offer;
    a.bidder = interaction.user.id;
    // Une offre dans la dernière minute prolonge d'une minute (pas de vol de dernière seconde)
    if (a.endsAt - Date.now() < 60_000) a.endsAt += 60_000;
    persist();
    return interaction.update({ embeds: [auctionEmbed(a)], components: [bidRow(a)] });
  }

  if (what === 'ticket') {
    const n = Number(ref);
    if (p.gold < n * TICKET) return interaction.reply(ko(`Il te faut 🪙 ${fmt(n * TICKET)}.`));
    await addGold(guild.id, interaction.user.id, -n * TICKET, `Loterie : ${n} ticket(s)`);
    const l = lotteryOf(guild.id);
    l.tickets[interaction.user.id] = (l.tickets[interaction.user.id] ?? 0) + n;
    persist();
    return interaction.reply({ ...(await lotteryMessage(guild, interaction.user.id)), ...PRIVATE });
  }
  return undefined;
}

// ===================== Chaque minute : enchères, impôt, intérêts, loterie, classement =====================

async function richestEmbed(guild) {
  const list = members(guild.id).map(([id]) => [id, purse(guild.id, id)]).sort((a, b) => (b[1].gold + b[1].bank) - (a[1].gold + a[1].bank)).slice(0, 10);
  const medals = ['🥇', '🥈', '🥉'];
  return new EmbedBuilder().setColor(GOLD).setTitle(`💰 Les plus riches · ${guild.name}`)
    .setDescription(list.length ? list.map(([id, p], i) => `${medals[i] ?? `**${i + 1}.**`} <@${id}> · 🪙 ${fmt(p.gold + p.bank)}`).join('\n') : 'Personne n’a encore d’or.')
    .addFields({ name: 'Coffre commun', value: `🏦 ${fmt(meta(guild.id).chest)}`, inline: true })
    .setFooter({ text: 'Mis à jour chaque soir à 20 h · bourse + banque' }).setTimestamp();
}

export async function treasuryTick() {
  if (!client) return;
  await data();
  const week = weekKey();
  for (const guild of client.guilds.cache.values()) {
    const m = meta(guild.id);
    for (const a of [...m.auctions]) if (!a.ended && Date.now() > a.endsAt) await closeAuction(guild, a).catch(() => {});
    if (m.lastTaxWeek !== week) {
      const first = !m.lastTaxWeek;
      m.lastTaxWeek = week;
      if (!first) {
        for (const [userId] of members(guild.id)) {
          const p = purse(guild.id, userId);
          if (p.gold > 50_000) {
            const tax = Math.round((p.gold - 50_000) * 0.02);
            await addGold(guild.id, userId, -tax, 'Impôt de fortune');
            await addToChest(guild.id, tax);
          }
          if (p.bank > 0) {
            const interest = Math.min(1000, Math.round(p.bank * 0.01));
            p.bank += interest;
            p.history.unshift({ at: Date.now(), n: interest, why: 'Intérêts de la banque' });
          }
        }
        const previous = m.lottery && m.lottery.week !== week ? m.lottery : null;
        if (previous) await drawLottery(guild, previous).catch(() => {});
        m.lottery = { week, tickets: {} };
      }
      persist();
    }
    const day = dayKey();
    const channel = treasuryChannel(guild);
    if (channel && m.lastBoardDay !== day && parisHour() >= 20) {
      m.lastBoardDay = day;
      persist();
      const old = m.boardMessageId ? await channel.messages.fetch(m.boardMessageId).catch(() => null) : null;
      const embed = await richestEmbed(guild);
      if (old) await old.edit({ embeds: [embed] }).catch(() => {});
      else m.boardMessageId = (await channel.send({ embeds: [embed] }).catch(() => null))?.id ?? null;
    }
  }
}

/** Gain pour une partie gagnée (10 gains payés par jour au maximum). */
export async function rewardWin(guildId, userId, amount = 50, game = 'Partie gagnée') {
  await data();
  const p = purse(guildId, userId);
  if (p.wins.day !== dayKey()) p.wins = { day: dayKey(), count: 0 };
  await questProgress(guildId, userId, 'win');
  if (p.wins.count >= 10) return 0;
  p.wins.count += 1;
  await addGold(guildId, userId, amount, game);
  return amount;
}
/** Une partie jouée (pour les quêtes). */
export const playedGame = (guildId, userIds) => Promise.all([userIds].flat().map((id) => questProgress(guildId, id, 'jeu'))).catch(() => {});

export function startTreasury(c) {
  client = c;
  setInterval(() => treasuryTick().catch((err) => console.warn('[trésor]', err.message)), 60_000).unref();
}

export const _test = { questsOf, robbery, weekKey, lotteryOf, drawLottery, walletMessage, marketMessage, DAILY_REWARD, WEEKLY_REWARD, TICKET, setClient: (c) => { client = c; } };
export { DAY };
