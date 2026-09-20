/**
 * Calibrage des tables de gains : calcule ce qu'il faut corriger pour atteindre le RTP visé.
 * - Keno et Wheel : calcul EXACT (hypergéométrique / moyenne des segments)
 * - Slots : Monte-Carlo, puis facteur d'échelle à appliquer aux tables de gains
 *
 *   npx tsx scripts/calibrate.ts
 */
import { newClientSeed, newServerSeed, rng } from '../src/lib/fairness';
import { createSlot } from '../src/lib/games/slots/engine';
import { SLOT_CONFIGS } from '../src/lib/games/slots/configs';
import { kenoTable } from '../src/lib/games/instant/keno';
import { wheelSegments } from '../src/lib/games/instant/wheel';

const TARGET_KENO = 0.96;
const TARGET_WHEEL = 0.97;

// ---------- Keno : loi hypergéométrique exacte ----------
const C = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return result;
};

console.log('=== KENO (exact) ===');
for (let picks = 1; picks <= 10; picks++) {
  const table = kenoTable(picks);
  const probabilities = Array.from({ length: picks + 1 }, (_, hits) => (C(10, hits) * C(30, picks - hits)) / C(40, picks));
  const rtp = probabilities.reduce((sum, p, hits) => sum + p * (table[hits] ?? 0), 0);
  // On corrige en gardant la forme de la table
  const scale = TARGET_KENO / rtp;
  const suggested = table.map((value) => (value === 0 ? 0 : Math.max(0.1, Math.round(value * scale * 10) / 10)));
  const check = probabilities.reduce((sum, p, hits) => sum + p * (suggested[hits] ?? 0), 0);
  console.log(`${String(picks).padStart(2)} numéros : RTP ${(rtp * 100).toFixed(2)}% → proposition [${suggested.join(', ')}] = ${(check * 100).toFixed(2)}%`);
}

// ---------- Wheel : moyenne exacte des segments ----------
console.log('\n=== WHEEL (exact) ===');
for (const risk of ['faible', 'moyen', 'eleve'] as const) {
  const segments = wheelSegments(risk);
  const rtp = segments.reduce((sum, value) => sum + value, 0) / segments.length;
  // On ajuste le dernier segment « d'équilibrage » pour tomber pile sur la cible
  const others = segments.slice(0, -1).reduce((sum, value) => sum + value, 0);
  const last = Math.round((TARGET_WHEEL * segments.length - others) * 100) / 100;
  console.log(`${risk.padEnd(7)} : RTP ${(rtp * 100).toFixed(2)}% → dernier segment ${last} (au lieu de ${segments[segments.length - 1]})`);
}

// ---------- Slots : Monte-Carlo + facteur d'échelle ----------
console.log('\n=== SLOTS (Monte-Carlo 300 000 spins) ===');
const seed = newServerSeed();
const client = newClientSeed();
let nonce = 0;

for (const config of SLOT_CONFIGS) {
  const game = createSlot(config);
  let total = 0;
  let hits = 0;
  const rounds = 300_000;
  for (let i = 0; i < rounds; i++) {
    const { multiplier } = game.play(rng(seed, client, nonce++), undefined);
    total += multiplier;
    if (multiplier > 0) hits += 1;
  }
  const rtp = total / rounds;
  const scale = config.math.rtp / rtp;
  console.log(`\n${config.name} : RTP mesuré ${(rtp * 100).toFixed(2)}% (cible ${(config.math.rtp * 100).toFixed(1)}%) · gains ${((hits / rounds) * 100).toFixed(1)}% · facteur ${scale.toFixed(4)}`);
  for (const symbol of config.symbols) {
    const scaled = symbol.pays.map((pay) => (pay === 0 ? 0 : Math.max(1, Math.round(pay * scale))));
    console.log(`  ${symbol.id.padEnd(9)} [${symbol.pays.join(', ')}] → [${scaled.join(', ')}]`);
  }
  if (config.scatter?.pays) {
    console.log(`  scatterPays [${config.scatter.pays.join(', ')}] → [${config.scatter.pays.map((p) => (p === 0 ? 0 : Math.max(1, Math.round(p * scale)))).join(', ')}]`);
  }
}
