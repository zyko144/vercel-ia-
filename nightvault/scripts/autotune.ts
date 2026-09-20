/**
 * Auto-calibrage des machines à sous : mesure le RTP réel, met les gains à l'échelle,
 * recommence jusqu'à tomber à ±0,3 % du RTP visé, puis écrit les tables dans paytables.json.
 *
 *   npx tsx scripts/autotune.ts [--rounds=300000] [--passes=4]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { newClientSeed, newServerSeed, rng } from '../src/lib/fairness';
import { createSlot } from '../src/lib/games/slots/engine';
import { SLOT_CONFIGS } from '../src/lib/games/slots/configs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=') as [string, string]));
const ROUNDS = Number(args.get('rounds') ?? 300_000);
const PASSES = Number(args.get('passes') ?? 4);
const FILE = path.join(process.cwd(), 'src/lib/games/slots/paytables.json');

// Les petits gains gardent une décimale : sinon l'arrondi à l'entier fausse le RTP.
const scale = (pay: number, factor: number) => {
  const value = pay * factor;
  return value < 20 ? Math.max(0.5, Math.round(value * 10) / 10) : Math.round(value);
};

const seed = newServerSeed();
const client = newClientSeed();
let nonce = 0;

function measure(config: (typeof SLOT_CONFIGS)[number]) {
  const game = createSlot(config);
  let total = 0;
  let hits = 0;
  let max = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const { multiplier } = game.play(rng(seed, client, nonce++), undefined);
    total += multiplier;
    if (multiplier > 0) hits += 1;
    if (multiplier > max) max = multiplier;
  }
  return { rtp: total / ROUNDS, hits: hits / ROUNDS, max };
}

const tables: Record<string, Record<string, number[]>> = {};

for (const config of SLOT_CONFIGS) {
  let stats = measure(config);
  console.log(`${config.name} : départ ${(stats.rtp * 100).toFixed(2)}%`);

  for (let pass = 0; pass < PASSES; pass++) {
    const gap = Math.abs(stats.rtp - config.math.rtp);
    if (gap <= 0.003) break;
    const factor = config.math.rtp / stats.rtp;
    for (const symbol of config.symbols) {
      symbol.pays = symbol.pays.map((pay) => (pay === 0 ? 0 : scale(pay, factor)));
    }
    if (config.scatter?.pays) {
      config.scatter.pays = config.scatter.pays.map((pay) => (pay === 0 ? 0 : scale(pay, factor)));
    }
    stats = measure(config);
    console.log(`  passe ${pass + 1} : ${(stats.rtp * 100).toFixed(2)}% (facteur ${factor.toFixed(4)})`);
  }

  tables[config.id] = Object.fromEntries([
    ...config.symbols.map((symbol) => [symbol.id, symbol.pays]),
    ...(config.scatter?.pays ? [['_scatter', config.scatter.pays]] : []),
  ]);
  console.log(`  → RTP ${(stats.rtp * 100).toFixed(2)}% · gains ${(stats.hits * 100).toFixed(1)}% · plus gros gain observé ${stats.max.toFixed(0)}×\n`);
}

const existing = (() => {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, Record<string, number[]>>;
  } catch {
    return {};
  }
})();
writeFileSync(FILE, `${JSON.stringify({ ...existing, ...tables }, null, 2)}\n`);
console.log(`Tables écrites dans ${path.relative(process.cwd(), FILE)}`);
