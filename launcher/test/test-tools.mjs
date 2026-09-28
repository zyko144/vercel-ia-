import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { csvReader, frameStats } from '../src/core/fps.js';
import { nvidiaProduct } from '../src/core/gametools.js';
import { backupSaves, clearDir, findSaveDirs, listBackups, moveSteamGame, newerVersion, nvidiaVersion, packSaves, priceAlert, readPack, restoreBackup, safeRel, shaderCaches, unpackSaves } from '../src/core/gametools.js';
import { gameDemand, graphicsAdvice } from '../src/core/graphics.js';
import { cardFor } from '../src/core/friendsync.js';
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };

// FPS : 60 i/s réguliers + quelques saccades
const ft = Array.from({ length: 600 }, (_, i) => (i % 100 === 0 ? 80 : 16.6));
const s = frameStats(ft, ft.map((x) => x * 0.95));
ok(s.avg >= 55 && s.avg <= 60 && s.low1 <= 13 && s.stutters === 6, `stats FPS ${JSON.stringify(s)}`);
ok(s.cpuBound === 0 && frameStats(ft, ft.map((x) => x * 0.4)).cpuBound === 100, 'processeur limitant repéré');
ok(frameStats([16]) === null, 'trop peu d’images');
const got = [];
const feed = csvReader((f, g) => got.push([f, g]));
feed('Application,ProcessID,SwapChainAddress,PresentRuntime,CPUStartTime,FrameTime,CPUBusy,CPUWait,GPULatency,GPUTime,GPUBusy\ngame.exe,1,0,DXGI,1,16.5,4,1,2,10,9.5\ngame.exe,1,0,DXGI,2,1');
feed('7.0,5,1,2,10,12\n');
ok(got.length === 2 && got[0][0] === 16.5 && got[0][1] === 9.5 && got[1][0] === 17, 'lecture CSV de PresentMon au fil de l’eau');

// Sauvegardes : repérage, copie, liste, restauration
const home = await mkdtemp(path.join(os.tmpdir(), 'saves-'));
const env = { USERPROFILE: home, LOCALAPPDATA: path.join(home, 'AppData', 'Local'), APPDATA: path.join(home, 'AppData', 'Roaming') };
const save = path.join(home, 'Documents', 'My Games', 'Rocket League');
await mkdir(save, { recursive: true }); await writeFile(path.join(save, 'save.dat'), 'v1');
await mkdir(path.join(env.LOCALAPPDATA, 'Autre Jeu'), { recursive: true });
const game = { name: 'Rocket League®', steamId: '252950', source: 'steam' };
const dirs = await findSaveDirs(game, { env });
ok(dirs.length === 1 && dirs[0] === save, `dossier de sauvegarde trouvé ${dirs}`);
const dest = path.join(home, 'Backups');
const b1 = await backupSaves(game, dirs, dest);
ok(b1.ok && b1.bytes === 2, 'sauvegarde copiée');
await writeFile(path.join(save, 'save.dat'), 'v2 cassée');
const list = await listBackups(game, dest);
ok(list.length === 1, 'sauvegardes listées');
ok((await restoreBackup(game, dest, list[0].id)).ok && await readFile(path.join(save, 'save.dat'), 'utf8') === 'v1', 'restauration');
ok((await listBackups(game, dest)).length === 2, 'état d’avant la restauration gardé');
ok(!(await restoreBackup(game, dest, '../../x')).ok, 'identifiant refusé');

// Caches de shaders
const caches = shaderCaches(game, { env, library: path.join(home, 'lib') });
ok(caches[0].own && caches[0].dir.endsWith(path.join('shadercache', '252950')), 'cache de shaders Steam du jeu');
await mkdir(caches[0].dir, { recursive: true }); await writeFile(path.join(caches[0].dir, 'a.bin'), 'x'.repeat(100));
ok(await clearDir(caches[0].dir) === 100 && (await readdir(caches[0].dir)).length === 0, 'cache vidé');

