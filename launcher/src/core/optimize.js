// Optimisation complète : fichiers inutiles en plus (navigateurs, rapports d'erreur, restes d'installateurs,
// corbeille), restes de jeux désinstallés, programmes au démarrage, réglages Windows pour les jeux,
// nettoyage profond de Windows (en administrateur). Rien n'est touché sans l'accord de l'utilisateur.
import { execFile, spawn } from 'node:child_process';
import { readdir, readFile, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { folderSize } from './manage.js';
import { parseRegQuery } from './registry.js';
import { parseVdf, pick } from './vdf.js';

const run = promisify(execFile);
const win = process.platform === 'win32';

// ===================== Fichiers inutiles en plus =====================

/** Caches des navigateurs (jamais les mots de passe, l'historique ou les cookies) et restes divers. */
export async function extraTargets(env = process.env) {
  const local = env.LOCALAPPDATA ?? '';
  const roaming = env.APPDATA ?? '';
  const programData = env.ProgramData ?? 'C:\\ProgramData';
  const system = (env.SystemDrive ?? 'C:') + '\\';
  const t = (id, label, dir, note = '') => ({ id, label, dir, note });
  const list = [
    t('wer-user', 'Rapports d’erreur Windows', path.join(local, 'Microsoft', 'Windows', 'WER')),
    t('crashclient', 'Rapports de plantage des jeux (Unreal)', path.join(local, 'CrashReportClient')),
    t('nv-install', 'Restes d’installation NVIDIA', path.join(system, 'NVIDIA'), 'Anciens pilotes décompressés'),
    t('amd-install', 'Restes d’installation AMD', path.join(system, 'AMD'), 'Anciens pilotes décompressés'),
    t('nv-downloader', 'Pilotes NVIDIA déjà installés', path.join(programData, 'NVIDIA Corporation', 'Downloader')),
    t('epic-vault', 'Cache de téléchargement Epic', path.join(programData, 'Epic', 'EpicGamesLauncher', 'VaultCache')),
    t('epic-crashes', 'Rapports de plantage d’Epic', path.join(local, 'EpicGamesLauncher', 'Saved', 'Crashes')),
    t('riot-logs', 'Journaux de Riot Client', path.join(local, 'Riot Games', 'Riot Client', 'Logs')),
    t('inetcache', 'Cache Internet de Windows', path.join(local, 'Microsoft', 'Windows', 'INetCache')),
    t('discord-code', 'Cache de code de Discord', path.join(roaming, 'discord', 'Code Cache')),
    t('discord-gpu', 'Cache graphique de Discord', path.join(roaming, 'discord', 'GPUCache')),
    t('amd-dxc', 'Cache AMD (DXC)', path.join(local, 'AMD', 'DxcCache')),
  ];
  // Navigateurs : cache de chaque profil
  const chromium = [
    ['chrome', 'Google Chrome', path.join(local, 'Google', 'Chrome', 'User Data')],
    ['edge', 'Microsoft Edge', path.join(local, 'Microsoft', 'Edge', 'User Data')],
    ['brave', 'Brave', path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')],
  ];
  for (const [id, label, base] of chromium) {
    for (const prof of await readdir(base, { withFileTypes: true }).catch(() => [])) {
      if (!prof.isDirectory() || !/^(Default|Profile \d+)$/.test(prof.name)) continue;
      list.push(t(`${id}-${prof.name}`, `Cache de ${label}${prof.name === 'Default' ? '' : ` (${prof.name})`}`, path.join(base, prof.name, 'Cache', 'Cache_Data'), 'Mots de passe et historique gardés'));
      list.push(t(`${id}-code-${prof.name}`, `Cache de code de ${label}${prof.name === 'Default' ? '' : ` (${prof.name})`}`, path.join(base, prof.name, 'Code Cache')));
    }
  }
  list.push(t('opera', 'Cache d’Opera', path.join(local, 'Opera Software', 'Opera Stable', 'Cache')));
  list.push(t('operagx', 'Cache d’Opera GX', path.join(local, 'Opera Software', 'Opera GX Stable', 'Cache')));
  for (const prof of await readdir(path.join(local, 'Mozilla', 'Firefox', 'Profiles')).catch(() => [])) {
    list.push(t(`firefox-${prof}`, 'Cache de Firefox', path.join(local, 'Mozilla', 'Firefox', 'Profiles', prof, 'cache2'), 'Mots de passe et historique gardés'));
  }
  return list.filter((x) => path.isAbsolute(x.dir));
}

/** Steam : journaux et rapports de plantage (se recréent). */
export function steamJunk(steamRoot) {
  if (!steamRoot) return [];
  return [
    { id: 'steam-logs', label: 'Journaux de Steam', dir: path.join(steamRoot, 'logs'), note: '' },
    { id: 'steam-dumps', label: 'Rapports de plantage de Steam', dir: path.join(steamRoot, 'dumps'), note: '' },
  ];
}

/** Catégorie d'un fichier inutile (pour ranger l'affichage). */
export function groupOf(id) {
  if (/^(chrome|edge|brave|opera|operagx|firefox)/.test(id)) return 'navigateurs';
  if (/^(steam|epic|riot|discord|crashclient|dumps)/.test(id)) return 'jeux';
  if (/^(nv|amd|d3d)/.test(id)) return 'pilotes';
  return 'systeme';
}

/** Score de santé du PC (0 à 100) : fichiers inutiles, restes de jeux, démarrage, réglages, place libre. */
export function healthScore({ junkBytes = 0, orphanBytes = 0, heavyStartup = 0, tweaksOff = 0, freeRatio = null }) {
  const gb = (b) => b / 1e9;
  let score = 100;
  score -= Math.min(25, gb(junkBytes) * 2.5);
  score -= Math.min(15, gb(orphanBytes));
  score -= Math.min(20, heavyStartup * 4);
  score -= Math.min(24, tweaksOff * 6);
  if (freeRatio != null) score -= freeRatio < 0.1 ? 16 : freeRatio < 0.2 ? 8 : 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}
export const scoreLabel = (n) => (n >= 90 ? 'Excellent' : n >= 75 ? 'Bon' : n >= 55 ? 'Moyen' : 'À optimiser');

// ===================== Corbeille =====================

export async function recycleBinSize() {
  if (!win) return 0;
  const ps = '$s=(New-Object -ComObject Shell.Application).NameSpace(10).Items() | Measure-Object -Property Size -Sum; [int64]$s.Sum';
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 30_000 }).catch(() => null);
  return Number(String(r?.stdout ?? '').trim()) || 0;
}
export async function emptyRecycleBin() {
  if (!win) return false;
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue'], { windowsHide: true, timeout: 120_000 }).catch(() => null);
  return true;
}

