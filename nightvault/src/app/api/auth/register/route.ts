import { checkCredentials, register } from '@/lib/auth';
import { fail, handle, json, rateLimit } from '@/lib/api';

export async function POST(request: Request) {
  return handle(async () => {
    const ip = request.headers.get('x-forwarded-for') ?? 'local';
    if (!rateLimit(`register:${ip}`, 5, 60_000)) return fail('Trop de tentatives, réessaie dans une minute.', 429);

    const body = await request.json().catch(() => ({}));
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const problem = checkCredentials(username, password);
    if (problem) return fail(problem);

    const result = await register(username, password, body.displayName);
    if ('error' in result) return fail(String(result.error));
    return json({ ok: true, username: result.user.username });
  });
}
