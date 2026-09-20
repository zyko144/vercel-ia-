import { z } from 'zod';
import { pickUnique } from '@/lib/fairness';
import type { InstantGame } from '../types';

/**
 * KENO — le joueur coche 1 à 10 numéros sur 40 ; le serveur en tire 10.
 *
 * Maths : hypergéométrique. P(k touches | s sélectionnés) = C(10,k)·C(30,s−k) / C(40,s).
 * Les tables ci-dessous sont calibrées pour un RTP proche de 0,96 par nombre de numéros joués
 * (vérifié exactement par `npm run simulate -- --game=keno`, qui calcule la loi complète).
 */
const TABLES: Record<number, number[]> = {
  // index = nombre de touches
  1: [0, 3.84],
  2: [0, 1.7, 5.4],
  3: [0, 0, 3.8, 36],
  4: [0, 0, 1.7, 10, 90],
  5: [0, 0, 1.4, 3.8, 13, 370],
  6: [0, 0, 0, 3.6, 10.5, 105, 830],
  7: [0, 0, 0, 2.2, 7.8, 29, 111, 890],
  8: [0, 0, 0, 2, 4.1, 11.2, 68, 400, 900],
  9: [0, 0, 0, 2, 2.6, 5.2, 15.5, 100, 500, 1000],
  10: [0, 0, 0, 1.6, 2, 3.9, 6.8, 25, 96, 480, 960],
};

const options = z.object({ picks: z.array(z.number().int().min(0).max(39)).min(1).max(10) });

export type KenoOptions = z.infer<typeof options>;
export type KenoResult = { picks: number[]; drawn: number[]; hits: number; table: number[] };

export const kenoTable = (count: number) => TABLES[count];

export const keno: InstantGame<KenoOptions, KenoResult> = {
  kind: 'instant',
  meta: {
    id: 'keno',
    name: 'Keno',
    category: 'quick',
    tagline: 'Dix numéros, dix chances',
    accent: '#f0d38a',
    math: { rtp: 0.96, volatility: 'haute', maxWin: 1000 },
  },
  options,
  play(random, { picks }) {
    const unique = [...new Set(picks)];
    const values = Array.from({ length: 10 }, () => random());
    const drawn = pickUnique(40, 10, values);
    const hits = unique.filter((n) => drawn.includes(n)).length;
    const table = TABLES[unique.length];
    return { multiplier: table[hits] ?? 0, result: { picks: unique, drawn, hits, table } };
  },
  describe: (result) => `${result.hits}/${result.picks.length} touché${result.hits > 1 ? 's' : ''}`,
};
