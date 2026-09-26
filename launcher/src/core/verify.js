// Vérification réelle des fichiers d'un jeu, par le launcher lui-même.
// Steam et Epic gardent sur le PC la liste officielle des fichiers de chaque jeu installé, avec leur taille et leur
// empreinte SHA-1 :
//  - Steam : steam\depotcache\<dépôt>_<manifeste>.manifest (format protobuf), un par dépôt installé ;
//  - Epic : <dossier du jeu>\.egstore\*.manifest (format binaire Epic, souvent compressé).
// Chaque fichier est contrôlé (présent ? bonne taille ? bonne empreinte ?) avec l'avancement en direct.
// Sans liste officielle (autres launchers), on vérifie au moins la présence et la taille totale.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

// ===================== Manifeste Steam (protobuf) =====================

const STEAM_PAYLOAD = 0x71f617d0;
const STEAM_METADATA = 0x1f4812be;

function varint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    const b = buf[pos++];
    result |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, pos];
    shift += 7n;
  }
}
/** Lit un message protobuf : [numéro de champ, type, valeur] (valeur = BigInt ou Buffer). */
function* fields(buf) {
  let pos = 0;
  while (pos < buf.length) {
    const [key, p1] = varint(buf, pos);
    pos = p1;
    const field = Number(key >> 3n);
    const type = Number(key & 7n);
    if (type === 0) { const [v, p2] = varint(buf, pos); pos = p2; yield [field, type, v]; }
    else if (type === 2) { const [len, p2] = varint(buf, pos); const end = p2 + Number(len); yield [field, type, buf.subarray(p2, end)]; pos = end; }
    else if (type === 1) { yield [field, type, buf.subarray(pos, pos + 8)]; pos += 8; }
    else if (type === 5) { yield [field, type, buf.subarray(pos, pos + 4)]; pos += 4; }
    else throw new Error('manifeste illisible');
  }
}

/** Fichiers d'un manifeste Steam : [{ name, size, sha1 }] ; null si les noms sont chiffrés (vérification impossible). */
export function parseSteamManifest(buf) {
  let pos = 0;
  let payload = null;
  let encrypted = false;
  while (pos + 8 <= buf.length) {
    const magic = buf.readUInt32LE(pos);
    const len = buf.readUInt32LE(pos + 4);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (magic === STEAM_PAYLOAD) {
      payload = body;
    } else if (magic === STEAM_METADATA) {
      for (const [f, , v] of fields(body)) if (f === 4 && v) encrypted = true;
    } else {
      break;
    }
    pos += 8 + len;
  }
  if (!payload || encrypted) return null;
  const files = [];
  for (const [f, t, mapping] of fields(payload)) {
    if (f !== 1 || t !== 2) continue;
    const file = { name: '', size: 0, sha1: null, flags: 0 };
    for (const [g, , v] of fields(mapping)) {
      if (g === 1) file.name = v.toString('utf8');
      else if (g === 2) file.size = Number(v);
      else if (g === 3) file.flags = Number(v);
      else if (g === 5) file.sha1 = v.toString('hex');
    }
    // Les dossiers (drapeau 64) et les liens n'ont pas de contenu à contrôler
    if (file.name && !(file.flags & 64)) files.push({ name: file.name.replace(/[\\/]+/g, '/'), size: file.size, sha1: file.sha1 });
  }
  return files;
}

/** Les manifestes des dépôts installés d'un jeu Steam (dossier depotcache de Steam). */
export async function steamFileList(item) {
  if (!item.steamRoot || !item.steamDepots?.length) return null;
  const all = [];
  for (const d of item.steamDepots) {
    const file = path.join(item.steamRoot, 'depotcache', `${d.depot}_${d.manifest}.manifest`);
    const buf = await readFile(file).catch(() => null);
    if (!buf) return null; // un dépôt sans manifeste : liste incomplète, on ne s'y fie pas
    const files = parseSteamManifest(buf);
    if (!files) return null;
    all.push(...files);
  }
  return all;
}

// ===================== Manifeste Epic (binaire) =====================

const EPIC_MAGIC = 0x44bec00c;

function reader(buf) {
  let pos = 0;
  const r = {
    get pos() { return pos; }, set pos(v) { pos = v; },
    u8: () => buf[pos++], u32: () => { const v = buf.readUInt32LE(pos); pos += 4; return v; }, i32: () => { const v = buf.readInt32LE(pos); pos += 4; return v; },
    bytes: (n) => { const v = buf.subarray(pos, pos + n); pos += n; return v; },
    fstring: () => {
      const len = r.i32();
      if (len === 0) return '';
      if (len > 0) return r.bytes(len).toString('latin1').replace(/\0$/, '');
      return r.bytes(-len * 2).toString('utf16le').replace(/\0$/, '');
    },
  };
  return r;
}

