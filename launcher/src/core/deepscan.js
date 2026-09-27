// Analyse pro du PC : chaque fichier de chaque disque est lu un par un (taille, date, type), puis les doublons
// sont confirmés par empreinte SHA-256 du contenu. Aucun chiffre inventé : tout vient du disque.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, opendir } from 'node:fs/promises';
import path from 'node:path';

const DAY = 86_400_000;
const MB = 1024 * 1024;

// Dossiers système jamais parcourus (inaccessibles ou gérés par Windows lui-même)
const SKIP_DIRS = /^(system volume information|\$recycle\.bin|\$winreagent|\$windows\.~bt|\$windows\.~ws|recovery|config\.msi|windowsapps|winsxs|installer)$/i;

const EXT = {
  videos: /\.(mp4|mkv|mov|avi|webm|wmv|flv|m4v)$/i,
  images: /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|raw|cr2|nef|psd)$/i,
  musique: /\.(mp3|flac|wav|ogg|m4a|aac|wma)$/i,
  archives: /\.(zip|rar|7z|tar|gz|bz2|xz|iso|img)$/i,
  installeurs: /\.(msi|msix|appx|exe)$/i,
  documents: /\.(pdf|docx?|xlsx?|pptx?|odt|ods|txt|rtf|epub)$/i,
  jeux: /\.(pak|vpk|bsa|ba2|forge|bundle|assets|upk|uasset|wad|bik|bnk|pck|arc)$/i,
};
export const CATEGORIES = [
  ['jeux', '🎮', 'Fichiers de jeux'], ['videos', '🎬', 'Vidéos'], ['images', '🖼', 'Images'], ['musique', '🎵', 'Musique'],
  ['archives', '📦', 'Archives et images disque'], ['installeurs', '💿', 'Installateurs et programmes'], ['documents', '📄', 'Documents'],
  ['systeme', '⚙', 'Windows et programmes'], ['autres', '🗂', 'Autres'],
];

