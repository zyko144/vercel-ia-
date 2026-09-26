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
import { deepClean, diskSize, emptyRecycleBin, extraTargets, freeSpace, groupOf, healthScore, orphanGameFolders, recycleBinSize, removeOrphan, scoreLabel, setStartup, setTweak, startupApps, steamJunk, tweakStates } from './core/optimize.js';
import { steamLibraries } from './core/steam.js';
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
import { DiscordPresence, activityFor } from './core/discordRpc.js';
import { translateNews, dominantColor, playReminders, steamNews, todayGameMinutes, weeklyRecap } from './core/daily.js';
import { achievementsOf, capturesOf, customItem, nameFromExe, scanXbox, timeToBeat, validAumid } from './core/extras.js';
import { directEnv, insideDir, launchPlan } from './core/direct.js';
import { findItem as findByName, stripWake, understand } from './core/commands.js';
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

// Note une erreur dans le journal sans rien afficher
async function fatalLog(err) {
  try {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(path.join(app.getPath('userData'), 'erreurs.log'), `${new Date().toISOString()} ${err?.stack ?? err}\n`);
  } catch { /* journal impossible */ }
}
// Toute erreur au démarrage est notée dans un journal et affichée (au lieu d'une fermeture silencieuse)
async function fatal(err) {
  const text = `${new Date().toISOString()} ${err?.stack ?? err}\n`;
  try {
    const { appendFile, mkdir } = await import('node:fs/promises');
    await mkdir(app.getPath('userData'), { recursive: true });
    await appendFile(path.join(app.getPath('userData'), 'erreurs.log'), text);
  } catch { /* journal impossible */ }
  console.error('[launcher]', err);
  // Une fois la fenêtre ouverte, une erreur passagère ne bloque plus tout : petit message dans le launcher
  if (win && !win.isDestroyed()) { win.webContents.send('app:error', String(err?.message ?? err).slice(0, 200)); return; }
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
  const [found, xbox] = await Promise.all([scanAll({}, { steamApiKey: secret('steam') }), scanXbox().catch(() => [])]);
  raw = [...found, ...xbox, ...Object.values(store.data.custom ?? {}).map(customItem)];
  await fillSteamNames(raw).catch(() => {});
  await remerge();
  enrichInBackground().catch(() => {});
  const lib = library();
  saveLibCache(lib);
  return lib;
}
/** Dernière bibliothèque gardée sur le disque : affichée tout de suite au démarrage, le scan complet suit. */
function saveLibCache(lib) {
  store.data.libCache = {
    at: Date.now(), sources: lib.sources, files: Object.fromEntries(localFiles),
    items: lib.items.map(({ iconData, ...rest }) => rest), // sans les icônes (lourdes) : elles arrivent avec le scan
  };
  store.save();
}
ipcMain.handle('lib:cached', () => {
  const c = store.data.libCache;
  if (!c?.items?.length) return null;
  for (const [token, file] of Object.entries(c.files ?? {})) if (!localFiles.has(token)) localFiles.set(token, file);
  return { items: c.items, sources: c.sources, cached: true };
});
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
const SAFE_LINK = /^(steam:\/\/(rungameid|install|uninstall|validate)\/\d+|com\.epicgames\.launcher:\/\/(apps\/[\w%.-]+\?action=(launch|verify|install)(&silent=true)?|store\/library)|https:\/\/store\.steampowered\.com\/app\/\d+|https:\/\/store\.epicgames\.com\/fr\/p\/[\w-]+|https:\/\/steamcommunity\.com\/profiles\/\d{17}|https:\/\/store\.steampowered\.com\/news\/app\/\d+\/view\/\d+|https:\/\/(www\.steamgriddb\.com\/profile\/preferences\/api|steamcommunity\.com\/dev\/apikey))$/;
const openLink = (url) => (SAFE_LINK.test(url) ? shell.openExternal(url) : Promise.reject(new Error('lien refusé')));

