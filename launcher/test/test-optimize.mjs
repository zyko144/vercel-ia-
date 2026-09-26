import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEEP_CLEAN_SCRIPT, GAME_TWEAKS, extraTargets, orphanGameFolders, parseStartup, removeOrphan, tweakApplied } from '../src/core/optimize.js';

const T = mkdtempSync(path.join(os.tmpdir(), 'hl-opti-'));
const put = (p, n = 10) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, 'x'.repeat(n)); };

// Navigateurs : chaque profil, jamais les données personnelles
mkdirSync(path.join(T, 'Local', 'Google', 'Chrome', 'User Data', 'Default'), { recursive: true });
mkdirSync(path.join(T, 'Local', 'Google', 'Chrome', 'User Data', 'Profile 2'), { recursive: true });
mkdirSync(path.join(T, 'Local', 'Google', 'Chrome', 'User Data', 'System Profile'), { recursive: true });
const targets = await extraTargets({ LOCALAPPDATA: path.join(T, 'Local'), APPDATA: path.join(T, 'Roaming'), ProgramData: path.join(T, 'PD'), SystemDrive: 'C:' });
const chrome = targets.filter((x) => x.id.startsWith('chrome-') && !x.id.includes('code'));
assert.equal(chrome.length, 2, 'Default + Profile 2');
assert.ok(chrome.every((x) => /Cache[\\/]Cache_Data$/.test(x.dir)), 'seulement le cache');

// Restes de jeux : dossier sans appmanifest
const lib = path.join(T, 'SteamLib', 'steamapps');
put(path.join(lib, 'appmanifest_10.acf'), 0);
writeFileSync(path.join(lib, 'appmanifest_10.acf'), '"AppState" { "installdir" "Counter-Strike Global Offensive" }');
put(path.join(lib, 'common', 'Counter-Strike Global Offensive', 'game.pak'), 500);
put(path.join(lib, 'common', 'Vieux Jeu', 'data.pak'), 800);
const orphans = await orphanGameFolders([lib]);
assert.deepEqual(orphans.map((o) => [o.label, o.bytes]), [['Vieux Jeu', 800]]);
assert.equal(await removeOrphan({ dir: path.join(T, 'ailleurs') }, [lib]), 0, 'jamais hors de steamapps\\common');
assert.equal(await removeOrphan(orphans[0], [lib]), 800);
assert.ok(!existsSync(orphans[0].dir));
assert.ok(existsSync(path.join(lib, 'common', 'Counter-Strike Global Offensive')), 'le jeu installé est intact');

// Démarrage : état comme le Gestionnaire des tâches
const runText = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\n    Discord    REG_SZ    C:\\Discord\\Update.exe --processStart Discord.exe\n    MonOutil    REG_SZ    C:\\outil.exe\n';
const approvedText = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run\n    Discord    REG_BINARY    030000000000000000000000\n';
const st = parseStartup(runText, approvedText);
assert.deepEqual(st.map((s) => [s.name, s.enabled, s.heavy]), [['MonOutil', true, false], ['Discord', false, true]]);

// Réglages
const gm = GAME_TWEAKS.find((t) => t.id === 'gamemode');
assert.ok(tweakApplied(gm, { AutoGameModeEnabled: 1 }));
assert.ok(!tweakApplied(gm, {}));
assert.ok(!/\$\{|\binput\b/i.test(DEEP_CLEAN_SCRIPT) && DEEP_CLEAN_SCRIPT.includes('StartComponentCleanup'), 'script fixe');
console.log('✅ optimisation complète : 12 vérifications');
const { groupOf, healthScore, scoreLabel } = await import('../src/core/optimize.js');
assert.equal(groupOf('chrome-Default'), 'navigateurs');
assert.equal(groupOf('steam-logs'), 'jeux');
assert.equal(groupOf('nvdx'), 'pilotes');
assert.equal(groupOf('temp'), 'systeme');
assert.equal(healthScore({}), 100);
assert.equal(healthScore({ junkBytes: 20e9, orphanBytes: 30e9, heavyStartup: 10, tweaksOff: 10, freeRatio: 0.05 }), 0);
assert.equal(scoreLabel(80), 'Bon');
console.log('✅ catégories et score de santé : 7 vérifications');
