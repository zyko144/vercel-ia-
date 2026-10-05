// History Clips : replay en fond (garde les dernières secondes au raccourci), galerie par jeu, découpe, partage Discord.
// Appli légère à part de History Launcher : même compte, même style. Une fenêtre qui se libère quand elle est cachée,
// un enregistreur caché qui ne tourne que pendant les parties (option) et passe après le jeu (priorité basse).
import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, Notification, protocol, safeStorage, screen, session, shell, Tray } from 'electron';
import { spawn, execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import updaterMod from 'electron-updater';
import { artMatch, artTerm, clipName, encArgs, ffmpegArgs, micMixArgs, nativeMixArgs, gameLabel, isMedia, parseFg, safeName, unpacked, validAccel } from './core.js';

import { promisify } from 'node:util';
import { localGameArt } from './gameArt.js';
import { serveMedia } from './mediaFile.js';
import { startNativeCapture } from './nativeCapture.js';
import { ReplayBuffer } from './replay.js';
import { createUpdateController, createMediaJobs } from './updateController.js';

const mediaJobs = createMediaJobs();
const clipLocks = new Set();
const mediaHandle = (name, fn) => ipcMain.handle(name, (...args) => {
  const ids = (Array.isArray(args[1]) ? args[1] : [args[1]]).filter(x => typeof x === 'string');
  if (ids.some(id => clipLocks.has(id))) return { ok: false, error: 'Une opération utilise déjà ce clip. Attends sa fin puis réessaie.' };
  ids.forEach(id => clipLocks.add(id));
  return mediaJobs.run(() => fn(...args)).catch(e => ({ ok: false, error: e.message })).finally(() => ids.forEach(id => clipLocks.delete(id)));
});
const here = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(here, 'ui', 'icon.png');
let API = 'https://vercel-ia.onrender.com';
// Adresse du serveur modifiable sans nouvelle version (changement d'hébergeur) : launcher-site/api.json.
// Seulement en https et chez un hébergeur connu.
fetch('https://zyko144.github.io/vercel-ia-/api.json', { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null)).then((j) => {
  const u = String(j?.api ?? '').replace(/\/+$/, '');
  if (/^https:\/\/[\w.-]+\.(onrender\.com|vercel\.app|fly\.dev|railway\.app|koyeb\.app|up\.railway\.app)$/.test(u)) API = u;
}).catch(() => {});
const SITE = 'https://zyko144.github.io/vercel-ia-/clips/';
if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('fr.historyia.clips');
// Sécurité : bac à sable pour toutes les fenêtres, aucune navigation / fenêtre / webview vers l'extérieur,
// outils développeur fermés dans la version installée (personne ne peut injecter de code dans l'appli)
if (process.platform === 'win32') app.enableSandbox();
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (ev, url) => { if (!String(url).startsWith('file:')) ev.preventDefault(); });
  wc.on('will-attach-webview', (ev) => ev.preventDefault());
  if (app.isPackaged) wc.on('devtools-opened', () => wc.closeDevTools());
});

app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,MediaSessionService,HardwareMediaKeyHandling,Translate');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
protocol.registerSchemesAsPrivileged([{ scheme: 'clip', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

// ---------- Réglages (fichier JSON dans le dossier de l'appli) ----------
const DEFAULTS = { replay: true, seconds: 30, height: 1080, fps: 60, audio: true, hotClip: 'F8', hotShot: 'F9', autostart: true, favs: [], names: {},
  source: 'screen', mic: false, micVol: 100, onlyGame: true, gamePriority: true, maxGB: 0, sound: true, theme: 'jaune', art2: {}, exes: {} };
const SET_FILE = () => path.join(app.getPath('userData'), 'reglages.json');
let st = { ...DEFAULTS };
const saveSt = () => writeFile(SET_FILE(), JSON.stringify(st)).catch(() => {});
const ROOT = () => st.dir || path.join(app.getPath('videos'), 'History Clips');

// Compte History (le même que History Launcher) : jeton chiffré par Windows
const tokenGet = () => { try { return st.token ? safeStorage.decryptString(Buffer.from(st.token, 'base64')) : null; } catch { return null; } };
const tokenSet = (t) => { st.token = t ? safeStorage.encryptString(t).toString('base64') : null; saveSt(); };

let win = null; let tray = null; let recWin = null; let recState = 'off'; let freeTimer = null;
const notify = (title, body) => { if (Notification.isSupported()) new Notification({ title, body, icon: ICON, silent: !st.sound }).show(); };
const send = (ch, v) => { if (win && !win.isDestroyed()) win.webContents.send(ch, v); };
const changed = () => send('clips:changed');

// ---------- Fenêtre (sans cadre Windows, comme le launcher ; libérée 2 min après avoir été cachée) ----------
function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 800, minWidth: 960, minHeight: 600, frame: false, backgroundColor: '#0b090e', icon: ICON, title: 'History Clips', show: false,
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(here, 'ui', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (!app.quitting) { e.preventDefault(); win.hide(); } });
  win.on('hide', () => { clearTimeout(freeTimer); freeTimer = setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) { win.destroy(); win = null; } }, 30_000); });
  win.on('blur', () => send('win:focus', false)); win.on('focus', () => send('win:focus', true));
  win.on('maximize', () => send('win:max', true));
  win.on('unmaximize', () => send('win:max', false));
}
function showWindow() { clearTimeout(freeTimer); if (!win || win.isDestroyed()) return createWindow(); win.show(); win.focus(); }
ipcMain.on('win', (_e, what) => {
  if (what === 'min') win?.minimize();
  else if (what === 'max') win?.isMaximized() ? win.unmaximize() : win?.maximize();
  else if (what === 'close') win?.close();
});

