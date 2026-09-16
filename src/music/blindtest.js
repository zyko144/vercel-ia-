// Blind test : réglages dans un menu (thème, difficulté, manches), le bot joue un extrait,
// les joueurs écrivent le titre / l'artiste dans le salon. Le chrono part quand le son sort vraiment.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '../config.js';
import { holdVoice, releaseVoiceHold } from '../features/voice.js';
import { LavalinkBackend } from './backend-lavalink.js';
import { buildPool, cleanTitle, DIFFICULTIES, rememberPlayed, THEMES } from './blindpools.js';
import { matchRatio } from './deezer.js';
import { getOrCreatePlayer } from './player.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const ROUND_CHOICES = [5, 10, 15, 20, 30];
const SETUP_TTL_MS = 30 * 60_000;
const AUDIO_START_TIMEOUT_MS = 12_000; // le son ne part pas : on le remplace par un autre
const EARLY_FAILURE_MS = 4_000; // son coupé juste après le départ : manche rejouée avec un autre son
const AUDIO_LATENCY_MS = 600; // temps entre l'annonce du départ et le son vraiment entendu dans le vocal
const MAX_REPLACEMENTS = 8;
const PREPARE_AHEAD = 2;
const TITLE_POINTS = 2;
const ARTIST_POINTS = 1;
const SPEED_POINTS = 1;
const MEDALS = ['🥇', '🥈', '🥉'];

const games = new Map(); // guildId -> partie en cours
const setups = new Map(); // id du message de réglages -> réglages
const lastSettings = new Map(); // guildId -> derniers réglages (bouton Rejouer)

export const blindTestActive = (guildId) => games.has(guildId);

const normalize = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => normalize(s).split(' ').filter(Boolean);
const seconds = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
const pts = (n) => `**${n}** pt${n > 1 ? 's' : ''}`;
const isLink = (url) => typeof url === 'string' && /^https?:\/\//.test(url);
const canManage = (interaction, hostId) => interaction.user.id === hostId
  || interaction.user.id === config.ownerId
  || Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));

function themeLabel(settings) {
  if (settings.theme === 'custom') return `✏️ ${settings.customTheme || 'Thème perso'}`;
  const theme = THEMES[settings.theme] ?? THEMES.recent;
  return `${theme.emoji} ${theme.label}`;
}

/** Artistes invités écrits dans le titre : « Son (feat. X & Y) ». */
function featuredArtists(title = '') {
  const match = title.match(/\((?:feat|ft)\.?\s+([^)]+)\)/i) ?? title.match(/\s(?:feat|ft)\.?\s+(.+)$/i);
  return match ? match[1].split(/,|&| et | x /i).map((name) => name.trim()).filter(Boolean) : [];
}

/** La réponse couvre-t-elle le nom attendu ? (fautes tolérées, petits mots ignorés) */
function covers(expected, guess) {
  const all = tokens(expected);
  const significant = all.filter((token) => token.length >= 3 && !/^\d+x$/.test(token));
  const words = significant.length ? significant : all;
  if (!words.length) return false;
  return matchRatio(words.join(' '), guess) >= (words.length === 1 ? 1 : 0.75);
}

/** « Pyramide » -> « P_______ » (garde la ponctuation). */
function mask(text) {
  return text.split(/\s+/).map((word) => {
    const letters = [...word];
    return letters[0] + letters.slice(1).map((c) => (/[\p{L}\p{N}]/u.test(c) ? '_' : c)).join('');
  }).join('   ');
}

// ===================== Réglages =====================

function settingsEmbed(setup, status = null) {
  const level = DIFFICULTIES[setup.settings.difficulty] ?? DIFFICULTIES.normal;
  return new EmbedBuilder()
    .setColor(level.color)
    .setAuthor({ name: '🎧 BLIND TEST' })
    .setTitle(status ? 'Préparation de la partie' : 'Règle ta partie')
    .setDescription(status ?? `Choisis le **thème**, la **difficulté** et le nombre de **manches**, puis appuie sur **Lancer**.\nRejoins un vocal avant de lancer, les réponses s'écrivent dans <#${setup.channelId}>.`)
    .addFields(
      { name: 'Thème', value: themeLabel(setup.settings), inline: true },
      { name: 'Difficulté', value: `${level.emoji} ${level.label}`, inline: true },
      { name: 'Manches', value: String(setup.settings.rounds), inline: true },
      { name: 'Règles', value: `⏱️ Extrait de **${level.snippet} s** · ${level.desc}\n🎯 Titre **+${TITLE_POINTS}** · 🎤 Artiste **+${ARTIST_POINTS}** · ⚡ Réponse rapide **+${SPEED_POINTS}**` },
    )
    .setFooter({ text: `Hôte : ${setup.hostName}` });
}

