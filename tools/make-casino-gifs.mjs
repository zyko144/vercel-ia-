/**
 * Fabrique les animations du casino, une fois pour toutes.
 *
 *   node tools/make-casino-gifs.mjs
 *
 * Les GIFs produits sont commités dans assets/casinho/ : le bot se contente de les
 * joindre à ses messages. Rien n'est encodé pendant une partie — sur l'offre gratuite
 * de Render, encoder une vidéo à chaque tour ferait tomber le service.
 *
 * Chaque animation boucle proprement : un tour complet par boucle, vitesse constante.
 */
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const require = createRequire(import.meta.url);
// sharp n'est installé que pour le site ; ce script ne tourne qu'en local.
const sharp = require('../nightvault/node_modules/sharp');
const run = promisify(execFile);

const OUT = path.resolve('assets/casinho');
const TMP = path.resolve('assets/casinho/.frames');
const FPS = 14;

const PINK = '#ff3fa6';
const PLUM = '#150912';
const GOLD = '#f2cc7d';
const RED = '#c2224c';
const BLACK = '#1b1020';
const GREEN = '#1f7a52';

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
// L'ordre réel des numéros sur une roue européenne.
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const frame = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
     <defs>
       <radialGradient id="bg" cx="50%" cy="40%" r="75%">
         <stop offset="0%" stop-color="#3a1030"/><stop offset="100%" stop-color="${PLUM}"/>
       </radialGradient>
     </defs>
     <rect width="${w}" height="${h}" fill="url(#bg)"/>${body}
   </svg>`;

// ------------------------------------------------------------------ Roulette
function rouletteFrame(t, w = 420, h = 260) {
  const cx = w / 2;
  const cy = h / 2;
  const r = 104;
  const angle = 360 * t; // un tour complet par boucle : la bouclage est invisible
  const ballAngle = -720 * t + 90; // la bille tourne à l'envers, deux fois plus vite
  const step = 360 / WHEEL.length;

  const sectors = WHEEL.map((n, i) => {
    const a0 = (i * step - 90) * (Math.PI / 180);
    const a1 = ((i + 1) * step - 90) * (Math.PI / 180);
    const fill = n === 0 ? GREEN : RED_NUMBERS.has(n) ? RED : BLACK;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const tx = cx + r * 0.82 * Math.cos((a0 + a1) / 2);
    const ty = cy + r * 0.82 * Math.sin((a0 + a1) / 2);
    const rot = i * step + step / 2;
    return `<path d="M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z" fill="${fill}" stroke="${GOLD}" stroke-width="0.6"/>
            <text x="${tx}" y="${ty}" fill="#fff" font-family="DejaVu Sans, Arial" font-size="9" font-weight="bold"
                  text-anchor="middle" dominant-baseline="central" transform="rotate(${rot} ${tx} ${ty})">${n}</text>`;
  }).join('');

  const bx = cx + (r + 13) * Math.cos((ballAngle * Math.PI) / 180);
  const by = cy + (r + 13) * Math.sin((ballAngle * Math.PI) / 180);

  return frame(
    w,
    h,
    `<g transform="rotate(${angle} ${cx} ${cy})">
       <circle cx="${cx}" cy="${cy}" r="${r + 9}" fill="#2a1020" stroke="${GOLD}" stroke-width="4"/>
       ${sectors}
       <circle cx="${cx}" cy="${cy}" r="34" fill="#2a1020" stroke="${GOLD}" stroke-width="3"/>
       <circle cx="${cx}" cy="${cy}" r="9" fill="${GOLD}"/>
     </g>
     <circle cx="${bx}" cy="${by}" r="7" fill="#fff8f0"/>
     <circle cx="${bx - 2}" cy="${by - 2}" r="2.4" fill="#ffffff"/>`,
  );
}

// ------------------------------------------------------------------ Machine
const SYMBOLS = ['7', '💎', '★', '🔔', '🍋', '🍒'];
function slotFrame(t, w = 420, h = 260) {
  const cell = 62;
  const reels = [0, 1, 2]
    .map((reel) => {
      const x = 78 + reel * 92;
      // Chaque rouleau défile d'un nombre entier de symboles : la boucle est nette.
      const offset = ((t * (6 + reel * 2)) % 1) * cell;
      const cells = [-1, 0, 1, 2, 3]
        .map((row) => {
          const index = (row + reel * 2 + Math.floor(t * 40)) % SYMBOLS.length;
          const symbol = SYMBOLS[(index + SYMBOLS.length) % SYMBOLS.length];
          const y = 46 + row * cell + offset;
          return `<text x="${x}" y="${y}" font-family="DejaVu Sans, Arial" font-size="34" text-anchor="middle"
                        dominant-baseline="central" fill="${symbol === '7' ? PINK : '#ffe6b0'}" font-weight="bold">${symbol}</text>`;
        })
        .join('');
      return `<g clip-path="url(#reel${reel})">
                <rect x="${x - 38}" y="20" width="76" height="180" rx="9" fill="#1d0d18" stroke="${GOLD}" stroke-width="2"/>
                ${cells}
              </g>
              <clipPath id="reel${reel}"><rect x="${x - 38}" y="20" width="76" height="180" rx="9"/></clipPath>`;
    })
    .join('');

  return frame(
    w,
    h,
    `<rect x="24" y="8" width="372" height="206" rx="16" fill="#26101f" stroke="${PINK}" stroke-width="3"/>
     ${reels}
     <rect x="40" y="100" width="340" height="22" fill="${PINK}" opacity="0.13"/>
     <text x="${w / 2}" y="238" font-family="DejaVu Sans, Arial" font-size="15" font-weight="bold"
           text-anchor="middle" fill="${PINK}" letter-spacing="5">CASINHO</text>`,
  );
}

// ---------------------------------------------------------------------- Dés
const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function die(cx, cy, size, face, rotation) {
  const half = size / 2;
  const gap = size * 0.28;
  const pips = PIPS[face]
    .map(([dx, dy]) => `<circle cx="${cx + dx * gap}" cy="${cy + dy * gap}" r="${size * 0.085}" fill="#4a1030"/>`)
    .join('');
  return `<g transform="rotate(${rotation} ${cx} ${cy})">
            <rect x="${cx - half}" y="${cy - half}" width="${size}" height="${size}" rx="${size * 0.18}"
                  fill="#fff4ea" stroke="${GOLD}" stroke-width="2"/>${pips}
          </g>`;
}

function diceFrame(t, w = 420, h = 260) {
  // Les faces changent à chaque image : c'est le roulement, pas le résultat.
  const faceA = 1 + (Math.floor(t * 18) % 6);
  const faceB = 1 + (Math.floor(t * 18 + 3) % 6);
  const bounce = Math.abs(Math.sin(t * Math.PI * 2)) * 22;
  return frame(
    w,
    h,
    `<ellipse cx="${w / 2}" cy="216" rx="140" ry="16" fill="#00000055"/>
     ${die(148, 130 - bounce, 82, faceA, 360 * t)}
     ${die(272, 130 - (22 - bounce), 82, faceB, -360 * t)}`,
  );
}

// -------------------------------------------------------------- Pile ou face
function coinFrame(t, w = 300, h = 260) {
  // Un tour complet sur l'axe vertical : la pièce s'aplatit puis se retourne.
  const phase = t * 2 * Math.PI;
  const squash = Math.abs(Math.cos(phase));
  const showFace = Math.cos(phase) > 0;
  const lift = Math.sin(t * Math.PI * 2) * 26;
  const cx = w / 2;
  const cy = 128 - lift;
  return frame(
    w,
    h,
    `<ellipse cx="${cx}" cy="224" rx="${52 * (0.6 + squash * 0.4)}" ry="11" fill="#00000055"/>
     <g transform="translate(${cx} ${cy}) scale(${Math.max(0.06, squash)} 1)">
       <circle r="62" fill="${showFace ? '#f7c96b' : '#d79c3f'}" stroke="${GOLD}" stroke-width="5"/>
       <circle r="50" fill="none" stroke="#ffffff44" stroke-width="2"/>
       <text y="0" font-family="DejaVu Sans, Arial" font-size="46" font-weight="bold" text-anchor="middle"
             dominant-baseline="central" fill="#4a2a05">${showFace ? 'C' : '♛'}</text>
     </g>`,
  );
}

// ------------------------------------------------------------------- Cartes
function cardsFrame(t, w = 420, h = 260) {
  // Trois cartes qui glissent en éventail, en boucle.
  const cards = [0, 1, 2]
    .map((i) => {
      const local = (t + i / 3) % 1;
      const x = 60 + local * 240;
      const y = 150 - Math.sin(local * Math.PI) * 54;
      const rot = -22 + local * 44;
      return `<g transform="rotate(${rot} ${x} ${y})">
                <rect x="${x - 30}" y="${y - 42}" width="60" height="84" rx="8" fill="#fff6ec" stroke="${GOLD}" stroke-width="2"/>
                <text x="${x}" y="${y}" font-family="DejaVu Sans, Arial" font-size="30" font-weight="bold"
                      text-anchor="middle" dominant-baseline="central" fill="${i === 1 ? RED : '#2a1020'}">${['A', '♥', 'K'][i]}</text>
              </g>`;
    })
    .join('');
  return frame(w, h, `<ellipse cx="${w / 2}" cy="226" rx="150" ry="14" fill="#00000055"/>${cards}`);
}

// -------------------------------------------------------------------- Crash
function crashFrame(t, w = 420, h = 260) {
  const points = [];
  for (let i = 0; i <= 40; i++) {
    const x = 30 + (i / 40) * 350 * t;
    const y = 220 - Math.exp((i / 40) * t * 2.2) * 18 + 18;
    points.push(`${x.toFixed(1)},${Math.max(20, y).toFixed(1)}`);
  }
  const [lastX, lastY] = points.at(-1).split(',');
  return frame(
    w,
    h,
    `<polyline points="${points.join(' ')}" fill="none" stroke="${PINK}" stroke-width="5" stroke-linecap="round" opacity="0.9"/>
     <text x="${lastX}" y="${Number(lastY) - 18}" font-family="DejaVu Sans, Arial" font-size="28" text-anchor="middle">🚀</text>
     <text x="34" y="44" font-family="DejaVu Sans, Arial" font-size="30" font-weight="bold" fill="#ffd9ee">×${(1 + t * 4).toFixed(2)}</text>`,
  );
}

// -------------------------------------------------------------------- Mines
function minesFrame(t, w = 300, h = 260) {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const index = row * 5 + col;
      const lit = (Math.floor(t * 20) + index) % 7 === 0;
      cells.push(
        `<rect x="${24 + col * 52}" y="${34 + row * 52}" width="44" height="44" rx="8"
               fill="${lit ? '#4d1c3a' : '#2a1020'}" stroke="${lit ? PINK : '#54304a'}" stroke-width="2"/>
         ${lit ? `<text x="${46 + col * 52}" y="${57 + row * 52}" font-size="22" text-anchor="middle" dominant-baseline="central">💎</text>` : ''}`,
      );
    }
  }
  return frame(w, h, cells.join(''));
}

// ------------------------------------------------------------------ Encodage
const ANIMATIONS = {
  roulette: { draw: rouletteFrame, frames: 36 },
  machine: { draw: slotFrame, frames: 28 },
  des: { draw: diceFrame, frames: 24 },
  piece: { draw: coinFrame, frames: 24 },
  cartes: { draw: cardsFrame, frames: 27 },
  crash: { draw: crashFrame, frames: 26 },
  mines: { draw: minesFrame, frames: 21 },
};

async function build(name, { draw, frames }) {
  const dir = path.join(TMP, name);
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < frames; i++) {
    const svg = draw(i / frames);
    await sharp(Buffer.from(svg)).png().toFile(path.join(dir, `${String(i).padStart(3, '0')}.png`));
  }

  const out = path.join(OUT, `${name}.gif`);
  // Deux passes : une palette calculée sur toute l'animation, puis l'encodage.
  const palette = path.join(dir, 'palette.png');
  const input = path.join(dir, '%03d.png');
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-vf', 'palettegen=max_colors=96:stats_mode=diff', palette]);
  await run(ffmpeg, [
    '-y',
    '-framerate', String(FPS),
    '-i', input,
    '-i', palette,
    '-lavfi', 'paletteuse=dither=bayer:bayer_scale=3',
    '-loop', '0',
    out,
  ]);
  const { size } = await (await import('node:fs/promises')).stat(out);
  console.log(`  ${name}.gif — ${frames} images · ${(size / 1024).toFixed(0)} Ko`);
  return size;
}

await mkdir(OUT, { recursive: true });
console.log('Fabrication des animations du casino…');
let total = 0;
for (const [name, animation] of Object.entries(ANIMATIONS)) total += await build(name, animation);
await rm(TMP, { recursive: true, force: true });
console.log(`Terminé : ${Object.keys(ANIMATIONS).length} animations, ${(total / 1024).toFixed(0)} Ko au total.`);
