/**
 * Banc d'essai de la vérification des fichiers : vrais formats de manifeste Steam (protobuf) et Epic (binaire),
 * fichiers manquants, abîmés, de mauvaise taille ; avancement ; noms qui tentent de sortir du dossier.
 *
 *   node test/test-verify.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { parseEpicManifest, parseSteamManifest, verifyGame } from '../src/core/verify.js';

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const T = mkdtempSync(path.join(os.tmpdir(), 'verif-'));
const put = (p, data) => { mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, data); };
const sha1 = (b) => createHash('sha1').update(b).digest();

// ---- Fabrique un manifeste Steam (protobuf) : payload + métadonnées
const vint = (n) => { const out = []; let v = BigInt(n); do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v); return Buffer.from(out); };
const field = (num, type, value) => Buffer.concat([vint((num << 3) | type), ...(type === 2 ? [vint(value.length), value] : [vint(value)])]);
const mapping = (name, content, flags = 0) => field(1, 2, Buffer.concat([field(1, 2, Buffer.from(name)), field(2, 0, content.length), field(3, 0, flags), field(5, 2, sha1(content))]));
const section = (magic, body) => { const h = Buffer.alloc(8); h.writeUInt32LE(magic, 0); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); };
const steamManifest = (files, encrypted = false) => Buffer.concat([section(0x71f617d0, Buffer.concat(files)), section(0x1f4812be, Buffer.concat([field(1, 0, 42), field(4, 0, encrypted ? 1 : 0)]))]);

// ---- Fabrique un manifeste Epic binaire (compressé)
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const fstr = (s) => Buffer.concat([u32(s.length + 1), Buffer.from(`${s}\0`, 'latin1')]);
function epicManifest(files) {
  const meta = Buffer.concat([u32(8), u32(0)]);
  const cdl = Buffer.concat([u32(8), u32(0)]);
  const parts = files.map((f) => Buffer.concat([u32(1), u32(28), Buffer.alloc(16), u32(0), u32(f.content.length)]));
  const body = Buffer.concat([Buffer.from([0]), u32(files.length), ...files.map((f) => fstr(f.name)), ...files.map(() => fstr('')), ...files.map((f) => sha1(f.content)), Buffer.from(files.map(() => 0)), ...files.map(() => u32(0)), ...parts]);
  const fml = Buffer.concat([u32(body.length + 4), body]);
  const data = Buffer.concat([meta, cdl, fml]);
  const packed = deflateSync(data);
  const header = Buffer.alloc(41);
  header.writeUInt32LE(0x44bec00c, 0); header.writeUInt32LE(41, 4); header.writeUInt32LE(data.length, 8); header.writeUInt32LE(packed.length, 12); header[40] = 1;
  return Buffer.concat([header, packed]);
}

const A = Buffer.from('contenu du jeu A'.repeat(1000));
const B = Buffer.from('fichier de données B'.repeat(500));
const C = Buffer.from('bibliothèque C'.repeat(200));

await check('manifeste Steam : fichiers, tailles, empreintes ; dossiers ignorés ; noms chiffrés = pas de vérification', async () => {
  const files = parseSteamManifest(steamManifest([mapping('Jeu.exe', A), mapping('data\\b.pak', B), mapping('data', Buffer.alloc(0), 64)]));
  assert.deepEqual(files.map((f) => [f.name, f.size]), [['Jeu.exe', A.length], ['data/b.pak', B.length]]);
  assert.equal(files[0].sha1, sha1(A).toString('hex'));
  assert.equal(parseSteamManifest(steamManifest([mapping('x', A)], true)), null);
});

await check('manifeste Epic (compressé) : noms, tailles, empreintes', async () => {
  const files = parseEpicManifest(epicManifest([{ name: 'Game/Bin/Jeu.exe', content: A }, { name: 'Game/Content/c.pak', content: C }]));
  assert.deepEqual(files.map((f) => [f.name, f.size]), [['Game/Bin/Jeu.exe', A.length], ['Game/Content/c.pak', C.length]]);
  assert.equal(files[1].sha1, sha1(C).toString('hex'));
  assert.equal(parseEpicManifest(Buffer.from('{"json":true}')), null, 'ancien format JSON : non pris en charge');
});

await check('vérification Steam : fichier manquant, abîmé et de mauvaise taille détectés, avec avancement', async () => {
  const root = path.join(T, 'Steam');
  const game = path.join(root, 'steamapps', 'common', 'Jeu');
  put(path.join(root, 'depotcache', '100_555.manifest'), steamManifest([mapping('Jeu.exe', A), mapping('data\\b.pak', B), mapping('data\\c.pak', C), mapping('..\\..\\evil.txt', C)]));
  put(path.join(game, 'Jeu.exe'), A);
  const broken = Buffer.from(B); broken[10] ^= 0xff; // même taille, contenu abîmé
  put(path.join(game, 'data', 'b.pak'), broken);
  const progress = [];
  const r = await verifyGame({ source: 'steam', installDir: game, steamRoot: root, steamDepots: [{ depot: '100', manifest: '555' }] }, { onProgress: (p) => progress.push(p) });
  assert.equal(r.mode, 'complet');
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['data/c.pak']);
  assert.deepEqual(r.corrupt, ['data/b.pak']);
  assert.ok(progress.length > 1 && progress.at(-1).bytes >= progress[0].bytes, 'avancement envoyé');
  assert.ok(!r.missing.includes('../../evil.txt'), 'un nom qui sort du dossier est ignoré');
  put(path.join(game, 'data', 'b.pak'), B);
  put(path.join(game, 'data', 'c.pak'), C);
  put(path.join(game, 'Jeu.exe'), Buffer.concat([A, Buffer.from('x')]));
  const r2 = await verifyGame({ source: 'steam', installDir: game, steamRoot: root, steamDepots: [{ depot: '100', manifest: '555' }] });
  assert.deepEqual(r2.sizes, ['Jeu.exe'], 'mauvaise taille');
});

await check('vérification Epic : tout bon = ok ; annulation possible', async () => {
  const game = path.join(T, 'Epic', 'Jeu');
  put(path.join(game, '.egstore', 'X.manifest'), epicManifest([{ name: 'Game/Bin/Jeu.exe', content: A }, { name: 'Game/Content/c.pak', content: C }]));
  put(path.join(game, 'Game', 'Bin', 'Jeu.exe'), A);
  put(path.join(game, 'Game', 'Content', 'c.pak'), C);
  const r = await verifyGame({ source: 'epic', installDir: game });
  assert.equal(r.ok, true);
  assert.equal(r.checked, 2);
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(verifyGame({ source: 'epic', installDir: game }, { signal: ctrl.signal }), /annulé/);
});

await check('sans liste officielle : présence et taille totale', async () => {
  const game = path.join(T, 'Autre', 'Jeu');
  put(path.join(game, 'a.bin'), A);
  const r = await verifyGame({ source: 'riot', installDir: game, size: A.length * 3, exe: path.join(game, 'Jeu.exe') });
  assert.equal(r.mode, 'simple');
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['Jeu.exe']);
  assert.equal(r.sizes.length, 1);
});

console.log(`\n${passed} vérifications passées.`);
