/**
 * Banc d'essai des mini-jeux : on joue une partie complète, sans Discord.
 * Les salons, fils, boutons et messages sont simulés ; les minuteries sont
 * accélérées pour que la partie tienne en quelques secondes.
 *
 *   npm run test:jeux
 */
import assert from 'node:assert/strict';

// ---- Minuteries accélérées d'un facteur 500 : 90 s d'attente deviennent 180 ms.
// On garde les proportions pour que l'ordre des étapes reste le même qu'en vrai.
// Un test peut ralentir la cadence (SPEED plus petit) quand il doit cliquer pendant une phase.
let SPEED = 500;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms = 0, ...args) => realSetTimeout(fn, ms > 100 ? Math.max(8, Math.round(ms / SPEED)) : ms, ...args);
globalThis.setTimeout.__patched = true;

// ---- Pas d'appel à Gemini pendant les tests : la paire de mots vient du repli.
process.env.DISCORD_TOKEN ||= ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'test';
// ---- Jamais les vraies données : pas de Supabase, stockage dans un dossier temporaire.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'jeux-'));

const ROOT = new URL('../src/games/', import.meta.url);
const common = await import(new URL('common.js', ROOT));
const { startImpostor, handleImpostorComponent } = await import(new URL('imposteur.js', ROOT));
const { startWerewolf, handleWerewolfComponent, ROLES } = await import(new URL('loupgarou.js', ROOT));
const { handleLobbyButton } = common;

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log('✅', name);
};
const sleep = (ms) => new Promise((r) => realSetTimeout(r, ms));
/** Attend qu'une condition devienne vraie (l'IA et le réseau prennent un peu de temps). */
async function waitFor(what, test, ms = 8_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = test();
    if (value) return value;
    await sleep(20);
  }
  throw new Error(`délai dépassé : ${what}`);
}

// ============================== Faux Discord ==============================
let nextId = 1000;
const id = () => String(nextId++);

const directory = new Map(); // id -> joueur, pour que le bot puisse « fetch » un utilisateur

function makeUser(name) {
  const user = {
    id: id(),
    bot: false,
    username: name,
    displayName: name,
    tag: `${name}#0001`,
    dms: [],
    async send(payload) {
      user.dms.push(payload);
      return payload;
    },
  };
  directory.set(user.id, user);
  return user;
}

/** Un salon texte qui garde tout ce qui y est envoyé, et qui sait ouvrir un fil. */
function makeChannel(name, { thread = true } = {}) {
  const channel = {
    id: id(),
    name,
    type: 0, // GuildText
    sent: [],
    guild: { id: 'GUILD', name: 'Test', members: { cache: new Map() } },
    isTextBased: () => true,
    isVoiceBased: () => false,
    isThread: () => !thread,
    async send(payload) {
      discordRules(payload);
      const message = makeMessage(channel, payload);
      channel.sent.push(message);
      for (const hook of channel.hooks) hook(message);
      return message;
    },
  };
  channel.hooks = [];
  return channel;
}

/**
 * Ce que l'API Discord refuse vraiment. Un message qui enfreint ces règles est
 * rejeté par Discord — et comme les jeux ignorent les erreurs d'envoi, il
 * disparaîtrait sans bruit : c'est la panne qu'on veut attraper ici.
 */
export const violations = [];
function discordRules(payload) {
  if (typeof payload !== 'object' || !payload) return;
  for (const id of payload.allowedMentions?.users ?? []) {
    if (!/^\d{15,21}$/.test(String(id)) && !/^\d{4}$/.test(String(id))) violations.push(`allowedMentions.users contient « ${id} »`);
  }
  const text = [payload.content ?? '', ...(payload.embeds ?? []).map((e) => JSON.stringify(e.data ?? e))].join(' ');
  if (/<@!?bot-/.test(text)) violations.push(`mention brute d'un bot : ${text.match(/<@!?bot-[^>]*>/)[0]}`);
}

