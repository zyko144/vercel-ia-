import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classify, deepScan, eta, sizeGroups, storageScore } from '../src/core/deepscan.js';
import { installScript, kindOf, parseSearch } from '../src/core/winupdate.js';
import { parseEvents, unifiedHealth } from '../src/core/health.js';
import { SYSTEM_TWEAKS, systemTweakScript } from '../src/core/optimize.js';
import { REF, VERSION, cpuBench, diskBench, ramBench, scores } from '../src/core/bench.js';
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };

// Classement des fichiers
const now = Date.now();
ok(classify('C:\\Users\\a\\AppData\\Local\\Temp\\x.tmp', 10, now - 9 * 864e5, now).junk === 'temp', 'temp ancien = inutile');
ok(classify('C:\\Users\\a\\AppData\\Local\\Temp\\x.tmp', 10, now, now).junk === null, 'temp récent gardé');
ok(classify('C:\\Users\\a\\Downloads\\facture.pdf.exe', 10, now, now).suspect === 'double-extension', 'double extension');
ok(classify('C:\\Users\\a\\AppData\\Roaming\\svch0st.exe', 10, now, now).suspect === 'emplacement', 'exe à la racine de Roaming');
ok(classify('C:\\Program Files\\App\\app.exe', 10, now, now).suspect === null, 'programme installé normal');
ok(classify('D:\\SteamLibrary\\steamapps\\common\\CS2\\game.vpk', 10, now, now).cat === 'jeux', 'fichier de jeu');
ok(classify('C:\\Users\\a\\Videos\\clip.mp4', 10, now, now).cat === 'videos', 'vidéo');
ok(classify('C:\\Windows\\System32\\x.dll', 10, now, now).cat === 'systeme', 'système');
ok(classify('C:\\Users\\a\\Downloads\\setup.exe', 10, now - 40 * 864e5, now).junk === 'installer', 'vieil installateur');
ok(eta(50, 100, 10_000) === 10 && eta(0, 100, 10_000) === null, 'temps restant');
ok(sizeGroups([{ path: 'a', size: 2e6 }, { path: 'b', size: 2e6 }, { path: 'c', size: 3e6 }]).length === 1, 'groupes de même taille');

// Vraie lecture d'un dossier : doublons confirmés par SHA-256, faux doublons (même taille) écartés
const dir = await mkdtemp(path.join(os.tmpdir(), 'deep-'));
await mkdir(path.join(dir, 'a', 'b'), { recursive: true });
await mkdir(path.join(dir, 'vide'));
const big = Buffer.alloc(2 * 1024 * 1024, 7);
const big2 = Buffer.from(big); big2[1024 * 1024] = 9; // même taille, contenu différent au milieu
await writeFile(path.join(dir, 'a', 'film.mp4'), big);
await writeFile(path.join(dir, 'a', 'b', 'copie.mp4'), big);
await writeFile(path.join(dir, 'autre.mp4'), big2);
await writeFile(path.join(dir, 'crash.dmp'), 'x');
await writeFile(path.join(dir, 'vieux.bak'), 'x');
await utimes(path.join(dir, 'vieux.bak'), new Date(now - 60 * 864e5), new Date(now - 60 * 864e5));
const ticks = [];
const r = await deepScan({ roots: [dir], onProgress: (p) => ticks.push(p.phase) });
ok(r.files === 5 && r.dirs === 4, `5 fichiers et 4 dossiers lus (${r.files}/${r.dirs})`);
ok(r.emptyDirs === 1, 'dossier vide repéré');
ok(r.duplicates.length === 1 && r.duplicates[0].paths.length === 2, 'un seul vrai doublon (le faux écarté par l’empreinte)');
ok(r.dupWasted === big.length, 'place perdue en doublons');
ok(r.junk.dump?.files === 1 && r.junk.tmp?.files === 1, 'dump et .bak ancien repérés');
ok(r.cats.videos.files === 3, 'vidéos comptées');
ok(ticks.includes('walk') && ticks.includes('hash'), 'avancement envoyé');
ok(storageScore(r) === 100 && storageScore({ junk: { t: { bytes: 5e9 } }, dupWasted: 2e9, suspects: [1, 2] }) === 75, 'note de stockage');
const ac = new AbortController(); ac.abort();
await assert.rejects(deepScan({ roots: [dir], signal: ac.signal }), /annulé/); n += 1;

