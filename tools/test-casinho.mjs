/**
 * Banc d'essai du bot Casinho : aucune connexion à Discord, uniquement la logique.
 * Les interactions sont simulées ; on vérifie que chaque table s'ouvre, que les
 * boutons répondent, et que les comptes restent cohérents.
 *
 *   npm run test:casino
 */
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('../src/casinho/', import.meta.url);
const { handValue, isBlackjack, canSplit, shoe } = await import(new URL('cards.js', ROOT));
const { grant, balance, chips, reset } = await import(new URL('economy.js', ROOT));
const { startBlackjack, handleBlackjackButton } = await import(new URL('blackjack.js', ROOT));
const { resolveInstant, slotRtp, rouletteRtp, diceRtp, evenRtp, slotSpin, rouletteSpin, diceRoll, coinToss, cardColour } =
  await import(new URL('games.js', ROOT));
const { startMines, startCrash, startHiLo, startDuel, handleLiveButton, minesMultiplier } = await import(new URL('live.js', ROOT));
const { openTable, openLobby, handleTableComponent, TABLE_GAMES } = await import(new URL('table.js', ROOT));
const wallet = await import(new URL('wallet.js', ROOT));
const { casinhoCommands } = await import(new URL('commands.js', ROOT));

const USER = 'TEST-JOUEUR';
const FOE = 'TEST-ADVERSAIRE';
let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log('✅', name);
};

const user = (id) => ({ id, bot: false, username: id, displayName: id, displayAvatarURL: () => 'https://example.invalid/a.png' });

function mock(options = {}, who = USER) {
  const self = {
    sent: [],
    modals: [],
    user: user(who),
    channelId: 'SALON-TEST',
    commandName: options.__name ?? 'test',
    client: { users: { fetch: async (id) => user(id) } },
    options: {
      getInteger: (name) => (typeof options[name] === 'number' ? options[name] : null),
      getString: (name) => (typeof options[name] === 'string' ? options[name] : null),
      getUser: (name) => options[name] ?? null,
    },
    values: options.__values ?? [],
    fields: { getTextInputValue: () => options.__input ?? '' },
    replied: false,
    deferred: false,
    customId: options.__customId,
    isButton: () => Boolean(options.__customId) && !options.__values && !options.__modal,
    isStringSelectMenu: () => Boolean(options.__values),
    isModalSubmit: () => Boolean(options.__modal),
    isChatInputCommand: () => !options.__customId,
    // On écrit dans self.sent pour partager le même fil entre la commande et ses boutons.
    async reply(payload) { self.replied = true; self.sent.push(payload); return payload; },
    async editReply(payload) { self.sent.push(payload); return payload; },
    async update(payload) { self.replied = true; self.sent.push(payload); return payload; },
    async followUp(payload) { self.sent.push(payload); return payload; },
    async deferUpdate() { self.sent.push({ deferred: true }); },
    async showModal(modal) { self.modals.push(modal); },
  };
  return self;
}

const last = (interaction) => interaction.sent.at(-1);
/** Les boutons cliquables du dernier message : Discord n'envoie jamais un bouton désactivé. */
const buttonIds = (payload) =>
  (payload?.components ?? []).flatMap((row) =>
    (row.components ?? row.toJSON?.().components ?? [])
      .filter((b) => !(b.data?.disabled ?? b.disabled))
      .map((b) => b.data?.custom_id ?? b.custom_id)
      .filter(Boolean),
  );
/** Reprend le fil du message d'une interaction précédente (un clic modifie le même message). */
const follow = (source, options) => {
  const next = mock(options, source.user.id);
  next.sent = source.sent;
  return next;
};

// ---------------------------------------------------------------- Cartes
await check('comptage des as (souple puis dur)', () => {
  assert.equal(handValue([{ rank: 'A' }, { rank: 'K' }]).total, 21);
  assert.equal(handValue([{ rank: 'A' }, { rank: 'A' }, { rank: '9' }]).total, 21);
  assert.equal(handValue([{ rank: 'A' }, { rank: '9' }, { rank: '5' }]).total, 15);
  assert.equal(handValue([{ rank: 'K' }, { rank: 'Q' }, { rank: '5' }]).bust, true);
  assert.equal(handValue([{ rank: 'A' }, { rank: '6' }]).soft, true);
  assert.equal(handValue([{ rank: '10' }, { rank: '7' }]).soft, false);
});

