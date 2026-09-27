// Benchmark History v2 (« extrême ») : vraies mesures faites par le launcher, sans outil externe.
// - Processeur : 5 épreuves proches du jeu (SHA-256, compression, physique flottante, tri, recherche de chemin),
//   sur 1 cœur puis sur tous les cœurs, et 30 s d'endurance pleine charge (chute de performances = chauffe)
// - Mémoire : débit (copies de 256 Mo) et latence (accès aléatoires dans 256 Mo)
// - Disque : écriture de 2 Go avec synchro, lecture d'un vrai fichier de jeu si possible (pas en cache),
//   lectures aléatoires 4 Ko à file d'attente 32, écritures aléatoires 4 Ko synchronisées
// - Carte graphique : 3 scènes en 2560×1440 (voir ui/bench-gpu.js)
// Chaque épreuve vaut 1000 sur le PC de référence ; les notes sont des moyennes géométriques.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { open, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const require = createRequire(import.meta.url);
const KERNELS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'benchkernels.cjs');
const { measure, KINDS } = require('./benchkernels.cjs');

export const VERSION = 2;
// PC de référence (1000 points) : PC de jeu milieu de gamme (6 cœurs / 12 threads, DDR4-3200, SSD NVMe Gen3, carte type RTX 3060).
// Processeur : calé sur la même référence que la v1 (1 500 Mo/s de SHA-256 sur 1 cœur, 7 000 sur tous).
// Carte graphique : estimation provisoire, recalibrée avec les résultats réels du classement.
export const REF = {
  cpu1: { sha: 1500, zip: 51, nbody: 285, sort: 8.8, path: 905 },
  cpuN: { sha: 7000, zip: 238, nbody: 1330, sort: 41, path: 4220 },
  ram: { gbps: 12, latency: 80 },
  disk: { write: 1500, read: 2000, iopsR: 60000, iopsW: 4000 },
  gpu: { geometry: 300, shader: 110, post: 220 },
};
export const score = (v, ref) => (v == null || !(v > 0) ? null : Math.round((1000 * v) / ref));
export const geomean = (vals) => { const v = vals.filter((x) => x > 0); return v.length ? Math.round(Math.exp(v.reduce((n, x) => n + Math.log(x), 0) / v.length)) : null; };

let SOURCE = null;
function inThreads(kind, ms, threads, slices = 1) {
  return Promise.all(Array.from({ length: threads }, () => new Promise((ok, ko) => {
    // Code passé en texte : fonctionne aussi depuis l'archive app.asar de l'appli installée
    const w = new Worker(SOURCE ??= readFileSync(KERNELS, 'utf8'), { eval: true, workerData: { kind, ms, slices } });
    w.once('message', (v) => { ok(v); w.terminate(); });
    w.once('error', ko);
  })));
}

/** Processeur : chaque épreuve sur 1 cœur puis sur tous ; onStep(label) pour l'avancement. */
export async function cpuBench({ ms = 4000, sustainMs = 30_000, onStep = () => {} } = {}) {
  const threads = Math.max(1, os.cpus().length);
  const single = {}; const multi = {};
  for (const k of KINDS) {
    onStep(`Processeur · ${LABELS[k]} · 1 cœur`);
    single[k] = Math.round(measure(k, ms)[0] * 10) / 10;
    onStep(`Processeur · ${LABELS[k]} · ${threads} threads`);
    multi[k] = Math.round((await inThreads(k, ms, threads)).reduce((n, r) => n + r[0], 0) * 10) / 10;
  }
  // Endurance : tous les cœurs à fond, mesure découpée en 6 tranches pour voir si les performances chutent (chauffe)
  onStep(`Processeur · endurance ${Math.round(sustainMs / 1000)} s pleine charge`);
  const slices = 6;
  const per = await inThreads('mix', sustainMs, threads, slices);
  const sum = Array.from({ length: slices }, (_, i) => per.reduce((n, r) => n + r[i], 0));
  const stability = Math.round((100 * Math.min(...sum.slice(1))) / Math.max(sum[0], ...sum.slice(1)));
  return { threads, single, multi, sustain: { slices: sum.map((v) => Math.round(v)), stability } };
}
export const LABELS = { sha: 'SHA-256', zip: 'compression', nbody: 'physique', sort: 'tri', path: 'IA / chemins' };

/** Mémoire : débit de copie et latence d'accès aléatoire (chaîne de pointeurs, impossible à prévoir pour le processeur). */
export function ramBench(ms = 3000) {
  const size = 256 * 1024 * 1024;
  const a = Buffer.alloc(size, 1); const b = Buffer.alloc(size);
  let bytes = 0; const t0 = performance.now(); const end = t0 + ms;
  while (performance.now() < end) { a.copy(b); bytes += size * 2; } // lecture + écriture
  const gbps = Math.round((bytes / 1e9 / ((performance.now() - t0) / 1000)) * 10) / 10;
  // Cycle aléatoire (algorithme de Sattolo) sur 64 M entrées de 4 octets = 256 Mo, bien plus que les caches
  const n = 64 * 1024 * 1024; const next = new Uint32Array(n);
  for (let i = 0; i < n; i++) next[i] = i;
  let s = 12345;
  for (let i = n - 1; i > 0; i--) { s = (s * 1103515245 + 12345) >>> 0; const j = s % i; const t = next[i]; next[i] = next[j]; next[j] = t; }
  let p = 0; const steps = 20_000_000; const l0 = performance.now();
  for (let i = 0; i < steps; i++) p = next[p];
  const latency = Math.round(((performance.now() - l0) * 1e6) / steps * 10) / 10;
  return { gbps, latency, check: p };
}