// Déplacer un jeu Steam
const from = path.join(home, 'libA'); const to = path.join(home, 'libB');
await mkdir(path.join(from, 'common', 'Jeu', 'data'), { recursive: true }); await mkdir(path.join(to, 'common'), { recursive: true });
await writeFile(path.join(from, 'common', 'Jeu', 'data', 'big.pak'), 'y'.repeat(5000)); await writeFile(path.join(from, 'appmanifest_10.acf'), '"AppState"{}');
const prog = [];
const mv = await moveSteamGame({ appId: '10', installDir: 'Jeu', fromLib: from, toLib: to }, (p) => prog.push(p));
ok(mv.ok && mv.bytes === 5000 && prog.at(-1).copied === 5000, 'jeu copié avec avancement');
ok(await stat(path.join(to, 'appmanifest_10.acf')).then(() => true) && !(await stat(path.join(from, 'common', 'Jeu')).catch(() => null)), 'manifeste déplacé, ancien dossier supprimé');
ok(!(await moveSteamGame({ appId: '10', installDir: '../x', fromLib: from, toLib: to })).ok, 'chemin refusé');

// Prix et pilotes
ok(priceAlert({ target: 20 }, { price: 19.99 }) && !priceAlert({ target: 20, lastNotified: 15 }, { price: 19 }) && !priceAlert({ target: 20 }, { price: 25 }), 'alerte de prix');
{
  const xml = '<LookupValueSearch><LookupValues><LookupValue ParentID="127" RequiresProduct="True"><Name>GeForce RTX 5090</Name><Value>1066</Value></LookupValue><LookupValue ParentID="112" RequiresProduct="True"><Name>GeForce GTX 1660 SUPER</Name><Value>910</Value></LookupValue><LookupValue ParentID="112"><Name>GeForce GTX 1660</Name><Value>895</Value></LookupValue></LookupValues></LookupValueSearch>';
  const p = nvidiaProduct(xml, 'NVIDIA GeForce GTX 1660 SUPER');
  ok(p?.psid === '112' && p?.pfid === '910' && nvidiaProduct(xml, 'NVIDIA GeForce GTX 1660')?.pfid === '895' && nvidiaProduct(xml, 'AMD Radeon') === null, 'pilote NVIDIA de la bonne carte');
}
ok(nvidiaVersion('32.0.15.8129') === '581.29' && nvidiaVersion('31.0.15.5222') === '552.22', 'version NVIDIA');
ok(newerVersion('581.42', '581.29') && !newerVersion('581.29', '581.29'), 'comparaison de versions');
// Partage de sauvegardes : paquet compressé, chemins vérifiés, écrit dans les dossiers du destinataire
const sv = path.join(home, 'share', 'Saves'); await mkdir(path.join(sv, 'slot1'), { recursive: true });
await writeFile(path.join(sv, 'slot1', 'monde.dat'), 'partie-a-moi'); await writeFile(path.join(sv, 'options.ini'), 'fov=90');
const pk = await packSaves('Jeu', [sv]);
ok(pk[0] === 0x1f && pk[1] === 0x8b, 'paquet gzip');
const rd = await readPack(pk);
const dst = path.join(home, 'share2', 'Saves'); await mkdir(dst, { recursive: true });
ok(await unpackSaves(rd, [dst]) === 2 && await readFile(path.join(dst, 'slot1', 'monde.dat'), 'utf8') === 'partie-a-moi', 'sauvegarde reçue écrite au bon endroit');
const { gzipSync } = await import('node:zlib');
const evil = (dirs) => gzipSync(Buffer.from(JSON.stringify({ v: 1, game: 'x', dirs })));
await assert.rejects(readPack(evil([{ name: 'a', files: [{ p: '../../evil.exe', d: '' }] }])), /chemin interdit/);
await assert.rejects(readPack(evil([{ name: 'a', files: [{ p: 'C:/Windows/evil.exe', d: '' }] }])), /chemin interdit/);
await assert.rejects(readPack(evil([{ name: '..', files: [] }])), /illisible/);
ok(safeRel('a/b.sav') && !safeRel('/etc/x') && !safeRel('a/../b'), 'chemins relatifs sûrs');
await assert.rejects(packSaves('Jeu', [path.join(home, 'vide-inexistant')]), /Aucun fichier/);
ok(cardFor({ id: '1', type: 'share', from: 'f', share: 's1', pseudo: 'Max', game: 'Minecraft', text: 'Monde', size: 4096 }).actions[0][0] === 'saveget', 'carte « sauvegarde reçue »');

