// History Launcher : toute la bibliothèque du PC (Steam, Epic, autres launchers, applis) dans une seule fenêtre.
import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, Notification, powerMonitor, protocol, safeStorage, screen, shell, Tray } from 'electron';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { LAUNCHER_NAMES, SOURCES, creditLive, findExe, merge, playtimeOf, scanAll } from './core/library.js';
import { aiFindArt, assistant, createAi, geminiKeyFromEnv, recommend, createRemoteAi } from './core/ai.js';
import { coverOf, mediaKey, nowPlaying } from './core/media.js';
import { activeItems, gameExes, itemHistory, periodItems, periodStats, runningPaths, statCategory } from './core/tracker.js';
import { BOOST_APPS, HIGH_PERFORMANCE, activeScheme, boostPlan, closeApps, setScheme, tuneScript, untuneScript, CPU_SCRIPT, parseCpu, cpuHogs } from './core/boost.js';
import { DRIVER_LINKS, gpuDrivers, heatAlerts, oldDriver, setQuiet, snapshot } from './core/monitor.js';
import { cleanTarget, cleanTargets, measureTargets } from './core/cleanup.js';
import { GAME_TWEAKS, applySystemTweaks, deepClean, diskSize, emptyRecycleBin, extraTargets, freeSpace, groupOf, healthScore, optimizeStorage, orphanGameFolders, recycleBinSize, removeOrphan, repairWindows, resetPlan, riskyLeft, scoreLabel, setStartup, setTweak, startupApps, steamJunk, systemTweakStates, tweakStates } from './core/optimize.js';
import { CATEGORIES, JUNK_LABELS, SUSPECT_LABELS, deepScan, storageScore } from './core/deepscan.js';
import { KINDS as WU_KINDS, installUpdates, searchUpdates } from './core/winupdate.js';
import { unifiedHealth, windowsEvents } from './core/health.js';
import { PERF_GROUP_SCRIPT, captureFps, ensurePresentMon } from './core/fps.js';
import { RL_PORT, classify, enableStatsIni, jsonStream, matchTracker, parseTracker, rlSummary, statsIni, trackerUrl } from './core/rocketleague.js';
import { HOGS_PS, beforeAfter, fpsTone, memoryHogs, overlayCheck, perfBaseline, perfDelta, perfLine, prelaunchChecks, stutterCause } from './core/prelaunch.js';
import { BALANCED, POWER_SAVER, backupSaves, bestDeal, brightness, clearDir, dirSize, findSaveDirs, listBackups, moveSteamGame, newerVersion, nvidiaLatest, nvidiaVersion, packSaves, priceAlert, readPack, restoreBackup, unpackSaves, shaderCaches, fortnitePerf, fortniteState, steamPrice, windowsToasts } from './core/gametools.js';
import { steamLibraries } from './core/steam.js';
import { listSteamAccounts, steamAchievements, steamAppInfo, steamNames, lastSteamUser, steamStoreAssets } from './core/steam.js';
import { listEpicAccounts } from './core/epic.js';
import { readRegValue, NOT_GAME } from './core/registry.js';
import { steamMatch } from './core/art.js';
import { norm } from './core/sort.js';
import { steamPath } from './core/library.js';
import { epicActions, epicStoreSearch } from './core/epic.js';
import { steamActions, steamDetails } from './core/steam.js';
import { createStore } from './core/store.js';
import { folderSize, safeGameDir, uninstallFiles } from './core/manage.js';
import { applyAction, gameActions, graphicsPacks, revertEntries } from './core/gameopti.js';
import { verifyGame } from './core/verify.js';
import { epicFreeGames } from './core/freegames.js';
import { friendLink, newDeals, steamFriends, wishlistDeals } from './core/social.js';
import { DiscordPresence, activityFor } from './core/discordRpc.js';
import { translateNews, dominantColor, fortniteNews, playReminders, steamNews, todayGameMinutes, weeklyRecap } from './core/daily.js';
import { badges, hourly, levelOf, rediscover, streakOf } from './core/progress.js';
import { dnsTest, pingHosts } from './core/net.js';
import { checkReq, parseReq } from './core/reqs.js';
import { gogGames, ubisoftGames } from './core/stores.js';
import { demoActivity, demoBench, demoEvents, demoFriends, demoGameActs, demoItems, demoPerf, demoScan, demoTemps, demoWu } from './core/demo.js';
import { captureDir, captureName } from './core/capture.js';
import { GMOD_APPID, installedAddons, workshopDetails, workshopId } from './core/gmod.js';
import { analyze, defenderRemove, defenderUpdate, defenderScan, parseDiag, pcDiagnostic, processes } from './core/pcdiag.js';
import { VERSION as BENCH_VERSION, cpuBench, diskBench, ramBench, scores, tier } from './core/bench.js';
import { isFresh, mergeBackup, pickBackup } from './core/backup.js';
import { graphicsAdvice } from './core/graphics.js';
import { cardFor, canJoin, joinFor, lastFivemServer, newlyPlaying, playingCard, playingMap } from './core/friendsync.js';
import { fivemDir, fivemServerInfo, fivemServerLogs, joinLink, scanFivem, serverCode, serverMinutes } from './core/fivem.js';
import { achievementsOf, capturesOf, customItem, nameFromExe, scanXbox, timeToBeat, validAumid } from './core/extras.js';
import { readRegistry } from './core/registry.js';
import { directEnv, insideDir, launchPlan, hasAntiCheat } from './core/direct.js';
import { findItem as findByName, similarity, stripWake, understand } from './core/commands.js';
import { listVoices, speak as speakRaw, startListening } from './core/voice.js';
// Réponses à voix haute : coupables, voix au choix (Paramètres › Général)
const speak = (t) => { if (store.data.settings.voiceReply !== false) speakRaw(t, store.data.settings.voiceName); };
import { session } from 'electron';
import { enrich } from './core/art.js';
import { startTracker } from './core/tracker.js';
import { crashesFor, diskAlerts, diskHealth, loadVerdict, netAdvice, parsePing, readCrashes, windowScript } from './core/gamecare.js';
import nodeNet from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import { ps } from './core/pshost.js';
import { collectConfigs, mergeConfigs, restoreConfigs } from './core/gameconfigs.js';
import { setAppVolume } from './core/appvolume.js';
import { lanAddress, newPin, REMOTE_PORT, startRemote } from './core/remote.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Sons des notifications (fenêtre en bas à gauche) : jouables sans clic préalable
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
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

// Nom de l'appli partout dans Windows (notifications, mélangeur de volume, gestionnaire des tâches) : « History Launcher »,
// jamais « Electron ». L'identifiant est le même que celui de l'installateur (raccourcis du menu Démarrer).
app.setName('History Launcher');
if (process.platform === 'win32') app.setAppUserModelId('fr.historyia.launcher');
// Sécurité : bac à sable pour toutes les fenêtres, aucune navigation / fenêtre / webview vers l'extérieur,
// outils développeur fermés dans la version installée (personne ne peut injecter de code dans l'appli)
if (process.platform === 'win32') app.enableSandbox();
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (ev, url) => { if (!String(url).startsWith('file:')) ev.preventDefault(); });
  wc.on('will-attach-webview', (ev) => ev.preventDefault());
  if (app.isPackaged) wc.on('devtools-opened', () => wc.closeDevTools());
});

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

