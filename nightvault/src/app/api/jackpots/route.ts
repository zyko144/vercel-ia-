import { handle, json } from '@/lib/api';
import { db } from '@/lib/db';

export async function GET() {
  return handle(async () => {
    const jackpots = await db.jackpot.findMany({ orderBy: { amount: 'desc' } });
    const wins = await db.jackpotWin.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { displayName: true } }, jackpot: { select: { name: true } } },
    });
    return json({ jackpots, wins });
  });
}