// Réglages graphiques conseillés
ok(gameDemand('Cyberpunk 2077').gpu === 1500 && !gameDemand('Jeu Inconnu').known, 'exigence des jeux');
ok(graphicsAdvice({ name: 'Cyberpunk 2077' }).need === 'benchmark', 'benchmark demandé');
const cp = graphicsAdvice({ name: 'Cyberpunk 2077', gpuScore: 1400, gpuName: 'NVIDIA GeForce RTX 4070', hz: 165, width: 2560 });
ok(cp.preset === 'Moyen' && /DLSS/.test(cp.upscaler) && cp.tips.some((t) => /génération d’images/.test(t)), `cyberpunk sur RTX 4070 : ${cp.preset}`);
const low = graphicsAdvice({ name: 'Cyberpunk 2077', gpuScore: 1400, gpuName: 'RTX 4070', perf: [{ avg: 38, bound: 'gpu' }, { avg: 40, bound: 'gpu' }] });
ok(low.preset === 'Bas' && low.measured === 39, 'FPS mesurés trop bas : un cran plus bas');
const vl = graphicsAdvice({ name: 'VALORANT', gpuScore: 2000, gpuName: 'Radeon RX 7800 XT', hz: 240 });
ok(vl.esport && vl.target === 240 && vl.level <= 2, 'jeu compétitif : FPS avant tout');
ok(graphicsAdvice({ name: 'FiveM', gpuScore: 1000, cpu1: 700 }).tips.some((t) => /processeur/.test(t)), 'jeu gourmand en processeur');
console.log(`✅ Outils de jeu (FPS, sauvegardes, shaders, déplacement, prix, pilotes) : ${n} vérifications`);

