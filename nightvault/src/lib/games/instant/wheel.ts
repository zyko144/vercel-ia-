import { z } from 'zod';
import type { InstantGame } from '../types';

/**
 * WHEEL — une roue à segments. Le risque choisi change la répartition des multiplicateurs.
 *
 * Maths : chaque segment a la même probabilité (1/n). Les tables sont calibrées pour un RTP de 0,97
 * (moyenne des segments = 0,97) — vérifié par `npm run simulate -- --game=wheel`.
 */
const SEGMENTS: Record<'faible' | 'moyen' | 'eleve', number[]> = {
  // moyenne = 0,97
  faible: [1.5, 1.2, 1.2, 0, 1.5, 1.2, 1.2, 0, 1.5, 1.2, 1.2, 0, 1.5, 1.2, 1.1, 0],
  moyen: [2, 1.5, 0, 1.7, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 1.7, 0, 0.62],
  eleve: [9.9, 0, 0, 0, 0, 0, 0, 0, 4.9, 0, 0, 0, 0, 0, 0, 0.72],
};

const options = z.object({ risk: z.enum(['faible', 'moyen', 'eleve']) });

export type WheelOptions = z.infer<typeof options>;
export type WheelResult = { segment: number; segments: number[]; risk: string };

export const wheelSegments = (risk: 'faible' | 'moyen' | 'eleve') => SEGMENTS[risk];

export const wheel: InstantGame<WheelOptions, WheelResult> = {
  kind: 'instant',
  meta: {
    id: 'wheel',
    name: 'Wheel',
    category: 'arcade',
    tagline: 'Un tour de roue, un verdict',
    accent: '#2ee08a',
    math: { rtp: 0.97, volatility: 'haute', maxWin: 9.9 },
  },
  options,
  play(random, { risk }) {
    const segments = SEGMENTS[risk];
    const segment = Math.floor(random() * segments.length);
    return { multiplier: segments[segment], result: { segment, segments, risk } };
  },
  describe: (_result, multiplier) => `${multiplier}×`,
};