function makeMessage(channel, payload) {
  const message = {
    id: id(),
    channel,
    channelId: channel.id,
    payload,
    content: typeof payload === 'string' ? payload : (payload.content ?? ''),
    embeds: (payload.embeds ?? []).map((e) => (e.data ? e.data : e)),
    components: payload.components ?? [],
    edits: [],
    async edit(next) {
      message.edits.push(next);
      if (next.embeds) message.embeds = next.embeds.map((e) => (e.data ? e.data : e));
      message.components = next.components ?? message.components;
      return message;
    },
    async react() {},
    async reply(next) {
      return channel.send(next);
    },
    async startThread({ name }) {
      const thread = makeChannel(name, { thread: false });
      thread.parent = channel;
      thread.guild = channel.guild;
      message.thread = thread;
      return thread;
    },
  };
  return message;
}

/** Une interaction de commande : /jeu-imposteur. */
function makeInteraction(user, channel, options = {}) {
  return {
    user,
    channelId: channel.id,
    channel,
    client: {
      channels: { fetch: async () => channel },
      users: {
        fetch: async (uid) => {
          const user = directory.get(uid);
          if (!user) throw new Error('utilisateur inconnu');
          return user;
        },
      },
    },
    options: {
      getString: (n) => options[n] ?? null,
      getInteger: (n) => options[n] ?? null,
      getUser: (n) => options[n] ?? null,
    },
    replies: [],
    deferred: false,
    async reply(payload) { this.replies.push(payload); return payload; },
    async deferReply(payload) { this.deferred = true; this.replies.push(payload ?? { deferred: true }); },
    async editReply(payload) { this.replies.push(payload); return payload; },
    async deferUpdate() {},
    async update(payload) { this.replies.push(payload); return payload; },
    async followUp(payload) { this.replies.push(payload); return payload; },
  };
}

/** Un clic sur un bouton ou un menu. */
function makeComponent(user, customId, { values = [], channel = null } = {}) {
  return {
    user,
    customId,
    values,
    channel,
    channelId: channel?.id,
    memberPermissions: { has: () => false },
    replies: [],
    isButton: () => !values.length,
    isStringSelectMenu: () => values.length > 0,
    async reply(payload) { this.replies.push(payload); return payload; },
    async deferUpdate() { this.replies.push({ deferred: true }); },
    async update(payload) { this.replies.push(payload); return payload; },
  };
}

/** Un message écrit par un joueur, routé vers le jeu qui écoute. */
function say(channel, user, text) {
  return common.routeGameMessage({
    author: user,
    channelId: channel.id,
    channel,
    content: text,
    inGuild: () => true,
    react: async () => {},
    reply: async (payload) => channel.send(payload),
  });
}

const buttonsOf = (message) =>
  (message.components ?? []).flatMap((row) => (row.components ?? []).map((c) => c.data?.custom_id ?? c.custom_id)).filter(Boolean);
const textOf = (message) =>
  [message.content, ...message.embeds.map((e) => [e.author?.name, e.title, e.description].filter(Boolean).join(' '))].filter(Boolean).join(' ');

// ============================== Les parties ==============================

await check('imposteur : la salle d’attente s’ouvre et accepte les joueurs', async () => {
  const channel = makeChannel('mini-jeux');
  const host = makeUser('Hôte');
  const interaction = makeInteraction(host, channel, { theme: 'bouffe' });

  const running = startImpostor(interaction, 'bouffe').catch((err) => console.error('   ⚠️ startImpostor :', err));
  await sleep(30);

  const lobby = channel.sent.find((m) => textOf(m).includes("L'IMPOSTEUR"));
  assert.ok(lobby, 'la salle d’attente doit être affichée');
  const join = buttonsOf(lobby).find((b) => b.endsWith(':join'));
  assert.ok(join, 'un bouton Rejoindre doit exister');

  const players = [host, makeUser('Alice'), makeUser('Bob'), makeUser('Chloé')];
  for (const player of players.slice(1)) await handleLobbyButton(makeComponent(player, join, { channel }));

  const start = buttonsOf(lobby).find((b) => b.endsWith(':start'));
  await handleLobbyButton(makeComponent(host, start, { channel }));

  const thread = await waitFor('ouverture du fil de partie', () => channel.sent.map((m) => m.thread).find(Boolean));
  globalThis.__lastGame = { channel, thread, players, running };
});