// Réglages des jeux : sauvegarde, fusion (le plus récent gagne) et remise sur un autre PC
{
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = await import('node:fs');
  const os = await import('node:os'); const path = await import('node:path');
  const { collectConfigs, mergeConfigs, restoreConfigs } = await import('../src/core/gameconfigs.js');
  const a = mkdtempSync(path.join(os.tmpdir(), 'cfgA-')); const b = mkdtempSync(path.join(os.tmpdir(), 'cfgB-'));
  const dirsA = { local: a, appdata: a, docs: a }; const dirsB = { local: b, appdata: b, docs: b };
  mkdirSync(path.join(a, 'CitizenFX'), { recursive: true }); writeFileSync(path.join(a, 'CitizenFX', 'fivem.cfg'), 'bind keyboard F1 menu');
  const got = await collectConfigs(dirsA);
  assert.equal(got['appdata/CitizenFX/fivem.cfg'].game, 'FiveM');
  assert.deepEqual(mergeConfigs({ k: { text: 'vieux', at: 1 } }, { k: { text: 'neuf', at: 2 } }).k.text, 'neuf');
  assert.deepEqual(mergeConfigs({ k: { text: 'neuf', at: 2 } }, { k: { text: 'vieux', at: 1 } }).k.text, 'neuf');
  assert.deepEqual(await restoreConfigs(dirsB, { ...got, 'appdata/../../evil.txt': { game: 'x', text: 'x' } }), ['FiveM']);
  assert.equal(readFileSync(path.join(b, 'CitizenFX', 'fivem.cfg'), 'utf8'), 'bind keyboard F1 menu');
  assert.ok(!existsSync(path.join(b, '..', 'evil.txt')), 'chemin inconnu ignoré');
  console.log('✅ Réglages des jeux dans le cloud : 6 vérifications');
}
{
  const { perfBaseline, perfDelta, perfLine, prelaunchChecks } = await import('../src/core/prelaunch.js');
  const recs = [{ avg: 100, low1: 70 }, { avg: 110, low1: 80 }, { avg: 130, low1: 95, boost: true }, { minutes: 5 }];
  const b = perfBaseline(recs);
  ok(b.avg === 105 && b.low1 === 75 && b.plain === true && perfBaseline([]) === null, 'référence FPS sans optimisation');
  ok(perfDelta(126, 105) === 20 && perfDelta(90, 100) === -10 && perfDelta(0, 100) === null && perfDelta(5000, 10) === null, 'gain / perte en %');
  ok(perfLine({ fps: 144.4, delta: 9, gpu: 97 }) === '144 FPS ▲ +9 %' && perfLine({ fps: 60, delta: -4 }) === '60 FPS ▼ -4 %' && perfLine({ gpu: 96.6 }) === 'GPU 97 %' && perfLine() === '…', 'mini-barre courte');
  const c = prelaunchChecks({ apps: [{ id: 'chrome', label: 'Google Chrome' }], ramUsedPct: 91, power: 'a', high: 'b', diskFreeGb: 8 });
  ok(c.find((x) => x.id === 'close').on && c.find((x) => x.id === 'power').level === 'act' && c.some((x) => x.id === 'ram' && x.level === 'warn') && c.some((x) => x.id === 'disk'), 'vérifications avant de jouer');
  ok(prelaunchChecks({ power: 'b', high: 'b' }).find((x) => x.id === 'power').level === 'ok', 'mode déjà au maximum : rien à changer');
  console.log('✅ Optimiser avant de jouer (référence, gain, mini-barre, vérifications) : 5 vérifications');
}
{
  // Jeux Epic : logo et grand fond officiels récupérés sur le magasin Epic quand le catalogue local ne les a pas
  const { enrich } = await import('../src/core/art.js');
  const fake = async (url) => ({ ok: true, json: async () => (String(url).includes('graphql.epicgames.com') ? { data: { Catalog: { searchStore: { elements: [{ title: 'Fortnite', keyImages: [{ type: 'DieselGameBoxLogo', url: 'https://cdn/logo.png' }, { type: 'DieselStoreFrontWide', url: 'https://cdn/wide.jpg' }, { type: 'DieselGameBoxTall', url: 'https://cdn/tall.jpg' }] }] } } } } : { items: [] }) });
  const e = await enrich({ id: 'epic:Fortnite', source: 'epic', kind: 'game', name: 'Fortnite', art: { cover: 'https://local/cover.jpg' } }, { fetchImpl: fake });
  assert.equal(e.art.logo, 'https://cdn/logo.png'); assert.equal(e.art.hero, 'https://cdn/wide.jpg');
  console.log('✅ Jeux Epic : logo et fond officiels (magasin Epic)');
}
{
  const { prelaunchChecks } = await import('../src/core/prelaunch.js');
  const fn = prelaunchChecks({ game: 'fortnite', fnPerf: false, tweaks: [{ id: 'gamemode', on: false, label: 'Mode Jeu' }, { id: 'dvr', on: false, label: 'DVR' }] });
  assert.equal(fn.find((x) => x.id === 'wintweaks').on, true); assert.equal(fn.find((x) => x.id === 'fnperf').on, false, 'Fortnite : mode performance proposé mais pas coché (change les graphismes)');
  assert.equal(prelaunchChecks({ game: 'fivem' }).find((x) => x.id === 'fivemcache').on, false, 'cache FiveM jamais vidé sans le demander');
  assert.equal(prelaunchChecks({ tweaks: [{ id: 'gamemode', on: true }, { id: 'dvr', on: true }] }).find((x) => x.id === 'wintweaks').level, 'ok');
  console.log('✅ Gains de FPS par jeu (réglages sûrs, rien d’imposé)');
}

{
  const { gameExes } = await import('../src/core/tracker.js');
  const tree = { 'C:\\rl': [['Binaries', 1], ['unins000.exe', 0]], 'C:\\rl\\Binaries': [['Win64', 1]], 'C:\\rl\\Binaries\\Win64': [['RocketLeague.exe', 0], ['vc_redist.x64.exe', 0]] };
  const readdir = async (d) => (tree[d] ?? []).map(([name, dir]) => ({ name, isDirectory: () => Boolean(dir) }));
  assert.deepEqual(await gameExes('C:\\rl', readdir), ['rocketleague.exe'], 'jeu Steam avec anti-triche : exe retrouvé dans son dossier');
  console.log('✅ « Ferme Rocket League » (anti-triche, Steam et Epic)');
}

