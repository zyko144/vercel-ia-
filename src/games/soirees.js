// Jeux de soirée : Undercover, Petit Bac, Action ou vérité, Pendu musical, Quiz du serveur.
// Tous se lancent depuis /jeux ; les boutons ont le préfixe « g:ng: ».
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { chatJson } from '../ai/gemini.js';
import { load } from '../storage.js';
import { deezer } from '../music/deezer.js';
import { buildModal, field as f, readModal } from '../panels/ui.js';
import { sendRoleCards } from './roles.js';
import {
  PRIVATE, gameChannel, gameThread, listenChannel, mentions, normalize, openLobby, pick, registerGame, resolveNames, shortId, shuffle, sleep,
  stopListening, tokens, unregisterGame,
} from './common.js';

const games = new Map();
const nameOf = (game, id) => game.names?.get(id) ?? 'Joueur';
const tag = (id) => `<@${id}>`;
const until = (ms) => `<t:${Math.ceil((Date.now() + ms) / 1000)}:R>`;

/** Salle d'attente commune : renvoie { players, thread, names } ou null. */
async function gather(interaction, { title, description, min, max, color, emoji }) {
  const channel = await gameChannel(interaction);
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setDescription(`${emoji} La salle d'attente est ouverte dans <#${channel.id}> !`)], ...PRIVATE });
  const lobby = await openLobby({ channel, hostId: interaction.user.id, title, description, min, max, waitMs: 90_000, color, testSize: 0 });
  if (!lobby) return null;
  const thread = await gameThread(lobby.message, title.replace(/\*/g, ''));
  const names = await resolveNames(thread.guild ?? interaction.guild, lobby.players);
  return { players: lobby.players, thread, names };
}

/** Attend un message d'un joueur dans le fil (null si le temps est écoulé). */
function waitMessage(game, accept, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { stopListening(game.thread.id, reader); resolve(null); }, ms);
    const reader = (message) => {
      const value = accept(message);
      if (value === undefined) return false;
      clearTimeout(timer);
      stopListening(game.thread.id, reader);
      resolve(value);
      return true;
    };
    listenChannel(game.thread.id, reader);
  });
}

function track(game, kind, emoji) {
  games.set(game.id, game);
  registerGame({
    id: game.id, kind, emoji,
    info: () => ({ server: game.thread?.guild?.name ?? null, phase: game.phase ?? 'en cours', round: game.round ?? 0, players: game.players?.length ?? 0, alive: game.alive?.length ?? game.players?.length ?? 0, test: false, voice: false }),
    stop: () => { game.stopped = true; game.wake?.(); },
  });
}
function untrack(game) {
  games.delete(game.id);
  unregisterGame(game.id);
}
function scoreboard(game, scores, title) {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const medals = ['🥇', '🥈', '🥉'];
  return new EmbedBuilder().setColor(0xffc94d).setTitle(title)
    .setDescription(sorted.length ? sorted.map(([id, n], i) => `${medals[i] ?? `**${i + 1}.**`} ${tag(id)} · **${n}** pt${n > 1 ? 's' : ''}`).join('\n') : 'Personne n’a marqué.');
}

// =====================================================================
// UNDERCOVER : civils, 1 ou 2 undercovers (mot proche, sans le savoir) et Mister White (aucun mot)
// =====================================================================

const PAIRS = [['Pizza', 'Burger'], ['Plage', 'Piscine'], ['Chat', 'Chien'], ['Netflix', 'YouTube'], ['Tacos', 'Kebab'], ['Paris', 'Marseille'], ['Fortnite', 'Minecraft'], ['Coca', 'Pepsi'], ['Avion', 'Hélicoptère'], ['Café', 'Thé'], ['Instagram', 'TikTok'], ['Naruto', 'One Piece']];

async function pair() {
  const data = await chatJson({
    system: 'Tu prépares des parties d’Undercover pour des jeunes Français.',
    prompt: 'Donne UNE paire de mots proches (même catégorie, faciles à confondre), très connus, courts, en français. Varie les thèmes.',
    schema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } }, required: ['a', 'b'] },
    thinking: 'minimal', exactThinking: true,
  }).catch(() => null);
  return data?.a && data?.b && normalize(data.a) !== normalize(data.b) ? [data.a.trim(), data.b.trim()] : shuffle(pick(PAIRS));
}

