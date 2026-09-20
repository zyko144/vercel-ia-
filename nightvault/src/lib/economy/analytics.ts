import { db } from '@/lib/db';

/** Photographie de l'économie : masse monétaire, flux du jour, distribution des soldes. */
export async function economySnapshot() {
  const [wallets, created, destroyed, bets, payouts, jackpots, players] = await Promise.all([
    db.wallet.findMany({ select: { balance: true } }),
    db.transaction.aggregate({ _sum: { amount: true }, where: { amount: { gt: 0 }, kind: { not: 'WIN' } } }),
    db.transaction.aggregate({ _sum: { amount: true }, where: { amount: { lt: 0 }, kind: { not: 'BET' } } }),
    db.transaction.aggregate({ _sum: { amount: true }, where: { kind: 'BET' } }),
    db.transaction.aggregate({ _sum: { amount: true }, where: { kind: 'WIN' } }),
    db.jackpot.findMany(),
    db.user.count(),
  ]);

  const balances = wallets.map((wallet) => Number(wallet.balance)).sort((a, b) => a - b);
  const supply = balances.reduce((sum, value) => sum + value, 0);
  const median = balances.length ? balances[Math.floor(balances.length / 2)] : 0;
  const totalBet = Math.abs(Number(bets._sum.amount ?? 0));
  const totalPayout = Number(payouts._sum.amount ?? 0);

  const since = new Date(Date.now() - 24 * 3_600_000);
  const [todayIn, todayOut] = await Promise.all([
    db.transaction.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: since }, amount: { gt: 0 } } }),
    db.transaction.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: since }, amount: { lt: 0 } } }),
  ]);

  return {
    players,
    supply,
    average: balances.length ? Math.round(supply / balances.length) : 0,
    median,
    deciles: Array.from({ length: 9 }, (_, index) => balances[Math.floor((balances.length * (index + 1)) / 10)] ?? 0),
    created: Number(created._sum.amount ?? 0),
    destroyed: Math.abs(Number(destroyed._sum.amount ?? 0)),
    totalBet,
    totalPayout,
    houseEdge: totalBet > 0 ? 1 - totalPayout / totalBet : 0,
    today: { in: Number(todayIn._sum.amount ?? 0), out: Math.abs(Number(todayOut._sum.amount ?? 0)) },
    jackpots: jackpots.map((jackpot) => ({ id: jackpot.id, name: jackpot.name, amount: Number(jackpot.amount) })),
    broke: balances.filter((value) => value < 500).length,
  };
}

/** RTP réellement constaté par jeu (à comparer au RTP théorique). */
export async function gameStats() {
  const rows = await db.gameRound.groupBy({
    by: ['gameId'],
    _sum: { bet: true, payout: true },
    _count: { id: true },
  });
  const games = await db.game.findMany({ select: { id: true, name: true, rtp: true, category: true } });
  return rows
    .map((row) => {
      const bet = Number(row._sum.bet ?? 0);
      const payout = Number(row._sum.payout ?? 0);
      const game = games.find((entry) => entry.id === row.gameId);
      return {
        id: row.gameId,
        name: game?.name ?? row.gameId,
        category: game?.category ?? '—',
        rounds: row._count.id,
        bet,
        payout,
        realRtp: bet > 0 ? payout / bet : 0,
        targetRtp: game?.rtp ?? 0,
      };
    })
    .sort((a, b) => b.rounds - a.rounds);
}
