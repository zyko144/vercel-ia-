// Le blackjack de la salle : une table par salon, cinq places, un seul croupier.
// On pose sa mise sur sa place, on appuie sur « Distribuer » ; la donne part quand
// toute la table est prête (ou 15 s après le premier). Chacun joue ses mains en
// même temps que les autres, puis le croupier retourne sa carte et tire.
// Mêmes règles que dans Discord (blackjack.js) : sabot de 6 jeux, le croupier reste
// sur 17, blackjack payé 3:2, doubler sur deux cartes, une séparation (as : une carte).
import { canSplit, handValue, isBlackjack, shoe } from '../cards.js';
import { balance, settle, stake } from '../economy.js';
import { accepted, announceRoundEnd, checkBet, freeColour, refuse, tableStore } from './common.js';

export const timing = {
  lastCall: 15_000, // après le premier « Distribuer »
  turn: 40_000, // temps de jeu : ensuite, les mains restantes restent
  dealerStep: 900, // le croupier tire carte par carte
  results: 7_000, // les résultats restent affichés
};
const SEATS = 5;
const AWAY_MS = 2 * 60_000;

const rooms = tableStore(
  (id) => ({ id, phase: 'mises', round: 0, version: 0, seats: new Map(), dealer: [], revealed: false, deck: [], timers: [] }),
  { cleanup: (room) => room.timers.forEach(clearTimeout) },
);

const bump = (room) => {
  room.version += 1;
};
function later(room, ms, fn) {
  const timer = setTimeout(() => Promise.resolve().then(fn).catch((err) => console.warn('[casinho] blackjack :', err.message)), ms);
  timer.unref();
  room.timers.push(timer);
}
function clearTimers(room) {
  room.timers.forEach(clearTimeout);
  room.timers = [];
}

const hand = (cards, bet) => ({ cards, bet, done: false, doubled: false, fromSplit: false, blackjack: isBlackjack(cards) });
const playing = (room) => [...room.seats.values()].filter((seat) => seat.hands.length);
const activeHand = (seat) => seat.hands.find((entry) => !entry.done) ?? null;

function seatFor(room, user) {
  let seat = room.seats.get(user.id);
  if (!seat) {
    const colour = freeColour([...room.seats.values()].map((other) => other.colour));
    seat = { userId: user.id, name: user.name, colour, bet: 0, ready: false, hands: [], result: null, previous: 0 };
    room.seats.set(user.id, seat);
  }
  seat.name = user.name || seat.name;
  seat.seen = Date.now();
  return seat;
}

// ------------------------------------------------------------------ La donne
async function deal(room) {
  if (room.phase !== 'mises') return;
  clearTimers(room);
  room.closesAt = null;
  const players = [...room.seats.values()].filter((seat) => seat.bet > 0);
  for (const seat of players) {
    if ((await stake(seat.userId, seat.bet)) === null) {
      seat.bet = 0;
      seat.ready = false;
    }
  }
  const seated = players.filter((seat) => seat.bet > 0);
  if (!seated.length) {
    bump(room);
    return;
  }
  room.deck = shoe(6);
  room.round += 1;
  room.phase = 'jeu';
  room.revealed = false;
  for (const seat of seated) {
    seat.hands = [hand([room.deck.pop(), room.deck.pop()], seat.bet)];
    seat.result = null;
    if (seat.hands[0].blackjack) seat.hands[0].done = true;
  }
  room.dealer = [room.deck.pop(), room.deck.pop()];
  room.deadline = Date.now() + timing.turn;
  bump(room);
  // Blackjack du croupier : il se retourne tout de suite, la manche est jouée.
  if (isBlackjack(room.dealer)) {
    for (const seat of seated) seat.hands.forEach((entry) => { entry.done = true; });
  } else {
    later(room, timing.turn, () => {
      for (const seat of playing(room)) seat.hands.forEach((entry) => { entry.done = true; });
      return dealerPlays(room);
    });
  }
  maybeDealer(room);
}

/**
 * Toutes les mains sont jouées : au croupier. Il joue à son rythme (une carte
 * toutes les 0,9 s) ; la réponse au dernier clic n'attend pas la fin de son jeu.
 */
