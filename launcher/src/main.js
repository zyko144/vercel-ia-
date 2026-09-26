// History Launcher : toute la bibliothèque du PC (Steam, Epic, autres launchers, applis) dans une seule fenêtre.
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, findExe, merge, scanAll } from './core/library.js';
import { epicActions } from './core/epic.js';
import { steamActions } from './core/steam.js';
import { createStore } from './core/store.js';
import { startTracker } from './core/tracker.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(here, 'ui', 'icon.png');
let win = null;
let tray = null;
let items = [];
let quitting = false;
const store = createStore(app.getPath('userData'));

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1380, height: 860, minWidth: 980, minHeight: 620, frame: false, backgroundColor: '#0b0b0e', show: false,
    icon: ICON, title: 'History Launcher',
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.loadFile(path.join(here, 'ui', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // Bancs d'essai : LAUNCHER_SHOT=fichier.png fait une capture de la fenêtre puis quitte
  if (process.env.LAUNCHER_SHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(process.env.LAUNCHER_SHOT, (await win.webContents.capturePage()).toPNG());
      quitting = true;
      app.quit();
    }, 4000));
  }
  // Sécurité : aucune navigation ni fenêtre vers l'extérieur depuis l'interface
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Fermer la fenêtre la range dans la barre des tâches (le suivi du temps continue)
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('History Launcher');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir', click: showWindow },
    { type: 'separator' },
    { label: 'Quitter', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

function applyAutostart() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: Boolean(store.data.settings.autostart), args: ['--au-demarrage'] });
}

// Icônes des applis (tirées de leur .exe), gardées en mémoire
const icons = new Map();
async function iconOf(item) {
  const file = item.exe || item.icon;
  if (!file || !/\.(exe|ico)$/i.test(file)) return null;
  if (!icons.has(file)) icons.set(file, await app.getFileIcon(file, { size: 'large' }).then((i) => i.toDataURL()).catch(() => null));
  return icons.get(file);
}

// Noms des jeux Steam désinstallés (le fichier local ne garde que leur numéro)
async function fillSteamNames(list) {
  const missing = list.filter((i) => i.source === 'steam' && !i.installed && !store.data.names[i.steamId]).slice(0, 25);
  for (const i of missing) {
    const data = await fetch(`https://store.steampowered.com/api/appdetails?appids=${i.steamId}&filters=basic&l=french`, { signal: AbortSignal.timeout(6000) }).then((r) => r.json()).catch(() => null);
    const name = data?.[i.steamId]?.data?.name;
    store.data.names[i.steamId] = name ?? `Jeu Steam ${i.steamId}`;
  }
  if (missing.length) store.save();
}

async function scan() {
  const raw = await scanAll();
  await fillSteamNames(raw).catch(() => {});
  items = merge(raw, store.data);
  await Promise.all(items.map(async (i) => { if (i.kind !== 'game' || !i.art?.cover) i.iconData = await iconOf(i); }));
  return { items, sources: SOURCES };
}

// Liens autorisés vers d'autres programmes : seulement ceux des launchers et des pages de magasin
const SAFE_LINK = /^(steam:\/\/(rungameid|install|uninstall|validate)\/\d+|com\.epicgames\.launcher:\/\/(apps\/[\w%.-]+\?action=(launch|verify)(&silent=true)?|store\/library)|https:\/\/store\.steampowered\.com\/app\/\d+)$/;
const openLink = (url) => (SAFE_LINK.test(url) ? shell.openExternal(url) : Promise.reject(new Error('lien refusé')));

async function confirm(message, detail) {
  const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Annuler', 'Oui'], defaultId: 0, cancelId: 0, message, detail });
  return r.response === 1;
}

async function doAction(id, action) {
  const item = items.find((i) => i.id === id); // jamais une commande venue de l'interface : seulement nos éléments
  if (!item) throw new Error('élément inconnu');
  if (item.source === 'steam') {
    const links = steamActions(item.steamId);
    if (action === 'uninstall' && !await confirm(`Désinstaller ${item.name} ?`, 'Steam va demander une dernière confirmation.')) return { ok: false };
    if (links[action]) return openLink(links[action]).then(() => ({ ok: true }));
  }
  if (item.source === 'epic') {
    const links = epicActions(item.epicKey);
    if (links[action]) return openLink(links[action]).then(() => ({ ok: true }));
  }
  if (action === 'folder' && item.installDir) return shell.openPath(item.installDir).then(() => ({ ok: true }));
  if (action === 'launch') {
    const exe = item.exe ?? await findExe(item.installDir);
    if (!exe) throw new Error('exécutable introuvable');
    const err = await shell.openPath(exe);
    if (err) throw new Error(err);
    return { ok: true };
  }
  if (action === 'uninstall' && item.uninstallCmd) {
    if (!await confirm(`Désinstaller ${item.name} ?`, 'Le programme de désinstallation va s’ouvrir.')) return { ok: false };
    // La commande vient du registre de Windows (et non de l'interface) : c'est celle que Windows lancerait
    spawn(item.uninstallCmd, { shell: true, detached: true, windowsHide: false, stdio: 'ignore' }).unref();
    return { ok: true };
  }
  throw new Error('action impossible pour cet élément');
}

ipcMain.handle('lib:scan', () => scan());
ipcMain.handle('item:action', (_e, id, action) => doAction(String(id), String(action)).catch((err) => ({ ok: false, error: err.message })));
ipcMain.handle('item:set', (_e, id, patch) => {
  const entry = (store.data.items[String(id)] ??= {});
  if ('favorite' in patch) entry.favorite = Boolean(patch.favorite);
  if ('hidden' in patch) entry.hidden = Boolean(patch.hidden);
  store.save();
  return entry;
});
ipcMain.handle('settings:get', () => store.data.settings);
ipcMain.handle('settings:set', (_e, patch) => {
  if ('autostart' in patch) store.data.settings.autostart = Boolean(patch.autostart);
  store.save();
  applyAutostart();
  return store.data.settings;
});
ipcMain.on('win', (_e, what) => {
  if (what === 'min') win?.minimize();
  else if (what === 'max') win?.isMaximized() ? win.unmaximize() : win?.maximize();
  else if (what === 'close') win?.hide();
});

app.whenReady().then(async () => {
  await store.load();
  applyAutostart();
  createWindow();
  createTray();
  startTracker(() => items, store, (ids) => win?.webContents.send('lib:active', ids));
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', (e) => e.preventDefault());