// Confirmation dans une fenêtre du launcher (même style que le reste), réponse renvoyée par l'interface
let askSeq = 0;
const asks = new Map();
ipcMain.on('ui:answer', (_e, id, ok) => { asks.get(id)?.(Boolean(ok)); asks.delete(id); });
async function confirm(message, detail, opts = {}) {
  if (!win || win.isDestroyed()) return false;
  if (!win.isVisible()) showWindow();
  const id = ++askSeq;
  return new Promise((resolve) => {
    asks.set(id, resolve);
    send('ui:ask', { id, title: message, text: detail, danger: Boolean(opts.danger), ok: opts.ok ?? 'Confirmer', icon: opts.icon ?? '⚠️' });
    setTimeout(() => { if (asks.has(id)) { asks.delete(id); resolve(false); } }, 5 * 60_000);
  });
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
  if (item.kind !== 'game') return; // jamais pour une appli (Discord, Spotify…)
  playSession = { id: item.id, name: item.name, start: Date.now() };
  startBoost(item).catch(() => {});
  if (store.data.settings.gameMode !== false) hideWhenPlaying(item);
}
// Mode jeu : le launcher se range SEULEMENT quand le jeu tourne vraiment et que tu n'es plus dans le launcher
// (jamais pendant que tu cliques dedans, jamais si le jeu ne démarre pas).
function hideWhenPlaying(item) {
  const started = Date.now();
  const check = async () => {
    if (!win || win.isDestroyed() || !win.isVisible() || Date.now() - started > 45_000) return;
    const running = activeItems([item], await runningPaths(0)).size > 0;
    if (running && !win.isFocused()) { win.hide(); return; }
    setTimeout(check, 3000);
  };
  setTimeout(check, 4000);
}

