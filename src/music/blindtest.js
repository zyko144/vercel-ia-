// Blind test : réglages dans un menu (thème, mode, difficulté, manches), le bot joue un extrait,
// les joueurs écrivent leur réponse dans le salon. Le chrono part quand le son sort vraiment dans le vocal.
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
import { holdVoice, lockedChannel, releaseVoiceHold } from '../features/voice.js';
import { LavalinkBackend } from './backend-lavalink.js';
import { buildPool, cleanTitle, DIFFICULTIES, lyricsExcerpt, MODES, rememberPlayed, THEMES } from './blindpools.js';
import { matchRatio } from './deezer.js';
import { speedOf } from './filters.js';
import { getOrCreatePlayer } from './player.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const ROUND_CHOICES = [5, 10, 15, 20, 30];
const SETUP_TTL_MS = 30 * 60_000;
const AUDIO_START_TIMEOUT_MS = 12_000; // le serveur audio n'annonce pas le son : on le remplace
const SOUND_WAIT_MS = 8_000; // le son est annoncé mais rien ne sort dans le vocal : on le remplace
const SOUND_POLL_MS = 300;
const AUDIO_LATENCY_MS = 250; // du serveur audio jusqu'aux oreilles
const REVEAL_HOLD_MS = 3_000; // le son révélé continue un peu : ce qu'on entend correspond à la réponse affichée
const RETRY_EXTRA_MS = 3_000; // son coupé puis repris pendant une manche : un peu de temps en plus
const MAX_REPLACEMENTS = 10;
const PREPARE_AHEAD = 2;
const TITLE_POINTS = 2;
const ARTIST_POINTS = 1;
const SPEED_POINTS = 1;
const YEAR_POINTS = 3;
const WIN_SCORE = 10;
const MEDALS = ['🥇', '🥈', '🥉'];

const games = new Map(); // guildId -> partie en cours
const setups = new Map(); // id du message de réglages -> réglages
const lastSettings = new Map(); // guildId -> derniers réglages (bouton Rejouer)

export const blindTestActive = (guildId) => games.has(guildId);

