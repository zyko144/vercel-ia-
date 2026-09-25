// Défis et événements : chasse au trésor, quiz du jour (automatique), tournoi de quiz, « Qui a dit ça ? »,
// devine le rappeur (photo floutée qui se dévoile), mots croisés de l'IA et escape game.
// Tout se joue dans le salon des jeux (ou un fil) ; les gagnants touchent des pièces d'or.
// Boutons : « g:df:<id>:<action>:<arg> ».
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { chatJson } from '../ai/gemini.js';
import { addGold } from '../features/economy.js';
import { cfg } from '../features/guildConfig.js';
import { playedGame, questProgress } from '../features/treasury.js';
import { deezer } from '../music/deezer.js';
import { load, save } from '../storage.js';
import {
  MEDALS, PRIVATE, gameChannel, gameThread, listenChannel, normalize, openLobby, pick, registerGame, shortId, shuffle, sleep, stopListening, unregisterGame,
} from './common.js';

const COLOR = 0xc9a978;
const games = new Map();
const LETTERS = ['🇦', '🇧', '🇨', '🇩'];
const until = (ms) => `<t:${Math.ceil((Date.now() + ms) / 1000)}:R>`;
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const busy = new Set(); // salons occupés par un défi écrit

/** Attend des réponses écrites dans un salon ; check(message) renvoie true si c'est la bonne. */
function waitAnswer(channel, check, ms, players) {
  return new Promise((resolve) => {
    const reader = (m) => {
      if (m.author.bot) return false;
      players?.add(m.author.id);
      if (!check(m)) return false;
      clearTimeout(timer);
      stopListening(channel.id, reader);
      m.react('✅').catch(() => {});
      resolve(m);
      return true;
    };
    const timer = setTimeout(() => { stopListening(channel.id, reader); resolve(null); }, ms);
    listenChannel(channel.id, reader);
  });
}
const same = (a, b) => {
  const x = normalize(a);
  const y = normalize(b);
  return !!x && (x === y || (y.length > 4 && x.replace(/ /g, '') === y.replace(/ /g, '')));
};

