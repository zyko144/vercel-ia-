import { currentUser } from '@/lib/auth';
import { handle, json } from '@/lib/api';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return json({ rounds: [] });
    const url = new URL(request.url);
    const gameId = url.searchParams.get('game') ?? undefined;
    const take = Math.min(100, Number(url.searchParams.get('take') ?? 25));
    const rounds = await db.gameRound.findMany({
      where: { userId: user.id, ...(gameId ? { gameId } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, gameId: true, bet: true, payout: true, multiplier: true, createdAt: true, state: true, nonce: true, serverSeedHash: true, clientSeed: true },
    });
    return json({ rounds });
  });
}
