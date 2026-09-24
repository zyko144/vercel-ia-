// Loup-garou avec le bot comme meneur : rôles secrets, nuits (loups, voyante, sorcière), votes le jour,
// et un narrateur qui raconte la partie à voix haute dans le vocal de l'IA vocale.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { borrowVoiceAi, createNarrator, voiceAiChannelId, voiceAiFree } from '../voice-ai/assistant.js';
import { botName, botPause, botsPlay, humans, isBot, pickFrom, who } from './bots.js';
import { missingDmNotice, sendRoleCards } from './roles.js';
import { PRIVATE, gameChannel, gameThread, mentions, openLobby, pick, resolveNames, rulesLink, shortId, shuffle, sleep } from './common.js';

const ROLE_LOOK_MS = 10_000; // le temps de lire son MP avant la première nuit
const NIGHT_MS = 50_000;
const WITCH_MS = 35_000;
const DISCUSS_MS = 90_000;
const TEST_DISCUSS_MS = 15_000;
const VOTE_MS = 60_000;
const HUNTER_MS = 30_000;
const games = new Map(); // id -> partie

export const ROLES = {
  loup: {
    name: 'Loup-garou', emoji: '🐺', team: 'loups',
    desc: 'Chaque nuit, avec les autres loups, tu choisis une victime. Le jour, fais-toi passer pour un villageois.',
    howto: 'La nuit, bouton **Agir cette nuit** dans le fil : choisis ta victime. Tu vois le choix des autres loups, mettez-vous d’accord.',
  },
  voyante: {
    name: 'Voyante', emoji: '🔮', team: 'village',
    desc: "Chaque nuit, tu découvres le vrai rôle d'un joueur. Aide le village sans te faire griller.",
    howto: 'La nuit, **Agir cette nuit** : choisis un joueur, son rôle s’affiche. **Voir mon rôle** garde toutes tes visions.',
  },
  sorciere: {
    name: 'Sorcière', emoji: '🧪', team: 'village',
    desc: "Une potion de vie (sauver la victime des loups) et une potion de mort (tuer quelqu'un). Une seule fois chacune, et tu peux utiliser les deux la même nuit.",
    howto: 'Quand la sorcière se réveille, **Agir cette nuit** : tu vois qui les loups ont attaqué, puis tu sauves et/ou tu empoisonnes.',
  },
  chasseur: {
    name: 'Chasseur', emoji: '🏹', team: 'village',
    desc: 'Si tu meurs, de nuit comme de jour, tu tires une dernière flèche sur le joueur de ton choix.',
    howto: 'À ta mort, un menu apparaît dans le fil : tu as 30 secondes pour choisir ta cible.',
  },
  villageois: {
    name: 'Villageois', emoji: '🧑‍🌾', team: 'village',
    desc: 'Pas de pouvoir, mais ton vote compte : trouve les loups.',
    howto: 'La nuit, tu dors. Le jour, écoute, accuse, et vote pour éliminer un suspect.',
  },
};

const GOALS = {
  loups: 'Éliminer les villageois jusqu’à être **aussi nombreux qu’eux**.',
  village: 'Trouver et éliminer **tous les loups-garous**.',
};

/** La carte animée de chaque rôle (assets/jeux). */
const ROLE_CARDS = { loup: 'loup', voyante: 'voyante', sorciere: 'sorciere', chasseur: 'chasseur', villageois: 'villageois' };
const ROLE_COLORS = { loup: 0xed4245, voyante: 0xb04aff, sorciere: 0x2fffc8, chasseur: 0xffb02f, villageois: 0x7ee83f };

const NIGHT_LINES = [
  'La nuit tombe sur le village. Tout le monde ferme les yeux… Les loups-garous se réveillent et choisissent leur victime.',
  'Le soleil disparaît derrière les collines. Le village s\'endort, mais quelque part, des yeux jaunes s\'ouvrent dans le noir.',
  'Une brume épaisse recouvre les rues. Les portes se ferment, les bougies s\'éteignent. Les loups sortent chasser.',
];
const DAWN_DEATH = [
  'Le jour se lève, et un cri déchire le silence.',
  'Au petit matin, le village découvre une scène terrible.',
  'Le coq chante, mais quelqu\'un ne se réveillera pas.',
];
const DAWN_SAFE = [
  'Le jour se lève… et miracle, personne n\'est mort cette nuit !',
  'Le village se réveille au complet. Les loups ont raté leur coup.',
];
// Ce que disent les bots pendant le débat (parties de test) : {x} est leur suspect.
const BOT_TALK = [
  'Moi je dis {x}, beaucoup trop calme.',
  'J’ai un mauvais pressentiment sur {x}…',
  '{x} a voté bizarre, non ?',
  'Je suis simple villageois, je vous jure. Par contre {x}…',
  'On devrait regarder {x} de plus près.',
];

