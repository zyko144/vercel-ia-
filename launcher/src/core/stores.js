// Jeux GOG et Ubisoft Connect lus dans le registre de Windows (dossier, exécutable, identifiant du magasin).
import path from 'node:path';

const val = (e, k) => e.values?.[k] ?? null;

/** GOG : HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\<id> (gameName, path, exe). Jeux sans DRM : lancés directement. */
export function gogGames(entries) {
  return entries.filter((e) => /\\GOG\.com\\Games\\\d+$/i.test(e.key) && val(e, 'gameName') && val(e, 'path')).map((e) => {
    const id = e.key.split('\\').pop();
    const dir = String(val(e, 'path'));
    const exe = val(e, 'exe') ? (path.isAbsolute(String(val(e, 'exe'))) ? String(val(e, 'exe')) : path.join(dir, String(val(e, 'exe')))) : null;
    return { id: `gog:${id}`, source: 'gog', kind: 'game', category: 'jeu', name: String(val(e, 'gameName')), installed: true, installDir: dir, exe, gogId: id, size: 0, minutes: 0, lastPlayed: 0, art: {} };
  });
}

/** Ubisoft Connect : HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\<id> (InstallDir). */
export function ubisoftGames(entries) {
  return entries.filter((e) => /\\Ubisoft\\Launcher\\Installs\\\d+$/i.test(e.key) && val(e, 'InstallDir')).map((e) => {
    const id = e.key.split('\\').pop();
    const dir = String(val(e, 'InstallDir')).replace(/[\\/]+$/, '');
    return { id: `ubisoft:${id}`, source: 'ubisoft', kind: 'game', category: 'jeu', name: path.basename(dir.replace(/\//g, '\\').split('\\').pop() ?? dir), installed: true, installDir: dir, exe: null, ubiId: id, size: 0, minutes: 0, lastPlayed: 0, art: {} };
  });
}