/** Une question à 4 boutons : renvoie Map(joueur -> index choisi) et le premier juste. */
async function buttonQuestion(where, game, { title, choices, right, ms = 20_000, image = null }) {
  game.answers = new Map();
  game.firstRight = null;
  game.right = right;
  const msg = await where.send({
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle(title.slice(0, 256)).setDescription(`${choices.map((c, j) => `${LETTERS[j]} ${c}`).join('\n')}\n\nFin ${until(ms)}`).setImage(image)],
    components: [new ActionRowBuilder().addComponents(choices.map((c, j) => new ButtonBuilder().setCustomId(`g:df:${game.id}:qa:${j}`).setLabel(String(c).slice(0, 70)).setEmoji(LETTERS[j]).setStyle(ButtonStyle.Secondary)))],
  }).catch(() => null);
  await new Promise((resolve) => { game.wake = resolve; game.timer = setTimeout(resolve, ms); });
  clearTimeout(game.timer);
  await msg?.edit({ components: [] }).catch(() => {});
  return { answers: game.answers, first: game.firstRight };
}
function scoreEmbed(title, scores, prizes = []) {
  const list = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  return new EmbedBuilder().setColor(0xf2c14e).setTitle(title)
    .setDescription(list.length ? list.slice(0, 10).map(([id, n], i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${id}> · **${n}** pt${n > 1 ? 's' : ''}${prizes[i] ? ` · +🪙 ${fmt(prizes[i])}` : ''}`).join('\n') : 'Personne n’a marqué de point.');
}
async function payPodium(guildId, scores, prizes, label) {
  const list = [...scores.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  for (const [i, [id]] of list.slice(0, prizes.length).entries()) await addGold(guildId, id, prizes[i], label);
  await playedGame(guildId, [...scores.keys()]);
  if (list[0]) await questProgress(guildId, list[0][0], 'win').catch(() => {});
}
function track(game, kind, emoji) {
  games.set(game.id, game);
  registerGame({ id: `df-${game.id}`, kind, emoji, info: () => ({ channelId: game.channelId }), stop: () => { game.stopped = true; game.wake?.(); } });
}
function untrack(game) {
  games.delete(game.id);
  unregisterGame(`df-${game.id}`);
  if (game.channelId) busy.delete(game.channelId);
}
async function claimChannel(interaction, label) {
  const channel = await gameChannel(interaction);
  if (busy.has(channel.id)) {
    await interaction.reply({ content: 'Un défi est déjà en cours dans ce salon, attends la fin.', ...PRIVATE });
    return null;
  }
  busy.add(channel.id);
  await interaction.reply({ content: `${label} commence dans ${channel} !`, ...PRIVATE });
  return channel;
}

// =====================================================================
// Chasse au trésor : 3 énigmes, chaque bonne réponse = un morceau de carte
// =====================================================================

const RIDDLES = [
  { q: 'Je n’ai ni bouche ni oreilles, mais je réponds à tout ce qu’on crie dans une grotte.', a: 'echo' },
  { q: 'Plus j’ai de trous, plus je tiens : les pêcheurs m’adorent.', a: 'filet' },
  { q: 'Je montre toujours le nord, même au milieu de la tempête.', a: 'boussole' },
  { q: 'On me jette quand on a besoin de moi, on me remonte quand on n’en veut plus.', a: 'ancre' },
  { q: 'Je grandis quand on me retire quelque chose.', a: 'trou' },
  { q: 'J’ai des villes sans maisons, des mers sans eau et des forêts sans arbres.', a: 'carte' },
  { q: 'Je cours sans jambes et j’ai un lit sans dormir.', a: 'riviere' },
  { q: 'Plus il y en a, moins on voit.', a: 'brouillard' },
  { q: 'Je suis pris avant d’être donné, et on me tient sans les mains.', a: 'parole' },
];
export async function startTreasureHunt(interaction) {
  const channel = await claimChannel(interaction, '🗺️ La chasse au trésor');
  if (!channel) return undefined;
  const game = { id: shortId(), channelId: channel.id, stopped: false };
  track(game, 'Chasse au trésor', '🗺️');
  try {
    const ai = await chatJson({
      tag: 'jeux', thinking: 'minimal',
      system: 'Tu écris des énigmes de pirate en français, courtes et justes, dont la réponse est UN seul mot courant (sans article).',
      prompt: 'Écris 3 énigmes de difficulté croissante pour une chasse au trésor sur un serveur Discord.',
      schema: { type: 'object', properties: { enigmes: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } }, required: ['q', 'a'] } } }, required: ['enigmes'] },
    }).catch(() => null);
    const riddles = (ai?.enigmes ?? []).filter((r) => r.q && r.a && !/\s/.test(r.a.trim())).slice(0, 3);
    while (riddles.length < 3) riddles.push(pick(RIDDLES.filter((r) => !riddles.includes(r))));
    const pieces = new Map();
    const players = new Set();
    await channel.send({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🗺️ Chasse au trésor').setDescription('Trois énigmes, trois morceaux de carte. Le premier qui écrit la bonne réponse (un seul mot) gagne le morceau. Celui qui a le plus de morceaux trouve le **coffre de 🪙 600** !')] });
    for (const [i, r] of riddles.entries()) {
      if (game.stopped) break;
      await sleep(2500);
      await channel.send({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`📜 Énigme ${i + 1}/3`).setDescription(`*${r.q}*\n\n${'▢'.repeat(r.a.length)} (${r.a.length} lettres) · fin ${until(90_000)}`)] });
      const m = await waitAnswer(channel, (x) => same(x.content, r.a), 90_000, players);
      if (m) {
        pieces.set(m.author.id, (pieces.get(m.author.id) ?? 0) + 1);
        await channel.send({ content: `🧩 ${m.author} trouve **${r.a.toUpperCase()}** et gagne un morceau de carte ! **+🪙 100**`, allowedMentions: { users: [m.author.id] } });
        await addGold(interaction.guildId, m.author.id, 100, 'Chasse au trésor : morceau de carte');
      } else await channel.send(`⌛ Personne… c’était **${r.a.toUpperCase()}**.`);
    }
    const [winner] = [...pieces.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (winner) await addGold(interaction.guildId, winner, 600, 'Chasse au trésor : coffre trouvé');
    await playedGame(interaction.guildId, [...players]);
    await channel.send({ embeds: [scoreEmbed(winner ? '💰 Le coffre est trouvé !' : '🏝️ Le trésor reste enfoui…', pieces, winner ? [600] : []).setFooter({ text: 'Morceaux de carte · +🪙 100 par morceau, le coffre de 🪙 600 au premier' })] });
  } finally {
    untrack(game);
  }
  return undefined;
}

// =====================================================================
// Quiz : banque de questions de l'IA (tournoi et quiz du jour)
// =====================================================================

const FALLBACK_QUIZ = [
  { question: 'Quel océan est le plus grand ?', choix: ['Atlantique', 'Pacifique', 'Indien', 'Arctique'], bonne: 1 },
  { question: 'Combien de joueurs dans une équipe de foot sur le terrain ?', choix: ['9', '10', '11', '12'], bonne: 2 },
  { question: 'Quelle planète est surnommée la planète rouge ?', choix: ['Vénus', 'Mars', 'Jupiter', 'Mercure'], bonne: 1 },
  { question: 'Qui a peint la Joconde ?', choix: ['Picasso', 'Van Gogh', 'Léonard de Vinci', 'Monet'], bonne: 2 },
  { question: 'Quel est le plus long fleuve de France ?', choix: ['La Seine', 'La Loire', 'Le Rhône', 'La Garonne'], bonne: 1 },
  { question: 'En quelle année l’homme a marché sur la Lune ?', choix: ['1965', '1969', '1972', '1959'], bonne: 1 },
  { question: 'Quel pirate célèbre avait une barbe noire ?', choix: ['Barbe Noire', 'Jack Sparrow', 'Barberousse', 'Le Capitaine Crochet'], bonne: 0 },
  { question: 'Combien de continents sur Terre (modèle le plus courant en France) ?', choix: ['5', '6', '7', '8'], bonne: 1 },
  { question: 'Quel animal est le plus rapide sur terre ?', choix: ['Lion', 'Guépard', 'Antilope', 'Cheval'], bonne: 1 },
  { question: 'Quelle est la capitale du Japon ?', choix: ['Kyoto', 'Osaka', 'Tokyo', 'Séoul'], bonne: 2 },
];
async function quizQuestions(theme, n) {
  const ai = await chatJson({
    tag: 'jeux', thinking: 'minimal',
    system: 'Tu écris des questions de quiz en français, vérifiables, avec 4 choix plausibles et une seule bonne réponse. Varie les difficultés.',
    prompt: `Thème : ${theme || 'culture générale, musique, jeux vidéo, sport, cinéma'}. Écris ${n} questions.`,
    schema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, choix: { type: 'array', items: { type: 'string' } }, bonne: { type: 'integer' } }, required: ['question', 'choix', 'bonne'] } } }, required: ['questions'] },
  }).catch(() => null);
  const list = (ai?.questions ?? []).filter((q) => q.choix?.length === 4 && q.bonne >= 0 && q.bonne < 4);
  const fill = shuffle(FALLBACK_QUIZ).filter((q) => !list.some((x) => x.question === q.question));
  return [...list, ...fill].slice(0, n).map((q) => {
    // On mélange les choix pour que la bonne réponse ne soit pas toujours au même endroit
    const order = shuffle([0, 1, 2, 3]);
    return { question: q.question, choix: order.map((i) => q.choix[i]), bonne: order.indexOf(q.bonne) };
  });
}

export async function startQuizTournament(interaction, { theme = '' } = {}) {
  const channel = await gameChannel(interaction);
  await interaction.reply({ content: `🏆 Le tournoi de quiz ouvre ses portes dans ${channel} !`, ...PRIVATE });
  const lobby = await openLobby({ channel, hostId: interaction.user.id, title: '🏆 Tournoi de quiz', description: `${theme ? `Thème : **${theme}**\n` : ''}10 questions, 15 secondes chacune. Bonne réponse **+1**, la plus rapide **+1**.\nPodium : 🪙 500 · 250 · 100.`, min: 2, max: 20, waitMs: 90_000, color: COLOR });
  if (!lobby) return undefined;
  const thread = await gameThread(lobby.message, '🏆 Tournoi de quiz');
  const game = { id: shortId(), channelId: thread.id, players: lobby.players, stopped: false };
  track(game, 'Tournoi de quiz', '🏆');
  const scores = new Map(lobby.players.map((id) => [id, 0]));
  try {
    const questions = await quizQuestions(theme, 10);
    for (const [i, q] of questions.entries()) {
      if (game.stopped) break;
      const { answers, first } = await buttonQuestion(thread, game, { title: `❓ ${i + 1}/${questions.length} · ${q.question}`, choices: q.choix, right: q.bonne, ms: 15_000 });
      const good = [...answers.entries()].filter(([, a]) => a === q.bonne).map(([id]) => id);
      for (const id of good) scores.set(id, (scores.get(id) ?? 0) + 1 + (id === first ? 1 : 0));
      await thread.send({ content: `✅ **${q.choix[q.bonne]}**${good.length ? ` · ${good.map((id) => `<@${id}>`).join(', ')}` : ' · personne'}`, allowedMentions: { parse: [] } }).catch(() => {});
      await sleep(1500);
    }
    await payPodium(interaction.guildId, scores, [500, 250, 100], 'Tournoi de quiz');
    await thread.send({ embeds: [scoreEmbed('🏆 Podium du tournoi', scores, [500, 250, 100])] });
  } finally {
    untrack(game);
  }
  return undefined;
}

// Quiz du jour : une question publiée à 18 h dans le salon des jeux, réponse révélée une heure après
const DAILY_KEY = 'quiz-du-jour';
let daily = null;
const parisNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
const today = () => parisNow().toISOString().slice(0, 10);
export async function dailyQuizTick(client) {
  daily ??= (await load(DAILY_KEY, {}).catch(() => ({}))) ?? {};
  const now = parisNow();
  for (const guild of client.guilds.cache.values()) {
    const g = daily[guild.id];
    if (g?.open && Date.now() > g.closesAt) await closeDailyQuiz(guild, g);
    if (!cfg(guild.id, 'games.dailyQuiz') || now.getHours() < 18 || g?.day === today()) continue;
    const channel = guild.channels.cache.get(cfg(guild.id, 'games.channelId') ?? '');
    if (!channel?.isTextBased?.()) continue;
    const [q] = await quizQuestions('', 1);
    const id = shortId();
    const msg = await channel.send({
      embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`📅 Quiz du jour · ${q.question}`.slice(0, 256)).setDescription(`${q.choix.map((c, j) => `${LETTERS[j]} ${c}`).join('\n')}\n\nUne seule réponse par personne. Bonne réponse : **+🪙 100**. Résultat ${until(3_600_000)}.`)],
      components: [new ActionRowBuilder().addComponents(q.choix.map((c, j) => new ButtonBuilder().setCustomId(`g:df:daily:${guild.id}:${j}`).setLabel(String(c).slice(0, 70)).setEmoji(LETTERS[j]).setStyle(ButtonStyle.Secondary)))],
    }).catch(() => null);
    if (!msg) continue;
    daily[guild.id] = { day: today(), id, open: true, closesAt: Date.now() + 3_600_000, channelId: channel.id, messageId: msg.id, q, answers: {} };
    await save(DAILY_KEY, daily);
  }
}
async function closeDailyQuiz(guild, g) {
  g.open = false;
  const good = Object.entries(g.answers).filter(([, a]) => a === g.q.bonne).map(([id]) => id);
  for (const id of good) await addGold(guild.id, id, 100, 'Quiz du jour');
  await playedGame(guild.id, Object.keys(g.answers));
  const channel = guild.channels.cache.get(g.channelId);
  const msg = await channel?.messages.fetch(g.messageId).catch(() => null);
  await msg?.edit({ components: [] }).catch(() => {});
  await channel?.send({ content: `📅 **Quiz du jour** : la réponse était **${g.q.choix[g.q.bonne]}**. ${good.length ? `Bravo à ${good.slice(0, 30).map((id) => `<@${id}>`).join(', ')} (**+🪙 100**) !` : 'Personne n’a trouvé.'} (${Object.keys(g.answers).length} participant·e·s)`, allowedMentions: { parse: [] } }).catch(() => {});
  await save(DAILY_KEY, daily);
}

// =====================================================================
// Qui a dit ça ? (vrais messages du serveur)
// =====================================================================

export async function startWhoSaidIt(interaction, { source = null } = {}) {
  const from = source ?? interaction.channel;
  const fetched = await from.messages.fetch({ limit: 100 }).catch(() => null);
  const pool = [...(fetched?.values() ?? [])].filter((m) => !m.author.bot && m.content && m.content.length >= 25 && m.content.length <= 300 && !/https?:\/\/|<@|<#|<:/.test(m.content));
  const authors = [...new Set(pool.map((m) => m.author.id))];
  if (authors.length < 3 || pool.length < 4) return interaction.reply({ content: `Pas assez de messages variés dans ${from} (il faut 3 auteurs différents au moins).`, ...PRIVATE });
  const channel = await gameChannel(interaction);
  await interaction.reply({ content: `🗨️ « Qui a dit ça ? » commence dans ${channel} !`, ...PRIVATE });
  const game = { id: shortId(), channelId: channel.id, stopped: false };
  track(game, 'Qui a dit ça ?', '🗨️');
  const scores = new Map();
  try {
    const names = new Map();
    for (const m of pool) names.set(m.author.id, m.member?.displayName ?? m.author.globalName ?? m.author.username);
    const rounds = shuffle(pool).slice(0, 5);
    await channel.send({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🗨️ Qui a dit ça ?').setDescription(`5 vrais messages de ${from}, à vous de retrouver leur auteur ! 15 secondes par citation.`)] });
    for (const [i, m] of rounds.entries()) {
      if (game.stopped) break;
      const wrong = shuffle(authors.filter((id) => id !== m.author.id)).slice(0, 3);
      const options = shuffle([m.author.id, ...wrong]);
      const { answers } = await buttonQuestion(channel, game, { title: `🗨️ ${i + 1}/${rounds.length} · « ${m.content.replace(/\n/g, ' ').slice(0, 200)} »`, choices: options.map((id) => names.get(id)), right: options.indexOf(m.author.id), ms: 15_000 });
      const good = [...answers.entries()].filter(([, a]) => a === options.indexOf(m.author.id)).map(([id]) => id);
      for (const id of good) scores.set(id, (scores.get(id) ?? 0) + 1);
      for (const id of answers.keys()) if (!scores.has(id)) scores.set(id, 0);
      await channel.send({ content: `✍️ C’était **${names.get(m.author.id)}** · [le message](${m.url})`, allowedMentions: { parse: [] } });
      await sleep(1500);
    }
    await payPodium(interaction.guildId, scores, [200, 100, 50], 'Qui a dit ça ?');
    await channel.send({ embeds: [scoreEmbed('🗨️ Qui connaît le mieux le serveur ?', scores, [200, 100, 50])] });
  } finally {
    untrack(game);
  }
  return undefined;
}

// =====================================================================
// Devine le rappeur : la photo se dévoile petit à petit
// =====================================================================

const RAPPERS = ['Ninho', 'Jul', 'SCH', 'PNL', 'Booba', 'Damso', 'Nekfeu', 'Orelsan', 'Gazo', 'Tiakola', 'Werenoi', 'Niska', 'Hamza', 'Kaaris', 'Soolking', 'Aya Nakamura', 'Lomepal', 'Laylow', 'Freeze Corleone', 'Alonzo', 'Naps', 'Leto', 'Zola', 'Koba LaD', 'Maes', 'Rim\'K', 'Vald', 'Josman', 'Dinos', 'Plk', 'Hatik', 'Kalash Criminel', 'Mister V', 'Gims', 'Heuss L\'enfoiré', 'Drake', 'Travis Scott', 'Kendrick Lamar', 'Eminem', 'Kanye West'];
export async function blurStages(buffer) {
  const { default: sharp } = await import('sharp');
  const out = [];
  for (const sigma of [45, 25, 12, 4]) out.push(await sharp(buffer).resize(500, 500, { fit: 'cover' }).blur(sigma).jpeg({ quality: 80 }).toBuffer());
  return out;
}
export async function startGuessRapper(interaction, { rounds = 5 } = {}) {
  const channel = await claimChannel(interaction, '🎤 Devine le rappeur');
  if (!channel) return undefined;
  const game = { id: shortId(), channelId: channel.id, stopped: false };
  track(game, 'Devine le rappeur', '🎤');
  const scores = new Map();
  const players = new Set();
  try {
    await channel.send({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🎤 Devine le rappeur').setDescription(`${rounds} photos floutées qui se dévoilent en 4 étapes. Écrivez le nom de l’artiste : plus tu trouves tôt, plus tu marques (4, 3, 2, 1 points).`)] });
    for (const name of shuffle(RAPPERS).slice(0, rounds)) {
      if (game.stopped) break;
      const artist = (await deezer.searchArtist(name, 3).catch(() => []))[0];
      if (!artist?.picture_xl) continue;
      const buf = Buffer.from(await (await fetch(artist.picture_xl)).arrayBuffer());
      const stages = await blurStages(buf);
      let found = null;
      for (const [k, img] of stages.entries()) {
        if (game.stopped) break;
        await channel.send({ content: `🎤 **Photo ${k + 1}/4**${k ? '' : ' · qui est-ce ?'}`, files: [new AttachmentBuilder(img, { name: 'rappeur.jpg' })] });
        found = await waitAnswer(channel, (m) => same(m.content, artist.name) || same(m.content, name), 12_000, players);
        if (found) {
          scores.set(found.author.id, (scores.get(found.author.id) ?? 0) + (4 - k));
          break;
        }
      }
      await channel.send({ content: found ? `✅ ${found.author} trouve **${artist.name}** !` : `⌛ C’était **${artist.name}**.`, files: [new AttachmentBuilder(buf, { name: 'reponse.jpg' })], allowedMentions: { parse: [] } });
      await sleep(2000);
    }
    for (const id of players) if (!scores.has(id)) scores.set(id, 0);
    await payPodium(interaction.guildId, scores, [300, 150, 75], 'Devine le rappeur');
    await channel.send({ embeds: [scoreEmbed('🎤 Les meilleures oreilles… et les meilleurs yeux', scores, [300, 150, 75])] });
  } finally {
    untrack(game);
  }
  return undefined;
}

// =====================================================================
// Mots croisés de l'IA : des définitions, des lettres qui se dévoilent
// =====================================================================

export function crosswordGrid(words, found) {
  // Chaque mot sur sa ligne, avec la lettre commune (la clé) alignée dans une colonne
  const key = words.map((w) => Math.floor(w.mot.length / 2));
  const left = Math.max(...key);
  return words.map((w, i) => {
    const pad = '⬛'.repeat(left - key[i]);
    const cells = [...w.mot].map((c, j) => (found[i] || w.shown?.includes(j) ? String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 97) : '⬜'));
    return `\`${String(i + 1).padStart(2)}\` ${pad}${cells.join('​')}`;
  }).join('\n');
}
export async function startCrossword(interaction, { theme = '' } = {}) {
  const channel = await claimChannel(interaction, '🧩 Les mots croisés du capitaine');
  if (!channel) return undefined;
  const game = { id: shortId(), channelId: channel.id, stopped: false };
  track(game, 'Mots croisés', '🧩');
  try {
    const ai = await chatJson({
      tag: 'jeux', thinking: 'minimal',
      system: 'Tu crées des mots croisés en français. Mots courants de 4 à 9 lettres, sans accent ni espace ni tiret, en minuscules. Définitions courtes façon mots fléchés.',
      prompt: `Thème : ${theme || 'la mer et les pirates'}. Donne 6 mots et leurs définitions.`,
      schema: { type: 'object', properties: { mots: { type: 'array', items: { type: 'object', properties: { mot: { type: 'string' }, def: { type: 'string' } }, required: ['mot', 'def'] } } }, required: ['mots'] },
    }).catch(() => null);
    let words = (ai?.mots ?? []).map((w) => ({ mot: normalize(w.mot).replace(/ /g, ''), def: w.def })).filter((w) => /^[a-z]{4,9}$/.test(w.mot)).slice(0, 6);
    if (words.length < 4) words = [{ mot: 'boussole', def: 'Elle indique le nord' }, { mot: 'galion', def: 'Gros navire espagnol chargé d’or' }, { mot: 'ancre', def: 'On la jette pour s’arrêter' }, { mot: 'vigie', def: 'Il guette du haut du mât' }, { mot: 'tresor', def: 'Ce que cherche tout pirate' }, { mot: 'recif', def: 'Rochers à fleur d’eau' }];
    words.forEach((w) => { w.shown = []; });
    const found = words.map(() => null);
    const scores = new Map();
    const view = () => new EmbedBuilder().setColor(COLOR).setTitle(`🧩 Mots croisés${theme ? ` · ${theme}` : ''}`)
      .setDescription(`${crosswordGrid(words, found)}\n\n${words.map((w, i) => `**${i + 1}.** ${w.def} *(${w.mot.length})*${found[i] ? ` · ✅ <@${found[i]}>` : ''}`).join('\n')}\n\nÉcrivez les mots dans le salon. Une lettre se dévoile toutes les 30 secondes.`);
    const msg = await channel.send({ embeds: [view()] });
    const end = Date.now() + 6 * 60_000;
    let reveal = Date.now() + 30_000;
    await new Promise((resolve) => {
      const reader = (m) => {
        if (m.author.bot) return false;
        const t = normalize(m.content).replace(/ /g, '');
        const i = words.findIndex((w, j) => !found[j] && w.mot === t);
        if (i < 0) return false;
        found[i] = m.author.id;
        scores.set(m.author.id, (scores.get(m.author.id) ?? 0) + 1);
        m.react('✅').catch(() => {});
        msg.edit({ embeds: [view()] }).catch(() => {});
        if (found.every(Boolean)) finish();
        return true;
      };
      const tick = setInterval(() => {
        if (game.stopped || Date.now() > end) return finish();
        if (Date.now() > reveal) {
          reveal = Date.now() + 30_000;
          for (const [i, w] of words.entries()) {
            if (found[i]) continue;
            const hidden = [...w.mot.keys()].filter((j) => !w.shown.includes(j));
            if (hidden.length > 1) w.shown.push(pick(hidden));
          }
          msg.edit({ embeds: [view()] }).catch(() => {});
        }
        return undefined;
      }, 2000);
      function finish() {
        clearInterval(tick);
        stopListening(channel.id, reader);
        resolve();
      }
      listenChannel(channel.id, reader);
    });
    words.forEach((w, i) => { if (!found[i]) w.shown = [...w.mot.keys()]; });
    await msg.edit({ embeds: [view()] }).catch(() => {});
    await payPodium(interaction.guildId, scores, [250, 120, 60], 'Mots croisés');
    await channel.send({ embeds: [scoreEmbed('🧩 Grille terminée', scores, [250, 120, 60])] });
  } finally {
    untrack(game);
  }
  return undefined;
}

// =====================================================================
// Escape game : 3 salles, une énigme par salle, 10 minutes en équipe
// =====================================================================

const ESCAPE = {
  titre: 'La cale du Hollandais',
  intro: 'Votre équipage se réveille enfermé dans la cale d’un navire fantôme. L’eau monte. Il faut sortir avant 10 minutes.',
  salles: [
    { nom: 'La cale', texte: 'Un coffre fermé par un cadenas à 4 chiffres. Gravé dessus : « Les mâts du navire, les pattes d’un perroquet, les yeux d’un pirate borgne, les doigts d’une main ». Le navire a 3 mâts.', reponse: '3215', indice: 'Mâts : 3 · pattes de perroquet : 2 · yeux d’un borgne : 1 · doigts d’une main : 5.' },
    { nom: 'Le carré des officiers', texte: 'Sur la porte, une plaque : « Je suis plein de trous et pourtant je retiens l’eau. » Un mot ouvre la serrure.', reponse: 'eponge', indice: 'On s’en sert pour laver le pont.' },
    { nom: 'Le pont', texte: 'La barre est bloquée. Le capitaine a noté : « Je suis toujours devant toi mais on ne me voit jamais. » Dites-le à la barre pour virer de bord.', reponse: 'avenir', indice: 'Ce n’est ni le passé ni le présent.' },
  ],
};
export async function startEscapeGame(interaction, { theme = '' } = {}) {
  const channel = await gameChannel(interaction);
  await interaction.reply({ content: `🗝️ L’escape game ouvre dans ${channel} !`, ...PRIVATE });
  const lobby = await openLobby({ channel, hostId: interaction.user.id, title: '🗝️ Escape game', description: `${theme ? `Thème : **${theme}**\n` : ''}3 salles, une énigme par salle, **10 minutes** en équipe. Un indice coûte 1 minute. Récompense : 🪙 300 chacun si vous sortez.`, min: 1, max: 8, waitMs: 90_000, color: COLOR });
  if (!lobby) return undefined;
  const thread = await gameThread(lobby.message, '🗝️ Escape game');
  const game = { id: shortId(), channelId: thread.id, players: lobby.players, stopped: false, hint: false };
  track(game, 'Escape game', '🗝️');
  try {
    const ai = theme ? await chatJson({
      tag: 'jeux', thinking: 'minimal',
      system: 'Tu écris un petit escape game en français pour Discord : 3 salles, chacune avec une énigme logique dont la réponse est un mot ou un nombre court, et un indice.',
      prompt: `Thème : ${theme}.`,
      schema: { type: 'object', properties: { titre: { type: 'string' }, intro: { type: 'string' }, salles: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, texte: { type: 'string' }, reponse: { type: 'string' }, indice: { type: 'string' } }, required: ['nom', 'texte', 'reponse', 'indice'] } } }, required: ['titre', 'intro', 'salles'] },
    }).catch(() => null) : null;
    const story = ai?.salles?.length >= 3 && ai.salles.every((s) => normalize(s.reponse).length <= 20) ? { ...ai, salles: ai.salles.slice(0, 3) } : ESCAPE;
    let deadline = Date.now() + 10 * 60_000;
    await thread.send({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`🗝️ ${story.titre}`).setDescription(`${story.intro}\n\nÉcrivez vos réponses dans ce fil. Fin ${until(deadline - Date.now())}.`)] });
    let escaped = true;
    for (const [i, room] of story.salles.entries()) {
      game.hint = false;
      await thread.send({
        embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`🚪 Salle ${i + 1}/3 · ${room.nom}`).setDescription(room.texte)],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`g:df:${game.id}:hint`).setLabel('Indice (-1 min)').setEmoji('💡').setStyle(ButtonStyle.Secondary))],
      });
      game.onHint = async () => { deadline -= 60_000; await thread.send(`💡 ${room.indice} *(il reste <t:${Math.round(deadline / 1000)}:R>)*`); };
      const m = await waitAnswer(thread, (x) => lobby.players.includes(x.author.id) && same(x.content, room.reponse), Math.max(1000, deadline - Date.now()));
      if (!m || game.stopped) { escaped = false; await thread.send(`🌊 L’eau a tout envahi… La réponse était **${room.reponse}**.`); break; }
      await thread.send(`🔓 ${m.author} ouvre la porte : **${room.reponse}** !`);
    }
    game.onHint = null;
    await playedGame(interaction.guildId, lobby.players);
    if (escaped) {
      for (const id of lobby.players) await addGold(interaction.guildId, id, 300, 'Escape game réussi');
      await thread.send({ embeds: [new EmbedBuilder().setColor(0x3fbf6a).setTitle('🏝️ Vous êtes libres !').setDescription(`Bravo ${lobby.players.map((id) => `<@${id}>`).join(', ')} : **+🪙 300** chacun.`)] });
    }
  } finally {
    untrack(game);
  }
  return undefined;
}

