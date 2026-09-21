/**
 * Animations de résultat du casino : une par issue possible.
 *
 *   node tools/make-casino-animations.mjs [roulette|des|piece|cartes] [--only=17]
 *
 * - roulette/<n>.gif   la roue ralentit et la bille tombe dans la case n (37)
 * - des/<a>-<b>.gif    les dés roulent et s'arrêtent sur a et b (36)
 * - piece/<cote>.gif   la pièce tourne et retombe sur pile ou face (2)
 * - cartes/<carte>.gif la carte se retourne (52)
 *
 * Même dessin que les images de résultat (src/casinho/render) : l'animation se
 * termine exactement sur ce que la scène finale affiche. Rien ne tourne sur Render.
 */
// En premier : règle les polices (fontconfig) avant que sharp ne dessine quoi que ce soit.
import '../src/casinho/render/engine.js';
import { execFile } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';
import { card, cardBack, CARD_H, CARD_W } from '../src/casinho/render/cards.js';
import { SANS, SERIF } from '../src/casinho/render/engine.js';
import { coinFace, die } from '../src/casinho/render/scenes.js';
import { angleFor, WHEEL_ORDER, wheel } from '../src/casinho/render/wheel.js';
import { cardFile } from '../src/casinho/render/animations.js';

const run = promisify(execFile);
const OUT = path.resolve('assets/casinho');
const TMP = path.resolve('.ai-local/tmp/frames');

const easeOut = (t) => 1 - (1 - t) ** 3;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function frame(w, h, body) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#3b0f2b"/><stop offset="1" stop-color="#10050c"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>${body}</svg>`);
}

/** Encode une suite d'images en GIF (palette calculée sur toute l'animation). */
async function encode(frames, { w, h, fps, out, colors = 64, holdLast = 0 }) {
  const dir = path.join(TMP, path.basename(out, '.gif'));
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const all = [...frames, ...Array(holdLast).fill(frames.at(-1))];
  await Promise.all(all.map((svg, i) => sharp(svg).resize(w, h).png().toFile(path.join(dir, `${String(i).padStart(3, '0')}.png`))));
  const input = path.join(dir, '%03d.png');
  const palette = path.join(dir, 'palette.png');
  await run(ffmpeg, ['-y', '-framerate', String(fps), '-i', input, '-vf', `palettegen=max_colors=${colors}:stats_mode=diff`, palette]);
  // -loop -1 : l'animation joue une fois et s'arrête sur l'issue, elle ne recommence pas.
  await run(ffmpeg, ['-y', '-framerate', String(fps), '-i', input, '-i', palette, '-lavfi', 'paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '-1', out]);
  await rm(dir, { recursive: true, force: true });
  return (await stat(out)).size;
}

// ------------------------------------------------------------------ Roulette
async function roulette(pocket) {
  const W = 260;
  const H = 260;
  const FPS = 11;
  const N = 34; // ~3,1 s
  // La roue est déjà placée avec la case visée en haut ; c'est la bille qui fait le
  // spectacle : elle file sur la piste, ralentit, descend, rebondit deux fois et
  // tombe dans la case. Seule la zone de la bille change d'une image à l'autre,
  // ce qui garde le GIF léger.
  const rotation = angleFor(pocket);
  const ballTurns = 3.25 * 360;
  const frames = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const ball = -ballTurns * (1 - easeOut(clamp(t / 0.9)));
    const fall = clamp((t - 0.5) / 0.4);
    const bounce = 0.06 * Math.abs(Math.sin(fall * Math.PI * 3)) * (1 - fall);
    const depth = 0.99 - 0.25 * easeOut(fall) + bounce;
    frames.push(frame(W, H, wheel({ cx: W / 2, cy: H / 2, r: 104, rotation, ball, ballDepth: depth })));
  }
  return encode(frames, { w: W, h: H, fps: FPS, out: path.join(OUT, 'roulette', `${pocket}.gif`), colors: 40, holdLast: 4 });
}

// ---------------------------------------------------------------------- Dés
async function dice(a, b) {
  const W = 360;
  const H = 220;
  const FPS = 12;
  const N = 26;
  const frames = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const land = clamp((t - 0.55) / 0.45);
    // Les dés traversent la table en rebondissant, les faces défilent, puis ils se posent.
    const faceA = land > 0.6 ? a : 1 + ((i * 5 + 2) % 6);
    const faceB = land > 0.6 ? b : 1 + ((i * 7 + 4) % 6);
    const x1 = 60 + 90 * easeOut(clamp(t / 0.8));
    const x2 = 150 + 100 * easeOut(clamp(t / 0.85));
    const bounce = (1 - easeOut(clamp(t / 0.8))) * Math.abs(Math.sin(t * 14)) * 60;
    const spin = (1 - easeOut(clamp(t / 0.85))) * 720;
    frames.push(frame(W, H, `
      <ellipse cx="${W / 2}" cy="${H - 34}" rx="150" ry="16" fill="rgba(0,0,0,0.4)"/>
      ${die(x1 + 20, 118 - bounce, 70, faceA, -9 + spin)}
      ${die(x2 + 40, 122 - bounce * 0.8, 70, faceB, 11 - spin * 0.8)}`));
  }
  return encode(frames, { w: W, h: H, fps: FPS, out: path.join(OUT, 'des', `${a}-${b}.gif`), colors: 48, holdLast: 3 });
}

