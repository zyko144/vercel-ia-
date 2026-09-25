// La taverne : jeux d'argent en pièces d'or contre la maison (pile ou face, dés, blackjack, roue, machine à sous)
// et petits jeux (démineur, pendu, devine le nombre). Les mises perdues vont au coffre commun du serveur.
// Boutons : « g:tp:<id>:<action> ».
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { art } from '../panels/ui.js';
import { addGold, addToChest, goldOf } from '../features/economy.js';
import { cfg } from '../features/guildConfig.js';
import { playedGame, questProgress, rewardWin } from '../features/treasury.js';
import { PRIVATE, gameChannel, listenChannel, normalize, pick, shortId, shuffle, sleep, stopListening } from './common.js';

const MAX_BET = 10_000;
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const GOLD = 0xf2c14e;
const tables = new Map();
const lastPlay = new Map();

/** Public dans le salon des jeux, discret ailleurs (pour ne pas encombrer les discussions). */
const visibility = (interaction) => (interaction.channelId === cfg(interaction.guildId, 'games.channelId') ? {} : PRIVATE);

async function takeBet(interaction, bet, label) {
  bet = Math.floor(Number(bet) || 0);
  if (bet < 10 || bet > MAX_BET) return { error: `Mise entre 🪙 10 et 🪙 ${fmt(MAX_BET)}.` };
  const key = `${interaction.guildId}:${interaction.user.id}`;
  if (Date.now() - (lastPlay.get(key) ?? 0) < 3000) return { error: 'Doucement moussaillon, une partie à la fois.' };
  if ((await goldOf(interaction.guildId, interaction.user.id)) < bet) return { error: `Il te faut 🪙 ${fmt(bet)}.` };
  lastPlay.set(key, Date.now());
  await addGold(interaction.guildId, interaction.user.id, -bet, `Taverne : ${label}`);
  return { bet };
}
async function settle(interaction, bet, multiplier, label) {
  const win = Math.floor(bet * multiplier);
  if (win > 0) await addGold(interaction.guildId, interaction.user.id, win, `Taverne : ${label}${multiplier > 1 ? ' (gagné)' : ''}`);
  if (win < bet) await addToChest(interaction.guildId, bet - win);
  await playedGame(interaction.guildId, interaction.user.id);
  if (multiplier > 1) await questProgress(interaction.guildId, interaction.user.id, 'win').catch(() => {});
  return { win, balance: await goldOf(interaction.guildId, interaction.user.id) };
}
const ko = (interaction, text) => interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe0433a).setDescription(`❌ ${text}`)], ...PRIVATE });
const result = (win, bet) => (win > bet ? `🎉 **+🪙 ${fmt(win - bet)}**` : win === bet ? '🤝 Mise rendue' : `💀 **-🪙 ${fmt(bet - win)}** (au coffre commun)`);

// ===================== Pile ou face =====================

export async function coinFlip(interaction, { bet, side }) {
  const r = await takeBet(interaction, bet, 'pile ou face');
  if (r.error) return ko(interaction, r.error);
  const got = Math.random() < 0.5 ? 'pile' : 'face';
  const s = await settle(interaction, r.bet, got === side ? 1.9 : 0, 'pile ou face');
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🪙 Pile ou face')
    .setDescription(`Tu joues **${side}** pour 🪙 ${fmt(r.bet)}… la pièce tourne… **${got.toUpperCase()}** !\n\n${result(s.win, r.bet)} · bourse : 🪙 ${fmt(s.balance)}`)], ...visibility(interaction) });
}

// ===================== Dés contre le capitaine =====================