// ---------- Jeu au premier plan : un seul PowerShell léger qui prévient quand la fenêtre active change ----------
// (au lieu d'en lancer un à chaque clip : moins de travail pour le processeur pendant la partie)
const FG_LOOP = `$ErrorActionPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8
Add-Type -Name W -Namespace U -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int p); [DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT r); [DllImport("user32.dll")] public static extern System.IntPtr MonitorFromWindow(System.IntPtr h, int f); [DllImport("user32.dll")] public static extern bool GetMonitorInfo(System.IntPtr m, ref MONITORINFO i); public struct RECT { public int L, T, R, B; } [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)] public struct MONITORINFO { public int cb; public RECT M; public RECT W; public int F; }'
$last=''
while ($true) {
  $h=[U.W]::GetForegroundWindow(); $p=0; [void][U.W]::GetWindowThreadProcessId($h,[ref]$p); $r=New-Object U.W+RECT; [void][U.W]::GetWindowRect($h,[ref]$r)
  $mi=New-Object U.W+MONITORINFO; $mi.cb=40; [void][U.W]::GetMonitorInfo([U.W]::MonitorFromWindow($h,2),[ref]$mi)
  $full = [int]($r.L -le $mi.M.L -and $r.T -le $mi.M.T -and $r.R -ge $mi.M.R -and $r.B -ge $mi.M.B)
  $line = "$h|$p|$full"
  if ($line -ne $last) { $x=Get-Process -Id $p; $last=$line; [Console]::WriteLine("FG|$line|" + $x.MainModule.FileVersionInfo.FileDescription + '|' + $x.MainWindowTitle + '|' + $x.ProcessName + '|' + $x.Path) }
  Start-Sleep -Milliseconds 3000
}`;
let fg = { hwnd: '0', full: false, game: 'Bureau', exe: '' };
let fgProc = null; let noGameTimer = null;
function startFgWatch() {
  if (process.platform !== 'win32' || fgProc || app.quitting || mediaJobs.closing) return;
  fgProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', FG_LOOP], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  try { os.setPriority(fgProc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* pas grave */ }
  let buf = '';
  fgProc.stdout.on('data', (d) => {
    buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop();
    for (const l of lines) { const v = parseFg(l); if (v) onForeground(v); }
  });
  fgProc.on('exit', () => { fgProc = null; if (!app.quitting) setTimeout(startFgWatch, 10_000); });
}
function onForeground(v) {
  if (mediaJobs.closing || app.quitting) return;
  const wasGame = fg.full && fg.game !== 'Bureau';
  fg = { ...v, game: gameLabel(v) };
  const isGame = fg.full && fg.game !== 'Bureau' && !/^(History Clips|History Launcher)$/i.test(fg.game);
  if (isGame && fg.exe) { st.exes[safeName(fg.game)] = fg.exe; }
  if (!st.replay || !st.onlyGame && st.source !== 'game') return;
  if (isGame) {
    clearTimeout(noGameTimer);
    // « Jeu seulement » : on capture la fenêtre du jeu, on redémarre si on change de jeu
    if (!recWin || (st.source === 'game' && recSource !== `window:${fg.hwnd}:0`)) restartReplay();
  } else if (wasGame && st.onlyGame) {
    // Revenu sur le bureau : on arrête après 1 min (le replay rend sa mémoire et ne coûte plus rien)
    clearTimeout(noGameTimer);
    noGameTimer = setTimeout(() => { if (!(fg.full && fg.game !== 'Bureau')) setReplay(false, true); }, 60_000);
  }
}
const inGame = () => fg.full && fg.game !== 'Bureau' && !/^(History Clips|History Launcher)$/i.test(fg.game);