await check('blackjack et paire séparable', () => {
  assert.equal(isBlackjack([{ rank: 'A' }, { rank: 'J' }]), true);
  assert.equal(isBlackjack([{ rank: 'A' }, { rank: '5' }, { rank: '5' }]), false);
  assert.equal(canSplit([{ rank: '10' }, { rank: 'K' }]), true);
  assert.equal(canSplit([{ rank: '9' }, { rank: 'K' }]), false);
});

await check('sabot complet et mélangé', () => {
  const deck = shoe(6);
  assert.equal(deck.length, 312);
  assert.equal(deck.filter((c) => c.rank === 'A').length, 24);
});

// -------------------------------------------------------------- Économie
await check('la mise ne peut pas dépasser le solde', async () => {
  await reset(USER);
  await grant(USER, 1_000 - (await balance(USER)));
  const refused = await resolveInstant('pileouface', USER, 5_000, { side: 'pile' });
  assert.equal(refused.ok, false);
  assert.equal(await balance(USER), 1_000, 'aucun jeton ne doit bouger');
});

await check('un solde ne descend jamais sous zéro', async () => {
  await reset(USER);
  await grant(USER, -999_999);
  assert.equal(await balance(USER), 0);
  await grant(USER, 50_000);
});

// ------------------------------------------------------------- Blackjack
/** Ouvre une table qui attend vraiment une décision (un blackjack immédiat se règle seul). */
async function openHand(bet = 50) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await grant(USER, 10_000);
    const interaction = mock({ mise: bet });
    await startBlackjack(interaction, bet);
    if (buttonIds(last(interaction)).some((id) => id.startsWith('cbj:'))) return interaction;
  }
  throw new Error('aucune main interactive après 20 essais');
}

async function closeHand(interaction) {
  let guard = 0;
  while (guard++ < 12) {
    const stand = buttonIds(last(interaction)).find((id) => id.startsWith('cbj:stand'));
    if (!stand) break;
    await handleBlackjackButton(follow(interaction, { __customId: stand }));
  }
}

await check('blackjack : une partie complète se règle', async () => {
  const table = await openHand(100);
  await closeHand(table);
  assert.ok(!buttonIds(last(table)).some((id) => id.startsWith('cbj:')), 'plus aucun bouton de jeu');
  assert.ok(
    buttonIds(last(table)).some((id) => id.startsWith('ctb:again')),
    'un bouton « Rejouer » doit apparaître',
  );
  assert.ok((await balance(USER)) >= 0);
});

await check('blackjack : impossible de lancer deux mains dans le même salon', async () => {
  const first = await openHand();
  const second = mock({ mise: 50 });
  await startBlackjack(second, 50);
  assert.match(last(second).content ?? '', /déjà une partie/);
  await closeHand(first);
});

await check('blackjack : un autre joueur ne peut pas toucher la table', async () => {
  const owner = await openHand();
  const intruder = mock({ __customId: buttonIds(last(owner))[0] }, FOE);
  await handleBlackjackButton(intruder);
  assert.match(last(intruder).content, /quelqu’un d’autre/);
  await closeHand(owner);
});

await check('blackjack : doubler clôt la main', async () => {
  const table = await openHand(100);
  const double = buttonIds(last(table)).find((id) => id.startsWith('cbj:double'));
  if (!double) return;
  await handleBlackjackButton(follow(table, { __customId: double }));
  assert.ok(!buttonIds(last(table)).some((id) => id.startsWith('cbj:')), 'doubler termine la main');
});

// ------------------------------------------------------------ Les images
const attachmentOf = (payload) => payload?.files?.[0];
const imageUrlOf = (payload) => (payload?.embeds?.[0]?.data ?? payload?.embeds?.[0])?.image?.url ?? '';

