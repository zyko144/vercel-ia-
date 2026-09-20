/**
 * Données de départ : catalogue des jeux, jackpots, missions, succès, boutique.
 * Relançable sans risque (upsert partout).
 *
 *   npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import { catalog } from '../src/lib/games/catalog';

const db = new PrismaClient();

async function main() {
  // ---------- Jeux ----------
  for (const game of catalog()) {
    await db.game.upsert({
      where: { id: game.id },
      create: {
        id: game.id,
        name: game.name,
        category: String(game.category),
        rtp: game.rtp ?? 0,
        volatility: game.volatility ?? 'moyenne',
        maxWin: game.maxWin ?? 0,
        accent: game.accent,
        tagline: game.tagline,
        released: game.playable,
        enabled: true,
      },
      update: {
        name: game.name,
        category: String(game.category),
        rtp: game.rtp ?? 0,
        volatility: game.volatility ?? 'moyenne',
        maxWin: game.maxWin ?? 0,
        accent: game.accent,
        tagline: game.tagline,
        released: game.playable,
      },
    });
  }

  // ---------- Jackpots ----------
  const jackpots = [
    { id: 'mini', name: 'Mini Jackpot', amount: 128_450n, seed: 100_000n, odds: 250_000 },
    { id: 'major', name: 'Major Jackpot', amount: 1_248_760n, seed: 750_000n, odds: 3_000_000 },
    { id: 'mega', name: 'Mega Jackpot', amount: 8_421_552n, seed: 5_000_000n, odds: 25_000_000 },
  ];
  for (const jackpot of jackpots) {
    await db.jackpot.upsert({
      where: { id: jackpot.id },
      create: jackpot,
      update: { name: jackpot.name, seed: jackpot.seed, odds: jackpot.odds },
    });
  }

  // ---------- Missions ----------
  const missions = [
    { id: 'daily-rounds', title: 'Chauffe les machines', description: 'Joue 10 parties', metric: 'ROUNDS', target: 10, reward: 2_000, period: 'DAILY' },
    { id: 'daily-wager', title: 'Mise du jour', description: 'Mise 50 000 NV au total', metric: 'WAGER', target: 50_000, reward: 5_000, period: 'DAILY' },
    { id: 'daily-win', title: 'Belle prise', description: 'Gagne 25 000 NV en une journée', metric: 'WIN', target: 25_000, reward: 4_000, period: 'DAILY' },
    { id: 'daily-explore', title: 'Curieux', description: 'Essaie 3 jeux différents', metric: 'GAMES_EXPLORED', target: 3, reward: 3_000, period: 'DAILY' },
    { id: 'weekly-rounds', title: 'Habitué de la maison', description: 'Joue 150 parties cette semaine', metric: 'ROUNDS', target: 150, reward: 15_000, period: 'WEEKLY' },
    { id: 'weekly-explore', title: 'Tour du propriétaire', description: 'Essaie 8 jeux différents cette semaine', metric: 'GAMES_EXPLORED', target: 8, reward: 20_000, period: 'WEEKLY' },
  ];
  for (const mission of missions) {
    await db.mission.upsert({ where: { id: mission.id }, create: mission, update: mission });
  }

  // ---------- Succès ----------
  const achievements = [
    { id: 'first-spin', title: 'Premier tour', description: 'Joue ta première partie', icon: 'spark', tier: 'bronze', reward: 1_000, metric: 'ROUNDS', target: 1 },
    { id: 'lucky-seven', title: 'Lucky Seven', description: 'Gagne 7 parties', icon: 'seven', tier: 'bronze', reward: 3_000, metric: 'WINS', target: 7 },
    { id: 'big-win', title: 'Gros coup', description: 'Décroche un gain de 50× ta mise', icon: 'star', tier: 'silver', reward: 10_000, metric: 'MULTIPLIER', target: 50 },
    { id: 'millionaire', title: 'Millionnaire', description: 'Atteins 1 000 000 NV', icon: 'crown', tier: 'gold', reward: 50_000, metric: 'BALANCE', target: 1_000_000 },
    { id: 'explorer', title: 'Explorateur', description: 'Essaie 15 jeux différents', icon: 'compass', tier: 'silver', reward: 15_000, metric: 'GAMES', target: 15 },
    { id: 'mines-master', title: 'Maître des mines', description: 'Encaisse 10 fois à Mines', icon: 'gem', tier: 'gold', reward: 20_000, metric: 'MINES_CASHOUT', target: 10 },
    { id: 'jackpot-hunter', title: 'Chasseur de jackpot', description: 'Remporte un jackpot', icon: 'jackpot', tier: 'diamond', reward: 100_000, metric: 'JACKPOT', target: 1 },
  ];
  for (const achievement of achievements) {
    await db.achievement.upsert({ where: { id: achievement.id }, create: achievement, update: achievement });
  }

  // ---------- Boutique (cosmétiques, purement décoratifs) ----------
  const items = [
    { id: 'frame-neon', name: 'Cadre Néon', kind: 'FRAME', price: 25_000, rarity: 'rare', dataJson: JSON.stringify({ from: '#ff2d9b', to: '#7b5cff' }) },
    { id: 'frame-gold', name: 'Cadre Or massif', kind: 'FRAME', price: 120_000, rarity: 'epic', dataJson: JSON.stringify({ from: '#f0d38a', to: '#8a6a24' }) },
    { id: 'frame-void', name: 'Cadre Abysse', kind: 'FRAME', price: 500_000, rarity: 'legendary', dataJson: JSON.stringify({ from: '#35d0ff', to: '#06070c' }) },
    { id: 'title-highroller', name: 'Titre « High Roller »', kind: 'TITLE', price: 75_000, rarity: 'epic', dataJson: JSON.stringify({ label: 'High Roller' }) },
    { id: 'title-lucky', name: 'Titre « Chanceux »', kind: 'TITLE', price: 20_000, rarity: 'rare', dataJson: JSON.stringify({ label: 'Chanceux' }) },
    { id: 'theme-midnight', name: 'Thème Minuit', kind: 'THEME', price: 60_000, rarity: 'rare', dataJson: JSON.stringify({ accent: '#7b5cff' }) },
  ];
  for (const item of items) {
    await db.shopItem.upsert({ where: { id: item.id }, create: item, update: item });
  }

  const counts = {
    jeux: await db.game.count(),
    jouables: await db.game.count({ where: { released: true } }),
    jackpots: await db.jackpot.count(),
    missions: await db.mission.count(),
    succès: await db.achievement.count(),
    boutique: await db.shopItem.count(),
  };
  console.log('Données initialisées :', counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
