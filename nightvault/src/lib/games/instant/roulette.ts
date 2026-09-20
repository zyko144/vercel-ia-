import { z } from 'zod';
import type { InstantGame } from '../types';

/**
 * ROULETTE EUROPÉENNE — 37 cases (0 à 36), un seul zéro.
 *
 * Maths exactes : chaque mise paie (36/n − 1) pour 1 avec n numéros couverts,
 * donc RTP = 36/37 = 97,297 % sur toutes les mises. Aucun réglage arbitraire.
 */
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export const ROULETTE_WHEEL = WHEEL;
export const isRed = (n: number) => RED.has(n);

const betSchema = z.object({
  kind: z.enum(['straight', 'red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'column']),
  value: z.number().int().min(0).max(36).optional(), // numéro plein, ou 1/2/3 pour douzaine et colonne
  amount: z.number().int().min(1),
});

const options = z.object({ bets: z.array(betSchema).min(1).max(12) });

export type RouletteOptions = z.infer<typeof options>;
export type RouletteBet = z.infer<typeof betSchema>;
export type RouletteResult = { number: number; color: 'rouge' | 'noir' | 'vert'; wheelIndex: number; wins: { kind: string; value?: number; amount: number; payout: number }[] };

/** Numéros couverts par une mise (sert aussi au calcul de RTP). */
export function covered(bet: RouletteBet): number[] {
  switch (bet.kind) {
    case 'straight': return [bet.value ?? 0];
    case 'red': return [...RED];
    case 'black': return Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => !RED.has(n));
    case 'even': return Array.from({ length: 18 }, (_, i) => (i + 1) * 2);
    case 'odd': return Array.from({ length: 18 }, (_, i) => i * 2 + 1);
    case 'low': return Array.from({ length: 18 }, (_, i) => i + 1);
    case 'high': return Array.from({ length: 18 }, (_, i) => i + 19);
    case 'dozen': {
      const d = (bet.value ?? 1) - 1;
      return Array.from({ length: 12 }, (_, i) => d * 12 + i + 1);
    }
    case 'column': {
      const c = (bet.value ?? 1) - 1;
      return Array.from({ length: 12 }, (_, i) => i * 3 + c + 1);
    }
    default: return [];
  }
}

export const roulette: InstantGame<RouletteOptions, RouletteResult> = {
  kind: 'instant',
  meta: {
    id: 'european-roulette',
    name: 'Roulette européenne',
    category: 'table',
    tagline: 'Un seul zéro, toutes les mises',
    accent: '#ff4d5e',
    math: { rtp: 36 / 37, volatility: 'moyenne', maxWin: 36 },
  },
  options,
  play(random, { bets }) {
    const number = Math.floor(random() * 37);
    const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const wins = bets.map((bet) => {
      const numbers = covered(bet);
      const hit = numbers.includes(number);
      // gain total rendu (mise comprise) = amount × 36/n
      const payout = hit ? (bet.amount * 36) / numbers.length : 0;
      return { kind: bet.kind, value: bet.value, amount: bet.amount, payout };
    });
    const returned = wins.reduce((sum, win) => sum + win.payout, 0);
    return {
      multiplier: Math.round((returned / total) * 10_000) / 10_000,
      result: {
        number,
        color: number === 0 ? 'vert' : RED.has(number) ? 'rouge' : 'noir',
        wheelIndex: WHEEL.indexOf(number),
        wins,
      },
    };
  },
  describe: (result) => `${result.number} ${result.color}`,
};