// ---------- Replay ----------
let nativeCapture = null, nativeFailed = false, captureBackend = 'compatible';
let recSource = null, replayGeneration = 0, replayStarting = false;
async function pickSource() {
  if (st.source === 'game' && inGame()) {
    const id = `window:${fg.hwnd}:0`;
    const w = (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } }).catch(() => [])).find((s) => s.id === id);
    if (w) return w;
  }
  return (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).catch(() => []))[0] ?? null;
}
async function setReplay(on, keepSetting = false) {
  if (on && (mediaJobs.closing || app.quitting)) return;
  if (!on) {
    replayGeneration++; replayStarting = false;
    nativeCapture?.stop(); nativeCapture = null;
    if (recWin && !recWin.isDestroyed()) { recWin.webContents.send('rec:stop'); const w = recWin; setTimeout(() => { if (!w.isDestroyed()) w.destroy(); }, 500); }
    recWin = null; recSource = null; recState = keepSetting && st.replay ? 'wait' : 'off'; changed(); resetRing();
    tray?.setToolTip(recState === 'wait' ? 'History Clips · en attente d’un jeu' : 'History Clips · replay en pause'); return;
  }
  if (st.onlyGame && process.platform === 'win32' && !inGame()) { recState = 'wait'; changed(); tray?.setToolTip('History Clips · en attente d’un jeu'); return; }
  if (replayStarting || (recWin && !recWin.isDestroyed())) return;
  const generation = ++replayGeneration; replayStarting = true;
  const src = await pickSource().finally(() => { if (generation === replayGeneration) replayStarting = false; });
  if (generation !== replayGeneration || mediaJobs.closing || app.quitting) return;
  if (!src) { recState = 'error:aucun écran trouvé'; changed(); return; }
  recSource = src.id;
  recWin = new BrowserWindow({ show: false, width: 200, height: 100, webPreferences: { preload: path.join(here, 'recorder.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const me = recWin; recWin.on('closed', () => { if (recWin === me) recWin = null; });
  resetRing();
  await me.loadFile(path.join(here, 'ui', 'recorder.html'));
  if (generation !== replayGeneration || recWin !== me || me.isDestroyed()) return;
  captureBackend = 'compatible';
  // DDA output 0 n’est pas un identifiant Electron : activer seulement avec un écran pour éviter de filmer le mauvais.
  if (process.platform === 'win32' && !nativeFailed && src.id.startsWith('screen:') && screen.getAllDisplays().length === 1) {
    const enc = await bestEncoder();
    if (generation !== replayGeneration) return;
    if (enc !== 'libx264') {
      const display = screen.getAllDisplays()[0], buffer = replayBuffer;
      try {
        const bin = await FFMPEG();
        if (generation !== replayGeneration) return;
        const handle = startNativeCapture(bin, { height: st.height, fps: st.fps, enc, width: Math.round(display.size.width * display.scaleFactor), sourceHeight: Math.round(display.size.height * display.scaleFactor) }, chunk => buffer.push('video', chunk), () => {
          if (generation !== replayGeneration) return;
          nativeFailed = true; notify('Capture de secours', 'La capture native s’est arrêtée. Reprise avec la source compatible.'); restartReplay();
        });
        nativeCapture = handle;
        await handle.ready;
        if (generation !== replayGeneration) { handle.stop(); return; }
        captureBackend = 'native';
      } catch { if (generation !== replayGeneration) return; nativeCapture?.stop(); nativeCapture = null; nativeFailed = true; resetRing(); }
    }
  }
  if (generation !== replayGeneration || me.isDestroyed()) return;
  me.webContents.send('rec:start', src.id, { seconds: st.seconds, height: st.height, fps: st.fps, audio: st.audio, mic: st.mic, nativeVideo: captureBackend === 'native' });
  tray?.setToolTip(`History Clips · replay actif (${st.hotClip} pour garder les ${st.seconds} dernières secondes)`);
}
let restarting = null;
const restartReplay = () => { clearTimeout(restarting); if (!st.replay) return; setReplay(false); restarting = setTimeout(() => setReplay(true).catch(() => {}), 800); };
// Priorité au jeu : l'enregistreur et l'encodage vidéo passent après le jeu (moins de FPS perdus)
function lowerPriority() {
  if (!st.gamePriority) return;
  // Ne pas rétrograder le processus GPU : il porte aussi la capture et l’encodeur.
  const pids = [recWin?.webContents.getOSProcessId()].filter(Boolean);
  for (const pid of pids) { try { os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* pas grave */ } }
}
ipcMain.on('rec:state', (e, s) => {
  if (e.sender !== recWin?.webContents) return;
  if (s === 'empty') return notify('Clip pas encore prêt', 'Le replay vient de démarrer : réessaie dans quelques secondes.');
  if (s.startsWith('on')) {
    if (captureBackend === 'native' && nativeCapture && replayBuffer) { const offset = Math.max(0, Date.now() - nativeCapture.startedAt); replayBuffer.offsets.game = offset; replayBuffer.offsets.mic = offset; }
    recState = 'on'; st.noAudio = s.includes('noaudio'); st.noMic = s.includes('nomic');
    if (st.noAudio) notify('Son du PC indisponible', 'Vérifie la sortie audio Windows puis relance le replay. Aucun clip silencieux ne sera enregistré à ta place.');
    if (st.noMic) notify('Micro indisponible', 'Vérifie le micro et son autorisation Windows puis relance le replay.');
  } else { recState = s; if (s.startsWith('error')) nativeCapture?.stop(); }
  changed();
  if (recState === 'on') lowerPriority();
  if (s.startsWith('error')) notify('Replay indisponible', `L’enregistrement n’a pas démarré (${s.slice(6, 120)}).`);
});

// Chaque session a son dossier : un redémarrage ne peut pas effacer le nouveau replay.
let replayBuffer = null;
function resetRing() {
  const old = replayBuffer;
  replayBuffer = recWin ? new ReplayBuffer(path.join(app.getPath('temp'), 'history-clips-replay', randomUUID()), st.seconds, st.fps) : null;
  void old?.close().catch(() => {});
}
ipcMain.on('rec:chunk', (e, ab, kind) => {
  if (e.sender !== recWin?.webContents || !replayBuffer || !['video', 'mic', 'game'].includes(kind)) return;
  const buffer = replayBuffer;
  if (captureBackend === 'native' && kind === 'video') return;
  void buffer.push(kind, Buffer.from(ab)).catch(err => {
    if (buffer !== replayBuffer) return;
    recState = `error:${err.message}`; changed();
  });
});
/** Durée, début et présence de son d'un fichier (lu dans ce qu'affiche ffmpeg). */
async function probe(f) {
  const bin = await FFMPEG();
  const out = await new Promise((ok) => {
    let err = ''; const p = spawn(bin, ['-hide_banner', '-analyzeduration', '3000000', '-probesize', '5000000', '-i', f], { windowsHide: true });
    const timer = setTimeout(() => p.kill(), 12000);
    p.stderr.on('data', d => { err = (err + d).slice(-32768); });
    p.on('close', () => { clearTimeout(timer); ok(err); }); p.on('error', () => { clearTimeout(timer); ok(''); });
  });
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(out); const st0 = /start: ([\d.-]+)/.exec(out);
  return { dur: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0, start: st0 ? Number(st0[1]) : 0, audio: /Stream #.*Audio:/.test(out), h264: /Video: h264\b/.test(out) };
}
let savingClip = null;
const saveClip = (game) => {
  if (!savingClip) savingClip = mediaJobs.run(() => saveClipWork(game)).catch(err => { notify('Clip non enregistré', err.message); return { ok: false, error: err.message }; }).finally(() => { savingClip = null; });
  return savingClip;
};
async function saveClipWork(game) {
  if (!recWin || recState !== 'on') {
    if (!st.replay) { st.replay = true; saveSt(); }
    if (st.onlyGame && !inGame() && !game) return notify('Aucun jeu en cours', 'Le replay démarre tout seul quand un jeu est en plein écran (réglable dans les réglages).');
    if (recWin) await setReplay(false, true);
    await setReplay(true);
    const message = `Replay en démarrage : attends quelques secondes puis rappuie sur ${st.hotClip}.`;
    notify('Replay activé', message);
    return { ok: false, error: message };
  }
  const buffer = replayBuffer, audioWanted = st.audio, micWanted = st.mic, micVolume = st.micVol;
  const label = safeName(game ?? (inGame() ? fg.game : 'Bureau')) || 'Clip';
  const dir = path.join(ROOT(), label);
  const tmp = path.join(dir, `.${randomUUID()}.webm`), micTmp = `${tmp}.micro.webm`, gameTmp = `${tmp}.game.webm`, encoded = `${tmp}.mp4`;
  const native = captureBackend === 'native';
  try {
    if (!buffer) throw Error('Le replay n’est pas encore prêt.');
    await mkdir(dir, { recursive: true });
    const snap = await buffer.snapshot(tmp, micWanted ? micTmp : null, native && audioWanted ? gameTmp : null);
    const source = await probe(tmp);
    if (audioWanted && !(native ? snap.game : source.audio)) throw Error('Le son du PC manque dans l’enregistrement. Relance le replay et vérifie la sortie audio Windows.');
    if (micWanted && !snap.mic) throw Error('Le micro n’a pas encore fourni de son. Vérifie son autorisation puis relance le replay.');
    if (native) {
      const audio = [];
      for (const [file, kind, volume] of [[snap.game && gameTmp, 'game', 1], [snap.mic && micTmp, 'mic', Math.max(0, Math.min(2, (micVolume ?? 100)/100))]]) if (file) {
        const p = await probe(file); if (!p.audio) throw Error('Piste audio native illisible');
        audio.push({ file, kind, delta: p.start - source.start + buffer.offsets[kind]/1000, volume });
      }
      // Les segments du replay peuvent commencer après zéro : conserver seulement leur durée utile.
      if (!(snap.duration > 0)) throw Error('Durée native indisponible');
      await runFfmpeg(nativeMixArgs(tmp, audio, encoded, snap.duration));
    }
    else if (snap.mic) await withMic(tmp, micTmp, encoded, micVolume);
    else if (source.h264) await toMp4(tmp, encoded, { fixup: true });
    else await clean(tmp, encoded, { fixup: true });
    const result = await probe(encoded);
    if (!result.dur || ((audioWanted || micWanted) && !result.audio)) throw Error('Le clip produit est incomplet : il n’a pas été ajouté à la galerie.');
    const out = path.join(dir, clipName(label, 'mp4').replace('.mp4', `-${randomUUID().slice(0, 6)}.mp4`));
    await rename(encoded, out);
    notify('🎬 Clip enregistré', `${label} · ouvre History Clips pour le couper ou l’envoyer.`);
    changed(); await saveSt(); void prune().catch(() => {});
    return { ok: true };
  } catch (err) { notify('Clip non enregistré', err.message); return { ok: false, error: err.message }; }
  finally { await Promise.all([tmp, micTmp, gameTmp, encoded].map(f => rm(f, { force: true }).catch(() => {}))); }
}
/** Clip avec micro : piste 1 = jeu + micro (volume réglable), piste 2 = micro seul (pour le montage). */
async function withMic(video, mic, out, micVolume) {
  const [pv, pm] = await Promise.all([probe(video), probe(mic)]);
  if (!pm.audio) throw Error('La piste micro est illisible. Relance le replay avant de réessayer.');
  const opts = { videoAudio: pv.audio, delta: pm.start - pv.start, volume: Math.max(0, Math.min(2, (micVolume ?? 100) / 100)) };
  if (pv.h264) {
    try { await runFfmpeg(micMixArgs(video, mic, out, { ...opts, copyVideo: true })); return; } catch { /* Repli si la source ne se remuxe pas. */ }
  }
  const enc = await bestEncoder();
  try { await runFfmpeg(micMixArgs(video, mic, out, { ...opts, enc })); }
  catch { await runFfmpeg(micMixArgs(video, mic, out, opts)); }
}
const FFMPEG = async () => unpacked((await import('ffmpeg-static')).default);
const runFfmpeg = async (args) => { const bin = await FFMPEG(); return new Promise((resolve, reject) => { const p = spawn(bin, args, { windowsHide: true, stdio: 'ignore' }); try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* pas grave */ } p.on('error', reject); p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)))); }); };
/** WebM du navigateur → MP4 (durée connue, lecture partout) ; vidéo copiée si possible, sinon réencodée. */
async function toMp4(src, out, opts = {}) {
  try { await runFfmpeg(ffmpegArgs(src, out, opts)); } catch { await clean(src, out, opts); }
}
// Encodeur vidéo : on teste une fois ceux de la carte graphique (rapides, n'enlèvent pas de FPS), sinon le processeur
let encoder = null;
async function bestEncoder() {
  if (encoder) return encoder;
  for (const enc of ['h264_nvenc', 'h264_qsv', 'h264_amf']) {
    const ok = await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=black:s=320x240:d=0.3', ...encArgs(enc), '-f', 'null', '-']).then(() => true, () => false);
    if (ok) { encoder = enc; return enc; }
  }
  encoder = 'libx264'; return encoder;
}
/** MP4 réencodé proprement (lisible partout, horodatage net) : carte graphique d'abord, processeur en secours. */
async function clean(src, out, opts = {}) {
  const enc = await bestEncoder();
  try { await runFfmpeg(ffmpegArgs(src, out, { ...opts, reencode: true, enc })); } catch (err) {
    if (enc === 'libx264') throw err;
    await runFfmpeg(ffmpegArgs(src, out, { ...opts, reencode: true, enc: 'libx264' }));
  }
}
// Réparer sur une copie : l’original est conservé.
mediaHandle('clips:repair', async (_e, t) => {
  const f = fileOf(t); if (!f || /\.png$/i.test(f)) return { ok: false };
  const tmp = path.join(path.dirname(f), `.${randomUUID()}.mp4`);
  try {
    await clean(f, tmp, { fixup: true });
    if (!(await probe(tmp)).dur) throw Error('La vidéo réparée est vide.');
    const dest = f.replace(/\.(webm|mp4)$/i, ` (réparé ${randomUUID().slice(0,6)}).mp4`);
    await rename(tmp, dest); changed();
    return { ok: true, token: tokenOf(dest) };
  } catch (err) { return { ok: false, error: `Réparation impossible (${err.message}). L’original est conservé.` }; }
  finally { await rm(tmp, { force: true }).catch(() => {}); }
});
async function screenshot() {
  const d = screen.getPrimaryDisplay();
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  if (!src) return;
  const game = safeName(inGame() ? fg.game : 'Bureau') || 'Capture';
  const dir = path.join(ROOT(), game);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, clipName(game, 'png')), src.thumbnail.toPNG());
  notify('📸 Capture enregistrée', game);
  changed();
}