function settingsComponents(setup) {
  const { settings } = setup;
  return [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('bt:theme')
      .setPlaceholder('Thème')
      .addOptions(Object.entries(THEMES).map(([key, theme]) => ({
        label: key === 'custom' && settings.customTheme ? `Thème perso : ${settings.customTheme}`.slice(0, 100) : theme.label,
        value: key,
        emoji: { name: theme.emoji },
        default: key === settings.theme,
      })))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('bt:difficulty')
      .setPlaceholder('Difficulté')
      .addOptions(Object.entries(DIFFICULTIES).map(([key, level]) => ({
        label: level.label,
        value: key,
        emoji: { name: level.emoji },
        description: level.desc.slice(0, 100),
        default: key === settings.difficulty,
      })))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId('bt:rounds')
      .setPlaceholder('Manches')
      .addOptions(ROUND_CHOICES.map((count) => ({ label: `${count} manches`, value: String(count), default: count === settings.rounds })))),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bt:start').setLabel('Lancer').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bt:custom').setLabel('Thème perso').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bt:cancel').setLabel('Annuler').setStyle(ButtonStyle.Danger),
    ),
  ];
}

const gameControls = () => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('bt:skip').setLabel('Passer').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('bt:stop').setLabel('Arrêter').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
)];

const replayControls = () => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('bt:replay').setLabel('Rejouer').setEmoji('🔁').setStyle(ButtonStyle.Success),
)];

/** Ouvre le menu de réglages (dans le salon du blind test). */
export async function openBlindTestSetup(client, interaction, preset = {}) {
  if (games.has(interaction.guildId)) return interaction.reply({ content: '🎧 Une partie est déjà en cours !', ...PRIVATE });
  const channelId = config.music.blindtestChannelId || interaction.channelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) return interaction.reply({ content: 'Je trouve pas le salon du blind test 😕', ...PRIVATE });

  const setup = {
    hostId: interaction.user.id,
    hostName: interaction.member?.displayName ?? interaction.user.username,
    guildId: interaction.guildId,
    channelId,
    settings: { theme: 'recent', customTheme: '', difficulty: 'normal', rounds: 10, ...preset },
    createdAt: Date.now(),
  };
  const message = await channel.send({ embeds: [settingsEmbed(setup)], components: settingsComponents(setup) });
  setups.set(message.id, setup);
  for (const [id, old] of setups) if (Date.now() - old.createdAt > SETUP_TTL_MS) setups.delete(id);

  const content = `🎛️ Les réglages t'attendent ${channelId === interaction.channelId ? 'juste en dessous' : `dans <#${channelId}>`} !`;
  if (interaction.deferred || interaction.replied) return interaction.followUp({ content, ...PRIVATE });
  return interaction.reply({ content, ...PRIVATE });
}

export const isBlindTestComponent = (interaction) => (interaction.customId ?? '').startsWith('bt:');

