// History Clips : replay en fond (garde les dernières secondes au raccourci), galerie par jeu, découpe, partage Discord.
// Appli légère à part de History Launcher : une fenêtre qui se libère quand elle est cachée, un enregistreur caché.
import { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, Notification, protocol, safeStorage, screen, session, shell, Tray } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import updater from 'electron-updater';
import { clipName, ffmpegArgs, gameLabel, isMedia, safeName, unpacked, validAccel } from './core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(here, 'ui', 'icon.png');
const API = 'https://vercel-ia.onrender.com';
const SITE = 'https://zyko144.github.io/vercel-ia-/clips/';
if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('fr.historyia.clips');
protocol.registerSchemesAsPrivileged([{ scheme: 'clip', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

// ---------- Réglages (fichier JSON dans le dossier de l'appli) ----------
const DEFAULTS = { replay: true, seconds: 30, height: 1080, fps: 60, audio: true, hotClip: 'F8', hotShot: 'F9', autostart: true, favs: [], names: {} };
const SET_FILE = () => path.join(app.getPath('userData'), 'reglages.json');
let st = { ...DEFAULTS };
const saveSt = () => writeFile(SET_FILE(), JSON.stringify(st)).catch(() => {});
const ROOT = () => st.dir || path.join(app.getPath('videos'), 'History Clips');

// Compte History (pour Discord) : jeton chiffré par Windows
const tokenGet = () => { try { return st.token ? safeStorage.decryptString(Buffer.from(st.token, 'base64')) : null; } catch { return null; } };
const tokenSet = (t) => { st.token = t ? safeStorage.encryptString(t).toString('base64') : null; saveSt(); };

let win = null; let tray = null; let recWin = null; let recState = 'off'; let freeTimer = null;
const notify = (title, body) => { if (Notification.isSupported()) new Notification({ title, body, icon: ICON, silent: true }).show(); };
const send = (ch, v) => { if (win && !win.isDestroyed()) win.webContents.send(ch, v); };

// ---------- Fenêtre (libérée 2 min après avoir été cachée : l'appli ne garde que l'enregistreur) ----------
function createWindow() {
  win = new BrowserWindow({ width: 1200, height: 760, minWidth: 900, minHeight: 560, backgroundColor: '#07060b', icon: ICON, autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(here, 'ui', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (!app.quitting) { e.preventDefault(); win.hide(); } });
  win.on('hide', () => { clearTimeout(freeTimer); freeTimer = setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) { win.destroy(); win = null; } }, 120_000); });
}
function showWindow() { clearTimeout(freeTimer); if (!win || win.isDestroyed()) return createWindow(); win.show(); win.focus(); }

// ---------- Replay ----------
async function setReplay(on) {
  if (!on) {
    if (recWin && !recWin.isDestroyed()) { recWin.webContents.send('rec:stop'); setTimeout(() => recWin?.destroy(), 500); }
    recWin = null; recState = 'off'; send('clips:changed'); tray?.setToolTip('History Clips · replay en pause'); return;
  }
  if (recWin && !recWin.isDestroyed()) return;
  recWin = new BrowserWindow({ show: false, width: 200, height: 100, webPreferences: { preload: path.join(here, 'recorder.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  recWin.on('closed', () => { recWin = null; });
  await recWin.loadFile(path.join(here, 'ui', 'recorder.html'));
  const src = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }))[0];
  recWin.webContents.send('rec:start', src?.id ?? '', { seconds: st.seconds, height: st.height, fps: st.fps, audio: st.audio });
  tray?.setToolTip(`History Clips · replay actif (${st.hotClip} pour garder les ${st.seconds} dernières secondes)`);
}
const restartReplay = () => { if (st.replay) setReplay(false).then(() => setTimeout(() => setReplay(true).catch(() => {}), 800)); };
ipcMain.on('rec:state', (e, s) => {
  if (e.sender !== recWin?.webContents) return;
  if (s === 'empty') return notify('Clip pas encore prêt', 'Le replay vient de démarrer : réessaie dans quelques secondes.');
  recState = s; send('clips:changed');
  if (s.startsWith('error')) notify('Replay indisponible', `L’enregistrement de l’écran n’a pas démarré (${s.slice(6, 120)}).`);
});

// Jeu au premier plan (pour ranger le clip dans son dossier)
const FG = "$ErrorActionPreference='SilentlyContinue'; Add-Type -Name W -Namespace U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern int GetWindowThreadProcessId(System.IntPtr h, out int p);'; $p=0; [void][U.W]::GetWindowThreadProcessId([U.W]::GetForegroundWindow(), [ref]$p); $x=Get-Process -Id $p; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $x.MainModule.FileVersionInfo.FileDescription + '|' + $x.MainWindowTitle + '|' + $x.ProcessName";
const foregroundGame = () => new Promise((resolve) => {
  if (process.platform !== 'win32') return resolve('Bureau');
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', FG], { windowsHide: true, timeout: 8000 }, (err, out) => { const [desc, title, proc] = String(out ?? '').trim().split('|'); resolve(gameLabel({ desc, title, proc })); });
});

let pendingGame = null;
async function saveClip(game) {
  if (!recWin || recState !== 'on') {
    if (!st.replay) { st.replay = true; saveSt(); }
    setReplay(true).catch(() => {});
    return notify('Replay activé', `Il enregistre maintenant : rappuie sur ${st.hotClip} pour garder les dernières secondes.`);
  }
  pendingGame = game ?? foregroundGame();
  recWin.webContents.send('rec:save');
}
const FFMPEG = async () => unpacked((await import('ffmpeg-static')).default);
const runFfmpeg = async (args) => new Promise(async (resolve, reject) => { const p = spawn(await FFMPEG(), args, { windowsHide: true, stdio: 'ignore' }); p.on('error', reject); p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}`)))); });
/** WebM du navigateur → MP4 (durée connue, lecture partout) ; vidéo copiée si possible, sinon réencodée. */
async function toMp4(src, out, opts = {}) {
  try { await runFfmpeg(ffmpegArgs(src, out, opts)); } catch { await runFfmpeg(ffmpegArgs(src, out, { ...opts, reencode: true })); }
}
ipcMain.on('rec:clip', async (e, buf) => {
  if (e.sender !== recWin?.webContents) return;
  try {
    const game = safeName(await (pendingGame ?? 'Clip')) || 'Clip';
    const dir = path.join(ROOT(), game);
    await mkdir(dir, { recursive: true });
    const tmp = path.join(dir, `.${Date.now()}.webm`);
    await writeFile(tmp, Buffer.from(buf));
    const out = path.join(dir, clipName(game, 'mp4'));
    await toMp4(tmp, out).catch(async () => { await rename(tmp, out.replace(/\.mp4$/, '.webm')); });
    await rm(tmp, { force: true });
    notify('🎬 Clip enregistré', `${game} · ouvre History Clips pour le couper ou l’envoyer.`);
    send('clips:changed');
  } catch (err) { notify('Clip non enregistré', err.message); }
});

async function screenshot() {
  const d = screen.getPrimaryDisplay();
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const [src] = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  if (!src) return;
  const game = safeName(await foregroundGame()) || 'Capture';
  const dir = path.join(ROOT(), game);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, clipName(game, 'png')), src.thumbnail.toPNG());
  notify('📸 Capture enregistrée', game);
  send('clips:changed');
}

// ---------- Raccourcis ----------
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const bad = [];
  for (const [key, fn] of [['hotClip', saveClip], ['hotShot', () => screenshot().catch(() => {})]]) { try { if (!globalShortcut.register(st[key], fn)) bad.push(key); } catch { bad.push(key); } }
  return bad;
}

// ---------- Galerie ----------
const tokens = new Map(); // jeton -> fichier (seuls les fichiers listés peuvent être lus)
const tokenOf = (f) => { const t = createHash('sha1').update(f).digest('hex').slice(0, 24); tokens.set(t, f); return t; };
ipcMain.handle('clips:list', async () => {
  const out = [];
  for (const d of await readdir(ROOT(), { withFileTypes: true }).catch(() => [])) {
    if (!d.isDirectory()) continue;
    for (const f of await readdir(path.join(ROOT(), d.name)).catch(() => [])) {
      if (!isMedia(f) || f.startsWith('.')) continue;
      const file = path.join(ROOT(), d.name, f);
      const s = await stat(file).catch(() => null);
      if (!s) continue;
      const t = tokenOf(file);
      out.push({ token: t, game: d.name, name: st.names[file] ?? f.replace(/\.(mp4|webm|png)$/i, ''), file: f, at: s.mtimeMs, size: s.size, image: /\.png$/i.test(f), fav: st.favs.includes(file), url: `clip://f/${t}${path.extname(f)}` });
    }
  }
  return out.sort((a, b) => b.at - a.at);
});
const fileOf = (t) => tokens.get(String(t));
ipcMain.handle('clips:open', (_e, t, how) => { const f = fileOf(t); if (!f) return false; if (how === 'folder') shell.showItemInFolder(f); else shell.openPath(f); return true; });
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
ipcMain.handle('clips:trim', async (_e, t, start, end) => {
  const f = fileOf(t);
  if (!f || !(end > start)) return { ok: false, error: 'Choisis un début avant la fin.' };
  const out = path.join(path.dirname(f), `${path.basename(f).replace(/\.(mp4|webm)$/i, '')} (coupé).mp4`);
  try { await runFfmpeg(ffmpegArgs(f, out, { start, end, reencode: true })); return { ok: true }; } catch (err) { return { ok: false, error: `Découpe impossible (${err.message}).` }; }
});
ipcMain.handle('clips:export', async (_e, t) => {
  const f = fileOf(t);
  if (!f) return { ok: false };
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('desktop'), path.basename(f).replace(/\.webm$/i, '.mp4')), filters: [{ name: 'Vidéo MP4', extensions: ['mp4'] }] });
  if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
  try { await toMp4(f, r.filePath); shell.showItemInFolder(r.filePath); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
});

