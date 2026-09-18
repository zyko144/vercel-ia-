// L'imposteur : tout le monde a le même mot secret, sauf un joueur qui a un mot proche (et ne le sait pas).
// Chacun donne un indice à son tour, puis on vote pour éliminer l'imposteur.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { chatJson } from '../ai/gemini.js';
import { PRIVATE, gameChannel, gameThread, listenChannel, mentions, normalize, openLobby, pick, rulesLink, shortId, shuffle, sleep, stopListening, tokens } from './common.js';

const CLUE_MS = 45_000;
const VOTE_MS = 60_000;
const GUESS_MS = 25_000;
const games = new Map(); // id -> partie

export const IMPOSTOR_THEMES = {
  tout: { label: 'Tout', emoji: '🎲', hint: 'objets, nourriture, lieux, célébrités, rap français, jeux vidéo, animés' },
  rapfr: { label: 'Rap FR', emoji: '🎤', hint: 'rappeurs français, sons de rap français connus, albums' },
  bouffe: { label: 'Bouffe', emoji: '🍔', hint: 'plats, fast-food, desserts, boissons' },
  jeux: { label: 'Jeux vidéo', emoji: '🎮', hint: 'jeux vidéo connus, personnages de jeux' },
  anime: { label: 'Animés', emoji: '🍥', hint: 'animés et personnages d\'animés' },
  foot: { label: 'Foot', emoji: '⚽', hint: 'joueurs de foot, clubs, stades' },
  lieux: { label: 'Lieux', emoji: '🗺️', hint: 'villes, pays, endroits du quotidien' },
};

// Si l'IA ne répond pas : quelques paires sûres
const FALLBACK = [
  ['Pizza', 'Burger'], ['Jul', 'Naps'], ['Fortnite', 'Minecraft'], ['Naruto', 'One Piece'], ['Plage', 'Piscine'],
  ['Mbappé', 'Neymar'], ['Coca', 'Pepsi'], ['Chat', 'Chien'], ['Paris', 'Marseille'], ['Tacos', 'Kebab'],
  ['PNL', 'Ninho'], ['Instagram', 'TikTok'], ['Avion', 'Hélicoptère'], ['Netflix', 'YouTube'], ['Chocolat', 'Caramel'],
];

async function wordPair(theme) {
  const info = IMPOSTOR_THEMES[theme] ?? IMPOSTOR_THEMES.tout;
  try {
    const data = await chatJson({
      system: 'Tu prépares des parties du jeu « Undercover » pour des jeunes Français de 15-25 ans.',
      prompt: `Donne UNE paire de mots pour le jeu de l'imposteur, thème : ${info.hint}.
- Les deux mots doivent être proches (même catégorie, faciles à confondre avec un indice vague) mais différents.
- Mots courts (1 à 3 mots), très connus de tous, en français.
- Varie : pas toujours les exemples les plus évidents.`,
      schema: { type: 'object', properties: { civil: { type: 'string' }, imposteur: { type: 'string' } }, required: ['civil', 'imposteur'] },
      thinking: 'minimal',
      exactThinking: true,
    });
    if (data?.civil && data?.imposteur && normalize(data.civil) !== normalize(data.imposteur)) return [data.civil.trim(), data.imposteur.trim()];
  } catch (err) {
    console.warn('[imposteur] IA :', err.message);
  }
  return shuffle(pick(FALLBACK));
}

const wordButton = (game) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`g:imp:${game.id}:word`).setLabel('Voir mon mot').setEmoji('👁️').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`g:imp:${game.id}:stop`).setLabel('Arrêter').setStyle(ButtonStyle.Secondary),
);

/** /jeu-imposteur */
export async function startImpostor(interaction, theme = 'tout') {
  const channel = await gameChannel(interaction);
  await interaction.reply({ content: `🕵️ La salle d'attente est ouverte dans <#${channel.id}> !`, ...PRIVATE });
  const info = IMPOSTOR_THEMES[theme] ?? IMPOSTOR_THEMES.tout;
  const lobby = await openLobby({
    channel,
    hostId: interaction.user.id,
    title: "🕵️ L'IMPOSTEUR",
    description: `${info.emoji} Thème : **${info.label}**\nTout le monde reçoit le même mot secret… sauf l'imposteur, qui a un mot proche **et ne le sait pas**. Un indice chacun, puis on vote.\n${rulesLink('imposteur') ?? ''}`,
    min: 3,
    max: 10,
    waitMs: 90_000,
    color: 0x9b59b6,
  });
  if (!lobby) return undefined;

  const [civil, impostorWord] = await wordPair(theme);
  const players = shuffle(lobby.players);
  const impostor = pick(players);
  const game = {
    id: shortId(), hostId: interaction.user.id, theme, civil, impostorWord, impostor,
    players, alive: [...players], clues: new Map(), votes: new Map(), round: 0, stopped: false,
  };
  game.thread = await gameThread(lobby.message, `🕵️ Imposteur · ${info.label}`);
  games.set(game.id, game);
  console.log(`[imposteur] partie ${game.id} : ${players.length} joueurs · « ${civil} » / « ${impostorWord} »`);

  await game.thread.send({
    content: mentions(players),
    embeds: [new EmbedBuilder().setColor(0x9b59b6).setAuthor({ name: "🕵️ L'IMPOSTEUR" }).setTitle('Regardez votre mot secret')
      .setDescription("Appuyez sur **Voir mon mot** (personne d'autre ne le voit).\nL'un de vous a un mot légèrement différent : c'est l'imposteur, mais **il ne le sait pas**.\nLa partie commence dans 20 secondes.")],
    components: [wordButton(game)],
    allowedMentions: { users: players },
  }).catch(() => {});
  await sleep(20_000);
  play(game).catch((err) => {
    console.warn('[imposteur] partie :', err.message);
    finish(game, null, `bug (${err.message})`).catch(() => {});
  });
  return undefined;
}

