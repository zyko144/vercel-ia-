// Les jeux de la salle qu'on joue seul : mines, plus ou moins, machine à sous,
// dés, pile ou face, rouge ou noir. Mêmes règles et mêmes gains que dans Discord
// (games.js, live.js) : seul l'affichage change, on clique au lieu de choisir.
import { highValue, shoe } from '../cards.js';
import { balance, rand, settle, stake } from '../economy.js';
import { DICE_BETS, diceRtp, resolveInstant, slotPaytable } from '../games.js';
import { MINES_TOTAL, minesMultiplier } from '../live.js';
import { accepted, checkBet, refuse } from './common.js';

const EDGE = 0.97;
const IDLE_MS = 5 * 60_000; // une partie abandonnée est encaissée d'office (les gains ne se perdent pas)
const card = (c) => (c ? { rank: c.rank, suit: c.suit } : null);

/** Une partie en cours par joueur et par jeu, encaissée d'office si on l'abandonne. */
function sessions(onAbandon) {
  const rounds = new Map();
  return {
    get: (userId) => rounds.get(userId) ?? null,
    set(userId, round) {
      rounds.set(userId, round);
      this.touch(userId);
    },
    touch(userId) {
      const round = rounds.get(userId);
      if (!round) return;
      clearTimeout(round.timer);
      round.timer = setTimeout(() => {
        if (!round.over) onAbandon(round).catch((err) => console.warn('[casinho] salle :', err.message));
      }, IDLE_MS).unref();
    },
    reset() {
      for (const round of rounds.values()) clearTimeout(round.timer);
      rounds.clear();
    },
  };
}

// ---------------------------------------------------------------------- Mines
const BOMB_CHOICES = [1, 2, 3, 5, 10];

const mines = sessions((round) => cashMines(round));

async function cashMines(round) {
  const multiplier = minesMultiplier(round.bombCount, round.opened.length);
  const payout = Math.round(round.bet * multiplier);
  const { net, balance: after } = await settle(round.userId, payout, round.bet);
  Object.assign(round, { over: 'encaisse', payout, net, balance: after });
}

export const minesGame = {
  async view(roomId, user) {
    const round = mines.get(user.id);
    const base = { me: { balance: await balance(user.id) }, bombChoices: BOMB_CHOICES, cells: MINES_TOTAL };
    if (!round) return { ...base, round: null };
    const picks = round.opened.length;
    const safe = MINES_TOTAL - round.bombCount;
    return {
      ...base,
      round: {
        bet: round.bet,
        bombCount: round.bombCount,
        opened: round.opened,
        multiplier: minesMultiplier(round.bombCount, picks),
        next: picks < safe ? minesMultiplier(round.bombCount, picks + 1) : null,
        survival: picks < safe ? (safe - picks) / (MINES_TOTAL - picks) : 0,
        over: round.over ?? null,
        hit: round.hit ?? null,
        bombs: round.over ? [...round.bombs] : null, // les bombes ne se montrent qu'à la fin
        payout: round.payout ?? null,
        net: round.net ?? null,
      },
    };
  },
  async act(roomId, user, { action, bet, bombs, cell }) {
    const round = mines.get(user.id);
    if (action === 'jouer') {
      if (round && !round.over) return refuse('Termine d’abord ta partie en cours.');
      if (!BOMB_CHOICES.includes(bombs)) return refuse('Choisis le nombre de bombes.');
      const refusal = await checkBet(user.id, bet);
      if (refusal) return refuse(refusal);
      if ((await stake(user.id, bet)) === null) return refuse('Solde insuffisant.');
      const positions = new Set();
      while (positions.size < bombs) positions.add(rand(MINES_TOTAL));
      mines.set(user.id, { userId: user.id, bet, bombCount: bombs, bombs: positions, opened: [], over: null });
      return accepted();
    }
    if (!round || round.over) return refuse('Lance d’abord une partie.');
    mines.touch(user.id);
    if (action === 'ouvrir') {
      if (!Number.isInteger(cell) || cell < 0 || cell >= MINES_TOTAL) return refuse('Case inconnue.');
      if (round.opened.includes(cell)) return accepted();
      if (round.bombs.has(cell)) {
        const { net, balance: after } = await settle(user.id, 0, round.bet);
        Object.assign(round, { over: 'bombe', hit: cell, payout: 0, net, balance: after });
        return accepted();
      }
      round.opened.push(cell);
      // Toutes les cases sûres trouvées : la partie s'arrête au gain maximum.
      if (round.opened.length === MINES_TOTAL - round.bombCount) await cashMines(round);
      return accepted();
    }
    if (action === 'encaisser') {
      await cashMines(round);
      return accepted();
    }
    return refuse('Action inconnue.');
  },
};

