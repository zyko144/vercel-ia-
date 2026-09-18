// Rébus en emojis : l'IA transforme un titre (film, animé, son de rap…) en emojis, le premier qui trouve marque.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { chatJson } from '../ai/gemini.js';
import { frenchRapCatalog, cleanTitle } from '../music/blindpools.js';
import { matchRatio } from '../music/deezer.js';
import { worksOf } from '../music/blindworks.js';
import { PRIVATE, listenChannel, mask, normalize, ranking, rulesLink, shuffle, sleep, stopListening, tokens } from './common.js';

const ROUND_MS = 35_000;
const HINT_AT = 0.5;
const FAST_MS = 10_000;
const BETWEEN_MS = 4_000;
const games = new Map(); // salon -> partie

export const REBUS_THEMES = {
  tout: { label: 'Tout mélangé', emoji: '🎲' },
  films: { label: 'Films', emoji: '🎬', works: ['films'] },
  disney: { label: 'Disney', emoji: '🏰', works: ['disney'] },
  series: { label: 'Séries', emoji: '📺', works: ['series'] },
  anime: { label: 'Animés', emoji: '🍥', works: ['anime'] },
  jeux: { label: 'Jeux vidéo', emoji: '🎮', works: ['games'] },
  rapfr: { label: 'Sons de rap FR', emoji: '🎤', rap: true },
};

const SCHEMA = {
  type: 'object',
  properties: {
    rebus: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, emojis: { type: 'string' } },
        required: ['index', 'emojis'],
      },
    },
  },
  required: ['rebus'],
};

/** Les réponses possibles d'un thème : { answer, aliases, kind, extra }. */
async function answersFor(theme) {
  const config = REBUS_THEMES[theme] ?? REBUS_THEMES.tout;
  const out = [];
  const works = config.works ?? (theme === 'tout' ? ['films', 'disney', 'series', 'anime', 'games'] : []);
  for (const entry of worksOf(works, { sounds: false })) {
    out.push({ answer: entry.work, aliases: entry.aliases, kind: { films: 'Film', disney: 'Disney', series: 'Série', anime: 'Animé', games: 'Jeu vidéo' }[entry.category] });
  }
  if (config.rap || theme === 'tout') {
    const catalog = await frenchRapCatalog().catch(() => ({ tracks: [] }));
    const tracks = [...catalog.tracks].sort((a, b) => b.rank - a.rank).slice(0, 180)
      .filter((track) => tokens(cleanTitle(track.title)).length >= 1 && cleanTitle(track.title).length >= 3);
    for (const track of tracks) {
      const title = cleanTitle(track.title);
      out.push({ answer: title, aliases: [title], kind: 'Son de rap FR', extra: track.artist });
    }
  }
  return out;
}

/** L'IA fabrique les rébus d'un coup (une seule requête pour toute la partie). */
async function makeRebus(items) {
  const list = items.map((item, index) => `${index}. ${item.answer} (${item.kind}${item.extra ? ` de ${item.extra}` : ''})`).join('\n');
  const data = await chatJson({
    system: 'Tu crées des rébus en emojis pour un jeu Discord entre amis. Tu es malin et drôle, mais juste : un bon joueur doit pouvoir trouver.',
    prompt: `Pour chaque titre ci-dessous, écris un rébus de 3 à 7 emojis qui fait deviner le titre (par le sens, les personnages, les objets ou les sons des mots).
Règles strictes :
- Uniquement des emojis : aucune lettre, aucun chiffre, aucun mot.
- Pas de drapeau ni d'emoji lettre (🅰️, 🔤…) qui écrirait le titre.
- Garde le même numéro (index).

${list}`,
    schema: SCHEMA,
    thinking: 'low',
    exactThinking: true,
  });
  const byIndex = new Map((data?.rebus ?? []).map((r) => [r.index, String(r.emojis ?? '').trim()]));
  return items.map((item, index) => ({ ...item, emojis: byIndex.get(index) }))
    // Un rébus qui contient des lettres ou des chiffres donne la réponse : on le jette
    .filter((item) => item.emojis && !/[a-zA-Z0-9À-ÿ]/.test(item.emojis.replace(/️/g, '')));
}

function guesses(item, guess) {
  const compact = (text) => normalize(text).replace(/ /g, '');
  return item.aliases.some((alias) => {
    if (compact(guess) === compact(alias)) return true;
    const words = tokens(alias).filter((word) => word.length >= 3);
    const wanted = words.length ? words : tokens(alias);
    if (!wanted.length) return false;
    return matchRatio(wanted.join(' '), guess) >= (wanted.length === 1 ? 1 : 0.75);
  });
}

const stopButton = (game) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`g:rebus:${game.channel.id}:stop`).setLabel('Arrêter').setEmoji('⏹️').setStyle(ButtonStyle.Secondary),
);

function roundEmbed(game, item, hint = false) {
  return new EmbedBuilder()
    .setColor(0xeb459e)
    .setAuthor({ name: `🧩 RÉBUS · ${game.index}/${game.items.length} · ${item.kind}` })
    .setTitle(item.emojis)
    .setDescription([
      `⏱️ Fin <t:${Math.ceil(game.endsAt / 1000)}:R> · écris ta réponse dans le salon`,
      item.extra && hint ? `🎤 Artiste : **${item.extra}**` : null,
      hint ? `💡 \`${mask(item.answer)}\`` : null,
    ].filter(Boolean).join('\n'))
    .setFooter({ text: 'Bonne réponse +2 · rapide (moins de 10 s) +1' });
}

