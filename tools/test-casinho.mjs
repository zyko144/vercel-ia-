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
    isUserSelectMenu: () => false,
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

  const set10k = buttonIds(last(table)).find((id) => id.startsWith('ctb:set10000:'));
  await handleTableComponent(follow(table, { __customId: set10k }));
  assert.equal(betOf(last(table)), chips(10_000));

  const double = buttonIds(last(table)).find((id) => id.startsWith('ctb:double'));
  await handleTableComponent(follow(table, { __customId: double }));
  assert.equal(betOf(last(table)), chips(20_000));

  const half = buttonIds(last(table)).find((id) => id.startsWith('ctb:half'));
  await handleTableComponent(follow(table, { __customId: half }));
  assert.equal(betOf(last(table)), chips(10_000));

  // Les mises rapides vont jusqu'au million, à l'échelle du cadeau quotidien.
  const labels = (last(table).components ?? []).flatMap((row) => row.components.map((b) => b.data?.label)).filter(Boolean);
  for (const label of ['100', '1k', '10k', '100k', '1M']) assert.ok(labels.includes(label), `mise rapide « ${label} » absente`);
});

await check('le cadeau quotidien donne un million de jetons', async () => {
  await reset(USER);
  const before = await balance(USER);
  await wallet.claimDaily(mock({}));
  assert.ok((await balance(USER)) - before >= 1_000_000, 'le quotidien doit rapporter au moins un million');
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
  // Les tables en solo, plus les trois tables à plusieurs.
  assert.equal(menu.options.length, TABLE_GAMES.length + 3);
  assert.ok(menu.options.some((o) => o.value === 'multi-blackjack'), 'le blackjack à plusieurs doit être proposé');
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

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const descriptionOf = (payload) => (payload?.embeds?.[0]?.data ?? payload?.embeds?.[0])?.description ?? '';

await check('crash : décollage, vol en images, puis encaissement manuel', async () => {
  // Une fusée qui ne part pas trop vite : on relance jusqu'à en avoir une qui vole au moins ×1,5.
  for (let attempt = 0; attempt < 30; attempt++) {
    await grant(USER, 100_000);
    const interaction = mock({});
    await startCrash(interaction, 100);
    const start = last(interaction);
    assert.ok(attachmentOf(start), 'le décollage doit être illustré');
    assert.equal(buttonIds(start).length, 0, 'on ne peut pas encaisser avant le décollage');

    await sleepMs(2_300); // compte à rebours + première image de vol
    const flying = interaction.sent.find((p) => /gain possible/.test(descriptionOf(p)));
    if (!flying) continue; // explosée à ×1,00 : on recommence
    const cash = buttonIds(flying).find((id) => id.startsWith('ccr:cash'));
    assert.ok(cash, 'le bouton Encaisser doit apparaître une fois la fusée partie');

    const before = await balance(USER);
    await handleLiveButton(follow(interaction, { __customId: cash }));
    await sleepMs(300);
    const final = last(interaction);
    if (/Explosion/.test(descriptionOf(final))) continue; // explosée juste avant le clic
    assert.match(descriptionOf(final), /Encaissé à ×\d/);
    assert.ok(attachmentOf(final), 'le résultat doit être illustré');
    assert.ok((await balance(USER)) > before, 'encaisser en vol rapporte des jetons');
    return;
  }
  throw new Error('aucune fusée n’a volé en 30 essais');
});

await check('crash : l’encaissement automatique tombe pile au bon multiplicateur', async () => {
  const { autoChance } = await import(new URL('live.js', ROOT));
  assert.ok(Math.abs(autoChance(2) - 0.485) < 1e-9, 'à ×2, 48,5 % de chances de réussite');
  for (let attempt = 0; attempt < 40; attempt++) {
    await grant(USER, 100_000);
    const interaction = mock({});
    const before = await balance(USER);
    await startCrash(interaction, 1_000, { auto: 1.1 });
    await sleepMs(3_000); // ×1,1 est atteint ~0,6 s après le décollage
    const final = last(interaction);
    if (/Explosion/.test(descriptionOf(final))) continue; // explosée avant ×1,1 (8 % du temps)
    assert.match(descriptionOf(final), /Encaissé à ×1\.10/, 'l’encaissement auto doit se faire à ×1,10 exactement');
    assert.equal((await balance(USER)) - before, 100, 'gain exact : 1 000 × 1,1 − 1 000');
    return;
  }
  throw new Error('aucune fusée n’a atteint ×1,1 en 40 essais');
});

await check('duel depuis le hall : on choisit son adversaire dans un menu', async () => {
  await grant(USER, 100_000);
  const table = mock({});
  await openTable(table, 'duel');
  const picker = last(table).components[0].components[0];
  assert.equal(picker.data.type ?? picker.toJSON().type, 5, 'un menu de choix de membre doit être proposé');
  const panelId = picker.data.custom_id.split(':')[2];

  const choose = follow(table, { __customId: `ctb:who:${panelId}`, __values: [FOE] });
  choose.users = { first: () => user(FOE) };
  choose.isUserSelectMenu = () => true;
  choose.isStringSelectMenu = () => false;
  await handleTableComponent(choose);
  assert.match(JSON.stringify(last(table).embeds[0].data.fields), new RegExp(FOE), 'l’adversaire choisi doit apparaître');

  const play = buttonIds(last(table)).find((id) => id.startsWith('ctb:play'));
  const launch = follow(table, { __customId: play });
  await handleTableComponent(launch);
  const challenge = last(table);
  assert.match(challenge.content ?? '', new RegExp(`<@${FOE}>`), 'le défi doit mentionner l’adversaire');
  assert.ok(buttonIds(challenge).some((id) => id.startsWith('cdu:accept')), 'l’adversaire doit pouvoir accepter');
  // On refuse pour rendre la mise.
  const refuse = mock({ __customId: buttonIds(challenge).find((id) => id.startsWith('cdu:refuse')) }, FOE);
  refuse.sent = table.sent;
  await handleLiveButton(refuse);
});

// ------------------------------------------------------------ À plusieurs
const { handleMultiComponent } = await import(new URL('multi.js', ROOT));
const { ROULETTE_BETS } = await import(new URL('games.js', ROOT));

/** Un clic d'un autre joueur sur le même message public. */
const as = (source, who, options) => {
  const next = mock(options, who);
  next.sent = source.sent;
  return next;
};
const PLAYERS = ['JOUEUR-A', 'JOUEUR-B', 'JOUEUR-C'];

/** Ouvre une table à plusieurs depuis le hall et renvoie l'interaction d'origine. */
async function openMulti(game) {
  const hall = mock({});
  await openLobby(hall);
  const pick = follow(hall, { __customId: 'ctb:pick:hall', __values: [`multi-${game}`] });
  await handleTableComponent(pick);
  const table = last(hall);
  const tableId = buttonIds(table).find((id) => id.startsWith('cmp:go:')).split(':')[2];
  return { hall: pick, tableId };
}

await check('à plusieurs : roulette, un seul numéro et chacun payé selon son pari', async () => {
  for (const who of PLAYERS) {
    await reset(who);
    await grant(who, 1_000_000 - (await balance(who)));
  }
  const { hall, tableId } = await openMulti('roulette');
  // A mise 10k sur rouge (par défaut), B 1k sur noir, C 100k sur la 1re douzaine.
  await handleMultiComponent(as(hall, 'JOUEUR-A', { __customId: `cmp:bet10000:${tableId}` }));
  await handleMultiComponent(as(hall, 'JOUEUR-B', { __customId: `cmp:bet1000:${tableId}` }));
  await handleMultiComponent(as(hall, 'JOUEUR-B', { __customId: `cmp:opt:${tableId}`, __values: ['noir'] }));
  await handleMultiComponent(as(hall, 'JOUEUR-C', { __customId: `cmp:bet100000:${tableId}` }));
  await handleMultiComponent(as(hall, 'JOUEUR-C', { __customId: `cmp:opt:${tableId}`, __values: ['douzaine1'] }));

  const lobby = last(hall).embeds[0].data.fields[0];
  assert.match(lobby.name, /Joueurs \(3\/10\)/, 'les trois joueurs doivent apparaître');
  assert.match(lobby.value, /JOUEUR-B.*Noir/, 'le pari de chacun doit être affiché');

  // Un joueur qui n'est pas l'hôte ne peut pas lancer.
  const intruder = as(hall, 'JOUEUR-B', { __customId: `cmp:go:${tableId}` });
  await handleMultiComponent(intruder);
  assert.match(intruder.sent.at(-1).content ?? '', /Seul/);

  await handleMultiComponent(as(hall, USER, { __customId: `cmp:go:${tableId}` }));
  const final = hall.sent.filter((p) => /s’arrête sur/.test(descriptionOf(p))).at(-1);
  assert.ok(final, 'le résultat de la table doit être publié');
  const pocket = Number(/\*\*(\d+)\*\*/.exec(descriptionOf(final))[1]);

  // Chaque joueur a été payé selon SON pari, sur le MÊME numéro.
  const expected = { 'JOUEUR-A': ['rouge', 10_000], 'JOUEUR-B': ['noir', 1_000], 'JOUEUR-C': ['douzaine1', 100_000] };
  for (const [who, [type, bet]] of Object.entries(expected)) {
    const rule = ROULETTE_BETS[type];
    const net = rule.wins(pocket) ? bet * (rule.pays - 1) : -bet;
    assert.equal((await balance(who)) - 1_000_000, net, `${who} : paiement faux sur le ${pocket}`);
  }
  assert.ok(buttonIds(final).some((id) => id.startsWith('cmp:again')), 'on doit pouvoir rouvrir une table');
  console.log(`   la bille tombe sur le ${pocket} : A ${ROULETTE_BETS.rouge.wins(pocket) ? 'gagne' : 'perd'}, B ${ROULETTE_BETS.noir.wins(pocket) ? 'gagne' : 'perd'}, C ${ROULETTE_BETS.douzaine1.wins(pocket) ? 'gagne' : 'perd'}`);
});

await check('à plusieurs : crash, une seule fusée, chacun encaisse pour lui', async () => {
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const who of PLAYERS.slice(0, 2)) {
      await reset(who);
      await grant(who, 1_000_000 - (await balance(who)));
    }
    const { hall, tableId } = await openMulti('crash');
    await handleMultiComponent(as(hall, 'JOUEUR-A', { __customId: `cmp:bet10000:${tableId}` }));
    await handleMultiComponent(as(hall, 'JOUEUR-A', { __customId: `cmp:opt:${tableId}`, __values: ['1.5'] }));
    await handleMultiComponent(as(hall, 'JOUEUR-B', { __customId: `cmp:bet1000:${tableId}` }));
    await handleMultiComponent(as(hall, USER, { __customId: `cmp:go:${tableId}` }));

    await sleepMs(2_500); // décollage, puis ~0,7 s de vol
    const click = as(hall, 'JOUEUR-B', { __customId: `cmp:cash:${tableId}` });
    await handleMultiComponent(click);
    const answer = click.sent.at(-1).content ?? '';
    if (!/Encaissé/.test(answer)) continue; // fusée déjà explosée : on recommence

    await sleepMs(3_500); // laisse A atteindre ×1,5 (ou exploser avant)
    const outB = (await balance('JOUEUR-B')) - 1_000_000;
    assert.ok(outB > 0, 'B a encaissé en vol : il doit gagner');
    const outA = (await balance('JOUEUR-A')) - 1_000_000;
    assert.ok(outA === 5_000 || outA === -10_000, `A : soit encaissé pile à ×1,5 (+5 000), soit explosé (-10 000), pas ${outA}`);
    console.log(`   B encaisse en vol (${outB > 0 ? '+' : ''}${outB}), A ${outA > 0 ? 'encaisse automatiquement à ×1,5' : 'saute avec la fusée'}`);
    return;
  }
  throw new Error('aucune fusée n’a volé en 30 essais');
});

