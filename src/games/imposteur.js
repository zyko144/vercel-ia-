// L'imposteur : tout le monde a le même mot secret, sauf un joueur qui a un mot proche (et ne le sait pas).
// Chacun donne un indice à son tour, puis on vote pour éliminer l'imposteur.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { chatJson } from '../ai/gemini.js';
import { borrowVoiceAi, createNarrator, voiceAiChannelId, voiceAiFree } from '../voice-ai/assistant.js';
import { botName, botPause, botsPlay, humans, isBot, pickFrom, who } from './bots.js';
import { missingDmNotice, roleCard, sendRoleCards } from './roles.js';
import { PRIVATE, gameChannel, gameThread, listenChannel, mentions, normalize, openLobby, pick, resolveNames, rulesLink, shortId, shuffle, sleep, stopListening, tokens } from './common.js';

const CLUE_MS = 45_000;
const VOTE_MS = 60_000;
const GUESS_MS = 25_000;
const READY_MS = 8_000; // le temps de lire son MP avant le premier tour
// Sans limite, une partie où plus personne ne vote tournerait pour toujours
// (égalité à chaque tour). Au bout de ces tours, l'imposteur gagne.
const MAX_ROUNDS = 6;
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

// Indices de repli, assez vagues pour ne rien trahir (et ne rien aider).
const VAGUE_CLUES = ['assez connu', 'tout le monde connaît', 'on en parle souvent', 'ça dépend des goûts', 'plutôt populaire', 'classique', 'ça me parle', 'je vois bien'];