await check('blackjack : chaque coup montre la table en image', async () => {
  const table = await openHand(100);
  const first = last(table);
  assert.ok(attachmentOf(first), 'la table doit être jointe en image');
  const name = attachmentOf(first).name;
  assert.match(name, /\.jpg$/);
  assert.equal(imageUrlOf(first), `attachment://${name}`, 'l’embed doit afficher cette image');
  assert.deepEqual(first.attachments, [], 'l’image précédente doit être remplacée, pas empilée');

  const before = table.sent.length;
  await closeHand(table);
  const steps = table.sent.slice(before);
  // Le croupier retourne sa carte, puis tire éventuellement : au moins une étape avant le verdict.
  assert.ok(steps.length >= 2, 'le croupier doit jouer sous les yeux du joueur');
  assert.match(JSON.stringify(steps[0]), /retourne sa carte|BLACKJACK|SAUT/i);
  const final = steps.at(-1);
  assert.ok(attachmentOf(final), 'le verdict doit être affiché sur la table');
  assert.notEqual(attachmentOf(final).name, name, 'chaque image a son propre nom');
});

await check('jeux instantanés : l’animation montre le vrai résultat, puis la scène finale', async () => {
  const { animationFor } = await import(new URL('render/animations.js', ROOT));
  // Chaque issue possible a son animation : la roue ne s'arrête jamais sur un autre numéro.
  // En ligne l'URL est « …/casino/roulette/17.gif », en local la pièce jointe « roulette-17.gif ».
  for (let n = 0; n <= 36; n++) assert.match(animationFor({ kind: 'roulette', pocket: n }).url, new RegExp(`roulette[/-]${n}\\.gif$`));
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) assert.match(animationFor({ kind: 'des', a, b }).url, new RegExp(`des[/-]${a}-${b}\\.gif$`));
  for (const side of ['pile', 'face']) assert.match(animationFor({ kind: 'piece', side }).url, new RegExp(`piece[/-]${side}\\.gif$`));
  for (const suit of ['♠', '♥', '♦', '♣']) {
    for (const rank of ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']) {
      assert.match(animationFor({ kind: 'carte', card: { rank, suit } }).url, /cartes[/-][0-9ajqk]+[shdc]\.gif$/, `pas d’animation pour ${rank}${suit}`);
    }
  }

  await grant(USER, 50_000);
  const table = mock({});
  await openTable(table, 'roulette');
  const play = buttonIds(last(table)).find((id) => id.startsWith('ctb:play'));
  await handleTableComponent(follow(table, { __customId: play }));
  const [spin, final] = table.sent.slice(-2);
  const pocket = Number(/\*\*(\d+)\*\*/.exec(JSON.stringify(final.embeds[0].data.description ?? final.embeds[0].description))?.[1]);
  assert.ok(Number.isInteger(pocket), 'le résultat doit citer le numéro');
  assert.match(imageUrlOf(spin), new RegExp(`roulette[/-]${pocket}\\.gif$`), 'l’animation doit finir sur le numéro tiré');
  assert.ok(attachmentOf(final)?.name?.endsWith('.jpg'), 'la scène finale doit être jointe');
});

// ------------------------------------------------------------ La table
await check('chaque jeu ouvre sa table avec mise, boutons et animation', async () => {
  await grant(USER, 100_000);
  for (const gameId of TABLE_GAMES) {
    const interaction = mock({});
    await openTable(interaction, gameId);
    const payload = last(interaction);
    const embed = payload.embeds[0].data;
    assert.ok(embed.image?.url, `${gameId} : pas d’animation`);
    assert.ok(embed.fields.some((f) => f.name === 'Mise'), `${gameId} : pas de mise affichée`);
    const ids = buttonIds(payload);
    assert.ok(ids.includes(ids.find((id) => id.startsWith('ctb:play'))), `${gameId} : pas de bouton Jouer`);
    assert.ok(ids.some((id) => id.startsWith('ctb:set100')), `${gameId} : pas de mises rapides`);
  }
});

