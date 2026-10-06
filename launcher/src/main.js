import { updateCommand, readUpdateProgress } from './core/gameUpdates.js';
import { cleanHome, cleanNotebook, validGameId } from './core/personal.js';
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
import { cleanOldGpuDrivers, oldGpuDrivers, runElevated } from './core/optimize.js';
import { CPUS, cpuOptions, cpuScore, diskOptions, gpuOptions, matchGpu, platformOf, ramOptions, simulate } from './core/upgrade.js';
import { biosLink, ocPlan, personalPlan } from './core/oc.js';
import { GAME_TWEAKS, applySystemTweaks, deepClean, diskSize, emptyRecycleBin, extraTargets, freeSpace, groupOf, healthScore, optimizeStorage, orphanGameFolders, recycleBinSize, removeOrphan, repairWindows, resetPlan, riskyLeft, scoreLabel, setStartup, setTweak, startupApps, steamJunk, systemTweakStates, tweakStates } from './core/optimize.js';
import { CATEGORIES, JUNK_LABELS, SUSPECT_LABELS, deepScan, storageScore } from './core/deepscan.js';
import { KINDS as WU_KINDS, installUpdates, searchUpdates } from './core/winupdate.js';
import { unifiedHealth, windowsEvents } from './core/health.js';
import { PERF_GROUP_SCRIPT, captureFps, ensurePresentMon } from './core/fps.js';
import { SPOTIFY_METER_PS } from './core/audiometer.js';
import { RL_PORT, borderlessIni, classifyAll, enableStatsIni, rlSettingsFile, jsonStream, matchTracker, parseTracker, playlistFromLog, rlLogFile, rlSummary, statsIni, trackerPage, trackerUrl } from './core/rocketleague.js';
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
import { steamActions, steamDetails, steamReviews } from './core/steam.js';
import { createStore } from './core/store.js';
import { folderSize, safeGameDir, uninstallFiles } from './core/manage.js';
import { measure, storagePlan } from './core/storage.js';
import { applyAction, gameActions, graphicsPacks, revertEntries } from './core/gameopti.js';
import { verifyGame } from './core/verify.js';
import { epicFreeGames } from './core/freegames.js';
import { friendLink, newDeals, steamFriends, wishlistDeals } from './core/social.js';
import { DiscordPresence, activityFor } from './core/discordRpc.js';
import { translateNews, dominantColor, fortniteNews, playReminders, steamNews, todayGameMinutes, weeklyRecap } from './core/daily.js';
import { badges, hourly, levelOf, rediscover, streakOf } from './core/progress.js';
import { dnsTest, pingHosts, speedTest } from './core/net.js';
import { CHECKS_PS, DNS_PAIRS, RESTORE_CLEAN_PS, addTempDay, dnsScript, dustDue, fpsAround, advancedStats, hwYear, logVersion, monthReport, wrapped, parseArgs, psuAdvice, resaleValue, screenAdvice, toReinstall, parseChecks } from './core/more.js';
import { checkReq, parseReq } from './core/reqs.js';
import { gogGames, ubisoftGames } from './core/stores.js';
import { demoActivity, demoBench, demoEvents, demoFriends, demoGameActs, demoItems, demoPerf, demoScan, demoStorage, demoTemps, demoWu } from './core/demo.js';
import { captureDir, captureName } from './core/capture.js';
import { GMOD_APPID, installedAddons, workshopDetails, workshopId } from './core/gmod.js';
import { analyze, defenderRemove, defenderUpdate, defenderScan, parseDiag, pcDiagnostic, processes } from './core/pcdiag.js';
import { VERSION as BENCH_VERSION, cpuBench, diskBench, ramBench, scores, tier } from './core/bench.js';
import { isFresh, mergeBackup, pickBackup } from './core/backup.js';
import { graphicsAdvice } from './core/graphics.js';
import { cardFor, canJoin, joinFor, lastFivemServer, newlyPlaying, playingCard, playingMap, scamCheck } from './core/friendsync.js';
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
import { readFile, writeFile, readdir, rename, rm } from 'node:fs/promises';
import { ps } from './core/pshost.js';
import { collectConfigs, mergeConfigs, restoreConfigs } from './core/gameconfigs.js';
import { setAppVolume } from './core/appvolume.js';
import { lanAddress, newPin, REMOTE_PORT, startRemote } from './core/remote.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Sons des notifications (fenêtre en bas à gauche) : jouables sans clic préalable
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const ICON = path.join(here, 'ui', 'icon.png');
// Octobre : icône citrouille partout dans Windows (fenêtre, barre des tâches, zone de notification, notifications), sauf si la saison est coupée
const icon = () => (new Date().getMonth() === 9 && store?.data?.settings?.season !== 'off' ? path.join(here, 'ui', 'halloween', 'icon.png') : ICON);
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
    icon: icon(), title: 'History Launcher',
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
  tray = new Tray(nativeImage.createFromPath(icon()).resize({ width: 16, height: 16 }));
  tray.setToolTip('History Launcher');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir', click: showWindow },
    { type: 'separator' },
    { label: 'Quitter', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => toggleMini()); // clic gauche : mini-launcher ; « Ouvrir » reste dans le menu du clic droit
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
  if (app.isPackaged && !(await premium()).ia) return null; // l'IA fait partie de ⭐ History IA
  const key = app.isPackaged ? null : secret('gemini') ?? await geminiKeyFromEnv(path.join(here, '..'));
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
  // Images officielles fournies avec l'appli pour les jeux sans fiche correcte (pochette, bannière, en-tête)
  for (const i of raw) { const k = { fortnite: 'fortnite', roblox: 'roblox' }[String(i.name ?? '').toLowerCase()]; if (k) i.art = { ...i.art, cover: `art/${k}-cover.jpg`, hero: `art/${k}-hero.jpg`, header: `art/${k}-header.jpg` }; }
  await fillSteamNames(raw).catch(() => {});
  // Un jeu a changé de version depuis le dernier scan : badge dans la cloche + annonce dans #maj-des-jeux sur Discord
  const vers = (store.data.gameVersions ??= {}); let verChanged = false;
  for (const i of raw.filter((x) => x.version && x.installed)) {
    if (vers[i.id] && vers[i.id] !== i.version && i.name) {
      logNotif({ id: `maj-${i.id}-${i.version}`, kind: 'app', icon: '🆕', title: `${i.name} a été mis à jour`, body: i.steamId ? 'Les patch notes sont sur la page Steam du jeu.' : 'Nouvelle version installée.' });
      const token = secret('account');
      if (token) api('/api/compte/maj-jeu', { method: 'POST', token, body: { name: i.name, steamId: i.steamId ?? null, version: i.version } }).catch(() => {});
    }
    if (vers[i.id] !== i.version) { vers[i.id] = i.version; verChanged = true; }
    (store.data.versionLog ??= {})[i.id] = logVersion(store.data.versionLog[i.id], i.version);
  }
  // Jeux installés gardés (sauvegarde en ligne) : après un formatage, la liste « À réinstaller » les retrouve
  if (!process.env.LAUNCHER_DEMO) { const keep = new Map((store.data.installedList ?? []).map((x) => [x.id, x])); for (const i of raw.filter((x) => x.installed && x.kind === 'game' && x.name)) keep.set(i.id, { id: i.id, name: i.name, source: i.source ?? null, steamId: i.steamId ?? null }); store.data.installedList = [...keep.values()].slice(-500); verChanged = true; }
  if (verChanged) store.save();
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
const SAFE_LINK = /^(steam:\/\/(rungameid|install|uninstall|validate)\/\d+|com\.epicgames\.launcher:\/\/(apps\/[\w%.-]+\?action=(launch|verify|install)(&silent=true)?|store\/library)|https:\/\/store\.steampowered\.com\/app\/\d+|https:\/\/store\.epicgames\.com\/fr\/p\/[\w-]+|https:\/\/steamcommunity\.com\/profiles\/\d{17}|https:\/\/store\.steampowered\.com\/news\/app\/\d+\/view\/\d+|steam:\/\/url\/(CommunityFilePage\/\d{6,12}|SteamWorkshopPage\/4000)|fivem:\/\/connect\/(cfx\.re\/join\/[a-z0-9]{4,10}|\d{1,3}(\.\d{1,3}){3}:\d{2,5})|https:\/\/(www\.steamgriddb\.com\/profile\/preferences\/api|steamcommunity\.com\/dev\/apikey)|https:\/\/historylauncher\.vercel\.app\/|https:\/\/(lolesports\.com|valorantesports\.com|esports\.rocketleague\.com|liquipedia\.net\/[a-z]+\/[\w%().-]*|www\.ubisoft\.com\/en-us\/esports\/rainbow-six\/siege))$/;
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
  return new Promise((resolve) => {
    const child = spawn(exe, ['-silent', ...args], { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', () => resolve(false));
    child.once('spawn', () => { child.unref(); resolve(true); });
  });
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
// Notifications Windows limitées : jamais deux fois la même en 6 h et 3 par heure au plus (toutes restent dans la cloche du launcher)
const shownNotifs = [];
class Notif extends Notification {
  constructor(o) { super(o); this.o = o; }
  show() {
    logNotif({ kind: 'app', icon: '🔔', title: this.o?.title, body: this.o?.body });
    const key = String(this.o?.title ?? '').replace(/[\d\s,.%€+-]+/g, '');
    const now = Date.now();
    while (shownNotifs.length && now - shownNotifs[0].at > 6 * 3_600_000) shownNotifs.shift();
    if (streaming() || shownNotifs.some((n) => n.key === key) || shownNotifs.filter((n) => now - n.at < 3_600_000).length >= 3) return;
    shownNotifs.push({ key, at: now });
    super.show();
  }
}
function notify(title, body) {
  if (Notification.isSupported()) new Notif({ title, body, icon: icon(), silent: true }).show();
}
// Infos de chaque partie (boost, FPS) : seulement dans la cloche du launcher, pas en notification Windows
const bell = (title, body) => logNotif({ kind: 'app', icon: '🔔', title, body });
async function startBoost(item, force = null) {
  const b = force ? { ...boostSettings(), enabled: true, close: force.close ?? [], power: Boolean(force.power), tune: Boolean(force.priority) } : boostSettings();
  // Réglage par jeu : « toujours » (même si l'opti auto est coupée) ou « jamais » pour ce jeu
  const perGame = b.games?.[item.id];
  const prof = profileOf(item.id);
  if ((!force && (perGame === false || (!b.enabled && perGame !== true && !prof.enabled && !store.data.settings.tournament))) || boosted || process.platform !== 'win32' || !(await premium()).opti) return;
  const power = force ? b.power : prof.enabled ? prof.power !== 'none' : b.power;
  const scheme = power ? await activeScheme() : null;
  if (scheme && scheme !== HIGH_PERFORMANCE) await setScheme(HIGH_PERFORMANCE);
  const closed = await closeApps(boostPlan(await runningPaths(), force ? b.close : [...new Set([...b.close, ...(prof.enabled ? prof.close : [])])]));
  // Profil du jeu : notifications de Windows coupées pendant la partie (remises à la fin)
  const quiet = Boolean(force ? force.quiet : prof.enabled && prof.quiet) && await windowsToasts(false);
  boosted = { item, scheme, closed, quiet, start: Date.now(), misses: 0, hogs: {} };
  (store.data.boostedAt ??= {})[item.id] = Date.now();
  if (!force) bell('Boost activé', `${item.name} : performances élevées${closed.length ? `, ${closed.length} appli(s) fermée(s)` : ''}.`);
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
  if (on && sess && process.platform === 'win32') exclusiveFs().then((x) => { if (x) warnFullscreen(); }).catch(() => {});
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
  if ((changed || top.length) && !silent) bell('Boost terminé', `${mins} min de jeu${closed.length ? `, ${closed.length} appli(s) fermée(s) puis rouvertes` : ''}. PC remis comme avant.${top.length ? ` ⚠ Ont pris du processeur pendant la partie : ${top.map(([n, p]) => `${n} (${p} %)`).join(', ')} : ferme-les avant de jouer si ça a freezé.` : ''}`);
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
  // Nouveau PC (processeur ou carte graphique changés) : ticket Opti Pro proposé pour le régler
  const sig = `${data.cpu?.name ?? ''}|${data.gpus?.[0]?.name ?? ''}`;
  if (!demo && sig.length > 1 && sig !== store.data.hwSig) { if (store.data.hwSig) logNotif({ id: `newpc-${sig}`, kind: 'app', icon: '🆕', title: 'Nouveau matériel détecté', body: `${data.cpu?.name ?? ''} · ${data.gpus?.[0]?.name ?? ''} : ouvre Optimisation › Opti Pro, le technicien règle le BIOS, la RAM et Windows pour ce PC.` }); store.data.hwSig = sig; store.save(); }
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
    case 'recovery': return open('ms-settings:recovery');
    case 'apps': return open('ms-settings:appsfeatures');
    case 'devmgmt': return shell.openPath(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'devmgmt.msc')).then((e) => ({ ok: !e, opened: !e }));
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
    const w = new BrowserWindow({ width: 1280, height: 720, title: 'Benchmark · History Launcher', backgroundColor: '#07060a', autoHideMenuBar: true, icon: icon(),
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
    badges: badges({ items, days: act.days, sessions: act.sessions, friends, bench: (process.env.LAUNCHER_DEMO ? demoBench() : store.data.bench ?? [])[0] ?? null, health: diagCache?.data?.score ?? store.data.diagHistory?.at(-1)?.score ?? null, collections: Object.keys(store.data.collections ?? {}).length, optiPro: Boolean(store.data.optiProDoneAt) }),
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
  const text = await brain.ask({ system: 'Tu es un coach gaming et expert en réglages PC. Français, tutoiement. Réponds en Markdown simple et aéré, exactement 3 sections avec un titre « ## » : « ## 🎛️ Réglages conseillés » (liste « - Option : **valeur** », 5 à 8 lignes), « ## 🚀 Pour gagner des FPS » (3 puces courtes, le point clé en **gras**), « ## 🎯 Astuces de jeu » (3 puces). Phrases courtes, pas de pavé. Pas de chiffres de FPS inventés.', text: `Jeu : ${item.name}\nPC : ${pcTxt}\nTemps de jeu : ${Math.round((item.minutes || 0) / 60)} h` }).catch((err) => ({ error: err.message }));
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
  store.data.tempDays = addTempDay(store.data.tempDays, { cpuT: snap.cpu?.temp, gpuT: snap.gpu?.temp });
  const dust = dustDue(store.data.tempDays, store.data.dustAt ??= Date.now());
  if (dust) logNotif({ id: `dust-${new Date().toISOString().slice(0, 7)}`, kind: 'heat', icon: '🧹', title: dust === 'hot' ? 'Ton processeur chauffe plus qu’avant' : 'Pense à dépoussiérer ton PC', body: dust === 'hot' ? '+8 °C en moyenne par rapport au début du mois : un coup de bombe à air dans les ventilateurs et filtres.' : 'Ça fait 6 mois : bombe à air dans les ventilateurs, filtres et radiateurs (PC éteint).' });
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
  heavyStartup: r.startup.filter((x) => x.enabled && x.heavy).length, tweaksOff: r.tweaks.filter((t) => !t.on && !t.optional && !t.retired && !t.comfort).length,
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
        (store.data.optiAt ??= {})[st.a.itemId] = Date.now(); // pour comparer les FPS avant / après l'opti
        journal.entries.push(...r.entries);
        got = r.freed;
      }
      journal.done.push(st.label);
    } catch (err) {
      // Un élément bloqué (jeu ouvert, fichier en lecture seule, droits) s'arrête seul : le reste continue
      const msg = /^Command failed/.test(err.message) ? 'Windows a refusé la modification (accès refusé)' : err.message;
      journal.errors.push(`${st.label} : ${msg}`);
      progress({ phase: 'run', index: i, total: steps.length, label: st.label, status: 'erreur', error: msg, freed });
      continue;
    }
    freed += got;
    progress({ phase: 'run', index: i, total: steps.length, label: st.label, status: 'fait', got, freed });
  }
  if (journal.entries.length || journal.tweaks.length) { store.data.optiJournal = [journal, ...(store.data.optiJournal ?? [])].slice(0, 20); store.save(); }
  const after = await freeSpace();
  const g = (store.data.gains ??= {}); g.optis = (g.optis ?? 0) + 1; g.freed = (g.freed ?? 0) + Math.max(0, before != null && after != null ? Math.max(freed, after - before) : freed); // « ce que Premium t’a apporté »
  return { ok: true, freed: before != null && after != null ? Math.max(freed, after - before) : freed, steps: steps.length, tweaks: GAME_TWEAKS.filter((t) => tweaks.includes(t.id) && journal.done.includes(t.label)).length, games: games.length, errors: journal.errors, undo: Boolean(journal.entries.length || journal.tweaks.length) };
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
  if (h.score != null) { store.data.healthLast = { score: h.score, at: Date.now() }; store.data.healthLog = [...(store.data.healthLog ?? []), store.data.healthLast].slice(-60); store.save(); }
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
// 🛒 Upgrade : carte graphique actuelle, simulation avec une autre et conseil d'achat selon le budget (estimations)
async function upgradeData({ budget = 600, mode = 'gpu', brand = 'all', target = null, picked = [] } = {}) {
  const d = process.env.LAUNCHER_DEMO ? { cpu: { name: 'AMD Ryzen 5 3600 6-Core Processor' }, gpus: [{ name: 'NVIDIA GeForce GTX 1660 SUPER', width: 1920, hz: 144 }], ram: [{ size: 8 * 1024 ** 3, speed: 2666 }, { size: 8 * 1024 ** 3, speed: 2666 }], disks: [{ system: true, media: 'SSD' }], volumes: [{ letter: 'C', free: 80e9, size: 500e9 }] } : diagCache?.data ?? await runDiag().catch(() => null);
  const gpu = d?.gpus?.find((g) => !/intel|uhd|iris/i.test(g.name)) ?? d?.gpus?.[0];
  const cpuName = d?.cpu?.name ?? '';
  const ramGb = d?.ram?.length ? Math.round(d.ram.reduce((a, m) => a + (m.size ?? 0), 0) / 1024 ** 3) : null;
  // Jeux : ceux avec de vrais FPS mesurés (5 dernières parties) + ceux que tu as choisis dans la liste
  const measured = Object.fromEntries(Object.entries(store.data.perf ?? {}).map(([id, l]) => { const w = l.filter((r) => r.avg).slice(-5); return [id, w.length ? { avg: w.reduce((a, r) => a + r.avg, 0) / w.length, bound: w.at(-1).bound, gpuAvg: w.at(-1).gpuAvg } : null]; }).filter(([, v]) => v));
  if (process.env.LAUNCHER_DEMO && !Object.keys(measured).length) for (const [n, avg, bound] of [['Rocket League', 160, 'cpu'], ['Grand Theft Auto V', 74, 'gpu']]) { const it = items.find((i) => i.name === n); if (it) measured[it.id] = { avg, bound }; }
  const ids = [...new Set([...(picked.length ? picked : Object.keys(measured)), ...Object.keys(measured)])].slice(0, 12);
  const games = ids.map((id) => { if (String(id).startsWith('pop:')) return { id, name: String(id).slice(4, 80) }; const it = items.find((i) => i.id === id); return it ? { id, name: it.name, ...(measured[id] ?? {}) } : null; }).filter(Boolean);
  const base = { gpuName: gpu?.name ?? '', cpuName, ramGb, width: gpu?.width ?? null, hz: gpu?.hz ?? null, platform: platformOf(cpuName), cpu: cpuScore(cpuName), picked: ids };
  const g = gpuOptions({ gpuName: base.gpuName, cpuName, width: base.width, hz: base.hz, budget: Number(budget) || 600, brand });
  const curGpu = g.current ?? { score: 100, name: base.gpuName };
  if (mode === 'cpu') {
    const c = cpuOptions({ cpuName, ramGb: ramGb ?? 16, budget: Number(budget) || 600 });
    const tgt = c.options.find((x) => x.name === target) ?? c.best;
    return { ...base, mode, cpuOpt: c, target: tgt, sim: tgt ? simulate({ games, gpu: curGpu, cpu: base.cpu, newCpu: tgt.score }) : [] };
  }
  if (mode === 'ram') return { ...base, mode, ramOpt: ramOptions({ cpuName, ramGb, ramSpeed: d?.ram?.[0]?.configured ?? d?.ram?.[0]?.speed ?? null }) };
  if (mode === 'disk') return { ...base, mode, diskOpt: diskOptions({ systemHdd: d?.disks?.some((x) => x.system && x.media === 'HDD'), freeGb: (() => { const v = d?.volumes?.find((x) => x.letter === 'C'); return v ? Math.round(v.free / 1e9) : null; })() }) };
  const tgt = g.options.find((x) => x.name === target) ?? g.best;
  return { ...base, mode: 'gpu', brand, gpuOpt: g, target: tgt, sim: tgt ? simulate({ games, gpu: curGpu, newGpu: tgt, cpu: base.cpu, cap: g.balance.cap }) : [] };
}
ipcMain.handle('upgrade:get', (_e, o) => upgradeData(o && typeof o === 'object' ? o : {}));
// Premium History IA : avis détaillé et rédigé sur l'upgrade, à partir des vraies mesures
ipcMain.handle('upgrade:ai', async (_e, o = {}) => {
  if (!(await premium()).ia) return { error: 'premium' };
  const u = await upgradeData(o); const budget = o.budget;
  const brain = await getAi().catch(() => null);
  if (!brain) return { error: 'Connecte-toi à ton compte History.' };
  const facts = `Budget : ${budget} €\nPièce étudiée : ${{ gpu: 'carte graphique', cpu: 'processeur', ram: 'mémoire', disk: 'stockage' }[u.mode]}\nProcesseur : ${u.cpuName} (socket ${u.platform.socket ?? '?'}, ${u.platform.mem ?? '?'})\nCarte graphique : ${u.gpuName}\nRAM : ${u.ramGb ?? '?'} Go\nÉcran : ${u.width ?? '?'} px à ${u.hz ?? '?'} Hz\nAchat envisagé : ${u.target ? `${u.target.name} (~${u.target.total ?? u.target.price} €${u.target.psu ? `, alimentation conseillée ${u.target.psu} W` : ''}${u.target.notes ? `, ${u.target.notes.join(', ')}` : ''})` : 'aucun'}\nAutres options : ${(u.gpuOpt?.options ?? u.cpuOpt?.options ?? u.ramOpt?.options ?? u.diskOpt?.options ?? []).map((x) => `${x.name ?? x.title} ~${x.total ?? x.price} €`).join(' ; ')}\nJeux (FPS actuels → après, mesuré ou estimé) : ${(u.sim ?? []).filter((g) => !g.unknown).map((g) => `${g.name} ${g.now}→${g.after} (${g.measured ? 'mesuré' : 'estimé'}, limité par ${g.limit === 'cpu' ? 'le processeur' : 'la carte graphique'})`).join(' ; ') || '—'}`;
  const text = await brain.ask({ system: 'Tu es un expert hardware gaming qui conseille un joueur. Français, tutoiement, ton clair et honnête. Réponds en Markdown aéré avec ces sections « ## » : « ## 🎯 Mon verdict » (2 phrases nettes : quoi acheter ou ne pas acheter), « ## 🎮 Ce que ça change dans tes jeux » (une puce par jeu avec FPS avant → après, en **gras**), « ## 🔌 Compatibilité » (socket, type de mémoire, BIOS, alimentation : ce qui se pose tel quel et ce qu’il faut changer avec), « ## ⚖️ Équilibre avec ton PC » (processeur, carte graphique, écran, RAM : ce qui suivra ou bloquera), « ## 💡 Meilleur rapport qualité / prix » (2 options : moins chère / plus puissante, avec prix), « ## ⚠️ À vérifier avant d’acheter » (alimentation, place dans le boîtier, connecteurs). Utilise seulement les chiffres fournis, dis clairement que ce sont des estimations.', text: facts }).catch((err) => ({ error: err.message }));
  return typeof text === 'string' ? { text } : { error: text?.error ?? 'IA indisponible' };
});
// 🚀 Opti Pro : accompagnement en 7 étapes. Le BIOS / l'overclocking ne sont jamais touchés par l'appli : guide pas à pas.
const proPc = async () => {
  const d = process.env.LAUNCHER_DEMO ? { cpu: { name: 'AMD Ryzen 5 7600 6-Core Processor' }, board: 'MSI MAG B650 TOMAHAWK WIFI', ram: [{ size: 17179869184, speed: 6000, configured: 4800, type: 'DDR5' }], gpus: [{ name: 'NVIDIA GeForce RTX 4070' }] } : diagCache?.data ?? await runDiag().catch(() => null);
  const gpu = d?.gpus?.find((g) => !/intel|uhd|iris/i.test(g.name)) ?? d?.gpus?.[0];
  return { laptop: Boolean(d?.battery), cpu: d?.cpu?.name ?? '', board: d?.board ?? '', gpu: gpu?.name ?? '', ramGb: Math.round(os.totalmem() / 1073741824), plan: ocPlan({ cpu: d?.cpu?.name, board: d?.board, ram: d?.ram ?? [] }) };
};
ipcMain.handle('pro:get', () => proPc());
// Ticket guidé : même conversation que le fil Discord, l'IA du serveur répond à chaque étape
const proDemo = () => ({ id: 'demo', step: 4, closed: false, thread: true, ocOptIn: false, ocWarning: '- Le processeur chauffe plus : il faut un bon refroidissement.\n- Un réglage trop poussé peut faire planter le PC : on teste chaque palier.\n- La garantie peut ne plus couvrir un dégât lié à l’overclocking.\n- Tout se remet comme avant avec « Load Optimized Defaults ».', todo: personalPlan({ cpu: 'AMD Ryzen 5 7600', board: 'MSI MAG B650 TOMAHAWK WIFI', cooling: 'AIO 240', games: 'Fortnite', need: 'FPS stables en 240 Hz', ram: [{ speed: 6000, configured: 4800, type: 'DDR5' }] }), links: [['🔄 Dernier BIOS de ta carte mère', 'https://www.msi.com/Motherboard/MAG-B650-TOMAHAWK-WIFI/support#bios'], ['🧪 OCCT (stabilité)', 'https://www.ocbase.com/download'], ['🧠 TestMem5 (RAM)', 'https://github.com/CoolCmd/TestMem5'], ['🌡 HWiNFO (températures)', 'https://www.hwinfo.com/download/']], advice: { cpu: 'recommandé', why: 'Processeur débloqué, carte mère et refroidissement compatibles.' }, log: [
  { who: 'user', step: 1, text: 'Mon setup : AMD Ryzen 5 7600 · RTX 4070 · 16 Go\nFortnite en 1080p 240 Hz, je veux des FPS stables.' },
  { who: 'bot', step: 1, text: '## ✅ Demande validée\nTon PC a un vrai potentiel, on y va.\n## 🧭 Ton parcours\n- 💾 Clé USB et 🧹 formatage : **tu peux passer**, Windows est récent\n- 🧠 BIOS : **à faire**, ta RAM tourne à **4800** au lieu de **6000 MHz**' },
  { who: 'user', step: 4, text: '⏭ Je passe : 💾 Clé USB bootable, 🧹 Formatage propre.' },
  { who: 'bot', step: 4, text: '## 🔄 Mets à jour ton BIOS\n- Ton BIOS **7D75v1F** date de 2023 : télécharge la dernière version sur [la page officielle MSI](https://www.msi.com/Motherboard/MAG-B650-TOMAHAWK-WIFI/support#bios) et lance **M-Flash**\n## 🧠 Processeur\n1. **OC › Precision Boost Overdrive** sur **Advanced**\n2. **Curve Optimizer** : All Core, Negative, **-20**\n## 🧩 Mémoire\n- **EXPO Profile 1** : **4800 → 6000 MHz**\n## ⚡ Je m’en occupe\n- Plan d’alimentation **Performances optimales** [[faire:alimentation]]\n- Anciens pilotes graphiques qui traînent (**4,2 Go**) [[faire:pilotes_anciens]]\nPetite question avant de commencer : as-tu une clé USB vide sous la main pour le BIOS ?' }] });
const proPost = (path, body) => { const token = secret('account'); return token ? api(path, { method: 'POST', token, body, timeout: 90_000 }).catch(() => ({ error: 'Serveur injoignable. Réessaie.' })) : { error: 'Connecte-toi à ton compte History (Paramètres › Compte).' }; };
ipcMain.handle('pro:session', async () => { if (process.env.LAUNCHER_DEMO) return { session: { ...proDemo(), ...(process.env.LAUNCHER_DEMO_PRODONE ? { done: true, closed: true, closedAt: Date.now() } : {}) } }; const token = secret('account'); return token ? api('/api/compte/optipro', { token }).catch(() => ({ error: 'Serveur injoignable.' })) : { error: 'login' }; });
ipcMain.handle('pro:start', async (_e, f = {}) => {
  const p = await proPc(); const d = diagCache?.data;
  const temps = store.data.temps ?? []; const max = (k) => Math.max(0, ...temps.map((t) => t[k] ?? 0)) || null;
  return proPost('/api/compte/optipro', { specs: { cpu: p.cpu, board: p.board, gpu: p.gpu, ram: d?.ram ?? [], ramGb: p.ramGb, ramText: `${p.ramGb} Go ${p.plan.ramType ?? ''} ${p.plan.ramNow ?? ''} MHz`.trim(), laptop: Boolean(d?.battery), biosVersion: d?.bios?.version, biosDate: d?.bios?.date, windows: d?.os?.name, cpuTempMax: max('cpuT'), gpuTempMax: max('gpuT'), cooling: String(f.cooling ?? '').slice(0, 160), need: String(f.need ?? '').slice(0, 800), games: raw.filter((i) => i.kind === 'game').slice(0, 15).map((i) => i.name).join(', ') }, redo: f.redo === true });
});
ipcMain.handle('pro:act', (_e, action, text = '', images = []) => (process.env.LAUNCHER_DEMO && action === 'detail' ? { detail: '1. Télécharge le dernier BIOS sur [la page officielle MSI](https://www.msi.com/Motherboard/MAG-B650-TOMAHAWK-WIFI/support#bios) (onglet **BIOS**, la version tout en haut).\n2. Décompresse le fichier et copie-le sur une clé USB formatée en **FAT32**.\n3. Redémarre et appuie sur **Suppr** pour entrer dans le BIOS.\n4. Ouvre **M-Flash** (en bas à gauche), confirme, choisis le fichier sur la clé.\n5. N’éteins **jamais** le PC pendant la mise à jour (3 à 5 min, il redémarre seul).\n6. Vérifie : la version affichée en haut du BIOS doit être la nouvelle.' } : proPost('/api/compte/optipro/action', { action: String(action).slice(0, 10), text: String(text).slice(0, 1500), images: (Array.isArray(images) ? images : []).filter((u) => /^data:image\/(png|jpeg|webp);base64,/.test(String(u)) && String(u).length < 600_000).slice(0, 3) })));
// Liens des étapes : calculés ici (jamais une adresse venant de l'interface)
ipcMain.handle('pro:link', async (_e, which) => { const p = await proPc(); const u = { bios: biosLink(p.board, p.cpu), occt: 'https://www.ocbase.com/download', nvidia: 'https://www.nvidia.com/fr-fr/drivers/', amd: 'https://www.amd.com/fr/support/download/drivers.html' }[which]; return u ? shell.openExternal(u).then(() => true, () => false) : false; });
// Liens du ticket (boutons et réponses de l'IA) : seulement des sites officiels connus, en https
const PRO_HOSTS = /^(?:[\w-]+\.)*(?:microsoft\.com|nvidia\.com|amd\.com|intel\.(?:com|fr)|msi\.com|asus\.com|gigabyte\.com|asrock\.com|ocbase\.com|hwinfo\.com|cpuid\.com|wagnardsoft\.com|capframex\.com|maxon\.net|testufo\.com|github\.com|zyko144\.github\.io|discord\.com)$/i;
ipcMain.handle('pro:open', (_e, url) => { try { const u = new URL(String(url)); return u.protocol === 'https:' && PRO_HOSTS.test(u.hostname) ? shell.openExternal(u.href).then(() => true, () => false) : false; } catch { return false; } });
// Outil Microsoft de création de clé USB : téléchargé en 1 clic, signature Microsoft vérifiée, puis lancé
ipcMain.handle('pro:usb', async () => {
  if (process.platform !== 'win32') return { error: 'Disponible sur Windows.' };
  const file = path.join(app.getPath('downloads'), 'MediaCreationTool_Windows11.exe');
  try {
    const res = await net.fetch('https://go.microsoft.com/fwlink/?linkid=2156295');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    const stdout = await new Promise((ok) => execFile('powershell.exe', ['-NoProfile', '-Command', `$s=Get-AuthenticodeSignature -LiteralPath '${file.replace(/'/g, "''")}'; "$($s.Status)|$($s.SignerCertificate.Subject)"`], { windowsHide: true }, (_e, out) => ok(String(out ?? ''))));
    if (!/^Valid\|.*Microsoft/i.test(stdout.trim())) { await rm(file, { force: true }); return { error: 'Signature Microsoft invalide : fichier supprimé.' }; }
    const err = await shell.openPath(file); return err ? { error: err } : { ok: true, file };
  } catch (e) { return { error: `Téléchargement impossible (${e.message}).` }; }
});
// 🩺 Entretien : santé des disques (SMART) et anciens pilotes graphiques
ipcMain.handle('care:get', async () => ({ disks: (diagCache?.data ?? (process.env.LAUNCHER_DEMO ? null : await runDiag().catch(() => null)))?.disks?.map((x) => ({ name: x.name, media: x.media, health: x.health, size: x.size })) ?? (process.env.LAUNCHER_DEMO ? [{ name: 'Samsung SSD 980 1TB', media: 'SSD', health: 'Healthy', size: 1e12 }, { name: 'ST2000DM008', media: 'HDD', health: 'Warning', size: 2e12 }] : []), drivers: process.env.LAUNCHER_DEMO ? { count: 3, bytes: 4.2e9 } : process.platform === 'win32' ? await oldGpuDrivers() : { count: 0, bytes: 0 } }));
ipcMain.handle('care:drivers', async () => {
  if (!(await premium()).opti) return { ok: false, error: 'réservé à ⭐ Opti Pro' };
  const r = await cleanOldGpuDrivers(jobFile('drivers'), jobSend('drivers'));
  notify(r.ok ? '✅ Anciens pilotes supprimés' : 'Nettoyage des pilotes arrêté', r.ok ? `${r.removed} ancien(s) pilote(s) graphique(s) retiré(s). Un point de restauration a été créé avant.` : 'Autorisation refusée ou tâche interrompue.');
  return r;
});
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
  if (store.data.settings.optiNight && (new Date().getHours() < 2 || new Date().getHours() > 7 || powerMonitor.getSystemIdleTime() < 600)) return; // la nuit, PC inutilisé
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
  for (const a of heatAlerts(await snapshot().catch(() => ({})), lastHeat)) {
    notify('Ton PC chauffe', `${a.text}. Pense à aérer ou à baisser les graphismes.`);
    // Dans la cloche (une fois par jour) : bouton pour demander de l'aide au support, analyse du PC jointe
    logNotif({ id: `heat-${new Date().toDateString()}`, kind: 'heat', icon: '🔥', title: 'Ton PC a chauffé en jeu', body: `${a.text}. Le support peut regarder ça avec l’analyse de ton PC.` });
  }
}, 60_000);

