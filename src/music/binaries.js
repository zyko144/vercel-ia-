// Outils externes de la musique : ffmpeg (paquet npm) et yt-dlp (téléchargé depuis GitHub au démarrage, mis à jour chaque jour).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

const BIN_DIR = path.resolve('bin');
const isWindows = process.platform === 'win32';
const UPDATE_EVERY_MS = 24 * 60 * 60_000;

const RELEASE_ASSET = isWindows
  ? 'yt-dlp.exe'
  : process.platform === 'darwin'
    ? 'yt-dlp_macos'
    : process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';

export const YTDLP_PATH = process.env.YTDLP_PATH || path.join(BIN_DIR, isWindows ? 'yt-dlp.exe' : 'yt-dlp');
export const FFMPEG_PATH = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
export const COOKIES_PATH = path.join(BIN_DIR, 'youtube-cookies.txt');

let ready = null;

async function download(url, destination) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`téléchargement impossible (HTTP ${res.status})`);
  const temp = `${destination}.part`;
  await fs.promises.writeFile(temp, Buffer.from(await res.arrayBuffer()));
  await fs.promises.rename(temp, destination);
  if (!isWindows) await fs.promises.chmod(destination, 0o755);
}

function selfUpdate() {
  const child = spawn(YTDLP_PATH, ['-U'], { windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.on('close', () => {
    const now = new Date();
    fs.promises.utimes(YTDLP_PATH, now, now).catch(() => {});
  });
}

/** Prépare yt-dlp (et les cookies YouTube s'il y en a). Appelé au démarrage puis avant chaque utilisation. */
export function ensureBinaries() {
  ready ??= (async () => {
    await fs.promises.mkdir(BIN_DIR, { recursive: true });

    if (!fs.existsSync(YTDLP_PATH)) {
      console.log('[musique] Téléchargement de yt-dlp…');
      await download(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${RELEASE_ASSET}`, YTDLP_PATH);
      console.log('[musique] yt-dlp prêt ✅');
    } else if (Date.now() - fs.statSync(YTDLP_PATH).mtimeMs > UPDATE_EVERY_MS) {
      selfUpdate();
    }

    // Cookies YouTube (optionnel) : contenu du fichier cookies.txt, brut ou en base64
    const cookies = process.env.YTDLP_COOKIES?.trim();
    if (cookies) {
      const text = cookies.includes('\t') ? cookies : Buffer.from(cookies, 'base64').toString('utf8');
      await fs.promises.writeFile(COOKIES_PATH, text);
    }
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