export async function handleBlindTestComponent(client, interaction) {
  const [, action, extra] = interaction.customId.split(':');
  const game = games.get(interaction.guildId);

  if (action === 'skip' || action === 'stop') {
    if (!game) return interaction.reply({ content: 'Y a plus de partie en cours.', ...PRIVATE });
    if (!canManage(interaction, game.hostId)) return interaction.reply({ content: `Seul <@${game.hostId}> (ou un admin) peut faire ça.`, ...PRIVATE });
    await interaction.deferUpdate();
    if (action === 'stop') return endGame(game, { stopped: true });
    if (game.current?.running) revealSafely(game, game.current);
    return undefined;
  }

  if (action === 'replay') return openBlindTestSetup(client, interaction, lastSettings.get(interaction.guildId) ?? {});

  const messageId = action === 'custommodal' ? extra : interaction.message?.id;
  const setup = setups.get(messageId);
  if (!setup) return interaction.reply({ content: 'Ces réglages ont expiré, relance `/blindtest`.', ...PRIVATE });
  if (!canManage(interaction, setup.hostId)) {
    return interaction.reply({ content: `Seul <@${setup.hostId}> peut régler cette partie (lance ton propre \`/blindtest\` après).`, ...PRIVATE });
  }
  const refresh = () => interaction.update({ embeds: [settingsEmbed(setup)], components: settingsComponents(setup) });

  switch (action) {
    case 'theme':
      setup.settings.theme = interaction.values[0];
      if (setup.settings.theme === 'custom' && !setup.settings.customTheme) return showCustomModal(interaction, messageId);
      return refresh();
    case 'difficulty':
      setup.settings.difficulty = interaction.values[0];
      return refresh();
    case 'rounds':
      setup.settings.rounds = Number(interaction.values[0]);
      return refresh();
    case 'custom':
      return showCustomModal(interaction, messageId);
    case 'custommodal':
      setup.settings.customTheme = interaction.fields.getTextInputValue('theme').trim().slice(0, 80);
      setup.settings.theme = 'custom';
      return refresh();
    case 'cancel':
      setups.delete(messageId);
      return interaction.update({ embeds: [settingsEmbed(setup, '❌ Partie annulée.')], components: [] });
    case 'start': {
      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) return interaction.reply({ content: "🎧 Rejoins d'abord un salon vocal, puis appuie sur Lancer.", ...PRIVATE });
      if (games.has(interaction.guildId)) return interaction.reply({ content: '🎧 Une partie est déjà en cours !', ...PRIVATE });
      if (setup.settings.theme === 'custom' && !setup.settings.customTheme) return showCustomModal(interaction, messageId);
      setups.delete(messageId);
      await interaction.update({ embeds: [settingsEmbed(setup, '⏳ Je choisis et je vérifie les sons…')], components: [] });
      return startGame(interaction.client, {
        guild: interaction.guild,
        channelId: setup.channelId,
        voiceChannel,
        hostId: setup.hostId,
        settings: setup.settings,
        panel: interaction.message,
        setup,
      });
    }
    default:
      return undefined;
  }
}

function showCustomModal(interaction, messageId) {
  return interaction.showModal(new ModalBuilder()
    .setCustomId(`bt:custommodal:${messageId}`)
    .setTitle('✏️ Thème perso')
    .addLabelComponents(new LabelBuilder()
      .setLabel('Thème du blind test')
      .setDescription('Un style, une époque, un artiste…')
      .setTextInputComponent(new TextInputBuilder()
        .setCustomId('theme')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ex : afro trap, années 2000, Jul, drill fr…')
        .setRequired(true)
        .setMaxLength(80))));
}

// ===================== Partie =====================

/** Résumé des parties en cours (API d'admin). */
export function blindTestState() {
  return [...games.values()].map((game) => ({
    guildId: game.guildId,
    channelId: game.channelId,
    settings: game.settings,
    round: `${game.index}/${game.rounds}`,
    current: game.current ? { title: game.current.track.title, artist: game.current.track.artist, running: game.current.running } : null,
    pool: game.pool.length,
    scores: Object.fromEntries(game.scores),
  }));
}