/** Rôles selon le nombre de joueurs. */
function dealRoles(players) {
  const n = players.length;
  const wolves = n <= 6 ? 1 : n <= 10 ? 2 : 3;
  const deck = Array(wolves).fill('loup');
  deck.push('voyante');
  if (n >= 6) deck.push('sorciere');
  if (n >= 8) deck.push('chasseur');
  while (deck.length < n) deck.push('villageois');
  const shuffled = shuffle(deck);
  return new Map(players.map((id, i) => [id, shuffled[i]]));
}

const nameOf = (game, id) => game.names?.get(id) ?? (isBot(id) ? botName(id) : game.guild?.members?.cache?.get(id)?.displayName ?? 'Joueur');
/** Nom lu par le narrateur : sans l'emoji des bots. */
const spoken = (game, id) => nameOf(game, id).replace(/^🤖\s*/, '');
const alive = (game) => game.players.filter((id) => game.alive.has(id));
const aliveWith = (game, role) => alive(game).filter((id) => game.roles.get(id) === role);
const roleLabel = (role) => `${ROLES[role].emoji} ${ROLES[role].name}`;

function targetMenu(game, action, placeholder, exclude = []) {
  const options = alive(game).filter((id) => !exclude.includes(id)).slice(0, 25)
    .map((id) => ({ label: nameOf(game, id).slice(0, 100), value: id }));
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`g:lg:${game.id}:${action}`).setPlaceholder(placeholder).addOptions(options));
}

function controls(game) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`g:lg:${game.id}:role`).setLabel('Voir mon rôle').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`g:lg:${game.id}:act`).setLabel('Agir cette nuit').setEmoji('🌙').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`g:lg:${game.id}:stop`).setLabel('Arrêter').setStyle(ButtonStyle.Danger),
  )];
}

async function tell(game, embed, { voice = null, ping = false } = {}) {
  await game.thread.send({
    content: ping ? mentions(alive(game)) : undefined,
    embeds: [embed],
    allowedMentions: ping ? { users: humans(alive(game)) } : { parse: [] },
  }).catch(() => {});
  if (voice && game.narrator) await game.narrator.say(voice);
}