export async function startUndercover(interaction) {
  const lobby = await gather(interaction, {
    title: '🕶️ UNDERCOVER', emoji: '🕶️', color: 0x2b2d31, min: 4, max: 12,
    description: 'Les civils ont tous le même mot. Les **undercovers** ont un mot proche (et ne le savent pas). **Mister White** n’a aucun mot : il bluffe.\nUn indice chacun, puis on vote. 4 joueurs minimum.',
  });
  if (!lobby) return;
  const [civil, under] = await pair();
  const players = shuffle(lobby.players);
  const nUnder = players.length >= 7 ? 2 : 1;
  const undercovers = players.slice(0, nUnder);
  const white = players.length >= 5 ? players[nUnder] : null;
  const game = { id: shortId(), ...lobby, players, alive: [...players], civil, under, undercovers, white, clues: new Map(), votes: new Map(), round: 0, stopped: false, phase: 'indices' };
  track(game, 'Undercover', '🕶️');
  const wordOf = (id) => (id === white ? null : undercovers.includes(id) ? under : civil);
  await sendRoleCards(interaction.client, players.map((id) => ({
    userId: id,
    card: id === white ? 'imposteur' : 'motsecret',
    color: 0x2b2d31,
    author: '🕶️ UNDERCOVER',
    title: id === white ? '🎭 Tu es Mister White' : '🤫 Ton mot secret',
    description: id === white ? '# Aucun mot\nÉcoute les indices des autres et bluffe. Si tu es démasqué, devine le mot des civils pour gagner.' : `# ${wordOf(id)}`,
    fields: [['🎯 Le but', id === white ? 'Survivre jusqu’à la fin, ou deviner le mot des civils.' : 'Trouver les undercovers et Mister White… sauf si c’est toi l’undercover (tu ne le sais pas).']],
    link: game.thread.url,
    footer: `${players.length} joueurs · ${nUnder} undercover(s)${white ? ' · 1 Mister White' : ''}`,
  })));
  await game.thread.send({ content: mentions(players), embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('📬 Rôles envoyés en MP').setDescription(`${nUnder} undercover(s)${white ? ' et 1 Mister White' : ''} se cachent parmi vous. Premier tour dans quelques secondes.`)], allowedMentions: { users: players } }).catch(() => {});
  await sleep(6_000);
  try {
    let result = null;
    while (!game.stopped && !result && game.round < 7) {
      game.round++;
      game.phase = 'indices';
      await game.thread.send({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle(`🗣️ Tour ${game.round}`).setDescription(`Un indice chacun (1 à 5 mots), dans l’ordre : ${game.alive.map((id, i) => `**${i + 1}.** ${nameOf(game, id)}`).join(' · ')}`)] }).catch(() => {});
      for (const id of [...game.alive]) {
        if (game.stopped) break;
        await game.thread.send({ content: `👉 ${tag(id)}, ton indice (fin ${until(45_000)})`, allowedMentions: { users: [id] } }).catch(() => {});
        const clue = await waitMessage(game, (m) => {
          if (m.author.id !== id) return undefined;
          const text = m.content.trim();
          if (!text || tokens(text).length > 5) { m.reply('Un indice de **1 à 5 mots** 🙏').catch(() => {}); return undefined; }
          if (wordOf(id) && normalize(text).includes(normalize(wordOf(id)))) { m.reply('🚫 Pas ton mot !').catch(() => {}); return undefined; }
          m.react('✅').catch(() => {});
          return text;
        }, 45_000);
        game.clues.set(id, [...(game.clues.get(id) ?? []), clue ?? '(rien)']);
      }
      if (game.stopped) break;
      game.phase = 'vote';
      const out = await vote(game);
      if (!out) continue;
      game.alive = game.alive.filter((x) => x !== out);
      const role = out === white ? 'Mister White' : undercovers.includes(out) ? 'undercover' : 'civil';
      await game.thread.send({ content: `🚪 ${tag(out)} est éliminé : c’était **${role}**${role === 'civil' ? ' 😬' : ' 🎯'}.`, allowedMentions: { parse: [] } }).catch(() => {});
      if (out === white) {
        await game.thread.send({ content: `🎭 ${tag(out)}, dernière chance : devine le mot des civils (fin ${until(30_000)}) !`, allowedMentions: { users: [out] } }).catch(() => {});
        const guess = await waitMessage(game, (m) => (m.author.id === out ? m.content : undefined), 30_000);
        if (guess && normalize(guess) === normalize(civil)) result = { winners: [out], why: `Mister White a deviné « ${civil} » !` };
      }
      const infiltrators = game.alive.filter((x) => x === white || undercovers.includes(x));
      const civils = game.alive.filter((x) => !infiltrators.includes(x));
      if (!result && !infiltrators.length) result = { winners: players.filter((x) => x !== white && !undercovers.includes(x)), why: 'Tous les infiltrés sont démasqués !' };
      if (!result && civils.length <= 1) result = { winners: infiltrators, why: 'Les infiltrés ont survécu !' };
    }
    result ??= { winners: game.alive.filter((x) => x === white || undercovers.includes(x)), why: 'Trop de tours : les infiltrés s’en sortent.' };
    await game.thread.send({
      embeds: [new EmbedBuilder().setColor(0x3dff9a).setTitle(game.stopped ? '⏹️ Partie arrêtée' : `🏆 ${result.why}`)
        .setDescription(`Mot des civils : **${civil}** · mot des undercovers : **${under}**\nUndercover(s) : ${undercovers.map(tag).join(', ')}${white ? ` · Mister White : ${tag(white)}` : ''}${game.stopped ? '' : `\n\n**Gagnants :** ${result.winners.map(tag).join(', ') || 'personne'}`}`)],
      allowedMentions: { parse: [] },
    }).catch(() => {});
  } finally {
    untrack(game);
  }
}

