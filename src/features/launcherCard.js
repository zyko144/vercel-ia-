// Carte animée de /launcher profil, aux couleurs du launcher (verre sombre, dégradé bleu → cyan) :
// avatar, niveau, statut, semaine, jeu de la semaine, amis et benchmark. Seuls un reflet et le point de statut bougent.
// Police Inter (assets/, licence OFL) chargée par la configuration de polices du moteur de rendu.
// Images SVG rendues par sharp puis assemblées en GIF par ffmpeg (même méthode que les cartes de niveau).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../casinho/render/engine.js';

const W = 960; const H = 540;
const here = path.dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const cut = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
export const hoursText = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m || 0)} min`);
export const tierOf = (t) => (t == null ? null : t >= 1600 ? 'Monstre de jeu' : t >= 1150 ? 'Très haut de gamme' : t >= 850 ? 'Bon PC de jeu' : t >= 550 ? 'Correct pour jouer' : 'Entrée de gamme');

/** Une image de la carte ; shine = position du reflet (ou null), pulse = halo du point de statut (0 à 1). */
export function launcherCardSvg(p, { shine = null, pulse = 0, avatar = null, logo = null } = {}) {
  const bars = [['Processeur · 1 cœur', p.cpu1], ['Processeur · tous', p.cpuN], ['Mémoire', p.ram], ['Disque', p.disk], ['Carte graphique', p.gpu]];
  const MAX = 2500;
  const bx = 360; const bw = 440;
  const ring = p.bench ? Math.min(1, p.bench / 2000) : 0;
  const C = 2 * Math.PI * 62;
  const status = p.playing ? `Joue à ${cut(p.playing, 22)}` : p.online ? 'En ligne' : 'Hors ligne';
  const dot = p.playing || p.online ? '#2ee07a' : '#6b6475';
  const tile = (x, label, value) => `<g transform="translate(${x} 118)"><rect width="188" height="78" rx="16" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.09"/>
    <text x="16" y="28" font-size="12" letter-spacing="1.5" fill="#aea7b8">${esc(label)}</text><text x="16" y="60" font-size="22" font-weight="700" fill="#f4f1f6">${esc(value)}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, 'Noto Sans', 'DejaVu Sans', sans-serif">
  <defs>
    <radialGradient id="g1" cx="0.1" cy="0" r="0.8"><stop offset="0" stop-color="#2f8bff" stop-opacity="0.45"/><stop offset="1" stop-color="#2f8bff" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="1" cy="0.45" r="0.6"><stop offset="0" stop-color="#22d3ee" stop-opacity="0.22"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
    <radialGradient id="g3" cx="0.35" cy="1.05" r="0.6"><stop offset="0" stop-color="#8c5aff" stop-opacity="0.28"/><stop offset="1" stop-color="#8c5aff" stop-opacity="0"/></radialGradient>
    <linearGradient id="acc" x1="0" x2="1"><stop offset="0" stop-color="#2f8bff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.03"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.06"/></linearGradient>
    <linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.13"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
    <clipPath id="av"><circle cx="165" cy="132" r="56"/></clipPath>
    <clipPath id="card"><rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="28"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="#0b090e"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/><rect width="${W}" height="${H}" fill="url(#g2)"/><rect width="${W}" height="${H}" fill="url(#g3)"/>
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="28" fill="url(#glass)" stroke="#ffffff" stroke-opacity="0.12"/>

  <!-- Colonne de gauche : joueur -->
  <rect x="36" y="36" width="258" height="${H - 72}" rx="22" fill="#0e0b16" fill-opacity="0.72" stroke="#ffffff" stroke-opacity="0.08"/>
  <circle cx="165" cy="132" r="63" fill="none" stroke="url(#acc)" stroke-width="5"/>
  ${avatar ? `<image href="${avatar}" x="109" y="76" width="112" height="112" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>` : `<circle cx="165" cy="132" r="56" fill="#1b1720"/><text x="165" y="150" text-anchor="middle" font-size="48" font-weight="800" fill="#9ecbff">${esc(String(p.pseudo ?? '?')[0]?.toUpperCase())}</text>`}
  <text x="165" y="232" text-anchor="middle" font-size="27" font-weight="800" fill="#f4f1f6">${esc(cut(p.pseudo, 16))}</text>
  ${p.playing || p.online ? `<circle cx="${165 - Math.min(110, status.length * 4.1) - 8}" cy="256" r="${(6 + pulse * 7).toFixed(1)}" fill="${dot}" fill-opacity="${(0.45 * (1 - pulse)).toFixed(2)}"/>` : ''}
  <circle cx="${165 - Math.min(110, status.length * 4.1) - 8}" cy="256" r="6" fill="${dot}"/>
  <text x="${165 + 4}" y="261" text-anchor="middle" font-size="15" fill="#d0c9d9">${esc(status)}</text>
  <rect x="106" y="278" width="118" height="30" rx="15" fill="url(#acc)"/>
  <text x="165" y="299" text-anchor="middle" font-size="15" font-weight="800" fill="#ffffff" letter-spacing="1">NIVEAU ${esc(p.level ?? '–')}</text>
  <g transform="translate(165 400)">
    <circle r="62" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="12"/>
    <circle r="62" fill="none" stroke="url(#acc)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(ring * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90)"/>
    <text y="8" text-anchor="middle" font-size="32" font-weight="800" fill="#f4f1f6">${p.bench ? p.bench : '–'}</text>
    <text y="30" text-anchor="middle" font-size="11" letter-spacing="2" fill="#aea7b8">BENCHMARK</text>
  </g>
  <text x="165" y="${H - 48}" text-anchor="middle" font-size="13" fill="#22d3ee">${esc(p.bench ? tierOf(p.bench) : 'pas encore mesuré')}</text>

  <!-- Colonne de droite : semaine et benchmark -->
  ${logo ? `<image href="${logo}" x="330" y="40" width="40" height="40"/>` : ''}
  <text x="380" y="60" font-size="13" font-weight="700" letter-spacing="4" fill="#22d3ee">HISTORY LAUNCHER</text>
  <text x="380" y="84" font-size="22" font-weight="800" fill="#f4f1f6">Profil de joueur</text>
  ${tile(330, 'CETTE SEMAINE', hoursText(p.week))}${tile(530, 'JEU DE LA SEMAINE', cut(p.top ?? '—', 13))}${tile(730, 'AMIS HISTORY', String(p.friends ?? 0))}
  <text x="330" y="236" font-size="13" font-weight="700" letter-spacing="2" fill="#aea7b8">BENCHMARK EXTRÊME · 1000 = PC DE JEU MILIEU DE GAMME</text>
  ${bars.map(([label, v], i) => {
    const y = 256 + i * 38;
    const w = v ? Math.max(6, (bw * Math.min(v, MAX)) / MAX) : 0;
    const ref = bx + (bw * 1000) / MAX;
    return `<text x="330" y="${y + 13}" font-size="14" fill="#e2dce8">${esc(label)}</text>
    <rect x="${bx + 130}" y="${y}" width="${bw - 130}" height="14" rx="7" fill="#ffffff" fill-opacity="0.07"/>
    ${v ? `<rect x="${bx + 130}" y="${y}" width="${Math.max(6, (w * (bw - 130)) / bw).toFixed(1)}" height="14" rx="7" fill="url(#acc)"/>` : ''}
    <rect x="${(bx + 130 + ((ref - bx) * (bw - 130)) / bw).toFixed(1)}" y="${y - 3}" width="2" height="20" fill="#ffffff" fill-opacity="0.8"/>
    <text x="${bx + bw + 20}" y="${y + 13}" font-size="16" font-weight="800" fill="#f4f1f6">${v ? Math.round(v) : '–'}</text>`;
  }).join('')}
  <text x="330" y="${H - 72}" font-size="13" fill="#aea7b8">${esc(cut([p.benchCpu, p.benchGpu].filter(Boolean).join('  ·  ') || 'Lance le benchmark dans Mon PC › Performances', 90))}</text>
  <text x="330" y="${H - 48}" font-size="13" fill="#8c8596">historylauncher.vercel.app</text>
  ${shine == null ? '' : `<g clip-path="url(#card)"><rect x="${Math.round(shine)}" y="-120" width="240" height="${H + 240}" fill="url(#shine)" transform="rotate(20 ${Math.round(shine) + 120} ${H / 2})"/></g>`}
