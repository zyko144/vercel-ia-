// Outils partagés par les jeux : salle d'attente, réponses écrites dans un salon, petits utilitaires.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { botName, isBot, makeBots, who } from './bots.js';

export const PRIVATE = { flags: MessageFlags.Ephemeral };
export const MEDALS = ['🥇', '🥈', '🥉'];
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const normalize = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const tokens = (s) => normalize(s).split(' ').filter(Boolean);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const mentions = (ids) => ids.map(who).join(', ');
export const shortId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** « Pyramide » -> « P_______ » (garde la ponctuation), pour les indices. */
export function mask(text) {
  return String(text).split(/\s+/).map((word) => {
    const letters = [...word];
    return letters[0] + letters.slice(1).map((c) => (/[\p{L}\p{N}]/u.test(c) ? '_' : c)).join('');
  }).join('   ');
}

/** Classement « 🥇 @x · 5 pts ». */
export function ranking(scores, count = 10) {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, count);
  if (!sorted.length) return null;
  return sorted.map(([id, points], i) => `${MEDALS[i] ?? `\`${i + 1}.\``} <@${id}> · **${points}** pt${points > 1 ? 's' : ''}`).join('\n');
}

/** Salon où se jouent les jeux écrits (│・mini-jeux), sinon celui de la commande. */
export async function gameChannel(interaction) {
  const id = config.games.miniGamesChannelId || interaction.channelId;
  const channel = await interaction.client.channels.fetch(id).catch(() => null);
  return channel?.isTextBased?.() ? channel : interaction.channel;
}

/** Un fil pour une partie longue (loup-garou, imposteur, histoire) : le salon reste lisible. */
export async function gameThread(message, name) {
  if (!message?.startThread || message.channel?.type !== ChannelType.GuildText) return message?.channel ?? null;
  return message.startThread({ name: name.slice(0, 95), autoArchiveDuration: 60 }).catch(() => message.channel);
}

/**
 * Les noms affichés des joueurs, récupérés une fois au début de la partie.
 * Le cache des membres de Discord est souvent vide : sans ça, les menus de vote
 * affichaient « Joueur » pour tout le monde.
 */
export async function resolveNames(guild, ids) {
  const names = new Map();
  const real = ids.filter((id) => !isBot(id));
  if (guild?.members?.fetch && real.length) await guild.members.fetch({ user: real }).catch(() => null);
  for (const id of ids) {
    if (isBot(id)) {
      names.set(id, botName(id));
      continue;
    }
    const member = guild?.members?.cache?.get(id);
    const user = member?.user ?? guild?.client?.users?.cache?.get(id);
    names.set(id, member?.displayName ?? user?.globalName ?? user?.username ?? 'Joueur');
  }
  return names;
}

// ===================== Réponses écrites =====================

// salon -> fonction qui lit les messages d'une partie en cours (renvoie true si le message est pris)
const readers = new Map();

export function listenChannel(channelId, reader) {
  readers.set(channelId, reader);
}

export function stopListening(channelId, reader = null) {
  if (!reader || readers.get(channelId) === reader) readers.delete(channelId);
}

/** Message écrit dans un salon où un jeu attend des réponses. */
export function routeGameMessage(message) {
  const reader = readers.get(message.channelId);
  if (!reader) return false;
  try {
    return reader(message) !== false;
  } catch (err) {
    console.warn('[jeux] lecture :', err.message);
    return false;
  }
}

// ===================== Salle d'attente =====================

const lobbies = new Map(); // id -> salle

function voiceLine(lobby) {
  if (!lobby.voice) return null;
  if (!lobby.voice.available) return '🔇 Partie à l’écrit : l’IA vocale est occupée ailleurs.';
  return lobby.withVoice
    ? `🔊 **Avec la voix** : le narrateur raconte la partie dans <#${lobby.voice.channelId}>.`
    : '🔇 **Sans la voix** : partie entièrement à l’écrit.';
}

function lobbyEmbed(lobby, status = null) {
  return new EmbedBuilder()
    .setColor(lobby.color ?? 0x5865f2)
    .setAuthor({ name: lobby.title })
    .setTitle(status ?? `On cherche des joueurs (${lobby.players.length}/${lobby.max})`)
    .setDescription([
      lobby.description,
      voiceLine(lobby),
      '',
      `👥 **Joueurs** : ${lobby.players.length ? mentions(lobby.players) : 'personne encore'}`,
      status ? null : `Il faut au moins **${lobby.min}** joueur${lobby.min > 1 ? 's' : ''}. Départ automatique <t:${Math.floor(lobby.endsAt / 1000)}:R>, ou quand <@${lobby.hostId}> appuie sur **Lancer**.`,
    ].filter((line) => line !== null && line !== undefined).join('\n'))
    .setFooter(lobby.rulesChannelId ? { text: 'Règles complètes dans le salon des règles' } : null);
}

