import { currentUser } from '@/lib/auth';
import { fail, handle, json } from '@/lib/api';
import { db } from '@/lib/db';
import { hashSeed, newClientSeed, newServerSeed } from '@/lib/fairness';
import { activeSeed } from '@/lib/games/play';

/** Seeds actifs + anciens seeds révélés (vérifiables). */
export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return json({ active: null, revealed: [] });
    const active = await activeSeed(user.id);
    const revealed = await db.fairnessSeed.findMany({
      where: { userId: user.id, active: false },
      orderBy: { revealedAt: 'desc' },
      take: 10,
    });
    return json({
      active: { serverSeedHash: active.serverSeedHash, clientSeed: active.clientSeed, nonce: active.nonce },
      revealed: revealed.map((seed) => ({ serverSeed: seed.serverSeed, serverSeedHash: seed.serverSeedHash, clientSeed: seed.clientSeed, nonce: seed.nonce, revealedAt: seed.revealedAt })),
    });
  });
}

/** Change de seed client : l'ancien serverSeed est révélé, un nouveau est généré. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return fail('Connecte-toi.', 401);
    const body = await request.json().catch(() => ({}));
    const clientSeed = String(body.clientSeed ?? '').trim().slice(0, 64) || newClientSeed();

    const current = await activeSeed(user.id);
    const serverSeed = newServerSeed();
    const created = await db.$transaction(async (tx) => {
      await tx.fairnessSeed.update({ where: { id: current.id }, data: { active: false, revealedAt: new Date() } });
      return tx.fairnessSeed.create({
        data: { userId: user.id, serverSeed, serverSeedHash: hashSeed(serverSeed), clientSeed },
      });
    });
    return json({
      revealed: { serverSeed: current.serverSeed, serverSeedHash: current.serverSeedHash, clientSeed: current.clientSeed, nonce: current.nonce },
      active: { serverSeedHash: created.serverSeedHash, clientSeed: created.clientSeed, nonce: 0 },
    });
  });
}