/** Le vote qui mène en ce moment (pour les bots qui suivent la foule). */
function leading(votes, exclude = []) {
  const counts = new Map();
  for (const target of votes.values()) if (!exclude.includes(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Ce qu'une voyante a appris : les loups qu'elle a démasqués et les innocents. */
function knowledge(game, seer) {
  const visions = (game.visions.get(seer) ?? []).filter((v) => game.alive.has(v.target));
  return {
    wolves: visions.filter((v) => v.role === 'loup').map((v) => v.target),
    innocents: visions.filter((v) => v.role !== 'loup').map((v) => v.target),
  };
}

/** /jeu-loupgarou */
export async function startWerewolf(interaction) {
  const channel = await gameChannel(interaction);
  await interaction.reply({ content: `🐺 La salle d'attente est ouverte dans <#${channel.id}> !`, ...PRIVATE });
  const free = voiceAiFree();
  const lobby = await openLobby({
    channel,
    hostId: interaction.user.id,
    title: '🐺 LOUP-GAROU',
    description: [
      'Le bot est le meneur : il distribue les rôles en secret, gère les nuits et les votes.',
      'Votre rôle arrive en **message privé** dès le départ, avec sa carte.',
      'Rôles : 🐺 Loups · 🔮 Voyante · 🧪 Sorcière (6 joueurs et +) · 🏹 Chasseur (8 et +) · 🧑‍🌾 Villageois',
      rulesLink('loupgarou'),
    ].filter(Boolean).join('\n'),
    min: 4,
    max: 16,
    waitMs: 150_000,
    color: 0x2c2f33,
    voice: { available: free.ok, channelId: voiceAiChannelId(), defaultOn: true },
    testSize: 6,
  });
  if (!lobby) return undefined;

  const game = {
    id: shortId(), guild: interaction.guild, hostId: interaction.user.id,
    players: lobby.players, roles: dealRoles(lobby.players), alive: new Set(lobby.players),
    potions: { life: true, death: true }, day: 0, phase: 'setup', votes: new Map(), wolfVotes: new Map(),
    seen: new Set(), visions: new Map(), witch: null, stopped: false, release: null, narrator: null, test: lobby.test,
  };
  games.set(game.id, game);
  game.thread = await gameThread(lobby.message, '🐺 Loup-garou');
  game.names = await resolveNames(interaction.guild, game.players);
  console.log(`[loup-garou] partie ${game.id} : ${[...game.roles.entries()].map(([id, role]) => `${nameOf(game, id)}=${role}`).join(', ')}`);

  if (lobby.withVoice && voiceAiFree().ok) {
    try {
      game.release = await borrowVoiceAi('loup-garou');
      game.narrator = createNarrator({ voice: 'Charon', style: "Tu es le narrateur d'une partie de loup-garou : voix grave, mystérieuse, théâtrale." });
    } catch (err) {
      console.warn('[loup-garou] narrateur :', err.message);
    }
  }

  const composition = Object.entries([...game.roles.values()].reduce((acc, role) => ({ ...acc, [role]: (acc[role] ?? 0) + 1 }), {}))
    .map(([role, count]) => `${roleLabel(role)} ×${count}`).join(' · ');

  // Tous les rôles partent en même temps, avant même l'annonce dans le fil.
  const { failed } = await sendRoleCards(interaction.client, humans(game.players).map((userId) => {
    const role = game.roles.get(userId);
    const info = ROLES[role];
    const allies = role === 'loup' ? aliveWith(game, 'loup').filter((id) => id !== userId) : [];
    return {
      userId,
      card: ROLE_CARDS[role] ?? 'villageois',
      color: ROLE_COLORS[role] ?? 0x2c2f33,
      author: `🐺 LOUP-GAROU · ${game.players.length} joueurs`,
      title: `${info.emoji} Tu es ${info.name}`,
      description: `*${info.desc}*`,
      fields: [
        ['🎯 Ton objectif', GOALS[info.team]],
        ['🕹️ Comment jouer', info.howto],
        role === 'loup' ? ['🐺 Ta meute', allies.length ? `Tes complices : ${mentions(allies)}` : 'Tu es le seul loup : personne pour couvrir tes erreurs.'] : null,
        ['🏘️ Dans ce village', composition],
      ].filter(Boolean),
      link: game.thread.url,
      footer: role === 'loup' ? 'Le jour, fais-toi passer pour un villageois 🤫' : 'Garde ton rôle pour toi 🤫',
    };
  }));

  await tell(game, new EmbedBuilder().setColor(0x2c2f33).setAuthor({ name: '🐺 LOUP-GAROU' }).setTitle('📬 Vos rôles sont partis en message privé')
    .setDescription([
      'Regardez vos MP : votre carte de rôle vous attend.',
      `Dans ce village : ${composition}`,
      missingDmNotice(failed, 'Voir mon rôle'),
      game.narrator ? `🔊 Rejoignez <#${voiceAiChannelId()}> pour entendre le narrateur.` : null,
      'La première nuit tombe dans quelques secondes.',
    ].filter(Boolean).join('\n')), { ping: true, voice: 'Bienvenue au village. Chacun a reçu son rôle en secret. Que la partie commence.' });
  await game.thread.send({ components: controls(game) }).catch(() => {});
  await sleep(ROLE_LOOK_MS);

  play(game).catch((err) => {
    console.warn('[loup-garou] partie :', err);
    finish(game, null, `bug (${err.message})`).catch(() => {});
  });
  return undefined;
}

async function play(game) {
  while (!game.stopped) {
    game.day++;
    const deaths = await night(game);
    if (game.stopped) return;
    await dawn(game, deaths);
    if (game.stopped || await checkWin(game)) return;
    await dayVote(game);
    if (game.stopped || await checkWin(game)) return;
  }
}

/** Attend que tout le monde ait joué, ou la fin du temps. */
function waitPhase(game, ms, done) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => finishWait(), ms);
    const check = setInterval(() => { if (game.stopped || done()) finishWait(); }, 500);
    function finishWait() {
      clearTimeout(timer);
      clearInterval(check);
      resolve();
    }
    game.skipWait = finishWait;
  });
}

