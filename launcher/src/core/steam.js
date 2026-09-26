// Steam : bibliothèques (libraryfolders.vdf), jeux installés (appmanifest_*.acf) et temps de jeu
// (userdata/<compte>/config/localconfig.vdf, qui garde aussi les jeux désinstallés).
import { readdir, readFile, stat } from 'node:fs/promises';
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

const STEAM64_BASE = 76561197960265728n;

/** Les comptes Steam de ce PC (config\\loginusers.vdf) : numéro court (dossier userdata), pseudo, compte le plus récent. */
export async function listSteamAccounts(steamPath) {
  const text = await readFile(path.join(steamPath ?? '', 'config', 'loginusers.vdf'), 'utf8').catch(() => null);
  const users = text ? pick(parseVdf(text), 'users') ?? {} : {};
  const list = Object.entries(users).filter(([id]) => /^\d{17}$/.test(id)).map(([id64, u]) => ({
    id: String(BigInt(id64) - STEAM64_BASE), id64, name: pick(u, 'PersonaName') || pick(u, 'AccountName') || id64,
    login: pick(u, 'AccountName') ?? null, recent: pick(u, 'MostRecent') === '1', at: Number(pick(u, 'Timestamp') ?? 0),
  }));
  // Comptes présents seulement dans userdata (jamais listés dans loginusers)
  for (const dir of await readdir(path.join(steamPath ?? '', 'userdata')).catch(() => [])) {
    if (/^\d+$/.test(dir) && dir !== '0' && !list.some((a) => a.id === dir)) list.push({ id: dir, id64: String(BigInt(dir) + STEAM64_BASE), name: `Compte ${dir}`, login: null, recent: false, at: 0 });
  }
  return list.sort((a, b) => (b.recent - a.recent) || (b.at - a.at));
}

/** Temps de jeu (minutes) et dernière partie, par jeu ET par compte Steam (un fichier localconfig.vdf par compte). */
async function playtimes(steamPath) {
  const out = {};
  const userdata = path.join(steamPath, 'userdata');
  for (const account of await readdir(userdata).catch(() => [])) {
    if (!/^\d+$/.test(account)) continue;
    const text = await readFile(path.join(userdata, account, 'config', 'localconfig.vdf'), 'utf8').catch(() => null);
    if (!text) continue;
    const apps = pick(parseVdf(text), 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps') ?? {};
    for (const [id, a] of Object.entries(apps)) {
      const minutes = Number(pick(a, 'Playtime') ?? 0);
      const lastPlayed = Number(pick(a, 'LastPlayed') ?? 0) * 1000;
      const recent = Number(pick(a, 'Playtime2wks') ?? 0);
      if (!minutes && !lastPlayed) continue;
      (out[id] ??= {})[account] = { minutes, lastPlayed, recent };
    }
  }
  return out;
}
const best = (byAccount) => Object.values(byAccount ?? {}).reduce((a, t) => ({ minutes: Math.max(a.minutes, t.minutes), lastPlayed: Math.max(a.lastPlayed, t.lastPlayed) }), { minutes: 0, lastPlayed: 0 });

/** Les dépôts installés d'un jeu (pour la vérification des fichiers) : numéro de dépôt et de manifeste. */
function installedDepots(acf) {
  const depots = pick(acf, 'InstalledDepots') ?? {};
  return Object.entries(depots).map(([depot, d]) => ({ depot, manifest: pick(d, 'manifest') ?? null, size: Number(pick(d, 'size') ?? 0) })).filter((d) => d.manifest);
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
      const t = best(times[id]);
      items.push({
        id: `steam:${id}`, source: 'steam', kind: 'game', name, installed: true,
        installDir: path.join(dir, 'common', pick(acf, 'installdir') ?? ''), steamLibrary: dir, manifest: path.join(dir, file),
        steamRoot: steamPath, steamDepots: installedDepots(acf),
        size: Number(pick(acf, 'SizeOnDisk') ?? 0),
        minutes: t.minutes, lastPlayed: t.lastPlayed || Number(pick(acf, 'LastPlayed') ?? 0) * 1000 || 0, steamTimes: times[id] ?? {},
        art: {}, cdnArt: art(id), localArt: await steamLocalArt(steamPath, id), steamId: id,
      });
    }
  }
  // Jeux déjà joués mais plus installés : on les garde (le temps de jeu reste), le nom viendra de Steam
  const installed = new Set(items.map((i) => i.steamId));
  for (const [id, byAccount] of Object.entries(times)) {
    const t = best(byAccount);
    if (installed.has(id) || NOT_GAMES.has(id) || t.minutes < 5) continue;
    installed.add(id);
    items.push({ id: `steam:${id}`, source: 'steam', kind: 'game', name: null, installed: false, size: 0, minutes: t.minutes, lastPlayed: t.lastPlayed, steamTimes: byAccount, art: {}, cdnArt: art(id), localArt: await steamLocalArt(steamPath, id), steamId: id });
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
    minutes: g.playtime_forever ?? 0, lastPlayed: (g.rtime_last_played ?? 0) * 1000, art: {}, cdnArt: art(g.appid), localArt: {}, steamId: String(g.appid),
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

// ===================== Images de la bibliothèque Steam =====================

const LOCAL_NAMES = { cover: /^library_600x900(_2x)?\.jpg$/i, hero: /^library_hero(_2x)?\.jpg$/i, logo: /^logo(_2x)?\.png$/i, header: /^header\.jpg$/i };

/**
 * Les images que Steam garde sur le PC pour chaque jeu possédé (appcache\librarycache) : exactement celles de la
 * bibliothèque Steam. Ancien rangement : « 730_library_600x900.jpg » ; nouveau : « 730\library_600x900.jpg »
 * (parfois dans un sous-dossier). Renvoie des chemins de fichiers.
 */
export async function steamLocalArt(steamPath, appid) {
  if (!steamPath) return {};
  const cache = path.join(steamPath, 'appcache', 'librarycache');
  const out = {};
  const take = (kind, file) => { if (!out[kind]) out[kind] = file; };
  // Nouveau rangement : un dossier par jeu
  const walk = async (dir, depth) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 2) await walk(full, depth + 1);
      else if (e.isFile()) for (const [kind, re] of Object.entries(LOCAL_NAMES)) if (re.test(e.name)) take(kind, full);
    }
  };
  await walk(path.join(cache, String(appid)), 0);
  // Ancien rangement : fichiers préfixés par le numéro du jeu
  for (const [kind, name] of [['cover', 'library_600x900.jpg'], ['hero', 'library_hero.jpg'], ['logo', 'logo.png'], ['header', 'header.jpg']]) {
    if (out[kind]) continue;
    const file = path.join(cache, `${appid}_${name}`);
    if ((await stat(file).catch(() => null))?.size > 0) out[kind] = file;
  }
  return out;
}

