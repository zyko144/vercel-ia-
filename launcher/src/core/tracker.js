// Temps passé sur chaque jeu ou appli : toutes les 60 s, on regarde les programmes ouverts et on
// crédite une minute à ceux dont l'exécutable est dans le dossier d'un élément de la bibliothèque.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function runningPaths() {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process | Where-Object Path | ForEach-Object Path'], { windowsHide: true, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
    return [...new Set(stdout.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean))];
  } catch {
    return [];
  }
}

/** Les éléments en cours d'utilisation (id), d'après la liste des exécutables ouverts. */
export function activeItems(items, paths) {
  const active = new Set();
  for (const item of items) {
    const dir = String(item.installDir ?? '').toLowerCase().replace(/\\+$/, '');
    const exe = String(item.exe ?? '').toLowerCase();
    // Un dossier trop court (C:\, Program Files) toucherait tout : on l'ignore
    const dirOk = dir.split('\\').filter(Boolean).length >= 3;
    if (paths.some((p) => (exe && p === exe) || (dirOk && p.startsWith(`${dir}\\`)))) active.add(item.id);
  }
  return active;
}

/** Catégorie des statistiques : jeux, applications, musique, autres. */
export const statCategory = (item) => (item?.kind === 'game' ? 'jeux' : item?.category === 'musique' ? 'musique' : item?.kind === 'app' && item?.category === 'appli' ? 'applis' : 'autres');
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/** Minutes par catégorie sur les N derniers jours (semaine = 7, mois = 30, année = 365). */
export function periodStats(days, n, now = Date.now()) {
  const out = { jeux: 0, applis: 0, musique: 0, autres: 0 };
  for (let i = 0; i < n; i++) {
    const d = days?.[dayKey(now - i * 86_400_000)];
    if (d) for (const k of Object.keys(out)) out[k] += d[k] ?? 0;
  }
  return out;
}

export function startTracker(getItems, store, onChange, everyMs = 60_000) {
  const tick = async () => {
    const items = getItems();
    const active = activeItems(items, await runningPaths());
    if (!active.size) return;
    const now = Date.now();
    const day = ((store.data.days ??= {})[dayKey(now)] ??= {});
    for (const id of active) {
      const t = (store.data.time[id] ??= { minutes: 0, lastPlayed: 0 });
      t.minutes += everyMs / 60_000;
      t.lastPlayed = now;
      const cat = statCategory(items.find((i) => i.id === id));
      day[cat] = (day[cat] ?? 0) + everyMs / 60_000;
    }
    // On garde un an d'historique
    for (const k of Object.keys(store.data.days)) if (k < dayKey(now - 400 * 86_400_000)) delete store.data.days[k];
    store.save();
    onChange?.([...active]);
  };
  const timer = setInterval(() => tick().catch(() => {}), everyMs);
  return () => clearInterval(timer);
}
