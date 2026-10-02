import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { artMatch, artTerm } from './core.js';

const manifests = new Map();
async function installed(base) {
  if (!manifests.has(base)) manifests.set(base, (async () => {
    const dir = path.join(base, 'steamapps'), games = [];
    for (const file of (await readdir(dir).catch(() => [])).filter(f => /^appmanifest_\d+\.acf$/.test(f)).slice(0, 1000)) {
      const text = await readFile(path.join(dir, file), 'utf8').catch(() => '');
      const title = /"name"\s*"([^"\r\n]+)"/.exec(text)?.[1];
      if (title) games.push({ title, id: /\d+/.exec(file)[0] });
    }
    return games;
  })());
  return manifests.get(base);
}
// Lecture limitée aux manifestes et au cache Steam, jamais de parcours du disque.
export async function localGameArt(roots, name, exe = '') {
  const bases = new Set(roots.filter(Boolean));
  const match = /^(.*)[\\/]steamapps[\\/]/i.exec(exe);
  if (match) bases.add(match[1]);
  const libraries = new Set(bases);
  for (const base of bases) {
    const vdf = await readFile(path.join(base, 'steamapps', 'libraryfolders.vdf'), 'utf8').catch(() => '');
    for (const m of vdf.matchAll(/"path"\s*"([^"\r\n]+)"/g)) libraries.add(m[1].replace(/\\\\/g, '\\'));
  }
  let id;
  for (const base of libraries) {
    id = (await installed(base)).find(g => artMatch(artTerm(name), g.title))?.id;
    if (id) break;
  }
  if (!id) return null;
  for (const base of bases) {
    const cache = path.join(base, 'appcache', 'librarycache'), files = [];
    const walk = async (dir, depth = 0) => {
      for (const e of (await readdir(dir, { withFileTypes: true }).catch(() => [])).slice(0, 100)) {
        const f = path.join(dir, e.name);
        if (e.isDirectory() && depth < 2) await walk(f, depth + 1);
        else if (e.isFile() && /^(header|library_hero)(_2x)?\.(jpg|png)$/i.test(e.name)) files.push(f);
      }
    };
    await walk(path.join(cache, id));
    for (const n of ['header.jpg', 'library_hero.jpg']) {
      const f = path.join(cache, `${id}_${n}`);
      if ((await stat(f).catch(() => null))?.isFile()) files.push(f);
    }
    files.sort((a, b) => Number(/hero/.test(a)) - Number(/hero/.test(b)) || Number(/_2x/.test(a)) - Number(/_2x/.test(b)));
    if (files.length) return files[0];
  }
  return null;
}
