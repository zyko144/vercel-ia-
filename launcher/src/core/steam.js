// Steam : bibliothèques (libraryfolders.vdf), jeux installés (appmanifest_*.acf) et temps de jeu
// (userdata/<compte>/config/localconfig.vdf, qui garde aussi les jeux désinstallés).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseVdf, pick } from './vdf.js';

// Outils Steam qui ne sont pas des jeux
const NOT_GAMES = new Set(['228980', '1070560', '1391110', '1628350', '1493710', '2180100', '250820', '1826330']);
const art = (id) => ({
  cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
  hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`,
  header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
});

async function libraries(steamPath) {
  const text = await readFile(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8').catch(() => null);
  const dirs = new Set([path.join(steamPath, 'steamapps')]);
  const folders = text ? pick(parseVdf(text), 'libraryfolders') ?? {} : {};
  for (const entry of Object.values(folders)) {
    const p = typeof entry === 'string' ? entry : entry?.path;
    if (p) dirs.add(path.join(p.replace(/\\\\/g, '\\'), 'steamapps'));
  }
  return [...dirs];
}

/** Temps de jeu (minutes) et dernière partie, par appid, pour tous les comptes du PC. */
async function playtimes(steamPath) {
  const out = {};
  const userdata = path.join(steamPath, 'userdata');
  for (const account of await readdir(userdata).catch(() => [])) {
    const text = await readFile(path.join(userdata, account, 'config', 'localconfig.vdf'), 'utf8').catch(() => null);
    if (!text) continue;
    const apps = pick(parseVdf(text), 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps') ?? {};
    for (const [id, a] of Object.entries(apps)) {
      const minutes = Number(pick(a, 'Playtime') ?? 0);
      const last = Number(pick(a, 'LastPlayed') ?? 0) * 1000;
      const cur = out[id] ?? { minutes: 0, lastPlayed: 0 };
      out[id] = { minutes: Math.max(cur.minutes, minutes), lastPlayed: Math.max(cur.lastPlayed, last) };
    }
  }
  return out;
}

export async function scanSteam(steamPath) {
  if (!steamPath) return [];
  const times = await playtimes(steamPath);
  const items = [];
  for (const dir of await libraries(steamPath)) {
    for (const file of await readdir(dir).catch(() => [])) {
      if (!/^appmanifest_\d+\.acf$/.test(file)) continue;
      const acf = pick(parseVdf(await readFile(path.join(dir, file), 'utf8').catch(() => '')), 'AppState');
      const id = String(pick(acf, 'appid') ?? '');
      if (!id || NOT_GAMES.has(id)) continue;
      const name = pick(acf, 'name') ?? `Jeu ${id}`;
      if (/redistributable|steamworks common|proton|steam linux runtime/i.test(name)) continue;
      items.push({
        id: `steam:${id}`, source: 'steam', kind: 'game', name, installed: true,
        installDir: path.join(dir, 'common', pick(acf, 'installdir') ?? ''),
        size: Number(pick(acf, 'SizeOnDisk') ?? 0),
        minutes: times[id]?.minutes ?? 0, lastPlayed: times[id]?.lastPlayed || Number(pick(acf, 'LastPlayed') ?? 0) * 1000 || 0,
        art: art(id), steamId: id,
      });
    }
  }
  // Jeux déjà joués mais plus installés : on les garde (le temps de jeu reste), le nom viendra de Steam
  const installed = new Set(items.map((i) => i.steamId));
  for (const [id, t] of Object.entries(times)) {
    if (installed.has(id) || NOT_GAMES.has(id) || t.minutes < 5) continue;
    items.push({ id: `steam:${id}`, source: 'steam', kind: 'game', name: null, installed: false, size: 0, minutes: t.minutes, lastPlayed: t.lastPlayed, art: art(id), steamId: id });
  }
  return items;
}

/** Actions Steam : tout passe par le client Steam (liens steam://). */
export const steamActions = (id) => ({
  launch: `steam://rungameid/${id}`,
  install: `steam://install/${id}`,
  uninstall: `steam://uninstall/${id}`,
  verify: `steam://validate/${id}`,
  store: `https://store.steampowered.com/app/${id}`,
});
