import { currentUser } from '@/lib/auth';
import { fail, handle, json } from '@/lib/api';
import { simulateEconomy } from '@/lib/economy/simulator';

export const maxDuration = 120;

export async function POST(request: Request) {
  return handle(async () => {
    const user = await currentUser();
    if (user?.role !== 'ADMIN') return fail('Réservé à l’administration.', 403);
    const body = await request.json().catch(() => ({}));
    const players = Math.min(100_000, Math.max(10, Number(body.players ?? 1_000)));
    const days = Math.min(90, Math.max(1, Number(body.days ?? 30)));
    return json(simulateEconomy({ players, days, faucetMultiplier: Number(body.faucetMultiplier ?? 1) }));
  });
}