const normalize = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => normalize(s).split(' ').filter(Boolean);
const seconds = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
const pts = (n) => `**${n}** pt${n > 1 ? 's' : ''}`;
const plural = (n) => `${n} pt${n > 1 ? 's' : ''}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isLink = (url) => typeof url === 'string' && /^https?:\/\//.test(url);
const canManage = (interaction, hostId) => interaction.user.id === hostId
  || interaction.user.id === config.ownerId
  || Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));

const defaultSettings = () => ({ theme: 'moment', customTheme: '', mode: 'classique', difficulty: 'normal', rounds: 10 });
const modeOf = (settings) => MODES[settings.mode] ?? MODES.classique;
const levelOf = (settings) => DIFFICULTIES[settings.difficulty] ?? DIFFICULTIES.normal;
const snippetOf = (settings) => modeOf(settings).snippet ?? levelOf(settings).snippet;

function themeLabel(settings) {
  if (settings.theme === 'custom') return `✏️ ${settings.customTheme || 'Thème perso'}`;
  const theme = THEMES[settings.theme] ?? THEMES.moment;
  return `${theme.emoji} ${theme.label}`;
}

function pointsLine(settings) {
  switch (settings.mode) {
    case 'titre': return `🎵 Titre **+${TITLE_POINTS}** · ⚡ Rapide **+${SPEED_POINTS}**`;
    case 'artiste': return `🎤 Artiste **+${TITLE_POINTS}** · ⚡ Rapide **+${SPEED_POINTS}**`;
    case 'annee': return `📅 Bonne année **+${YEAR_POINTS}** · À 1 an près **+1** · une seule réponse par manche`;
    case 'unessai': return `🎯 Titre **+${TITLE_POINTS}** · 🎤 Artiste **+${ARTIST_POINTS}** · ⚡ **+${SPEED_POINTS}** · 🎲 une seule réponse par manche`;
    case 'premier10': return `🎯 Titre **+${TITLE_POINTS}** · 🎤 Artiste **+${ARTIST_POINTS}** · ⚡ **+${SPEED_POINTS}** · 👑 le 1er à **${WIN_SCORE}** pts gagne`;
    default: return `🎯 Titre **+${TITLE_POINTS}** · 🎤 Artiste **+${ARTIST_POINTS}** · ⚡ Rapide **+${SPEED_POINTS}**`;
  }
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
  const { settings } = setup;
  const level = levelOf(settings);
  const mode = modeOf(settings);
  const voice = setup.voiceChannelId ? `🔊 Le son sera dans <#${setup.voiceChannelId}>. ` : 'Rejoins un vocal avant de lancer. ';
  return new EmbedBuilder()
    .setColor(level.color)
    .setAuthor({ name: '🎧 BLIND TEST' })
    .setTitle(status ? 'Préparation de la partie' : 'Règle ta partie')
    .setDescription(status ?? `Choisis le **thème**, le **mode**, la **difficulté** et le nombre de **manches**, puis appuie sur **Lancer**.\n${voice}Les réponses s'écrivent dans <#${setup.channelId}>.`)
    .addFields(
      { name: 'Thème', value: themeLabel(settings), inline: true },
      { name: 'Mode', value: `${mode.emoji} ${mode.label}`, inline: true },
      { name: 'Difficulté', value: `${level.emoji} ${level.label}`, inline: true },
      { name: 'Manches', value: settings.mode === 'premier10' ? `jusqu'à ${WIN_SCORE} pts` : String(settings.rounds), inline: true },
      { name: 'Extrait', value: settings.mode === 'paroles' ? `${snippetOf(settings)} s pour lire` : `${snippetOf(settings)} s`, inline: true },
      { name: 'Règles', value: `${mode.desc} · ${level.desc}\n${pointsLine(settings)}` },
    )
    .setFooter({ text: `Hôte : ${setup.hostName}` });
}