// -------------------------------------------------------------- Plus ou moins
// À chaque carte, le multiplicateur vaut 0,97 × 51 / (cartes qui font gagner) ;
// l'égalité est perdante, comme dans Discord.
const hilo = sessions((round) => cashHilo(round));

function odds(c) {
  const value = highValue(c);
  const higher = (14 - value) * 4;
  const lower = (value - 2) * 4;
  return {
    plus: { count: higher, multiplier: higher ? (EDGE * 51) / higher : null },
    moins: { count: lower, multiplier: lower ? (EDGE * 51) / lower : null },
  };
}

async function cashHilo(round) {
  const payout = Math.round(round.bet * round.multiplier);
  const { net, balance: after } = await settle(round.userId, payout, round.bet);
  Object.assign(round, { over: 'encaisse', payout, net, balance: after });
}

export const hiloGame = {
  async view(roomId, user) {
    const round = hilo.get(user.id);
    const base = { me: { balance: await balance(user.id) } };
    if (!round) return { ...base, round: null };
    return {
      ...base,
      round: {
        bet: round.bet,
        card: card(round.card),
        history: round.history.map(card),
        multiplier: round.multiplier,
        streak: round.streak,
        odds: round.over ? null : odds(round.card),
        over: round.over ?? null,
        payout: round.payout ?? null,
        net: round.net ?? null,
      },
    };
  },
  async act(roomId, user, { action, bet }) {
    const round = hilo.get(user.id);
    if (action === 'jouer') {
      if (round && !round.over) return refuse('Termine d’abord ta partie en cours.');
      const refusal = await checkBet(user.id, bet);
      if (refusal) return refuse(refusal);
      if ((await stake(user.id, bet)) === null) return refuse('Solde insuffisant.');
      const deck = shoe(1);
      hilo.set(user.id, { userId: user.id, bet, deck, card: deck.pop(), history: [], multiplier: 1, streak: 0, over: null });
      return accepted();
    }
    if (!round || round.over) return refuse('Lance d’abord une partie.');
    hilo.touch(user.id);
    if (action === 'plus' || action === 'moins') {
      const chances = odds(round.card)[action];
      if (!chances.count) return refuse(action === 'plus' ? 'Rien ne peut être plus haut qu’un as.' : 'Rien ne peut être plus bas qu’un 2.');
      if (!round.deck.length) round.deck = shoe(1);
      const next = round.deck.pop();
      const before = highValue(round.card);
      const after = highValue(next);
      round.history.push(round.card);
      round.card = next;
      const won = action === 'plus' ? after > before : after < before;
      if (!won) {
        const { net, balance: left } = await settle(user.id, 0, round.bet);
        Object.assign(round, { over: after === before ? 'egalite' : 'perdu', payout: 0, net, balance: left });
        return accepted();
      }
      round.multiplier *= chances.multiplier;
      round.streak += 1;
      return accepted();
    }
    if (action === 'encaisser') {
      await cashHilo(round);
      return accepted();
    }
    return refuse('Action inconnue.');
  },
};

