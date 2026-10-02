import assert from 'node:assert/strict';
import { WebmClusters, ReplayBuffer } from '../src/replay.js';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const b = (...n) => Buffer.from(n);
const elem = (id, body) => Buffer.concat([id, b(0x80 | body.length), body]);
const head = b(0x1a,0x45,0xdf,0xa3,0x80,0x18,0x53,0x80,0x67,0xff);
const payload = elem(b(0xa3), b(0x81,0,0,0x80,0x1f,0x43,0xb6,0x75));
const cluster = time => Buffer.concat([b(0x1f,0x43,0xb6,0x75,0xff), elem(b(0xe7), b(time >> 8, time & 255)), payload]);
const stream = Buffer.concat([head, cluster(0), cluster(1000), cluster(2000), cluster(3000)]);
for (const size of [1, 3, 9, 1024]) {
  const parser = new WebmClusters(), parts = [];
  for (let i = 0; i < stream.length; i += size) parts.push(...parser.push(stream.subarray(i, i + size)));
  assert.deepEqual(parts.map(p => p.time), [0, 1000, 2000]);
  assert.deepEqual(parts[0].data, cluster(0), 'pas de découpe sur un motif dans un paquet vidéo');
  assert.equal(parser.header.subarray(0, 5).toString('hex'), head.subarray(0,5).toString('hex'), 'en-tête fragmenté conservé');
}
const dir = await mkdtemp(path.join(os.tmpdir(), 'clips-replay-test-'));
const buffer = new ReplayBuffer(path.join(dir, 'session'), 1);
// Les deux pistes n’arrivent pas au même rythme et les écritures sont concurrentes.
await Promise.all([buffer.push('video', stream.subarray(0, 8)), buffer.push('mic', stream), buffer.push('video', stream.subarray(8))]);
const video = path.join(dir, 'video.webm'), mic = path.join(dir, 'mic.webm');
const snapshot = buffer.snapshot(video, mic); const closing = buffer.close();
assert.equal((await snapshot).mic, true); await closing;
assert.ok((await readFile(video)).length > 0 && (await readFile(mic)).length > 0, 'fermeture attend la copie du clip');
await assert.rejects(buffer.snapshot(video, mic), /redémarré/);
console.log('✅ Replay : fragmentation, frontières de clusters, ordre des écritures, pistes synchronisées, fermeture pendant sauvegarde');
