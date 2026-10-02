import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { localGameArt } from '../src/gameArt.js';
const root = await mkdtemp(path.join(os.tmpdir(), 'clips-art-'));
try {
  await mkdir(path.join(root, 'steamapps'), { recursive: true });
  await mkdir(path.join(root, 'appcache/librarycache/730/nested'), { recursive: true });
  await writeFile(path.join(root, 'steamapps/appmanifest_730.acf'), '"name" "Counter-Strike 2"');
  const header = path.join(root, 'appcache/librarycache/730/nested/header.jpg');
  await writeFile(header, 'fixture');
  assert.equal(await localGameArt([root], 'Counter-Strike 2'), header);
  assert.equal(await localGameArt([root], 'Unrelated Game'), null);
  assert.equal(await localGameArt([root], 'Bureau'), null);
  await rm(header);
  const legacy = path.join(root, 'appcache/librarycache/730_library_hero.jpg');
  await writeFile(legacy, 'fixture');
  assert.equal(await localGameArt([root], 'Counter-Strike 2'), legacy);
  console.log('✅ Fonds : manifestes Steam, cache imbriqué/ancien, aucun jeu incorrect');
} finally { await rm(root, { recursive: true, force: true }); }