// Windows Update
const wu = parseSearch({ updates: [
  { id: '11111111-2222-3333-4444-555555555555', title: '2026-09 Mise à jour cumulative pour Windows 11 (KB5050000)', kb: '5050000', size: 900e6, cats: 'Security Updates', auto: true, type: 1 },
  { id: '11111111-2222-3333-4444-666666666666', title: 'NVIDIA - Display - 32.0.15.6094', size: 700e6, cats: 'Drivers', auto: false, type: 2 },
  { id: 'pas-un-guid', title: 'x' },
], history: { title: 'KB1', date: '2026-09-01', result: 2 }, reboot: true });
ok(wu.updates.length === 2 && wu.updates[0].kind === 'securite' && wu.updates[1].kind === 'pilote' && wu.updates[1].optional, 'mises à jour rangées');
ok(wu.updates[0].kb === 'KB5050000' && wu.reboot && wu.history[0].result === 'ok', 'KB, redémarrage, historique');
ok(kindOf({ title: 'Security Intelligence Update for Microsoft Defender Antivirus', cats: 'Definition Updates' }) === 'defender', 'Defender');
ok(/'11111111-2222-3333-4444-555555555555'/.test(installScript(['11111111-2222-3333-4444-555555555555', "x'; rm -rf"], 'C:\\t\\p.json')), 'script avec les seuls identifiants valides');
assert.throws(() => installScript(["'; Remove-Item C:\\"], 'f')); n += 1;

// Score unique et journal de Windows
const h = unifiedHealth({ diag: 80, opti: 60 });
ok(h.score === 73 && h.parts.length === 2, 'score combiné pondéré');
ok(unifiedHealth({}).score === null, 'rien d’analysé');
const ev = parseEvents({ power: 2, bsod: 1, disk: 0, whea: 0, gpu: 0, errors: 40, crashes: [{ name: 'game.exe', count: 4 }] });
ok(ev.findings.length === 3 && ev.findings[0].prio === 0 && ev.score < 80, 'écrans bleus, arrêts brutaux et plantages signalés');

// Réglages système : script fixe avec point de restauration
const sc = systemTweakScript([{ id: 'mmcss', on: true }, { id: 'dosvc', on: false }, { id: 'power', on: true }]);
ok(/^.*\n?Checkpoint-Computer/m.test(sc) && /SystemResponsiveness" \/t REG_DWORD \/d "10"/.test(sc), 'point de restauration + valeur optimisée');
ok(/reg delete ".*DeliveryOptimization" \/v "DODownloadMode"/.test(sc), 'retour à la valeur de Windows');
ok(/powercfg -duplicatescheme e9a42b02/.test(sc) && SYSTEM_TWEAKS.length >= 6, 'performances optimales');
// Benchmark extrême : PC de référence = 1000 partout ; vraies mesures courtes pour vérifier que tout tourne
const refRun = { v: VERSION, cpu: { single: REF.cpu1, multi: REF.cpuN }, ram: REF.ram, disk: REF.disk, gpu: { scenes: REF.gpu } };
const sref = scores(refRun);
ok(sref.total === 1000 && sref.cpu1 === 1000 && sref.gpu === 1000 && sref.disk === 1000, 'PC de référence = 1000');
ok(scores({ ...refRun, gpu: { scenes: { geometry: 600, shader: 220, post: 440 } } }).gpu === 2000, 'carte 2× plus rapide = 2000');
const cpu = await cpuBench({ ms: 150, sustainMs: 600 });
ok(Object.values(cpu.single).every((v) => v > 0) && Object.values(cpu.multi).every((v) => v > 0) && cpu.sustain.slices.length === 6, 'épreuves processeur mesurées');
ok(ramBench(100).latency > 0, 'latence mémoire mesurée');
const dk = await diskBench(os.tmpdir(), { sizeMb: 16 });
ok(dk.write > 0 && dk.read > 0 && dk.iopsR > 0 && dk.iopsW > 0 && dk.readSrc === 'test', 'disque mesuré');
console.log(`✅ Analyse pro, Windows Update, score unique, réglages système : ${n} vérifications`);