async function vote(game) {
  game.votes = new Map();
  const message = await game.thread.send({
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🗳️ Qui éliminer ?').setDescription(`${game.alive.map((id) => `${nameOf(game, id)} : ${(game.clues.get(id) ?? []).join(' · ')}`).join('\n')}\n\nFin ${until(60_000)}.`)],
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`g:ng:${game.id}:vote`).setPlaceholder('Ton vote')
      .addOptions(game.alive.map((id) => ({ label: nameOf(game, id).slice(0, 100), value: id }))))],
  }).catch(() => null);
  await new Promise((resolve) => { game.wake = resolve; game.timer = setTimeout(resolve, 60_000); });
  clearTimeout(game.timer);
  await message?.edit({ components: [] }).catch(() => {});
  const counts = new Map();
  for (const t of game.votes.values()) counts.set(t, (counts.get(t) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length || (sorted[1] && sorted[1][1] === sorted[0][1])) {
    await game.thread.send('⚖️ Égalité : personne n’est éliminé.').catch(() => {});
    return null;
  }
  return sorted[0][0];
}

// =====================================================================
// PETIT BAC : une lettre, 5 catégories, 3 manches, l'IA vérifie les réponses
// =====================================================================

const CATEGORIES = ['Prénom', 'Pays ou ville', 'Animal', 'Métier', 'Objet', 'Fruit ou légume', 'Marque', 'Rappeur ou chanteur', 'Film ou série', 'Sport', 'Personnage de dessin animé', 'Plat'];
const LETTERS = 'ABCDEFGHIJLMNOPRSTV';

export async function startPetitBac(interaction) {
  const lobby = await gather(interaction, { title: '📝 PETIT BAC', emoji: '📝', color: 0x3dff9a, min: 2, max: 10, description: 'Une lettre, 5 catégories, 75 secondes. Réponse valide et unique : **2 pts**, valide mais partagée : **1 pt**. 3 manches, l’IA vérifie.' });
  if (!lobby) return;
  const game = { id: shortId(), ...lobby, scores: new Map(lobby.players.map((id) => [id, 0])), round: 0, stopped: false, answers: new Map() };
  track(game, 'Petit Bac', '📝');
  try {
    for (game.round = 1; game.round <= 3 && !game.stopped; game.round++) {
      game.letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      game.categories = shuffle(CATEGORIES).slice(0, 5);
      game.answers = new Map();
      game.phase = `manche ${game.round}`;
      const message = await game.thread.send({
        embeds: [new EmbedBuilder().setColor(0x3dff9a).setTitle(`📝 Manche ${game.round}/3 · lettre **${game.letter}**`)
          .setDescription(`${game.categories.map((c) => `• ${c}`).join('\n')}\n\nClique sur **Mes réponses** (fin ${until(75_000)}).`)],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`g:ng:${game.id}:bac`).setLabel('Mes réponses').setEmoji('✍️').setStyle(ButtonStyle.Success))],
      }).catch(() => null);
      await new Promise((resolve) => { game.wake = resolve; game.timer = setTimeout(resolve, 75_000); });
      clearTimeout(game.timer);
      await message?.edit({ components: [] }).catch(() => {});
      if (game.stopped) break;
      await scoreBac(game);
    }
    await game.thread.send({ embeds: [scoreboard(game, game.scores, game.stopped ? '⏹️ Partie arrêtée' : '🏆 Résultat du Petit Bac')], allowedMentions: { parse: [] } }).catch(() => {});
  } finally {
    untrack(game);
  }
}

