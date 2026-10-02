import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { serveMedia } from '../src/mediaFile.js';
const dir = await mkdtemp(path.join(os.tmpdir(), 'clips-http-test-'));
const file = path.join(dir, 'video.mp4'); await writeFile(file, '0123456789');
for (const [range, status, body] of [[null,200,'0123456789'],['bytes=2-4',206,'234'],['bytes=7-',206,'789'],['bytes=-3',206,'789'],['bytes=0-100',206,'0123456789'],['bytes=8-3',416,''],['bytes=-0',416,''],['bytes=100-',416,''],['bytes=-',416,'']]) {
  const r = await serveMedia(file, range); assert.equal(r.status,status); assert.equal(await r.text(),body);
}
const head = await serveMedia(file,'bytes=2-4','HEAD'); assert.equal(head.headers.get('Content-Length'),'3'); assert.equal(await head.text(),'');
assert.equal((await serveMedia(path.join(dir,'absent'),null)).status,404);
console.log('✅ Lecture : début, seek, fin de fichier, HEAD, plages invalides et fichier absent');