async function play(game) {
  while (!game.stopped) {
    game.round++;
    await clueRound(game);
    if (game.stopped) return;
    const out = await voteRound(game);
    if (game.stopped) return;
    if (out === game.impostor) {
      await lastChance(game);
      return;
    }
    if (game.alive.length <= 2) {
      await finish(game, 'imposteur', "il ne reste plus que deux joueurs : l'imposteur a survécu");
      return;
    }
  }
}

/** Chaque joueur, à son tour, écrit un indice (un à cinq mots) dans le fil. */
async function clueRound(game) {
  const order = shuffle(game.alive);
  await game.thread.send({
    embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle(`🗣️ Tour ${game.round} : les indices`)
      .setDescription(`Chacun à son tour écrit **un indice** (1 à 5 mots) sur son mot, sans le dire.\nOrdre : ${order.map((id, i) => `**${i + 1}.** <@${id}>`).join(' · ')}`)],
    allowedMentions: { parse: [] },
  }).catch(() => {});
  for (const userId of order) {
    if (game.stopped) return;
    const clue = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), CLUE_MS);
      const reader = (message) => {
        if (message.author.id !== userId) return false;
        const text = message.content.trim();
        if (!text || tokens(text).length > 5) {
          message.reply({ content: 'Un indice de **1 à 5 mots** stp 🙏', allowedMentions: { parse: [] } }).catch(() => {});
          return true;
        }
        // Dire son propre mot, c'est perdu d'avance
        const own = normalize(userId === game.impostor ? game.impostorWord : game.civil);
        if (normalize(text).includes(own)) {
          message.reply({ content: "🚫 T'as pas le droit de dire ton mot ! Donne un autre indice.", allowedMentions: { parse: [] } }).catch(() => {});
          return true;
        }
        clearTimeout(timer);
        message.react('✅').catch(() => {});
        resolve(text);
        return true;
      };
      game.reader = reader;
      listenChannel(game.thread.id, reader);
      game.thread.send({ content: `👉 <@${userId}>, ton indice (fin <t:${Math.ceil((Date.now() + CLUE_MS) / 1000)}:R>)`, allowedMentions: { users: [userId] } }).catch(() => {});
      game.skipClue = () => { clearTimeout(timer); resolve(null); };
    });
    stopListening(game.thread.id, game.reader);
    const list = game.clues.get(userId) ?? [];
    list.push(clue ?? '(rien dit)');
    game.clues.set(userId, list);
  }
}

function voteMenu(game) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`g:imp:${game.id}:vote`)
    .setPlaceholder("Qui est l'imposteur ?")
    .addOptions(game.alive.map((id) => {
      const member = game.thread.guild?.members.cache.get(id);
      return { label: (member?.displayName ?? member?.user.username ?? id).slice(0, 100), value: id, description: `Indices : ${(game.clues.get(id) ?? []).join(' / ')}`.slice(0, 100) };
    })));
}

