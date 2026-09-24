/**
 * Convertit les rendus Blender (tools/blender/village.py) en images légères pour le site.
 *
 *   node tools/make-site-images.mjs <dossier des rendus>
 *
 * Le dossier contient loup-lune.png, aube.png et seq/0001.png … seq/0072.png.
 * Résultat : site/images/loup-lune.webp, site/images/aube.webp et site/images/nuit/01.webp …
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const from = process.argv[2];
if (!from) {
  console.error('Usage : node tools/make-site-images.mjs <dossier des rendus>');
  process.exit(1);
}
const OUT = path.resolve('site/images');
await mkdir(path.join(OUT, 'nuit'), { recursive: true });

let total = 0;
async function convert(input, output, { width, quality }) {
  await sharp(input).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 6 }).toFile(output);
  const { size } = await stat(output);
  total += size;
  return size;
}

for (const name of ['loup-lune', 'aube']) {
  const size = await convert(path.join(from, `${name}.png`), path.join(OUT, `${name}.webp`), { width: 1600, quality: 78 });
  console.log(`  ${name}.webp — ${(size / 1024).toFixed(0)} Ko`);
}

// La séquence de l'ouverture : une image par cran de défilement.
const frames = (await readdir(path.join(from, 'seq'))).filter((f) => f.endsWith('.png')).sort();
for (const [i, file] of frames.entries()) {
  await convert(path.join(from, 'seq', file), path.join(OUT, 'nuit', `${String(i + 1).padStart(2, '0')}.webp`), { width: 1280, quality: 64 });
}
console.log(`  nuit/ — ${frames.length} images`);
console.log(`Total : ${(total / 1024 / 1024).toFixed(1)} Mo`);