async function scoreBac(game) {
  const entries = [...game.answers.entries()];
  const table = entries.map(([id, a]) => `${id} : ${game.categories.map((c, i) => `${c} = ${a[i] || '-'}`).join(' ; ')}`).join('\n');
  const verdict = await chatJson({
    system: 'Tu es l’arbitre d’un Petit Bac en français. Tu es juste : la réponse doit commencer par la lettre et correspondre vraiment à la catégorie (orthographe approximative acceptée).',
    prompt: `Lettre : ${game.letter}\nCatégories : ${game.categories.join(', ')}\nRéponses (identifiant : catégorie = réponse) :\n${table}\n\nPour chaque joueur, donne la liste des 5 validités (true/false) dans l'ordre des catégories.`,
    schema: { type: 'object', properties: { joueurs: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, valides: { type: 'array', items: { type: 'boolean' } } }, required: ['id', 'valides'] } } }, required: ['joueurs'] },
    thinking: 'low', exactThinking: true,
  }).catch(() => null);
  const valid = (id, i) => {
    const answer = game.answers.get(id)?.[i] ?? '';
    if (!answer || normalize(answer)[0] !== game.letter.toLowerCase()) return false;
    const ai = verdict?.joueurs?.find((j) => j.id === id)?.valides?.[i];
    return ai === undefined ? answer.length >= 2 : Boolean(ai);
  };
  const lines = [];
  for (const [id] of entries) {
    let points = 0;
    const cells = game.categories.map((c, i) => {
      const answer = game.answers.get(id)[i];
      if (!valid(id, i)) return `~~${answer || '—'}~~`;
      const shared = entries.some(([other]) => other !== id && valid(other, i) && normalize(game.answers.get(other)[i]) === normalize(answer));
      points += shared ? 1 : 2;
      return shared ? `${answer} (1)` : `**${answer}** (2)`;
    });
    game.scores.set(id, (game.scores.get(id) ?? 0) + points);
    lines.push(`${tag(id)} · **+${points}**\n-# ${cells.join(' · ')}`);
  }
  await game.thread.send({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setTitle(`✅ Manche ${game.round} · lettre ${game.letter}`).setDescription(lines.join('\n') || 'Personne n’a répondu 😴')], allowedMentions: { parse: [] } }).catch(() => {});
}

// =====================================================================
// ACTION OU VÉRITÉ : défis générés, les autres valident
// =====================================================================

const ACTIONS = ['Écris une phrase en imitant le style de ton rappeur préféré', 'Envoie le dernier emoji que tu as utilisé 10 fois de suite', 'Change ton pseudo pendant 10 minutes pour un nom de fruit', 'Fais un compliment sincère à la personne au-dessus de toi', 'Écris une punchline sur le bot'];
const TRUTHS = ['Quel est ton pire son écouté en boucle ?', 'Quelle est ta plus grosse honte en vocal ?', 'Qui du serveur te fait le plus rire ?', 'Quel jeu tu fais semblant de ne pas aimer ?', 'Ton plus gros fail en partie classée ?'];

