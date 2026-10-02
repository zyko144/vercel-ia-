import { mkdir, writeFile, readFile, appendFile, rm } from 'node:fs/promises';
import path from 'node:path';

// MediaRecorder timeslice découpe des octets, pas des fichiers WebM autonomes.
// On conserve l'en-tête et des clusters entiers, même si un élément arrive en plusieurs IPC.
function vint(buf, at, id = false) {
  if (at >= buf.length) return null;
  let width = 1, mask = 128;
  while (width <= 8 && !(buf[at] & mask)) { width++; mask >>= 1; }
  if (width > (id ? 4 : 8)) throw Error('En-tête WebM invalide');
  if (at + width > buf.length) return null;
  let value = BigInt(id ? buf[at] : buf[at] & (mask - 1));
  for (let i = 1; i < width; i++) value = value * 256n + BigInt(buf[at + i]);
  return { width, value: !id && value === (1n << BigInt(7 * width)) - 1n ? null : Number(value) };
}
function element(buf, at = 0) {
  const id = vint(buf, at, true); if (!id) return null;
  const size = vint(buf, at + id.width); if (!size) return null;
  if (size.value !== null && (!Number.isSafeInteger(size.value) || size.value > 64 * 1024 * 1024)) throw Error('Élément WebM trop volumineux');
  return { id: id.value, size: size.value, head: id.width + size.width };
}
const CLUSTER = 0x1f43b675, SEGMENT = 0x18538067;
const TOP = new Set([CLUSTER, 0x1c53bb6b, 0x1549a966, 0x1654ae6b, 0x1254c367, 0x114d9b74]);
export class WebmClusters {
  pending = Buffer.alloc(0); header = Buffer.alloc(0); started = false; scale = 1;
  push(bytes) {
    this.pending = Buffer.concat([this.pending, Buffer.from(bytes)]);
    if (this.pending.length > 64 * 1024 * 1024) throw Error('Tampon WebM trop volumineux');
    const out = [];
    while (true) {
      const e = element(this.pending); if (!e) break;
      if (e.id === SEGMENT) {
        // La taille originale ne décrit plus le replay raccourci.
        this.header = Buffer.concat([this.header, Buffer.from([0x18,0x53,0x80,0x67,0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff])]);
        this.pending = this.pending.subarray(e.head); continue;
      }
      let end = e.size === null ? null : e.head + e.size;
      if (e.id === CLUSTER && end === null) {
        let at = e.head;
        while (at < this.pending.length) {
          const child = element(this.pending, at); if (!child) break;
          if (TOP.has(child.id)) { end = at; break; }
          if (child.size === null) throw Error('Sous-élément WebM sans taille');
          const next = at + child.head + child.size;
          if (next > this.pending.length) break;
          at = next;
        }
      }
      if (end === null || end > this.pending.length) break;
      const data = Buffer.from(this.pending.subarray(0, end));
      this.pending = this.pending.subarray(end);
      if (e.id === CLUSTER) {
        this.started = true;
        let time = null;
        for (let at = e.head; at < data.length;) {
          const c = element(data, at); if (!c || c.size === null || at + c.head + c.size > data.length) throw Error('Cluster WebM incomplet');
          if (c.id === 0xe7) time = data.subarray(at + c.head, at + c.head + c.size).reduce((n, b) => n * 256 + b, 0) * this.scale;
          at += c.head + c.size;
        }
        if (time === null) throw Error('Horodatage WebM absent');
        out.push({ time, data });
      } else if (!this.started) {
        if (e.id === 0x1549a966) {
          for (let at = e.head; at < data.length;) {
            const c = element(data, at); if (!c || c.size === null) break;
            if (c.id === 0x2ad7b1) this.scale = data.subarray(at + c.head, at + c.head + c.size).reduce((n, b) => n * 256 + b, 0) / 1e6;
            at += c.head + c.size;
          }
        }
        this.header = Buffer.concat([this.header, data]);
        if (this.header.length > 1024 * 1024) throw Error('En-tête WebM trop volumineux');
      }
    }
    return out;
  }
}

export class ReplayBuffer {
  tracks = { video: { parser: new WebmClusters(), files: [], next: 0 }, mic: { parser: new WebmClusters(), files: [], next: 0 } };
  closed = false;
  constructor(dir, seconds) { this.dir = dir; this.seconds = seconds; this.queue = mkdir(dir, { recursive: true }); }
  run(fn) { const work = this.queue.then(fn); this.queue = work.catch(() => {}); return work; }
  push(kind, bytes) {
    if (this.closed) return Promise.resolve();
    return this.run(async () => {
      const t = this.tracks[kind]; if (!t) throw Error('Piste inconnue');
      for (const part of t.parser.push(bytes)) {
        const file = path.join(this.dir, `${kind}-${t.next++}.webm`);
        await writeFile(file, part.data); t.files.push({ file, time: part.time });
        while (t.files.length > 2 && t.files[1].time < part.time - (this.seconds + 5) * 1000) await rm(t.files.shift().file, { force: true });
      }
    });
  }
  snapshot(video, mic) {
    if (this.closed) return Promise.reject(Error('Le replay a redémarré. Réessaie dans quelques secondes.'));
    return this.run(async () => {
      const v = this.tracks.video;
      if (v.files.length < 2) throw Error('Clip pas encore prêt : quelques secondes d’enregistrement sont nécessaires.');
      const cutoff = v.files.at(-1).time - this.seconds * 1000;
      let micSaved = false;
      for (const [kind, dest] of [['video', video], ['mic', mic]]) {
        const t = this.tracks[kind]; if (!t.files.length || !dest) continue;
        let first = t.files.findLastIndex(f => f.time <= cutoff);
        first = Math.max(0, first);
        await writeFile(dest, t.parser.header);
        for (const part of t.files.slice(first)) await appendFile(dest, await readFile(part.file));
        if (kind === 'mic') micSaved = true;
      }
      return { mic: micSaved };
    });
  }
  close() { this.closed = true; return this.run(() => rm(this.dir, { recursive: true, force: true })); }
}