/** Des indices pour les bots, sur le mot des civils et sur celui de l'imposteur. */
async function botClues(civil, impostorWord) {
  try {
    const data = await chatJson({
      system: "Tu joues au jeu de l'imposteur (Undercover) avec des amis.",
      prompt: `Pour chacun des deux mots, donne 6 indices différents de 1 à 3 mots, en français, sans jamais écrire le mot lui-même ni une partie de ce mot.
Mot A : « ${civil} »
Mot B : « ${impostorWord} »
Les indices doivent rester assez vagues pour qu'on hésite entre A et B.`,
      schema: {
        type: 'object',
        properties: { a: { type: 'array', items: { type: 'string' } }, b: { type: 'array', items: { type: 'string' } } },
        required: ['a', 'b'],
      },
      thinking: 'minimal',
      exactThinking: true,
    });
    const clean = (list, word) => (list ?? []).map((c) => String(c).trim()).filter((c) => c && tokens(c).length <= 5 && !normalize(c).includes(normalize(word)));
    const civilClues = clean(data?.a, civil);
    const impostorClues = clean(data?.b, impostorWord);
    if (civilClues.length >= 3 && impostorClues.length >= 3) return { civil: civilClues, imposteur: impostorClues };
  } catch (err) {
    console.warn('[imposteur] indices des bots :', err.message);
  }
  return { civil: VAGUE_CLUES, imposteur: VAGUE_CLUES };
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
  const free = voiceAiFree();
  const lobby = await openLobby({
    channel,
    hostId: interaction.user.id,
    title: "🕵️ L'IMPOSTEUR",
    description: [
      `${info.emoji} Thème : **${info.label}**`,
      "Tout le monde reçoit le même mot secret… sauf l'imposteur, qui a un mot proche **et ne le sait pas**.",
      'Votre rôle arrive en **message privé** dès le départ. Un indice chacun, puis on vote.',
      rulesLink('imposteur'),
    ].filter(Boolean).join('\n'),
    min: 3,
    max: 10,
    waitMs: 90_000,
    color: 0x9b59b6,
    voice: { available: free.ok, channelId: voiceAiChannelId(), defaultOn: true },
    testSize: 4,
  });
  if (!lobby) return undefined;

  const [civil, impostorWord] = await wordPair(theme);
  const players = shuffle(lobby.players);
  const impostor = pick(players);
  const game = {
    id: shortId(), hostId: interaction.user.id, theme, civil, impostorWord, impostor,
    players, alive: [...players], clues: new Map(), votes: new Map(), round: 0, stopped: false, test: lobby.test,
  };
  if (game.test) game.botClues = await botClues(civil, impostorWord);
  game.thread = await gameThread(lobby.message, `🕵️ Imposteur · ${info.label}`);
  game.names = await resolveNames(game.thread.guild ?? interaction.guild, players);
  games.set(game.id, game);
  console.log(`[imposteur] partie ${game.id} : ${players.length} joueurs · « ${civil} » / « ${impostorWord} »`);

  if (lobby.withVoice && voiceAiFree().ok) {
    try {
      game.release = await borrowVoiceAi('imposteur');
      game.narrator = createNarrator({ voice: 'Puck', style: "Tu animes une partie du jeu de l'imposteur entre potes : ton complice, un peu taquin." });
    } catch (err) {
      console.warn('[imposteur] narrateur :', err.message);
    }
  }

  // Les mots partent tous en même temps, avant même le premier message du fil.
  // Tout le monde reçoit la même carte « Mot secret » : l'imposteur ne sait pas
  // qu'il l'est (c'est tout le sel du jeu), le message ne doit donc rien trahir.
  const { failed } = await sendRoleCards(interaction.client, humans(players).map((userId) => ({
    userId,
    card: 'motsecret',
    color: 0x9b59b6,
    author: `🕵️ L'IMPOSTEUR · ${info.emoji} ${info.label}`,
    title: '🤫 Ton mot secret',
    description: `# ${userId === impostor ? impostorWord : civil}`,
    fields: [
      ['🎯 Le but', "Tout le monde a ce mot… sauf **un joueur**, qui a un mot proche. C'est l'imposteur, **et il ne le sait pas** : ça peut être toi."],
      ['🗣️ Ton indice', '**1 à 5 mots**, sans dire ton mot. Assez clair pour que les autres te reconnaissent, assez flou pour que l’imposteur ne devine rien.'],
      ['🔁 Déroulement', `Un indice chacun son tour (${CLUE_MS / 1000} s), puis on vote. Si les indices des autres ne collent pas avec ton mot… c’est peut-être toi l’intrus.`],
    ],
    link: game.thread.url,
    footer: `${players.length} joueurs · un seul imposteur · ne montre ton mot à personne`,
  })));

  await game.thread.send({
    content: mentions(players),
    embeds: [new EmbedBuilder().setColor(0x9b59b6).setAuthor({ name: "🕵️ L'IMPOSTEUR" }).setTitle('📬 Vos rôles sont partis en message privé')
      .setDescription([
        "Regardez vos MP : votre mot secret vous attend. L'un de vous a un mot légèrement différent : c'est l'imposteur, mais **il ne le sait pas**.",
        missingDmNotice(failed, 'Voir mon mot'),
        game.narrator ? `🔊 Le narrateur commente la partie dans <#${voiceAiChannelId()}>.` : null,
        'Premier tour d’indices dans quelques secondes.',
      ].filter(Boolean).join('\n'))],
    components: [wordButton(game)],
    allowedMentions: { users: humans(players) },
  }).catch(() => {});
  await say(game, `${players.length} joueurs, un imposteur. Les mots sont distribués. Que le meilleur menteur gagne.`);
  await sleep(READY_MS);
  play(game).catch((err) => {
    console.warn('[imposteur] partie :', err.message);
    finish(game, null, `bug (${err.message})`).catch(() => {});
  });
  return undefined;
}

/** Fait parler le narrateur, s'il y en a un. */
async function say(game, text) {
  if (game?.narrator) await game.narrator.say(text).catch(() => {});
}

