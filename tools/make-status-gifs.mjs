/**
 * Fabrique les deux cartes animées du salon IA STATUS (assets/iastatus/) :
 * « IA DOWN » sur fond rouge flou, et « IA DE RETOUR » sur fond vert.
 *
 *   node tools/make-status-gifs.mjs
 */
import { execFile } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const run = promisify(execFile);
const OUT = path.resolve('assets/iastatus');
const TMP = path.resolve('assets/iastatus/.frames');

await mkdir(TMP, { recursive: true });
const fontsConf = path.join(TMP, 'fonts.conf');
await writeFile(fontsConf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>${path.resolve('assets')}</dir><include ignore_missing="yes">/etc/fonts/fonts.conf</include><cachedir>${path.join(TMP, 'cache')}</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = fontsConf;
const { default: sharp } = await import('sharp');

const FPS = 10;
const DURATION = 2.5;
const W = 560;
const H = 240;

const DESIGNS = {
  down: { a: '#ff1a2e', b: '#7a0010', title: 'IA DOWN', line: 'NOS ÉQUIPES TRAVAILLENT DESSUS' },
  up: { a: '#1fd67a', b: '#04542c', title: 'IA DE RETOUR', line: 'TOUT FONCTIONNE À NOUVEAU' },
};

function scene(d, t) {
  const k = Math.sin((t / DURATION) * Math.PI * 2);
  const blob = (cx, cy, r, c, o) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}" opacity="${o}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
  <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <rect width="${W}" height="${H}" fill="${d.b}"/>
  <g filter="url(#blur)">
    ${blob(140 + 40 * k, 90, 130, d.a, 0.9)}
    ${blob(420 - 40 * k, 150, 140, d.a, 0.75)}
    ${blob(280, 120 + 20 * k, 90, '#ffffff', 0.12)}
  </g>
  <text x="${W / 2}" y="125" text-anchor="middle" font-family="Noto Sans" font-weight="700" font-size="64" letter-spacing="4" fill="#ffffff" opacity="${0.85 + 0.15 * k}" filter="url(#glow)">${d.title}</text>
  <text x="${W / 2}" y="170" text-anchor="middle" font-family="Noto Sans" font-weight="700" font-size="16" letter-spacing="4" fill="#ffffff" opacity="0.9">${d.line}</text>
</svg>`;
}

for (const [name, d] of Object.entries(DESIGNS)) {
  const dir = path.join(TMP, name);
  await mkdir(dir, { recursive: true });
  const frames = Math.round(DURATION * FPS);
  for (let i = 0; i < frames; i++) await sharp(Buffer.from(scene(d, i / FPS))).png().toFile(path.join(dir, `${String(i).padStart(3, '0')}.png`));
  const input = path.join(dir, '%03d.png');
  const palette = path.join(dir, 'palette.png');
  const out = path.join(OUT, `${name}.gif`);
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-vf', 'palettegen=max_colors=32', palette]);
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-i', palette, '-lavfi', 'paletteuse=dither=bayer:bayer_scale=5', '-loop', '0', out]);
  console.log(`  ${name}.gif — ${((await stat(out)).size / 1024).toFixed(0)} Ko`);
}
await rm(TMP, { recursive: true, force: true });