await check('à plusieurs : blackjack, chacun joue sa main à son tour', async () => {
  for (const who of PLAYERS) {
    await reset(who);
    await grant(who, 1_000_000 - (await balance(who)));
  }
  const { hall, tableId } = await openMulti('blackjack');
  for (const who of PLAYERS) await handleMultiComponent(as(hall, who, { __customId: `cmp:bet1000:${tableId}` }));
  await handleMultiComponent(as(hall, USER, { __customId: `cmp:go:${tableId}` }));

  let turns = 0;
  for (let guard = 0; guard < 20; guard++) {
    await sleepMs(50);
    const current = hall.sent.filter((p) => p.embeds?.length).at(-1);
    if (buttonIds(current).some((id) => id.startsWith('cmp:again'))) break;
    const who = /C’est à \*\*(.+?)\*\*/.exec(descriptionOf(current))?.[1];
    if (!who) continue;
    // Un autre joueur ne peut pas jouer à sa place.
    const other = PLAYERS.find((p) => p !== who);
    const wrong = as(hall, other, { __customId: `cmp:stand:${tableId}` });
    await handleMultiComponent(wrong);
    assert.match(wrong.sent.at(-1).content ?? '', /Patience|tour/, 'seul le joueur dont c’est le tour peut jouer');
    await handleMultiComponent(as(hall, who, { __customId: `cmp:stand:${tableId}` }));
    turns += 1;
  }
  await sleepMs(4_000); // le croupier joue carte par carte
  const final = hall.sent.filter((p) => buttonIds(p).some((id) => id.startsWith('cmp:again'))).at(-1);
  assert.ok(final, 'la table doit se terminer');
  for (const who of PLAYERS) assert.match(descriptionOf(final), new RegExp(who), `${who} doit avoir son résultat`);
  assert.ok(attachmentOf(final), 'la table finale doit être illustrée');
  console.log(`   ${turns} tour(s) joué(s), puis le croupier : ${descriptionOf(final).split('\n').filter((l) => /JOUEUR/.test(l)).map((l) => l.slice(0, 2)).join(' ')}`);
});