// ---------- Compte History et Discord ----------
async function api(p, { method = 'GET', body = null, raw = null, token = tokenGet() } = {}) {
  try {
    const res = await fetch(`${API}${p}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(raw ? { 'Content-Type': 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined), signal: AbortSignal.timeout(raw ? 300_000 : 20_000) });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  } catch { return { status: 0, error: 'Serveur injoignable, vérifie ta connexion.' }; }
}
ipcMain.handle('account:get', async () => (tokenGet() ? { logged: true, pseudo: st.pseudo ?? null } : { logged: false }));
ipcMain.handle('account:login', async (_e, email, mdp, code, ticket) => {
  const r = ticket ? await api('/api/compte/connexion/2fa', { method: 'POST', body: { ticket, code }, token: null }) : await api('/api/compte/connexion', { method: 'POST', body: { email, motDePasse: mdp, appareil: `History Clips · ${os.hostname()}` }, token: null });
  if (r.need2fa) return { need2fa: true, ticket: r.ticket };
  if (!r.token) return { ok: false, error: r.error ?? 'Connexion impossible.' };
  st.pseudo = r.compte?.pseudo ?? null; tokenSet(r.token);
  return { ok: true, pseudo: st.pseudo };
});
ipcMain.handle('account:logout', () => { tokenSet(null); st.pseudo = null; saveSt(); return true; });
ipcMain.handle('account:friends', async () => ((await api('/api/compte/amis')).amis ?? []).map((a) => ({ id: a.id, pseudo: a.pseudo })));
ipcMain.handle('clips:discord', async (_e, t, to) => {
  const f = fileOf(t);
  if (!f) return { ok: false };
  if (!tokenGet()) return { ok: false, error: 'Connecte ton compte History (Réglages) pour envoyer sur Discord.' };
  let file = f; let tmp = null;
  if (/\.webm$/i.test(f)) { tmp = path.join(os.tmpdir(), `hc-${Date.now()}.mp4`); await toMp4(f, tmp).catch(() => {}); file = tmp; }
  const s = await stat(file).catch(() => null);
  if (!s || s.size > 60 * 1024 * 1024) return { ok: false, error: 'Clip trop gros (60 Mo maximum) : coupe-le d’abord.' };
  const ext = path.extname(file).slice(1).toLowerCase();
  const q = new URLSearchParams({ type: ext, jeu: path.basename(path.dirname(f)).slice(0, 80), duree: String(st.seconds * 2), ...(to ? { a: String(to) } : {}) });
  const r = await api(`/api/compte/discord/clip?${q}`, { method: 'POST', raw: await readFile(file) });
  if (tmp) rm(tmp, { force: true }).catch(() => {});
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Envoi impossible.' };
});

// ---------- Réglages ----------
ipcMain.handle('settings:get', () => ({ ...st, token: undefined, rec: recState, dir: ROOT(), version: app.getVersion() }));
ipcMain.handle('settings:set', (_e, p) => {
  let replayChanged = false; let restart = false;
  if ('replay' in p) { st.replay = Boolean(p.replay); replayChanged = true; }
  if ([15, 30, 60, 120].includes(Number(p.seconds))) { st.seconds = Number(p.seconds); restart = true; }
  if ([720, 1080, 1440].includes(Number(p.height))) { st.height = Number(p.height); restart = true; }
  if ([30, 60].includes(Number(p.fps))) { st.fps = Number(p.fps); restart = true; }
  if ('audio' in p) { st.audio = Boolean(p.audio); restart = true; }
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
ipcMain.handle('clips:save', () => saveClip('Clip'));
ipcMain.handle('app:site', () => shell.openExternal(SITE));

// ---------- Démarrage ----------
app.on('second-instance', () => showWindow());
app.on('window-all-closed', (e) => e.preventDefault?.());
app.on('before-quit', () => { app.quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.whenReady().then(async () => {
  try { st = { ...DEFAULTS, ...JSON.parse(await readFile(SET_FILE(), 'utf8')) }; } catch { /* premier lancement */ }
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb((perm === 'media' && wc === recWin?.webContents) || (perm === 'fullscreen' && wc === win?.webContents)));
  // Capture de l'écran pour l'enregistreur (API moderne d'Electron, avec le son du PC en « loopback »)
  session.defaultSession.setDisplayMediaRequestHandler(async (req, cb) => {
    if (req.frame !== recWin?.webContents.mainFrame) return cb({});
    const [src] = await desktopCapturer.getSources({ types: ['screen'] }).catch(() => []);
    cb(src ? { video: src, ...(st.audio && process.platform === 'win32' ? { audio: 'loopback' } : {}) } : {});
  });
  protocol.handle('clip', (req) => { const f = fileOf(new URL(req.url).pathname.replace(/^\//, '').replace(/\.\w+$/, '')); return f ? net.fetch(pathToFileURL(f).toString(), { headers: req.headers }) : new Response('introuvable', { status: 404 }); });
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: st.autostart, args: ['--demarrage'] });
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
  if (st.replay) setReplay(true).catch(() => {});
  if (!process.argv.includes('--demarrage')) createWindow();
  if (app.isPackaged) { updater.autoUpdater.autoInstallOnAppQuit = true; updater.autoUpdater.checkForUpdatesAndNotify().catch(() => {}); setInterval(() => updater.autoUpdater.checkForUpdates().catch(() => {}), 6 * 3_600_000); }
});
