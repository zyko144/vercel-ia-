/**
 * Fabrique les deux cartes animées de la surveillance vocale (assets/sanction/) :
 * un tampon néon qui s'écrase sur l'écran, « AVERTISSEMENT » (ambre) ou « SANCTION » (rouge).
 * Faites une fois ici, puis simplement jointes aux messages : rien à calculer sur le serveur.
 *
 *   node tools/make-sanction-gifs.mjs          (--png : image fixe d'aperçu en plus)
 */
import { execFile } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const run = promisify(execFile);
const OUT = path.resolve('assets/sanction');
const TMP = path.resolve('assets/sanction/.frames');

// Les polices d'assets/ ne sont pas installées : on les déclare à fontconfig avant de charger sharp.
await mkdir(TMP, { recursive: true });
const fontsConf = path.join(TMP, 'fonts.conf');
await writeFile(fontsConf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>${path.resolve('assets')}</dir><include ignore_missing="yes">/etc/fonts/fonts.conf</include><cachedir>${path.join(TMP, 'cache')}</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = fontsConf;
const { default: sharp } = await import('sharp');

const FPS = 15;
const DURATION = 3.4;
const W = 560;
const H = 315;

const DESIGNS = {
  avertissement: {
    color: '#ffb020', glow: '#ff8a00', stamp: 'AVERTISSEMENT', size: 40,
    line: '1er AVERTISSEMENT', footer: 'INSULTE DÉTECTÉE EN VOCAL · LA PROCHAINE, C’EST L’EXCLUSION',
  },
  sanction: {
    color: '#ff3355', glow: '#ff0033', stamp: 'SANCTION', size: 60,
    line: 'EXCLU 1 MIN · HORS DU VOCAL', footer: 'RÉCIDIVE · INSULTE DÉTECTÉE EN VOCAL',
  },
};

const ease = (t) => 1 - (1 - t) ** 3;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
// Petit scintillement de néon, toujours le même d'une fabrication à l'autre
const FLICKER = [1, 1, 1, 0.55, 1, 1, 1, 1, 0.8, 1, 0.4, 1, 1, 1, 1, 1, 0.7, 1];

function scene(d, t) {
  const slam = clamp(t / 0.32); // le tampon tombe
  const scale = 2.6 - 1.6 * ease(slam);
  const opacity = clamp(slam * 1.6);
  const since = t - 0.32; // secondes depuis l'impact
  const shake = since > 0 && since < 0.6 ? Math.sin(since * 70) * 9 * (1 - since / 0.6) : 0;
  const ring = since > 0 && since < 0.7 ? since / 0.7 : null;
  const neon = since > 0.6 ? FLICKER[Math.floor(t * FPS) % FLICKER.length] : 1;
  const pulse = 0.75 + 0.25 * Math.sin(t * Math.PI * 2 / 1.7);
  const cx = W / 2;
  const cy = H / 2 - 22;
  const sw = d.stamp.length * d.size * 0.74 + 56;
  const sh = 108;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#1b1026"/><stop offset="0.6" stop-color="#0b0812"/><stop offset="1" stop-color="#050408"/></radialGradient>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#ffffff" opacity="0.045"/></pattern>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="${d.color}" stroke-opacity="0.07"/></pattern>
    <filter id="glow" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="ink"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 1.55" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>

  <!-- cadre néon -->
  <rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="16" fill="none" stroke="${d.glow}" stroke-width="3" opacity="${0.55 * pulse * neon}" filter="url(#glow)"/>
  <rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="16" fill="none" stroke="${d.color}" stroke-width="1.5" opacity="${0.9 * neon}"/>

  <!-- en-tête -->
  <g font-family="Noto Sans" font-weight="700" font-size="12" letter-spacing="3">
    <circle cx="36" cy="36" r="5" fill="${d.color}" opacity="${0.4 + 0.6 * (Math.floor(t * 2) % 2)}" filter="url(#glow)"/>
    <text x="48" y="40" fill="#8ef6ff" opacity="${0.85 * neon}" filter="url(#glow)">AI VERCEL · SURVEILLANCE VOCALE</text>
    <text x="${W - 30}" y="40" text-anchor="end" fill="${d.color}" opacity="0.8">REC ●</text>
  </g>

  ${ring !== null ? `<circle cx="${cx}" cy="${cy}" r="${60 + ring * 260}" fill="none" stroke="${d.color}" stroke-width="${6 * (1 - ring)}" opacity="${0.8 * (1 - ring)}" filter="url(#glow)"/>` : ''}
  ${since > 0 && since < 0.12 ? `<rect width="${W}" height="${H}" fill="${d.color}" opacity="${0.22 * (1 - since / 0.12)}"/>` : ''}

  <!-- le tampon -->
  <g transform="translate(${cx + shake} ${cy + shake * 0.4}) rotate(-7) scale(${scale})" opacity="${opacity}">
    <g filter="url(#glow)" opacity="${neon}">
      <rect x="${-sw / 2}" y="${-sh / 2}" width="${sw}" height="${sh}" rx="14" fill="none" stroke="${d.color}" stroke-width="7"/>
      <rect x="${-sw / 2 + 10}" y="${-sh / 2 + 10}" width="${sw - 20}" height="${sh - 20}" rx="8" fill="none" stroke="${d.color}" stroke-width="2"/>
    </g>
    <text x="0" y="${d.size * 0.28}" text-anchor="middle" font-family="Noto Sans" font-weight="700" font-size="${d.size}" letter-spacing="3" fill="${d.color}" opacity="0.5">${d.stamp}</text>
    <g filter="url(#ink)">
      <text x="0" y="${d.size * 0.28}" text-anchor="middle" font-family="Noto Sans" font-weight="700" font-size="${d.size}" letter-spacing="3" fill="${d.color}">${d.stamp}</text>
    </g>
    <text x="0" y="${d.size * 0.28}" text-anchor="middle" font-family="Noto Sans" font-weight="700" font-size="${d.size}" letter-spacing="3" fill="${d.glow}" opacity="${0.35 * neon}" filter="url(#soft)">${d.stamp}</text>
    <text x="0" y="${sh / 2 - 20}" text-anchor="middle" font-family="Noto Sans" font-weight="700" font-size="13" letter-spacing="4" fill="#ffffff" opacity="0.92">${d.line}</text>
  </g>

  <!-- micro barré + pied -->
  <g transform="translate(${cx} ${H - 58})" opacity="${clamp((t - 0.5) * 3)}">
    <g fill="none" stroke="${d.color}" stroke-width="2.5" stroke-linecap="round" filter="url(#glow)" opacity="${neon}">
      <rect x="-7" y="-14" width="14" height="22" rx="7"/>
      <path d="M-13 1a13 13 0 0 0 26 0M0 14v6M-24 -18 24 20"/>
    </g>
  </g>
  <text x="${cx}" y="${H - 26}" text-anchor="middle" font-family="Noto Sans" font-weight="700" font-size="11" letter-spacing="2.5" fill="#e9e3ff" opacity="${0.8 * clamp((t - 0.6) * 3)}">${d.footer}</text>

  <rect width="${W}" height="${H}" fill="url(#scan)"/>
</svg>`;
}

async function build(name, d, preview) {
  const dir = path.join(TMP, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const frames = Math.round(DURATION * FPS);
  for (let i = 0; i < frames; i++) {
    await sharp(Buffer.from(scene(d, i / FPS))).png().toFile(path.join(dir, `${String(i).padStart(3, '0')}.png`));
  }
  if (preview) await sharp(Buffer.from(scene(d, 1.4))).png().toFile(path.join(process.env.APERCU_DIR ?? OUT, `apercu-${name}.png`));
  const input = path.join(dir, '%03d.png');
  const palette = path.join(dir, 'palette.png');
  const out = path.join(OUT, `${name}.gif`);
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-vf', 'palettegen=max_colors=80:stats_mode=full', palette]);
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-i', palette, '-lavfi', 'paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '0', out]);
  const { size } = await stat(out);
  console.log(`  ${name}.gif — ${(size / 1024).toFixed(0)} Ko`);
}

const preview = process.argv.includes('--png');
for (const [name, d] of Object.entries(DESIGNS)) await build(name, d, preview);
await rm(TMP, { recursive: true, force: true });
