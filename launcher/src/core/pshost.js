// Un seul PowerShell gardé ouvert pour les petites lectures répétées (processus, musique, températures).
// Lancer powershell.exe coûte ~0,3 s de processeur et 40 Mo à chaque fois : avant, c'était toutes les 5 s.
// Les commandes passent en file (une à la fois), encodées en base64 : aucun texte ne peut casser la ligne.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const win = process.platform === 'win32';
let proc = null;
let buf = '';
let seq = 0;
let current = null;
const queue = [];
let idleTimer = null;

function start() {
  const me = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  proc = me;
  me.stdout.setEncoding('utf8');
  me.stdin.write("[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; $ErrorActionPreference='SilentlyContinue'\n");
  me.stdout.on('data', (chunk) => {
    if (proc !== me) return;
    buf += chunk;
    if (!current) { buf = ''; return; }
    const i = buf.indexOf(current.marker);
    if (i < 0) return;
    const out = buf.slice(0, i);
    buf = buf.slice(i + current.marker.length);
    const c = current; current = null;
    clearTimeout(c.timer);
    c.resolve(out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim());
    next();
  });
  const dead = () => { if (proc !== me) return; proc = null; if (current) { clearTimeout(current.timer); current.reject(new Error('PowerShell fermé')); current = null; } next(); };
  me.on('exit', dead);
  me.on('error', dead);
}

function next() {
  if (current || !queue.length) return;
  if (!proc) start();
  current = queue.shift();
  current.marker = `<<fin-${++seq}>>`;
  const b64 = Buffer.from(current.script, 'utf8').toString('base64');
  current.timer = setTimeout(() => { const c = current; current = null; const p = proc; proc = null; p?.kill(); c?.reject(new Error('trop long')); next(); }, current.timeout);
  proc.stdin.write(`try { iex ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))) | Out-String -Width 4096 } catch {}; '${current.marker}'\n`);
  // Fermé après 2 min sans commande : rien ne tourne pour rien quand le launcher est au repos
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!current && !queue.length && proc) { const p = proc; proc = null; p.stdin.end(); } }, 120_000);
  idleTimer.unref?.();
}

/** Exécute un script PowerShell dans le processus gardé ouvert (repli : un PowerShell à part). */
export function ps(script, timeout = 15_000) {
  if (!win) return Promise.resolve('');
  return new Promise((resolve, reject) => { queue.push({ script, timeout, resolve, reject }); next(); })
    .catch(() => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout, maxBuffer: 8e6 }).then((r) => String(r.stdout).trim(), () => ''));
}