// ---------- Pilote graphique trop vieux : rappel au plus une fois par mois (clic = page officielle du pilote) ----------
let driverInfo = null;
async function checkDriver() {
  const drivers = await gpuDrivers().catch(() => []);
  driverInfo = oldDriver(drivers);
  const ver = (drivers.find((d) => d.vendor !== 'intel') ?? drivers[0])?.version ?? null;
  if (ver && store.data.gpuDriverVer && ver !== store.data.gpuDriverVer) logNotif({ id: `drv-${ver}`, kind: 'app', icon: '🧩', title: 'Nouveau pilote graphique installé', body: 'Les premières parties peuvent saccader quelques minutes : les jeux recompilent leurs shaders. C’est normal, ça ne revient pas.' });
  if (ver && ver !== store.data.gpuDriverVer) { store.data.gpuDriverVer = ver; store.save(); }
  // NVIDIA : comparaison avec le dernier pilote Game Ready publié (notes de version + lien direct)
  const nv = drivers.find((d) => d.vendor === 'nvidia');
  const latest = nv ? await nvidiaLatest(nv.name).catch(() => null) : null;
  const mine = nv ? nvidiaVersion(nv.version) : null;
  if (latest && mine && newerVersion(latest.version, mine)) {
    driverInfo = { name: nv.name, vendor: 'nvidia', version: mine, latest: latest.version, notes: latest.notes, download: latest.download, date: latest.date, link: latest.notes ?? DRIVER_LINKS[0] };
    if (store.data.driverLatestNotified !== latest.version && Notification.isSupported()) {
      store.data.driverLatestNotified = latest.version; store.save();
      const n = new Notif({ title: `Nouveau pilote NVIDIA ${latest.version}`, body: `Tu as la ${mine}. Clique pour voir les nouveautés (jeux optimisés, corrections) et le télécharger.`, icon: icon() });
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
  const n = new Notif({ title: 'Pilote graphique à mettre à jour', body: `Ton pilote ${driverInfo.name} a ${months} mois : les jeux récents tournent souvent mieux avec le dernier. Clique pour le télécharger.`, icon: icon() });
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
async function toggleOverlay() {
  if (overlay && !overlay.isDestroyed()) { clearInterval(overlayTimer); overlay.close(); overlay = null; return; }
  if (!currentSession()) { notify('Aucun jeu lancé', 'Les infos en jeu (Ctrl+Alt+O) s’affichent seulement pendant une partie.'); return; }
  if ((/rocket league/i.test(currentSession()?.name ?? '') && await rlExclusive()) || await exclusiveFs()) return warnFullscreen();
  // Anneau Spotify qui bat au son de Spotify seulement (niveau lu tant que l'overlay est ouvert)
  // (lancé seulement quand une musique joue, coupé sinon : pas de processus qui tourne pour rien)
  let meter = null;
  const setMeter = (on) => {
    if (!on || process.platform !== 'win32') { meter?.kill(); meter = null; return; }
    if (meter) return;
    meter = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SPOTIFY_METER_PS, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const me = meter;
    me.on('error', () => {}); me.on('exit', () => { if (meter === me) meter = null; });
    me.stdout.setEncoding('utf8');
    me.stdout.on('data', (t) => { const v = Number(String(t).trim().split(/\s+/).pop()); if (overlay && !overlay.isDestroyed() && Number.isFinite(v)) overlay.webContents.send('overlay:beat', v); });
  };
  let music = null; let musicAt = 0;
  overlay = new BrowserWindow({
    width: 236, height: 190, ...ovPlace('fps', 236), frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, hasShadow: false,
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlay.webContents.on('will-navigate', (e) => e.preventDefault());
  overlay.on('closed', () => setMeter(false));
  overlay.loadFile(path.join(here, 'ui', 'overlay.html'));
  overlay.once('ready-to-show', () => overlay?.showInactive());
  const push = async () => {
    if (!overlay || overlay.isDestroyed()) return;
    // Musique relue toutes les 6 s (elle change rarement), mesures du PC toutes les 2 s
    if (Date.now() - musicAt > 6000) { musicAt = Date.now(); music = await nowPlaying().catch(() => null); setMeter(Boolean(music?.title && music.player === 'Spotify')); }
    const pc = await snapshot().catch(() => null);
    if (!overlay || overlay.isDestroyed()) return;
    const friends = friendsCache.data?.friends ?? [];
    overlay.webContents.send('overlay:data', {
      style: store.data.ovStyle?.fps ?? 'card', zoom: store.data.ovZoom?.fps ?? 1, session: currentSession(), pc, music: music?.title ? { title: music.title, artist: music.artist } : null,
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
let rlSock = null; let rlTrack = null; let rlOv = null; let rlHideTimer = null; let rlLive = null;
function rlData() {
  const r = rl();
  const cur = rlTrack?.match();
  return { current: cur ? { mode: cur.mode, cat: rlLive?.guid === cur.guid ? rlLive.cat : null } : null, player: r.player, profile: r.profile, profileOk: r.profileOk !== false, style: store.data.ovStyle?.rl ?? 'card', zoom: store.data.ovZoom?.rl ?? 1, games: r.games.slice(0, 30), sum: rlSummary(r.games), live: Boolean(rlSock), statsOff: r.statsOff ?? false };
}
const rlPush = () => { if (rlOv && !rlOv.isDestroyed()) rlOv.webContents.send('rl:data', rlData()); };
/** Profil public : requête directe, sinon via une fenêtre de navigateur cachée (le site bloque les requêtes hors navigateur). */
const RL_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
async function rlFetch(url, page) {
  const direct = await net.fetch(url, { headers: { 'User-Agent': RL_UA, Accept: 'application/json' } }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (direct) return direct;
  // Page du profil ouverte en fond (elle passe la vérification du site), puis l'API lue depuis cette page
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, partition: 'persist:rltracker', images: false, webgl: false, spellcheck: false } });
  // Page allégée : ni images, ni vidéos, ni polices, ni pubs (seulement le site et sa vérification)
  w.webContents.session.webRequest.onBeforeRequest((d, cb) => cb({ cancel: ['image', 'media', 'font'].includes(d.resourceType) || !/^https:\/\/([\w-]+\.)*(tracker\.network|tracker\.gg|cloudflare\.com)\//.test(d.url) }));
  w.webContents.setAudioMuted(true);
  try {
    await w.loadURL(page, { userAgent: RL_UA }).catch(() => {});
    for (let i = 0; i < 20 && !w.isDestroyed(); i++) {
      const t = await w.webContents.executeJavaScript(`fetch(${JSON.stringify(url)}, { credentials: 'include' }).then((r) => (r.ok ? r.text() : '')).catch(() => '')`).catch(() => '');
      if (t.trim().startsWith('{')) return JSON.parse(t);
      await new Promise((ok) => setTimeout(ok, 1500));
    }
  } catch { /* profil illisible : l'overlay garde victoires, défaites et série */ } finally { if (!w.isDestroyed()) w.destroy(); }
  return null;
}
/** Profil public (rang, MMR) : au plus toutes les 3 min, et juste après un match pour le gain de MMR. */
async function rlProfile(force = false, retry = 0) {
  const r = rl(); const url = trackerUrl(r.player);
  if (!url || (!force && Date.now() - (r.profileAt ?? 0) < 300_000)) return;
  r.profileAt = Date.now();
  const p = parseTracker(await rlFetch(url, trackerPage(r.player)));
  r.profileOk = Boolean(p);
  if (!p) { rlPush(); return; }
  // Classé ou occa, et gain de MMR : les modes dont le profil a bougé depuis la dernière lecture (le jeu ne le dit pas)
  // Pas encore à jour après la partie : une seule nouvelle lecture 2 min 30 plus tard
  classifyAll(r.games, r.profile, p);
  if (retry > 0 && r.games.some((g) => (g.ranked == null || g.mmr == null) && g.ranked !== false && Date.now() - g.at < 600_000)) setTimeout(() => rlProfile(true, retry - 1).catch(() => {}), 30_000);
  p.at = Date.now(); r.profile = p; store.save(); rlPush();
}
/** Connexion à l'API du jeu (le jeu doit tourner, API activée) ; retente toutes les 10 s tant qu'il tourne. */
function rlConnect() {
  if (rlSock || process.platform !== 'win32') return;
  const r = rl();
  rlTrack = matchTracker({ ids: [...epicAccounts.map((a) => a.id), ...steamAccounts.map((a) => a.id)], name: r.player?.name });
  const sock = nodeNet.connect(RL_PORT, '127.0.0.1');
  const feed = jsonStream((msg) => {
    const res = rlTrack.event(msg);
    // Nouvelle partie : classé ou occa lu dans le journal du jeu (un peu après le début, le temps qu'il l'écrive)
    const cur = rlTrack.match();
    if (cur && cur.guid !== rlLive?.guid) {
      rlLive = { guid: cur.guid, cat: null }; rlPush();
      rlProfile().catch(() => {}); // point de départ pour classer la partie (au plus toutes les 5 min)
      for (const ms of [1500, 8000]) setTimeout(() => readFile(rlLogFile(app.getPath('documents')), 'utf8').then((t) => { const p = playlistFromLog(t.slice(-400_000)); if (p && rlLive?.guid === cur.guid) { rlLive.cat = p.cat; rlPush(); } }).catch(() => {}), ms);
    }
    if (res && rlLive?.cat) res.ranked = rlLive.cat === 'ranked';
    if (rlTrack.player && rlTrack.player.name !== r.player?.name) { r.player = rlTrack.player; store.save(); rlProfile(true).catch(() => {}); }
    if (res) {
      r.games = [res, ...r.games].slice(0, 50); store.save(); rlPush();
      setTimeout(() => rlProfile(true, 5).catch(() => {}), 25_000); // gain de MMR au plus vite : relu toutes les 30 s jusqu'à ce que le profil bouge
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
// Plein écran exclusif : Windows cache tout par-dessus le jeu, et forcer l'overlay faisait sortir Rocket League.
// On ne touche plus au jeu : on prévient (voix tout de suite, notification, message dans le launcher).
async function rlExclusive() {
  const text = await readFile(rlSettingsFile(app.getPath('documents')), 'utf8').catch(() => null);
  return text != null && Boolean(borderlessIni(text));
}
// N'importe quel jeu en plein écran exclusif (DirectX) : Windows le signale par SHQueryUserNotificationState = 3
const QUNS_PS = "if (-not ('HL.Qn' -as [type])) { Add-Type -Namespace HL -Name Qn -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern int SHQueryUserNotificationState(out int s);' }; $s = 0; [void][HL.Qn]::SHQueryUserNotificationState([ref]$s); $s";
async function exclusiveFs() {
  if (process.platform !== 'win32') return false;
  return (await ps(QUNS_PS, 4000).catch(() => '')).trim() === '3';
}
function warnFullscreen(game = currentSession()?.name ?? 'Le jeu') {
  const rlg = /rocket league/i.test(game);
  const msg = `${game} est en plein écran : passe-le en « Fenêtré » ou « Plein écran fenêtré » (${rlg ? 'Options › Vidéo › Mode d’affichage' : 'dans ses options vidéo'}) pour voir l’overlay.`;
  speakRaw(`Passe ${game} en plein écran fenêtré pour voir l’overlay.`, store.data.settings.voiceName);
  notify(`Overlay : mets ${game} en fenêtré`, msg);
  if (win && !win.isDestroyed()) win.flashFrame(true);
  send('rl:fullscreen', msg);
}
// Overlays seulement sur le jeu : cachés dès qu'une autre fenêtre est devant (Discord, navigateur…), remis au premier
// plan en continu quand le jeu est devant (son plein écran repasse devant sinon). Fermés quand le jeu se ferme.
const FG_PS = "if (-not ('HL.Fg' -as [type])) { Add-Type -Namespace HL -Name Fg -MemberDefinition '[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);' }; $p = 0; [void][HL.Fg]::GetWindowThreadProcessId([HL.Fg]::GetForegroundWindow(), [ref]$p); (Get-Process -Id $p).Path";
let fgBusy = false;
setInterval(async () => {
  const wins = [overlay, rlOv].filter((w) => w && !w.isDestroyed());
  if (!wins.length || fgBusy || process.platform !== 'win32') return;
  const s = currentSession();
  if (!s) { if (overlay && !overlay.isDestroyed()) toggleOverlay(); if (rlOv && !rlOv.isDestroyed()) rlOv.hide(); return; }
  fgBusy = true;
  const fg = (await ps(FG_PS, 3000).catch(() => '')).trim().toLowerCase();
  fgBusy = false;
  const dir = items.find((i) => i.id === s.id)?.installDir?.toLowerCase();
  const onGame = !fg || !dir || fg.startsWith(dir);
  for (const w of wins) {
    if (w.isDestroyed()) continue;
    if (!onGame) { if (w.isVisible()) w.hide(); continue; }
    if (w === rlOv && !/rocket league/i.test(s.name ?? '')) { if (w.isVisible()) w.hide(); continue; }
    if (!w.isVisible()) w.showInactive(); // jamais remis devant de force : ça faisait sortir le jeu de son écran
  }
}, 1000);
async function toggleRlOverlay(auto = false) {
  if (rlOv && !rlOv.isDestroyed()) { if (auto) return; rlOv.close(); rlOv = null; return; }
  if (!/rocket league/i.test(currentSession()?.name ?? '')) { notify('Rocket League n’est pas lancé', 'L’overlay Rocket League (Ctrl+Alt+I) s’affiche seulement sur le jeu.'); return; }
  if (await rlExclusive() || await exclusiveFs()) { if (!auto) warnFullscreen(); return; }
  rlOv = new BrowserWindow({
    width: 264, height: 340, ...ovPlace('rl', 264), frame: false, transparent: true, resizable: false,
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

// ---------- Overlays en jeu : glissés où on veut (position gardée), forme au choix (carte, barre, mini), Spotify en un clic ----------
const OV_STYLES = { fps: ['card', 'bar', 'mini'], rl: ['card', 'bar'] };
const ovKey = (e) => { const w = BrowserWindow.fromWebContents(e.sender); return w && w === overlay ? ['fps', w] : w && w === rlOv ? ['rl', w] : [null, null]; };
function ovPlace(key, w) {
  const p = store.data.ovPos?.[key]; const area = screen.getPrimaryDisplay().workArea;
  const seen = p && screen.getAllDisplays().some(({ workArea: a }) => p.x >= a.x - 20 && p.y >= a.y - 20 && p.x < a.x + a.width - 40 && p.y < a.y + a.height - 40);
  return seen ? { x: p.x, y: p.y } : { x: area.x + area.width - w - 16, y: area.y + 16 };
}
// Glisser à la souris : position de départ + déplacement, gardée au lâcher
let ovFrom = null;
ipcMain.on('ov:drag', (e, phase, dx, dy) => {
  const [key, win] = ovKey(e); if (!win || win.isDestroyed()) return;
  if (phase === 'start') ovFrom = win.getPosition();
  else if (phase === 'move' && ovFrom) win.setPosition(Math.round(ovFrom[0] + dx), Math.round(ovFrom[1] + dy));
  else if (phase === 'end') { ovFrom = null; const [x, y] = win.getPosition(); (store.data.ovPos ??= {})[key] = { x, y }; store.save(); }
});
// La fenêtre suit la taille de la carte (forme choisie, flèche des dernières parties…)
ipcMain.on('ov:size', (e, w, h) => {
  const [, win] = ovKey(e); if (!win || win.isDestroyed()) return;
  const width = Math.min(1200, Math.max(60, Math.round(Number(w) || 0))); const height = Math.min(1000, Math.max(36, Math.round(Number(h) || 0)));
  // Reste dans l'écran quand il grandit (plus grand, forme carte, flèche ouverte)
  const b = win.getBounds(); const a = screen.getDisplayMatching(b).workArea;
  win.setBounds({ x: Math.max(a.x, Math.min(b.x, a.x + a.width - width)), y: Math.max(a.y, Math.min(b.y, a.y + a.height - height)), width, height });
});
// Taille (− / +) : gardée par overlay
ipcMain.on('ov:zoom', (e, z) => { const [key] = ovKey(e); if (key && Number.isFinite(Number(z))) { (store.data.ovZoom ??= {})[key] = Math.min(1.6, Math.max(0.7, Number(z))); store.save(); } });
ipcMain.on('ov:style', (e, style) => {
  const [key] = ovKey(e); if (!key || !OV_STYLES[key].includes(style)) return;
  (store.data.ovStyle ??= {})[key] = style; store.save();
  if (key === 'rl') rlPush();
});
ipcMain.on('ov:spotify', () => { shell.openExternal('spotify:').catch(() => shell.openExternal('https://open.spotify.com')); });

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
      child = spawn(exe, parseArgs(store.data.items[item.id]?.args), { cwd: path.dirname(exe), env: directEnv(item), detached: true, stdio: 'ignore' });
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

ipcMain.handle('gameUpdate:progress', async (_e, id) => {
  const item=items.find(i=>i.id===id);
  if(!item)return {error:'Jeu introuvable.'};
  try { const result=await readUpdateProgress(item);if(result.phase==='done'&&item.updatePending){item.updatePending=false;send('lib:update',library());}return result; }
  catch(e){return {error:e.message};}
});
// Mods d'un jeu : fichiers des dossiers mods / plugins ; désactiver = renommer en .disabled (réversible)
const MOD_DIRS = ['mods', 'Mods', 'plugins', 'BepInEx/plugins', 'addons', 'MelonLoader/Mods'];
async function modsOf(item) {
  const out = [];
  for (const d of MOD_DIRS) {
    const dir = path.join(item.installDir, d);
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith('.')) continue;
      out.push({ dir: d, name: e.name.replace(/\.disabled$/, ''), on: !e.name.endsWith('.disabled') });
    }
  }
  return out.slice(0, 300);
}
const GIFT_NAMES = { citrouille: '🎃 Citrouille', couronne: '👑 Couronne', flamme: '🔥 Flamme', coeur: '💛 Cœur', trophee: '🏆 Trophée', fantome: '👻 Fantôme' };
ipcMain.handle('friend:gift', (_e, to, item) => social('/api/compte/cadeau-ami', { to: String(to), item: String(item) }));
ipcMain.handle('mods:list', async (_e, id) => { const item = items.find((i) => i.id === id); return item?.installDir ? modsOf(item) : []; });
ipcMain.handle('mods:toggle', async (_e, id, dir, name, on) => {
  const item = items.find((i) => i.id === id);
  if (!item?.installDir || !MOD_DIRS.includes(dir) || /[\\/]|\.\./.test(String(name))) return { ok: false };
  const base = path.join(item.installDir, dir, String(name));
  await rename(on ? `${base}.disabled` : base, on ? base : `${base}.disabled`);
  return { ok: true, mods: await modsOf(item) };
});
ipcMain.handle('gameUpdate:downloads', () => runSilentSteam(['steam://downloads']));

const RISKY_TOOLS = /cheat ?engine|artmoney|wemod|x64dbg|x32dbg|ollydbg|processhacker|systeminformer|ida64|extreme ?injector|dnspy|autohotkey|scylla/i;
async function doAction(id, action) {
  const item = items.find((i) => i.id === id); // jamais une commande venue de l'interface : seulement nos éléments
  if (!item) throw new Error('élément inconnu');
  if (action === 'folder' && item.installDir) return shell.openPath(item.installDir).then(() => ({ ok: true }));
  if (action === 'store' && item.source === 'steam') return openLink(steamActions(item.steamId).store).then(() => ({ ok: true }));
  // Réparer avec la plateforme : Steam / Epic revérifient chaque fichier et retéléchargent ce qui est abîmé
  // Vider le cache de shaders de ce jeu seulement (Steam) : il se recrée, les premières minutes peuvent saccader
  if (action === 'cache' && item.source === 'steam' && item.steamLibrary) {
    const dir = path.join(item.steamLibrary, 'shadercache', String(item.steamId));
    const { bytes } = await folderSize(dir);
    if (!bytes) return { ok: true, freed: 0 };
    if (!(await confirm(`Vider le cache de ${item.name} ?`, `${(bytes / 1e6).toFixed(0)} Mo de cache de shaders seront supprimés. Il se recrée tout seul : les premières minutes de jeu peuvent saccader.`))) return { ok: false };
    await rm(dir, { recursive: true, force: true });
    return { ok: true, freed: bytes };
  }

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
    // Contrôle parental : limite du jour atteinte → code PIN demandé (déverrouillé 1 h)
    const set = store.data.settings;
    if (set.parental && set.pin && set.dailyLimit > 0 && item.kind === 'game' && todayGameMinutes(store.data.days) >= set.dailyLimit && Date.now() > (store.data.parentalUntil ?? 0)) throw new Error('limite du jour atteinte (contrôle parental) : code PIN demandé');
    // Anti-triche : un outil connu pour faire bannir tourne en même temps → on prévient avant de jouer
    if (antiCheat) { const risky = (await runningPaths().catch(() => [])).map((p) => path.basename(p)).filter((n) => RISKY_TOOLS.test(n)); if (risky.length) notify('⚠ Risque de ban', `${[...new Set(risky)].join(', ')} tourne : ferme-le avant de jouer à ${item.name}, l’anti-triche peut te bannir.`); }
    for (const way of launchPlan(item, { direct: store.data.settings.directLaunch !== false, memo, antiCheat })) {
      if (way === 'exe') {
        const exe = item.exe ?? await findExe(item.installDir);
        if (!exe) continue;
        if (!item.source || !['steam', 'epic'].includes(item.source)) {
          if (store.data.items[item.id]?.args) { spawn(exe, parseArgs(store.data.items[item.id].args), { cwd: path.dirname(exe), detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); gameMode(item); return { ok: true }; }
          const err = await shell.openPath(exe);
          if (err) throw new Error(err);
          gameMode(item);
          return { ok: true };
        }
        if (await startDirect(item, exe)) { remember(item.id, 'direct'); gameMode(item); return { ok: true, direct: true }; }
        remember(item.id, 'client'); // ce jeu a besoin de sa plateforme : on ne réessaiera plus en direct
        continue;
      }
      if (item.source === 'steam' && await runSilentSteam(['-applaunch', item.steamId, ...parseArgs(store.data.items[item.id]?.args)])) { gameMode(item); return { ok: true }; }
      if (item.source === 'epic') return openLink(epicActions(item.epicKey).launch).then(() => { gameMode(item); return { ok: true }; });
    }
    throw new Error('exécutable introuvable');
  }

  if (action === 'update' && item.source === 'steam') {
    // Demande de téléchargement uniquement : ne jamais utiliser -applaunch ici.
    const before = await readUpdateProgress(item);
    if(before.phase === 'done')return {ok:true};
    if (await runSilentSteam(updateCommand(item))) return { ok: true };
    throw new Error('Plateforme de téléchargement introuvable');
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
    lastVerify = { id, result };
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
// Réparation faite par History (sans ouvrir Steam) : nos fichiers abîmés sont retirés, le jeu est marqué « à mettre à jour »,
// puis Steam (relancé en arrière-plan, sans fenêtre) re-télécharge seulement ces fichiers ; l'avancement s'affiche dans History.
let lastVerify = null;
async function repairSteam(item) {
  const r = lastVerify?.id === item.id ? lastVerify.result : null;
  if (!r) throw new Error('lance d’abord la vérification');
  if ((await runningGameExes(item).catch(() => [])).length) throw new Error(`ferme ${item.name} d’abord`);
  const base = path.resolve(item.installDir);
  let removed = 0;
  for (const f of [...(r.corrupt ?? []), ...(r.sizes ?? [])].filter((x) => !x.startsWith('Il manque'))) {
    const full = path.resolve(base, ...String(f).split('/'));
    if (!full.startsWith(base + path.sep)) continue; // jamais en dehors du dossier du jeu
    await rm(full, { force: true }).catch(() => {}); removed++;
  }
  if (!item.manifest || !/appmanifest_\d+\.acf$/i.test(item.manifest)) throw new Error('fiche Steam introuvable');
  // Steam ouvert : fermé proprement le temps de modifier sa fiche (il réécrit ses fiches en tournant), puis relancé sans fenêtre
  const steamOn = async () => (await runningPaths(0).catch(() => [])).some((p) => /\\steam\.exe$/i.test(p));
  const exe = await steamExe();
  if (await steamOn() && exe) { spawn(exe, ['-shutdown'], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); for (let i = 0; i < 30 && await steamOn(); i++) await new Promise((res) => setTimeout(res, 1000)); }
  const acf = await readFile(item.manifest, 'utf8');
  await writeFile(`${item.manifest}.history-bak`, acf);
  await writeFile(item.manifest, acf.replace(/("StateFlags"\s*")\d+(")/, (_m, a, b) => `${a}6${b}`)); // 6 = installé + mise à jour à faire
  item.updatePending = true;
  await runSilentSteam([]);
  return { ok: true, removed, missing: (r.missing ?? []).length, track: true };
}
ipcMain.handle('verify:repair', async (_e, id) => {
  const item = items.find((i) => i.id === String(id));
  if (!item) return { ok: false, error: 'élément inconnu' };
  if (item.source === 'steam') return repairSteam(item).catch((err) => ({ ok: false, error: err.message }));
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
  if (process.platform !== 'win32') return false;
  const dir = String(item.installDir ?? '').toLowerCase().replace(/\\+$/, '');
  const parts = dir.split('\\').filter(Boolean).length;
  // Jamais un disque ou un dossier système entier (D:\Fortnite est accepté) : seulement les programmes du jeu
  const safeDir = parts >= 3 || (parts === 2 && !/^[a-z]:\\(program files|windows|users|programdata)/.test(dir)) ? dir : '';
  // Jeux avec anti-triche : Windows cache leur chemin, on les reconnaît par le nom de leurs .exe
  const names = (await runningGameExes(item).catch(() => [])).map((n) => n.replace(/\.exe$/i, ''));
  if (!safeDir && !names.length) return false;
  // Données passées en base64 : rien ne peut casser le script. D'abord comme la croix de la fenêtre (le jeu enregistre),
  // puis de force si le jeu tient encore après 5 s ; on vérifie à la fin qu'il est vraiment fermé.
  const arg = Buffer.from(JSON.stringify({ d: safeDir, n: names }), 'utf8').toString('base64');
  const out = await ps(`$a = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${arg}')) | ConvertFrom-Json
$ids = @(Get-Process | Where-Object { ($_.Path -and $a.d -and $_.Path.ToLower().StartsWith($a.d + '\\')) -or (-not $_.Path -and @($a.n) -contains $_.ProcessName.ToLower()) } | ForEach-Object { $_.Id })
if (-not $ids.Count) { 'aucun'; return }
$alive = { @($ids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }) }
foreach ($i in $ids) { try { [void](Get-Process -Id $i).CloseMainWindow() } catch {} }
for ($t = 0; $t -lt 10 -and (& $alive).Count; $t++) { Start-Sleep -Milliseconds 500 }
foreach ($i in (& $alive)) { Stop-Process -Id $i -Force -ErrorAction SilentlyContinue; & taskkill.exe /PID $i /F /T 2>$null | Out-Null }
Start-Sleep -Milliseconds 800
if ((& $alive).Count) { 'reste' } else { 'ferme' }`, 30_000).catch(() => '');
  return out.includes('ferme');
}

ipcMain.handle('lib:scan', () => scan());
ipcMain.handle('item:action', (_e, id, action) => doAction(String(id), String(action)).catch((err) => ({ ok: false, error: err.message })));
ipcMain.handle('item:set', (_e, id, patch) => {
  const entry = (store.data.items[String(id)] ??= {});
  if ('favorite' in patch) entry.favorite = Boolean(patch.favorite);
  if ('hidden' in patch) entry.hidden = Boolean(patch.hidden);
  if ('args' in patch) entry.args = parseArgs(patch.args).length ? String(patch.args).replace(/[\r\n]/g, ' ').slice(0, 300) : undefined;
  if ('mergeWith' in patch) { entry.mergeWith = patch.mergeWith ? String(patch.mergeWith).slice(0, 120) : undefined; remerge().then(() => send('lib:update', library())).catch(() => {}); }
  store.save();
  return entry;
});
ipcMain.handle('notebook:get', (_e, id) => validGameId(id) ? store.data.notebooks?.[id] ?? {} : {});
ipcMain.handle('notebook:set', (_e, id, value) => {
  if (!validGameId(id)) return { error: 'Jeu inconnu.' };
  try {
    const note = cleanNotebook(value);
    store.data.notebooks ??= {};
    store.data.notebooks[id] = note; store.save(); return { ok: true, note };
  } catch (error) { return { error: error.message }; }
});
ipcMain.handle('support:diagnostic', async () => {
  // Analyse du PC jointe à la demande : le support voit tout de suite le matériel, la santé et les températures
  const d = diagCache?.data ?? await Promise.race([runDiag().catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))]);
  const gpu = d?.gpus?.find((g) => !/intel|uhd|iris/i.test(g.name)) ?? d?.gpus?.[0];
  const temps = store.data.temps ?? []; const max = (k) => Math.max(0, ...temps.map((t) => t[k] ?? 0)) || null;
  const sys = d?.volumes?.find((v) => v.letter === 'C');
  const pc = { cpu: d?.cpu?.name, gpu: gpu?.name, driver: gpu?.driver, windows: d?.os?.name && `${d.os.name} (${d.os.build})`, uptimeDays: d?.os?.uptimeDays, health: store.data.healthLast?.score, cpuTempMax: max('cpuT'), gpuTempMax: max('gpuT'), diskFreeGB: sys ? Math.round(sys.free / 1073741824) : null };
  return { version: app.getVersion(), platform: process.platform, release: os.release(), arch: process.arch, memoryGB: Math.round(os.totalmem() / 1073741824), games: raw.filter((i) => i.kind === 'game').length, apps: raw.filter((i) => i.kind === 'app').length, ...Object.fromEntries(Object.entries(pc).filter(([, v]) => v != null && v !== '')) };
});
ipcMain.handle('support:list', async () => {
  const token = secret('account');
  if (!token) return { error: 'Connecte-toi dans Compte & sauvegarde pour voir tes demandes.' };
  return api('/api/compte/support', { token }).catch(() => ({ error: 'Serveur injoignable. Réessaie.' }));
});
ipcMain.handle('support:send', async (_e, body) => {
  const token = secret('account');
  if (!token) return { error: 'Connecte-toi dans Compte & sauvegarde pour envoyer un signalement.' };
  if (JSON.stringify(body ?? {}).length > 1900000) return { error: 'Capture trop volumineuse.' };
  return api('/api/compte/support', { token, method: 'POST', body }).catch(() => ({ error: 'Serveur injoignable. Réessaie.' }));
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
  if ('home' in patch) store.data.settings.home = cleanHome(patch.home);
  if ('neon' in patch) store.data.settings.neon = Math.max(0, Math.min(100, Number(patch.neon) || 0));
  if ('themeColor' in patch && /^#[0-9a-f]{6}$/i.test(patch.themeColor)) store.data.settings.themeColor = patch.themeColor;
  if ('bgMode' in patch && ['jeu', 'anime', 'sobre'].includes(patch.bgMode)) store.data.settings.bgMode = patch.bgMode;
  if ('season' in patch) store.data.settings.season = patch.season === 'off' ? 'off' : 'auto';
  if ('season' in patch) { win?.setIcon(icon()); tray?.setImage(nativeImage.createFromPath(icon()).resize({ width: 16, height: 16 })); }
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
  if ('theme' in patch && ['bleu', 'violet', 'rouge', 'vert', 'orange', 'rose', 'auto', 'perso'].includes(patch.theme)) store.data.settings.theme = patch.theme;
  if ('dealAlerts' in patch) store.data.settings.dealAlerts = Boolean(patch.dealAlerts);
  if ('gameMode' in patch) store.data.settings.gameMode = Boolean(patch.gameMode);
  if ('directLaunch' in patch) store.data.settings.directLaunch = Boolean(patch.directLaunch);
  if ('preloadSteam' in patch) store.data.settings.preloadSteam = Boolean(patch.preloadSteam);
  if ('nightUpdates' in patch) store.data.settings.nightUpdates = Boolean(patch.nightUpdates);
  if ('quietGames' in patch) store.data.settings.quietGames = Boolean(patch.quietGames);
  if ('voiceReply' in patch) store.data.settings.voiceReply = Boolean(patch.voiceReply);
  if ('voiceName' in patch) store.data.settings.voiceName = String(patch.voiceName ?? '').slice(0, 80);
  if ('phone' in patch) store.data.settings.phone = Boolean(patch.phone);
  if ('remote' in patch) { store.data.settings.remote = Boolean(patch.remote); setRemote(); }
  try {
    if ('steamKey' in patch) setSecret('steam', patch.steamKey);
    if ('gridKey' in patch) { setSecret('grid', patch.gridKey); store.data.art = {}; }
    if ('geminiKey' in patch) setSecret('gemini', patch.geminiKey);
  } catch (err) {
    return { ...(await publicSettings()), error: err.message };
  }
  store.save();
  if ('autostart' in patch) applyAutostart();
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
    const n = new Notif({ title: '🎁 Jeu gratuit sur Epic', body: `${g.name} est offert${g.until ? ` jusqu’au ${new Date(g.until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}` : ''} : il reste à toi pour toujours.`, icon: icon() });
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
  const prem = url && String(url).match(/^history:\/\/premium\/(ia|opti|pack)\/?$/i)?.[1];
  if (prem) { showWindow(); setTimeout(() => send('premium:open', prem.toLowerCase()), 800); return; }
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
      const n = new Notif({ title: `${d.name} : -${d.pct} %`, body: `En promo sur Steam${d.price ? ` à ${d.price}` : ''} (dans ta liste de souhaits)`, icon: icon() });
      n.on('click', () => openLink(`https://store.steampowered.com/app/${d.appid}`).catch(() => {}));
      n.show();
    }
  }
  for (const g of deals.released ?? []) logNotif({ id: `sortie-${g.appid}`, kind: 'app', icon: '🚀', title: `${g.name} est sorti !`, body: 'Un jeu de ta liste de souhaits Steam vient de sortir.' });
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
let notifHeight = 0;
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
  const h = Math.min(area.height - 16, notifHeight || Math.min(4, notifCards.length) * 150 + 24);
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
function bubbleMsg(x, forceReply = false) {
  const st = store.data.settings;
  if (!forceReply && (st.msgBubble === false || st.friendNotifs === false || st.dnd || gameDnd() || streaming())) return false; // mode tournoi : la bulle des messages passe quand même
  if (!forceReply && win && !win.isDestroyed() && win.isVisible() && win.isFocused()) return false;
  const group = x.type === 'gmsg';
  const key = group ? `g:${x.gid}` : `f:${x.from}`;
  const f = (socialLive?.amis ?? []).find((a) => a.id === x.from);
  const g = group ? (socialLive?.groupes ?? []).find((y) => y.id === x.gid) : null;
  const m = { pseudo: x.pseudo ?? f?.pseudo ?? '?', text: String(x.text ?? '').slice(0, 500) };
  if (bubble?.key === key) bubble.msgs = [...bubble.msgs, m].slice(-3);
  else if (!bubbleTyping) bubble = { key, from: x.from, gid: x.gid ?? null, title: group ? (g?.name ?? x.group ?? 'Groupe') : m.pseudo, group, avatar: group ? null : f?.avatar ?? null, color: f?.color ?? '#3b82f6', msgs: [m] };
  else return false; // en train de répondre à quelqu'un d'autre : la carte classique prend le relais
  clearTimeout(bubbleFree);
  const data = { ...bubble, openReply: forceReply, sound: st.sfxNotif !== false, vol: (st.sfxVol ?? 60) / 100 };
  if (!bubbleWin || bubbleWin.isDestroyed()) {
    bubbleWin = new BrowserWindow({
      width: 340, height: bubbleH, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false, hasShadow: false,
      webPreferences: { preload: path.join(here, 'bubble.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    bubbleWin.setAlwaysOnTop(true, 'screen-saver');
    bubbleWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    bubbleWin.webContents.on('will-navigate', (e) => e.preventDefault());
    // Le brouillon reste ouvert lorsque le jeu reprend le focus.
    bubbleWin.loadFile(path.join(here, 'ui', 'bubble.html'));
    bubbleWin.webContents.once('did-finish-load', () => { if (!bubble) return; bubblePlace(); bubbleWin.webContents.send('bubble:data', { ...bubble, openReply: data.openReply, sound: data.sound, vol: data.vol }); bubbleWin.showInactive(); });
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
ipcMain.handle('bubble:open', (e) => { if (e.sender!==bubbleWin?.webContents || !bubble || bubbleWin.isDestroyed()) return false; bubbleTyping = true; clearTimeout(bubbleTimer); bubbleWin.setFocusable(true); bubbleWin.show(); bubbleWin.focus(); return true; });
ipcMain.on('bubble:close', () => bubbleHide());
ipcMain.on('bubble:app', () => { const b = bubble; bubbleHide(); if (!b) return; showWindow(); if (b.group) send('group:open', { id: b.gid }); else send('chat:open', { id: b.from }); });
ipcMain.handle('bubble:reply', async (e, text, key) => {
  if (e.sender!==bubbleWin?.webContents || !bubble || key!==bubble.key) return { ok: false, error: 'Discussion fermée ou remplacée.' };
  const target={...bubble};text=String(text??'').trim().slice(0,500);if(!text)return {ok:false,error:'Écris un message.'};
  const id = target.key.slice(2);
  const cid = randomUUID();
  const r = target.group ? await sendReliable('/api/compte/groupes/messages', { id: CIDM(id), text: String(text).slice(0, 500), cid }) : await sendReliable('/api/compte/messages', { to: FID(id), text: String(text).slice(0, 500), cid });
  if (r.error) return { ok: false, error: r.error };
  send('social:sent', { key: target.key, fil: r.fil ?? null });
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
ipcMain.on('notif:size', (e,h) => { if(e.sender!==notifWin?.webContents||!Number.isFinite(h))return;const next=Math.max(90,Math.ceil(h));if(next!==notifHeight){notifHeight=next;notifSync();} });
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
  if(action==='reply' && (c.from || c.gid)) {
    const shown=bubbleMsg({type:c.gid?'gmsg':'msg',from:c.from,gid:c.gid,pseudo:c.title,text:c.body},true);
    if(!shown)notify('Réponse en cours','Termine ou ferme la réponse déjà ouverte en haut à droite.');
    return;
  }
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
    if (x.type === 'gift') { logNotif({ id: `gift-${x.id}`, kind: 'app', icon: '🎁', title: `${x.pseudo ?? 'Un ami'} t’a offert un cadeau`, body: `${GIFT_NAMES[x.item] ?? 'Un cadeau'} : il s’affiche maintenant sur ta carte de profil.` }); continue; }
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
ipcMain.handle('friend:invite', (_e, fid, type, game) => social('/api/compte/inviter', { to: FID(fid), type: type === 'invite' ? 'invite' : 'ask', ...(type === 'invite' ? { game: (items.find((i) => i.name === game)?.name ?? currentSession()?.name) || undefined } : {}) }));
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
      const n = new Notif({ title: `${e.game} dans ${Math.max(1, Math.round(soon / 60_000))} min`, body: game ? 'Clique pour lancer le jeu.' : `Soirée organisée par ${e.organisateur}.`, icon: icon() });
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
  if (!(await premium()).ia) return { reply: 'L’assistant fait partie de ⭐ History IA (2,49 € par mois) : ouvre Premium pour l’activer.', action: 'premium', value: 'ia' };
  const np = await nowPlaying().catch(() => null);
  const c = understand(stripWake(clean) ?? clean, items, { music: np });
  if (c.action === 'close' && !c.itemId) {
    const cur = currentSession();
    Object.assign(c, cur ? { itemId: cur.id, reply: `Je ferme ${cur.name}.` } : { action: 'answer', reply: 'Aucun jeu en cours à fermer : dis-moi lequel (« ferme Rocket League »).' });
  }
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
        // « ferme le jeu » sans nom : le jeu en cours ; un échec est dit tel quel (plus de « je ferme » sans effet)
        const cur = !r.target && r.action === 'close' ? currentSession() : null;
        const item = r.target ? items.find((i) => norm(i.name) === norm(r.target)) ?? findByName(items, r.target) : cur ? items.find((i) => i.id === cur.id) : null;
        if (['launch', 'close', 'install', 'verify', 'uninstall', 'folder', 'store'].includes(r.action)) {
          if (!item) out.reply = r.target ? `Je ne trouve pas « ${r.target} » dans ta bibliothèque.` : 'Aucun jeu en cours à fermer : dis-moi lequel.';
          else {
            out.itemId = item.id;
            const done = await doAction(item.id, r.action).catch((err) => ({ ok: false, error: err.message }));
            if (done?.ok === false) out.reply = done.error ? `${item.name} : impossible (${done.error}).` : 'D’accord, j’annule.';
          }
        }
      } catch (err) {
        out = { reply: `Je n’arrive pas à joindre l’IA (${err.message}).`, action: 'none' };
      }
    }
  }
  if (voice) speak(out.reply);
  return out;
}
ipcMain.handle('ai:ask', (_e, message) => { (store.data.gains ??= {}).ia = (store.data.gains.ia ?? 0) + 1; return runCommand(message); });

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
let API = (process.env.HL_API || 'https://vercel-ia.onrender.com').replace(/\/+$/, '');
if (!process.env.HL_API) {
  // Adresse du serveur modifiable sans nouvelle version (changement d'hébergeur) : launcher-site/api.json.
  // Seulement en https et chez un hébergeur connu.
  fetch('https://zyko144.github.io/vercel-ia-/api.json', { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    const u = String(j?.api ?? '').replace(/\/+$/, '');
    if (/^https:\/\/[\w.-]+\.(onrender\.com|vercel\.app|fly\.dev|railway\.app|koyeb\.app|up\.railway\.app)$/.test(u)) API = u;
  }).catch(() => {});
}
// ⭐ Premium (packs IA / Opti) : le serveur décide (table Supabase « premium »), relu au plus toutes les minutes,
// donc un premium ajouté à la main marche tout de suite, sans mise à jour. Version développeur et démo : tout est ouvert.
let premCache = { at: 0, v: { ia: false, opti: false } };
async function premium() {
  if (process.env.LAUNCHER_DEMO) return { ia: true, opti: true, dev: true, code: 'AMI-7KQ2PX', trialUsed: true };
  if (Date.now() - premCache.at < 60_000) return premCache.v;
  const token = secret('account');
  const r = token ? await api('/api/compte/premium', { token }).catch(() => null) : { status: 401 };
  if (r) premCache = { at: Date.now(), v: r.status === 200 ? { ia: Boolean(r.ia), opti: Boolean(r.opti), until: r.until, news: r.news, code: r.code, trialUsed: r.trialUsed } : { ia: false, opti: false } };
  return premCache.v;
}
ipcMain.handle('premium:get', async (_e, fresh) => {
  if (fresh) premCache.at = 0;
  const p = { ...(await premium()), logged: Boolean(secret('account')) };
  delete premCache.v.news; // réponse du chef montrée une seule fois
  return p;
});
ipcMain.handle('premium:buy', (_e, pack, price) => {
  if (!['ia', 'opti', 'pack'].includes(pack)) return { ok: false };
  const p = String(price ?? '').replace(',', '.').match(/^\d{1,3}\.\d{2}/)?.[0] ?? { ia: '2.49', opti: '2.49', pack: '3.99' }[pack]; // prix calculé par le serveur (promo, code ami, 1 an)
  return shell.openExternal(`https://paypal.me/zyko921/${p}EUR`).then(() => ({ ok: true }));
});
// « J'ai payé » : le serveur poste la demande dans #paiement-verif ; le Premium arrive quand le chef valide
ipcMain.handle('premium:note', (_e, pack, code = '', gift = false, annual = false) => {
  const token = secret('account');
  if (!token) return { error: 'Connecte-toi à ton compte History (Paramètres › Compte) pour acheter.' };
  return api('/api/compte/premium/note', { method: 'POST', token, body: { pack: String(pack), code: String(code).slice(0, 20), gift: Boolean(gift), annual: Boolean(annual) } }).catch(() => ({ error: 'Serveur injoignable, réessaie dans une minute.' }));
});
// Essai gratuit 3 jours et carte cadeau : le serveur active, l'appli relit le Premium
ipcMain.handle('premium:trial', async () => { const token = secret('account'); if (!token) return { error: 'Connecte-toi à ton compte History.' }; const r = await api('/api/compte/premium/essai', { method: 'POST', token, body: {} }).catch(() => ({ error: 'Serveur injoignable.' })); premCache.at = 0; return r; });
ipcMain.handle('premium:redeem', async (_e, code) => { const token = secret('account'); if (!token) return { error: 'Connecte-toi à ton compte History.' }; const r = await api('/api/compte/premium/cadeau', { method: 'POST', token, body: { code: String(code ?? '').slice(0, 30) } }).catch(() => ({ error: 'Serveur injoignable.' })); premCache.at = 0; return r; });
ipcMain.handle('premium:claim', async (_e, pack, paypal, shot) => {
  const token = secret('account');
  if (!token) return { error: 'Connecte-toi à ton compte History (Paramètres › Compte) pour acheter.' };
  return api('/api/compte/premium/demande', { method: 'POST', token, body: { pack: String(pack), paypal: String(paypal ?? '').slice(0, 120), shot: /^data:image\/jpeg;base64,/.test(String(shot ?? '')) && String(shot).length < 1_600_000 ? shot : null } }).catch(() => ({ error: 'Serveur injoignable, réessaie dans une minute.' }));
});
async function api(pathname, { method = 'GET', body, token, timeout = 20_000 } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-History-Version': app.getVersion(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ...data };
}
// Avis sur l'appli (note, commentaire, capture facultative) : affichés sur le site
ipcMain.handle('review:send', async (_e, stars, comment, img) => {
  const token = secret('account');
  if (!token) return { error: 'Connecte-toi à ton compte History (Paramètres › Compte) pour donner ton avis.' };
  const pic = /^data:image\/(png|jpeg|webp);base64,/.test(String(img ?? '')) && String(img).length < 1_900_000 ? img : null;
  return api('/api/avis?app=launcher', { method: 'POST', token, body: { stars: Number(stars), comment: String(comment ?? '').slice(0, 500), img: pic } }).catch(() => ({ error: 'Serveur injoignable, réessaie dans une minute.' }));
});
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
// Connexion par le navigateur : passkey (Windows Hello, téléphone) sur l'appli web, puis le launcher récupère sa session
let devLogin = null;
ipcMain.handle('more:devStart', async () => {
  const r = await api('/api/compte/lien/appareil', { method: 'POST', body: {} }).catch(() => null);
  if (!r?.code) return { error: r?.error ?? 'Serveur injoignable.' };
  devLogin = r.code; shell.openExternal(`https://zyko144.github.io/vercel-ia-/app/#launcher=${r.code}`).catch(() => {});
  return { check: r.check };
});
ipcMain.handle('more:devWait', async () => {
  for (const code = devLogin, end = Date.now() + 5 * 60_000; code === devLogin && Date.now() < end;) {
    const r = await api('/api/compte/lien/appareil/attendre', { method: 'POST', body: { code } }).catch(() => null);
    if (r?.token) { devLogin = null; return loggedIn(r); }
    if (r?.status === 410) break;
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  return { ok: false, error: 'Connexion non validée à temps : réessaie.' };
});
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
ipcMain.handle('account:discordCode', async () => {
  const r = await secu('/api/compte/discord/code', {});
  // QR à scanner avec le téléphone : ouvre directement le salon #lier-son-compte dans Discord
  if (r?.ok) r.qr = await (await import('qrcode')).default.toDataURL('https://discord.com/channels/1554084922665205780/1556408553982402671', { margin: 1, width: 180, color: { dark: '#0b0910', light: '#ffffff' } }).catch(() => null);
  return r;
});
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
    // Une version déjà téléchargée mais pas installée et une plus récente sort : on prend directement la dernière
    // (une seule installation qui rattrape tout, jamais plusieurs à la suite)
    if (updateReady === info.version) return;
    if (updateReady && updateReady !== info.version) { updateReady = null; downloadUpdate(false); return; }
    const fresh = updateInfo.version !== info.version;
    updateState({ state: 'available', version: info.version, error: null });
    // Fenêtre fermée ou rangée : une notification Windows (clic = ouvrir le launcher sur la question)
    if (fresh && (!win || win.isDestroyed() || !win.isVisible()) && Notification.isSupported()) {
      const n = new Notif({ title: `History Launcher v${info.version} disponible`, body: 'Clique pour mettre à jour maintenant (moins d’une minute).', icon: icon() });
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
  const check = () => { if (updateInfo.state === 'progress') return; lastCheck = Date.now(); updater.checkForUpdates().catch((err) => fatalLog(err)); };
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
      const n = new Notif({ title: `💸 ${a.name} à ${now.price.toFixed(2).replace('.', ',')} €`, body: `Sous ton prix de ${a.target} €${now.discount ? ` (-${now.discount} %)` : ''}. Clique pour ouvrir la page Steam.`, icon: icon() });
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
  sess.samples.push({ gpu: snap?.gpu?.usage ?? null, core: c.max, cpu: c.avg, ram: snap?.ram ? Math.round((100 * snap.ram.used) / snap.ram.total) : null, gpuT: snap?.gpu?.temp ?? null, cpuT: snap?.cpu?.temp ?? null });
  // Mémoire presque pleine en jeu : on note une fois les programmes qui en prennent le plus (hors jeu)
  if (process.platform === 'win32' && !sess.ramHogs && sess.samples.at(-1).ram >= 85) {
    sess.ramHogs = [];
    ps("Get-Process | Sort-Object WS -Descending | Select-Object -First 8 ProcessName,@{n='MB';e={[int]($_.WS/1MB)}} | ConvertTo-Json -Compress", 8000)
      .then((o) => { const game = String(sess?.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, ''); sess && (sess.ramHogs = [JSON.parse(o)].flat().filter((p) => p.MB >= 500 && !/^(system|memory compression|dwm|explorer|electron|history.?launcher)$/i.test(p.ProcessName) && !game.includes(p.ProcessName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6))).slice(0, 3)); }).catch(() => {});
  }
  sess.cpuT = snap?.cpu?.temp ?? sess.cpuT ?? null;
  perfbarPush();
  heatCheck(sess, snap);
}
async function sessionStart(s) {
  // Réglage gratuit : plus aucune bulle Windows pendant les parties (rétablies à la fin)
  if (store.data.settings.quietGames && process.platform === 'win32') windowsToasts(false).then((ok) => { if (sess) sess.quietOwn = ok; }).catch(() => {});
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
  const pm = await ensurePresentMon(path.join(app.getPath('userData'), 'outils')).catch(() => null);
  if (!pm || sess !== me) return;
  // La mesure se relance toute seule : jeu qui redémarre (anti-triche, lanceur), mauvais exe ou plus aucune image
  // depuis 20 s. Avant, une mesure arrêtée laissait le compteur sans FPS jusqu'à la fin de la partie.
  for (let tries = 0; tries < 30 && sess === me; tries++) {
    let exes = [];
    for (let n = 0; n < 24 && sess === me; n++) {
      exes = (await runningGameExes(item).catch(() => [])).filter((x) => !/(crash|report|launcher|helper|updater|redist|unins|webhelper|cefprocess)/i.test(x));
      if (exes.length) break;
      me.fpsState = 'wait'; perfbarPush();
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (sess !== me) return;
    if (!exes.length) { me.fpsState = 'nogame'; perfbarPush(); return; }
    me.fpsState = me.live ? me.fpsState : 'wait'; me.lastLive = Date.now();
    const cap = captureFps(pm, exes, (live) => { if (sess === me) { me.lastLive = Date.now(); me.live = live; me.fpsHist = [...(me.fpsHist ?? []), live.avg].slice(-15); me.fpsState = 'ok'; widgetPush(); perfbarPush(); } });
    me.cap = cap;
    const dog = setInterval(() => { if (sess !== me || Date.now() - me.lastLive > 20_000) cap.stop(); }, 5000);
    const r = await cap.done;
    clearInterval(dog);
    if (r?.error === 'droits') { if (sess === me) { me.fpsState = 'droits'; perfbarPush(); } return; }
    await new Promise((res) => setTimeout(res, 3000));
  }
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
  if (s.quietOwn) windowsToasts(true).catch(() => {});
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
  const tMax = (k) => { const v = s.samples.map((x) => x[k]).filter((x) => x > 0); return v.length ? Math.max(...v) : null; };
  const rec = { at: Date.now(), minutes: Math.round(minutes), gpuTmax: tMax('gpuT'), cpuTmax: tMax('cpuT'), boost: (store.data.boostedAt?.[s.id] ?? 0) >= s.start - 180_000, ...(stats && !stats.error ? { avg: stats.avg, low1: stats.low1, stutters: stats.stutters, cpuBound: stats.cpuBound } : {}), ...(why ? { stutterWhy: why } : {}), gpuAvg: v.gpuAvg, coreMax: v.coreMax, bound: v.bound, driver: store.data.gpuDriverVer ?? null, os: os.release() };
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
  // Première partie mesurée après l'opti du jeu : FPS avant / après, dans la cloche et (anonyme) sur Discord
  const optiAt = store.data.optiAt?.[s.id] ?? 0;
  const before = withAvg.filter((r) => r.at < optiAt), after = withAvg.filter((r) => r.at > optiAt);
  if (optiAt && rec.avg && before.length && after.length === 1) {
    const avant = Math.round(avgOf(before)), optiGain = Math.round(((rec.avg - avant) / avant) * 100);
    if (Math.abs(optiGain) >= 2) bell(`Opti de ${s.name} : ${optiGain > 0 ? '+' : ''}${optiGain} % de FPS`, `${avant} FPS en moyenne avant l’opti, ${rec.avg} maintenant.`);
    if (optiGain >= 3 && store.data.settings.shareActivity !== false) social('/api/compte/gain-opti', { jeu: s.name, avant, apres: rec.avg }).catch(() => {});
  }
  const B = { cpu: 'le processeur limite tes FPS', gpu: 'la carte graphique travaille à fond (normal pour un jeu exigeant)', mixte: 'processeur et carte graphique sont équilibrés' };
  if (s.ramHogs?.length) bell(`${s.name} : mémoire presque pleine`, `Pendant la partie, ${s.ramHogs.map((p) => `${p.ProcessName} (${(p.MB / 1024).toFixed(1).replace('.', ',')} Go)`).join(', ')} prenaient le plus de mémoire. Ferme-les avant de jouer pour gagner en fluidité.`);
  if (rec.gpuTmax || rec.cpuTmax) { const hot = (rec.gpuTmax ?? 0) >= 85 || (rec.cpuTmax ?? 0) >= 90; if (hot) bell(`${s.name} : ça a chauffé`, `Max pendant la partie : ${rec.gpuTmax ? `carte graphique ${rec.gpuTmax} °C` : ''}${rec.gpuTmax && rec.cpuTmax ? ', ' : ''}${rec.cpuTmax ? `processeur ${rec.cpuTmax} °C` : ''}. Historique : clic droit › Outils du jeu.`); }
  if (rec.avg || rec.bound) bell(`${s.name} : ${rec.avg ? `${rec.avg} FPS en moyenne, 1 % low ${rec.low1}` : 'partie terminée'}`, `${rec.bound ? `${B[rec.bound]}.` : ''}${rec.stutters ? ` ${rec.stutters} saccade(s)${why ? ` : ${why}` : ' repérée(s)'}.` : ''}${gain != null && Math.abs(gain) >= 2 ? ` Avec le boost : ${gain > 0 ? '+' : ''}${gain} % de FPS par rapport à sans.` : ''} Détails : clic droit sur le jeu › Outils du jeu.`);
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

// ---------- Mini-launcher : clic sur l'icône History de la barre des tâches ----------
let mini = null;
async function miniData() {
  const games = items.filter((i) => i.kind === 'game' && i.installed);
  const pick = (i) => ({ id: i.id, name: i.name, cover: i.art?.cover ?? i.art?.header ?? null, minutes: i.minutes ?? 0, last: i.lastPlayed ?? 0, update: Boolean(i.updatePending) });
  const pc = await Promise.race([snapshot().catch(() => null), new Promise((r) => setTimeout(() => r(null), 1500))]);
  const friends = friendsCache.data?.friends ?? [], hist = socialLive?.amis ?? [];
  const halloween = new Date().getMonth() === 9 && store.data.settings.season !== 'off';
  return {
    recent: games.slice().sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (b.minutes || 0) - (a.minutes || 0)).slice(0, 5).map(pick),
    all: games.map(pick), health: store.data.healthLast?.score ?? null, cpuT: pc?.cpu?.temp ?? null,
    playing: hist.filter((a) => a.playing).length + friends.filter((f) => f.game).length, online: hist.filter((a) => a.online).length + friends.filter((f) => f.online).length,
    accent: halloween ? '#ff9f43' : store.data.settings.themeColor ?? '#619fff', logo: halloween ? 'halloween/logo.png' : 'logo.png',
  };
}
function toggleMini() {
  if (mini && !mini.isDestroyed() && mini.isVisible()) return mini.hide();
  if (!mini || mini.isDestroyed()) {
    mini = new BrowserWindow({ width: 360, height: 600, frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: '#140d09', icon: icon(),
      webPreferences: { preload: path.join(here, 'mini.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
    mini.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mini.webContents.on('will-navigate', (e) => e.preventDefault());
    mini.on('blur', () => { if (!mini.webContents.isDevToolsOpened()) mini.hide(); }); // se ferme quand on clique ailleurs
    mini.loadFile(path.join(here, 'ui', 'mini.html'));
  }
  // Collé à l'icône, au-dessus de la barre des tâches (ou en dessous si la barre est en haut)
  const b = tray?.getBounds?.() ?? { x: 0, y: 0, width: 0, height: 0 }, area = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea;
  const x = Math.min(Math.max(area.x + 8, Math.round(b.x + b.width / 2 - 180)), area.x + area.width - 368);
  const y = b.y && b.y < area.y + area.height / 2 ? area.y + 8 : area.y + area.height - 608;
  mini.setPosition(x, y);
  mini.show(); mini.focus(); mini.webContents.send('mini:shown');
}
ipcMain.handle('mini:data', () => miniData());
ipcMain.on('mini:size', (_e, h) => {
  if (!mini || mini.isDestroyed()) return;
  const [x, y] = mini.getPosition(), [, oh] = mini.getContentSize(), nh = Math.max(300, Math.min(900, Math.round(Number(h) || 600) + 2));
  const area = screen.getDisplayNearestPoint({ x, y }).workArea, bottom = y + oh > area.y + area.height / 2;
  mini.setContentSize(360, nh); if (bottom) mini.setPosition(x, Math.max(area.y + 8, y + oh - nh)); // reste collé à la barre des tâches
});
ipcMain.on('mini:action', (_e, id, action) => {
  mini?.hide();
  if (action === 'open') return showWindow();
  if (['launch', 'update'].includes(action) && items.some((i) => i.id === id)) doAction(String(id), action).catch(() => {});
});
// ---------- 0.54 : vérifications du PC, revente, réseau, tests, journal, réinstallation ----------
const DEMO_CHECKS = { video: [{ Name: 'NVIDIA GeForce RTX 4070', CurrentRefreshRate: 60, MaxRefreshRate: 165 }], pnp: [], secure: 0, tpm: 'TPM 2.0', mem: [{ DeviceLocator: 'DIMM_A2' }, { DeviceLocator: 'DIMM_B2' }], bios: '20230412000000.000000+000', pcie: '16, 16', vols: [{ DriveLetter: 'C', SizeRemaining: 22e9, Size: 1000e9 }], bsod: ['0x00000116'] };
ipcMain.handle('more:checks', async () => {
  const j = process.env.LAUNCHER_DEMO ? DEMO_CHECKS : process.platform === 'win32'
    ? await new Promise((r) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', CHECKS_PS], { windowsHide: true, timeout: 60_000, maxBuffer: 4e6 }, (_e, out) => { try { r(JSON.parse(out)); } catch { r(null); } }))
    : null;
  if (!j) return { error: 'Vérifications disponibles sur Windows.' };
  const diag = (await runDiag().catch(() => null)) ?? {};
  j.batFull = diag.battery?.full; j.batDesign = diag.battery?.design;
  if (j.batFull) { const d = new Date().toISOString().slice(0, 10); const log = (store.data.batteryLog ??= []); if (log.at(-1)?.d !== d) { log.push({ d, full: j.batFull, design: j.batDesign }); store.data.batteryLog = log.slice(-120); store.save(); } }
  return { list: parseChecks(j, diag), at: Date.now() };
});
ipcMain.handle('more:pc', async () => {
  const d = (await runDiag().catch(() => null)) ?? {};
  const cpu = d.cpu?.name ?? '', gpu = d.gpus?.[0]?.name ?? '';
  const perf = Object.entries(store.data.perf ?? {}).map(([id, r]) => ({ name: items.find((i) => i.id === id)?.name, driver: fpsAround(r, 'driver'), os: fpsAround(r, 'os') })).filter((x) => x.name && (x.driver || x.os)).slice(0, 6);
  return { cpu, gpu, cpuYear: hwYear(cpu), gpuYear: hwYear(gpu), resale: resaleValue({ cpu, gpu, ram: d.ram ?? [], disks: d.disks ?? [], board: d.board ?? '', laptop: Boolean(d.laptop ?? d.battery) }), psu: psuAdvice(gpu, cpu), screen: screenAdvice(gpu), battery: store.data.batteryLog ?? [], tempDays: store.data.tempDays ?? {}, dust: dustDue(store.data.tempDays, store.data.dustAt), dustAt: store.data.dustAt ?? null, perf, laptop: Boolean(d.laptop ?? d.battery) };
});
// ---------- Mon PC › Stockage : tout ce qui prend de la place, trié par taille, et ce qui ne sert plus ----------
let storageLast = null, storageBusy = false;
const storageIcon = async (x) => {
  const lib = x.id && items.find((i) => i.id === x.id);
  if (lib?.art?.icon || lib?.art?.cover) return lib.art.icon ?? lib.art.cover;
  const file = lib ? lib.exe ?? lib.icon : !['folder', 'protected'].includes(x.kind) ? x.path : null;
  if (!file || !/\.(exe|msi|ico|lnk|pdf|docx?|xlsx?|zip|rar|7z|iso|mp4|mkv|mp3|png|jpe?g)$/i.test(file)) return null;
  return app.getFileIcon(file, { size: 'normal' }).then((i) => (i.isEmpty() ? null : i.toDataURL()), () => null);
};
ipcMain.handle('more:storage', async (_e, refresh = false) => {
  if (process.env.LAUNCHER_DEMO) return demoStorage(items);
  if (storageLast && !refresh) return storageLast;
  if (storageBusy) return { busy: true };
  storageBusy = true;
  try {
    const d = diagCache?.data ?? await runDiag().catch(() => null);
    const volumes = (d?.volumes ?? []).filter((v) => v.size > 0);
    const list = (dir) => readdir(dir, { withFileTypes: true }).then((l) => l.map((e) => ({ name: e.name, dir: e.isDirectory() })), () => []);
    const { plan, skip } = await storagePlan({ volumes, home: os.homedir(), systemDrive: process.env.SystemDrive ?? 'C:', library: items, list });
    const used = volumes.reduce((n, v) => n + v.size - v.free, 0) || 1; let done = 0, tick = 0;
    const out = [];
    for (const x of plan) {
      const m = await measure(x.path, { skip: ['game', 'app'].includes(x.kind) ? new Set() : skip, onFile: (b) => { done += b; if (Date.now() - tick > 400) { tick = Date.now(); send('more:storage', { pct: Math.min(99, Math.round((done * 100) / used)), current: x.name }); } } });
      if (m.size) out.push({ path: x.path, name: x.name, kind: x.kind, where: x.where, id: x.id ?? null, size: m.size, files: m.files, lastUsed: x.lastPlayed || m.last });
    }
    out.sort((a, b) => b.size - a.size);
    for (const x of out.slice(0, 150)) x.icon = await storageIcon(x);
    storageLast = { at: Date.now(), volumes, items: out };
    return storageLast;
  } finally { storageBusy = false; }
});
ipcMain.handle('more:storageShow', (_e, p) => { if (storageLast?.items.some((x) => x.path === p) || process.env.LAUNCHER_DEMO) shell.showItemInFolder(String(p)); return true; });
// Suppression confirmée dans l'interface : fichiers et dossiers à la corbeille (récupérables), jeux Steam / Epic désinstallés,
// autres programmes par leur propre désinstalleur. Seuls des chemins de la dernière analyse sont acceptés.
ipcMain.handle('more:storageDel', async (_e, paths = []) => {
  if (process.env.LAUNCHER_DEMO) return { ok: paths.length, freed: 0, failed: [] };
  const want = new Set((Array.isArray(paths) ? paths : []).map(String));
  const list = (storageLast?.items ?? []).filter((x) => want.has(x.path) && x.kind !== 'protected');
  let ok = 0, freed = 0; const failed = [], gone = new Set();
  for (const x of list) {
    const lib = x.id && items.find((i) => i.id === x.id);
    try {
      if (lib && ['steam', 'epic'].includes(lib.source)) { const c = safeGameDir(lib); if (!c.ok) throw new Error(c.why); await uninstallFiles(lib, { launcherInstalled: epicLauncherInstalled() }); }
      else if (lib?.uninstallCmd) { spawn(lib.uninstallCmd, { shell: true, detached: true, windowsHide: false, stdio: 'ignore' }).unref(); failed.push({ name: x.name, why: 'désinstalleur ouvert : termine dans sa fenêtre' }); continue; }
      else await shell.trashItem(x.path);
      ok += 1; freed += x.size; gone.add(x.path);
    } catch (err) { failed.push({ name: x.name, why: err.message }); }
  }
  if (storageLast) storageLast.items = storageLast.items.filter((x) => !gone.has(x.path));
  if (list.some((x) => x.id)) scan().then((lib) => send('lib:update', lib)).catch(() => {});
  return { ok, freed, failed };
});
ipcMain.handle('more:translate', async (_e, texts) => (process.env.LAUNCHER_DEMO ? { en: {} } : api('/api/compte/traduire', { method: 'POST', body: { texts: (Array.isArray(texts) ? texts : []).slice(0, 60) }, timeout: 60_000 }).catch(() => null)));
// E-sport : équipes et calendrier (fichier livré avec le launcher, mis à jour depuis le site quand il est joignable)
ipcMain.handle('more:esportData', async () => {
  const remote = process.env.LAUNCHER_DEMO ? null : await fetch('https://zyko144.github.io/vercel-ia-/demo/ui/esport.json', { signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return { ...(remote?.teams ? remote : JSON.parse(await readFile(path.join(here, 'ui', 'esport.json'), 'utf8'))), api: process.env.LAUNCHER_DEMO ? '' : API };
});
ipcMain.handle('more:esportInfo', (_e, team, game) => (process.env.LAUNCHER_DEMO ? { news: [{ title: 'Qualifiée pour le prochain Major', summary: 'L’équipe a validé sa place après une série en 5 manches.', date: '2026-10-04', url: 'https://liquipedia.net/', image: '' }, { title: 'Nouveau joueur annoncé', summary: 'Un remplaçant rejoint l’effectif jusqu’à la fin de la saison.', date: '2026-09-28', url: 'https://liquipedia.net/', image: '' }], players: [{ name: 'Joueur1', role: 'Capitaine', country: 'FR' }, { name: 'Joueur2', role: 'Attaquant', country: 'FR' }, { name: 'Joueur3', role: 'Soutien', country: 'BE' }] } : api(`/api/compte/esport/infos?nom=${encodeURIComponent(String(team))}&jeu=${encodeURIComponent(String(game))}`, { timeout: 60_000 }).catch(() => null)));
ipcMain.handle('more:esportOpen', (_e, url) => openLink(String(url)).then(() => true, () => false));
ipcMain.handle('more:dustDone', () => { store.data.dustAt = Date.now(); store.save(); return true; });
ipcMain.handle('more:speed', () => (process.env.LAUNCHER_DEMO ? { down: 412, up: 48 } : speedTest((u, o) => net.fetch(u, o)).catch((err) => ({ error: err.message }))));
ipcMain.handle('more:dns', async (_e, name) => {
  const n = Object.hasOwn(DNS_PAIRS, name) ? name : 'auto';
  if (!(await confirm(n === 'auto' ? 'Remettre le DNS automatique ?' : `Utiliser le DNS ${n} ?`, n === 'auto' ? 'Ta carte réseau reprend le DNS donné par ta box.' : `Ta carte réseau utilisera ${DNS_PAIRS[n].join(' et ')}. Tu peux revenir au DNS automatique à tout moment ici.`))) return { ok: false, cancelled: true };
  return { ok: await runElevated(dnsScript(n)) };
});
ipcMain.handle('more:restoreClean', async () => {
  if (!(await confirm('Supprimer les anciens points de restauration ?', 'Le plus récent est gardé. Les anciens prennent souvent plusieurs Go.'))) return { ok: false, cancelled: true };
  return { ok: await runElevated(RESTORE_CLEAN_PS) };
});
ipcMain.handle('more:memtest', async () => {
  if (!(await confirm('Tester la mémoire (RAM) ?', 'Outil officiel de Windows : il te demande de redémarrer, le test dure 10 à 20 minutes avant Windows, et le résultat s’affiche à la reconnexion.'))) return { ok: false, cancelled: true };
  spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'mdsched.exe'), [], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return { ok: true };
});
let stressing = false;
ipcMain.handle('more:stress', async (_e, minutes) => {
  if (stressing) return { error: 'Test déjà en cours.' };
  const ms = Math.min(10, Math.max(1, Number(minutes) || 10)) * 60_000; stressing = true;
  const temps = []; const t = setInterval(() => snapshot().then((x) => { temps.push(x?.cpu?.temp ?? null); send('more:stress', { pct: Math.min(99, Math.round((temps.length * 5000 * 100) / ms)), temp: x?.cpu?.temp ?? null }); }).catch(() => {}), 5000);
  try {
    const r = await cpuBench({ ms: 300, sustainMs: ms });
    const v = temps.filter((x) => x > 0), max = v.length ? Math.max(...v) : null;
    return { stability: r.sustain?.stability ?? null, max, ok: (r.sustain?.stability ?? 100) >= 90 && (max == null || max < 95) };
  } finally { clearInterval(t); stressing = false; }
});
ipcMain.handle('more:journal', () => (store.data.optiJournal ?? []).map((j, i) => ({ i, at: j.at ?? null, label: (j.done ?? []).slice(0, 3).map((x) => x.label ?? x).join(', ') || 'Optimisation', n: (j.entries?.length ?? 0) + (j.tweaks?.length ?? 0) })));
ipcMain.handle('more:undoOne', async (_e, i) => {
  const list = store.data.optiJournal ?? [], j = list[Number(i)];
  if (!j || !(await confirm('Annuler cette optimisation ?', 'Seulement celle-ci : les fichiers et réglages qu’elle a modifiés reviennent comme avant.'))) return { ok: false };
  await revertEntries(j.entries ?? []).catch((err) => fatalLog(err));
  for (const t of j.tweaks ?? []) await setTweak(t.id, t.was).catch(() => {});
  store.data.optiJournal = list.filter((_, n) => n !== Number(i)); store.save();
  return { ok: true };
});
ipcMain.handle('more:item', async (_e, id) => {
  const it = items.find((i) => i.id === String(id));
  if (!it) return null;
  const appid = it.steamId ?? it.matchSteamId;
  return { args: store.data.items[it.id]?.args ?? '', mergeWith: store.data.items[it.id]?.mergeWith ?? '', versions: store.data.versionLog?.[it.id] ?? [], reviews: appid ? await steamReviews(appid).catch(() => null) : null, trailer: it.details?.trailer ?? null, fps: { driver: fpsAround(store.data.perf?.[it.id], 'driver'), os: fpsAround(store.data.perf?.[it.id], 'os') } };
});
// Genres des jeux installés (collections automatiques) : fiche Steam lue doucement en arrière-plan, 1 jeu toutes les 3 s
async function detailsInBackground() {
  const todo = items.filter((x) => x.kind === 'game' && x.installed && (x.steamId ?? x.matchSteamId) && !store.data.art?.[x.id]?.details).slice(0, 40);
  for (const i of todo) {
    const d = await steamDetails(i.steamId ?? i.matchSteamId).catch(() => null);
    if (d) (store.data.art ??= {})[i.id] = { ...(store.data.art[i.id] ?? {}), details: d };
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (todo.length) { store.save(); await remerge(); send('lib:update', library()); }
}
setTimeout(() => detailsInBackground().catch(() => {}), process.env.LAUNCHER_DEMO ? 1e9 : 5 * 60_000);
// Rapport du mois (le 1er) : heures de jeu, jeu préféré, santé, chauffe
setInterval(() => {
  const r = monthReport({ days: store.data.days, items, diagHistory: store.data.diagHistory, tempDays: store.data.tempDays });
  if (!r.hours || store.data.monthReported === r.month) return;
  store.data.monthReported = r.month; store.save();
  const label = new Date(`${r.month}-15`).toLocaleDateString('fr-FR', { month: 'long' });
  logNotif({ id: `mois-${r.month}`, kind: 'app', icon: '📅', title: `Ton mois de ${label}`, body: [`${r.hours} h de jeu`, r.top && `surtout ${r.top.name} (${r.top.hours} h)`, r.score != null && `santé du PC ${r.score}/100`, r.cpuMax && `processeur au max ${r.cpuMax} °C`].filter(Boolean).join(' · ') });
}, 3 * 3_600_000);
ipcMain.handle('more:proCard', async (_e, at) => {
  if (process.env.LAUNCHER_DEMO) return { before: 61, after: 92, fps: { name: 'Fortnite', before: 144, after: 212 } };
  const t = Number(at) || 0, hist = [...(store.data.diagHistory ?? []), ...(store.data.healthLog ?? [])].sort((x, y) => x.at - y.at);
  const avg = (l) => Math.round(l.slice(-5).reduce((n, r) => n + r.avg, 0) / Math.min(5, l.length));
  let fps = null;
  for (const [id, recs] of Object.entries(store.data.perf ?? {})) {
    const b = recs.filter((r) => r.avg && r.at < t), a = recs.filter((r) => r.avg && r.at > t);
    if (b.length && a.length && (!fps || b.length + a.length > fps.n)) fps = { name: items.find((i) => i.id === id)?.name ?? 'Jeu', before: avg(b), after: avg(a), n: b.length + a.length };
  }
  // « Après » = nouvelle mesure complète (matériel + réglages + stockage + stabilité), pas l’ancien diagnostic en cache
  const card = { before: [...hist].reverse().find((x) => x.at < t)?.score ?? null, after: (await healthNow(true).catch(() => null))?.score ?? hist.at(-1)?.score ?? null, fps };
  proPost('/api/compte/optipro/gain', card).catch(() => {}); // classement du mois sur Discord
  return card;
});
// Ticket Opti Pro réussi : badge du profil + suivi automatique chaque mois
ipcMain.handle('more:proDone', () => { if (!store.data.optiProDoneAt) { store.data.optiProDoneAt = Date.now(); store.data.optiProScore = diagCache?.data?.score ?? null; store.save(); } return true; });
setInterval(async () => {
  const done = store.data.optiProDoneAt; if (!done || Date.now() - (store.data.optiRecheckAt ?? done) < 30 * 86_400_000 || currentSession()) return;
  store.data.optiRecheckAt = Date.now(); store.save();
  const d = await runDiag(true).catch(() => null); if (!d?.score) return;
  const was = store.data.optiProScore, drop = was != null && d.score < was - 10;
  logNotif({ id: `recheck-${new Date().toISOString().slice(0, 7)}`, kind: 'app', icon: drop ? '⚠️' : '✅', title: 'Suivi Opti Pro du mois', body: `Santé du PC : ${d.score}/100${was != null ? ` (fin du ticket : ${was})` : ''}. ${drop ? 'Ça a baissé : rouvre un ticket Opti Pro ou lance Optimisation.' : 'Ton PC garde ses réglages.'}` });
}, 6 * 3_600_000);
// ---------- Outils IA : erreur, capture, réglages, guide, panne, plantage, patch notes, comparateur, arnaque ----------
// Mémoire de l'IA : ton PC, tes jeux et tes dernières questions (gardées sur ce PC), ajoutés à chaque demande
function aiMemory() {
  const d = diagCache?.data ?? {};
  const pc = [d.cpu?.name, d.gpus?.map((g) => g.name).join(' + '), d.ramGb && `${d.ramGb} Go RAM ${d.ram?.[0]?.type ?? ''}`, d.board && `carte mère ${d.board}`, d.os?.name].filter(Boolean).join(' · ');
  const games = [...items].filter((i) => i.kind === 'game').sort((a, b) => b.minutes - a.minutes).slice(0, 12).map((i) => `${i.name} (${Math.round(i.minutes / 60)} h)`).join(', ');
  const notes = (store.data.aiMemory ?? []).slice(-8).map((n) => `- ${n}`).join('\n');
  return `MÉMOIRE (ce que tu sais déjà de ce joueur)\nPC : ${pc || store.data.aiPc || 'inconnu'}\nJeux les plus joués : ${games || 'inconnus'}${notes ? `\nQuestions précédentes :\n${notes}` : ''}`;
}
const AI_TOOLS = {
  erreur: [true, (x) => `Message d'erreur (jeu, launcher ou Windows) :\n${x.text}\n\nExplique ce qu'il veut dire puis donne la solution pas à pas, de la plus simple à la plus poussée.`],
  capture: [false, (x) => `Lis la capture d'écran jointe (message d'erreur, réglage ou écran de jeu)${x.text ? `. Question : ${x.text}` : ''}. Recopie le message important, explique-le, puis donne la solution pas à pas.`],
  reglages: [true, (x, g) => `Meilleurs réglages graphiques de ${g?.name ?? x.text} pour CE PC (FPS stables et lisibilité en priorité) : liste « réglage → valeur », puis le FPS moyen attendu et ce qu'il faut baisser en premier si ça rame.`],
  guide: [true, (x, g) => `Question sur ${g?.name ?? 'un jeu'} : ${x.text}\nRéponds comme un guide de jeu fiable et à jour (étapes, emplacements, astuces).`],
  panne: [false, (x, g, ctx) => `Voici l'état de santé mesuré de ce PC :\n${ctx}\n\nY a-t-il une panne probable bientôt ? Classe les risques (élevé / moyen / faible), explique chaque signe simplement et dis quoi faire avant que ça casse. Si tout va bien, dis-le.`],
  crash: [true, (x, g, ctx) => `Le jeu ${g?.name ?? ''} plante. Plantages enregistrés par Windows :\n${ctx || 'aucun détail enregistré'}\n${x.text ? `Ce que dit le joueur : ${x.text}\n` : ''}Diagnostique la cause la plus probable et donne la solution pas à pas.`],
  patch: [true, (x, g, ctx) => `Résume en 3 lignes maximum, simples et concrètes, les dernières notes de mise à jour de ${g?.name ?? 'ce jeu'} :\n${ctx || '(cherche-les sur le web)'}`],
  comparer: [true, (x) => `Compare pour un joueur : « ${x.a} » contre « ${x.b} ». Performances en jeu, prix actuel, consommation, compatibilité avec CE PC (carte mère, alimentation, goulot), puis un verdict clair.`],
  arnaque: [false, (x) => `Message reçu (Discord, Steam, mail…) :\n${x.text}\n\nEst-ce une arnaque ? Commence par « 🚨 Arnaque », « ⚠️ Suspect » ou « ✅ Rien d'anormal », puis explique pourquoi en 2-3 points.`],
};
ipcMain.handle('more:ai', async (_e, kind, x = {}) => {
  const tool = AI_TOOLS[kind]; if (!tool) return { error: 'Outil inconnu.' };
  const ai = await getAi(); if (!ai) return { error: (await premium()).ia ? 'IA injoignable : connecte-toi à ton compte History.' : 'Les outils IA font partie de ⭐ History IA.', premium: !(await premium()).ia };
  const g = x.game ? items.find((i) => i.id === String(x.game)) : null;
  let ctx = '';
  if (kind === 'panne') {
    const d = await runDiag().catch(() => ({}));
    ctx = [...(d.disks ?? []).map((k) => `Disque ${k.name} : santé ${k.health ?? '?'}, usure ${k.wear ?? '?'} %, ${k.temp ?? '?'} °C, erreurs lecture ${k.readErrors ?? 0} / écriture ${k.writeErrors ?? 0}, ${k.hours ?? '?'} h allumé`),
      `Températures max par jour (30 j) : ${Object.entries(store.data.tempDays ?? {}).map(([k, v]) => `${k.slice(5)} CPU ${v.cpu ?? '?'} GPU ${v.gpu ?? '?'}`).join(' ; ') || 'pas encore'}`,
      d.battery && `Batterie : ${Math.round((100 * d.battery.full) / d.battery.design)} % de la capacité d'origine`, ...(d.advice ?? []).slice(0, 6).map((a) => `Point relevé : ${a.title}`)].filter(Boolean).join('\n');
  }
  if (kind === 'crash' && g) ctx = (store.data.crashes?.[g.id] ?? []).slice(-5).map((c) => `${new Date(c.at).toLocaleString('fr-FR')} : ${c.cause}${c.module ? ` (module ${c.module})` : ''}${c.code ? ` code ${c.code}` : ''}`).join('\n');
  if (kind === 'patch' && g?.steamId) ctx = (await steamNews(g.steamId, 2).catch(() => [])).map((n) => `${n.title}\n${String(n.contents ?? n.text ?? '').slice(0, 3000)}`).join('\n\n');
  if (kind === 'arnaque') { const local = scamCheck(x.text); if (local) ctx = local; }
  const image = kind === 'capture' ? String(x.image ?? '').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/) : null;
  if (kind === 'capture' && !image) return { error: 'Choisis une capture d’écran (PNG ou JPEG).' };
  const beginner = store.data.settings.aiBeginner ? '\nMODE DÉBUTANT : explique comme à quelqu’un qui n’y connaît rien, mots simples, chaque terme technique expliqué entre parenthèses, étapes numérotées très courtes.' : '';
  try {
    const reply = await ai.ask({ web: tool[0], image: image ? { mime: image[1], data: image[2] } : null,
      system: `Tu es l'IA de History Launcher, experte en jeux PC et en matériel. Français, tutoiement, réponses claires en Markdown (titres courts, listes), sans blabla. N'invente rien : si tu n'es pas sûr, dis-le.${beginner}\n\n${aiMemory()}`,
      text: tool[1](x, g, ctx) });
    (store.data.gains ??= {}).ia = (store.data.gains.ia ?? 0) + 1;
    store.data.aiMemory = [...(store.data.aiMemory ?? []), `${kind}${g ? ` (${g.name})` : ''} : ${String(x.text ?? x.a ?? '').slice(0, 80)}`].slice(-20); store.save();
    return { reply: kind === 'arnaque' && ctx ? `> 🔎 Vérification locale : ${ctx}\n\n${reply}` : reply };
  } catch (err) { return { error: `IA injoignable (${err.message}).` }; }
});
ipcMain.handle('more:aiBeginner', (_e, on) => { if (on !== undefined) { store.data.settings.aiBeginner = Boolean(on); store.save(); } return store.data.settings.aiBeginner === true; });
ipcMain.handle('more:aiForget', () => { store.data.aiMemory = []; store.save(); return true; });
ipcMain.handle('more:lfg', (_e, q = '', post = null) => (post ? social('/api/compte/lfg', { jeu: String(post.jeu ?? ''), rang: String(post.rang ?? ''), texte: String(post.texte ?? ''), stop: Boolean(post.stop) }) : social(`/api/compte/lfg?jeu=${encodeURIComponent(String(q).slice(0, 60))}`)).catch((err) => ({ error: err.message })));
ipcMain.handle('more:stats', () => { const act = process.env.LAUNCHER_DEMO ? demoActivity() : { days: store.data.days, sessions: store.data.sessions ?? [] }; return { adv: advancedStats(act.sessions, act.days, items), gains: { ...(store.data.gains ?? {}), pro: Boolean(store.data.optiProDoneAt), recheck: store.data.optiRecheckAt ?? null } }; });
ipcMain.handle('more:wrapped', () => wrapped(process.env.LAUNCHER_DEMO ? demoActivity().days : store.data.days, items, new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear()));
// ---------- Sécurité & compte ----------
ipcMain.handle('more:sessions', (_e, k = null, tout = false) => { const token = secret('account'); if (!token) return { error: 'Connecte-toi à ton compte History.' }; return (k || tout ? api('/api/compte/sessions/fin', { method: 'POST', token, body: { k: String(k ?? ''), tout: Boolean(tout) } }) : api('/api/compte/sessions', { token })).catch(() => ({ error: 'Serveur injoignable.' })); });
ipcMain.handle('more:export', async () => {
  const token = secret('account'); if (!token) return { error: 'Connecte-toi à ton compte History.' };
  const r = await api('/api/compte/export', { token }).catch(() => ({ error: 'Serveur injoignable.' })); if (r.error) return r;
  const local = { parametres: { ...store.data.settings }, collections: store.data.collections ?? {}, temps_de_jeu: store.data.days ?? {}, journal_optimisation: (store.data.optiJournal ?? []).map((j) => ({ at: j.at, fait: j.done })) };
  const { filePath } = await dialog.showSaveDialog(win, { defaultPath: 'mes-donnees-history.json', filters: [{ name: 'JSON', extensions: ['json'] }] }); if (!filePath) return { cancelled: true };
  const { writeFile } = await import('node:fs/promises'); delete local.parametres.pin;
  await writeFile(filePath, JSON.stringify({ serveur: r, ce_pc: local }, null, 2)); shell.showItemInFolder(filePath); return { ok: true };
});
ipcMain.handle('more:deleteAccount', async (_e, pw) => {
  const token = secret('account'); if (!token) return { error: 'Connecte-toi à ton compte History.' };
  if (!(await confirm('Supprimer ton compte History ?', 'Définitif : profil, amis, sauvegardes en ligne et Premium sont effacés. Tes jeux et ce PC ne sont pas touchés.', { danger: true }))) return { cancelled: true };
  const r = await api('/api/compte/supprimer', { method: 'POST', token, body: { motDePasse: String(pw ?? '').slice(0, 128) } }).catch(() => ({ error: 'Serveur injoignable.' }));
  if (r.ok) { setSecret('account', ''); store.data.settings.lastAccount = null; store.save(); }
  return r;
});
// Mot de passe déjà fuité ? (Have I Been Pwned, k-anonymat : seuls les 5 premiers caractères de l'empreinte SHA-1 partent)
async function pwned(pw) {
  const h = createHash('sha1').update(String(pw)).digest('hex').toUpperCase();
  const t = await net.fetch(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`).then((r) => r.text()).catch(() => '');
  return Number(t.split('\n').find((l) => l.startsWith(h.slice(5)))?.split(':')[1] ?? 0);
}
ipcMain.handle('more:pwned', (_e, pw) => (String(pw ?? '').length >= 6 ? pwned(pw) : 0));
// Code PIN du launcher (verrou à l'ouverture) + contrôle parental (la limite du jour devient bloquante)
const pinHash = (pin, salt) => createHash('sha256').update(`${salt}:${pin}`).digest('hex');
ipcMain.handle('more:pin', (_e, action, pin = '', extra) => {
  const set = store.data.settings, ok = () => Boolean(set.pin) && pinHash(String(pin), set.pin.salt) === set.pin.hash;
  if (action === 'status') return { on: Boolean(set.pin), parental: Boolean(set.parental), limit: set.dailyLimit ?? 0 };
  if (action === 'set') { if (set.pin && !ok()) return { error: 'Code actuel incorrect.' }; if (!/^\d{4,8}$/.test(String(extra ?? ''))) return { error: 'Le code fait 4 à 8 chiffres.' }; const salt = randomUUID(); set.pin = { salt, hash: pinHash(String(extra), salt) }; store.save(); return { ok: true }; }
  if (!ok()) return { error: 'Code incorrect.' };
  if (action === 'clear') { delete set.pin; set.parental = false; }
  if (action === 'parental') set.parental = Boolean(extra);
  if (action === 'unlock') store.data.parentalUntil = Date.now() + 3_600_000;
  store.save(); return { ok: true };
});
// Mods suspects : analyse antivirus Windows Defender des dossiers de mods du jeu (ou du jeu entier)
ipcMain.handle('more:modscan', async (_e, id) => {
  const it = items.find((i) => i.id === String(id)); if (!it?.installDir || process.platform !== 'win32') return { error: 'Analyse disponible sur Windows pour un jeu installé.' };
  const { stat } = await import('node:fs/promises');
  const dirs = (await Promise.all(['mods', 'Mods', 'BepInEx', 'plugins', 'addons', 'scripts', 'cleo', 'modloader', 'resources'].map(async (d) => ((await stat(path.join(it.installDir, d)).catch(() => null))?.isDirectory() ? path.join(it.installDir, d) : null)))).filter(Boolean);
  const mp = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe');
  const bad = [];
  for (const d of dirs.length ? dirs : [it.installDir]) {
    const code = await new Promise((r) => execFile(mp, ['-Scan', '-ScanType', '3', '-File', d, '-DisableRemediation'], { windowsHide: true, timeout: 600_000 }, (err) => r(err?.code ?? 0)));
    if (code === 2) bad.push(d);
  }
  return { ok: true, scanned: dirs.length ? dirs.map((d) => path.basename(d)) : ['dossier du jeu'], threats: bad.map((d) => path.basename(d)) };
});
ipcMain.handle('more:reinstall', () => toReinstall(store.data.installedList ?? [], items));
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
// Actions demandées par le téléphone (page Wi-Fi ou appli via le serveur) : liste fermée, rien d'autre
async function phoneAct(what, id) {
  if (what === 'launch') return items.some((i) => i.id === id && i.installed) ? doAction(id, 'launch').then(() => ({ ok: true, msg: '▶ Lancé sur le PC' }), (e) => ({ ok: false, msg: e.message })) : { ok: false };
  if (what === 'install') return items.some((i) => i.id === id && !i.installed) ? doAction(id, 'install').then(() => ({ ok: true, msg: '⬇ Installation lancée sur le PC' }), (e) => ({ ok: false, msg: e.message })) : { ok: false };
  if (what === 'close') { const cur = currentSession(); return cur ? doAction(cur.id, 'close').then(() => ({ ok: true, msg: `■ ${cur.name} fermé` }), (e) => ({ ok: false, msg: e.message })) : { ok: false, msg: 'Aucun jeu en cours' }; }
  if (what === 'shot') { const f = await takeScreenshot().catch(() => null); return { ok: Boolean(f), msg: f ? '📸 Capture enregistrée sur le PC' : 'Capture impossible' }; }
  const sys = (exe, args) => spawn(exe, args, { windowsHide: true, detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  if (process.platform !== 'win32') return { ok: false, msg: 'Windows seulement' };
  if (what === 'sleep') { setTimeout(() => sys('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']), 1500); return { ok: true, msg: '🌙 Le PC se met en veille' }; }
  if (what === 'shutdown') { sys('shutdown', ['/s', '/t', '60', '/c', 'Extinction demandée depuis ton téléphone (History). Annule avec shutdown /a ou depuis le téléphone.']); notify('Extinction dans 60 s', 'Demandée depuis ton téléphone.'); return { ok: true, msg: '⏻ Extinction dans 60 secondes' }; }
  if (what === 'cancel') { sys('shutdown', ['/a']); return { ok: true, msg: 'Extinction annulée' }; }
  // Veille + réveil : tâche Windows « réveiller l'ordinateur » à l'heure demandée (heure validée, aucun texte du téléphone dans le script)
  if (what === 'wake') {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(id)); if (!m) return { ok: false, msg: 'Heure invalide' };
    const at = new Date(); at.setHours(Number(m[1]), Number(m[2]), 0, 0); if (at <= Date.now()) at.setDate(at.getDate() + 1);
    const iso = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
    const ps = `$t=New-ScheduledTaskTrigger -Once -At '${iso}';$s=New-ScheduledTaskSettingsSet -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries;$a=New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c exit';Register-ScheduledTask -TaskName 'History - reveil du PC' -Trigger $t -Settings $s -Action $a -Force | Out-Null`;
    const ok = await new Promise((r) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 20_000 }, (err) => r(!err)));
    if (!ok) return { ok: false, msg: 'Réveil impossible à programmer : veille annulée' };
    setTimeout(() => sys('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']), 1500);
    return { ok: true, msg: `🌙 En veille, réveil à ${m[1]}:${m[2]}` };
  }
  return { ok: false };
}
// Appli téléphone : le PC envoie son état au serveur et exécute les ordres reçus (10 s, 3 s quand le téléphone regarde)
let phoneMsg = '';
async function phoneSync() {
  const token = secret('account');
  if (!token || store.data.settings.phone === false || process.env.LAUNCHER_DEMO) return setTimeout(phoneSync, 60_000);
  store.data.deviceId ??= randomUUID();
  const s = await snapshot().catch(() => null), deg = (t) => (t == null ? null : Math.round(t));
  // Le téléphone ne lit que des images en ligne : pochettes https, sinon celles de Steam (jaquette puis bannière)
  const steam = (i, f) => (i.source === 'steam' && /^\d+$/.test(i.steamId ?? '') ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${i.steamId}/${f}` : null);
  const art = (i) => [i.art?.cover, i.art?.header, i.art?.hero, steam(i, 'library_600x900.jpg'), steam(i, 'header.jpg')].filter((u) => /^https:\/\//.test(u ?? '')).slice(0, 2);
  const games = items.filter((i) => i.kind === 'game');
  const recent = [...new Set((store.data.sessions ?? []).slice().reverse().map((x) => x.id))].map((id) => games.find((g) => g.id === id && g.installed)).filter(Boolean);
  const etat = {
    cpu: s ? Math.round(s.cpu?.usage ?? 0) : null, cpuT: deg(s?.cpu?.temp), gpu: s?.gpu?.usage != null ? Math.round(s.gpu.usage) : null, gpuT: deg(s?.gpu?.temp), ram: s?.ram ? Math.round((100 * s.ram.used) / s.ram.total) : null,
    jeu: currentSession()?.name ?? null, msg: phoneMsg,
    jeux: [...recent, ...games.filter((g) => g.installed).sort((a, b) => b.minutes - a.minutes)].filter((g, k, a) => a.indexOf(g) === k).slice(0, 18).map((g) => ({ id: g.id, name: g.name, art: art(g)[0] ?? null, art2: art(g)[1] ?? null, h: Math.round(g.minutes / 60) })),
    installer: games.filter((i) => !i.installed && ['steam', 'epic'].includes(i.source)).sort((a, b) => b.minutes - a.minutes).slice(0, 8).map((g) => ({ id: g.id, name: g.name, art: art(g)[0] ?? null, art2: art(g)[1] ?? null })),
    notifs: (store.data.notifLog ?? []).slice(-6).reverse().map(({ id, icon, title, body, at }) => ({ id, icon, title, body, at })),
    sante: diagCache?.data?.score ?? store.data.diagHistory?.at(-1)?.score ?? null,
  };
  const r = await api('/api/compte/pc/etat', { method: 'POST', token, body: { pc: store.data.deviceId, nom: os.hostname(), etat } }).catch(() => null);
  for (const o of r?.ordres ?? []) phoneMsg = (await phoneAct(o.do, o.id).catch((e) => ({ msg: e.message })))?.msg ?? '';
  if (r?.ordres?.length) setTimeout(phoneSync, 800); else setTimeout(phoneSync, r?.rapide ? 3000 : 10_000);
}
app.whenReady().then(() => setTimeout(phoneSync, 8000));
// QR de connexion : scanné, il connecte l'appli au compte ET à ce PC (code à usage unique, 2 min)
ipcMain.handle('more:phoneQr', async () => {
  const token = secret('account'); if (!token) return { error: 'Connecte-toi à ton compte History pour connecter ton téléphone.' };
  store.data.deviceId ??= randomUUID();
  const r = await api('/api/compte/lien/qr', { method: 'POST', token, body: { pc: store.data.deviceId } }).catch(() => ({ error: 'Serveur injoignable.' }));
  if (!r.code) return { error: r.error ?? 'QR indisponible.' };
  const link = `https://zyko144.github.io/vercel-ia-/app/#qr=${r.code}`;
  return { ok: true, link, qr: await (await import('qrcode')).default.toDataURL(link, { margin: 1, width: 220, color: { dark: '#0b0910', light: '#ffffff' } }) };
});
// Ticket Opti Pro vu du téléphone (relu au plus une fois par minute)
let ticketCache = { at: 0, v: null };
async function remoteTicket() {
  if (Date.now() - ticketCache.at > 60_000 && secret('account')) { ticketCache.at = Date.now(); const r = await api('/api/compte/optipro', { token: secret('account') }).catch(() => null); const t = r?.session; ticketCache.v = t && !t.closed ? { step: t.step + 1, last: t.log?.filter((m) => m.who !== 'user').at(-1)?.text ?? '' } : null; }
  return ticketCache.v;
}
function setRemote() {
  remoteSrv?.close(); remoteSrv = null;
  if (!store.data.settings.remote) return;
  store.data.settings.remotePin ??= newPin(); store.save();
  const recent = () => { const ids = [...new Set((store.data.sessions ?? []).slice().reverse().map((x) => x.id))]; const games = items.filter((i) => i.kind === 'game' && i.installed); return [...ids.map((id) => games.find((g) => g.id === id)).filter(Boolean), ...games].filter((g, k, a) => a.indexOf(g) === k).slice(0, 12); };
  remoteSrv = startRemote({
    pin: store.data.settings.remotePin,
    state: async () => { const s = await snapshot().catch(() => null); const deg = (t) => (t == null ? null : `${Math.round(t)} °C`); return { cpu: deg(s?.cpu?.temp) ?? (s ? `${Math.round(s.cpu.usage)} %` : null), gpu: deg(s?.gpu?.temp), ram: s ? `${Math.round((s.ram.used / s.ram.total) * 100)} %` : null, jeu: playSession?.name ?? null, jeux: recent().map((g) => ({ id: g.id, name: g.name })), installer: items.filter((i) => i.kind === 'game' && !i.installed && ['steam', 'epic'].includes(i.source)).sort((a, b) => b.minutes - a.minutes).slice(0, 6).map((g) => ({ id: g.id, name: g.name })), notifs: (store.data.notifLog ?? []).slice(-5).reverse().map(({ id, icon, title, body }) => ({ id, icon, title, body })), ticket: await remoteTicket() }; },
    launch: async (id) => (items.some((i) => i.id === id && i.installed) ? doAction(id, 'launch') : { ok: false }),
    // Téléphone : installer, veille / extinction (60 s pour annuler), clips et captures du dossier Vidéos
    act: phoneAct,
    clips: async () => {
      const { readdir, stat } = await import('node:fs/promises'); const root = path.join(os.homedir(), 'Videos'); const out = [];
      for (const d of (await readdir(root, { withFileTypes: true }).catch(() => [])).filter((x) => x.isDirectory()).slice(0, 40))
        for (const f of (await readdir(path.join(root, d.name)).catch(() => [])).filter((n) => /\.(png|mp4)$/i.test(n))) out.push({ n: `${d.name}/${f}`, img: /\.png$/i.test(f), t: (await stat(path.join(root, d.name, f)).catch(() => ({ mtimeMs: 0 }))).mtimeMs });
      return out.sort((a, b) => b.t - a.t).slice(0, 8);
    },
    file: async (n) => { const root = path.join(os.homedir(), 'Videos'), f = path.resolve(root, n); return f.startsWith(root + path.sep) && /\.(png|mp4)$/i.test(f) ? f : null; },
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
  const pr = await premium().catch(() => ({})), maxMb = pr.ia || pr.opti ? 200 : 50; // ⭐ Premium : 200 Mo par jeu
  if (!buf || buf.length > maxMb * 1024 * 1024) return { ok: false, error: `Sauvegarde trop grosse pour le cloud (${maxMb} Mo${maxMb === 50 ? ', 200 Mo avec ⭐ Premium' : ''}).` };
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
  // Disque qui faiblit (état SMART de Windows) : alerte une fois par semaine, avant de perdre des fichiers
  const sick = (diagCache?.data?.disks ?? []).filter((d) => ['Warning', 'Unhealthy'].includes(d.health));
  const week = Math.floor(Date.now() / (7 * 86_400_000));
  if (sick.length && store.data.diskSickWeek !== week) {
    store.data.diskSickWeek = week; store.save();
    const t = `${sick.map((d) => d.name).join(', ')} : ${sick.some((d) => d.health === 'Unhealthy') ? 'en mauvais état' : 'commence à faiblir'}`;
    notify('⚠️ Un disque faiblit', `${t}. Sauvegarde tes fichiers importants. Détails : Mon PC › Entretien.`);
    logNotif({ id: `disk-${week}`, kind: 'heat', icon: '💽', title: 'Un disque faiblit', body: `${t}. Sauvegarde tes fichiers importants.` });
  }
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
    const n = new Notif({ title: `Disque ${root.replace('\\', '')} presque plein`, body: `Plus que ${Math.round(free)} Go libres : les mises à jour de jeux risquent d’échouer. Clique pour voir quoi nettoyer ou déplacer.`, icon: icon() });
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
ipcMain.handle('clip:image', (_e, url) => { const img = /^data:image\/png;base64,/.test(String(url)) ? nativeImage.createFromDataURL(url) : null; if (!img || img.isEmpty()) throw new Error('image'); clipboard.writeImage(img); return true; });


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
