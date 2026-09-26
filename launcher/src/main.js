// History Launcher : toute la bibliothèque du PC (Steam, Epic, autres launchers, applis) dans une seule fenêtre.
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, Notification, protocol, safeStorage, screen, shell, Tray } from 'electron';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { LAUNCHER_NAMES, SOURCES, findExe, merge, scanAll } from './core/library.js';
import { aiFindArt, assistant, createAi, geminiKeyFromEnv, recommend } from './core/ai.js';
import { coverOf, mediaKey, nowPlaying } from './core/media.js';
import { activeItems, periodItems, periodStats, runningPaths, statCategory } from './core/tracker.js';
import { BOOST_APPS, HIGH_PERFORMANCE, activeScheme, boostPlan, closeApps, setScheme } from './core/boost.js';
import { heatAlerts, snapshot } from './core/monitor.js';
import { cleanTarget, cleanTargets, measureTargets } from './core/cleanup.js';
import { listSteamAccounts, steamAchievements, steamAppInfo, steamNames, lastSteamUser, steamStoreAssets } from './core/steam.js';
import { listEpicAccounts } from './core/epic.js';
import { readRegValue } from './core/registry.js';
import { steamMatch } from './core/art.js';
import { norm } from './core/sort.js';
import { steamPath } from './core/library.js';
import { epicActions } from './core/epic.js';
import { steamActions } from './core/steam.js';
import { createStore } from './core/store.js';
import { safeGameDir, uninstallFiles } from './core/manage.js';
import { verifyGame } from './core/verify.js';
import { epicFreeGames } from './core/freegames.js';
import { friendLink, newDeals, steamFriends, wishlistDeals } from './core/social.js';
import { directEnv, insideDir, launchPlan } from './core/direct.js';
import { stripWake, understand } from './core/commands.js';
import { speak, startListening } from './core/voice.js';
import { session } from 'electron';
import { enrich } from './core/art.js';
import { startTracker } from './core/tracker.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(here, 'ui', 'icon.png');
let win = null;
let tray = null;
let items = [];
let quitting = false;
const store = createStore(app.getPath('userData'));

// Toute erreur au démarrage est notée dans un journal et affichée (au lieu d'une fermeture silencieuse)
async function fatal(err) {
  const text = `${new Date().toISOString()} ${err?.stack ?? err}\n`;
  try {
    const { appendFile, mkdir } = await import('node:fs/promises');
    await mkdir(app.getPath('userData'), { recursive: true });
    await appendFile(path.join(app.getPath('userData'), 'erreurs.log'), text);
  } catch { /* journal impossible */ }
  console.error('[launcher]', err);
  if (app.isReady()) dialog.showErrorBox('History Launcher : erreur', `${err?.message ?? err}\n\nJournal : ${path.join(app.getPath('userData'), 'erreurs.log')}`);
}
process.on('uncaughtException', (err) => { fatal(err); });
process.on('unhandledRejection', (err) => { fatal(err); });

if (!app.requestSingleInstanceLock()) app.quit();

