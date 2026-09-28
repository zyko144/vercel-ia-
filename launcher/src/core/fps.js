// Vrais FPS en jeu avec PresentMon (outil open source d'Intel/Microsoft, licence MIT), téléchargé une seule fois
// depuis sa page officielle GitHub et vérifié par empreinte SHA-256 avant d'être lancé.
// Windows n'autorise la lecture des images qu'aux administrateurs ou au groupe « Utilisateurs du journal de
// performances » (SID S-1-5-32-559) : on propose d'y ajouter le compte une fois (puis se reconnecter à Windows).
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PRESENTMON = {
  version: '2.3.1',
  url: 'https://github.com/GameTechDev/PresentMon/releases/download/v2.3.1/PresentMon-2.3.1-x64.exe',
  sha256: '364e5d98d4d134bd54dd25c22ed2ca2f4883f8bc3ed6502bee0c151e3436d30c',
};

/** Chemin de PresentMon (téléchargé et vérifié si besoin). */
export async function ensurePresentMon(dir, fetchImpl = fetch) {
  const exe = path.join(dir, `PresentMon-${PRESENTMON.version}.exe`);
  const ok = async (buf) => createHash('sha256').update(buf).digest('hex') === PRESENTMON.sha256;
  const have = await readFile(exe).catch(() => null);
  if (have && await ok(have)) return exe;
  const r = await fetchImpl(PRESENTMON.url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`téléchargement de PresentMon impossible (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!(await ok(buf))) throw new Error('PresentMon téléchargé ne correspond pas à la version officielle : ignoré');
  await mkdir(dir, { recursive: true });
  await writeFile(`${exe}.tmp`, buf);
  await rename(`${exe}.tmp`, exe);
  return exe;
}

/** Statistiques d'une série de temps d'image (ms) : moyenne, 1 % les plus lents, saccades, part limitée par le processeur. */
export function frameStats(frameMs, gpuBusyMs = []) {
  const f = frameMs.filter((x) => x > 0 && x < 1000);
  if (f.length < 10) return null;
  const total = f.reduce((a, b) => a + b, 0);
  const avg = (1000 * f.length) / total;
  const sorted = [...f].sort((a, b) => b - a);
  const worst = sorted.slice(0, Math.max(1, Math.floor(f.length / 100)));
  const low1 = 1000 / (worst.reduce((a, b) => a + b, 0) / worst.length);
  // Saccade : une image plus de 2,5 × plus longue que la médiane des images voisines
  const median = [...f].sort((a, b) => a - b)[Math.floor(f.length / 2)];
  const stutters = f.filter((x) => x > median * 2.5 && x > 25).length;
  // Processeur limitant : la carte graphique a été occupée moins de 75 % du temps de l'image
  const g = gpuBusyMs.slice(0, f.length).filter((x) => x >= 0);
  const cpuBound = g.length >= 10 ? Math.round((100 * g.filter((x, i) => f[i] && x / f[i] < 0.75).length) / g.length) : null;
  return { avg: Math.round(avg), low1: Math.round(low1), stutters, frames: f.length, seconds: Math.round(total / 1000), cpuBound };
}

/** Lit la sortie CSV de PresentMon au fil de l'eau : renvoie une fonction qui reçoit chaque morceau de texte. */
export function csvReader(onFrame) {
  let head = null; let rest = '';
  return (chunk) => {
    rest += chunk;
    const lines = rest.split(/\r?\n/);
    rest = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(',');
      if (!head) { if (cols.includes('Application')) head = Object.fromEntries(cols.map((c, i) => [c.trim(), i])); continue; }
      const ft = Number(cols[head.FrameTime ?? head.MsBetweenPresents]);
      const gb = Number(cols[head.GPUBusy ?? head.MsGPUBusy]);
      if (Number.isFinite(ft)) onFrame(ft, Number.isFinite(gb) ? gb : -1);
    }
  };
}

/**
 * Mesure les images d'un jeu (nom de l'exécutable) jusqu'à sa fermeture.
 * onLive(stats) toutes les 2 s ; renvoie { stop(), done: Promise<stats|{error}> }.
 */
export function captureFps(exePath, processName, onLive = () => {}) {
  // Un jeu peut avoir plusieurs exe (ex. Fortnite : le jeu + son anti-triche) : on les mesure tous
  const names = [processName].flat().filter((n) => /^[\w .()-]{1,80}\.exe$/i.test(String(n))).slice(0, 6);
  if (!names.length) return { stop() {}, done: Promise.resolve({ error: 'nom de jeu invalide' }) };
  const frames = []; const gpu = [];
  const p = spawn(exePath, [...names.flatMap((n) => ['--process_name', n]), '--output_stdout', '--no_console_stats', '--terminate_on_proc_exit', '--stop_existing_session', '--session_name', 'HistoryFPS', '--no_track_display', '--no_track_input'], { windowsHide: true });
  let err = '';
  const read = csvReader((ft, gb) => { frames.push(ft); gpu.push(gb); if (frames.length > 200_000) { frames.splice(0, 50_000); gpu.splice(0, 50_000); } });
  p.stdout.setEncoding('utf8'); p.stdout.on('data', read);
  p.stderr?.setEncoding('utf8'); p.stderr?.on('data', (c) => { err += c; });
  let last = 0;
  const live = setInterval(() => {
    // FPS en direct : les 2 dernières secondes
    const recent = []; let t = 0;
    for (let i = frames.length - 1; i >= last && t < 2000; i--) { recent.push(frames[i]); t += frames[i]; }
    last = Math.max(0, frames.length - 2000);
    const s = frameStats(recent);
    if (s) onLive(s);
  }, 2000);
  const done = new Promise((resolve) => {
    p.on('error', (e) => { clearInterval(live); resolve({ error: e.message }); });
    p.on('close', () => {
      clearInterval(live);
      if (!frames.length && /access|denied|privil|admin|refus/i.test(err)) return resolve({ error: 'droits', detail: err.slice(0, 200) });
      resolve(frameStats(frames, gpu) ?? { error: frames.length ? 'partie trop courte' : 'aucune image mesurée' });
    });
  });
  return { stop: () => p.kill(), done };
}

/** Script administrateur (une seule fois) : ajoute l'utilisateur au groupe qui a le droit de mesurer les images. */
export const PERF_GROUP_SCRIPT = "$ErrorActionPreference='SilentlyContinue'; Add-LocalGroupMember -SID 'S-1-5-32-559' -Member ([Security.Principal.WindowsIdentity]::GetCurrent().Name)";

export async function removeCache(dir) { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