export async function startActionVerite(interaction) {
  const lobby = await gather(interaction, { title: '🎲 ACTION OU VÉRITÉ', emoji: '🎲', color: 0xff5fd2, min: 2, max: 12, description: 'Chacun son tour : Action ou Vérité ? L’IA donne le défi, les autres valident. Défis gentils, tout se passe sur Discord.' });
  if (!lobby) return;
  const game = { id: shortId(), ...lobby, scores: new Map(lobby.players.map((id) => [id, 0])), round: 0, stopped: false, phase: 'en cours' };
  track(game, 'Action ou vérité', '🎲');
  const rounds = Math.min(12, game.players.length * 2);
  let last = null;
  try {
    for (game.round = 1; game.round <= rounds && !game.stopped; game.round++) {
      const player = pick(game.players.filter((id) => id !== last)) ?? pick(game.players);
      last = player;
      game.current = player;
      game.choice = null;
      const ask = await game.thread.send({
        content: `🎲 Tour ${game.round}/${rounds} · ${tag(player)}, **Action ou Vérité ?** (fin ${until(30_000)})`,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`g:ng:${game.id}:av:action`).setLabel('Action').setEmoji('🔥').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`g:ng:${game.id}:av:verite`).setLabel('Vérité').setEmoji('💬').setStyle(ButtonStyle.Primary),
        )],
        allowedMentions: { users: [player] },
      }).catch(() => null);
      await new Promise((resolve) => { game.wake = resolve; game.timer = setTimeout(resolve, 30_000); });
      clearTimeout(game.timer);
      await ask?.edit({ components: [] }).catch(() => {});
      if (game.stopped) break;
      const kind = game.choice ?? pick(['action', 'verite']);
      const challenge = await chatJson({
        system: 'Tu animes un action ou vérité bienveillant entre amis sur Discord (15-25 ans). Jamais rien de dangereux, sexuel, humiliant ou qui force à révéler une info privée. Faisable depuis Discord.',
        prompt: `Donne ${kind === 'action' ? 'une ACTION drôle à faire sur Discord (écrire, envoyer, changer son pseudo, faire un vocal court…)' : 'une question VÉRITÉ drôle mais pas gênante'} pour ${nameOf(game, player)}. Une phrase.`,
        schema: { type: 'object', properties: { defi: { type: 'string' } }, required: ['defi'] },
        thinking: 'minimal', exactThinking: true,
      }).then((d) => d.defi).catch(() => pick(kind === 'action' ? ACTIONS : TRUTHS));
      game.validations = new Map();
      const msg = await game.thread.send({
        embeds: [new EmbedBuilder().setColor(kind === 'action' ? 0xff3355 : 0x5865f2).setTitle(kind === 'action' ? '🔥 ACTION' : '💬 VÉRITÉ').setDescription(`${tag(player)} : **${challenge}**\n\nLes autres valident (fin ${until(75_000)}).`)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`g:ng:${game.id}:ok:yes`).setLabel('Validé').setEmoji('👍').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`g:ng:${game.id}:ok:no`).setLabel('Pas validé').setEmoji('👎').setStyle(ButtonStyle.Secondary),
        )],
        allowedMentions: { users: [player] },
      }).catch(() => null);
      await new Promise((resolve) => { game.wake = resolve; game.timer = setTimeout(resolve, 75_000); });
      clearTimeout(game.timer);
      await msg?.edit({ components: [] }).catch(() => {});
      const yes = [...game.validations.values()].filter(Boolean).length;
      const no = game.validations.size - yes;
      const ok = yes >= no;
      if (ok) game.scores.set(player, game.scores.get(player) + 1);
      await game.thread.send({ content: ok ? `✅ Validé pour ${tag(player)} (+1) · 👍 ${yes} / 👎 ${no}` : `❌ Pas validé pour ${tag(player)} · 👍 ${yes} / 👎 ${no}`, allowedMentions: { parse: [] } }).catch(() => {});
    }
    await game.thread.send({ embeds: [scoreboard(game, game.scores, game.stopped ? '⏹️ Partie arrêtée' : '🏆 Fin de l’action ou vérité')], allowedMentions: { parse: [] } }).catch(() => {});
  } finally {
    untrack(game);
  }
}

// =====================================================================
// PENDU MUSICAL : deviner le titre lettre par lettre ; l'extrait arrive en indice
// =====================================================================

const STAGES = ['', '  |\n  |\n  |\n__|__', '  +---+\n  |\n  |\n  |\n__|__', '  +---+\n  |   O\n  |\n  |\n__|__', '  +---+\n  |   O\n  |   |\n  |\n__|__', '  +---+\n  |   O\n  |  /|\n  |\n__|__', '  +---+\n  |   O\n  |  /|\\\n  |\n__|__', '  +---+\n  |   O\n  |  /|\\\n  |  /\n__|__', '  +---+\n  |   O\n  |  /|\\\n  |  / \\\n__|__'];
const MAX_ERRORS = STAGES.length - 1;
const cleanTitle = (t) => String(t).replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+.*$/, '').trim();

function masked(title, found) {
  return [...title].map((ch) => (/[a-zà-ÿ0-9]/i.test(ch) ? (found.has(normalize(ch)) ? ch.toUpperCase() : '＿') : ch)).join(' ');
}

