// Moteur de rendu des tables : un décor photo (généré une fois par IA) et, par-dessus,
// une couche vectorielle (cartes, jetons, textes) dessinée à chaque coup.
// Un rendu = une seule image JPEG : rapide, et sharp travaille hors de la boucle
// d'événements, donc la voix du bot n'est pas coupée pendant qu'on dessine.
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const WIDTH = 960;
export const HEIGHT = 540;

const ASSETS = path.resolve('assets');
const TABLES = path.join(ASSETS, 'casinho', 'tables');

// ---- Polices : on ne donne à librsvg que les nôtres. Même rendu en local et sur
// Render, où les polices du système sont rares et différentes.
const FONT_CACHE = path.join(os.tmpdir(), 'casinho-fonts');
try {
  mkdirSync(FONT_CACHE, { recursive: true });
  writeFileSync(
    path.join(FONT_CACHE, 'fonts.conf'),
    [
      '<?xml version="1.0"?>',
      '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">',
      '<fontconfig>',
      `  <dir>${ASSETS}</dir>`,
      `  <cachedir>${FONT_CACHE}</cachedir>`,
      '</fontconfig>',
    ].join('\n'),
  );
  // À régler avant le premier rendu : fontconfig ne relit pas sa configuration ensuite.
  process.env.FONTCONFIG_FILE ??= path.join(FONT_CACHE, 'fonts.conf');
  process.env.FONTCONFIG_PATH ??= FONT_CACHE;
} catch {
  // Pas de dossier temporaire inscriptible : on garde les polices du système.
}

export const SANS = "'Noto Sans', 'DejaVu Sans', Arial, sans-serif";
export const SERIF = "'Cinzel', Georgia, serif";

let sharpModule = null;
async function sharp() {
  if (!sharpModule) {
    sharpModule = (await import('sharp')).default;
    // Render gratuit n'a qu'un dixième de processeur : un seul fil de calcul et
    // un petit cache, pour qu'un rendu ne fasse jamais hacher la voix du bot.
    sharpModule.concurrency(1);
    sharpModule.cache({ memory: 24, files: 0, items: 40 });
  }
  return sharpModule;
}

// ---- Décors : lus une fois, gardés en mémoire.
const backgrounds = new Map();
async function background(name) {
  if (!backgrounds.has(name)) {
    backgrounds.set(
      name,
      readFile(path.join(TABLES, `${name}.jpg`)).catch(() => null),
    );
  }
  return backgrounds.get(name);
}

/** Fond de secours si le décor manque : un feutre sombre dégradé. */
const fallbackBackground = () => `
  <defs><radialGradient id="felt" cx="50%" cy="65%" r="75%">
    <stop offset="0%" stop-color="#5a1737"/><stop offset="100%" stop-color="#16060f"/>
  </radialGradient></defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#felt)"/>`;

/**
 * Pose une couche SVG sur un décor et rend un JPEG.
 * @param {string} scene nom du décor (assets/casinho/tables/<nom>.jpg)
 * @param {string} overlay contenu SVG (sans la balise <svg>)
 */
export async function renderScene(scene, overlay) {
  const s = await sharp();
  const bg = await background(scene);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">${bg ? '' : fallbackBackground()}${overlay}</svg>`,
  );
  const base = bg
    ? s(bg).resize(WIDTH, HEIGHT, { fit: 'cover' })
    : s({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#16060f' } });
  return base.composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
}

/** Échappe un texte pour l'insérer dans du SVG. */
export const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Pastille sombre avec un texte : « CROUPIER · 17 ». */
export function badge(x, y, text, { color = '#ffffff', bg = 'rgba(12,4,10,0.72)', size = 20, anchor = 'middle', accent = null } = {}) {
  const width = Math.round(text.length * size * 0.62 + 28);
  const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  return `
    <rect x="${left}" y="${y - size}" width="${width}" height="${size * 1.7}" rx="${size * 0.85}" fill="${bg}"
          stroke="${accent ?? 'rgba(255,255,255,0.18)'}" stroke-width="${accent ? 2 : 1}"/>
    <text x="${left + width / 2}" y="${y + size * 0.18}" font-family="${SANS}" font-weight="700" font-size="${size}"
          fill="${color}" text-anchor="middle" dominant-baseline="middle" letter-spacing="1">${esc(text)}</text>`;
}

/** Panneau de résultat au centre : « BLACKJACK ! », « GAGNÉ »… avec le gain en dessous. */
export function banner(text, { color = '#ffffff', glow = '#ff3fa6', y = HEIGHT / 2, sub = null } = {}) {
  const width = Math.max(380, text.length * 38 + 90, (sub?.length ?? 0) * 13 + 80);
  const height = sub ? 118 : 90;
  const top = y - 50;
  return `
    <defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs>
    <rect x="${WIDTH / 2 - width / 2}" y="${top}" width="${width}" height="${height}" rx="22" fill="rgba(10,3,8,0.78)"
          stroke="${glow}" stroke-width="2.5"/>
    <text x="${WIDTH / 2}" y="${y}" font-family="${SERIF}" font-weight="700" font-size="48" fill="${color}"
          text-anchor="middle" dominant-baseline="middle" letter-spacing="3" filter="url(#glow)">${esc(text)}</text>
    ${sub ? `<text x="${WIDTH / 2}" y="${y + 44}" font-family="${SANS}" font-weight="700" font-size="21" fill="#ffd9ee"
          text-anchor="middle" dominant-baseline="middle">${esc(sub)}</text>` : ''}`;
}

/** Vignettage : assombrit les bords pour que les cartes ressortent. */
export const vignette = (strength = 0.55) => `
  <defs><radialGradient id="vig" cx="50%" cy="55%" r="72%">
    <stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="${strength}"/>
  </radialGradient></defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vig)"/>`;

/** Pile de jetons avec la mise : le jeton du dessus porte le montant. */
export function chipStack(x, y, amount, { color = '#ff3fa6' } = {}) {
  const layers = Math.min(6, 1 + Math.floor(Math.log10(Math.max(1, amount))));
  let out = '';
  for (let i = layers - 1; i >= 0; i--) {
    const cy = y - i * 6;
    out += `
      <ellipse cx="${x}" cy="${cy + 5}" rx="30" ry="11" fill="rgba(0,0,0,0.35)"/>
      <ellipse cx="${x}" cy="${cy}" rx="30" ry="11" fill="${color}" stroke="#fff3f9" stroke-width="1.5"/>
      <ellipse cx="${x}" cy="${cy}" rx="21" ry="7.5" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="5 5" opacity="0.85"/>`;
  }
  return `${out}
    <text x="${x}" y="${y - (layers - 1) * 6 + 30}" font-family="${SANS}" font-weight="700" font-size="17" fill="#fff"
          text-anchor="middle" stroke="rgba(0,0,0,0.6)" stroke-width="3" paint-order="stroke">${esc(Math.round(amount).toLocaleString('fr-FR'))}</text>`;
}