const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export async function diceDuel(interaction, { bet }) {
  const r = await takeBet(interaction, bet, 'dés');
  if (r.error) return ko(interaction, r.error);
  const roll = () => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  const me = roll();
  const cap = roll();
  const [a, b] = [me[0] + me[1], cap[0] + cap[1]];
  const s = await settle(interaction, r.bet, a > b ? 1.9 : a === b ? 1 : 0, 'dés');
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🎲 Dés contre le capitaine')
    .setDescription(`Toi : ${me.map((n) => DIE[n - 1]).join(' ')} = **${a}**\nLe capitaine : ${cap.map((n) => DIE[n - 1]).join(' ')} = **${b}**\n\n${result(s.win, r.bet)} · bourse : 🪙 ${fmt(s.balance)}`)], ...visibility(interaction) });
}

// ===================== Machine à sous =====================

const REELS = ['🍒', '🍋', '🦜', '⚓', '💰', '💎', '🏴‍☠️'];
const WEIGHTS = [30, 25, 18, 13, 8, 4, 2];
const PAY3 = { '🍒': 3, '🍋': 4, '🦜': 6, '⚓': 10, '💰': 20, '💎': 40, '🏴‍☠️': 100 };
const spinReel = () => {
  let r = Math.random() * WEIGHTS.reduce((a, b) => a + b, 0);
  return REELS[WEIGHTS.findIndex((w) => (r -= w) < 0)];
};
export function slotPayout(line) {
  const [x, y, z] = line;
  if (x === y && y === z) return PAY3[x];
  if (x === y || y === z || x === z) return 1.5;
  return 0;
}
export async function slots(interaction, { bet }) {
  const r = await takeBet(interaction, bet, 'machine à sous');
  if (r.error) return ko(interaction, r.error);
  const line = [spinReel(), spinReel(), spinReel()];
  const embed = (shown) => new EmbedBuilder().setColor(GOLD).setTitle('🎰 La machine du Kraken')
    .setDescription(`╔═══════════╗\n║ ${line.map((e, i) => (i < shown ? e : '❔')).join(' ║ ')} ║\n╚═══════════╝`);
  await interaction.reply({ embeds: [embed(0)], ...visibility(interaction) });
  for (let i = 1; i <= 3; i++) {
    await sleep(650);
    await interaction.editReply({ embeds: [embed(i)] }).catch(() => {});
  }
  const mult = slotPayout(line);
  const s = await settle(interaction, r.bet, mult, 'machine à sous');
  return interaction.editReply({ embeds: [embed(3).addFields({ name: mult >= 10 ? '💥 JACKPOT' : 'Résultat', value: `${mult ? `×${mult} · ` : ''}${result(s.win, r.bet)} · bourse : 🪙 ${fmt(s.balance)}` })
    .setFooter({ text: 'Trois pareils : 🍒×3 🍋×4 🦜×6 ⚓×10 💰×20 💎×40 🏴‍☠️×100 · deux pareils : ×1,5' })] }).catch(() => {});
}

// ===================== Roue de la fortune =====================

export const WHEEL = [0, 0.5, 1, 0, 2, 0.5, 0.5, 0, 1.5, 0.5, 5, 0];
export async function wheel(interaction, { bet }) {
  const r = await takeBet(interaction, bet, 'roue');
  if (r.error) return ko(interaction, r.error);
  const i = Math.floor(Math.random() * WHEEL.length);
  const mult = WHEEL[i];
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🎡 La roue de la fortune').setDescription(`Mise : 🪙 ${fmt(r.bet)}… la roue tourne !`).setImage(art('panneaux', 'roue').url)], files: art('panneaux', 'roue').files, ...visibility(interaction) });
  await sleep(3200);
  const s = await settle(interaction, r.bet, mult, 'roue');
  return interaction.editReply({ embeds: [new EmbedBuilder().setColor(mult >= 2 ? 0x3fbf6a : mult ? GOLD : 0xe0433a).setTitle('🎡 La roue de la fortune')
    .setDescription(`La roue s’arrête sur **×${String(mult).replace('.', ',')}** !\n\n${result(s.win, r.bet)} · bourse : 🪙 ${fmt(s.balance)}`)
    .setFooter({ text: `Cases : ${WHEEL.map((m) => `×${String(m).replace('.', ',')}`).join(' · ')}` })] }).catch(() => {});
}

