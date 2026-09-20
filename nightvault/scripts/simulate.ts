/**
 * Simulateur de RTP : rejoue des centaines de milliers de manches avec le VRAI moteur
 * et compare le résultat au RTP annoncé. Aucun chiffre du catalogue n'est publié sans passer ici.
 *
 *   npm run simulate                      (tous les jeux, 200 000 manches)
 *   npm run simulate -- --game=mines --rounds=1000000
 */
import { newClientSeed, newServerSeed, rng } from '../src/lib/fairness';
import { GAMES } from '../src/lib/games/registry';
import { minesMultiplier } from '../src/lib/games/stateful/mines';
import { towerMultiplier, towerModes, type TowerMode } from '../src/lib/games/stateful/tower';
import { crashMultiplierAt } from '../src/lib/games/stateful/crash';

type Options = Record<string, unknown>;

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);
const ROUNDS = Number(args.get('rounds') ?? 200_000);
const ONLY = args.get('game');

/** Options de jeu utilisées pour la simulation (les plus représentatives). */
const PROFILES: Record<string, Options[]> = {
  dice: [{ target: 50, direction: 'over' }, { target: 10, direction: 'under' }, { target: 90, direction: 'under' }],
  limbo: [{ target: 2 }, { target: 10 }, { target: 100 }],
  plinko: [
    { rows: 8, risk: 'faible' }, { rows: 12, risk: 'faible' }, { rows: 16, risk: 'faible' },
    { rows: 8, risk: 'moyen' }, { rows: 12, risk: 'moyen' }, { rows: 16, risk: 'moyen' },
    { rows: 8, risk: 'eleve' }, { rows: 12, risk: 'eleve' }, { rows: 16, risk: 'eleve' },
  ],
  wheel: [{ risk: 'faible' }, { risk: 'moyen' }, { risk: 'eleve' }],
  keno: [
    { picks: [0] }, { picks: [0, 1, 2] }, { picks: [0, 1, 2, 3, 4] },
    { picks: [0, 1, 2, 3, 4, 5, 6, 7] }, { picks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  ],
  'european-roulette': [
    { bets: [{ kind: 'straight', value: 17, amount: 100 }] },
    { bets: [{ kind: 'red', amount: 100 }] },
    { bets: [{ kind: 'dozen', value: 2, amount: 100 }] },
  ],
  'neon-fortune': [undefined as unknown as Options],
  'royal-vault': [undefined as unknown as Options],
  'diamond-rush': [undefined as unknown as Options],
};

/** Stratégies de joueur pour les jeux à étapes (elles ne changent pas le RTP, on le vérifie). */
const STATEFUL: Record<string, { label: string; run: (random: () => number) => number }[]> = {
  mines: [3, 5, 10].flatMap((mines) =>
    [1, 3, 5].map((target) => ({
      label: `${mines} mines, encaisse à ${target} case(s)`,
      run: (random: () => number) => {
        const game = GAMES.mines as never as typeof import('../src/lib/games/stateful/mines').mines;
        let state = game.open(random, { mines });
        const order = Array.from({ length: 25 }, (_, i) => i).sort(() => random() - 0.5);
        for (let i = 0; i < target; i++) {
          const step = game.act(state, { type: 'reveal', tile: order[i] }, Date.now());
          state = step.state;
          if (state.dead) return 0;
        }
        return minesMultiplier(mines, target);
      },
    })),
  ),
  tower: (Object.keys(towerModes) as TowerMode[]).flatMap((mode) =>
    [2, 4, 6].map((floors) => ({
      label: `${mode}, encaisse à l'étage ${floors}`,
      run: (random: () => number) => {
        const game = GAMES.tower as never as typeof import('../src/lib/games/stateful/tower').tower;
        let state = game.open(random, { mode });
        for (let i = 0; i < floors; i++) {
          const step = game.act(state, { type: 'pick', tile: Math.floor(random() * towerModes[mode].tiles) }, Date.now());
          state = step.state;
          if (state.dead) return 0;
        }
        return towerMultiplier(mode, floors);
      },
    })),
  ),
  crash: [1.5, 2, 5, 20].map((target) => ({
    label: `encaisse automatiquement à ${target}×`,
    run: (random: () => number) => {
      const game = GAMES.crash as never as typeof import('../src/lib/games/stateful/crash').crash;
      const state = game.open(random, { autoCashout: target });
      return state.multiplier;
    },
  })),
};

function stats(values: number[]) {
  const n = values.length;
  const rtp = values.reduce((sum, v) => sum + v, 0) / n;
  const hits = values.filter((v) => v > 0).length / n;
  const variance = values.reduce((sum, v) => sum + (v - rtp) ** 2, 0) / n;
  return { rtp, hits, sd: Math.sqrt(variance), max: Math.max(...values) };
}

const line = (label: string, target: number, s: ReturnType<typeof stats>) => {
  const delta = (s.rtp - target) * 100;
  const flag = Math.abs(delta) <= 0.7 ? '✅' : Math.abs(delta) <= 2 ? '⚠️ ' : '❌';
  return `${flag} ${label.padEnd(42)} RTP ${(s.rtp * 100).toFixed(2)}% (cible ${(target * 100).toFixed(1)}%, écart ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} pt) · gains ${(s.hits * 100).toFixed(1)}% · écart-type ${s.sd.toFixed(2)} · max ${s.max.toFixed(0)}×`;
};

const seed = newServerSeed();
const client = newClientSeed();
let nonce = 0;
const next = () => rng(seed, client, nonce++);

console.log(`Simulation : ${ROUNDS.toLocaleString('fr-FR')} manches par profil\n`);

for (const [id, game] of Object.entries(GAMES)) {
  if (ONLY && ONLY !== id) continue;
  const target = game.meta.math.rtp;

  if (game.kind === 'instant') {
    for (const options of PROFILES[id] ?? [undefined as unknown as Options]) {
      const values: number[] = [];
      for (let i = 0; i < ROUNDS; i++) values.push(game.play(next(), options as never).multiplier);
      const label = `${game.meta.name}${options ? ` ${JSON.stringify(options).slice(0, 34)}` : ''}`;
      console.log(line(label, target, stats(values)));
    }
  } else {
    for (const strategy of STATEFUL[id] ?? []) {
      const values: number[] = [];
      for (let i = 0; i < ROUNDS; i++) values.push(strategy.run(next()));
      console.log(line(`${game.meta.name} · ${strategy.label}`, target, stats(values)));
    }
  }
}

// Vérification du modèle de croissance du Crash (cohérence temps ↔ multiplicateur)
if (!ONLY || ONLY === 'crash') {
  console.log(`\nCrash : 5 s → ${crashMultiplierAt(5000).toFixed(2)}× · 10 s → ${crashMultiplierAt(10_000).toFixed(2)}× · 20 s → ${crashMultiplierAt(20_000).toFixed(2)}×`);
}