// Images de la bibliothèque Steam sur le PC, servies par « libimg:// » : seulement les fichiers que le scan a trouvés
// (une liste blanche de jetons), jamais un chemin choisi par l'interface.
protocol.registerSchemesAsPrivileged([{ scheme: 'libimg', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const localFiles = new Map(); // jeton -> chemin
function localUrls(art) {
  if (!art) return {};
  const out = {};
  for (const [k, file] of Object.entries(art)) {
    if (!file) continue;
    const token = createHash('sha1').update(file).digest('hex').slice(0, 24);
    localFiles.set(token, file);
    out[k] = `libimg://img/${token}${/\.png$/i.test(file) ? '.png' : '.jpg'}`;
  }
  return out;
}
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

// Clés d'API (Steam, SteamGridDB) : chiffrées par Windows (safeStorage), jamais renvoyées à l'interface
function secret(name) {
  const box = store.data.secrets?.[name];
  if (!box) return null;
  try { return safeStorage.decryptString(Buffer.from(box, 'base64')); } catch { return null; }
}
function setSecret(name, value) {
  store.data.secrets ??= {};
  const v = String(value ?? '').trim();
  if (!v) delete store.data.secrets[name];
  else if (/^[A-Za-z0-9_-]{16,80}$/.test(v) && safeStorage.isEncryptionAvailable()) store.data.secrets[name] = safeStorage.encryptString(v).toString('base64');
  else throw new Error('clé invalide');
  store.save();
}

// Logos des applis : l'icône du .exe en haute définition (256 px), gardée en mémoire
const icons = new Map();
async function fileIcon(file) {
  if (!file || !/\.(exe|ico)$/i.test(file)) return null;
  if (!icons.has(file)) {
    let img = null;
    if (process.platform === 'win32') img = await nativeImage.createThumbnailFromPath(file, { width: 256, height: 256 }).catch(() => null);
    if (!img || img.isEmpty()) img = await app.getFileIcon(file, { size: 'large' }).catch(() => null);
    icons.set(file, img && !img.isEmpty() ? img.toDataURL() : null);
  }
  return icons.get(file);
}
/** Le logo d'une appli : son .exe, sinon l'icône indiquée par Windows, sinon le programme principal de son dossier. */
const exeFound = new Map();
async function iconOf(item) {
  for (const file of [item.exe, item.icon]) {
    const icon = await fileIcon(file);
    if (icon) return icon;
  }
  if (!item.installDir || !item.installed) return null;
  if (!exeFound.has(item.installDir)) exeFound.set(item.installDir, await findExe(item.installDir, 1).catch(() => null));
  return fileIcon(exeFound.get(item.installDir));
}

// Noms des jeux Steam désinstallés (le fichier local ne garde que leur numéro) : API officielle, par lots de 50.
// Un nom provisoire (« Jeu Steam 123 ») n'est jamais enregistré : il sera redemandé au prochain lancement.
async function fillSteamNames(list) {
  const types = (store.data.steamTypes ??= {});
  const missing = list.filter((i) => i.source === 'steam' && !/\D/.test(i.steamId) && ((!i.name && (!store.data.names[i.steamId] || /^Jeu Steam \d+$/.test(store.data.names[i.steamId]))) || !types[i.steamId]));
  if (!missing.length) return;
  // 1) Le cache de Steam sur le PC : connaît aussi les jeux retirés du magasin, et dit si c'est un jeu ou un outil
  const root = await steamPath();
  const local = root ? await steamAppInfo(root, missing.map((i) => i.steamId)) : {};
  for (const [id, info] of Object.entries(local)) {
    if (!store.data.names[id] || /^Jeu Steam \d+$/.test(store.data.names[id])) store.data.names[id] = info.name;
    if (info.type) types[id] = info.type;
  }
  // 2) Le reste : l'API officielle du magasin
  const rest = missing.filter((i) => !i.name && !store.data.names[i.steamId]);
  const names = rest.length ? await steamNames(rest.map((i) => i.steamId)).catch(() => ({})) : {};
  for (const i of rest) {
    if (names[i.steamId]) store.data.names[i.steamId] = names[i.steamId];
    else delete store.data.names[i.steamId];
  }
  store.save();
}

let raw = [];
// ---------- Comptes : le temps de jeu n'est compté que pour le compte choisi (ou tous, si « temps total ») ----------
let steamAccounts = [];
let epicAccounts = [];
let activeSteam = null;
async function refreshAccounts() {
  const dir = await steamPath();
  steamAccounts = await listSteamAccounts(dir).catch(() => []);
  epicAccounts = await listEpicAccounts().catch(() => []);
  const active = Number(await readRegValue('HKCU\\Software\\Valve\\Steam\\ActiveProcess', 'ActiveUser').catch(() => 0));
  activeSteam = active > 0 ? String(active) : null;
}
const chosenSteam = () => store.data.settings.steamAccount ?? steamAccounts.find((a) => a.recent)?.id ?? steamAccounts[0]?.id ?? null;
function accountFor(item) {
  if (item?.source === 'steam') return activeSteam ?? chosenSteam() ?? 'principal';
  if (item?.source === 'epic') return store.data.settings.epicAccount ?? epicAccounts[0]?.id ?? 'principal';
  return 'principal';
}
const timeOptions = () => ({ total: Boolean(store.data.settings.totalTime), steamAccount: chosenSteam(), accountFor });
let aiCache = { key: null, ai: null };
async function getAi() {
  const key = secret('gemini') ?? await geminiKeyFromEnv(path.join(here, '..'));
  if (key !== aiCache.key) aiCache = { key, ai: await createAi(key) };
  return aiCache.ai;
}
const send = (channel, payload) => win?.webContents.send(channel, payload);
async function remerge() {
  items = merge(raw, store.data, localUrls, timeOptions());
  await Promise.all(items.map(async (i) => { i.iconData = await iconOf(i); }));
  return items;
}

async function scan() {
  await refreshAccounts();
  raw = await scanAll({}, { steamApiKey: secret('steam') });
  await fillSteamNames(raw).catch(() => {});
  await remerge();
  enrichInBackground().catch(() => {});
  return library();
}
/** Bibliothèque envoyée à l'interface, avec le logo officiel de chaque launcher installé. */
function library() {
  const sources = Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => {
    const launcher = items.find((i) => i.kind === 'launcher' && LAUNCHER_NAMES[k]?.test(i.name));
    return [k, { ...v, icon: launcher?.iconData ?? null }];
  }));
  return { items, sources };
}

// En arrière-plan : images des jeux et applis qui n'en ont pas (4 à la fois), puis mise à jour de l'interface
let enriching = false;
let aiBudget = 40; // recherches d'images par l'IA par lancement (coût maîtrisé)
async function enrichInBackground() {
  if (enriching) return;
  enriching = true;
  try {
    store.data.art ??= {};
    // 1. Jeux Steam sans images sur le PC : adresses officielles actuelles, par lots de 50 (une seule demande)
    const fresh = (i) => store.data.art[i.id] && Date.now() - store.data.art[i.id].at < 14 * 86_400_000;
    const steamTodo = raw.filter((i) => i.source === 'steam' && i.steamId && !(i.localArt?.cover && i.localArt?.hero && i.localArt?.logo) && !fresh(i));
    if (steamTodo.length) {
      const assets = await steamStoreAssets(steamTodo.map((i) => i.steamId)).catch(() => ({}));
      for (const i of steamTodo) {
        const a = Object.fromEntries(Object.entries(assets[i.steamId] ?? {}).filter(([, v]) => v));
        if (Object.keys(a).length) store.data.art[i.id] = { at: Date.now(), gridKey: secret('grid') ? 'oui' : null, art: a, steamId: i.steamId, details: store.data.art[i.id]?.details ?? null };
      }
      store.save();
      await remerge();
      send('lib:update', library());
    }
    // 2. Le reste : jeux des autres launchers et applis sans image (magasin Steam, SteamGridDB, puis l'IA)
    const todo = raw.filter((i) => i.source !== 'steam' && !(i.art?.cover || i.art?.hero));
    const gridKey = secret('grid');
    for (let n = 0; n < todo.length; n += 4) {
      await Promise.all(todo.slice(n, n + 4).map(async (i) => {
        const entry = await enrich(i, { cache: store.data.art[i.id], gridKey });
        // Rien sur Steam, Epic ni SteamGridDB : l'IA cherche les images officielles sur internet (une fois par mois)
        if (i.kind === 'game' && !entry.art?.cover && !entry.art?.hero && !entry.aiAt && aiBudget-- > 0) {
          const ai = await getAi();
          const found = ai ? await aiFindArt(ai, i.name).catch(() => null) : null;
          entry.aiAt = Date.now();
          if (found) { entry.art = { ...entry.art, ...found.art }; entry.steamId = found.steamId ?? entry.steamId; entry.via = 'ia'; }
        }
        store.data.art[i.id] = entry;
      }));
      store.save();
      await remerge();
      send('lib:update', library());
    }
  } finally {
    enriching = false;
  }
}

// Liens autorisés vers d'autres programmes : seulement ceux des launchers et des pages de magasin
const SAFE_LINK = /^(steam:\/\/(rungameid|install|uninstall|validate)\/\d+|com\.epicgames\.launcher:\/\/(apps\/[\w%.-]+\?action=(launch|verify|install)(&silent=true)?|store\/library)|https:\/\/store\.steampowered\.com\/app\/\d+|https:\/\/store\.epicgames\.com\/fr\/p\/[\w-]+|https:\/\/steamcommunity\.com\/profiles\/\d{17}|https:\/\/(www\.steamgriddb\.com\/profile\/preferences\/api|steamcommunity\.com\/dev\/apikey))$/;
const openLink = (url) => (SAFE_LINK.test(url) ? shell.openExternal(url) : Promise.reject(new Error('lien refusé')));

async function confirm(message, detail) {
  const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Annuler', 'Oui'], defaultId: 0, cancelId: 0, message, detail });
  return r.response === 1;
}

// Steam en arrière-plan : steam.exe -silent lance le jeu sans ouvrir la fenêtre de Steam
async function steamExe() {
  const dir = await steamPath();
  return dir ? path.join(dir, 'steam.exe') : null;
}
async function runSilentSteam(args) {
  const exe = await steamExe();
  if (!exe || process.platform !== 'win32') return false;
  spawn(exe, ['-silent', ...args], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  return true;
}
// Mode jeu : le launcher se range dans la barre des tâches pendant la partie (rien ne tourne à l'écran, zéro gêne)
function gameMode(item) {
  if (item.kind !== 'game') return;
  playSession = { id: item.id, name: item.name, start: Date.now() };
  startBoost(item).catch(() => {});
  if (store.data.settings.gameMode !== false) setTimeout(() => win?.hide(), 1500);
}

// ---------- Boost : performances élevées + applis choisies fermées pendant la partie, puis tout est remis ----------
let playSession = null;
let lastActive = { ids: [], at: 0 };
// Partie en cours : lancée par le launcher, sinon repérée par le suivi du temps (dans les 2 dernières minutes)
const currentSession = () => playSession ?? (Date.now() - lastActive.at < 120_000 ? (() => { const g = items.find((i) => lastActive.ids.includes(i.id) && i.kind === 'game'); return g ? { id: g.id, name: g.name, start: null } : null; })() : null);
let boosted = null;
const boostSettings = () => ({ enabled: false, power: true, close: [], restore: true, ...(store.data.settings.boost ?? {}) });
function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, icon: ICON, silent: true }).show();
}
async function startBoost(item) {
  const b = boostSettings();
  if (!b.enabled || boosted || process.platform !== 'win32') return;
  const scheme = b.power ? await activeScheme() : null;
  if (scheme && scheme !== HIGH_PERFORMANCE) await setScheme(HIGH_PERFORMANCE);
  const closed = await closeApps(boostPlan(await runningPaths(), b.close));
  boosted = { item, scheme, closed, start: Date.now(), misses: 0 };
  notify('Boost activé', `${item.name} : performances élevées${closed.length ? `, ${closed.length} appli(s) fermée(s)` : ''}.`);
  boosted.timer = setInterval(async () => {
    if (Date.now() - boosted.start < 90_000) return; // le jeu a le temps de démarrer
    const running = activeItems([item], await runningPaths()).size > 0;
    boosted.misses = running ? 0 : boosted.misses + 1;
    if (boosted.misses >= 2) endBoost().catch(() => {});
  }, 20_000);
}
async function endBoost() {
  if (!boosted) return;
  const { scheme, closed, timer } = boosted;
  clearInterval(timer);
  boosted = null;
  playSession = null;
  if (scheme && scheme !== HIGH_PERFORMANCE) await setScheme(scheme);
  if (boostSettings().restore) for (const c of closed) spawn(c.path, [], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  notify('Boost terminé', 'Ton PC est revenu à ses réglages habituels.');
}
ipcMain.handle('boost:get', () => ({ ...boostSettings(), heatAlerts: store.data.settings.heatAlerts !== false, apps: BOOST_APPS.map(({ id, label }) => ({ id, label })) }));
ipcMain.handle('boost:set', (_e, patch) => {
  const b = boostSettings();
  for (const k of ['enabled', 'power', 'restore']) if (k in patch) b[k] = Boolean(patch[k]);
  if (Array.isArray(patch.close)) b.close = patch.close.map(String).filter((id) => BOOST_APPS.some((a) => a.id === id));
  if ('heatAlerts' in patch) store.data.settings.heatAlerts = Boolean(patch.heatAlerts);
  store.data.settings.boost = b;
  store.save();
  return b;
});

// ---------- Mon PC : surveillance et nettoyage ----------
ipcMain.handle('pc:snapshot', () => snapshot());
let cleanList = [];
ipcMain.handle('clean:scan', async () => {
  cleanList = await measureTargets(cleanTargets(process.env, await steamPath()));
  return cleanList.map(({ id, label, bytes, note }) => ({ id, label, bytes, note }));
});
ipcMain.handle('clean:run', async (_e, ids) => {
  const chosen = cleanList.filter((t) => Array.isArray(ids) && ids.includes(t.id)); // seulement les dossiers de notre liste
  if (!chosen.length || !(await confirm(`Vider ${chosen.length} cache(s) ?`, 'Ces fichiers se recréent tout seuls. Les fichiers ouverts sont sautés.'))) return { ok: false };
  let freed = 0;
  for (const t of chosen) freed += await cleanTarget(t).catch(() => 0);
  return { ok: true, freed };
});

// Alertes de chauffe (toutes les minutes)
const lastHeat = {};
setInterval(async () => {
  if (store.data.settings.heatAlerts === false) return;
  for (const a of heatAlerts(await snapshot().catch(() => ({})), lastHeat)) notify('Ton PC chauffe', `${a.text}. Pense à aérer ou à baisser les graphismes.`);
}, 60_000);

// ---------- Écran d'infos en jeu (Ctrl+Alt+O) : par-dessus les jeux en « plein écran fenêtré » ----------
let overlay = null;
let overlayTimer = null;
function toggleOverlay() {
  if (overlay && !overlay.isDestroyed()) { clearInterval(overlayTimer); overlay.close(); overlay = null; return; }
  const area = screen.getPrimaryDisplay().workArea;
  overlay = new BrowserWindow({
    width: 320, height: 420, x: area.x + area.width - 336, y: area.y + 16, frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, hasShadow: false,
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.webContents.on('will-navigate', (e) => e.preventDefault());
  overlay.loadFile(path.join(here, 'ui', 'overlay.html'));
  overlay.once('ready-to-show', () => overlay?.showInactive());
  const push = async () => {
    if (!overlay || overlay.isDestroyed()) return;
    const [pc, music] = await Promise.all([snapshot().catch(() => null), nowPlaying().catch(() => null)]);
    const friends = friendsCache.data?.friends ?? [];
    overlay.webContents.send('overlay:data', {
      session: currentSession(), pc, music: music?.title ? { title: music.title, artist: music.artist } : null,
      friends: { online: friends.filter((f) => f.online).length, playing: friends.filter((f) => f.game).slice(0, 3).map((f) => ({ name: f.name, game: f.game })) },
      boost: Boolean(boosted),
    });
  };
  push();
  overlayTimer = setInterval(push, 2000);
}

function remember(id, how) {
  const entry = (store.data.items[id] ??= {});
  if (entry.launch !== how) { entry.launch = how; store.save(); }
}
const gameRunning = (dir) => new Promise((resolve) => {
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process | Where-Object { $_.Path } | ForEach-Object { $_.Path }'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let out = '';
  ps.stdout.on('data', (d) => { out += d; });
  ps.on('error', () => resolve(false));
  ps.on('close', () => resolve(out.split(/\r?\n/).some((p) => insideDir(p.trim(), dir))));
});
/** Lance l'exécutable seul ; vrai si le jeu tourne encore quelques secondes après (sinon il exige sa plateforme). */
function startDirect(item, exe) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, [], { cwd: path.dirname(exe), env: directEnv(item), detached: true, stdio: 'ignore' });
    } catch { resolve(false); return; }
    child.unref();
    const timer = setTimeout(() => resolve(true), 8000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('exit', () => {
      clearTimeout(timer);
      // Certains jeux passent la main à un autre exécutable : on regarde si quelque chose du dossier tourne encore
      setTimeout(() => gameRunning(item.installDir || path.dirname(exe)).then(resolve), 3000);
    });
  });
}
const epicLauncherInstalled = () => path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');