// ===================== Restes de jeux désinstallés =====================

/** Dossiers de steamapps\common qui n'appartiennent à aucun jeu installé (restes après une désinstallation). */
export async function orphanGameFolders(libraries) {
  const out = [];
  for (const lib of libraries) {
    const used = new Set();
    for (const f of await readdir(lib).catch(() => [])) {
      if (!/^appmanifest_\d+\.acf$/i.test(f)) continue;
      const dir = pick(parseVdf(await readFile(path.join(lib, f), 'utf8').catch(() => '')), 'AppState')?.installdir;
      if (dir) used.add(String(dir).toLowerCase());
    }
    const common = path.join(lib, 'common');
    for (const d of await readdir(common, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory() || used.has(d.name.toLowerCase()) || /^steamworks shared$/i.test(d.name)) continue;
      const dir = path.join(common, d.name);
      out.push({ id: `orphan:${dir.toLowerCase()}`, label: d.name, dir, bytes: (await folderSize(dir)).bytes });
    }
  }
  return out.filter((o) => o.bytes > 0).sort((a, b) => b.bytes - a.bytes);
}
/** Supprime un reste de jeu : seulement un dossier direct de steamapps\common, jamais autre chose. */
export async function removeOrphan(o, libraries) {
  const parent = path.dirname(o.dir);
  if (path.basename(parent).toLowerCase() !== 'common' || !libraries.some((l) => path.join(l, 'common').toLowerCase() === parent.toLowerCase())) return 0;
  const { bytes } = await folderSize(o.dir);
  await rm(o.dir, { recursive: true, force: true }).catch(() => {});
  return (await stat(o.dir).catch(() => null)) ? 0 : bytes;
}

// ===================== Programmes au démarrage =====================

const RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const APPROVED = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
// Lourds au démarrage et inutiles tant qu'on ne s'en sert pas
const HEAVY = /steam|epic|origin|ea desktop|ubisoft|battle\.net|riot|spotify|discord|teams|onedrive|adobe|creative cloud|opera|edge|skype|zoom|dropbox|google drive|icue|razer|lghub|logitech|overwolf|medal|wallpaper/i;

