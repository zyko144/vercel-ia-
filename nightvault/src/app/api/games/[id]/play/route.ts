import { currentUser } from '@/lib/auth';
import { fail, handle, json, rateLimit } from '@/lib/api';
import { playInstant } from '@/lib/games/play';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return fail('Connecte-toi pour jouer.', 401);
    if (!rateLimit(`play:${user.id}`, 12, 3_000)) return fail('Doucement 🙂', 429);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await playInstant({
      userId: user.id,
      gameId: id,
      bet: Number(body.bet),
      options: body.options,
      idempotencyKey: String(body.idempotencyKey ?? ''),
    });
    return json(result);
  });
}