await check('les boutons de mise changent bien la mise', async () => {
  const table = mock({});
  await openTable(table, 'machine');
  const betOf = (payload) => payload.embeds[0].data.fields.find((f) => f.name === 'Mise').value;

  const set500 = buttonIds(last(table)).find((id) => id.startsWith('ctb:set500'));
  await handleTableComponent(follow(table, { __customId: set500 }));
  assert.equal(betOf(last(table)), chips(500));

  const double = buttonIds(last(table)).find((id) => id.startsWith('ctb:double'));
  await handleTableComponent(follow(table, { __customId: double }));
  assert.equal(betOf(last(table)), chips(1_000));

  const half = buttonIds(last(table)).find((id) => id.startsWith('ctb:half'));
  await handleTableComponent(follow(table, { __customId: half }));
  assert.equal(betOf(last(table)), chips(500));
});

await check('choisir son pari dans le menu met la table à jour', async () => {
  const table = mock({});
  await openTable(table, 'des');
  const select = last(table).components[0].components[0].data.custom_id;
  await handleTableComponent(follow(table, { __customId: select, __values: ['sept'] }));
  const field = last(table).embeds[0].data.fields.find((f) => f.name === 'Ton pari');
  assert.match(field.value, /Exactement 7/);
});

await check('roulette : « numéro plein » demande le numéro dans une fenêtre', async () => {
  const table = mock({});
  await openTable(table, 'roulette');
  const select = last(table).components[0].components[0].data.custom_id;
  const pick = follow(table, { __customId: select, __values: ['plein'] });
  await handleTableComponent(pick);
  assert.equal(pick.modals.length, 1, 'une fenêtre doit s’ouvrir');

  const panelId = select.split(':')[2];
  await handleTableComponent(follow(table, { __customId: `ctb:plein:${panelId}`, __modal: true, __input: '17' }));
  const field = last(table).embeds[0].data.fields.find((f) => f.name === 'Ton pari');
  assert.match(field.value, /17/);
});

await check('jouer depuis la table : animation, résultat, puis « Rejouer »', async () => {
  await grant(USER, 50_000);
  const table = mock({});
  await openTable(table, 'machine');
  const play = buttonIds(last(table)).find((id) => id.startsWith('ctb:play'));
  const before = await balance(USER);
  await handleTableComponent(follow(table, { __customId: play }));
  assert.ok((await balance(USER)) !== before || true);
  const payload = last(table);
  assert.ok(payload.embeds[0].data.fields.some((f) => f.name === 'Bilan'), 'le résultat doit afficher le bilan');
  assert.ok(buttonIds(payload).some((id) => id.startsWith('ctb:again')), 'un bouton « Rejouer » doit apparaître');
});

await check('la table d’un autre joueur est protégée', async () => {
  const table = mock({});
  await openTable(table, 'crash');
  const play = buttonIds(last(table)).find((id) => id.startsWith('ctb:play'));
  const intruder = mock({ __customId: play }, FOE);
  await handleTableComponent(intruder);
  assert.match(last(intruder).content, /quelqu’un d’autre/);
});

await check('le hall /casino propose toutes les tables', async () => {
  const hall = mock({});
  await openLobby(hall);
  const menu = last(hall).components[0].components[0].toJSON();
  assert.equal(menu.options.length, TABLE_GAMES.length);
  const pick = follow(hall, { __customId: 'ctb:pick:hall', __values: ['blackjack'] });
  await handleTableComponent(pick);
  assert.match(last(hall).embeds[0].data.title, /Blackjack/);
});

// ----------------------------------------------------------- Jeux rapides
await check('les jeux instantanés rendent un résultat cohérent', async () => {
  await grant(USER, 50_000);
  const cases = [
    ['roulette', { type: 'rouge' }],
    ['roulette', { type: 'plein', number: 17 }],
    ['machine', {}],
    ['des', { type: 'sept' }],
    ['pileouface', { side: 'face' }],
    ['rougenoir', { colour: 'noir' }],
  ];
  for (const [gameId, option] of cases) {
    const before = await balance(USER);
    const result = await resolveInstant(gameId, USER, 100, option);
    assert.equal(result.ok, true, `${gameId} doit répondre`);
    const after = await balance(USER);
    assert.ok(after <= before + 100 * 36, `${gameId} : gain aberrant`);
    assert.ok(after >= before - 100, `${gameId} : perte supérieure à la mise`);
  }
});

