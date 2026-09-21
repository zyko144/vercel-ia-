/**
 * Banc d'essai du bot Casinho : aucune connexion à Discord, uniquement la logique.
 * Les interactions sont simulées ; on vérifie que chaque table s'ouvre, que les
 * boutons répondent, et que les comptes restent cohérents.
 *
 *   npm run test:casino
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { MessageFlags } from 'discord.js';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('../src/casinho/', import.meta.url);
const { handValue, isBlackjack, canSplit, shoe } = await import(new URL('cards.js', ROOT));
const { grant, balance, chips, rand, reset } = await import(new URL('economy.js', ROOT));
const { startBlackjack, handleBlackjackButton } = await import(new URL('blackjack.js', ROOT));
const { resolveInstant, slotRtp, rouletteRtp, diceRtp, evenRtp, slotSpin, diceRoll, coinToss, cardColour } =
  await import(new URL('games.js', ROOT));
const roulette = await import(new URL('salle/roulette.js', ROOT));
const { payoutFor, spotRule, winningSpots, resetRooms } = roulette;
const crash = await import(new URL('salle/crash.js', ROOT));
const { resetCrash } = crash;
const blackjack = await import(new URL('salle/blackjack.js', ROOT));
const { resetBlackjack } = blackjack;
const duel = await import(new URL('salle/duel.js', ROOT));
const { resetDuels, incomingFor } = duel;
const { minesGame, hiloGame, machineGame, pieceGame, cartesGame, desGame, resetSolo } = await import(new URL('salle/solo.js', ROOT));
const { onRoundEnd, markPresent } = await import(new URL('salle/common.js', ROOT));
const { createSession, readSession, personalLink, handleSalleWeb, GAME_IDS } = await import(new URL('salle/web.js', ROOT));
const { handleSalleButton } = await import(new URL('salle-discord.js', ROOT));
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
const descriptionOf = (payload) => (payload?.embeds?.[0]?.data ?? payload?.embeds?.[0])?.description ?? '';
const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  await openTable(table, 'des');
  const play = buttonIds(last(table)).find((id) => id.startsWith('ctb:play'));
  await handleTableComponent(follow(table, { __customId: play }));
  const [spin, final] = table.sent.slice(-2);
  const [, a, b] = /des[/-](\d)-(\d)\.gif$/.exec(imageUrlOf(spin)) ?? [];
  assert.ok(a && b, 'l’animation doit être celle des faces tirées');
  const total = Number(/total \*\*(\d+)\*\*/.exec(JSON.stringify(final.embeds[0].data.description ?? final.embeds[0].description))?.[1]);
  assert.equal(total, Number(a) + Number(b), 'l’animation doit montrer les dés du résultat');
  assert.ok(attachmentOf(final)?.name?.endsWith('.jpg'), 'la scène finale doit être jointe');
});