async function doAction(id, action) {
  const item = items.find((i) => i.id === id); // jamais une commande venue de l'interface : seulement nos éléments
  if (!item) throw new Error('élément inconnu');
  if (action === 'folder' && item.installDir) return shell.openPath(item.installDir).then(() => ({ ok: true }));
  if (action === 'store' && item.source === 'steam') return openLink(steamActions(item.steamId).store).then(() => ({ ok: true }));

  if (action === 'launch') {
    // Le jeu seul d'abord (sans Steam / Epic) ; s'il a besoin de sa plateforme, elle est démarrée en arrière-plan
    const memo = store.data.items[item.id]?.launch ?? null;
    for (const way of launchPlan(item, { direct: store.data.settings.directLaunch !== false, memo })) {
      if (way === 'exe') {
        const exe = item.exe ?? await findExe(item.installDir);
        if (!exe) continue;
        if (!item.source || !['steam', 'epic'].includes(item.source)) {
          const err = await shell.openPath(exe);
          if (err) throw new Error(err);
          gameMode(item);
          return { ok: true };
        }
        if (await startDirect(item, exe)) { remember(item.id, 'direct'); gameMode(item); return { ok: true, direct: true }; }
        remember(item.id, 'client'); // ce jeu a besoin de sa plateforme : on ne réessaiera plus en direct
        continue;
      }
      if (item.source === 'steam' && await runSilentSteam(['-applaunch', item.steamId])) { gameMode(item); return { ok: true }; }
      if (item.source === 'epic') return openLink(epicActions(item.epicKey).launch).then(() => { gameMode(item); return { ok: true }; });
    }
    throw new Error('exécutable introuvable');
  }

  if (action === 'verify') {
    const result = await startVerify(item.id);
    return { ok: true, verify: result };
  }

  if (action === 'install') {
    // Le téléchargement passe forcément par les serveurs de Steam / Epic (compte et licence) : lancé en arrière-plan
    if (item.source === 'steam' && await runSilentSteam([`steam://install/${item.steamId}`])) return { ok: true };
    if (item.source === 'epic') return openLink(epicActions(item.epicKey).install).then(() => ({ ok: true }));
    throw new Error('installation impossible pour cet élément');
  }

  if (action === 'uninstall') {
    if (['steam', 'epic'].includes(item.source)) {
      const check = safeGameDir(item);
      if (!check.ok) throw new Error(check.why);
      const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Annuler', 'Supprimer définitivement'], defaultId: 0, cancelId: 0, message: `Désinstaller ${item.name} ?`, detail: `Le dossier suivant sera supprimé définitivement (${(item.size / 1e9).toFixed(1).replace('.', ',')} Go) :\n${check.dir}\n\n${item.source === 'steam' ? 'Steam' : 'Epic'} n’a pas besoin d’être ouvert.` });
      if (r.response !== 1) return { ok: false };
      await uninstallFiles(item, { launcherInstalled: epicLauncherInstalled() });
      scan().then((lib) => send('lib:update', lib)).catch(() => {});
      return { ok: true };
    }
    if (item.uninstallCmd) {
      if (!await confirm(`Désinstaller ${item.name} ?`, 'Le programme de désinstallation de l’éditeur va s’ouvrir.')) return { ok: false };
      // La commande vient du registre de Windows (et non de l'interface) : c'est celle que Windows lancerait
      spawn(item.uninstallCmd, { shell: true, detached: true, windowsHide: false, stdio: 'ignore' }).unref();
      return { ok: true };
    }
  }

  if (action === 'close') {
    // Fermer un jeu ou une appli : seulement les programmes situés dans son propre dossier
    const closed = await closeItem(item);
    return closed ? { ok: true } : { ok: false, error: 'rien à fermer' };
  }
  throw new Error('action impossible pour cet élément');
}