// ---------- Raccourcis ----------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const bad = [];
  for (const [key, fn] of [['hotClip', () => saveClip()], ['hotShot', () => screenshot().catch(() => {})]]) { try { if (!globalShortcut.register(st[key], fn)) bad.push(key); } catch { bad.push(key); } }
  return bad;
}

// ---------- Galerie ----------
const tokens = new Map(); // jeton -> fichier (seuls les fichiers listés peuvent être lus)
const tokenOf = (f) => { const t = createHash('sha1').update(f).digest('hex').slice(0, 24); tokens.set(t, f); return t; };
async function listFiles() {
  const out = [];
  for (const d of await readdir(ROOT(), { withFileTypes: true }).catch(() => [])) {
    if (!d.isDirectory() || d.name.startsWith('.')) continue;
    for (const f of await readdir(path.join(ROOT(), d.name)).catch(() => [])) {
      if (!isMedia(f) || f.startsWith('.')) continue;
      const file = path.join(ROOT(), d.name, f);
      const s = await stat(file).catch(() => null);
      if (s) out.push({ file, dir: d.name, f, s });
    }
  }
  return out;
}
ipcMain.handle('clips:list', async () => (await listFiles()).map(({ file, dir, f, s }) => {
  const t = tokenOf(file);
  return { token: t, game: dir, name: st.names[file] ?? f.replace(/\.(mp4|webm|png)$/i, ''), file: f, at: s.mtimeMs, size: s.size, image: /\.png$/i.test(f), fav: st.favs.includes(file), url: `clip://f/${t}${path.extname(f)}`, thumb: /\.png$/i.test(f) ? null : `clip://t/${t}.jpg?v=${Math.round(s.mtimeMs)}` };
}).sort((a, b) => b.at - a.at));
// Espace maximum : les plus vieux clips (hors favoris) partent à la corbeille
async function prune() {
  if (!st.maxGB) return;
  const all = (await listFiles()).sort((a, b) => a.s.mtimeMs - b.s.mtimeMs);
  let total = all.reduce((t, x) => t + x.s.size, 0);
  for (const x of all) {
    if (total <= st.maxGB * 1e9) break;
    if (st.favs.includes(x.file)) continue;
    await shell.trashItem(x.file).catch(() => {}); total -= x.s.size;
  }
  changed();
}
const fileOf = (t) => tokens.get(String(t));
// Miniature d'un clip : faite une seule fois (petit JPG dans .miniatures), une à la fois pour ne pas charger le processeur
const thumbJobs = new Map(); let thumbChain = Promise.resolve();
function thumbOf(f) {
  if (mediaJobs.closing || clipLocks.has(tokenOf(f))) return Promise.resolve(null);
  const jpg = path.join(ROOT(), '.miniatures', `${createHash('sha1').update(f).digest('hex').slice(0, 20)}.jpg`);
  if (!thumbJobs.has(jpg)) {
    const thumbChainForJob = thumbChain;
    const job = mediaJobs.run(() => thumbChainForJob.then(async () => {
      const [a, b] = await Promise.all([stat(jpg).catch(() => null), stat(f).catch(() => null)]);
      if (a && b && a.mtimeMs >= b.mtimeMs) return jpg;
      await mkdir(path.dirname(jpg), { recursive: true });
      await runFfmpeg(['-y', '-ss', '1', '-t', '8', '-i', f, '-frames:v', '1', '-vf', 'thumbnail=240,scale=480:-2', '-q:v', '5', jpg]) /* meilleure image choisie automatiquement (la plus représentative, pas floue ni noire) */.catch(() => runFfmpeg(['-y', '-i', f, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', jpg]));
      return jpg;
    })).catch(() => null).finally(() => setTimeout(() => thumbJobs.delete(jpg), 60_000));
    thumbChain = job; thumbJobs.set(jpg, job);
  }
  return thumbJobs.get(jpg);
}
ipcMain.handle('clips:open', (_e, t, how) => { const f = fileOf(t); if (!f) return false; if (how === 'folder') shell.showItemInFolder(f); else shell.openPath(f); return true; });
ipcMain.handle('clips:root', () => { mkdir(ROOT(), { recursive: true }).then(() => shell.openPath(ROOT())).catch(() => {}); return true; });
ipcMain.handle('clips:copy', async (_e, t) => { const f = fileOf(t); if (!f || !/\.png$/i.test(f)) return false; clipboard.writeImage(nativeImage.createFromPath(f)); return true; });
ipcMain.handle('clips:fav', (_e, t) => { const f = fileOf(t); if (!f) return false; st.favs = st.favs.includes(f) ? st.favs.filter((x) => x !== f) : [...st.favs, f]; saveSt(); return st.favs.includes(f); });
ipcMain.handle('clips:rename', (_e, t, name) => { const f = fileOf(t); if (!f) return false; const n = String(name ?? '').trim().slice(0, 80); if (n) st.names[f] = n; else delete st.names[f]; saveSt(); return true; });
mediaHandle('clips:delete', async (_e, t) => {
  const f = fileOf(t);
  if (!f) return { ok: false, error: 'Clip introuvable. Actualise la galerie.' };
  await thumbChain.catch(() => {});
  try { await shell.trashItem(f); }
  catch { return { ok: false, error: 'Impossible de déplacer ce clip dans la corbeille. Ferme les lecteurs externes puis réessaie.' }; }
  tokens.delete(String(t)); st.favs = st.favs.filter(x => x !== f); delete st.names[f];
  await saveSt(); changed();
  return { ok: true };
});
// Découpe : nouveau fichier « (coupé) » réencodé en bonne qualité, l'original est gardé
// Découpe réencodée en bonne qualité : en nouveau clip « (coupé) », ou à la place de l'original (qui part à la corbeille)
mediaHandle('clips:trim', async (_e, t, start, end, mode) => {
  const f = fileOf(t);
  if (!f || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return { ok: false, error: 'Choisis un début avant la fin.' };
  const base = path.basename(f).replace(/\.(mp4|webm)$/i, '');
  const out = path.join(path.dirname(f), `.${randomUUID()}.mp4`);
  const dest = path.join(path.dirname(f), `${base} (coupé ${randomUUID().slice(0, 6)}).mp4`);
  try {
    await clean(f, out, { start, end });
    if (!(await probe(out)).dur) throw Error('La vidéo produite est vide.');
    await rename(out, dest);
    if (mode === 'replace') {
      await thumbChain.catch(() => {});
      // La copie terminée existe avant de déplacer l’original dans la corbeille.
      try { await shell.trashItem(f); }
      catch (err) { changed(); return { ok: false, error: `La copie découpée est conservée, mais l’original n’a pas pu être supprimé (${err.message}).` }; }
      if (st.names[f]) { st.names[dest] = st.names[f]; delete st.names[f]; }
      if (st.favs.includes(f)) st.favs = [...st.favs.filter(x => x !== f), dest];
      tokens.delete(String(t)); await saveSt();
    }
    changed(); return { ok: true, token: tokenOf(dest) };
  } catch (err) { return { ok: false, error: `Découpe impossible (${err.message}).` }; }
  finally { await rm(out, { force: true }).catch(() => {}); }
});
// Montage : plusieurs clips mis bout à bout en un seul (1080p 60 i/s, son gardé ou silence si le clip n'en a pas)
mediaHandle('clips:montage', async (_e, list) => {
  const files = (Array.isArray(list) ? list : []).map(fileOf).filter((f) => f && !/\.png$/i.test(f)).slice(0, 20);
  if (files.length < 2) return { ok: false, error: 'Choisis au moins 2 clips.' };
  const info = await Promise.all(files.map(probe));
  const parts = files.map((_, i) => `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=60,format=yuv420p[v${i}];${info[i].audio ? `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]` : `aevalsrc=0|0:d=${info[i].dur || 1}:s=48000[a${i}]`}`);
  const graph = `${parts.join(';')};${files.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${files.length}:v=1:a=1[v][a]`;
  const dir = path.join(ROOT(), 'Montages'); await mkdir(dir, { recursive: true });
  const dest = path.join(dir, clipName('Montage', 'mp4').replace('.mp4', ` ${randomUUID().slice(0, 6)}.mp4`));
  const out = path.join(dir, `.${randomUUID()}.mp4`);
  try { await runFfmpeg(['-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]); await rename(out, dest); changed(); return { ok: true }; }
  catch (err) { return { ok: false, error: `Montage impossible (${err.message}).` }; }
  finally { await rm(out, { force: true }).catch(() => {}); }
});
// Vertical 9:16 (TikTok, Shorts) : « flou » = toute l'image au centre sur un fond flouté, « zoom » = recadré au centre
mediaHandle('clips:vertical', async (_e, t, mode) => {
  const f = fileOf(t); if (!f) return { ok: false };
  const vf = mode === 'zoom' ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1'
    : 'split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1';
  // Un fichier par mode (avant : les deux écrivaient le même « (vertical) », l'un écrasait l'autre)
  const dest = path.join(path.dirname(f), `${path.basename(f).replace(/\.(mp4|webm)$/i, '')} (vertical ${mode === 'zoom' ? 'zoom' : 'flou'} ${randomUUID().slice(0, 6)}).mp4`);
  const out = path.join(path.dirname(f), `.${randomUUID()}.mp4`);
  const run = (enc) => runFfmpeg(['-y', '-fflags', '+genpts+discardcorrupt', '-i', f, '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '0:a?', ...encArgs(enc), '-fps_mode', 'vfr', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  try { await run(await bestEncoder()).catch(() => run('libx264')); await rename(out, dest); changed(); shell.showItemInFolder(dest); return { ok: true }; }
  catch (err) { return { ok: false, error: `Export vertical impossible (${err.message}).` }; }
  finally { await rm(out, { force: true }).catch(() => {}); }
});
// Lien de partage web : le clip (allégé) est mis en ligne 7 jours, lien copié
mediaHandle('clips:link', async (_e, t) => {
  const f = fileOf(t); if (!f) return { ok: false };
  if (!tokenGet()) return { ok: false, error: 'Connecte ton compte History pour créer un lien.' };
  const ext = /\.png$/i.test(f) ? 'png' : 'mp4';
  const q = new URLSearchParams({ type: ext, nom: path.basename(f).slice(0, 80), jeu: path.basename(path.dirname(f)).slice(0, 80) });
  const r = await api(`/api/compte/clip/lien?${q}`, { method: 'POST', raw: await readFile(f) });
  if (!r.url) return { ok: false, error: r.error ?? 'Lien impossible.' };
  clipboard.writeText(r.url);
  return { ok: true, url: r.url };
});
mediaHandle('clips:export', async (_e, t) => {
  const f = fileOf(t);
  if (!f) return { ok: false };
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('desktop'), path.basename(f).replace(/\.webm$/i, '.mp4')), filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }] });
  if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
  if (path.resolve(r.filePath).toLowerCase() === path.resolve(f).toLowerCase()) return { ok: false, error: 'Choisis un autre nom pour conserver le clip original.' };
  try { await toMp4(f, r.filePath); shell.showItemInFolder(r.filePath); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('clips:save', () => saveClip(inGame() ? fg.game : 'Bureau'));

// Images des jeux : bannière Steam (recherche par nom) + icône du .exe
let genericExeIcon;
let steamRoots;
const artPending = new Map();
async function cachedArt(name, exe, remote) {
  const key = createHash('sha256').update(name).digest('hex');
  const dir = path.join(app.getPath('userData'), 'game-art');
  const dest = path.join(dir, `${key}.jpg`);
  const saved = await readFile(dest).catch(() => null);
  if (saved) return `data:image/jpeg;base64,${saved.toString('base64')}`;
  steamRoots ??= (async () => {
    const reg = process.platform === 'win32' ? await promisify(execFile)('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 3000 }).then(r => /SteamPath\s+REG_SZ\s+([^\r\n]+)/i.exec(r.stdout)?.[1]?.trim()).catch(() => null) : null;
    return [reg, path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Steam')].filter(Boolean);
  })();
  const file = await localGameArt(await steamRoots, name, exe);
  let bytes = file ? await readFile(file).catch(() => null) : null;
  if (!bytes && remote) {
    const r = await fetch(remote, { signal: AbortSignal.timeout(8000) });
    if (!r.ok || !r.headers.get('content-type')?.startsWith('image/')) return null;
    const chunks = []; let size = 0;
    for await (const chunk of r.body) { size += chunk.length; if (size > 8 * 1024 * 1024) throw Error('Image trop grande'); chunks.push(chunk); }
    bytes = Buffer.concat(chunks);
  }
  if (!bytes) return null;
  const image = nativeImage.createFromBuffer(bytes); if (image.isEmpty()) return null;
  const size = image.getSize();
  const scale = Math.min(1, 960 / size.width, 540 / size.height);
  const jpg = image.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)), quality: 'good' }).toJPEG(82);
  await mkdir(dir, { recursive: true }); await writeFile(dest, jpg);
  // Maximum 128 fonds conservés ; les plus anciens sont renouvelés à la demande.
  const files = (await readdir(dir)).filter(f => /^[a-f0-9]{64}\.jpg$/.test(f));
  if (files.length > 128) {
    const dated = await Promise.all(files.map(async f => ({ f, at: (await stat(path.join(dir, f))).mtimeMs })));
    for (const old of dated.sort((a,b) => a.at-b.at).slice(0, files.length-128)) await rm(path.join(dir, old.f), { force: true });
  }
  return `data:image/jpeg;base64,${jpg.toString('base64')}`;
}
ipcMain.handle('games:art', async (_e, names) => {
  const out = {};
  for (const name of (Array.isArray(names) ? names : []).slice(0, 40).map(String)) {
    if (!artTerm(name) || /roblox/i.test(name)) { out[name] = {}; continue; }
    let a = st.art2[name];
    if (!artPending.has(name)) artPending.set(name, cachedArt(name, st.exes[name], null).catch(() => null));
    let background = await artPending.get(name);
    if (!background && (!a || Date.now() - (a.at ?? 0) > (a.img ? 30 : 7) * 86_400_000)) {
      a = { at: Date.now() };
      try {
        const r = await (await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(artTerm(name))}&l=french&cc=FR`, { signal: AbortSignal.timeout(8000) })).json();
        // Seulement si Steam trouve vraiment CE jeu (sinon « Bureau » ou « Chrome » donnaient un jeu au hasard)
        const id = artTerm(name) ? r?.items?.find((x) => artMatch(artTerm(name), x.name))?.id : null;
        const classic = (f) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/${f}`;
        if (id) Object.assign(a, { img: classic('header.jpg'), logo: classic('logo.png'), hero: classic('library_hero.jpg') });
        // Adresses exactes des images (les jeux récents n'ont plus les anciennes), comme le launcher
        const input = { ids: [{ appid: Number(id) }], context: { language: 'french', country_code: 'FR' }, data_request: { include_assets: true } };
        const as = id && (await (await fetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`, { signal: AbortSignal.timeout(8000) })).json())?.response?.store_items?.[0]?.assets;
        if (as?.asset_url_format) {
          const u = (f) => (f ? `https://shared.akamai.steamstatic.com/store_item_assets/${as.asset_url_format.replace('${FILENAME}', f)}` : null);
          const logoKey = Object.keys(as).find((k) => /logo/i.test(k) && typeof as[k] === 'string');
          Object.assign(a, { img: u(as.header ?? as.main_capsule) ?? a.img, hero: u(as.library_hero ?? as.library_hero_2x) ?? a.hero, logo: logoKey ? u(as[logoKey]) : a.logo });
        }
      } catch { /* hors ligne */ }
      st.art2[name] = a; saveSt();
    }
    let icon = null;
    // Une ancienne installation peut laisser un chemin périmé : Windows renvoie alors son icône générique.
    if (st.exes[name] && (await stat(st.exes[name]).catch(() => null))?.isFile()) {
      genericExeIcon ??= app.getFileIcon(path.join(app.getPath('temp'), 'history-missing-icon.exe'), { size: 'large' }).then(i => i.toDataURL()).catch(() => null);
      icon = await app.getFileIcon(st.exes[name], { size: 'large' }).then(i => i.isEmpty() ? null : i.toDataURL()).catch(() => null);
      if (icon === await genericExeIcon) icon = null;
    }
    if (!background && a?.img) {
      const remoteKey = `${name}:remote`;
      if (!artPending.has(remoteKey)) artPending.set(remoteKey, cachedArt(name, st.exes[name], a.img).catch(() => null));
      background = await artPending.get(remoteKey);
    }
    out[name] = { img: background, hero: background, icon };
    if (artPending.size > 160) artPending.delete(artPending.keys().next().value);
  }
  return out;
});

// ---------- Compte History (le même que le launcher) ----------
async function api(p, { method = 'GET', body = null, raw = null, token = tokenGet() } = {}) {
  try {
    const res = await fetch(`${API}${p}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(raw ? { 'Content-Type': 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(raw ? 300_000 : 20_000) });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  } catch { return { status: 0, error: 'Serveur injoignable, vérifie ta connexion.' }; }
}
const device = () => { st.deviceId ??= randomUUID(); return st.deviceId; };
function loggedIn(r) {
  if (!r.token) return { ok: false, error: r.error ?? 'Connexion impossible.' };
  st.compte = r.compte ?? null; st.skip = false; tokenSet(r.token); send('account:changed');
  return { ok: true, compte: st.compte };
}
// Avis sur l'appli (note, commentaire, capture facultative) : affichés dans le bandeau des avis du site
ipcMain.handle('support:list', () => tokenGet() ? api('/api/compte/support') : { error: 'Connecte-toi à ton compte History dans Paramètres → Compte.' });
ipcMain.handle('support:send', (_e, body) => {
  if (!tokenGet()) return { error: 'Connecte-toi à ton compte History dans Paramètres → Compte.' };
  if (JSON.stringify(body ?? {}).length > 1900000) return { error: 'Capture trop volumineuse.' };
  return api('/api/compte/support', { method: 'POST', body: { ...body, app: 'clips' } });
});
ipcMain.handle('review:send', async (_e, stars, comment, img) => {
  if (!tokenGet()) return { error: 'Connecte-toi à ton compte History (Paramètres › Compte) pour donner ton avis.' };
  const pic = /^data:image\/(png|jpeg|webp);base64,/.test(String(img ?? '')) && String(img).length < 1_900_000 ? img : null;
  return api('/api/avis?app=clips', { method: 'POST', body: { stars: Number(stars), comment: String(comment ?? '').slice(0, 500), img: pic } });
});
ipcMain.handle('account:get', async () => {
  if (!tokenGet()) return { compte: null, skipped: Boolean(st.skip) };
  const r = await api('/api/compte/moi');
  if (r.status === 401) { tokenSet(null); return { compte: null }; }
  if (r.compte) { st.compte = r.compte; saveSt(); }
  return { compte: r.compte ?? st.compte ?? null, offline: r.status === 0 };
});
for (const kind of ['inscription', 'connexion']) {
  ipcMain.handle(`account:${kind}`, async (_e, b) => {
    const r = await api(`/api/compte/${kind}`, { method: 'POST', token: null, body: { pseudo: String(b?.pseudo ?? '').slice(0, 40), email: String(b?.email ?? '').slice(0, 254), motDePasse: String(b?.motDePasse ?? '').slice(0, 128), appareil: device() } });
    if (r.need2fa) return { ok: false, need2fa: true, ticket: r.ticket };
    return loggedIn(r);
  });
}
ipcMain.handle('account:2fa', async (_e, ticket, code) => loggedIn(await api('/api/compte/connexion/2fa', { method: 'POST', token: null, body: { ticket: String(ticket ?? '').slice(0, 64), code: String(code ?? '').replace(/[^\w-]/g, '').slice(0, 20) } })));
ipcMain.handle('account:forgot', (_e, email) => api('/api/compte/mdp/oubli', { method: 'POST', token: null, body: { email: String(email ?? '').slice(0, 254) } }));
ipcMain.handle('account:logout', () => { tokenSet(null); st.compte = null; saveSt(); send('account:changed'); return true; });
ipcMain.handle('account:skip', () => { st.skip = true; saveSt(); return true; });
ipcMain.handle('account:friends', async () => ((await api('/api/compte/amis')).amis ?? []).map((a) => ({ id: a.id, pseudo: a.pseudo })));
// Connexion par code (autre PC) ou en un clic avec History Launcher (il valide le code tout seul)
let pairTicket = null;
ipcMain.handle('account:pairStart', async () => { const r = await api('/api/compte/lien/demande', { method: 'POST', token: null, body: { appareil: device(), nom: 'History Clips' } }); pairTicket = r.ticket ?? null; return r; });
ipcMain.handle('account:pairPoll', async () => {
  if (!pairTicket) return { error: 'Aucune demande en cours.' };
  const r = await api(`/api/compte/lien/attente?ticket=${encodeURIComponent(pairTicket)}`, { token: null });
  if (r.token) { pairTicket = null; return loggedIn(r); }
  return r;
});
// Connexion automatique avec History Launcher : on demande un code, on le note dans un fichier local
// (preuve pour le launcher que c'est bien History Clips sur ce PC, un site ne peut pas l'écrire), puis le launcher le valide seul.
const LINK_FILE = () => path.join(app.getPath('userData'), 'lien-launcher.json');
let linking = null;
async function autoLink() {
  if (tokenGet()) return { ok: true, already: true };
  if (!app.getApplicationNameForProtocol('history://')) return { ok: false, noLauncher: true };
  if (linking) return linking;
  linking = (async () => {
    const r = await api('/api/compte/lien/demande', { method: 'POST', token: null, body: { appareil: device(), nom: 'History Clips' } });
    if (!r.code) return { ok: false, error: r.error ?? 'Serveur injoignable.' };
    await writeFile(LINK_FILE(), JSON.stringify({ code: r.code, at: Date.now() }));
    await shell.openExternal(`history://clips/${r.code}`);
    for (let i = 0; i < 40 && !tokenGet(); i++) {
      await new Promise((ok) => setTimeout(ok, 3000));
      const p = await api(`/api/compte/lien/attente?ticket=${encodeURIComponent(r.ticket)}`, { token: null });
      if (p.token) { loggedIn(p); notify('🔗 Connecté avec History Launcher', `Compte ${p.compte?.pseudo ?? 'History'} relié à History Clips.`); break; }
      if (p.status === 410) break;
    }
    await rm(LINK_FILE(), { force: true }).catch(() => {});
    return { ok: Boolean(tokenGet()), code: r.code };
  })().finally(() => { linking = null; });
  return linking;
}
ipcMain.handle('account:launcher', () => autoLink());
ipcMain.handle('account:servers', async () => (await api('/api/compte/discord/serveurs')).serveurs ?? []);
mediaHandle('clips:discord', async (_e, t, to, guild) => {
  const f = fileOf(t);
  if (!f) return { ok: false };
  if (!tokenGet()) return { ok: false, error: 'Connecte ton compte History pour envoyer sur Discord.' };
  let file = f; let tmp = null;
  if (/\.webm$/i.test(f)) { tmp = path.join(os.tmpdir(), `hc-${Date.now()}.mp4`); await toMp4(f, tmp).catch(() => {}); file = tmp; }
  const s = await stat(file).catch(() => null);
  if (!s || s.size > 60 * 1024 * 1024) return { ok: false, error: 'Clip trop gros (60 Mo maximum) : coupe-le d’abord.' };
  const ext = path.extname(file).slice(1).toLowerCase();
  const q = new URLSearchParams({ type: ext, jeu: path.basename(path.dirname(f)).slice(0, 80), duree: String(st.seconds), source: 'clips', ...(to ? { a: String(to) } : {}), ...(/^\d{15,25}$/.test(String(guild ?? '')) ? { serveur: String(guild) } : {}) });
  const r = await api(`/api/compte/discord/clip?${q}`, { method: 'POST', raw: await readFile(file) });
  if (tmp) rm(tmp, { force: true }).catch(() => {});
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Envoi impossible.' };
});

// ---------- Réglages ----------
ipcMain.handle('settings:get', () => ({ ...st, noAudio: Boolean(st.noAudio), noMic: Boolean(st.noMic), token: undefined, art: undefined, art2: undefined, exes: undefined, names: undefined, favs: undefined, rec: recState, captureBackend, inGame: inGame() ? fg.game : null, dir: ROOT(), version: app.getVersion() }));
ipcMain.handle('settings:set', (_e, p) => {
  let replayChanged = false; let restart = false;
  if ('replay' in p) { st.replay = Boolean(p.replay); replayChanged = true; }
  if ([15, 30, 60, 120].includes(Number(p.seconds))) { st.seconds = Number(p.seconds); restart = true; }
  if ([720, 1080, 1440].includes(Number(p.height))) { st.height = Number(p.height); restart = true; }
  if ([30, 60].includes(Number(p.fps))) { st.fps = Number(p.fps); restart = true; }
  if (['screen', 'game'].includes(p.source)) { st.source = p.source; restart = true; }
  if ([0, 10, 20, 50, 100].includes(Number(p.maxGB))) { st.maxGB = Number(p.maxGB); prune().catch(() => {}); }
  if (['jaune', 'bleu', 'rouge', 'violet', 'vert', 'rose'].includes(p.theme)) st.theme = p.theme;
  for (const k of ['audio', 'mic', 'onlyGame', 'gamePriority', 'sound']) if (k in p) { st[k] = Boolean(p[k]); if (k !== 'sound') restart = true; }
  if ('micVol' in p) st.micVol = Math.max(0, Math.min(200, Math.round(Number(p.micVol) || 0)));
  if ('autostart' in p) { st.autostart = Boolean(p.autostart); if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: st.autostart, args: ['--demarrage'] }); }
  for (const k of ['hotClip', 'hotShot']) {
    if (!(k in p)) continue;
    if (!validAccel(p[k])) return { ok: false, error: 'Combinaison non valable (une lettre seule bloquerait ton clavier : ajoute Ctrl, Alt ou Maj).' };
    const old = st[k]; st[k] = p[k];
    if (registerHotkeys().includes(k)) { st[k] = old; registerHotkeys(); return { ok: false, error: 'Cette touche est déjà prise par une autre appli.' }; }
  }
  saveSt();
  if (replayChanged) setReplay(st.replay).catch(() => {}); else if (restart) restartReplay();
  return { ok: true };
});
ipcMain.handle('settings:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  st.dir = r.filePaths[0]; saveSt(); return st.dir;
});
ipcMain.handle('app:site', () => shell.openExternal(SITE));
// Bouton Discord : invitation vers le serveur History Clips (créée par le bot)
ipcMain.handle('app:discord', async () => { const r = await api('/api/discord/invite?app=clips', { token: null }); await shell.openExternal(r.url ?? SITE); return Boolean(r.url); });
// Lien bleu History Launcher : ouvre le launcher s'il est installé, sinon sa page de téléchargement
ipcMain.handle('app:launcher', async () => { const has = Boolean(app.getApplicationNameForProtocol('history://')); await shell.openExternal(has ? 'history://ouvrir' : 'https://zyko144.github.io/vercel-ia-/'); return has; });

// ---------- Mises à jour (comme le launcher : « Mettre à jour maintenant ? », sinon installée à la fermeture) ----------
const updater = updaterMod.autoUpdater;
const updates = createUpdateController(updater, {
  changed: (state) => {
    send('update:state', state);
    if (state.state === 'error' && mediaJobs.closing) {
      mediaJobs.reopen(); app.quitting = false; startFgWatch();
      if (st.replay) void setReplay(true).catch(() => {});
    }
  },
  prepare: async () => {
    await mediaJobs.drain();
    clearTimeout(restarting); clearTimeout(noGameTimer);
    await setReplay(false, true);
    if (fgProc) {
      const proc = fgProc;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Le veilleur de jeu ne se ferme pas. Ferme Clips puis relance la mise à jour.')), 5000);
        proc.once('close', () => { clearTimeout(timer); resolve(); });
        proc.kill();
      });
    }
    await new Promise(resolve => setTimeout(resolve, 600));
    await saveSt();
  },
  available: (i) => {
    if ((!win || win.isDestroyed() || !win.isVisible()) && Notification.isSupported()) {
      const n = new Notification({ title: `History Clips ${i.version} est disponible`, body: 'Clique pour télécharger et installer la mise à jour.', icon: ICON });
      n.on('click', () => { showWindow(); setTimeout(() => send('update:state', updates.get()), 1500); }); n.show();
    }
    setTimeout(() => { if (updates.get().state === 'available') void updates.download(); }, 10 * 60_000);
  },
});
function startUpdater() {
  if (!app.isPackaged) return;
  updater.logger = { info: () => {}, warn: () => {}, debug: () => {}, error: (e) => { st.updError = String(e?.message ?? e).slice(0, 200); } };
  setTimeout(() => updates.check(), 8000); setInterval(() => updates.check(), 30 * 60_000);
}
ipcMain.handle('update:get', () => ({ ...updates.get(), current: app.getVersion(), packaged: app.isPackaged }));
ipcMain.handle('update:check', () => { if (!app.isPackaged) return { dev: true }; void updates.check(); return true; });
ipcMain.handle('update:later', () => { if (!app.isPackaged) return { dev: true }; void updates.download(); return true; });
ipcMain.handle('update:now', () => { if (!app.isPackaged) return { dev: true }; void updates.download(true); return true; });

