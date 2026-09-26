import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { capturesOf, cleanTimes, customItem, mergeAchievements, nameFromExe, parseMicrosoftGameConfig, validAumid } from '../src/core/extras.js';

const T = mkdtempSync(path.join(os.tmpdir(), 'hl-extras-'));
const put = (p) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, 'x'); };
put(path.join(T, 'Steam', 'userdata', '42', '760', 'remote', '252950', 'screenshots', '2024_1.jpg'));
put(path.join(T, 'Videos', 'Rocket League', 'clip.mp4'));
put(path.join(T, 'Videos', 'Captures', 'Rocket League® 2024-05-01 21-14-03.png'));
put(path.join(T, 'Videos', 'Captures', 'Autre Jeu 2024-05-01 21-14-03.png'));
const caps = await capturesOf({ source: 'steam', steamId: '252950', name: 'Rocket League' }, { steamRoot: path.join(T, 'Steam'), accountIds: ['42'], videosDir: path.join(T, 'Videos') });
assert.equal(caps.length, 3, 'Steam + NVIDIA + barre de jeu, pas les autres jeux');
assert.equal(caps.filter((c) => c.video).length, 1);

const ach = mergeAchievements(
  [{ apiname: 'A', achieved: 1, unlocktime: 100 }, { apiname: 'B', achieved: 0 }, { apiname: 'C', achieved: 0 }],
  [{ name: 'A', displayName: 'Premier but', icon: 'a.jpg' }, { name: 'B', displayName: 'Facile', icongray: 'b.jpg' }, { name: 'C', displayName: 'Dur' }],
  [{ name: 'A', percent: '90' }, { name: 'B', percent: '60.5' }, { name: 'C', percent: '1.2' }],
);
assert.equal(ach.done, 1);
assert.deepEqual(ach.easy.map((a) => a.name), ['Facile', 'Dur'], 'le plus fréquent d’abord');
assert.equal(ach.easy[0].pct, 60.5);

assert.deepEqual(cleanTimes({ found: true, main: 12.34, extra: 20, complete: 99999 }), { main: 12.3, extra: 20, complete: null });
assert.equal(cleanTimes({ found: false, main: 5, extra: 5, complete: 5 }), null);

const cfg = parseMicrosoftGameConfig('<Game><ExecutableList><Executable Name="ForzaHorizon5.exe" Id="Game" /></ExecutableList><ShellVisuals DefaultDisplayName="Forza Horizon 5" /></Game>');
assert.deepEqual(cfg, { name: 'Forza Horizon 5', exe: 'ForzaHorizon5.exe', appId: 'Game' });
assert.equal(parseMicrosoftGameConfig('<ShellVisuals DefaultDisplayName="ms-resource:Title"/>').name, null);
assert.ok(validAumid('Microsoft.624F8B84B80_8wekyb3d8bbwe!Game'));
assert.ok(!validAumid('x & calc!Game'));

assert.equal(nameFromExe('C:\\Jeux\\RocketLeague.exe'), 'Rocket League');
assert.equal(nameFromExe('D:\\G\\hollow_knight.exe'), 'hollow knight');
assert.equal(customItem({ id: 'custom:1', name: 'Mon jeu', exe: 'D:\\G\\jeu.exe' }).installDir, 'D:\\G');
console.log('✅ captures, succès, durée, Xbox, jeux ajoutés : 14 vérifications');
