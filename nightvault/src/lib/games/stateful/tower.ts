import { z } from 'zod';
import type { StatefulGame } from '../types';

/**
 * TOWER — 8 étages. À chaque étage, une seule porte (ou deux selon la difficulté) est piégée.
 *
 * Maths : à chaque étage, p(survie) = (tuiles − pièges)/tuiles.
 * Multiplicateur après n étages = RTP / p^n. RTP = 0,99.
 */
const RTP = 0.99;
const FLOORS = 8;

const MODES = {
  facile: { tiles: 4, traps: 1 }, // p = 3/4
  moyen: { tiles: 3, traps: 1 }, // p = 2/3
  difficile: { tiles: 2, traps: 1 }, // p = 1/2
  extreme: { tiles: 4, traps: 3 }, // p = 1/4
} as const;

export type TowerMode = keyof typeof MODES;
export const towerModes = MODES;

export function towerMultiplier(mode: TowerMode, floor: number) {
  if (floor <= 0) return 1;
  const { tiles, traps } = MODES[mode];
  const p = (tiles - traps) / tiles;
  return Math.floor((RTP / p ** floor) * 100) / 100;
}

const options = z.object({ mode: z.enum(['facile', 'moyen', 'difficile', 'extreme']) });
const actions = z.union([
  z.object({ type: z.literal('pick'), tile: z.number().int().min(0).max(3) }),
  z.object({ type: z.literal('cashout') }),
]);

export type TowerOptions = z.infer<typeof options>;
export type TowerAction = z.infer<typeof actions>;
export type TowerState = {
  mode: TowerMode;
  traps: number[][]; // pièges de chaque étage
  picks: number[];
  floor: number;
  dead: boolean;
  cashed: boolean;
  multiplier: number;
};

export const tower: StatefulGame<TowerOptions, TowerState, TowerAction> = {
  kind: 'stateful',
  meta: {
    id: 'tower',
    name: 'Tower',
    category: 'arcade',
    tagline: 'Monte étage par étage, sans te tromper de porte',
    accent: '#f0d38a',
    math: { rtp: RTP, volatility: 'haute', maxWin: 25_000 },
  },
  options,
  actions,
  open(random, { mode }) {
    const { tiles, traps: trapCount } = MODES[mode];
    const traps: number[][] = [];
    for (let floor = 0; floor < FLOORS; floor++) {
      const pool = Array.from({ length: tiles }, (_, i) => i);
      const chosen: number[] = [];
      for (let i = 0; i < trapCount; i++) chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
      traps.push(chosen.sort((a, b) => a - b));
    }
    return { mode, traps, picks: [], floor: 0, dead: false, cashed: false, multiplier: 1 };
  },
  act(state, action) {
    if (state.dead || state.cashed) return { state, done: true, multiplier: state.cashed ? state.multiplier : 0 };

    if (action.type === 'cashout') {
      if (state.floor === 0) return { state, done: false, multiplier: 0 };
      const next = { ...state, cashed: true, multiplier: towerMultiplier(state.mode, state.floor) };
      return { state: next, done: true, multiplier: next.multiplier };
    }

    const { tiles } = MODES[state.mode];
    if (action.tile >= tiles) return { state, done: false, multiplier: 0 };
    const trapped = state.traps[state.floor].includes(action.tile);
    const picks = [...state.picks, action.tile];
    if (trapped) {
      return { state: { ...state, picks, dead: true, multiplier: 0 }, done: true, multiplier: 0 };
    }
    const floor = state.floor + 1;
    const multiplier = towerMultiplier(state.mode, floor);
    const finished = floor >= FLOORS;
    const next = { ...state, picks, floor, multiplier, cashed: finished };
    return { state: next, done: finished, multiplier: finished ? multiplier : 0 };
  },
  redact(state) {
    const { tiles } = MODES[state.mode];
    return {
      mode: state.mode,
      tiles,
      floors: FLOORS,
      picks: state.picks,
      floor: state.floor,
      dead: state.dead,
      cashed: state.cashed,
      multiplier: state.multiplier,
      next: towerMultiplier(state.mode, state.floor + 1),
      // les pièges des étages déjà passés (et tous à la fin)
      traps: state.dead || state.cashed ? state.traps : state.traps.slice(0, state.floor),
    };
  },
  describe: (state) => `étage ${state.floor}/${FLOORS} · ${state.mode}`,
};
