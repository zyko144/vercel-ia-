// Boost de jeu : pendant une partie, Windows passe en « Performances élevées » et les applis choisies sont fermées
// (fermeture normale, comme la croix : rien n'est tué de force). Tout est remis comme avant à la fin de la partie.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const HIGH_PERFORMANCE = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Applis qu'on peut proposer de fermer (jamais Steam, Epic, Discord ou la musique : utiles pendant une partie)
export const BOOST_APPS = [
  { id: 'chrome', label: 'Google Chrome', exe: 'chrome.exe' }, { id: 'edge', label: 'Microsoft Edge', exe: 'msedge.exe' },
  { id: 'firefox', label: 'Firefox', exe: 'firefox.exe' }, { id: 'opera', label: 'Opera / Opera GX', exe: 'opera.exe' },
  { id: 'brave', label: 'Brave', exe: 'brave.exe' }, { id: 'onedrive', label: 'OneDrive', exe: 'onedrive.exe' },
  { id: 'dropbox', label: 'Dropbox', exe: 'dropbox.exe' }, { id: 'gdrive', label: 'Google Drive', exe: 'googledrivefs.exe' },
  { id: 'adobe', label: 'Adobe Creative Cloud', exe: 'creative cloud.exe' }, { id: 'teams', label: 'Microsoft Teams', exe: 'ms-teams.exe' },
  { id: 'office', label: 'Word / Excel / PowerPoint', exe: ['winword.exe', 'excel.exe', 'powerpnt.exe'] },
  { id: 'epicbg', label: 'Epic Games (si le jeu n’en a pas besoin)', exe: 'epicgameslauncher.exe' },
];

/** Numéro du mode d'alimentation actif (sortie de « powercfg /getactivescheme »). */
export function parseScheme(text) {
  return String(text ?? '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase() ?? null;
}

/** Ce qu'il faut fermer : les applis choisies qui tournent vraiment, avec leur chemin (pour les rouvrir après). */
export function boostPlan(runningPaths, chosen) {
  const wanted = new Set(BOOST_APPS.filter((a) => chosen.includes(a.id)).flatMap((a) => [a.exe].flat()));
  const byName = new Map();
  for (const p of runningPaths) {
    if (!p.includes('\\')) continue; // sans chemin : impossible à rouvrir après
    const name = path.win32.basename(p).toLowerCase();
    if (wanted.has(name) && !byName.has(name)) byName.set(name, p);
  }
  return [...byName].map(([exe, full]) => ({ exe, path: full }));
}

async function powercfg(args) {
  if (process.platform !== 'win32') return '';
  return (await run('powercfg.exe', args, { windowsHide: true, timeout: 10_000 }).catch(() => ({ stdout: '' }))).stdout;
}
export const activeScheme = async () => parseScheme(await powercfg(['/getactivescheme']));
export async function setScheme(guid) {
  if (!GUID.test(String(guid))) return false;
  await powercfg(['/setactive', guid]);
  return true;
}

/** Fermeture normale (message de fermeture, pas de /F) : l'appli peut sauvegarder. */
export async function closeApps(plan) {
  if (process.platform !== 'win32') return [];
  const closed = [];
  for (const p of plan) {
    if (!/^[\w .()-]+\.exe$/i.test(p.exe)) continue;
    // OneDrive n'a pas de fenêtre : sa commande officielle /shutdown met la synchro en pause proprement
    const ok = await (p.exe === 'onedrive.exe' ? run(p.path, ['/shutdown'], { windowsHide: true, timeout: 10_000 }) : run('taskkill.exe', ['/IM', p.exe], { windowsHide: true, timeout: 10_000 })).then(() => true).catch(() => false);
    if (ok) closed.push(p);
  }
  return closed;
}

// Priorité au jeu (réversible, rien d'installé) : le jeu passe en priorité « au-dessus de la normale » (jamais
// « temps réel », qui fige souris et son), les navigateurs en retrait pour ne pas voler de processeur, les tâches
// Windows inutiles en jeu sont fermées (elles se relancent seules quand on en a besoin), et Windows mémorise
// d'utiliser la carte graphique puissante pour ce jeu (portables à deux cartes : gros gain de FPS dès la partie suivante).
export const BROWSERS = ['chrome', 'msedge', 'firefox', 'opera', 'brave'];
export const JUNK = ['Widgets', 'WidgetService', 'PhoneExperienceHost', 'YourPhone'];
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
export function tuneScript(gamePaths) {
  const paths = gamePaths.filter((p) => /^[a-z]:\\[^"<>|?*\r\n]+\.exe$/i.test(p));
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    `$g=@(${paths.map(q).join(',')}); Get-Process | Where-Object { $g -contains $_.Path.ToLower() } | ForEach-Object { $_.PriorityClass='AboveNormal' }`,
    `Get-Process ${BROWSERS.join(',')} | ForEach-Object { $_.PriorityClass='BelowNormal' }`,
    `Stop-Process -Name ${JUNK.join(',')} -Force`,
    "$k='HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'; if(!(Test-Path $k)){ New-Item $k -Force | Out-Null }",
    // Seulement si rien n'est déjà choisi pour ce jeu : on respecte un réglage fait à la main
    `foreach($p in $g){ if($null -eq (Get-ItemProperty $k).$p){ New-ItemProperty $k -Name $p -Value 'GpuPreference=2;' -Force | Out-Null } }`,
  ].join('\n');
}
export const untuneScript = () => `$ErrorActionPreference='SilentlyContinue'\nGet-Process ${BROWSERS.join(',')} | ForEach-Object { $_.PriorityClass='Normal' }`;

// Qui a volé du processeur pendant la partie (cause probable d'un freeze) : temps processeur de chaque programme,
// comparé d'une mesure à l'autre. Le jeu et Windows lui-même sont ignorés.
export const CPU_SCRIPT = "Get-Process | ForEach-Object { \"$($_.Name)|$([math]::Round($_.CPU, 1))\" }";
const SYSTEM = /^(idle|system|dwm|csrss|audiodg|registry|memory compression|wininit|services|lsass|smss|history launcher|electron|powershell)$/i;
export const parseCpu = (text) => new Map(String(text).split(/\r?\n/).map((l) => l.split('|')).filter((x) => x.length === 2 && x[1] !== '').map(([n, c]) => [n.trim(), Number(c.replace(',', '.'))]));
/** Programmes qui ont pris au moins `min` % du processeur total entre deux mesures (hors jeu et Windows). */
export function cpuHogs(prev, cur, seconds, cores, ignore = [], min = 25) {
  const skip = new Set(ignore.map((n) => n.toLowerCase()));
  const out = [];
  for (const [name, c] of cur) {
    const p = prev.get(name);
    if (p == null || SYSTEM.test(name) || skip.has(name.toLowerCase())) continue;
    const pct = Math.round(((c - p) / (seconds * cores)) * 100);
    if (pct >= min) out.push({ name, pct });
  }
  return out;
}
