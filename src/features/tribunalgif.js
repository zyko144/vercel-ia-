// Fabrique le GIF du bilan du tribunal : les noms apparaissent un par un sur le tableau du décret.
import { spawn } from 'node:child_process';
import { FFMPEG_PATH } from '../music/binaries.js';

const WIDTH = 640;
const HEIGHT = 400;
const FPS = 10;
const TITLE_FONT = 'assets/Cinzel-Bold.ttf';
const TEXT_FONT = 'assets/NotoSans-Bold.ttf';
const BACKGROUND = 'assets/tribunal.jpg';
const MAX_LINES = 9;

/** ffmpeg n'aime ni les deux-points ni les apostrophes dans drawtext. */
const clean = (text, max = 30) => String(text ?? '')
  .replace(/[\\:'"%]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const path = (file) => file.replace(/\\/g, '/').replace(/:/g, '\\:');

function drawtext({ text, font, size, color, x, y, from = null, shadow = true }) {
  const parts = [
    `fontfile=${path(font)}`,
    `text='${clean(text, 60)}'`,
    `fontsize=${size}`,
    `fontcolor=${color}`,
    `x=${x}`,
    `y=${y}`,
    ...(shadow ? ['shadowcolor=black@0.85', 'shadowx=2', 'shadowy=2'] : []),
    ...(from === null ? [] : [`enable='gte(t,${from.toFixed(2)})'`]),
  ];
  return `drawtext=${parts.join(':')}`;
}

/**
 * @param {{ title: string, subtitle: string, lines: {text: string, color: string}[] }} bilan
 * @returns {Promise<Buffer>} le GIF
 */
export function buildWeekGif({ title, subtitle, lines }) {
  const shown = lines.slice(0, MAX_LINES);
  const startAt = 1.1;
  const step = 0.45;
  const duration = Math.min(15, startAt + shown.length * step + 2.6);

  const filters = [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH}:${HEIGHT}`,
    'eq=brightness=-0.16:saturation=0.35',
    // Bandeau sombre pour que le texte reste lisible
    `drawbox=x=0:y=52:w=${WIDTH}:h=${HEIGHT - 52}:color=black@0.55:t=fill`,
    drawtext({ text: title, font: TITLE_FONT, size: 30, color: '#e3c37a', x: '(w-text_w)/2', y: 12 }),
    drawtext({ text: subtitle, font: TEXT_FONT, size: 16, color: '#cfd3e0', x: '(w-text_w)/2', y: 62, from: 0.5 }),
    ...shown.map((line, i) => drawtext({
      text: line.text,
      font: TEXT_FONT,
      size: 19,
      color: line.color,
      x: 40,
      y: 100 + i * 30,
      from: startAt + i * step,
    })),
    `fps=${FPS}`,
  ].join(',');

  const args = [
    '-hide_banner', '-loglevel', 'error',
    '-loop', '1', '-t', duration.toFixed(1), '-i', BACKGROUND,
    '-filter_complex', `[0:v]${filters},split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
    '-loop', '0',
    '-f', 'gif', 'pipe:1',
  ];

  return new Promise((resolve, reject) => {
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
}
