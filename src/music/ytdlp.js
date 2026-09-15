// Petite interface autour de yt-dlp : recherche, playlists et récupération du flux audio.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { COOKIES_PATH, YTDLP_PATH, ensureBinaries } from './binaries.js';

const META_TEMPLATE = '%(.{id,title,duration,channel,uploader,artist,track,thumbnail,webpage_url,extractor_key,live_status,acodec,format_id,protocol})j';
// Jamais les extraits de 30 s (SoundCloud Go+)
const AUDIO_FORMAT = 'bestaudio[acodec=opus][format_id!*=preview]/bestaudio[format_id!*=preview]/best[format_id!*=preview]';
// Autres "clients" YouTube essayés quand YouTube demande de prouver qu'on n'est pas un robot
const FALLBACK_CLIENTS = 'youtube:player_client=tv_simply,tv,web_embedded,mweb';

export const MUSIC_PROXY = process.env.MUSIC_PROXY?.trim() || '';

export class MusicError extends Error {
  constructor(message, { blocked = false } = {}) {
    super(message);
    this.blocked = blocked;
  }
}

const isBotCheck = (stderr) => /Sign in to confirm|not a bot|confirm you.re not/i.test(stderr);

function explain(stderr) {
  if (isBotCheck(stderr)) return 'YouTube bloque le serveur (vérification anti-bot)';
  if (/DRM/i.test(stderr)) return 'ce son est protégé (DRM)';
  if (/Requested format is not available/i.test(stderr)) return 'seul un extrait est disponible sur cette plateforme';
  if (/Private video|private/i.test(stderr)) return 'la vidéo est privée';
  if (/age|inappropriate/i.test(stderr)) return 'la vidéo est limitée par âge';
  if (/geo|country/i.test(stderr)) return "le son n'est pas disponible dans ce pays";
  if (/unavailable|not available|removed|404/i.test(stderr)) return "le son n'est pas disponible";
  return 'lecture impossible';
}

function run(args, timeout) {
  const baseArgs = [
    '--ignore-config', '--no-warnings', '--no-progress',
    '--js-runtimes', `node:${process.execPath}`,
    ...(fs.existsSync(COOKIES_PATH) ? ['--cookies', COOKIES_PATH] : []),
    ...(MUSIC_PROXY ? ['--proxy', MUSIC_PROXY] : []),
  ];
  return new Promise((resolve) => {
    const child = spawn(YTDLP_PATH, [...baseArgs, ...args], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: err.message, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

export async function ytdlp(args, { timeout = 60_000 } = {}) {
  await ensureBinaries();
  let result = await run(args, timeout);

  // Blocage anti-bot : on réessaie avec d'autres clients YouTube et en IPv4
  if (result.code !== 0 && !result.stdout.trim() && isBotCheck(result.stderr)) {
    result = await run(['--force-ipv4', '--extractor-args', FALLBACK_CLIENTS, ...args], timeout);
  }

  if (result.code === 0 || result.stdout.trim()) return result.stdout;
  if (result.timedOut) throw new MusicError('la recherche a pris trop de temps');
  if (result.stderr) console.warn('[yt-dlp]', result.stderr.trim().split('\n').slice(-2).join(' | '));
  throw new MusicError(explain(result.stderr), { blocked: isBotCheck(result.stderr) });
}

/**
 * Récupère les infos + l'URL du flux audio.
 * @param {string} target URL ou recherche (ex : "ytsearch1:...")
 * @param {{ firstResult?: boolean }} [opts] firstResult = prendre le 1er résultat d'une recherche
 */
export async function extractAudio(target, { firstResult = false } = {}) {
  const out = await ytdlp([
    '-f', AUDIO_FORMAT,
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

/** Liste une playlist complète (ou une recherche) sans extraire chaque son. */
export async function flatPlaylist(target, limit = 5000) {
  const out = await ytdlp(['--flat-playlist', '-J', '--playlist-items', `1:${limit}`, target], { timeout: 180_000 });
  return JSON.parse(out);
}

/** Date d'expiration d'une URL de flux (YouTube : expire=, SoundCloud : expires=). */
export function streamExpiry(url) {
  const match = url.match(/[?&/]expires?[=/](\d{9,})/);
  return match ? Number(match[1]) * 1000 : Date.now() + 30 * 60_000;
}