function maybeDealer(room) {
  if (room.phase === 'jeu' && playing(room).every((seat) => !activeHand(seat))) {
    dealerPlays(room).catch((err) => console.warn('[casinho] blackjack :', err.message));
  }
}

async function dealerPlays(room) {
  if (room.phase !== 'jeu') return;
  clearTimers(room);
  room.phase = 'croupier';
  room.revealed = true;
  bump(room);
  // Le croupier ne tire que si une main peut encore gagner contre lui.
  const alive = playing(room).some((seat) => seat.hands.some((entry) => !handValue(entry.cards).bust && !(entry.blackjack && !entry.fromSplit)));
  if (alive && !isBlackjack(room.dealer)) {
    while (handValue(room.dealer).total < 17) {
      await new Promise((resolve) => later(room, timing.dealerStep, resolve));
      room.dealer.push(room.deck.pop());
      bump(room);
    }
  }
  await new Promise((resolve) => later(room, timing.dealerStep, resolve));
  await settleRound(room);
}

/** Même verdict que dans Discord (blackjack.js). */
function outcomeOf(entry, dealer) {
  if (handValue(entry.cards).bust) return { payout: 0, label: 'sautée' };
  if (entry.blackjack && !entry.fromSplit) {
    if (isBlackjack(dealer)) return { payout: entry.bet, label: 'égalité' };
    return { payout: Math.round(entry.bet * 2.5), label: 'blackjack !' };
  }
  const player = handValue(entry.cards).total;
  const house = handValue(dealer);
  if (house.bust) return { payout: entry.bet * 2, label: 'gagnée' };
  if (isBlackjack(dealer)) return { payout: 0, label: 'perdue' };
  if (player > house.total) return { payout: entry.bet * 2, label: 'gagnée' };
  if (player === house.total) return { payout: entry.bet, label: 'égalité' };
  return { payout: 0, label: 'perdue' };
}

async function settleRound(room) {
  const results = [];
  for (const seat of playing(room)) {
    const outcomes = seat.hands.map((entry) => outcomeOf(entry, room.dealer));
    const payout = outcomes.reduce((sum, outcome) => sum + outcome.payout, 0);
    const wagered = seat.hands.reduce((sum, entry) => sum + entry.bet, 0);
    const { net } = await settle(seat.userId, payout, wagered);
    seat.result = { payout, net, labels: outcomes.map((outcome) => outcome.label), wagered };
    results.push({ name: seat.name, total: wagered, net, labels: seat.result.labels });
  }
  room.phase = 'resultats';
  bump(room);
  announceRoundEnd({ game: 'blackjack', roomId: room.id, round: room.round, dealer: handValue(room.dealer).total, dealerBust: handValue(room.dealer).bust, results });
  later(room, timing.results, () => nextRound(room));
}

function nextRound(room) {
  clearTimers(room);
  const now = Date.now();
  for (const [id, seat] of room.seats) {
    seat.previous = seat.hands.length ? seat.hands[0].bet / (seat.hands[0].doubled ? 2 : 1) : seat.previous;
    seat.hands = [];
    seat.bet = 0; // personne ne rejoue sans le vouloir
    seat.ready = false;
    if (now - (seat.seen ?? 0) > AWAY_MS) room.seats.delete(id);
  }
  room.dealer = [];
  room.revealed = false;
  room.phase = 'mises';
  bump(room);
}