/** Ce que la voyante voit : gardé pour qu'elle puisse le relire (et pour les bots). */
function see(game, seer, target) {
  game.seen.add(seer);
  const list = game.visions.get(seer) ?? [];
  list.push({ night: game.day, target, role: game.roles.get(target) });
  game.visions.set(seer, list);
}

async function night(game) {
  game.phase = 'wolves';
  game.wolfVotes = new Map();
  game.seen = new Set();
  game.witch = null;
  const endsAt = Math.ceil((Date.now() + NIGHT_MS) / 1000);
  const line = pick(NIGHT_LINES);
  await tell(game, new EmbedBuilder().setColor(0x1e1f4b).setAuthor({ name: `🌙 NUIT ${game.day}` }).setTitle('Le village s\'endort…')
    .setDescription(`${line}\n\n🐺 Loups, 🔮 Voyante : appuyez sur **Agir cette nuit** (fin <t:${endsAt}:R>).\nLes autres, dormez bien 😴`), { voice: line });
  await game.thread.send({ components: controls(game) }).catch(() => {});

  const wolves = aliveWith(game, 'loup');
  const seer = aliveWith(game, 'voyante')[0];
  const day = game.day;
  botsPlay(alive(game), () => !game.stopped && game.phase === 'wolves' && game.day === day, (bot) => {
    const role = game.roles.get(bot);
    if (role === 'loup') {
      // Les loups bots suivent le choix de la meute quand il y en a déjà un.
      const pack = leading(game.wolfVotes);
      const target = pack && Math.random() < 0.75 ? pack : pickFrom(alive(game), aliveWith(game, 'loup'));
      if (target) game.wolfVotes.set(bot, target);
    }
    if (role === 'voyante' && !game.seen.has(bot)) {
      const already = (game.visions.get(bot) ?? []).map((v) => v.target);
      const target = pickFrom(alive(game), [bot, ...already]) ?? pickFrom(alive(game), [bot]);
      if (target) see(game, bot, target);
      else game.seen.add(bot);
    }
  });
  await waitPhase(game, NIGHT_MS, () => wolves.every((id) => game.wolfVotes.has(id)) && (!seer || game.seen.has(seer)));
  if (game.stopped) return [];

  // La victime : le choix le plus fréquent des loups (égalité : au hasard parmi les premiers)
  const counts = new Map();
  for (const target of game.wolfVotes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
  const best = Math.max(0, ...counts.values());
  const victim = best ? pick([...counts.entries()].filter(([, n]) => n === best).map(([id]) => id)) : null;

  let saved = false;
  let poisoned = null;
  const witch = aliveWith(game, 'sorciere')[0];
  if (witch && (game.potions.life || game.potions.death)) {
    game.phase = 'witch';
    game.witch = { victim, done: false, saved: false, poisoned: null };
    await game.thread.send({ content: `🧪 La sorcière se réveille… (fin <t:${Math.ceil((Date.now() + WITCH_MS) / 1000)}:R>)` }).catch(() => {});
    if (game.narrator) await game.narrator.say('La sorcière se réveille. Va-t-elle utiliser ses potions ?');
    botsPlay([witch], () => !game.stopped && game.phase === 'witch' && !game.witch.done, () => {
      if (game.potions.life && game.witch.victim && Math.random() < 0.5) {
        game.potions.life = false;
        game.witch.saved = true;
      }
      if (game.potions.death && Math.random() < 0.15) {
        const target = pickFrom(alive(game), [witch, game.witch.saved ? null : game.witch.victim]);
        if (target) {
          game.potions.death = false;
          game.witch.poisoned = target;
        }
      }
      game.witch.done = true;
    });
    await waitPhase(game, WITCH_MS, () => game.witch.done);
    saved = game.witch.saved;
    poisoned = game.witch.poisoned;
  }
  game.phase = 'dawn';
  return [...new Set([saved ? null : victim, poisoned].filter(Boolean))];
}

/** Retire un joueur de la partie et dit qui il était. */
function die(game, id, how) {
  game.alive.delete(id);
  return `💀 ${who(id)} ${how}. C'était ${roleLabel(game.roles.get(id))}.`;
}

/**
 * Les chasseurs morts tirent leur dernière flèche, après l'annonce de leur mort
 * (avant, le menu du chasseur apparaissait avant même qu'on sache qui était mort).
 */
async function hunters(game, dead) {
  for (const hunter of dead) {
    if (game.stopped || game.roles.get(hunter) !== 'chasseur') continue;
    const target = await hunterShot(game, hunter);
    if (game.stopped) return;
    if (!target) {
      await tell(game, new EmbedBuilder().setColor(0x95a5a6).setTitle('🏹 Le chasseur n’a pas tiré').setDescription(`${who(hunter)} emporte sa flèche dans la tombe.`));
      continue;
    }
    const line = die(game, target, 'reçoit la dernière flèche du chasseur');
    await tell(game, new EmbedBuilder().setColor(0xffb02f).setTitle('🏹 La dernière flèche').setDescription(line),
      { voice: `Le chasseur tire sa dernière flèche sur ${spoken(game, target)}. C'était ${ROLES[game.roles.get(target)].name}.` });
    await hunters(game, [target]);
  }
}

async function hunterShot(game, hunter) {
  game.phase = 'hunter';
  game.hunter = { id: hunter, target: null };
  await game.thread.send({
    content: `🏹 ${who(hunter)}, tu es mort mais il te reste une flèche : choisis ta cible (fin <t:${Math.ceil((Date.now() + HUNTER_MS) / 1000)}:R>).`,
    components: isBot(hunter) ? [] : [targetMenu(game, 'hunt', 'Sur qui tu tires ?', [hunter])],
    allowedMentions: { users: humans([hunter]) },
  }).catch(() => {});
  if (isBot(hunter)) {
    await botPause();
    // Un chasseur bot tire sur le suspect du dernier vote s'il est encore en vie.
    const suspect = leading(game.votes, [hunter]);
    game.hunter.target = suspect && game.alive.has(suspect) ? suspect : pickFrom(alive(game), [hunter]);
  }
  await waitPhase(game, HUNTER_MS, () => Boolean(game.hunter.target));
  const target = game.hunter.target;
  game.hunter = null;
  return target && game.alive.has(target) ? target : null;
}

async function dawn(game, deaths) {
  const lines = deaths.map((id) => die(game, id, 'a été retrouvé mort'));
  const intro = deaths.length ? pick(DAWN_DEATH) : pick(DAWN_SAFE);
  const voice = deaths.length
    ? `${intro} ${deaths.map((id) => `${spoken(game, id)} est mort cette nuit. C'était ${ROLES[game.roles.get(id)].name}.`).join(' ')}`
    : intro;
  await tell(game, new EmbedBuilder().setColor(0xf1c40f).setAuthor({ name: `☀️ JOUR ${game.day}` }).setTitle(intro)
    .setDescription(lines.join('\n') || 'Tout le monde est vivant.'), { voice });
  await hunters(game, deaths);
}

/** Pendant le débat, chaque bot lance une accusation (parties de test seulement). */
function botsTalk(game) {
  const day = game.day;
  botsPlay(alive(game), () => !game.stopped && game.phase === 'discussion' && game.day === day, (bot) => {
    const role = game.roles.get(bot);
    let suspect;
    if (role === 'voyante') suspect = knowledge(game, bot).wolves[0];
    if (!suspect) suspect = pickFrom(alive(game), role === 'loup' ? aliveWith(game, 'loup') : [bot]);
    if (!suspect) return;
    const line = role === 'voyante' && knowledge(game, bot).wolves.includes(suspect)
      ? `Faites-moi confiance : ${nameOf(game, suspect)} est un loup. Je le sais.`
      : pick(BOT_TALK).replace('{x}', nameOf(game, suspect));
    game.thread.send({ content: `${botName(bot)} : « ${line} »`, allowedMentions: { parse: [] } }).catch(() => {});
  });
}

/** Le vote d'un bot : les loups protègent la meute, la voyante utilise ses visions, les autres suivent la foule. */
function botVote(game, bot) {
  const role = game.roles.get(bot);
  const wolves = aliveWith(game, 'loup');
  if (role === 'loup') {
    const crowd = leading(game.votes, [...wolves, bot]);
    return crowd && Math.random() < 0.7 ? crowd : pickFrom(alive(game), [bot, ...wolves]);
  }
  if (role === 'voyante') {
    const { wolves: known, innocents } = knowledge(game, bot);
    if (known.length) return known[0];
    return pickFrom(alive(game), [bot, ...innocents]) ?? pickFrom(alive(game), [bot]);
  }
  const crowd = leading(game.votes, [bot]);
  return crowd && Math.random() < 0.5 ? crowd : pickFrom(alive(game), [bot]);
}

async function dayVote(game) {
  game.phase = 'discussion';
  const discussMs = game.test ? TEST_DISCUSS_MS : DISCUSS_MS;
  const endsAt = Math.ceil((Date.now() + discussMs) / 1000);
  await tell(game, new EmbedBuilder().setColor(0xf1c40f).setTitle('🗣️ Débat')
    .setDescription(`Discutez ici ou en vocal : qui est un loup ? Le vote commence <t:${endsAt}:R>.\n-# <@${game.hostId}> peut lancer le vote plus tôt.`),
  { ping: true, voice: 'Le village se réunit. Débattez, puis votez pour éliminer un suspect.' });
  await game.thread.send({
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`g:lg:${game.id}:skip`).setLabel('Voter maintenant').setEmoji('🗳️').setStyle(ButtonStyle.Primary),
    )],
  }).catch(() => {});
  botsTalk(game);
  await waitPhase(game, discussMs, () => false);
  if (game.stopped) return;

  game.phase = 'vote';
  game.votes = new Map();
  const message = await game.thread.send({
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🗳️ Vote du village')
      .setDescription(`Choisissez qui éliminer (vous pouvez changer d'avis). Fin <t:${Math.ceil((Date.now() + VOTE_MS) / 1000)}:R>.`)],
    components: [targetMenu(game, 'vote', 'Qui éliminer ?')],
  }).catch(() => null);
  const day = game.day;
  botsPlay(alive(game), () => !game.stopped && game.phase === 'vote' && game.day === day, (bot) => {
    const target = botVote(game, bot);
    if (target) game.votes.set(bot, target);
  });
  await waitPhase(game, VOTE_MS, () => alive(game).every((id) => game.votes.has(id)));
  await message?.edit({ components: [] }).catch(() => {});
  if (game.stopped) return;

  const counts = new Map();
  for (const target of game.votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const detail = sorted.map(([id, n]) => `${who(id)} : ${n}`).join(' · ') || 'aucun vote';
  if (!sorted.length || (sorted[1] && sorted[1][1] === sorted[0][1])) {
    await tell(game, new EmbedBuilder().setColor(0x95a5a6).setTitle('⚖️ Égalité : personne n\'est éliminé').setDescription(detail), { voice: 'Le village n\'arrive pas à se décider. Personne n\'est éliminé.' });
    return;
  }
  const [out] = sorted[0];
  const line = die(game, out, 'est éliminé par le village');
  await tell(game, new EmbedBuilder().setColor(0xed4245).setTitle(`🔥 ${nameOf(game, out)} est éliminé`).setDescription(`${line}\n-# Votes : ${detail}`),
    { voice: `Le village a tranché : ${spoken(game, out)} est éliminé. C'était ${ROLES[game.roles.get(out)].name}.` });
  await hunters(game, [out]);
}