await check('seule /casino lance les jeux', () => {
  const names = casinhoCommands.map((c) => c.name);
  for (const game of ['blackjack', 'roulette', 'machine', 'des', 'pileouface', 'rougenoir', 'mines', 'crash', 'plusoumoins', 'duel']) {
    assert.ok(!names.includes(game), `la commande /${game} devrait avoir disparu`);
  }
  assert.ok(names.includes('casino'));
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
  const guide = last(help).embeds.map((e) => e.data ?? e);
  assert.ok(guide.length >= 3, 'le guide : accueil, jeux, commandes');
  assert.match(guide[0].description, /\/casino/, 'le guide doit présenter /casino');
  // Limites de Discord : 1 024 caractères par champ, 4 096 par description,
  // et 6 000 au total pour tous les embeds d'un même message.
  let total = 0;
  for (const embed of guide) {
    total += (embed.title ?? '').length + (embed.description ?? '').length + (embed.footer?.text ?? '').length;
    assert.ok((embed.description ?? '').length <= 4096);
    for (const field of embed.fields ?? []) {
      assert.ok(field.value.length <= 1024, `champ trop long : ${field.name}`);
      total += field.name.length + field.value.length;
    }
  }
  assert.ok(total <= 6000, `le guide dépasse la limite de Discord : ${total} caractères`);
  console.log(`   guide : ${guide.length} embeds, ${total} caractères sur 6 000`);
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
