import { currentUser } from '@/lib/auth';
import { fail, handle, json } from '@/lib/api';
import { claimMission, missionsFor } from '@/lib/economy/missions';

export async function GET() {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return json({ missions: [] });
    return json({ missions: await missionsFor(user.id) });
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await currentUser();
    if (!user) return fail('Connecte-toi.', 401);
    const body = await request.json().catch(() => ({}));
    const result = await claimMission(user.id, String(body.missionId ?? ''));
    if ('error' in result && result.error) return fail(result.error);
    return json(result);
  });
}
