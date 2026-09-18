// Fabrique le GIF du bilan du tribunal : photo, nom et statut de chacun arrivent en glissant
// sur le tableau du décret. Le texte est écrit avec des sous-titres stylés (libass) :
// le filtre « drawtext » n'existe plus dans ffmpeg 7.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FFMPEG_PATH } from '../music/binaries.js';

const WIDTH = 480;
const HEIGHT = 300;
const FPS = 15; // assez fluide pour que les lignes glissent vraiment
const BACKGROUND = 'assets/tribunal.jpg';
const FONTS_DIR = 'assets';
const MAX_LINES = 11;
const TIMEOUT_MS = 150_000;
const SLIDE = 50; // distance parcourue par une ligne qui entre
const SLIDE_MS = 350;
const STAGGER = 0.3; // écart entre deux arrivées
const HOLD = 2.4; // temps d'affichage complet à la fin
const TOP = 80; // première ligne
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

const clean = (text, max = 40) => String(text ?? '').replace(/[{}\\\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Hauteur d'une ligne et taille de la photo, selon le monde qu'il y a à afficher. */
function layout(count) {
  const step = count <= 7 ? 26 : Math.max(16, Math.floor((HEIGHT - TOP - 14) / count));
  const avatar = Math.max(12, Math.min(24, step - 3));
  const size = step >= 24 ? 15 : step >= 20 ? 13 : 11;
  return { step, avatar, size, textX: 16 + avatar + 8 };
}

function buildAss({ title, subtitle, lines, duration, plan }) {
  const dialogue = [];
  const { step, size, textX } = plan;
  const push = (start, style, text, extra) => {
    dialogue.push(`Dialogue: 0,${assTime(start)},${assTime(duration)},${style},,0,0,0,,{${extra}}${text}`);
  };
  // Titre et sous-titre : apparition en fondu, le titre descend légèrement
  push(0, 'Titre', clean(title, 34), `\\move(${WIDTH / 2},14,${WIDTH / 2},22,0,400)\\fad(350,0)\\c${assColor('#e3c37a')}`);
  push(0.35, 'Sous', clean(subtitle, 48), `\\pos(${WIDTH / 2},54)\\fad(350,0)\\c${assColor('#cfd3e0')}`);

  lines.forEach((line, i) => {
    const at = 0.8 + i * STAGGER;
    const y = TOP + i * step;
    const from = textX - SLIDE;
    push(at, 'Ligne', clean(line.text), `\\move(${from},${y},${textX},${y},0,${SLIDE_MS})\\fs${size}\\fad(250,0)\\c${assColor(line.color)}`);
    if (line.detail) {
      push(at + 0.1, 'Detail', clean(line.detail, 30), `\\pos(${WIDTH - 14},${y + 1})\\fs${Math.max(9, size - 3)}\\fad(300,0)\\c${assColor('#a9b0c0')}`);
    }
  });

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
    'Style: Sous,Noto Sans,13,&H00CFD3E0,&H00FFFFFF,&H00101010,&H80000000,1,0,0,0,100,100,0,0,1,2,1,8,10,10,10,1',
    'Style: Ligne,Noto Sans,15,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,1,0,0,0,100,100,0,0,1,2,1,7,10,10,10,1',
    'Style: Detail,Noto Sans,11,&H00A9B0C0,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,2,1,9,10,10,10,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogue,
  ].join('\n');
}

// Sans ça, ffmpeg passe en revue toutes les polices du système à chaque lancement :
// on lui dit de ne regarder que nos deux polices et de garder le résultat en cache.
const FONT_CACHE = path.join(os.tmpdir(), 'tribunal-fonts');
const FONT_CONFIG = path.join(FONT_CACHE, 'fonts.conf');
let fontConfigReady = null;
function fontEnvironment() {
  fontConfigReady ??= mkdir(FONT_CACHE, { recursive: true })
    .then(() => writeFile(FONT_CONFIG, [
      '<?xml version="1.0"?>',
      '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">',
      '<fontconfig>',
      `  <dir>${path.resolve(FONTS_DIR)}</dir>`,
      `  <cachedir>${FONT_CACHE}</cachedir>`,
      '</fontconfig>',
    ].join('\n'), 'utf8'))
    .catch(() => null);
  return fontConfigReady;
}

// Chronomètre de la dernière fabrication, pour comprendre où part le temps sur le serveur
export const lastTimings = [];

/** Lance ffmpeg et renvoie ce qu'il écrit sur la sortie (avec la vraie raison en cas d'échec). */
function runFfmpeg(args, { collect = true, timeout = TIMEOUT_MS, label = 'ffmpeg' } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    // Sur le serveur (0,1 CPU), ffmpeg passe en priorité basse : le bot reste réactif pendant le rendu
    const [command, fullArgs] = lowPriority
      ? ['nice', ['-n', '19', FFMPEG_PATH, ...args]]
      : [FFMPEG_PATH, args];
    const proc = spawn(command, fullArgs, {
      windowsHide: true,
      env: { ...process.env, FONTCONFIG_FILE: FONT_CONFIG, FONTCONFIG_PATH: FONT_CACHE, XDG_CACHE_HOME: FONT_CACHE },
    });
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
        return runFfmpeg(args, { collect, timeout, label }).then(resolve, reject);
      }
      reject(err);
    });
    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      lastTimings.push({ étape: label, secondes: Math.round((Date.now() - startedAt) / 100) / 10 });
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

