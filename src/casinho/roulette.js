// La table de roulette du salon : un tapis par salon Discord, où chacun pose ses
// jetons en cliquant (page web ou Activité Discord : voir roulette-web.js).
// Ce fichier est le moteur — règles, jetons, tours, paiements. Il ne parle ni à
// Discord ni au navigateur.
//
// Un tour : on pose ses jetons (rien n'est prélevé), on appuie sur « Lancer ».
// Quand tous ceux qui ont misé ont lancé — ou 15 s après le premier —, la bille
// part : les mises sont prélevées, le numéro est tiré, chaque case est payée à
// part. La roue tourne à l'écran, les gains restent affichés, puis tour suivant.
import { config } from '../config.js';
import { balance, rand, settle, stake } from './economy.js';
import { ROULETTE_BETS } from './games.js';
import { CHIPS, PLAYER_COLORS } from './render/tapis.js';

/** Durées d'un tour (modifiables par les tests). */
export const timing = {
  lastCall: 15_000, // après le premier « Lancer », les autres ont 15 s
  spin: 7_000, // la roue tourne à l'écran
  results: 8_000, // les gains restent affichés sur le tapis
};
const IDLE_MS = 30 * 60_000; // une table sans visite disparaît
const AWAY_MS = 2 * 60_000; // un joueur sans jeton qui ne regarde plus quitte la table
const MAX_CHIPS = 60; // jetons par joueur et par tour
const MAX_PLAYERS = 10;
const HISTORY = 14;

// ------------------------------------------------------------------ Les règles
const OUTSIDE = Object.keys(ROULETTE_BETS).filter((key) => key !== 'plein');
export const CHIP_VALUES = CHIPS.map((chip) => chip.value);

/** Ce que paie une case du tapis (mise comprise), et les numéros qui la font gagner. */
export function spotRule(spot) {
  if (typeof spot !== 'string') return null;
  if (spot.startsWith('plein-')) {
    const n = Number(spot.slice(6));
    if (!Number.isInteger(n) || n < 0 || n > 36 || spot !== `plein-${n}`) return null;
    return { label: `n° ${n}`, pays: 36, wins: (pocket) => pocket === n };
  }
  if (!OUTSIDE.includes(spot)) return null;
  const rule = ROULETTE_BETS[spot];
  return { label: rule.label, pays: rule.pays, wins: rule.wins };
}

/** Toutes les cases qui gagnent sur ce numéro (elles s'allument sur le tapis). */
export const winningSpots = (pocket) => new Set([...OUTSIDE.filter((key) => ROULETTE_BETS[key].wins(pocket)), `plein-${pocket}`]);

const sum = (values) => values.reduce((total, value) => total + value, 0);
export const totalOf = (player) => [...player.bets.values()].reduce((total, values) => total + sum(values), 0);

/** Ce que rendent des jetons sur ce numéro : chaque case gagnante, mise × gain. */
export function payoutFor(bets, pocket) {
  let payout = 0;
  for (const [spot, values] of bets) {
    const rule = spotRule(spot);
    if (rule?.wins(pocket)) payout += sum(values) * rule.pays;
  }
  return payout;
}

// ------------------------------------------------------------------- Les tables
const rooms = new Map();
const roundEndListeners = new Set();

/** Prévient (par exemple le message Discord du salon) à la fin de chaque tour. */
export function onRoundEnd(listener) {
  roundEndListeners.add(listener);
  return () => roundEndListeners.delete(listener);
}

export const isRoomId = (id) => typeof id === 'string' && /^[0-9]{5,25}$/.test(id);

function roomFor(id) {
  let room = rooms.get(id);
  if (!room) {
    room = { id, phase: 'mises', round: 0, version: 0, players: new Map(), history: [], spin: null, closesAt: null, timer: null };
    rooms.set(id, room);
  }
  room.touched = Date.now();
  clearTimeout(room.idle);
  room.idle = setTimeout(() => {
    clearTimeout(room.timer);
    rooms.delete(id);
  }, IDLE_MS).unref();
  return room;
}

const bump = (room) => {
  room.version += 1;
};

function playerFor(room, user) {
  let player = room.players.get(user.id);
  if (!player) {
    // Chacun sa couleur de jetons : la première qui n'est pas prise.
    const taken = new Set([...room.players.values()].map((other) => other.colour));
    const colour = PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[room.players.size % PLAYER_COLORS.length];
    player = { userId: user.id, name: user.name, colour, bets: new Map(), order: [], ready: false, previous: null, result: null };
    room.players.set(user.id, player);
    bump(room);
  }
  player.name = user.name || player.name;
  player.seen = Date.now();
  return player;
}

const staked = (room) => [...room.players.values()].filter((player) => player.order.length);

