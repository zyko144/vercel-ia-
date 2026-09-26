// Nettoyage : caches qui se recréent tout seuls (navigateurs intégrés des launchers, shaders, fichiers temporaires).
// Seul le CONTENU de chaque dossier listé est supprimé ; les fichiers en cours d'utilisation sont simplement sautés.
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { folderSize } from './manage.js';

export function cleanTargets(env = process.env, steamRoot = null) {
  const local = env.LOCALAPPDATA ?? '';
  const roaming = env.APPDATA ?? '';
  const t = (id, label, dir, note = '') => ({ id, label, dir, note });
  const list = [
    t('temp', 'Fichiers temporaires de Windows', env.TEMP ?? path.join(local, 'Temp')),
    t('d3d', 'Cache DirectX (shaders)', path.join(local, 'D3DSCache'), 'Recréé au prochain lancement des jeux'),
    t('nvdx', 'Cache NVIDIA (DirectX)', path.join(local, 'NVIDIA', 'DXCache'), 'Recréé au prochain lancement des jeux'),
    t('nvgl', 'Cache NVIDIA (OpenGL)', path.join(local, 'NVIDIA', 'GLCache')),
    t('amddx', 'Cache AMD (DirectX)', path.join(local, 'AMD', 'DxCache')),
    t('amdvk', 'Cache AMD (Vulkan)', path.join(local, 'AMD', 'VkCache')),
    t('steamweb', 'Cache web de Steam', path.join(local, 'Steam', 'htmlcache')),
    t('epicweb', 'Cache web d’Epic Games', path.join(local, 'EpicGamesLauncher', 'Saved', 'webcache')),
    t('epiclogs', 'Journaux d’Epic Games', path.join(local, 'EpicGamesLauncher', 'Saved', 'Logs')),
    t('discord', 'Cache de Discord', path.join(roaming, 'discord', 'Cache'), 'Ferme Discord pour tout vider'),
    t('dumps', 'Rapports de plantage', path.join(local, 'CrashDumps')),
  ];
  if (steamRoot) list.push(t('steamhttp', 'Cache des images Steam', path.join(steamRoot, 'appcache', 'httpcache')));
  return list.filter((x) => x.dir && path.isAbsolute(x.dir));
}

export async function measureTargets(targets) {
  return Promise.all(targets.map(async (x) => ({ ...x, bytes: (await stat(x.dir).catch(() => null))?.isDirectory() ? (await folderSize(x.dir)).bytes : 0 })));
}

/** Vide un dossier de la liste (jamais le dossier lui-même, jamais en dehors). Renvoie les octets libérés. */
export async function cleanTarget(target) {
  const before = (await folderSize(target.dir)).bytes;
  for (const e of await readdir(target.dir).catch(() => [])) {
    const full = path.join(target.dir, e);
    if (path.dirname(full) !== path.normalize(target.dir)) continue;
    await rm(full, { recursive: true, force: true, maxRetries: 0 }).catch(() => {});
  }
  const after = (await folderSize(target.dir)).bytes;
  return Math.max(0, before - after);
}