// ------------------------------------------------------------- Pile ou face
async function coin(side) {
  const W = 260;
  const H = 260;
  const FPS = 14;
  const N = 28;
  const frames = [];
  const flips = 5; // demi-tours complets
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const e = easeOut(t);
    const angle = (1 - e) * flips * Math.PI;
    // Aplatissement de la pièce selon sa rotation, et la face visible qui alterne.
    const squash = Math.max(0.06, Math.abs(Math.cos(angle)));
    const shown = Math.floor(((1 - e) * flips) % 2) === 0 ? side : side === 'pile' ? 'face' : 'pile';
    const lift = Math.sin(t * Math.PI) * 60 * (1 - t * 0.3);
    frames.push(frame(W, H, `
      <ellipse cx="${W / 2}" cy="${H - 30}" rx="${60 * (0.5 + squash * 0.5)}" ry="10" fill="rgba(0,0,0,0.4)"/>
      <g transform="translate(${W / 2} ${120 - lift}) scale(${squash} 1) translate(${-W / 2} -120)">${coinFace(W / 2, 120, 70, shown, { label: false })}</g>`));
  }
  return encode(frames, { w: W, h: H, fps: FPS, out: path.join(OUT, 'piece', `${side}.gif`), colors: 48, holdLast: 3 });
}

// ------------------------------------------------------------------ Cartes
async function cardFlip(c) {
  const W = 200;
  const H = 250;
  const FPS = 12;
  const N = 16;
  const x = W / 2 - CARD_W / 2;
  const y = H / 2 - CARD_H / 2;
  const frames = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // Le dos, puis la carte pivote sur son axe vertical et montre sa face.
    const turn = easeOut(clamp((t - 0.25) / 0.6));
    const scaleX = Math.max(0.04, Math.abs(Math.cos(turn * Math.PI)));
    const face = turn > 0.5;
    const lift = Math.sin(turn * Math.PI) * 12;
    const body = face ? card(c, x, y - lift) : cardBack(x, y - lift);
    frames.push(frame(W, H, `<g transform="translate(${W / 2} 0) scale(${scaleX} 1) translate(${-W / 2} 0)">${body}</g>`));
  }
  return encode(frames, { w: W, h: H, fps: FPS, out: path.join(OUT, 'cartes', `${cardFile(c)}.gif`), colors: 40, holdLast: 3 });
}

// ------------------------------------------------------------------ Lancement
const args = process.argv.slice(2);
const kind = args.find((a) => !a.startsWith('--'));
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

const jobs = [];
if (!kind || kind === 'roulette') for (const n of WHEEL_ORDER) jobs.push(['roulette', String(n), () => roulette(n)]);
if (!kind || kind === 'des') for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) jobs.push(['des', `${a}-${b}`, () => dice(a, b)]);
if (!kind || kind === 'piece') for (const side of ['pile', 'face']) jobs.push(['piece', side, () => coin(side)]);
if (!kind || kind === 'cartes') for (const s of SUITS) for (const r of RANKS) jobs.push(['cartes', cardFile({ rank: r, suit: s }), () => cardFlip({ rank: r, suit: s })]);

const selected = only ? jobs.filter(([, name]) => name === only) : jobs;
for (const dir of new Set(selected.map(([k]) => k))) await mkdir(path.join(OUT, dir), { recursive: true });

console.log(`Fabrication de ${selected.length} animation(s)…`);
const sizes = {};
const started = Date.now();
for (const [k, name, make] of selected) {
  const size = await make();
  sizes[k] = (sizes[k] ?? 0) + size;
  if (selected.length <= 3) console.log(`  ${k}/${name}.gif — ${(size / 1024).toFixed(0)} Ko`);
}
for (const [k, total] of Object.entries(sizes)) console.log(`  ${k} : ${(total / 1024 / 1024).toFixed(2)} Mo`);
console.log(`Terminé en ${((Date.now() - started) / 1000).toFixed(0)} s.`);
