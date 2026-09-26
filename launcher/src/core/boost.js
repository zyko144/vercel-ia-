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
    const ok = await run('taskkill.exe', ['/IM', p.exe], { windowsHide: true, timeout: 10_000 }).then(() => true).catch(() => false);
    if (ok) closed.push(p);
  }
  return closed;
}