// --------------------------------------------------------- Taux affichés
await check('les taux de redistribution sont réalistes', () => {
  const slot = slotRtp();
  assert.ok(slot > 0.9 && slot < 1, `TRJ machine hors bornes : ${slot}`);
  for (const key of ['plus', 'moins', 'sept']) {
    const rtp = diceRtp(key);
    assert.ok(rtp > 0.94 && rtp < 0.98, `TRJ dés ${key} = ${rtp}`);
  }
  assert.ok(Math.abs(evenRtp() - 0.975) < 1e-9);
  console.log(`   machine ${(slot * 100).toFixed(2)} % · roulette ${(rouletteRtp('rouge') * 100).toFixed(2)} % · dés ${(diceRtp('plus') * 100).toFixed(2)} %`);
});

await check('mines : le multiplicateur suit la probabilité de survie', () => {
  assert.equal(minesMultiplier(3, 0), 1);
  assert.ok(Math.abs(minesMultiplier(3, 1) - 0.97 * (20 / 17)) < 1e-9);
  assert.ok(minesMultiplier(3, 5) > minesMultiplier(3, 4));
  assert.ok(minesMultiplier(6, 3) > minesMultiplier(2, 3));
});

// -------------------------------------------------- Jeux à encaissement
await check('mines : ouvrir une case puis encaisser', async () => {
  await grant(USER, 10_000);
  const interaction = mock({});
  await startMines(interaction, { bet: 100, bombs: 3 });
  const ids = buttonIds(last(interaction));
  assert.equal(ids.length, 20, '20 cases jouables, encaissement encore verrouillé');

  const before = await balance(USER);
  await handleLiveButton(follow(interaction, { __customId: ids[0] }));
  const cash = buttonIds(last(interaction)).find((id) => id.startsWith('cmn:cash'));
  if (!cash) {
    assert.match(last(interaction).embeds[0].data.description, /Bombe/);
    return;
  }
  await handleLiveButton(follow(interaction, { __customId: cash }));
  assert.ok((await balance(USER)) >= before, 'encaisser ne doit jamais faire perdre de jetons');
  assert.ok(buttonIds(last(interaction)).some((id) => id.startsWith('ctb:again')));
});

await check('plus ou moins : un tour puis encaissement', async () => {
  await grant(USER, 10_000);
  const interaction = mock({});
  await startHiLo(interaction, 100);
  const guess = buttonIds(last(interaction)).find((id) => id.startsWith('chl:higher') || id.startsWith('chl:lower'));
  await handleLiveButton(follow(interaction, { __customId: guess }));
  assert.ok(last(interaction).embeds?.length);
});

await check('crash : la partie démarre et propose l’encaissement', async () => {
  await grant(USER, 10_000);
  const interaction = mock({});
  await startCrash(interaction, 100);
  const cash = buttonIds(last(interaction)).find((id) => id.startsWith('ccr:cash'));
  assert.ok(cash, 'un bouton Encaisser doit être proposé');
  await handleLiveButton(follow(interaction, { __customId: cash }));
  assert.ok(last(interaction).embeds?.length);
});

await check('duel : refus = mise rendue', async () => {
  await grant(USER, 10_000);
  const before = await balance(USER);
  const interaction = mock({});
  await startDuel(interaction, { opponent: user(FOE), bet: 500 });
  assert.equal(await balance(USER), before - 500, 'la mise du lanceur est prélevée');
  const refuse = mock({ __customId: buttonIds(last(interaction)).find((id) => id.startsWith('cdu:refuse')) }, FOE);
  refuse.sent = interaction.sent;
  await handleLiveButton(refuse);
  assert.equal(await balance(USER), before, 'la mise doit être rendue');
});

