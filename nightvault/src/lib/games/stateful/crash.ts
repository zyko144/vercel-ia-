import { z } from 'zod';
import type { StatefulGame } from '../types';

/**
 * CRASH — la fusée monte, le multiplicateur grimpe, et elle explose à un moment inconnu.
 *
 * Maths : P(crash ≥ m) = RTP / m (loi en 1/x), donc l'espérance est constante :
 * quelle que soit la stratégie d'encaissement, le RTP vaut 0,99.
 *
 * Deux façons de jouer :
 * - automatique : la cible est fixée avant le départ, la manche est résolue tout de suite (aucune latence réseau)
 * - manuelle    : le joueur clique « Encaisser » et le SERVEUR calcule le multiplicateur avec son horloge
 */
const RTP = 0.99;
const MAX = 10_000;
const GROWTH = 0.12; // multiplicateur = e^(0.12 × secondes) : 1,8× à 5 s, 3,3× à 10 s, 11× à 20 s

export const crashMultiplierAt = (elapsedMs: number) => Math.exp(GROWTH * (elapsedMs / 1000));
export const crashTimeFor = (multiplier: number) => (Math.log(multiplier) / GROWTH) * 1000;

const options = z.object({ autoCashout: z.number().min(1.01).max(MAX).optional() });
const actions = z.object({ type: z.literal('cashout') });

export type CrashOptions = z.infer<typeof options>;
export type CrashAction = z.infer<typeof actions>;
export type CrashState = {
  crashAt: number;
  startedAt: number;
  autoCashout?: number;
  cashedAt?: number;
  multiplier: number;
  done: boolean;
};

export const crash: StatefulGame<CrashOptions, CrashState, CrashAction> = {
  kind: 'stateful',
  meta: {
    id: 'crash',
    name: 'Crash',
    category: 'arcade',
    tagline: 'Encaisse avant la rupture',
    accent: '#ff4d5e',
    math: { rtp: RTP, volatility: 'très haute', maxWin: MAX },
  },
  options,
  actions,
  open(random, { autoCashout }) {
    const value = Math.max(random(), 1e-9);
    const crashAt = Math.min(MAX, Math.max(1, Math.floor((RTP / value) * 100) / 100));
    const state: CrashState = { crashAt, startedAt: Date.now(), autoCashout, multiplier: 0, done: false };
    if (autoCashout) {
      // Résolution immédiate : le joueur a fixé sa cible avant le départ
      state.done = true;
      state.multiplier = crashAt >= autoCashout ? Math.round(autoCashout * 100) / 100 : 0;
      state.cashedAt = crashAt >= autoCashout ? crashTimeFor(autoCashout) : undefined;
    }
    return state;
  },
  act(state, _action, now) {
    if (state.done) return { state, done: true, multiplier: state.multiplier };
    const elapsed = now - state.startedAt;
    const reached = crashMultiplierAt(elapsed);
    if (reached >= state.crashAt) {
      // trop tard : la fusée a déjà explosé
      const next = { ...state, done: true, multiplier: 0 };
      return { state: next, done: true, multiplier: 0 };
    }
    const multiplier = Math.floor(reached * 100) / 100;
    const next = { ...state, done: true, cashedAt: elapsed, multiplier };
    return { state: next, done: true, multiplier };
  },
  redact(state) {
    return {
      startedAt: state.startedAt,
      autoCashout: state.autoCashout,
      // crashAt n'est révélé qu'à la fin de la manche
      crashAt: state.done ? state.crashAt : undefined,
      multiplier: state.multiplier,
      done: state.done,
      growth: GROWTH,
    };
  },
  describe: (state, multiplier) => (multiplier > 0 ? `encaissé à ${multiplier}× (crash ${state.crashAt}×)` : `crash à ${state.crashAt}×`),
};
