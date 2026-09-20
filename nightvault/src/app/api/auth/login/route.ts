import { login } from '@/lib/auth';
import { fail, handle, json, rateLimit } from '@/lib/api';

export async function POST(request: Request) {
  return handle(async () => {
    const ip = request.headers.get('x-forwarded-for') ?? 'local';
    if (!rateLimit(`login:${ip}`, 10, 60_000)) return fail('Trop de tentatives, réessaie dans une minute.', 429);

    const body = await request.json().catch(() => ({}));
    const result = await login(String(body.username ?? '').trim(), String(body.password ?? ''));
    if ('error' in result) return fail(String(result.error), 401);
    return json({ ok: true, username: result.user.username });
  });
}
