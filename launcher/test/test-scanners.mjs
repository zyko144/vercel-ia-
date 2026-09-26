/**
 * Banc d'essai du launcher : faux Steam (2 bibliothèques), faux Epic, faux registre Windows.
 *
 *   npm test   (dans launcher/)
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseVdf } from '../src/core/vdf.js';
import { parseRegQuery, programsFromRegistry } from '../src/core/registry.js';
import { filterSort, findExe, merge, scanAll } from '../src/core/library.js';
import { activeItems } from '../src/core/tracker.js';
import { quickVerify, safeGameDir, uninstallFiles } from '../src/core/manage.js';
import { existsSync, readFileSync, utimesSync } from 'node:fs';
import { enrich, sameName } from '../src/core/art.js';
import { aiFindArt, geminiKeyFromEnv } from '../src/core/ai.js';
import { parseTitle } from '../src/core/media.js';
import { dayKey, periodStats, statCategory } from '../src/core/tracker.js';
import { listSteamAccounts, ownedSteamGames, parseAppInfo, steamDetails, steamLocalArt, steamNames, steamStoreAssets } from '../src/core/steam.js';
import { playtimeOf } from '../src/core/library.js';

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const T = mkdtempSync(path.join(os.tmpdir(), 'launcher-'));
const put = (p, text) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, text); };

// ---- Faux Steam : bibliothèque principale + une 2e sur un autre disque
const steam = path.join(T, 'Steam');
const lib2 = path.join(T, 'D', 'SteamLibrary');
put(path.join(steam, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${steam.replace(/\\/g, '\\\\')}"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"${lib2.replace(/\\/g, '\\\\')}"\n\t\t"apps" { "730" "123" }\n\t}\n}`);
const acf = (id, name, dir, size) => `"AppState"\n{\n\t"appid"\t\t"${id}"\n\t"name"\t\t"${name}"\n\t"installdir"\t\t"${dir}"\n\t"SizeOnDisk"\t\t"${size}"\n}`;
put(path.join(steam, 'steamapps', 'appmanifest_1086940.acf'), acf(1086940, "Baldur's Gate 3", "Baldurs Gate 3", 150e9));
put(path.join(lib2, 'steamapps', 'appmanifest_730.acf'), acf(730, 'Counter-Strike 2', 'Counter-Strike Global Offensive', 35e9));
put(path.join(lib2, 'steamapps', 'appmanifest_228980.acf'), acf(228980, 'Steamworks Common Redistributables', 'Steamworks Shared', 1e6));
put(path.join(steam, 'userdata', '42', 'config', 'localconfig.vdf'), `"UserLocalConfigStore"\n{\n "Software" { "Valve" { "Steam" { "apps" {\n  "730" { "Playtime" "12000" "LastPlayed" "1760000000" }\n  "1086940" { "Playtime" "300" "LastPlayed" "1750000000" }\n  "271590" { "Playtime" "900" "LastPlayed" "1700000000" }\n  "10" { "Playtime" "2" }\n } } } }\n}`);

// ---- Faux Epic
const epic = path.join(T, 'Epic', 'Manifests');
put(path.join(epic, 'A.item'), JSON.stringify({ DisplayName: 'Fortnite', AppName: 'Fortnite', CatalogNamespace: 'fn', CatalogItemId: 'abc', InstallLocation: 'C:\\Epic\\Fortnite', LaunchExecutable: 'FortniteGame\\Binaries\\Win64\\FortniteLauncher.exe', InstallSize: 40e9, AppCategories: ['games'] }));
put(path.join(epic, 'B.item'), JSON.stringify({ DisplayName: 'Unreal Plugin', AppName: 'Plug', CatalogNamespace: 'x', CatalogItemId: 'y', AppCategories: ['plugins'] }));
put(path.join(epic, 'C.item'), JSON.stringify({ DisplayName: 'Jeu à moitié', AppName: 'Half', bIsIncompleteInstall: true }));

// ---- Faux catalogue Epic (jeux possédés, avec les images officielles)
const epicCat = path.join(T, 'Epic', 'Catalog');
const img = (type, u) => ({ type, url: `https://cdn1.epicgames.com/${u}` });
put(path.join(epicCat, 'catcache.bin'), Buffer.from(JSON.stringify([
  { id: 'abc', namespace: 'fn', title: 'Fortnite', description: 'Battle royale', developer: 'Epic Games', categories: [{ path: 'games' }], releaseInfo: [{ appId: 'Fortnite' }], keyImages: [img('DieselGameBoxTall', 'fn-tall.jpg'), img('DieselGameBox', 'fn-wide.jpg'), img('DieselGameBoxLogo', 'fn-logo.png')] },
  { id: 'gta', namespace: 'gtans', title: 'Grand Theft Auto V', categories: [{ path: 'games' }], releaseInfo: [{ appId: 'Blade' }], keyImages: [img('DieselGameBoxTall', 'gta-tall.jpg')] },
  { id: 'dlc', namespace: 'gtans', title: 'Pack DLC', mainGameItem: { id: 'gta' }, categories: [{ path: 'addons' }], releaseInfo: [{ appId: 'Dlc' }] },
])).toString('base64'));

// ---- Faux registre (sortie de reg query /s)
const REG = `
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Spotify
    DisplayName    REG_SZ    Spotify
    DisplayIcon    REG_SZ    C:\\Users\\noam\\AppData\\Roaming\\Spotify\\Spotify.exe
    UninstallString    REG_SZ    "C:\\Users\\noam\\AppData\\Roaming\\Spotify\\Spotify.exe" /uninstall
    Publisher    REG_SZ    Spotify AB
    EstimatedSize    REG_DWORD    0x3e800

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Riot Game valorant.live
    DisplayName    REG_SZ    VALORANT
    DisplayIcon    REG_SZ    C:\\Riot Games\\VALORANT\\live\\VALORANT.exe
    InstallLocation    REG_SZ    C:\\Riot Games\\VALORANT\\live
    UninstallString    REG_SZ    "C:\\Riot Games\\Riot Client\\RiotClientServices.exe" --uninstall-product=valorant
    Publisher    REG_SZ    Riot Games, Inc

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{VC}
    DisplayName    REG_SZ    Microsoft Visual C++ 2015-2022 Redistributable (x64)
    SystemComponent    REG_DWORD    0x0

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 730
    DisplayName    REG_SZ    Counter-Strike 2
    UninstallString    REG_SZ    "C:\\Steam\\steam.exe" steam://uninstall/730

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam
    DisplayName    REG_SZ    Steam
    Publisher    REG_SZ    Valve Corporation
    DisplayIcon    REG_SZ    C:\\Program Files (x86)\\Steam\\steam.exe

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Hidden
    DisplayName    REG_SZ    Pilote caché
    SystemComponent    REG_DWORD    0x1

HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Discord
    DisplayName    REG_SZ    Discord
    DisplayIcon    REG_SZ    "C:\\Users\\noam\\AppData\\Local\\Discord\\app.ico",0
`;

await check('VDF : clés, blocs imbriqués, échappements et commentaires', async () => {
  const v = parseVdf('// commentaire\n"a" { "b" "c\\\\d" "e" { "f" "g" } }');
  assert.deepEqual(v, { a: { b: 'c\\d', e: { f: 'g' } } });
});

await check('registre : entrées, valeurs texte et nombres', async () => {
  const e = parseRegQuery(REG);
  assert.equal(e.length, 7);
  assert.equal(e[0].values.EstimatedSize, 256000);
  assert.equal(e[5].values.SystemComponent, 1);
});

await check('programmes : applis et jeux des autres launchers, sans bruit ni doublons Steam', async () => {
  const p = programsFromRegistry(parseRegQuery(REG));
  const names = p.map((x) => x.name).sort();
  assert.deepEqual(names, ['Discord', 'Spotify', 'Steam', 'VALORANT']);
  const spotify = p.find((x) => x.name === 'Spotify');
  assert.equal(spotify.category, 'musique');
  assert.equal(spotify.exe, 'C:\\Users\\noam\\AppData\\Roaming\\Spotify\\Spotify.exe');
  const valo = p.find((x) => x.name === 'VALORANT');
  assert.equal(valo.kind, 'game');
  assert.equal(valo.source, 'riot');
  assert.equal(p.find((x) => x.name === 'Steam').kind, 'launcher');
  assert.equal(p.find((x) => x.name === 'Discord').exe, null, 'une icône .ico n’est pas un exécutable');
});

let all;
await check('bibliothèque complète : Steam (2 disques), Epic, registre', async () => {
  all = await scanAll({ steam, epic, epicCatalog: epicCat, registry: parseRegQuery(REG) });
  const byName = (n) => all.find((i) => i.name === n);
  assert.ok(byName('Counter-Strike 2')?.installed, 'jeu de la 2e bibliothèque');
  assert.equal(byName('Counter-Strike 2').minutes, 12000);
  assert.equal(byName("Baldur's Gate 3").size, 150e9);
  assert.ok(!all.some((i) => /Redistributables/.test(i.name ?? '')), 'outils Steam ignorés');
  const gone = all.find((i) => i.steamId === '271590');
  assert.equal(gone.installed, false, 'jeu joué mais désinstallé gardé');
  assert.ok(!all.some((i) => i.steamId === '10'), 'moins de 5 min : ignoré');
  assert.ok(byName('Fortnite')?.epicKey.includes('fn%3Aabc%3AFortnite'));
  assert.ok(!byName('Unreal Plugin') && !byName('Jeu à moitié'));
  assert.equal(all.filter((i) => i.name === 'Counter-Strike 2').length, 1, 'pas de doublon Steam/registre');
});

await check('tri : plus joués, favoris en tête, filtres jeux/applis/sources/installés, recherche sans accents', async () => {
  const store = { time: { 'reg:spotify': { minutes: 20000, lastPlayed: Date.now() } }, items: { 'epic:Fortnite': { favorite: true } }, names: { 271590: 'Grand Theft Auto V' } };
  const lib = merge(all, store);
  const top = filterSort(lib, { sort: 'joues' });
  assert.equal(top[0].name, 'Fortnite', 'favori d’abord');
  assert.equal(top[1].name, 'Spotify', 'puis le plus utilisé');
  assert.deepEqual(filterSort(lib, { kind: 'jeux', installed: 'non' }).map((i) => i.name), ['Grand Theft Auto V']);
  const gta = lib.find((i) => i.name === 'Grand Theft Auto V');
  assert.deepEqual(gta.alsoOn.map((o) => o.source), ['epic'], 'une seule carte, « aussi sur Epic »');
  assert.equal(gta.minutes, 900);
  assert.ok(filterSort(lib, { kind: 'applis' }).every((i) => i.kind !== 'game'));
  assert.deepEqual(filterSort(lib, { source: 'riot' }).map((i) => i.name), ['VALORANT']);
  assert.deepEqual(filterSort(lib, { q: 'baldur' }).map((i) => i.name), ["Baldur's Gate 3"]);
  const byName = filterSort(lib, { sort: 'nom' });
  assert.equal(byName.at(-1).name, 'Grand Theft Auto V', 'les jeux installés d’abord, le non installé en dernier');
  assert.ok(byName.findIndex((i) => !i.installed) > byName.findLastIndex((i) => i.installed));
  // Jeu Epic seulement possédé (jamais lancé) : caché par défaut, visible dans « Non installés »
  const owned = [{ id: 'epic:FS', name: 'Farming Simulator 22', kind: 'game', source: 'epic', installed: false, minutes: 0, lastPlayed: 0 }];
  assert.equal(filterSort(owned, {}).length, 0);
  assert.equal(filterSort(owned, { installed: 'non' }).length, 1);
});

await check('suivi du temps : bon jeu repéré par son dossier, jamais par un dossier trop large', async () => {
  const items = [
    { id: 'a', installDir: 'C:\\Riot Games\\VALORANT\\live' },
    { id: 'b', installDir: 'C:\\' },
    { id: 'c', exe: 'c:\\users\\noam\\appdata\\roaming\\spotify\\spotify.exe' },
  ];
  const on = activeItems(items, ['c:\\riot games\\valorant\\live\\shootergame\\binaries\\win64\\valorant-win64-shipping.exe', 'c:\\users\\noam\\appdata\\roaming\\spotify\\spotify.exe']);
  assert.deepEqual([...on].sort(), ['a', 'c']);
  // Dossiers imbriqués : le jeu dans le dossier du launcher ne crédite pas aussi le launcher
  const nested = [{ id: 'launcher', installDir: 'D:\\Jeux\\Riot Games' }, { id: 'valo', installDir: 'D:\\Jeux\\Riot Games\\VALORANT' }];
  assert.deepEqual([...activeItems(nested, ['d:\\jeux\\riot games\\valorant\\live\\valorant.exe'])], ['valo']);
  assert.deepEqual([...activeItems(nested, ['d:\\jeux\\riot games\\riot client\\riotclientservices.exe'])], ['launcher']);
});

await check('exécutable principal : le plus gros .exe, pas l’installeur', async () => {
  const d = path.join(T, 'Jeu');
  put(path.join(d, 'unins000.exe'), 'x'.repeat(5000));
  put(path.join(d, 'Bin', 'Jeu.exe'), 'x'.repeat(3000));
  put(path.join(d, 'Bin', 'CrashReporter.exe'), 'x'.repeat(9000));
  assert.equal(await findExe(d), path.join(d, 'Bin', 'Jeu.exe'));
});

await check('Epic : jeux possédés non installés + images officielles, sans DLC', async () => {
  const fn = all.find((i) => i.id === 'epic:Fortnite');
  assert.equal(fn.installed, true);
  assert.equal(fn.art.cover, 'https://cdn1.epicgames.com/fn-tall.jpg');
  assert.equal(fn.art.logo, 'https://cdn1.epicgames.com/fn-logo.png');
  assert.equal(fn.details.developers[0], 'Epic Games');
  const gta = all.find((i) => i.id === 'epic:Blade');
  assert.equal(gta.installed, false);
  assert.match(gta.epicKey, /gtans%3Agta%3ABlade/);
  assert.ok(!all.some((i) => i.name === 'Pack DLC'));
});

// Faux internet : magasin Steam, SteamGridDB, API Steam
const web = async (u) => {
  const ok = (data) => ({ ok: true, json: async () => data });
  if (u.includes('IStoreBrowseService')) return ok({ response: { store_items: [{ appid: 359550, assets: { asset_url_format: 'steam/apps/359550/abc123/${FILENAME}?t=1', library_capsule: 'library_600x900.jpg', library_capsule_2x: 'library_600x900_2x.jpg', library_hero: 'library_hero.jpg', header: 'header.jpg' } }] } });
  if (u.includes('storesearch')) return ok({ items: [{ type: 'app', id: 359550, name: "Tom Clancy's Rainbow Six® Siege" }, { type: 'app', id: 1, name: 'Rainbow Six Siege Soundtrack' }] });
  if (u.includes('appdetails')) return ok({ 359550: { success: true, data: { name: 'R6', short_description: '<b>Tactique</b> &amp; équipe', developers: ['Ubisoft Montreal'], genres: [{ description: 'Action' }], release_date: { date: '1 déc. 2015' }, metacritic: { score: 79 }, screenshots: [{ path_thumbnail: 's1.jpg' }] } } });
  if (u.includes('autocomplete')) return ok({ data: [{ id: 42, name: 'VALORANT' }] });
  if (u.includes('/grids/game/42')) return ok({ data: [{ url: 'https://cdn2.steamgriddb.com/grid/valo.png' }] });
  if (u.includes('/heroes/game/42')) return ok({ data: [{ url: 'https://cdn2.steamgriddb.com/hero/valo.png' }] });
  if (u.includes('/logos/game/42')) return ok({ data: [{ url: 'https://cdn2.steamgriddb.com/logo/valo.png' }] });
  if (u.includes('/icons/game/42')) return ok({ data: [] });
  if (u.includes('GetOwnedGames')) return ok({ response: { games: [{ appid: 570, name: 'Dota 2', playtime_forever: 900, rtime_last_played: 1700000000 }] } });
  return { ok: false, json: async () => null };
};

await check('même jeu malgré les variantes de nom, jamais un autre', async () => {
  assert.ok(sameName("Tom Clancy's Rainbow Six® Siege", 'Rainbow Six Siege'));
  assert.ok(sameName('VALORANT', 'Valorant'));
  assert.ok(!sameName('Rainbow Six Siege Soundtrack', 'Rainbow Six Siege'));
  assert.ok(!sameName('Portal', 'Portal 2'));
});

await check('images : jeu d’un autre launcher trouvé sur Steam (logo, jaquette, fiche)', async () => {
  const r = await enrich({ id: 'reg:r6', kind: 'game', name: 'Rainbow Six Siege', art: {} }, { fetchImpl: web, details: true });
  assert.equal(r.steamId, '359550');
  assert.equal(r.art.cover, 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/359550/abc123/library_600x900_2x.jpg?t=1', 'adresse officielle actuelle');
  assert.match(r.art.logo, /359550\/logo\.png/);
  assert.equal(r.details.description, 'Tactique & équipe');
  assert.equal(r.details.score, 79);
});

await check('images : SteamGridDB (clé) pour Valorant, et cache de 14 jours respecté', async () => {
  const r = await enrich({ id: 'reg:valorant', kind: 'game', name: 'VALORANT', art: {} }, { fetchImpl: web, gridKey: 'k' });
  assert.equal(r.art.cover, 'https://cdn2.steamgriddb.com/grid/valo.png');
  assert.equal(r.art.logo, 'https://cdn2.steamgriddb.com/logo/valo.png');
  let calls = 0;
  const again = await enrich({ id: 'reg:valorant', kind: 'game', name: 'VALORANT', art: {} }, { cache: r, gridKey: 'k', fetchImpl: async (u) => { calls++; return web(u); } });
  assert.equal(calls, 0);
  assert.equal(again, r);
});

await check('Steam : jeux possédés via la clé d’API, fiche complète nettoyée', async () => {
  const owned = await ownedSteamGames('cle', '7656', web);
  assert.equal(owned[0].name, 'Dota 2');
  assert.equal(owned[0].installed, false);
  assert.equal(owned[0].minutes, 900);
  const d = await steamDetails('359550', web);
  assert.deepEqual(d.genres, ['Action']);
  assert.deepEqual(d.screenshots, ['s1.jpg']);
});

await check('IA images : numéro Steam accepté seulement si Steam confirme le jeu', async () => {
  const fakeAi = (answer) => ({ ask: async () => answer });
  const good = await aiFindArt(fakeAi({ steamAppId: '359550', officialName: 'Rainbow Six Siege', cover: '', hero: '', logo: '' }), 'Rainbow Six Siege', web);
  assert.equal(good.steamId, '359550');
  assert.match(good.art.logo, /359550\/logo\.png/);
  const wrong = await aiFindArt(fakeAi({ steamAppId: '999', officialName: 'Jeu inventé', cover: 'https://exemple.test/pas-une-image.html', hero: '', logo: '' }), 'Jeu inventé', async (u) => (u.includes('storesearch') ? { ok: true, json: async () => ({ items: [] }) } : { ok: true, status: 200, headers: new Map([['content-type', 'text/html']]) }));
  assert.equal(wrong, null, 'numéro non confirmé et adresse qui n’est pas une image : rien');
});

await check('IA images : adresses gardées seulement si ce sont de vraies images', async () => {
  const fakeAi = { ask: async () => ({ steamAppId: '', officialName: 'VALORANT', cover: 'https://cdn.exemple/valo.jpg', hero: 'http://pas-https/x.jpg', logo: 'https://cdn.exemple/logo.png' }) };
  const r = await aiFindArt(fakeAi, 'VALORANT', async (u) => ({ ok: true, status: 206, headers: new Map([['content-type', u.endsWith('.jpg') ? 'image/jpeg' : 'image/png']]) }));
  assert.equal(r.art.cover, 'https://cdn.exemple/valo.jpg');
  assert.equal(r.art.logo, 'https://cdn.exemple/logo.png');
  assert.equal(r.art.hero, undefined, 'http refusé');
});

await check('clé Gemini lue dans le .env du bot (jamais le token Discord)', async () => {
  const d = path.join(T, 'bot', 'launcher');
  put(path.join(T, 'bot', '.env'), `DISCORD_TOKEN=abc\nGEMINI_API_KEY=${'T'.repeat(24)}.abcdef.${'x'.repeat(27)},AIzaCleGemini1234567890123456789012345\n`);
  mkdirSync(d, { recursive: true });
  assert.equal(await geminiKeyFromEnv(d), 'AIzaCleGemini1234567890123456789012345');
});

await check('musique : titre de la fenêtre Spotify / Deezer, pause reconnue', async () => {
  assert.deepEqual(parseTitle('Spotify', 'Bir Hakeim - Cherry Pie'), { artist: 'Bir Hakeim', title: 'Cherry Pie' });
  assert.deepEqual(parseTitle('Deezer', 'Djadja - Aya Nakamura'), { title: 'Djadja', artist: 'Aya Nakamura' });
  assert.equal(parseTitle('Spotify', 'Spotify Premium'), null);
});

await check('statistiques : jeux / applis / musique / autres, sur 7, 30 ou 365 jours', async () => {
  assert.equal(statCategory({ kind: 'game' }), 'jeux');
  assert.equal(statCategory({ kind: 'app', category: 'musique' }), 'musique');
  assert.equal(statCategory({ kind: 'app', category: 'appli' }), 'applis');
  assert.equal(statCategory({ kind: 'app', category: 'discussion' }), 'autres');
  const now = Date.parse('2026-09-26T12:00:00Z');
  const days = { [dayKey(now)]: { jeux: 60, musique: 30 }, [dayKey(now - 10 * 86_400_000)]: { jeux: 100 } };
  assert.deepEqual(periodStats(days, 7, now), { jeux: 60, applis: 0, musique: 30, autres: 0 });
  assert.equal(periodStats(days, 30, now).jeux, 160);
});

await check('images Steam sur le PC : ancien et nouveau rangement du cache', async () => {
  const cache = path.join(steam, 'appcache', 'librarycache');
  put(path.join(cache, '730_library_600x900.jpg'), 'x');
  put(path.join(cache, '730_logo.png'), 'x');
  put(path.join(cache, '1086940', 'library_600x900.jpg'), 'x');
  put(path.join(cache, '1086940', 'a1b2c3', 'library_hero.jpg'), 'x');
  put(path.join(cache, '1086940', 'logo.png'), 'x');
  assert.deepEqual(await steamLocalArt(steam, '730'), { cover: path.join(cache, '730_library_600x900.jpg'), logo: path.join(cache, '730_logo.png') });
  const bg3 = await steamLocalArt(steam, '1086940');
  assert.equal(bg3.hero, path.join(cache, '1086940', 'a1b2c3', 'library_hero.jpg'));
  assert.equal(bg3.logo, path.join(cache, '1086940', 'logo.png'));
  const lib = await scanAll({ steam, epic, epicCatalog: epicCat, registry: [] });
  assert.ok(lib.find((i) => i.steamId === '730').localArt.cover, 'le scan joint les images locales');
});

await check('images Steam en ligne : API officielle, et les images du PC passent devant', async () => {
  const a = await steamStoreAssets(['359550'], web);
  assert.match(a['359550'].hero, /store_item_assets\/steam\/apps\/359550\/abc123\/library_hero\.jpg/);
  const store = { art: { 'steam:730': { art: { cover: 'https://en-ligne/cover.jpg', hero: 'https://en-ligne/hero.jpg' } } }, time: {}, items: {}, names: {} };
  const merged = merge([{ id: 'steam:730', source: 'steam', kind: 'game', name: 'CS2', minutes: 0, lastPlayed: 0, art: {}, cdnArt: { cover: 'ancienne', logo: 'ancien-logo' }, localArt: { cover: 'C:/cache/730.jpg' } }], store, (l) => Object.fromEntries(Object.entries(l ?? {}).map(([k]) => [k, `libimg://img/${k}`])));
  assert.equal(merged[0].art.cover, 'libimg://img/cover', 'image du PC d’abord');
  assert.equal(merged[0].art.hero, 'https://en-ligne/hero.jpg', 'puis l’API officielle');
  assert.equal(merged[0].art.logo, 'ancien-logo', 'l’ancienne adresse en dernier recours');
});

await check('désinstallation Steam par le launcher : dossier du jeu + fiche, rien d’autre', async () => {
  const libDir = path.join(T, 'SteamDel', 'steamapps');
  put(path.join(libDir, 'common', 'MonJeu', 'Jeu.exe'), 'x'.repeat(100));
  put(path.join(libDir, 'common', 'AutreJeu', 'a.exe'), 'x');
  put(path.join(libDir, 'appmanifest_42.acf'), '"AppState" {}');
  const item = { source: 'steam', installDir: path.join(libDir, 'common', 'MonJeu'), steamLibrary: libDir, manifest: path.join(libDir, 'appmanifest_42.acf') };
  await uninstallFiles(item);
  assert.ok(!existsSync(item.installDir) && !existsSync(item.manifest));
  assert.ok(existsSync(path.join(libDir, 'common', 'AutreJeu', 'a.exe')), 'l’autre jeu est intact');
});

await check('désinstallation : refusée hors de la bibliothèque, sur une racine ou un dossier système', async () => {
  const libDir = path.join(T, 'SteamDel', 'steamapps');
  assert.equal(safeGameDir({ source: 'steam', installDir: path.join(libDir, 'common'), steamLibrary: libDir }).ok, false, 'le dossier common lui-même');
  assert.equal(safeGameDir({ source: 'steam', installDir: path.join(libDir, 'common', 'A', '..', '..'), steamLibrary: libDir }).ok, false, 'remonter avec ..');
  assert.equal(safeGameDir({ source: 'steam', installDir: path.join(T, 'ailleurs', 'Jeu'), steamLibrary: libDir }).ok, false, 'hors bibliothèque');
  assert.equal(safeGameDir({ source: 'epic', installDir: '/' }).ok, false, 'racine');
  assert.equal(safeGameDir({ source: 'epic', installDir: '' }).ok, false);
});

await check('désinstallation Epic : dossier + fiche .item + LauncherInstalled.dat, seulement si la fiche correspond', async () => {
  const dir = path.join(T, 'EpicGames', 'Fortnite');
  const man = path.join(T, 'EpicMan', 'F.item');
  const dat = path.join(T, 'EpicMan', 'LauncherInstalled.dat');
  put(path.join(dir, 'game.exe'), 'x');
  put(man, JSON.stringify({ AppName: 'Fortnite', InstallLocation: dir }));
  put(dat, JSON.stringify({ InstallationList: [{ AppName: 'Fortnite', InstallLocation: dir }, { AppName: 'Autre', InstallLocation: 'D:/X' }] }));
  await assert.rejects(uninstallFiles({ source: 'epic', installDir: path.join(T, 'EpicGames', 'Autre'), manifest: man }), /ne correspond pas/);
  await uninstallFiles({ source: 'epic', installDir: dir, manifest: man }, { launcherInstalled: dat });
  assert.ok(!existsSync(dir) && !existsSync(man));
  assert.deepEqual(JSON.parse(readFileSync(dat, 'utf8')).InstallationList.map((e) => e.AppName), ['Autre']);
});

await check('vérification rapide : exécutable manquant et fichiers manquants détectés', async () => {
  const dir = path.join(T, 'Verif', 'Jeu');
  put(path.join(dir, 'data.pak'), 'x'.repeat(1000));
  const ok = await quickVerify({ installDir: dir, size: 1000 });
  assert.equal(ok.ok, true);
  const bad = await quickVerify({ installDir: dir, size: 5e9, exe: path.join(dir, 'Jeu.exe') });
  assert.equal(bad.ok, false);
  assert.equal(bad.problems.length, 2);
});

await check('applis : seulement les grosses par défaut, toutes dans « Tous les installés »', async () => {
  const reg = parseRegQuery(`
HKEY_LOCAL_MACHINE\\X\\CCleaner
    DisplayName    REG_SZ    CCleaner
HKEY_LOCAL_MACHINE\\X\\HPSmart
    DisplayName    REG_SZ    HP Smart
HKEY_LOCAL_MACHINE\\X\\Realtek
    DisplayName    REG_SZ    Realtek Audio Console
HKEY_LOCAL_MACHINE\\X\\Outil
    DisplayName    REG_SZ    Outil Pro Rare
HKEY_LOCAL_MACHINE\\X\\Opera
    DisplayName    REG_SZ    Opera Stable 112
HKEY_LOCAL_MACHINE\\X\\Spotify
    DisplayName    REG_SZ    Spotify
`);
  const apps = merge(programsFromRegistry(reg), { time: { 'reg:outil-pro-rare': { minutes: 30, lastPlayed: 1 } }, items: {}, names: {} });
  assert.deepEqual(filterSort(apps, {}).map((i) => i.name).sort(), ['CCleaner', 'Spotify'], 'grosses applis seulement (même une appli utilisée mais inconnue reste cachée)');
  assert.equal(apps.find((i) => i.name === 'Spotify').brand.logo, 'brands/spotify.svg');
  assert.equal(filterSort(apps, { installed: 'oui' }).length, 5, 'le reste accessible (le pilote Realtek, lui, est écarté comme composant système)');
});

await check('comptes Steam du PC : pseudo, numéro du dossier userdata, dernier connecté', async () => {
  const root = path.join(T, 'SteamComptes');
  put(path.join(root, 'config', 'loginusers.vdf'), '"users" { "76561198000000001" { "AccountName" "noam" "PersonaName" "Noam" "MostRecent" "1" } "76561198000000002" { "AccountName" "frere" "PersonaName" "Petit frère" "MostRecent" "0" } }');
  const list = await listSteamAccounts(root);
  assert.deepEqual(list.map((a) => [a.id, a.name, a.recent]), [['39734273', 'Noam', true], ['39734274', 'Petit frère', false]]);
});

await check('temps de jeu : un seul compte (le choisi), ou le total ; jamais compté deux fois pour Steam', async () => {
  const item = { id: 'steam:730', steamTimes: { 1: { minutes: 600, lastPlayed: 5, recent: 120 }, 2: { minutes: 3000, lastPlayed: 9, recent: 0 } } };
  const store = { timeBy: { 'steam:730': { 1: { minutes: 50, lastPlayed: 10 } } } };
  assert.equal(playtimeOf(item, store, { steamAccount: '1' }).minutes, 600, 'compte choisi seulement, chronomètre non ajouté');
  assert.equal(playtimeOf(item, store, { steamAccount: '1' }).recent, 120);
  assert.equal(playtimeOf(item, store, { steamAccount: '1', total: true }).minutes, 3600, 'temps total');
  const epic = { id: 'epic:FN', minutes: 0 };
  const st = { timeBy: { 'epic:FN': { A: { minutes: 30, lastPlayed: 1 }, B: { minutes: 90, lastPlayed: 2 } } } };
  assert.equal(playtimeOf(epic, st, { accountFor: () => 'A' }).minutes, 30);
  assert.equal(playtimeOf(epic, st, { total: true }).minutes, 120);
});

await check('vrais noms Steam (API officielle, par lots) ; jamais « Jeu Steam 123 » gardé', async () => {
  const names = await steamNames(['1248130', '730'], async () => ({ ok: true, json: async () => ({ response: { store_items: [{ appid: 1248130, name: 'Farming Simulator 22' }, { appid: 730, name: 'Counter-Strike 2' }] } }) }));
  assert.deepEqual(names, { 1248130: 'Farming Simulator 22', 730: 'Counter-Strike 2' });
  const g = (id, name = null) => ({ id: `steam:${id}`, source: 'steam', kind: 'game', name, steamId: String(id), minutes: 0, lastPlayed: 0 });
  assert.equal(merge([g(9)], { names: { 9: 'Jeu Steam 9' }, items: {}, time: {} }).length, 0, 'sans vrai nom : pas affiché');
  const shown = merge([g(1, 'Portal 2'), g(2, 'Steamworks Common Redistributables'), g(3)], { names: { 3: 'Ancien jeu retiré' }, steamTypes: { 1: 'game', 2: 'tool', 3: 'game' }, items: {}, time: {} });
  assert.deepEqual(shown.map((i) => i.name).sort(), ['Ancien jeu retiré', 'Portal 2'], 'outils écartés');
});

await check('cache local de Steam (appinfo.vdf v28 et v29) : nom et type', async () => {
  const kv = (key) => (typeof key === 'number' ? Buffer.from(new Uint32Array([key]).buffer) : Buffer.from(`${key}\0`));
  const blob = (k) => Buffer.concat([Buffer.from([0]), k('appinfo'), Buffer.from([2]), k('appid'), Buffer.alloc(4), Buffer.from([0]), k('common'),
    Buffer.from([1]), k('name'), Buffer.from('Jeu Retiré\0'), Buffer.from([1]), k('type'), Buffer.from('Game\0'), Buffer.from([8, 8, 8])]);
  const entry = (id, body) => { const b = Buffer.alloc(8 + 60); b.writeUInt32LE(id, 0); b.writeUInt32LE(60 + body.length, 4); return Buffer.concat([b, body]); };
  // v28 : clés en texte
  const v28 = Buffer.concat([Buffer.from(new Uint32Array([0x07564428, 1]).buffer), entry(555, blob(kv)), entry(777, blob(kv)), Buffer.alloc(4)]);
  assert.deepEqual(parseAppInfo(v28, new Set(['555'])), { 555: { name: 'Jeu Retiré', type: 'game' } });
  // v29 : clés = numéros dans une table de textes à la fin
  const table = ['appinfo', 'appid', 'common', 'name', 'type'];
  const body = Buffer.concat([entry(42, blob((k) => kv(table.indexOf(k)))), Buffer.alloc(4)]);
  const headLen = 16;
  const strings = Buffer.concat([Buffer.from(new Uint32Array([table.length]).buffer), ...table.map((t) => Buffer.from(`${t}\0`))]);
  const head = Buffer.alloc(headLen); head.writeUInt32LE(0x07564429, 0); head.writeUInt32LE(1, 4); head.writeBigInt64LE(BigInt(headLen + body.length), 8);
  assert.deepEqual(parseAppInfo(Buffer.concat([head, body, strings])), { 42: { name: 'Jeu Retiré', type: 'game' } });
});

await check('Roblox détecté (dossier Versions, la version la plus récente) et plateforme à part', async () => {
  const dir = path.join(T, 'Local', 'Roblox', 'Versions');
  put(path.join(dir, 'version-old', 'RobloxPlayerBeta.exe'), 'x');
  put(path.join(dir, 'version-new', 'RobloxPlayerBeta.exe'), 'xx');
  const t = Date.now() / 1000;
  utimesSync(path.join(dir, 'version-old', 'RobloxPlayerBeta.exe'), t - 99, t - 99);
  const reg = parseRegQuery(`
HKEY_CURRENT_USER\\X\\roblox-player
    DisplayName    REG_SZ    Roblox Player
    UninstallString    REG_SZ    C:\\R\\RobloxPlayerInstaller.exe -uninstall
`);
  const lib = await scanAll({ steam: path.join(T, 'rien'), epic: path.join(T, 'rien'), epicCatalog: path.join(T, 'rien'), registry: reg, roblox: [dir] });
  const r = lib.filter((i) => /roblox/i.test(i.name));
  assert.equal(r.length, 1, 'une seule entrée Roblox');
  assert.equal(r[0].kind, 'game');
  assert.equal(r[0].source, 'roblox');
  assert.ok(r[0].exe.includes('version-new'));
  assert.ok(r[0].uninstallCmd.includes('-uninstall'));
  // Sans dossier trouvé : l'entrée du registre devient le jeu
  const fromReg = await scanAll({ steam: path.join(T, 'rien'), epic: path.join(T, 'rien'), epicCatalog: path.join(T, 'rien'), registry: reg, roblox: [path.join(T, 'rien')] });
  assert.equal(fromReg.find((i) => i.source === 'roblox')?.name, 'Roblox');
});

console.log(`\n${passed} vérifications passées.`);
