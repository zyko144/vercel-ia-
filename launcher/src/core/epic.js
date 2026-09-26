// Epic Games : un fichier .item (JSON) par jeu installé dans ProgramData\Epic\EpicGamesLauncher\Data\Manifests.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function scanEpic(manifestDir) {
  const items = [];
  for (const file of await readdir(manifestDir).catch(() => [])) {
    if (!file.endsWith('.item')) continue;
    let m;
    try { m = JSON.parse(await readFile(path.join(manifestDir, file), 'utf8')); } catch { continue; }
    if (!m.DisplayName || !m.AppName || m.bIsIncompleteInstall) continue;
    // Les modules (DLC, plugins Unreal) ne sont pas des jeux à part
    if ((m.AppCategories ?? []).some((c) => /plugins|engines|addons/i.test(c)) && !(m.AppCategories ?? []).includes('games')) continue;
    const key = `${m.CatalogNamespace}%3A${m.CatalogItemId}%3A${m.AppName}`;
    items.push({
      id: `epic:${m.AppName}`, source: 'epic', kind: 'game', name: m.DisplayName, installed: true,
      installDir: m.InstallLocation ?? '', exe: m.InstallLocation && m.LaunchExecutable ? path.join(m.InstallLocation, m.LaunchExecutable) : null,
      size: Number(m.InstallSize ?? 0), minutes: 0, lastPlayed: 0, art: {}, epicKey: key,
    });
  }
  return items;
}

export const epicActions = (key) => ({
  launch: `com.epicgames.launcher://apps/${key}?action=launch&silent=true`,
  verify: `com.epicgames.launcher://apps/${key}?action=verify`,
  // Epic ne propose pas de lien de désinstallation : on ouvre la bibliothèque du launcher
  uninstall: 'com.epicgames.launcher://store/library',
});