async function play(game) {
  while (!game.stopped) {
    if (game.round >= MAX_ROUNDS) {
      await finish(game, 'imposteur', `personne ne l'a trouvé en ${MAX_ROUNDS} tours`);
      return;
    }
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
  await say(game, game.round === 1 ? 'Premier tour. Un indice chacun, et pas de bêtise.' : `Tour ${game.round}. On recommence, et cette fois on regarde qui hésite.`);
  await game.thread.send({
    embeds: [new EmbedBuilder().setColor(0x9b59b6).setTitle(`🗣️ Tour ${game.round} : les indices`)
      .setDescription(`Chacun à son tour écrit **un indice** (1 à 5 mots) sur son mot, sans le dire.\nOrdre : ${order.map((id, i) => `**${i + 1}.** ${who(id)}`).join(' · ')}`)],
    allowedMentions: { parse: [] },
  }).catch(() => {});
  for (const userId of order) {
    if (game.stopped) return;
    if (isBot(userId)) {
      await botPause();
      if (game.stopped) return;
      const pool = game.botClues?.[userId === game.impostor ? 'imposteur' : 'civil'] ?? VAGUE_CLUES;
      const used = new Set([...game.clues.values()].flat());
      const clue = pickFrom(pool, [...used]) ?? pickFrom(pool);
      await game.thread.send({ content: `${botName(userId)} : « ${clue} »`, allowedMentions: { parse: [] } }).catch(() => {});
      game.clues.set(userId, [...(game.clues.get(userId) ?? []), clue]);
      continue;
    }
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
      game.thread.send({ content: `👉 ${who(userId)}, ton indice (fin <t:${Math.ceil((Date.now() + CLUE_MS) / 1000)}:R>)`, allowedMentions: { users: humans([userId]) } }).catch(() => {});
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
    .addOptions(game.alive.map((id) => ({
      label: (game.names?.get(id) ?? (isBot(id) ? botName(id) : 'Joueur')).slice(0, 100),
      value: id,
      description: `Indices : ${(game.clues.get(id) ?? []).join(' / ') || '—'}`.slice(0, 100),
    }))));
}

/**
 * Le vote d'un bot. Ses indices viennent du vrai mot de chacun, donc un civil
 * « sent » l'intrus de temps en temps ; sinon il suit le suspect du moment,
 * comme on le fait tous. L'imposteur, lui, suit la foule pour ne pas se faire remarquer.
 */
function botVote(game, bot) {
  const counts = new Map();
  for (const [voter, target] of game.votes) if (voter !== bot && target !== bot) counts.set(target, (counts.get(target) ?? 0) + 1);
  const leader = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (bot !== game.impostor && game.alive.includes(game.impostor) && Math.random() < 0.4 + 0.1 * game.round) return game.impostor;
  if (leader && Math.random() < 0.6) return leader;
  return pickFrom(game.alive, [bot]);
}

/** Vote : le joueur le plus désigné est éliminé (égalité : personne). */
async function voteRound(game) {
  game.votes = new Map();
  const recap = game.alive.map((id) => `${who(id)} : ${(game.clues.get(id) ?? []).map((c) => `« ${c} »`).join(' · ')}`).join('\n');
  game.voteMessage = await game.thread.send({
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🗳️ Qui est l\'imposteur ?')
      .setDescription(`${recap}\n\nVotez avec le menu (vous pouvez changer d'avis). Fin <t:${Math.ceil((Date.now() + VOTE_MS) / 1000)}:R>.`)],
    components: [voteMenu(game)],
    allowedMentions: { parse: [] },
  }).catch(() => null);
  const ballot = Symbol('vote');
  game.ballot = ballot;
  // Les bots votent après un petit délai, chacun à sa façon (voir botVote).
  botsPlay(game.alive, () => !game.stopped && game.ballot === ballot && game.voteDone, (bot) => {
    game.votes.set(bot, botVote(game, bot));
    if (game.alive.every((id) => game.votes.has(id))) game.voteDone?.();
  });
  await new Promise((resolve) => {
    game.voteDone = resolve;
    game.voteTimer = setTimeout(resolve, VOTE_MS);
  });
  game.ballot = null;
  clearTimeout(game.voteTimer);
  game.voteDone = null;
  await game.voteMessage?.edit({ components: [] }).catch(() => {});
  if (game.stopped) return null;

  const counts = new Map();
  for (const target of game.votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const detail = sorted.map(([id, n]) => `${who(id)} : ${n}`).join(' · ') || 'aucun vote';
  if (!sorted.length || (sorted[1] && sorted[1][1] === sorted[0][1])) {
    await game.thread.send({ content: `⚖️ Égalité (${detail}) : personne n'est éliminé, on refait un tour d'indices.`, allowedMentions: { parse: [] } }).catch(() => {});
    return null;
  }
  const [out] = sorted[0];
  game.alive = game.alive.filter((id) => id !== out);
  const wasImpostor = out === game.impostor;
  await say(game, wasImpostor ? "Éliminé... et c'était bien l'imposteur ! Belle lecture." : "Éliminé... mais c'était un innocent. Aïe.");
  await game.thread.send({
    // Pas de mot révélé quand c'est un civil : l'imposteur l'apprendrait et gagnerait d'office.
    content: `🚪 ${who(out)} est éliminé (${detail}).\n${wasImpostor ? "🎯 **C'était l'imposteur !**" : `😬 Raté, ${who(out)} était un civil. L'imposteur court toujours…`}`,
    allowedMentions: { parse: [] },
  }).catch(() => {});
  return out;
}