// ---------- Vérification des fichiers (avancement en direct, réparation ciblée) ----------
let verifyJob = null;
async function startVerify(id) {
  const item = items.find((i) => i.id === id);
  if (!item) throw new Error('élément inconnu');
  if (!item.installed) throw new Error('le jeu n’est pas installé');
  if (verifyJob) throw new Error(`une vérification est déjà en cours (${verifyJob.name})`);
  const controller = new AbortController();
  verifyJob = { id, name: item.name, controller };
  send('verify:progress', { id, name: item.name, phase: 'start' });
  try {
    const result = await verifyGame(item, { signal: controller.signal, onProgress: (p) => send('verify:progress', { id, name: item.name, phase: 'run', ...p }) });
    send('verify:progress', { id, name: item.name, phase: 'done', result, canRepair: ['steam', 'epic'].includes(item.source) });
    return result;
  } catch (err) {
    send('verify:progress', { id, name: item.name, phase: err.message === 'annulé' ? 'cancel' : 'error', error: err.message });
    return { ok: false, error: err.message };
  } finally {
    verifyJob = null;
  }
}
ipcMain.handle('verify:start', (_e, id) => startVerify(String(id)).catch((err) => ({ ok: false, error: err.message })));
ipcMain.handle('verify:cancel', () => { verifyJob?.controller.abort(); return { ok: true }; });
// Réparation : Steam (en fond) ou Epic re-téléchargent SEULEMENT les fichiers abîmés ou manquants
ipcMain.handle('verify:repair', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  if (!item) return { ok: false, error: 'élément inconnu' };
  if (item.source === 'steam' && await runSilentSteam([`steam://validate/${item.steamId}`])) return { ok: true };
  if (item.source === 'epic') return openLink(epicActions(item.epicKey).verify).then(() => ({ ok: true }));
  return { ok: false, error: 'réparation automatique impossible pour ce jeu : réinstalle-le depuis son launcher' };
});

