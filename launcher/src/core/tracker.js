// Temps passé sur chaque jeu ou appli : toutes les 60 s, on regarde les programmes ouverts et on
// crédite une minute à ceux dont l'exécutable est dans le dossier d'un élément de la bibliothèque.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Liste des programmes ouverts, partagée : un seul PowerShell même si plusieurs parties du launcher la demandent
// en même temps, et réutilisée pendant quelques secondes (le launcher reste léger pour le PC).
let procCache = { at: 0, paths: [], pending: null };
export async function runningPaths(maxAgeMs = 8000) {
  if (process.platform !== 'win32') return [];
  if (Date.now() - procCache.at < maxAgeMs) return procCache.paths;
  if (procCache.pending) return procCache.pending;
  procCache.pending = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process | Where-Object Path | ForEach-Object Path'], { windowsHide: true, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 })
    .then(({ stdout }) => [...new Set(stdout.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean))])
    .catch(() => procCache.paths)
    .then((paths) => { procCache = { at: Date.now(), paths, pending: null }; return paths; });
  return procCache.pending;
}

/** Les éléments en cours d'utilisation (id), d'après la liste des exécutables ouverts. */
export function activeItems(items, paths) {
  // Chaque programme ouvert compte pour UN seul élément : l'exécutable exact, sinon le dossier le plus précis
  // (ex. un jeu installé dans le dossier d'un launcher ne crédite pas aussi le launcher).
  const prepared = items.map((item) => {
    const dir = String(item.installDir ?? '').toLowerCase().replace(/\\+$/, '');
    // Un dossier trop court (C:\, Program Files) toucherait tout : on l'ignore
    return { id: item.id, exe: String(item.exe ?? '').toLowerCase(), dir: dir.split('\\').filter(Boolean).length >= 3 ? `${dir}\\` : null };
  });
  const active = new Set();
  for (const p of paths) {
    let best = null;
    let bestLen = -1;
    for (const it of prepared) {
      if (it.exe && p === it.exe) { best = it; bestLen = Infinity; break; }
      if (it.dir && p.startsWith(it.dir) && it.dir.length > bestLen) { best = it; bestLen = it.dir.length; }
    }
    if (best) active.add(best.id);
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

/** Minutes par élément sur les N derniers jours (classement de la semaine / du mois). */
export function periodItems(days, n, now = Date.now()) {
  const out = {};
  for (let i = 0; i < n; i++) {
    for (const [id, m] of Object.entries(days?.[dayKey(now - i * 86_400_000)]?.items ?? {})) out[id] = (out[id] ?? 0) + m;
  }
  return out;
}

export function startTracker(getItems, store, onChange, everyMs = 60_000, accountFor = () => 'principal', isPaused = () => false) {
  const tick = async () => {
    // PC verrouillé ou en veille : personne ne joue, rien n'est compté
    if (isPaused()) return;
    const items = getItems();
    const paths = await runningPaths();
    const active = activeItems(items, paths);
    if (!active.size) return;
    // Jeu Steam lancé sans Steam (lancement direct) : Steam ne compte pas ce temps, le launcher le garde à part
    const steamOn = paths.some((p) => /[\\/]steam\.exe$/i.test(p));
    const now = Date.now();
    const day = ((store.data.days ??= {})[dayKey(now)] ??= {});
    for (const id of active) {
      const item = items.find((i) => i.id === id);
      // Temps rangé par compte (compte Steam actif, compte Epic choisi…), pour ne compter qu'un compte à la fois
      const t = (((store.data.timeBy ??= {})[id] ??= {})[accountFor(item)] ??= { minutes: 0, lastPlayed: 0 });
      t.minutes += everyMs / 60_000;
      t.lastPlayed = now;
      if (item.source === 'steam' && !steamOn) (store.data.offSteam ??= {})[id] = (store.data.offSteam[id] ?? 0) + everyMs / 60_000;
      const cat = statCategory(item);
      day[cat] = (day[cat] ?? 0) + everyMs / 60_000;
      (day.items ??= {})[id] = (day.items[id] ?? 0) + everyMs / 60_000;
    }
    // On garde un an d'historique
    for (const k of Object.keys(store.data.days)) if (k < dayKey(now - 400 * 86_400_000)) delete store.data.days[k];
    store.save();
    onChange?.([...active]);
  };
  const timer = setInterval(() => tick().catch(() => {}), everyMs);
  return () => clearInterval(timer);
}

/** Temps d'un élément jour par jour sur les N derniers jours (le plus ancien d'abord), avec quelques chiffres. */
export function itemHistory(days, id, n = 30, now = Date.now()) {
  const list = [];
  for (let i = n - 1; i >= 0; i--) {
    const key = dayKey(now - i * 86_400_000);
    list.push({ date: key, minutes: Math.round(days?.[key]?.items?.[id] ?? 0) });
  }
  const played = list.filter((d) => d.minutes > 0);
  const total = played.reduce((s, d) => s + d.minutes, 0);
  const best = played.reduce((b, d) => (d.minutes > (b?.minutes ?? 0) ? d : b), null);
  let streak = 0;
  for (let i = list.length - 1; i >= 0 && list[i].minutes > 0; i--) streak++;
  return { days: list, total, daysPlayed: played.length, avg: played.length ? Math.round(total / played.length) : 0, best, streak };
}
