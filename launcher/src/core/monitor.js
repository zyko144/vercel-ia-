// Surveillance du PC : processeur, mémoire, carte graphique (utilisation, température, mémoire vidéo).
// NVIDIA : nvidia-smi (installé avec le pilote). AMD/Intel : compteurs Windows (utilisation seulement).
// Température du processeur : Windows ne la donne qu'aux applis lancées en administrateur, souvent pas du tout.
import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);

let last = null;
/** Utilisation du processeur (%) depuis l'appel précédent. */
export function cpuUsage(cpus = os.cpus()) {
  const now = cpus.reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, total: 0 });
  const prev = last;
  last = now;
  if (!prev || now.total === prev.total) return null;
  return Math.round(100 * (1 - (now.idle - prev.idle) / (now.total - prev.total)));
}

/** Ligne de nvidia-smi : « nom, température, utilisation, mémoire utilisée, mémoire totale ». */
export function parseNvidiaSmi(text) {
  const line = String(text ?? '').split(/\r?\n/).find((l) => l.split(',').length >= 5);
  if (!line) return null;
  const [name, temp, util, used, total] = line.split(',').map((s) => s.trim());
  const n = (v) => (/^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
  return { name, temp: n(temp), usage: n(util), vramUsed: n(used), vramTotal: n(total) };
}

let gpuMode = null; // 'nvidia' | 'counters' | 'none'
async function gpuInfo() {
  if (process.platform !== 'win32') return null;
  if (gpuMode !== 'counters' && gpuMode !== 'none') {
    const r = await run('nvidia-smi', ['--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], { windowsHide: true, timeout: 5000 }).catch(() => null);
    const g = parseNvidiaSmi(r?.stdout);
    if (g) { gpuMode = 'nvidia'; return g; }
    if (gpuMode === 'nvidia') return null;
    gpuMode = 'counters';
  }
  if (gpuMode === 'counters') {
    const ps = "$s=(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples | Measure-Object CookedValue -Sum; [math]::Round($s.Sum)";
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }).catch(() => null);
    const v = Number(String(r?.stdout ?? '').trim());
    if (!Number.isFinite(v) || !r?.stdout?.trim()) { gpuMode = 'none'; return null; }
    return { name: null, temp: null, usage: Math.min(100, v), vramUsed: null, vramTotal: null };
  }
  return null;
}

let cpuTempTried = 0;
let cpuTempOk = true;
async function cpuTemp() {
  if (process.platform !== 'win32' || !cpuTempOk) return null;
  const ps = "(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1).CurrentTemperature";
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 6000 }).catch(() => null);
  const k = Number(String(r?.stdout ?? '').trim());
  if (!k) { if (++cpuTempTried >= 2) cpuTempOk = false; return null; }
  const c = Math.round(k / 10 - 273.15);
  return c > 0 && c < 120 ? c : null;
}

export async function snapshot() {
  const [gpu, cTemp] = await Promise.all([gpuInfo(), cpuTemp()]);
  const total = os.totalmem();
  return {
    at: Date.now(), cpu: { usage: cpuUsage(), temp: cTemp, name: os.cpus()[0]?.model?.trim() ?? null },
    ram: { used: total - os.freemem(), total }, gpu,
  };
}

/** Alertes de chauffe (une fois toutes les 10 min par composant). */
export function heatAlerts(snap, lastAlert = {}, now = Date.now()) {
  const out = [];
  const check = (key, temp, limit, label) => {
    if (temp != null && temp >= limit && now - (lastAlert[key] ?? 0) > 600_000) { out.push({ key, text: `${label} à ${temp} °C` }); lastAlert[key] = now; }
  };
  check('gpu', snap.gpu?.temp, 85, 'Carte graphique');
  check('cpu', snap.cpu?.temp, 90, 'Processeur');
  return out;
}