async function closeItem(item) {
  const dir = String(item.installDir ?? '').toLowerCase().replace(/\\+$/, '');
  if (!dir || dir.split('\\').filter(Boolean).length < 3) return false;
  const targets = (await runningPaths()).filter((p) => p.startsWith(`${dir}\\`) && p.endsWith('.exe'));
  // Chemin exact transmis par variable d'environnement : rien n'est collé dans la commande PowerShell
  for (const exe of targets) {
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process | Where-Object { $_.Path -and $_.Path.ToLower() -eq $env:HL_CLOSE } | Stop-Process -Force'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, HL_CLOSE: exe } });
  }
  return targets.length > 0;
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
const publicSettings = async () => ({ ...store.data.settings, steamKey: Boolean(secret('steam')), gridKey: Boolean(secret('grid')), gemini: Boolean(await getAi()) });
ipcMain.handle('settings:get', () => publicSettings());
ipcMain.handle('accounts:get', async () => {
  await refreshAccounts();
  return {
    steam: steamAccounts.map((a) => ({ id: a.id, name: a.name, recent: a.recent })), epic: epicAccounts,
    chosen: { steam: chosenSteam(), epic: store.data.settings.epicAccount ?? epicAccounts[0]?.id ?? null }, total: Boolean(store.data.settings.totalTime),
  };
});
ipcMain.handle('accounts:set', async (_e, patch) => {
  if ('steam' in patch && steamAccounts.some((a) => a.id === String(patch.steam))) store.data.settings.steamAccount = String(patch.steam);
  if ('epic' in patch && (patch.epic === null || epicAccounts.some((a) => a.id === String(patch.epic)))) store.data.settings.epicAccount = patch.epic ? String(patch.epic) : null;
  if ('total' in patch) store.data.settings.totalTime = Boolean(patch.total);
  store.save();
  await remerge();
  send('lib:update', library());
  return { ok: true };
});
ipcMain.handle('settings:set', async (_e, patch) => {
  if ('autostart' in patch) store.data.settings.autostart = Boolean(patch.autostart);
  if ('dealAlerts' in patch) store.data.settings.dealAlerts = Boolean(patch.dealAlerts);
  if ('gameMode' in patch) store.data.settings.gameMode = Boolean(patch.gameMode);
  if ('directLaunch' in patch) store.data.settings.directLaunch = Boolean(patch.directLaunch);
  try {
    if ('steamKey' in patch) setSecret('steam', patch.steamKey);
    if ('gridKey' in patch) { setSecret('grid', patch.gridKey); store.data.art = {}; }
    if ('geminiKey' in patch) setSecret('gemini', patch.geminiKey);
  } catch (err) {
    return { ...(await publicSettings()), error: err.message };
  }
  store.save();
  applyAutostart();
  return publicSettings();
});
// Fiche complète d'un jeu, chargée quand on le sélectionne
ipcMain.handle('item:details', async (_e, id) => {
  const item = raw.find((i) => i.id === String(id));
  if (!item || item.kind !== 'game') return null;
  store.data.art ??= {};
  store.data.art[item.id] = await enrich(item, { cache: store.data.art[item.id], gridKey: secret('grid'), details: true });
  store.save();
  const details = { ...(store.data.art[item.id].details ?? item.details ?? {}) };
  const appid = store.data.art[item.id].steamId ?? item.steamId;
  if (appid && secret('steam')) details.achievements = await steamAchievements(appid, secret('steam'), await lastSteamUser(await steamPath())).catch(() => null);
  return details;
});

// ---------- Recommandations (IA), vérifiées sur Steam, gardées 24 h ----------
ipcMain.handle('reco:get', async () => {
  const cached = store.data.reco;
  if (cached && Date.now() - cached.at < 86_400_000 && cached.list.length) return cached.list;
  const ai = await getAi();
  const games = items.filter((i) => i.kind === 'game');
  const played = [...games].sort((a, b) => b.minutes - a.minutes).map((i) => i.name);
  const owned = new Set(games.map((i) => norm(i.name)));
  const list = [];
  for (const r of await recommend(ai, played, games.map((i) => i.name))) {
    if (owned.has(norm(r.name))) continue;
    const id = await steamMatch(r.name).catch(() => null);
    if (id) list.push({ name: r.name, why: r.why, steamId: id, art: steamArtUrls(id) });
  }
  // Sans IA : pas de recommandation (on n'affiche jamais un jeu au hasard)
  if (!list.length) return [];
  store.data.reco = { at: Date.now(), list };
  store.save();
  return store.data.reco.list;
});
const steamArtUrls = (id) => ({ cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`, hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`, header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`, logo: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/logo.png` });
ipcMain.handle('reco:open', (_e, steamId) => (/^\d{1,8}$/.test(String(steamId)) ? openLink(`https://store.steampowered.com/app/${steamId}`) : null));

// ---------- Jeux gratuits de la semaine (Epic) : gardés 6 h ----------
ipcMain.handle('free:get', async () => {
  const c = store.data.free;
  if (c && Date.now() - c.at < 6 * 3_600_000 && c.list.length) return c.list;
  const list = await epicFreeGames().catch(() => []);
  if (list.length) { store.data.free = { at: Date.now(), list }; store.save(); }
  return list.length ? list : c?.list ?? [];
});
ipcMain.handle('free:open', (_e, slug) => (/^[\w-]{1,120}$/.test(String(slug)) ? openLink(`https://store.epicgames.com/fr/p/${slug}`) : null));

// ---------- Amis Steam : statut, jeu en cours, rejoindre la partie ----------
const myId64 = () => steamAccounts.find((a) => a.id === chosenSteam())?.id64 ?? null;
let friendsCache = { at: 0, data: null };
ipcMain.handle('friends:get', async (_e, force) => {
  if (!force && friendsCache.data && Date.now() - friendsCache.at < 30_000) return friendsCache.data;
  if (!steamAccounts.length) await refreshAccounts();
  const data = await steamFriends(secret('steam'), myId64()).catch(() => ({ ok: false, reason: 'erreur', friends: [] }));
  friendsCache = { at: Date.now(), data };
  return data;
});
ipcMain.handle('friends:open', async (_e, action, id64) => {
  const f = friendsCache.data?.friends?.find((x) => x.id64 === String(id64)); // seulement un ami de la liste
  const link = f && friendLink(String(action), f);
  if (!link) return { ok: false, error: action === 'join' ? 'Pas de partie à rejoindre pour l’instant' : 'action impossible' };
  if (link.startsWith('https:')) { await openLink(link); return { ok: true }; }
  return { ok: await runSilentSteam([link]) };
});

// ---------- Promos de la liste de souhaits Steam (vérifiées toutes les 6 h, alerte pour chaque nouvelle promo) ----------
async function checkDeals(notify = true) {
  const id64 = myId64();
  if (!id64) return [];
  const deals = await wishlistDeals(id64).catch(() => []);
  const seen = (store.data.dealsSeen ??= {});
  const fresh = newDeals(deals, seen);
  if (notify && store.data.settings.dealAlerts !== false && Notification.isSupported()) {
    for (const d of fresh.slice(0, 3)) {
      const n = new Notification({ title: `${d.name} : -${d.pct} %`, body: `En promo sur Steam${d.price ? ` à ${d.price}` : ''} (dans ta liste de souhaits)`, icon: ICON });
      n.on('click', () => openLink(`https://store.steampowered.com/app/${d.appid}`).catch(() => {}));
      n.show();
    }
  }
  for (const d of deals) seen[d.appid] = d.pct;
  for (const id of Object.keys(seen)) if (!deals.some((d) => d.appid === id)) delete seen[id]; // promo finie : la prochaine sera annoncée
  store.data.deals = { at: Date.now(), list: deals };
  store.save();
  return deals;
}
ipcMain.handle('deals:get', async () => {
  const c = store.data.deals;
  if (c && Date.now() - c.at < 6 * 3_600_000) return c.list;
  return checkDeals(false);
});
ipcMain.handle('deals:open', (_e, appid) => (/^\d{1,8}$/.test(String(appid)) ? openLink(`https://store.steampowered.com/app/${appid}`) : null));

// ---------- Statistiques ----------
ipcMain.handle('stats:get', (_e, period) => {
  const n = { semaine: 7, mois: 30, annee: 365 }[period] ?? 7;
  const split = periodStats(store.data.days, n);
  const top = [...items].sort((a, b) => b.minutes - a.minutes).slice(0, 8).map((i) => ({ id: i.id, name: i.name, minutes: i.minutes, cat: statCategory(i) }));
  // Classement de la période (temps suivi par le launcher), en plus du temps total
  const recent = periodItems(store.data.days, n);
  // Classement « 2 dernières semaines » : chiffres officiels de Steam pour ses jeux, chronomètre du launcher pour les autres
  const tracked14 = periodItems(store.data.days, 14);
  const twoWeeks = Object.fromEntries(items.filter((i) => i.kind === 'game').map((i) => [i.id, i.recent2w ?? tracked14[i.id] ?? 0]).filter(([, m]) => m > 0));
  return { split, top, recent, twoWeeks, profile: os.userInfo().username };
});

// ---------- Musique ----------
ipcMain.handle('media:now', async () => {
  const np = await nowPlaying();
  if (np?.artist) Object.assign(np, await coverOf(np.artist, np.title).catch(() => ({})));
  return np;
});
ipcMain.handle('media:key', (_e, name) => mediaKey(String(name)));

// ---------- Assistant ----------
const findItem = (name) => {
  const n = norm(name);
  if (!n) return null;
  return items.find((i) => norm(i.name) === n) ?? items.find((i) => norm(i.name).includes(n) || n.includes(norm(i.name)));
};
// ---------- Assistant : commandes gratuites d'abord, Gemini pour le reste ----------
async function runCommand(text, { voice = false } = {}) {
  const clean = String(text ?? '').slice(0, 500).trim();
  if (!clean) return { reply: '…', action: 'none' };
  const np = await nowPlaying().catch(() => null);
  const c = understand(stripWake(clean) ?? clean, items, { music: np });
  let out = { reply: c.reply, action: c.action, value: c.value, itemId: c.itemId };
  if (['launch', 'install', 'verify', 'uninstall', 'folder', 'close'].includes(c.action)) {
    const done = await doAction(c.itemId, c.action).catch((err) => ({ ok: false, error: err.message }));
    if (done.ok === false && done.error) out.reply = `${c.reply.replace(/\.$/, '')} : impossible (${done.error}).`;
    if (done.ok === false && !done.error) out.reply = 'D’accord, j’annule.';
  } else if (c.action === 'music') {
    await mediaKey(c.value === 'pause' || c.value === 'play' ? 'toggle' : c.value);
  } else if (c.action === 'volume') {
    for (let n = 0; n < (c.value === 'mute' ? 1 : 5); n++) await mediaKey(c.value);
  } else if (c.action === 'favorite' || c.action === 'hide') {
    ((store.data.items[c.itemId] ??= {})[c.action === 'favorite' ? 'favorite' : 'hidden'] = true);
    store.save();
    await remerge();
    send('lib:update', library());
  } else if (c.action === 'unknown') {
    // Pas une commande connue : question libre pour Gemini (si une clé est disponible)
    const ai = await getAi();
    if (!ai) out = { reply: 'Je n’ai pas compris. Essaie « lance Rocket League », « ferme Discord », « monte le son » ou « trie par taille ».', action: 'none' };
    else {
      try {
        const context = {
          items: [...items].sort((a, b) => b.minutes - a.minutes).slice(0, 200).map((i) => `${i.name} · ${SOURCES[i.source]?.label ?? i.source} · ${i.installed ? 'installé' : 'non installé'} · ${Math.round(i.minutes / 60)} h`).join('\n'),
          music: np?.artist ? `${np.artist} - ${np.title}` : '',
        };
        const r = await assistant(ai, clean, context);
        out = { reply: r.reply, action: r.action, value: r.value };
        const item = r.target ? items.find((i) => norm(i.name) === norm(r.target)) : null;
        if (item && ['launch', 'install', 'verify', 'uninstall', 'folder', 'store'].includes(r.action)) { out.itemId = item.id; await doAction(item.id, r.action).catch(() => {}); }
      } catch (err) {
        out = { reply: `Je n’arrive pas à joindre l’IA (${err.message}).`, action: 'none' };
      }
    }
  }
  if (voice) speak(out.reply);
  return out;
}
ipcMain.handle('ai:ask', (_e, message) => runCommand(message));

// ---------- Voix : « Hey History … » (écoute Windows) et bouton micro (transcription Gemini) ----------
let stopListening = null;
let awaitingCommandUntil = 0;
function setVoice(on) {
  stopListening?.();
  stopListening = null;
  if (!on) return send('voice:state', { state: 'off' });
  stopListening = startListening(async (heard) => {
    const after = stripWake(heard);
    let command = null;
    if (after !== null) {
      if (after) command = after;
      else { awaitingCommandUntil = Date.now() + 7000; speak('Oui ?'); send('voice:state', { state: 'ecoute' }); return; }
    } else if (Date.now() < awaitingCommandUntil) command = heard;
    if (!command) return;
    awaitingCommandUntil = 0;
    send('voice:heard', { text: command });
    const r = await runCommand(command, { voice: true });
    send('voice:reply', r);
  }, (state, message) => send('voice:state', { state, message }));
}
ipcMain.handle('voice:set', (_e, on) => { store.data.settings.voice = Boolean(on); store.save(); setVoice(Boolean(on)); return { ok: true }; });
ipcMain.handle('voice:transcribe', async (_e, audio, mime) => {
  const ai = await getAi();
  if (!ai?.transcribe) return { reply: 'Le micro a besoin de la clé Gemini (celle du bot ou dans Paramètres).', action: 'none' };
  if (!(audio instanceof Uint8Array) && !(audio instanceof ArrayBuffer)) return { reply: 'Enregistrement illisible.', action: 'none' };
  const buf = Buffer.from(audio);
  if (buf.length > 3 * 1024 * 1024) return { reply: 'Enregistrement trop long.', action: 'none' };
  const text = await ai.transcribe(buf.toString('base64'), /^audio\/(webm|ogg|wav|mp4)/.test(String(mime)) ? String(mime).split(';')[0] : 'audio/webm').catch(() => '');
  if (!text) return { reply: 'Je n’ai rien entendu.', action: 'none' };
  return { heard: text, ...(await runCommand(text, { voice: true })) };
});

// ---------- Compte History (hébergé par le bot) ----------
const API = (process.env.HL_API || 'https://vercel-ia.onrender.com').replace(/\/+$/, '');
async function api(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}
ipcMain.handle('account:get', async () => {
  const token = secret('account');
  if (!token) return { compte: null, skipped: Boolean(store.data.settings.skipAccount) };
  const r = await api('/api/compte/moi', { token }).catch(() => ({ status: 0 }));
  if (r.status === 401) { setSecret('account', ''); return { compte: null }; }
  if (r.compte) { store.data.settings.lastAccount = r.compte; store.save(); }
  // Hors ligne : on garde le dernier profil connu
  return { compte: r.compte ?? store.data.settings.lastAccount ?? null, offline: r.status === 0 };
});
for (const kind of ['inscription', 'connexion']) {
  ipcMain.handle(`account:${kind}`, async (_e, body) => {
    const clean = { pseudo: String(body?.pseudo ?? '').slice(0, 40), email: String(body?.email ?? '').slice(0, 254), motDePasse: String(body?.motDePasse ?? '').slice(0, 128) };
    const r = await api(`/api/compte/${kind}`, { method: 'POST', body: clean }).catch(() => ({ status: 0, error: 'Serveur injoignable, vérifie ta connexion internet.' }));
    if (r.token) { setSecret('account', r.token); store.data.settings.lastAccount = r.compte; store.data.settings.skipAccount = false; store.save(); }
    return { ok: Boolean(r.token), compte: r.compte ?? null, error: r.token ? null : r.error ?? 'Erreur.' };
  });
}
ipcMain.handle('account:logout', async () => {
  const token = secret('account');
  if (token) await api('/api/compte/deconnexion', { method: 'POST', token }).catch(() => {});
  setSecret('account', '');
  store.data.settings.lastAccount = null;
  store.save();
  return { ok: true };
});
ipcMain.handle('account:skip', () => { store.data.settings.skipAccount = true; store.save(); return { ok: true }; });

ipcMain.handle('open:link', (_e, which) => openLink({ steam: 'https://steamcommunity.com/dev/apikey', grid: 'https://www.steamgriddb.com/profile/preferences/api' }[which] ?? ''));
app.on('will-quit', () => globalShortcut.unregisterAll());
ipcMain.on('win', (_e, what) => {
  if (what === 'min') win?.minimize();
  else if (what === 'max') win?.isMaximized() ? win.unmaximize() : win?.maximize();
  else if (what === 'close') win?.hide();
});

app.whenReady().then(start).catch(async (err) => { await fatal(err); app.exit(1); });
async function start() {
  protocol.handle('libimg', (req) => {
    const token = new URL(req.url).pathname.replace(/^\//, '').replace(/\.(png|jpg)$/, '');
    const file = localFiles.get(token);
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response('introuvable', { status: 404 });
  });
  // Micro : autorisé seulement pour la fenêtre du launcher (bouton micro de l'assistant)
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media' && wc === win?.webContents));
  await store.load();
  applyAutostart();
  createWindow();
  createTray();
  // Raccourci global : Ctrl+Alt+H affiche ou range le launcher, même en jeu
  globalShortcut.register('CommandOrControl+Alt+O', toggleOverlay);
  globalShortcut.register('CommandOrControl+Alt+H', () => (win?.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  setTimeout(() => checkDeals().catch(() => {}), 60_000);
  setInterval(() => checkDeals().catch(() => {}), 6 * 3_600_000);
  startTracker(() => items, store, (ids) => { lastActive = { ids, at: Date.now() }; win?.webContents.send('lib:active', ids); }, 60_000, accountFor);
  if (store.data.settings.voice) setTimeout(() => setVoice(true), 3000);
}
app.on('before-quit', () => { quitting = true; endBoost().catch(() => {}); });
app.on('window-all-closed', (e) => e.preventDefault());

