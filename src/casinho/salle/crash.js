// Le crash de la salle : une fusée par salon, pour tout le monde. On mise pendant le
// compte à rebours (qui démarre à la première mise), la fusée décolle, le
// multiplicateur grimpe, chacun encaisse quand il veut — ou tout seul, à la cible
// qu'il a choisie. Même loi que dans Discord : point de rupture 0,97 / (1 - u),
// plafonné à ×100, m(t) = e^(t / 6 s).
import { balance, rand, settle, stake } from '../economy.js';
import { accepted, announceRoundEnd, checkBet, freeColour, refuse, tableStore } from './common.js';

export const timing = {
  countdown: 10_000, // entre la première mise et le décollage
  liftoff: 1_200, // la fusée s'allume avant de monter
  pause: 5_000, // l'explosion reste affichée
  speed: 6_000, // m(t) = e^(t / speed)
};
const CAP = 100;
const EDGE = 0.97;
const HISTORY = 16;
export const AUTO_TARGETS = [1.5, 2, 3, 5, 10];

const flightTime = (m) => timing.speed * Math.log(Math.max(1, m));
const multiplierAt = (elapsed) => Math.floor(Math.exp(Math.max(0, elapsed) / timing.speed) * 100) / 100;
export const crashPoint = (u) => Math.min(CAP, Math.max(1, Math.floor((EDGE / (1 - u)) * 100) / 100));

const rooms = tableStore(
  (id) => ({ id, phase: 'mises', round: 0, version: 0, bets: new Map(), previous: new Map(), colours: new Map(), history: [], timers: [] }),
  { cleanup: (room) => room.timers.forEach(clearTimeout) },
);

const bump = (room) => {
  room.version += 1;
};
const later = (room, ms, fn) => {
  const timer = setTimeout(() => Promise.resolve().then(fn).catch((err) => console.warn('[casinho] crash :', err.message)), ms);
  timer.unref();
  room.timers.push(timer);
};
function clearTimers(room) {
  room.timers.forEach(clearTimeout);
  room.timers = [];
}

function colourOf(room, user) {
  if (!room.colours.has(user.id)) room.colours.set(user.id, freeColour([...room.colours.values()]));
  return room.colours.get(user.id);
}

// ------------------------------------------------------------------ Un tour
async function launch(room) {
  if (room.phase !== 'mises') return;
  clearTimers(room);
  room.countdownEnds = null;
  // Les mises sont prélevées au décollage ; qui n'a plus de quoi payer ne part pas.
  for (const [userId, entry] of room.bets) {
    if ((await stake(userId, entry.bet)) === null) room.bets.delete(userId);
  }
  if (!room.bets.size) {
    bump(room);
    return;
  }
  room.phase = 'vol';
  room.point = crashPoint(rand(1_000_000) / 1_000_000);
  room.start = Date.now() + timing.liftoff;
  room.round += 1;
  bump(room);
  later(room, timing.liftoff + flightTime(room.point), () => explode(room));
  for (const [userId, entry] of room.bets) {
    if (entry.auto && entry.auto < room.point) later(room, timing.liftoff + flightTime(entry.auto), () => cashOut(room, userId, entry.auto));
  }
}

async function cashOut(room, userId, multiplier) {
  const entry = room.bets.get(userId);
  if (room.phase !== 'vol' || !entry || entry.cashedAt) return;
  entry.cashedAt = multiplier;
  entry.payout = Math.round(entry.bet * multiplier);
  const { net } = await settle(userId, entry.payout, entry.bet);
  entry.net = net;
  bump(room);
}

async function explode(room) {
  if (room.phase !== 'vol') return;
  room.phase = 'explose';
  for (const [userId, entry] of room.bets) {
    if (entry.cashedAt) continue;
    const { net } = await settle(userId, 0, entry.bet);
    Object.assign(entry, { payout: 0, net });
  }
  room.history = [room.point, ...room.history].slice(0, HISTORY);
  bump(room);
  announceRoundEnd({
    game: 'crash',
    roomId: room.id,
    round: room.round,
    point: room.point,
    results: [...room.bets.values()].map(({ name, bet, cashedAt, net }) => ({ name, total: bet, cashedAt: cashedAt ?? null, net })),
  });
  later(room, timing.pause, () => nextRound(room));
}

function nextRound(room) {
  clearTimers(room);
  room.previous = new Map([...room.bets].map(([userId, entry]) => [userId, { bet: entry.bet, auto: entry.auto }]));
  room.bets = new Map();
  room.phase = 'mises';
  room.point = null;
  room.start = null;
  bump(room);
}

// ------------------------------------------------------------------ Les actions
export async function act(roomId, user, { action, bet, auto }) {
  const room = rooms.get(roomId);
  if (action === 'miser') {
    if (room.phase !== 'mises') return refuse('La fusée est partie : attends le prochain tour.');
    const refusal = await checkBet(user.id, bet);
    if (refusal) return refuse(refusal);
    if (auto !== null && auto !== undefined && !(Number.isFinite(auto) && auto >= 1.01 && auto <= CAP)) return refuse('Encaissement automatique invalide.');
    room.bets.set(user.id, { name: user.name, colour: colourOf(room, user), bet, auto: auto ? Math.floor(auto * 100) / 100 : null, cashedAt: null });
    // La première mise lance le compte à rebours.
    if (!room.countdownEnds) {
      room.countdownEnds = Date.now() + timing.countdown;
      later(room, timing.countdown, () => launch(room));
    }
    bump(room);
    return accepted();
  }
  if (action === 'retirer') {
    if (room.phase !== 'mises') return refuse('Trop tard : la fusée est partie.');
    room.bets.delete(user.id);
    if (!room.bets.size) {
      clearTimers(room);
      room.countdownEnds = null;
    }
    bump(room);
    return accepted();
  }
  if (action === 'encaisser') {
    const entry = room.bets.get(user.id);
    if (room.phase !== 'vol' || !entry) return refuse('Tu n’as pas de mise en vol.');
    if (entry.cashedAt) return refuse(`Déjà encaissé à ×${entry.cashedAt.toFixed(2)}.`);
    if (Date.now() < room.start) return refuse('La fusée n’a pas encore décollé.');
    const now = multiplierAt(Date.now() - room.start);
    if (now >= room.point) return refuse('💥 Trop tard, elle a explosé !');
    await cashOut(room, user.id, now);
    return accepted();
  }
  return refuse('Action inconnue.');
}

export async function view(roomId, user) {
  const room = rooms.get(roomId);
  const mine = room.bets.get(user.id) ?? null;
  return {
    phase: room.phase,
    version: room.version,
    round: room.round,
    now: Date.now(),
    start: room.start ?? null,
    countdownEnds: room.countdownEnds ?? null,
    point: room.phase === 'explose' ? room.point : null, // jamais révélé avant l'explosion
    history: room.history,
    autoTargets: AUTO_TARGETS,
    speed: timing.speed,
    me: { balance: await balance(user.id), bet: mine, previous: room.previous.get(user.id) ?? null, color: colourOf(room, user).color },
    players: [...room.bets.entries()].map(([userId, entry]) => ({
      me: userId === user.id,
      name: entry.name,
      color: entry.colour.color,
      bet: entry.bet,
      auto: entry.auto,
      cashedAt: entry.cashedAt,
      net: entry.net ?? null,
    })),
  };
}

export const activity = (roomId) => rooms.peek(roomId)?.bets.size ?? 0;
export const resetCrash = () => rooms.reset();