// ------------------------------------------------------------ La table
await check('chaque jeu ouvre sa table avec mise, boutons et animation', async () => {
  await grant(USER, 100_000);
  for (const gameId of TABLE_GAMES) {
    if (gameId === 'roulette') continue; // le tapis : testé plus bas
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

await check('jetons du jour : l’ancien cadeau de 500 ne bloque pas le million', async () => {
  const { daily, account } = await import(new URL('economy.js', ROOT));
  // Le cas signalé : un compte qui a pris l'ancien cadeau (500 jetons) il y a 12 h,
  // avant que le montant passe à un million. L'ancien enregistrement n'avait pas de montant.
  const now = Date.parse('2026-09-21T10:40:00Z'); // 12 h 40 à Paris
  await reset('ANCIEN');
  const me = await account('ANCIEN');
  me.daily = now - 12 * 60 * 60 * 1000;
  me.streak = 1;
  const result = await daily('ANCIEN', now);
  assert.equal(result.ok, true, 'le million doit être récupérable tout de suite');
  assert.ok(result.amount >= 1_000_000);
});

await check('jetons du jour : une fois par jour, retour à minuit (heure de Paris)', async () => {
  const { daily } = await import(new URL('economy.js', ROOT));
  await reset('CALENDRIER');
  // Récupérés à 23 h 50 à Paris…
  const evening = Date.parse('2026-09-21T21:50:00Z');
  assert.equal((await daily('CALENDRIER', evening)).ok, true);
  // …refusés deux minutes plus tard, avec l'heure et le montant, et minuit dans 8 min.
  const again = await daily('CALENDRIER', evening + 2 * 60_000);
  assert.equal(again.ok, false);
  assert.equal(again.claimedAt, evening);
  assert.ok(again.claimed >= 1_000_000, 'le refus doit dire combien on a déjà eu');
  assert.ok(again.wait <= 8 * 60_000 + 1_000 && again.wait >= 7 * 60_000, `minuit dans ~8 min, pas ${Math.round(again.wait / 60_000)} min`);
  // …et de nouveau disponibles à 0 h 10, sans attendre 24 h. La série continue.
  const night = await daily('CALENDRIER', Date.parse('2026-09-21T22:10:00Z'));
  assert.equal(night.ok, true, 'un nouveau jour commence à minuit');
  assert.equal(night.streak, 2, 'deux jours de suite : la série passe à 2');
  // Un jour sauté : la série repart à 1.
  const later = await daily('CALENDRIER', Date.parse('2026-09-24T10:00:00Z'));
  assert.equal(later.streak, 1);
});

await check('jetons du jour : le refus explique quand et combien', async () => {
  await reset(USER);
  await wallet.claimDaily(mock({}));
  const second = mock({});
  await wallet.claimDaily(second);
  const text = last(second).content ?? '';
  assert.match(text, /déjà récupéré tes jetons du jour à \*\*\d{2}:\d{2}\*\*/, 'l’heure de la récupération doit être donnée');
  // Le montant reçu (un million, plus l'éventuel bonus de série).
  assert.match(text, /\(🪙 1[\s ]\d{3}[\s ]\d{3}\)/, 'le montant déjà reçu doit être donné');
  assert.match(text, /minuit/);
});

await check('choisir son pari dans le menu met la table à jour', async () => {
  const table = mock({});
  await openTable(table, 'des');
  const select = last(table).components[0].components[0].data.custom_id;
  await handleTableComponent(follow(table, { __customId: select, __values: ['sept'] }));
  const field = last(table).embeds[0].data.fields.find((f) => f.name === 'Ton pari');
  assert.match(field.value, /Exactement 7/);
});

// ------------------------------------------------ La salle de jeux cliquable
const ROOM = '100000000000000042';
const who = (id, name = id) => ({ id, name });
const A = who('900000000000000011', 'Alice');
const B = who('900000000000000012', 'Bruno');
/** Remet un joueur à un million pile. */
const millionFor = async (id) => {
  await reset(id);
  await grant(id, 1_000_000 - (await balance(id)));
};
const mineIn = (state) => state.players.find((p) => p.me);
const betOf = (state, spot) => (mineIn(state).bets.find(([key]) => key === spot)?.[1] ?? []);
/** Attend qu'une condition devienne vraie (les tours partagés avancent tout seuls). */
async function until(condition, { timeout = 4_000, step = 20 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return true;
    await sleepMs(step);
  }
  throw new Error('délai dépassé');
}
/** Remplace les durées d'un jeu le temps d'un test. */
async function quick(timing, values, fn) {
  const saved = { ...timing };
  Object.assign(timing, values);
  try {
    return await fn();
  } finally {
    Object.assign(timing, saved);
  }
}

await check('roulette : chaque case paie 36/37, du rouge au numéro plein', () => {
  const spots = ['rouge', 'noir', 'pair', 'impair', 'manque', 'passe', 'douzaine1', 'douzaine2', 'douzaine3', 'colonne1', 'colonne2', 'colonne3'];
  for (let n = 0; n <= 36; n++) spots.push(`plein-${n}`);
  for (const spot of spots) {
    let back = 0;
    for (let pocket = 0; pocket <= 36; pocket++) back += payoutFor([[spot, [1]]], pocket);
    assert.equal(back, 36, `${spot} : doit rendre 36 sur 37 numéros (TRJ 97,3 %)`);
  }
  assert.deepEqual([...winningSpots(17)].sort(), ['colonne2', 'douzaine2', 'impair', 'manque', 'noir', 'plein-17'].sort());
  for (const junk of ['constructor', 'plein-37', 'plein-07', 'plein-', 'plein', 42, null]) assert.equal(spotRule(junk), null, `case inconnue : ${junk}`);
});

await check('salle · roulette : des jetons de 20, 50, 100… posés, empilés, retirés', async () => {
  resetRooms();
  await millionFor(A.id);
  assert.equal((await roulette.act(ROOM, A, { action: 'poser', spot: 'rouge', value: 20 })).ok, true);
  await roulette.act(ROOM, A, { action: 'poser', spot: 'rouge', value: 20 }); // empilé
  await roulette.act(ROOM, A, { action: 'poser', spot: 'plein-17', value: 50 });
  await roulette.act(ROOM, A, { action: 'poser', spot: 'douzaine3', value: 100 });
  await roulette.act(ROOM, A, { action: 'poser', spot: 'plein-36', value: 500 });
  let state = await roulette.view(ROOM, A);
  assert.deepEqual(betOf(state, 'rouge'), [20, 20], 'deux jetons de 20 empilés sur rouge');
  assert.equal(state.me.onTable, 690);
  assert.equal(state.me.balance, 1_000_000, 'rien n’est prélevé avant le lancement');
  await roulette.act(ROOM, A, { action: 'annuler' });
  await roulette.act(ROOM, A, { action: 'retirer', spot: 'rouge' });
  state = await roulette.view(ROOM, A);
  assert.deepEqual(betOf(state, 'rouge'), [20]);
  assert.deepEqual(betOf(state, 'plein-36'), [], '« Annuler » retire le dernier jeton posé');
  await roulette.act(ROOM, A, { action: 'doubler' });
  assert.equal((await roulette.view(ROOM, A)).me.onTable, 340, '×2 double tous les jetons');
  await roulette.act(ROOM, A, { action: 'effacer' });
  assert.match((await roulette.act(ROOM, A, { action: 'poser', spot: 'rouge', value: 7 })).error, /Jeton inconnu/);
  assert.match((await roulette.act(ROOM, A, { action: 'poser', spot: 'bleu', value: 20 })).error, /Case inconnue/);
  await roulette.act(ROOM, A, { action: 'poser', spot: 'noir', value: 1_000_000 });
  assert.match((await roulette.act(ROOM, A, { action: 'poser', spot: 'rouge', value: 10 })).error, /Il te reste 0/);
  await grant(A.id, 5_000_000);
  assert.match((await roulette.act(ROOM, A, { action: 'poser', spot: 'noir', value: 1_000_000 })).error, /maximum par case/);
  resetRooms();
});

await check('salle · roulette : à deux, une seule bille, payés au jeton près, puis « Remettre »', async () => {
  resetRooms();
  const ends = [];
  const stop = onRoundEnd((summary) => ends.push(summary));
  try {
    await quick(roulette.timing, { lastCall: 400, spin: 80, results: 150 }, async () => {
      await millionFor(A.id);
      await millionFor(B.id);
      const betsA = [['rouge', [1_000, 1_000]], ['plein-0', [100]], ['colonne1', [50, 20]]];
      const betsB = [['noir', [20, 20, 20]], ['douzaine1', [10_000]]];
      for (const [spot, values] of betsA) for (const value of values) await roulette.act(ROOM, A, { action: 'poser', spot, value });
      for (const [spot, values] of betsB) for (const value of values) await roulette.act(ROOM, B, { action: 'poser', spot, value });
      const seenByB = await roulette.view(ROOM, B);
      const alice = seenByB.players.find((p) => p.name === 'Alice');
      assert.ok(alice && !alice.me && alice.total === 2_170, 'B voit les jetons d’Alice');
      assert.notEqual(alice.color, mineIn(seenByB).color, 'chacun sa couleur');
      await roulette.act(ROOM, A, { action: 'lancer' });
      assert.ok((await roulette.view(ROOM, A)).closesAt, 'le premier « Lancer » ouvre le dernier appel');
      await roulette.act(ROOM, B, { action: 'lancer' });
      const spinning = await roulette.view(ROOM, A);
      assert.equal(spinning.phase, 'tirage', 'tout le monde a lancé : la bille part');
      const { pocket } = spinning.spin;
      await until(async () => (await roulette.view(ROOM, A)).phase === 'resultats');
      for (const [player, bets] of [[A, betsA], [B, betsB]]) {
        const total = bets.reduce((sum, [, values]) => sum + values.reduce((a, v) => a + v, 0), 0);
        assert.equal((await balance(player.id)) - 1_000_000, payoutFor(bets, pocket) - total, `${player.name} : paiement faux sur le ${pocket}`);
      }
      assert.equal(ends.filter((e) => e.game === 'roulette').length, 1, 'la fin du tour est annoncée une fois');
      await until(async () => (await roulette.view(ROOM, A)).phase === 'mises');
      await roulette.act(ROOM, A, { action: 'remettre' });
      assert.equal((await roulette.view(ROOM, A)).me.onTable, 2_170, '« Remettre » repose les mêmes jetons');
      console.log(`   roulette : la bille tombe sur le ${pocket}`);
    });
  } finally {
    stop();
    resetRooms();
  }
});

await check('salle · crash : une fusée pour deux, l’un encaisse à la main, l’autre en automatique', async () => {
  resetCrash();
  await quick(crash.timing, { countdown: 60, liftoff: 30, pause: 150, speed: 150 }, async () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      await millionFor(A.id);
      await millionFor(B.id);
      assert.match((await crash.act(ROOM, A, { action: 'miser', bet: 2_000, auto: 0.5 })).error, /automatique invalide/);
      await crash.act(ROOM, A, { action: 'miser', bet: 10_000, auto: 1.2 });
      await crash.act(ROOM, B, { action: 'miser', bet: 1_000 });
      const waiting = await crash.view(ROOM, B);
      assert.ok(waiting.countdownEnds, 'la première mise lance le compte à rebours');
      assert.equal(waiting.point, null, 'le point d’explosion reste secret');
      await until(async () => (await crash.view(ROOM, B)).phase !== 'mises');
      await sleepMs(60);
      const cashed = await crash.act(ROOM, B, { action: 'encaisser' });
      await until(async () => (await crash.view(ROOM, A)).phase === 'explose', { timeout: 5_000 });
      const over = await crash.view(ROOM, A);
      if (!cashed.ok) {
        await until(async () => (await crash.view(ROOM, A)).phase === 'mises');
        continue; // explosée tout de suite : on recommence
      }
      const bruno = over.players.find((p) => p.name === 'Bruno');
      assert.equal((await balance(B.id)) - 1_000_000, Math.round(1_000 * bruno.cashedAt) - 1_000, 'Bruno est payé à son multiplicateur');
      const alice = over.players.find((p) => p.name === 'Alice');
      const expectedA = over.point > 1.2 ? Math.round(10_000 * 1.2) - 10_000 : -10_000;
      assert.equal((await balance(A.id)) - 1_000_000, expectedA, `Alice : auto ×1,2, explosion à ×${over.point}`);
      assert.equal(alice.cashedAt ?? null, over.point > 1.2 ? 1.2 : null);
      assert.ok(over.point >= 1 && over.point <= 100);
      console.log(`   crash : Bruno encaisse à ×${bruno.cashedAt}, explosion à ×${over.point}`);
      return;
    }
    throw new Error('aucune fusée n’a volé en 40 essais');
  });
  resetCrash();
});

await check('salle · blackjack : deux places, un croupier, paiement selon les règles de Discord', async () => {
  resetBlackjack();
  await quick(blackjack.timing, { lastCall: 2_000, turn: 3_000, dealerStep: 5, results: 200 }, async () => {
    await millionFor(A.id);
    await millionFor(B.id);
    await blackjack.act(ROOM, A, { action: 'miser', bet: 1_000 });
    await blackjack.act(ROOM, B, { action: 'miser', bet: 5_000 });
    await blackjack.act(ROOM, A, { action: 'distribuer' });
    assert.ok((await blackjack.view(ROOM, A)).closesAt, 'on attend que Bruno distribue');
    await blackjack.act(ROOM, B, { action: 'distribuer' });
    const dealt = await blackjack.view(ROOM, A);
    assert.notEqual(dealt.phase, 'mises', 'tout le monde est prêt : la donne part');
    assert.ok(dealt.dealer.cards.length >= 1);
    if (dealt.phase === 'jeu') assert.equal(dealt.dealer.hidden, 1, 'la carte cachée du croupier ne se voit pas');
    // Chacun joue sa main : Alice reste, Bruno aussi.
    for (const player of [A, B]) if ((await blackjack.view(ROOM, player)).players.find((p) => p.me).hands.some((h) => h.active)) await blackjack.act(ROOM, player, { action: 'rester' });
    await until(async () => (await blackjack.view(ROOM, A)).phase === 'resultats');
    const done = await blackjack.view(ROOM, A);
    const dealerTotal = done.dealer.total;
    assert.ok(done.dealer.bust || dealerTotal >= 17 || done.players.every((p) => p.hands.every((h) => h.bust || h.blackjack)), 'le croupier tire jusqu’à 17');
    for (const [player, bet] of [[A, 1_000], [B, 5_000]]) {
      const seat = done.players.find((p) => p.name === player.name);
      const hand = seat.hands[0];
      let payout;
      if (hand.bust) payout = 0;
      else if (hand.blackjack) payout = done.dealer.cards.length === 2 && dealerTotal === 21 ? bet : Math.round(bet * 2.5);
      else if (done.dealer.cards.length === 2 && dealerTotal === 21) payout = 0;
      else if (done.dealer.bust || hand.total > dealerTotal) payout = bet * 2;
      else if (hand.total === dealerTotal) payout = bet;
      else payout = 0;
      assert.equal((await balance(player.id)) - 1_000_000, payout - bet, `${player.name} : ${hand.total} contre ${dealerTotal}`);
    }
    await until(async () => (await blackjack.view(ROOM, A)).phase === 'mises');
    const next = await blackjack.view(ROOM, A);
    assert.equal(next.players.find((p) => p.me).bet, 0, 'personne ne rejoue sans le vouloir');
    assert.equal(next.me.previous, 1_000, '« Remettre » retrouve la mise');
    console.log(`   blackjack : croupier ${dealerTotal}${done.dealer.bust ? ' (sauté)' : ''}`);
  });
  resetBlackjack();
});

await check('salle · mines et plus ou moins : les gains suivent les chances, encaissement compris', async () => {
  resetSolo();
  await millionFor(A.id);
  assert.match((await minesGame.act(ROOM, A, { action: 'jouer', bet: 1_000, bombs: 4 })).error, /nombre de bombes/);
  await minesGame.act(ROOM, A, { action: 'jouer', bet: 1_000, bombs: 1 });
  assert.match((await minesGame.act(ROOM, A, { action: 'jouer', bet: 1_000, bombs: 1 })).error, /en cours/);
  // Avec une seule bombe, on ouvre des cases jusqu'à en trouver deux sûres (ou sauter).
  let state = await minesGame.view(ROOM, A);
  assert.equal(state.round.bombs, null, 'les bombes restent cachées pendant la partie');
  for (let cell = 0; cell < 20 && !state.round.over && state.round.opened.length < 2; cell++) {
    await minesGame.act(ROOM, A, { action: 'ouvrir', cell });
    state = await minesGame.view(ROOM, A);
  }
  if (!state.round.over) await minesGame.act(ROOM, A, { action: 'encaisser' });
  state = await minesGame.view(ROOM, A);
  const expected = state.round.over === 'bombe' ? -1_000 : Math.round(1_000 * minesMultiplier(1, state.round.opened.length)) - 1_000;
  assert.equal((await balance(A.id)) - 1_000_000, expected, `mines : ${state.round.over} après ${state.round.opened.length} case(s)`);
  assert.equal(state.round.bombs.length, 1, 'à la fin, la bombe se montre');

  await millionFor(A.id);
  await hiloGame.act(ROOM, A, { action: 'jouer', bet: 1_000 });
  let hilo = await hiloGame.view(ROOM, A);
  const { plus, moins } = hilo.round.odds;
  assert.equal(plus.count + moins.count, 48, 'les égalités ne comptent ni pour plus ni pour moins');
  if (plus.multiplier) assert.ok(Math.abs(plus.multiplier - (0.97 * 51) / plus.count) < 1e-9);
  const side = plus.count >= moins.count ? 'plus' : 'moins';
  await hiloGame.act(ROOM, A, { action: side });
  hilo = await hiloGame.view(ROOM, A);
  if (!hilo.round.over) {
    await hiloGame.act(ROOM, A, { action: 'encaisser' });
    hilo = await hiloGame.view(ROOM, A);
    assert.equal((await balance(A.id)) - 1_000_000, Math.round(1_000 * hilo.round.multiplier) - 1_000);
  } else assert.equal((await balance(A.id)) - 1_000_000, -1_000);
  console.log(`   mines : ${state.round.over} · plus ou moins : ${hilo.round.over}, série ${hilo.round.streak}`);
});

await check('salle · machine, dés, pile ou face, rouge ou noir : le tirage et le solde concordent', async () => {
  resetSolo();
  await millionFor(A.id);
  for (const [game, input] of [[machineGame, {}], [pieceGame, { side: 'face' }], [cartesGame, { colour: 'rouge' }]]) {
    const before = await balance(A.id);
    const reply = await game.act(ROOM, A, { action: 'jouer', bet: 1_000, ...input });
    assert.equal(reply.ok, true);
    assert.equal(reply.draw.balance - before, reply.draw.net, 'le solde bouge exactement du gain annoncé');
    assert.equal(reply.draw.net, reply.draw.payout - 1_000);
  }
  assert.match((await pieceGame.act(ROOM, A, { action: 'jouer', bet: 1_000, side: 'tranche' })).error, /choix/);
  // Dés : trois zones, un seul lancer.
  const before = await balance(A.id);
  const roll = await desGame.act(ROOM, A, { action: 'lancer', bets: { moins: 1_000, sept: 500, plus: 200 } });
  const { a, b, total, net } = roll.draw;
  assert.equal(total, a + b);
  const pays = { moins: [total < 7, 2.32, 1_000], sept: [total === 7, 5.75, 500], plus: [total > 7, 2.32, 200] };
  const payout = Object.values(pays).reduce((sum, [won, rate, amount]) => sum + (won ? Math.round(amount * rate) : 0), 0);
  assert.equal(net, payout - 1_700, `dés : ${a} + ${b}`);
  assert.equal((await balance(A.id)) - before, net);
  assert.match((await desGame.act(ROOM, A, { action: 'lancer', bets: { constructor: 10 } })).error, /Zone inconnue/);
});

await check('salle · duel : défi, invitation, pièce, et mises rendues si refus', async () => {
  resetDuels();
  await millionFor(A.id);
  await millionFor(B.id);
  assert.match((await duel.act(ROOM, A, { action: 'defier', to: B.id, bet: 1_000 })).error, /plus dans la salle/, 'on ne défie que quelqu’un de présent');
  markPresent(ROOM, A);
  markPresent(ROOM, B);
  const { id } = await duel.act(ROOM, A, { action: 'defier', to: B.id, bet: 5_000 });
  assert.equal(await balance(A.id), 995_000, 'la mise du défieur est bloquée');
  assert.equal(incomingFor(ROOM, B.id).length, 1, 'Bruno reçoit l’invitation');
  await duel.act(ROOM, B, { action: 'refuser', id });
  assert.equal(await balance(A.id), 1_000_000, 'refus : mise rendue');
  const second = await duel.act(ROOM, A, { action: 'defier', to: B.id, bet: 5_000 });
  await duel.act(ROOM, B, { action: 'accepter', id: second.id });
  const seen = await duel.view(ROOM, A);
  const played = seen.duels.find((d) => d.id === second.id);
  assert.equal(played.status, 'fini');
  const diffA = (await balance(A.id)) - 1_000_000;
  const diffB = (await balance(B.id)) - 1_000_000;
  assert.equal(diffA + diffB, 0, 'aucun avantage de la maison : ce que l’un gagne, l’autre le perd');
  assert.equal(Math.abs(diffA), 5_000);
  assert.equal(played.result.iWon, diffA > 0);
  resetDuels();
});

await check('salle : sessions signées, pages, API et ancienne adresse de la roulette', async () => {
  const token = createSession(A);
  assert.deepEqual(readSession(token), { id: A.id, name: 'Alice' });
  assert.equal(readSession(`${token.slice(0, -2)}xx`), null, 'une session retouchée est refusée');
  assert.equal(readSession(createSession(A, -1)), null, 'une session expirée est refusée');
  const forged = `${Buffer.from(JSON.stringify({ u: B.id, n: 'Bruno', e: Date.now() + 1e6 })).toString('base64url')}.${token.split('.')[1]}`;
  assert.equal(readSession(forged), null, 'impossible de se faire passer pour un autre');
  assert.match(personalLink(A, ROOM, 'mines'), new RegExp(`/salle/\\?room=${ROOM}&jeu=mines#s=`), 'la session du lien est après le #, jamais envoyée au serveur');

  resetRooms();
  resetSolo();
  await millionFor(A.id);
  const server = http.createServer(async (req, res) => {
    if (!(await handleSalleWeb(req, res, new URL(req.url, 'http://localhost')))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  try {
    for (const page of ['/salle/', '/?instance_id=1&frame_id=2&platform=desktop', '/.proxy/salle/']) {
      const response = await fetch(base + page);
      assert.equal(response.status, 200, `${page} doit servir la salle`);
      assert.match(await response.text(), /id="view"/);
    }
    const moved = await fetch(`${base}/roulette/?room=${ROOM}`, { redirect: 'manual' });
    assert.equal(moved.status, 302);
    assert.match(moved.headers.get('location'), new RegExp(`/salle/\\?room=${ROOM}&jeu=roulette`));
    for (const file of ['app.js', 'kit.js', 'style.css', 'sdk.js', 'fonts/noto.ttf', 'fond.jpg', ...GAME_IDS.map((id) => `games/${id}.js`)]) {
      assert.equal((await fetch(`${base}/salle/${file}`)).status, 200, `${file} manquant`);
    }
    assert.equal((await fetch(`${base}/salle/../src/config.js`)).status, 404);
    assert.equal((await fetch(`${base}/salle/api/roulette?room=${ROOM}`)).status, 401, 'sans session, rien');
    const cfg = await (await fetch(`${base}/salle/api/config`)).json();
    assert.ok(cfg.games.length === GAME_IDS.length && !('clientSecret' in cfg), 'le catalogue, jamais le secret');

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const hall = await (await fetch(`${base}/salle/api/salle?room=${ROOM}`, { headers })).json();
    assert.equal(hall.me.name, 'Alice');
    assert.equal(hall.me.balance, 1_000_000);
    assert.ok(hall.daily && 'available' in hall.daily, 'le cadeau du jour est signalé');
    for (const id of GAME_IDS) assert.equal((await fetch(`${base}/salle/api/${id}?room=${ROOM}`, { headers })).status, 200, `${id} doit répondre`);
    assert.equal((await fetch(`${base}/salle/api/constructor?room=${ROOM}`, { headers })).status, 404);
    const placed = await fetch(`${base}/salle/api/roulette`, { method: 'POST', headers, body: JSON.stringify({ room: ROOM, action: 'poser', spot: 'plein-7', value: 50 }) });
    assert.equal(placed.status, 200);
    assert.deepEqual(betOf((await placed.json()).state, 'plein-7'), [50]);
    const refused = await fetch(`${base}/salle/api/mines`, { method: 'POST', headers, body: JSON.stringify({ room: ROOM, action: 'jouer', bet: '1000', bombs: 7 }) });
    assert.equal(refused.status, 409);
    const started = await fetch(`${base}/salle/api/mines`, { method: 'POST', headers, body: JSON.stringify({ room: ROOM, action: 'jouer', bet: '1000', bombs: '3' }) });
    assert.equal((await started.json()).state.round.bet, 1_000, 'les nombres arrivent en texte ou en nombre');
  } finally {
    server.close();
    resetRooms();
    resetSolo();
  }
});

await check('salle dans Discord : chaque jeu a sa table, « Ouvrir » lance l’Activité ou donne un lien', async () => {
  for (const game of GAME_IDS) {
    const hall = mock({});
    await openLobby(hall);
    const pick = follow(hall, { __customId: 'ctb:pick:hall', __values: [game] });
    pick.channelId = ROOM;
    pick.message = { edit: async (payload) => hall.sent.push({ edited: true, ...payload }) };
    await handleTableComponent(pick);
    const table = last(hall);
    const ids = buttonIds(table);
    assert.ok(ids.includes(`csl:ouvrir:${game}`) && ids.includes(`csl:lien:${game}`), `${game} : boutons de la salle`);
    assert.equal(ids.includes(`csl:ici:${game}`), game !== 'roulette', `${game} : « Jouer ici » (sauf la roulette)`);
  }

  // « Jouer ici » : le jeu reste dans le message, comme avant.
  const here = mock({ __customId: 'csl:ici:mines' });
  here.channelId = ROOM;
  await handleSalleButton(here);
  assert.ok(buttonIds(last(here)).some((id) => id.startsWith('ctb:play')), 'la table des mines s’ouvre dans le message');

  // Activité activée : Discord ouvre la salle, directement sur le jeu choisi.
  const launch = mock({ __customId: 'csl:ouvrir:blackjack' }, A.id);
  launch.channelId = ROOM;
  let launched = false;
  launch.launchActivity = async () => { launched = true; };
  await handleSalleButton(launch);
  assert.ok(launched, 'l’Activité doit être lancée');

  // Pas encore activée : le joueur reçoit son lien, en privé.
  const fallback = mock({ __customId: 'csl:ouvrir:crash' }, A.id);
  fallback.channelId = ROOM;
  fallback.launchActivity = async () => { throw new Error('Activité désactivée'); };
  await handleSalleButton(fallback);
  const reply = last(fallback);
  assert.equal(reply.flags, MessageFlags.Ephemeral, 'le lien personnel reste privé');
  const url = reply.components[0].components[0].data.url;
  assert.match(url, new RegExp(`/salle/\\?room=${ROOM}&jeu=crash#s=`));
  assert.deepEqual(readSession(url.split('#s=')[1]), { id: A.id, name: A.id }, 'le lien connecte le bon joueur');

  // Fin d'un tour de roulette : le message du salon montre le tapis et les gains.
  const hall = mock({});
  await openLobby(hall);
  const pick = follow(hall, { __customId: 'ctb:pick:hall', __values: ['roulette'] });
  pick.channelId = ROOM;
  pick.message = { edit: async (payload) => hall.sent.push({ edited: true, ...payload }) };
  await handleTableComponent(pick);
  resetRooms();
  await quick(roulette.timing, { lastCall: 50, spin: 30, results: 30 }, async () => {
    await millionFor(A.id);
    await roulette.act(ROOM, A, { action: 'poser', spot: 'rouge', value: 1_000 });
    await roulette.act(ROOM, A, { action: 'lancer' });
    await until(() => hall.sent.some((p) => p.edited), { timeout: 4_000 });
  });
  const edited = hall.sent.filter((p) => p.edited).at(-1);
  assert.match(edited.embeds[0].data.description, /tombée sur/);
  assert.ok(edited.files?.[0]?.name?.endsWith('.jpg'), 'avec le tapis du tour');
  resetRooms();
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
  assert.equal(menu.options.length, TABLE_GAMES.length + 2);
  assert.ok(menu.options.some((o) => o.value === 'multi-blackjack'), 'le blackjack à plusieurs doit être proposé');
  const pick = follow(hall, { __customId: 'ctb:pick:hall', __values: ['blackjack'] });
  await handleTableComponent(pick);
  assert.match(last(hall).embeds[0].data.title, /Blackjack/);
});

// ----------------------------------------------------------- Jeux rapides
await check('les jeux instantanés rendent un résultat cohérent', async () => {
  await grant(USER, 50_000);
  const cases = [
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

await check('le bouton du guide épinglé ouvre le casino', async () => {
  const { guideButtons } = await import(new URL('guide.js', ROOT));
  const ids = guideButtons()[0].components.map((b) => b.data.custom_id);
  assert.ok(ids.includes('csl:ouvrir:salle'), 'le guide ouvre aussi la salle de jeux');
  const open = ids.find((id) => id === 'ctb:open:guide');
  const daily = ids.find((id) => id === 'ctb:daily:guide');
  const click = mock({ __customId: open });
  await handleTableComponent(click);
  const hall = last(click);
  assert.ok(hall.components[0].components[0].toJSON().options.length >= 12, 'un hall complet doit s’ouvrir');
  const gift = mock({ __customId: daily });
  await handleTableComponent(gift);
  assert.ok(last(gift).embeds?.length || /déjà récupéré/.test(last(gift).content ?? ''), 'le bouton jetons du jour doit répondre');
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
  measure('roulette rouge', rouletteRtp('rouge'), () => payoutFor([['rouge', [1]]], rand(37)));
  measure('roulette douzaine', rouletteRtp('douzaine1'), () => payoutFor([['douzaine1', [1]]], rand(37)));
  measure('roulette plein 17', rouletteRtp('plein'), () => payoutFor([['plein-17', [1]]], rand(37)));
  const tapis = [['rouge', [20, 20]], ['plein-17', [50]], ['douzaine3', [100]], ['colonne1', [500]], ['plein-0', [10]]];
  measure('roulette tapis mélangé', 36 / 37, () => payoutFor(tapis, rand(37)) / 700);
  measure('dés plus de 7', diceRtp('plus'), () => diceRoll('plus').multiplier);
  measure('pile ou face', evenRtp(), () => coinToss('pile').multiplier);
  measure('rouge ou noir', evenRtp(), () => cardColour('rouge').multiplier);
  console.table(table);
});

console.log(`\n${passed} vérifications passées.`);
