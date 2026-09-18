// Fabrique le GIF du bilan du tribunal : les noms apparaissent un par un sur le tableau du décret.
// Le texte est écrit avec des sous-titres stylés (libass) : le filtre « drawtext » n'existe plus dans ffmpeg 7.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FFMPEG_PATH } from '../music/binaries.js';

const WIDTH = 480;
const HEIGHT = 300;
const FPS = 2; // le texte apparaît par paliers : inutile de calculer 8 images/seconde sur un petit serveur
const BACKGROUND = 'assets/tribunal.jpg';
const FONTS_DIR = 'assets';
const MAX_LINES = 9;
const TIMEOUT_MS = 150_000;
let lowPriority = process.platform !== 'win32';

/** Couleur #rrggbb -> format ASS (&H00BBGGRR). */
function assColor(hex) {
  const value = String(hex).replace('#', '').padStart(6, '0');
  return `&H00${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`.toUpperCase();
}

const assTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
};

const clean = (text, max = 46) => String(text ?? '').replace(/[{}\\\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function buildAss({ title, subtitle, lines, duration }) {
  const dialogue = [];
  const add = (start, style, text, color, x, y) => {
    dialogue.push(`Dialogue: 0,${assTime(start)},${assTime(duration)},${style},,0,0,0,,{\\pos(${x},${y})\\c${assColor(color)}}${clean(text)}`);
  };
  add(0, 'Titre', title, '#e3c37a', WIDTH / 2, 22);
  add(0.4, 'Sous', subtitle, '#cfd3e0', WIDTH / 2, 56);
  lines.forEach((line, i) => add(1 + i * 0.5, 'Ligne', line.text, line.color, 26, 82 + i * 24));

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${WIDTH}`,
    `PlayResY: ${HEIGHT}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Titre,Cinzel,24,&H00E3C37A,&H00FFFFFF,&H00101010,&H80000000,1,0,0,0,100,100,1,0,1,2,2,8,10,10,10,1',
    'Style: Sous,Noto Sans,14,&H00CFD3E0,&H00FFFFFF,&H00101010,&H80000000,1,0,0,0,100,100,0,0,1,2,1,8,10,10,10,1',
    'Style: Ligne,Noto Sans,16,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,1,0,0,0,100,100,0,0,1,2,1,7,10,10,10,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogue,
  ].join('\n');
}

/** Lance ffmpeg et renvoie ce qu'il écrit sur la sortie (avec la vraie raison en cas d'échec). */
function runFfmpeg(args, { collect = true, timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    // Sur le serveur (0,1 CPU), ffmpeg passe en priorité basse : le bot reste réactif pendant le rendu
    const [command, fullArgs] = lowPriority
      ? ['nice', ['-n', '19', FFMPEG_PATH, ...args]]
      : [FFMPEG_PATH, args];
    const proc = spawn(command, fullArgs, { windowsHide: true });
    const chunks = [];
    let errors = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; proc.kill('SIGKILL'); }, timeout);
    if (collect) proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => { errors += chunk; });
    proc.on('error', (err) => {
      clearTimeout(timer);
      // Pas de commande « nice » sur cette machine : on relance normalement
      if (lowPriority && err.code === 'ENOENT') {
        lowPriority = false;
        return runFfmpeg(args, { collect, timeout }).then(resolve, reject);
      }
      reject(err);
    });
    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      const out = Buffer.concat(chunks);
      if (code === 0 && (!collect || out.length)) return resolve(out);
      const last = errors.split('\n').filter(Boolean).pop();
      const why = timedOut ? `trop lent (> ${timeout / 1000}s)`
        : signal ? `arrêté par ${signal} (mémoire ?)`
        : last ?? `code ${code}`;
      reject(new Error(why));
    });
  });
}

/** Le décret assombri + les lignes du bilan, en deux passes pour ménager la mémoire de Render. */
function videoFilters(assFile) {
  // ffmpeg n'aime ni les antislashs ni les deux-points dans un chemin de filtre
  const escaped = assFile.replace(/\\/g, '/').replace(/:/g, '\\:');
  return [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH}:${HEIGHT}`,
    'eq=brightness=-0.16:saturation=0.35',
    `drawbox=x=0:y=40:w=${WIDTH}:h=${HEIGHT - 40}:color=black@0.55:t=fill`,
    `subtitles='${escaped}':fontsdir=${FONTS_DIR}`,
    `fps=${FPS}`,
  ].join(',');
}

/**
 * GIF du bilan : fond du décret assombri, titre, puis une ligne par personne qui apparaît.
 * @param {{ title: string, subtitle: string, lines: {text: string, color: string}[] }} bilan
 * @returns {Promise<{ attachment: Buffer, name: string }>} GIF animé, ou image fixe si ffmpeg n'y arrive pas
 */
export async function buildWeekGif({ title, subtitle, lines }) {
  const shown = lines.slice(0, MAX_LINES);
  const duration = Math.min(11, 1 + shown.length * 0.5 + 2);
  const folder = await mkdtemp(path.join(os.tmpdir(), 'tribunal-'));
  const assFile = path.join(folder, 'bilan.ass');
  const palette = path.join(folder, 'palette.png');
  await writeFile(assFile, buildAss({ title, subtitle, lines: shown, duration }), 'utf8');
  const filters = videoFilters(assFile);
  const input = ['-loop', '1', '-t', duration.toFixed(1), '-i', BACKGROUND];

  try {
    // 1) la palette, calculée sur la seule dernière image (tous les textes y sont déjà) : presque gratuit
    await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-y', '-threads', '1',
      ...input, '-vf', `${filters},palettegen=max_colors=128:stats_mode=single`,
      '-ss', Math.max(0, duration - 0.3).toFixed(1), '-frames:v', '1', palette,
    ], { collect: false });

    // 2) le GIF qui s'en sert
    const gif = await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-threads', '1',
      ...input, '-i', palette,
      '-filter_complex', `[0:v]${filters}[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=2:diff_mode=rectangle`,
      '-loop', '0', '-f', 'gif', 'pipe:1',
    ]);
    return { attachment: gif, name: 'bilan-tribunal.gif' };
  } catch (error) {
    console.warn('[tribunal] GIF impossible (%s), image fixe à la place', error.message);
    // Secours : une seule image (la dernière, tous les noms affichés), ça coûte presque rien
    const png = await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-threads', '1',
      ...input, '-vf', filters,
      '-ss', Math.max(0, duration - 0.3).toFixed(1), '-frames:v', '1',
      '-f', 'image2', '-c:v', 'png', 'pipe:1',
    ], { timeout: 60_000 });
    return { attachment: png, name: 'bilan-tribunal.png' };
  } finally {
    await rm(folder, { recursive: true, force: true }).catch(() => {});
  }
}
