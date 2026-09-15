// Petite interface autour de yt-dlp : recherche, playlists et récupération du flux audio.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { COOKIES_PATH, YTDLP_PATH, ensureBinaries } from './binaries.js';

const META_TEMPLATE = '%(.{id,title,duration,channel,uploader,artist,track,thumbnail,webpage_url,extractor_key,live_status})j';

export class MusicError extends Error {}

function explain(stderr) {
  if (/Sign in to confirm|not a bot/i.test(stderr)) return 'YouTube bloque le serveur (vérification anti-bot)';
  if (/DRM/i.test(stderr)) return 'ce son est protégé (DRM)';
  if (/Private video|private/i.test(stderr)) return 'la vidéo est privée';
  if (/age|inappropriate/i.test(stderr)) return 'la vidéo est limitée par âge';
  if (/unavailable|not available|removed|404/i.test(stderr)) return "le son n'est pas disponible";
  if (/geo|country/i.test(stderr)) return "le son n'est pas disponible dans ce pays";
  return 'lecture impossible';
}

export async function ytdlp(args, { timeout = 45_000 } = {}) {
  await ensureBinaries();
  const baseArgs = [
    '--ignore-config', '--no-warnings', '--no-progress',
    '--js-runtimes', `node:${process.execPath}`,
    ...(fs.existsSync(COOKIES_PATH) ? ['--cookies', COOKIES_PATH] : []),
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP_PATH, [...baseArgs, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new MusicError('la recherche a pris trop de temps'));
    }, timeout);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || stdout.trim()) return resolve(stdout);
      if (stderr) console.warn('[yt-dlp]', stderr.trim().split('\n').slice(-2).join(' | '));
      reject(new MusicError(explain(stderr)));
    });
  });
}

/**
 * Récupère les infos + l'URL du flux audio.
 * @param {string} target URL ou recherche (ex : "ytsearch1:...")
 * @param {{ firstResult?: boolean }} [opts] firstResult = prendre le 1er résultat d'une recherche
 */
export async function extractAudio(target, { firstResult = false } = {}) {
  const out = await ytdlp([
    '-f', 'bestaudio[acodec=opus]/bestaudio/best',
    '--print', META_TEMPLATE,
    '--print', 'urls',
    ...(firstResult ? ['--playlist-items', '1'] : ['--no-playlist']),
    target,
  ]);
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  const metaLine = lines.find((l) => l.startsWith('{'));
  const streamUrl = lines.find((l) => /^https?:\/\//.test(l));
  if (!metaLine || !streamUrl) throw new MusicError('aucun résultat');
  return { meta: JSON.parse(metaLine), streamUrl };
}

/** Liste une playlist (ou une recherche) sans extraire chaque son. */
export async function flatPlaylist(target, limit = 200) {
  const out = await ytdlp(['--flat-playlist', '-J', '--playlist-items', `1:${limit}`, target], { timeout: 90_000 });
  return JSON.parse(out);
}

/** Date d'expiration d'une URL de flux (YouTube : expire=, SoundCloud : expires=). */
export function streamExpiry(url) {
  const match = url.match(/[?&/]expires?[=/](\d{9,})/);
  return match ? Number(match[1]) * 1000 : Date.now() + 30 * 60_000;
}