export async function startPendu(interaction) {
  const channel = await gameChannel(interaction);
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff5fd2).setDescription(`🎵 Le pendu musical commence dans <#${channel.id}> !`)], ...PRIVATE });
  const pool = [...(await deezer.chart().catch(() => [])), ...(await deezer.search('rap francais', 40).catch(() => []))].filter((t) => t.preview && cleanTitle(t.title).length >= 3 && cleanTitle(t.title).length <= 30);
  const song = pick(pool);
  if (!song) return channel.send('😕 Impossible de trouver un son pour le pendu, réessaie.').catch(() => {});
  const title = cleanTitle(song.title);
  const start = await channel.send({ embeds: [new EmbedBuilder().setColor(0xff5fd2).setTitle('🎵 PENDU MUSICAL').setDescription('Devine le **titre du son** : écris une **lettre**, ou tente le **titre entier**. Tout le monde joue !')] });
  const thread = await gameThread(start, '🎵 Pendu musical');
  const game = { id: shortId(), thread, players: [], stopped: false, phase: 'en cours', found: new Set(), wrong: [], round: 0 };
  track(game, 'Pendu musical', '🎵');
  const board = () => new EmbedBuilder().setColor(0xff5fd2).setTitle('🎵 Quel est ce son ?')
    .setDescription(`\`\`\`\n${STAGES[game.wrong.length] || ' '}\n\`\`\`\n## ${masked(title, game.found)}\n${game.wrong.length ? `❌ ${game.wrong.join(' ')}` : ''}`)
    .setFooter({ text: `${MAX_ERRORS - game.wrong.length} erreur(s) restante(s)${game.wrong.length >= 3 ? ` · artiste : ${song.artist?.name}` : ''}` });
  try {
    await thread.send({ embeds: [board()] });
    let winner = null;
    const deadline = Date.now() + 4 * 60_000;
    let hintSent = false;
    while (!game.stopped && !winner && game.wrong.length < MAX_ERRORS && Date.now() < deadline) {
      const guess = await waitMessage(game, (m) => (m.author.bot ? undefined : { id: m.author.id, text: m.content.trim(), m }), deadline - Date.now());
      if (!guess) break;
      if (!game.players.includes(guess.id)) game.players.push(guess.id);
      const text = normalize(guess.text);
      if (text.length === 1 && /[a-z0-9]/.test(text)) {
        if (game.found.has(text) || game.wrong.includes(text.toUpperCase())) { guess.m.react('🔁').catch(() => {}); continue; }
        if (normalize(title).includes(text)) game.found.add(text);
        else game.wrong.push(text.toUpperCase());
        const all = [...normalize(title)].filter((ch) => /[a-z0-9]/.test(ch)).every((ch) => game.found.has(ch));
        if (all) winner = guess.id;
      } else if (text.length >= 2) {
        if (text === normalize(title)) winner = guess.id;
        else game.wrong.push('✗');
      } else continue;
      await thread.send({ embeds: [board()] }).catch(() => {});
      // Au 3e raté : l'extrait du son en indice
      if (!hintSent && game.wrong.length >= 3 && !winner) {
        hintSent = true;
        const audio = await fetch(song.preview).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
        if (audio) await thread.send({ content: '🎧 **Indice** : écoute l’extrait !', files: [new AttachmentBuilder(Buffer.from(audio), { name: 'extrait.mp3' })] }).catch(() => {});
      }
    }
    await thread.send({
      embeds: [new EmbedBuilder().setColor(winner ? 0x3dff9a : 0xff3355).setTitle(winner ? '🏆 Trouvé !' : '💀 Pendu !')
        .setDescription(`${winner ? `${tag(winner)} a trouvé : ` : 'C’était : '}**${title}** · ${song.artist?.name ?? ''}`).setThumbnail(song.album?.cover_medium ?? null)],
      allowedMentions: { parse: [] },
    }).catch(() => {});
  } finally {
    untrack(game);
  }
  return undefined;
}

// =====================================================================
// QUIZ DU SERVEUR : des questions sur le serveur et ses membres
// =====================================================================

