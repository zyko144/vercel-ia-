import { z } from 'zod';
import type { GameMath, InstantGame, Random } from '../types';

/**
 * Moteur générique de machines à sous.
 *
 * Le hasard ne porte que sur la position d'arrêt de chaque rouleau : la probabilité de chaque
 * symbole vient donc des BANDES (reel strips), exactement comme sur une vraie machine.
 * Le RTP se règle en modifiant les bandes, jamais en corrigeant le gain après coup.
 */

export interface SlotSymbol {
  id: string;
  name: string;
  /** Gains en unités de mise par ligne, pour 2, 3, 4 et 5 symboles alignés (index = nombre − 2). */
  pays: number[];
  kind?: 'normal' | 'wild' | 'scatter';
  color: string;
}

export interface SlotConfig {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  reels: number;
  rows: number;
  symbols: SlotSymbol[];
  /** Une bande par rouleau (liste d'identifiants de symboles). */
  strips: string[][];
  /** Lignes de gain : index de ligne (0 = haut) pour chaque rouleau. */
  paylines: number[][];
  scatter?: { id: string; freeSpins: number[]; multiplier: number; pays?: number[] };
  math: GameMath;
}

export interface SpinWin {
  line: number;
  symbol: string;
  count: number;
  pay: number;
}

export interface SpinResult {
  /** Grille visible : window[reel][row] */
  window: string[][];
  stops: number[];
  wins: SpinWin[];
  scatters: number;
  freeSpins?: { spins: SpinResult[]; multiplier: number; total: number };
  lineMultiplier: number;
}

const options = z.object({}).strict().optional();

/** Fenêtre visible d'un rouleau à partir de sa position d'arrêt. */
function windowFor(strip: string[], stop: number, rows: number) {
  return Array.from({ length: rows }, (_, row) => strip[(stop + row) % strip.length]);
}

function evaluate(config: SlotConfig, window: string[][]): { wins: SpinWin[]; scatters: number; lineMultiplier: number } {
  const byId = new Map(config.symbols.map((symbol) => [symbol.id, symbol]));
  const wilds = config.symbols.filter((s) => s.kind === 'wild').map((s) => s.id);
  const wins: SpinWin[] = [];

  config.paylines.forEach((line, lineIndex) => {
    const cells = line.map((row, reel) => window[reel][row]);
    // Le symbole de référence est le premier non-wild de la ligne
    const base = cells.find((cell) => !wilds.includes(cell) && byId.get(cell)?.kind !== 'scatter') ?? cells[0];
    const symbol = byId.get(base);
    if (!symbol || symbol.kind === 'scatter') return;
    let count = 0;
    for (const cell of cells) {
      if (cell === base || wilds.includes(cell)) count += 1;
      else break;
    }
    const pay = symbol.pays[count - 2] ?? 0;
    if (count >= 2 && pay > 0) wins.push({ line: lineIndex, symbol: base, count, pay });
  });

  const scatterId = config.scatter?.id;
  const scatters = scatterId ? window.flat().filter((cell) => cell === scatterId).length : 0;
  const scatterPay = config.scatter?.pays?.[scatters - 2] ?? 0;
  const lineMultiplier = (wins.reduce((sum, win) => sum + win.pay, 0) + scatterPay * config.paylines.length) / config.paylines.length;
  return { wins, scatters, lineMultiplier };
}

function spinOnce(config: SlotConfig, random: Random): SpinResult {
  const stops = config.strips.map((strip) => Math.floor(random() * strip.length));
  const window = config.strips.map((strip, reel) => windowFor(strip, stops[reel], config.rows));
  const { wins, scatters, lineMultiplier } = evaluate(config, window);
  return { window, stops, wins, scatters, lineMultiplier };
}

/** Transforme une configuration en jeu jouable. */
export function createSlot(config: SlotConfig): InstantGame<Record<string, never> | undefined, SpinResult> {
  return {
    kind: 'instant',
    meta: {
      id: config.id,
      name: config.name,
      category: 'slots',
      tagline: config.tagline,
      accent: config.accent,
      math: config.math,
    },
    options: options as unknown as z.ZodType<Record<string, never> | undefined>,
    play(random) {
      const result = spinOnce(config, random);
      let total = result.lineMultiplier;

      // Tours gratuits : déclenchés par les scatters, joués tout de suite côté serveur
      const trigger = config.scatter;
      if (trigger && result.scatters >= 3) {
        const spins = trigger.freeSpins[Math.min(result.scatters, trigger.freeSpins.length + 2) - 3] ?? trigger.freeSpins[0];
        const played: SpinResult[] = [];
        let bonus = 0;
        for (let i = 0; i < spins; i++) {
          const free = spinOnce(config, random);
          played.push(free);
          bonus += free.lineMultiplier * trigger.multiplier;
        }
        result.freeSpins = { spins: played, multiplier: trigger.multiplier, total: Math.round(bonus * 100) / 100 };
        total += bonus;
      }
      return { multiplier: Math.round(total * 100) / 100, result };
    },
    describe(result, multiplier) {
      if (result.freeSpins) return `${result.scatters} scatters · ${result.freeSpins.spins.length} tours gratuits · ${multiplier}×`;
      if (!result.wins.length) return 'aucune ligne';
      const best = [...result.wins].sort((a, b) => b.pay - a.pay)[0];
      return `${best.count}× ${best.symbol} · ${multiplier}×`;
    },
  };
}

export { spinOnce };
