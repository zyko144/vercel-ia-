import { currentUser } from '@/lib/auth';
import { fail, handle, json } from '@/lib/api';
import { db } from '@/lib/db';
import { economy } from '@/lib/economy/config';
import { move } from '@/lib/economy/wallet';

const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

/** Récompense quotidienne : 7 jours, la série repart à zéro si on saute un jour. */
export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return json({ claims: [], day: 1, claimedToday: false });
    const claims = await db.dailyClaim.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 10 });
    const today = dayKey();
    const yesterday = dayKey(new Date(Date.now() - 864e5));
    const last = claims[0];
    const claimedToday = last?.dayKey === today;
    const streak = claimedToday ? last.day : last?.dayKey === yesterday ? (last.day % 7) + 1 : 1;
    return json({
      claims: claims.map((claim) => ({ day: claim.day, amount: claim.amount, dayKey: claim.dayKey })),
      day: streak,
      claimedToday,
      amounts: economy.daily.map((amount) => Math.round(amount * economy.faucetMultiplier)),
    });
  });
}

export async function POST() {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return fail('Connecte-toi.', 401);
    const today = dayKey();
    const existing = await db.dailyClaim.findUnique({ where: { userId_dayKey: { userId: user.id, dayKey: today } } });
    if (existing) return fail('Récompense déjà récupérée aujourd’hui.', 409);

    const last = await db.dailyClaim.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    const yesterday = dayKey(new Date(Date.now() - 864e5));
    const day = last?.dayKey === yesterday ? (last.day % 7) + 1 : 1;
    const amount = Math.round(economy.daily[day - 1] * economy.faucetMultiplier);

    const balance = await db.$transaction(async (tx) => {
      await tx.dailyClaim.create({ data: { userId: user.id, day, amount, dayKey: today } });
      return move(tx, user.id, BigInt(amount), 'DAILY', `daily-${today}`);
    });
    return json({ day, amount, balance });
  });
}