// ---------- Boost : performances élevées + applis choisies fermées pendant la partie, puis tout est remis ----------
let playSession = null;
let lastActive = { ids: [], at: 0 };
// Partie en cours : lancée par le launcher, sinon repérée par le suivi du temps (dans les 2 dernières minutes)
let detected = null;
const currentSession = () => playSession ?? (detected && Date.now() - lastActive.at < 120_000 && lastActive.ids.includes(detected.id) ? detected : null);
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
async function endBoost({ silent = false } = {}) {
  if (!boosted) return;
  const { scheme, closed, timer } = boosted;
  const changed = Boolean((scheme && scheme !== HIGH_PERFORMANCE) || closed.length);
  clearInterval(timer);
  boosted = null;
  playSession = null;
  if (scheme && scheme !== HIGH_PERFORMANCE) await setScheme(scheme);
  if (boostSettings().restore) for (const c of closed) spawn(c.path, [], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  if (changed && !silent) notify('Boost terminé', 'Partie finie : ton PC est revenu à ses réglages habituels.');
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

// ---------- Optimisation complète (avancement envoyé en direct à l'interface) ----------
let orphanList = [];
let startupList = [];
let lastScan = null;
const scoreOf = (r) => healthScore({
  junkBytes: r.junk.reduce((n, x) => n + x.bytes, 0) + r.recycle, orphanBytes: r.orphans.reduce((n, x) => n + x.bytes, 0),
  heavyStartup: r.startup.filter((x) => x.enabled && x.heavy).length, tweaksOff: r.tweaks.filter((t) => !t.on && !t.optional).length,
  freeRatio: r.free && r.disk ? r.free / r.disk : null,
});
async function optiScan(progress = () => {}) {
  const root = await steamPath();
  const libs = root ? await steamLibraries(root) : [];
  const step = (id, p) => p.then((v) => { progress({ step: id }); return v; });
  const [junk, recycle, orphans, startup, tweaks, free, disk] = await Promise.all([
    step('junk', Promise.all([cleanTargets(process.env, root), extraTargets(), steamJunk(root)]).then(([a, b, c]) => measureTargets([...a, ...b, ...c]))),
    step('recycle', recycleBinSize()), step('orphans', orphanGameFolders(libs).catch(() => [])),
    step('startup', startupApps().catch(() => [])), step('tweaks', tweakStates().catch(() => [])), freeSpace(), diskSize(),
  ]);
  cleanList = junk.filter((t) => t.bytes > 0);
  orphanList = orphans.map((o) => ({ ...o, libs }));
  startupList = startup;
  const r = {
    junk: cleanList.map(({ id, label, bytes, note }) => ({ id, label, bytes, note, group: groupOf(id) })).sort((a, b) => b.bytes - a.bytes),
    recycle, orphans: orphans.map(({ id, label, bytes }) => ({ id, label, bytes })), startup, tweaks, free, disk, at: Date.now(),
  };
  r.score = scoreOf(r);
  r.label = scoreLabel(r.score);
  lastScan = r;
  return r;
}
ipcMain.handle('opti:scan', async () => {
  try { return await optiScan((p) => send('opti:progress', { phase: 'scan', ...p })); } catch (err) { fatalLog(err); return { error: `Analyse impossible : ${err.message}` }; }
});
async function optiApply(plan, progress = () => {}) {
  const junk = cleanList.filter((t) => plan?.junk?.includes(t.id));
  const orphans = orphanList.filter((o) => plan?.orphans?.includes(o.id));
  const tweaks = (plan?.tweaks ?? []).map(String);
  const steps = [...junk.map((t) => ({ kind: 'junk', label: t.label, t })), ...(plan?.recycle ? [{ kind: 'recycle', label: 'Corbeille' }] : []), ...orphans.map((o) => ({ kind: 'orphan', label: `Reste de jeu : ${o.label}`, o })), ...tweaks.map((id) => ({ kind: 'tweak', label: `Réglage : ${id}`, id }))];
  const before = await freeSpace();
  let freed = 0;
  for (const [i, st] of steps.entries()) {
    progress({ phase: 'run', index: i, total: steps.length, label: st.label, status: 'en cours', freed });
    let got = 0;
    try {
      if (st.kind === 'junk') got = await cleanTarget(st.t);
      if (st.kind === 'orphan') got = await removeOrphan(st.o, st.o.libs);
      if (st.kind === 'recycle') { const size = lastScan?.recycle ?? 0; await emptyRecycleBin(); got = size; }
      if (st.kind === 'tweak') await setTweak(st.id, true);
    } catch (err) { fatalLog(err); } // un élément bloqué (fichier ouvert, droits) n'arrête pas le reste
    freed += got;
    progress({ phase: 'run', index: i, total: steps.length, label: st.label, status: 'fait', got, freed });
  }
  const after = await freeSpace();
  return { ok: true, freed: before != null && after != null ? Math.max(freed, after - before) : freed, steps: steps.length, tweaks: tweaks.length };
}
ipcMain.handle('opti:run', async (_e, plan) => {
  try {
    const r = await optiApply(plan, (p) => send('opti:progress', p));
    const scan = await optiScan().catch(() => null);
    return { ...r, score: scan?.score ?? null, scan };
  } catch (err) {
    fatalLog(err);
    return { ok: false, error: err.message };
  }
});
ipcMain.handle('opti:startup', async (_e, name, enabled) => {
  if (!startupList.some((s) => s.name === String(name))) return { ok: false };
  await setStartup(String(name), Boolean(enabled)).catch(() => {});
  startupList = await startupApps().catch(() => startupList);
  return { ok: true, startup: startupList };
});
ipcMain.handle('opti:tweak', async (_e, id, on) => ({ ok: await setTweak(String(id), Boolean(on)).catch(() => false), tweaks: await tweakStates().catch(() => []) }));
ipcMain.handle('opti:deep', async () => {
  const before = await freeSpace();
  const ok = await deepClean();
  const after = await freeSpace();
  return { ok, freed: before != null && after != null ? Math.max(0, after - before) : null };
});
ipcMain.handle('opti:auto', (_e, on) => { if (on !== undefined) { store.data.settings.optiAuto = Boolean(on); store.save(); } return { on: store.data.settings.optiAuto !== false, last: store.data.optiAutoLast ?? null }; });
// Optimisation automatique chaque semaine : seulement les caches qui se recréent (système, pilotes, launchers), en silence
setInterval(async () => {
  if (store.data.settings.optiAuto === false || Date.now() - (store.data.optiAutoLast ?? 0) < 7 * 86_400_000 || currentSession()) return;
  const scan = await optiScan().catch(() => null);
  if (!scan) return;
  const r = await optiApply({ junk: scan.junk.filter((j) => j.group !== 'navigateurs').map((j) => j.id) }).catch(() => null);
  store.data.optiAutoLast = Date.now();
  store.save();
  if (r?.freed > 200e6) notify('Optimisation automatique', `${(r.freed / 1e9).toFixed(1).replace('.', ',')} Go libérés cette semaine.`);
}, 3 * 3_600_000);

// Alertes de chauffe (toutes les minutes)
const lastHeat = {};
setInterval(async () => {
  // Seulement pendant une partie ou avec l'écran d'infos : hors jeu, le launcher ne sollicite pas le PC pour rien
  if (store.data.settings.heatAlerts === false || !(currentSession() || overlay)) return;
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

  if (action === 'launch' && item.source === 'xbox') {
    // Jeux Xbox / Game Pass : lancés par Windows (ils ne s'ouvrent pas directement par leur .exe)
    if (!validAumid(item.aumid)) throw new Error('jeu Xbox introuvable');
    spawn('explorer.exe', [`shell:AppsFolder\\${item.aumid}`], { detached: true, stdio: 'ignore' }).unref();
    gameMode(item);
    return { ok: true };
  }
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

  if (action === 'update' && item.source === 'steam') {
    // Steam fait la mise à jour puis lance le jeu (en arrière-plan, sans fenêtre)
    if (await runSilentSteam(['-applaunch', item.steamId])) { gameMode(item); return { ok: true }; }
    throw new Error('Steam introuvable');
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
      if (!(await confirm(`Désinstaller ${item.name} ?`, `Le dossier suivant sera supprimé définitivement (${(item.size / 1e9).toFixed(1).replace('.', ',')} Go) :\n${check.dir}\n\n${item.source === 'steam' ? 'Steam' : 'Epic'} n’a pas besoin d’être ouvert.`, { danger: true, ok: 'Supprimer définitivement', icon: '🗑' }))) return { ok: false };
      await uninstallFiles(item, { launcherInstalled: epicLauncherInstalled() });
      scan().then((lib) => send('lib:update', lib)).catch(() => {});
      return { ok: true };
    }
    if (item.uninstallCmd) {
      if (!await confirm(`Désinstaller ${item.name} ?`, 'Le programme de désinstallation de l’éditeur va s’ouvrir.', { danger: true, ok: 'Désinstaller', icon: '🗑' })) return { ok: false };
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
  if ('discordStatus' in patch) store.data.settings.discordStatus = Boolean(patch.discordStatus);
  if ('shareActivity' in patch) store.data.settings.shareActivity = Boolean(patch.shareActivity);
  if ('dailyLimit' in patch) store.data.settings.dailyLimit = Math.max(0, Math.min(1440, Number(patch.dailyLimit) || 0));
  if ('breakEvery' in patch) store.data.settings.breakEvery = Math.max(0, Math.min(600, Number(patch.breakEvery) || 0));
  if ('theme' in patch && ['bleu', 'violet', 'rouge', 'vert', 'orange', 'rose', 'auto'].includes(patch.theme)) store.data.settings.theme = patch.theme;
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

// ---------- Fin de partie, statut Discord et présence pour les amis History (toutes les 30 s) ----------
const rpc = new DiscordPresence();
let lastPresence = 0;
setInterval(async () => {
  if (playSession && Date.now() - playSession.start > 90_000) {
    const it = items.find((i) => i.id === playSession.id);
    const running = it && activeItems([it], await runningPaths()).size > 0;
    playSession.misses = running ? 0 : (playSession.misses ?? 0) + 1;
    if (playSession.misses >= 2) playSession = null;
  }
  const s = currentSession();
  if (store.data.settings.discordStatus !== false) await rpc.set(s ? activityFor(s, items.find((i) => i.id === s.id)) : null).catch(() => {});
  else if (rpc.ready) await rpc.set(null).catch(() => {});
  if (Date.now() - lastPresence > 55_000) { lastPresence = Date.now(); sendPresence(s).catch(() => {}); }
  // Limite du jour et pauses
  const set = store.data.settings;
  if (set.dailyLimit > 0 || set.breakEvery > 0) {
    const reminders = playReminders({ today: todayGameMinutes(store.data.days), limit: Number(set.dailyLimit) || 0, sessionMinutes: s?.start ? (Date.now() - s.start) / 60_000 : 0, breakEvery: Number(set.breakEvery) || 0 }, (store.data.reminders ??= {}));
    for (const r of reminders) notify(r.kind === 'limit' ? 'Limite de jeu atteinte' : 'Petite pause ?', r.text);
    if (reminders.length) store.save();
  }
}, 30_000);

async function sendPresence(s) {
  const token = secret('account');
  if (!token) return;
  const share = store.data.settings.shareActivity !== false;
  const week = periodItems(store.data.days, 7);
  const games = Object.entries(week).map(([id, m]) => [items.find((i) => i.id === id), m]).filter(([i]) => i?.kind === 'game');
  const top = games.sort((a, b) => b[1] - a[1])[0]?.[0]?.name ?? null;
  await api('/api/compte/presence', { method: 'POST', token, body: { playing: share && s ? s.name : null, week: share ? Math.round(games.reduce((n, [, m]) => n + m, 0)) : 0, top: share ? top : null } });
}

// ---------- Amis History (comptes du launcher) et soirées jeu ----------
async function social(pathname, body) {
  const token = secret('account');
  if (!token) return { status: 401, error: 'Connecte-toi à ton compte History pour ça.' };
  return api(pathname, { method: body ? 'POST' : 'GET', token, body }).catch(() => ({ status: 0, error: 'Serveur injoignable, vérifie ta connexion internet.' }));
}
const ID = (v) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, 64);
ipcMain.handle('hfriends:get', () => social('/api/compte/amis'));
ipcMain.handle('hfriends:add', (_e, code) => social('/api/compte/amis/ajouter', { code: String(code ?? '').slice(0, 40) }));
ipcMain.handle('hfriends:accept', (_e, id) => social('/api/compte/amis/accepter', { id: ID(id) }));
ipcMain.handle('hfriends:remove', (_e, id) => social('/api/compte/amis/retirer', { id: ID(id) }));
ipcMain.handle('events:get', () => social('/api/compte/soirees'));
ipcMain.handle('events:create', (_e, e) => social('/api/compte/soirees', { jeu: String(e?.jeu ?? '').slice(0, 80), at: Number(e?.at), invites: (Array.isArray(e?.invites) ? e.invites : []).slice(0, 50).map(ID) }));
ipcMain.handle('events:respond', (_e, id, reponse) => social('/api/compte/soirees/repondre', { id: ID(id), reponse: reponse === 'oui' ? 'oui' : 'non' }));
ipcMain.handle('events:cancel', (_e, id) => social('/api/compte/soirees/annuler', { id: ID(id) }));

// Rappels : nouvelle invitation, et 10 min avant une soirée acceptée (clic = lancer le jeu s'il est installé)
async function checkEvents() {
  const r = await social('/api/compte/soirees');
  if (!Array.isArray(r.soirees)) return;
  const seen = (store.data.eventsSeen ??= {});
  const when = (t) => new Date(t).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  for (const e of r.soirees) {
    if (!e.mine && e.ma === null && !seen[`inv:${e.id}`]) { seen[`inv:${e.id}`] = Date.now(); notify(`${e.organisateur} t’invite à jouer`, `${e.game}, ${when(e.at)}. Réponds dans Amis › Soirées.`); }
    const soon = e.at - Date.now();
    if (e.ma === 'oui' && soon > 0 && soon <= 11 * 60_000 && !seen[`go:${e.id}`]) {
      seen[`go:${e.id}`] = Date.now();
      const game = items.find((i) => i.installed && norm(i.name) === norm(e.game));
      const n = new Notification({ title: `${e.game} dans ${Math.max(1, Math.round(soon / 60_000))} min`, body: game ? 'Clique pour lancer le jeu.' : `Soirée organisée par ${e.organisateur}.`, icon: ICON });
      if (game) n.on('click', () => doAction(game.id, 'launch').catch(() => {}));
      n.show();
    }
  }
  for (const [k, t] of Object.entries(seen)) if (Date.now() - t > 30 * 86_400_000) delete seen[k];
  store.save();
}
setInterval(() => checkEvents().catch(() => {}), 2 * 60_000);

// ---------- Captures, succès, durée pour finir ----------
const captureFiles = new Map(); // jeton -> fichier (seulement ceux trouvés par capturesOf)
ipcMain.handle('captures:get', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  if (!item) return [];
  const list = await capturesOf(item, { steamRoot: await steamPath(), accountIds: steamAccounts.map((a) => a.id) }).catch(() => []);
  return list.map((c) => {
    const token = createHash('sha1').update(c.file).digest('hex').slice(0, 24);
    captureFiles.set(token, c.file);
    return { token, video: c.video, at: c.at, url: c.video ? null : localUrls({ x: c.file }).x };
  });
});
ipcMain.handle('captures:open', (_e, token) => { const f = captureFiles.get(String(token)); return f ? shell.openPath(f) : null; });
ipcMain.handle('captures:folder', (_e, token) => { const f = captureFiles.get(String(token)); if (f) shell.showItemInFolder(f); });
ipcMain.handle('ach:get', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  const appid = item?.matchSteamId ?? item?.steamId;
  if (!appid || !secret('steam')) return { none: !secret('steam') ? 'cle' : 'steam' };
  return (await achievementsOf(appid, secret('steam'), myId64() ?? await lastSteamUser(await steamPath())).catch(() => null)) ?? { none: 'aucun' };
});
ipcMain.handle('hltb:get', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  if (!item || item.kind !== 'game') return null;
  const cache = (store.data.hltb ??= {});
  const key = norm(item.name);
  if (cache[key] && Date.now() - cache[key].at < (cache[key].t ? 60 : 7) * 86_400_000) return cache[key].t;
  const ai = await getAi();
  if (!ai) return null;
  const t = await timeToBeat(ai, item.name).catch(() => null);
  cache[key] = { at: Date.now(), t };
  store.save();
  return t;
});

// ---------- Collections ----------
ipcMain.handle('col:get', () => store.data.collections ?? {});
ipcMain.handle('col:save', (_e, cols) => {
  const clean = {};
  for (const [id, c] of Object.entries(cols ?? {}).slice(0, 50)) {
    if (!/^[\w-]{1,40}$/.test(id)) continue;
    const name = String(c?.name ?? '').replace(/[<>]/g, '').trim().slice(0, 40);
    if (name) clean[id] = { name, items: [...new Set((Array.isArray(c.items) ? c.items : []).map(String))].slice(0, 2000) };
  }
  store.data.collections = clean;
  store.save();
  return clean;
});

// ---------- Jeux ajoutés à la main (.exe glissé dans la fenêtre ou choisi) ----------
async function addCustom(file) {
  const exe = String(file ?? '');
  if (!path.isAbsolute(exe) || !/\.exe$/i.test(exe) || !(await import('node:fs/promises').then((f) => f.stat(exe)).catch(() => null))?.isFile()) return { ok: false, error: 'Choisis le fichier .exe du jeu.' };
  const id = `custom:${createHash('sha1').update(exe.toLowerCase()).digest('hex').slice(0, 12)}`;
  (store.data.custom ??= {})[id] = { id, name: nameFromExe(exe), exe };
  store.save();
  raw = [...raw.filter((i) => i.id !== id), customItem(store.data.custom[id])];
  await remerge();
  send('lib:update', library());
  return { ok: true, id, name: store.data.custom[id].name };
}
ipcMain.handle('custom:add', (_e, file) => addCustom(file));
ipcMain.handle('custom:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Ajouter un jeu', filters: [{ name: 'Jeux', extensions: ['exe'] }], properties: ['openFile'] });
  return r.canceled || !r.filePaths[0] ? { ok: false } : addCustom(r.filePaths[0]);
});
ipcMain.handle('custom:rename', async (_e, id, name) => {
  const c = store.data.custom?.[String(id)];
  const n = String(name ?? '').replace(/[<>]/g, '').trim().slice(0, 80);
  if (!c || !n) return { ok: false };
  c.name = n;
  store.save();
  raw = raw.map((i) => (i.id === c.id ? customItem(c) : i));
  await remerge();
  send('lib:update', library());
  return { ok: true };
});
ipcMain.handle('custom:remove', async (_e, id) => {
  if (!store.data.custom?.[String(id)]) return { ok: false };
  delete store.data.custom[String(id)];
  store.save();
  raw = raw.filter((i) => i.id !== String(id));
  await remerge();
  send('lib:update', library());
  return { ok: true };
});

