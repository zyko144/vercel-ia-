// Temps passé sur chaque jeu ou appli : toutes les 60 s, on regarde les programmes ouverts et on
// crédite une minute à ceux dont l'exécutable est dans le dossier d'un élément de la bibliothèque.
import { ps } from './pshost.js';
import { logSession } from './progress.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Chemin de chaque programme avec l'accès « limité » de Windows (QueryFullProcessImageName) : les anti-triche
// (BattlEye de R6, EAC de Fortnite / Rocket League) le laissent passer, alors que Get-Process .Path est refusé.
// Sans chemin du tout : juste le nom, ex. « fortniteclient-win64-shipping.exe ».
export const PROC_SCRIPT = [
  "if (-not ('HLProc' -as [type])) { Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices; public static class HLProc { [DllImport(\"kernel32.dll\")] static extern IntPtr OpenProcess(int a, bool b, int p); [DllImport(\"kernel32.dll\", CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int f, StringBuilder s, ref int n); [DllImport(\"kernel32.dll\")] static extern bool CloseHandle(IntPtr h); public static string Path(int pid) { IntPtr h = OpenProcess(0x1000, false, pid); if (h == IntPtr.Zero) return null; try { var sb = new StringBuilder(1024); int n = sb.Capacity; return QueryFullProcessImageName(h, 0, sb, ref n) ? sb.ToString() : null; } finally { CloseHandle(h); } } }' }",
  // Seulement la session de l'utilisateur : les services Windows (session 0) ne comptent pas comme des applis ouvertes
  "$ok = [bool]('HLProc' -as [type]); $sid = (Get-Process -Id $PID).SessionId; Get-Process | Where-Object SessionId -eq $sid | ForEach-Object { $p = if ($ok) { [HLProc]::Path($_.Id) } else { $_.Path }; if ($p) { $p } else { $_.ProcessName + '.exe' } }",
].join('\n');

// Liste des programmes ouverts, partagée : un seul PowerShell même si plusieurs parties du launcher la demandent
// en même temps, et réutilisée pendant quelques secondes (le launcher reste léger pour le PC).
let procCache = { at: 0, paths: [], pending: null };
export async function runningPaths(maxAgeMs = 8000) {
  if (process.platform !== 'win32') return [];
  if (Date.now() - procCache.at < maxAgeMs) return procCache.paths;
  if (procCache.pending) return procCache.pending;
  procCache.pending = ps(PROC_SCRIPT, 20_000)
    .then((stdout) => [...new Set(stdout.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter(Boolean))])
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
    return { id: item.id, exe: String(item.exe ?? '').toLowerCase(), dir: dir.split('\\').filter(Boolean).length >= 3 ? `${dir}\\` : null, names: exeNames.get(item.id) };
  });
  const active = new Set();
  for (const p of paths) {
    if (!p.includes('\\')) { const it = prepared.find((x) => x.names?.has(p)); if (it) active.add(it.id); continue; }
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
    if (paths.some((p) => !p.includes('\\'))) await learnExes(items);
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
      // Heure de la journée (statistiques « quand je joue ») et journal des sessions
      if (item.kind === 'game') {
        const h = new Date(now).getHours();
        day.h ??= Array(24).fill(0);
        day.h[h] = (day.h[h] ?? 0) + everyMs / 60_000;
        store.data.sessions = logSession(store.data.sessions, id, now, everyMs);
      }
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

// Noms des programmes de chaque jeu installé (lus une fois par session) : reconnaît un jeu dont Windows cache le chemin
const exeNames = new Map();
export async function learnExes(items, readdir = null) {
  readdir ??= (await import('node:fs/promises')).readdir;
  for (const i of items) {
    const dir = String(i.installDir ?? '');
    if (i.kind !== 'game' || !i.installed || exeNames.has(i.id) || dir.split('\\').filter(Boolean).length < 2) continue;
    exeNames.set(i.id, new Set((await gameExes(dir, readdir)).filter((n) => !/(crash|report|launcher|helper|updater|redist|unins|webhelper|cefprocess|setup|install)/.test(n))));
  }
}

/** Noms des .exe d'un dossier de jeu (4 niveaux max) : pour fermer les jeux dont l'anti-triche cache le chemin. */
export async function gameExes(dir, readdir, depth = 4) {
  const out = new Set();
  const walk = async (d, n) => {
    const ents = await readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of ents) {
      if (e.isDirectory() && n > 1 && out.size < 200) await walk(`${d}\\${e.name}`, n - 1);
      else if (/^[\w .()-]+\.exe$/i.test(e.name) && !/(unins|redist|setup|vc_?redist|dxsetup)/i.test(e.name)) out.add(e.name.toLowerCase());
    }
  };
  await walk(dir, depth);
  return [...out];
}
