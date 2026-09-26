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

// Anti-triche : toujours via la plateforme (Rocket League, Rainbow Six…)
{
  const { launchPlan: plan, hasAntiCheat } = await import('../src/core/direct.js');
  const { mkdtempSync, mkdirSync } = await import('node:fs');
  const { readdir } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  assert.deepEqual(plan({ source: 'steam', steamId: '252950' }), ['client'], 'Rocket League');
  assert.deepEqual(plan({ source: 'steam', steamId: '359550' }), ['client'], 'Rainbow Six Siege');
  assert.deepEqual(plan({ source: 'steam', steamId: '1' }, { antiCheat: true }), ['client']);
  const d = mkdtempSync(path.join(os.tmpdir(), 'ac-'));
  assert.equal(await hasAntiCheat(d, readdir), false);
  mkdirSync(path.join(d, 'Binaries', 'EasyAntiCheat'), { recursive: true });
  assert.equal(await hasAntiCheat(d, readdir), true, 'dossier EAC un niveau en dessous');
  console.log('✅ Anti-triche : 5 vérifications');
}
