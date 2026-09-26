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
  { id: 'background', label: 'Applis Windows en arrière-plan coupées', help: 'Moins de programmes qui tournent pour rien (mémoire et processeur).', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', values: { GlobalUserDisabled: 1 }, off: { GlobalUserDisabled: 0 } },
  { id: 'ads', label: 'Pubs et suggestions de Windows coupées', help: 'Plus d’applis installées toutes seules ni de suggestions dans le menu Démarrer.', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', values: { SilentInstalledAppsEnabled: 0, SystemPaneSuggestionsEnabled: 0, 'SubscribedContent-338388Enabled': 0, 'SubscribedContent-338389Enabled': 0 }, off: { SilentInstalledAppsEnabled: 1, SystemPaneSuggestionsEnabled: 1, 'SubscribedContent-338388Enabled': 1, 'SubscribedContent-338389Enabled': 1 } },
  { id: 'transparency', label: 'Effets de transparence coupés', help: 'Un peu moins de travail pour la carte graphique (look plus simple).', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', values: { EnableTransparency: 0 }, off: { EnableTransparency: 1 }, optional: true },
  { id: 'visualfx', label: 'Animations de Windows réduites', help: 'Windows plus réactif sur les petits PC (look plus simple).', key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', values: { VisualFXSetting: 2 }, off: { VisualFXSetting: 0 }, optional: true },
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
  if (!win) return GAME_TWEAKS.map((t) => ({ id: t.id, label: t.label, help: t.help, optional: Boolean(t.optional), on: false }));
  const out = [];
  for (const t of GAME_TWEAKS) out.push({ id: t.id, label: t.label, help: t.help, optional: Boolean(t.optional), on: tweakApplied(t, await readKey(t.key)) });
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

// Script fixe (aucune donnée de l'interface) lancé avec la fenêtre d'autorisation de Windows
export const DEEP_CLEAN_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  "Remove-Item \"$env:windir\\Temp\\*\" -Recurse -Force",
  'Stop-Service wuauserv -Force; Remove-Item "$env:windir\\SoftwareDistribution\\Download\\*" -Recurse -Force; Start-Service wuauserv',
  'Delete-DeliveryOptimizationCache -Force',
  "Remove-Item \"$env:ProgramData\\Microsoft\\Windows\\WER\\*\" -Recurse -Force",
  'Clear-DnsClientCache',
  'Get-Volume -DriveLetter ($env:SystemDrive.TrimEnd(\':\')) | Optimize-Volume -ReTrim',
  'Dism.exe /Online /Cleanup-Image /StartComponentCleanup /Quiet',
].join('; ');

export async function freeSpace(drive = (process.env.SystemDrive ?? 'C:') + '\\') {
  const s = await statfs(drive).catch(() => null);
  return s ? s.bavail * s.bsize : null;
}
export async function diskSize(drive = (process.env.SystemDrive ?? 'C:') + '\\') {
  const s = await statfs(drive).catch(() => null);
  return s ? s.blocks * s.bsize : null;
}
/** Lance le nettoyage profond en administrateur (Windows demande l'autorisation) et attend la fin. */
export function deepClean() {
  if (!win) return Promise.resolve(false);
  const encoded = Buffer.from(DEEP_CLEAN_SCRIPT, 'utf16le').toString('base64');
  const outer = `Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','${encoded}'`;
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', outer], { windowsHide: true, stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}