/** Quitte la table ceux qui n'ont plus de jeton et ne regardent plus. */
function sweep(room) {
  const now = Date.now();
  for (const [id, player] of room.players) {
    if (!player.order.length && now - (player.seen ?? 0) > AWAY_MS) {
      room.players.delete(id);
      bump(room);
    }
  }
}

// ------------------------------------------------------------------- Les actions
const refuse = (error) => ({ ok: false, error });

/** Vérifie qu'un ensemble de jetons reste dans les règles. Renvoie le refus, ou null. */
async function check(player, { total, count, perSpot }) {
  if (count > MAX_CHIPS) return `Pas plus de ${MAX_CHIPS} jetons par tour : prends de plus gros jetons.`;
  if (perSpot.some((value) => value > config.casinho.maxBet)) {
    return `Mise maximum par case : ${config.casinho.maxBet.toLocaleString('fr-FR')} jetons.`;
  }
  const available = await balance(player.userId);
  if (total > available) {
    return `Il te reste ${Math.max(0, available - totalOf(player)).toLocaleString('fr-FR')} jetons à poser. Prends un plus petit jeton, ou passe par /quotidien.`;
  }
  return null;
}

/** Après chaque changement : si tous ceux qui ont misé ont lancé, la bille part. */
function settleCountdown(room) {
  const players = staked(room);
  if (!players.length) {
    clearTimeout(room.timer);
    room.closesAt = null;
    return;
  }
  if (room.closesAt && players.every((player) => player.ready)) spin(room).catch((err) => console.warn('[casinho] roulette :', err.message));
}

/**
 * Une action d'un joueur sur la table d'un salon.
 * @param {string} roomId  le salon
 * @param {{ id: string, name: string }} user
 * @param {{ action: string, spot?: string, value?: number }} input
 */
export async function act(roomId, user, { action, spot, value } = {}) {
  if (!isRoomId(roomId)) return refuse('Table inconnue.');
  const room = roomFor(roomId);
  if (room.phase !== 'mises') return refuse('Rien ne va plus : attends le tour suivant.');
  const existing = room.players.get(user.id);
  if (!existing?.order.length && staked(room).length >= MAX_PLAYERS && ['poser', 'remettre'].includes(action)) {
    return refuse(`La table est complète (${MAX_PLAYERS} joueurs).`);
  }
  const player = playerFor(room, user);

  if (action === 'poser') {
    if (!spotRule(spot)) return refuse('Case inconnue.');
    if (!CHIP_VALUES.includes(value)) return refuse('Jeton inconnu.');
    const onSpot = sum(player.bets.get(spot) ?? []) + value;
    const refusal = await check(player, { total: totalOf(player) + value, count: player.order.length + 1, perSpot: [onSpot] });
    if (refusal) return refuse(refusal);
    if (room.phase !== 'mises') return refuse('Rien ne va plus : attends le tour suivant.');
    if (!player.bets.has(spot)) player.bets.set(spot, []);
    player.bets.get(spot).push(value);
    player.order.push(spot);
  } else if (action === 'retirer') {
    // Retire le dernier jeton posé sur cette case (clic droit sur le tapis).
    const values = player.bets.get(spot);
    if (!values?.length) return refuse('Aucun de tes jetons sur cette case.');
    values.pop();
    if (!values.length) player.bets.delete(spot);
    player.order.splice(player.order.lastIndexOf(spot), 1);
  } else if (action === 'annuler') {
    if (!player.order.length) return refuse('Aucun jeton à retirer.');
    const last = player.order.pop();
    const values = player.bets.get(last);
    values.pop();
    if (!values.length) player.bets.delete(last);
  } else if (action === 'effacer') {
    player.bets = new Map();
    player.order = [];
  } else if (action === 'doubler') {
    if (!player.order.length) return refuse('Pose d’abord des jetons.');
    const refusal = await check(player, {
      total: totalOf(player) * 2,
      count: player.order.length * 2,
      perSpot: [...player.bets.values()].map((values) => sum(values) * 2),
    });
    if (refusal) return refuse(refusal);
    if (room.phase !== 'mises') return refuse('Rien ne va plus : attends le tour suivant.');
    for (const [key, values] of player.bets) player.bets.set(key, [...values, ...values]);
    player.order = [...player.order, ...player.order];
  } else if (action === 'remettre') {
    if (!player.previous?.length) return refuse('Pas encore de mise précédente à cette table.');
    const bets = player.previous.map(([key, values]) => [key, [...values]]);
    const refusal = await check(player, {
      total: sum(bets.map(([, values]) => sum(values))),
      count: sum(bets.map(([, values]) => values.length)),
      perSpot: bets.map(([, values]) => sum(values)),
    });
    if (refusal) return refuse(refusal);
    if (room.phase !== 'mises') return refuse('Rien ne va plus : attends le tour suivant.');
    player.bets = new Map(bets);
    player.order = bets.flatMap(([key, values]) => values.map(() => key));
  } else if (action === 'lancer') {
    if (!player.order.length) return refuse('Pose au moins un jeton sur le tapis.');
    player.ready = true;
    bump(room);
    const everyone = staked(room);
    if (everyone.every((other) => other.ready)) {
      await spin(room);
      return { ok: true };
    }
    // Les autres ont encore un peu de temps pour finir de miser.
    if (!room.closesAt) {
      room.closesAt = Date.now() + timing.lastCall;
      clearTimeout(room.timer);
      room.timer = setTimeout(() => spin(room).catch((err) => console.warn('[casinho] roulette :', err.message)), timing.lastCall).unref();
    }
    return { ok: true };
  } else {
    return refuse('Action inconnue.');
  }

  // Changer ses jetons, c'est revenir sur son « Lancer ».
  if (action !== 'lancer') player.ready = false;
  bump(room);
  settleCountdown(room);
  return { ok: true };
}