/** L'imposteur démasqué peut encore gagner s'il devine le mot des autres. */
async function lastChance(game) {
  await game.thread.send({
    content: `🕵️ ${who(game.impostor)}, dernière chance : ton mot était **${game.impostorWord}**. Devine le mot des autres en <t:${Math.ceil((Date.now() + GUESS_MS) / 1000)}:R> et tu gagnes quand même !`,
    allowedMentions: { users: humans([game.impostor]) },
  }).catch(() => {});
  if (isBot(game.impostor)) {
    // Un bot ne connaît pas le mot des civils : il tombe juste une fois sur trois.
    await botPause();
    const guess = Math.random() < 0.33 ? game.civil : game.impostorWord;
    await game.thread.send({ content: `${botName(game.impostor)} tente : « ${guess} »`, allowedMentions: { parse: [] } }).catch(() => {});
    const lucky = normalize(guess) === normalize(game.civil);
    await finish(game, lucky ? 'imposteur' : 'civils', lucky ? "l'imposteur a deviné le mot secret" : "l'imposteur a été démasqué");
    return;
  }
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
  if (game.narrator) {
    await say(game, winners === 'imposteur' ? "L'imposteur s'en sort. Bien joué à lui." : 'Les civils ont démasqué leur imposteur. Partie terminée.');
    game.narrator.close();
    game.narrator = null;
  }
  await game.release?.().catch(() => {});
  game.release = null;
  const civils = game.players.filter((id) => id !== game.impostor);
  const title = winners === 'imposteur' ? "🕵️ Victoire de l'imposteur !" : winners === 'civils' ? '🎉 Victoire des civils !' : '⏹️ Partie arrêtée';
  // La carte de l'imposteur (ou des civils) se retourne pour la révélation finale.
  const art = roleCard(winners === 'civils' ? 'civil' : 'imposteur');
  const clues = (id) => (game.clues.get(id) ?? []).map((c) => `« ${c} »`).join(' · ') || '—';
  await game.thread?.send({
    embeds: [new EmbedBuilder().setColor(winners === 'imposteur' ? 0xed4245 : 0x57f287).setAuthor({ name: "🕵️ L'IMPOSTEUR" }).setTitle(title)
      .setDescription([
        reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.` : null,
        '',
        `🕵️ **Imposteur** : ${who(game.impostor)} · mot **${game.impostorWord}**`,
        `-# Ses indices : ${clues(game.impostor)}`,
        `👥 **Civils** : ${mentions(civils)} · mot **${game.civil}**`,
        game.round ? `-# ${game.round} tour${game.round > 1 ? 's' : ''} d'indices` : null,
      ].filter((line) => line !== null).join('\n'))
      .setImage(art.url)],
    files: art.files,
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
    return interaction.reply({
      content: `🤫 Ton mot secret : **${word}**\n-# Un des joueurs a un mot différent… peut-être toi.`,
      ...PRIVATE,
    });
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
    await interaction.reply({ content: `🗳️ Vote enregistré contre ${who(target)} (tu peux changer).`, ...PRIVATE });
    if (game.alive.every((id) => game.votes.has(id))) game.voteDone?.();
  }
  return undefined;
}
