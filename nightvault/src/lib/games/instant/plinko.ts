import { z } from 'zod';
import type { InstantGame } from '../types';

/**
 * PLINKO — une bille tombe dans une pyramide de plots : à chaque rangée elle part à gauche ou à droite.
 *
 * Maths : la case d'arrivée suit une loi binomiale, P(k) = C(n,k)/2^n.
 * Les tables ci-dessous sont construites pour que Σ P(k) × mult(k) ≈ 0,99 (vérifié par simulation).
 * Le chemin renvoyé au client sert à animer exactement le résultat calculé par le serveur.
 */
const RTP = 0.99;

type Risk = 'faible' | 'moyen' | 'eleve';

// Tables de multiplicateurs (symétriques), pour 8, 12 et 16 rangées
const TABLES: Record<Risk, Record<number, number[]>> = {
  faible: {
    8: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    12: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  moyen: {
    8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  },
  eleve: {
    8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

const options = z.object({
  rows: z.union([z.literal(8), z.literal(12), z.literal(16)]),
  risk: z.enum(['faible', 'moyen', 'eleve']),
});

export type PlinkoOptions = z.infer<typeof options>;
export type PlinkoResult = { path: ('L' | 'R')[]; slot: number; rows: number; risk: Risk; table: number[] };

export const plinkoTable = (risk: Risk, rows: number) => TABLES[risk][rows];

export const plinko: InstantGame<PlinkoOptions, PlinkoResult> = {
  kind: 'instant',
  meta: {
    id: 'plinko',
    name: 'Plinko',
    category: 'arcade',
    tagline: 'Laisse tomber, regarde rebondir',
    accent: '#7b5cff',
    math: { rtp: RTP, volatility: 'haute', maxWin: 1000 },
  },
  options,
  play(random, { rows, risk }) {
    const path: ('L' | 'R')[] = [];
    let slot = 0;
    for (let i = 0; i < rows; i++) {
      const right = random() < 0.5;
      path.push(right ? 'R' : 'L');
      if (right) slot += 1;
    }
    const table = TABLES[risk][rows];
    return { multiplier: table[slot], result: { path, slot, rows, risk, table } };
  },
  describe: (result, multiplier) => `case ${result.slot + 1}/${result.rows + 1} · ${multiplier}×`,
};
