// La bibliothèque : réunit Steam, Epic et le registre, ajoute le temps suivi par le launcher, trie et filtre.
import { scanRoblox } from './roblox.js';
import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanEpic } from './epic.js';
import { UNINSTALL_KEYS, programsFromRegistry, readRegValue, readRegistry } from './registry.js';
import { lastSteamUser, ownedSteamGames, scanSteam } from './steam.js';
import { norm } from './sort.js';

export { SORTS, filterSort } from './sort.js';

// Le nom du launcher dans Windows : son icône sert de logo officiel dans la barre de gauche
export const LAUNCHER_NAMES = { steam: /^steam$/i, epic: /^epic games launcher$/i, ubisoft: /^ubisoft connect$/i, ea: /^(ea app|ea desktop|origin)$/i, battlenet: /^battle\.net$/i, gog: /^gog galaxy$/i, riot: /^riot client$/i, rockstar: /^rockstar games launcher$/i, roblox: /^roblox( player)?$/i };

export const SOURCES = {
  steam: { label: 'Steam', color: '#66c0f4', logo: 'brands/steam.svg', bg: '#1b2838' },
  epic: { label: 'Epic Games', color: '#e6e6e6', logo: 'brands/epicgames.svg', bg: '#2a2a2a' },
  riot: { label: 'Riot', color: '#ff4655', logo: 'brands/riotgames.svg', bg: '#eb0029' },
  ubisoft: { label: 'Ubisoft', color: '#2c7cff', logo: 'brands/ubisoft.svg', bg: '#0070ff' },
  ea: { label: 'EA', color: '#ff4747', logo: 'brands/ea.svg', bg: '#ff4747' },
  battlenet: { label: 'Battle.net', color: '#148eff', logo: 'brands/battledotnet.svg', bg: '#148eff' },
  gog: { label: 'GOG', color: '#b44fe0', logo: 'brands/gogdotcom.svg', bg: '#86328a' },
  roblox: { label: 'Roblox', color: '#e2231a', logo: 'brands/roblox.svg', bg: '#e2231a' },
  rockstar: { label: 'Rockstar', color: '#fcaf17', logo: 'brands/rockstargames.svg', bg: '#e59a00' },
  fivem: { label: 'FiveM', color: '#f40552', logo: 'brands/fivem.svg', bg: '#f40552' },
  xbox: { label: 'Xbox', color: '#107c10', bg: '#107c10' },
  custom: { label: 'Ajoutés', color: '#9aa0aa', logo: 'brands/windows.svg', bg: '#3a4150' },
  pc: { label: 'PC', color: '#9aa0aa', logo: 'brands/windows.svg', bg: '#0078d4' },
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
const ROBLOX_BRAND = { color: '#e2231a', logo: 'brands/roblox.svg' };

export async function scanAll(paths = {}, { steamApiKey = null, fetchImpl = fetch } = {}) {
  const steamDir = paths.steam ?? await steamPath();
  const [steam, epic, reg, owned, roblox] = await Promise.all([
    scanSteam(steamDir),
    scanEpic(paths.epic ?? epicManifests(), paths.epicCatalog ?? epicCatalog()),
    paths.registry ? Promise.resolve(paths.registry) : Promise.all(UNINSTALL_KEYS.map(readRegistry)).then((l) => l.flat()),
    steamApiKey ? lastSteamUser(steamDir).then((id) => ownedSteamGames(steamApiKey, id, fetchImpl)) : Promise.resolve([]),
    paths.roblox ? scanRoblox(paths.roblox) : paths.registry ? Promise.resolve([]) : scanRoblox(),
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
  let programs = programsFromRegistry(reg);
  // Roblox : trouvé dans ses dossiers ; sinon son entrée du registre devient le jeu Roblox
  const isPlayer = (p) => /^roblox( player)?$/i.test(p.name) || /^(bloxstrap|fishstrap)$/i.test(p.name);
  if (roblox.length) {
    roblox[0].uninstallCmd = programs.find((p) => /^roblox( player)?$/i.test(p.name))?.uninstallCmd ?? null;
    programs = programs.filter((p) => !isPlayer(p));
  }
  else programs = programs.map((p) => (/^roblox( player)?$/i.test(p.name) ? { ...p, id: 'roblox:player', name: 'Roblox', source: 'roblox', kind: 'game', category: 'jeu', known: true, brand: ROBLOX_BRAND } : p));
  // Un jeu Steam/Epic peut aussi apparaître dans le registre : on garde la version du launcher
  const known = new Set([...steam, ...epic].filter((i) => i.name).map((i) => norm(i.name)));
  for (const r of roblox) r.brand = ROBLOX_BRAND;
  return [...steam, ...epic, ...roblox, ...programs.filter((p) => !known.has(norm(p.name)))];
}

/** Ajoute le temps suivi par le launcher, les images et fiches trouvées en ligne, et les réglages de l'utilisateur. */
/**
 * Temps de jeu d'un élément, pour le compte choisi (ou tous les comptes si « temps total » est activé) :
 *  - jeu Steam : le temps officiel de Steam du compte choisi (le chronomètre du launcher n'est pas ajouté :
 *    ce serait compter deux fois la même partie) ;
 *  - autres jeux et applis : le chronomètre du launcher, rangé par compte (Epic, EA… : compte choisi dans les paramètres).
 */
export function playtimeOf(i, store, { total = false, steamAccount = null, accountFor = () => 'principal' } = {}) {
  const sum = (list) => list.reduce((a, t) => ({ minutes: a.minutes + (t?.minutes ?? 0), lastPlayed: Math.max(a.lastPlayed, t?.lastPlayed ?? 0) }), { minutes: 0, lastPlayed: 0 });
  if (i.steamTimes && Object.keys(i.steamTimes).length) {
    const chosen = total || !steamAccount ? Object.values(i.steamTimes) : [i.steamTimes[steamAccount]];
    const steam = sum(chosen);
    const recent = chosen.reduce((n, t) => n + (t?.recent ?? 0), 0);
    const tracked = store.timeBy?.[i.id] ?? {};
    const seen = Math.max(...Object.values(tracked).map((t) => t.lastPlayed ?? 0), store.time?.[i.id]?.lastPlayed ?? 0, 0);
    return { minutes: steam.minutes + (store.offSteam?.[i.id] ?? 0), lastPlayed: Math.max(steam.lastPlayed, seen), recent };
  }
  // FiveM : temps tiré de ses journaux de session (déjà complet, on n'ajoute pas le suivi pour ne rien compter deux fois)
  if (i.timeFromLogs) {
    const seen = Math.max(...Object.values(store.timeBy?.[i.id] ?? {}).map((t) => t.lastPlayed ?? 0), 0);
    return { minutes: i.minutes ?? 0, lastPlayed: Math.max(i.lastPlayed ?? 0, seen) };
  }
  const by = store.timeBy?.[i.id] ?? {};
  const legacy = store.time?.[i.id];
  const mine = total ? Object.values(by) : [by[accountFor(i)]];
  const tracked = sum([...mine, legacy]);
  return { minutes: Math.max(i.minutes ?? 0, 0) + tracked.minutes, lastPlayed: Math.max(i.lastPlayed ?? 0, tracked.lastPlayed) };
}

const realName = (n) => (n && !/^Jeu Steam \d+$/.test(n) ? n : null);

// Ce qui n'est pas un jeu pour Steam : serveurs dédiés, redistribuables, SDK, contenus additionnels, bandes-son…
const NOT_GAMES = new Set(['tool', 'config', 'dlc', 'music', 'video', 'series', 'episode', 'hardware', 'beta', 'advertising', 'plugin']);

export function merge(items, store, localUrls = null, timeOptions = {}) {
  // Jeu Steam sans vrai nom (ni sur le PC, ni sur le magasin) : on ne l'affiche pas plutôt que « Jeu Steam 123 »
  const shown = items.filter((i) => i.source !== 'steam' || ((i.name || store.items?.[i.id]?.name || realName(store.names?.[i.steamId])) && !NOT_GAMES.has(store.steamTypes?.[i.steamId])));
  return dedupe(shown.map((i) => {
    const t = playtimeOf(i, store, timeOptions);
    const extra = store.items?.[i.id] ?? {};
    const found = store.art?.[i.id] ?? {};
    const ok = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v));
    // Du moins sûr au plus sûr : ancienne adresse Steam < trouvées en ligne < images du launcher (Epic) < images sur le PC
    const art = { ...ok(i.cdnArt), ...ok(found.art), ...ok(i.art), ...ok(localUrls?.(i.localArt)) };
    return {
      ...i, name: i.name ?? extra.name ?? realName(store.names?.[i.steamId]),
      art, details: found.details ?? i.details ?? null, matchSteamId: found.steamId ?? i.steamId ?? null,
      minutes: t.minutes, lastPlayed: t.lastPlayed, recent2w: t.recent ?? null,
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
