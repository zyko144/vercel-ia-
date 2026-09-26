// Steam : bibliothèques (libraryfolders.vdf), jeux installés (appmanifest_*.acf) et temps de jeu
// (userdata/<compte>/config/localconfig.vdf, qui garde aussi les jeux désinstallés).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseVdf, pick } from './vdf.js';

// Outils Steam qui ne sont pas des jeux
const NOT_GAMES = new Set(['228980', '1070560', '1391110', '1628350', '1493710', '2180100', '250820', '1826330']);
/** Images officielles d'un jeu Steam : jaquette, grand fond, bannière et logo détouré. */
export const steamArt = (id) => ({
  cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
  hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`,
  header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
  logo: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/logo.png`,
});
const art = steamArt;

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
    installed.add(id);
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

/** Le compte Steam utilisé en dernier (SteamID64), pour lister tous les jeux possédés avec une clé d'API. */
export async function lastSteamUser(steamPath) {
  const text = await readFile(path.join(steamPath ?? '', 'config', 'loginusers.vdf'), 'utf8').catch(() => null);
  const users = text ? pick(parseVdf(text), 'users') ?? {} : {};
  const ids = Object.keys(users);
  return ids.find((id) => pick(users[id], 'MostRecent') === '1') ?? ids[0] ?? null;
}

/** Tous les jeux possédés (même jamais installés), avec la clé d'API Steam de l'utilisateur. */
export async function ownedSteamGames(apiKey, steamId, fetchImpl = fetch) {
  if (!apiKey || !steamId) return [];
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&include_played_free_games=1&format=json`;
  const data = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return (data?.response?.games ?? []).map((g) => ({
    id: `steam:${g.appid}`, source: 'steam', kind: 'game', name: g.name ?? null, installed: false, size: 0,
    minutes: g.playtime_forever ?? 0, lastPlayed: (g.rtime_last_played ?? 0) * 1000, art: art(g.appid), steamId: String(g.appid),
  }));
}

/** Fiche complète d'un jeu Steam (description, genres, studio, date, note, captures). */
export async function steamDetails(appid, fetchImpl = fetch) {
  const data = await fetchImpl(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=french&cc=FR`, { signal: AbortSignal.timeout(10_000) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const d = data?.[appid]?.success ? data[appid].data : null;
  if (!d) return null;
  return {
    name: d.name, description: stripHtml(d.short_description ?? ''), developers: d.developers ?? [], publishers: d.publishers ?? [],
    genres: (d.genres ?? []).map((g) => g.description).slice(0, 5), released: d.release_date?.date ?? null,
    score: d.metacritic?.score ?? null, screenshots: (d.screenshots ?? []).slice(0, 8).map((s) => s.path_thumbnail),
    background: d.background_raw ?? d.background ?? null, website: d.website ?? null,
  };
}
const stripHtml = (t) => String(t).replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

/** Succès débloqués / total pour un jeu (clé d'API Steam et profil public). */
export async function steamAchievements(appid, apiKey, steamId, fetchImpl = fetch) {
  if (!apiKey || !steamId) return null;
  const data = await fetchImpl(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?appid=${appid}&key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}`, { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const list = data?.playerstats?.achievements;
  return Array.isArray(list) && list.length ? { done: list.filter((a) => a.achieved).length, total: list.length } : null;
}
