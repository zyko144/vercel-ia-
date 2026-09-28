// Réglages des jeux (touches, sensibilité, graphismes) gardés dans la sauvegarde en ligne et remis sur un autre PC.
// Les chemins sont notés avec leur dossier de base (%LOCALAPPDATA%, %APPDATA%, Documents) : ils marchent sur n'importe quel PC.
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CONFIGS = [
  ['Fortnite', 'local', 'FortniteGame/Saved/Config/WindowsClient/GameUserSettings.ini'],
  ['FiveM', 'appdata', 'CitizenFX/CitizenFX.ini'],
  ['FiveM', 'appdata', 'CitizenFX/fivem.cfg'],
  ['FiveM', 'appdata', 'CitizenFX/gta5_settings.xml'],
  ['GTA V', 'docs', 'Rockstar Games/GTA V/settings.xml'],
  ['Rocket League', 'docs', 'My Games/Rocket League/TAGame/Config/TASystemSettings.ini'],
  ['Rocket League', 'docs', 'My Games/Rocket League/TAGame/Config/TAInput.ini'],
  ['Minecraft', 'appdata', '.minecraft/options.txt'],
];
const MAX = 64 * 1024;
const where = (dirs, base, rel) => (dirs[base] ? path.join(dirs[base], ...rel.split('/')) : null);

/** Lit les fichiers de réglages présents sur ce PC ({ "base/chemin": { game, text, at } }). */
export async function collectConfigs(dirs) {
  const out = {};
  for (const [game, base, rel] of CONFIGS) {
    const file = where(dirs, base, rel);
    const st = file && await stat(file).catch(() => null);
    if (!st?.isFile() || st.size > MAX) continue;
    out[`${base}/${rel}`] = { game, text: await readFile(file, 'utf8'), at: Math.round(st.mtimeMs) };
  }
  return out;
}

/** Garde la version la plus récente de chaque fichier (ce PC ou la sauvegarde). */
export function mergeConfigs(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (v?.text != null && (out[k]?.at ?? 0) < (v.at ?? 0)) out[k] = v;
  return out;
}

/** Remet les réglages sauvegardés (l'ancien fichier est gardé à côté en .history-bak). */
export async function restoreConfigs(dirs, saved = {}) {
  const done = [];
  for (const [key, v] of Object.entries(saved)) {
    const [base, ...rest] = key.split('/');
    const known = CONFIGS.some(([, b, r]) => b === base && r === rest.join('/'));
    const file = known && where(dirs, base, rest.join('/'));
    if (!file || typeof v?.text !== 'string') continue;
    await copyFile(file, `${file}.history-bak`).catch(() => {});
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, v.text);
    done.push(v.game);
  }
  return [...new Set(done)];
}
