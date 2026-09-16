// Blind test : le bot joue un extrait, les gens devinent le titre (et l'artiste) dans le salon.
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { deezer, matchRatio, rankResults, trackFromDeezer } from './deezer.js';
import { getOrCreatePlayer } from './player.js';
import { aiPlaylist } from './sources.js';
import { popularTracks } from './stats.js';

const games = new Map(); // guildId -> partie en cours
const START_SAFETY_S = 20; // si le son ne démarre jamais, on passe quand même à la suite
const TITLE_POINTS = 2;
const ARTIST_POINTS = 1;

export const blindTestActive = (guildId) => games.has(guildId);

/** Résumé des parties en cours (API d'admin). */
export function blindTestState() {
  return [...games.values()].map((game) => ({
    guildId: game.guildId,
    channelId: game.channelId,
    round: `${game.index}/${game.rounds}`,
    current: game.current ? { title: game.current.track.title, artist: game.current.track.artist, running: Boolean(game.current.running) } : null,
    pool: game.pool.length,
    scores: Object.fromEntries(game.scores),
  }));
}

const clean = (text = '') => text
  .replace(/\s*[([].*?[)\]]/g, ' ')
  .replace(/\s*-\s*(remaster|radio edit|clip officiel|official.*|live|version.*)$/i, ' ')
  .replace(/\s*(feat|ft)\.?\s.*$/i, ' ')
  .trim();

