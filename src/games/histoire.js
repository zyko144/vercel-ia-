// Histoire dont vous êtes les héros : l'IA raconte une aventure, s'arrête, et chaque joueur dit ce que fait son personnage.
// À l'écrit (dans un fil, avec le narrateur à voix haute si possible) ou 100 % à l'oral avec l'IA vocale en maître du jeu.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { chat } from '../ai/gemini.js';
import { borrowVoiceAi, createNarrator, startVoiceSession, voiceAiChannelId, voiceAiFree } from '../voice-ai/assistant.js';
import { PRIVATE, gameChannel, gameThread, listenChannel, mentions, openLobby, rulesLink, shortId, stopListening } from './common.js';

const ACTION_MS = 90_000;
const MIN_WAIT_MS = 15_000;
const games = new Map(); // id -> partie

export const STORY_THEMES = {
  fantasy: { label: 'Fantasy', emoji: '🐉', pitch: 'un monde médiéval fantastique avec des dragons, de la magie et un royaume en danger' },
  horreur: { label: 'Horreur', emoji: '👻', pitch: 'une nuit d\'horreur dans un lieu abandonné, avec une présence qui rôde' },
  braquage: { label: 'Braquage', emoji: '💰', pitch: 'le braquage d\'un casino ultra-sécurisé à Monaco, façon La Casa de Papel' },
  zombie: { label: 'Zombies', emoji: '🧟', pitch: 'une apocalypse zombie qui démarre en pleine ville, en France' },
  espace: { label: 'Espace', emoji: '🚀', pitch: 'un vaisseau spatial en perdition au fond de la galaxie' },
  anime: { label: 'Animé', emoji: '🍥', pitch: 'un univers d\'animé shōnen avec des pouvoirs, un tournoi et un grand méchant' },
  rap: { label: 'Rap game', emoji: '🎤', pitch: 'l\'ascension d\'un groupe de jeunes rappeurs de leur quartier jusqu\'au Stade de France' },
};

export const STORY_LENGTHS = { courte: 5, normale: 8, longue: 12 };

function system(game) {
  const theme = STORY_THEMES[game.theme] ?? STORY_THEMES.fantasy;
  return [
    `Tu es le maître du jeu d'une aventure interactive sur Discord, pour des jeunes Français. Univers : ${theme.pitch}.`,
    `Les héros sont les joueurs : ${game.names.join(', ')}. Tu les appelles par leur prénom.`,
    'Chaque chapitre fait 600 à 900 caractères maximum, écrit au présent, vivant, drôle quand il faut, avec du suspense.',
    'Intègre ce que chaque joueur a décidé (même les idées farfelues, avec des conséquences logiques : les actions ont des risques).',
    'Termine chaque chapitre par une situation claire qui demande une décision, puis « Que faites-vous ? ».',
    'Pas de titre, pas de liste, pas de markdown lourd : juste le récit (le gras est permis pour un nom ou un objet important).',
    'Contenu adapté à un serveur entre amis : pas de violence gratuite détaillée ni de contenu sexuel.',
  ].join('\n');
}

const storyButtons = (game) => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`g:hist:${game.id}:next`).setLabel('Suite').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId(`g:hist:${game.id}:stop`).setLabel('Arrêter').setStyle(ButtonStyle.Danger),
)];