// =====================================================================
// Boutons
// =====================================================================

export async function handleDefiComponent(interaction) {
  const [, , id, action, arg] = interaction.customId.split(':');
  if (id === 'daily') {
    daily ??= (await load(DAILY_KEY, {}).catch(() => ({}))) ?? {};
    const g = daily[action];
    if (!g?.open) return interaction.reply({ content: 'Le quiz du jour est fermé.', ...PRIVATE });
    if (g.answers[interaction.user.id] !== undefined) return interaction.reply({ content: 'Tu as déjà répondu aujourd’hui.', ...PRIVATE });
    g.answers[interaction.user.id] = Number(arg);
    save(DAILY_KEY, daily);
    return interaction.reply({ content: '📩 Réponse enregistrée : résultat dans moins d’une heure !', ...PRIVATE });
  }
  const game = games.get(id);
  if (!game) return interaction.reply({ content: 'Ce défi est terminé.', ...PRIVATE });
  if (action === 'qa') {
    if (game.players && !game.players.includes(interaction.user.id)) return interaction.reply({ content: 'Tu ne participes pas à cette partie.', ...PRIVATE });
    if (game.answers?.has(interaction.user.id)) return interaction.reply({ content: 'Tu as déjà répondu.', ...PRIVATE });
    const choice = Number(arg);
    game.answers?.set(interaction.user.id, choice);
    if (choice === game.right && !game.firstRight) game.firstRight = interaction.user.id;
    if (game.players && game.players.every((p) => game.answers.has(p))) game.wake?.();
    return interaction.reply({ content: '📩 Réponse enregistrée.', ...PRIVATE });
  }
  if (action === 'hint') {
    if (!game.players.includes(interaction.user.id)) return interaction.reply({ content: 'Tu n’es pas dans l’équipe.', ...PRIVATE });
    if (game.hint || !game.onHint) return interaction.reply({ content: 'L’indice de cette salle est déjà donné.', ...PRIVATE });
    game.hint = true;
    await interaction.deferUpdate();
    return game.onHint();
  }
  return undefined;
}

export function startDefis(client) {
  setInterval(() => dailyQuizTick(client).catch((err) => console.warn('[quiz du jour]', err.message)), 5 * 60_000).unref();
}

export const _test = { games, quizQuestions, crosswordGrid, same, waitAnswer, busy, dailyState: () => daily, closeDailyQuiz, FALLBACK_QUIZ };