const norm = (p) => p.replace(/\//g, '\\').toLowerCase();
const isSystemPath = (p) => /^[a-z]:\\(windows|program files( \(x86\))?|programdata)\\/.test(norm(p));
const inTemp = (p) => /\\appdata\\local\\temp\\|^[a-z]:\\windows\\temp\\|^[a-z]:\\temp\\/.test(norm(p));

/** Classe un fichier : catégorie, et raison si c'est un fichier inutile ou louche. */
export function classify(p, size, mtime, now = Date.now()) {
  const n = norm(p);
  const base = path.win32.basename(n);
  const ageDays = (now - mtime) / DAY;
  let cat = 'autres';
  if (isSystemPath(n) && !EXT.jeux.test(base)) cat = 'systeme';
  else for (const [k, re] of Object.entries(EXT)) if (re.test(base)) { cat = k; break; }
  if (/\\(steamapps|epic games|riot games|xboxgames|gog galaxy\\games|ubisoft game launcher\\games)\\/.test(n)) cat = 'jeux';

  let junk = null;
  if (inTemp(n) && ageDays > 7) junk = 'temp';
  else if (/\.(dmp|mdmp|hdmp)$/.test(base)) junk = 'dump';
  else if (/\\crashdumps\\|\\minidump\\|\\livekernelreports\\/.test(n)) junk = 'dump';
  else if (/\.(tmp|temp|old|bak|chk)$/.test(base) && ageDays > 30 && !isSystemPath(n)) junk = 'tmp';
  else if (/\.log$/.test(base) && size > 20 * MB && ageDays > 14) junk = 'log';
  else if (/\\downloads\\/.test(n) && /\.(exe|msi|msix)$/.test(base) && ageDays > 30) junk = 'installer';
  else if (/\\thumbcache_.*\.db$|\\iconcache_.*\.db$/.test(n)) junk = 'thumbs';

  let suspect = null;
  const exe = /\.(exe|scr|com|pif|bat|cmd|vbs|vbe|js|jse|ps1|hta|lnk|dll)$/.test(base);
  if (/\.(pdf|docx?|xlsx?|jpe?g|png|mp4|txt|zip)\.(exe|scr|com|pif|bat|cmd|vbs|js)$/.test(base)) suspect = 'double-extension';
  else if (/\.(scr|pif|vbe|jse|hta)$/.test(base) && !isSystemPath(n)) suspect = 'type-risque';
  else if (exe && /\.(exe|scr|com)$/.test(base) && (inTemp(n) || /\\appdata\\roaming\\[^\\]+\.exe$|\\users\\public\\|^[a-z]:\\programdata\\[^\\]+\.exe$/.test(n))) suspect = 'emplacement';
  else if (/\\start menu\\programs\\startup\\.+\.(exe|bat|cmd|vbs|js|ps1)$/.test(n)) suspect = 'demarrage';
  return { cat, junk, suspect };
}

export const JUNK_LABELS = {
  temp: ['🗑', 'Fichiers temporaires de plus de 7 jours'], dump: ['💥', 'Rapports de plantage (dumps)'], tmp: ['🧾', 'Fichiers .tmp / .old / .bak oubliés'],
  log: ['📜', 'Gros journaux (logs) anciens'], installer: ['💿', 'Installateurs déjà utilisés (Téléchargements, plus d’un mois)'], thumbs: ['🖼', 'Caches de miniatures et d’icônes'],
};
export const SUSPECT_LABELS = {
  'double-extension': 'Double extension (ex. facture.pdf.exe) : technique classique des virus',
  'type-risque': 'Type de fichier souvent utilisé par les virus (.scr, .hta, .vbe…)',
  emplacement: 'Programme caché dans un dossier temporaire ou à la racine d’AppData',
  demarrage: 'Script ou programme dans le dossier Démarrage',
};

/** Estimation du temps restant à partir des octets déjà parcourus et de la place occupée sur les disques. */
export function eta(doneBytes, totalBytes, elapsedMs) {
  if (!doneBytes || !totalBytes || elapsedMs < 3000) return null;
  const rate = doneBytes / elapsedMs;
  return Math.max(0, Math.round((totalBytes - doneBytes) / rate / 1000));
}

/** Regroupe les fichiers de même taille (candidats doublons) : seuls ceux-là seront lus en entier. */
export function sizeGroups(files, minSize = MB) {
  const by = new Map();
  for (const f of files) if (f.size >= minSize) (by.get(f.size) ?? by.set(f.size, []).get(f.size)).push(f.path);
  return [...by].filter(([, l]) => l.length > 1).map(([size, paths]) => ({ size, paths }));
}

async function partialHash(p, size) {
  const fh = await open(p, 'r');
  try {
    const n = Math.min(64 * 1024, size);
    const a = Buffer.alloc(n); const b = Buffer.alloc(n);
    await fh.read(a, 0, n, 0);
    await fh.read(b, 0, n, Math.max(0, size - n));
    return createHash('sha1').update(a).update(b).digest('hex');
  } finally { await fh.close(); }
}
export function fullHash(p, signal) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    const s = createReadStream(p, { highWaterMark: 1024 * 1024 });
    const stop = () => { s.destroy(); reject(new Error('annulé')); };
    signal?.addEventListener('abort', stop, { once: true });
    s.on('data', (c) => h.update(c));
    s.on('error', reject);
    s.on('end', () => { signal?.removeEventListener('abort', stop); resolve(h.digest('hex')); });
  });
}

/**
 * Parcourt les dossiers donnés fichier par fichier.
 * onProgress reçoit { phase, files, dirs, bytes, current, elapsed, eta } régulièrement.
 */
