/**
 * Cartes de rôle animées pour les mini-jeux (imposteur, loup-garou).
 *
 *   node tools/make-jeux-gifs.mjs
 *
 * Les GIFs sont commités dans assets/jeux/ et joints aux messages privés :
 * rien n'est encodé pendant une partie, le rôle part sans attente.
 */
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const require = createRequire(import.meta.url);
const sharp = require('../nightvault/node_modules/sharp'); // installé pour le site ; ce script ne tourne qu'en local
const run = promisify(execFile);

const OUT = path.resolve('assets/jeux');
const TMP = path.resolve('assets/jeux/.frames');
const FPS = 14;
const W = 440;
const H = 260;

/**
 * Une carte de rôle : fond en dégradé, halo qui respire, emoji, nom, et une
 * ligne de lumière qui balaie la carte.
 */
function card({ emoji, name, tagline, from, to, glow, accent }, t) {
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  const haloR = 92 + pulse * 10;
  const sweep = -160 + t * (W + 320);
  const bob = Math.sin(t * Math.PI * 2) * 5;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${glow}" stop-opacity="${0.5 + pulse * 0.3}"/>
      <stop offset="100%" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="frame"><rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="18"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="#0d0a12"/>
  <g clip-path="url(#frame)">
    <rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="url(#bg)"/>
    <circle cx="${W / 2}" cy="108" r="${haloR}" fill="url(#halo)"/>
    <rect x="${sweep}" y="0" width="160" height="${H}" fill="url(#sweep)" transform="skewX(-18)"/>
    <text x="${W / 2}" y="${104 + bob}" font-size="74" text-anchor="middle" dominant-baseline="central">${emoji}</text>
    <text x="${W / 2}" y="180" font-family="DejaVu Sans, Arial" font-size="36" font-weight="bold" letter-spacing="3"
          text-anchor="middle" fill="#ffffff">${name}</text>
    <text x="${W / 2}" y="212" font-family="DejaVu Sans, Arial" font-size="14" text-anchor="middle" fill="${accent}">${tagline}</text>
  </g>
  <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="18" fill="none" stroke="${glow}" stroke-width="2" opacity="${0.45 + pulse * 0.4}"/>
</svg>`;
}

const CARDS = {
  // ---- Imposteur
  imposteur: { emoji: '🕵️', name: 'IMPOSTEUR', tagline: 'Ton mot est différent. Ne te fais pas griller.', from: '#3d0a1e', to: '#140208', glow: '#ff2f5e', accent: '#ffb3c4' },
  civil: { emoji: '👥', name: 'CIVIL', tagline: 'Trouve celui dont le mot n’est pas le tien.', from: '#0a2a3d', to: '#020d14', glow: '#2fb8ff', accent: '#b3e4ff' },
  // ---- Loup-garou
  loup: { emoji: '🐺', name: 'LOUP-GAROU', tagline: 'Dévore le village, une nuit à la fois.', from: '#3d0f0f', to: '#100404', glow: '#ff4a2f', accent: '#ffc2b3' },
  villageois: { emoji: '🧑‍🌾', name: 'VILLAGEOIS', tagline: 'Pas de pouvoir. Juste ton flair et ta voix.', from: '#173d0a', to: '#061402', glow: '#7ee83f', accent: '#d2ffb3' },
  voyante: { emoji: '🔮', name: 'VOYANTE', tagline: 'Chaque nuit, découvre le rôle de quelqu’un.', from: '#2c0a3d', to: '#0c0214', glow: '#b04aff', accent: '#e0c2ff' },
  sorciere: { emoji: '🧪', name: 'SORCIÈRE', tagline: 'Une potion de vie, une potion de mort.', from: '#0a3d33', to: '#021411', glow: '#2fffc8', accent: '#b3fff0' },
  chasseur: { emoji: '🏹', name: 'CHASSEUR', tagline: 'Si tu meurs, tu emportes quelqu’un avec toi.', from: '#3d2a0a', to: '#140d02', glow: '#ffb02f', accent: '#ffe4b3' },
  cupidon: { emoji: '💘', name: 'CUPIDON', tagline: 'Lie deux cœurs : ils vivent et meurent ensemble.', from: '#3d0a2e', to: '#140210', glow: '#ff2fa6', accent: '#ffb3e0' },
};

async function build(name, design) {
  const dir = path.join(TMP, name);
  await mkdir(dir, { recursive: true });
  const frames = 22;
  for (let i = 0; i < frames; i++) {
    await sharp(Buffer.from(card(design, i / frames))).png().toFile(path.join(dir, `${String(i).padStart(3, '0')}.png`));
  }
  const input = path.join(dir, '%03d.png');
  const palette = path.join(dir, 'palette.png');
  const out = path.join(OUT, `${name}.gif`);
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-vf', 'palettegen=max_colors=80:stats_mode=diff', palette]);
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-i', palette, '-lavfi', 'paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', out]);
  const { size } = await stat(out);
  console.log(`  ${name}.gif — ${(size / 1024).toFixed(0)} Ko`);
  return size;
}

await mkdir(OUT, { recursive: true });
console.log('Fabrication des cartes de rôle…');
let total = 0;
for (const [name, design] of Object.entries(CARDS)) total += await build(name, design);
await rm(TMP, { recursive: true, force: true });
console.log(`Terminé : ${Object.keys(CARDS).length} cartes, ${(total / 1024).toFixed(0)} Ko au total.`);