// ------------------------------------------------------------------ Les actions
export async function act(roomId, user, { action, bet }) {
  const room = rooms.get(roomId);

  if (['miser', 'quitter', 'distribuer', 'remettre'].includes(action)) {
    if (room.phase !== 'mises') return refuse('Une donne est en cours : attends la suivante.');
    if (!room.seats.has(user.id) && room.seats.size >= SEATS) return refuse(`La table est complète (${SEATS} places).`);
    const seat = seatFor(room, user);
    if (action === 'quitter') {
      room.seats.delete(user.id);
    } else if (action === 'miser' || action === 'remettre') {
      const amount = action === 'remettre' ? seat.previous : bet;
      if (!amount) return refuse('Pas encore de mise précédente.');
      const refusal = await checkBet(user.id, amount);
      if (refusal) return refuse(refusal);
      seat.bet = amount;
      seat.ready = false;
    } else {
      if (!seat.bet) return refuse('Pose d’abord ta mise sur ta place.');
      seat.ready = true;
      const waiting = [...room.seats.values()].filter((other) => other.bet > 0);
      if (waiting.every((other) => other.ready)) {
        bump(room);
        await deal(room);
        return accepted();
      }
      if (!room.closesAt) {
        room.closesAt = Date.now() + timing.lastCall;
        later(room, timing.lastCall, () => deal(room));
      }
    }
    bump(room);
    return accepted();
  }

  // Le jeu : ses propres mains, dans l'ordre.
  if (room.phase !== 'jeu') return refuse('Ce n’est pas le moment de jouer.');
  const seat = room.seats.get(user.id);
  const entry = seat ? activeHand(seat) : null;
  if (!entry) return refuse('Tu n’as pas de main à jouer.');
  seat.seen = Date.now();

  if (action === 'tirer') {
    entry.cards.push(room.deck.pop());
    const { total, bust } = handValue(entry.cards);
    if (bust || total === 21) entry.done = true;
  } else if (action === 'rester') {
    entry.done = true;
  } else if (action === 'doubler') {
    if (entry.cards.length !== 2 || entry.doubled) return refuse('On ne double que sur deux cartes.');
    if ((await stake(user.id, entry.bet)) === null) return refuse('Ton solde ne suffit pas pour doubler.');
    entry.bet *= 2;
    entry.doubled = true;
    entry.cards.push(room.deck.pop());
    entry.done = true;
  } else if (action === 'separer') {
    if (seat.hands.length > 1 || !canSplit(entry.cards)) return refuse('Cette main ne peut pas être séparée.');
    if ((await stake(user.id, entry.bet)) === null) return refuse('Ton solde ne suffit pas pour séparer.');
    const moved = entry.cards.pop();
    const second = hand([moved, room.deck.pop()], entry.bet);
    entry.cards.push(room.deck.pop());
    entry.fromSplit = true;
    second.fromSplit = true;
    entry.blackjack = false;
    second.blackjack = false;
    seat.hands.push(second);
    // Deux as séparés reçoivent une seule carte chacun.
    if (moved.rank === 'A') {
      entry.done = true;
      second.done = true;
    }
  } else {
    return refuse('Action inconnue.');
  }
  bump(room);
  maybeDealer(room);
  return accepted();
}

const cardOf = (c) => ({ rank: c.rank, suit: c.suit });

export async function view(roomId, user) {
  const room = rooms.get(roomId);
  const mine = room.seats.get(user.id);
  if (mine) mine.seen = Date.now();
  const dealerShown = room.revealed ? room.dealer : room.dealer.slice(0, 1);
  const myHand = mine ? activeHand(mine) : null;
  return {
    phase: room.phase,
    version: room.version,
    round: room.round,
    now: Date.now(),
    closesAt: room.closesAt ?? null,
    deadline: room.phase === 'jeu' ? room.deadline : null,
    seats: SEATS,
    dealer: {
      cards: dealerShown.map(cardOf),
      hidden: room.dealer.length - dealerShown.length,
      total: dealerShown.length ? handValue(dealerShown).total : null,
      bust: room.revealed && handValue(room.dealer).bust,
    },
    players: [...room.seats.values()].map((seat) => ({
      me: seat.userId === user.id,
      name: seat.name,
      color: seat.colour.color,
      bet: seat.bet,
      ready: seat.ready,
      hands: seat.hands.map((entry) => ({
        cards: entry.cards.map(cardOf),
        bet: entry.bet,
        ...handValue(entry.cards),
        done: entry.done,
        doubled: entry.doubled,
        blackjack: entry.blackjack && !entry.fromSplit,
        active: entry === activeHand(seat) && room.phase === 'jeu',
      })),
      result: room.phase === 'resultats' ? seat.result : null,
    })),
    me: {
      balance: await balance(user.id),
      seated: Boolean(mine),
      previous: mine?.previous ?? 0,
      canDouble: Boolean(myHand && myHand.cards.length === 2 && !myHand.doubled),
      canSplit: Boolean(myHand && mine.hands.length === 1 && canSplit(myHand.cards)),
    },
  };
}

export const activity = (roomId) => rooms.peek(roomId)?.seats.size ?? 0;
export const resetBlackjack = () => rooms.reset();
