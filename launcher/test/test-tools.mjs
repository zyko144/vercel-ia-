import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { csvReader, frameStats } from '../src/core/fps.js';
import { backupSaves, clearDir, findSaveDirs, listBackups, moveSteamGame, newerVersion, nvidiaVersion, priceAlert, restoreBackup, shaderCaches } from '../src/core/gametools.js';
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
ok(nvidiaVersion('32.0.15.8129') === '581.29' && nvidiaVersion('31.0.15.5222') === '552.22', 'version NVIDIA');
ok(newerVersion('581.42', '581.29') && !newerVersion('581.29', '581.29'), 'comparaison de versions');
console.log(`✅ Outils de jeu (FPS, sauvegardes, shaders, déplacement, prix, pilotes) : ${n} vérifications`);
