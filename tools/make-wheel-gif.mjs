/**
 * Roue de la fortune animée (assets/panneaux/roue.gif) : une roue de gouvernail en bois et or
 * sur un parchemin déchiré et brûlé, qui tourne vite puis ralentit. Montrée pendant que la roue tourne.
 *
 *   node tools/make-wheel-gif.mjs
 */
import { execFile } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const run = promisify(execFile);
const OUT = path.resolve('assets/panneaux');
const TMP = path.resolve('assets/panneaux/.frames-roue');
await mkdir(TMP, { recursive: true });
const fontsConf = path.join(TMP, 'fonts.conf');
await writeFile(fontsConf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>${path.resolve('assets')}</dir><include ignore_missing="yes">/etc/fonts/fonts.conf</include><cachedir>${path.join(TMP, 'cache')}</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = fontsConf;
const { default: sharp } = await import('sharp');

const FPS = 15;
const DURATION = 3.2;
const W = 600;
const H = 260;
const CX = 150;
const CY = 130;
const R = 105;
const SEGMENTS = ['×0', '×0,5', '×1', '×0', '×2', '×0,5', '×0,5', '×0', '×1,5', '×0,5', '×5', '×0'];
const COLORS = ['#8c1c13', '#e2c992', '#1f5f5a', '#3b2412', '#f2c14e', '#e2c992', '#7c6cff', '#3b2412', '#1fb5b0', '#e2c992', '#ff9f2e', '#8c1c13'];

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pts = [];
for (let x = 0; x <= W; x += 15) pts.push([x, 4 + rnd() * 10]);
for (let y = 15; y < H; y += 15) pts.push([W - 4 - rnd() * 10, y]);
for (let x = W; x >= 0; x -= 15) pts.push([x, H - 4 - rnd() * 10]);
for (let y = H - 15; y > 0; y -= 15) pts.push([4 + rnd() * 10, y]);
const TORN = `M${pts.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' L')} Z`;

const slice = (i) => {
  const a0 = (i / SEGMENTS.length) * Math.PI * 2 - Math.PI / 2;
  const a1 = ((i + 1) / SEGMENTS.length) * Math.PI * 2 - Math.PI / 2;
  const p = (a, r) => `${(CX + Math.cos(a) * r).toFixed(1)},${(CY + Math.sin(a) * r).toFixed(1)}`;
  const mid = (a0 + a1) / 2;
  const light = ['#e2c992', '#f2c14e', '#ff9f2e', '#1fb5b0'].includes(COLORS[i]);
  return `<path d="M${CX},${CY} L${p(a0, R)} A${R},${R} 0 0 1 ${p(a1, R)} Z" fill="${COLORS[i]}" stroke="#2a1606" stroke-width="2"/>
    <text x="${(CX + Math.cos(mid) * R * 0.68).toFixed(1)}" y="${(CY + Math.sin(mid) * R * 0.68 + 5).toFixed(1)}" font-size="14" text-anchor="middle" fill="${light ? '#2a1606' : '#f3e4bf'}" transform="rotate(${((mid * 180) / Math.PI + 90).toFixed(1)} ${(CX + Math.cos(mid) * R * 0.68).toFixed(1)} ${(CY + Math.sin(mid) * R * 0.68).toFixed(1)})">${SEGMENTS[i]}</text>`;
};

function scene(t) {
  // Rapide puis de plus en plus lent, et on repart (boucle)
  const k = t / DURATION;
  const angle = 1440 * (1 - (1 - k) ** 3);
  const handles = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return `<line x1="${CX + Math.cos(a) * R}" y1="${CY + Math.sin(a) * R}" x2="${CX + Math.cos(a) * (R + 16)}" y2="${CY + Math.sin(a) * (R + 16)}" stroke="#5a3515" stroke-width="9" stroke-linecap="round"/>`;
  }).join('');
  const glow = 0.4 + 0.3 * Math.sin(t * 6);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="paper" cx="45%" cy="40%" r="80%"><stop offset="0" stop-color="#f3e4bf"/><stop offset="0.6" stop-color="#e2c992"/><stop offset="0.9" stop-color="#b98d4f"/><stop offset="1" stop-color="#6e4520"/></radialGradient>
    <filter id="burn"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="torn"><path d="${TORN}"/></clipPath>
  </defs>
  <path d="${TORN}" fill="url(#paper)"/>
  <g clip-path="url(#torn)"><path d="${TORN}" fill="none" stroke="#2a1606" stroke-width="22" stroke-opacity="0.55" filter="url(#burn)"/></g>
  <circle cx="${CX}" cy="${CY}" r="${R + 20}" fill="#f2c14e" opacity="${glow.toFixed(2)}" filter="url(#burn)"/>
  <g transform="rotate(${angle.toFixed(1)} ${CX} ${CY})" font-family="Cinzel" font-weight="700">
    ${handles}
    ${SEGMENTS.map((_, i) => slice(i)).join('')}
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#5a3515" stroke-width="7"/>
    <circle cx="${CX}" cy="${CY}" r="20" fill="#5a3515" stroke="#f2c14e" stroke-width="3"/>
  </g>
  <path d="M${CX - 11},${CY - R - 22} L${CX + 11},${CY - R - 22} L${CX},${CY - R + 2} Z" fill="#8c1c13" stroke="#2a1606" stroke-width="2"/>
  <g font-family="Cinzel" font-weight="700" fill="#3b2412">
    <text x="295" y="92" font-size="15" letter-spacing="4" fill="#8c1c13">AI VERCEL · TAVERNE</text>
    <text x="295" y="132" font-size="30">LA ROUE DE</text>
    <text x="295" y="168" font-size="30">LA FORTUNE</text>
    <text x="295" y="200" font-size="13" letter-spacing="2" fill="#6b4a2a">JUSQU’À ×5 TA MISE</text>
  </g>
</svg>`;
}

const frames = Math.round(DURATION * FPS);
for (let i = 0; i < frames; i++) await sharp(Buffer.from(scene(i / FPS))).png().toFile(path.join(TMP, `${String(i).padStart(3, '0')}.png`));
if (process.env.APERCU_DIR) await sharp(Buffer.from(scene(0.5))).png().toFile(path.join(process.env.APERCU_DIR, 'apercu-roue.png'));
const input = path.join(TMP, '%03d.png');
const palette = path.join(TMP, 'palette.png');
const out = path.join(OUT, 'roue.gif');
await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-vf', 'palettegen=max_colors=128:stats_mode=full', palette]);
await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-i', palette, '-lavfi', 'paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', out]);
console.log(`roue.gif — ${((await stat(out)).size / 1024).toFixed(0)} Ko`);
await rm(TMP, { recursive: true, force: true });
