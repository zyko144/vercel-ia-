import assert from 'node:assert/strict';
import path from 'node:path';
import { captureDir, captureName, safeName } from '../src/core/capture.js';

assert.equal(safeName('Tom Clancy’s: Rainbow Six® <Siege>?'), 'Tom Clancy’s Rainbow Six® Siege');
assert.equal(safeName('CON'), 'CON_');
assert.equal(safeName('Jeu...'), 'Jeu');
assert.equal(captureDir('Rocket League', '/v'), path.join('/v', 'Rocket League'));
assert.equal(captureDir(null, '/v'), path.join('/v', 'History Launcher'));
assert.equal(captureName('Rocket League', 'png', new Date(2026, 8, 26, 21, 4, 3)), 'Rocket League 2026-09-26 21-04-03.png');
assert.equal(captureName(null, 'webm', new Date(2026, 0, 1, 0, 0, 0)), 'Capture 2026-01-01 00-00-00.webm');
console.log('✅ Captures (dossier, nom de fichier) : 7 vérifications');
