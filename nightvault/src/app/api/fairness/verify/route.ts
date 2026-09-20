import { createHash } from 'node:crypto';
import { handle, json } from '@/lib/api';
import { floats, hashSeed } from '@/lib/fairness';
import { getGame } from '@/lib/games/registry';

/**
 * Vérificateur public : à partir d'un server seed révélé, d'un client seed et d'un nonce,
 * on rejoue la manche et on renvoie le résultat — n'importe qui peut refaire le calcul.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const serverSeed = String(body.serverSeed ?? '').trim();
    const clientSeed = String(body.clientSeed ?? '').trim();
    const nonce = Number(body.nonce ?? 0);
    const gameId = String(body.gameId ?? '');

    if (!serverSeed || !clientSeed) return json({ error: 'Server seed et client seed sont nécessaires.' }, { status: 400 });

    const hash = hashSeed(serverSeed);
    const values = floats(serverSeed, clientSeed, nonce, 12);
    const game = getGame(gameId);

    let replay: unknown = null;
    if (game && game.kind === 'instant' && body.options !== undefined) {
      const parsed = game.options.safeParse(body.options);
      if (parsed.success) {
        let index = 0;
        const random = () => values[index++ % values.length];
        replay = game.play(random, parsed.data as never);
      }
    }

    return json({
      serverSeedHash: hash,
      hmacPreview: createHash('sha256').update(`${serverSeed}:${clientSeed}:${nonce}`).digest('hex').slice(0, 32),
      values: values.slice(0, 6).map((value) => Number(value.toFixed(8))),
      replay,
    });
  });
}