/** Entrées du démarrage (celles de l'utilisateur), avec leur état tel que le Gestionnaire des tâches le montre. */
export function parseStartup(runText, approvedText) {
  const runVals = parseRegQuery(runText)[0]?.values ?? {};
  const approved = parseRegQuery(approvedText)[0]?.values ?? {};
  return Object.entries(runVals).filter(([name]) => name && name !== '(Default)' && name !== '(par défaut)').map(([name, cmd]) => {
    const flag = String(approved[name] ?? '').slice(0, 2);
    return { name, cmd: String(cmd), enabled: flag !== '03' && flag !== '01', heavy: HEAVY.test(`${name} ${cmd}`) };
  }).sort((a, b) => (b.enabled - a.enabled) || (b.heavy - a.heavy) || a.name.localeCompare(b.name));
}
export async function startupApps() {
  if (!win) return [];
  const q = (key) => run('reg', ['query', key], { windowsHide: true }).then((r) => r.stdout).catch(() => '');
  return parseStartup(await q(RUN), await q(APPROVED));
}
/** Active ou désactive exactement comme le Gestionnaire des tâches (réversible, rien n'est supprimé). */
export async function setStartup(name, enabled) {
  if (!win) return false;
  const data = enabled ? '020000000000000000000000' : '030000000000000000000000';
  await run('reg', ['add', APPROVED, '/v', name, '/t', 'REG_BINARY', '/d', data, '/f'], { windowsHide: true });
  return true;
}

// ===================== Réglages Windows pour les jeux =====================