async function checkWin(game) {
  const wolves = aliveWith(game, 'loup').length;
  const others = alive(game).length - wolves;
  if (!wolves) {
    await finish(game, 'village', 'tous les loups sont morts');
    return true;
  }
  if (wolves >= others) {
    await finish(game, 'loups', 'les loups sont aussi nombreux que les villageois');
    return true;
  }
  return false;
}

async function finish(game, winners, reason) {
  if (game.ended) return;
  game.ended = true;
  game.stopped = true;
  game.skipWait?.();
  games.delete(game.id);
  const title = winners === 'loups' ? '🐺 Les loups-garous ont gagné !' : winners === 'village' ? '🎉 Le village a gagné !' : '⏹️ Partie arrêtée';
  const roles = game.players.map((id) => `${game.alive.has(id) ? '❤️' : '💀'} ${who(id)} · ${roleLabel(game.roles.get(id))}`).join('\n');
  await tell(game, new EmbedBuilder().setColor(winners === 'loups' ? 0xed4245 : 0x57f287).setAuthor({ name: '🐺 LOUP-GAROU' }).setTitle(title)
    .setDescription(`${reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.\n\n` : ''}${roles}\n-# ${game.day} nuit${game.day > 1 ? 's' : ''}`),
  { voice: winners ? `${title.replace(/^\S+\s/, '')} ${reason}.` : null });
  game.narrator?.close();
  await game.release?.().catch(() => {});
}

