import { economy } from './config';
import { newClientSeed, newServerSeed, rng } from '@/lib/fairness';
import { GAMES } from '@/lib/games/registry';

/**
 * Simulateur d'économie : fait vivre une population de joueurs virtuels pendant N jours
 * en rejouant les VRAIS moteurs de jeu, et mesure ce que devient la masse monétaire.
 *
 * Sert à valider un changement de réglage avant de le mettre en production.
 */

export type SimulationInput = {
  players: number;
  days: number;
  /** Manches jouées par joueur et par jour (moyenne). */
  roundsPerDay?: number;
  /** Part du solde misée à chaque manche. */
  betRatio?: number;
  faucetMultiplier?: number;
};

export type SimulationResult = {
  players: number;
  days: number;
  supply: number;
  average: number;
  median: number;
  deciles: number[];
  faucets: number;
  sinks: number;
  wagered: number;
  payout: number;
  inflationPerDay: number;
  brokeShare: number;
  timeline: { day: number; supply: number; average: number; median: number }[];
};

const INSTANT = ['dice', 'limbo', 'plinko', 'wheel', 'keno', 'neon-fortune', 'royal-vault', 'diamond-rush'] as const;

const OPTIONS: Record<string, unknown> = {
  dice: { target: 50, direction: 'over' },
  limbo: { target: 2 },
  plinko: { rows: 12, risk: 'moyen' },
  wheel: { risk: 'moyen' },
  keno: { picks: [0, 1, 2, 3, 4] },
  'neon-fortune': undefined,
  'royal-vault': undefined,
  'diamond-rush': undefined,
};

export function simulateEconomy(input: SimulationInput): SimulationResult {
  const { players, days, roundsPerDay = 40, betRatio = 0.02, faucetMultiplier = economy.faucetMultiplier } = input;

  const seed = newServerSeed();
  const client = newClientSeed();
  let nonce = 0;

  const balances = new Array(players).fill(economy.welcomeBonus);
  let faucets = players * economy.welcomeBonus;
  let sinks = 0;
  let wagered = 0;
  let payout = 0;
  const timeline: SimulationResult['timeline'] = [];

  for (let day = 1; day <= days; day++) {
    for (let index = 0; index < players; index++) {
      // Récompense quotidienne (tout le monde ne se connecte pas tous les jours)
      if (Math.random() < 0.65) {
        const amount = Math.round(economy.daily[Math.min(6, day - 1)] * faucetMultiplier * economy.faucetScale(balances[index]));
        balances[index] += amount;
        faucets += amount;
      }
      // Filet de sécurité
      if (balances[index] < economy.safetyNet.threshold) {
        balances[index] += economy.safetyNet.amount;
        faucets += economy.safetyNet.amount;
      }
      // Missions (environ une par jour et par joueur actif)
      if (Math.random() < 0.4) {
        const amount = Math.round(900 * faucetMultiplier * economy.faucetScale(balances[index]));
        balances[index] += amount;
        faucets += amount;
      }

      const rounds = Math.round(roundsPerDay * (0.4 + Math.random() * 1.4));
      for (let round = 0; round < rounds; round++) {
        const bet = Math.max(economy.bet.min, Math.floor(balances[index] * betRatio));
        if (bet > balances[index] || balances[index] <= 0) break;
        const gameId = INSTANT[Math.floor(Math.random() * INSTANT.length)];
        const game = GAMES[gameId];
        if (!game || game.kind !== 'instant') continue;

        const { multiplier } = game.play(rng(seed, client, nonce++), OPTIONS[gameId] as never);
        const won = Math.floor(bet * multiplier);
        balances[index] += won - bet;
        wagered += bet;
        payout += won;
        sinks += bet - won;
      }

      // Dépenses cosmétiques occasionnelles
      if (Math.random() < 0.01 && balances[index] > 60_000) {
        balances[index] -= 25_000;
        sinks += 25_000;
      }
    }

    const sorted = [...balances].sort((a, b) => a - b);
    const supply = sorted.reduce((sum, value) => sum + value, 0);
    timeline.push({
      day,
      supply,
      average: Math.round(supply / players),
      median: sorted[Math.floor(players / 2)],
    });
  }

  const sorted = [...balances].sort((a, b) => a - b);
  const supply = sorted.reduce((sum, value) => sum + value, 0);
  const start = players * economy.welcomeBonus;
  return {
    players,
    days,
    supply,
    average: Math.round(supply / players),
    median: sorted[Math.floor(players / 2)],
    deciles: Array.from({ length: 9 }, (_, index) => sorted[Math.floor((players * (index + 1)) / 10)] ?? 0),
    faucets,
    sinks,
    wagered,
    payout,
    inflationPerDay: days > 0 ? (supply / Math.max(1, start)) ** (1 / days) - 1 : 0,
    brokeShare: sorted.filter((value) => value < 500).length / players,
    timeline,
  };
}