function lobbyButtons(lobby) {
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`g:lobby:${lobby.id}:join`).setLabel('Rejoindre').setEmoji('✋').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`g:lobby:${lobby.id}:leave`).setLabel('Quitter').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`g:lobby:${lobby.id}:start`).setLabel('Lancer').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`g:lobby:${lobby.id}:cancel`).setLabel('Annuler').setStyle(ButtonStyle.Danger),
  )];
  const extras = [];
  // L'hôte choisit si la partie est racontée à voix haute ou jouée uniquement à l'écrit.
  if (lobby.voice?.available) {
    extras.push(
      new ButtonBuilder()
        .setCustomId(`g:lobby:${lobby.id}:voice`)
        .setLabel(lobby.withVoice ? 'Voix : activée' : 'Voix : coupée')
        .setEmoji(lobby.withVoice ? '🔊' : '🔇')
        .setStyle(lobby.withVoice ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
  }
  // Tester seul : des joueurs virtuels complètent la table et jouent tout seuls.
  if (lobby.testSize) {
    extras.push(
      new ButtonBuilder()
        .setCustomId(`g:lobby:${lobby.id}:test`)
        .setLabel('Tester avec des bots')
        .setEmoji('🧪')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (extras.length) rows.push(new ActionRowBuilder().addComponents(extras));
  return rows;
}

/**
 * Ouvre une salle d'attente avec des boutons Rejoindre / Lancer, et si le jeu le
 * propose, un interrupteur « avec ou sans la voix ».
 *
 * @param {object} options
 * @param {{ available: boolean, channelId?: string, defaultOn?: boolean }} [options.voice]
 * @returns {Promise<{ players: string[], message: import('discord.js').Message, withVoice: boolean } | null>}
 *   null si la salle est annulée ou s'il n'y a pas assez de monde
 */
export async function openLobby({ channel, hostId, title, description, min = 2, max = 10, waitMs = 120_000, color, rulesChannelId, joinCheck, voice = null, testSize = 0 }) {
  const lobby = {
    id: shortId(), hostId, title, description, min, max, color, rulesChannelId, joinCheck, voice, testSize, test: false,
    withVoice: Boolean(voice?.available && (voice.defaultOn ?? true)),
    players: [hostId], endsAt: Date.now() + waitMs,
  };
  lobby.message = await channel.send({ embeds: [lobbyEmbed(lobby)], components: lobbyButtons(lobby) });
  lobbies.set(lobby.id, lobby);
  const players = await new Promise((resolve) => {
    lobby.finish = resolve;
    lobby.timer = setTimeout(() => resolve(lobby.players.length >= lobby.min ? lobby.players : null), waitMs);
  });
  clearTimeout(lobby.timer);
  lobbies.delete(lobby.id);
  const status = players
    ? (lobby.test ? '🧪 Partie de test : des bots complètent la table' : '▶️ La partie commence !')
    : lobby.cancelled ? '❌ Partie annulée' : `😕 Pas assez de joueurs (il en fallait ${lobby.min})`;
  await lobby.message.edit({ embeds: [lobbyEmbed(lobby, status)], components: [] }).catch(() => {});
  return players ? { players: [...players], message: lobby.message, withVoice: lobby.withVoice, test: lobby.test } : null;
}

export async function handleLobbyButton(interaction) {
  const [, , id, action] = interaction.customId.split(':');
  const lobby = lobbies.get(id);
  if (!lobby) return interaction.reply({ content: 'Cette salle est fermée.', ...PRIVATE });
  const userId = interaction.user.id;
  const isHost = userId === lobby.hostId || userId === config.ownerId;

  if (action === 'join') {
    if (lobby.players.includes(userId)) return interaction.reply({ content: "T'es déjà dans la partie 👍", ...PRIVATE });
    if (lobby.players.length >= lobby.max) return interaction.reply({ content: 'La partie est pleine.', ...PRIVATE });
    const problem = lobby.joinCheck ? await lobby.joinCheck(interaction) : null;
    if (problem) return interaction.reply({ content: problem, ...PRIVATE });
    lobby.players.push(userId);
  } else if (action === 'leave') {
    if (userId === lobby.hostId) return interaction.reply({ content: "T'es l'hôte : appuie sur **Annuler** pour fermer la salle.", ...PRIVATE });
    lobby.players = lobby.players.filter((id2) => id2 !== userId);
  } else if (action === 'start') {
    if (!isHost) return interaction.reply({ content: `Seul <@${lobby.hostId}> peut lancer.`, ...PRIVATE });
    if (lobby.players.length < lobby.min) return interaction.reply({ content: `Il faut au moins ${lobby.min} joueurs.`, ...PRIVATE });
    await interaction.deferUpdate();
    lobby.finish(lobby.players);
    return undefined;
  } else if (action === 'cancel') {
    if (!isHost) return interaction.reply({ content: `Seul <@${lobby.hostId}> peut annuler.`, ...PRIVATE });
    await interaction.deferUpdate();
    lobby.cancelled = true;
    lobby.finish(null);
    return undefined;
  } else if (action === 'voice') {
    if (!isHost) return interaction.reply({ content: `Seul <@${lobby.hostId}> choisit si la partie est racontée à voix haute.`, ...PRIVATE });
    lobby.withVoice = !lobby.withVoice;
  } else if (action === 'test') {
    if (!isHost) return interaction.reply({ content: `Seul <@${lobby.hostId}> peut lancer une partie de test.`, ...PRIVATE });
    await interaction.deferUpdate();
    lobby.test = true;
    lobby.players.push(...makeBots(lobby.testSize - lobby.players.length));
    lobby.finish(lobby.players);
    return undefined;
  }
  return interaction.update({ embeds: [lobbyEmbed(lobby)], components: lobbyButtons(lobby) });
}

/** Lien vers le salon des règles d'un jeu, s'il existe. */
export const rulesLink = (key) => (config.games.rules?.[key] ? `📖 Règles : <#${config.games.rules[key]}>` : null);