export const GAME_TWEAKS = [
  { id: 'gamemode', label: 'Mode Jeu de Windows activé', help: 'Windows donne la priorité au jeu en cours.', key: 'HKCU\\Software\\Microsoft\\GameBar', values: { AutoGameModeEnabled: 1 }, off: { AutoGameModeEnabled: 0 } },
  { id: 'dvr', label: 'Enregistrement en arrière-plan de la Xbox Game Bar coupé', help: 'Évite que Windows filme en continu pendant les parties (gain de FPS).', key: 'HKCU\\System\\GameConfigStore', values: { GameDVR_Enabled: 0 }, off: { GameDVR_Enabled: 1 }, extra: { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', values: { AppCaptureEnabled: 0 }, off: { AppCaptureEnabled: 1 } } },
  { id: 'background', retired: 'Empêche des applis (Xbox, notifications, certains anti-triche et overlays) de marcher en fond.', label: 'Applis Windows en arrière-plan coupées', help: 'Moins de programmes qui tournent pour rien (mémoire et processeur).', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', values: { GlobalUserDisabled: 1 }, off: { GlobalUserDisabled: 0 } },
  { id: 'ads', label: 'Pubs et suggestions de Windows coupées', help: 'Plus d’applis installées toutes seules ni de suggestions dans le menu Démarrer.', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', values: { SilentInstalledAppsEnabled: 0, SystemPaneSuggestionsEnabled: 0, 'SubscribedContent-338388Enabled': 0, 'SubscribedContent-338389Enabled': 0 }, off: { SilentInstalledAppsEnabled: 1, SystemPaneSuggestionsEnabled: 1, 'SubscribedContent-338388Enabled': 1, 'SubscribedContent-338389Enabled': 1 } },
  { id: 'transparency', label: 'Effets de transparence coupés', help: 'Un peu moins de travail pour la carte graphique (look plus simple).', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', values: { EnableTransparency: 0 }, off: { EnableTransparency: 1 }, optional: true },
  { id: 'visualfx', retired: 'Gain nul sur un PC de jeu, et des fenêtres ou menus peuvent mal s’afficher.', label: 'Animations de Windows réduites', help: 'Windows plus réactif sur les petits PC (look plus simple).', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', values: { VisualFXSetting: 2 }, off: { VisualFXSetting: 0 }, optional: true },
  { id: 'mouse', label: 'Accélération de la souris coupée', help: 'Visée plus précise (effet après reconnexion à Windows).', optional: true, key: 'HKCU\\Control Panel\\Mouse', values: { MouseSpeed: '0', MouseThreshold1: '0', MouseThreshold2: '0' }, off: { MouseSpeed: '1', MouseThreshold1: '6', MouseThreshold2: '10' } },
];
export function tweakApplied(tweak, current) {
  return Object.entries(tweak.values).every(([k, v]) => String(current?.[k] ?? '') === String(v));
}
async function readKey(key) {
  const r = await run('reg', ['query', key], { windowsHide: true }).catch(() => null);
  return parseRegQuery(r?.stdout ?? '')[0]?.values ?? {};
}
export async function tweakStates() {
  if (!win) return GAME_TWEAKS.filter((t) => !t.retired).map((t) => ({ id: t.id, label: t.label, help: t.help, optional: Boolean(t.optional), on: false }));
  const out = [];
  for (const t of GAME_TWEAKS) {
    const on = tweakApplied(t, await readKey(t.key));
    if (t.retired && !on) continue;
    out.push({ id: t.id, label: t.label, help: t.help, optional: Boolean(t.optional), on, ...(t.retired ? { retired: t.retired } : {}) });
  }
  return out;
}
export async function setTweak(id, on) {
  const t = GAME_TWEAKS.find((x) => x.id === id);
  if (!t || !win) return false;
  const write = async (key, values) => {
    for (const [k, v] of Object.entries(values)) {
      const dword = typeof v === 'number';
      await run('reg', ['add', key, '/v', k, '/t', dword ? 'REG_DWORD' : 'REG_SZ', '/d', String(v), '/f'], { windowsHide: true });
    }
  };
  await write(t.key, on ? t.values : t.off);
  if (t.extra) await write(t.extra.key, on ? t.extra.values : t.extra.off);
  return true;
}

// ===================== Nettoyage profond (administrateur) =====================

// Étapes fixes (aucune donnée de l'interface), lancées avec la fenêtre d'autorisation de Windows
const DEEP_STEPS = [
  ['Fichiers temporaires de Windows', "Remove-Item \"$env:windir\\Temp\\*\" -Recurse -Force"],
  ['Anciennes mises à jour téléchargées', 'Stop-Service wuauserv -Force; Remove-Item "$env:windir\\SoftwareDistribution\\Download\\*" -Recurse -Force; Start-Service wuauserv'],
  ['Cache de distribution des mises à jour', 'Delete-DeliveryOptimizationCache -Force'],
  ['Rapports d’erreur', "Remove-Item \"$env:ProgramData\\Microsoft\\Windows\\WER\\*\" -Recurse -Force"],
  ['Cache DNS', 'Clear-DnsClientCache'],
  ['TRIM du SSD système', "Get-Volume -DriveLetter ($env:SystemDrive.TrimEnd(':')) | Optimize-Volume -ReTrim"],
];
export const DEEP_CLEAN_SCRIPT = ["$ErrorActionPreference='SilentlyContinue'", ...DEEP_STEPS.map((x) => x[1]), 'Dism.exe /Online /Cleanup-Image /StartComponentCleanup /Quiet'].join('; ');

export async function freeSpace(drive = (process.env.SystemDrive ?? 'C:') + '\\') {
  const s = await statfs(drive).catch(() => null);
  return s ? s.bavail * s.bsize : null;
}
export async function diskSize(drive = (process.env.SystemDrive ?? 'C:') + '\\') {
  const s = await statfs(drive).catch(() => null);
  return s ? s.blocks * s.bsize : null;
}
/** Nettoyage profond en administrateur : chaque étape, puis DISM (la plus longue) avec son vrai pourcentage. */
export async function deepClean(outFile, onProgress = () => {}) {
  const steps = DEEP_STEPS.map(([label, cmd], i) => `W @{ step='${label.replace(/'/g, "''")}'; base=${Math.round((45 * i) / DEEP_STEPS.length)}; span=0 }\n${cmd}`).join('\n');
  const script = `${jobHead(outFile)}\n${steps}\nRun 'Nettoyage des composants de Windows' 45 55 'dism.exe' @('/Online','/Cleanup-Image','/StartComponentCleanup')\nW @{ step='done'; base=100; span=0 }`;
  const { s } = await elevatedJob(script, outFile, onProgress, ['Nettoyage des composants de Windows']);
  return s?.step === 'done';
}

// ===================== Réglages système pro (administrateur, réversibles) =====================

// Chaque réglage : clé HKLM, valeurs « optimisé » et valeurs d'origine de Windows (null = valeur supprimée)
export const SYSTEM_TWEAKS = [
  { id: 'hags', retired: 'Forcée, elle provoque saccades, écrans noirs et plantages sur FiveM / GTA V et avec certains pilotes : on laisse Windows décider.', label: 'Planification GPU accélérée (HAGS) forcée', help: 'La carte graphique gère sa propre file d’attente. Redémarrage nécessaire.', key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', values: { HwSchMode: 2 }, off: { HwSchMode: null }, reboot: true },
  { id: 'mmcss', retired: 'Le bridage réseau levé donne des coupures de son, de vocal et des pics de ping sur certaines cartes réseau.', label: 'Priorité maximale aux jeux (planificateur multimédia)', help: 'Windows réserve moins de processeur aux tâches de fond (10 % au lieu de 20 %) et lève le bridage réseau pendant le jeu.', key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', values: { SystemResponsiveness: 10, NetworkThrottlingIndex: 4294967295 }, off: { SystemResponsiveness: 20, NetworkThrottlingIndex: 10 } },
  { id: 'gamestask', label: 'Tâche « Games » en priorité haute', help: 'Processeur et carte graphique servent le jeu en premier (profil officiel « Games » de Windows).', key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games', values: { 'GPU Priority': 8, Priority: 6, 'Scheduling Category': 'High', 'SFIO Priority': 'High' }, off: { 'GPU Priority': 8, Priority: 2, 'Scheduling Category': 'Medium', 'SFIO Priority': 'Normal' } },
  { id: 'dosvc', label: 'Partage des mises à jour avec d’autres PC coupé', help: 'Windows n’envoie plus tes mises à jour à des inconnus sur Internet (bande passante gardée pour le jeu).', key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization', values: { DODownloadMode: 0 }, off: { DODownloadMode: null } },
  { id: 'telemetry', label: 'Télémétrie réduite au minimum', help: 'Windows envoie seulement les données obligatoires (moins d’activité en fond).', key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', values: { AllowTelemetry: 1 }, off: { AllowTelemetry: null } },
  { id: 'fth', label: 'Coupure des applis qui plantent en boucle désactivée', help: 'Le « Fault Tolerant Heap » ralentit définitivement un jeu qui a planté quelques fois : on le coupe.', key: 'HKLM\\SOFTWARE\\Microsoft\\FTH', values: { Enabled: 0 }, off: { Enabled: 1 } },
  { id: 'throttle', label: 'Bridage d’énergie des programmes coupé', help: 'Windows ne ralentit plus les programmes « en arrière-plan » (souvent les jeux en plein écran avec un 2e écran). Plus de consommation sur portable.', key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling', values: { PowerThrottlingOff: 1 }, off: { PowerThrottlingOff: null } },
  { id: 'consumer', label: 'Applis installées toutes seules bloquées', help: 'Windows n’installe plus de jeux et applis sponsorisés (debloat).', key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', values: { DisableWindowsConsumerFeatures: 1 }, off: { DisableWindowsConsumerFeatures: null } },
  { id: 'widgets', label: 'Widgets (actualités) désactivés', help: 'Le panneau d’actualités ne tourne plus en fond (mémoire et Internet gardés pour le jeu).', key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Dsh', values: { AllowNewsAndInterests: 0 }, off: { AllowNewsAndInterests: null } },
  { id: 'activity', label: 'Historique d’activité non envoyé', help: 'Windows n’enregistre plus tes activités pour la chronologie (confidentialité).', key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', values: { PublishUserActivities: 0, UploadUserActivities: 0 }, off: { PublishUserActivities: null, UploadUserActivities: null } },
];
// Réglages utilisateur en plus (sans droits administrateur)
GAME_TWEAKS.push(
  { id: 'startdelay', label: 'Démarrage des applis sans délai', help: 'Windows attend quelques secondes avant de lancer les applis du démarrage : on supprime cette attente.', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize', values: { StartupDelayInMSec: 0 }, off: { StartupDelayInMSec: 10000 } },
  { id: 'sticky', label: 'Touches rémanentes désactivées en jeu', help: 'Fini la fenêtre qui sort le jeu quand tu appuies 5 fois sur Maj (touches rémanentes et touches filtres).', key: 'HKCU\\Control Panel\\Accessibility\\StickyKeys', values: { Flags: '506' }, off: { Flags: '510' }, extra: { key: 'HKCU\\Control Panel\\Accessibility\\Keyboard Response', values: { Flags: '122' }, off: { Flags: '126' } } },
  { id: 'adid', label: 'Identifiant de publicité coupé', help: 'Les applis ne te suivent plus pour la pub (confidentialité).', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', values: { Enabled: 0 }, off: { Enabled: 1 } },
  { id: 'tailored', label: 'Expériences personnalisées coupées', help: 'Windows n’utilise plus tes données de diagnostic pour des conseils et des pubs.', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', values: { TailoredExperiencesWithDiagnosticDataEnabled: 0 }, off: { TailoredExperiencesWithDiagnosticDataEnabled: 1 } },
  { id: 'bing', label: 'Recherche Bing du menu Démarrer coupée', help: 'La recherche de Windows reste sur ton PC : plus rapide, moins d’Internet en fond.', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', values: { BingSearchEnabled: 0 }, off: { BingSearchEnabled: 1 } },
  { id: 'copilot', label: 'Copilot de Windows désactivé', help: 'Un programme en moins qui tourne en fond (debloat).', key: 'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', values: { TurnOffWindowsCopilot: 1 }, off: { TurnOffWindowsCopilot: 0 } },
  { id: 'gamebartips', label: 'Astuces de la Game Bar au lancement coupées', help: 'Plus de petite fenêtre Xbox au début des parties.', key: 'HKCU\\Software\\Microsoft\\GameBar', values: { ShowStartupPanel: 0 }, off: { ShowStartupPanel: 1 } },
  { id: 'menudelay', label: 'Menus instantanés', help: 'Les menus s’ouvrent sans attendre (400 ms → 50 ms).', optional: true, key: 'HKCU\\Control Panel\\Desktop', values: { MenuShowDelay: '50' }, off: { MenuShowDelay: '400' } },
);

const HIGH_PERF = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const ULTIMATE = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e';

/** État des réglages système (lecture du registre : pas besoin d'administrateur). */
export async function systemTweakStates() {
  const list = [];
  for (const t of SYSTEM_TWEAKS) {
    const cur = win ? await readKey(t.key) : {};
    const on = tweakApplied(t, cur);
    if (t.retired && !on) continue;
    list.push({ id: t.id, label: t.label, help: t.help, reboot: Boolean(t.reboot), on, ...(t.retired ? { retired: t.retired } : {}) });
  }
  const scheme = win ? String((await run('powercfg', ['/getactivescheme'], { windowsHide: true }).catch(() => null))?.stdout ?? '') : '';
  const hib = win ? await readKey('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power') : {};
  list.push({ id: 'power', label: 'Mode d’alimentation « Performances optimales »', help: 'Le processeur reste à sa fréquence maximale, sans temps de réveil. Conseillé sur PC fixe (consomme plus sur portable).', on: scheme.toLowerCase().includes(ULTIMATE) || /performances optimales|ultimate/i.test(scheme) || scheme.toLowerCase().includes(HIGH_PERF) });
  list.push({ id: 'hibernate', label: 'Veille prolongée désactivée', help: 'Supprime le fichier hiberfil.sys (souvent 6 à 25 Go sur le disque système). À éviter sur portable.', on: String(hib.HibernateEnabled ?? '') === '0' });
  return list;
}

const regLine = (key, name, v) => (v === null
  ? `reg delete "${key}" /v "${name}" /f`
  : `reg add "${key}" /v "${name}" /t ${typeof v === 'number' ? 'REG_DWORD' : 'REG_SZ'} /d "${v}" /f`);

/** Script administrateur fixe (tiré de nos tables, jamais du texte de l'interface), avec point de restauration avant. */
export function systemTweakScript(changes) {
  const lines = ["$ErrorActionPreference='SilentlyContinue'", "Checkpoint-Computer -Description 'History - avant optimisation' -RestorePointType MODIFY_SETTINGS"];
  for (const { id, on } of changes) {
    const t = SYSTEM_TWEAKS.find((x) => x.id === id);
    if (t) for (const [k, v] of Object.entries(on ? t.values : t.off)) lines.push(regLine(t.key, k, v));
    if (id === 'power') lines.push(on ? `powercfg -duplicatescheme ${ULTIMATE} ${ULTIMATE} | Out-Null; powercfg /setactive ${ULTIMATE}; if($LASTEXITCODE -ne 0){ powercfg /setactive ${HIGH_PERF} }` : `powercfg /setactive ${BALANCED}`);
    if (id === 'hibernate') lines.push(on ? 'powercfg /hibernate off' : 'powercfg /hibernate on');
  }
  return lines.join('\n');
}
// ===================== Tâches longues en administrateur, avec leur vrai pourcentage =====================
/** Dernier pourcentage écrit par un outil de Windows (DISM « [===  45.2% ] », SFC « 45 % »), en UTF-16 ou non. */
export function lastPercent(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf ?? ''));
  const text = b.length > 1 && b[1] === 0 ? b.toString('utf16le') : b.toString('latin1');
  const all = [...text.matchAll(/(\d{1,3}(?:[.,]\d+)?)\s*%/g)].map((m) => Number(m[1].replace(',', '.'))).filter((n) => n <= 100);
  return all.length ? all.at(-1) : null;
}
/** Début commun : W écrit l'état (étape, part de la barre), Run lance un outil en gardant sa sortie (pour son %). */
export const jobHead = (outFile) => String.raw`$ErrorActionPreference='Continue'
$f='${outFile.replace(/'/g, "''")}'
function W($o){ $o | ConvertTo-Json -Compress | Set-Content -LiteralPath $f -Encoding UTF8 }
function Run($step,$base,$span,$exe,[string[]]$a){ $log="$f.$step.log"; W @{ step=$step; base=$base; span=$span; log=$log }; Start-Process -FilePath $exe -ArgumentList $a -RedirectStandardOutput $log -Wait -NoNewWindow }`;
/** Lance un script administrateur et lit son avancement chaque seconde (continue même si la fenêtre est fermée). */
async function elevatedJob(script, outFile, onProgress = () => {}, logs = []) {
  const read = async () => { const t = await readFile(outFile, 'utf8').catch(() => null); try { return t ? JSON.parse(t.replace(/^\uFEFF/, '')) : null; } catch { return null; } };
  const poll = setInterval(async () => {
    const st = await read(); if (!st) return;
    const p = st.log ? lastPercent(await readFile(st.log).catch(() => '')) : null;
    onProgress({ ...st, pct: Math.min(100, Math.round((st.base ?? 0) + ((st.span ?? 0) * (p ?? 0)) / 100)) });
  }, 1000);
  const ok = await runElevated(script);
  clearInterval(poll);
  const s = await read();
  for (const f of [outFile, ...logs.map((l) => `${outFile}.${l}.log`)]) await rm(f, { force: true }).catch(() => {});
  return { ok, s };
}
function runElevated(script) {
  if (!win) return Promise.resolve(false);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const outer = `Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}'`;
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', outer], { windowsHide: true, stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}
export async function applySystemTweaks(changes) {
  const valid = changes.filter((c) => SYSTEM_TWEAKS.some((t) => t.id === c.id) || c.id === 'power' || c.id === 'hibernate');
  if (!valid.length) return false;
  return runElevated(systemTweakScript(valid.map((c) => ({ id: c.id, on: Boolean(c.on) }))));
}

// ===================== Stockage : TRIM des SSD, défragmentation des disques durs =====================
export const STORAGE_SCRIPT = String.raw`$v=@(Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' }); $i=0
foreach($x in $v){ W @{ step="Disque $($x.DriveLetter): TRIM (SSD) ou défragmentation (disque dur)"; base=[int](100*$i/[Math]::Max(1,$v.Count)); span=0 }; Optimize-Volume -DriveLetter $x.DriveLetter; $i++ }
W @{ step='done'; base=100; span=0 }`;
export const optimizeStorage = async (outFile, onProgress) => ({ ok: (await elevatedJob(`${jobHead(outFile)}\n${STORAGE_SCRIPT}`, outFile, onProgress)).s?.step === 'done' });

// ===================== Réparation de Windows (DISM + SFC) =====================
/** Vérifie l'image de Windows, la répare si besoin, puis contrôle chaque fichier système (SFC). Résultat écrit dans un fichier. */
export function repairScript(outFile) {
  return `${jobHead(outFile)}
Run 'dism-scan' 0 30 'dism.exe' @('/Online','/Cleanup-Image','/ScanHealth')
$h=(Repair-WindowsImage -Online -CheckHealth).ImageHealthState
$fixed=$false; $b=30
if("$h" -ne 'Healthy'){ Run 'dism-repair' 30 35 'dism.exe' @('/Online','/Cleanup-Image','/RestoreHealth'); $h=(Repair-WindowsImage -Online -CheckHealth).ImageHealthState; $fixed=("$h" -eq 'Healthy'); $b=65 }
Run 'sfc' $b (100-$b) 'sfc.exe' @('/scannow')
$raw=[IO.File]::ReadAllBytes("$f.sfc.log")
$o=if($raw.Length -gt 1 -and $raw[1] -eq 0){ [Text.Encoding]::Unicode.GetString($raw) } else { [Console]::OutputEncoding.GetString($raw) }
$sfc=if($o -match 'did not find|n.a trouv. aucune|n.a d.tect. aucune'){ 'ok' } elseif($o -match 'successfully repaired|a r.par.'){ 'repare' } elseif($o -match 'unable to fix|n.a pas pu'){ 'echec' } else { 'inconnu' }
W @{ step='done'; base=100; span=0; health="$h"; dismFixed=$fixed; sfc=$sfc }`;
}
export async function repairWindows(outFile, onProgress = () => {}) {
  const { ok, s } = await elevatedJob(repairScript(outFile), outFile, onProgress, ['dism-scan', 'dism-repair', 'sfc']);
  if (s?.step !== 'done') return { ok: false, error: ok ? 'Réparation interrompue.' : 'Autorisation administrateur refusée.' };
  return { ok: true, ...s };
}

// ===================== Remettre Windows comme avant =====================
/** Réglages retirés encore actifs (ceux qui peuvent faire bugger les jeux, FiveM en tête). */
export const riskyLeft = (sys, game) => [...sys, ...game].filter((t) => t.retired && t.on);
/**
 * Plan de retour à l'état d'origine : chaque réglage revient à son état d'avant la première optimisation
 * (photo la plus ancienne), sinon à la valeur de Windows.
 */
export function resetPlan(nowSys, nowGame, oldest = null) {
  const was = (list, id) => oldest?.[list]?.find((x) => x.id === id)?.on;
  // Sans photo d'avant, on ne touche pas au mode d'alimentation ni à la veille prolongée (choix possibles de l'utilisateur)
  const target = (list, t) => was(list, t.id) ?? (!oldest && ['power', 'hibernate'].includes(t.id) ? t.on : false);
  return {
    sys: nowSys.filter((t) => t.on !== target('sys', t)).map((t) => ({ id: t.id, on: target('sys', t) })),
    game: nowGame.filter((t) => t.on !== target('game', t)).map((t) => ({ id: t.id, on: target('game', t) })),
  };
}

// ===================== Anciens pilotes graphiques (DriverStore) =====================
// Chaque mise à jour NVIDIA / AMD / Intel laisse l'ancien paquet dans le DriverStore (souvent 1 à 3 Go chacun).
// Aperçu sans droits : dossiers du FileRepository par fabricant, le plus récent est gardé.
const GPU_PKG = /^(nv_dispi?g?|nvhdc|nvlt|nvmii|nvami|nvaci|nvdm|nvbli|u0\d+|iigd_dch|iigd|igdlh64)\.inf_/i;
export async function oldGpuDrivers(root = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'DriverStore', 'FileRepository')) {
  const groups = new Map();
  for (const e of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const m = e.isDirectory() && e.name.match(GPU_PKG); if (!m) continue;
    const st = await stat(path.join(root, e.name)).catch(() => null); if (!st) continue;
    const key = m[1].toLowerCase(); (groups.get(key) ?? groups.set(key, []).get(key)).push({ name: e.name, at: st.mtimeMs });
  }
  const old = [...groups.values()].flatMap((g) => g.sort((a, b) => b.at - a.at).slice(1));
  let bytes = 0;
  for (const o of old) bytes += (await dirBytes(path.join(root, o.name))) ?? 0;
  return { count: old.length, bytes };
}
async function dirBytes(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const f = path.join(dir, e.name);
    n += e.isDirectory() ? await dirBytes(f) : (await stat(f).catch(() => ({ size: 0 }))).size;
  }
  return n;
}
// Suppression : point de restauration, puis pnputil retire chaque pilote d'affichage QUI N'EST PAS UTILISÉ (sans /force : un pilote en service est refusé par Windows)
export const OLD_DRIVERS_SCRIPT = String.raw`W @{ step='Point de restauration'; base=0; span=0 }
Checkpoint-Computer -Description 'History - anciens pilotes graphiques' -RestorePointType MODIFY_SETTINGS
$used = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceClass -eq 'DISPLAY' } | ForEach-Object { $_.InfName })
$old = @(Get-WindowsDriver -Online | Where-Object { $_.ClassName -eq 'Display' -and $used -notcontains $_.Driver })
$i=0; foreach($d in $old){ W @{ step="Suppression de $($d.Driver) ($($d.ProviderName) $($d.Version))"; base=[int](100*$i/[Math]::Max(1,$old.Count)); span=0 }; pnputil /delete-driver $d.Driver | Out-Null; $i++ }
W @{ step='Terminé'; base=100; span=0; done=$old.Count }`;
export const cleanOldGpuDrivers = async (outFile, onProgress) => {
  const r = await elevatedJob(`${jobHead(outFile)}\n${OLD_DRIVERS_SCRIPT}`, outFile, onProgress);
  return { ok: r.ok, removed: r.s?.done ?? 0 };
};
