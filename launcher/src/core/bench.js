// Benchmark History : vraies mesures faites par le launcher, sans outil externe.
// - Processeur : empreintes SHA-256 sur 1 cœur puis sur tous les cœurs (Mo/s)
// - Mémoire : copies de gros blocs (Go/s)
// - Disque : écriture puis lecture séquentielle d'un fichier de 1 Go (Mo/s) + lectures aléatoires 4 Ko (IOPS)
// - Carte graphique : scène 3D WebGL (images/s) mesurée dans une petite fenêtre (voir bench-gpu.html)
// Les scores sont relatifs à un PC de référence (1000 points par épreuve) pour comparer d'un PC à l'autre.
import { createHash, randomBytes } from 'node:crypto';
import { open, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

// PC de référence (1000 points) : valeurs typiques d'un PC de jeu milieu de gamme 2023 (6 cœurs / DDR4 3200 / SSD NVMe Gen3)
export const REF = { cpu1: 1500, cpuN: 7000, ram: 12, diskW: 1500, diskR: 2000, iops: 20000, gpu: 120 };
export const score = (v, ref) => (v == null ? null : Math.round((1000 * v) / ref));

function hashLoop(ms) {
  const buf = randomBytes(1 << 20);
  let n = 0;
  const end = performance.now() + ms;
  while (performance.now() < end) { createHash('sha256').update(buf).digest(); n += 1; }
  return n / (ms / 1000); // Mo/s
}
const WORKER = `const { parentPort, workerData } = require('node:worker_threads'); const { createHash, randomBytes } = require('node:crypto');
const buf = randomBytes(1 << 20); let n = 0; const end = performance.now() + workerData; while (performance.now() < end) { createHash('sha256').update(buf).digest(); n += 1; } parentPort.postMessage(n / (workerData / 1000));`;

export async function cpuBench(ms = 2500) {
  const single = hashLoop(ms);
  const threads = Math.max(1, os.cpus().length);
  const multi = (await Promise.all(Array.from({ length: threads }, () => new Promise((ok, ko) => {
    const w = new Worker(WORKER, { eval: true, workerData: ms });
    w.once('message', (v) => { ok(v); w.terminate(); });
    w.once('error', ko);
  })))).reduce((a, b) => a + b, 0);
  return { single: Math.round(single), multi: Math.round(multi), threads };
}

export function ramBench(ms = 2000) {
  const size = 128 * 1024 * 1024;
  const a = Buffer.alloc(size, 1);
  const b = Buffer.alloc(size);
  let bytes = 0;
  const end = performance.now() + ms;
  const t0 = performance.now();
  while (performance.now() < end) { a.copy(b); bytes += size; }
  return { gbps: Math.round((bytes / 1e9 / ((performance.now() - t0) / 1000)) * 10) / 10 };
}

export async function diskBench(dir = os.tmpdir(), sizeMb = 1024) {
  const file = path.join(dir, `history-bench-${process.pid}.tmp`);
  const chunk = randomBytes(4 * 1024 * 1024);
  try {
    let fh = await open(file, 'w');
    let t0 = performance.now();
    for (let i = 0; i < sizeMb / 4; i++) await fh.write(chunk, 0, chunk.length, i * chunk.length);
    await fh.sync();
    await fh.close();
    const write = sizeMb / ((performance.now() - t0) / 1000);
    fh = await open(file, 'r');
    const buf = Buffer.alloc(chunk.length);
    t0 = performance.now();
    for (let i = 0; i < sizeMb / 4; i++) await fh.read(buf, 0, buf.length, i * buf.length);
    const read = sizeMb / ((performance.now() - t0) / 1000);
    // Lectures aléatoires de 4 Ko pendant 2 s (8 en parallèle)
    const small = Buffer.alloc(4096);
    let ops = 0;
    const end = performance.now() + 2000;
    const maxBlock = (sizeMb * 1024 * 1024) / 4096 - 1;
    await Promise.all(Array.from({ length: 8 }, async () => {
      const mine = Buffer.alloc(4096);
      while (performance.now() < end) { await fh.read(mine, 0, 4096, Math.floor(Math.random() * maxBlock) * 4096); ops += 1; }
    }));
    void small;
    await fh.close();
    return { write: Math.round(write), read: Math.round(read), iops: Math.round(ops / 2) };
  } finally {
    await rm(file, { force: true }).catch(() => {});
  }
}

/** Scores par épreuve + score global (moyenne géométrique, comme les benchmarks connus). */
export function scores(r) {
  const s = {
    cpu1: score(r.cpu?.single, REF.cpu1), cpuN: score(r.cpu?.multi, REF.cpuN), ram: score(r.ram?.gbps, REF.ram),
    disk: r.disk ? Math.round((score(r.disk.write, REF.diskW) + score(r.disk.read, REF.diskR) + score(r.disk.iops, REF.iops)) / 3) : null,
    gpu: score(r.gpu?.fps, REF.gpu),
  };
  const vals = Object.values(s).filter((v) => v > 0);
  const total = vals.length ? Math.round(Math.exp(vals.reduce((n, v) => n + Math.log(v), 0) / vals.length)) : null;
  return { ...s, total };
}
export const tier = (t) => (t == null ? null : t >= 1600 ? 'Monstre de jeu' : t >= 1150 ? 'Très haut de gamme' : t >= 850 ? 'Bon PC de jeu' : t >= 550 ? 'Correct pour jouer' : 'Entrée de gamme');