async function serverFacts(guild) {
  const activity = (await load('activite', {}).catch(() => ({})))?.[guild.id] ?? {};
  const weeks = Object.keys(activity).sort();
  const lastWeek = activity[weeks.at(-1)]?.users ?? {};
  const top = Object.entries(lastWeek).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => guild.members.cache.get(id)?.displayName).filter(Boolean);
  const levels = (await load('niveaux', {}).catch(() => ({})))?.[guild.id] ?? {};
  const topXp = Object.entries(levels).sort((a, b) => b[1].xp - a[1].xp).slice(0, 3).map(([id]) => guild.members.cache.get(id)?.displayName).filter(Boolean);
  const owner = await guild.fetchOwner().catch(() => null);
  const channels = guild.channels.cache.filter((c) => c.isTextBased?.() && !c.isThread?.()).map((c) => c.name).slice(0, 25);
  const roles = guild.roles.cache.filter((r) => r.id !== guild.id && !r.managed).sort((a, b) => b.position - a.position).map((r) => r.name).slice(0, 12);
  return {
    nom: guild.name, cree_en: new Date(guild.createdTimestamp).getFullYear(), membres: guild.memberCount, boosts: guild.premiumSubscriptionCount ?? 0,
    proprietaire: owner?.displayName ?? null, salons: channels, roles, plus_actifs_semaine: top, plus_haut_niveau: topXp,
  };
}

export async function startQuizServeur(interaction) {
  const channel = await gameChannel(interaction);
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x4db8ff).setDescription(`🧠 Le quiz du serveur commence dans <#${channel.id}> !`)], ...PRIVATE });
  const facts = await serverFacts(interaction.guild);
  const data = await chatJson({
    system: 'Tu crées un quiz amusant sur un serveur Discord, à partir de faits réels. Uniquement des questions dont la réponse est dans les faits.',
    prompt: `Faits sur le serveur :\n${JSON.stringify(facts)}\n\nCrée 6 questions à 4 choix (une seule bonne réponse, choix plausibles).`,
    schema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, choix: { type: 'array', items: { type: 'string' } }, bonne: { type: 'integer' } }, required: ['question', 'choix', 'bonne'] } } }, required: ['questions'] },
    thinking: 'low', exactThinking: true,
  }).catch(() => null);
  let questions = (data?.questions ?? []).filter((q) => q.choix?.length === 4 && q.bonne >= 0 && q.bonne < 4).slice(0, 6);
  if (questions.length < 3) {
    const wrongYears = [facts.cree_en - 1, facts.cree_en + 1, facts.cree_en - 2];
    questions = [
      { question: `En quelle année ${facts.nom} a été créé ?`, choix: shuffle([facts.cree_en, ...wrongYears].map(String)), bonne: -1, answer: String(facts.cree_en) },
      { question: `Combien de membres environ sur ${facts.nom} ?`, choix: shuffle([facts.membres, Math.round(facts.membres * 1.6) + 3, Math.max(2, Math.round(facts.membres * 0.5)), facts.membres + 17].map(String)), bonne: -1, answer: String(facts.membres) },
      ...(facts.proprietaire ? [{ question: 'Qui est le propriétaire du serveur ?', choix: shuffle([facts.proprietaire, ...(facts.plus_actifs_semaine.filter((n) => n !== facts.proprietaire).slice(0, 2)), 'Le bot'].slice(0, 4)), bonne: -1, answer: facts.proprietaire }] : []),
    ].map((q) => ({ ...q, bonne: q.choix.indexOf(q.answer) })).filter((q) => q.choix.length === 4);
  }
  const start = await channel.send({ embeds: [new EmbedBuilder().setColor(0x4db8ff).setTitle(`🧠 QUIZ DU SERVEUR · ${facts.nom}`).setDescription(`${questions.length} questions sur le serveur et ses membres. 20 secondes par question : bonne réponse **+1**, la plus rapide **+1** en plus.`)] });
  const thread = await gameThread(start, '🧠 Quiz du serveur');
  const game = { id: shortId(), thread, players: [], stopped: false, phase: 'quiz', scores: new Map(), round: 0 };
  track(game, 'Quiz du serveur', '🧠');
  try {
    for (const [i, q] of questions.entries()) {
      if (game.stopped) break;
      game.round = i + 1;
      game.answers = new Map();
      game.firstRight = null;
      game.right = q.bonne;
      const letters = ['🇦', '🇧', '🇨', '🇩'];
      const msg = await thread.send({
        embeds: [new EmbedBuilder().setColor(0x4db8ff).setTitle(`❓ ${i + 1}/${questions.length} · ${q.question}`).setDescription(`${q.choix.map((c, j) => `${letters[j]} ${c}`).join('\n')}\n\nFin ${until(20_000)}`)],
        components: [new ActionRowBuilder().addComponents(q.choix.map((c, j) => new ButtonBuilder().setCustomId(`g:ng:${game.id}:qa:${j}`).setLabel(String(c).slice(0, 70)).setEmoji(letters[j]).setStyle(ButtonStyle.Secondary)))],
      }).catch(() => null);
      await new Promise((resolve) => { game.wake = resolve; game.timer = setTimeout(resolve, 20_000); });
      clearTimeout(game.timer);
      await msg?.edit({ components: [] }).catch(() => {});
      const good = [...game.answers.entries()].filter(([, a]) => a === q.bonne).map(([id]) => id);
      for (const id of good) game.scores.set(id, (game.scores.get(id) ?? 0) + 1 + (id === game.firstRight ? 1 : 0));
      await thread.send({ content: `✅ Réponse : **${q.choix[q.bonne]}**${good.length ? ` · trouvé par ${good.map(tag).join(', ')}${game.firstRight ? ` (⚡ ${tag(game.firstRight)} le plus rapide)` : ''}` : ' · personne 😅'}`, allowedMentions: { parse: [] } }).catch(() => {});
      await sleep(2_000);
    }
    await thread.send({ embeds: [scoreboard(game, game.scores, game.stopped ? '⏹️ Quiz arrêté' : '🏆 Résultats du quiz du serveur')], allowedMentions: { parse: [] } }).catch(() => {});
  } finally {
    untrack(game);
  }
  return undefined;
}

