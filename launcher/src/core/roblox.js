// Roblox : il ne passe par aucun launcher et s'installe dans le dossier de l'utilisateur, une version par dossier
// (…\Roblox\Versions\version-xxxx\RobloxPlayerBeta.exe). Bloxstrap et Fishstrap gardent la même structure.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export function robloxDirs(env = process.env) {
  const local = env.LOCALAPPDATA ?? path.join(env.USERPROFILE ?? '', 'AppData', 'Local');
  return [
    path.join(local, 'Roblox', 'Versions'), path.join(local, 'Bloxstrap', 'Versions'), path.join(local, 'Fishstrap', 'Versions'),
    path.join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Roblox', 'Versions'),
  ];
}

/** Le Roblox installé le plus récent, ou [] s'il n'y en a pas. */
export async function scanRoblox(dirs = robloxDirs()) {
  let best = null;
  for (const dir of dirs) {
    for (const v of await readdir(dir).catch(() => [])) {
      const exe = path.join(dir, v, 'RobloxPlayerBeta.exe');
      const s = await stat(exe).catch(() => null);
      if (s && (!best || s.mtimeMs > best.t)) best = { exe, dir, t: s.mtimeMs, size: s.size };
    }
  }
  if (!best) return [];
  return [{
    id: 'roblox:player', source: 'roblox', kind: 'game', category: 'jeu', name: 'Roblox', installed: true,
    // Le dossier « Versions » entier : le temps de jeu reste compté après une mise à jour (nouveau sous-dossier)
    installDir: best.dir, exe: best.exe, size: best.size, minutes: 0, lastPlayed: 0, art: {}, known: true,
  }];
}