/** Construit la réserve de sons : thème demandé, sons du serveur, ou top du moment. */
async function buildPool(theme, count, guildId, botName) {
  let tracks = [];

  if (theme && /serveur|nous|ici/i.test(theme)) {
    tracks = await popularTracks(guildId, count * 2);
  } else if (theme) {
    // Une playlist du thème donne des sons cohérents et connus
    const playlist = await deezer.searchPlaylist(theme).catch(() => null);
    if (playlist) {
      const items = await deezer.playlistTracks(playlist.id).catch(() => []);
      tracks = items.filter((t) => (t.rank ?? 0) > 400_000).map((t) => trackFromDeezer(t));
    }
    if (tracks.length < count * 2) {
      const results = await deezer.search(theme, 50).catch(() => []);
      tracks = [...tracks, ...rankResults(theme, results).filter((t) => (t.rank ?? 0) > 500_000).map((t) => trackFromDeezer(t))];
    }
    // Thème que Deezer comprend mal : l'IA propose une liste
    if (tracks.length < count) {
      const generated = await aiPlaylist(theme, Math.max(count, 15)).catch(() => null);
      if (generated?.tracks?.length) tracks = [...tracks, ...generated.tracks];
    }
  } else {
    const chart = await deezer.chart().catch(() => []);
    const mine = await popularTracks(guildId, 15);
    tracks = [...chart.map((t) => trackFromDeezer(t)), ...mine];
  }

  // Doublons enlevés, puis mélange
  const seen = new Set();
  const pool = tracks.filter((t) => {
    const key = `${clean(t.title).toLowerCase()}|${(t.artist ?? '').toLowerCase()}`;
    if (!t.title || !t.artist || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

export async function startBlindTest(client, interaction, { theme, rounds, snippetSeconds, voiceChannel, textChannelId = null, forceVoice = false }) {
  const pool = await buildPool(theme, rounds, interaction.guildId, client.user.username);
  if (pool.length < 3) {
    return interaction.editReply("😕 J'ai pas trouvé assez de sons pour ce thème, essaie autre chose (ex : `rap fr`, `années 2000`, `serveur`).");
  }

  // Salon dédié aux blind tests s'il est configuré, sinon celui où la commande est tapée
  const channelId = textChannelId || config.music.blindtestChannelId || interaction.channelId;

  const player = getOrCreatePlayer(client, interaction.guild);
  player.textChannelId = channelId;
  await player.connect(voiceChannel, { force: forceVoice });
  console.log(`[blindtest] partie lancée : ${pool.length} sons, ${rounds} manches, ${snippetSeconds}s, vocal ${player.botVoiceChannelId}, moteur ${player.backend?.name}`);
  player.blind = true;
  player.queue = [];
  player.loop = 'off';
  player.autoplay = false;

  const game = {
    client,
    guildId: interaction.guildId,
    channelId,
    player,
    pool,
    rounds: Math.min(rounds, pool.length),
    snippetSeconds,
    index: 0,
    scores: new Map(),
    current: null,
    timer: null,
    stopped: false,
  };
  games.set(interaction.guildId, game);

  const where = channelId === interaction.channelId ? 'dans le salon' : `dans <#${channelId}>`;
  await interaction.editReply(`🎧 Blind test lancé : **${game.rounds} manches**, ${snippetSeconds}s par son. Écris ta réponse ${where} !`);
  nextRound(game).catch((err) => console.warn('[blindtest]', err.message));
  return undefined;
}

async function channelOf(game) {
  return game.client.channels.fetch(game.channelId).catch(() => null);
}

async function nextRound(game, { afterMessage = null } = {}) {
  if (game.stopped) return;
  if (game.index >= game.rounds || !game.pool.length) {
    await afterMessage;
    return endGame(game);
  }

  game.index++;
  const track = game.pool.shift();
  game.current = { track, titleFound: false, artistFinder: null, startedAt: Date.now() };

  // Extrait pris vers le premier tiers du son (pas l'intro, pas la fin)
  const duration = track.duration ?? 0;
  const seekTo = duration > game.snippetSeconds + 45 ? Math.floor(duration * 0.28) : 0;

  console.log(`[blindtest] manche ${game.index}/${game.rounds} : ${track.artist} - ${track.title} (départ ${seekTo}s)`);
  // Le chrono ne part que quand le son sort vraiment
  game.player.onStarted = () => startCountdown(game);
  game.player.onBlindEnd = ({ failed }) => onTrackGone(game, track, failed);
  // Le nouveau son remplace directement l'ancien : 0 blanc entre les manches
  game.player.playNow({ ...track, requestedBy: 'blindtest', seekTo });
  // Le son d'après est préparé pendant cette manche pour démarrer instantanément
  if (game.pool[0]) game.player.backend?.preload?.(game.pool[0])?.catch?.(() => {});

  const channel = await channelOf(game);
  await afterMessage; // le message de réponse de la manche précédente passe avant
  if (game.current?.track !== track) return undefined; // son illisible déjà remplacé par une autre manche
  await channel?.send({
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: `🎧 Manche ${game.index}/${game.rounds}` })
      .setTitle('Devine le son !')
      .setDescription(`Écris le **titre** dans le salon (+${TITLE_POINTS} pts) — l'**artiste** rapporte +${ARTIST_POINTS} pt.\nTu as **${game.snippetSeconds} secondes** ⏱️`)],
  }).catch(() => {});

  // Filet de sécurité : si le son ne démarre jamais, on passe à la suite
  if (game.current?.track === track && !game.current.running) {
    clearTimeout(game.timer);
    game.timer = setTimeout(() => revealSafely(game, null), (game.snippetSeconds + START_SAFETY_S) * 1000);
  }
  return undefined;
}

/** Le son de la manche s'est arrêté tout seul (fin du morceau, ou illisible). */
function onTrackGone(game, track, failed) {
  if (game.stopped || game.current?.track !== track) return;
  if (failed && !game.current.running) {
    // Son illisible avant même d'avoir été entendu : on le remplace sans compter la manche
    console.warn(`[blindtest] son illisible, remplacé : ${track.title}`);
    clearTimeout(game.timer);
    game.current = null;
    game.index--;
    nextRound(game).catch((err) => console.warn('[blindtest]', err.message));
    return;
  }
  // Morceau fini (ou coupé) pendant la manche : on révèle tout de suite
  clearTimeout(game.timer);
  revealSafely(game, null);
}

/** Appelé au vrai départ du son : l'extrait dure alors exactement le temps demandé. */
function startCountdown(game) {
  if (game.stopped || !game.current || game.current.running) return;
  game.current.running = true;
  console.log(`[blindtest] chrono lancé ${Date.now() - game.current.startedAt} ms après le début de la manche`);
  game.current.startedAt = Date.now();
  clearTimeout(game.timer);
  game.timer = setTimeout(() => revealSafely(game, null), game.snippetSeconds * 1000);
}

function award(game, userId, points) {
  game.scores.set(userId, (game.scores.get(userId) ?? 0) + points);
}

/** Message envoyé pendant une partie : est-ce une bonne réponse ? */
export function handleBlindTestMessage(message) {
  const game = games.get(message.guildId);
  if (!game || game.channelId !== message.channelId || game.stopped) return false;
  if (!game.current) return true; // entre deux manches : on laisse les gens parler sans que l'IA réponde

  const guess = message.content.trim();
  if (guess.length < 2) return true;
  const { track } = game.current;
  const title = clean(track.title);
  const artist = track.artist ?? '';

  // Bonne réponse = les mots tapés sont dans le titre ET le titre est bien couvert
  const titleOk = !game.current.titleFound
    && matchRatio(guess, title) >= 0.7 && matchRatio(title, guess) >= 0.5;
  const artistOk = !game.current.artistFinder && artist
    && matchRatio(guess, artist) >= 0.7 && matchRatio(artist, guess) >= 0.6;

  if (titleOk) {
    game.current.titleFound = message.author.id;
    award(game, message.author.id, TITLE_POINTS);
    if (!game.current.artistFinder && artistOk) {
      game.current.artistFinder = message.author.id;
      award(game, message.author.id, ARTIST_POINTS);
    }
    message.react('✅').catch(() => {});
    clearTimeout(game.timer);
    revealSafely(game, message.author.id);
    return true;
  }
  if (artistOk) {
    game.current.artistFinder = message.author.id;
    award(game, message.author.id, ARTIST_POINTS);
    message.react('🎯').catch(() => {});
  }
  return true;
}

/** Une erreur pendant la révélation ne doit jamais bloquer la partie : on passe quand même à la manche suivante. */
function revealSafely(game, winnerId) {
  reveal(game, winnerId).catch((err) => {
    console.warn('[blindtest] révélation :', err.message);
    if (!game.stopped && !game.current) nextRound(game).catch(() => {});
  });
}

async function reveal(game, winnerId) {
  if (game.stopped || !game.current) return;
  console.log(`[blindtest] réponse manche ${game.index} (${winnerId ? 'trouvé' : 'personne'}, chrono ${game.current.running ? 'lancé' : 'JAMAIS lancé'})`);
  const { track, artistFinder } = game.current;
  game.current = null;
  clearTimeout(game.timer);

  const scoreboard = [...game.scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, points], i) => `${['🥇', '🥈', '🥉'][i] ?? '　'} <@${id}> · **${points}** pts`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(winnerId ? 0x57f287 : 0xed4245)
    .setAuthor({ name: winnerId ? '✅ Trouvé !' : '⏱️ Personne !' })
    .setTitle(`${track.title} — ${track.artist}`.slice(0, 250))
    .setDescription([
      winnerId ? `Titre trouvé par <@${winnerId}> (+${TITLE_POINTS})` : `C'était **${track.title}** de **${track.artist}**`,
      artistFinder ? `Artiste trouvé par <@${artistFinder}> (+${ARTIST_POINTS})` : '',
      scoreboard ? `\n**Classement**\n${scoreboard}` : '',
    ].filter(Boolean).join('\n'))
    .setFooter({ text: `Manche ${game.index}/${game.rounds}` });
  const isLink = (url) => typeof url === 'string' && /^https?:\/\//.test(url);
  if (isLink(track.thumbnail)) embed.setThumbnail(track.thumbnail);
  if (isLink(track.url)) embed.setURL(track.url);

  const sending = channelOf(game).then((channel) => channel?.send({ embeds: [embed], allowedMentions: { parse: [] } })).catch(() => {});

  // Manche suivante lancée tout de suite : le son change pendant que la réponse s'affiche
  await nextRound(game, { afterMessage: sending });
}

export async function endGame(game, { stopped = false } = {}) {
  clearTimeout(game.timer);
  game.stopped = true;
  game.current = null;
  games.delete(game.guildId);
  game.player.blind = false;
  game.player.onStarted = null;
  game.player.onBlindEnd = null;
  game.player.queue = [];
  await game.player.stop();

  const ranking = [...game.scores.entries()].sort((a, b) => b[1] - a[1]);
  const channel = await channelOf(game);
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setAuthor({ name: stopped ? '⏹️ Blind test arrêté' : '🏁 Blind test terminé' })
    .setDescription(ranking.length
      ? ranking.slice(0, 10).map(([id, points], i) => `${['🥇', '🥈', '🥉'][i] ?? `\`${i + 1}.\``} <@${id}> · **${points}** pts`).join('\n')
      : 'Personne a marqué de point 😬')
    .setFooter({ text: `${game.index} manche(s) jouée(s)` });
  await channel?.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

export function stopBlindTest(guildId) {
  const game = games.get(guildId);
  if (!game) return false;
  endGame(game, { stopped: true }).catch(() => {});
  return true;
}
