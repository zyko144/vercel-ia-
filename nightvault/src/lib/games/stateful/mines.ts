import { z } from 'zod';
import { pickUnique } from '@/lib/fairness';
import type { StatefulGame } from '../types';

/**
 * MINES — grille de 25 cases, de 1 à 24 mines. Chaque case sûre augmente le multiplicateur ;
 * une mine fait tout perdre. Le joueur encaisse quand il veut.
 *
 * Maths : après k révélations sûres sur n cases dont m mines,
 *   p(survie) = Π_{i=0..k-1} (n−m−i)/(n−i)
 *   multiplicateur équitable = 1/p, multiplié par le RTP.
 * RTP = 0,99 quel que soit le nombre de mines.
 */
const SIZE = 25;
const RTP = 0.99;

export function minesMultiplier(mines: number, revealed: number) {
  if (revealed <= 0) return 1;
  let p = 1;
  for (let i = 0; i < revealed; i++) p *= (SIZE - mines - i) / (SIZE - i);
  return Math.floor((RTP / p) * 100) / 100;
}

const options = z.object({ mines: z.number().int().min(1).max(24) });
const actions = z.union([
  z.object({ type: z.literal('reveal'), tile: z.number().int().min(0).max(24) }),
  z.object({ type: z.literal('cashout') }),
]);

export type MinesOptions = z.infer<typeof options>;
export type MinesAction = z.infer<typeof actions>;
export type MinesState = {
  mines: number[];
  count: number;
  revealed: number[];
  dead: boolean;
  cashed: boolean;
  multiplier: number;
};

export const mines: StatefulGame<MinesOptions, MinesState, MinesAction> = {
  kind: 'stateful',
  meta: {
    id: 'mines',
    name: 'Mines',
    category: 'arcade',
    tagline: 'Creuse, encaisse, recommence',
    accent: '#35d0ff',
    math: { rtp: RTP, volatility: 'très haute', maxWin: 24_000 },
  },
  options,
  actions,
  open(random, { mines: count }) {
    const values = Array.from({ length: count }, () => random());
    return { mines: pickUnique(SIZE, count, values), count, revealed: [], dead: false, cashed: false, multiplier: 1 };
  },
  act(state, action) {
    if (state.dead || state.cashed) return { state, done: true, multiplier: state.cashed ? state.multiplier : 0 };

    if (action.type === 'cashout') {
      if (!state.revealed.length) return { state, done: false, multiplier: 0 };
      const next = { ...state, cashed: true, multiplier: minesMultiplier(state.count, state.revealed.length) };
      return { state: next, done: true, multiplier: next.multiplier };
    }

    if (state.revealed.includes(action.tile)) return { state, done: false, multiplier: 0 };
    if (state.mines.includes(action.tile)) {
      const next = { ...state, dead: true, revealed: [...state.revealed, action.tile], multiplier: 0 };
      return { state: next, done: true, multiplier: 0 };
    }
    const revealed = [...state.revealed, action.tile];
    const multiplier = minesMultiplier(state.count, revealed.length);
    const safeLeft = SIZE - state.count - revealed.length;
    const next = { ...state, revealed, multiplier, cashed: safeLeft === 0 };
    // Toutes les cases sûres trouvées : encaissement automatique
    return { state: next, done: safeLeft === 0, multiplier: safeLeft === 0 ? multiplier : 0 };
  },
  redact(state) {
    return {
      count: state.count,
      revealed: state.revealed,
      multiplier: state.multiplier,
      dead: state.dead,
      cashed: state.cashed,
      // les mines ne sont envoyées qu'une fois la manche terminée
      mines: state.dead || state.cashed ? state.mines : undefined,
      next: minesMultiplier(state.count, state.revealed.length + 1),
    };
  },
  describe: (state) => `${state.revealed.length} case${state.revealed.length > 1 ? 's' : ''} · ${state.count} mines`,
};