/** Coût d'un lancement de ffmpeg qui ne fait rien : sépare le démarrage du vrai travail. */
export function ffmpegStartupCost() {
  return runFfmpeg(['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=32x32:d=0.1', '-f', 'null', '-'],
    { collect: false, timeout: 60_000, label: 'démarrage à vide' });
}

// Le fond (décret redimensionné et assombri) ne change jamais : on le prépare une seule fois.
let backgroundReady = null;
async function darkBackground() {
  const file = path.join(os.tmpdir(), `tribunal-fond-${WIDTH}x${HEIGHT}.png`);
  backgroundReady ??= runFfmpeg([
    '-hide_banner', '-loglevel', 'error', '-y', '-threads', '1',
    '-i', BACKGROUND,
    '-vf', [
      `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
      `crop=${WIDTH}:${HEIGHT}`,
      'eq=brightness=-0.16:saturation=0.35',
      `drawbox=x=0:y=40:w=${WIDTH}:h=${HEIGHT - 40}:color=black@0.55:t=fill`,
    ].join(','),
    '-frames:v', '1', file,
  ], { collect: false, label: 'fond' }).then(() => file, (error) => { backgroundReady = null; throw error; });
  return backgroundReady;
}

/** Récupère les photos de profil (celles qui répondent ; les autres seront simplement absentes). */
async function fetchAvatars(lines, folder) {
  return Promise.all(lines.map(async (line, i) => {
    if (!line.avatar) return null;
    try {
      const res = await fetch(line.avatar, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const file = path.join(folder, `pdp${i}.png`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      return file;
    } catch {
      return null;
    }
  }));
}

/**
 * Le graphe ffmpeg : le texte gravé sur le fond, puis les photos rondes qui glissent avec leur ligne.
 * @returns {{ inputs: string[], graph: string, out: string }}
 */
function composition(assFile, avatars, plan) {
  // ffmpeg n'aime ni les antislashs ni les deux-points dans un chemin de filtre
  const escaped = assFile.replace(/\\/g, '/').replace(/:/g, '\\:');
  const { step, avatar: size, textX } = plan;
  const parts = [`[0:v]subtitles='${escaped}':fontsdir=${FONTS_DIR}[base]`];
  const inputs = [];
  let last = 'base';

  avatars.forEach((file, i) => {
    if (!file) return;
    const index = inputs.length + 2; // 0 = fond, 1 = palette
    inputs.push(file);
    const at = (0.8 + i * STAGGER).toFixed(2);
    const y = TOP + i * step + 1;
    const radius = (size / 2 - 0.5).toFixed(1);
    const half = (size / 2).toFixed(1);
    // Photo redimensionnée puis découpée en rond (les expressions sont entre apostrophes : les virgules passent)
    parts.push(`[${index}:v]scale=${size}:${size},format=rgba,`
      + `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-${half},Y-${half}),${radius}),255,0)'[pdp${i}]`);
    // Elle arrive en glissant, exactement comme la ligne de texte
    const x = `16-${SLIDE}+${SLIDE}*min(1,max(0,(t-${at})/${(SLIDE_MS / 1000).toFixed(2)}))`;
    parts.push(`[${last}][pdp${i}]overlay=x='${x}':y=${y}:enable='gte(t,${at})'[o${i}]`);
    last = `o${i}`;
  });

  return { inputs, graph: parts.join(';'), out: last, textX };
}

