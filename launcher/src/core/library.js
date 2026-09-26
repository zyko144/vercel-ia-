// La bibliothèque : réunit Steam, Epic et le registre, ajoute le temps suivi par le launcher, trie et filtre.
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanEpic } from './epic.js';
import { UNINSTALL_KEYS, programsFromRegistry, readRegValue, readRegistry } from './registry.js';
import { lastSteamUser, ownedSteamGames, scanSteam } from './steam.js';
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

const epicData = () => path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data');
export const epicManifests = () => path.join(epicData(), 'Manifests');
export const epicCatalog = () => path.join(epicData(), 'Catalog');

/** Tout ce qui est sur le PC (et ce qui est possédé mais pas installé). `paths` permet de pointer ailleurs (bancs d'essai). */
export async function scanAll(paths = {}, { steamApiKey = null, fetchImpl = fetch } = {}) {
  const steamDir = paths.steam ?? await steamPath();
  const [steam, epic, reg, owned] = await Promise.all([
    scanSteam(steamDir),
    scanEpic(paths.epic ?? epicManifests(), paths.epicCatalog ?? epicCatalog()),
    paths.registry ? Promise.resolve(paths.registry) : Promise.all(UNINSTALL_KEYS.map(readRegistry)).then((l) => l.flat()),
    steamApiKey ? lastSteamUser(steamDir).then((id) => ownedSteamGames(steamApiKey, id, fetchImpl)) : Promise.resolve([]),
  ]);
  // Jeux Steam possédés (clé d'API) : ajoutés s'ils manquent, sinon ils complètent le nom et le temps de jeu
  const bySteam = new Map(steam.map((i) => [i.steamId, i]));
  for (const g of owned) {
    const local = bySteam.get(g.steamId);
    if (!local) { steam.push(g); bySteam.set(g.steamId, g); continue; }
    local.name ??= g.name;
    local.minutes = Math.max(local.minutes, g.minutes);
    local.lastPlayed = Math.max(local.lastPlayed, g.lastPlayed);
  }
  const programs = programsFromRegistry(reg);
  // Un jeu Steam/Epic peut aussi apparaître dans le registre : on garde la version du launcher
  const known = new Set([...steam, ...epic].filter((i) => i.name).map((i) => norm(i.name)));
  return [...steam, ...epic, ...programs.filter((p) => !known.has(norm(p.name)))];
}

/** Ajoute le temps suivi par le launcher, les images et fiches trouvées en ligne, et les réglages de l'utilisateur. */
export function merge(items, store) {
  return dedupe(items.map((i) => {
    const t = store.time?.[i.id] ?? { minutes: 0, lastPlayed: 0 };
    const extra = store.items?.[i.id] ?? {};
    const found = store.art?.[i.id] ?? {};
    const art = { ...Object.fromEntries(Object.entries(found.art ?? {}).filter(([, v]) => v)), ...Object.fromEntries(Object.entries(i.art ?? {}).filter(([, v]) => v)) };
    return {
      ...i, name: i.name ?? extra.name ?? store.names?.[i.steamId] ?? `Jeu Steam ${i.steamId}`,
      art, details: found.details ?? i.details ?? null, matchSteamId: found.steamId ?? i.steamId ?? null,
      minutes: Math.max(i.minutes, 0) + t.minutes, lastPlayed: Math.max(i.lastPlayed, t.lastPlayed),
      favorite: Boolean(extra.favorite), hidden: Boolean(extra.hidden),
    };
  }));
}

/**
 * Un même jeu possédé sur plusieurs magasins (GTA V sur Steam et Epic) : une seule carte, celle qui est installée
 * (sinon la plus jouée), avec le temps de jeu additionné et la liste des autres magasins.
 */
function dedupe(list) {
  const groups = new Map();
  const out = [];
  for (const i of list) {
    if (i.kind !== 'game') { out.push(i); continue; }
    const key = norm(i.name);
    if (!groups.has(key)) { groups.set(key, [i]); out.push(key); } else groups.get(key).push(i);
  }
  return out.map((x) => {
    if (typeof x !== 'string') return x;
    const g = groups.get(x);
    if (g.length === 1) return g[0];
    const [main, ...others] = [...g].sort((a, b) => (b.installed - a.installed) || (b.minutes - a.minutes));
    return {
      ...main, minutes: g.reduce((n, i) => n + i.minutes, 0), lastPlayed: Math.max(...g.map((i) => i.lastPlayed)),
      art: { ...Object.fromEntries(others.flatMap((o) => Object.entries(o.art ?? {})).filter(([, v]) => v)), ...Object.fromEntries(Object.entries(main.art ?? {}).filter(([, v]) => v)) },
      details: main.details ?? others.find((o) => o.details)?.details ?? null,
      alsoOn: others.map((o) => ({ id: o.id, source: o.source, installed: o.installed })),
      favorite: g.some((i) => i.favorite), hidden: g.every((i) => i.hidden),
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