export async function deepScan({ roots, totalBytes = 0, onProgress = () => {}, signal, now = Date.now(), dupRoots = null, maxHashBytes = 200e9 }) {
  const t0 = Date.now();
  const res = {
    files: 0, dirs: 0, bytes: 0, denied: 0, emptyDirs: 0,
    cats: Object.fromEntries(CATEGORIES.map(([k]) => [k, { files: 0, bytes: 0 }])),
    junk: {}, suspects: [], largest: [], old: { files: 0, bytes: 0 }, duplicates: [], dupWasted: 0, hashed: { files: 0, bytes: 0 },
  };
  const dupCandidates = [];
  const inDupScope = (p) => !isSystemPath(p) && !/\\appdata\\local\\(packages|microsoft)\\/.test(norm(p)) && (!dupRoots || dupRoots.some((r) => norm(p).startsWith(norm(r))));
  let lastTick = 0;
  const tick = (current, force = false) => {
    const t = Date.now();
    if (!force && t - lastTick < 250) return;
    lastTick = t;
    onProgress({ phase: 'walk', files: res.files, dirs: res.dirs, bytes: res.bytes, current, elapsed: t - t0, eta: eta(res.bytes, totalBytes, t - t0) });
  };
  const pushLargest = (f) => {
    if (res.largest.length < 40 || f.size > res.largest.at(-1).size) {
      res.largest.push(f);
      res.largest.sort((a, b) => b.size - a.size);
      if (res.largest.length > 40) res.largest.pop();
    }
  };

  const stack = [...roots];
  while (stack.length) {
    if (signal?.aborted) throw new Error('annulé');
    const dir = stack.pop();
    let handle;
    try { handle = await opendir(dir, { bufferSize: 256 }); } catch { res.denied += 1; continue; }
    res.dirs += 1;
    let count = 0;
    const batch = [];
    try {
      for await (const d of handle) {
        count += 1;
        const p = path.join(dir, d.name);
        if (d.isSymbolicLink()) continue; // jonctions et raccourcis système : jamais suivis
        if (d.isDirectory()) { if (!SKIP_DIRS.test(d.name)) stack.push(p); continue; }
        if (d.isFile()) batch.push(p);
      }
    } catch { res.denied += 1; }
    if (!count) res.emptyDirs += 1;
    // Lecture des tailles et dates par paquets (plus rapide qu'un fichier après l'autre, sans saturer le disque)
    for (let i = 0; i < batch.length; i += 32) {
      const part = batch.slice(i, i + 32);
      const stats = await Promise.all(part.map((p) => lstat(p).catch(() => null)));
      stats.forEach((st, k) => {
        if (!st) { res.denied += 1; return; }
        const p = part[k];
        const size = st.size;
        const mtime = st.mtimeMs;
        res.files += 1; res.bytes += size;
        const c = classify(p, size, mtime, now);
        res.cats[c.cat].files += 1; res.cats[c.cat].bytes += size;
        if (c.junk) { const j = (res.junk[c.junk] ??= { files: 0, bytes: 0, paths: [] }); j.files += 1; j.bytes += size; if (j.paths.length < 20000) j.paths.push(p); }
        if (c.suspect && res.suspects.length < 300) res.suspects.push({ path: p, size, reason: c.suspect, mtime });
        if (!isSystemPath(p) && now - mtime > 365 * 2 * DAY && size > 50 * MB) { res.old.files += 1; res.old.bytes += size; }
        if (size > 100 * MB) pushLargest({ path: p, size, cat: c.cat, mtime });
        if (size >= MB && inDupScope(p)) dupCandidates.push({ path: p, size });
      });
      tick(dir);
    }
  }
  tick('', true);

  // Doublons : même taille → même début et fin → même empreinte SHA-256 du fichier entier
  const groups = sizeGroups(dupCandidates).sort((a, b) => b.size - a.size);
  const toHash = groups.reduce((n, g) => n + g.size * g.paths.length, 0);
  let hashedBytes = 0;
  const h0 = Date.now();
  for (const g of groups) {
    if (signal?.aborted) throw new Error('annulé');
    if (hashedBytes > maxHashBytes) break;
    const byPartial = new Map();
    for (const p of g.paths) {
      const k = await partialHash(p, g.size).catch(() => null);
      if (k) (byPartial.get(k) ?? byPartial.set(k, []).get(k)).push(p);
    }
    for (const same of byPartial.values()) {
      if (same.length < 2) continue;
      const byFull = new Map();
      for (const p of same) {
        onProgress({ phase: 'hash', files: res.hashed.files, bytes: hashedBytes, total: toHash, current: p, elapsed: Date.now() - t0, eta: eta(hashedBytes, toHash, Date.now() - h0) });
        const k = await fullHash(p, signal).catch((e) => { if (e.message === 'annulé') throw e; return null; });
        hashedBytes += g.size; res.hashed.files += 1; res.hashed.bytes += g.size;
        if (k) (byFull.get(k) ?? byFull.set(k, []).get(k)).push(p);
      }
      for (const [hash, paths] of byFull) if (paths.length > 1) { res.duplicates.push({ hash, size: g.size, paths }); res.dupWasted += g.size * (paths.length - 1); }
    }
  }
  res.duplicates.sort((a, b) => b.size * (b.paths.length - 1) - a.size * (a.paths.length - 1));
  res.duplicates = res.duplicates.slice(0, 200);
  res.elapsed = Date.now() - t0;
  return res;
}

/** Score « entretien du stockage » (0-100) tiré de l'analyse : inutiles, doublons, fichiers louches. */
export function storageScore(r) {
  const junk = Object.values(r.junk).reduce((n, j) => n + j.bytes, 0);
  let s = 100;
  s -= Math.min(20, (junk / 1e9) * 2);
  s -= Math.min(15, (r.dupWasted / 1e9) * 1.5);
  s -= Math.min(30, r.suspects.length * 6);
  return Math.max(0, Math.round(s));
}
