// Petites données du launcher (temps suivi, favoris, réglages) dans un fichier JSON du profil Windows.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createStore(dir) {
  const file = path.join(dir, 'bibliotheque.json');
  let data = { time: {}, items: {}, names: {}, settings: { autostart: true } };
  let timer = null;
  return {
    async load() {
      try { data = { ...data, ...JSON.parse(await readFile(file, 'utf8')) }; } catch { /* premier lancement */ }
      return data;
    },
    get data() { return data; },
    save() {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await mkdir(dir, { recursive: true });
        // Écriture atomique : un fichier à moitié écrit ne remplace jamais le bon
        await writeFile(`${file}.tmp`, JSON.stringify(data));
        await rename(`${file}.tmp`, file);
      }, 500);
    },
  };
}
