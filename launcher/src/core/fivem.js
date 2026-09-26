// FiveM (GTA V multijoueur) : pas d'API officielle pour le temps de jeu, mais FiveM écrit un journal par session
// (FiveM.app\logs\CitizenFX_log_<date de début>.log, modifié jusqu'à la fin de la session). On en tire les vraies
// sessions (début → dernière écriture), fusionnées si elles se chevauchent, et on les garde pour toujours
// (FiveM finit par effacer ses vieux journaux, pas nous).
import { open, readdir, stat } from 'node:fs/promises';
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

// ---------- Serveurs : favoris (joueurs en ligne) et heures par serveur ----------
const JOIN_RE = /cfx\.re\/join\/([a-z0-9]{4,10})/gi;
const IP_RE = /connect(?:ing)?\s+to\s+(?:server\s+)?(\d{1,3}(?:\.\d{1,3}){3}:\d{2,5})/gi;

/** Code ou adresse accepté pour un serveur (« cfx.re/join/abc123 », « abc123 », « 1.2.3.4:30120 »). */
export function serverCode(input) {
  const c = String(input ?? '').trim().toLowerCase().replace(/^(https?:\/\/)?(cfx\.re\/join\/)?/, '');
  return /^[a-z0-9]{4,10}$/.test(c) || /^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(c) ? c : null;
}
export const joinLink = (code) => (/:/.test(code) ? `fivem://connect/${code}` : `fivem://connect/cfx.re/join/${code}`);

/** Dernier serveur rejoint dans un journal (lien cfx.re/join, sinon adresse IP). */
export function serverFromLog(text) {
  const join = [...String(text).matchAll(JOIN_RE)].at(-1);
  if (join) return join[1].toLowerCase();
  const ip = [...String(text).matchAll(IP_RE)].at(-1);
  return ip ? ip[1] : null;
}

async function readHead(file, max = 8 * 1024 * 1024) {
  const fh = await open(file, 'r');
  try {
    const buf = Buffer.alloc(max);
    const { bytesRead } = await fh.read(buf, 0, max, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally { await fh.close(); }
}

/** Met à jour { fichier: { code, start, end } } avec les journaux présents (déjà lus = sautés s'ils n'ont pas bougé). */
export async function fivemServerLogs(dir = fivemDir(), known = {}) {
  const logs = path.join(dir, 'FiveM.app', 'logs');
  const out = { ...known };
  for (const f of await readdir(logs).catch(() => [])) {
    if (!/^CitizenFX_log.*\.log$/i.test(f)) continue;
    const start = logStart(f);
    const s = await stat(path.join(logs, f)).catch(() => null);
    if (!start || !s || s.mtimeMs - start < 60_000 || s.mtimeMs - start > MAX_SESSION) continue;
    if (out[f]?.end === s.mtimeMs) continue;
    const code = serverFromLog(await readHead(path.join(logs, f)).catch(() => '')) ?? out[f]?.code ?? null;
    out[f] = { code, start, end: s.mtimeMs };
  }
  return out;
}

/** Minutes par serveur (les sessions sans serveur reconnu sont ignorées). */
export function serverMinutes(logs) {
  const by = {};
  for (const { code, start, end } of Object.values(logs ?? {})) if (code) by[code] = (by[code] ?? 0) + (end - start) / 60_000;
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v)]));
}

export const cleanHostname = (s) => String(s ?? '').replace(/\^\d/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Réponse de l'annuaire FiveM → { name, players, max, online }. */
export function parseServerInfo(json) {
  const d = json?.Data ?? json?.data;
  if (!d) return { online: false };
  const name = cleanHostname(d.vars?.sv_projectName || d.hostname);
  return { online: true, name: name || null, players: Number(d.clients ?? d.selfReportedClients ?? 0), max: Number(d.sv_maxclients ?? d.svMaxclients ?? 0) || null };
}

export async function fivemServerInfo(code, fetchImpl = fetch) {
  if (/:/.test(code)) return { online: null };
  const r = await fetchImpl(`https://servers-frontend.fivem.net/api/servers/single/${code}`, { headers: { 'User-Agent': 'HistoryLauncher' }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return { online: false };
  if (!r.ok) throw new Error(`annuaire FiveM ${r.status}`);
  return parseServerInfo(await r.json());
}
