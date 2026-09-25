/**
 * Bannière animée de la boutique (assets/panneaux/boutique.gif) : un parchemin de pirate déchiré et brûlé,
 * un coffre au trésor qui s'ouvre à moitié, des pièces d'or qui montent et scintillent. Boucle sans coupure.
 *
 *   node tools/make-shop-gif.mjs            (--png : aperçu fixe en plus)
 */
import { execFile } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const run = promisify(execFile);
const OUT = path.resolve('assets/panneaux');
const TMP = path.resolve('assets/panneaux/.frames-boutique');
await mkdir(TMP, { recursive: true });
const fontsConf = path.join(TMP, 'fonts.conf');
await writeFile(fontsConf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>${path.resolve('assets')}</dir><include ignore_missing="yes">/etc/fonts/fonts.conf</include><cachedir>${path.join(TMP, 'cache')}</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = fontsConf;
const { default: sharp } = await import('sharp');

const FPS = 12;
const DURATION = 3;
const W = 600;
const H = 200;

// Bord déchiré (pseudo-hasard fixe : le même à chaque image)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pts = [];
for (let x = 0; x <= W; x += 15) pts.push([x, 4 + rnd() * 10]);
for (let y = 15; y < H; y += 15) pts.push([W - 4 - rnd() * 10, y]);
for (let x = W; x >= 0; x -= 15) pts.push([x, H - 4 - rnd() * 10]);
for (let y = H - 15; y > 0; y -= 15) pts.push([4 + rnd() * 10, y]);
const TORN = `M${pts.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' L')} Z`;
const COINS = Array.from({ length: 9 }, (_, i) => ({ x: 95 + (i % 3) * 22 + rnd() * 30, phase: i / 9, size: 7 + rnd() * 4 }));
const SPARKS = Array.from({ length: 10 }, () => ({ x: 200 + rnd() * 360, y: 30 + rnd() * 140, phase: rnd() }));

function scene(t) {
  const k = (t / DURATION) % 1;
  const lid = -18 - 10 * Math.sin(k * Math.PI * 2); // le couvercle respire
  const glow = 0.55 + 0.35 * Math.sin(k * Math.PI * 2);
  const coins = COINS.map((c) => {
    const p = (k + c.phase) % 1;
    const y = 128 - p * 95;
    const op = p < 0.1 ? p * 10 : p > 0.8 ? (1 - p) * 5 : 1;
    const flip = Math.abs(Math.cos((p * 3 + c.phase) * Math.PI));
    return `<ellipse cx="${c.x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(c.size * flip + 1).toFixed(1)}" ry="${c.size.toFixed(1)}" fill="#f2c14e" stroke="#8a5a14" stroke-width="1.5" opacity="${op.toFixed(2)}"/>`;
  }).join('');
  const sparks = SPARKS.map((s) => {
    const p = (k * 2 + s.phase) % 1;
    const r = Math.max(0, Math.sin(p * Math.PI)) * 5;
    return `<path d="M${s.x} ${s.y - r * 2}L${s.x + r * 0.5} ${s.y}L${s.x} ${s.y + r * 2}L${s.x - r * 0.5} ${s.y}Z M${s.x - r * 2} ${s.y}L${s.x} ${s.y + r * 0.5}L${s.x + r * 2} ${s.y}L${s.x} ${s.y - r * 0.5}Z" fill="#fff4c2" opacity="${(r / 5).toFixed(2)}"/>`;
  }).join('');
  const sweep = -200 + k * (W + 400);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="paper" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#f3e4bf"/><stop offset="0.55" stop-color="#e2c992"/><stop offset="0.85" stop-color="#b98d4f"/><stop offset="1" stop-color="#6e4520"/></radialGradient>
    <radialGradient id="shine" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd36b" stop-opacity="${glow.toFixed(2)}"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>
    <linearGradient id="sweep" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="burn" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="torn"><path d="${TORN}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#1a120a"/>
  <path d="${TORN}" fill="url(#paper)"/>
  <g clip-path="url(#torn)">
    <path d="${TORN}" fill="none" stroke="#2a1606" stroke-width="22" stroke-opacity="0.6" filter="url(#burn)"/>
    <path d="${TORN}" fill="none" stroke="#120802" stroke-width="6" stroke-opacity="0.85" filter="url(#burn)"/>
    <rect x="${sweep.toFixed(0)}" y="0" width="160" height="${H}" fill="url(#sweep)" transform="skewX(-20)"/>
  </g>
  <circle cx="120" cy="120" r="80" fill="url(#shine)"/>
  <!-- Coffre -->
  <g transform="translate(70 95)">
    <rect x="0" y="22" width="100" height="58" rx="6" fill="#7a4a1f" stroke="#3b2412" stroke-width="3"/>
    <rect x="0" y="40" width="100" height="8" fill="#c9a24a" stroke="#3b2412" stroke-width="1.5"/>
    <rect x="44" y="34" width="12" height="20" rx="2" fill="#f2c14e" stroke="#3b2412" stroke-width="1.5"/>
    <g transform="rotate(${lid.toFixed(1)} 0 22)">
      <path d="M0 22 Q0 0 50 0 Q100 0 100 22 Z" fill="#8b5626" stroke="#3b2412" stroke-width="3"/>
      <rect x="0" y="16" width="100" height="6" fill="#c9a24a" stroke="#3b2412" stroke-width="1.5"/>
    </g>
  </g>
  ${coins}
  ${sparks}
  <g font-family="Cinzel" font-weight="700" fill="#3b2412">
    <text x="215" y="82" font-size="15" letter-spacing="4" fill="#8c1c13">AI VERCEL · BOUTIQUE</text>
    <text x="215" y="120" font-size="30">LE COMPTOIR</text>
    <text x="215" y="155" font-size="30">DU CAPITAINE</text>
  </g>
</svg>`;
}

const frames = Math.round(DURATION * FPS);
for (let i = 0; i < frames; i++) await sharp(Buffer.from(scene(i / FPS))).png().toFile(path.join(TMP, `${String(i).padStart(3, '0')}.png`));
if (process.argv.includes('--png')) await sharp(Buffer.from(scene(0.4))).png().toFile(path.join(process.env.APERCU_DIR ?? OUT, 'apercu-boutique.png'));
const input = path.join(TMP, '%03d.png');
const palette = path.join(TMP, 'palette.png');
const out = path.join(OUT, 'boutique.gif');
await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-vf', 'palettegen=max_colors=96:stats_mode=full', palette]);
await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-i', palette, '-lavfi', 'paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', out]);
console.log(`boutique.gif — ${((await stat(out)).size / 1024).toFixed(0)} Ko`);
await rm(TMP, { recursive: true, force: true });
