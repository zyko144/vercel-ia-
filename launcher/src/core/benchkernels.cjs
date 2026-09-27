// Épreuves du processeur du Benchmark History (lancées dans des threads séparés, une par cœur logique).
// Chaque épreuve imite un vrai travail de PC de jeu et renvoie un débit (opérations par seconde).
const { createHash, randomBytes } = require('node:crypto');
const { deflateSync } = require('node:zlib');

// Données préparées une fois par thread (pas comptées dans la mesure)
const prep = {
  sha: () => randomBytes(1 << 20),
  zip: () => {
    // Texte réaliste (journaux, JSON) : ni trop compressible ni aléatoire
    const words = ['player', 'score', 'level', 'vector', 'shader', 'texture', 'network', 'packet', 'frame', 'entity', '{"id":', '"pos":[', '],', 'true', 'false', 'null', '12.5', '0.004', 'GameObject', 'update'];
    const parts = [];
    let seed = 7;
    for (let i = 0; i < 700_000; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; parts.push(words[seed % words.length]); }
    return Buffer.from(parts.join(' ')).subarray(0, 4 << 20);
  },
  nbody: () => {
    const n = 512;
    const p = new Float64Array(n * 3); const v = new Float64Array(n * 3); const m = new Float64Array(n);
    for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) { p[i * 3 + k] = Math.sin(i * 12.9898 + k) * 100; v[i * 3 + k] = 0; } m[i] = 1 + (i % 7); }
    return { n, p, v, m };
  },
  sort: () => { const a = new Float64Array(1 << 20); let s = 1; for (let i = 0; i < a.length; i++) { s = (s * 16807) % 2147483647; a[i] = s; } return a; },
  path: () => {
    // Grille de 256×256 avec obstacles : recherche de chemin façon IA de jeu (beaucoup de branches et d'accès mémoire)
    const W = 256; const g = new Uint8Array(W * W); let s = 3;
    for (let i = 0; i < g.length; i++) { s = (s * 48271) % 2147483647; g[i] = s % 100 < 28 ? 1 : 0; }
    g[0] = 0; g[g.length - 1] = 0;
    return { W, g, dist: new Int32Array(W * W), queue: new Int32Array(W * W) };
  },
};

const run = {
  // Mo/s d'empreintes SHA-256 (intégrité des fichiers, anti-triche, téléchargements)
  sha: (buf) => { createHash('sha256').update(buf).digest(); return 1; },
  // Mo/s de compression (chargements, sauvegardes, décompression d'assets)
  zip: (buf) => { deflateSync(buf, { level: 6 }); return 4; },
  // Millions d'interactions/s en physique à virgule flottante (moteurs physiques)
  nbody: (s) => {
    const { n, p, v, m } = s;
    for (let i = 0; i < n; i++) {
      let ax = 0; let ay = 0; let az = 0;
      const xi = p[i * 3]; const yi = p[i * 3 + 1]; const zi = p[i * 3 + 2];
      for (let j = 0; j < n; j++) {
        const dx = p[j * 3] - xi; const dy = p[j * 3 + 1] - yi; const dz = p[j * 3 + 2] - zi;
        const d2 = dx * dx + dy * dy + dz * dz + 0.01; const inv = m[j] / (d2 * Math.sqrt(d2));
        ax += dx * inv; ay += dy * inv; az += dz * inv;
      }
      v[i * 3] += ax * 1e-3; v[i * 3 + 1] += ay * 1e-3; v[i * 3 + 2] += az * 1e-3;
    }
    for (let i = 0; i < n * 3; i++) p[i] += v[i] * 1e-3;
    return (n * n) / 1e6;
  },
  // Millions d'éléments triés/s (tri de listes, bases de données, rendu)
  sort: (a) => { const c = a.slice(); c.sort(); return c.length / 1e6; },
  // Recherches de chemin/s (IA des jeux)
  path: (s) => {
    const { W, g, dist, queue } = s;
    dist.fill(-1); let h = 0; let t = 0; queue[t++] = 0; dist[0] = 0;
    while (h < t) {
      const c = queue[h++]; const x = c % W; const y = (c / W) | 0; const d = dist[c] + 1;
      if (x > 0 && !g[c - 1] && dist[c - 1] < 0) { dist[c - 1] = d; queue[t++] = c - 1; }
      if (x < W - 1 && !g[c + 1] && dist[c + 1] < 0) { dist[c + 1] = d; queue[t++] = c + 1; }
      if (y > 0 && !g[c - W] && dist[c - W] < 0) { dist[c - W] = d; queue[t++] = c - W; }
      if (y < W - 1 && !g[c + W] && dist[c + W] < 0) { dist[c + W] = d; queue[t++] = c + W; }
    }
    return 1;
  },
};

/** Lance une épreuve pendant ms millisecondes ; slices > 1 découpe la mesure (test d'endurance). */
function measure(kind, ms, slices = 1) {
  const kinds = kind === 'mix' ? ['sha', 'nbody', 'zip', 'path'] : [kind];
  const data = Object.fromEntries(kinds.map((k) => [k, prep[k]()]));
  for (const k of kinds) run[k](data[k]); // échauffement
  const out = [];
  const per = ms / slices;
  for (let s = 0; s < slices; s++) {
    let work = 0; let i = 0;
    const t0 = performance.now(); const end = t0 + per;
    while (performance.now() < end) { const k = kinds[i++ % kinds.length]; work += run[k](data[k]); }
    out.push(work / ((performance.now() - t0) / 1000));
  }
  return out;
}

module.exports = { measure, KINDS: ['sha', 'zip', 'nbody', 'sort', 'path'] };

// Utilisé comme thread : workerData = { kind, ms, slices }
const wt = require('node:worker_threads');
if (!wt.isMainThread && wt.workerData?.kind) wt.parentPort.postMessage(measure(wt.workerData.kind, wt.workerData.ms, wt.workerData.slices));