// ------------------------------------------------ Machine, pile ou face, rouge ou noir
// Un clic, un tirage : le résultat (et le nouveau solde) est rendu tout de suite,
// la page joue l'animation qui va avec.
const lastDraw = new Map(); // `${jeu}:${joueur}` → dernier tirage

function instantGame(gameId, readOption, extra = () => ({})) {
  return {
    async view(roomId, user) {
      return { me: { balance: await balance(user.id) }, last: lastDraw.get(`${gameId}:${user.id}`) ?? null, ...extra() };
    },
    async act(roomId, user, input) {
      if (input.action !== 'jouer') return refuse('Action inconnue.');
      const option = readOption(input);
      if (!option) return refuse('Fais ton choix avant de jouer.');
      const refusal = await checkBet(user.id, input.bet);
      if (refusal) return refuse(refusal);
      const result = await resolveInstant(gameId, user.id, input.bet, option);
      if (!result.ok) return refuse('Solde insuffisant.');
      const { scene } = result;
      const draw = {
        id: Date.now(),
        bet: input.bet,
        payout: result.payout,
        net: result.net,
        balance: result.balance,
        reels: scene.reels ?? null,
        multiplier: scene.multiplier ?? null,
        label: scene.label ?? null,
        side: scene.side ?? null,
        choice: scene.choice ?? null,
        card: card(scene.card),
      };
      lastDraw.set(`${gameId}:${user.id}`, draw);
      return accepted({ draw });
    },
  };
}

export const machineGame = instantGame('machine', () => ({}), () => ({ paytable: slotPaytable() }));
export const pieceGame = instantGame('pileouface', ({ side }) => (side === 'pile' || side === 'face' ? { side } : null));
export const cartesGame = instantGame('rougenoir', ({ colour }) => (colour === 'rouge' || colour === 'noir' ? { colour } : null));

// ----------------------------------------------------------------------- Dés
// Deux dés, trois zones sur le tapis (moins de 7, 7, plus de 7) : on pose ses
// jetons sur une ou plusieurs zones, un seul lancer les règle toutes.
export const desGame = {
  async view(roomId, user) {
    return {
      me: { balance: await balance(user.id) },
      zones: Object.entries(DICE_BETS).map(([key, rule]) => ({ key, label: rule.label, pays: rule.pays, ways: rule.ways, rtp: diceRtp(key) })),
      last: lastDraw.get(`des:${user.id}`) ?? null,
    };
  },
  async act(roomId, user, { action, bets }) {
    if (action !== 'lancer') return refuse('Action inconnue.');
    const entries = Object.entries(bets ?? {}).filter(([, amount]) => amount);
    if (!entries.length) return refuse('Pose au moins un jeton sur une zone.');
    for (const [key, amount] of entries) {
      if (!DICE_BETS[key] || !Object.hasOwn(DICE_BETS, key)) return refuse('Zone inconnue.');
      if (!Number.isInteger(amount) || amount < 1) return refuse('Mise invalide.');
    }
    const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
    const refusal = await checkBet(user.id, Math.max(...entries.map(([, amount]) => amount)), { extra: total - Math.max(...entries.map(([, amount]) => amount)) });
    if (refusal) return refuse(refusal);
    if ((await stake(user.id, total)) === null) return refuse('Solde insuffisant.');
    const a = rand(6) + 1;
    const b = rand(6) + 1;
    const zones = entries.map(([key, amount]) => {
      const won = DICE_BETS[key].wins(a + b);
      return { key, amount, won, payout: won ? Math.round(amount * DICE_BETS[key].pays) : 0 };
    });
    const payout = zones.reduce((sum, zone) => sum + zone.payout, 0);
    const { net, balance: after } = await settle(user.id, payout, total);
    const draw = { id: Date.now(), a, b, total: a + b, zones, bet: total, payout, net, balance: after };
    lastDraw.set(`des:${user.id}`, draw);
    return accepted({ draw });
  },
};

/** Pour les tests : oublie les parties en cours. */
export function resetSolo() {
  mines.reset();
  hilo.reset();
  lastDraw.clear();
}
