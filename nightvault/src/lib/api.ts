import { NextResponse } from 'next/server';
import { GameError } from '@/lib/games/play';

/** Les BigInt ne passent pas dans JSON.stringify : on les convertit en nombres (les NV tiennent largement). */
function serialize(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(serialize);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(serialize(data), init);

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Gestion d'erreur commune à toutes les routes. */
export async function handle(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof GameError) return fail(error.message, error.status);
    console.error('[api]', error);
    return fail("Une erreur est survenue, réessaie.", 500);
  }
}

// ===================== Limitation de débit (mémoire du serveur) =====================

const hits = new Map<string, number[]>();

/**
 * Anti-spam simple : `limit` requêtes par fenêtre glissante.
 * (En production multi-instances, à remplacer par Redis — voir README.)
 */
export function rateLimit(key: string, limit = 20, windowMs = 10_000) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) for (const [k, times] of hits) if (!times.some((at) => now - at < windowMs)) hits.delete(k);
  return recent.length <= limit;
}