function settingsComponents(setup) {
  const { settings } = setup;
  const select = (id, placeholder, options) => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(id).setPlaceholder(placeholder).addOptions(options));
  return [
    select('bt:theme', 'Thème', Object.entries(THEMES).map(([key, theme]) => ({
      label: key === 'custom' && settings.customTheme ? `Thème perso : ${settings.customTheme}`.slice(0, 100) : theme.label,
      value: key,
      emoji: { name: theme.emoji },
      default: key === settings.theme,
    }))),
    select('bt:mode', 'Mode de jeu', Object.entries(MODES).map(([key, mode]) => ({
      label: mode.label, value: key, emoji: { name: mode.emoji }, description: mode.desc.slice(0, 100), default: key === settings.mode,
    }))),
    select('bt:difficulty', 'Difficulté', Object.entries(DIFFICULTIES).map(([key, level]) => ({
      label: level.label, value: key, emoji: { name: level.emoji }, description: level.desc.slice(0, 100), default: key === settings.difficulty,
    }))),
    select('bt:rounds', 'Manches', ROUND_CHOICES.map((count) => ({ label: `${count} manches`, value: String(count), default: count === settings.rounds }))),
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
export async function openBlindTestSetup(client, interaction, preset = {}, { channelId: forcedChannelId = null } = {}) {
  if (games.has(interaction.guildId)) return interaction.reply({ content: '🎧 Une partie est déjà en cours !', ...PRIVATE });
  const channelId = forcedChannelId || config.music.blindtestChannelId || interaction.channelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) return interaction.reply({ content: 'Je trouve pas le salon du blind test 😕', ...PRIVATE });

  const setup = {
    hostId: interaction.user.id,
    hostName: interaction.member?.displayName ?? interaction.user.username,
    guildId: interaction.guildId,
    channelId,
    voiceChannelId: lockedChannel(interaction.guild)?.id ?? null,
    settings: { ...defaultSettings(), ...preset },
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
    case 'mode':
      setup.settings.mode = interaction.values[0];
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
      const voiceChannel = lockedChannel(interaction.guild) ?? interaction.member?.voice?.channel;
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
      }).catch((err) => console.warn('[blindtest] lancement :', err.message));
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
    voiceChannelId: game.voiceChannelId,
    settings: game.settings,
    round: `${game.index}/${game.rounds}`,
    current: game.current ? {
      title: game.current.track.title,
      artist: game.current.track.artist,
      year: game.current.track.year,
      running: game.current.running,
      lyrics: game.current.track.lyrics ?? null,
    } : null,
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
  // Vocal verrouillé : la partie se joue toujours dans le vocal du bot
  voiceChannel = lockedChannel(guild) ?? voiceChannel;
  if (!voiceChannel) throw new Error('salon vocal introuvable');
  settings = { ...defaultSettings(), ...settings };
  if (!MODES[settings.mode]) settings.mode = 'classique';

  const channel = await client.channels.fetch(channelId);
  const game = {
    client, guild, guildId: guild.id, channelId, channel, hostId, settings, panel,
    level: levelOf(settings),
    mode: settings.mode,
    snippet: snippetOf(settings),
    textOnly: settings.mode === 'paroles',
    voiceChannelId: voiceChannel.id,
    allowEmptyVoice,
    pool: [], rounds: settings.mode === 'premier10' ? 30 : settings.rounds, index: 0, replacements: 0,
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
    if (!game.textOnly) {
      await player.connect(voiceChannel, { force: true });
      if (!(player.backend instanceof LavalinkBackend)) throw new Error('les serveurs audio sont indisponibles pour le moment');
      // Effet du mode (accéléré, ralenti, voix cachée)
      player.filters = modeOf(settings).filter ? [modeOf(settings).filter] : [];
    }
    player.blind = true;
    game.player = player;

    game.pool = await buildPool({ ...settings, rounds: game.rounds }, guild.id, (done, total) => progress(`⏳ Sons choisis : **${done}/${total}**…`));
    progress(game.textOnly ? '📝 Je récupère les paroles…' : '🔎 Je vérifie que chaque son est le bon…');
    await prepareAhead(game, Math.min(3, game.pool.length));
    game.rounds = Math.min(game.rounds, game.pool.length);
    if (game.rounds < 3) throw new Error('pas assez de sons jouables pour ce thème et ce mode, essaie autre chose');
  } catch (err) {
    console.warn('[blindtest] lancement impossible :', err.message);
    progress.cancel();
    await endGame(game, { error: err.message });
    return;
  }

  progress.cancel();
  const mode = modeOf(settings);
  if (panel && setup) {
    await panel.edit({ embeds: [settingsEmbed(setup, `▶️ **Partie en cours**${game.textOnly ? '' : ` dans <#${voiceChannel.id}>`}, bonne chance !`)], components: gameControls() }).catch(() => {});
  }
  console.log(`[blindtest] partie lancée : ${themeLabel(settings)} · ${mode.label} · ${game.level.label} · ${game.rounds} manches · ${game.pool.length} sons`);
  game.lastReveal = channel.send({
    embeds: [new EmbedBuilder()
      .setColor(game.level.color)
      .setAuthor({ name: '🎧 BLIND TEST' })
      .setTitle("C'est parti !")
      .setDescription([
        `${themeLabel(settings)} · ${mode.emoji} ${mode.label} · ${game.level.emoji} ${game.level.label} · **${settings.mode === 'premier10' ? `premier à ${WIN_SCORE} pts` : `${game.rounds} manches`}**`,
        game.textOnly ? '📝 Pas de son dans ce mode : lisez les paroles et écrivez vos réponses ici.' : `🔊 Le son est dans <#${voiceChannel.id}>, écrivez vos réponses ici.`,
        pointsLine(settings),
      ].join('\n'))],
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

/** Prépare à l'avance les prochains sons (bonne version audio, ou paroles) ; ceux qui ne vont pas sont retirés. */
async function prepareAhead(game, count = PREPARE_AHEAD) {
  const backend = game.player?.backend;
  for (;;) {
    const batch = game.pool.slice(0, count).filter((track) => track.ready === undefined);
    if (!batch.length || game.stopped) return;
    await Promise.all(batch.map(async (track) => {
      track.strict = true;
      if (game.textOnly) {
        track.lyrics = await lyricsExcerpt(track).catch(() => null);
        track.ready = Boolean(track.lyrics);
      } else {
        track.ready = backend?.prepare ? await backend.prepare(track).catch(() => false) : true;
      }
      if (!track.ready) console.warn(`[blindtest] ${game.textOnly ? 'pas de paroles' : 'pas de version fiable'} pour "${track.artist} - ${track.title}", son retiré`);
    }));
    game.pool = game.pool.filter((track) => track.ready !== false);
  }
}

function clearRoundTimers(game) {
  for (const timer of Object.values(game.timers)) clearTimeout(timer);
  game.timers = {};
}

const leader = (game) => [...game.scores.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

function seekFor(game, track) {
  const duration = track.duration || 180;
  if (game.mode === 'intro') return 0;
  const [from, to] = game.mode === 'eclair' ? [0.3, 0.45] : game.level.start;
  let seek = Math.floor(duration * (from + Math.random() * (to - from)));
  if (seek + game.snippet + 8 > duration) seek = Math.max(0, Math.floor(duration - game.snippet - 12));
  return seek;
}

async function nextRound(game) {
  clearRoundTimers(game);
  if (game.stopped) return undefined;
  if (game.index >= game.rounds) return endGame(game);
  if (game.mode === 'premier10' && (leader(game)?.[1] ?? 0) >= WIN_SCORE) return endGame(game);

  // Plus personne dans le vocal : on arrête (sauf mode Paroles, qui se joue à l'écrit)
  if (!game.textOnly && !game.allowEmptyVoice) {
    const members = game.guild.channels.cache.get(game.voiceChannelId)?.members;
    const listeners = members ? [...members.values()].filter((m) => !m.user.bot).length : 0;
    if (!listeners) return endGame(game, { error: 'plus personne dans le vocal' });
  }

  await prepareAhead(game, 1);
  const track = game.pool.shift();
  if (!track || game.stopped) return endGame(game);
  game.index++;

  const round = {
    track, index: game.index, seekTo: game.textOnly ? 0 : seekFor(game, track),
    running: false, checking: false, revealed: false, audioAt: null, endsAt: null,
    titleBy: null, artistBy: null, bonusBy: null, message: null, tried: new Set(), close: new Set(),
  };
  game.current = round;
  console.log(`[blindtest] manche ${round.index}/${game.rounds} : ${track.artist} - ${track.title}${game.textOnly ? ' (paroles)' : ` (à ${round.seekTo}s)`}`);

  // Mode Paroles : pas de son, le chrono part tout de suite
  if (game.textOnly) return startCountdown(game, round, Date.now());

  const { player } = game;
  player.onAudioStart = () => waitForSound(game, round);
  player.onStarted = () => waitForSound(game, round); // secours si le serveur n'annonce pas le départ
  player.onBlindEnd = ({ failed }) => onTrackGone(game, round, failed);
  player.onBlindRetry = () => extendRound(game, round);
  player.playNow({ ...track, requestedBy: 'blindtest', seekTo: round.seekTo });

  game.timers.start = setTimeout(() => {
    if (game.current === round && !round.running && !round.checking) replaceRound(game, round, 'le serveur audio ne lance pas le son');
  }, AUDIO_START_TIMEOUT_MS);
  prepareAhead(game, PREPARE_AHEAD).catch(() => {});
  return undefined;
}

/**
 * Le serveur audio annonce le son : on vérifie qu'il sort vraiment dans le vocal (la position avance)
 * avant de lancer le chrono. Rien ne sort : la manche est rejouée avec un autre son.
 */
async function waitForSound(game, round) {
  if (round.checking || round.running || game.current !== round) return;
  round.checking = true;
  clearTimeout(game.timers.start);
  const backend = game.player?.backend;
  if (!backend?.fetchState) {
    startCountdown(game, round, Date.now() + AUDIO_LATENCY_MS);
    return;
  }
  const from = round.seekTo * 1000;
  const deadline = Date.now() + SOUND_WAIT_MS;
  let baseline = null;
  let connected = null;
  while (Date.now() < deadline) {
    if (game.stopped || game.current !== round || round.revealed) return;
    const state = await backend.fetchState().catch(() => null);
    const position = state?.state?.position;
    connected = state?.state?.connected ?? connected;
    // Ça doit être CE son qui avance (l'ancien peut encore tourner quelques instants)
    const ours = state?.track?.info?.identifier && state.track.info.identifier === backend.currentItem?.info?.identifier;
    if (ours && connected !== false && typeof position === 'number') {
      if (baseline === null) baseline = Math.abs(position - from) <= 1_500 ? Math.min(position, from) : position;
      if (position > baseline + 150) {
        const heardMs = Math.min(1_500, (position - baseline) / (speedOf(game.player.filters) || 1));
        startCountdown(game, round, Date.now() - heardMs + AUDIO_LATENCY_MS);
        return;
      }
    }
    await sleep(SOUND_POLL_MS);
  }
  if (connected === false) {
    console.warn('[blindtest] le serveur audio n\'est plus connecté au vocal : reconnexion');
    await backend.refreshVoice?.().catch(() => {});
  }
  replaceRound(game, round, connected === false ? 'vocal du serveur audio déconnecté' : 'aucun son ne sort dans le vocal');
}

function scheduleReveal(game, round) {
  clearTimeout(game.timers.reveal);
  game.timers.reveal = setTimeout(() => revealSafely(game, round), Math.max(0, round.endsAt - Date.now()));
}

/** Le son est entendu (ou les paroles affichées) : le chrono démarre, le message de la manche apparaît. */
async function startCountdown(game, round, audioAt) {
  if (game.stopped || game.current !== round || round.running) return;
  round.running = true;
  round.audioAt = audioAt;
  round.endsAt = audioAt + game.snippet * 1000;
  clearTimeout(game.timers.start);
  scheduleReveal(game, round);
  if (game.level.hintAt && game.mode !== 'annee' && game.mode !== 'eclair') {
    game.timers.hint = setTimeout(() => showHint(game, round), Math.max(0, audioAt + game.snippet * game.level.hintAt * 1000 - Date.now()));
  }
  console.log(`[blindtest] manche ${round.index} : ${game.textOnly ? 'paroles affichées' : 'son entendu'}, chrono ${game.snippet}s`);

  await game.lastReveal; // la réponse de la manche d'avant s'affiche d'abord
  if (game.current !== round || round.revealed) return;
  round.message = await game.channel.send({ embeds: [roundEmbed(game, round)] }).catch(() => null);
}

/** Son coupé puis repris pendant la manche : on rajoute un peu de temps. */
function extendRound(game, round) {
  if (game.current !== round || !round.running || round.revealed) return;
  round.endsAt += RETRY_EXTRA_MS;
  scheduleReveal(game, round);
  round.message?.edit({ embeds: [roundEmbed(game, round, round.hint)] }).catch(() => {});
}

function roundEmbed(game, round, hint = null) {
  const titles = {
    titre: '🎵 C\'est quoi le titre ?',
    artiste: '🎤 Qui chante ?',
    annee: '📅 En quelle année est sorti ce son ?',
    paroles: '📝 Quel son a ces paroles ?',
  };
  const mode = MODES[game.mode];
  return new EmbedBuilder()
    .setColor(game.level.color)
    .setAuthor({ name: `🎧 Manche ${round.index}/${game.mode === 'premier10' ? `∞ · 1er à ${WIN_SCORE} pts` : game.rounds} · ${mode.emoji} ${mode.label} · ${game.level.emoji} ${game.level.label}` })
    .setTitle(titles[game.mode] ?? '🎶 Devine le son !')
    .setDescription([
      game.textOnly && round.track.lyrics ? `>>> *${round.track.lyrics.replace(/\*/g, '').replace(/\n/g, '*\n*')}*\n` : null,
      `⏱️ Fin **<t:${Math.ceil(round.endsAt / 1000)}:R>**`,
      pointsLine(game.settings),
      hint ? `\n💡 **Indice**\n${hint}` : null,
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `${themeLabel(game.settings)} · écris ta réponse dans le salon` });
}

function showHint(game, round) {
  if (game.current !== round || round.revealed || !round.message) return;
  const title = cleanTitle(round.track.title) || round.track.title;
  const lines = [];
  if (game.mode !== 'titre' && (game.settings.difficulty === 'tresfacile' || game.settings.difficulty === 'facile' || game.mode === 'artiste') && !round.artistBy) {
    lines.push(`🎤 \`${mask(round.track.artist)}\``);
  }
  if (game.mode !== 'artiste') lines.push(`🎵 \`${mask(title)}\``);
  round.hint = lines.join('\n');
  round.message.edit({ embeds: [roundEmbed(game, round, round.hint)] }).catch(() => {});
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
  const userId = message.author.id;
  const { track } = round;
  const oneTry = game.mode === 'unessai' || game.mode === 'annee';
  if (oneTry && round.tried.has(userId)) return true;
  const elapsed = Math.max(0, Date.now() - round.audioAt);
  const fast = elapsed <= game.snippet * 1000 * game.level.speedBonus;

  // Mode Année : on devine l'année de sortie
  if (game.mode === 'annee') {
    const year = Number(guess.match(/\b(19|20)\d{2}\b/)?.[0]);
    if (!year || !track.year) return true;
    round.tried.add(userId);
    if (year === track.year) {
      winRound(game, round, message, YEAR_POINTS + (fast ? SPEED_POINTS : 0), { fast, elapsed });
    } else if (Math.abs(year - track.year) === 1) {
      round.close.add(userId);
      award(game, userId, 1);
      message.react('🔥').catch(() => {});
    } else {
      message.react('❌').catch(() => {});
    }
    return true;
  }

  const title = cleanTitle(track.title) || track.title;
  const artists = [track.artist, ...featuredArtists(track.title)].filter(Boolean);
  // Une réponse qui balance plein de mots au hasard ne compte pas
  if (tokens(guess).length > tokens(title).length + tokens(track.artist).length + 3) return true;

  const titleOk = !round.titleBy && covers(title, guess);
  const artistOk = !round.artistBy && artists.some((artist) => covers(artist, guess));

  if (game.mode === 'artiste') {
    if (artistOk) {
      round.artistBy = userId;
      winRound(game, round, message, TITLE_POINTS + (fast ? SPEED_POINTS : 0), { fast, elapsed, what: 'artist' });
    } else if (oneTry) {
      round.tried.add(userId);
    }
    return true;
  }

  if (titleOk) {
    let points = TITLE_POINTS + (fast ? SPEED_POINTS : 0);
    if (artistOk && game.mode !== 'titre') {
      round.artistBy = userId;
      points += ARTIST_POINTS;
    }
    winRound(game, round, message, points, { fast, elapsed });
    return true;
  }
  if (artistOk && game.mode !== 'titre') {
    round.artistBy = userId;
    award(game, userId, ARTIST_POINTS);
    message.react('🎤').catch(() => {});
  }
  if (oneTry) {
    round.tried.add(userId);
    if (!artistOk) message.react('❌').catch(() => {});
  }
  return true;
}

/** Quelqu'un a trouvé : points, félicitations, réponse. */
function winRound(game, round, message, points, { fast, elapsed, what = 'title' }) {
  const userId = message.author.id;
  round.titleBy = userId;
  round.foundIn = elapsed;
  round.bonusBy = fast ? userId : null;
  round.winnerMessage = message;
  round.winnerPoints = points;
  round.winWhat = what;
  award(game, userId, points);
  game.found.set(userId, (game.found.get(userId) ?? 0) + 1);
  console.log(`[blindtest] manche ${round.index} trouvée par ${userId} en ${seconds(elapsed)}s (+${points})`);
  revealSafely(game, round);
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

  const found = Boolean(round.titleBy);
  let header = '⏱️ Personne a trouvé !';
  if (found) header = game.mode === 'annee' ? `✅ Bonne année en ${seconds(round.foundIn)} s !` : `✅ Trouvé en ${seconds(round.foundIn)} s !`;
  else if (round.artistBy) header = '🎤 Artiste trouvé, pas le titre !';

  const lines = [];
  if (game.mode === 'annee') {
    lines.push(`📅 Sorti en **${track.year}**`);
    if (found) lines.push(`🎯 <@${round.titleBy}> **+${YEAR_POINTS}**${round.bonusBy ? ` · ⚡ **+${SPEED_POINTS}**` : ''}`);
    if (round.close.size) lines.push(`🔥 À 1 an près : ${[...round.close].map((id) => `<@${id}>`).join(', ')} **+1**`);
  } else {
    if (found && round.winWhat === 'artist') lines.push(`🎤 Artiste : <@${round.titleBy}> **+${TITLE_POINTS}**${round.bonusBy ? ` · ⚡ **+${SPEED_POINTS}**` : ''}`);
    else if (found) lines.push(`🎯 Titre : <@${round.titleBy}> **+${TITLE_POINTS}**${round.bonusBy ? ` · ⚡ **+${SPEED_POINTS}**` : ''}`);
    if (round.artistBy && round.winWhat !== 'artist') lines.push(`🎤 Artiste : <@${round.artistBy}> **+${ARTIST_POINTS}**`);
    if (track.year) lines.push(`📅 Sorti en **${track.year}**`);
  }
  const ranking = scoreboard(game, 5);
  if (ranking) lines.push(`\n**Classement**\n${ranking}`);

  const last = game.index >= game.rounds || (game.mode === 'premier10' && (leader(game)?.[1] ?? 0) >= WIN_SCORE);
  const embed = new EmbedBuilder()
    .setColor(found ? 0x57f287 : 0xed4245)
    .setAuthor({ name: header })
    .setTitle(`${track.title} — ${track.artist}`.slice(0, 256))
    .setDescription(lines.join('\n') || '\u200b')
    .setFooter({ text: `Manche ${round.index}${game.mode === 'premier10' ? '' : `/${game.rounds}`}${last ? '' : ` · manche suivante dans ${REVEAL_HOLD_MS / 1000} s`}` });
  if (isLink(track.thumbnail)) embed.setThumbnail(track.thumbnail);
  if (isLink(track.deezerUrl)) embed.setURL(track.deezerUrl);

  const payload = { embeds: [embed], allowedMentions: { parse: [] } };
  let sending;
  if (found) {
    // Le gagnant est pingé et félicité en réponse à son message
    const what = game.mode === 'annee' ? `l'année **${track.year}**` : round.winWhat === 'artist' ? `l'artiste **${track.artist}**` : `**${cleanTitle(track.title) || track.title}**`;
    payload.content = `🎉 GG <@${round.titleBy}> ! T'as trouvé ${what}${round.bonusBy ? ' en un éclair ⚡' : ''} (+${plural(round.winnerPoints)})`;
    payload.allowedMentions = { users: [round.titleBy] };
    sending = round.winnerMessage?.reply
      ? round.winnerMessage.reply(payload).catch(() => game.channel.send(payload))
      : game.channel.send(payload);
  } else {
    sending = game.channel.send(payload);
  }
  game.lastReveal = Promise.resolve(sending).catch(() => null);

  // Le son révélé continue quelques secondes (ce qu'on entend = la réponse affichée), puis manche suivante
  game.current = null;
  if (!last) {
    await new Promise((resolve) => {
      game.wake = resolve;
      game.timers.hold = setTimeout(resolve, REVEAL_HOLD_MS);
    });
  }
  if (!game.stopped) continueGame(game);
}

/** Le son de la manche ne peut pas être joué : on le remplace sans compter la manche. */
function replaceRound(game, round, reason) {
  if (game.stopped || game.current !== round || round.revealed) return;
  console.warn(`[blindtest] manche ${round.index} rejouée avec un autre son (${reason}) : ${round.track.artist} - ${round.track.title}`);
  clearRoundTimers(game);
  round.message?.delete().catch(() => {});
  if (!game.textOnly) game.player?.backend?.stopTrack?.();
  game.current = null;
  game.index--;
  if (++game.replacements > MAX_REPLACEMENTS) {
    endGame(game, { error: 'trop de sons impossibles à lire, les serveurs audio ont un souci' }).catch(() => {});
    return;
  }
  continueGame(game);
}

/** Le son s'est arrêté tout seul (fin du morceau, ou coupure définitive). */
function onTrackGone(game, round, failed) {
  if (game.stopped || game.current !== round || round.revealed) return;
  if (!round.running) {
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
  game.wake?.();
  games.delete(game.guildId);
  releaseVoiceHold(game.guildId);

  const { player } = game;
  if (player) {
    player.blind = false;
    player.onStarted = null;
    player.onAudioStart = null;
    player.onBlindEnd = null;
    player.onBlindRetry = null;
    player.queue = [];
    player.filters = [];
    if (player.current) await Promise.resolve(player.stop()).catch(() => {});
  }
  await game.lastReveal;

  const ranking = [...game.scores.entries()].sort((a, b) => b[1] - a[1]);
  const played = Math.max(0, game.current && !game.current.revealed ? game.index - 1 : game.index);
  const mode = MODES[game.mode];
  const embed = new EmbedBuilder()
    .setColor(error ? 0xed4245 : 0xfee75c)
    .setAuthor({ name: '🎧 BLIND TEST' })
    .setTitle(error || stopped ? '⏹️ Partie arrêtée' : '🏁 Partie terminée')
    .setDescription([
      error ? `😕 ${error.charAt(0).toUpperCase()}${error.slice(1)}.` : null,
      ranking.length
        ? ranking.slice(0, 10).map(([id, points], i) => `${MEDALS[i] ?? `\`${i + 1}.\``} <@${id}> · ${pts(points)} · ${game.found.get(id) ?? 0} trouvé(s)`).join('\n')
        : (played > 0 ? 'Personne a marqué de point 😬' : null),
    ].filter(Boolean).join('\n\n') || '\u200b')
    .setFooter({ text: `${themeLabel(game.settings)} · ${mode.label} · ${game.level.label} · ${played} manche(s) jouée(s)` });

  const payload = { embeds: [embed], components: replayControls(), allowedMentions: { parse: [] } };
  const [winner] = ranking;
  if (winner && !error && !stopped) {
    payload.content = game.mode === 'premier10' && winner[1] >= WIN_SCORE
      ? `👑 <@${winner[0]}> atteint ${pts(winner[1])} en premier et remporte le blind test, bravo !`
      : `🏆 Bravo <@${winner[0]}> ! Tu remportes le blind test avec ${pts(winner[1])} 👑`;
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
