import assert from 'node:assert/strict';
import { directEnv, insideDir, launchPlan } from '../src/core/direct.js';

assert.deepEqual(launchPlan({ source: 'steam' }), ['exe', 'client']);
assert.deepEqual(launchPlan({ source: 'epic' }, { memo: 'client' }), ['client']);
assert.deepEqual(launchPlan({ source: 'steam' }, { direct: false }), ['client']);
assert.deepEqual(launchPlan({ source: 'ea' }, { direct: false }), ['exe']);
assert.equal(directEnv({ source: 'steam', steamId: 252950 }, {}).SteamAppId, '252950');
assert.equal(directEnv({ source: 'epic' }, {}).SteamAppId, undefined);
assert.ok(insideDir('C:\\Games\\Rocket League\\Binaries\\RL.exe', 'c:/games/rocket league/'));
assert.ok(!insideDir('C:\\Games\\Rocket League 2\\x.exe', 'C:\\Games\\Rocket League'));
console.log('✅ lancement direct : 8 vérifications');