{
  const { epicStoreSearch } = await import('../src/core/epic.js');
  const fake = async () => ({ ok: true, json: async () => ({ data: { Catalog: { searchStore: { elements: [{ title: 'Fortnite', productSlug: 'fortnite/home', catalogNs: { mappings: [] }, keyImages: [{ type: 'DieselStoreFrontWide', url: 'https://cdn1.epicgames.com/fn.jpg' }] }, { title: 'Bad', productSlug: '../x' }] } } } }) });
  const r = await epicStoreSearch('fortnite', fake);
  assert.equal(r.length, 1); assert.equal(r[0].url, 'https://store.epicgames.com/fr/p/fortnite');
  console.log('✅ Recherche : jeux du magasin Epic même non installés');
}

{
  const { scanEpic } = await import('../src/core/epic.js');
  const fs = await import('node:fs/promises'); const os = await import('node:os'); const p = await import('node:path');
  const root = await fs.mkdtemp(p.join(os.tmpdir(), 'epic-'));
  const man = p.join(root, 'Manifests'); const cat = p.join(root, 'Catalog');
  await fs.mkdir(man); await fs.mkdir(cat);
  await fs.writeFile(p.join(man, 'fn.item'), JSON.stringify({ DisplayName: 'Fortnite', AppName: 'Fortnite', CatalogItemId: 'fnid', CatalogNamespace: 'fn', InstallLocation: 'C:\\Epic\\Fortnite', AppCategories: ['public', 'games'] }));
  const entry = { id: 'fnid', namespace: 'fn', title: 'Fortnite', categories: [{ path: 'applications' }], releaseInfo: [{ appId: 'FortniteReleaseBuilds' }, { appId: 'Fortnite' }], keyImages: [{ type: 'DieselGameBoxTall', url: 'https://cdn1.epicgames.com/tall.jpg' }, { type: 'DieselGameBoxLogo', url: 'https://cdn1.epicgames.com/logo.png' }] };
  await fs.writeFile(p.join(cat, 'catcache.bin'), Buffer.from(JSON.stringify([entry])).toString('base64'));
  const items = await scanEpic(man, cat);
  assert.equal(items.length, 1, 'pas de doublon « possédé non installé »');
  assert.ok(items[0].art.logo && items[0].art.cover, 'Fortnite installé : images du catalogue Epic du PC');
  console.log('✅ Fortnite : images officielles depuis le catalogue Epic du PC');
}

{
  const { activeItems, learnExes } = await import('../src/core/tracker.js');
  const tree = { 'C:\\Epic\\Fortnite': [['FortniteGame', 1]], 'C:\\Epic\\Fortnite\\FortniteGame': [['Binaries', 1]], 'C:\\Epic\\Fortnite\\FortniteGame\\Binaries': [['Win64', 1]], 'C:\\Epic\\Fortnite\\FortniteGame\\Binaries\\Win64': [['FortniteClient-Win64-Shipping.exe', 0], ['FortniteLauncher.exe', 0]] };
  const readdir = async (d) => (tree[d] ?? []).map(([name, dir]) => ({ name, isDirectory: () => Boolean(dir) }));
  const fn = { id: 'epic:Fortnite', kind: 'game', installed: true, installDir: 'C:\\Epic\\Fortnite' };
  await learnExes([fn], readdir);
  assert.ok(activeItems([fn], ['fortniteclient-win64-shipping.exe']).has(fn.id), 'Fortnite (anti-triche, sans chemin) reconnu en cours');
  assert.equal(activeItems([fn], ['fortnitelauncher.exe']).size, 0, 'le petit lanceur ne compte pas comme une partie');
  console.log('✅ Jeux anti-triche reconnus en cours (temps de jeu, FPS)');
}
