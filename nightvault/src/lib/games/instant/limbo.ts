import { z } from 'zod';
import type { InstantGame } from '../types';

/**
 * LIMBO — le joueur annonce un multiplicateur cible. Le serveur tire un multiplicateur
 * suivant une loi en 1/x : P(X ≥ m) = RTP / m. Si le tirage atteint la cible, il gagne la cible.
 *
 * RTP = 0,99 quelle que soit la cible (avantage maison 1 %), plafonné à 10 000×.
 */
const RTP = 0.99;
const MAX = 10_000;

const options = z.object({ target: z.number().min(1.01).max(MAX) });

export type LimboOptions = z.infer<typeof options>;
export type LimboResult = { rolled: number; target: number; win: boolean };

export const limbo: InstantGame<LimboOptions, LimboResult> = {
  kind: 'instant',
  meta: {
    id: 'limbo',
    name: 'Limbo',
    category: 'arcade',
    tagline: 'Jusqu’où tu oses viser ?',
    accent: '#b06bff',
    math: { rtp: RTP, volatility: 'très haute', maxWin: MAX },
  },
  options,
  play(random, { target }) {
    const value = Math.max(random(), 1e-9);
    const rolled = Math.min(MAX, Math.floor((RTP / value) * 100) / 100);
    const win = rolled >= target;
    return { multiplier: win ? Math.round(target * 100) / 100 : 0, result: { rolled, target, win } };
  },
  describe: (result) => `${result.rolled.toFixed(2)}× (cible ${result.target.toFixed(2)}×)`,
};