// ===================== Blackjack =====================

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
const deck = () => shuffle(SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`)));
export function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    const r = c.slice(0, -1);
    if (r === 'A') { aces += 1; total += 11; } else total += ['V', 'D', 'R'].includes(r) ? 10 : Number(r);
  }
  while (total > 21 && aces) { total -= 10; aces -= 1; }
  return total;
}
function bjView(t, reveal = false) {
  const dealer = reveal ? t.dealer : [t.dealer[0], '🂠'];
  const e = new EmbedBuilder().setColor(GOLD).setTitle(`🃏 Blackjack · mise 🪙 ${fmt(t.bet)}`)
    .addFields(
      { name: `Le capitaine${reveal ? ` · ${handValue(t.dealer)}` : ''}`, value: `\`${dealer.join('  ')}\`` },
      { name: `Toi · ${handValue(t.hand)}`, value: `\`${t.hand.join('  ')}\`` },
    );
  if (t.done) e.setDescription(t.done);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`g:tp:${t.id}:hit`).setLabel('Tirer').setEmoji('🃏').setStyle(ButtonStyle.Primary).setDisabled(!!t.done),
    new ButtonBuilder().setCustomId(`g:tp:${t.id}:stand`).setLabel('Rester').setEmoji('✋').setStyle(ButtonStyle.Secondary).setDisabled(!!t.done),
    new ButtonBuilder().setCustomId(`g:tp:${t.id}:double`).setLabel('Doubler').setEmoji('💰').setStyle(ButtonStyle.Success).setDisabled(!!t.done || t.hand.length > 2),
  );
  return { embeds: [e], components: [row] };
}
export async function blackjack(interaction, { bet }) {
  const r = await takeBet(interaction, bet, 'blackjack');
  if (r.error) return ko(interaction, r.error);
  const cards = deck();
  const t = { id: shortId(), userId: interaction.user.id, guildId: interaction.guildId, bet: r.bet, cards, hand: [cards.pop(), cards.pop()], dealer: [cards.pop(), cards.pop()], at: Date.now() };
  tables.set(t.id, t);
  if (handValue(t.hand) === 21) return finishBlackjack(interaction, t, true);
  return interaction.reply({ ...bjView(t), ...visibility(interaction) });
}
async function finishBlackjack(interaction, t, fresh = false) {
  tables.delete(t.id);
  const me = handValue(t.hand);
  const natural = me === 21 && t.hand.length === 2;
  if (me <= 21 && !natural) while (handValue(t.dealer) < 17) t.dealer.push(t.cards.pop());
  const dv = handValue(t.dealer);
  let mult;
  if (me > 21) mult = 0;
  else if (natural && !(dv === 21 && t.dealer.length === 2)) mult = 2.5;
  else if (dv > 21 || me > dv) mult = 2;
  else if (me === dv) mult = 1;
  else mult = 0;
  const s = await settle(interaction, t.bet, mult, 'blackjack');
  t.done = `${me > 21 ? '💥 Tu dépasses 21.' : natural && mult === 2.5 ? '🃏 **Blackjack !**' : dv > 21 ? '💥 Le capitaine saute.' : ''} ${result(s.win, t.bet)} · bourse : 🪙 ${fmt(s.balance)}`;
  const payload = bjView(t, true);
  return fresh ? interaction.reply({ ...payload, ...visibility(interaction) }) : interaction.update(payload);
}

// ===================== Démineur (cases cachées de Discord) =====================

export function minesweeper(size = 8, mines = 10) {
  const cells = Array(size * size).fill(0);
  for (const i of shuffle([...cells.keys()]).slice(0, mines)) cells[i] = -1;
  const NUM = ['🟦', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
  const lines = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      if (cells[y * size + x] === -1) { row.push('||💣||'); continue; }
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny * size + nx] === -1) n += 1;
      }
      row.push(`||${NUM[n]}||`);
    }
    lines.push(row.join(''));
  }
  return lines.join('\n');
}
export async function startMinesweeper(interaction, { level = 'moyen' } = {}) {
  const [size, mines] = { facile: [6, 5], moyen: [8, 10], difficile: [9, 16] }[level] ?? [8, 10];
  await playedGame(interaction.guildId, interaction.user.id);
  return interaction.reply({ content: `💣 **Démineur ${level}** · ${mines} mines cachées sur la carte. Clique sur les cases pour les découvrir, sans tomber sur une mine !\n\n${minesweeper(size, mines)}`, ...visibility(interaction) });
}

