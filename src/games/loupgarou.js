// Loup-garou avec le bot comme meneur : rôles secrets, nuits (loups, voyante, sorcière), votes le jour,
// et un narrateur qui raconte la partie à voix haute dans le vocal de l'IA vocale.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { borrowVoiceAi, createNarrator, voiceAiChannelId, voiceAiFree } from '../voice-ai/assistant.js';
import { PRIVATE, gameChannel, gameThread, mentions, openLobby, pick, rulesLink, shortId, shuffle, sleep } from './common.js';

const ROLE_LOOK_MS = 25_000;
const NIGHT_MS = 50_000;
const WITCH_MS = 35_000;
const DISCUSS_MS = 90_000;
const VOTE_MS = 60_000;
const HUNTER_MS = 30_000;
const games = new Map(); // id -> partie

export const ROLES = {
  loup: { name: 'Loup-garou', emoji: '🐺', team: 'loups', desc: 'Chaque nuit, avec les autres loups, tu choisis une victime. Le jour, fais-toi passer pour un villageois.' },
  voyante: { name: 'Voyante', emoji: '🔮', team: 'village', desc: "Chaque nuit, tu découvres le vrai rôle d'un joueur. Aide le village sans te faire griller." },
  sorciere: { name: 'Sorcière', emoji: '🧪', team: 'village', desc: "Tu as une potion de vie (sauver la victime des loups) et une potion de mort (tuer quelqu'un). Une seule fois chacune." },
  chasseur: { name: 'Chasseur', emoji: '🏹', team: 'village', desc: "Si tu meurs, tu tires une dernière balle sur le joueur de ton choix." },
  villageois: { name: 'Villageois', emoji: '🧑‍🌾', team: 'village', desc: 'Pas de pouvoir, mais ton vote compte : trouve les loups.' },
};

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

const nameOf = (game, id) => game.guild.members.cache.get(id)?.displayName ?? game.guild.client.users.cache.get(id)?.username ?? 'Joueur';
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
    allowedMentions: ping ? { users: alive(game) } : { parse: [] },
  }).catch(() => {});
  if (voice && game.narrator) await game.narrator.say(voice);
}