/** /jeu-histoire */
export async function startStory(interaction, { theme = 'fantasy', length = 'normale', mode = 'texte' }) {
  const info = STORY_THEMES[theme] ?? STORY_THEMES.fantasy;
  if (mode === 'vocal') return startVoiceStory(interaction, theme);

  const channel = await gameChannel(interaction);
  await interaction.reply({ content: `📖 La salle d'attente est ouverte dans <#${channel.id}> !`, ...PRIVATE });
  const voice = voiceAiFree();
  const lobby = await openLobby({
    channel,
    hostId: interaction.user.id,
    title: '📖 HISTOIRE DONT VOUS ÊTES LES HÉROS',
    description: [
      `${info.emoji} Univers : **${info.label}** · ${STORY_LENGTHS[length] ?? 8} chapitres`,
      "L'IA raconte, s'arrête, et chacun écrit ce que fait son personnage. Elle continue avec vos choix.",
      voice.ok ? `🔊 Le narrateur lit aussi chaque chapitre à voix haute dans <#${voiceAiChannelId()}>.` : null,
      rulesLink('histoire'),
    ].filter(Boolean).join('\n'),
    min: 1,
    max: 8,
    waitMs: 90_000,
    color: 0x8e44ad,
  });
  if (!lobby) return undefined;

  const game = {
    id: shortId(), hostId: interaction.user.id, theme, players: lobby.players, chapters: STORY_LENGTHS[length] ?? 8,
    names: lobby.players.map((id) => interaction.guild.members.cache.get(id)?.displayName ?? 'Héros'),
    history: [], chapter: 0, stopped: false, narrator: null, release: null,
  };
  games.set(game.id, game);
  game.thread = await gameThread(lobby.message, `📖 ${info.label} · ${game.names[0]}`);
  if (voiceAiFree().ok) {
    try {
      game.release = await borrowVoiceAi('histoire');
      game.narrator = createNarrator({ voice: 'Kore', style: 'Tu es une conteuse captivante qui raconte une aventure à des amis.' });
    } catch (err) {
      console.warn('[histoire] narrateur :', err.message);
    }
  }
  run(game).catch(async (err) => {
    console.warn('[histoire] partie :', err.message);
    await game.thread.send({ content: `❌ L'histoire s'arrête sur un bug (${err.message}).` }).catch(() => {});
    end(game).catch(() => {});
  });
  return undefined;
}

async function run(game) {
  let prompt = `Commence l'aventure : présente la situation de départ et les héros (${game.names.join(', ')}), en 700 caractères maximum, puis demande ce qu'ils font.`;
  while (!game.stopped && game.chapter < game.chapters) {
    game.chapter++;
    const last = game.chapter === game.chapters;
    const { text } = await chat({
      history: game.history,
      content: [{ type: 'text', text: last ? `${prompt}\n\nC'est le DERNIER chapitre : donne une vraie fin à l'histoire (réussite ou échec selon leurs choix), sans poser de question.` : prompt }],
      system: system(game),
      web: false,
      thinking: 'low',
      exactThinking: true,
    });
    const story = text.trim() || "Le brouillard s'épaissit… (l'IA a perdu le fil, écrivez quand même ce que vous faites).";
    game.history.push({ role: 'user', text: prompt }, { role: 'model', text: story });
    game.history = game.history.slice(-16);
    await game.thread.send({
      content: game.chapter === 1 ? mentions(game.players) : undefined,
      embeds: [new EmbedBuilder().setColor(0x8e44ad).setAuthor({ name: `📖 Chapitre ${game.chapter}/${game.chapters}${last ? ' · FIN' : ''}` }).setDescription(story.slice(0, 4000))
        .setFooter(last ? null : { text: 'Écrivez ce que fait votre personnage (un message chacun)' })],
      components: last ? [] : storyButtons(game),
      allowedMentions: game.chapter === 1 ? { users: game.players } : { parse: [] },
    }).catch(() => {});
    if (game.narrator) game.narrator.say(story.replace(/\*\*/g, '')).catch(() => {});
    if (last) break;

    const actions = await collectActions(game);
    if (game.stopped) return;
    prompt = actions.size
      ? `Ce que font les héros :\n${[...actions.entries()].map(([id, action]) => `- ${game.names[game.players.indexOf(id)]} : ${action}`).join('\n')}\n${game.players.filter((id) => !actions.has(id)).map((id) => `- ${game.names[game.players.indexOf(id)]} : ne fait rien de spécial`).join('\n')}\nRaconte la suite (chapitre ${game.chapter + 1}).`
      : `Les héros hésitent et ne font rien : raconte ce qui leur arrive quand même (chapitre ${game.chapter + 1}).`;
  }
  await end(game);
}

/** Chaque joueur écrit ce que fait son personnage ; on continue quand tout le monde a joué ou à la fin du temps. */
function collectActions(game) {
  const actions = new Map();
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      clearInterval(check);
      stopListening(game.thread.id, reader);
      game.skip = null;
      resolve(actions);
    };
    const reader = (message) => {
      if (!game.players.includes(message.author.id)) return false;
      const text = message.content.trim();
      if (!text) return true;
      actions.set(message.author.id, text.slice(0, 300));
      message.react('✍️').catch(() => {});
      return true;
    };
    const timer = setTimeout(done, ACTION_MS);
    const check = setInterval(() => {
      if (game.stopped || (actions.size === game.players.length && Date.now() - startedAt >= MIN_WAIT_MS / 3)) done();
    }, 1000);
    game.skip = done;
    listenChannel(game.thread.id, reader);
  });
}