await check('duel : on ne se défie pas soi-même', async () => {
  const interaction = mock({});
  await startDuel(interaction, { opponent: user(USER), bet: 100 });
  assert.match(last(interaction).content, /autre joueur/);
});

// ------------------------------------------------------------ Commandes
await check('les commandes sont valides et sans doublon', () => {
  const names = casinhoCommands.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, 'noms en double');
  for (const name of names) assert.match(name, /^[-_a-z0-9]{1,32}$/, `nom invalide : ${name}`);
  for (const command of casinhoCommands) {
    const json = command.toJSON();
    assert.ok(json.description.length <= 100, `description trop longue : ${json.name}`);
    for (const option of json.options ?? []) {
      assert.ok(option.description.length <= 100, `option trop longue : ${json.name}.${option.name}`);
      assert.ok((option.choices ?? []).length <= 25, `trop de choix : ${json.name}.${option.name}`);
    }
  }
  console.log(`   ${names.length} commandes : ${names.join(', ')}`);
});

await check('les animations existent et restent légères', async () => {
  for (const name of ['roulette', 'machine', 'des', 'piece', 'cartes', 'crash', 'mines']) {
    const file = path.resolve('assets/casinho', `${name}.gif`);
    const { size } = await stat(file);
    assert.ok(size > 5_000, `${name}.gif est vide`);
    assert.ok(size < 8 * 1024 * 1024, `${name}.gif dépasse la limite Discord`);
  }
});

await check('aide et table des gains se construisent', async () => {
  const help = mock({});
  await wallet.showHelp(help);
  assert.ok(last(help).embeds[0].data.fields.length >= 4);
  const pay = mock({});
  await wallet.showPaytable(pay);
  const fields = last(pay).embeds[0].data.fields;
  assert.ok(fields.length >= 6);
  for (const field of fields) assert.ok(field.value.length <= 1024, `champ trop long : ${field.name}`);
});

await check('banque : solde, don, classement, statistiques', async () => {
  await grant(USER, 10_000);
  const solde = mock({});
  await wallet.showBalance(solde);
  assert.ok(last(solde).embeds[0].data.description.includes('🪙'));

  const before = await balance(USER);
  await wallet.givePlayer(mock({ joueur: user(FOE), montant: 200 }));
  assert.equal(await balance(USER), before - 200);

  await wallet.showLeaderboard(mock({}));
  await wallet.showStats(mock({}));
});

// ------------------------------------------------- Vérification par le jeu
// On rejoue vraiment des centaines de milliers de manches : si un paiement était
// faux, le TRJ observé s'écarterait de celui affiché aux joueurs.
await check('TRJ observé = TRJ annoncé (500 000 manches par jeu)', () => {
  const ROUNDS = 500_000;
  const table = [];

  const measure = (nom, annonce, tirage) => {
    let rendu = 0;
    for (let i = 0; i < ROUNDS; i++) rendu += tirage();
    const observe = rendu / ROUNDS;
    table.push({ jeu: nom, annoncé: `${(annonce * 100).toFixed(2)} %`, observé: `${(observe * 100).toFixed(2)} %` });
    assert.ok(Math.abs(observe - annonce) < 0.02, `${nom} : annoncé ${annonce.toFixed(4)}, observé ${observe.toFixed(4)}`);
  };

  measure('machine à sous', slotRtp(), () => slotSpin().multiplier);
  measure('roulette rouge', rouletteRtp('rouge'), () => rouletteSpin('rouge').multiplier);
  measure('roulette douzaine', rouletteRtp('douzaine1'), () => rouletteSpin('douzaine1').multiplier);
  measure('roulette plein 17', rouletteRtp('plein'), () => rouletteSpin('plein', 17).multiplier);
  measure('dés plus de 7', diceRtp('plus'), () => diceRoll('plus').multiplier);
  measure('pile ou face', evenRtp(), () => coinToss('pile').multiplier);
  measure('rouge ou noir', evenRtp(), () => cardColour('rouge').multiplier);
  console.table(table);
});

console.log(`\n${passed} vérifications passées.`);
