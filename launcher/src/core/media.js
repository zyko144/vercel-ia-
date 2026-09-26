// Lecteur en bas de l'appli : le titre joué par Spotify (lu dans le titre de sa fenêtre, « Artiste - Titre »),
// la vraie pochette trouvée sur Deezer (API publique), et les touches multimédia de Windows pour piloter la lecture.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const PLAYERS = ['Spotify', 'Deezer'];

/** « Artiste - Titre » → { artist, title } ; « Spotify Premium » (en pause) → null. */
export function parseTitle(player, windowTitle) {
  const t = String(windowTitle ?? '').trim();
  if (!t || /^(spotify( premium| free)?|deezer)$/i.test(t)) return null;
  const i = t.indexOf(' - ');
  if (i < 1) return null;
  // Spotify écrit « Artiste - Titre » ; Deezer écrit « Titre - Artiste »
  return player === 'Deezer' ? { title: t.slice(0, i), artist: t.slice(i + 3) } : { artist: t.slice(0, i), title: t.slice(i + 3) };
}

export async function nowPlaying() {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Get-Process ${PLAYERS.join(',')} -ErrorAction SilentlyContinue | Where-Object MainWindowTitle | ForEach-Object { $_.ProcessName + '|' + $_.MainWindowTitle }`], { windowsHide: true, timeout: 8000 });
    for (const line of stdout.split(/\r?\n/)) {
      const [proc, ...rest] = line.split('|');
      const player = PLAYERS.find((p) => p.toLowerCase() === proc.trim().toLowerCase());
      const song = player && parseTitle(player, rest.join('|'));
      if (song) return { player, ...song, playing: true };
    }
    const open = PLAYERS.find((p) => stdout.toLowerCase().includes(p.toLowerCase()));
    return open ? { player: open, playing: false } : null;
  } catch {
    return null;
  }
}

const covers = new Map();
/** La vraie pochette de l'album (API publique de Deezer, sans clé). */
export async function coverOf(artist, title, fetchImpl = fetch) {
  const key = `${artist}|${title}`;
  if (covers.has(key)) return covers.get(key);
  const data = await fetchImpl(`https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${artist}" track:"${title}"`)}&limit=1`, { signal: AbortSignal.timeout(6000) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const hit = data?.data?.[0];
  const cover = hit?.album?.cover_big ?? hit?.album?.cover_medium ?? null;
  covers.set(key, cover);
  if (covers.size > 200) covers.delete(covers.keys().next().value);
  return cover;
}

// Touches multimédia de Windows (codes fixes : aucune donnée de l'interface n'entre dans la commande)
const KEYS = { play: 0xB3, pause: 0xB3, toggle: 0xB3, next: 0xB0, previous: 0xB1, volup: 0xAF, voldown: 0xAE, mute: 0xAD };
export async function mediaKey(name) {
  const vk = KEYS[name];
  if (vk === undefined || process.platform !== 'win32') return false;
  const ps = `$s='[DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, UIntPtr e);';Add-Type -MemberDefinition $s -Name K -Namespace W;[W.K]::keybd_event(${vk},0,1,[UIntPtr]::Zero);[W.K]::keybd_event(${vk},0,3,[UIntPtr]::Zero)`;
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }).catch(() => null);
  return true;
}