/** Petite file d'attente qui évite de modifier un message plus d'une fois par seconde. */
function throttled(fn, delay = 1200) {
  let last = 0;
  let pending = null;
  let timer = null;
  const run = () => {
    timer = null;
    last = Date.now();
    const text = pending;
    pending = null;
    if (text) fn(text);
  };
  const call = (text) => {
    pending = text;
    if (!timer) timer = setTimeout(run, Math.max(0, delay - (Date.now() - last)));
  };
  call.flush = () => {
    clearTimeout(timer);
    if (pending) run();
  };
  call.cancel = () => {
    clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return call;
}

/**
 * Lance une partie. Les sons sont choisis puis vérifiés (bonne version trouvée sur le serveur audio) avant la 1re manche.
 */
export async function startGame(client, { guild, channelId, voiceChannel, hostId, settings, panel = null, setup = null, allowEmptyVoice = false }) {
  if (games.has(guild.id)) throw new Error('une partie est déjà en cours');
  const level = DIFFICULTIES[settings.difficulty] ?? DIFFICULTIES.normal;
  const channel = await client.channels.fetch(channelId);
  const game = {
    client, guild, guildId: guild.id, channelId, channel, hostId, settings, level, panel,
    voiceChannelId: voiceChannel.id, allowEmptyVoice,
    pool: [], rounds: settings.rounds, index: 0, replacements: 0,
    scores: new Map(), found: new Map(), current: null, timers: {}, stopped: false, lastReveal: null,
  };
  games.set(guild.id, game);
  lastSettings.set(guild.id, { ...settings });
  holdVoice(guild.id, voiceChannel.id);

  const progress = throttled((text) => {
    if (panel && setup) panel.edit({ embeds: [settingsEmbed(setup, text)], components: [] }).catch(() => {});
  });

  try {
    const player = getOrCreatePlayer(client, guild);
    player.queue = [];
    player.loop = 'off';
    player.autoplay = false;
    player.textChannelId = channelId;
    await player.connect(voiceChannel, { force: true });
    if (!(player.backend instanceof LavalinkBackend)) throw new Error('les serveurs audio sont indisponibles pour le moment');
    player.blind = true;
    game.player = player;

    game.pool = await buildPool(settings, guild.id, (done, total) => progress(`⏳ Sons choisis : **${done}/${total}**…`));
    progress('🔎 Je vérifie que chaque son est le bon…');
    await prepareAhead(game, Math.min(3, game.pool.length));
    game.rounds = Math.min(settings.rounds, game.pool.length);
    if (game.rounds < 3) throw new Error('pas assez de sons jouables pour ce thème, essaie un autre');
  } catch (err) {
    console.warn('[blindtest] lancement impossible :', err.message);
    progress.cancel();
    await endGame(game, { error: err.message });
    return;
  }

  progress.cancel();
  if (panel && setup) {
    await panel.edit({ embeds: [settingsEmbed(setup, `▶️ **Partie en cours** dans <#${voiceChannel.id}>, bonne chance !`)], components: gameControls() }).catch(() => {});
  }
  console.log(`[blindtest] partie lancée : ${themeLabel(settings)} · ${level.label} · ${game.rounds} manches · ${game.pool.length} sons`);
  game.lastReveal = channel.send({
    embeds: [new EmbedBuilder()
      .setColor(level.color)
      .setAuthor({ name: '🎧 BLIND TEST' })
      .setTitle("C'est parti !")
      .setDescription(`${themeLabel(settings)} · ${level.emoji} ${level.label} · **${game.rounds} manches**\n🔊 Le son est dans <#${voiceChannel.id}>, écrivez vos réponses ici.\n🎯 Titre **+${TITLE_POINTS}** · 🎤 Artiste **+${ARTIST_POINTS}** · ⚡ Rapide **+${SPEED_POINTS}**`)],
    components: panel ? [] : gameControls(),
  }).catch(() => null);
  continueGame(game);
}

/** Passe à la manche suivante ; si ça plante, la partie s'arrête proprement (jamais bloquée en silence). */
function continueGame(game) {
  nextRound(game).catch((err) => {
    console.error('[blindtest] manche impossible :', err);
    endGame(game, { error: `bug pendant la manche (${err.message})` }).catch(() => {});
  });
}

/** Vérifie à l'avance que les prochains sons ont une version fiable sur le serveur audio (sinon ils sont retirés). */
async function prepareAhead(game, count = PREPARE_AHEAD) {
  const backend = game.player?.backend;
  for (;;) {
    const batch = game.pool.slice(0, count).filter((track) => track.ready === undefined);
    if (!batch.length || game.stopped) return;
    await Promise.all(batch.map(async (track) => {
      track.strict = true;
      track.ready = backend?.prepare ? await backend.prepare(track).catch(() => false) : true;
      if (!track.ready) console.warn(`[blindtest] pas de version fiable pour "${track.artist} - ${track.title}", son retiré`);
    }));
    game.pool = game.pool.filter((track) => track.ready !== false);
  }
}

function clearRoundTimers(game) {
  for (const timer of Object.values(game.timers)) clearTimeout(timer);
  game.timers = {};
}

async function nextRound(game) {
  clearRoundTimers(game);
  if (game.stopped) return undefined;
  if (game.index >= game.rounds) return endGame(game);

  // Plus personne dans le vocal : on arrête
  const members = game.guild.channels.cache.get(game.voiceChannelId)?.members;
  const listeners = members ? [...members.values()].filter((m) => !m.user.bot).length : 0;
  if (!listeners && !game.allowEmptyVoice) return endGame(game, { error: 'plus personne dans le vocal' });

  await prepareAhead(game, 1);
  const track = game.pool.shift();
  if (!track || game.stopped) return endGame(game);
  game.index++;

  const { level } = game;
  const duration = track.duration || 180;
  const [from, to] = level.start;
  let seekTo = Math.floor(duration * (from + Math.random() * (to - from)));
  if (seekTo + level.snippet + 8 > duration) seekTo = Math.max(0, Math.floor(duration - level.snippet - 12));

  const round = { track, index: game.index, seekTo, running: false, revealed: false, audioAt: null, endsAt: null, titleBy: null, artistBy: null, bonusBy: null, message: null };
  game.current = round;
  console.log(`[blindtest] manche ${round.index}/${game.rounds} : ${track.artist} - ${track.title} (à ${seekTo}s)`);

  const { player } = game;
  player.onAudioStart = () => onAudioStart(game, round);
  player.onStarted = () => onAudioStart(game, round); // secours si le serveur n'annonce pas le départ
  player.onBlindEnd = ({ failed }) => onTrackGone(game, round, failed);
  player.playNow({ ...track, requestedBy: 'blindtest', seekTo });

  game.timers.start = setTimeout(() => {
    if (game.current === round && !round.running) replaceRound(game, round, 'le son ne démarre pas');
  }, AUDIO_START_TIMEOUT_MS);
  prepareAhead(game, PREPARE_AHEAD).catch(() => {});
  return undefined;
}

/** Le son sort vraiment : le chrono démarre maintenant, et le message de la manche apparaît en même temps. */
async function onAudioStart(game, round) {
  if (game.stopped || game.current !== round || round.running) return;
  round.running = true;
  round.audioAt = Date.now() + AUDIO_LATENCY_MS;
  round.endsAt = round.audioAt + game.level.snippet * 1000;
  clearTimeout(game.timers.start);
  game.timers.reveal = setTimeout(() => revealSafely(game, round), round.endsAt - Date.now());
  if (game.level.hintAt) game.timers.hint = setTimeout(() => showHint(game, round), game.level.snippet * game.level.hintAt * 1000);

  await game.lastReveal; // la réponse de la manche d'avant s'affiche d'abord
  if (game.current !== round || round.revealed) return;
  round.message = await game.channel.send({ embeds: [roundEmbed(game, round)] }).catch(() => null);
}

function roundEmbed(game, round, hint = null) {
  return new EmbedBuilder()
    .setColor(game.level.color)
    .setAuthor({ name: `🎧 Manche ${round.index}/${game.rounds} · ${themeLabel(game.settings)} · ${game.level.emoji} ${game.level.label}` })
    .setTitle('🎶 Devine le son !')
    .setDescription([
      `⏱️ Fin **<t:${Math.ceil(round.endsAt / 1000)}:R>**`,
      `🎯 Titre **+${TITLE_POINTS}** · 🎤 Artiste **+${ARTIST_POINTS}** · ⚡ Rapide **+${SPEED_POINTS}**`,
      hint ? `\n💡 **Indice**\n${hint}` : null,
    ].filter(Boolean).join('\n'))
    .setFooter({ text: 'Écris ta réponse dans le salon' });
}

function showHint(game, round) {
  if (game.current !== round || round.revealed || !round.message) return;
  const title = cleanTitle(round.track.title) || round.track.title;
  const lines = [];
  if (game.settings.difficulty === 'facile' && !round.artistBy) lines.push(`🎤 \`${mask(round.track.artist)}\``);
  lines.push(`🎵 \`${mask(title)}\``);
  round.message.edit({ embeds: [roundEmbed(game, round, lines.join('\n'))] }).catch(() => {});
}

function award(game, userId, points) {
  game.scores.set(userId, (game.scores.get(userId) ?? 0) + points);
}

/** Message écrit dans le salon pendant une partie. */
export function handleBlindTestMessage(message) {
  const game = games.get(message.guildId);
  if (!game || game.channelId !== message.channelId || game.stopped) return false;
  const round = game.current;
  if (!round?.running || round.revealed) return true;

  const guess = message.content.trim();
  if (!guess || guess.length > 80) return true;
  const { track } = round;
  const title = cleanTitle(track.title) || track.title;
  const artists = [track.artist, ...featuredArtists(track.title)].filter(Boolean);
  // Une réponse qui balance plein de mots au hasard ne compte pas
  if (tokens(guess).length > tokens(title).length + tokens(track.artist).length + 3) return true;

  const userId = message.author.id;
  const titleOk = !round.titleBy && covers(title, guess);
  const artistOk = !round.artistBy && artists.some((artist) => covers(artist, guess));

  if (titleOk) {
    const elapsed = Math.max(0, Date.now() - round.audioAt);
    let points = TITLE_POINTS;
    round.titleBy = userId;
    round.foundIn = elapsed;
    if (elapsed <= game.level.snippet * 1000 * game.level.speedBonus) {
      round.bonusBy = userId;
      points += SPEED_POINTS;
    }
    if (artistOk) {
      round.artistBy = userId;
      points += ARTIST_POINTS;
    }
    award(game, userId, points);
    game.found.set(userId, (game.found.get(userId) ?? 0) + 1);
    round.winnerMessage = message;
    round.winnerPoints = points;
    console.log(`[blindtest] manche ${round.index} trouvée par ${userId} en ${seconds(elapsed)}s (+${points})`);
    revealSafely(game, round);
    return true;
  }
  if (artistOk) {
    round.artistBy = userId;
    award(game, userId, ARTIST_POINTS);
    message.react('🎤').catch(() => {});
  }
  return true;
}

function scoreboard(game, count) {
  const ranking = [...game.scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, count);
  if (!ranking.length) return null;
  return ranking.map(([id, points], i) => `${MEDALS[i] ?? `\`${i + 1}.\``} <@${id}> · ${pts(points)}`).join('\n');
}

/** Une erreur pendant la réponse ne doit jamais bloquer la partie. */
function revealSafely(game, round) {
  reveal(game, round).catch((err) => {
    console.warn('[blindtest] réponse :', err.message);
    if (!game.stopped && game.current === round) {
      game.current = null;
      continueGame(game);
    }
  });
}

async function reveal(game, round) {
  if (game.stopped || game.current !== round || round.revealed) return;
  round.revealed = true;
  clearRoundTimers(game);
  rememberPlayed(game.guildId, round.track);
  const { track } = round;
  console.log(`[blindtest] réponse manche ${round.index} : ${round.titleBy ? 'trouvé' : 'personne'}`);

  const ranking = scoreboard(game, 5);
  const embed = new EmbedBuilder()
    .setColor(round.titleBy ? 0x57f287 : 0xed4245)
    .setAuthor({ name: round.titleBy ? `✅ Trouvé en ${seconds(round.foundIn)} s !` : round.artistBy ? '🎤 Artiste trouvé, pas le titre !' : '⏱️ Personne a trouvé !' })
    .setTitle(`${track.title} — ${track.artist}`.slice(0, 256))
    .setDescription([
      round.titleBy ? `🎯 Titre : <@${round.titleBy}> **+${TITLE_POINTS}**${round.bonusBy ? ` · ⚡ **+${SPEED_POINTS}**` : ''}` : null,
      round.artistBy ? `🎤 Artiste : <@${round.artistBy}> **+${ARTIST_POINTS}**` : null,
      track.year ? `📅 Sorti en **${track.year}**` : null,
      ranking ? `\n**Classement**\n${ranking}` : null,
    ].filter(Boolean).join('\n') || '\u200b')
    .setFooter({ text: `Manche ${round.index}/${game.rounds}` });
  if (isLink(track.thumbnail)) embed.setThumbnail(track.thumbnail);
  if (isLink(track.deezerUrl)) embed.setURL(track.deezerUrl);

  const payload = { embeds: [embed], allowedMentions: { parse: [] } };
  let sending;
  if (round.titleBy) {
    // Le gagnant est pingé et félicité en réponse à son message
    payload.content = `🎉 GG <@${round.titleBy}> ! T'as trouvé **${cleanTitle(track.title) || track.title}**${round.bonusBy ? ' en un éclair ⚡' : ''} (+${round.winnerPoints} pt${round.winnerPoints > 1 ? "s" : ""})`;
    payload.allowedMentions = { users: [round.titleBy] };
    sending = round.winnerMessage?.reply
      ? round.winnerMessage.reply(payload).catch(() => game.channel.send(payload))
      : game.channel.send(payload);
  } else {
    sending = game.channel.send(payload);
  }
  game.lastReveal = Promise.resolve(sending).catch(() => null);

  // Manche suivante tout de suite (0 délai) : le nouveau son remplace directement l'ancien
  game.current = null;
  continueGame(game);
}

