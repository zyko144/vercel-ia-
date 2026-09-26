import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boostPlan, parseScheme } from '../src/core/boost.js';
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
console.log('✅ boost, surveillance et nettoyage : 13 vérifications');