/** Fichiers d'un manifeste Epic binaire : [{ name, size, sha1 }] ; null si le format n'est pas reconnu. */
export function parseEpicManifest(buf) {
  if (buf.length < 41 || buf.readUInt32LE(0) !== EPIC_MAGIC) return null; // ancien format JSON : non pris en charge
  const headerSize = buf.readUInt32LE(4);
  const compressed = buf[40] & 1;
  let data = buf.subarray(headerSize);
  if (compressed) data = inflateSync(data);
  const r = reader(data);
  // Métadonnées puis liste des morceaux : on les saute grâce à leur taille
  for (let i = 0; i < 2; i++) { const start = r.pos; const size = r.u32(); r.pos = start + size; }
  const fmlStart = r.pos;
  r.u32(); // taille de la liste de fichiers
  r.u8(); // version
  const count = r.u32();
  const names = Array.from({ length: count }, () => r.fstring());
  for (let i = 0; i < count; i++) r.fstring(); // liens symboliques
  const hashes = Array.from({ length: count }, () => r.bytes(20).toString('hex'));
  for (let i = 0; i < count; i++) r.u8(); // drapeaux
  for (let i = 0; i < count; i++) { const n = r.u32(); for (let j = 0; j < n; j++) r.fstring(); } // étiquettes
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const parts = r.u32();
    let total = 0;
    for (let j = 0; j < parts; j++) {
      const start = r.pos;
      const partSize = r.u32();
      r.bytes(16); // identifiant du morceau
      r.u32(); // position dans le morceau
      total += r.u32(); // taille
      r.pos = start + partSize;
    }
    sizes.push(total);
  }
  if (r.pos < fmlStart) return null;
  return names.map((name, i) => ({ name: name.replace(/[\\/]+/g, '/'), size: sizes[i], sha1: hashes[i] }));
}

export async function epicFileList(item) {
  const dir = path.join(item.installDir ?? '', '.egstore');
  const candidates = [];
  for (const f of await readdir(dir).catch(() => [])) {
    if (!/\.manifest$/i.test(f) || /pending/i.test(f)) continue;
    const s = await stat(path.join(dir, f)).catch(() => null);
    if (s) candidates.push({ f, t: s.mtimeMs });
  }
  candidates.sort((a, b) => b.t - a.t);
  for (const { f } of candidates) {
    const files = parseEpicManifest(await readFile(path.join(dir, f)).catch(() => Buffer.alloc(0)));
    if (files?.length) return files;
  }
  return null;
}

// ===================== Vérification =====================

async function sha1Of(file, onBytes, signal) {
  const hash = createHash('sha1');
  for await (const chunk of createReadStream(file, { highWaterMark: 1 << 20 })) {
    if (signal?.aborted) throw new Error('annulé');
    hash.update(chunk);
    onBytes(chunk.length);
  }
  return hash.digest('hex');
}

/**
 * Vérifie un jeu. onProgress({ done, total, bytes, totalBytes, file }) est appelé au fil de l'eau.
 * Renvoie { mode: 'complet' | 'simple', checked, missing: [], corrupt: [], sizes: [], ok }.
 */
export async function verifyGame(item, { onProgress = () => {}, signal } = {}) {
  const base = item.installDir;
  if (!base || !(await stat(base).catch(() => null))?.isDirectory()) return { mode: 'simple', ok: false, checked: 0, missing: ['(dossier du jeu introuvable)'], corrupt: [], sizes: [] };
  const list = item.source === 'steam' ? await steamFileList(item).catch(() => null) : item.source === 'epic' ? await epicFileList(item).catch(() => null) : null;

  if (!list) {
    // Pas de liste officielle : présence de l'exécutable et taille totale
    const { folderSize } = await import('./manage.js');
    onProgress({ done: 0, total: 1, bytes: 0, totalBytes: item.size || 0, file: 'Calcul de la taille…' });
    const { bytes, files } = await folderSize(base);
    const missing = [];
    if (item.exe && !(await stat(item.exe).catch(() => null))) missing.push(path.basename(item.exe));
    const short = item.size && bytes < item.size * 0.97;
    onProgress({ done: 1, total: 1, bytes, totalBytes: item.size || bytes, file: '' });
    return { mode: 'simple', ok: !missing.length && !short && files > 0, checked: files, missing, corrupt: [], sizes: short ? [`Il manque environ ${((item.size - bytes) / 1e9).toFixed(1).replace('.', ',')} Go`] : [] };
  }

  const totalBytes = list.reduce((n, f) => n + f.size, 0);
  let bytes = 0;
  let last = 0;
  let checked = 0;
  const missing = [];
  const corrupt = [];
  const sizes = [];
  const tick = (file, force = false) => {
    const now = Date.now();
    if (force || now - last > 150) { last = now; onProgress({ done: missing.length + corrupt.length + sizes.length + checked, total: list.length, bytes, totalBytes, file }); }
  };
  for (const f of list) {
    if (signal?.aborted) throw new Error('annulé');
    const full = path.join(base, ...f.name.split('/'));
    // Sécurité : un nom de fichier ne peut jamais sortir du dossier du jeu
    if (path.relative(base, full).startsWith('..')) continue;
    const s = await stat(full).catch(() => null);
    if (!s) { missing.push(f.name); bytes += f.size; tick(f.name); continue; }
    if (s.size !== f.size) { sizes.push(f.name); bytes += f.size; tick(f.name); continue; }
    if (f.sha1 && f.size > 0) {
      const got = await sha1Of(full, (n) => { bytes += n; tick(f.name); }, signal);
      if (got !== f.sha1) corrupt.push(f.name);
    } else bytes += f.size;
    checked++;
    tick(f.name);
  }
  tick('', true);
  return { mode: 'complet', ok: !missing.length && !corrupt.length && !sizes.length, checked, total: list.length, missing, corrupt, sizes };
}
