/**
 * Vérifie l'économie : passe les comptes en admin si demandé, puis simule une population
 * de joueurs virtuels avec les vrais moteurs de jeu.
 *
 *   npx tsx scripts/check-economy.ts --players=1000 --days=30 [--admin]
 */
import { PrismaClient } from '@prisma/client';
import { simulateEconomy } from '../src/lib/economy/simulator';

const args = new Map(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=') as [string, string]));
const db = new PrismaClient();

async function main() {
  if (args.has('admin')) {
    const updated = await db.user.updateMany({ data: { role: 'ADMIN' } });
    console.log(`Comptes passés administrateur : ${updated.count}`);
  }

  const players = Number(args.get('players') ?? 1_000);
  const days = Number(args.get('days') ?? 30);
  const started = Date.now();
  const result = simulateEconomy({ players, days });
  const nv = (value: number) => Math.round(value).toLocaleString('fr-FR');

  console.log(`\nSimulation : ${nv(players)} joueurs × ${days} jours (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  console.log(`  masse monétaire : ${nv(result.supply)} NV`);
  console.log(`  solde moyen     : ${nv(result.average)} NV`);
  console.log(`  solde médian    : ${nv(result.median)} NV`);
  console.log(`  inflation       : ${(result.inflationPerDay * 100).toFixed(2)} % / jour (cible < 3 %)`);
  console.log(`  joueurs à sec   : ${(result.brokeShare * 100).toFixed(1)} %`);
  console.log(`  misé / rendu    : ${nv(result.wagered)} / ${nv(result.payout)} NV`);
  console.log(`  faucets / sinks : ${nv(result.faucets)} / ${nv(result.sinks)} NV`);
  console.log(`  déciles         : ${result.deciles.map((value) => nv(value)).join(' · ')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
