import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logStart, mergeSessions, scanFivem, sessionsMinutes } from '../src/core/fivem.js';

assert.equal(new Date(logStart('CitizenFX_log_2024-05-01T211403.log')).getHours(), 21);
assert.equal(logStart('autre.log'), null);
const h = 3_600_000;
assert.deepEqual(mergeSessions([[0, 2 * h], [h, 3 * h], [10 * h, 10 * h + 30_000], [20 * h, 40 * h]]), [[0, 3 * h]], 'chevauchement fusionné, trop court et trop long écartés');
assert.equal(sessionsMinutes([[0, 2 * h], [5 * h, 5.5 * h]]), 150);

const T = mkdtempSync(path.join(os.tmpdir(), 'hl-fivem-'));
const dir = path.join(T, 'FiveM');
mkdirSync(path.join(dir, 'FiveM.app', 'logs'), { recursive: true });
writeFileSync(path.join(dir, 'FiveM.exe'), 'x');
const log = path.join(dir, 'FiveM.app', 'logs', 'CitizenFX_log_2026-09-20T200000.log');
writeFileSync(log, 'x');
const end = new Date(2026, 8, 20, 22, 30, 0).getTime() / 1000;
utimesSync(log, end, end);
const r1 = await scanFivem(dir);
assert.equal(r1.item.minutes, 150, 'session de 20 h à 22 h 30');
// Journal effacé par FiveM : le temps est gardé grâce aux sessions enregistrées
const r2 = await scanFivem(path.join(T, 'FiveM'), [...r1.sessions, [Date.parse('2026-09-01T10:00:00Z'), Date.parse('2026-09-01T11:00:00Z')]]);
assert.equal(r2.item.minutes, 210);
assert.equal((await scanFivem(path.join(T, 'rien'))).item, null);
console.log('✅ FiveM (journaux, sessions gardées) : 8 vérifications');