</svg>`;
}

async function dataUri(buf, mime) { return buf ? `data:${mime};base64,${Buffer.from(buf).toString('base64')}` : null; }

/** GIF animé de la carte (≈ 2,5 s en boucle) ; avatarUrl = image PNG du membre Discord. */
export async function launcherCardGif(p, { avatarUrl = null, fetchImpl = fetch } = {}) {
  const [{ default: sharp }, { default: ffmpeg }, fs, os, { spawn }] = await Promise.all([import('sharp'), import('ffmpeg-static'), import('node:fs/promises'), import('node:os'), import('node:child_process')]);
  const avBuf = avatarUrl ? await fetchImpl(avatarUrl, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null;
  const avatar = avBuf ? await dataUri(await sharp(Buffer.from(avBuf)).resize(128, 128).png().toBuffer(), 'image/png') : null;
  const logoBuf = await readFile(path.join(here, '..', '..', 'launcher', 'src', 'ui', 'logo.png')).catch(() => null);
  const logo = logoBuf ? await dataUri(await sharp(logoBuf).resize(80, 80, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(), 'image/png') : null;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcarte-'));
  const run = (args) => new Promise((resolve, reject) => {
    const pr = spawn(ffmpeg, args, { stdio: 'ignore' });
    pr.on('error', reject);
    pr.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
  try {
    // Tout est fixe (barres pleines d'emblée) : un reflet traverse la carte et le point « en ligne » pulse
    const N = 24; const SHINE = 12;
    const frames = Array.from({ length: N }, (_, i) => ({ shine: i < SHINE ? -300 + (i * 1500) / (SHINE - 1) : null, pulse: (i % 12) / 12 }));
    for (const [i, f] of frames.entries()) {
      await sharp(Buffer.from(launcherCardSvg(p, { ...f, avatar, logo }))).png().toFile(path.join(dir, `f${String(i).padStart(3, '0')}.png`));
    }
    const input = path.join(dir, 'f%03d.png');
    await run(['-y', '-framerate', '15', '-i', input, '-vf', 'palettegen=max_colors=192:stats_mode=full', path.join(dir, 'p.png')]);
    await run(['-y', '-framerate', '15', '-i', input, '-i', path.join(dir, 'p.png'), '-lavfi', 'paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', path.join(dir, 'c.gif')]);
    return await fs.readFile(path.join(dir, 'c.gif'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