/** Le son de la manche ne peut pas être joué : on le remplace sans compter la manche. */
function replaceRound(game, round, reason) {
  if (game.stopped || game.current !== round || round.revealed) return;
  console.warn(`[blindtest] manche ${round.index} rejouée avec un autre son (${reason}) : ${round.track.artist} - ${round.track.title}`);
  clearRoundTimers(game);
  round.message?.delete().catch(() => {});
  game.current = null;
  game.index--;
  if (++game.replacements > MAX_REPLACEMENTS) {
    endGame(game, { error: 'trop de sons impossibles à lire, les serveurs audio ont un souci' }).catch(() => {});
    return;
  }
  continueGame(game);
}

/** Le son s'est arrêté tout seul (fin du morceau, ou coupure). */
function onTrackGone(game, round, failed) {
  if (game.stopped || game.current !== round || round.revealed) return;
  if (!round.running || (failed && Date.now() - round.audioAt < EARLY_FAILURE_MS)) {
    replaceRound(game, round, failed ? 'son illisible' : 'son terminé avant le départ');
    return;
  }
  revealSafely(game, round);
}

export async function endGame(game, { stopped = false, error = null } = {}) {
  if (game.ended) return;
  game.ended = true;
  game.stopped = true;
  clearRoundTimers(game);
  games.delete(game.guildId);
  releaseVoiceHold(game.guildId);

  const { player } = game;
  if (player) {
    player.blind = false;
    player.onStarted = null;
    player.onAudioStart = null;
    player.onBlindEnd = null;
    player.queue = [];
    await Promise.resolve(player.stop()).catch(() => {});
  }
  await game.lastReveal;

  const ranking = [...game.scores.entries()].sort((a, b) => b[1] - a[1]);
  const played = Math.max(0, game.current && !game.current.revealed ? game.index - 1 : game.index);
  const embed = new EmbedBuilder()
    .setColor(error ? 0xed4245 : 0xfee75c)
    .setAuthor({ name: '🎧 BLIND TEST' })
    .setTitle(error || stopped ? '⏹️ Partie arrêtée' : '🏁 Partie terminée')
    .setDescription([
      error ? `😕 ${error.charAt(0).toUpperCase()}${error.slice(1)}.` : null,
      ranking.length
        ? ranking.slice(0, 10).map(([id, points], i) => `${MEDALS[i] ?? `\`${i + 1}.\``} <@${id}> · ${pts(points)} · ${game.found.get(id) ?? 0} titre(s)`).join('\n')
        : (played > 0 ? 'Personne a marqué de point 😬' : null),
    ].filter(Boolean).join('\n\n') || '\u200b')
    .setFooter({ text: `${themeLabel(game.settings)} · ${game.level.label} · ${played} manche(s) jouée(s)` });

  const payload = { embeds: [embed], components: replayControls(), allowedMentions: { parse: [] } };
  const [winner] = ranking;
  if (winner && !error && !stopped) {
    payload.content = `🏆 Bravo <@${winner[0]}> ! Tu remportes le blind test avec ${pts(winner[1])} 👑`;
    payload.allowedMentions = { users: [winner[0]] };
  }
  await game.channel?.send(payload).catch(() => {});
  if (game.panel) await game.panel.edit({ components: [] }).catch(() => {});
  console.log(`[blindtest] fin de partie (${error ?? (stopped ? 'arrêtée' : 'terminée')})`);
}

export function stopBlindTest(guildId) {
  const game = games.get(guildId);
  if (!game) return false;
  endGame(game, { stopped: true }).catch(() => {});
  return true;
}
