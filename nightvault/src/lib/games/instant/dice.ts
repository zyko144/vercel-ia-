import { z } from 'zod';
import type { InstantGame } from '../types';

/**
 * DICE — le joueur choisit une cible entre 2 et 98 et le sens (au-dessus / en-dessous).
 *
 * Maths : le tirage est un nombre dans [0, 100). Probabilité de gain p = cible/100 (moins) ou (100-cible)/100 (plus).
 * Multiplicateur = RTP / p → RTP constant quelle que soit la cible.
 * RTP = 0,99 (avantage maison 1 %), volatilité choisie par le joueur (de 1,01× à 49,5×).
 */
const RTP = 0.99;

const options = z.object({
  target: z.number().int().min(2).max(98),
  direction: z.enum(['over', 'under']),
});

export type DiceOptions = z.infer<typeof options>;
export type DiceResult = { roll: number; target: number; direction: 'over' | 'under'; win: boolean; chance: number };

export const dice: InstantGame<DiceOptions, DiceResult> = {
  kind: 'instant',
  meta: {
    id: 'dice',
    name: 'Dice',
    category: 'dice',
    tagline: 'Choisis ta chance, choisis ton risque',
    accent: '#35d0ff',
    math: { rtp: RTP, volatility: 'moyenne', maxWin: 49.5 },
  },
  options,
  play(random, { target, direction }) {
    const roll = Math.floor(random() * 10_000) / 100; // 0.00 → 99.99
    const chance = direction === 'under' ? target / 100 : (100 - target) / 100;
    const win = direction === 'under' ? roll < target : roll > target;
    const multiplier = win ? Math.floor((RTP / chance) * 100) / 100 : 0;
    return { multiplier, result: { roll, target, direction, win, chance } };
  },
  describe: (result) => `${result.roll.toFixed(2)} ${result.direction === 'under' ? '<' : '>'} ${result.target}`,
};