// ===================== Pendu et devine le nombre (dans le salon des jeux) =====================

const WORDS = ['boussole', 'galion', 'perroquet', 'tresor', 'corsaire', 'flibustier', 'abordage', 'gouvernail', 'longue vue', 'sabre', 'canon', 'equipage', 'tempete', 'ile deserte', 'rhum', 'pavillon', 'capitaine', 'moussaillon', 'ancre', 'epave', 'kraken', 'lagon', 'naufrage', 'doublon', 'mutinerie', 'vigie', 'caravelle', 'escale', 'hamac', 'cartographe', 'microphone', 'guitare', 'chocolat', 'pyramide', 'astronaute', 'bibliotheque', 'dinosaure', 'papillon', 'volcan', 'girafe', 'croissant', 'trampoline', 'hibou', 'labyrinthe', 'kangourou', 'marmelade', 'pingouin', 'vampire', 'sorciere', 'citrouille'];
const channelGames = new Map();
const STAGES = ['```\n\n\n\n\n=====```', '```\n |\n |\n |\n |\n=====```', '```\n +---+\n |\n |\n |\n=====```', '```\n +---+\n |   O\n |\n |\n=====```', '```\n +---+\n |   O\n |   |\n |\n=====```', '```\n +---+\n |   O\n |  /|\\\n |\n=====```', '```\n +---+\n |   O\n |  /|\\\n |  / \\\n=====```'];

export async function startHangman(interaction) {
  const channel = await gameChannel(interaction);
  if (channelGames.has(channel.id)) return ko(interaction, 'Un jeu est déjà en cours dans ce salon.');
  const word = pick(WORDS);
  const g = { word, found: new Set([' ']), misses: [], players: new Set() };
  channelGames.set(channel.id, g);
  const masked = () => [...word].map((c) => (g.found.has(c) ? (c === ' ' ? '   ' : c.toUpperCase()) : '＿')).join(' ');
  const view = (extra = '') => ({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🪢 Le pendu du navire')
    .setDescription(`${STAGES[g.misses.length]}\n**${masked()}**\n\nÉcrivez **une lettre** ou **le mot entier** dans le salon.${g.misses.length ? `\nRatées : ${g.misses.join(' ').toUpperCase()}` : ''}${extra ? `\n\n${extra}` : ''}`)] });
  const msg = await channel.send(view());
  await interaction.reply({ content: `🪢 Le pendu commence dans ${channel} !`, ...PRIVATE });
  const finish = async (text, winner) => {
    stopListening(channel.id, reader);
    channelGames.delete(channel.id);
    clearTimeout(timer);
    await playedGame(interaction.guildId, [...g.players]);
    if (winner) await rewardWin(interaction.guildId, winner, 60, 'Pendu gagné');
    await msg.edit(view(text)).catch(() => {});
  };
  const timer = setTimeout(() => finish(`⌛ Temps écoulé ! Le mot était **${word.toUpperCase()}**.`), 5 * 60_000);
  const reader = (m) => {
    if (m.author.bot) return false;
    const t = normalize(m.content);
    if (!t) return false;
    g.players.add(m.author.id);
    if (t.length === 1) {
      if (g.found.has(t) || g.misses.includes(t)) return true;
      if (word.includes(t)) g.found.add(t); else g.misses.push(t);
    } else if (t === normalize(word)) {
      [...word].forEach((c) => g.found.add(c));
    } else if (t.length === word.length) g.misses.push('✗');
    else return false;
    m.react(word.includes(t) || t === normalize(word) ? '✅' : '❌').catch(() => {});
    if ([...word].every((c) => g.found.has(c))) finish(`🎉 ${m.author} trouve **${word.toUpperCase()}** ! **+🪙 60**`, m.author.id);
    else if (g.misses.length >= STAGES.length - 1) finish(`💀 Pendu ! Le mot était **${word.toUpperCase()}**.`);
    else msg.edit(view()).catch(() => {});
    return true;
  };
  listenChannel(channel.id, reader);
  return undefined;
}

