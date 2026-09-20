import { currentUser } from '@/lib/auth';
import { handle, json } from '@/lib/api';
import { db } from '@/lib/db';
import { levelFromXp, tierOf } from '@/lib/economy/config';

export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return json({ user: null });
    const notifications = await db.notification.count({ where: { userId: user.id, read: false } });
    const { intoLevel, needed } = levelFromXp(user.xp);
    return json({
      user: { ...user, tier: tierOf(user.level).tier, tierColor: tierOf(user.level).color, intoLevel, needed, notifications },
    });
  });
}