// Mode léger : rangée dans la barre des tâches depuis 3 min, la fenêtre est libérée de la mémoire (≈ 150 Mo) ;
// le suivi du temps, les amis et les mises à jour continuent. Elle se recrée en une seconde au prochain clic.
let lightTimer = null;
function scheduleLight() {
  clearTimeout(lightTimer);
  lightTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || win.isVisible() || quitting || process.env.LAUNCHER_SHOT) return;
    if (benchRunning || deepAbort || wuBusy || asks.size) return scheduleLight(); // une tâche en cours : on attend
    win.destroy();
  }, 3 * 60_000);
}
function showWindow() {
  clearTimeout(lightTimer);
  if (!win || win.isDestroyed()) return createWindow();
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
  win.webContents.on('did-finish-load', () => { const z = store.data.settings?.textScale; if (z && z !== 1) win.webContents.setZoomFactor(z); });
  // Bancs d'essai : LAUNCHER_METRICS=ms affiche la mémoire de chaque processus puis quitte
  if (process.env.LAUNCHER_METRICS) setTimeout(() => { console.log(`HEAP ${JSON.stringify(Object.fromEntries(Object.entries(process.memoryUsage()).map(([k, v]) => [k, Math.round(v / 1e6)])))}`); console.log(`METRICS ${JSON.stringify(app.getAppMetrics().map((m) => ({ type: m.type, name: m.name ?? '', mo: Math.round(m.memory.workingSetSize / 1024) })))}`); app.exit(0); }, Number(process.env.LAUNCHER_METRICS) || 20_000);
  // Bancs d'essai : LAUNCHER_SHOT=fichier.png fait une capture de la fenêtre puis quitte
  if (process.env.LAUNCHER_SHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const { writeFile } = await import('node:fs/promises');
      // LAUNCHER_SHOT_JS : script de mise en scène avant la capture (bancs d'essai uniquement)
      if (process.env.LAUNCHER_SHOT_JS) { await win.webContents.executeJavaScript(process.env.LAUNCHER_SHOT_JS).catch(() => {}); await new Promise((r) => setTimeout(r, 1200)); }
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
  win.on('hide', () => { scheduleLight(); win?.webContents.send('ui:trim'); });
  win.on('minimize', () => win?.webContents.send('ui:trim'));
  win.on('show', () => clearTimeout(lightTimer));
  win.on('closed', () => { win = null; });
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
// IA : clé perso si elle existe (anciens réglages ou version développeur), sinon via le serveur History (compte connecté)
let aiCache = { key: null, ai: null };
async function getAi() {
  const key = secret('gemini') ?? await geminiKeyFromEnv(path.join(here, '..'));
  if (key) {
    if (key !== aiCache.key) aiCache = { key, ai: await createAi(key) };
    return aiCache.ai;
  }
  const token = secret('account');
  if (!token) return null;
  if (aiCache.key !== `compte:${token}`) aiCache = { key: `compte:${token}`, ai: createRemoteAi((body) => api('/api/compte/ia', { method: 'POST', token, body })) };
  return aiCache.ai;
}
const send = (channel, payload) => (win && !win.isDestroyed() ? win.webContents.send(channel, payload) : undefined);
async function remerge() {
  items = merge(raw, store.data, localUrls, timeOptions());
  await Promise.all(items.map(async (i) => { i.iconData = await iconOf(i); }));
  return items;
}

async function scan() {
  await refreshAccounts();
  const [found, xbox, fivem] = await Promise.all([scanAll({}, { steamApiKey: secret('steam') }), scanXbox().catch(() => []), scanFivem(undefined, store.data.fivemSessions ?? []).catch(() => ({ item: null }))]);
  if (fivem.item) store.data.fivemSessions = fivem.sessions; // sessions gardées même quand FiveM efface ses vieux journaux
  if (fivem.item) store.data.fivemLogs = await fivemServerLogs(fivemDir(), store.data.fivemLogs ?? {}).catch(() => store.data.fivemLogs ?? {});
  // GOG et Ubisoft Connect (registre) ; les mêmes jeux vus comme simples programmes sont retirés
  const [gogReg, ubiReg] = await Promise.all([readRegistry('HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games'), readRegistry('HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs')]).catch(() => [[], []]);
  const stores = [...gogGames(gogReg), ...ubisoftGames(ubiReg)];
  for (const g of stores) if (!g.exe) g.exe = await findExe(g.installDir).catch(() => null);
  const storeDirs = new Set(stores.map((g) => g.installDir.toLowerCase().replace(/[\\/]+$/, '')));
  const notDup = (i) => !(i.installDir && storeDirs.has(String(i.installDir).toLowerCase().replace(/[\\/]+$/, '')));
  raw = [...found.filter((i) => !(fivem.item && /^fivem$/i.test(i.name ?? '')) && notDup(i)), ...stores, ...xbox, ...(fivem.item ? [fivem.item] : []), ...Object.values(store.data.custom ?? {}).map(customItem)];
  if (process.env.LAUNCHER_DEMO) raw = demoItems();
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
    // (jeux Epic : aussi quand il manque le logo ou le grand fond, ex. Fortnite)
    const todo = raw.filter((i) => i.source !== 'steam' && (!(i.art?.cover || i.art?.hero) || (i.source === 'epic' && i.kind === 'game' && !(i.art?.logo && i.art?.hero && i.art?.cover) && !fresh(i))));
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
const SAFE_LINK = /^(steam:\/\/(rungameid|install|uninstall|validate)\/\d+|com\.epicgames\.launcher:\/\/(apps\/[\w%.-]+\?action=(launch|verify|install)(&silent=true)?|store\/library)|https:\/\/store\.steampowered\.com\/app\/\d+|https:\/\/store\.epicgames\.com\/fr\/p\/[\w-]+|https:\/\/steamcommunity\.com\/profiles\/\d{17}|https:\/\/store\.steampowered\.com\/news\/app\/\d+\/view\/\d+|steam:\/\/url\/(CommunityFilePage\/\d{6,12}|SteamWorkshopPage\/4000)|fivem:\/\/connect\/(cfx\.re\/join\/[a-z0-9]{4,10}|\d{1,3}(\.\d{1,3}){3}:\d{2,5})|https:\/\/(www\.steamgriddb\.com\/profile\/preferences\/api|steamcommunity\.com\/dev\/apikey)|https:\/\/historylauncher\.vercel\.app\/)$/;
const isDriverLink = (u) => DRIVER_LINKS.includes(u) || /^https:\/\/(www\.nvidia\.com\/[\w/.%?=&-]*|[\w-]+\.download\.nvidia\.com\/[\w/.%-]+\.exe)$/.test(String(u));
const openLink = (url) => (SAFE_LINK.test(url) || isDriverLink(url) ? shell.openExternal(url) : Promise.reject(new Error('lien refusé')));

// Confirmation dans une fenêtre du launcher (même style que le reste), réponse renvoyée par l'interface
let askSeq = 0;
const asks = new Map();
ipcMain.on('ui:answer', (_e, id, ok) => { asks.get(id)?.(Boolean(ok)); asks.delete(id); });
async function confirm(message, detail, opts = {}) {
  if (!win || win.isDestroyed()) { showWindow(); await new Promise((r) => win.webContents.once('did-finish-load', () => setTimeout(r, 800))); }
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
  measureLoad(item).catch(() => {});
  launchCompanions(item).catch(() => {});
  // Profil du jeu : copie des sauvegardes juste avant de jouer
  if (profileOf(item.id).saves) savesBackup(item).catch(() => {});
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
let pcAway = false;
let playSession = null;
let lastActive = { ids: [], at: 0 };
// Partie en cours : lancée par le launcher, sinon repérée par le suivi du temps (dans les 2 dernières minutes)
let detected = null;
const currentSession = () => playSession ?? (detected && Date.now() - lastActive.at < 120_000 && lastActive.ids.includes(detected.id) ? detected : null);
let boosted = null;
const boostSettings = () => ({ enabled: false, power: true, close: [], restore: true, tune: true, ...(store.data.settings.boost ?? {}) });
// Mode streamer : pas de notifications Windows ni de cartes d'amis (pseudos, messages) pendant un live
let obsRunning = false;
const streaming = () => Boolean(store.data.settings.streamer || (store.data.settings.streamerAuto !== false && obsRunning));
class Notif extends Notification {
  constructor(o) { super(o); this.o = o; }
  show() { logNotif({ kind: 'app', icon: '🔔', title: this.o?.title, body: this.o?.body }); if (!streaming()) super.show(); }
}
function notify(title, body) {
  if (Notification.isSupported()) new Notif({ title, body, icon: ICON, silent: true }).show();
}
async function startBoost(item, force = null) {
  const b = force ? { ...boostSettings(), enabled: true, close: force.close ?? [], power: Boolean(force.power), tune: Boolean(force.priority) } : boostSettings();
  // Réglage par jeu : « toujours » (même si l'opti auto est coupée) ou « jamais » pour ce jeu
  const perGame = b.games?.[item.id];
  const prof = profileOf(item.id);
  if ((!force && (perGame === false || (!b.enabled && perGame !== true && !prof.enabled && !store.data.settings.tournament))) || boosted || process.platform !== 'win32') return;
  const power = force ? b.power : prof.enabled ? prof.power !== 'none' : b.power;
  const scheme = power ? await activeScheme() : null;
  if (scheme && scheme !== HIGH_PERFORMANCE) await setScheme(HIGH_PERFORMANCE);
  const closed = await closeApps(boostPlan(await runningPaths(), force ? b.close : [...new Set([...b.close, ...(prof.enabled ? prof.close : [])])]));
  // Profil du jeu : notifications de Windows coupées pendant la partie (remises à la fin)
  const quiet = Boolean(force ? force.quiet : prof.enabled && prof.quiet) && await windowsToasts(false);
  boosted = { item, scheme, closed, quiet, start: Date.now(), misses: 0, hogs: {} };
  (store.data.boostedAt ??= {})[item.id] = Date.now();
  if (!force) notify('Boost activé', `${item.name} : performances élevées${closed.length ? `, ${closed.length} appli(s) fermée(s)` : ''}.`);
  boosted.timer = setInterval(async () => {
    const paths = await runningPaths();
    if (!boosted) return;
    // Dès que le jeu tourne : priorité au jeu (une fois)
    const mine = paths.filter((p) => activeItems([item], [p]).size);
    if (mine.length && !boosted.tuned && b.tune) { boosted.tuned = true; ps(tuneScript(mine)).catch(() => {}); }
    // Freezes : qui prend du processeur pendant la partie
    if (mine.length) {
      const cur = parseCpu(await ps(CPU_SCRIPT).catch(() => ''));
      if (boosted?.cpu) for (const h of cpuHogs(boosted.cpu.map, cur, (Date.now() - boosted.cpu.at) / 1000, os.cpus().length, mine.map((p) => path.win32.basename(p, '.exe')))) boosted.hogs[h.name] = Math.max(boosted.hogs[h.name] ?? 0, h.pct);
      if (boosted) boosted.cpu = { map: cur, at: Date.now() };
    }
    if (Date.now() - boosted.start < 90_000) return; // le jeu a le temps de démarrer
    const running = mine.length > 0;
    boosted.misses = running ? 0 : boosted.misses + 1;
    if (boosted.misses >= 2) endBoost().catch(() => {});
  }, 20_000);
}
// ---------- « Optimiser et jouer » : vérifications, puis réglages temporaires appliqués un par un (tout est remis à la fin) ----------
ipcMain.handle('opti:prepare', async (_e, id) => {
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const [paths, pc, power] = await Promise.all([runningPaths().catch(() => []), snapshot().catch(() => null), process.platform === 'win32' ? activeScheme().catch(() => null) : null]);
  const running = new Set(boostPlan(paths, BOOST_APPS.map((a) => a.id)).map((x) => x.exe));
  const apps = BOOST_APPS.filter((a) => [a.exe].flat().some((e) => running.has(e)) && !(a.id === 'epicbg' && item.source === 'epic')).map(({ id: aid, label }) => ({ id: aid, label }));
  const { statfs } = await import('node:fs/promises');
  const fsInfo = item.installDir ? await statfs(item.installDir).catch(() => null) : null;
  const game = /fortnite/i.test(item.name) ? 'fortnite' : item.source === 'fivem' ? 'fivem' : null;
  const fivemData = item.installDir && path.join(item.installDir, 'FiveM.app');
  const [tweaks, fnPerf, exes, hogText, fivem] = await Promise.all([
    tweakStates().catch(() => []), game === 'fortnite' ? fortniteState().catch(() => null) : null, runningGameExes(item).catch(() => []), process.platform === 'win32' ? ps(HOGS_PS).catch(() => '') : '',
    // FiveM : taille du cache + packs graphiques détectés (gardés tels quels)
    game === 'fivem' ? Promise.all([Promise.all(['cache', 'server-cache', 'server-cache-priv'].map((d) => folderSize(path.join(fivemData, 'data', d)).then((x) => x.bytes))), graphicsPacks([path.join(fivemData, 'plugins')])]).then(([b, packs]) => ({ bytes: b.reduce((a, n) => a + n, 0), packs })).catch(() => null) : null,
  ]);
  const checks = prelaunchChecks({
    apps, power, high: HIGH_PERFORMANCE, fpsOn: store.data.settings.fps === true, tweaks, game, fnPerf,
    ramUsedPct: pc?.ram ? Math.round((100 * pc.ram.used) / pc.ram.total) : null, temp: pc?.cpu?.temp ?? null,
    diskFreeGb: fsInfo ? (fsInfo.bavail * fsInfo.bsize) / 1e9 : null, driver: driverInfo, fivem,
    overlays: overlayCheck(paths), hogs: memoryHogs(hogText, exes).slice(0, 2),
  });
  const base = perfBaseline(store.data.perf?.[id] ?? []);
  const withAvg = (store.data.perf?.[id] ?? []).filter((r) => r.avg);
  const on = withAvg.filter((r) => r.boost); const off = withAvg.filter((r) => !r.boost);
  const mean = (l) => (l.length ? l.reduce((a, r) => a + r.avg, 0) / l.length : null);
  const gain = on.length && off.length ? perfDelta(mean(on), mean(off)) : null;
  return { name: item.name, checks, base, gain, since: beforeAfter(store.data.perf?.[id] ?? [], store.data.optiMark?.[id]), history: withAvg.slice(-10).map((r) => ({ avg: r.avg, boost: Boolean(r.boost) })), boosted: Boolean(boosted), windows: process.platform === 'win32' };
});
ipcMain.handle('opti:launch', async (_e, id, choice = {}) => {
  const item = items.find((i) => i.id === id && i.installed);
  if (!item) return { ok: false };
  const step = (text, pct) => send('opti:step', { text, pct });
  const c0 = choice;
  const c = { close: Array.isArray(choice.close) ? choice.close.map(String).filter((x) => BOOST_APPS.some((a) => a.id === x)) : [], power: Boolean(choice.power), priority: Boolean(choice.priority), quiet: Boolean(choice.quiet) };
  step('Analyse de ton PC…', 10);
  // Avant / après : la 1re optimisation de ce jeu sépare tes parties d'avant de celles d'après
  (store.data.optiMark ??= {})[item.id] ??= Date.now();
  // Réglages de jeu Windows (photo des réglages prise avant : « Remettre Windows comme avant » les annule)
  if (c0.wintweaks && process.platform === 'win32') {
    step('Mode Jeu de Windows et capture Xbox en fond…', 20);
    await snapshotSettings('Avant « Optimiser et jouer »').catch(() => {});
    for (const t of ['gamemode', 'dvr']) await setTweak(t, true).catch(() => {});
  }
  if (c0.fnperf && /fortnite/i.test(item.name)) { step('Mode Performance de Fortnite…', 25); await fortnitePerf(true).catch(() => {}); }
  if (c0.fivemcache && item.source === 'fivem') {
    step('Vidage du cache FiveM (mods gardés)…', 25);
    for (const d of shaderCaches(item).filter((x) => x.id.startsWith('fivem-'))) await clearDir(d.dir).catch(() => {});
  }
  if (process.platform === 'win32' && !boosted) {
    if (c.close.length) step(`Fermeture de ${c.close.length} appli${c.close.length > 1 ? 's' : ''} en arrière-plan…`, 30);
    if (c.power) step('Passage en mode « Performances élevées »…', 50);
    await startBoost(item, c).catch(() => {});
    if (c.quiet) step('Notifications Windows en pause pendant la partie…', 65);
    if (c.priority) step('Priorité au jeu (dès qu’il démarre)…', 75);
  }
  if (choice.perfbar) {
    store.data.settings.perfbar = true; store.save();
    if (store.data.settings.fps !== true && process.platform === 'win32') {
      step('Activation de la mesure des FPS (Windows demande l’autorisation une seule fois)…', 82);
      const f = await enableFps().catch(() => ({ ok: false }));
      if (f.relog) notify('Mesure des FPS activée', 'Reconnecte-toi à Windows une fois (ou redémarre le PC) : ensuite tes FPS s’affichent dans le mini-compteur.');
    }
  }
  step('Lancement du jeu…', 90);
  const r = await doAction(item.id, 'launch').catch((err) => ({ ok: false, error: err.message }));
  step(r?.ok === false ? 'Lancement impossible' : 'Prêt ! Bon jeu 🎮', 100);
  return r ?? { ok: true };
});

// ---------- Mini-barre de performances en jeu (toute petite, lisible, cachable avec Ctrl+Alt+P) ----------
let perfbar = null;
function perfbarData() {
  if (!sess) return null;
  const base = perfBaseline(store.data.perf?.[sess.id] ?? []);
  const last = sess.samples.at(-1) ?? {};
  const fps = sess.live?.avg ? Math.round(sess.live.avg) : null;
  return { game: sess.name, fps, state: sess.fpsState ?? null, gpu: last.gpu != null ? Math.round(last.gpu) : null, delta: perfDelta(sess.live?.avg, base?.avg), text: perfLine({ fps, delta: perfDelta(sess.live?.avg, base?.avg), gpu: last.gpu }) };
}
function perfbarPush() { if (perfbar && !perfbar.isDestroyed()) { const d = perfbarData(); if (d) perfbar.webContents.send('perfbar:data', d); } }
function setPerfbar(on) {
  if (!on) { if (perfbar && !perfbar.isDestroyed()) perfbar.close(); perfbar = null; return; }
  if (perfbar && !perfbar.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  perfbar = new BrowserWindow({ width: 230, height: 30, x: area.x + 10, y: area.y + 8, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, hasShadow: false, show: false,
    webPreferences: { preload: path.join(here, 'perfbar.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
  perfbar.setAlwaysOnTop(true, 'screen-saver');
  perfbar.setIgnoreMouseEvents(true); // les clics passent au jeu
  perfbar.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  perfbar.webContents.on('will-navigate', (e) => e.preventDefault());
  perfbar.loadFile(path.join(here, 'ui', 'perfbar.html'));
  perfbar.once('ready-to-show', () => { perfbar?.showInactive(); perfbarPush(); });
  perfbar.on('closed', () => { perfbar = null; });
}
function togglePerfbar() {
  const on = !(perfbar && !perfbar.isDestroyed());
  store.data.settings.perfbar = on; store.save();
  if (on && store.data.settings.fps !== true && process.platform === 'win32') enableFps().then((f) => { if (f.relog) notify('Mesure des FPS activée', 'Reconnecte-toi à Windows une fois : ensuite tes FPS s’affichent dans le mini-compteur.'); }).catch(() => {});
  if (on && !sess) { notify('Mini-compteur de performances', 'Il s’affichera pendant ta prochaine partie (Ctrl+Alt+P pour le cacher).'); return; }
  setPerfbar(on);
}
ipcMain.handle('perfbar:set', (_e, on) => { store.data.settings.perfbar = Boolean(on); store.save(); if (sess) setPerfbar(Boolean(on)); return Boolean(on); });

async function endBoost({ silent = false } = {}) {
  if (!boosted) return;
  const { scheme, closed, timer, quiet, tuned, hogs, start } = boosted;
  if (quiet) await windowsToasts(true);
  if (tuned) ps(untuneScript()).catch(() => {});
  const changed = Boolean((scheme && scheme !== HIGH_PERFORMANCE) || closed.length);
  clearInterval(timer);
  boosted = null;
  playSession = null;
  if (scheme && scheme !== HIGH_PERFORMANCE) await setScheme(scheme);
  // Réouverture discrète : Epic et Steam repartent en fond (sans fenêtre en grand), les autres comme avant
  if (boostSettings().restore) for (const c of closed) spawn(c.path, /epicgameslauncher|steam\.exe/i.test(c.exe) ? ['-silent'] : [], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  // Rapport de fin de partie : durée, applis fermées, et ce qui a pris du processeur (cause probable des freezes)
  const top = Object.entries(hogs).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const mins = Math.round((Date.now() - start) / 60_000);
  if ((changed || top.length) && !silent) notify('Boost terminé', `${mins} min de jeu${closed.length ? `, ${closed.length} appli(s) fermée(s) puis rouvertes` : ''}. PC remis comme avant.${top.length ? ` ⚠ Ont pris du processeur pendant la partie : ${top.map(([n, p]) => `${n} (${p} %)`).join(', ')} : ferme-les avant de jouer si ça a freezé.` : ''}`);
}
ipcMain.handle('boost:get', () => ({ ...boostSettings(), heatAlerts: store.data.settings.heatAlerts !== false, weeklyClean: store.data.settings.optiAuto === true, apps: BOOST_APPS.map(({ id, label }) => ({ id, label })) }));
ipcMain.handle('boost:set', (_e, patch) => {
  const b = boostSettings();
  for (const k of ['enabled', 'power', 'restore', 'tune']) if (k in patch) b[k] = Boolean(patch[k]);
  if (Array.isArray(patch.close)) b.close = patch.close.map(String).filter((id) => BOOST_APPS.some((a) => a.id === id));
  if ('heatAlerts' in patch) store.data.settings.heatAlerts = Boolean(patch.heatAlerts);
  if ('weeklyClean' in patch) store.data.settings.optiAuto = Boolean(patch.weeklyClean);
  if (patch.game && typeof patch.game.id === 'string' && items.some((i) => i.id === patch.game.id)) {
    b.games = { ...(b.games ?? {}) };
    if (patch.game.mode === 'on') b.games[patch.game.id] = true;
    else if (patch.game.mode === 'off') b.games[patch.game.id] = false;
    else delete b.games[patch.game.id];
  }
  store.data.settings.boost = b;
  store.save();
  return b;
});

// ---------- Mon PC : surveillance et nettoyage ----------
ipcMain.handle('pc:snapshot', () => snapshot());

// ---------- Mon PC : diagnostic complet, processus, antivirus, benchmark, rapport ----------
let diagCache = null;
async function runDiag(force = false) {
  if (!force && diagCache && Date.now() - diagCache.at < 120_000) return diagCache.data;
  // LAUNCHER_DEMO_DIAG : PC d'exemple pour les captures de démonstration (bancs d'essai, site)
  const demo = process.env.LAUNCHER_DEMO_DIAG ? (await import('node:fs/promises')).readFile(process.env.LAUNCHER_DEMO_DIAG, 'utf8').then((t) => parseDiag(t)) : null;
  const [raw, snap] = await Promise.all([demo ?? pcDiagnostic(), snapshot().catch(() => null)]);
  if (!raw) return { error: 'Diagnostic disponible sur Windows seulement.' };
  const data = { ...raw, ...analyze(raw, { snap }), snap, at: Date.now() };
  diagCache = { at: Date.now(), data };
  return data;
}
ipcMain.handle('pc:diag', (_e, force) => runDiag(Boolean(force)).catch((err) => ({ error: err.message })));
ipcMain.handle('pc:procs', () => processes().catch((err) => ({ error: err.message })));
ipcMain.handle('pc:kill', async (_e, pid, pathHint) => {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 4 || id === process.pid) return { ok: false, error: 'Processus protégé.' };
  if (/\\windows\\/i.test(String(pathHint ?? ''))) return { ok: false, error: 'Processus de Windows : on n’y touche pas.' };
  const name = String(pathHint ?? '').split(/[\\/]/).pop();
  if (!(await confirm(`Fermer ${name || 'ce programme'} ?`, 'Il se ferme comme avec la croix ; un travail non enregistré peut être perdu.', { ok: 'Fermer', danger: true, icon: '🧠' }))) return { ok: false, cancelled: true };
  try { process.kill(id); return { ok: true }; } catch (err) { return { ok: false, error: err.code === 'EPERM' ? 'Il faut les droits administrateur pour celui-ci.' : err.message }; }
});
ipcMain.handle('pc:defscan', async (_e, type) => { send('pc:progress', { step: 'defender', label: type === 'full' ? 'Analyse antivirus complète (peut durer une heure)…' : 'Analyse antivirus rapide…' }); const r = await defenderScan(type === 'full' ? 'full' : 'quick'); diagCache = null; return r; });
ipcMain.handle('pc:defremove', async () => { const r = await defenderRemove(); diagCache = null; return r; });
// « Corriger » depuis un conseil de Mon PC : liste fixe d'actions sûres (réglages réversibles ou page officielle de Windows)
ipcMain.handle('pc:fix', async (_e, id) => {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows seulement.' };
  const open = (u) => shell.openExternal(u).then(() => ({ ok: true, opened: true }), () => ({ ok: false }));
  diagCache = null;
  switch (String(id)) {
    case 'gamemode': await snapshotSettings('Avant « Corriger » : Mode Jeu').catch(() => {}); return { ok: await setTweak('gamemode', true).catch(() => false) };
    case 'power': await setScheme(HIGH_PERFORMANCE).catch(() => {}); return { ok: (await activeScheme().catch(() => null)) === HIGH_PERFORMANCE };
    case 'sigs': return { ok: await defenderUpdate() };
    case 'threats': return defenderRemove();
    case 'av': return open('windowsdefender://threatsettings');
    case 'display': return open('ms-settings:display-advanced');
    case 'storage': return open('ms-settings:storagesense');
    case 'driver': return driverInfo?.link ? openLink(driverInfo.link).then(() => ({ ok: true, opened: true }), () => ({ ok: false })) : open('ms-settings:windowsupdate');
    case 'reboot':
      if (!(await confirm('Redémarrer le PC ?', 'Enregistre ton travail : le PC redémarre dans 1 minute (annulable avec « shutdown /a »).'))) return { ok: false, cancelled: true };
      spawn('shutdown.exe', ['/r', '/t', '60', '/c', 'History Launcher : redémarrage demandé'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    default: return { ok: false };
  }
});

// Plus gros fichier d'un jeu installé (lu pour mesurer la vraie vitesse de lecture du disque, jamais modifié)
async function bigGameFile() {
  const { readdir: rd, stat: st } = await import('node:fs/promises');
  let best = null;
  for (const g of items.filter((i) => i.kind === 'game' && i.installed && i.installDir).slice(0, 12)) {
    const stack = [[g.installDir, 0]]; let seen = 0;
    while (stack.length && seen < 3000) {
      const [dir, depth] = stack.pop();
      for (const d of await rd(dir, { withFileTypes: true }).catch(() => [])) {
        seen += 1;
        const p = path.join(dir, d.name);
        if (d.isDirectory() && depth < 4) stack.push([p, depth + 1]);
        else if (d.isFile()) { const s = await st(p).catch(() => null); if (s && s.size > (best?.size ?? 1024 ** 3)) best = { path: p, size: s.size }; }
      }
    }
  }
  return best?.path ?? null;
}
async function runBench() {
  let pct = 0;
  const step = (label, p = null) => { if (p != null) pct = p; else pct = Math.min(95, pct + 2.5); send('pc:progress', { step: 'bench', pct: Math.round(pct), label }); };
  step('Préparation…', 1);
  const cpu = await cpuBench({ onStep: (l) => step(l) });
  step('Mémoire · débit et latence…', 50);
  const ram = ramBench();
  step('Recherche d’un gros fichier de jeu à lire…', 55);
  const readFile = await bigGameFile().catch(() => null);
  const disk = await diskBench(app.getPath('temp'), { readFile, onStep: (l) => step(l) }).catch(() => null);
  step('Carte graphique · 3 scènes en 2560×1440…', 70);
  const gpu = await gpuBench().catch(() => null);
  const r = { v: BENCH_VERSION, at: Date.now(), cpu, ram, disk, gpu, cpuName: os.cpus()[0]?.model?.trim() ?? null };
  r.scores = scores(r);
  r.tier = tier(r.scores.total);
  store.data.bench = [r, ...(store.data.bench ?? [])].slice(0, 12);
  store.save();
  submitBench(r).catch(() => {});
  send('pc:progress', { step: 'done', pct: 100, label: 'Terminé' });
  return r;
}
function gpuBench() {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ width: 1280, height: 720, title: 'Benchmark · History Launcher', backgroundColor: '#07060a', autoHideMenuBar: true, icon: ICON,
      webPreferences: { preload: path.join(here, 'bench.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.on('will-navigate', (e) => e.preventDefault());
    let done = false;
    const finish = (r) => { if (done) return; done = true; ipcMain.removeListener('bench:gpu', onRes); if (!w.isDestroyed()) w.close(); resolve(r); };
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    const onRes = (e, r) => {
      if (e.sender !== w.webContents) return;
      const scenes = { geometry: num(r?.scenes?.geometry), shader: num(r?.scenes?.shader), post: num(r?.scenes?.post) };
      finish({ scenes, renderer: typeof r?.renderer === 'string' ? r.renderer.slice(0, 120) : null, msaa: Number(r?.msaa) || 0, hdr: Boolean(r?.hdr), error: r?.error ?? null });
    };
    ipcMain.on('bench:gpu', onRes);
    w.on('closed', () => finish({ scenes: {}, error: 'fenêtre fermée' }));
    setTimeout(() => finish({ scenes: {}, error: 'trop long' }), 180_000);
    w.loadFile(path.join(here, 'ui', 'bench-gpu.html'));
  });
}
let benchRunning = false;
ipcMain.handle('pc:bench', async () => {
  if (benchRunning) return { error: 'Benchmark déjà en cours.' };
  benchRunning = true;
  try { return await runBench(); } catch (err) { return { error: err.message }; } finally { benchRunning = false; }
});
ipcMain.handle('pc:benchHistory', () => (process.env.LAUNCHER_DEMO ? demoBench() : store.data.bench ?? []));

/** Rapport détaillé écrit par l'IA à partir des vraies mesures (sans IA : rapport automatique). */
async function pcReport(diag, procs, bench, extra = '') {
  const facts = [
    `Processeur : ${diag.cpu.name} (${diag.cpu.cores} cœurs)`, `Cartes graphiques : ${diag.gpus.map((g) => g.name).join(', ')}`,
    `Mémoire : ${diag.ramGb} Go en ${diag.ram.length} barrette(s), ${diag.ram.map((m) => `${m.configured}/${m.speed} MHz`).join(', ')}`,
    ...diag.components.filter((c) => c.key.startsWith('disk') || c.key === 'bat').map((c) => `${c.title} ${c.name} : ${c.specs.join(', ')} ; ${c.life?.text}`),
    `Windows : ${diag.os.name} ${diag.os.build}, allumé depuis ${diag.os.uptimeDays} jours`,
    `Score de santé : ${diag.score}/100`, `Conseils : ${diag.advice.map((a) => a.title).join(' ; ') || 'aucun'}`,
    procs?.length ? `Plus gros programmes : ${procs.slice(0, 8).map((p) => `${p.name} (${p.cpu} % CPU, ${Math.round(p.ram / 1e6)} Mo)`).join(', ')}` : '',
    procs?.some((p) => p.suspect) ? `Programmes louches (non signés, dossier temporaire) : ${procs.filter((p) => p.suspect).map((p) => p.path).join(', ')}` : '',
    bench ? `Benchmark History : total ${bench.scores.total} (${bench.tier}) ; processeur 1 cœur ${bench.scores.cpu1}, multi ${bench.scores.cpuN}, mémoire ${bench.scores.ram}, disque ${bench.scores.disk}, graphique ${bench.scores.gpu} (1000 = PC de jeu milieu de gamme)` : '',
    extra,
  ].filter(Boolean).join('\n');
  const ai = await getAi().catch(() => null);
  if (ai) {
    const text = await ai.ask({
      system: 'Tu es un technicien PC gamer expert. Tu écris en français, en tutoyant, un rapport clair et concret. Uniquement à partir des mesures fournies : n’invente aucun chiffre. Structure : « Verdict » (2 phrases), « Points forts », « Points faibles », « À faire en priorité » (liste numérotée, avec le gain attendu), « Durée de vie des composants ». Pas de markdown gras, juste des titres suivis de deux-points et des tirets.',
      text: facts,
    }).catch(() => null);
    if (text) return { ai: true, text };
  }
  return { ai: false, text: `Verdict : score de santé ${diag.score}/100.\n\nÀ faire en priorité :\n${diag.advice.map((a, i) => `${i + 1}. ${a.title} : ${a.text}${a.gain ? ` (${a.gain})` : ''}`).join('\n') || 'Rien d’urgent, ton PC est en forme.'}\n\nDurée de vie :\n${diag.components.filter((c) => c.life?.pct != null).map((c) => `- ${c.title} ${c.name} : ${c.life.text}`).join('\n') || '- Pas de composant qui s’use détecté.'}` };
}
ipcMain.handle('pc:report', async () => {
  const diag = await runDiag();
  if (diag.error) return diag;
  const procs = await processes().catch(() => []);
  const ds = store.data.deepScan;
  const ev = eventsCache?.data;
  const extra = [
    ds ? `Analyse pro des fichiers (${new Date(ds.at).toLocaleDateString('fr-FR')}) : ${ds.files} fichiers lus, ${Math.round(ds.junkBytes / 1e8) / 10} Go de fichiers inutiles, ${Math.round(ds.dupWasted / 1e8) / 10} Go de doublons, ${ds.threats} menace(s) confirmée(s) par l’antivirus` : '',
    ev ? `Journal de Windows (7 jours) : ${ev.bsod} écran(s) bleu(s), ${ev.power} arrêt(s) brutal(aux), ${ev.whea} erreur(s) matérielle(s), ${ev.disk} erreur(s) disque, ${ev.gpu} plantage(s) du pilote graphique${ev.crashes.length ? ` ; applis qui plantent : ${ev.crashes.map((c) => `${c.name} (${c.count})`).join(', ')}` : ''}` : '',
    store.data.healthLast ? `Score de santé global : ${store.data.healthLast.score}/100` : '',
  ].filter(Boolean).join('\n');
  return pcReport(diag, procs, store.data.bench?.[0] ?? null, extra);
});
// ---------- Progression : niveau, badges, série, heures de jeu, sessions, à redécouvrir ----------
ipcMain.handle('progress:get', async () => {
  const games = items.filter((i) => i.kind === 'game');
  const total = games.reduce((n, i) => n + (i.minutes || 0), 0);
  const friends = (socialLive?.amis ?? []).length;
  const act = process.env.LAUNCHER_DEMO ? demoActivity() : { days: store.data.days, sessions: store.data.sessions ?? [] };
  const shotsBy = new Map();
  const sess = await Promise.all(act.sessions.slice(-15).reverse().map(async (x) => {
    const it = items.find((i) => i.id === x.id);
    if (it && !shotsBy.has(it.id)) shotsBy.set(it.id, await capturesOf(it, { steamRoot: await steamPath(), accountIds: steamAccounts.map((a) => a.id) }).catch(() => []));
    const shots = (shotsBy.get(x.id) ?? []).filter((c) => c.at >= x.start - 60_000 && c.at <= x.end + 120_000).length;
    return { ...x, name: it?.name ?? 'Jeu', shots };
  }));
  return {
    level: levelOf(total), totalMinutes: total, streak: streakOf(act.days),
    badges: badges({ items, days: act.days, sessions: act.sessions, friends, bench: (process.env.LAUNCHER_DEMO ? demoBench() : store.data.bench ?? [])[0] ?? null, health: diagCache?.data?.score ?? store.data.diagHistory?.at(-1)?.score ?? null, collections: Object.keys(store.data.collections ?? {}).length }),
    hourly: hourly(act.days, 30), sessions: sess, rediscover: rediscover(items).map((i) => i.id),
  };
});

// ---------- Réseau : latence vers les services de jeu et vitesse des DNS ----------
ipcMain.handle('net:ping', () => pingHosts().catch((err) => ({ error: err.message })));
ipcMain.handle('net:dns', () => dnsTest().catch((err) => ({ error: err.message })));

// ---------- Point de restauration Windows (avant une optimisation) ----------
ipcMain.handle('pc:restorepoint', async () => {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows seulement.' };
  const { execFile } = await import('node:child_process');
  const cmd = "Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-Command','Enable-ComputerRestore -Drive $env:SystemDrive; Checkpoint-Computer -Description ''History Launcher'' -RestorePointType MODIFY_SETTINGS'";
  return new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 180_000 }, (err) => resolve(err ? { ok: false, error: 'Autorisation refusée ou restauration désactivée.' } : { ok: true })));
});

// ---------- Mon PC peut-il faire tourner ce jeu ? (configuration Steam vs PC mesuré) ----------
ipcMain.handle('game:reqs', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  if (!item?.steamId) return { error: 'Disponible pour les jeux Steam.' };
  const det = store.data.art[item.id]?.details?.requirements ? store.data.art[item.id].details : await steamDetails(item.steamId).catch(() => null);
  const req = det?.requirements;
  if (!req?.min && !req?.rec) return { error: 'Steam ne donne pas de configuration pour ce jeu.' };
  const diag = await runDiag().catch(() => null);
  const drive = String(item.installDir ?? 'C:').slice(0, 1).toUpperCase();
  const vol = diag?.volumes?.find((v) => v.letter.toUpperCase() === drive) ?? diag?.volumes?.[0];
  const gpu = diag?.gpus?.find((g) => !/intel|uhd|iris/i.test(g.name)) ?? diag?.gpus?.[0];
  const pc = { ramGb: diag?.ramGb ?? Math.round(os.totalmem() / 1024 ** 3), freeGb: vol ? vol.free / 1e9 + (item.installed ? (item.size ?? 0) / 1e9 : 0) : null, vramGb: gpu?.vram ? gpu.vram / 1024 ** 3 : null };
  const min = checkReq(parseReq(req.min), pc);
  const rec = checkReq(parseReq(req.rec), pc);
  const mine = { cpu: diag?.cpu?.name ?? os.cpus()[0]?.model, gpu: gpu?.name ?? null, ...pc };
  let ai = null;
  const brain = await getAi().catch(() => null);
  if (brain && (min || rec)) {
    ai = await brain.ask({ system: 'Tu es un expert matériel PC gaming. Réponds en français, tutoie, 3 phrases maximum, sans inventer de chiffres de FPS.', text: `Jeu : ${item.name}\nMon processeur : ${mine.cpu}\nMa carte graphique : ${mine.gpu}\nMa mémoire : ${mine.ramGb} Go\nMinimum demandé : processeur ${min?.cpu ?? '?'} ; carte ${min?.gpu ?? '?'}\nRecommandé : processeur ${rec?.cpu ?? '?'} ; carte ${rec?.gpu ?? '?'}\nMon processeur et ma carte graphique atteignent-ils le minimum puis le recommandé ? Quelle qualité graphique viser ?` }).catch(() => null);
  }
  return { name: item.name, min, rec, mine, ai };
});

// ---------- Conseils de l'IA pour un jeu (réglages graphiques selon ce PC + astuces) ----------
ipcMain.handle('ai:gametips', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  if (!item) return { error: 'Jeu introuvable.' };
  const brain = await getAi().catch(() => null);
  if (!brain) return { error: 'Connecte-toi à ton compte History pour les conseils de l’IA.' };
  const diag = await runDiag().catch(() => null);
  const pcTxt = diag && !diag.error ? `Processeur ${diag.cpu.name}, ${diag.ramGb} Go de mémoire, carte ${diag.gpus.map((g) => `${g.name}${g.vram ? ` ${Math.round(g.vram / 1024 ** 3)} Go` : ''}`).join(' + ')}, écran ${diag.gpus[0]?.width ?? '?'}×${diag.gpus[0]?.height ?? '?'} à ${diag.gpus[0]?.hz ?? '?'} Hz` : `Processeur ${os.cpus()[0]?.model}, ${Math.round(os.totalmem() / 1024 ** 3)} Go de mémoire`;
  const text = await brain.ask({ system: 'Tu es un coach gaming et expert en réglages PC. Français, tutoiement. Structure : « Réglages conseillés » (liste courte des options du jeu avec la valeur à choisir), « Pour gagner des FPS » (3 points), « Astuces de jeu » (3 conseils utiles pour progresser). Pas de chiffres de FPS inventés.', text: `Jeu : ${item.name}\nPC : ${pcTxt}\nTemps de jeu : ${Math.round((item.minutes || 0) / 60)} h` }).catch((err) => ({ error: err.message }));
  return typeof text === 'string' ? { text } : { error: text?.error ?? 'IA indisponible' };
});

// ---------- Rapport en PDF (Documents\History) ----------
ipcMain.handle('pc:pdf', async (_e, title, body) => {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const esc = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const html = `<!doctype html><meta charset="utf-8"><style>body{font:13px/1.6 Segoe UI,Arial,sans-serif;color:#1b1826;margin:42px}h1{font-size:22px;margin:0 0 4px;color:#1554d1}small{color:#777}pre{white-space:pre-wrap;font:inherit}</style><h1>${esc(title)}</h1><small>History Launcher · ${new Date().toLocaleString('fr-FR')}</small><pre>${esc(body)}</pre>`;
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
  try {
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    const dir = path.join(app.getPath('documents'), 'History');
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `Rapport PC ${new Date().toISOString().slice(0, 10)}.pdf`);
    await writeFile(file, pdf);
    shell.showItemInFolder(file);
    return { ok: true, file };
  } catch (err) { return { ok: false, error: err.message }; } finally { w.destroy(); }
});

// ---------- Export / import de la bibliothèque (réglages, collections, favoris, heures) ----------
ipcMain.handle('lib:export', async () => {
  const r = await dialog.showSaveDialog(win, { title: 'Exporter ma bibliothèque', defaultPath: path.join(app.getPath('documents'), `history-bibliotheque-${new Date().toISOString().slice(0, 10)}.json`), filters: [{ name: 'Sauvegarde History', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  const { writeFile } = await import('node:fs/promises');
  await writeFile(r.filePath, JSON.stringify({ app: 'History Launcher', version: app.getVersion(), at: Date.now(), data: pickBackup(store.data) }, null, 1));
  return { ok: true, file: r.filePath };
});
ipcMain.handle('lib:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Importer une bibliothèque', filters: [{ name: 'Sauvegarde History', extensions: ['json'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const { readFile } = await import('node:fs/promises');
  try {
    const j = JSON.parse(await readFile(r.filePaths[0], 'utf8'));
    if (j?.app !== 'History Launcher' || typeof j.data !== 'object') return { ok: false, error: 'Ce fichier n’est pas une sauvegarde History.' };
    await applyRemote(j.data);
    return { ok: true };
  } catch { return { ok: false, error: 'Fichier illisible.' }; }
});

// ---------- Classement mondial des benchmarks ----------
async function submitBench(r) {
  const token = secret('account');
  if (!token || !r?.scores?.total) return;
  const diag = diagCache?.data;
  await api('/api/compte/benchmark', { method: 'POST', token, body: { v: r.v ?? 1, scores: r.scores, raw: r.v === BENCH_VERSION ? { gpu: r.gpu?.scenes ?? null, ramLat: r.ram?.latency ?? null } : null, cpu: diag?.cpu?.name ?? r.cpuName ?? null, gpu: diag?.gpus?.[0]?.name ?? r.gpu?.renderer ?? null } }).catch(() => {});
}
ipcMain.handle('bench:ranking', () => social('/api/compte/benchmark/classement'));

// ---------- Historique des températures (24 h) et analyse automatique chaque semaine ----------
setInterval(async () => {
  const snap = await snapshot().catch(() => null);
  if (!snap) return;
  const list = store.data.temps ?? [];
  list.push({ t: Date.now(), cpu: snap.cpu?.usage ?? null, cpuT: snap.cpu?.temp ?? null, gpuT: snap.gpu?.temp ?? null, gpu: snap.gpu?.usage ?? null, ram: snap.ram ? Math.round((100 * snap.ram.used) / snap.ram.total) : null });
  store.data.temps = list.filter((x) => Date.now() - x.t < 24 * 3_600_000).slice(-1440);
}, 60_000);
ipcMain.handle('pc:temps', () => (process.env.LAUNCHER_DEMO ? demoTemps() : store.data.temps ?? []));
async function weeklyDiag() {
  const last = store.data.diagHistory?.at(-1);
  if (last && Date.now() - last.at < 7 * 86_400_000) return;
  const d = await runDiag(true).catch(() => null);
  if (!d || d.error) return;
  store.data.diagHistory = [...(store.data.diagHistory ?? []), { at: Date.now(), score: d.score }].slice(-26);
  store.save();
  const urgent = d.advice.filter((a) => a.prio === 0);
  if (urgent.length || (last && d.score < last.score - 10)) notify('Analyse de la semaine', urgent.length ? `${urgent[0].title} : ouvre Mon PC pour les détails.` : `Le score de santé de ton PC est passé de ${last.score} à ${d.score}.`);
}
setTimeout(() => weeklyDiag().catch(() => {}), 10 * 60_000);
setInterval(() => weeklyDiag().catch(() => {}), 12 * 3_600_000);

// Analyse complète : diagnostic + processus + fichiers inutiles + antivirus complet + benchmark + rapport IA
ipcMain.handle('pc:deep', async () => {
  if (benchRunning) return { error: 'Une analyse est déjà en cours.' };
  const step = (s, pct, label) => send('pc:progress', { step: s, pct, label, deep: true });
  try {
    step('diag', 3, 'Inventaire et santé des composants…');
    const diag = await runDiag(true);
    if (diag.error) return diag;
    step('procs', 10, 'Programmes qui tournent et signatures…');
    const procs = await processes().catch(() => []);
    step('junk', 16, 'Fichiers inutiles…');
    const junk = await optiScan().catch(() => null);
    step('defender', 22, 'Analyse antivirus complète de Windows (c’est l’étape la plus longue)…');
    const av = await defenderScan('full');
    benchRunning = true;
    const bench = await runBench().finally(() => { benchRunning = false; });
    step('report', 96, 'Rédaction du rapport…');
    const report = await pcReport(await runDiag(true), procs, bench, junk ? `Fichiers inutiles récupérables : ${Math.round((junk.junk ?? []).reduce((n, j) => n + (j.bytes ?? 0), 0) / 1e9 * 10) / 10} Go` : '');
    step('done', 100, 'Analyse terminée');
    return { diag: await runDiag(), procs, bench, av, report, junkBytes: (junk?.junk ?? []).reduce((n, j) => n + (j.bytes ?? 0), 0) };
  } catch (err) { return { error: err.message }; }
});
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
let gameActList = [];
let lastScan = null;
const scoreOf = (r) => healthScore({
  junkBytes: r.junk.reduce((n, x) => n + x.bytes, 0) + r.recycle, orphanBytes: r.orphans.reduce((n, x) => n + x.bytes, 0),
  heavyStartup: r.startup.filter((x) => x.enabled && x.heavy).length, tweaksOff: r.tweaks.filter((t) => !t.on && !t.optional && !t.retired).length,
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
    junk: cleanList.map(({ id, label, bytes, files, note, dir }) => ({ id, label, bytes, files, note, dir, group: groupOf(id) })).sort((a, b) => b.bytes - a.bytes),
    recycle, orphans: orphans.map(({ id, label, bytes }) => ({ id, label, bytes })), startup, tweaks, free, disk, at: Date.now(),
  };
  // Profils par jeu : taille et nombre de fichiers exacts de chaque cache avant de demander l'accord
  gameActList = process.env.LAUNCHER_DEMO ? demoGameActs() : await gameActions(items, { docs: app.getPath('documents') }).catch(() => []);
  for (const a of gameActList) if (a.kind === 'clean' && a.dir) Object.assign(a, await folderSize(a.dir));
  r.games = gameActList;
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
  const tweaks = (plan?.tweaks ?? []).map(String).filter((id) => !GAME_TWEAKS.find((t) => t.id === id)?.retired);
  const games = gameActList.filter((a) => plan?.games?.includes(a.id) && !a.applied);
  const steps = [...junk.map((t) => ({ kind: 'junk', label: t.label, t })), ...(plan?.recycle ? [{ kind: 'recycle', label: 'Corbeille' }] : []), ...orphans.map((o) => ({ kind: 'orphan', label: `Reste de jeu : ${o.label}`, o })), ...tweaks.map((id) => ({ kind: 'tweak', label: GAME_TWEAKS.find((t) => t.id === id)?.label ?? id, id })), ...games.map((a) => ({ kind: 'game', label: `${a.game} : ${a.label}`, a }))];
  // Photo des réglages + journal de chaque fichier / valeur touché : « Annuler » remet exactement l'état d'avant
  if (tweaks.length) await snapshotSettings('Avant l’optimisation').catch(() => {});
  const journal = { at: Date.now(), entries: [], tweaks: (await tweakStates().catch(() => [])).filter((t) => tweaks.includes(t.id)).map((t) => ({ id: t.id, was: t.on })), done: [], errors: [] };
  const paths = games.length ? await runningPaths(0).catch(() => []) : [];
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
      if (st.kind === 'game') {
        // Jeu (ou son launcher) ouvert : on ne touche pas à ses fichiers
        const item = items.find((x) => x.id === st.a.itemId);
        if (item && (activeItems([item], paths).size || (await runningGameExes(item).catch(() => [])).length)) throw new Error(`ferme ${item.name} d’abord`);
        const r = await applyAction(st.a);
        journal.entries.push(...r.entries);
        got = r.freed;
      }
      journal.done.push(st.label);
    } catch (err) {
      // Un élément bloqué (jeu ouvert, fichier en lecture seule, droits) s'arrête seul : le reste continue
      journal.errors.push(`${st.label} : ${err.message}`);
      progress({ phase: 'run', index: i, total: steps.length, label: st.label, status: 'erreur', error: err.message, freed });
      continue;
    }
    freed += got;
    progress({ phase: 'run', index: i, total: steps.length, label: st.label, status: 'fait', got, freed });
  }
  if (journal.entries.length || journal.tweaks.length) { store.data.optiJournal = [journal, ...(store.data.optiJournal ?? [])].slice(0, 20); store.save(); }
  const after = await freeSpace();
  return { ok: true, freed: before != null && after != null ? Math.max(freed, after - before) : freed, steps: steps.length, tweaks: tweaks.length, games: games.length, errors: journal.errors, undo: Boolean(journal.entries.length || journal.tweaks.length) };
}
ipcMain.handle('opti:run', async (_e, plan) => {
  if (OPTI_PAUSED) return { error: 'L’optimisation est en pause le temps qu’on la termine.' };
  try {
    const r = await optiApply(plan, (p) => send('opti:progress', p));
    // L'optimisation corrige aussi les réglages d'anciennes versions qui font bugger les jeux
    r.fixed = await fixRisky({ ask: true, reason: 'optimisation' }).catch(() => null);
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
ipcMain.handle('opti:tweak', async (_e, id, on) => (await snapshotSettings('Avant un réglage pour les jeux').catch(() => {}), { ok: await setTweak(String(id), Boolean(on)).catch(() => false), tweaks: await tweakStates().catch(() => []) }));
ipcMain.handle('opti:deep', async () => {
  const before = await freeSpace();
  const ok = await deepClean(jobFile('deep'), jobSend('deep'));
  const after = await freeSpace();
  notify(ok ? '✅ Nettoyage profond terminé' : 'Nettoyage profond arrêté', ok && before != null && after != null ? `${((after - before) / 1e9).toFixed(1).replace('.', ',')} Go libérés.` : 'Autorisation refusée ou tâche interrompue.');
  return { ok, freed: before != null && after != null ? Math.max(0, after - before) : null };
});

// ---------- Score de santé unique (le même dans Mon PC et Optimisation) ----------
let eventsCache = null;
async function healthNow(refresh = false) {
  const diag = await runDiag(refresh).catch(() => null);
  if (!lastScan || refresh || Date.now() - lastScan.at > 10 * 60_000) await optiScan().catch(() => null);
  if (!eventsCache || refresh || Date.now() - eventsCache.at > 30 * 60_000) eventsCache = { at: Date.now(), data: process.env.LAUNCHER_DEMO ? demoEvents() : await windowsEvents().catch(() => null) };
  const h = unifiedHealth({ diag: diag && !diag.error ? diag.score : null, opti: lastScan?.score ?? null, storage: process.env.LAUNCHER_DEMO ? demoScan().score : store.data.deepScan?.score ?? null, events: eventsCache.data?.score ?? null });
  if (h.score != null) { store.data.healthLast = { score: h.score, at: Date.now() }; store.save(); }
  return { ...h, events: eventsCache.data, deepAt: process.env.LAUNCHER_DEMO ? Date.now() : store.data.deepScan?.at ?? null };
}
ipcMain.handle('health:get', (_e, refresh) => healthNow(Boolean(refresh)).catch((err) => ({ error: err.message })));

// ---------- Analyse pro : chaque fichier de chaque disque, doublons par empreinte, fichiers louches, journal de Windows ----------
let deepAbort = null;
let lastDeep = null;
const DEFENDER = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe');
async function signatures(paths) {
  if (process.platform !== 'win32' || !paths.length) return {};
  const { writeFile: wf, rm: rmf } = await import('node:fs/promises');
  const list = path.join(os.tmpdir(), `history-sig-${Date.now()}.json`);
  await wf(list, JSON.stringify(paths), 'utf8');
  const script = `$ErrorActionPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $p=Get-Content -LiteralPath '${list.replace(/'/g, "''")}' -Raw | ConvertFrom-Json; @($p | ForEach-Object { $s=Get-AuthenticodeSignature -LiteralPath $_; @{ path=$_; ok=($s.Status -eq 'Valid'); signer=[string]$s.SignerCertificate.Subject } }) | ConvertTo-Json -Compress`;
  const out = await new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true });
    let o = ''; p.stdout.on('data', (c) => { o += c; }); p.on('close', () => resolve(o)); p.on('error', () => resolve(''));
  });
  await rmf(list, { force: true }).catch(() => {});
  try { const a = JSON.parse(out.slice(out.search(/[[{]/))); return Object.fromEntries((Array.isArray(a) ? a : [a]).map((x) => [x.path, { ok: x.ok, signer: (x.signer.match(/CN=("?)([^,"]+)\1/) ?? [])[2] ?? null }])); } catch { return {}; }
}
function defenderFile(file) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    const p = spawn(DEFENDER, ['-Scan', '-ScanType', '3', '-File', file, '-DisableRemediation'], { windowsHide: true, stdio: 'ignore' });
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 2 ? 'menace' : code === 0 ? 'propre' : null));
  });
}
// Disques proposés pour l'analyse pro (on peut en choisir un seul ou plusieurs)
ipcMain.handle('scan:drives', async () => {
  const diag = await runDiag().catch(() => null);
  const sys = (process.env.SystemDrive ?? 'C:')[0].toUpperCase();
  return (diag?.volumes ?? []).map((v) => ({ letter: v.letter.toUpperCase(), size: v.size, used: v.size - v.free, system: v.letter.toUpperCase() === sys }));
});
ipcMain.handle('scan:start', async (_e, letters) => {
  if (deepAbort) return { error: 'Une analyse est déjà en cours.' };
  deepAbort = new AbortController();
  const signal = deepAbort.signal;
  const prog = (p) => send('scan:progress', p);
  try {
    prog({ phase: 'prep', label: 'Liste des disques…' });
    const diag = await runDiag().catch(() => null);
    const want = Array.isArray(letters) ? letters.map((l) => String(l).toUpperCase()).filter((l) => /^[A-Z]$/.test(l)) : [];
    const vols = process.platform === 'win32' ? (diag?.volumes ?? []).filter((v) => !want.length || want.includes(v.letter.toUpperCase())) : [];
    if (process.platform === 'win32' && want.length && !vols.length) { deepAbort = null; return { error: 'Disque introuvable.' }; }
    const roots = vols.length ? vols.map((v) => `${v.letter}:\\`) : [os.homedir()];
    const totalBytes = vols.reduce((n, v) => n + (v.size - v.free), 0);
    const r = await deepScan({ roots, totalBytes, signal, onProgress: prog, dupRoots: [os.homedir(), ...vols.filter((v) => v.letter.toUpperCase() !== (process.env.SystemDrive ?? 'C:')[0]).map((v) => `${v.letter}:\\`)] });
    // Fichiers louches : signature numérique, puis contrôle par l'antivirus de Windows un par un
    prog({ phase: 'suspects', label: `Vérification de ${r.suspects.length} fichier(s) louche(s)…`, total: r.suspects.length, index: 0 });
    const sig = await signatures(r.suspects.map((x) => x.path));
    let threats = 0;
    for (const [i, x] of r.suspects.entries()) {
      if (signal.aborted) throw new Error('annulé');
      x.signed = sig[x.path]?.ok ?? null; x.signer = sig[x.path]?.signer ?? null;
      if (!x.signed) { prog({ phase: 'suspects', label: `Antivirus : ${path.basename(x.path)}`, total: r.suspects.length, index: i + 1 }); x.defender = await defenderFile(x.path); if (x.defender === 'menace') threats += 1; }
    }
    r.suspects = r.suspects.filter((x) => !x.signed); // un programme signé par son éditeur n'est plus louche
    prog({ phase: 'events', label: 'Journal de Windows (plantages, écrans bleus, erreurs disque)…' });
    eventsCache = { at: Date.now(), data: await windowsEvents().catch(() => null) };
    const junkBytes = Object.values(r.junk).reduce((n, j) => n + j.bytes, 0);
    const score = Math.max(0, storageScore(r) - threats * 20);
    lastDeep = r;
    const summary = {
      at: Date.now(), elapsed: r.elapsed, files: r.files, dirs: r.dirs, bytes: r.bytes, denied: r.denied, emptyDirs: r.emptyDirs, score, threats,
      cats: CATEGORIES.map(([k, icon, label]) => ({ id: k, icon, label, ...r.cats[k] })).filter((c) => c.files),
      junk: Object.entries(r.junk).map(([k, j]) => ({ id: k, icon: JUNK_LABELS[k][0], label: JUNK_LABELS[k][1], files: j.files, bytes: j.bytes })).sort((a, b) => b.bytes - a.bytes), junkBytes,
      duplicates: r.duplicates.slice(0, 60).map((d) => ({ size: d.size, paths: d.paths })), dupWasted: r.dupWasted, hashed: r.hashed,
      suspects: r.suspects.map((x) => ({ path: x.path, size: x.size, reason: SUSPECT_LABELS[x.reason], defender: x.defender ?? null, signer: x.signer })),
      largest: r.largest.slice(0, 25), old: r.old, events: eventsCache.data,
    };
    store.data.deepScan = { at: summary.at, score, files: r.files, bytes: r.bytes, junkBytes, dupWasted: r.dupWasted, threats, elapsed: r.elapsed };
    store.save();
    prog({ phase: 'done' });
    return { ...summary, health: await healthNow().catch(() => null) };
  } catch (err) {
    prog({ phase: 'done' });
    return { error: err.message === 'annulé' ? 'Analyse arrêtée.' : `Analyse impossible : ${err.message}` };
  } finally { deepAbort = null; }
});
// Mode démonstration (captures) : résultats d'exemple de l'analyse pro et de Windows Update
ipcMain.handle('demo:get', () => (process.env.LAUNCHER_DEMO ? { scan: demoScan(), wu: { ...demoWu(), kinds: WU_KINDS } } : null));
ipcMain.handle('scan:stop', () => { deepAbort?.abort(); return true; });
ipcMain.handle('scan:last', () => store.data.deepScan ?? null);
const inDeep = (p) => lastDeep && (lastDeep.suspects.some((x) => x.path === p) || lastDeep.duplicates.some((d) => d.paths.includes(p)) || lastDeep.largest.some((x) => x.path === p));
ipcMain.handle('scan:show', (_e, p) => { if (inDeep(String(p))) shell.showItemInFolder(String(p)); return true; });
ipcMain.handle('scan:trash', async (_e, paths) => {
  const list = (Array.isArray(paths) ? paths : []).map(String).filter(inDeep);
  // Doublons : on garde toujours au moins une copie de chaque fichier
  for (const d of lastDeep?.duplicates ?? []) if (d.paths.every((p) => list.includes(p))) list.splice(list.indexOf(d.paths[0]), 1);
  if (!list.length || !(await confirm(`Mettre ${list.length} fichier(s) à la corbeille ?`, 'Tu pourras les récupérer depuis la corbeille tant qu’elle n’est pas vidée.'))) return { ok: false };
  let n = 0;
  for (const p of list) if (await shell.trashItem(p).then(() => true).catch(() => false)) n += 1;
  return { ok: true, n };
});
ipcMain.handle('scan:clean', async (_e, kinds) => {
  const ks = (Array.isArray(kinds) ? kinds : []).map(String).filter((k) => lastDeep?.junk?.[k]);
  if (!ks.length) return { ok: false };
  const { rm: rmf } = await import('node:fs/promises');
  let freed = 0; let n = 0;
  for (const k of ks) {
    for (const p of lastDeep.junk[k].paths) {
      const st = await (await import('node:fs/promises')).lstat(p).catch(() => null);
      if (!st?.isFile()) continue;
      // Installateurs : à la corbeille (récupérables) ; le reste se recrée tout seul
      const ok = k === 'installer' ? await shell.trashItem(p).then(() => true).catch(() => false) : await rmf(p, { force: true }).then(() => true).catch(() => false);
      if (ok) { freed += st.size; n += 1; }
    }
    delete lastDeep.junk[k];
  }
  return { ok: true, freed, n };
});

// ---------- Windows Update ----------
let wuBusy = false;
ipcMain.handle('wu:search', async () => {
  if (wuBusy) return { error: 'Une installation est en cours.' };
  const r = await searchUpdates();
  if (!r.error) { store.data.wuLast = { at: Date.now(), count: r.updates.length }; store.save(); }
  return { ...r, kinds: WU_KINDS };
});
ipcMain.handle('wu:install', async (_e, ids) => {
  if (wuBusy) return { ok: false, error: 'Une installation est déjà en cours.' };
  wuBusy = true;
  try {
    const r = await installUpdates((Array.isArray(ids) ? ids : []).map(String), (p) => send('wu:progress', p));
    const n = (r?.results ?? []).filter((x) => x.ok).length;
    notify('Mises à jour de Windows', r?.results ? `${n} sur ${r.results.length} installée${n > 1 ? 's' : ''}.${r.reboot ? ' Redémarre le PC pour finir.' : ''}` : 'Installation interrompue.');
    return r;
  } finally { wuBusy = false; }
});
ipcMain.handle('wu:reboot', async () => {
  if (!(await confirm('Redémarrer le PC maintenant ?', 'Enregistre ton travail : Windows redémarre dans 30 secondes pour finir d’installer les mises à jour.'))) return false;
  spawn('shutdown.exe', ['/r', '/t', '30', '/c', 'History Launcher : redémarrage pour finir les mises à jour Windows'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
  return true;
});

// ---------- Optimisation pro : réglages système (administrateur), stockage, réparation de Windows ----------
ipcMain.handle('opti:sys', () => systemTweakStates().catch(() => []));
ipcMain.handle('opti:sysApply', async (_e, changes) => {
  await snapshotSettings('Avant les réglages système pro').catch(() => {});
  const ok = await applySystemTweaks((Array.isArray(changes) ? changes : []).map((c) => ({ id: String(c?.id), on: Boolean(c?.on) })));
  return { ok, states: await systemTweakStates().catch(() => []) };
});
// Tâches longues : vrai pourcentage envoyé à l'interface, et notification Windows à la fin (même fenêtre fermée)
const jobFile = (id) => path.join(os.tmpdir(), `history-${id}-${Date.now()}.json`);
const jobSend = (id) => (p) => send('job:progress', { id, ...p });
ipcMain.handle('opti:storage', async () => { const r = await optimizeStorage(jobFile('storage'), jobSend('storage')); notify(r.ok ? '✅ Disques optimisés' : 'Optimisation des disques arrêtée', r.ok ? 'TRIM des SSD et défragmentation des disques durs terminés.' : 'Autorisation refusée ou tâche interrompue.'); return r; });
ipcMain.handle('opti:repair', async () => { const r = await repairWindows(jobFile('repair'), jobSend('repair')); notify(r.ok ? '✅ Vérification de Windows terminée' : 'Réparation de Windows arrêtée', r.ok ? 'Ouvre History Launcher › Optimisation pour voir le résultat.' : r.error); return r; });
ipcMain.handle('opti:auto', (_e, on) => { if (on !== undefined) { store.data.settings.optiAuto = Boolean(on); store.save(); } return { on: store.data.settings.optiAuto === true, last: store.data.optiAutoLast ?? null }; });
// Optimisation en maintenance : on la termine de notre côté. « Remettre Windows comme avant » reste disponible.
const OPTI_PAUSED = false; // ouverte à tous (le panneau vert et l'animation de déblocage ne s'affichent qu'une fois)
// Ouverture : panneau vert « c'est prêt » montré une seule fois par utilisateur (retenu même après redémarrage)
ipcMain.handle('opti:state', () => ({ paused: OPTI_PAUSED, introSeen: Boolean(store.data.optiIntroSeen) }));
ipcMain.handle('opti:introSeen', () => { store.data.optiIntroSeen = true; store.save(); return true; });
// Annuler : la dernière optimisation (ou toutes) revient exactement à l'état d'avant (fichiers, registre, réglages)
async function undoOpti(all = false) {
  const list = store.data.optiJournal ?? [];
  const todo = all ? list : list.slice(0, 1);
  for (const j of todo) {
    await revertEntries(j.entries ?? []).catch((err) => fatalLog(err));
    for (const t of j.tweaks ?? []) await setTweak(t.id, t.was).catch(() => {});
  }
  store.data.optiJournal = all ? [] : list.slice(1);
  store.save();
  return { ok: true, undone: todo.length };
}
ipcMain.handle('opti:undo', async () => {
  if (!store.data.optiJournal?.length) return { ok: false, error: 'Rien à annuler.' };
  if (!(await confirm('Annuler la dernière optimisation ?', 'Chaque fichier de jeu et chaque réglage modifié revient exactement comme avant (les caches vidés, eux, se recréent tout seuls).'))) return { ok: false, cancelled: true };
  return undoOpti(false);
});
ipcMain.handle('opti:undoAll', async () => {
  if (!(await confirm('Tout remettre par défaut ?', 'Toutes les optimisations sont annulées (fichiers de jeux, réglages) et Windows revient à son état d’avant ta première optimisation. Un point de restauration est créé avant les réglages système.'))) return { ok: false, cancelled: true };
  await undoOpti(true);
  return resetWindows({ ask: false });
});
// Caches de shaders : les vider fait saccader les jeux (FiveM surtout) le temps qu'ils se recréent
const SHADER_CACHES = ['d3d', 'nvdx', 'nvgl', 'amddx', 'amdvk', 'amd-dxc'];
// Nettoyage doux chaque semaine (à activer dans Paramètres) : seulement les caches qui se recréent (système, pilotes,
// launchers). Jamais les navigateurs, les caches de shaders, les jeux ni les fichiers perso. Petit rapport à la fin.
setInterval(async () => {
  if (store.data.settings.optiAuto !== true || Date.now() - (store.data.optiAutoLast ?? 0) < 7 * 86_400_000 || currentSession()) return;
  const scan = await optiScan().catch(() => null);
  if (!scan) return;
  const got = [];
  const r = await optiApply({ junk: scan.junk.filter((j) => j.group !== 'navigateurs' && !SHADER_CACHES.includes(j.id)).map((j) => j.id) }, (p) => { if (p.got > 0) got.push(p); }).catch(() => null);
  store.data.optiAutoLast = Date.now();
  store.save();
  const top = got.sort((a, b) => b.got - a.got).slice(0, 3).map((p) => `${p.label} ${(p.got / 1e6).toFixed(0)} Mo`).join(', ');
  if (r?.freed > 100e6) notify('Nettoyage de la semaine', `${(r.freed / 1e9).toFixed(1).replace('.', ',')} Go libérés (${top}). Jeux, navigateurs et fichiers perso non touchés.`);
}, 3 * 3_600_000);

// Alertes de chauffe (toutes les minutes)
const lastHeat = {};
setInterval(async () => {
  // Seulement pendant une partie ou avec l'écran d'infos : hors jeu, le launcher ne sollicite pas le PC pour rien
  if (store.data.settings.heatAlerts === false || !(currentSession() || overlay)) return;
  for (const a of heatAlerts(await snapshot().catch(() => ({})), lastHeat)) notify('Ton PC chauffe', `${a.text}. Pense à aérer ou à baisser les graphismes.`);
}, 60_000);

// ---------- Pilote graphique trop vieux : rappel au plus une fois par mois (clic = page officielle du pilote) ----------
let driverInfo = null;
async function checkDriver() {
  const drivers = await gpuDrivers().catch(() => []);
  driverInfo = oldDriver(drivers);
  // NVIDIA : comparaison avec le dernier pilote Game Ready publié (notes de version + lien direct)
  const nv = drivers.find((d) => d.vendor === 'nvidia');
  const latest = nv ? await nvidiaLatest(nv.name).catch(() => null) : null;
  const mine = nv ? nvidiaVersion(nv.version) : null;
  if (latest && mine && newerVersion(latest.version, mine)) {
    driverInfo = { name: nv.name, vendor: 'nvidia', version: mine, latest: latest.version, notes: latest.notes, download: latest.download, date: latest.date, link: latest.notes ?? DRIVER_LINKS[0] };
    if (store.data.driverLatestNotified !== latest.version && Notification.isSupported()) {
      store.data.driverLatestNotified = latest.version; store.save();
      const n = new Notif({ title: `Nouveau pilote NVIDIA ${latest.version}`, body: `Tu as la ${mine}. Clique pour voir les nouveautés (jeux optimisés, corrections) et le télécharger.`, icon: ICON });
      n.on('click', () => openLink(driverInfo.link).catch(() => {}));
      n.show();
    }
    return;
  }
  if (!driverInfo || !Notification.isSupported()) return;
  const last = store.data.driverAlertAt ?? 0;
  if (Date.now() - last < 30 * 86_400_000) return;
  store.data.driverAlertAt = Date.now();
  store.save();
  const months = Math.round(driverInfo.age / 30);
  const n = new Notif({ title: 'Pilote graphique à mettre à jour', body: `Ton pilote ${driverInfo.name} a ${months} mois : les jeux récents tournent souvent mieux avec le dernier. Clique pour le télécharger.`, icon: ICON });
  n.on('click', () => openLink(driverInfo.link).catch(() => {}));
  n.show();
}
ipcMain.handle('pc:driver', () => driverInfo);
ipcMain.handle('pc:driverOpen', (_e, which) => (driverInfo ? openLink(which === 'download' && driverInfo.download ? driverInfo.download : driverInfo.link).then(() => true).catch(() => false) : false));
setTimeout(() => checkDriver().catch(() => {}), 3 * 60_000);
setInterval(() => checkDriver().catch(() => {}), 24 * 3_600_000);

// ---------- Écran d'infos en jeu (Ctrl+Alt+O) : par-dessus les jeux en « plein écran fenêtré » ----------
let overlay = null;
let overlayTimer = null;
function toggleOverlay() {
  if (overlay && !overlay.isDestroyed()) { clearInterval(overlayTimer); overlay.close(); overlay = null; return; }
  const area = screen.getPrimaryDisplay().workArea;
  overlay = new BrowserWindow({
    width: 236, height: 190, x: area.x + area.width - 252, y: area.y + 16, frame: false, transparent: true, resizable: false,
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
      // Vrais FPS du jeu (mesurés image par image, comme le compteur du jeu) et leur couleur
      fps: sess?.live?.avg ? { now: Math.round(sess.live.avg), low1: sess.live.low1, tone: fpsTone(sess.live.avg, sess.fpsHist, perfBaseline(store.data.perf?.[sess.id] ?? [])?.avg ?? null) } : null,
    });
  };
  push();
  overlayTimer = setInterval(push, 2000);
}

// ---------- Rocket League en direct (Ctrl+Alt+I) : victoires / défaites / série via l'API officielle du jeu, rang et MMR du profil ----------
const rl = () => (store.data.rl ??= { games: [], player: null, profile: null });
const rlItem = () => items.find((i) => i.kind === 'game' && i.installed && /rocket league/i.test(i.name) && i.installDir);
let rlSock = null; let rlTrack = null; let rlOv = null; let rlHideTimer = null;
function rlData() {
  const r = rl();
  return { player: r.player, profile: r.profile, games: r.games.slice(0, 30), sum: rlSummary(r.games), live: Boolean(rlSock), statsOff: r.statsOff ?? false };
}
const rlPush = () => { if (rlOv && !rlOv.isDestroyed()) rlOv.webContents.send('rl:data', rlData()); };
/** Profil public : requête directe, sinon via une fenêtre de navigateur cachée (le site bloque les requêtes hors navigateur). */
const RL_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
async function rlFetch(url) {
  const direct = await net.fetch(url, { headers: { 'User-Agent': RL_UA, Accept: 'application/json' } }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (direct) return direct;
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:rltracker' } });
  try {
    await w.loadURL(url, { userAgent: RL_UA }).catch(() => {});
    for (let i = 0; i < 15 && !w.isDestroyed(); i++) {
      const t = await w.webContents.executeJavaScript('document.body ? document.body.innerText : ""').catch(() => '');
      if (t.trim().startsWith('{')) return JSON.parse(t);
      await new Promise((ok) => setTimeout(ok, 1000));
    }
  } catch { /* profil illisible : l'overlay garde victoires, défaites et série */ } finally { if (!w.isDestroyed()) w.destroy(); }
  return null;
}
/** Profil public (rang, MMR) : au plus toutes les 3 min, et juste après un match pour le gain de MMR. */
async function rlProfile(force = false) {
  const r = rl(); const url = trackerUrl(r.player);
  if (!url || (!force && Date.now() - (r.profileAt ?? 0) < 180_000)) return;
  r.profileAt = Date.now();
  const p = parseTracker(await rlFetch(url));
  if (!p) return;
  // Classé ou occa, et gain de MMR : le mode dont le profil a bougé depuis la dernière lecture (le jeu ne le dit pas)
  const g = r.games[0];
  if (g && g.ranked == null && Date.now() - g.at < 20 * 60_000) Object.assign(g, classify(g, r.profile, p) ?? {});
  r.profile = p; store.save(); rlPush();
}
/** Connexion à l'API du jeu (le jeu doit tourner, API activée) ; retente toutes les 10 s tant qu'il tourne. */
function rlConnect() {
  if (rlSock || process.platform !== 'win32') return;
  const r = rl();
  rlTrack = matchTracker({ ids: [...epicAccounts.map((a) => a.id), ...steamAccounts.map((a) => a.id)], name: r.player?.name });
  const sock = nodeNet.connect(RL_PORT, '127.0.0.1');
  const feed = jsonStream((msg) => {
    const res = rlTrack.event(msg);
    if (rlTrack.player && rlTrack.player.name !== r.player?.name) { r.player = rlTrack.player; store.save(); rlProfile(true).catch(() => {}); }
    if (res) {
      r.games = [res, ...r.games].slice(0, 50); store.save(); rlPush();
      setTimeout(() => rlProfile(true).catch(() => {}), 45_000); setTimeout(() => rlProfile(true).catch(() => {}), 180_000);
    }
  });
  sock.setEncoding('utf8');
  sock.on('connect', () => { rlSock = sock; rlPush(); });
  sock.on('data', feed);
  const drop = () => { if (rlSock === sock) rlSock = null; sock.destroy(); rlPush(); };
  sock.on('error', drop); sock.on('close', drop);
}
setInterval(() => { if (currentSession() && /rocket league/i.test(currentSession().name ?? '')) rlConnect(); }, 10_000);
/** L'API est coupée par défaut dans le jeu : on propose de l'activer une fois (fichier sauvegardé à côté). */
async function rlEnableStats(ask = true) {
  const it = rlItem(); if (!it) return false;
  const file = statsIni(it.installDir);
  const text = await readFile(file, 'utf8').catch(() => null);
  if (text == null) return false;
  const next = enableStatsIni(text);
  rl().statsOff = Boolean(next);
  if (!next) return true;
  if (!ask) return false; // au lancement du jeu : on regarde seulement, jamais de modification sans accord
  if (!(await confirm('Activer les stats en direct de Rocket League ?', 'Le jeu a une API de statistiques officielle, coupée par défaut. On l’active dans son fichier DefaultStatsAPI.ini (sauvegardé à côté) : relance Rocket League pour qu’elle marche.'))) return false;
  await writeFile(`${file}.history-bak`, text).catch(() => {});
  const ok = await writeFile(file, next).then(() => true, () => false);
  rl().statsOff = !ok; store.save();
  return ok;
}
async function toggleRlOverlay(auto = false) {
  if (rlOv && !rlOv.isDestroyed()) { if (auto) return; rlOv.close(); rlOv = null; return; }
  const area = screen.getPrimaryDisplay().workArea;
  rlOv = new BrowserWindow({
    width: 256, height: 330, x: area.x + area.width - 272, y: area.y + 16, frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, hasShadow: false,
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  rlOv.setAlwaysOnTop(true, 'screen-saver');
  rlOv.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  rlOv.webContents.on('will-navigate', (e) => e.preventDefault());
  rlOv.on('closed', () => { rlOv = null; });
  rlOv.loadFile(path.join(here, 'ui', 'rloverlay.html'));
  rlOv.once('ready-to-show', () => { rlOv?.showInactive(); rlPush(); });
  clearTimeout(rlHideTimer);
  if (auto) rlHideTimer = setTimeout(() => { if (rlOv && !rlOv.isDestroyed()) rlOv.close(); }, 15_000);
  if (!auto) rlEnableStats(true).then(() => rlPush()).catch(() => {});
  rlConnect(); rlProfile().catch(() => {});
}
// La fenêtre suit la hauteur de la carte (flèche : résumé des dernières parties)
ipcMain.on('rl:size', (_e, h) => { if (rlOv && !rlOv.isDestroyed()) rlOv.setSize(256, Math.min(620, Math.max(120, Math.round(Number(h) || 0)))); });

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
    const { readdir } = await import('node:fs/promises');
    const antiCheat = ['steam', 'epic'].includes(item.source) && await hasAntiCheat(item.installDir, readdir);
    for (const way of launchPlan(item, { direct: store.data.settings.directLaunch !== false, memo, antiCheat })) {
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
    // Même jeu sur Steam et Epic : on ferme celui qui tourne
    const key = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let closed = await closeItem(item);
    for (const o of items) if (!closed && o.installed && o !== item && o.name.toLowerCase().replace(/[^a-z0-9]/g, '') === key) closed = await closeItem(o);
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

// Programmes du jeu qui tournent, par leur nom (marche aussi quand l'anti-triche cache leur chemin à Windows)
async function runningGameExes(item) {
  const { readdir } = await import('node:fs/promises');
  const dir = String(item.installDir ?? '').toLowerCase().replace(/\\+$/, '');
  // Jamais un disque ou un dossier système entier (D:\Fortnite est accepté)
  const deep = dir.split('\\').filter(Boolean).length >= 3 || (dir.split('\\').filter(Boolean).length === 2 && !/^[a-z]:\\(program files|windows|users|programdata)/.test(dir));
  const byPath = deep ? (await runningPaths(0)).filter((p) => p.startsWith(`${dir}\\`) && p.endsWith('.exe')).map((p) => path.win32.basename(p)) : [];
  const own = new Set([path.win32.basename(String(item.exe ?? '')).toLowerCase(), ...byPath, ...(deep ? await gameExes(item.installDir, readdir) : [])].filter(Boolean));
  const running = await new Promise((resolve) => execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10_000 }, (_e, o) => resolve(String(o ?? '').split(/\r?\n/).map((l) => l.split('","')[0].replace(/^"/, '').toLowerCase()))));
  return [...new Set(running.filter((n) => own.has(n)))];
}
async function closeItem(item) {
  const dir = String(item.installDir ?? '').toLowerCase().replace(/\\+$/, '');
  if (!dir || dir.split('\\').filter(Boolean).length < 3) return false;
  const targets = (await runningPaths()).filter((p) => p.startsWith(`${dir}\\`) && p.endsWith('.exe'));
  // Chemin exact transmis par variable d'environnement : rien n'est collé dans la commande PowerShell
  for (const exe of targets) {
    spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process | Where-Object { $_.Path -and $_.Path.ToLower() -eq $env:HL_CLOSE } | Stop-Process -Force'], { windowsHide: true, stdio: 'ignore', env: { ...process.env, HL_CLOSE: exe } });
  }
  if (targets.length) return true;
  // Jeux avec anti-triche (Rocket League, Fortnite…) : Windows cache leur chemin, on les ferme par le nom du programme
  if (process.platform !== 'win32') return false;
  const kill = await runningGameExes(item);
  if (!kill.length) return false;
  return new Promise((resolve) => execFile('taskkill.exe', [...kill.flatMap((n) => ['/IM', n]), '/F', '/T'], { windowsHide: true, timeout: 10_000 }, (err) => resolve(!err)));
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
  if ('friendNotifs' in patch) store.data.settings.friendNotifs = Boolean(patch.friendNotifs);
  for (const k of ['sfxOn', 'sfxNotif']) if (k in patch) store.data.settings[k] = Boolean(patch[k]);
  if ('sfxVol' in patch) store.data.settings.sfxVol = Math.max(0, Math.min(100, Math.round(Number(patch.sfxVol) || 0)));
  for (const k of ['dnd', 'tournament', 'compact', 'lock2fa']) if (k in patch) store.data.settings[k] = Boolean(patch[k]);
  for (const k of ['batterySaver', 'widgetTop', 'gamepad', 'widgetGame', 'gamePopups', 'streamerAuto']) if (k in patch) store.data.settings[k] = Boolean(patch[k]);
  if ('streamer' in patch) { store.data.settings.streamer = Boolean(patch.streamer); send('streamer:state', streaming()); }
  if ('promoDm' in patch) { store.data.settings.promoDm = Boolean(patch.promoDm); syncWatch().catch(() => {}); }
  if ('widget' in patch) { store.data.settings.widget = Boolean(patch.widget); setWidget(store.data.settings.widget); }
  if ('widgetTop' in patch) widget?.setAlwaysOnTop(Boolean(patch.widgetTop));
  if ('batterySaver' in patch && !patch.batterySaver && onBattery) batteryMode(false).catch(() => {});
  if ('status' in patch) { store.data.settings.status = String(patch.status ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || null; lastPresence = 0; }
  if ('textScale' in patch) { const z = [0.9, 1, 1.1, 1.25].includes(Number(patch.textScale)) ? Number(patch.textScale) : 1; store.data.settings.textScale = z; win?.webContents.setZoomFactor(z); }
  if ('sidebar' in patch) {
    const sb = patch.sidebar ?? {};
    const ids = (v, re) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => re.test(x)))].slice(0, 40);
    store.data.settings.sidebar = { hiddenPlatforms: ids(sb.hiddenPlatforms, /^[\w-]{1,30}$/), hiddenNav: ids(sb.hiddenNav, /^(jeux|applis|favoris|stats|classement|amis|pc|optimisation|ia)$/) };
  }
  if ('dailyLimit' in patch) store.data.settings.dailyLimit = Math.max(0, Math.min(1440, Number(patch.dailyLimit) || 0));
  if ('breakEvery' in patch) store.data.settings.breakEvery = Math.max(0, Math.min(600, Number(patch.breakEvery) || 0));
  if ('theme' in patch && ['bleu', 'violet', 'rouge', 'vert', 'orange', 'rose', 'auto'].includes(patch.theme)) store.data.settings.theme = patch.theme;
  if ('dealAlerts' in patch) store.data.settings.dealAlerts = Boolean(patch.dealAlerts);
  if ('gameMode' in patch) store.data.settings.gameMode = Boolean(patch.gameMode);
  if ('directLaunch' in patch) store.data.settings.directLaunch = Boolean(patch.directLaunch);
  if ('preloadSteam' in patch) store.data.settings.preloadSteam = Boolean(patch.preloadSteam);
  if ('nightUpdates' in patch) store.data.settings.nightUpdates = Boolean(patch.nightUpdates);
  if ('voiceReply' in patch) store.data.settings.voiceReply = Boolean(patch.voiceReply);
  if ('voiceName' in patch) store.data.settings.voiceName = String(patch.voiceName ?? '').slice(0, 80);
  if ('remote' in patch) { store.data.settings.remote = Boolean(patch.remote); setRemote(); }
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
// Jeux gratuits Epic : une notification par nouveau jeu offert (clic = page du jeu)
async function checkFree() {
  if (store.data.settings.dealAlerts === false || !Notification.isSupported()) return;
  const list = (await epicFreeGames().catch(() => [])).filter((g) => g.now);
  const seen = new Set(store.data.freeSeen ?? []);
  for (const g of list) {
    if (seen.has(g.slug ?? g.name)) continue;
    seen.add(g.slug ?? g.name);
    const n = new Notif({ title: '🎁 Jeu gratuit sur Epic', body: `${g.name} est offert${g.until ? ` jusqu’au ${new Date(g.until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''} : il reste à toi pour toujours.`, icon: ICON });
    if (g.slug && /^[\w-]{1,120}$/.test(g.slug)) n.on('click', () => openLink(`https://store.epicgames.com/fr/p/${g.slug}`).catch(() => {}));
    n.show();
  }
  store.data.freeSeen = [...seen].slice(-100);
  store.save();
}
setTimeout(() => checkFree().catch(() => {}), 2 * 60_000);
setInterval(() => checkFree().catch(() => {}), 6 * 3_600_000);

// Lien d'invitation : history://ami/<code ami> 
function handleInvite(argv) {
  const url = (argv ?? []).find((a) => /^history:\/\//i.test(String(a)));
  const clipCode = url && String(url).match(/^history:\/\/clips\/([A-Z0-9]{4}-?[A-Z0-9]{4})\/?$/i)?.[1];
  if (clipCode) return approveClips(clipCode.toUpperCase().replace(/^(.{4})-?/, '$1-'));
  const m = url && decodeURIComponent(String(url)).match(/^history:\/\/ami\/([\p{L}\p{N}._-]{2,20}#[0-9A-Fa-f]{6})\/?$/u);
  if (!m) return;
  showWindow();
  setTimeout(() => send('invite:friend', { code: m[1] }), 800);
}
app.on('second-instance', (_e, argv) => handleInvite(argv));

async function checkDeals(notify = true) {
  const id64 = myId64();
  if (!id64) return [];
  const deals = await wishlistDeals(id64).catch(() => []);
  const seen = (store.data.dealsSeen ??= {});
  const fresh = newDeals(deals, seen);
  if (notify && store.data.settings.dealAlerts !== false && Notification.isSupported()) {
    for (const d of fresh.slice(0, 3)) {
      const n = new Notif({ title: `${d.name} : -${d.pct} %`, body: `En promo sur Steam${d.price ? ` à ${d.price}` : ''} (dans ta liste de souhaits)`, icon: ICON });
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
let lastPresenceName = null;
setInterval(async () => {
  if (playSession && Date.now() - playSession.start > 90_000) {
    const it = items.find((i) => i.id === playSession.id);
    const running = it && activeItems([it], await runningPaths()).size > 0;
    playSession.misses = running ? 0 : (playSession.misses ?? 0) + 1;
    if (playSession.misses >= 2) playSession = null;
  }
  const s = currentSession();
  sessionTick(s).catch((err) => fatalLog(err));
  if (store.data.settings.discordStatus !== false) await rpc.set(s ? activityFor(s, items.find((i) => i.id === s.id)) : null).catch(() => {});
  else if (rpc.ready) await rpc.set(null).catch(() => {});
  const nowName = s?.name ?? null;
  if (Date.now() - lastPresence > 55_000 || nowName !== lastPresenceName) { lastPresence = Date.now(); lastPresenceName = nowName; sendPresence(s).catch(() => {}); }
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
  const item = s ? items.find((i) => i.id === s.id) : null;
  if (s && (NOT_GAME.test(s.name ?? '') || (item && item.kind !== 'game'))) s = null;
  const join = share && s ? joinFor(item, item?.source === 'fivem' ? lastFivemServer(store.data.fivemLogs, store.data.fivemLast ?? null) : null) : null;
  const dispo = share && s?.start ? dispoAt(s) : null;
  await api('/api/compte/presence', { method: 'POST', token, body: { status: gameDnd() ? `🎯 En partie classée${s ? ` sur ${s.name}` : ''}` : store.data.settings.status ?? null, dnd: Boolean(store.data.settings.dnd || store.data.settings.tournament || gameDnd()), level: levelOf(items.filter((i) => i.kind === 'game').reduce((n, i) => n + (i.minutes || 0), 0)).level, bench: share ? (store.data.bench ?? [])[0]?.scores?.total ?? null : null, playing: share && s ? s.name : null, join, dispo, week: share ? Math.round(games.reduce((n, [, m]) => n + m, 0)) : 0, top: share ? top : null } });
}

// ---------- Amis en direct : notifications en bas à gauche (comme Steam), messages, « on joue ? », rejoindre ----------
let notifWin = null;
let notifFree = null;
let notifCards = [];
let notifHover = false;
const notifTimers = new Map();
function notifSync() {
  if (!notifCards.length) {
    if (notifWin && !notifWin.isDestroyed()) notifWin.hide();
    // Plus de carte depuis 45 s : on ferme la fenêtre (recréée à la prochaine notification) pour libérer la mémoire
    clearTimeout(notifFree); notifFree = setTimeout(() => { if (!notifCards.length && notifWin && !notifWin.isDestroyed()) { notifWin.destroy(); notifWin = null; } }, 45_000);
    return;
  }
  clearTimeout(notifFree);
  const area = screen.getPrimaryDisplay().workArea;
  const h = Math.min(4, notifCards.length) * 118 + 24;
  if (!notifWin || notifWin.isDestroyed()) {
    notifWin = new BrowserWindow({
      width: 360, height: h, x: area.x + 8, y: area.y + area.height - h - 8, frame: false, transparent: true, resizable: false,
      alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, hasShadow: false,
      webPreferences: { preload: path.join(here, 'notif.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    notifWin.setAlwaysOnTop(true, 'screen-saver');
    notifWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    notifWin.webContents.on('will-navigate', (e) => e.preventDefault());
    notifWin.loadFile(path.join(here, 'ui', 'notif.html'));
    notifWin.webContents.once('did-finish-load', () => notifSync());
    return;
  }
  notifWin.setBounds({ x: area.x + 8, y: area.y + area.height - h - 8, width: 360, height: h });
  notifWin.webContents.send('notif:cards', notifCards.slice(-4), { sound: store.data.settings.sfxNotif !== false, vol: (store.data.settings.sfxVol ?? 60) / 100 });
  if (!notifWin.isVisible()) notifWin.showInactive();
}
// Bulle de message en haut à droite : visible même en jeu, on clique pour répondre sans quitter la partie
let bubbleWin = null;
let bubbleFree = null;
let bubble = null; // { key, title, group, avatar, color, msgs }
let bubbleHover = false;
let bubbleTyping = false;
let bubbleTimer = null;
let bubbleH = 150;
function bubbleArm() {
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { if (bubbleHover || bubbleTyping) return bubbleArm(); bubbleHide(); }, 9000);
}
function bubbleHide() {
  clearTimeout(bubbleTimer);
  bubbleTyping = false; bubble = null;
  if (bubbleWin && !bubbleWin.isDestroyed()) {
    bubbleWin.setFocusable(false); bubbleWin.hide(); bubbleWin.webContents.send('bubble:data', null);
    clearTimeout(bubbleFree); bubbleFree = setTimeout(() => { if (!bubble && bubbleWin && !bubbleWin.isDestroyed()) { bubbleWin.destroy(); bubbleWin = null; } }, 60_000);
  }
}
function bubblePlace() {
  const area = screen.getPrimaryDisplay().workArea;
  bubbleWin.setBounds({ x: area.x + area.width - 340 - 8, y: area.y + 8, width: 340, height: Math.max(90, Math.min(420, bubbleH)) });
}
/** Affiche le message dans la bulle ; renvoie false si elle ne doit pas s'afficher (la carte classique prend le relais). */
function bubbleMsg(x) {
  const st = store.data.settings;
  if (st.msgBubble === false || st.friendNotifs === false || st.dnd || gameDnd() || streaming()) return false; // mode tournoi : la bulle des messages passe quand même
  if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) return false;
  const group = x.type === 'gmsg';
  const key = group ? `g:${x.gid}` : `f:${x.from}`;
  const f = (socialLive?.amis ?? []).find((a) => a.id === x.from);
  const g = group ? (socialLive?.groupes ?? []).find((y) => y.id === x.gid) : null;
  const m = { pseudo: x.pseudo ?? f?.pseudo ?? '?', text: String(x.text ?? '').slice(0, 300) };
  if (bubble?.key === key) bubble.msgs = [...bubble.msgs, m].slice(-3);
  else if (!bubbleTyping) bubble = { key, from: x.from, gid: x.gid ?? null, title: group ? (g?.name ?? x.group ?? 'Groupe') : m.pseudo, group, avatar: group ? null : f?.avatar ?? null, color: f?.color ?? '#3b82f6', msgs: [m] };
  else return false; // en train de répondre à quelqu'un d'autre : la carte classique prend le relais
  clearTimeout(bubbleFree);
  const data = { ...bubble, sound: st.sfxNotif !== false, vol: (st.sfxVol ?? 60) / 100 };
  if (!bubbleWin || bubbleWin.isDestroyed()) {
    bubbleWin = new BrowserWindow({
      width: 340, height: bubbleH, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, hasShadow: false,
      webPreferences: { preload: path.join(here, 'bubble.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    bubbleWin.setAlwaysOnTop(true, 'screen-saver');
    bubbleWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    bubbleWin.webContents.on('will-navigate', (e) => e.preventDefault());
    bubbleWin.on('blur', () => { if (bubbleTyping) { bubbleTyping = false; bubbleWin.setFocusable(false); bubbleArm(); } });
    bubbleWin.loadFile(path.join(here, 'ui', 'bubble.html'));
    bubbleWin.webContents.once('did-finish-load', () => { if (!bubble) return; bubblePlace(); bubbleWin.webContents.send('bubble:data', { ...bubble, sound: data.sound, vol: data.vol }); bubbleWin.showInactive(); });
  } else {
    bubblePlace();
    bubbleWin.webContents.send('bubble:data', data);
    if (!bubbleWin.isVisible()) bubbleWin.showInactive();
  }
  bubbleArm();
  return true;
}
ipcMain.on('bubble:hover', (_e, on) => { bubbleHover = Boolean(on); });
ipcMain.on('bubble:size', (_e, h) => { bubbleH = Number(h) || bubbleH; if (bubbleWin && !bubbleWin.isDestroyed() && bubbleWin.isVisible()) bubblePlace(); });
// Clic sur la bulle : elle prend le clavier (le jeu reste lancé derrière) le temps d'écrire
ipcMain.on('bubble:open', () => { if (!bubbleWin || bubbleWin.isDestroyed()) return; bubbleTyping = true; clearTimeout(bubbleTimer); bubbleWin.setFocusable(true); bubbleWin.focus(); });
ipcMain.on('bubble:close', () => bubbleHide());
ipcMain.on('bubble:app', () => { const b = bubble; bubbleHide(); if (!b) return; showWindow(); if (b.group) send('group:open', { id: b.gid }); else send('chat:open', { id: b.from }); });
ipcMain.handle('bubble:reply', async (_e, text) => {
  if (!bubble) return { ok: false, error: 'Discussion fermée.' };
  const id = bubble.key.slice(2);
  const cid = randomUUID();
  const r = bubble.group ? await sendReliable('/api/compte/groupes/messages', { id: CIDM(id), text: String(text).slice(0, 500), cid }) : await sendReliable('/api/compte/messages', { to: FID(id), text: String(text).slice(0, 500), cid });
  if (r.error) return { ok: false, error: r.error };
  send('social:sent', { key: bubble.key, fil: r.fil ?? null });
  return { ok: true };
});

function dropCard(id) {
  clearTimeout(notifTimers.get(id));
  notifTimers.delete(id);
  notifCards = notifCards.filter((c) => c.id !== id);
  notifSync();
}
function armCard(c) {
  clearTimeout(notifTimers.get(c.id));
  notifTimers.set(c.id, setTimeout(() => {
    if (notifHover) return armCard({ ...c, ttl: 3000 });
    if (c.kind === 'call') missedCall(c.id);
    dropCard(c.id);
  }, c.ttl ?? 10_000));
}
/** Appel pas décroché : il reste dans le centre de notifications comme « appel manqué » (rappeler en un clic). */
function missedCall(id) {
  const e = (store.data.notifLog ?? []).find((x) => x.id === id);
  if (!e || e.done) return;
  Object.assign(e, { kind: 'missed', icon: '📵', title: e.title.replace(/ t’appelle$/, '').replace(/^/, 'Appel manqué de '), body: 'Clique pour le rappeler.', read: false });
  store.save();
  send('notifs:changed', { unread: store.data.notifLog.filter((x) => !x.read).length });
  send('call:ringStop', { callId: e.callId });
}
// L'appel a été pris (ou refusé) dans la fenêtre : la carte en bas à gauche disparaît
ipcMain.on('call:ringDone', (_e, callId, action) => {
  for (const c of notifCards.filter((x) => x.kind === 'call' && x.callId === String(callId))) { markNotif(c.id, action === 'answer' ? 'answer' : 'hangup'); dropCard(c.id); }
});
// Pendant une partie, aucune fenêtre ne s'affiche par-dessus le jeu (en plein écran, ça peut le faire saccader,
// clignoter ou passer en fenêtré) : les cartes attendent la fin de la partie, sauf les appels
let heldCards = [];
function flushHeld() {
  const list = heldCards; heldCards = [];
  for (const { c, force } of list.slice(-4)) pushCard({ ...c, ttl: Math.max(c.ttl ?? 10_000, 12_000) }, force);
}
function pushCard(c, force = false) {
  if (!c || notifCards.some((x) => x.id === c.id)) return;
  if (!c.logged && !c.nolog) { logNotif(c); c = { ...c, logged: true }; }
  // Un appel sonne toujours (même notifications d'amis coupées, en partie ou en live)
  if (c.kind === 'call') force = true;
  if (currentSession() && c.kind !== 'call' && store.data.settings.gamePopups !== true) { if (!heldCards.some((x) => x.c.id === c.id)) heldCards = [...heldCards, { c, force }].slice(-20); return; }
  if (!force && (store.data.settings.friendNotifs === false || store.data.settings.dnd || store.data.settings.tournament || gameDnd() || streaming())) return;
  if (force) c = { ...c, force: true };
  notifCards.push(c);
  armCard(c);
  notifSync();
}
ipcMain.on('notif:hover', (_e, on) => { notifHover = Boolean(on); });
ipcMain.on('notif:act', async (_e, id, action) => {
  const c = notifCards.find((x) => x.id === id);
  if (!c) return;
  dropCard(id);
  await cardAction(c, action);
});
async function cardAction(c, action) {
  if (action === 'close') return;
  markNotif(c.id, action);
  if (c.file) { if (action === 'discord') { await clipToDiscord(c.file); return; } if (action === 'play') shell.openPath(c.file); else shell.showItemInFolder(c.file); return; }
  if (c.kind === 'share') { if (action === 'saveget') await receiveShare(c.share); return; }
  if ((action === 'reply' || action === 'open') && c.gid) { showWindow(); send('group:open', { id: c.gid }); return; }
  if (action === 'reply' || action === 'open') { showWindow(); send('chat:open', { id: c.from }); return; }
  if (action === 'ask') { const r = await social('/api/compte/inviter', { to: c.from, type: 'ask' }); if (r.error) notify('Demande non envoyée', r.error); return; }
  if (action === 'join') { await joinGame(c.join, c.game); return; }
  if (c.kind === 'call') {
    send('call:ringStop', { callId: c.callId });
    if (action === 'answer') { showWindow(); send('call:incoming', { callId: c.callId, from: c.from }); }
    else social('/api/compte/appel/repondre', { call: c.callId, oui: false }).catch(() => {});
    return;
  }
  if (action === 'callback') { showWindow(); send('call:start', { id: c.from }); return; }
  if (action === 'accept' || action === 'decline') {
    const r = await social('/api/compte/inviter/repondre', { id: c.id, oui: action === 'accept' });
    if (action === 'accept' && c.kind === 'invite') await joinGame(r.join, c.game);
  }
}

// ---------- Captures (Ctrl+Alt+S) et replay des 30 dernières secondes (Ctrl+Alt+R, à activer) ----------
async function saveCapture(buf, ext) {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const game = currentSession()?.name ?? null;
  const dir = captureDir(game);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, captureName(game, ext));
  await writeFile(file, buf);
  return file;
}
async function takeScreenshot() {
  const d = screen.getPrimaryDisplay();
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const src = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size }))[0];
  if (!src || src.thumbnail.isEmpty()) throw new Error('écran introuvable');
  const file = await saveCapture(src.thumbnail.toPNG(), 'png');
  pushCard({ id: `cap-${Date.now()}`, icon: '📸', title: 'Capture enregistrée', body: path.basename(file), actions: [['discord', 'Discord'], ['folder', 'Ouvrir le dossier']], ttl: 8000, file }, true);
  return file;
}

// Les clips sont maintenant dans l'appli History Clips (légère, à part) : le launcher ne filme plus l'écran
const CLIPS_SITE = 'https://zyko144.github.io/vercel-ia-/clips/';
const CLIPS_SETUP = 'https://github.com/zyko144/vercel-ia-/releases/download/clips-latest/History-Clips-Setup.exe';
// History Clips installé : on l'ouvre (et il se connecte à ce compte en un clic) ; sinon on télécharge son installateur
let clipsLinkAt = 0;
const openClipsApp = () => {
  if (!app.getApplicationNameForProtocol('history-clips://')) { shell.openExternal(CLIPS_SETUP); return false; }
  clipsLinkAt = Date.now();
  shell.openExternal(secret('account') ? 'history-clips://lier' : 'history-clips://ouvrir');
  return true;
};
ipcMain.handle('capture:clip', () => ({ ok: openClipsApp() }));
ipcMain.handle('clips:site', () => openClipsApp());
// Bouton Discord : invitation vers le serveur History Launcher (créée par le bot)
ipcMain.handle('app:discord', async () => { const r = await api('/api/discord/invite?app=launcher').catch(() => ({})); await shell.openExternal(r.url ?? 'https://zyko144.github.io/vercel-ia-/'); return Boolean(r.url); });
// History Clips demande à se connecter à ce compte (lien history://clips/CODE) : validé tout seul si on vient de l'ouvrir d'ici,
// sinon on demande (un site ne peut pas relier son propre History Clips à ton compte en douce)
async function approveClips(code) {
  if (!secret('account')) { showWindow(); return; }
  // Preuve locale : History Clips a noté ce code dans son dossier il y a moins de 3 min → validé sans rien demander
  const { readFile: rf } = await import('node:fs/promises');
  let local = false;
  for (const dir of ['History Clips', 'history-clips']) {
    const f = await rf(path.join(app.getPath('appData'), dir, 'lien-launcher.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (f?.code === code && Date.now() - f.at < 180_000) local = true;
  }
  if (!local && Date.now() - clipsLinkAt > 120_000) {
    const r = await dialog.showMessageBox(win ?? undefined, { type: 'question', buttons: ['Autoriser', 'Refuser'], defaultId: 1, cancelId: 1, title: 'History Clips', message: 'Connecter History Clips à ton compte ?', detail: `Code ${code}. Accepte seulement si tu viens de cliquer sur « Se connecter avec History Launcher » dans History Clips.` });
    if (r.response !== 0) return;
  }
  clipsLinkAt = 0;
  const r = await social('/api/compte/lien/valider', { code });
  notify('History Clips', r.ok ? '🎬 Connecté à ton compte History' : r.error ?? 'Connexion refusée');
}

/** Rejoindre un ami : serveur FiveM, jeu Steam, sinon le même jeu s'il est installé ici. */
async function joinGame(join, game) {
  if (join?.fivem && serverCode(join.fivem)) { store.data.fivemLast = serverCode(join.fivem); return openLink(joinLink(serverCode(join.fivem))); }
  const byName = game ? items.find((i) => i.installed && norm(i.name) === norm(game)) : null;
  const bySteam = join?.steam ? items.find((i) => i.steamId === join.steam && i.installed) : null;
  const it = bySteam ?? byName;
  if (it) return doAction(it.id, 'launch');
  if (join?.steam && /^\d{1,10}$/.test(join.steam)) return openLink(`steam://rungameid/${join.steam}`);
  notify('Impossible de rejoindre', game ? `${game} n’est pas installé sur ce PC.` : 'Aucune partie à rejoindre.');
  return null;
}

// Synchro en direct : la boîte de réception reste « en attente » sur le serveur (jusqu'à 25 s) et répond dès
// qu'un message, un appel ou une invitation arrive. La liste d'amis se met à jour au passage.
let socialPrev = null;
let socialLive = null;
let netFails = 0;
let netOnline = true;
async function socialTick(wait = 0) {
  if (process.env.LAUNCHER_DEMO) { const r = demoFriends(); socialLive = r; send('social:live', { ...r, messages: [] }); return true; }
  const token = secret('account');
  if (!token) { socialPrev = null; return false; }
  const after = store.data.inboxAt ?? Date.now() - 60_000;
  const r = await api(`/api/compte/boite?apres=${after}${wait ? `&attente=${wait}` : ''}`, { token, timeout: (wait + 15) * 1000 }).catch(() => null);
  // Serveur injoignable (Wi-Fi coupé, serveur qui redémarre) : l'interface l'affiche, et le dit quand c'est revenu
  const up = Boolean(r && r.status === 200);
  if (r?.status !== 401) { netFails = up ? 0 : netFails + 1; const online = netFails < 2; if (online !== netOnline) { netOnline = online; send('net:state', { online }); } }
  if (!up) return false;
  // Nouveau message, fenêtre pas au premier plan : la barre des tâches clignote (comme Discord)
  if ((r.items ?? []).some((x) => x.type === 'msg' || x.type === 'gmsg') && win && !win.isDestroyed() && !win.isFocused()) win.flashFrame(true);
  store.data.inboxAt = Math.max(after, Number(r.now) || 0, ...(r.items ?? []).map((x) => x.at));
  socialLive = r;
  for (const x of r.items ?? []) {
    if (['msgdel', 'gmsgdel', 'react'].includes(x.type)) continue;
    if (x.type === 'share') { store.data.sharesIn = [...(store.data.sharesIn ?? []).filter((y) => Date.now() - y.at < 86_400_000), { id: x.share, from: x.pseudo, game: x.game, name: x.text, size: x.size, at: x.at }].slice(-20); store.save(); pushCard(cardFor(x), true); continue; }
    if (x.type === 'call') { if (Date.now() - x.at < 60_000) { pushCard(cardFor(x), true); send('call:ringing', { callId: x.callId, from: x.from, pseudo: x.pseudo }); } else logNotif({ ...cardFor(x), kind: 'missed', icon: '📵', title: `Appel manqué de ${x.pseudo ?? 'un ami'}`, body: 'Clique pour le rappeler.', at: x.at }); continue; }
    if ((x.type === 'msg' || x.type === 'gmsg') && bubbleMsg(x)) { logNotif({ ...cardFor(x), read: true }); continue; }
    pushCard(cardFor(x));
  }
  for (const f of newlyPlaying(socialPrev, r.amis)) pushCard(playingCard(f, canJoin(f, items)));
  socialPrev = playingMap(r.amis);
  send('social:live', { amis: r.amis, demandes: r.demandes, code: r.code, moi: r.moi, groupes: r.groupes, messages: (r.items ?? []).filter((x) => x.type === 'msg'), items: r.items ?? [], typing: r.typing ?? [], lus: r.lus ?? {} });
  return true;
}
let socialLoopOn = false;
async function socialLoop() {
  if (socialLoopOn) return;
  socialLoopOn = true;
  for (;;) {
    const t0 = Date.now();
    const ok = await socialTick(process.env.LAUNCHER_DEMO ? 0 : 25).catch(() => false);
    // Réponse trop rapide (ancien serveur, erreur, pas connecté) : petite pause pour ne pas boucler à vide
    const spent = Date.now() - t0;
    await new Promise((r) => setTimeout(r, ok ? (spent < 1500 ? 2500 : 150) : 6000));
  }
}
setTimeout(() => socialLoop(), 3000);
ipcMain.handle('social:now', () => socialTick(0).catch(() => false));

const FID = (v) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, 64);
// Appels vocaux : le launcher relaie les signaux (le son passe directement entre les deux PC)
const CID = (v) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, 64);
ipcMain.handle('call:start', (_e, fid) => social('/api/compte/appel', { to: FID(fid) }));
ipcMain.handle('call:answer', (_e, id, oui) => social('/api/compte/appel/repondre', { call: CID(id), oui: Boolean(oui) }));
ipcMain.handle('call:signal', (_e, id, data) => social('/api/compte/appel/signal', { call: CID(id), data }));
ipcMain.handle('call:poll', (_e, id, after) => social(`/api/compte/appel/signal?call=${CID(id)}&apres=${Number(after) || -1}`));
ipcMain.handle('call:end', (_e, id) => social('/api/compte/appel/fin', { call: CID(id) }));
ipcMain.handle('chat:thread', (_e, fid) => social(`/api/compte/messages?avec=${encodeURIComponent(FID(fid))}`));
// Envoi fiable : même identifiant à chaque essai (le serveur ignore les doublons), 3 essais si le réseau ou le serveur flanche
async function sendReliable(pathname, body) {
  let r;
  for (let i = 0; i < 3; i++) {
    r = await social(pathname, body);
    if (r.status === 200 || (r.status >= 400 && r.status < 500)) return r.status === 200 ? r : { ...r, error: r.error ?? 'Message refusé.' };
    await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
  }
  return { ...r, error: r?.error ?? 'Serveur injoignable : message non envoyé.' };
}
const CIDM = (v) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, 64);
const extraOf = (x) => ({ ...(x?.re ? { re: CIDM(x.re) } : {}), ...(typeof x?.image === 'string' && x.image.length < 1_700_000 ? { image: x.image } : {}), ...(/^[\w-]{36}$/.test(String(x?.file ?? '')) ? { file: x.file } : {}) });
// Fichier joint : envoyé au serveur (10 Mo max), puis ajouté au message par son identifiant
ipcMain.handle('chat:upload', (_e, name, bytes) => (bytes?.byteLength > 10 * 1024 * 1024 ? { ok: false, error: 'Fichier trop gros (10 Mo maximum).' } : apiRaw(`/api/compte/fichier?nom=${encodeURIComponent(String(name ?? 'fichier').slice(0, 120))}`, Buffer.from(bytes))));
ipcMain.handle('chat:download', async (_e, fid, name) => {
  const token = secret('account');
  if (!token || !/^[\w-]{36}$/.test(String(fid))) return { ok: false };
  const res = await fetch(`${API}/api/compte/fichier?id=${fid}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!res?.ok) return { ok: false, error: 'Fichier introuvable ou supprimé.' };
  const { writeFile } = await import('node:fs/promises');
  const safe = path.basename(String(name ?? 'fichier')).replace(/[\\/:*?"<>|]/g, '_') || 'fichier';
  let file = path.join(app.getPath('downloads'), safe);
  for (let n = 1; await import('node:fs').then((fs) => fs.existsSync(file)); n++) file = path.join(app.getPath('downloads'), `${path.parse(safe).name} (${n})${path.parse(safe).ext}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  shell.showItemInFolder(file);
  return { ok: true, file: path.basename(file) };
});
ipcMain.handle('chat:send', (_e, fid, text, cid, extra) => sendReliable('/api/compte/messages', { to: FID(fid), text: String(text ?? '').slice(0, 500), cid: CIDM(cid) || undefined, ...extraOf(extra) }));
ipcMain.handle('chat:read', (_e, fid) => social('/api/compte/messages/lu', { avec: FID(fid) }));
ipcMain.handle('chat:typing', (_e, kind, id) => social('/api/compte/messages/ecrit', kind === 'g' ? { groupe: CIDM(id) } : { to: FID(id) }));
ipcMain.handle('chat:react', (_e, kind, id, msg, emoji) => social('/api/compte/messages/reagir', { ...(kind === 'g' ? { groupe: CIDM(id) } : { avec: FID(id) }), id: CIDM(msg), emoji: String(emoji ?? '').slice(0, 4) }));
ipcMain.handle('chat:delete', (_e, fid, id) => social('/api/compte/messages/supprimer', { avec: FID(fid), id: CIDM(id) }));
ipcMain.handle('group:thread', (_e, gid) => social(`/api/compte/groupes/messages?id=${encodeURIComponent(CIDM(gid))}`));
ipcMain.handle('group:send', (_e, gid, text, cid, extra) => sendReliable('/api/compte/groupes/messages', { id: CIDM(gid), text: String(text ?? '').slice(0, 500), cid: CIDM(cid) || undefined, ...extraOf(extra) }));
ipcMain.handle('group:delete', (_e, gid, id) => social('/api/compte/groupes/messages/supprimer', { id: CIDM(gid), msg: CIDM(id) }));
ipcMain.handle('friend:invite', (_e, fid, type) => social('/api/compte/inviter', { to: FID(fid), type: type === 'invite' ? 'invite' : 'ask', ...(type === 'invite' ? { game: currentSession()?.name ?? undefined } : {}) }));
ipcMain.handle('friend:join', async (_e, fid) => {
  const f = (socialLive?.amis ?? (await social('/api/compte/amis')).amis ?? []).find((a) => a.id === FID(fid));
  if (!f?.playing) return { ok: false, error: 'Cet ami ne joue pas en ce moment.' };
  await joinGame(f.join, f.playing);
  return { ok: true };
});

// ---------- Amis History (comptes du launcher) et soirées jeu ----------
async function social(pathname, body) {
  const token = secret('account');
  if (!token) return { status: 401, error: 'Connecte-toi à ton compte History pour ça.' };
  return api(pathname, { method: body ? 'POST' : 'GET', token, body }).catch(() => ({ status: 0, error: 'Serveur injoignable, vérifie ta connexion internet.' }));
}
const ID = (v) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, 64);
ipcMain.handle('hfriends:get', () => (process.env.LAUNCHER_DEMO ? demoFriends() : social('/api/compte/amis')));
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
      const n = new Notif({ title: `${e.game} dans ${Math.max(1, Math.round(soon / 60_000))} min`, body: game ? 'Clique pour lancer le jeu.' : `Soirée organisée par ${e.organisateur}.`, icon: ICON });
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
  // Actus des jeux INSTALLÉS : refaites dès que la liste change (jeu installé ou désinstallé), sinon toutes les heures
  const games = items.filter((i) => i.source === 'steam' && i.installed && /^\d+$/.test(i.steamId ?? '')).sort((a, b) => b.minutes - a.minutes).slice(0, 6);
  const fortnite = items.find((i) => i.installed && /^fortnite$/i.test(i.name ?? ''));
  const key = [...games.map((g) => g.id), fortnite?.id].filter(Boolean).join(',');
  const c = store.data.news;
  if (c && c.key === key && Date.now() - c.at < 3_600_000) return c.list;
  const all = [
    ...(await Promise.all(games.map((g) => steamNews(g.steamId, 2).then((n) => n.map((x) => ({ ...x, game: g.name, id: g.id, image: g.art?.header ?? g.art?.hero ?? null }))).catch(() => [])))).flat(),
    ...(fortnite ? (await fortniteNews(2).catch(() => [])).map((x) => ({ ...x, id: fortnite.id, image: x.image ?? fortnite.art?.hero ?? null })) : []),
  ];
  const list = await translateNews(await getAi(), all.sort((a, b) => b.at - a.at).slice(0, 8), (store.data.newsFr ??= {}));
  store.data.news = { at: Date.now(), list, key };
  store.save();
  return list;
});
// Article hors Steam (Fortnite) : ouvert seulement s'il vient d'un site officiel
ipcMain.handle('news:url', (_e, url) => { const u = String(url ?? ''); if (/^https:\/\/(www\.)?(fortnite\.com|epicgames\.com)\//.test(u)) shell.openExternal(u); return true; });
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
  const days = process.env.LAUNCHER_DEMO ? demoActivity().days : store.data.days;
  const split = periodStats(days, n);
  const top = [...items].sort((a, b) => b.minutes - a.minutes).slice(0, 8).map((i) => ({ id: i.id, name: i.name, minutes: i.minutes, cat: statCategory(i) }));
  // Classement de la période (temps suivi par le launcher), en plus du temps total
  const recent = periodItems(days, n);
  // Classement « 2 dernières semaines » : chiffres officiels de Steam pour ses jeux, chronomètre du launcher pour les autres
  const tracked14 = periodItems(days, 14);
  const twoWeeks = Object.fromEntries(items.filter((i) => i.kind === 'game').map((i) => [i.id, i.recent2w ?? tracked14[i.id] ?? 0]).filter(([, m]) => m > 0));
  return { split, top, recent, twoWeeks, profile: process.env.LAUNCHER_DEMO ? 'Alex' : os.userInfo().username };
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
// ---------- Actions que l'assistant peut faire à ta place (en plus de lancer / fermer les jeux) ----------
const gbTxt = (b) => `${(b / 1e9).toFixed(1).replace('.', ',')} Go`;
const bestMatch = (list, name, key = (x) => x.name) => list.map((x) => ({ x, s: similarity(name, key(x)) + (norm(key(x)).startsWith(norm(name)) ? 0.3 : 0) })).sort((a, b) => b.s - a.s).find((m) => m.s >= 0.55)?.x ?? null;
const LAUNCHER_ACTIONS = ['add_friend', 'accept_friends', 'friends_status', 'empty_bin', 'boost', 'disk_status', 'pc_status', 'daily_limit', 'startup_off', 'collection_add', 'steam_join', 'steam_message', 'unfavorite', 'overlay', 'theme', 'event', 'tweak', 'update', 'screenshot', 'clip'];
async function execAction(c) {
  const a = c.action;
  if (a === 'screenshot') { await new Promise((r) => setTimeout(r, 400)); const f = await takeScreenshot(); return `📸 Capture enregistrée : ${path.basename(f)}.`; }
  if (a === 'clip') { openClipsApp(); return '🎬 Les clips sont dans History Clips : je t’ouvre la page pour la télécharger.'; }
  if (a === 'appvol') {
    // « le jeu » : le jeu en cours ; sinon le nom de l'appli (Discord, Spotify, Chrome…)
    const s = currentSession(); const game = s ? items.find((i) => i.id === s.id) : null;
    const app = /^(jeu|game|la partie)$/.test(c.target) && game?.exe ? path.win32.basename(game.exe, '.exe') : c.target;
    const n = await setAppVolume(app, c.value);
    return n ? c.reply : `Je n’ai pas trouvé ${c.target} en train de faire du son.`;
  }
  if (a === 'update') {
    const r = await checkUpdate(true);
    if (r.dev) return `Tu utilises la version développeur (${r.current}) : lance « restaurer-launcher.bat » ou « demarrer-launcher.bat » pour la mettre à jour.`;
    if (r.error) return `Je n’arrive pas à vérifier les mises à jour (${r.error}).`;
    if (r.uptodate) return `Tu as déjà la dernière version (${r.current}) 👍`;
    return `Je télécharge la version ${r.version} : le launcher redémarre tout seul dès qu’elle est prête.`;
  }
  if (a === 'add_friend') {
    const r = await social('/api/compte/amis/ajouter', { code: String(c.value ?? '').slice(0, 40) });
    return r.amis ? `C’est fait : vous êtes maintenant amis 🎉` : r.envoye ? `Demande d’ami envoyée à ${c.value}.` : r.error ?? 'Impossible pour l’instant.';
  }
  if (a === 'accept_friends') {
    const r = await social('/api/compte/amis');
    if (r.error) return r.error;
    for (const d of r.demandes ?? []) await social('/api/compte/amis/accepter', { id: d.id });
    return r.demandes?.length ? `J’ai accepté ${r.demandes.map((d) => d.pseudo).join(', ')} 👍` : 'Tu n’as aucune demande d’ami en attente.';
  }
  if (a === 'friends_status') {
    const h = await social('/api/compte/amis').catch(() => ({}));
    if (!friendsCache.data || Date.now() - friendsCache.at > 60_000) friendsCache = { at: Date.now(), data: await steamFriends(secret('steam'), myId64()).catch(() => null) };
    const playing = [...(h.amis ?? []).filter((x) => x.playing).map((x) => `${x.pseudo} joue à ${x.playing}`), ...(friendsCache.data?.friends ?? []).filter((f) => f.game).map((f) => `${f.name} joue à ${f.game}`)];
    const online = [...(h.amis ?? []).filter((x) => x.online && !x.playing).map((x) => x.pseudo), ...(friendsCache.data?.friends ?? []).filter((f) => f.online && !f.game).map((f) => f.name)];
    if (!playing.length && !online.length) return 'Aucun ami en ligne pour l’instant.';
    return `${playing.length ? `${playing.slice(0, 6).join(', ')}.` : ''}${online.length ? ` En ligne : ${online.slice(0, 8).join(', ')}.` : ''}`.trim();
  }
  if (a === 'empty_bin') {
    const size = await recycleBinSize();
    if (!size) return 'Ta corbeille est déjà vide.';
    if (!(await confirm('Vider la corbeille ?', `${gbTxt(size)} seront supprimés définitivement.`, { danger: true, ok: 'Vider', icon: '♻' }))) return 'D’accord, je ne touche à rien.';
    await emptyRecycleBin();
    return `Corbeille vidée : ${gbTxt(size)} libérés.`;
  }
  if (a === 'boost') {
    store.data.settings.boost = { ...boostSettings(), enabled: c.value !== 'off' };
    store.save();
    return c.value === 'off' ? 'Boost désactivé.' : 'Boost activé : tes prochaines parties auront les performances au max.';
  }
  if (a === 'disk_status') {
    const [free, disk] = await Promise.all([freeSpace(), diskSize()]);
    return free == null ? 'Je n’arrive pas à lire ton disque.' : `Il te reste ${gbTxt(free)} de libres sur ${gbTxt(disk)}${free / disk < 0.15 ? ' : c’est peu, je te conseille une optimisation.' : '.'}`;
  }
  if (a === 'pc_status') {
    const p = await snapshot().catch(() => null);
    if (!p) return 'Je n’arrive pas à lire les capteurs.';
    const parts = [`processeur ${p.cpu.usage ?? '?'} %${p.cpu.temp ? ` (${p.cpu.temp} °C)` : ''}`, `mémoire ${Math.round((100 * p.ram.used) / p.ram.total)} %`];
    if (p.gpu) parts.push(`carte graphique ${p.gpu.usage ?? '?'} %${p.gpu.temp != null ? ` (${p.gpu.temp} °C)` : ''}`);
    const hot = (p.gpu?.temp ?? 0) >= 85 || (p.cpu.temp ?? 0) >= 90;
    return `En ce moment : ${parts.join(', ')}.${hot ? ' Ça chauffe : aère le PC ou baisse les graphismes.' : ' Tout va bien.'}`;
  }
  if (a === 'daily_limit') { store.data.settings.dailyLimit = Math.max(0, Math.min(1440, Number(c.value) || 0)); store.save(); return null; }
  if (a === 'startup_off') {
    if (!startupList.length) startupList = await startupApps().catch(() => []);
    const hit = bestMatch(startupList, String(c.target ?? ''));
    if (!hit) return `Je ne trouve pas « ${c.target} » dans les applis au démarrage.`;
    await setStartup(hit.name, false).catch(() => {});
    startupList = await startupApps().catch(() => startupList);
    return `${hit.name} ne se lancera plus au démarrage de Windows.`;
  }
  if (a === 'collection_add') {
    const item = items.find((i) => i.id === c.itemId) ?? findByName(items, String(c.target ?? ''));
    if (!item) return 'Je ne trouve pas ce jeu.';
    const cols = (store.data.collections ??= {});
    const name = String(c.value ?? '').trim().slice(0, 40) || 'Ma collection';
    let id = Object.keys(cols).find((k) => norm(cols[k].name) === norm(name));
    if (!id) { id = `c${Date.now().toString(36)}`; cols[id] = { name: name[0].toUpperCase() + name.slice(1), items: [] }; }
    cols[id].items = [...new Set([...cols[id].items, item.id])];
    store.save();
    send('cols:update', cols);
    return `${item.name} est dans la collection « ${cols[id].name} ».`;
  }
  if (a === 'steam_join' || a === 'steam_message') {
    if (!friendsCache.data || Date.now() - friendsCache.at > 60_000) friendsCache = { at: Date.now(), data: await steamFriends(secret('steam'), myId64()).catch(() => null) };
    if (!friendsCache.data?.ok) return 'Je n’ai pas accès à tes amis Steam (ajoute ta clé Steam dans Paramètres).';
    const f = bestMatch(friendsCache.data.friends, String(c.target ?? ''));
    if (!f) return `Je ne trouve pas « ${c.target} » dans tes amis Steam.`;
    const link = friendLink(a === 'steam_join' ? 'join' : 'message', f);
    if (!link) return `${f.name} n’a pas de partie ouverte à rejoindre${f.game ? ` (il joue à ${f.game})` : ''}.`;
    await runSilentSteam([link]);
    return a === 'steam_join' ? `Je te connecte à la partie de ${f.name} (${f.game}).` : `Discussion Steam avec ${f.name} ouverte.`;
  }
  if (a === 'unfavorite' && c.itemId) { (store.data.items[c.itemId] ??= {}).favorite = false; store.save(); await remerge(); send('lib:update', library()); return null; }
  if (a === 'overlay') { if (!overlay) toggleOverlay(); return null; }
  if (a === 'theme') { if (['bleu', 'violet', 'rouge', 'vert', 'orange', 'rose', 'auto'].includes(c.value)) { store.data.settings.theme = c.value; store.save(); } return null; }
  if (a === 'tweak') { const ok = await setTweak(String(c.value), true).catch(() => false); return ok ? 'Réglage appliqué ✅' : 'Je ne connais pas ce réglage.'; }
  if (a === 'event') {
    const h = await social('/api/compte/amis');
    if (h.error) return h.error;
    const names = String(c.extra ?? '').split(/[,;]| et /).map((x) => x.trim()).filter(Boolean);
    const invites = (names.length ? names.map((n) => bestMatch(h.amis ?? [], n, (x) => x.pseudo)).filter(Boolean) : h.amis ?? []).map((x) => x.id);
    const at = Date.parse(String(c.value ?? ''));
    const game = findByName(items, String(c.target ?? ''))?.name ?? String(c.target ?? '').slice(0, 80);
    const r = await social('/api/compte/soirees', { jeu: game, at, invites });
    return r.soirees ? `Soirée ${game} organisée le ${new Date(at).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} : ${invites.length} ami(s) invité(s) 🎉` : r.error ?? 'Impossible d’organiser la soirée.';
  }
  return null;
}

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
  } else if (LAUNCHER_ACTIONS.includes(c.action)) {
    const reply = await execAction(c).catch((err) => `Impossible pour l’instant (${err.message}).`);
    if (reply) out.reply = reply;
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
        const h = await social('/api/compte/amis').catch(() => ({}));
        const [free, disk] = await Promise.all([freeSpace().catch(() => null), diskSize().catch(() => null)]);
        context.extra += `\nAmis History : ${(h.amis ?? []).map((a) => `${a.pseudo}${a.playing ? ` (joue à ${a.playing})` : a.online ? ' (en ligne)' : ''}`).join(', ') || 'aucun'}${h.demandes?.length ? ` · demandes en attente : ${h.demandes.map((d) => d.pseudo).join(', ')}` : ''}`;
        context.extra += `\nDisque : ${free != null ? `${gbTxt(free)} libres sur ${gbTxt(disk)}` : 'inconnu'} · Boost : ${boostSettings().enabled ? 'activé' : 'désactivé'} · Collections : ${Object.values(store.data.collections ?? {}).map((x) => x.name).join(', ') || 'aucune'}`;
        const r = await assistant(ai, clean, context);
        out = { reply: r.reply, action: r.action, value: r.value };
        if (LAUNCHER_ACTIONS.includes(r.action)) {
          const reply = await execAction({ ...r, itemId: r.target ? findByName(items, r.target)?.id : undefined }).catch((err) => `Impossible pour l’instant (${err.message}).`);
          if (reply) out.reply = reply;
        }
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
// Les plateformes (Epic, Steam, EA…) ne sont pas dans la liste d'écoute : un bruit de jeu ou de Discord ne doit jamais les ouvrir
const listenNames = () => items.filter((i) => i.installed && (i.kind === 'game' || i.brand || i.known) && !/epic games|^steam$|ea app|ubisoft|battle\.net|rockstar games launcher|riot client/i.test(i.name)).map((i) => i.name);
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
    if (grammar === 'cmd' || grammar === 'music' || grammar === 'view') { if (confidence >= 0.7) command = stripWake(text) ?? text; } // seuil relevé : moins de commandes entendues par erreur
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
ipcMain.handle('voice:list', () => listVoices());
ipcMain.handle('voice:say', (_e, name) => speakRaw('Salut, je suis la voix de History Launcher.', String(name ?? '')));
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
async function api(pathname, { method = 'GET', body, token, timeout = 20_000 } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
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
    // Identifiant aléatoire de ce PC (jamais lié au matériel) : le serveur prévient par e-mail d'une connexion depuis un nouveau PC
    store.data.deviceId ??= randomUUID();
    const clean = { pseudo: String(body?.pseudo ?? '').slice(0, 40), email: String(body?.email ?? '').slice(0, 254), motDePasse: String(body?.motDePasse ?? '').slice(0, 128), appareil: store.data.deviceId };
    const r = await api(`/api/compte/${kind}`, { method: 'POST', body: clean }).catch(() => ({ status: 0, error: 'Serveur injoignable, vérifie ta connexion internet.' }));
    if (r.need2fa) return { ok: false, need2fa: true, ticket: r.ticket };
    return loggedIn(r);
  });
}
function loggedIn(r) {
  if (r.token) {
    setSecret('account', r.token); store.data.settings.lastAccount = r.compte; store.data.settings.skipAccount = false; store.save(); setTimeout(() => autoRestore().catch(() => {}), 1500);
    // History Clips installé : il se relie aussi à ce compte, tout seul
    if (app.getApplicationNameForProtocol('history-clips://')) setTimeout(() => { clipsLinkAt = Date.now(); shell.openExternal('history-clips://lier').catch(() => {}); }, 3000);
  }
  return { ok: Boolean(r.token), compte: r.compte ?? null, error: r.token ? null : r.error ?? 'Erreur.', recoveryLeft: r.recoveryLeft };
}
// Sécurité du compte : double authentification (QR code), vérification de l'e-mail, mot de passe oublié
const code6 = (v) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, 20);
const secu = async (pathname, body, auth = true) => {
  const token = auth ? secret('account') : undefined;
  if (auth && !token) return { ok: false, error: 'Connecte-toi d’abord.' };
  const r = await api(pathname, { method: 'POST', token, body }).catch(() => ({ status: 0, error: 'Serveur injoignable, vérifie ta connexion internet.' }));
  return { ...r, ok: r.status === 200 && r.ok !== false };
};
ipcMain.handle('account:2fa', async (_e, ticket, code) => loggedIn(await api('/api/compte/connexion/2fa', { method: 'POST', body: { ticket: String(ticket ?? '').slice(0, 64), code: code6(code) } }).catch(() => ({ status: 0, error: 'Serveur injoignable.' }))));
ipcMain.handle('account:verif', async (_e, code) => { const r = await secu('/api/compte/verif', { code: code6(code) }); if (r.compte) { store.data.settings.lastAccount = r.compte; store.save(); } return r; });
ipcMain.handle('account:verifResend', () => secu('/api/compte/verif/envoyer', {}));
// Profil personnalisé (photo recadrée par l'interface, couleur, bio)
// Réseaux d'un profil : le lien est reconstruit ici à partir du pseudo, vers le site officiel seulement
function profileLinkUrl(kind, h) {
  const v = String(h ?? '');
  if (kind === 'discord') return /^gg\/[\w-]{2,40}$/.test(v) ? `https://discord.gg/${v.slice(3)}` : null;
  if (!/^[\w.-]{2,40}$/.test(v)) return null;
  if (kind === 'twitch') return `https://www.twitch.tv/${v}`;
  if (kind === 'youtube') return /^UC[\w-]{22}$/.test(v) ? `https://www.youtube.com/channel/${v}` : `https://www.youtube.com/@${v}`;
  if (kind === 'tiktok') return `https://www.tiktok.com/@${v}`;
  if (kind === 'steam') return /^\d{17}$/.test(v) ? `https://steamcommunity.com/profiles/${v}` : `https://steamcommunity.com/id/${v}`;
  if (kind === 'instagram') return `https://www.instagram.com/${v}`;
  return null;
}
ipcMain.handle('profile:link', async (_e, kind, h) => {
  const url = profileLinkUrl(String(kind), h);
  if (!url) return { ok: false };
  await shell.openExternal(url);
  return { ok: true };
});
ipcMain.handle('account:profile', async (_e, p) => {
  const body = {};
  if (p && 'avatar' in p) body.avatar = p.avatar === null ? null : String(p.avatar ?? '').slice(0, 220_000);
  if (p && 'couleur' in p) body.couleur = String(p.couleur ?? '').slice(0, 7);
  if (p && 'bio' in p) body.bio = String(p.bio ?? '').slice(0, 140);
  for (const k of ['cadre', 'effet', 'banniere']) if (p && k in p) body[k] = String(p[k] ?? '').slice(0, 20);
  if (p && 'cadreCouleur' in p) body.cadreCouleur = p.cadreCouleur === null ? null : String(p.cadreCouleur ?? '').slice(0, 7);
  if (p && 'fond' in p) body.fond = p.fond === null ? null : String(p.fond ?? '').slice(0, 7);
  if (p && Array.isArray(p.cacher)) body.cacher = p.cacher.slice(0, 3).map((x) => String(x).slice(0, 10));
  if (p && 'jeu' in p) body.jeu = String(p.jeu ?? '').slice(0, 60);
  if (p && Array.isArray(p.badges)) body.badges = p.badges.slice(0, 3).map((x) => String(x).slice(0, 20));
  if (p && p.liens && typeof p.liens === 'object') body.liens = Object.fromEntries(Object.entries(p.liens).slice(0, 8).map(([k, v]) => [String(k).slice(0, 12), String(v ?? '').slice(0, 120)]));
  if (p && 'banniereImg' in p) body.banniereImg = p.banniereImg === null ? null : String(p.banniereImg ?? '').slice(0, 420_000);
  const r = await secu('/api/compte/profil', body);
  if (r.compte) { store.data.settings.lastAccount = r.compte; store.save(); }
  return r;
});
ipcMain.handle('account:forgot', (_e, email) => secu('/api/compte/mdp/oubli', { email: String(email ?? '').slice(0, 254) }, false));
ipcMain.handle('account:reset', (_e, email, code, motDePasse) => secu('/api/compte/mdp/nouveau', { email: String(email ?? '').slice(0, 254), code: code6(code), motDePasse: String(motDePasse ?? '').slice(0, 128) }, false));
ipcMain.handle('account:2faStart', async () => {
  const r = await secu('/api/compte/2fa/debut', {});
  if (!r.url) return r;
  const QR = (await import('qrcode')).default;
  const qr = await QR.toDataURL(r.url, { margin: 1, width: 240, color: { dark: '#0b0910', light: '#ffffff' } });
  return { ok: true, qr, secret: r.secret };
});
ipcMain.handle('account:discordCode', () => secu('/api/compte/discord/code', {}));
ipcMain.handle('account:discordUnlink', () => secu('/api/compte/discord/delier', {}));
ipcMain.handle('groups:create', (_e, nom, membres) => social('/api/compte/groupes', { nom: String(nom ?? '').slice(0, 40), membres: (Array.isArray(membres) ? membres : []).map(String).slice(0, 30) }));
ipcMain.handle('groups:notify', (_e, id, text) => social('/api/compte/groupes/prevenir', { id: String(id ?? ''), text: String(text ?? '').slice(0, 200) }));
ipcMain.handle('groups:leave', (_e, id) => social('/api/compte/groupes/quitter', { id: String(id ?? '') }));
ipcMain.handle('account:unlock', (_e, code) => secu('/api/compte/2fa/verifier', { code: code6(code) }));
ipcMain.handle('account:2faOn', (_e, code) => secu('/api/compte/2fa/activer', { code: code6(code) }));
ipcMain.handle('account:2faOff', (_e, motDePasse, code) => secu('/api/compte/2fa/desactiver', { motDePasse: String(motDePasse ?? '').slice(0, 128), code: code6(code) }));
// ---------- Sauvegarde en ligne (compte History) : toutes les 30 min, à la fermeture, et restauration sur un nouveau PC ----------
let lastBackupHash = null;
async function backupNow(force = false) {
  const token = secret('account');
  if (!token) return { ok: false, error: 'Connecte-toi à ton compte History.' };
  // Réglages des jeux (touches, graphismes) ajoutés à la sauvegarde
  store.data.gameConfigs = mergeConfigs(store.data.gameConfigs, await collectConfigs(cfgDirs()).catch(() => ({})));
  const data = pickBackup(store.data);
  const json = JSON.stringify(data);
  const hash = `${json.length}:${json.slice(0, 64)}:${json.slice(-256)}`;
  if (!force && hash === lastBackupHash) return { ok: true, same: true, at: store.data.backupAt ?? null };
  const r = await api('/api/compte/sauvegarde', { method: 'POST', token, body: { pc: os.hostname(), data } }).catch(() => ({ status: 0, error: 'Serveur injoignable.' }));
  if (!r.ok) return { ok: false, error: r.error ?? 'Sauvegarde impossible.' };
  lastBackupHash = hash;
  store.data.backupAt = r.at;
  store.save();
  return { ok: true, at: r.at };
}
async function applyRemote(remote) {
  const merged = mergeBackup(store.data, remote);
  for (const [k, v] of Object.entries(merged)) store.data[k] = v;
  store.save();
  await remerge();
  send('lib:update', library());
  send('cols:update', store.data.collections ?? {});
}
async function restoreNow() {
  const token = secret('account');
  if (!token) return { ok: false, error: 'Connecte-toi à ton compte History.' };
  const r = await api('/api/compte/sauvegarde', { token }).catch(() => ({ status: 0 }));
  if (r.status !== 200) return { ok: false, error: r.error ?? 'Serveur injoignable.' };
  if (!r.data) return { ok: false, error: 'Aucune sauvegarde sur ton compte pour l’instant.' };
  await applyRemote(r.data);
  return { ok: true, at: r.at, pc: r.pc };
}
/** Premier lancement (ou réinstallation) : on remet tout de suite la sauvegarde du compte. */
async function autoRestore() {
  if (!isFresh(store.data) || store.data.restoredOnce) return;
  const r = await restoreNow();
  store.data.restoredOnce = true;
  store.save();
  if (r.ok) notify('Sauvegarde retrouvée ☁', `Tes collections, favoris, réglages et heures${r.pc ? ` (depuis ${r.pc})` : ''} sont de retour.`);
}
const cfgDirs = () => ({ local: process.env.LOCALAPPDATA, appdata: app.getPath('appData'), docs: app.getPath('documents') });
ipcMain.handle('configs:restore', async () => {
  const saved = store.data.gameConfigs ?? {};
  const games = [...new Set(Object.values(saved).map((v) => v.game))];
  if (!games.length) return { ok: false, error: 'Aucun réglage de jeu sauvegardé pour l’instant.' };
  if (!(await confirm('Remettre tes réglages de jeux sur ce PC ?', `${games.join(', ')} : touches, sensibilité et graphismes. Ferme ces jeux avant. Les réglages actuels sont gardés à côté (.history-bak).`))) return { ok: false, cancelled: true };
  return { ok: true, games: await restoreConfigs(cfgDirs(), saved) };
});
ipcMain.handle('backup:get', () => ({ at: store.data.backupAt ?? null, logged: Boolean(secret('account')) }));
ipcMain.handle('backup:now', () => backupNow(true));
ipcMain.handle('backup:restore', () => restoreNow());
setInterval(() => backupNow().catch(() => {}), 30 * 60_000);
setTimeout(() => autoRestore().then(() => backupNow()).catch(() => {}), 20_000);

ipcMain.handle('account:logout', async () => {
  const token = secret('account');
  if (token) await api('/api/compte/deconnexion', { method: 'POST', token }).catch(() => {});
  setSecret('account', '');
  store.data.settings.lastAccount = null;
  store.save();
  return { ok: true };
});
ipcMain.handle('account:skip', () => { store.data.settings.skipAccount = true; store.save(); return { ok: true }; });

ipcMain.handle('open:link', (_e, which) => openLink({ steam: 'https://steamcommunity.com/dev/apikey', grid: 'https://www.steamgriddb.com/profile/preferences/api', site: 'https://zyko144.github.io/vercel-ia-/' }[which] ?? ''));
app.on('will-quit', () => globalShortcut.unregisterAll());
// Raccourcis globaux (même en jeu), modifiables dans Paramètres › Général
const HOTKEYS = {
  overlay: ['CommandOrControl+Alt+O', () => toggleOverlay()],
  palette: ['CommandOrControl+Alt+Space', () => { showWindow(); send('palette:open', {}); }],
  shot: ['CommandOrControl+Alt+S', () => { takeScreenshot().catch((err) => notify('Capture impossible', err.message)); }],
  toggle: ['CommandOrControl+Alt+H', () => (win?.isVisible() && win.isFocused() ? win.hide() : showWindow())],
  perfbar: ['CommandOrControl+Alt+P', () => togglePerfbar()],
  rocketleague: ['CommandOrControl+Alt+I', () => toggleRlOverlay()],
};
const hotkeyOf = (k) => store.data.settings.hotkeys?.[k] || HOTKEYS[k][0];
function registerHotkeys() {
  globalShortcut.unregisterAll();
  const failed = [];
  for (const [k, [, fn]] of Object.entries(HOTKEYS)) { try { if (!globalShortcut.register(hotkeyOf(k), fn)) failed.push(k); } catch { failed.push(k); } }
  return failed;
}
ipcMain.handle('hotkeys:get', () => Object.fromEntries(Object.keys(HOTKEYS).map((k) => [k, hotkeyOf(k)])));
ipcMain.handle('hotkeys:set', (_e, key, accel) => {
  const KEY = /^([A-Z0-9]|F([1-9]|1\d|2[0-4])|Space|Tab|Up|Down|Left|Right|PrintScreen|Insert|Delete|Home|End|PageUp|PageDown|Backspace|Return|Capslock|Numlock|Scrolllock|num[0-9]|numdec|numadd|numsub|nummult|numdiv|Plus|[;=,\-./`'\[\]\\])$/;
  const parts = String(accel ?? '').split('+'); const k = parts.pop(); const mods = parts;
  const valid = accel === null || (KEY.test(k) && mods.every((m) => ['CommandOrControl', 'Alt', 'Shift'].includes(m)) && new Set(mods).size === mods.length && (mods.length > 0 || !/^[A-Z0-9 ]$|^(Space|Tab|Backspace|Return|Capslock)$/.test(k)));
  if (!HOTKEYS[key] || !valid) return { ok: false, error: 'Combinaison non valable (une lettre ou un chiffre seul bloquerait ton clavier : ajoute Ctrl, Alt ou Maj).' };
  if (accel && Object.keys(HOTKEYS).some((k) => k !== key && hotkeyOf(k) === accel)) return { ok: false, error: 'Déjà utilisée par un autre raccourci.' };
  const hk = { ...(store.data.settings.hotkeys ?? {}) };
  if (accel) hk[key] = accel; else delete hk[key];
  store.data.settings.hotkeys = hk; store.save();
  const failed = registerHotkeys();
  return failed.includes(key) ? { ok: false, error: 'Windows ou une autre appli utilise déjà cette combinaison.' } : { ok: true, value: hotkeyOf(key) };
});
ipcMain.handle('fivem:join', async (_e, code) => {
  const c = serverCode(code);
  if (!c) return { ok: false, error: 'Code de serveur invalide (ex. cfx.re/join/abc123).' };
  store.data.fivemLast = c; // pour « Rejoindre » côté amis
  await openLink(joinLink(c));
  return { ok: true };
});
// Serveurs FiveM : favoris (joueurs en ligne via l'annuaire FiveM) + heures par serveur tirées des journaux
const fivemInfoCache = new Map(); // code -> { at, info }
async function serverInfoCached(code) {
  const c = fivemInfoCache.get(code);
  if (c && Date.now() - c.at < 60_000) return c.info;
  const info = await fivemServerInfo(code).catch(() => ({ online: null }));
  fivemInfoCache.set(code, { at: Date.now(), info });
  if (info.name) (store.data.fivemNames ??= {})[code] = info.name;
  return info;
}
// Garry's Mod : addons installés, fiche Workshop, installation par Steam
ipcMain.handle('gmod:addons', async () => {
  const g = items.find((i) => i.source === 'steam' && String(i.steamId) === GMOD_APPID);
  if (!g?.installDir) return { error: 'Garry’s Mod n’est pas installé.' };
  return { list: await installedAddons(g.installDir, path.resolve(g.installDir, '..', '..')) };
});
ipcMain.handle('gmod:details', async (_e, input) => {
  const id = workshopId(input);
  if (!id) return { error: 'Colle le lien d’un addon du Workshop (…/filedetails/?id=…).' };
  const d = await workshopDetails(id).catch(() => null);
  if (!d) return { error: 'Addon introuvable (il est peut-être privé).' };
  if (!d.gmod) return { error: 'Cet élément du Workshop n’est pas pour Garry’s Mod.' };
  return d;
});
ipcMain.handle('gmod:install', (_e, id) => (/^\d{6,12}$/.test(String(id)) ? openLink(`steam://url/CommunityFilePage/${id}`).then(() => ({ ok: true })) : { ok: false }));
ipcMain.handle('gmod:browse', () => openLink('steam://url/SteamWorkshopPage/4000').then(() => ({ ok: true })));
ipcMain.handle('fivem:servers', async () => {
  const mins = serverMinutes(store.data.fivemLogs);
  const favs = store.data.fivemFavs ?? [];
  const codes = [...new Set([...favs, ...Object.entries(mins).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k)])];
  const list = await Promise.all(codes.map(async (code) => { const info = await serverInfoCached(code); return { code, fav: favs.includes(code), minutes: mins[code] ?? 0, ...info, name: info.name ?? store.data.fivemNames?.[code] ?? null }; }));
  const known = Object.values(store.data.fivemLogs ?? {}).length;
  return { list, logs: known, unknownMinutes: Math.max(0, (items.find((i) => i.id === 'fivem:client')?.minutes ?? 0) - Object.values(mins).reduce((a, b) => a + b, 0)) };
});
ipcMain.handle('fivem:fav', (_e, code, on) => {
  const c = serverCode(code);
  if (!c) return { ok: false, error: 'Code de serveur invalide.' };
  const favs = new Set(store.data.fivemFavs ?? []);
  if (on) favs.add(c); else favs.delete(c);
  store.data.fivemFavs = [...favs].slice(0, 30);
  store.save();
  return { ok: true };
});
ipcMain.handle('stats:game', (_e, id) => itemHistory(store.data.days, String(id), 30));
ipcMain.handle('app:version', () => app.getVersion());

// ---------- Mises à jour automatiques (version installée) : téléchargées en fond depuis les versions publiées sur GitHub ----------
let updater = null;
let updateReady = null;
// Mises à jour : l'appli demande « Mettre à jour maintenant ? ». Oui → téléchargement puis redémarrage automatique.
// Non → téléchargée en fond et installée à la prochaine fermeture. L'IA peut aussi la lancer (« mets à jour l'appli »).
let updateInfo = { state: 'idle', version: null, percent: 0, installNow: false, error: null };
const updateState = (patch) => { updateInfo = { ...updateInfo, ...patch }; send('update:state', updateInfo); };
async function startUpdater() {
  if (!app.isPackaged) return; // version « développeur » (.bat) : c'est git qui met à jour
  const mod = await import('electron-updater').catch(() => null);
  updater = mod?.default?.autoUpdater ?? mod?.autoUpdater ?? null;
  if (!updater) return;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.logger = null;
  updater.on('update-available', (info) => {
    const fresh = updateInfo.version !== info.version;
    updateState({ state: 'available', version: info.version, error: null });
    // Fenêtre fermée ou rangée : une notification Windows (clic = ouvrir le launcher sur la question)
    if (fresh && (!win || win.isDestroyed() || !win.isVisible()) && Notification.isSupported()) {
      const n = new Notif({ title: `History Launcher v${info.version} disponible`, body: 'Clique pour mettre à jour maintenant (moins d’une minute).', icon: ICON });
      n.on('click', () => showWindow());
      n.show();
    }
    // Filet de sécurité : sans réponse à « Mettre à jour maintenant ? » en 10 min, elle se télécharge en fond
    // et s'installe à la prochaine fermeture (une mise à jour n'est jamais bloquée par l'interface)
    setTimeout(() => { if (updateInfo.state === 'available' && updateInfo.version === info.version) downloadUpdate(false); }, 10 * 60_000);
  });
  updater.on('update-not-available', () => { if (updateInfo.state === 'checking') updateState({ state: 'uptodate' }); });
  updater.on('download-progress', (p) => updateState({ state: 'progress', percent: Math.round(p.percent) }));
  updater.on('update-downloaded', (info) => {
    updateReady = info.version;
    updateState({ state: 'ready', version: info.version });
    if (updateInfo.installNow) setTimeout(() => { quitting = true; updater.quitAndInstall(true, true); }, 1500);
  });
  updater.on('error', (err) => { fatalLog(err); if (['checking', 'progress'].includes(updateInfo.state)) updateState({ state: 'error', error: String(err?.message ?? err).slice(0, 160) }); });
  let lastCheck = 0;
  const check = () => { if (['progress', 'ready'].includes(updateInfo.state)) return; lastCheck = Date.now(); updater.checkForUpdates().catch((err) => fatalLog(err)); };
  setTimeout(check, 10_000);
  setInterval(check, 30 * 60_000); // toutes les 30 min (avant : 3 h, une nouvelle version pouvait attendre longtemps)
  // Et dès qu'on revient sur le launcher, si la dernière recherche date de plus de 5 min
  app.on('browser-window-focus', () => { if (Date.now() - lastCheck > 5 * 60_000) check(); });
}
/** Cherche une mise à jour maintenant ; now = installer tout de suite si elle existe. */
async function checkUpdate(now = false) {
  if (!app.isPackaged) return { ok: false, dev: true, current: app.getVersion() };
  if (!updater) return { ok: false, current: app.getVersion(), error: 'module de mise à jour indisponible' };
  if (updateReady) { if (now) { quitting = true; updater.quitAndInstall(true, true); } return { ok: true, version: updateReady, ready: true, current: app.getVersion() }; }
  updateState({ state: 'checking', installNow: now || updateInfo.installNow });
  const r = await updater.checkForUpdates().catch((err) => ({ err }));
  if (r?.err) { updateState({ state: 'error', error: String(r.err.message ?? r.err).slice(0, 160) }); return { ok: false, current: app.getVersion(), error: updateInfo.error }; }
  const v = r?.updateInfo?.version;
  const newer = v && r?.isUpdateAvailable !== false && v !== app.getVersion();
  if (!newer) { updateState({ state: 'uptodate' }); return { ok: true, uptodate: true, current: app.getVersion() }; }
  if (now) await downloadUpdate(true);
  return { ok: true, version: v, current: app.getVersion() };
}
async function downloadUpdate(installNow) {
  if (!updater) return false;
  updateState({ installNow: Boolean(installNow) || updateInfo.installNow, state: 'progress', percent: 0 });
  updater.downloadUpdate().catch((err) => { fatalLog(err); updateState({ state: 'error', error: String(err?.message ?? err).slice(0, 160) }); });
  return true;
}
ipcMain.handle('update:get', () => ({ ...updateInfo, ready: updateReady, packaged: app.isPackaged, current: app.getVersion() }));
ipcMain.handle('update:check', (_e, now) => checkUpdate(Boolean(now)));
ipcMain.handle('update:download', (_e, now) => downloadUpdate(Boolean(now)));
ipcMain.handle('update:install', () => { if (updater && updateReady) { quitting = true; updater.quitAndInstall(true, true); return true; } return false; });
ipcMain.handle('win:fullscreen', (_e, on) => { if (!win) return false; win.setFullScreen(on === undefined ? !win.isFullScreen() : Boolean(on)); return win.isFullScreen(); });
ipcMain.on('win', (_e, what) => {
  if (what === 'min') win?.minimize();
  else if (what === 'max') win?.isMaximized() ? win.unmaximize() : win?.maximize();
  else if (what === 'close') win?.hide();
});


// =====================================================================================================
// 0.19 : profils de jeu, sauvegardes, saccades, déplacement, prix, FPS réels, goulot, historique des perfs,
// gain mesuré, réglages sauvegardés, batterie, widget
// =====================================================================================================
const profileOf = (id) => ({ enabled: false, close: [], power: 'high', quiet: true, dnd: false, saves: false, fps: true, ...(store.data.settings.profiles?.[id] ?? {}) });
const gameDnd = () => { const s = currentSession(); return Boolean(s && profileOf(s.id).enabled && profileOf(s.id).dnd); };
const savesRoot = () => path.join(app.getPath('documents'), 'History', 'Sauvegardes de jeux');
async function saveDirsOf(item) {
  const custom = store.data.saveDirs?.[item.id];
  return custom?.length ? custom : findSaveDirs(item, { steamRoot: await steamPath().catch(() => null) });
}
async function savesBackup(item) {
  const r = await backupSaves(item, await saveDirsOf(item), savesRoot(), 5);
  if (r.ok) { (store.data.savesLast ??= {})[item.id] = Date.now(); store.save(); }
  return r;
}
async function steamLibOf(item) {
  const root = await steamPath().catch(() => null);
  const libs = root ? await steamLibraries(root).catch(() => []) : [];
  const dir = String(item.installDir ?? '').toLowerCase();
  return { libs, lib: libs.find((l) => dir.startsWith(path.join(l, 'common').toLowerCase())) ?? null };
}
ipcMain.handle('tools:get', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  if (!item) return { error: 'Jeu introuvable.' };
  const { libs, lib } = item.source === 'steam' ? await steamLibOf(item) : { libs: [], lib: null };
  const caches = await Promise.all(shaderCaches(item, { library: lib }).map(async (c) => ({ id: c.id, label: c.label, own: Boolean(c.own), bytes: await dirSize(c.dir) })));
  const { statfs } = await import('node:fs/promises');
  const targets = await Promise.all(libs.filter((l) => l !== lib).map(async (l) => { const st = await statfs(l).catch(() => null); return { lib: l, free: st ? st.bavail * st.bsize : null }; }));
  return {
    profile: profileOf(item.id), apps: BOOST_APPS.map(({ id: a, label }) => ({ id: a, label })),
    saveDirs: await saveDirsOf(item), savesCustom: Boolean(store.data.saveDirs?.[item.id]?.length), backups: await listBackups(item, savesRoot()),
    caches, canMove: item.source === 'steam' && Boolean(lib) && Boolean(item.installDir), from: lib, targets, size: item.size ?? null,
    perf: process.env.LAUNCHER_DEMO ? demoPerf() : (store.data.perf?.[item.id] ?? []).slice(-30), fps: process.env.LAUNCHER_DEMO ? true : store.data.settings.fps === true,
    received: (store.data.sharesIn ?? []).filter((x) => Date.now() - x.at < 86_400_000 && norm(x.game) === norm(item.name)),
    graphics: await graphicsFor(item).catch(() => null),
    fortnite: /fortnite/i.test(item.name) ? { on: await fortniteState() } : null,
  };
});
ipcMain.handle('tools:profile', (_e, id, patch) => {
  if (!items.some((i) => i.id === String(id)) || !patch || typeof patch !== 'object') return null;
  const cur = profileOf(String(id));
  for (const k of ['enabled', 'quiet', 'dnd', 'saves', 'fps']) if (k in patch) cur[k] = Boolean(patch[k]);
  if (['high', 'none'].includes(patch.power)) cur.power = patch.power;
  if (Array.isArray(patch.close)) cur.close = patch.close.map(String).filter((a) => BOOST_APPS.some((b) => b.id === a));
  (store.data.settings.profiles ??= {})[String(id)] = cur;
  store.save();
  return cur;
});
ipcMain.handle('saves:backup', async (_e, id) => { const item = items.find((i) => i.id === String(id)); return item ? savesBackup(item) : { ok: false }; });
ipcMain.handle('saves:restore', async (_e, id, bid) => {
  const item = items.find((i) => i.id === String(id));
  if (!item) return { ok: false };
  if (activeItems([item], await runningPaths(0)).size) return { ok: false, error: 'Ferme le jeu avant de restaurer une sauvegarde.' };
  if (!(await confirm(`Restaurer la sauvegarde de ${item.name} ?`, 'Ta partie actuelle est d’abord mise de côté : tu pourras revenir dessus.'))) return { ok: false, cancelled: true };
  return restoreBackup(item, savesRoot(), String(bid));
});
ipcMain.handle('saves:pick', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  if (!item || !win) return null;
  const r = await dialog.showOpenDialog(win, { title: `Dossier des sauvegardes de ${item.name}`, properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  (store.data.saveDirs ??= {})[item.id] = [r.filePaths[0]];
  store.save();
  return store.data.saveDirs[item.id];
});
ipcMain.handle('saves:open', () => { shell.openPath(savesRoot()).catch(() => {}); return true; });
ipcMain.handle('shaders:clear', async (_e, id, which) => {
  const item = items.find((i) => i.id === String(id));
  if (!item) return { ok: false };
  if (activeItems([item], await runningPaths(0)).size) return { ok: false, error: 'Ferme le jeu d’abord.' };
  const { lib } = item.source === 'steam' ? await steamLibOf(item) : { lib: null };
  let freed = 0;
  for (const c of shaderCaches(item, { library: lib }).filter((x) => (Array.isArray(which) ? which : []).includes(x.id))) freed += await clearDir(c.dir);
  return { ok: true, freed };
});
ipcMain.handle('fortnite:perf', async (_e, id, on) => {
  const item = items.find((i) => i.id === String(id));
  if (!item || !/fortnite/i.test(item.name)) return { ok: false };
  if ((await runningPaths(0)).some((p) => /fortnite/i.test(p))) return { ok: false, error: 'Ferme Fortnite d’abord (il réécrit ses réglages en quittant).' };
  return fortnitePerf(Boolean(on));
});
ipcMain.handle('steam:move', async (_e, id, toLib) => {
  const item = items.find((i) => i.id === String(id));
  if (!item || item.source !== 'steam') return { ok: false, error: 'Seulement pour les jeux Steam.' };
  const { libs, lib } = await steamLibOf(item);
  if (!lib || !libs.includes(String(toLib))) return { ok: false, error: 'Bibliothèque Steam inconnue.' };
  if ((await runningPaths(0)).some((p) => /\\steam\.exe$/i.test(p))) return { ok: false, error: 'Ferme Steam complètement (clic droit sur l’icône › Quitter), puis relance le déplacement.' };
  if (!(await confirm(`Déplacer ${item.name} ?`, `Vers ${toLib}. Ne lance pas Steam pendant la copie ; l’ancien dossier n’est supprimé qu’une fois la copie vérifiée.`))) return { ok: false, cancelled: true };
  const r = await moveSteamGame({ appId: item.steamId, installDir: path.basename(item.installDir), fromLib: lib, toLib: String(toLib) }, (p) => send('move:progress', { id: item.id, ...p }));
  if (r.ok) setTimeout(() => scan().then((lib) => send('lib:update', lib)).catch(() => {}), 500);
  return r;
});

// ---------- Alertes de prix (Steam, meilleur prix ailleurs via CheapShark) ----------
ipcMain.handle('price:search', async (_e, q) => {
  const term = String(q ?? '').trim().slice(0, 80);
  const idFromUrl = term.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1];
  if (idFromUrl) return [{ id: idFromUrl, name: `Jeu Steam ${idFromUrl}` }];
  if (term.length < 2) return [];
  const j = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&cc=fr&l=french`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return (j?.items ?? []).slice(0, 6).map((x) => ({ id: String(x.id), name: x.name, price: x.price ? x.price.final / 100 : null, image: x.tiny_image ?? null }));
});
// Recherche dans les magasins : trouver un jeu même non installé (Fortnite, etc.)
ipcMain.handle('store:search', async (_e, q) => {
  const term = String(q ?? '').trim().slice(0, 80);
  if (term.length < 2) return [];
  const [st, ep] = await Promise.all([
    fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&cc=fr&l=french`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    epicStoreSearch(term).catch(() => []),
  ]);
  if (/^fortn?i/i.test(term) && !ep.some((x) => /^fortnite$/i.test(x.name))) ep.unshift({ name: 'Fortnite', src: 'epic', img: null, url: 'https://store.epicgames.com/fr/p/fortnite' });
  return [...ep.slice(0, 4), ...(st?.items ?? []).slice(0, 4).map((x) => ({ name: x.name, src: 'steam', img: `https://cdn.cloudflare.steamstatic.com/steam/apps/${x.id}/header.jpg`, url: `https://store.steampowered.com/app/${x.id}` }))];
});
ipcMain.handle('store:open', (_e, url) => openLink(String(url ?? '')).then(() => true, () => false));
ipcMain.handle('price:list', () => Object.values(store.data.priceAlerts ?? {}));
ipcMain.handle('price:set', async (_e, appId, name, target) => {
  if (!/^\d+$/.test(String(appId))) return null;
  const alerts = (store.data.priceAlerts ??= {});
  if (target == null) { delete alerts[appId]; store.save(); syncWatch().catch(() => {}); return Object.values(alerts); }
  const now = await steamPrice(appId).catch(() => null);
  alerts[appId] = { appId: String(appId), name: String(name ?? '').slice(0, 80), target: Math.max(0, Number(target) || 0), last: now, lastCheck: Date.now(), best: await bestDeal(name).catch(() => null) };
  store.save();
  syncWatch().catch(() => {});
  return Object.values(alerts);
});
async function checkPrices() {
  for (const a of Object.values(store.data.priceAlerts ?? {})) {
    const now = await steamPrice(a.appId).catch(() => null);
    if (!now) continue;
    a.last = now; a.lastCheck = Date.now(); a.best = await bestDeal(a.name).catch(() => a.best);
    if (priceAlert(a, now)) {
      a.lastNotified = now.price;
      const n = new Notif({ title: `💸 ${a.name} à ${now.price.toFixed(2).replace('.', ',')} €`, body: `Sous ton prix de ${a.target} €${now.discount ? ` (-${now.discount} %)` : ''}. Clique pour ouvrir la page Steam.`, icon: ICON });
      n.on('click', () => openLink(`https://store.steampowered.com/app/${a.appId}`).catch(() => {}));
      n.show();
    }
  }
  store.save();
}
setTimeout(() => checkPrices().catch(() => {}), 5 * 60_000);
setInterval(() => checkPrices().catch(() => {}), 6 * 3_600_000);

// ---------- Suivi d'une partie : vrais FPS (PresentMon), goulot processeur / carte graphique, historique ----------
let sess = null;
let coresPrev = os.cpus();
function coreLoad() {
  const now = os.cpus();
  const loads = now.map((c, i) => { const p = coresPrev[i]?.times; if (!p) return 0; const busy = (c.times.user - p.user) + (c.times.sys - p.sys) + (c.times.irq - p.irq); const idle = c.times.idle - p.idle; return busy + idle > 0 ? (100 * busy) / (busy + idle) : 0; });
  coresPrev = now;
  return { max: Math.round(Math.max(0, ...loads)), avg: Math.round(loads.reduce((a, b) => a + b, 0) / Math.max(1, loads.length)) };
}
async function sessionTick(s) {
  if (s && sess?.id !== s.id) { if (sess) await sessionEnd(); await sessionStart(s); }
  else if (!s && sess) await sessionEnd();
  if (!sess) return;
  const snap = await snapshot().catch(() => null);
  const c = coreLoad();
  sess.samples.push({ gpu: snap?.gpu?.usage ?? null, core: c.max, cpu: c.avg, ram: snap?.ram ? Math.round((100 * snap.ram.used) / snap.ram.total) : null });
  sess.cpuT = snap?.cpu?.temp ?? sess.cpuT ?? null;
  perfbarPush();
  heatCheck(sess, snap);
}
async function sessionStart(s) {
  if (/rocket league/i.test(s.name ?? '')) { toggleRlOverlay(true).catch(() => {}); rlEnableStats(false).catch(() => {}); } // dernière game en petit au lancement
  const item = items.find((i) => i.id === s.id);
  coreLoad();
  sess = { id: s.id, name: s.name, start: Date.now(), samples: [], cap: null, live: null, pings: [] };
  sessionPing(sess, item);
  setQuiet(true); // mesures plus légères pendant le jeu (pas de requête WMI de température, carte graphique lue moins souvent)
  if (store.data.settings.widgetGame && !(widget && !widget.isDestroyed())) { sess.autoWidget = true; setWidget(true); }
  if (store.data.settings.perfbar) setPerfbar(true);
  send('ui:gaming', true);
  if (!item || process.platform !== 'win32') return;
  if (store.data.settings.fps !== true || profileOf(item.id).fps === false) { sess.fpsState = 'off'; perfbarPush(); return; }
  // Tous les exe du jeu en cours (ex. Fortnite : FortniteClient-Win64-Shipping + sa version anti-triche)
  // Le jeu peut démarrer bien après (Epic, anti-triche) : on le cherche jusqu'à 2 min
  const me = sess;
  let exes = [];
  for (let n = 0; n < 24 && sess === me; n++) {
    exes = (await runningGameExes(item).catch(() => [])).filter((x) => !/(crash|report|launcher|helper|updater|redist|unins|webhelper|cefprocess)/i.test(x));
    if (exes.length) break;
    sess.fpsState = 'wait'; perfbarPush();
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (sess !== me) return;
  if (!exes.length) { sess.fpsState = 'nogame'; perfbarPush(); return; }
  const pm = await ensurePresentMon(path.join(app.getPath('userData'), 'outils')).catch(() => null);
  if (!pm || !sess) return;
  sess.fpsState = 'wait';
  sess.cap = captureFps(pm, exes, (live) => { if (sess) { sess.live = live; sess.fpsHist = [...(sess.fpsHist ?? []), live.avg].slice(-15); sess.fpsState = 'ok'; widgetPush(); perfbarPush(); } });
  // Refus de Windows (droits) : dit dans la mini-barre au lieu de n'afficher que le GPU
  sess.cap.done.then((r) => { if (sess && r?.error === 'droits') { sess.fpsState = 'droits'; perfbarPush(); } });
}
function verdict(stats, samples) {
  const g = samples.map((x) => x.gpu).filter((x) => x != null);
  const gpuAvg = g.length ? Math.round(g.reduce((a, b) => a + b, 0) / g.length) : null;
  const coreMax = samples.length ? Math.round(samples.reduce((a, b) => a + b.core, 0) / samples.length) : null;
  if (stats?.cpuBound != null) return { gpuAvg, coreMax, bound: stats.cpuBound >= 60 ? 'cpu' : stats.cpuBound <= 20 ? 'gpu' : 'mixte' };
  if (gpuAvg == null || coreMax == null) return { gpuAvg, coreMax, bound: null };
  return { gpuAvg, coreMax, bound: gpuAvg >= 90 ? 'gpu' : gpuAvg < 75 && coreMax >= 85 ? 'cpu' : 'mixte' };
}
async function sessionEnd() {
  const s = sess; sess = null;
  if (!s) return;
  setQuiet(false);
  setPerfbar(false);
  send('ui:gaming', false);
  setTimeout(flushHeld, 3000);
  if (s.autoWidget && !store.data.settings.widget) setWidget(false);
  const minutes = (Date.now() - s.start) / 60_000;
  let stats = null;
  if (s.cap) { stats = await Promise.race([s.cap.done, new Promise((r) => setTimeout(() => r(null), 6000))]); s.cap.stop(); }
  if (stats?.error === 'droits') notify('Mesure des FPS', 'Windows a refusé la mesure : reconnecte-toi à Windows (après l’activation dans Paramètres › Jeux) pour qu’elle marche.');
  clearInterval(s.pingTimer);
  setTimeout(() => crashCheck(s).catch(() => {}), 8000);
  if (minutes < 3) return;
  const played = items.find((i) => i.id === s.id);
  if (played && played.source !== 'steam' && minutes >= 5) setTimeout(() => cloudSaveUp(played).catch(() => {}), 20_000);
  const v = verdict(stats?.error ? null : stats, s.samples);
  const why = stutterCause(s.samples, stats?.stutters);
  const rec = { at: Date.now(), minutes: Math.round(minutes), boost: (store.data.boostedAt?.[s.id] ?? 0) >= s.start - 180_000, ...(stats && !stats.error ? { avg: stats.avg, low1: stats.low1, stutters: stats.stutters, cpuBound: stats.cpuBound } : {}), ...(why ? { stutterWhy: why } : {}), gpuAvg: v.gpuAvg, coreMax: v.coreMax, bound: v.bound };
  ((store.data.perf ??= {})[s.id] ??= []).push(rec);
  store.data.perf[s.id] = store.data.perf[s.id].slice(-60);
  store.save();
  // FPS partagés avec les joueurs History (/launcher fps sur Discord), si le partage d'activité est activé
  if (rec.avg && minutes >= 5 && store.data.settings.shareActivity !== false) social('/api/compte/fps', { jeu: s.name, avg: rec.avg, low1: rec.low1, minutes: Math.round(minutes) }).catch(() => {});
  // Preuve du boost : FPS moyens des parties avec boost comparés à celles sans
  const avgOf = (l) => (l.length ? l.reduce((a, r) => a + r.avg, 0) / l.length : null);
  const withAvg = store.data.perf[s.id].filter((r) => r.avg);
  const on = avgOf(withAvg.filter((r) => r.boost)), off = avgOf(withAvg.filter((r) => !r.boost));
  const gain = rec.boost && on && off ? Math.round(((on - off) / off) * 100) : null;
  const B = { cpu: 'le processeur limite tes FPS', gpu: 'la carte graphique travaille à fond (normal pour un jeu exigeant)', mixte: 'processeur et carte graphique sont équilibrés' };
  if (rec.avg || rec.bound) notify(`${s.name} : ${rec.avg ? `${rec.avg} FPS en moyenne, 1 % low ${rec.low1}` : 'partie terminée'}`, `${rec.bound ? `${B[rec.bound]}.` : ''}${rec.stutters ? ` ${rec.stutters} saccade(s)${why ? ` : ${why}` : ' repérée(s)'}.` : ''}${gain != null && Math.abs(gain) >= 2 ? ` Avec le boost : ${gain > 0 ? '+' : ''}${gain} % de FPS par rapport à sans.` : ''} Détails : clic droit sur le jeu › Outils du jeu.`);
}
ipcMain.handle('fps:enable', () => enableFps());
async function enableFps() {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows seulement.' };
  try { await ensurePresentMon(path.join(app.getPath('userData'), 'outils')); } catch (err) { return { ok: false, error: err.message }; }
  const encoded = Buffer.from(PERF_GROUP_SCRIPT, 'utf16le').toString('base64');
  const ok = await new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','${encoded}'`], { windowsHide: true, stdio: 'ignore' });
    p.on('error', () => resolve(false)); p.on('close', (code) => resolve(code === 0));
  });
  store.data.settings.fps = true; store.save();
  return { ok, relog: ok };
}
ipcMain.handle('fps:disable', () => { store.data.settings.fps = false; store.save(); return true; });

// ---------- 11. Gain mesuré : mini-benchmark avant / après une optimisation ----------
ipcMain.handle('bench:quick', async () => {
  if (benchRunning) return { error: 'Benchmark déjà en cours.' };
  benchRunning = true;
  try {
    const cpu = await cpuBench({ ms: 1200, sustainMs: 0 });
    const ram = ramBench(1000);
    const r = { v: BENCH_VERSION, cpu, ram };
    const sc = scores(r);
    return { at: Date.now(), cpu1: sc.cpu1, cpuN: sc.cpuN, ram: sc.ram, total: Math.round(Math.cbrt(sc.cpu1 * sc.cpuN * sc.ram)) };
  } finally { benchRunning = false; }
});

// ---------- 23. Réglages Windows sauvegardés avant chaque optimisation (retour arrière + rapport) ----------
async function snapshotSettings(label) {
  const snap = { at: Date.now(), label, sys: await systemTweakStates().catch(() => []), game: await tweakStates().catch(() => []), startup: (await startupApps().catch(() => [])).map((x) => ({ name: x.name, enabled: x.enabled })) };
  if (!store.data.settingsHistory?.length) store.data.settingsOriginal ??= snap; // l'état de Windows avant toute optimisation
  store.data.settingsHistory = [snap, ...(store.data.settingsHistory ?? [])].slice(0, 10);
  store.save();
  return snap;
}
ipcMain.handle('settingsHistory:get', async () => ({ list: store.data.settingsHistory ?? [], now: { sys: await systemTweakStates().catch(() => []), game: await tweakStates().catch(() => []), startup: (await startupApps().catch(() => [])).map((x) => ({ name: x.name, enabled: x.enabled })) } }));
ipcMain.handle('settingsHistory:restore', async (_e, at) => {
  const snap = (store.data.settingsHistory ?? []).find((x) => x.at === Number(at));
  if (!snap) return { ok: false };
  if (!(await confirm('Remettre ces réglages ?', `Les réglages de Windows reviennent à leur état du ${new Date(snap.at).toLocaleString('fr-FR')}. Les réglages système demandent l’autorisation administrateur.`))) return { ok: false, cancelled: true };
  await snapshotSettings('Avant un retour arrière');
  const nowSys = await systemTweakStates().catch(() => []);
  const sysChanges = snap.sys.filter((t) => nowSys.find((n) => n.id === t.id)?.on !== t.on).map((t) => ({ id: t.id, on: t.on }));
  if (sysChanges.length) await applySystemTweaks(sysChanges);
  for (const t of snap.game) await setTweak(t.id, t.on).catch(() => {});
  const cur = await startupApps().catch(() => []);
  for (const x of snap.startup) if (cur.some((c) => c.name === x.name && c.enabled !== x.enabled)) await setStartup(x.name, x.enabled).catch(() => {});
  return { ok: true, sys: sysChanges.length };
});

// ---------- 24. Économie sur batterie (portables) ----------
let onBattery = null;
async function batteryMode(bat) {
  if (store.data.settings.batterySaver !== true || process.platform !== 'win32') return;
  if (bat && !onBattery) {
    onBattery = { scheme: await activeScheme(), light: await brightness().catch(() => null) };
    await setScheme(POWER_SAVER).catch(() => {});
    if (onBattery.light && onBattery.light > 50) await brightness(50).catch(() => {});
    notify('Sur batterie', 'Mode économie : luminosité baissée et Windows en « Économie d’énergie ». Tout revient sur secteur.');
  } else if (!bat && onBattery) {
    const b = onBattery; onBattery = null;
    await setScheme(b.scheme ?? BALANCED).catch(() => {});
    if (b.light) await brightness(b.light).catch(() => {});
  }
}
app.whenReady().then(() => {
  powerMonitor.on('on-battery', () => batteryMode(true).catch(() => {}));
  powerMonitor.on('on-ac', () => batteryMode(false).catch(() => {}));
});

// ---------- 25. Widget sur le bureau : températures, FPS, amis ----------
let widget = null;
let widgetTimer = null;
async function widgetPush() {
  if (!widget || widget.isDestroyed()) return;
  const pc = await snapshot().catch(() => null);
  const friends = friendsCache.data?.friends ?? [];
  const hist = socialLive?.amis ?? [];
  widget.webContents.send('widget:data', {
    cpu: pc?.cpu?.usage ?? null, cpuT: pc?.cpu?.temp ?? null, gpuT: pc?.gpu?.temp ?? null, gpu: pc?.gpu?.usage ?? null, ram: pc?.ram ? Math.round((100 * pc.ram.used) / pc.ram.total) : null,
    game: sess?.name ?? null, fps: sess?.live?.avg ?? null, ping: sess ? pingSummary(sess.pings) : null, hot: Boolean(sess?.hot >= 2), streamer: streaming(),
    online: hist.filter((a) => a.online).length + friends.filter((f) => f.online).length,
    playing: [...hist.filter((a) => a.playing).map((a) => ({ name: a.pseudo, game: a.playing })), ...friends.filter((f) => f.game).map((f) => ({ name: f.name, game: f.game }))].slice(0, 2),
  });
}
function setWidget(on) {
  if (!on) { clearInterval(widgetTimer); if (widget && !widget.isDestroyed()) widget.close(); widget = null; return; }
  if (widget && !widget.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  const pos = store.data.settings.widgetPos ?? { x: area.x + area.width - 360, y: area.y + 80 };
  widget = new BrowserWindow({ width: 340, height: 168, x: pos.x, y: pos.y, frame: false, transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: store.data.settings.widgetTop !== false, hasShadow: false, show: false,
    webPreferences: { preload: path.join(here, 'widget.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: true } });
  widget.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  widget.webContents.on('will-navigate', (e) => e.preventDefault());
  widget.loadFile(path.join(here, 'ui', 'widget.html'));
  widget.once('ready-to-show', () => { widget?.showInactive(); widgetPush(); });
  widget.on('moved', () => { if (!widget) return; const [x, y] = widget.getPosition(); store.data.settings.widgetPos = { x, y }; store.save(); });
  widget.on('closed', () => { widget = null; clearInterval(widgetTimer); });
  widgetTimer = setInterval(widgetPush, 5000);
}
ipcMain.on('widget:open', () => showWindow());
ipcMain.on('widget:close', () => { store.data.settings.widget = false; store.save(); setWidget(false); send('settings:changed', { widget: false }); });
app.whenReady().then(() => setTimeout(() => { if (store.data.settings.widget) setWidget(true); }, 3000));
// Mises à jour des jeux la nuit (option) : entre 3 h et 6 h, PC inutilisé depuis 15 min et jeux Steam à mettre à jour :
// Steam est ouvert en fond et télécharge tout seul les mises à jour en attente.
setInterval(async () => {
  const h = new Date().getHours();
  if (!store.data.settings.nightUpdates || process.platform !== 'win32' || h < 3 || h >= 6 || powerMonitor.getSystemIdleTime() < 900) return;
  if (!items.some((i) => i.source === 'steam' && i.installed && i.updatePending)) return;
  if (!(await runningPaths()).some((p) => /\\steam\.exe$/.test(p))) runSilentSteam([]).catch(() => {});
}, 10 * 60_000).unref?.();
// Contrôle depuis le téléphone (option) : voir le PC et lancer un jeu depuis le même Wi-Fi
let remoteSrv = null;
function setRemote() {
  remoteSrv?.close(); remoteSrv = null;
  if (!store.data.settings.remote) return;
  store.data.settings.remotePin ??= newPin(); store.save();
  const recent = () => { const ids = [...new Set((store.data.sessions ?? []).slice().reverse().map((x) => x.id))]; const games = items.filter((i) => i.kind === 'game' && i.installed); return [...ids.map((id) => games.find((g) => g.id === id)).filter(Boolean), ...games].filter((g, k, a) => a.indexOf(g) === k).slice(0, 12); };
  remoteSrv = startRemote({
    pin: store.data.settings.remotePin,
    state: async () => { const s = await snapshot().catch(() => null); const deg = (t) => (t == null ? null : `${Math.round(t)} °C`); return { cpu: deg(s?.cpu?.temp) ?? (s ? `${Math.round(s.cpu.usage)} %` : null), gpu: deg(s?.gpu?.temp), ram: s ? `${Math.round((s.ram.used / s.ram.total) * 100)} %` : null, jeu: playSession?.name ?? null, jeux: recent().map((g) => ({ id: g.id, name: g.name })) }; },
    launch: async (id) => (items.some((i) => i.id === id && i.installed) ? doAction(id, 'launch') : { ok: false }),
  });
}
app.whenReady().then(setRemote);
ipcMain.handle('remote:get', () => ({ on: Boolean(store.data.settings.remote), url: lanAddress() ? `http://${lanAddress()}:${REMOTE_PORT}` : null, pin: store.data.settings.remotePin ?? null }));
// Steam préchargé en fond (option) : « Jouer » démarre tout de suite au lieu d'attendre que Steam s'ouvre
app.whenReady().then(() => setTimeout(async () => { if (store.data.settings.preloadSteam && !(await runningPaths()).some((p) => /\\steam\.exe$/.test(p))) runSilentSteam([]).catch(() => {}); }, 15_000));


async function start() {
  protocol.handle('libimg', (req) => {
    const token = new URL(req.url).pathname.replace(/^\//, '').replace(/\.(png|jpg)$/, '');
    const file = localFiles.get(token);
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response('introuvable', { status: 404 });
  });
  // Micro : autorisé seulement pour la fenêtre du launcher (bouton micro de l'assistant)
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'fullscreen'].includes(permission) && wc === win?.webContents));
  await store.load();
  applyAutostart();
  // Lancé avec Windows : directement dans la barre des tâches, sans fenêtre (rien en mémoire tant qu'on ne l'ouvre pas)
  if (!process.argv.includes('--au-demarrage')) createWindow();
  createTray();
  startUpdater().catch((err) => fatalLog(err));
  // Temps de jeu réel : rien n'est compté quand le PC est verrouillé ou en veille
  powerMonitor.on('lock-screen', () => { pcAway = true; });
  powerMonitor.on('unlock-screen', () => { pcAway = false; });
  powerMonitor.on('suspend', () => { pcAway = true; });
  powerMonitor.on('resume', () => { pcAway = false; });
  registerHotkeys();
  if (app.isPackaged) app.setAsDefaultProtocolClient('history');
  setTimeout(() => handleInvite(process.argv), 3000);
  setTimeout(() => checkDeals().catch(() => {}), 60_000);
  setInterval(() => checkDeals().catch(() => {}), 6 * 3_600_000);
  let liveIds = [];
  startTracker(() => items, store, async (ids) => {
    lastActive = { ids, at: Date.now() };
    // Temps de jeu en direct : Steam et FiveM n'écrivent leur temps qu'à la fermeture du jeu, on compte la partie à côté
    const steamOn = (await runningPaths().catch(() => [])).some((p) => /[\\/]steam\.exe$/i.test(p));
    const times = {};
    for (const id of ids) {
      const r = raw.find((x) => x.id === id);
      const it = items.find((x) => x.id === id);
      if (!r || !it) continue;
      if (r.timeFromLogs || (r.steamTimes && Object.keys(r.steamTimes).length && steamOn)) creditLive(store.data, id, playtimeOf(r, { ...store.data, live: {} }, timeOptions()).base ?? 0);
      const t = playtimeOf(r, store.data, timeOptions());
      it.minutes = t.minutes; it.lastPlayed = t.lastPlayed;
      times[id] = { minutes: t.minutes, lastPlayed: t.lastPlayed };
    }
    store.save();
    // Journal : les amis History qui jouent au même jeu pendant la partie
    for (const id of ids) {
      const it = items.find((x) => x.id === id);
      if (it?.kind !== 'game') continue;
      const with_ = (socialLive?.amis ?? []).filter((a) => a.playing && norm(a.playing).includes(norm(it.name).slice(0, 12))).map((a) => a.pseudo);
      const last = [...(store.data.sessions ?? [])].reverse().find((x) => x.id === id);
      if (last && with_.length) last.with = [...new Set([...(last.with ?? []), ...with_])].slice(0, 6);
    }
    // Un jeu Steam / FiveM vient de se fermer : on relit son vrai temps un peu plus tard (écrit à la fermeture)
    const closed = liveIds.filter((id) => !ids.includes(id));
    liveIds = ids.filter((id) => store.data.live?.[id]);
    if (closed.length) setTimeout(() => scan().then((lib) => send('lib:update', lib)).catch(() => {}), 45_000);
    const g = items.find((i) => ids.includes(i.id) && i.kind === 'game' && !NOT_GAME.test(i.name));
    if (g && detected?.id !== g.id) { detected = { id: g.id, name: g.name, start: Date.now() - 60_000 }; if (!playSession) startBoost(g).catch(() => {}); } // lancé hors du launcher : opti quand même
    win?.webContents.send('lib:active', ids, times);
  }, 60_000, accountFor, () => pcAway);
  if (store.data.settings.voice) setTimeout(() => setVoice(true), 3000);
}
app.on('before-quit', () => { quitting = true; backupNow().catch(() => {}); endBoost({ silent: true }).catch(() => {}); rpc.reset(); });
app.on('window-all-closed', (e) => e.preventDefault());

// =====================================================================================================
// 0.20 : clips vers Discord, parties de groupe, promos en message privé, FPS partagés, réglages conseillés,
// mode streamer, partage de sauvegardes entre amis, alerte de surchauffe
// =====================================================================================================
/** Envoi d'un fichier brut au serveur (clip, sauvegarde partagée). */
async function apiRaw(pathname, buf, { timeout = 180_000 } = {}) {
  const token = secret('account');
  if (!token) return { status: 401, error: 'Connecte-toi à ton compte History pour ça.' };
  try {
    const res = await fetch(`${API}${pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${token}` }, body: buf, signal: AbortSignal.timeout(timeout) });
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  } catch { return { status: 0, error: 'Serveur injoignable, vérifie ta connexion internet.' }; }
}

// ---------- Clips et captures vers le salon Discord (compte Discord lié) ----------
async function clipToDiscord(file, note = '', to = '') {
  const { readFile, stat } = await import('node:fs/promises');
  const ext = path.extname(file).slice(1).toLowerCase().replace('jpeg', 'jpg');
  if (!['png', 'jpg', 'webm', 'mp4'].includes(ext)) return { ok: false, error: 'Format non pris en charge (images PNG/JPG, vidéos WEBM/MP4).' };
  if (((await stat(file).catch(() => null))?.size ?? 0) > 60 * 1024 * 1024) return { ok: false, error: 'Fichier trop gros (60 Mo maximum).' };
  pushCard({ id: `disc-${Date.now()}`, icon: '📤', title: 'Envoi sur Discord…', body: path.basename(file), actions: [], ttl: 5000, nolog: true }, true);
  const game = currentSession()?.name ?? path.basename(path.dirname(file));
  const q = new URLSearchParams({ type: ext, jeu: String(game ?? '').slice(0, 80), ...(note ? { texte: String(note).slice(0, 200) } : {}), ...(/^[\w-]{3,64}$/.test(String(to)) ? { a: String(to) } : {}) });
  const r = await apiRaw(`/api/compte/discord/clip?${q}`, await readFile(file));
  pushCard(r.ok ? { id: `disc-ok-${Date.now()}`, icon: '✅', title: 'Envoyé sur Discord', body: to ? 'En message privé à ton ami.' : 'Dans le salon des clips du serveur History.', actions: [], ttl: 6000 } : { id: `disc-ko-${Date.now()}`, icon: '⚠️', title: 'Envoi impossible', body: r.error ?? 'Réessaie plus tard.', actions: [], ttl: 9000 }, true);
  return r.ok ? { ok: true, url: r.url } : { ok: false, error: r.error ?? 'Envoi impossible.' };
}
ipcMain.handle('capture:discord', (_e, token, note, to) => { const f = captureFiles.get(String(token)); return f ? clipToDiscord(f, note, to) : { ok: false, error: 'Capture introuvable.' }; });

// ---------- Groupe : lancer une partie annoncée sur Discord ----------
ipcMain.handle('groups:party', (_e, id, text) => social('/api/compte/groupes/partie', { id: String(id ?? ''), jeu: currentSession()?.name ?? undefined, texte: String(text ?? '').slice(0, 200) }));

// ---------- Promos en message privé Discord : le serveur connaît les prix suivis et la liste de souhaits ----------
async function syncWatch() {
  if (!secret('account')) return;
  const prix = Object.values(store.data.priceAlerts ?? {}).map((a) => ({ appId: a.appId, name: a.name, target: a.target }));
  await social('/api/compte/alertes', { steam: store.data.settings.dealAlerts !== false ? myId64() : null, prix, mp: store.data.settings.promoDm !== false });
}
setTimeout(() => syncWatch().catch(() => {}), 90_000);
setInterval(() => syncWatch().catch(() => {}), 12 * 3_600_000);

// ---------- Réglages graphiques conseillés (benchmark + FPS mesurés + écran) ----------
async function graphicsFor(item) {
  if (item.kind && item.kind !== 'game') return null;
  if (process.env.LAUNCHER_DEMO) return graphicsAdvice({ name: item.name, gpuScore: 1420, cpu1: 1350, gpuName: 'NVIDIA GeForce RTX 4070', vramGb: 12, hz: 165, width: 2560, perf: demoPerf() });
  const b = (store.data.bench ?? []).find((x) => x.v === 2 && x.scores?.gpu) ?? null;
  const diag = diagCache?.data ?? await Promise.race([runDiag().catch(() => null), new Promise((r) => setTimeout(() => r(null), 6000))]);
  const gpu = diag?.gpus?.find((g) => !/intel|uhd|iris/i.test(g.name)) ?? diag?.gpus?.[0] ?? null;
  return graphicsAdvice({
    name: item.name, gpuScore: b?.scores?.gpu ?? null, cpu1: b?.scores?.cpu1 ?? null, gpuName: gpu?.name ?? '',
    vramGb: gpu?.vram ? Math.round(gpu.vram / 1024 ** 3) : null, hz: gpu?.hz ?? null, width: gpu?.width ?? null, perf: store.data.perf?.[item.id] ?? [],
  });
}

// ---------- Mode streamer : automatique quand OBS, Streamlabs, Twitch Studio ou XSplit tourne ----------
const STREAM_APPS = /\\(obs64|obs32|obs|streamlabs obs|streamlabs desktop|twitch studio|xsplit\.core|xsplitbroadcaster)\.exe$/i;
setInterval(async () => {
  if (store.data.settings.streamerAuto === false) { if (obsRunning) { obsRunning = false; send('streamer:state', streaming()); } return; }
  const on = (await runningPaths().catch(() => [])).some((p) => STREAM_APPS.test(p));
  if (on !== obsRunning) {
    obsRunning = on;
    send('streamer:state', streaming());
    widgetPush();
    if (on) { notifCards = notifCards.filter((c) => c.force); notifSync(); }
  }
}, 60_000);
ipcMain.handle('streamer:get', () => streaming());

// ---------- Sauvegardes partagées entre amis ----------
ipcMain.handle('saves:share', async (_e, id, friendId) => {
  const item = items.find((i) => i.id === String(id));
  if (!item) return { ok: false, error: 'Jeu introuvable.' };
  const dirs = await saveDirsOf(item);
  if (!dirs.length) return { ok: false, error: 'Dossier de sauvegarde inconnu : choisis-le d’abord.' };
  let buf;
  try { buf = await packSaves(item.name, dirs); } catch (err) { return { ok: false, error: err.message }; }
  const q = new URLSearchParams({ a: FID(friendId), jeu: item.name.slice(0, 80), nom: `Sauvegarde du ${new Date().toLocaleDateString('fr-FR')}` });
  const r = await apiRaw(`/api/compte/partage?${q}`, buf, { timeout: 120_000 });
  return r.ok ? { ok: true, bytes: buf.length } : { ok: false, error: r.error ?? 'Envoi impossible.' };
});
async function receiveShare(shareId) {
  const info = (store.data.sharesIn ?? []).find((x) => x.id === String(shareId));
  const token = secret('account');
  if (!info || !token) return { ok: false, error: 'Partage introuvable.' };
  let pack;
  try {
    const res = await fetch(`${API}/api/compte/partage?id=${encodeURIComponent(info.id)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return { ok: false, error: (await res.json().catch(() => ({}))).error ?? 'Partage expiré (24 h).' };
    pack = await readPack(Buffer.from(await res.arrayBuffer()));
  } catch (err) { return { ok: false, error: err.message }; }
  const item = items.find((i) => i.installed && norm(i.name) === norm(info.game));
  const dirs = item ? await saveDirsOf(item) : [];
  if (item && dirs.length) {
    if (activeItems([item], await runningPaths(0)).size) return { ok: false, error: 'Ferme le jeu avant de recevoir la sauvegarde.' };
    if (!(await confirm(`Utiliser la sauvegarde de ${info.from} pour ${item.name} ?`, 'Ta partie actuelle est d’abord copiée (Outils du jeu › Sauvegardes) : tu pourras revenir dessus. Si le jeu utilise Steam Cloud, choisis « garder les fichiers locaux » au prochain lancement.'))) return { ok: false, cancelled: true };
    await savesBackup(item);
    const n = await unpackSaves(pack, dirs);
    store.data.sharesIn = store.data.sharesIn.filter((x) => x.id !== info.id); store.save();
    notify('💾 Sauvegarde reçue', `${n} fichier(s) de ${info.from} installés pour ${item.name}.`);
    return { ok: true, files: n };
  }
  // Jeu pas installé ou dossier inconnu : rangée dans Documents › History › Sauvegardes reçues
  const dest = path.join(app.getPath('documents'), 'History', 'Sauvegardes reçues', String(info.game).replace(/[<>:"/\\|?*]/g, '').slice(0, 60), `${String(info.from).replace(/[^\w-]/g, '')}-${Date.now()}`);
  const n = await unpackSaves(pack, pack.dirs.map((d) => path.join(dest, d.name.replace(/[<>:"/\\|?*]/g, '_'))));
  store.data.sharesIn = store.data.sharesIn.filter((x) => x.id !== info.id); store.save();
  shell.openPath(dest).catch(() => {});
  return { ok: true, files: n, folder: dest };
}
ipcMain.handle('saves:receive', (_e, id) => receiveShare(id));

// ---------- Sauvegardes dans le cloud (jeux sans cloud : hors Steam) : envoyées après chaque partie, récupérables partout ----------
async function cloudSaveUp(item) {
  if (!secret('account') || item.source === 'steam') return { ok: false };
  const dirs = await saveDirsOf(item);
  if (!dirs.length) return { ok: false, error: 'Dossier de sauvegarde inconnu.' };
  const buf = await packSaves(item.name, dirs).catch(() => null);
  if (!buf || buf.length > 50 * 1024 * 1024) return { ok: false, error: 'Sauvegarde trop grosse pour le cloud (50 Mo).' };
  const r = await apiRaw(`/api/compte/saves?jeu=${encodeURIComponent(item.name.slice(0, 80))}`, buf, { timeout: 120_000 });
  if (r.ok) { (store.data.cloudSavesAt ??= {})[item.id] = r.at; store.save(); }
  return r.ok ? { ok: true, at: r.at, bytes: buf.length } : { ok: false, error: r.error ?? 'Envoi impossible.' };
}
ipcMain.handle('saves:cloudUp', async (_e, id) => { const item = items.find((i) => i.id === String(id)); return item ? cloudSaveUp(item) : { ok: false }; });
ipcMain.handle('saves:cloudDown', async (_e, id) => {
  const item = items.find((i) => i.id === String(id)); const token = secret('account');
  if (!item || !token) return { ok: false, error: 'Connecte-toi à ton compte History.' };
  const dirs = await saveDirsOf(item);
  if (!dirs.length) return { ok: false, error: 'Dossier de sauvegarde inconnu : choisis-le d’abord (Outils du jeu › Sauvegardes).' };
  if (activeItems([item], await runningPaths(0)).size) return { ok: false, error: 'Ferme le jeu avant de récupérer la sauvegarde.' };
  let pack;
  try {
    const res = await fetch(`${API}/api/compte/saves?jeu=${encodeURIComponent(item.name.slice(0, 80))}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return { ok: false, error: (await res.json().catch(() => ({}))).error ?? 'Aucune sauvegarde en ligne.' };
    pack = await readPack(Buffer.from(await res.arrayBuffer()));
  } catch (err) { return { ok: false, error: err.message }; }
  if (!(await confirm(`Remettre la sauvegarde en ligne de ${item.name} ?`, 'Ta partie actuelle est d’abord copiée à côté (Outils du jeu › Sauvegardes) : tu pourras revenir dessus.'))) return { ok: false, cancelled: true };
  await savesBackup(item);
  return { ok: true, files: await unpackSaves(pack, dirs) };
});

// ---------- Disque presque plein : prévenu avant qu'une mise à jour de jeu échoue (une fois par jour et par disque) ----------
async function diskWatch() {
  if (process.platform !== 'win32') return;
  const { statfs } = await import('node:fs/promises');
  const roots = [...new Set(items.filter((i) => i.installed && i.installDir).map((i) => path.win32.parse(String(i.installDir)).root.toUpperCase()).filter(Boolean))];
  const today = new Date().toDateString();
  for (const root of roots) {
    const fs1 = await statfs(root).catch(() => null);
    if (!fs1) continue;
    const free = (fs1.bavail * fs1.bsize) / 1e9; const pct = (100 * fs1.bavail) / Math.max(1, fs1.blocks);
    if (free >= 15 && pct >= 5) continue;
    if ((store.data.diskWarned ??= {})[root] === today) continue;
    store.data.diskWarned[root] = today; store.save();
    const n = new Notif({ title: `Disque ${root.replace('\\', '')} presque plein`, body: `Plus que ${Math.round(free)} Go libres : les mises à jour de jeux risquent d’échouer. Clique pour voir quoi nettoyer ou déplacer.`, icon: ICON });
    n.on('click', () => showWindow()); n.show();
  }
}
setTimeout(() => diskWatch().catch(() => {}), 5 * 60_000);
setInterval(() => diskWatch().catch(() => {}), 3 * 3_600_000);

// ---------- Surchauffe pendant une partie : indicateur du widget (l'alerte « Ton PC chauffe » prévient déjà) ----------
function heatCheck(s, snap) {
  const hot = (snap?.cpu?.temp ?? 0) >= 90 || (snap?.gpu?.temp ?? 0) >= 87;
  s.hot = hot ? (s.hot ?? 0) + 1 : 0;
}

// =====================================================================================================
// 0.20.1 : correctif « ça bug en jeu (FiveM…) après l'optimisation »
// =====================================================================================================
// Remettre Windows comme avant : chaque réglage revient à son état d'avant la première optimisation
store.data.settingsOriginal ??= (store.data.settingsHistory ?? []).at(-1) ?? null;
async function resetWindows({ ask = true } = {}) {
  if (process.platform !== 'win32') return { ok: false, error: 'Windows seulement.' };
  const [sys, game] = await Promise.all([systemTweakStates().catch(() => []), tweakStates().catch(() => [])]);
  const plan = resetPlan(sys, game, store.data.settingsOriginal);
  const labels = [...plan.sys, ...plan.game].map((c) => `${c.on ? '✓' : '↩'} ${[...sys, ...game].find((t) => t.id === c.id)?.label ?? c.id}`);
  if (!labels.length) { await windowsToasts(true).catch(() => {}); return { ok: true, changed: 0 }; }
  if (ask && !(await confirm('Remettre Windows comme avant ?', `Ces réglages reviennent à leur état d'origine :\n${labels.join('\n')}\n\nUn point de restauration est créé avant. Windows va demander l'autorisation administrateur.`))) return { ok: false, cancelled: true };
  await snapshotSettings('Avant la remise comme avant').catch(() => {});
  for (const c of plan.game) await setTweak(c.id, c.on).catch(() => {});
  const sysOk = plan.sys.length ? await applySystemTweaks(plan.sys) : true;
  await windowsToasts(true).catch(() => {});
  return { ok: sysOk, changed: labels.length, reboot: plan.sys.some((c) => c.id === 'hags'), refused: !sysOk };
}
/** Retire les réglages qui peuvent faire bugger les jeux (remis comme Windows). Sans administrateur si possible. */
async function fixRisky({ ask = true, reason = '' } = {}) {
  if (process.platform !== 'win32') return null;
  const [sys, game] = await Promise.all([systemTweakStates().catch(() => []), tweakStates().catch(() => [])]);
  const risky = riskyLeft(sys, game);
  if (!risky.length) return { fixed: 0 };
  await snapshotSettings('Avant la correction des réglages risqués').catch(() => {});
  // Réglages de l'utilisateur (sans administrateur) : corrigés tout de suite
  const g = risky.filter((t) => game.some((x) => x.id === t.id));
  for (const t of g) await setTweak(t.id, false).catch(() => {});
  const sy = risky.filter((t) => sys.some((x) => x.id === t.id));
  if (!sy.length) return { fixed: g.length };
  if (ask && !(await confirm('Corriger les réglages qui font bugger les jeux ?', `${reason === 'optimisation' ? 'Pendant l’optimisation, on a trouvé' : 'Il reste'} des réglages d’une ancienne version qui peuvent faire saccader ou planter FiveM, GTA V et d’autres jeux :\n${sy.map((t) => `• ${t.label}`).join('\n')}\n\nOn les remet comme Windows ? (autorisation administrateur, point de restauration avant, puis redémarre le PC)`))) return { fixed: g.length, pending: sy.length };
  const ok = await applySystemTweaks(sy.map((t) => ({ id: t.id, on: false })));
  return { fixed: g.length + (ok ? sy.length : 0), pending: ok ? 0 : sy.length, reboot: ok && sy.some((t) => t.reboot) };
}
ipcMain.handle('opti:fixRisky', () => fixRisky({ ask: true }));
// Au démarrage (si l'optimisation a déjà servi sur ce PC) : correction automatique, redemandée tous les 3 jours tant qu'il en reste
setTimeout(async () => {
  if (process.platform !== 'win32' || !(store.data.settingsHistory?.length || store.data.settingsOriginal)) return;
  const askAgain = Date.now() - (store.data.fixAskedAt ?? 0) > 3 * 86_400_000;
  const r = await fixRisky({ ask: askAgain }).catch(() => null);
  if (askAgain && r?.pending !== undefined) { store.data.fixAskedAt = Date.now(); store.save(); }
  if (r?.fixed && !r.pending) notify('✅ Réglages corrigés', r.reboot ? 'Redémarre le PC pour finir : tes jeux retrouvent leur comportement normal.' : 'Les réglages qui pouvaient faire bugger tes jeux ont été remis comme Windows.');
}, 40_000);

app.whenReady().then(start).catch(async (err) => { await fatal(err); app.exit(1); });

// =====================================================================================================
// Centre de notifications : les 150 dernières notifications de l'appli et des amis, lues ou non
// =====================================================================================================
const NOTIF_KINDS_FRIENDS = ['msg', 'gmsg', 'ask', 'invite', 'group', 'call', 'missed', 'reply', 'playing', 'share'];
function logNotif(c) {
  if (!c?.title) return;
  const list = (store.data.notifLog ??= []);
  const id = String(c.id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  if (list.some((x) => x.id === id)) return;
  const kind = c.kind ?? 'app';
  const e = {
    id, at: c.at ?? Date.now(), kind, cat: NOTIF_KINDS_FRIENDS.includes(kind) ? 'amis' : 'appli', icon: c.icon ?? '🔔', title: String(c.title).slice(0, 120), body: String(c.body ?? '').slice(0, 300),
    from: c.from ?? null, gid: c.gid ?? null, game: c.game ?? null, join: c.join ?? null, callId: c.callId ?? null, share: c.share ?? null, file: c.file ?? null, read: false, done: null,
  };
  store.data.notifLog = [e, ...list].slice(0, 150);
  store.save();
  send('notifs:new', { entry: e, unread: store.data.notifLog.filter((x) => !x.read).length });
}
function markNotif(id, action) {
  const e = (store.data.notifLog ?? []).find((x) => x.id === id);
  if (!e) return;
  e.read = true; e.done = action ?? e.done;
  store.save();
  send('notifs:changed', { unread: store.data.notifLog.filter((x) => !x.read).length });
}
ipcMain.handle('notifs:get', () => ({ list: store.data.notifLog ?? [], unread: (store.data.notifLog ?? []).filter((x) => !x.read).length }));
ipcMain.handle('notifs:read', (_e, id) => {
  for (const x of store.data.notifLog ?? []) if (!id || x.id === id) x.read = true;
  store.save();
  return { unread: (store.data.notifLog ?? []).filter((x) => !x.read).length };
});
ipcMain.handle('notifs:clear', (_e, cat) => {
  store.data.notifLog = cat ? (store.data.notifLog ?? []).filter((x) => x.cat !== cat) : [];
  store.save();
  return { list: store.data.notifLog, unread: store.data.notifLog.filter((x) => !x.read).length };
});
// Action depuis le centre (mêmes actions que les cartes en bas à gauche)
ipcMain.handle('notifs:act', async (_e, id, action) => {
  const e = (store.data.notifLog ?? []).find((x) => x.id === String(id));
  if (!e) return { ok: false };
  if (e.kind === 'missed' && action === 'callback') { markNotif(e.id, action); return { ok: true, call: e.from }; }
  await cardAction({ ...e, kind: e.kind === 'missed' ? 'msg' : e.kind }, String(action));
  return { ok: true };
});

// Copier du texte (code ami, lien d'invitation, rapport…) : par l'appli, le presse-papiers du navigateur étant bloqué
ipcMain.handle('clip:write', (_e, text) => { clipboard.writeText(String(text ?? '').slice(0, 20_000)); return true; });


// =====================================================================================================
// 0.25 : temps de démarrage, plantages expliqués, disques pleins, santé des disques, connexion, « lancer avec »
// =====================================================================================================
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** « Dispo vers 22 h » : fin probable de la partie, d'après la durée habituelle de tes parties sur ce jeu. */
function dispoAt(s) {
  const lens = (store.data.sessions ?? []).filter((x) => x.id === s.id && x.end - x.start >= 10 * 60_000).slice(-10).map((x) => x.end - x.start).sort((a, b) => a - b);
  if (lens.length < 3) return null;
  const eta = s.start + lens[Math.floor(lens.length / 2)];
  return eta > Date.now() + 5 * 60_000 ? Math.round(eta / 300_000) * 300_000 : null;
}
// Temps de démarrage : du clic sur « Jouer » à l'apparition de la fenêtre du jeu (lecture seule, toutes les 2 s)
async function measureLoad(item) {
  if (process.platform !== 'win32' || !item.installDir || String(item.installDir).split('\\').filter(Boolean).length < 2) return;
  const t0 = Date.now();
  while (Date.now() - t0 < 180_000) {
    await wait(2000);
    const n = Number(String(await ps(windowScript(item.installDir), 8000).catch(() => '0')).trim()) || 0;
    if (!n) continue;
    const ms = Date.now() - t0;
    const hist = ((store.data.loadTimes ??= {})[item.id] ??= []);
    const v = loadVerdict(hist, ms);
    store.data.loadTimes[item.id] = [...hist, { at: Date.now(), ms }].slice(-20);
    store.save();
    if (v.slow) notify(`${item.name} a mis ${Math.round(ms / 1000)} s à démarrer`, `D’habitude ${Math.round(v.median / 1000)} s. Disque presque plein, mise à jour en cours ou trop d’applis ouvertes ?`);
    return;
  }
}
// Plantage : le journal de Windows dit quel module a lâché, on traduit en cause + solution
async function crashCheck(s) {
  const item = items.find((i) => i.id === s.id);
  if (!item || process.platform !== 'win32') return;
  const found = crashesFor(await readCrashes(s.start), { dir: item.installDir, exe: item.exe }).filter((c) => c.at >= s.start - 5000);
  if (!found.length) return;
  const c = found.at(-1);
  const list = ((store.data.crashes ??= {})[item.id] ??= []);
  if (list.some((x) => x.at === c.at)) return;
  store.data.crashes[item.id] = [...list, c].slice(-20);
  store.save();
  const same = store.data.crashes[item.id].filter((x) => x.cause === c.cause && Date.now() - x.at < 7 * 86_400_000).length;
  pushCard({ id: `crash-${item.id}-${c.at}`, kind: 'app', icon: '💥', title: `${item.name} a planté`, body: `${c.cause}${same > 1 ? ` (${same}× cette semaine)` : ''}. ${c.fix}`, actions: [['close', 'OK']], ttl: 20_000 }, true);
}
ipcMain.handle('game:care', (_e, id) => {
  const i = String(id);
  return { crashes: (store.data.crashes?.[i] ?? []).slice().reverse(), loads: (store.data.loadTimes?.[i] ?? []).slice(-10), with: store.data.items?.[i]?.with ?? [] };
});

// Ping en direct pendant une partie (serveur FiveM si connu, sinon ta connexion), affiché dans le widget
function tcpPing(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const sock = nodeNet.connect({ host, port, timeout });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.once('connect', () => done(Math.round(performance.now() - t0)));
    sock.once('timeout', () => done(null));
    sock.once('error', () => done(null));
  });
}
function pingTarget(item) {
  const last = item?.source === 'fivem' ? String(store.data.fivemLast ?? '') : '';
  const m = last.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})$/);
  return m ? { host: m[1], port: Number(m[2]), label: 'serveur' } : { host: '1.1.1.1', port: 443, label: 'internet' };
}
function sessionPing(s, item) {
  const t = pingTarget(item);
  s.pingLabel = t.label;
  s.pingTimer = setInterval(async () => { if (sess !== s) return clearInterval(s.pingTimer); s.pings = [...s.pings, await tcpPing(t.host, t.port)].slice(-30); }, 10_000);
}
function pingSummary(pings) {
  const ok = (pings ?? []).filter((x) => x != null);
  if (!pings?.length) return null;
  return { ms: ok.length ? ok[ok.length - 1] : null, loss: Math.round((100 * (pings.length - ok.length)) / pings.length), label: sess?.pingLabel ?? 'internet' };
}

// Disques presque pleins (toutes les 30 min) : alerte + gros jeux oubliés à libérer
let diskState = [];
async function diskCheck() {
  const letters = new Set([(process.env.SystemDrive ?? 'C:').toUpperCase()]);
  for (const i of items) if (i.installed && /^[a-z]:/i.test(String(i.installDir ?? ''))) letters.add(String(i.installDir).slice(0, 2).toUpperCase());
  const drives = await Promise.all([...letters].map(async (l) => ({ drive: `${l}\\`, free: await freeSpace(`${l}\\`), total: await diskSize(`${l}\\`) })));
  diskState = diskAlerts(drives, items);
  send('disk:alerts', diskState);
  const seen = (store.data.diskNotified ??= {});
  for (const a of diskState) {
    if (Date.now() - (seen[a.drive] ?? 0) < 86_400_000) continue;
    seen[a.drive] = Date.now();
    notify(`Disque ${a.drive} presque plein`, `Plus que ${(a.free / 1e9).toFixed(1).replace('.', ',')} Go libres : les jeux risquent de ne plus pouvoir se mettre à jour.${a.idle.length ? ` ${a.idle[0].name} n’a pas été lancé depuis longtemps.` : ''}`);
  }
  store.save();
  return diskState;
}
setTimeout(() => diskCheck().catch(() => {}), 2 * 60_000);
setInterval(() => diskCheck().catch(() => {}), 30 * 60_000);
ipcMain.handle('disk:alerts', () => (process.env.LAUNCHER_DEMO ? [{ drive: 'D:', free: 6.2e9, total: 1e12, critical: false, idle: [{ id: items.find((i) => i.kind === 'game')?.id ?? 'x', name: items.find((i) => i.kind === 'game')?.name ?? 'Jeu', size: 86e9, lastPlayed: Date.now() - 200 * 86_400_000 }] }] : diskCheck().catch(() => diskState)));
ipcMain.handle('disk:health', () => (process.env.LAUNCHER_DEMO ? [{ name: 'Samsung SSD 980 PRO 1TB', ssd: true, bus: 'NVMe', size: 1e12, health: 'Healthy', wear: 6, temp: 41, hours: 3120, errors: 0, state: 'ok', notes: [] }, { name: 'WDC WD20EZRZ', ssd: false, bus: 'SATA', size: 2e12, health: 'Healthy', wear: null, temp: 36, hours: 21000, errors: 2, state: 'warn', notes: ['2 erreur(s) de lecture / écriture non corrigée(s).'] }] : diskHealth().catch(() => [])));

// Test de connexion en 1 clic : ping, gigue, pertes, débit, Wi-Fi ou câble
async function speedDown(ms = 8000) {
  const t0 = performance.now(); let bytes = 0;
  try {
    const res = await fetch('https://speed.cloudflare.com/__down?bytes=50000000', { signal: AbortSignal.timeout(ms + 4000) });
    const reader = res.body.getReader();
    while (performance.now() - t0 < ms) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; }
    reader.cancel().catch(() => {});
  } catch { /* coupé ou trop lent : on garde ce qui est arrivé */ }
  const s = (performance.now() - t0) / 1000;
  return bytes > 1e5 ? Math.round((bytes * 8) / s / 1e6) : null;
}
async function speedUp() {
  const body = Buffer.alloc(8e6, 97);
  const t0 = performance.now();
  const ok = await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body, signal: AbortSignal.timeout(20_000) }).then((r) => r.ok).catch(() => false);
  return ok ? Math.round((body.length * 8) / ((performance.now() - t0) / 1000) / 1e6) : null;
}
async function pingSeries() {
  if (process.platform === 'win32') {
    const out = await new Promise((resolve) => execFile('ping', ['-n', '20', '-w', '1000', '1.1.1.1'], { windowsHide: true, timeout: 40_000, encoding: 'latin1' }, (_e, so) => resolve(String(so ?? ''))));
    return parsePing(out);
  }
  const t = []; for (let i = 0; i < 10; i++) t.push(await tcpPing('1.1.1.1', 443));
  const ok = t.filter((x) => x != null);
  return { avg: ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null, jitter: ok.length > 1 ? Math.round(ok.slice(1).reduce((a, x, i) => a + Math.abs(x - ok[i]), 0) / (ok.length - 1)) : null, loss: Math.round((100 * (t.length - ok.length)) / t.length) };
}
async function onWifi() {
  if (process.platform !== 'win32') return null;
  const out = await ps("$r=Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1; if($r){ (Get-NetAdapter -InterfaceIndex $r.ifIndex).PhysicalMediaType }", 15_000).catch(() => '');
  return /802\.11|wireless|wi-?fi/i.test(String(out)) ? true : String(out).trim() ? false : null;
}
ipcMain.handle('net:test', async () => {
  if (process.env.LAUNCHER_DEMO) return { ping: 18, jitter: 3, loss: 0, down: 412, up: 58, wifi: true, game: { label: 'serveur FiveM', ms: 34 }, ...netAdvice({ ping: 18, jitter: 3, loss: 0, down: 412, up: 58, wifi: true }) };
  send('net:progress', { step: 'ping' });
  const [p, wifi] = await Promise.all([pingSeries(), onWifi()]);
  send('net:progress', { step: 'down' });
  const down = await speedDown();
  send('net:progress', { step: 'up' });
  const up = await speedUp();
  const t = pingTarget({ source: 'fivem' });
  const game = t.label === 'serveur' ? { label: 'dernier serveur FiveM', ms: await tcpPing(t.host, t.port) } : null;
  const r = { ping: p.avg, jitter: p.jitter, loss: p.loss, down, up, wifi, game, at: Date.now() };
  store.data.netTests = [...(store.data.netTests ?? []), { at: r.at, ping: r.ping, down, up, loss: r.loss }].slice(-20);
  store.save();
  return { ...r, ...netAdvice(r) };
});

// « Lancer avec » : applis ouvertes en même temps que le jeu (Discord, OBS, Spotify…)
async function launchCompanions(item) {
  const ids = store.data.items?.[item.id]?.with ?? [];
  if (!ids.length) return;
  const running = activeItems(items, await runningPaths(0).catch(() => []));
  for (const id of ids) {
    const app_ = items.find((i) => i.id === id && i.kind !== 'game');
    if (!app_ || running.has(app_.id)) continue;
    const exe = app_.exe ?? await findExe(app_.installDir).catch(() => null);
    if (exe) spawn(exe, [], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) }).on('error', () => {}).unref();
  }
}
ipcMain.handle('game:with', (_e, id, list) => {
  const it = items.find((i) => i.id === String(id) && i.kind === 'game');
  if (!it) return { ok: false };
  if (Array.isArray(list)) { const valid = list.map(String).filter((x) => items.some((i) => i.id === x && i.kind !== 'game')).slice(0, 8); ((store.data.items ??= {})[it.id] ??= {}).with = valid; store.save(); }
  return { ok: true, with: store.data.items?.[it.id]?.with ?? [], apps: items.filter((i) => i.kind !== 'game' && i.kind !== 'launcher' && (i.exe || i.installDir)).sort((a, b) => (b.minutes || 0) - (a.minutes || 0)).slice(0, 40).map((i) => ({ id: i.id, name: i.name, minutes: i.minutes || 0 })) };
});

// Captures récentes (pour les envoyer dans une discussion) et image réduite prête à envoyer
ipcMain.handle('captures:recent', async () => {
  const games = items.filter((i) => i.kind === 'game' && i.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 10);
  const all = [];
  for (const g of games) for (const c of await capturesOf(g, { steamRoot: await steamPath(), accountIds: steamAccounts.map((a) => a.id) }).catch(() => [])) if (!c.video) all.push({ ...c, game: g.name });
  return all.sort((a, b) => b.at - a.at).slice(0, 24).map((c) => {
    const token = createHash('sha1').update(c.file).digest('hex').slice(0, 24);
    captureFiles.set(token, c.file);
    return { token, at: c.at, game: c.game, url: localUrls({ x: c.file }).x };
  });
});
ipcMain.handle('captures:data', (_e, token) => {
  const f = captureFiles.get(String(token));
  if (!f) return null;
  let img = nativeImage.createFromPath(f);
  if (img.isEmpty()) return null;
  const { width } = img.getSize();
  if (width > 1600) img = img.resize({ width: 1600, quality: 'good' });
  for (const q of [85, 70, 55, 40]) { const b = img.toJPEG(q); if (b.length < 1_150_000) return `data:image/jpeg;base64,${b.toString('base64')}`; }
  return null;
});

// Messages programmés (« préviens le groupe à 21 h ») : gardés sur ce PC, envoyés à l'heure (même launcher réduit)
ipcMain.handle('sched:list', () => (store.data.scheduled ?? []).filter((x) => !x.sent));
ipcMain.handle('sched:add', (_e, key, text, at) => {
  const k = String(key ?? ''); const when = Number(at);
  if (!/^[fg]:[\w-]{1,64}$/.test(k) || !String(text ?? '').trim() || !(when > Date.now()) || when > Date.now() + 7 * 86_400_000) return { ok: false, error: 'Heure invalide.' };
  const x = { id: randomUUID(), key: k, text: String(text).slice(0, 500), at: Math.round(when) };
  store.data.scheduled = [...(store.data.scheduled ?? []).filter((y) => !y.sent), x].slice(-30);
  store.save();
  return { ok: true, list: store.data.scheduled };
});
ipcMain.handle('sched:del', (_e, id) => { store.data.scheduled = (store.data.scheduled ?? []).filter((x) => x.id !== String(id)); store.save(); return { ok: true, list: store.data.scheduled }; });
setInterval(async () => {
  for (const x of (store.data.scheduled ?? []).filter((y) => !y.sent && y.at <= Date.now())) {
    const id = x.key.slice(2);
    const r = x.key[0] === 'g' ? await sendReliable('/api/compte/groupes/messages', { id: CIDM(id), text: x.text, cid: x.id }) : await sendReliable('/api/compte/messages', { to: FID(id), text: x.text, cid: x.id });
    if (r.error && Date.now() - x.at < 3_600_000) continue; // on réessaie pendant une heure
    x.sent = true;
    send('social:sent', { key: x.key, fil: r.fil ?? null });
    if (r.error) notify('Message programmé non envoyé', r.error);
  }
  store.data.scheduled = (store.data.scheduled ?? []).filter((y) => !y.sent);
  store.save();
}, 20_000);

// Connexion par code : ce PC affiche un code, un PC déjà connecté le valide
ipcMain.handle('account:pairStart', async () => {
  store.data.deviceId ??= randomUUID();
  return api('/api/compte/lien/demande', { method: 'POST', body: { appareil: store.data.deviceId, nom: os.hostname().slice(0, 40) } }).catch(() => ({ status: 0, error: 'Serveur injoignable, vérifie ta connexion internet.' }));
});
ipcMain.handle('account:pairPoll', async (_e, ticket) => {
  const r = await api(`/api/compte/lien/attente?ticket=${encodeURIComponent(String(ticket ?? '').slice(0, 64))}`).catch(() => ({ status: 0 }));
  if (r.token) return loggedIn(r);
  return r;
});
ipcMain.handle('account:pairApprove', async (_e, code) => {
  const c = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (c.length !== 8) return { ok: false, error: 'Le code fait 8 caractères (ex. K7Q2-M9XP).' };
  const r = await social('/api/compte/lien/valider', { code: c });
  return r.ok ? { ok: true, nom: r.nom } : { ok: false, error: r.error ?? 'Code refusé.' };
});

// Où sont gardés les comptes (Supabase ou pas), sans rien de secret
ipcMain.handle('account:cloud', () => (process.env.LAUNCHER_DEMO ? { stockage: 'Supabase', supabase: true, comptes: 128 } : api('/api/compte/etat').catch(() => ({ status: 0 }))));
ipcMain.handle('net:state', () => ({ online: netOnline }));