/**
 * GIF du bilan : fond du décret, titre, puis une ligne par personne qui entre en glissant.
 * @param {{ title: string, subtitle: string, lines: {text: string, detail?: string, color: string, avatar?: string}[] }} bilan
 * @returns {Promise<{ attachment: Buffer, name: string }>} GIF animé, ou image fixe si ffmpeg n'y arrive pas
 */
export async function buildWeekGif({ title, subtitle, lines }) {
  lastTimings.length = 0;
  await fontEnvironment();
  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > MAX_LINES) {
    const reste = lines.length - MAX_LINES;
    shown.push({ text: `… et ${reste} autre${reste > 1 ? 's' : ''}`, color: '#9aa0ad' });
  }
  const plan = layout(shown.length);
  const duration = Math.min(14, 0.8 + shown.length * STAGGER + HOLD);
  const folder = await mkdtemp(path.join(os.tmpdir(), 'tribunal-'));
  const assFile = path.join(folder, 'bilan.ass');
  const palette = path.join(folder, 'palette.png');
  await writeFile(assFile, buildAss({ title, subtitle, lines: shown, duration, plan }), 'utf8');

  const avatars = await fetchAvatars(shown, folder);
  const { inputs, graph, out } = composition(assFile, avatars, plan);
  // -framerate : sans ça ffmpeg dessine le texte sur 25 images/seconde pour n'en garder qu'une partie
  const background = ['-loop', '1', '-framerate', String(FPS), '-t', duration.toFixed(1), '-i', await darkBackground()];
  const photos = inputs.flatMap((file) => ['-i', file]);
  const lastFrame = Math.max(0, duration - 0.3).toFixed(1);

  try {
    // 1) la palette, calculée sur la dernière image (tout y est déjà affiché) : presque gratuit
    await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-y', '-threads', '1',
      ...background, '-f', 'lavfi', '-i', 'color=c=black:s=2x2:d=0.1', ...photos,
      '-filter_complex', `${graph};[${out}]palettegen=max_colors=192:stats_mode=single[p]`,
      '-map', '[p]', '-ss', lastFrame, '-frames:v', '1', palette,
    ], { collect: false, label: 'palette' });

    // 2) le GIF qui s'en sert
    const gif = await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-threads', '1',
      ...background, '-i', palette, ...photos,
      '-filter_complex', `${graph};[${out}][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle[v]`,
      '-map', '[v]', '-loop', '0', '-f', 'gif', 'pipe:1',
    ], { label: 'gif' });
    return { attachment: gif, name: 'bilan-tribunal.gif' };
  } catch (error) {
    console.warn('[tribunal] GIF impossible (%s), image fixe à la place', error.message);
    // Secours : une seule image (la dernière, tout le monde affiché), ça coûte presque rien
    const png = await runFfmpeg([
      '-hide_banner', '-loglevel', 'error', '-threads', '1',
      ...background, '-f', 'lavfi', '-i', 'color=c=black:s=2x2:d=0.1', ...photos,
      '-filter_complex', graph, '-map', `[${out}]`,
      '-ss', lastFrame, '-frames:v', '1', '-f', 'image2', '-c:v', 'png', 'pipe:1',
    ], { timeout: 60_000, label: 'image de secours' });
    return { attachment: png, name: 'bilan-tribunal.png' };
  } finally {
    await rm(folder, { recursive: true, force: true }).catch(() => {});
  }
}