// =====================================================================
// Boutons et fenêtres
// =====================================================================

export async function handleSoireeComponent(interaction) {
  const [, , id, action, arg] = interaction.customId.split(':');
  const game = games.get(id);
  if (!game) return interaction.reply({ content: 'Cette partie est finie.', ...PRIVATE });
  const userId = interaction.user.id;

  if (action === 'vote') {
    if (!game.alive?.includes(userId)) return interaction.reply({ content: 'Seuls les joueurs en vie votent.', ...PRIVATE });
    game.votes.set(userId, interaction.values[0]);
    if (game.alive.every((x) => game.votes.has(x))) game.wake?.();
    return interaction.reply({ content: `🗳️ Tu votes contre **${nameOf(game, interaction.values[0])}** (tu peux changer).`, ...PRIVATE });
  }
  if (action === 'bac') {
    if (!game.players.includes(userId)) return interaction.reply({ content: 'Tu ne joues pas dans cette partie.', ...PRIVATE });
    return interaction.showModal(buildModal(`g:ng:${id}:bacsave:${game.round}`, `📝 Lettre ${game.letter}`, game.categories.map((c, i) => f.text(`c${i}`, c, { max: 40, ph: `Commence par ${game.letter}` }))));
  }
  if (action === 'bacsave') {
    if (Number(arg) !== game.round) return interaction.reply({ content: '⏱️ Trop tard, la manche est finie.', ...PRIVATE });
    const { values } = await readModal(interaction, game.categories.map((c, i) => f.text(`c${i}`, c, { max: 40 })));
    game.answers.set(userId, game.categories.map((c, i) => values?.[`c${i}`] ?? ''));
    if (game.players.every((p) => game.answers.has(p))) game.wake?.();
    return interaction.reply({ content: '✅ Réponses enregistrées (tu peux les renvoyer tant que la manche dure).', ...PRIVATE });
  }
  if (action === 'av') {
    if (userId !== game.current) return interaction.reply({ content: 'Ce n’est pas ton tour 😉', ...PRIVATE });
    game.choice = arg;
    game.wake?.();
    return interaction.deferUpdate();
  }
  if (action === 'ok') {
    if (userId === game.current || !game.players.includes(userId)) return interaction.reply({ content: 'Seuls les autres joueurs valident.', ...PRIVATE });
    game.validations.set(userId, arg === 'yes');
    if (game.players.filter((p) => p !== game.current).every((p) => game.validations.has(p))) game.wake?.();
    return interaction.reply({ content: arg === 'yes' ? '👍 Validé' : '👎 Pas validé', ...PRIVATE });
  }
  if (action === 'qa') {
    if (game.answers.has(userId)) return interaction.reply({ content: 'Tu as déjà répondu.', ...PRIVATE });
    const choice = Number(arg);
    game.answers.set(userId, choice);
    if (choice === game.right && !game.firstRight) game.firstRight = userId;
    return interaction.reply({ content: '📩 Réponse enregistrée.', ...PRIVATE });
  }
  return undefined;
}

// Pour le banc d'essai (tools/test-soirees.mjs)
export const _test = { scoreBac, masked, cleanTitle, games };

// Contenus réutilisés par la version arcade (src/arcade/party.js)
export const PARTY_DATA = { PAIRS, CATEGORIES, LETTERS, ACTIONS, TRUTHS, pair, serverFacts, cleanTitle };