await check('imposteur : chaque joueur reçoit son mot en MP, sans savoir s’il est l’imposteur', async () => {
  const { thread, players } = globalThis.__lastGame;
  await waitFor('envoi des mots en MP', () => players.every((p) => p.dms.length));

  const counts = new Map();
  const cards = new Set();
  for (const player of players) {
    const dm = player.dms.at(-1);
    const embed = dm?.embeds?.[0];
    const data = embed?.data ?? embed;
    assert.ok(data, `${player.username} doit recevoir un MP`);
    assert.match(data.title, /mot secret/i, 'le MP doit annoncer le mot secret');
    const word = /^# (.+)$/m.exec(data.description ?? '')?.[1];
    assert.ok(word, 'le MP doit afficher le mot en grand');
    counts.set(word, (counts.get(word) ?? 0) + 1);
    assert.match(data.image?.url ?? '', /\.gif/, 'le MP doit porter une carte animée');
    cards.add(data.image.url);
    // Le rôle ne doit jamais être écrit : l'imposteur ne sait pas qu'il l'est.
    const text = JSON.stringify(data);
    assert.ok(!/Tu es l.IMPOSTEUR|Tu es un CIVIL/i.test(text), 'le MP ne doit pas révéler le rôle');
    const link = dm.components?.[0]?.components?.[0];
    assert.ok(!link || (link.data ?? link).style === 5, 'le bouton du MP doit être un lien vers la partie');
  }
  assert.equal(cards.size, 1, 'tout le monde reçoit la même carte (sinon le rôle se devine)');
  assert.equal(counts.size, 2, 'deux mots : celui des civils et celui de l’imposteur');
  assert.ok([...counts.values()].includes(1), 'un seul joueur a le mot différent');

  // Le bouton reste là pour ceux dont les MP sont fermés.
  const wordMessage = thread.sent.find((m) => buttonsOf(m).some((b) => b.endsWith(':word')));
  assert.ok(wordMessage, 'le message du fil doit garder le bouton de secours');
  const click = makeComponent(players[0], buttonsOf(wordMessage).find((b) => b.endsWith(':word')), { channel: thread });
  await handleImpostorComponent(click);
  assert.match(click.replies.at(-1)?.content ?? '', /mot secret/);
  assert.ok(!/Tu es l'imposteur/i.test(click.replies.at(-1)?.content ?? ''), 'le bouton ne doit pas révéler le rôle non plus');
});

await check('imposteur : les indices sont acceptés et une manche se joue', async () => {
  const { thread, players } = globalThis.__lastGame;
  const clues = ['truc rond', 'ça se mange', 'c est bon', 'le soir'];

  // On répond à chaque demande d'indice, puis on vote, jusqu'à la fin de la partie.
  let guard = 0;
  const handled = new Set();
  while (guard++ < 400) {
    await sleep(15);
    for (const message of thread.sent) {
      if (handled.has(message.id)) continue;
      handled.add(message.id);
      const text = textOf(message);

      // « 👉 @joueur, ton indice »
      const askClue = /👉 <@(\d+)>, ton indice/.exec(message.content ?? '');
      if (askClue) {
        const player = players.find((p) => p.id === askClue[1]);
        if (player) say(thread, player, clues[guard % clues.length]);
        continue;
      }

      // Menu de vote : tout le monde désigne le même joueur
      const voteId = buttonsOf(message).find((b) => b.endsWith(':vote'));
      if (voteId) {
        const menu = message.components[0].components[0];
        const options = (menu.options ?? []).map((o) => o.data ?? o);
        assert.ok(options.length >= 2, 'le menu de vote doit lister les joueurs');
        for (const option of options) {
          assert.ok(option.label?.length, 'chaque joueur doit avoir un nom dans le menu');
          assert.ok(option.label.length <= 100, 'nom trop long dans le menu');
        }
        const target = options[0].value;
        for (const player of players) {
          if (player.id === target) continue;
          await handleImpostorComponent(makeComponent(player, voteId, { values: [target], channel: thread }));
        }
        continue;
      }
    }
    if (thread.sent.some((m) => /Victoire|Partie arrêtée/.test(textOf(m)))) break;
  }

  const ending = thread.sent.find((m) => /Victoire|Partie arrêtée/.test(textOf(m)));
  assert.ok(ending, 'la partie doit se terminer sur un résultat');
  assert.ok(!/bug/.test(textOf(ending)), `la partie ne doit pas finir sur un bug : ${textOf(ending)}`);
  console.log(`   fin de partie : ${textOf(ending).replace(/\s+/g, ' ').slice(0, 110)}`);
});

await check('imposteur : un indice trop long est refusé', async () => {
  const channel = makeChannel('mini-jeux2');
  const host = makeUser('Hôte2');
  const interaction = makeInteraction(host, channel, {});
  startImpostor(interaction, 'tout');
  await sleep(30);
  const lobby = channel.sent.find((m) => textOf(m).includes("L'IMPOSTEUR"));
  const join = buttonsOf(lobby).find((b) => b.endsWith(':join'));
  const players = [host, makeUser('Dan'), makeUser('Eve')];
  for (const player of players.slice(1)) await handleLobbyButton(makeComponent(player, join, { channel }));
  await handleLobbyButton(makeComponent(host, buttonsOf(lobby).find((b) => b.endsWith(':start')), { channel }));
  await sleep(60);

  const thread = channel.sent.map((m) => m.thread).find(Boolean);
  let guard = 0;
  while (guard++ < 60) {
    await sleep(10);
    const ask = thread.sent.find((m) => /👉 <@(\d+)>, ton indice/.test(m.content ?? ''));
    if (ask) {
      const who = /👉 <@(\d+)>/.exec(ask.content)[1];
      const player = players.find((p) => p.id === who);
      const before = thread.sent.length;
      say(thread, player, 'un indice beaucoup trop long qui dépasse largement cinq mots');
      await sleep(10);
      const answer = thread.sent.slice(before).map(textOf).join(' ');
      assert.match(answer, /1 à 5 mots/, 'un indice trop long doit être refusé');
      return;
    }
  }
  throw new Error('aucune demande d’indice reçue');
});

// ============================== Loup-garou ==============================

await check('loup-garou : salle d’attente, rôles en MP, et la nuit tombe', async () => {
  const channel = makeChannel('mini-jeux3');
  const host = makeUser('Meneur');
  const players = [host, makeUser('Fred'), makeUser('Gina'), makeUser('Hugo'), makeUser('Inès')];
  const interaction = makeInteraction(host, channel, {});
  interaction.guild = channel.guild;
  channel.guild.client = { users: { cache: new Map(players.map((p) => [p.id, p])) } };
  for (const player of players) channel.guild.members.cache.set(player.id, { displayName: player.username, user: player });

  startWerewolf(interaction).catch((err) => console.error('   ⚠️ startWerewolf :', err));
  const lobby = await waitFor('salle d’attente loup-garou', () => channel.sent.find((m) => textOf(m).includes('LOUP-GAROU')));

  // L'interrupteur de la voix doit être proposé (ou absent si l'IA vocale est occupée).
  const voiceButton = buttonsOf(lobby).find((b) => b.endsWith(':voice'));
  const join = buttonsOf(lobby).find((b) => b.endsWith(':join'));
  assert.ok(join, 'un bouton Rejoindre doit exister');
  for (const player of players.slice(1)) await handleLobbyButton(makeComponent(player, join, { channel }));
  if (voiceButton) {
    // On coupe la voix : la partie doit rester jouable entièrement à l'écrit.
    await handleLobbyButton(makeComponent(host, voiceButton, { channel }));
    assert.match(textOf(lobby), /Sans la voix|Avec la voix/, 'le choix de la voix doit être affiché');
  }
  await handleLobbyButton(makeComponent(host, buttonsOf(lobby).find((b) => b.endsWith(':start')), { channel }));

  const thread = await waitFor('fil de la partie', () => channel.sent.map((m) => m.thread).find(Boolean));
  await waitFor('envoi des rôles en MP', () => players.every((p) => p.dms.length));

  const roles = [];
  for (const player of players) {
    const data = player.dms.at(-1).embeds[0].data ?? player.dms.at(-1).embeds[0];
    assert.match(data.image?.url ?? '', /\.gif$/, `${player.username} doit recevoir une carte animée`);
    const role = Object.values(ROLES).find((r) => data.title.includes(r.name));
    assert.ok(role, `rôle inconnu dans le MP : ${data.title}`);
    roles.push(role.name);
  }
  assert.ok(roles.includes('Loup-garou'), 'il faut au moins un loup');
  assert.ok(roles.includes('Voyante'), 'il faut une voyante');
  console.log(`   rôles distribués : ${roles.join(' · ')}`);

  // La nuit doit tomber toute seule après le temps de lecture.
  await waitFor('première nuit', () => thread.sent.some((m) => /NUIT 1/.test(textOf(m))), 12_000);

  // Les loups doivent pouvoir agir.
  const nightControls = thread.sent.filter((m) => buttonsOf(m).some((b) => b.endsWith(':act'))).at(-1);
  assert.ok(nightControls, 'les commandes de nuit doivent être proposées');
  const wolf = players.find((p, i) => roles[i] === 'Loup-garou');
  const act = makeComponent(wolf, buttonsOf(nightControls).find((b) => b.endsWith(':act')), { channel: thread });
  await handleWerewolfComponent(act);
  const answer = JSON.stringify(act.replies.at(-1) ?? {});
  assert.ok(/victime|choisis|Qui/i.test(answer), `le loup doit pouvoir désigner une victime : ${answer.slice(0, 120)}`);

  // On arrête proprement.
  const stopButton = buttonsOf(nightControls).find((b) => b.endsWith(':stop'));
  await handleWerewolfComponent(makeComponent(host, stopButton, { channel: thread }));
  await waitFor('fin de partie', () => thread.sent.some((m) => /arrêtée|Victoire/i.test(textOf(m))), 6_000);
});

// ====================== Mode test : seul avec des bots ======================

/** Joue le rôle du seul humain : il répond aux demandes d'indice et vote quand on le lui demande. */
function autopilot(thread, human, handlers) {
  const handled = new Set();
  const timer = setInterval(async () => {
    for (const message of thread.sent) {
      if (handled.has(message.id)) continue;
      handled.add(message.id);
      if (new RegExp(`👉 <@${human.id}>, ton indice`).test(message.content ?? '')) say(thread, human, 'plutôt connu');
      const vote = buttonsOf(message).find((b) => b.endsWith(':vote'));
      if (vote) {
        const options = (message.components[0].components[0].options ?? []).map((o) => o.data ?? o);
        const target = options.find((o) => o.value !== human.id)?.value;
        if (target) await handlers.component(makeComponent(human, vote, { values: [target], channel: thread })).catch(() => {});
      }
    }
  }, 10);
  return () => clearInterval(timer);
}

async function launchTest(start, handlers, size, title) {
  const channel = makeChannel(`test-${title}`);
  const human = makeUser(`Solo-${title}`);
  const interaction = makeInteraction(human, channel, {});
  interaction.guild = channel.guild;
  channel.guild.client = { users: { cache: new Map([[human.id, human]]) } };
  channel.guild.members.cache.set(human.id, { displayName: human.username, user: human });

  start(interaction).catch((err) => console.error(`   ⚠️ ${title} :`, err));
  const lobby = await waitFor(`salle d’attente ${title}`, () => channel.sent.find((m) => buttonsOf(m).some((b) => b.endsWith(':test'))));
  await handleLobbyButton(makeComponent(human, buttonsOf(lobby).find((b) => b.endsWith(':test')), { channel }));

  assert.match(textOf(lobby), /Partie de test/, 'la salle doit annoncer une partie de test');
  const bots = (textOf(lobby).match(/🤖/g) ?? []).length;
  assert.equal(bots, size - 1, `il faut ${size - 1} bots pour compléter la table`);

  const thread = await waitFor('fil de la partie', () => channel.sent.map((m) => m.thread).find(Boolean));
  const stop = autopilot(thread, human, handlers);
  return { channel, thread, human, stop };
}

await check('imposteur en test : seul avec 3 bots, la partie va jusqu’au bout', async () => {
  const before = violations.length;
  const { thread, human, stop } = await launchTest(
    (interaction) => startImpostor(interaction, 'bouffe'),
    { component: handleImpostorComponent },
    4,
    'imposteur',
  );
  await waitFor('MP du joueur humain', () => human.dms.length);
  assert.equal(human.dms.length, 1, 'seul l’humain reçoit un MP, pas les bots');

  // Les bots doivent donner leurs indices eux-mêmes.
  await waitFor('indice d’un bot', () => thread.sent.some((m) => /🤖 \w+ : « /.test(m.content ?? '')));

  const ending = await waitFor('fin de la partie de test', () => thread.sent.find((m) => /Victoire/.test(textOf(m))), 30_000);
  stop();
  assert.ok(!/bug/.test(textOf(ending)), `la partie ne doit pas finir sur un bug : ${textOf(ending)}`);
  // Un civil éliminé ne doit pas trahir le mot des civils (l'imposteur gagnerait d'office).
  for (const message of thread.sent.filter((m) => /est éliminé/.test(textOf(m)))) {
    assert.ok(!/son mot/.test(textOf(message)), `le mot des civils a fuité : ${textOf(message)}`);
  }
  assert.deepEqual(violations.slice(before), [], 'aucun message refusé par Discord');
  console.log(`   ${textOf(ending).replace(/\s+/g, ' ').slice(0, 100)}`);
});

await check('loup-garou en test : seul avec 5 bots, la partie va jusqu’au bout', async () => {
  const before = violations.length;
  const { thread, human, stop } = await launchTest(
    (interaction) => startWerewolf(interaction),
    { component: handleWerewolfComponent },
    6,
    'loupgarou',
  );
  await waitFor('MP du joueur humain', () => human.dms.length);
  assert.equal(human.dms.length, 1, 'seul l’humain reçoit un MP, pas les bots');
  const myRole = (human.dms[0].embeds[0].data ?? human.dms[0].embeds[0]).title;

  const ending = await waitFor('fin de la partie de test', () => thread.sent.find((m) => /ont gagné|a gagné/.test(textOf(m))), 60_000);
  stop();
  assert.deepEqual(violations.slice(before), [], 'aucun message refusé par Discord');
  const nights = thread.sent.filter((m) => /NUIT \d/.test(textOf(m))).length;
  console.log(`   ton rôle : ${myRole} · ${nights} nuit(s) · ${textOf(ending).replace(/\s+/g, ' ').slice(0, 70)}`);
});

await check('loup-garou à 8 : la sorcière sauve ET empoisonne, le chasseur tire après l’annonce de sa mort', async () => {
  SPEED = 50; // 50 s de nuit deviennent 1 s : le temps de cliquer
  try {
    const channel = makeChannel('mini-jeux-8');
    const host = makeUser('Meneuse');
    const players = [host, ...['J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8'].map(makeUser)];
    const interaction = makeInteraction(host, channel, {});
    interaction.guild = channel.guild;
    channel.guild.client = { users: { cache: new Map(players.map((p) => [p.id, p])) } };
    for (const player of players) channel.guild.members.cache.set(player.id, { displayName: player.username, user: player });

    startWerewolf(interaction).catch((err) => console.error('   ⚠️ startWerewolf :', err));
    const lobby = await waitFor('salle d’attente', () => channel.sent.find((m) => textOf(m).includes('LOUP-GAROU')));
    const join = buttonsOf(lobby).find((b) => b.endsWith(':join'));
    for (const player of players.slice(1)) await handleLobbyButton(makeComponent(player, join, { channel }));
    await handleLobbyButton(makeComponent(host, buttonsOf(lobby).find((b) => b.endsWith(':start')), { channel }));

    const thread = await waitFor('fil de la partie', () => channel.sent.map((m) => m.thread).find(Boolean));
    await waitFor('rôles en MP', () => players.every((p) => p.dms.length));
    const roleOf = new Map(players.map((p) => {
      const data = p.dms.at(-1).embeds[0].data ?? p.dms.at(-1).embeds[0];
      assert.ok(data.fields?.length >= 3, 'le MP du rôle doit avoir ses rubriques (objectif, comment jouer…)');
      return [p, Object.entries(ROLES).find(([, r]) => data.title.includes(r.name))[0]];
    }));
    const withRole = (role) => players.filter((p) => roleOf.get(p) === role);
    const [witch] = withRole('sorciere');
    const [hunter] = withRole('chasseur');
    const [seer] = withRole('voyante');
    const [victim, shot] = withRole('villageois');
    assert.ok(witch && hunter && seer && victim && shot, 'à 8 joueurs il faut sorcière, chasseur, voyante et villageois');
    assert.equal(withRole('loup').length, 2, 'deux loups à 8 joueurs');

    await waitFor('première nuit', () => thread.sent.some((m) => /NUIT 1/.test(textOf(m))), 8_000);
    const gid = buttonsOf(thread.sent.find((m) => buttonsOf(m).some((b) => b.endsWith(':act')))).find((b) => b.endsWith(':act')).split(':')[2];
    const click = async (player, action, values = []) => {
      const c = makeComponent(player, `g:lg:${gid}:${action}`, { values, channel: thread });
      await handleWerewolfComponent(c);
      return c.replies.at(-1);
    };

    for (const wolf of withRole('loup')) await click(wolf, 'wolf', [victim.id]);
    const vision = await click(seer, 'seer', [withRole('loup')[0].id]);
    assert.match(vision?.content ?? '', /Loup-garou/, 'la voyante doit voir le rôle');
    const memory = await click(seer, 'role');
    assert.match(memory?.content ?? '', /Tes visions[\s\S]*Loup-garou/, '« Voir mon rôle » doit garder les visions');

    await waitFor('réveil de la sorcière', () => thread.sent.some((m) => /sorcière se réveille/.test(m.content ?? '')), 8_000);
    const panel = await click(witch, 'act');
    assert.match(JSON.stringify(panel), /:save/, 'la sorcière doit pouvoir sauver');
    const afterSave = await click(witch, 'save');
    assert.match(JSON.stringify(afterSave), /:poison/, 'après avoir sauvé, la potion de mort doit rester proposée');
    const afterPoison = await click(witch, 'poison', [hunter.id]);
    assert.match(afterPoison?.content ?? '', /potion de mort/);

    const huntPrompt = await waitFor('flèche du chasseur', () => thread.sent.find((m) => /il te reste une flèche/.test(m.content ?? '')), 8_000);
    const dawnIndex = thread.sent.findIndex((m) => /JOUR 1/.test(textOf(m)));
    assert.ok(dawnIndex >= 0 && dawnIndex < thread.sent.indexOf(huntPrompt), 'la mort du chasseur est annoncée avant qu’il tire');
    const dawnText = textOf(thread.sent[dawnIndex]);
    assert.ok(dawnText.includes(`<@${hunter.id}>`), 'le chasseur empoisonné meurt');
    assert.ok(!dawnText.includes(`<@${victim.id}>`), 'la victime sauvée par la sorcière survit');

    await click(hunter, 'hunt', [shot.id]);
    const arrow = await waitFor('dernière flèche', () => thread.sent.find((m) => /dernière flèche/i.test(textOf(m)) && textOf(m).includes(`<@${shot.id}>`)), 8_000);
    console.log(`   ${textOf(arrow).replace(/\s+/g, ' ').slice(0, 100)}`);

    const stopButton = `g:lg:${gid}:stop`;
    await handleWerewolfComponent(makeComponent(host, stopButton, { channel: thread }));
    await waitFor('fin de partie', () => thread.sent.some((m) => /arrêtée|gagné/i.test(textOf(m))), 6_000);
  } finally {
    SPEED = 500;
  }
});

// ====================== Les autres mini-jeux ======================
// On vérifie au moins que chaque jeu démarre, ouvre sa salle d'attente et ne casse
// rien au chargement : la plupart des pannes passées venaient de là.

const { startRebus } = await import(new URL('rebus.js', ROOT));
const { startFans } = await import(new URL('fans.js', ROOT));
const { startStory } = await import(new URL('histoire.js', ROOT));

await check('undercover : rôles en MP (dont Mister White), indices, votes, fin de partie', async () => {
  const { startUndercover, handleSoireeComponent } = await import(new URL('soirees.js', ROOT));
  const channel = makeChannel('mini-jeux');
  const host = makeUser('Hôte');
  const running = startUndercover(makeInteraction(host, channel)).catch((err) => console.error('   ⚠️ startUndercover :', err));
  await sleep(30);
  const lobby = await waitFor('salle d’attente', () => channel.sent.find((m) => textOf(m).includes('UNDERCOVER')));
  const join = buttonsOf(lobby).find((b) => b.endsWith(':join'));
  const players = [host, makeUser('Ana'), makeUser('Ben'), makeUser('Cid'), makeUser('Dia')];
  for (const player of players.slice(1)) await handleLobbyButton(makeComponent(player, join, { channel }));
  await handleLobbyButton(makeComponent(host, buttonsOf(lobby).find((b) => b.endsWith(':start')), { channel }));
  const thread = await waitFor('fil de partie', () => channel.sent.map((m) => m.thread).find(Boolean));
  await waitFor('MP envoyés', () => players.every((p) => p.dms.length));
  const titles = players.map((p) => (p.dms.at(-1).embeds[0].data ?? p.dms.at(-1).embeds[0]).title);
  assert.equal(titles.filter((t) => /Mister White/.test(t)).length, 1, 'un Mister White à 5 joueurs');
  const words = new Set(players.map((p) => /^# (.+)$/m.exec((p.dms.at(-1).embeds[0].data ?? p.dms.at(-1).embeds[0]).description)?.[1]).filter((w) => w && w !== 'Aucun mot'));
  assert.equal(words.size, 2, 'deux mots : civils et undercover');
  // Chacun donne un indice quand c'est son tour, puis tout le monde vote pour le 1er joueur du vote
  let answered = 0;
  thread.hooks.push((message) => {
    const turn = /👉 <@(\d+)>, ton indice/.exec(message.content)?.[1];
    if (turn) realSetTimeout(() => { say(thread, directory.get(turn), 'truc connu'); answered++; }, 1);
    const menu = buttonsOf(message).find((b) => b?.endsWith(':vote'));
    if (menu) {
      const target = message.components[0].components[0].data?.options?.[0]?.value ?? message.components[0].components[0].options?.[0]?.value;
      realSetTimeout(() => players.forEach((p) => handleSoireeComponent(makeComponent(p, menu, { values: [target], channel: thread })).catch(() => {})), 1);
    }
  });
  const end = await waitFor('fin de la partie', () => thread.sent.find((m) => /Mot des civils/.test(textOf(m))), 20_000);
  assert.ok(answered >= 4, 'les indices ont été demandés à tour de rôle');
  assert.match(textOf(end), /Mister White/);
  await running;
});

await check('les autres jeux démarrent sans planter', async () => {
  // Sans clé Gemini valable, ces jeux ne peuvent pas fabriquer leur contenu : ce qu'on
  // vérifie ici, c'est qu'ils le disent proprement au lieu de planter en silence.
  const jeux = [
    ['rébus', (interaction, channel) => startRebus(interaction, { theme: 'tout', rounds: 3, channel })],
    ['fans', (interaction) => startFans(interaction, 'tout')],
    ['histoire', (interaction) => startStory(interaction, { theme: 'fantasy', length: 'courte', mode: 'texte' })],
  ];

  for (const [nom, start] of jeux) {
    const channel = makeChannel(`salon-${nom}`);
    const host = makeUser(`Hôte-${nom}`);
    const interaction = makeInteraction(host, channel, {});
    interaction.guild = channel.guild;
    channel.guild.client = { users: { cache: new Map([[host.id, host]]) } };

    let crash = null;
    start(interaction, channel).catch((err) => { crash = err; });
    const said = await waitFor(
      `réaction de ${nom}`,
      () => (channel.sent.length || interaction.replies.length ? [...channel.sent.map(textOf), ...interaction.replies.map((r) => r?.content ?? JSON.stringify(r))].join(' ') : null),
      12_000,
    ).catch(() => null);

    assert.ok(!crash, `${nom} a planté : ${crash?.stack ?? crash}`);
    assert.ok(said, `${nom} n’a rien dit du tout`);
    console.log(`   ${nom} : répond sans planter ✔ (${said.replace(/\s+/g, ' ').trim().slice(0, 70)})`);
  }
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