// ---------- Résumé de la semaine (chaque lundi), actus des jeux, notes de mise à jour, couleur du thème ----------
ipcMain.handle('recap:get', () => {
  const recap = weeklyRecap(store.data.days, items);
  const fresh = store.data.recapShown !== recap.week && recap.minutes > 0;
  if (fresh) { store.data.recapShown = recap.week; store.save(); }
  return { ...recap, fresh };
});
setInterval(() => {
  const recap = weeklyRecap(store.data.days, items);
  if (recap.minutes > 0 && store.data.recapNotified !== recap.week) {
    store.data.recapNotified = recap.week;
    store.save();
    notify('Ton résumé de la semaine est prêt', `${Math.floor(recap.minutes / 60)} h de jeu${recap.top[0] ? `, surtout ${recap.top[0].name}` : ''}. Ouvre le launcher pour tout voir.`);
  }
}, 3_600_000);
ipcMain.handle('news:get', async () => {
  const c = store.data.news;
  if (c && Date.now() - c.at < 3 * 3_600_000) return c.list;
  const games = items.filter((i) => i.source === 'steam' && i.installed && /^\d+$/.test(i.steamId ?? '')).sort((a, b) => b.minutes - a.minutes).slice(0, 6);
  const all = (await Promise.all(games.map((g) => steamNews(g.steamId, 2).then((n) => n.map((x) => ({ ...x, game: g.name, id: g.id, image: g.art?.header ?? g.art?.hero ?? null }))).catch(() => [])))).flat();
  const list = await translateNews(await getAi(), all.sort((a, b) => b.at - a.at).slice(0, 8), (store.data.newsFr ??= {}));
  store.data.news = { at: Date.now(), list };
  store.save();
  return list;
});
ipcMain.handle('news:game', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  if (item?.source !== 'steam') return [];
  const list = await steamNews(item.steamId, 3).catch(() => []);
  const out = await translateNews(await getAi(), list, (store.data.newsFr ??= {}));
  store.save();
  return out;
});
ipcMain.handle('news:open', (_e, appid, gid) => (/^\d{1,8}$/.test(String(appid)) && /^\d{1,25}$/.test(String(gid)) ? openLink(`https://store.steampowered.com/news/app/${appid}/view/${gid}`) : null));
const colorCache = new Map();
ipcMain.handle('color:of', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  if (!item) return null;
  if (colorCache.has(item.id)) return colorCache.get(item.id);
  let color = item.brand?.color ?? null;
  if (!color) {
    const src = [item.art?.cover, item.art?.hero, item.art?.header].find(Boolean);
    let buf = null;
    if (src?.startsWith('libimg://')) { const f = localFiles.get(new URL(src).pathname.replace(/^\//, '').replace(/\.(png|jpg)$/, '')); if (f) buf = await import('node:fs/promises').then((fs) => fs.readFile(f)).catch(() => null); }
    else if (/^https:\/\//.test(src ?? '')) buf = Buffer.from(await (await fetch(src, { signal: AbortSignal.timeout(8000) })).arrayBuffer().catch(() => new ArrayBuffer(0)));
    const img = buf?.length ? nativeImage.createFromBuffer(buf) : null;
    if (img && !img.isEmpty()) color = dominantColor(img.resize({ width: 32 }).toBitmap());
  }
  colorCache.set(item.id, color);
  return color;
});

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
          extra: `Jeu en cours : ${currentSession()?.name ?? 'aucun'} · Temps de jeu aujourd'hui : ${todayGameMinutes(store.data.days)} min · Amis Steam en jeu : ${(friendsCache.data?.friends ?? []).filter((f) => f.game).map((f) => `${f.name} (${f.game})`).slice(0, 5).join(', ') || 'aucun'}`,
        };
        const r = await assistant(ai, clean, context);
        out = { reply: r.reply, action: r.action, value: r.value };
        const item = r.target ? items.find((i) => norm(i.name) === norm(r.target)) ?? findByName(items, r.target) : null;
        if (item && ['launch', 'close', 'install', 'verify', 'uninstall', 'folder', 'store'].includes(r.action)) { out.itemId = item.id; await doAction(item.id, r.action).catch(() => {}); }
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
let voiceNames = '';
const listenNames = () => items.filter((i) => i.installed && (i.kind === 'game' || i.brand || i.known)).map((i) => i.name);
function setVoice(on) {
  stopListening?.();
  stopListening = null;
  if (!on) return send('voice:state', { state: 'off' });
  voiceNames = listenNames().join('|');
  stopListening = startListening(async ({ grammar, confidence, text }) => {
    let command = null;
    if (grammar === 'wake') {
      // « Hey History » seul : Gemini écoute la suite (bien plus fiable), sinon la phrase suivante de Windows
      speak('Oui ?');
      if (await getAi()) { send('voice:record', {}); return; }
      awaitingCommandUntil = Date.now() + 7000;
      send('voice:state', { state: 'ecoute' });
      return;
    }
    if (grammar === 'cmd' || grammar === 'music' || grammar === 'view') { if (confidence >= 0.45) command = stripWake(text) ?? text; }
    else {
      const after = stripWake(text);
      if (after) command = after;
      else if (after === '' ) { speak('Oui ?'); if (await getAi()) { send('voice:record', {}); return; } awaitingCommandUntil = Date.now() + 7000; send('voice:state', { state: 'ecoute' }); return; }
      else if (Date.now() < awaitingCommandUntil && confidence >= 0.4) command = text;
    }
    if (!command) return;
    awaitingCommandUntil = 0;
    send('voice:heard', { text: command });
    const r = await runCommand(command, { voice: true });
    send('voice:reply', r);
  }, (state, message) => send('voice:state', { state, message }), { names: listenNames() });
}
// La liste d'écoute suit la bibliothèque (nouveaux jeux installés)
setInterval(() => { if (stopListening && listenNames().join('|') !== voiceNames) setVoice(true); }, 60_000);
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
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:log', async () => {
  const file = path.join(app.getPath('userData'), 'erreurs.log');
  const { stat } = await import('node:fs/promises');
  if (!(await stat(file).catch(() => null))) return { ok: false };
  await shell.openPath(file);
  return { ok: true };
});
ipcMain.handle('win:fullscreen', (_e, on) => { if (!win) return false; win.setFullScreen(on === undefined ? !win.isFullScreen() : Boolean(on)); return win.isFullScreen(); });
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
  // Recherche rapide depuis n'importe où : le launcher s'ouvre directement sur la barre de recherche
  globalShortcut.register('CommandOrControl+Alt+Space', () => { showWindow(); send('palette:open', {}); });
  globalShortcut.register('CommandOrControl+Alt+H', () => (win?.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  setTimeout(() => checkDeals().catch(() => {}), 60_000);
  setInterval(() => checkDeals().catch(() => {}), 6 * 3_600_000);
  startTracker(() => items, store, (ids) => {
    lastActive = { ids, at: Date.now() };
    const g = items.find((i) => ids.includes(i.id) && i.kind === 'game');
    if (g && detected?.id !== g.id) detected = { id: g.id, name: g.name, start: Date.now() - 60_000 };
    win?.webContents.send('lib:active', ids);
  }, 60_000, accountFor);
  if (store.data.settings.voice) setTimeout(() => setVoice(true), 3000);
}
app.on('before-quit', () => { quitting = true; endBoost({ silent: true }).catch(() => {}); rpc.reset(); });
app.on('window-all-closed', (e) => e.preventDefault());

