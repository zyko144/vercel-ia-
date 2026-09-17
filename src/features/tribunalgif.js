// Fabrique le GIF du bilan du tribunal : les noms apparaissent un par un sur le tableau du décret.
// Le texte est écrit avec des sous-titres stylés (libass) : le filtre « drawtext » n'existe plus dans ffmpeg 7.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FFMPEG_PATH } from '../music/binaries.js';

const WIDTH = 640;
const HEIGHT = 400;
const FPS = 10;
const BACKGROUND = 'assets/tribunal.jpg';
const FONTS_DIR = 'assets';
const MAX_LINES = 9;

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
  add(0, 'Titre', title, '#e3c37a', WIDTH / 2, 30);
  add(0.4, 'Sous', subtitle, '#cfd3e0', WIDTH / 2, 70);
  lines.forEach((line, i) => add(1.1 + i * 0.45, 'Ligne', line.text, line.color, 34, 104 + i * 31));

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${WIDTH}`,
    `PlayResY: ${HEIGHT}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Titre,Cinzel,30,&H00E3C37A,&H00FFFFFF,&H00101010,&H80000000,1,0,0,0,100,100,1,0,1,2,2,8,10,10,10,1',
    'Style: Sous,Noto Sans,17,&H00CFD3E0,&H00FFFFFF,&H00101010,&H80000000,1,0,0,0,100,100,0,0,1,2,1,8,10,10,10,1',
    'Style: Ligne,Noto Sans,20,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,1,0,0,0,100,100,0,0,1,2,1,7,10,10,10,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogue,
  ].join('\n');
}

/**
 * GIF du bilan : fond du décret assombri, titre, puis une ligne par personne qui apparaît.
 * @param {{ title: string, subtitle: string, lines: {text: string, color: string}[] }} bilan
 * @returns {Promise<Buffer>}
 */
export async function buildWeekGif({ title, subtitle, lines }) {
  const shown = lines.slice(0, MAX_LINES);
  const duration = Math.min(15, 1.1 + shown.length * 0.45 + 2.6);
  const folder = await mkdtemp(path.join(os.tmpdir(), 'tribunal-'));
  const assFile = path.join(folder, 'bilan.ass');
  await writeFile(assFile, buildAss({ title, subtitle, lines: shown, duration }), 'utf8');

  // ffmpeg n'aime ni les antislashs ni les deux-points dans un chemin de filtre
  const escaped = assFile.replace(/\\/g, '/').replace(/:/g, '\\:');
  const filters = [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH}:${HEIGHT}`,
    'eq=brightness=-0.16:saturation=0.35',
    `drawbox=x=0:y=52:w=${WIDTH}:h=${HEIGHT - 52}:color=black@0.55:t=fill`,
    `subtitles='${escaped}':fontsdir=${FONTS_DIR}`,
    `fps=${FPS}`,
  ].join(',');

  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-loop', '1', '-t', duration.toFixed(1), '-i', BACKGROUND,
    '-filter_complex', `[0:v]${filters},split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
    '-loop', '0',
    '-f', 'gif', 'pipe:1',
  ];

  try {
    return await new Promise((resolve, reject) => {
      const proc = spawn(FFMPEG_PATH, args, { windowsHide: true });
      const chunks = [];
      let errors = '';
      const timer = setTimeout(() => proc.kill('SIGKILL'), 45_000);
      proc.stdout.on('data', (chunk) => chunks.push(chunk));
      proc.stderr.on('data', (chunk) => { errors += chunk; });
      proc.on('error', reject);
      proc.on('close', (code) => {
        clearTimeout(timer);
        const gif = Buffer.concat(chunks);
        if (code === 0 && gif.length) resolve(gif);
        else reject(new Error(`GIF impossible : ${errors.split('\n').filter(Boolean).pop() ?? `code ${code}`}`));
      });
    });
  } finally {
    await rm(folder, { recursive: true, force: true }).catch(() => {});
  }
}
