// History Clips : replay en fond (garde les dernières secondes au raccourci), galerie par jeu, découpe, partage Discord.
// Appli légère à part de History Launcher : même compte, même style. Une fenêtre qui se libère quand elle est cachée,
// un enregistreur caché qui ne tourne que pendant les parties (option) et passe après le jeu (priorité basse).
import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, Notification, protocol, safeStorage, screen, session, shell, Tray } from 'electron';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import updaterMod from 'electron-updater';
import { artMatch, artTerm, clipName, ffmpegArgs, gameLabel, isMedia, parseFg, safeName, unpacked, validAccel } from './core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(here, 'ui', 'icon.png');
const API = 'https://vercel-ia.onrender.com';
const SITE = 'https://zyko144.github.io/vercel-ia-/clips/';
if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('fr.historyia.clips');
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,MediaSessionService,HardwareMediaKeyHandling,Translate');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
protocol.registerSchemesAsPrivileged([{ scheme: 'clip', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

// ---------- Réglages (fichier JSON dans le dossier de l'appli) ----------
const DEFAULTS = { replay: true, seconds: 30, height: 1080, fps: 60, audio: true, hotClip: 'F8', hotShot: 'F9', autostart: true, favs: [], names: {},
  source: 'screen', onlyGame: true, gamePriority: true, maxGB: 0, sound: true, theme: 'jaune', art2: {}, exes: {} };
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
  if (process.platform !== 'win32' || fgProc) return;
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
let recSource = null;
async function pickSource() {
  if (st.source === 'game' && inGame()) {
    const id = `window:${fg.hwnd}:0`;
    const w = (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } }).catch(() => [])).find((s) => s.id === id);
    if (w) return w;
  }
  return (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).catch(() => []))[0] ?? null;
}
async function setReplay(on, keepSetting = false) {
  if (!on) {
    if (recWin && !recWin.isDestroyed()) { recWin.webContents.send('rec:stop'); const w = recWin; setTimeout(() => { if (!w.isDestroyed()) w.destroy(); }, 500); }
    recWin = null; recSource = null; recState = keepSetting && st.replay ? 'wait' : 'off'; changed(); resetRing();
    tray?.setToolTip(recState === 'wait' ? 'History Clips · en attente d’un jeu' : 'History Clips · replay en pause'); return;
  }
  if (st.onlyGame && process.platform === 'win32' && !inGame()) { recState = 'wait'; changed(); tray?.setToolTip('History Clips · en attente d’un jeu'); return; }
  if (recWin && !recWin.isDestroyed()) return;
  const src = await pickSource();
  if (!src) { recState = 'error:aucun écran trouvé'; changed(); return; }
  recSource = src.id;
  recWin = new BrowserWindow({ show: false, width: 200, height: 100, webPreferences: { preload: path.join(here, 'recorder.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  const me = recWin; recWin.on('closed', () => { if (recWin === me) recWin = null; });
  resetRing();
  await recWin.loadFile(path.join(here, 'ui', 'recorder.html'));
  recWin.webContents.send('rec:start', src.id, { seconds: st.seconds, height: st.height, fps: st.fps, audio: st.audio });
  tray?.setToolTip(`History Clips · replay actif (${st.hotClip} pour garder les ${st.seconds} dernières secondes)`);
}
let restarting = null;
const restartReplay = () => { clearTimeout(restarting); if (!st.replay) return; setReplay(false); restarting = setTimeout(() => setReplay(true).catch(() => {}), 800); };
// Priorité au jeu : l'enregistreur et l'encodage vidéo passent après le jeu (moins de FPS perdus)
function lowerPriority() {
  if (!st.gamePriority) return;
  const pids = [recWin?.webContents.getOSProcessId(), ...app.getAppMetrics().filter((m) => m.type === 'GPU').map((m) => m.pid)].filter(Boolean);
  for (const pid of pids) { try { os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* pas grave */ } }
}
ipcMain.on('rec:state', (e, s) => {
  if (e.sender !== recWin?.webContents) return;
  if (s === 'empty') return notify('Clip pas encore prêt', 'Le replay vient de démarrer : réessaie dans quelques secondes.');
  recState = s; changed();
  if (s === 'on') lowerPriority();
  if (s.startsWith('error')) notify('Replay indisponible', `L’enregistrement n’a pas démarré (${s.slice(6, 120)}).`);
});

// ---------- Tampon tournant sur le disque : 1 fichier par seconde de vidéo, les plus vieux sont effacés ----------
const RING = () => path.join(app.getPath('temp'), 'history-clips-replay');
let ring = []; let head = null; let ringGen = 0;
function resetRing() {
  ringGen++; ring = []; head = null;
  rm(RING(), { recursive: true, force: true }).then(() => mkdir(RING(), { recursive: true })).catch(() => {});
}
const CLUSTER = Buffer.from([0x1f, 0x43, 0xb6, 0x75]); // début d'un « cluster » WebM
ipcMain.on('rec:chunk', async (e, ab) => {
  if (e.sender !== recWin?.webContents) return;
  const gen = ringGen; let buf = Buffer.from(ab);
  // Le tout premier morceau contient l'en-tête du fichier : gardé à part pour recoller n'importe quelle fin de replay
  if (!head) { const at = buf.indexOf(CLUSTER); if (at < 0) return; head = buf.subarray(0, at); buf = buf.subarray(at); }
  const file = path.join(RING(), `${Date.now()}.bin`);
  await writeFile(file, buf).catch(() => null);
  if (gen !== ringGen) return rm(file, { force: true }).catch(() => {});
  ring.push({ file, at: Date.now() });
  while (ring.length > st.seconds + 4) rm(ring.shift().file, { force: true }).catch(() => {});
});

async function saveClip(game) {
  if (!recWin || recState !== 'on') {
    if (!st.replay) { st.replay = true; saveSt(); }
    if (st.onlyGame && !inGame() && !game) return notify('Aucun jeu en cours', 'Le replay démarre tout seul quand un jeu est en plein écran (réglable dans les réglages).');
    setReplay(true).catch(() => {});
    return notify('Replay activé', `Il enregistre maintenant : rappuie sur ${st.hotClip} pour garder les dernières secondes.`);
  }
  if (!head || ring.length < 2) return notify('Clip pas encore prêt', 'Le replay vient de démarrer : réessaie dans quelques secondes.');
  const label = safeName(game ?? (inGame() ? fg.game : 'Bureau')) || 'Clip';
  // On attend la seconde en cours, puis on recolle en-tête + dernières secondes (le disque, pas la mémoire)
  await new Promise((ok) => setTimeout(ok, 1100));
  const parts = ring.slice(-(st.seconds + 1));
  try {
    const dir = path.join(ROOT(), label);
    await mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.${Date.now()}.webm`);
    await writeFile(tmp, head);
    for (const p of parts) await appendFile(tmp, await readFile(p.file).catch(() => Buffer.alloc(0)));
    const out = path.join(dir, clipName(label, 'mp4'));
    await toMp4(tmp, out, { fixup: true }).catch(async () => { await rename(tmp, out.replace(/\.mp4$/, '.webm')); });
    await rm(tmp, { force: true });
    notify('🎬 Clip enregistré', `${label} · ouvre History Clips pour le couper ou l’envoyer.`);
    changed(); saveSt(); prune().catch(() => {});
  } catch (err) { notify('Clip non enregistré', err.message); }
}
const FFMPEG = async () => unpacked((await import('ffmpeg-static')).default);
const runFfmpeg = async (args) => { const bin = await FFMPEG(); return new Promise((resolve, reject) => { const p = spawn(bin, args, { windowsHide: true, stdio: 'ignore' }); try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* pas grave */ } p.on('error', reject); p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)))); }); };
/** WebM du navigateur → MP4 (durée connue, lecture partout) ; vidéo copiée si possible, sinon réencodée. */
async function toMp4(src, out, opts = {}) {
  try { await runFfmpeg(ffmpegArgs(src, out, opts)); } catch { await runFfmpeg(ffmpegArgs(src, out, { ...opts, reencode: true })); }
}
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
  const jpg = path.join(ROOT(), '.miniatures', `${createHash('sha1').update(f).digest('hex').slice(0, 20)}.jpg`);
  if (!thumbJobs.has(jpg)) {
    const job = thumbChain.then(async () => {
      const [a, b] = await Promise.all([stat(jpg).catch(() => null), stat(f).catch(() => null)]);
      if (a && b && a.mtimeMs >= b.mtimeMs) return jpg;
      await mkdir(path.dirname(jpg), { recursive: true });
      await runFfmpeg(['-y', '-ss', '1', '-i', f, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', jpg]).catch(() => runFfmpeg(['-y', '-i', f, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', jpg]));
      return jpg;
    }).catch(() => null).finally(() => setTimeout(() => thumbJobs.delete(jpg), 60_000));
    thumbChain = job; thumbJobs.set(jpg, job);
  }
  return thumbJobs.get(jpg);
}
ipcMain.handle('clips:open', (_e, t, how) => { const f = fileOf(t); if (!f) return false; if (how === 'folder') shell.showItemInFolder(f); else shell.openPath(f); return true; });
ipcMain.handle('clips:root', () => { mkdir(ROOT(), { recursive: true }).then(() => shell.openPath(ROOT())).catch(() => {}); return true; });
ipcMain.handle('clips:copy', async (_e, t) => { const f = fileOf(t); if (!f || !/\.png$/i.test(f)) return false; clipboard.writeImage(nativeImage.createFromPath(f)); return true; });
ipcMain.handle('clips:fav', (_e, t) => { const f = fileOf(t); if (!f) return false; st.favs = st.favs.includes(f) ? st.favs.filter((x) => x !== f) : [...st.favs, f]; saveSt(); return st.favs.includes(f); });
ipcMain.handle('clips:rename', (_e, t, name) => { const f = fileOf(t); if (!f) return false; const n = String(name ?? '').trim().slice(0, 80); if (n) st.names[f] = n; else delete st.names[f]; saveSt(); return true; });
ipcMain.handle('clips:delete', async (_e, t) => {
  const f = fileOf(t);
  if (!f) return false;
  const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Supprimer', 'Annuler'], defaultId: 1, cancelId: 1, title: 'Supprimer', message: 'Supprimer ce clip ?', detail: 'Il part dans la corbeille (tu peux encore le récupérer).' });
  if (r.response !== 0) return false;
  await shell.trashItem(f); tokens.delete(String(t)); st.favs = st.favs.filter((x) => x !== f); saveSt();
  return true;
});
// Découpe : nouveau fichier « (coupé) » réencodé en bonne qualité, l'original est gardé
// Découpe réencodée en bonne qualité : en nouveau clip « (coupé) », ou à la place de l'original (qui part à la corbeille)
ipcMain.handle('clips:trim', async (_e, t, start, end, mode) => {
  const f = fileOf(t);
  if (!f || !(end > start)) return { ok: false, error: 'Choisis un début avant la fin.' };
  const base = path.basename(f).replace(/\.(mp4|webm)$/i, '');
  const out = path.join(path.dirname(f), mode === 'replace' ? `.${Date.now()}.mp4` : `${base} (coupé).mp4`);
  try { await runFfmpeg(ffmpegArgs(f, out, { start, end, reencode: true })); } catch (err) { return { ok: false, error: `Découpe impossible (${err.message}).` }; }
  if (mode !== 'replace') return { ok: true };
  const dest = path.join(path.dirname(f), `${base}.mp4`);
  await shell.trashItem(f).catch(() => rm(f, { force: true }));
  await rename(out, dest);
  // Le nom choisi et le favori suivent le clip
  if (st.names[f]) { st.names[dest] = st.names[f]; delete st.names[f]; }
  if (st.favs.includes(f)) st.favs = [...st.favs.filter((x) => x !== f), dest];
  tokens.delete(String(t)); saveSt(); changed();
  return { ok: true, token: tokenOf(dest) };
});
ipcMain.handle('clips:export', async (_e, t) => {
  const f = fileOf(t);
  if (!f) return { ok: false };
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('desktop'), path.basename(f).replace(/\.webm$/i, '.mp4')), filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }] });
  if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
  try { await toMp4(f, r.filePath); shell.showItemInFolder(r.filePath); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('clips:save', () => saveClip(inGame() ? fg.game : 'Bureau'));

// Images des jeux : bannière Steam (recherche par nom) + icône du .exe
ipcMain.handle('games:art', async (_e, names) => {
  const out = {};
  for (const name of (Array.isArray(names) ? names : []).slice(0, 40).map(String)) {
    let a = st.art2[name];
    if (!a || (!a.img && Date.now() - (a.at ?? 0) > 7 * 86_400_000)) {
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
    if (st.exes[name]) icon = await app.getFileIcon(st.exes[name], { size: 'large' }).then((i) => i.toDataURL()).catch(() => null);
    out[name] = { ...a, icon };
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
ipcMain.handle('clips:discord', async (_e, t, to, guild) => {
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
ipcMain.handle('settings:get', () => ({ ...st, token: undefined, art: undefined, art2: undefined, exes: undefined, names: undefined, favs: undefined, rec: recState, inGame: inGame() ? fg.game : null, dir: ROOT(), version: app.getVersion() }));
ipcMain.handle('settings:set', (_e, p) => {
  let replayChanged = false; let restart = false;
  if ('replay' in p) { st.replay = Boolean(p.replay); replayChanged = true; }
  if ([15, 30, 60, 120].includes(Number(p.seconds))) { st.seconds = Number(p.seconds); restart = true; }
  if ([720, 1080, 1440].includes(Number(p.height))) { st.height = Number(p.height); restart = true; }
  if ([30, 60].includes(Number(p.fps))) { st.fps = Number(p.fps); restart = true; }
  if (['screen', 'game'].includes(p.source)) { st.source = p.source; restart = true; }
  if ([0, 10, 20, 50, 100].includes(Number(p.maxGB))) { st.maxGB = Number(p.maxGB); prune().catch(() => {}); }
  if (['jaune', 'bleu', 'rouge', 'violet', 'vert', 'rose'].includes(p.theme)) st.theme = p.theme;
  for (const k of ['audio', 'onlyGame', 'gamePriority', 'sound']) if (k in p) { st[k] = Boolean(p[k]); if (k !== 'sound') restart = true; }
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

// ---------- Mises à jour (comme le launcher : « Mettre à jour maintenant ? », sinon installée à la fermeture) ----------
const updater = updaterMod.autoUpdater;
let upd = { state: 'idle', version: null, percent: 0 };
const updState = (p) => { upd = { ...upd, ...p }; send('update:state', upd); };
function startUpdater() {
  if (!app.isPackaged) return;
  updater.autoDownload = false; updater.autoInstallOnAppQuit = true; updater.logger = null;
  updater.on('update-available', (i) => { updState({ state: 'available', version: i.version }); setTimeout(() => { if (upd.state === 'available') updater.downloadUpdate().catch(() => {}); }, 10 * 60_000); });
  updater.on('update-not-available', () => { if (upd.state === 'checking') updState({ state: 'uptodate' }); });
  updater.on('download-progress', (p) => updState({ state: 'progress', percent: Math.round(p.percent) }));
  updater.on('update-downloaded', (i) => { updState({ state: 'ready', version: i.version }); if (upd.now) setTimeout(() => { app.quitting = true; updater.quitAndInstall(true, true); }, 1200); });
  updater.on('error', (err) => updState({ state: 'error', error: String(err?.message ?? err).slice(0, 160) }));
  const check = () => { if (!['progress', 'ready'].includes(upd.state)) updater.checkForUpdates().catch(() => {}); };
  setTimeout(check, 8000); setInterval(check, 30 * 60_000);
}
ipcMain.handle('update:get', () => ({ ...upd, current: app.getVersion(), packaged: app.isPackaged }));
ipcMain.handle('update:check', () => { if (!app.isPackaged) return { dev: true }; updState({ state: 'checking' }); updater.checkForUpdates().catch((e) => updState({ state: 'error', error: String(e?.message ?? e) })); return true; });
ipcMain.handle('update:now', () => { if (upd.state === 'ready') { app.quitting = true; updater.quitAndInstall(true, true); return true; } updState({ now: true, state: 'progress', percent: 0 }); updater.downloadUpdate().catch(() => {}); return true; });

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
app.on('before-quit', () => { app.quitting = true; fgProc?.kill(); });
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
    return net.fetch(pathToFileURL(f).toString(), { headers: req.headers });
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
