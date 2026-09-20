import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * Provably fair (vérifiable par le joueur).
 *
 * - serverSeed : secret du serveur, son hash est publié AVANT de jouer
 * - clientSeed : choisi par le joueur
 * - nonce      : numéro de la manche, incrémenté à chaque partie
 *
 * Le flux d'aléa est HMAC-SHA256(serverSeed, `clientSeed:nonce:cursor`).
 * Après rotation des seeds, l'ancien serverSeed est révélé : n'importe qui peut
 * rejouer chaque manche et vérifier qu'elle n'a pas été truquée.
 */

export const newServerSeed = () => randomBytes(32).toString('hex');
export const hashSeed = (seed: string) => createHash('sha256').update(seed).digest('hex');
export const newClientSeed = () => randomBytes(8).toString('hex');

/** Octets déterministes pour une manche donnée. */
export function seedBytes(serverSeed: string, clientSeed: string, nonce: number, count: number): number[] {
  const out: number[] = [];
  let cursor = 0;
  while (out.length < count) {
    const digest = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${cursor}`).digest();
    for (const byte of digest) {
      out.push(byte);
      if (out.length >= count) break;
    }
    cursor += 1;
  }
  return out;
}

/**
 * Suite de nombres dans [0,1), chacun construit sur 4 octets (comme les casinos « provably fair » connus).
 */
export function floats(serverSeed: string, clientSeed: string, nonce: number, count: number): number[] {
  const bytes = seedBytes(serverSeed, clientSeed, nonce, count * 4);
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    let value = 0;
    for (let j = 0; j < 4; j++) value += bytes[i * 4 + j] / 256 ** (j + 1);
    values.push(value);
  }
  return values;
}

/**
 * Générateur paresseux : pratique quand on ne sait pas d'avance combien de tirages il faut.
 * Le flux est déterministe, donc en regénérer une version plus longue redonne les mêmes valeurs.
 */
export function rng(serverSeed: string, clientSeed: string, nonce: number) {
  let index = 0;
  let stream: number[] = [];
  return () => {
    if (index >= stream.length) stream = floats(serverSeed, clientSeed, nonce, index + 64);
    const value = stream[index];
    index += 1;
    return value;
  };
}

/** Mélange de Fisher-Yates déterministe (cartes, grilles). */
export function shuffle<T>(items: T[], values: number[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(values[copy.length - 1 - i] * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Tirage sans remise de `count` entiers dans [0, max). */
export function pickUnique(max: number, count: number, values: number[]): number[] {
  const pool = Array.from({ length: max }, (_, i) => i);
  const picked: number[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(values[i] * pool.length);
    picked.push(pool.splice(Math.min(index, pool.length - 1), 1)[0]);
  }
  return picked;
}