/** Le panneau de la sorcière, selon les potions qui lui restent. */
function witchPanel(game, witch) {
  const buttons = [];
  if (game.potions.life && game.witch.victim && !game.witch.saved) {
    buttons.push(new ButtonBuilder().setCustomId(`g:lg:${game.id}:save`).setLabel(`Sauver ${nameOf(game, game.witch.victim)}`.slice(0, 80)).setEmoji('💚').setStyle(ButtonStyle.Success));
  }
  buttons.push(new ButtonBuilder().setCustomId(`g:lg:${game.id}:pass`).setLabel(game.witch.saved ? 'Terminer' : 'Ne rien faire').setStyle(ButtonStyle.Secondary));
  const rows = [new ActionRowBuilder().addComponents(buttons)];
  const poisonable = alive(game).filter((id) => id !== witch && !(id === game.witch.victim && !game.witch.saved));
  if (game.potions.death && poisonable.length) rows.push(targetMenu(game, 'poison', '☠️ Empoisonner quelqu\'un…', alive(game).filter((id) => !poisonable.includes(id))));
  const attacked = game.witch.victim
    ? `🧪 Les loups ont attaqué **${nameOf(game, game.witch.victim)}** cette nuit.${game.witch.saved ? ' 💚 Tu l’as sauvé.' : ''}`
    : '🧪 Les loups n\'ont attaqué personne cette nuit.';
  return { content: `${attacked}\nPotions : vie ${game.potions.life ? '✅' : '❌'} · mort ${game.potions.death ? '✅' : '❌'}`, components: rows };
}

