/**
 * Fabrique les bannières animées des panneaux (assets/panneaux/*.gif) : un titre néon qui s'allume,
 * une icône, un balayage lumineux. Même style que les tampons de la surveillance vocale.
 * Faites une fois ici, puis servies par le bot (/panneaux/…) ou jointes aux messages.
 *
 *   node tools/make-panel-gifs.mjs            (--png : aperçus fixes en plus)
 */
import { execFile } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const run = promisify(execFile);
const OUT = path.resolve('assets/panneaux');
const TMP = path.resolve('assets/panneaux/.frames');

await mkdir(TMP, { recursive: true });
const fontsConf = path.join(TMP, 'fonts.conf');
await writeFile(fontsConf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>${path.resolve('assets')}</dir><include ignore_missing="yes">/etc/fonts/fonts.conf</include><cachedir>${path.join(TMP, 'cache')}</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = fontsConf;
const { default: sharp } = await import('sharp');

const FPS = 12;
const DURATION = 2.5; // une boucle sans coupure
const W = 480;
const H = 150;

// Icônes simples (traits), dessinées dans une boîte de 48 × 48
const ICONS = {
  sanction: 'M24 6 8 12v11c0 9 7 16 16 19 9-3 16-10 16-19V12zM24 16v11M24 32h.1',
  jeux: 'M10 16h28a8 8 0 0 1 8 8v4a8 8 0 0 1-8 8c-4 0-6-4-10-4h-8c-4 0-6 4-10 4a8 8 0 0 1-8-8v-4a8 8 0 0 1 8-8zM14 22v8M10 26h8M32 24h.1M36 28h.1',
  pannel: 'M8 8h32v32H8zM8 18h32M18 18v22M24 26h10M24 32h10',
  musique: 'M18 36V12l22-4v24M18 36a5 5 0 1 1-10 0 5 5 0 0 1 10 0zM40 32a5 5 0 1 1-10 0 5 5 0 0 1 10 0z',
  serveur: 'M8 10h32v10H8zM8 28h32v10H8zM14 15h.1M14 33h.1M22 15h12M22 33h12',
  ia: 'M24 6a9 9 0 0 1 9 9v2a7 7 0 0 1 7 7v4a7 7 0 0 1-7 7h-3l-6 7-6-7h-3a7 7 0 0 1-7-7v-4a7 7 0 0 1 7-7v-2a9 9 0 0 1 9-9zM19 24h.1M29 24h.1',
  ticket: 'M6 16a4 4 0 0 0 0 8v8h36v-8a4 4 0 0 1 0-8V8H6zM28 8v24M20 18l-2 2 2 2',
  build: 'M8 40h32M12 40V20l12-10 12 10v20M20 40V28h8v12',
};

export const DESIGNS = {
  sanction: { color: '#ff3355', glow: '#ff0033', title: 'SANCTIONS', sub: 'MUET · EXPULSION · BAN · AVERTISSEMENTS' },
  jeux: { color: '#3dff9a', glow: '#00d66b', title: 'JEUX', sub: 'LOUP-GAROU · BLIND TEST · IMPOSTEUR' },
  pannel: { color: '#ffc94d', glow: '#ff9d00', title: 'PANNEAUX', sub: 'TICKETS · ANNONCES · SALONS' },
  musique: { color: '#ff5fd2', glow: '#e600a8', title: 'MUSIQUE', sub: 'LECTURE · PLAYLISTS · RADIO · EFFETS' },
  serveur: { color: '#4db8ff', glow: '#0088ff', title: 'SERVEUR', sub: 'INFOS · RÔLES · RAPPELS · PREMIUM' },
  ia: { color: '#a58bff', glow: '#7a4dff', title: 'INTELLIGENCE', sub: 'QUESTIONS · IMAGES · CODE · VOCAL' },
  ticket: { color: '#5ff0ff', glow: '#00c8e6', title: 'SUPPORT', sub: 'OUVRE UN TICKET · LE STAFF TE RÉPOND' },
  build: { color: '#ffa04d', glow: '#ff6a00', title: 'CONSTRUCTION', sub: 'CATÉGORIES · SALONS · VOCAUX' },
};

const FLICKER = [1, 1, 1, 1, 0.55, 1, 1, 1, 1, 1, 0.8, 1, 1, 1, 0.45, 1, 1, 1, 1, 1];

function scene(key, d, t) {
  const phase = t / DURATION; // 0 → 1 : tout est périodique pour que la boucle ne se voie pas
  const neon = FLICKER[Math.floor(t * FPS) % FLICKER.length];
  const pulse = 0.7 + 0.3 * Math.sin(phase * Math.PI * 2);
  const sweep = -120 + phase * (W + 240); // reflet qui traverse la bannière
  const dots = Array.from({ length: 14 }, (_, i) => {
    const x = (i * 97 + phase * W * (i % 2 ? 1 : -1) + W * 2) % W;
    const y = 18 + ((i * 53) % (H - 36));
    return `<circle cx="${x.toFixed(1)}" cy="${y}" r="${1 + (i % 3) * 0.6}" fill="${d.color}" opacity="${0.15 + 0.2 * ((i * 7) % 5) / 5}"/>`;
  }).join('');
  const size = Math.min(38, Math.floor(318 / (d.title.length * 0.78)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="30%" cy="40%" r="90%"><stop offset="0" stop-color="#1b1026"/><stop offset="0.65" stop-color="#0b0812"/><stop offset="1" stop-color="#050408"/></radialGradient>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#ffffff" opacity="0.045"/></pattern>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="${d.color}" stroke-opacity="0.07"/></pattern>
    <linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="glow" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  ${dots}
  <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="14" fill="none" stroke="${d.glow}" stroke-width="3" opacity="${0.5 * pulse * neon}" filter="url(#glow)"/>
  <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="14" fill="none" stroke="${d.color}" stroke-width="1.3" opacity="${0.9 * neon}"/>

  <g transform="translate(34 ${H / 2 - 30}) scale(1.25)" fill="none" stroke="${d.color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" opacity="${neon}">
    <path d="${ICONS[key]}"/>
  </g>
  <line x1="112" y1="30" x2="112" y2="${H - 30}" stroke="${d.color}" stroke-opacity="0.35"/>

  <g font-family="Noto Sans" font-weight="700">
    <text x="130" y="${H / 2 + 6}" font-size="${size}" letter-spacing="4" fill="${d.glow}" opacity="${0.45 * neon}" filter="url(#glow)">${d.title}</text>
    <text x="130" y="${H / 2 + 6}" font-size="${size}" letter-spacing="4" fill="${d.color}" opacity="${neon}">${d.title}</text>
    <text x="131" y="${H / 2 + 32}" font-size="10.5" letter-spacing="2.4" fill="#e9e3ff" opacity="0.8">${d.sub}</text>
    <text x="${W - 26}" y="30" text-anchor="end" font-size="10" letter-spacing="3" fill="#8ef6ff" opacity="${0.75 * neon}">AI VERCEL</text>
  </g>

  <rect x="${sweep.toFixed(1)}" y="0" width="120" height="${H}" fill="url(#shine)" transform="skewX(-18)"/>
  <rect width="${W}" height="${H}" fill="url(#scan)"/>
</svg>`;
}

async function build(key, d, preview) {
  const dir = path.join(TMP, key);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const frames = Math.round(DURATION * FPS);
  for (let i = 0; i < frames; i++) {
    await sharp(Buffer.from(scene(key, d, i / FPS))).png().toFile(path.join(dir, `${String(i).padStart(3, '0')}.png`));
  }
  if (preview) await sharp(Buffer.from(scene(key, d, 0.3))).png().toFile(path.join(process.env.APERCU_DIR ?? OUT, `apercu-${key}.png`));
  const input = path.join(dir, '%03d.png');
  const palette = path.join(dir, 'palette.png');
  const out = path.join(OUT, `${key}.gif`);
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-vf', 'palettegen=max_colors=64:stats_mode=full', palette]);
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-i', palette, '-lavfi', 'paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '0', out]);
  const { size } = await stat(out);
  console.log(`  ${key}.gif — ${(size / 1024).toFixed(0)} Ko`);
}

const preview = process.argv.includes('--png');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const [key, d] of Object.entries(DESIGNS)) if (!only.length || only.includes(key)) await build(key, d, preview);
await rm(TMP, { recursive: true, force: true });