/** /jeu-loupgarou */
export async function startWerewolf(interaction) {
  const channel = await gameChannel(interaction);
  await interaction.reply({ content: `🐺 La salle d'attente est ouverte dans <#${channel.id}> !`, ...PRIVATE });
  const voice = voiceAiFree();
  const lobby = await openLobby({
    channel,
    hostId: interaction.user.id,
    title: '🐺 LOUP-GAROU',
    description: [
      'Le bot est le meneur : il distribue les rôles en secret, gère les nuits et les votes.',
      voice.ok ? `🔊 Le narrateur raconte la partie à voix haute dans <#${voiceAiChannelId()}>.` : '📝 Partie à l\'écrit (l\'IA vocale est occupée).',
      'Rôles : 🐺 Loups · 🔮 Voyante · 🧪 Sorcière (6 joueurs et +) · 🏹 Chasseur (8 et +) · 🧑‍🌾 Villageois',
      rulesLink('loupgarou'),
    ].filter(Boolean).join('\n'),
    min: 4,
    max: 16,
    waitMs: 150_000,
    color: 0x2c2f33,
  });
  if (!lobby) return undefined;

  const game = {
    id: shortId(), guild: interaction.guild, hostId: interaction.user.id,
    players: lobby.players, roles: dealRoles(lobby.players), alive: new Set(lobby.players),
    potions: { life: true, death: true }, day: 0, phase: 'setup', votes: new Map(), wolfVotes: new Map(),
    seen: new Set(), witch: null, stopped: false, release: null, narrator: null,
  };
  games.set(game.id, game);
  game.thread = await gameThread(lobby.message, '🐺 Loup-garou');
  console.log(`[loup-garou] partie ${game.id} : ${[...game.roles.entries()].map(([id, role]) => `${nameOf(game, id)}=${role}`).join(', ')}`);

  if (voiceAiFree().ok) {
    try {
      game.release = await borrowVoiceAi('loup-garou');
      game.narrator = createNarrator({ voice: 'Charon', style: "Tu es le narrateur d'une partie de loup-garou : voix grave, mystérieuse, théâtrale." });
    } catch (err) {
      console.warn('[loup-garou] narrateur :', err.message);
    }
  }

  const composition = Object.entries([...game.roles.values()].reduce((acc, role) => ({ ...acc, [role]: (acc[role] ?? 0) + 1 }), {}))
    .map(([role, count]) => `${roleLabel(role)} ×${count}`).join(' · ');
  await tell(game, new EmbedBuilder().setColor(0x2c2f33).setAuthor({ name: '🐺 LOUP-GAROU' }).setTitle('Les rôles sont distribués')
    .setDescription([
      `Appuyez sur **Voir mon rôle** (personne d'autre ne le voit).`,
      `Dans ce village : ${composition}`,
      game.narrator ? `🔊 Rejoignez <#${voiceAiChannelId()}> pour entendre le narrateur.` : null,
      'La première nuit tombe dans 25 secondes.',
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
    if (await checkWin(game)) return;
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
    await waitPhase(game, WITCH_MS, () => game.witch.done);
    saved = game.witch.saved;
    poisoned = game.witch.poisoned;
  }
  game.phase = 'dawn';
  return [...new Set([saved ? null : victim, poisoned].filter(Boolean))];
}

async function kill(game, id, how) {
  if (!game.alive.has(id)) return [];
  game.alive.delete(id);
  const role = game.roles.get(id);
  const lines = [`💀 <@${id}> ${how}. C'était ${roleLabel(role)}.`];
  if (role === 'chasseur') {
    const shot = await hunterShot(game, id);
    if (shot) lines.push(...await kill(game, shot, 'reçoit la dernière balle du chasseur'));
  }
  return lines;
}

async function hunterShot(game, hunter) {
  game.phase = 'hunter';
  game.hunter = { id: hunter, target: null };
  await game.thread.send({
    content: `🏹 <@${hunter}>, tu es mort mais tu as une dernière balle : choisis ta cible (fin <t:${Math.ceil((Date.now() + HUNTER_MS) / 1000)}:R>).`,
    components: [targetMenu(game, 'hunt', 'Sur qui tu tires ?', [hunter])],
    allowedMentions: { users: [hunter] },
  }).catch(() => {});
  await waitPhase(game, HUNTER_MS, () => Boolean(game.hunter.target));
  const target = game.hunter.target;
  game.hunter = null;
  return target && game.alive.has(target) ? target : null;
}

async function dawn(game, deaths) {
  const lines = [];
  for (const id of deaths) lines.push(...await kill(game, id, 'a été retrouvé mort'));
  const intro = deaths.length ? pick(DAWN_DEATH) : pick(DAWN_SAFE);
  const spoken = deaths.length
    ? `${intro} ${deaths.map((id) => `${nameOf(game, id)} est mort cette nuit. C'était ${ROLES[game.roles.get(id)].name}.`).join(' ')}`
    : intro;
  await tell(game, new EmbedBuilder().setColor(0xf1c40f).setAuthor({ name: `☀️ JOUR ${game.day}` }).setTitle(intro)
    .setDescription(lines.join('\n') || 'Tout le monde est vivant.'), { voice: spoken });
}

async function dayVote(game) {
  game.phase = 'discussion';
  const endsAt = Math.ceil((Date.now() + DISCUSS_MS) / 1000);
  await tell(game, new EmbedBuilder().setColor(0xf1c40f).setTitle('🗣️ Débat')
    .setDescription(`Discutez ici ou en vocal : qui est un loup ? Le vote commence <t:${endsAt}:R>.\n-# <@${game.hostId}> peut lancer le vote plus tôt.`),
  { ping: true, voice: 'Le village se réunit. Débattez, puis votez pour éliminer un suspect.' });
  await game.thread.send({
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`g:lg:${game.id}:skip`).setLabel('Voter maintenant').setEmoji('🗳️').setStyle(ButtonStyle.Primary),
    )],
  }).catch(() => {});
  await waitPhase(game, DISCUSS_MS, () => false);
  if (game.stopped) return;

  game.phase = 'vote';
  game.votes = new Map();
  const message = await game.thread.send({
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle('🗳️ Vote du village')
      .setDescription(`Choisissez qui éliminer (vous pouvez changer d'avis). Fin <t:${Math.ceil((Date.now() + VOTE_MS) / 1000)}:R>.`)],
    components: [targetMenu(game, 'vote', 'Qui éliminer ?')],
  }).catch(() => null);
  await waitPhase(game, VOTE_MS, () => alive(game).every((id) => game.votes.has(id)));
  await message?.edit({ components: [] }).catch(() => {});
  if (game.stopped) return;

  const counts = new Map();
  for (const target of game.votes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const detail = sorted.map(([id, n]) => `<@${id}> : ${n}`).join(' · ') || 'aucun vote';
  if (!sorted.length || (sorted[1] && sorted[1][1] === sorted[0][1])) {
    await tell(game, new EmbedBuilder().setColor(0x95a5a6).setTitle('⚖️ Égalité : personne n\'est éliminé').setDescription(detail), { voice: 'Le village n\'arrive pas à se décider. Personne n\'est éliminé.' });
    return;
  }
  const [out] = sorted[0];
  const lines = await kill(game, out, 'est éliminé par le village');
  await tell(game, new EmbedBuilder().setColor(0xed4245).setTitle(`🔥 ${nameOf(game, out)} est éliminé`).setDescription(`${lines.join('\n')}\n-# Votes : ${detail}`),
    { voice: `Le village a tranché : ${nameOf(game, out)} est éliminé. C'était ${ROLES[game.roles.get(out)].name}.` });
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
  const roles = game.players.map((id) => `${game.alive.has(id) ? '❤️' : '💀'} <@${id}> · ${roleLabel(game.roles.get(id))}`).join('\n');
  await tell(game, new EmbedBuilder().setColor(winners === 'loups' ? 0xed4245 : 0x57f287).setAuthor({ name: '🐺 LOUP-GAROU' }).setTitle(title)
    .setDescription(`${reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.\n\n` : ''}${roles}`),
  { voice: winners ? `${title.replace(/^\S+\s/, '')} ${reason}.` : null });
  game.narrator?.close();
  await game.release?.().catch(() => {});
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
    return interaction.reply({
      content: [
        `🎭 Tu es **${roleLabel(role)}**${game.alive.has(userId) ? '' : ' (mort 💀)'}`,
        ROLES[role].desc,
        wolves.length ? `🐺 Tes complices : ${mentions(wolves)}` : null,
        role === 'sorciere' ? `Potions : vie ${game.potions.life ? '✅' : '❌'} · mort ${game.potions.death ? '✅' : '❌'}` : null,
      ].filter(Boolean).join('\n'),
      ...PRIVATE,
    });
  }
  // Le chasseur tire alors qu'il est déjà mort
  if (action === 'hunt') {
    if (game.hunter?.id !== userId) return interaction.reply({ content: 'Seul le chasseur peut tirer.', ...PRIVATE });
    const target = interaction.values[0];
    game.hunter.target = target;
    return interaction.update({ content: `🏹 <@${userId}> tire sur <@${target}> !`, components: [], allowedMentions: { parse: [] } });
  }
  if (!game.alive.has(userId)) return interaction.reply({ content: 'Les morts ne jouent plus 💀 (mais restent muets !)', ...PRIVATE });

  if (action === 'act') {
    if (game.phase === 'wolves' && role === 'loup') {
      const others = [...game.wolfVotes.entries()].filter(([w]) => w !== userId).map(([w, t]) => `<@${w}> → <@${t}>`).join(' · ');
      return interaction.reply({ content: `🐺 Choisis ta victime.${others ? `\nVotes des autres loups : ${others}` : ''}`, components: [targetMenu(game, 'wolf', 'Qui dévorer ?', aliveWith(game, 'loup'))], ...PRIVATE });
    }
    if (game.phase === 'wolves' && role === 'voyante') {
      if (game.seen.has(userId)) return interaction.reply({ content: '🔮 Tu as déjà regardé cette nuit.', ...PRIVATE });
      return interaction.reply({ content: '🔮 De qui veux-tu voir le rôle ?', components: [targetMenu(game, 'seer', 'Regarder qui ?', [userId])], ...PRIVATE });
    }
    if (game.phase === 'witch' && role === 'sorciere' && game.witch && !game.witch.done) {
      const buttons = [];
      if (game.potions.life && game.witch.victim) buttons.push(new ButtonBuilder().setCustomId(`g:lg:${game.id}:save`).setLabel(`Sauver ${nameOf(game, game.witch.victim)}`.slice(0, 80)).setEmoji('💚').setStyle(ButtonStyle.Success));
      buttons.push(new ButtonBuilder().setCustomId(`g:lg:${game.id}:pass`).setLabel('Ne rien faire').setStyle(ButtonStyle.Secondary));
      const rows = [new ActionRowBuilder().addComponents(buttons)];
      if (game.potions.death) rows.push(targetMenu(game, 'poison', '☠️ Empoisonner quelqu\'un…', [userId]));
      return interaction.reply({
        content: game.witch.victim ? `🧪 Les loups ont attaqué **${nameOf(game, game.witch.victim)}** cette nuit.` : '🧪 Les loups n\'ont attaqué personne cette nuit.',
        components: rows,
        ...PRIVATE,
      });
    }
    return interaction.reply({ content: game.phase === 'wolves' || game.phase === 'witch' ? '😴 Tu dors, rien à faire cette nuit.' : '☀️ C\'est le jour, pas le moment !', ...PRIVATE });
  }

  const target = interaction.values?.[0];
  if (action === 'wolf' && game.phase === 'wolves' && role === 'loup') {
    game.wolfVotes.set(userId, target);
    return interaction.update({ content: `🐺 Tu veux dévorer **${nameOf(game, target)}**. (Les autres loups voient ton choix.)`, components: [] });
  }
  if (action === 'seer' && game.phase === 'wolves' && role === 'voyante' && !game.seen.has(userId)) {
    game.seen.add(userId);
    return interaction.update({ content: `🔮 **${nameOf(game, target)}** est **${roleLabel(game.roles.get(target))}**.`, components: [] });
  }
  if (game.phase === 'witch' && role === 'sorciere' && game.witch && !game.witch.done) {
    if (action === 'save' && game.potions.life) {
      game.potions.life = false;
      game.witch.saved = true;
    } else if (action === 'poison' && game.potions.death && target) {
      game.potions.death = false;
      game.witch.poisoned = target;
    }
    game.witch.done = true;
    return interaction.update({ content: action === 'save' ? '💚 Potion de vie utilisée.' : action === 'poison' ? `☠️ **${nameOf(game, target)}** a bu ta potion de mort.` : '🌙 Tu te rendors.', components: [] });
  }
  if (action === 'vote' && game.phase === 'vote') {
    if (target === userId) return interaction.reply({ content: 'Voter contre toi-même ? Non 😅', ...PRIVATE });
    game.votes.set(userId, target);
    return interaction.reply({ content: `🗳️ Tu votes contre **${nameOf(game, target)}** (tu peux changer).`, ...PRIVATE });
  }
  return interaction.reply({ content: "C'est pas le moment pour ça.", ...PRIVATE });
}
