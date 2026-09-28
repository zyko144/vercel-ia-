import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boostPlan, parseScheme, tuneScript, untuneScript, parseCpu, cpuHogs } from '../src/core/boost.js';
import { shaderCaches, withPerfMode, perfModeOn } from '../src/core/gametools.js';
import { cleanTarget, cleanTargets, measureTargets } from '../src/core/cleanup.js';
import { cpuUsage, heatAlerts, parseNvidiaSmi } from '../src/core/monitor.js';

assert.equal(parseScheme('GUID du mode de gestion de l’alimentation : 381b4222-f694-41f0-9685-ff5bb260df2e  (Utilisation normale)'), '381b4222-f694-41f0-9685-ff5bb260df2e');
assert.equal(parseScheme('rien'), null);
const plan = boostPlan(['c:\\program files\\google\\chrome\\application\\chrome.exe', 'c:\\program files\\google\\chrome\\application\\chrome.exe', 'c:\\steam\\steam.exe', 'c:\\office\\winword.exe'], ['chrome', 'office']);
assert.deepEqual(plan.map((p) => p.exe).sort(), ['chrome.exe', 'winword.exe'], 'seulement les applis choisies, une fois chacune');
assert.deepEqual(boostPlan(['c:\\steam\\steam.exe'], ['chrome']), []);

assert.deepEqual(parseNvidiaSmi('NVIDIA GeForce RTX 3060, 67, 98, 5120, 12288\n'), { name: 'NVIDIA GeForce RTX 3060', temp: 67, usage: 98, vramUsed: 5120, vramTotal: 12288 });
assert.equal(parseNvidiaSmi(''), null);
const cpus = (idle, busy) => [{ times: { user: busy, nice: 0, sys: 0, idle, irq: 0 } }];
cpuUsage(cpus(100, 100));
assert.equal(cpuUsage(cpus(150, 250)), 75);
const seen = {};
assert.equal(heatAlerts({ gpu: { temp: 90 }, cpu: {} }, seen, 1e9).length, 1);
assert.equal(heatAlerts({ gpu: { temp: 91 }, cpu: {} }, seen, 1e9 + 60_000).length, 0, 'pas de rappel avant 10 min');

const T = mkdtempSync(path.join(os.tmpdir(), 'hl-clean-'));
const env = { LOCALAPPDATA: path.join(T, 'Local'), APPDATA: path.join(T, 'Roaming'), TEMP: path.join(T, 'Local', 'Temp') };
mkdirSync(path.join(env.TEMP, 'sous'), { recursive: true });
writeFileSync(path.join(env.TEMP, 'a.tmp'), 'x'.repeat(1000));
writeFileSync(path.join(env.TEMP, 'sous', 'b.tmp'), 'x'.repeat(500));
const targets = await measureTargets(cleanTargets(env));
const temp = targets.find((x) => x.id === 'temp');
assert.equal(temp.bytes, 1500);
assert.equal(await cleanTarget(temp), 1500);
assert.ok(existsSync(env.TEMP), 'le dossier lui-même est gardé');
assert.equal(targets.find((x) => x.id === 'd3d').bytes, 0, 'dossier absent : 0');
const tune = tuneScript(["c:\\games\\it's\\game.exe", 'bad"path.exe']);
assert.match(tune, /'c:\\games\\it''s\\game\.exe'/, 'chemin du jeu échappé');
assert.doesNotMatch(tune, /bad"path/, 'chemin douteux ignoré');
assert.match(tune, /AboveNormal/); assert.doesNotMatch(tune, /RealTime|'High'/, 'jamais temps réel ni haute');
assert.match(tune, /GpuPreference=2;/); assert.match(untuneScript(), /'Normal'/);
// Freezes : qui a pris du processeur (jeu et Windows ignorés)
const hogs = cpuHogs(parseCpu('OneDrive|10\nFortniteClient|100\ndwm|5'), parseCpu('OneDrive|50\nFortniteClient|900\ndwm|90'), 20, 4, ['FortniteClient']);
assert.deepEqual(hogs, [{ name: 'OneDrive', pct: 50 }]);
// FiveM : seulement les caches retéléchargés, jamais game-storage, mods, plugins ni citizen (packs graphiques)
const fc = shaderCaches({ source: 'fivem', installDir: 'C:\\FiveM' }).filter((c) => c.id.startsWith('fivem'));
assert.deepEqual(fc.map((c) => c.dir.split(/[\\/]/).pop()), ['cache', 'server-cache', 'server-cache-priv']);
assert.ok(fc.every((c) => !/game-storage|mods|plugins|citizen/i.test(c.dir)));
// Fortnite : mode Performance posé une seule fois, le reste du fichier intact
const ini = '[ScalabilityGroups]\r\nsg.ViewDistanceQuality=3\r\n[D3DRHIPreference]\r\nPreferredRHI=dx12\r\n';
const fn = withPerfMode(ini);
assert.ok(perfModeOn(fn) && !perfModeOn(ini));
assert.equal((fn.match(/PreferredRHI/g) ?? []).length, 1); assert.match(fn, /sg\.ViewDistanceQuality=3/);
assert.ok(perfModeOn(withPerfMode('[Autre]\r\na=1')));
console.log('✅ boost, surveillance et nettoyage : 27 vérifications');