/** Disque : écriture 2 Go synchronisée, lecture (vrai fichier de jeu si fourni), 4 Ko aléatoires en lecture (QD32) et en écriture synchronisée. */
export async function diskBench(dir = os.tmpdir(), { sizeMb = 2048, readFile = null, onStep = () => {} } = {}) {
  const file = path.join(dir, `history-bench-${process.pid}.tmp`);
  const chunk = randomBytes(4 * 1024 * 1024);
  try {
    onStep(`Disque · écriture de ${Math.round(sizeMb / 1024 * 10) / 10} Go`);
    let fh = await open(file, 'w');
    let t0 = performance.now();
    for (let i = 0; i < sizeMb / 4; i++) await fh.write(chunk, 0, chunk.length, i * chunk.length);
    await fh.sync();
    const write = Math.round(sizeMb / ((performance.now() - t0) / 1000));
    // Écritures aléatoires 4 Ko, chacune forcée sur le disque (comme une sauvegarde de jeu ou une base de données)
    onStep('Disque · écritures aléatoires 4 Ko synchronisées');
    const blk = randomBytes(4096); const blocks = (sizeMb * 256) - 1;
    let wops = 0; const wEnd = performance.now() + 3000;
    while (performance.now() < wEnd) { await fh.write(blk, 0, 4096, Math.floor(Math.random() * blocks) * 4096); await fh.datasync(); wops += 1; }
    await fh.close();
    // Lecture : un gros fichier de jeu déjà sur le disque (pas encore en mémoire), sinon le fichier de test
    const real = readFile && (await stat(readFile).catch(() => null))?.size >= 1024 * 1024 * 1024 ? readFile : null;
    const src = real ?? file;
    const srcSize = real ? (await stat(real)).size : sizeMb * 1024 * 1024;
    onStep(real ? `Disque · lecture de ${path.basename(real)}` : 'Disque · lecture');
    fh = await open(src, 'r');
    const readMb = Math.min(sizeMb, Math.floor(srcSize / 1024 / 1024 / 4) * 4);
    const buf = Buffer.alloc(chunk.length);
    t0 = performance.now();
    for (let i = 0; i < readMb / 4; i++) await fh.read(buf, 0, buf.length, i * buf.length);
    const read = Math.round(readMb / ((performance.now() - t0) / 1000));
    onStep('Disque · lectures aléatoires 4 Ko (file d’attente 32)');
    const maxBlock = Math.floor(srcSize / 4096) - 1;
    let rops = 0; const rEnd = performance.now() + 3000;
    await Promise.all(Array.from({ length: 32 }, async () => {
      const mine = Buffer.alloc(4096);
      while (performance.now() < rEnd) { await fh.read(mine, 0, 4096, Math.floor(Math.random() * maxBlock) * 4096); rops += 1; }
    }));
    await fh.close();
    return { write, read, iopsR: Math.round(rops / 3), iopsW: Math.round(wops / 3), readSrc: real ? 'jeu' : 'test' };
  } finally {
    await rm(file, { force: true }).catch(() => {});
  }
}

/** Scores par épreuve + score global. */
export function scores(r) {
  if (r.v !== VERSION) return legacyScores(r);
  const g = r.gpu?.scenes ?? {};
  const s = {
    cpu1: geomean(KINDS.map((k) => score(r.cpu?.single?.[k], REF.cpu1[k]))),
    cpuN: geomean(KINDS.map((k) => score(r.cpu?.multi?.[k], REF.cpuN[k]))),
    ram: r.ram ? geomean([score(r.ram.gbps, REF.ram.gbps), score(1 / r.ram.latency, 1 / REF.ram.latency)]) : null,
    disk: r.disk ? geomean([score(r.disk.write, REF.disk.write), score(r.disk.read, REF.disk.read), score(r.disk.iopsR, REF.disk.iopsR), score(r.disk.iopsW, REF.disk.iopsW)]) : null,
    gpu: geomean(Object.keys(REF.gpu).map((k) => score(g[k], REF.gpu[k]))),
  };
  // Le processeur compte pour 2 (1 cœur + tous), la carte graphique pour 2 aussi : c'est ce qui fait les FPS
  const total = geomean([s.cpu1, s.cpuN, s.ram, s.disk, s.gpu, s.gpu]);
  return { ...s, total };
}
// Anciens résultats (v1) : même calcul qu'avant, pour l'historique
const REF1 = { cpu1: 1500, cpuN: 7000, ram: 12, diskW: 1500, diskR: 2000, iops: 20000, gpu: 120 };
function legacyScores(r) {
  const s = {
    cpu1: score(r.cpu?.single, REF1.cpu1), cpuN: score(r.cpu?.multi, REF1.cpuN), ram: score(r.ram?.gbps, REF1.ram),
    disk: r.disk ? Math.round((score(r.disk.write, REF1.diskW) + score(r.disk.read, REF1.diskR) + score(r.disk.iops, REF1.iops)) / 3) : null,
    gpu: score(r.gpu?.fps, REF1.gpu),
  };
  return { ...s, total: geomean(Object.values(s)) };
}
export const tier = (t) => (t == null ? null : t >= 1600 ? 'Monstre de jeu' : t >= 1150 ? 'Très haut de gamme' : t >= 850 ? 'Bon PC de jeu' : t >= 550 ? 'Correct pour jouer' : 'Entrée de gamme');