/** /jeu-rebus */
export async function startRebus(interaction, { theme = 'tout', rounds = 10, channel }) {
  if (games.has(channel.id)) return interaction.reply({ content: `🧩 Un rébus est déjà en cours dans <#${channel.id}>.`, ...PRIVATE });
  await interaction.reply({ content: `🧩 Je prépare les rébus${channel.id === interaction.channelId ? '' : ` dans <#${channel.id}>`}…`, ...PRIVATE });
  const pool = shuffle(await answersFor(theme)).slice(0, Math.min(30, rounds + 6));
  let items = [];
  try {
    items = (await makeRebus(pool)).slice(0, rounds);
  } catch (err) {
    console.warn('[rebus] IA :', err.message);
  }
  if (items.length < 3) return interaction.editReply("😕 L'IA a pas réussi à faire les rébus (trop de demandes ?), réessaie dans une minute.");

  const game = { channel, hostId: interaction.user.id, items, index: 0, scores: new Map(), current: null, stopped: false };
  games.set(channel.id, game);
  listenChannel(channel.id, (message) => onGuess(game, message));
  const themeInfo = REBUS_THEMES[theme] ?? REBUS_THEMES.tout;
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0xeb459e).setAuthor({ name: '🧩 RÉBUS EN EMOJIS' }).setTitle("C'est parti !")
      .setDescription([`${themeInfo.emoji} ${themeInfo.label} · **${items.length} rébus**`, 'Écrivez vos réponses directement ici, le premier qui trouve marque.', rulesLink('rebus')].filter(Boolean).join('\n'))],
    components: [stopButton(game)],
  }).catch(() => {});
  interaction.editReply(`🧩 C'est parti dans <#${channel.id}> !`).catch(() => {});
  run(game).catch((err) => {
    console.warn('[rebus] partie :', err.message);
    end(game).catch(() => {});
  });
  return undefined;
}

async function run(game) {
  for (const item of game.items) {
    if (game.stopped) return;
    game.index++;
    game.endsAt = Date.now() + ROUND_MS;
    game.current = { item, startedAt: Date.now(), winner: null };
    const message = await game.channel.send({ embeds: [roundEmbed(game, item)] }).catch(() => null);
    await new Promise((resolve) => {
      game.current.resolve = resolve;
      game.current.hint = setTimeout(() => message?.edit({ embeds: [roundEmbed(game, item, true)] }).catch(() => {}), ROUND_MS * HINT_AT);
      game.current.timer = setTimeout(resolve, ROUND_MS);
    });
    clearTimeout(game.current.hint);
    clearTimeout(game.current.timer);
    const { winner, points, elapsed } = game.current;
    game.current = null;
    if (game.stopped) return;
    await game.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(winner ? 0x57f287 : 0xed4245)
        .setAuthor({ name: winner ? `✅ Trouvé en ${(elapsed / 1000).toFixed(1).replace('.', ',')} s` : '⏱️ Personne a trouvé' })
        .setTitle(`${item.emojis} = ${item.answer}${item.extra ? ` (${item.extra})` : ''}`)
        .setDescription(winner ? `🎯 <@${winner}> **+${points}**` : '​')],
      allowedMentions: { parse: [] },
    }).catch(() => {});
    await sleep(BETWEEN_MS);
  }
  await end(game);
}

function onGuess(game, message) {
  const round = game.current;
  if (!round || round.winner || game.stopped) return false;
  const guess = message.content.trim();
  if (!guess || guess.length > 80) return true;
  if (tokens(guess).length > Math.max(...round.item.aliases.map((a) => tokens(a).length)) + 3) return true;
  if (!guesses(round.item, guess)) return true;
  round.elapsed = Date.now() - round.startedAt;
  round.points = 2 + (round.elapsed <= FAST_MS ? 1 : 0);
  round.winner = message.author.id;
  game.scores.set(round.winner, (game.scores.get(round.winner) ?? 0) + round.points);
  message.react('✅').catch(() => {});
  round.resolve();
  return true;
}

async function end(game, { stopped = false } = {}) {
  if (game.ended) return;
  game.ended = true;
  game.stopped = true;
  if (game.current) {
    clearTimeout(game.current.hint);
    clearTimeout(game.current.timer);
    game.current.resolve?.();
  }
  games.delete(game.channel.id);
  stopListening(game.channel.id);
  const board = ranking(game.scores);
  const [winner] = [...game.scores.entries()].sort((a, b) => b[1] - a[1]);
  await game.channel.send({
    content: winner && !stopped ? `🏆 Bravo <@${winner[0]}>, roi du rébus avec **${winner[1]}** pts !` : undefined,
    embeds: [new EmbedBuilder().setColor(0xfee75c).setAuthor({ name: '🧩 RÉBUS' }).setTitle(stopped ? '⏹️ Partie arrêtée' : '🏁 Partie terminée')
      .setDescription(board ?? 'Personne a marqué 😬')],
    allowedMentions: winner ? { users: [winner[0]] } : { parse: [] },
  }).catch(() => {});
}

export async function handleRebusButton(interaction) {
  const [, , channelId] = interaction.customId.split(':');
  const game = games.get(channelId);
  if (!game) return interaction.reply({ content: 'Y a plus de rébus en cours.', ...PRIVATE });
  if (interaction.user.id !== game.hostId && !interaction.memberPermissions?.has('ManageGuild')) {
    return interaction.reply({ content: `Seul <@${game.hostId}> peut arrêter la partie.`, ...PRIVATE });
  }
  await interaction.deferUpdate();
  return end(game, { stopped: true });
}
