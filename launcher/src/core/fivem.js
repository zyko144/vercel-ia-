// FiveM (GTA V multijoueur) : pas d'API officielle pour le temps de jeu, mais FiveM écrit un journal par session
// (FiveM.app\logs\CitizenFX_log_<date de début>.log, modifié jusqu'à la fin de la session). On en tire les vraies
// sessions (début → dernière écriture), fusionnées si elles se chevauchent, et on les garde pour toujours
// (FiveM finit par effacer ses vieux journaux, pas nous).
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const MAX_SESSION = 16 * 3_600_000;

export function fivemDir(env = process.env) {
  return path.join(env.LOCALAPPDATA ?? path.join(env.USERPROFILE ?? '', 'AppData', 'Local'), 'FiveM');
}

/** Date de début lue dans le nom du journal (« CitizenFX_log_2024-05-01T211403.log »). */
export function logStart(name) {
  const m = String(name).match(/(\d{4})-(\d{2})-(\d{2})[T_ ](\d{2})[-:.]?(\d{2})[-:.]?(\d{2})/);
  if (!m) return null;
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Fusionne des sessions [début, fin] (chevauchements réunis, durées aberrantes écartées). */
export function mergeSessions(list) {
  const clean = list.filter(([s, e]) => e - s >= 60_000 && e - s <= MAX_SESSION).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of clean) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}
export const sessionsMinutes = (sessions) => Math.round(sessions.reduce((n, [s, e]) => n + (e - s), 0) / 60_000);

export async function fivemLogSessions(dir = fivemDir()) {
  const logs = path.join(dir, 'FiveM.app', 'logs');
  const out = [];
  for (const f of await readdir(logs).catch(() => [])) {
    if (!/^CitizenFX_log.*\.log$/i.test(f)) continue;
    const start = logStart(f);
    const s = await stat(path.join(logs, f)).catch(() => null);
    if (start && s) out.push([start, s.mtimeMs]);
  }
  return mergeSessions(out);
}

/** FiveM installé ? → élément de bibliothèque (le temps vient des journaux, gardés d'une fois sur l'autre). */
export async function scanFivem(dir = fivemDir(), stored = []) {
  const exe = path.join(dir, 'FiveM.exe');
  if (!(await stat(exe).catch(() => null))) return { item: null, sessions: stored };
  const sessions = mergeSessions([...stored, ...(await fivemLogSessions(dir))]);
  return {
    sessions,
    item: {
      id: 'fivem:client', source: 'fivem', kind: 'game', category: 'jeu', name: 'FiveM', installed: true, installDir: dir, exe,
      size: 0, minutes: sessionsMinutes(sessions), lastPlayed: sessions.at(-1)?.[1] ?? 0, timeFromLogs: true,
      sessionsCount: sessions.length, since: sessions[0]?.[0] ?? null, known: true,
      brand: { color: '#f40552', logo: 'brands/fivem.svg' },
    },
  };
}