// ------------------------------------------------------------------ Le tirage
async function spin(room) {
  if (room.phase !== 'mises') return;
  clearTimeout(room.timer);
  room.closesAt = null;
  const players = staked(room);
  if (!players.length) return;
  room.phase = 'tirage';
  bump(room);

  // Rien ne va plus : chaque joueur paie ses jetons maintenant.
  const pocket = rand(37);
  const results = [];
  for (const player of players) {
    const total = totalOf(player);
    if ((await stake(player.userId, total)) === null) {
      // Son solde a fondu ailleurs entre-temps : ses jetons lui sont rendus.
      player.result = { dropped: true, total, payout: 0, net: 0 };
      results.push({ player, ...player.result });
      continue;
    }
    const payout = payoutFor(player.bets, pocket);
    const { net, balance: after } = await settle(player.userId, payout, total);
    player.result = { total, payout, net, balance: after };
    results.push({ player, ...player.result });
  }

  room.spin = { pocket, startedAt: Date.now(), winning: [...winningSpots(pocket)] };
  room.history = [pocket, ...room.history].slice(0, HISTORY);
  room.round += 1;
  bump(room);

  // La roue tourne à l'écran, puis les gains restent affichés, puis tour suivant.
  room.timer = setTimeout(() => {
    room.phase = 'resultats';
    bump(room);
    const summary = { roomId: room.id, pocket, round: room.round, results: results.map(({ player, ...rest }) => ({ ...rest, name: player.name, userId: player.userId, colour: player.colour, bets: [...player.bets].map(([key, values]) => [key, [...values]]) })) };
    for (const listener of roundEndListeners) Promise.resolve(listener(summary)).catch((err) => console.warn('[casinho] roulette (fin de tour) :', err.message));
    room.timer = setTimeout(() => nextRound(room), timing.results).unref();
  }, timing.spin).unref();
}

function nextRound(room) {
  for (const player of room.players.values()) {
    if (player.order.length && !player.result?.dropped) player.previous = [...player.bets].map(([key, values]) => [key, [...values]]);
    player.bets = new Map();
    player.order = [];
    player.ready = false;
  }
  room.phase = 'mises';
  room.spin = null;
  sweep(room);
  bump(room);
}

// ------------------------------------------------------------------ Ce qu'on voit
/** L'état de la table tel que le voit `user` (qui s'assoit en regardant). */
export async function view(roomId, user) {
  if (!isRoomId(roomId)) return null;
  const room = roomFor(roomId);
  const me = playerFor(room, user);
  const mine = await balance(user.id);
  const now = Date.now();
  return {
    room: room.id,
    version: room.version,
    now,
    phase: room.phase,
    round: room.round,
    closesAt: room.closesAt,
    spin: room.spin ? { ...room.spin, elapsed: now - room.spin.startedAt, duration: timing.spin } : null,
    history: room.history,
    chips: CHIPS.map(({ value, color, ink }) => ({ value, color, ink })),
    limits: { maxBet: config.casinho.maxBet, maxChips: MAX_CHIPS },
    me: {
      id: me.userId,
      name: me.name,
      color: me.colour.color,
      balance: mine,
      onTable: totalOf(me),
      canRebet: Boolean(me.previous?.length) && !me.order.length,
    },
    players: [...room.players.values()]
      .filter((player) => player.order.length || player.userId === me.userId || (room.phase !== 'mises' && player.result))
      .map((player) => ({
        id: player.userId,
        me: player.userId === me.userId,
        name: player.name,
        color: player.colour.color,
        ink: player.colour.ink,
        total: totalOf(player),
        ready: player.ready,
        bets: [...player.bets].map(([key, values]) => [key, values]),
        result: room.phase === 'resultats' ? player.result : null,
      })),
  };
}

export const openRooms = () => rooms.size;
/** Pour les tests : oublie toutes les tables. */
export function resetRooms() {
  for (const room of rooms.values()) {
    clearTimeout(room.timer);
    clearTimeout(room.idle);
  }
  rooms.clear();
}
