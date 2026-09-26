// Contrôle d'intégrité : empreinte SHA-256 de chaque fichier du code (src/, web/). Si le code livré a été
// modifié (copie revendue, fichier piraté sur le serveur), le démarrage le signale au chef.
// Le manifeste se fabrique avec `npm run integrity` ; la vérification se fait si INTEGRITY_CHECK=1.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOTS = ['src', 'web'];
export const MANIFEST = path.resolve('security/manifest.json');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (/\.(js|mjs|html|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

export async function fingerprints() {
  const files = (await Promise.all(ROOTS.map((r) => walk(path.resolve(r))))).flat().sort();
  const map = {};
  for (const f of files) map[path.relative(process.cwd(), f).split(path.sep).join('/')] = createHash('sha256').update(await readFile(f)).digest('hex');
  return map;
}

/** Fichiers modifiés, ajoutés ou supprimés par rapport au manifeste (null s'il n'y a pas de manifeste). */
export async function checkIntegrity() {
  const expected = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => 'null'));
  if (!expected?.files) return null;
  const now = await fingerprints();
  const changed = Object.keys({ ...expected.files, ...now }).filter((f) => expected.files[f] !== now[f]);
  return { changed, version: expected.version };
}
