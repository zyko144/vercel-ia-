// Optimisation par jeu : plan proposé, chemins protégés, sauvegarde → application → annulation, idempotence.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyAction, gameActions, iniGet, iniSet, revertEntries, safeCleanDir } from '../src/core/gameopti.js';

const root = await mkdtemp(path.join(os.tmpdir(), 'gameopti-'));
const mk = async (p, text = 'x') => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, text); };
const local = path.join(root, 'Local'); const docs = path.join(root, 'Docs');
const fivemDir = path.join(root, 'FiveM'); const gmodDir = path.join(root, 'Steam', 'common', 'GarrysMod');

// Un PC de joueur : caches, mais aussi mods, plugins (ReShade), addons et configs à ne jamais toucher
await mk(path.join(fivemDir, 'FiveM.app', 'data', 'cache', 'a.bin'), '1234');
await mk(path.join(fivemDir, 'FiveM.app', 'data', 'server-cache', 'b.bin'));
await mk(path.join(fivemDir, 'FiveM.app', 'mods', 'car.rpf'));
await mk(path.join(fivemDir, 'FiveM.app', 'plugins', 'reshade-shaders', 'x.fx'));
await mk(path.join(fivemDir, 'FiveM.app', 'CitizenFX.ini'), '[Game]');
await mk(path.join(gmodDir, 'garrysmod', 'cache', 'c.dat'));
await mk(path.join(gmodDir, 'garrysmod', 'addons', 'mine.gma'));
await mk(path.join(gmodDir, 'garrysmod', 'cfg', 'autoexec.cfg'), 'bind f "noclip"\r\n');
const fnIni = path.join(local, 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini');
await mk(fnIni, '[/Script/FortniteGame.FortGameUserSettings]\r\nbUseVSync=True\r\nbMotionBlur=True\r\nFrameRateLimit=144.000000\r\n');
await mk(path.join(docs, 'My Games', 'Rainbow Six - Siege', 'acc1', 'GameSettings.ini'), '[DISPLAY_SETTINGS]\nVSync=1\n');
await mk(path.join(docs, 'My Games', 'Rainbow Six - Siege', 'acc2', 'GameSettings.ini'), '[DISPLAY_SETTINGS]\nVSync=0\n');
await mk(path.join(docs, 'My Games', 'Rocket League', 'TAGame', 'Config', 'TASystemSettings.ini'), '[SystemSettings]\nUseVsync=True\nMotionBlur=True\n');

const items = [
  { id: 'fivem', source: 'fivem', kind: 'game', installed: true, name: 'FiveM', installDir: fivemDir },
  { id: 'steam:4000', source: 'steam', steamId: 4000, kind: 'game', installed: true, name: 'Garry\'s Mod', installDir: gmodDir },
  { id: 'epic:Fortnite', source: 'epic', kind: 'game', installed: true, name: 'Fortnite', installDir: 'C:\\Epic\\Fortnite', exe: 'C:\\Epic\\Fortnite\\FortniteLauncher.exe' },
  { id: 'steam:359550', source: 'steam', kind: 'game', installed: true, name: 'Tom Clancy\'s Rainbow Six Siege' },
  { id: 'epic:Sugar', source: 'epic', kind: 'game', installed: true, name: 'Rocket League', exe: 'C:\\Epic\\rocketleague\\Binaries\\Win64\\RocketLeague.exe' },
];

// ---------- Plan proposé (rien n'est appliqué) ----------
const plan = await gameActions(items, { env: { LOCALAPPDATA: local }, docs });
const ids = plan.map((a) => a.id);
for (const id of ['fivem-cache', 'fivem-server-cache', 'gmod-cache', 'gmod-autoexec', 'fn-perf', 'fn-vsync', 'fn-blur', 'r6-vsync-acc1', 'r6-vsync-acc2', 'rl-vsync', 'rl-blur']) assert.ok(ids.includes(id), `action proposée : ${id}`);
assert.ok(!ids.includes('rl-fx'), 'une clé absente du fichier n’est jamais inventée');
assert.equal(plan.find((a) => a.id === 'fn-perf').on, false, 'Modéré / facultatif : décoché par défaut');
assert.equal(plan.find((a) => a.id === 'gmod-autoexec').on, false);
assert.equal(plan.find((a) => a.id === 'fivem-cache').on, true, 'Sûr : coché');
assert.equal(plan.find((a) => a.id === 'r6-vsync-acc2').applied, true, 'déjà appliqué détecté (compte 2)');
assert.match(plan.find((a) => a.id === 'fivem-cache').help, /ReShade détecté : gardé tel quel/);
assert.ok(plan.every((a) => a.paths?.length && ['safe', 'moderate', 'advanced'].includes(a.risk)), 'chemin exact et risque pour chaque action');
console.log('✅ Plan par jeu (FiveM, GMod, Fortnite, R6, RL) : rien d’appliqué, risques et chemins exacts');

// ---------- Jamais en dehors des caches connus ----------
for (const bad of [path.join(fivemDir, 'FiveM.app', 'mods'), path.join(fivemDir, 'FiveM.app', 'plugins'), path.join(fivemDir, 'FiveM.app', 'citizen'), path.join(gmodDir, 'garrysmod', 'addons'), path.join(gmodDir, 'garrysmod', 'data'), path.join(gmodDir, 'garrysmod', 'cfg'), path.join(docs, 'My Games'), path.join(fivemDir, 'FiveM.app', 'data', 'cache', '..', '..', 'mods'), 'FiveM.app/data/cache']) {
  assert.equal(safeCleanDir(bad), false, `refusé : ${bad}`);
  await assert.rejects(applyAction({ kind: 'clean', dir: bad }), /refusé/);
}
await applyAction(plan.find((a) => a.id === 'fivem-cache'));
await applyAction(plan.find((a) => a.id === 'gmod-cache'));
assert.equal((await readdir(path.join(fivemDir, 'FiveM.app', 'data', 'cache'))).length, 0, 'cache FiveM vidé');
for (const keep of [path.join(fivemDir, 'FiveM.app', 'mods', 'car.rpf'), path.join(fivemDir, 'FiveM.app', 'plugins', 'reshade-shaders', 'x.fx'), path.join(fivemDir, 'FiveM.app', 'CitizenFX.ini'), path.join(gmodDir, 'garrysmod', 'addons', 'mine.gma'), path.join(fivemDir, 'FiveM.app', 'data', 'cache')]) assert.ok(await stat(keep), `gardé : ${keep}`);
console.log('✅ Jamais supprimés : mods, plugins (ReShade), CitizenFX.ini, addons GMod, dossiers eux-mêmes');

// ---------- Sauvegarde → application → annulation (retour exact), et idempotence ----------
const before = {};
const files = [fnIni, path.join(gmodDir, 'garrysmod', 'cfg', 'autoexec.cfg'), path.join(docs, 'My Games', 'Rocket League', 'TAGame', 'Config', 'TASystemSettings.ini')];
for (const f of files) before[f] = await readFile(f, 'utf8');
const reg = new Map();
const io = { readFile: (f) => readFile(f, 'utf8').catch(() => null), writeFile: (f, t) => writeFile(f, t), rmFile: (f) => import('node:fs/promises').then((m) => m.rm(f, { force: true })), regGet: async (k, n) => reg.get(n) ?? null, regSet: async (k, n, v) => reg.set(n, v), regDel: async (k, n) => reg.delete(n), emptyDir: async () => 0 };
const chosen = plan.filter((a) => ['fn-perf', 'fn-vsync', 'fn-blur', 'gmod-autoexec', 'rl-vsync', 'rl-blur', 'gpu-epic:Fortnite'].includes(a.id));
assert.equal(chosen.length, 7);
const journal = [];
for (const a of chosen) journal.push(...(await applyAction(a, io)).entries);
const fnNow = await readFile(fnIni, 'utf8');
assert.equal(iniGet(fnNow, 'bUseVSync'), 'False'); assert.equal(iniGet(fnNow, 'bMotionBlur'), 'False'); assert.equal(iniGet(fnNow, 'PreferredFeatureLevel'), 'es31');
assert.equal(iniGet(fnNow, 'FrameRateLimit'), '144.000000', 'le reste du fichier ne bouge pas');
assert.match(fnNow, /\r\n/, 'fins de ligne Windows gardées');
assert.match(await readFile(path.join(gmodDir, 'garrysmod', 'cfg', 'autoexec.cfg'), 'utf8'), /^bind f "noclip"\r\nexec history_perf/, 'ta config GMod intacte, une seule ligne ajoutée');
assert.equal(reg.get('C:\\Epic\\Fortnite\\FortniteLauncher.exe'), 'GpuPreference=2;');
// Deuxième passage : ne change plus rien, n'empile rien
const again = [];
for (const a of chosen) again.push(...(await applyAction(a, io)).entries);
assert.equal(again.length, 0, 'appliquer deux fois ne change plus rien');
assert.equal((await readFile(path.join(gmodDir, 'garrysmod', 'cfg', 'autoexec.cfg'), 'utf8')).match(/exec history_perf/g).length, 1, 'pas de ligne en double');
await revertEntries(journal, io);
for (const f of files) assert.equal(await readFile(f, 'utf8'), before[f], `revenu exactement comme avant : ${path.basename(f)}`);
await assert.rejects(stat(path.join(gmodDir, 'garrysmod', 'cfg', 'history_perf.cfg')), 'fichier qui n’existait pas : supprimé');
assert.equal(reg.has('C:\\Epic\\Fortnite\\FortniteLauncher.exe'), false, 'valeur du registre qui n’existait pas : supprimée');
console.log('✅ Sauvegarde → application → annulation : retour exact (fichiers, « n’existait pas », registre), idempotent');

// ---------- Fichiers .ini ----------
assert.equal(iniSet('[A]\nx=1', { y: '2' }), '[A]\nx=1', 'clé inconnue : pas inventée sans section');
assert.equal(iniSet('[A]\nx=1', { y: '2' }, 'B'), '[A]\nx=1\n\n[B]\ny=2');
assert.equal(iniSet('[A]\n X = 1', { x: '0' }), '[A]\n X = 0');
await assert.rejects(applyAction({ kind: 'ini', file: fnIni, set: { a: 1 }, readonly: true }, io), /lecture seule/);
console.log('✅ Fichiers .ini : modifiés sur place, rien d’inventé, lecture seule respectée');

// Un journal invalide ne doit déclencher aucune écriture, même après une entrée valide.
let writes = 0;
const guardIo = { writeFile: async () => writes++, rmFile: async () => writes++, regSet: async () => writes++, regDel: async () => writes++ };
for (const bad of [
  { kind: 'file', file: 'C:\\Program Files (x86)\\Steam\\steam.exe', before: null },
  { kind: 'file', file: 'C:\\Program Files (x86)\\Steam', before: null },
  { kind: 'reg', key: 'HKCU\\Software\\Valve\\Steam', name: 'SteamPath', before: null },
  { kind: 'file', file: path.join(gmodDir, 'garrysmod', 'cfg', 'autoexec.cfg') },
]) {
  await assert.rejects(revertEntries([journal[0], bad], guardIo), /refusé/);
  assert.equal(writes, 0);
}
await assert.rejects(revertEntries([{ kind: 'file', file: path.join(gmodDir, 'garrysmod', 'cfg', 'history_perf.cfg'), before: null }], { ...guardIo, readFile: async () => 'configuration personnelle' }), /conservé/);
assert.equal(writes, 0);
console.log('✅ Annulation : Steam, dossiers, registre étranger et journal incomplet refusés avant écriture');
