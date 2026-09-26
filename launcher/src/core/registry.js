// Programmes installés sous Windows : les clés « Uninstall » du registre (lues avec reg.exe, sans module natif).
// On y trouve les applis (Spotify, Discord…) et les jeux des autres launchers (Riot, Ubisoft, EA, GOG, Battle.net…).
import { brandOf } from './brands.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

/** Lit la sortie de « reg query … /s » : une entrée par sous-clé, avec ses valeurs. */
export function parseRegQuery(text) {
  const entries = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^HKEY_/.test(line)) {
      cur = { key: line.trim(), values: {} };
      entries.push(cur);
      continue;
    }
    const m = line.match(/^\s{2,}(.+?)\s{2,}(REG_\w+)\s{2,}(.*)$/) ?? line.match(/^\s{2,}(.+?)\s{2,}(REG_\w+)$/);
    if (!m || !cur) continue;
    let value = (m[3] ?? '').trim();
    if (m[2] === 'REG_DWORD' || m[2] === 'REG_QWORD') value = Number.parseInt(value, 16);
    cur.values[m[1].trim()] = value;
  }
  return entries;
}

export async function readRegistry(key) {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await run('reg', ['query', key, '/s'], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return parseRegQuery(stdout);
  } catch {
    return [];
  }
}

/** Valeur simple d'une clé (ex. le dossier de Steam). */
export async function readRegValue(key, name) {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await run('reg', ['query', key, '/v', name], { windowsHide: true });
    return parseRegQuery(stdout)[0]?.values[name] ?? null;
  } catch {
    return null;
  }
}

// ===================== Classement =====================

const NOISE = /Microsoft Visual C\+\+|\.NET (Framework|Runtime|Desktop)|Redistributable|Runtime|Driver|SDK|Update for|Hotfix|\bKB\d{6,}|PhysX|Realtek|Chipset|WebView2|Python Launcher|Windows Software Development|DirectX|Vulkan|OpenAL|Microsoft Update Health|Language Pack|Pack de langue|Visual Studio Installer|vs_|Intel\(R\)|NVIDIA (Graphics|HD Audio|FrameView|USB)|AMD (Software|Settings)|Microsoft Edge Update|Teams Machine-Wide|Office 16 Click-to-Run/i;
const MUSIC = /^(spotify|deezer|apple music|itunes|tidal|soundcloud|amazon music|youtube music|qobuz)/i;
const VIDEO = /^(netflix|vlc|obs studio|plex|kodi|twitch|disney\+|prime video)/i;
const CHAT = /^(discord|whatsapp|telegram|signal|teamspeak|skype|zoom|slack|messenger)/i;
const LAUNCHERS = /^(steam|epic games launcher|ubisoft connect|ea app|ea desktop|origin|battle\.net|riot client|gog galaxy|rockstar games launcher|xbox|amazon games)$/i;
const GAME_PUBLISHERS = /riot games|ubisoft|electronic arts|blizzard|gog\.com|rockstar games|mojang|bethesda|cd projekt|square enix|bandai namco|capcom|sega|2k|activision|valve|hoyoverse|mihoyo|cognosphere|wargaming|bungie|embark|kuro games|epic games(?!.*launcher)/i;
const GAME_PATHS = /\\(games|riot games|gog galaxy\\games|ubisoft game launcher\\games|ea games|origin games|battle\.net|rockstar games|xboxgames)\\/i;

export function categoryOf(name) {
  if (MUSIC.test(name)) return 'musique';
  if (VIDEO.test(name)) return 'video';
  if (CHAT.test(name)) return 'discussion';
  return 'appli';
}

const exeFrom = (icon) => {
  const p = String(icon ?? '').replace(/^"|"$/g, '').replace(/"?,\s*-?\d+$/, '').replace(/^"|"$/g, '');
  return /\.exe$/i.test(p) && !/unins|setup|install|update/i.test(p.split('\\').pop()) ? p : null;
};

/** Transforme les entrées du registre en éléments de bibliothèque (sans doublons ni composants système). */
export function programsFromRegistry(entries) {
  const seen = new Map();
  for (const { key, values: v } of entries) {
    const name = String(v.DisplayName ?? '').trim();
    if (!name || v.SystemComponent === 1 || v.ParentKeyName || /update|hotfix|security/i.test(v.ReleaseType ?? '') || NOISE.test(name)) continue;
    const uninstall = String(v.QuietUninstallString || v.UninstallString || '');
    // Jeux Steam et Epic : déjà trouvés par leurs propres scanners
    if (/steam:\/\/uninstall|Steam App \d+/i.test(`${uninstall} ${key}`) || /EpicGamesLauncher.*-uninstall|com\.epicgames/i.test(uninstall)) continue;
    const installDir = String(v.InstallLocation ?? '').replace(/^"|"$/g, '');
    const publisher = String(v.Publisher ?? '');
    const launcher = LAUNCHERS.test(name);
    const game = !launcher && (GAME_PUBLISHERS.test(publisher) || GAME_PATHS.test(`${installDir}\\`) || /^Riot Game /i.test(key.split('\\').pop()));
    const source = /rockstar/i.test(publisher) ? 'rockstar' : /riot/i.test(publisher) ? 'riot' : /ubisoft/i.test(publisher) ? 'ubisoft' : /electronic arts/i.test(publisher) ? 'ea' : /blizzard/i.test(publisher) ? 'battlenet' : /gog/i.test(publisher) ? 'gog' : 'pc';
    const item = {
      id: `reg:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, source, kind: launcher ? 'launcher' : game ? 'game' : 'app',
      category: game ? 'jeu' : categoryOf(name), name, publisher, installed: true, installDir,
      exe: exeFrom(v.DisplayIcon), icon: String(v.DisplayIcon ?? '').replace(/"?,\s*-?\d+$/, '').replace(/^"|"$/g, '') || null,
      size: Number(v.EstimatedSize ?? 0) * 1024, minutes: 0, lastPlayed: 0, art: {},
      uninstallCmd: uninstall || null, version: v.DisplayVersion ?? null, known: launcher || game || Boolean(brandOf(name)), brand: game ? null : brandOf(name),
    };
    // Même programme listé en 32 et 64 bits : on garde l'entrée la plus complète
    const prev = seen.get(item.id);
    if (!prev || (!prev.exe && item.exe)) seen.set(item.id, item);
  }
  return [...seen.values()];
}