/**
 * Adresses officielles actuelles des images (le magasin Steam les range depuis 2025 à des adresses avec un code) :
 * API publique IStoreBrowseService, sans clé, jusqu'à 50 jeux par demande.
 */
/** Les vrais noms des jeux Steam (API officielle du magasin, 50 par demande, sans clé). */
export async function steamNames(appids, fetchImpl = fetch) {
  const out = {};
  const ids = [...new Set(appids.map(String))].filter((id) => /^\d{1,8}$/.test(id));
  for (let n = 0; n < ids.length; n += 50) {
    const input = { ids: ids.slice(n, n + 50).map((appid) => ({ appid: Number(appid) })), context: { language: 'french', country_code: 'FR' }, data_request: { include_basic_info: true } };
    const data = await fetchImpl(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`, { signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    for (const item of data?.response?.store_items ?? []) if (item.name) out[String(item.appid ?? item.id)] = item.name;
  }
  return out;
}

export async function steamStoreAssets(appids, fetchImpl = fetch) {
  const out = {};
  const ids = [...new Set(appids.map(String))].filter((id) => /^\d{1,8}$/.test(id));
  for (let n = 0; n < ids.length; n += 50) {
    const input = { ids: ids.slice(n, n + 50).map((appid) => ({ appid: Number(appid) })), context: { language: 'french', country_code: 'FR' }, data_request: { include_assets: true } };
    const data = await fetchImpl(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`, { signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    for (const item of data?.response?.store_items ?? []) {
      const a = item.assets;
      if (!a?.asset_url_format) continue;
      const u = (file) => (file ? `https://shared.akamai.steamstatic.com/store_item_assets/${a.asset_url_format.replace('${FILENAME}', file)}` : null);
      const logoKey = Object.keys(a).find((k) => /logo/i.test(k) && typeof a[k] === 'string');
      out[String(item.appid ?? item.id)] = {
        cover: u(a.library_capsule_2x ?? a.library_capsule), hero: u(a.library_hero_2x ?? a.library_hero),
        header: u(a.header ?? a.main_capsule), logo: logoKey ? u(a[logoKey]) : null,
      };
    }
  }
  return out;
}
