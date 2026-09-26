// La bibliothèque : réunit Steam, Epic et le registre, ajoute le temps suivi par le launcher, trie et filtre.
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanEpic } from './epic.js';
import { UNINSTALL_KEYS, programsFromRegistry, readRegValue, readRegistry } from './registry.js';
import { scanSteam } from './steam.js';
import { norm } from './sort.js';

export { SORTS, filterSort } from './sort.js';

export const SOURCES = {
  steam: { label: 'Steam', color: '#66c0f4' },
  epic: { label: 'Epic Games', color: '#e6e6e6' },
  riot: { label: 'Riot', color: '#ff4655' },
  ubisoft: { label: 'Ubisoft', color: '#2c7cff' },
  ea: { label: 'EA', color: '#ff4747' },
  battlenet: { label: 'Battle.net', color: '#148eff' },
  gog: { label: 'GOG', color: '#b44fe0' },
  pc: { label: 'PC', color: '#9aa0aa' },
};

export async function steamPath() {
  const fromReg = await readRegValue('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  if (fromReg) return fromReg.replace(/\//g, '\\');
  const guess = 'C:\\Program Files (x86)\\Steam';
  return (await stat(guess).catch(() => null)) ? guess : null;
}

export const epicManifests = () => path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');

/** Tout ce qui est sur le PC. `paths` permet de pointer ailleurs (bancs d'essai). */
export async function scanAll(paths = {}) {
  const [steam, epic, reg] = await Promise.all([
    scanSteam(paths.steam ?? await steamPath()),
    scanEpic(paths.epic ?? epicManifests()),
    paths.registry ? Promise.resolve(paths.registry) : Promise.all(UNINSTALL_KEYS.map(readRegistry)).then((l) => l.flat()),
  ]);
  const programs = programsFromRegistry(reg);
  // Un jeu Steam/Epic peut aussi apparaître dans le registre : on garde la version du launcher
  const known = new Set([...steam, ...epic].filter((i) => i.name).map((i) => norm(i.name)));
  return [...steam, ...epic, ...programs.filter((p) => !known.has(norm(p.name)))];
}


/** Ajoute le temps suivi par le launcher (applis, jeux hors Steam) et les réglages de l'utilisateur. */
export function merge(items, store) {
  return items.map((i) => {
    const t = store.time?.[i.id] ?? { minutes: 0, lastPlayed: 0 };
    const extra = store.items?.[i.id] ?? {};
    return {
      ...i, name: i.name ?? extra.name ?? store.names?.[i.steamId] ?? `Jeu Steam ${i.steamId}`,
      minutes: Math.max(i.minutes, 0) + t.minutes, lastPlayed: Math.max(i.lastPlayed, t.lastPlayed),
      favorite: Boolean(extra.favorite), hidden: Boolean(extra.hidden),
    };
  });
}

/** Cherche l'exécutable principal d'un dossier (le plus gros .exe qui n'est pas un installeur). */
export async function findExe(dir, depth = 2) {
  if (!dir) return null;
  let best = null;
  const walk = async (d, level) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && level < depth && !/redist|support|_commonredist|directx|dotnet|installer/i.test(e.name)) await walk(full, level + 1);
      else if (e.isFile() && /\.exe$/i.test(e.name) && !/unins|setup|crash|report|update|helper|launcherpatcher|vc_redist|dxsetup/i.test(e.name)) {
        const size = (await stat(full).catch(() => ({ size: 0 }))).size;
        if (!best || size > best.size) best = { path: full, size };
      }
    }
  };
  await walk(dir, 0);
  return best?.path ?? null;
}

export const homeDir = () => os.homedir();
