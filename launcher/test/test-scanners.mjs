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
  all = await scanAll({ steam, epic, registry: parseRegQuery(REG) });
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
  assert.ok(filterSort(lib, { kind: 'applis' }).every((i) => i.kind !== 'game'));
  assert.deepEqual(filterSort(lib, { source: 'riot' }).map((i) => i.name), ['VALORANT']);
  assert.deepEqual(filterSort(lib, { q: 'baldur' }).map((i) => i.name), ["Baldur's Gate 3"]);
  assert.equal(filterSort(lib, { sort: 'nom' }).at(-1).name, 'VALORANT');
});

await check('suivi du temps : bon jeu repéré par son dossier, jamais par un dossier trop large', async () => {
  const items = [
    { id: 'a', installDir: 'C:\\Riot Games\\VALORANT\\live' },
    { id: 'b', installDir: 'C:\\' },
    { id: 'c', exe: 'c:\\users\\noam\\appdata\\roaming\\spotify\\spotify.exe' },
  ];
  const on = activeItems(items, ['c:\\riot games\\valorant\\live\\shootergame\\binaries\\win64\\valorant-win64-shipping.exe', 'c:\\users\\noam\\appdata\\roaming\\spotify\\spotify.exe']);
  assert.deepEqual([...on].sort(), ['a', 'c']);
});

await check('exécutable principal : le plus gros .exe, pas l’installeur', async () => {
  const d = path.join(T, 'Jeu');
  put(path.join(d, 'unins000.exe'), 'x'.repeat(5000));
  put(path.join(d, 'Bin', 'Jeu.exe'), 'x'.repeat(3000));
  put(path.join(d, 'Bin', 'CrashReporter.exe'), 'x'.repeat(9000));
  assert.equal(await findExe(d), path.join(d, 'Bin', 'Jeu.exe'));
});

console.log(`\n${passed} vérifications passées.`);