export async function startGuessNumber(interaction, { max = 1000 } = {}) {
  const channel = await gameChannel(interaction);
  if (channelGames.has(channel.id)) return ko(interaction, 'Un jeu est déjà en cours dans ce salon.');
  const secret = 1 + Math.floor(Math.random() * max);
  const g = { tries: 0, players: new Set() };
  channelGames.set(channel.id, g);
  await channel.send({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🔢 Devine le nombre').setDescription(`J’ai caché un nombre entre **1 et ${fmt(max)}** dans le coffre. Écrivez vos propositions : je réponds 🔼 plus haut ou 🔽 plus bas.`)] });
  await interaction.reply({ content: `🔢 C’est parti dans ${channel} !`, ...PRIVATE });
  const finish = async (text, winner) => {
    stopListening(channel.id, reader);
    channelGames.delete(channel.id);
    clearTimeout(timer);
    await playedGame(interaction.guildId, [...g.players]);
    if (winner) await rewardWin(interaction.guildId, winner, 50, 'Devine le nombre');
    await channel.send(text).catch(() => {});
  };
  const timer = setTimeout(() => finish(`⌛ Personne n’a trouvé : c’était **${secret}**.`), 5 * 60_000);
  const reader = (m) => {
    if (m.author.bot || !/^\d{1,7}$/.test(m.content.trim())) return false;
    const n = Number(m.content.trim());
    g.tries += 1;
    g.players.add(m.author.id);
    if (n === secret) finish({ content: `🎉 ${m.author} trouve **${secret}** en ${g.tries} essais au total ! **+🪙 50**`, allowedMentions: { users: [m.author.id] } }, m.author.id);
    else m.react(n < secret ? '🔼' : '🔽').catch(() => {});
    return true;
  };
  listenChannel(channel.id, reader);
  return undefined;
}

// ===================== Boutons =====================

export async function handleTripotComponent(interaction) {
  const [, , id, action] = interaction.customId.split(':');
  const t = tables.get(id);
  if (!t) return interaction.reply({ content: 'Cette table est fermée.', ...PRIVATE });
  if (interaction.user.id !== t.userId) return interaction.reply({ content: 'Ce n’est pas ta table : lance ta propre partie avec /jeux.', ...PRIVATE });
  if (action === 'double') {
    if (t.hand.length > 2) return interaction.reply({ content: 'On ne double qu’au début.', ...PRIVATE });
    if ((await goldOf(t.guildId, t.userId)) < t.bet) return interaction.reply({ content: 'Pas assez d’or pour doubler.', ...PRIVATE });
    await addGold(t.guildId, t.userId, -t.bet, 'Taverne : blackjack (doublé)');
    t.bet *= 2;
    t.hand.push(t.cards.pop());
    return finishBlackjack(interaction, t);
  }
  if (action === 'hit') {
    t.hand.push(t.cards.pop());
    if (handValue(t.hand) >= 21) return finishBlackjack(interaction, t);
    return interaction.update(bjView(t));
  }
  if (action === 'stand') return finishBlackjack(interaction, t);
  return undefined;
}

// Les tables abandonnées (10 min) : la mise est perdue
setInterval(() => {
  for (const [id, t] of tables) if (Date.now() - t.at > 10 * 60_000) { tables.delete(id); addToChest(t.guildId, t.bet).catch(() => {}); }
}, 60_000).unref();

export const _test = { tables, WORDS, channelGames };
