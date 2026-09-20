import type { z } from 'zod';

export type GameCategory = 'slots' | 'table' | 'dice' | 'arcade' | 'quick';
export type Volatility = 'faible' | 'moyenne' | 'haute' | 'très haute';

export interface GameMath {
  /** RTP théorique, calculé (voir docs/math/<id>.md), jamais estimé au doigt mouillé. */
  rtp: number;
  volatility: Volatility;
  /** Gain maximum en multiple de la mise. */
  maxWin: number;
  /** Part des manches qui rapportent quelque chose. */
  hitFrequency?: number;
}

export interface GameMeta {
  id: string;
  name: string;
  category: GameCategory;
  tagline: string;
  accent: string;
  math: GameMath;
  minBet?: number;
  maxBet?: number;
}

/** Suite de nombres dans [0,1) issue du HMAC de la manche (déterministe et vérifiable). */
export type Random = () => number;

/**
 * Jeu « instantané » : une requête = une manche complète.
 * `play` doit être PUR : même aléa + mêmes options = même résultat.
 */
export interface InstantGame<Options = unknown, Result = unknown> {
  kind: 'instant';
  meta: GameMeta;
  options: z.ZodType<Options>;
  play(random: Random, options: Options): { multiplier: number; result: Result };
  describe(result: Result, multiplier: number): string;
}

/**
 * Jeu « à étapes » : une manche reste ouverte (mines, crash, blackjack, tower).
 * L'état vit en base dans GameRound.resultJson ; chaque action est validée côté serveur.
 */
export interface StatefulGame<Options = unknown, State = unknown, Action = unknown> {
  kind: 'stateful';
  meta: GameMeta;
  options: z.ZodType<Options>;
  actions: z.ZodType<Action>;
  open(random: Random, options: Options): State;
  act(state: State, action: Action, now: number): { state: State; done: boolean; multiplier: number };
  /** Ce que le client a le droit de voir tant que la manche est ouverte. */
  redact(state: State): unknown;
  describe(state: State, multiplier: number): string;
}

export type AnyGame = InstantGame<never, never> | StatefulGame<never, never, never>;

/** Tirage pondéré déterministe. */
export function weighted<T>(items: readonly { item: T; weight: number }[], value: number): T {
  const total = items.reduce((sum, entry) => sum + entry.weight, 0);
  let target = value * total;
  for (const entry of items) {
    target -= entry.weight;
    if (target < 0) return entry.item;
  }
  return items[items.length - 1].item;
}

/** Arrondi d'un multiplicateur à 2 décimales, sans jamais dépasser le max annoncé. */
export const capMultiplier = (value: number, max: number) => Math.min(Math.round(value * 100) / 100, max);