export async function handleWerewolfComponent(interaction) {
  const [, , id, action] = interaction.customId.split(':');
  const game = games.get(id);
  if (!game) return interaction.reply({ content: 'Cette partie est finie.', ...PRIVATE });
  const userId = interaction.user.id;
  const role = game.roles.get(userId);

  if (action === 'stop') {
    if (userId !== game.hostId && !interaction.memberPermissions?.has('ManageGuild')) return interaction.reply({ content: `Seul <@${game.hostId}> peut arrêter.`, ...PRIVATE });
    await interaction.deferUpdate();
    return finish(game, null, "partie arrêtée par l'hôte");
  }
  if (action === 'skip') {
    if (userId !== game.hostId) return interaction.reply({ content: `Seul <@${game.hostId}> peut lancer le vote.`, ...PRIVATE });
    await interaction.deferUpdate();
    if (game.phase === 'discussion') game.skipWait?.();
    return undefined;
  }
  if (!role) return interaction.reply({ content: 'Tu joues pas dans cette partie 😉', ...PRIVATE });

  if (action === 'role') {
    const wolves = role === 'loup' ? game.players.filter((p) => game.roles.get(p) === 'loup' && p !== userId) : [];
    const visions = game.visions.get(userId) ?? [];
    return interaction.reply({
      content: [
        `🎭 Tu es **${roleLabel(role)}**${game.alive.has(userId) ? '' : ' (mort 💀)'}`,
        ROLES[role].desc,
        wolves.length ? `🐺 Tes complices : ${mentions(wolves)}` : null,
        role === 'sorciere' ? `Potions : vie ${game.potions.life ? '✅' : '❌'} · mort ${game.potions.death ? '✅' : '❌'}` : null,
        visions.length ? `🔮 Tes visions :\n${visions.map((v) => `• Nuit ${v.night} : **${nameOf(game, v.target)}** est ${roleLabel(v.role)}${game.alive.has(v.target) ? '' : ' 💀'}`).join('\n')}` : null,
      ].filter(Boolean).join('\n'),
      ...PRIVATE,
    });
  }
  // Le chasseur tire alors qu'il est déjà mort
  if (action === 'hunt') {
    if (game.hunter?.id !== userId) return interaction.reply({ content: 'Seul le chasseur peut tirer.', ...PRIVATE });
    const target = interaction.values[0];
    game.hunter.target = target;
    return interaction.update({ content: `🏹 ${who(userId)} vise ${who(target)}…`, components: [], allowedMentions: { parse: [] } });
  }
  if (!game.alive.has(userId)) return interaction.reply({ content: 'Les morts ne jouent plus 💀 (mais restent muets !)', ...PRIVATE });

  if (action === 'act') {
    if (game.phase === 'wolves' && role === 'loup') {
      const others = [...game.wolfVotes.entries()].filter(([w]) => w !== userId).map(([w, t]) => `${who(w)} → ${who(t)}`).join(' · ');
      return interaction.reply({ content: `🐺 Choisis ta victime.${others ? `\nVotes des autres loups : ${others}` : ''}`, components: [targetMenu(game, 'wolf', 'Qui dévorer ?', aliveWith(game, 'loup'))], ...PRIVATE });
    }
    if (game.phase === 'wolves' && role === 'voyante') {
      if (game.seen.has(userId)) return interaction.reply({ content: '🔮 Tu as déjà regardé cette nuit. (**Voir mon rôle** garde tes visions.)', ...PRIVATE });
      return interaction.reply({ content: '🔮 De qui veux-tu voir le rôle ?', components: [targetMenu(game, 'seer', 'Regarder qui ?', [userId])], ...PRIVATE });
    }
    if (game.phase === 'witch' && role === 'sorciere' && game.witch && !game.witch.done) {
      return interaction.reply({ ...witchPanel(game, userId), ...PRIVATE });
    }
    return interaction.reply({ content: game.phase === 'wolves' || game.phase === 'witch' ? '😴 Tu dors, rien à faire cette nuit.' : '☀️ C\'est le jour, pas le moment !', ...PRIVATE });
  }

  const target = interaction.values?.[0];
  if (action === 'wolf' && game.phase === 'wolves' && role === 'loup') {
    game.wolfVotes.set(userId, target);
    return interaction.update({ content: `🐺 Tu veux dévorer **${nameOf(game, target)}**. (Les autres loups voient ton choix.)`, components: [] });
  }
  if (action === 'seer' && game.phase === 'wolves' && role === 'voyante' && !game.seen.has(userId)) {
    see(game, userId, target);
    return interaction.update({ content: `🔮 **${nameOf(game, target)}** est **${roleLabel(game.roles.get(target))}**.\n-# Retrouve tes visions avec **Voir mon rôle**.`, components: [] });
  }
  if (game.phase === 'witch' && role === 'sorciere' && game.witch && !game.witch.done) {
    // La sorcière peut sauver puis empoisonner la même nuit : sauver ne ferme pas son panneau.
    if (action === 'save' && game.potions.life && game.witch.victim) {
      game.potions.life = false;
      game.witch.saved = true;
      if (game.potions.death) return interaction.update(witchPanel(game, userId));
      game.witch.done = true;
      return interaction.update({ content: '💚 Potion de vie utilisée. Tu te rendors.', components: [] });
    }
    if (action === 'poison' && game.potions.death && target) {
      game.potions.death = false;
      game.witch.poisoned = target;
      game.witch.done = true;
      return interaction.update({ content: `☠️ **${nameOf(game, target)}** a bu ta potion de mort.${game.witch.saved ? ' 💚 Et tu as sauvé la victime des loups.' : ''}`, components: [] });
    }
    if (action === 'pass') {
      game.witch.done = true;
      return interaction.update({ content: game.witch.saved ? '💚 Potion de vie utilisée. Tu te rendors.' : '🌙 Tu te rendors.', components: [] });
    }
  }
  if (action === 'vote' && game.phase === 'vote') {
    if (target === userId) return interaction.reply({ content: 'Voter contre toi-même ? Non 😅', ...PRIVATE });
    game.votes.set(userId, target);
    return interaction.reply({ content: `🗳️ Tu votes contre **${nameOf(game, target)}** (tu peux changer).`, ...PRIVATE });
  }
  return interaction.reply({ content: "C'est pas le moment pour ça.", ...PRIVATE });
}