async function end(game) {
  if (game.ended) return;
  game.ended = true;
  game.stopped = true;
  game.skip?.();
  games.delete(game.id);
  stopListening(game.thread?.id);
  await game.thread?.send({ content: '📕 **Fin de l\'histoire.** Relancez **/jeux** › Histoire pour une nouvelle aventure !' }).catch(() => {});
  // On laisse le narrateur finir sa phrase avant de le libérer
  setTimeout(() => {
    game.narrator?.close();
    game.release?.().catch(() => {});
  }, 60_000);
}

export async function handleStoryButton(interaction) {
  const [, , id, action] = interaction.customId.split(':');
  const game = games.get(id);
  if (!game) return interaction.reply({ content: 'Cette histoire est finie.', ...PRIVATE });
  if (interaction.user.id !== game.hostId && !interaction.memberPermissions?.has('ManageGuild')) {
    return interaction.reply({ content: `Seul <@${game.hostId}> peut faire ça.`, ...PRIVATE });
  }
  await interaction.deferUpdate();
  if (action === 'next') game.skip?.();
  if (action === 'stop') await end(game);
  return undefined;
}

// ===================== Version 100 % vocale =====================

async function startVoiceStory(interaction, theme) {
  const info = STORY_THEMES[theme] ?? STORY_THEMES.fantasy;
  const channelId = voiceAiChannelId();
  const voiceChannel = interaction.guild.channels.cache.get(channelId);
  if (interaction.member?.voice?.channelId !== channelId) {
    return interaction.reply({ content: `🎧 Rejoins <#${channelId}> avec tes potes, puis relance la commande.`, ...PRIVATE });
  }
  const players = [...(voiceChannel?.members.values() ?? [])].filter((m) => !m.user.bot);
  const names = players.map((m) => m.displayName);
  await interaction.deferReply();
  const result = await startVoiceSession({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    userName: interaction.member?.displayName ?? interaction.user.username,
    memberChannelId: channelId,
    force: true,
    listenAll: true,
    idleSeconds: 180,
    maxMinutes: 25,
    title: `Histoire ${info.label}`,
    tools: [{ functionDeclarations: [{ name: 'terminer_conversation', description: "Termine l'histoire quand elle est finie ou quand les joueurs veulent arrêter" }] }],
    persona: [
      `Tu es le maître du jeu d'une aventure racontée à voix haute dans un salon vocal Discord. Univers : ${info.pitch}.`,
      `Les héros sont les joueurs présents : ${names.join(', ')}. Appelle-les par leur prénom.`,
      'Parle TOUJOURS en français, à l\'oral : phrases courtes, vivantes, avec du suspense et de l\'humour. Pas de liste, pas de markdown.',
      'Raconte par petits morceaux de 20 à 40 secondes, puis arrête-toi et demande à un joueur précis ou au groupe ce qu\'ils font.',
      'Écoute ce que chacun propose et fais évoluer l\'histoire avec des conséquences logiques. Plusieurs personnes peuvent parler.',
      'Au bout d\'une quinzaine de minutes, ou si les joueurs le demandent, donne une vraie fin à l\'aventure, dis au revoir, puis appelle terminer_conversation.',
      'Contenu adapté à des amis : pas de violence gratuite détaillée ni de contenu sexuel.',
    ].join('\n'),
    kickoff: `Commence l'aventure maintenant : présente la situation de départ et les héros (${names.join(', ')}), puis demande ce qu'ils font.`,
  });
  if (result.error) return interaction.editReply(result.error);
  return interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x8e44ad).setAuthor({ name: '📖 HISTOIRE VOCALE' }).setTitle(`${info.emoji} ${info.label} : l'aventure commence !`)
      .setDescription([
        `🔊 L'IA raconte dans <#${channelId}>. Parlez-lui directement : dites ce que fait votre personnage, elle continue l'histoire.`,
        `👥 Héros : ${names.join(', ')}`,
        '⏱️ 25 minutes maximum · dites « on arrête » pour finir plus tôt.',
        rulesLink('histoire'),
      ].filter(Boolean).join('\n'))],
  });
}