// ---------- Liens history-clips:// (ouvert par History Launcher) ----------
function handleLink(argv) {
  const url = (argv ?? []).find((a) => /^history-clips:\/\//i.test(String(a)));
  if (!url) return;
  // Ouvert par le launcher pour se connecter : fait en fond, sans montrer la fenêtre si c'est déjà bon
  if (/lier/i.test(url)) { if (!tokenGet()) autoLink().catch(() => {}); return; }
  showWindow();
}

// ---------- Démarrage ----------
app.on('second-instance', (_e, argv) => { showWindow(); handleLink(argv); });
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', (e) => {
  if (app.isPackaged && updates.canInstall() && !['installing', 'error'].includes(updates.get().state)) {
    e.preventDefault(); void updates.install(); return;
  }
  app.quitting = true; fgProc?.kill();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.whenReady().then(async () => {
  try { st = { ...DEFAULTS, ...JSON.parse(await readFile(SET_FILE(), 'utf8')) }; } catch { /* premier lancement */ }
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb((perm === 'media' && wc === recWin?.webContents) || (perm === 'fullscreen' && wc === win?.webContents) || (perm === 'clipboard-sanitized-write' && wc === win?.webContents)));
  // Capture pour l'enregistreur : la source choisie (écran ou fenêtre du jeu), avec le son du PC en « loopback »
  session.defaultSession.setDisplayMediaRequestHandler(async (req, cb) => {
    if (req.frame !== recWin?.webContents.mainFrame) return cb({});
    const all = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } }).catch(() => []);
    const src = all.find((s) => s.id === recSource) ?? all.find((s) => s.id.startsWith('screen:'));
    cb(src ? { video: src, ...(st.audio && process.platform === 'win32' ? { audio: 'loopback' } : {}) } : {});
  });
  protocol.handle('clip', async (req) => {
    const u = new URL(req.url);
    const f = fileOf(u.pathname.replace(/^\//, '').replace(/\.\w+$/, ''));
    if (!f) return new Response('introuvable', { status: 404 });
    if (u.hostname === 't') { const jpg = await thumbOf(f); return jpg ? net.fetch(pathToFileURL(jpg).toString()) : new Response('', { status: 404 }); }
    return serveMedia(f, req.headers.get('range'), req.method);
  });
  if (app.isPackaged) { app.setLoginItemSettings({ openAtLogin: st.autostart, args: ['--demarrage'] }); app.setAsDefaultProtocolClient('history-clips'); }
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir History Clips', click: showWindow },
    { label: 'Garder un clip maintenant', click: () => saveClip() },
    { label: 'Mettre le replay en pause / reprendre', click: () => { st.replay = !st.replay; saveSt(); setReplay(st.replay).catch(() => {}); } },
    { type: 'separator' },
    { label: 'Quitter', click: () => { app.quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
  registerHotkeys();
  startFgWatch();
  if (st.replay) setReplay(true).catch(() => {});
  if (!process.argv.includes('--demarrage')) createWindow();
  handleLink(process.argv);
  startUpdater();
  // Pas encore connecté et History Launcher installé : on se relie à son compte tout seul
  setTimeout(() => autoLink().catch(() => {}), 4000);
});