/** Vote : le joueur le plus désigné est éliminé (égalité : personne). */
async function voteRound(game) {
  game.votes = new Map();
  const recap = game.alive.map((id) => `<@${id}> : ${(game.clues.get(id) ?? []).map((c) => `« ${c} »`).join(' · ')}`).join('\n');
  game.voteMessage = await game.thread.send({
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🗳️ Qui est l\'imposteur ?')
      .setDescription(`${recap}\n\nVotez avec le menu (vous pouvez changer d'avis). Fin <t:${Math.ceil((Date.now() + VOTE_MS) / 1000)}:R>.`)],
    components: [voteMenu(game)],
    allowedMentions: { parse: [] },
  }).catch(() => null);
  await new Promise((resolve) => {
    game.voteDone = resolve;
    game.voteTimer = setTimeout(resolve, VOTE_MS);
  });
  clearTimeout(game.voteTimer);
  game.voteDone = null;
  await game.voteMessage?.edit({ components: [] }).catch(() => {});
  if (game.stopped) return null;

  const counts = new Map();
  for (const target of game.votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const detail = sorted.map(([id, n]) => `<@${id}> : ${n}`).join(' · ') || 'aucun vote';
  if (!sorted.length || (sorted[1] && sorted[1][1] === sorted[0][1])) {
    await game.thread.send({ content: `⚖️ Égalité (${detail}) : personne n'est éliminé, on refait un tour d'indices.`, allowedMentions: { parse: [] } }).catch(() => {});
    return null;
  }
  const [out] = sorted[0];
  game.alive = game.alive.filter((id) => id !== out);
  const wasImpostor = out === game.impostor;
  await game.thread.send({
    content: `🚪 <@${out}> est éliminé (${detail}).\n${wasImpostor ? "🎯 **C'était l'imposteur !**" : `😬 Raté, <@${out}> était innocent (son mot : **${game.civil}**).`}`,
    allowedMentions: { parse: [] },
  }).catch(() => {});
  return out;
}

/** L'imposteur démasqué peut encore gagner s'il devine le mot des autres. */
async function lastChance(game) {
  await game.thread.send({
    content: `🕵️ <@${game.impostor}>, dernière chance : ton mot était **${game.impostorWord}**. Devine le mot des autres en <t:${Math.ceil((Date.now() + GUESS_MS) / 1000)}:R> et tu gagnes quand même !`,
    allowedMentions: { users: [game.impostor] },
  }).catch(() => {});
  const found = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), GUESS_MS);
    const reader = (message) => {
      if (message.author.id !== game.impostor) return false;
      clearTimeout(timer);
      const ok = normalize(message.content) === normalize(game.civil) || tokens(game.civil).every((word) => tokens(message.content).includes(word));
      resolve(ok);
      return true;
    };
    game.reader = reader;
    listenChannel(game.thread.id, reader);
  });
  stopListening(game.thread.id, game.reader);
  await finish(game, found ? 'imposteur' : 'civils', found ? "l'imposteur a deviné le mot secret" : "l'imposteur a été démasqué");
}

async function finish(game, winners, reason) {
  if (game.ended) return;
  game.ended = true;
  game.stopped = true;
  clearTimeout(game.voteTimer);
  game.voteDone?.();
  game.skipClue?.();
  stopListening(game.thread?.id);
  games.delete(game.id);
  const civils = game.players.filter((id) => id !== game.impostor);
  const title = winners === 'imposteur' ? "🕵️ Victoire de l'imposteur !" : winners === 'civils' ? '🎉 Victoire des civils !' : '⏹️ Partie arrêtée';
  await game.thread?.send({
    embeds: [new EmbedBuilder().setColor(winners === 'imposteur' ? 0xed4245 : 0x57f287).setAuthor({ name: "🕵️ L'IMPOSTEUR" }).setTitle(title)
      .setDescription([
        reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.` : null,
        `🕵️ Imposteur : <@${game.impostor}> (mot : **${game.impostorWord}**)`,
        `👥 Civils : ${mentions(civils)} (mot : **${game.civil}**)`,
      ].filter(Boolean).join('\n'))],
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

export async function handleImpostorComponent(interaction) {
  const [, , id, action] = interaction.customId.split(':');
  const game = games.get(id);
  if (!game) return interaction.reply({ content: 'Cette partie est finie.', ...PRIVATE });
  const userId = interaction.user.id;

  if (action === 'word') {
    if (!game.players.includes(userId)) return interaction.reply({ content: 'Tu joues pas dans cette partie 😉', ...PRIVATE });
    const word = userId === game.impostor ? game.impostorWord : game.civil;
    return interaction.reply({ content: `🤫 Ton mot secret : **${word}**\n-# Personne d'autre ne voit ce message. Peut-être que t'es l'imposteur… ou pas.`, ...PRIVATE });
  }
  if (action === 'stop') {
    if (userId !== game.hostId && !interaction.memberPermissions?.has('ManageGuild')) return interaction.reply({ content: `Seul <@${game.hostId}> peut arrêter.`, ...PRIVATE });
    await interaction.deferUpdate();
    return finish(game, null, 'partie arrêtée par l\'hôte');
  }
  if (action === 'vote') {
    if (!game.alive.includes(userId)) return interaction.reply({ content: 'Seuls les joueurs encore en jeu votent.', ...PRIVATE });
    const target = interaction.values[0];
    if (target === userId) return interaction.reply({ content: 'Tu peux pas voter contre toi-même 😅', ...PRIVATE });
    game.votes.set(userId, target);
    await interaction.reply({ content: `🗳️ Vote enregistré contre <@${target}> (tu peux changer).`, ...PRIVATE });
    if (game.alive.every((id) => game.votes.has(id))) game.voteDone?.();
  }
  return undefined;
}
