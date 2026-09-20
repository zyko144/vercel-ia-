import { currentUser } from '@/lib/auth';
import { fail, handle, json, rateLimit } from '@/lib/api';
import { actOnRound, currentRound, openRound } from '@/lib/games/play';

/** Manche en cours (reprise après rechargement). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return json({ round: null });
    const { id } = await params;
    return json({ round: await currentRound(user.id, id) });
  });
}

/** Ouvre une manche (la mise est débitée). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return fail('Connecte-toi pour jouer.', 401);
    if (!rateLimit(`open:${user.id}`, 10, 3_000)) return fail('Doucement 🙂', 429);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return json(await openRound({
      userId: user.id,
      gameId: id,
      bet: Number(body.bet),
      options: body.options,
      idempotencyKey: String(body.idempotencyKey ?? ''),
    }));
  });
}

/** Action dans la manche (révéler, encaisser…). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return fail('Connecte-toi pour jouer.', 401);
    if (!rateLimit(`act:${user.id}`, 30, 3_000)) return fail('Doucement 🙂', 429);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return json(await actOnRound({ userId: user.id, gameId: id, action: body.action }));
  });
}
