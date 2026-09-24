/**
 * Cartes de rôle animées pour les mini-jeux (imposteur, loup-garou).
 *
 *   node tools/make-jeux-gifs.mjs            (toutes les cartes)
 *   node tools/make-jeux-gifs.mjs loup       (une seule, pour retoucher)
 *   node tools/make-jeux-gifs.mjs --png      (+ un aperçu PNG de chaque carte)
 *   node tools/make-jeux-gifs.mjs --site     (+ les cartes en image fixe HD pour le site, dans site/cartes/)
 *
 * Les GIFs sont commités dans assets/jeux/ et envoyés en MP : rien n'est encodé
 * pendant une partie, le rôle part sans attente.
 *
 * La carte montre son rôle dès la première image, puis vit en boucle : halo qui
 * respire, particules (braises du loup, étoiles de la voyante…), reflet qui passe.
 * Quand Discord n'anime pas les GIF (réglage « lire les GIF automatiquement »
 * coupé, fenêtre pas au premier plan), il affiche la première image : elle doit
 * donc être la face du rôle, jamais le dos. Les dessins sont faits à la main en
 * SVG : les emojis, eux, sortaient en silhouettes noires.
 */
import { execFile } from 'node:child_process';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const run = promisify(execFile);
const OUT = path.resolve('assets/jeux');
const TMP = path.resolve('assets/jeux/.frames');

// La police Cinzel (assets/) n'est pas installée sur la machine : on la déclare à
// fontconfig avant de charger sharp, sinon le texte retombe sur une police par défaut.
await mkdir(TMP, { recursive: true });
const fontsConf = path.join(TMP, 'fonts.conf');
await writeFile(fontsConf, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig><dir>${path.resolve('assets')}</dir><include ignore_missing="yes">/etc/fonts/fonts.conf</include><cachedir>${path.join(TMP, 'cache')}</cachedir></fontconfig>`);
process.env.FONTCONFIG_FILE = fontsConf;
const { default: sharp } = await import('sharp');

const FPS = 15;
const DURATION = 3.6; // secondes : une boucle, sans coupure visible
const W = 480;
const H = 300;
const CARD = { x: 16, y: 14, w: W - 32, h: H - 28, r: 22 };
const MEDAL = { cx: 132, cy: 150, r: 88 };
const TEXT_X = 250;
const SERIF = "Cinzel, 'DejaVu Serif', serif";
const SANS = "'Noto Sans', 'DejaVu Sans', sans-serif";

// ============================== petits outils ==============================

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const phase = (t, start, length) => clamp((t - start) / length);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Nombres pseudo-aléatoires reproductibles : la même carte donne le même GIF. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function wrap(text, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

// ============================== les dessins ==============================
// Chaque dessin tient dans un carré de -60 à 60, centré sur le médaillon.
// `c` : couleurs du rôle (ink = sombre, main = couleur, light = clair, glow = lueur).

const ART = {
  loup: (c) => `
    <path d="M-48 -54 L-20 -20 L0 -26 L20 -20 L48 -54 L46 -8 L36 16 L16 30 L10 50 L0 55 L-10 50 L-16 30 L-36 16 L-46 -8 Z" fill="${c.ink}" stroke="${c.main}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M-40 -40 L-24 -20 L-38 -12 Z M40 -40 L24 -20 L38 -12 Z" fill="${c.main}" opacity="0.55"/>
    <path d="M-46 -8 L-26 -4 L-36 16 Z M46 -8 L26 -4 L36 16 Z" fill="${c.main}" opacity="0.28"/>
    <path d="M0 -26 L-12 -8 L0 12 L12 -8 Z" fill="${c.main}" opacity="0.22"/>
    <path d="M-14 30 L0 16 L14 30 L8 44 L-8 44 Z" fill="${c.light}" opacity="0.2"/>
    <g filter="url(#glow)">
      <path d="M-28 -2 L-9 3 L-24 9 Z M28 -2 L9 3 L24 9 Z" fill="${c.glow}"/>
    </g>
    <path d="M-6 44 L6 44 L0 51 Z" fill="${c.light}"/>
    <path d="M-16 30 L-10 50 M16 30 L10 50" stroke="${c.main}" stroke-width="1.5" opacity="0.6"/>`,

  voyante: (c) => `
    <path d="M-30 38 L30 38 L24 54 L-24 54 Z" fill="${c.ink}" stroke="${c.main}" stroke-width="2.5" stroke-linejoin="round"/>
    <ellipse cx="0" cy="38" rx="32" ry="6" fill="${c.main}" opacity="0.7"/>
    <circle cx="0" cy="-6" r="42" fill="url(#orb)" stroke="${c.light}" stroke-width="2" stroke-opacity="0.8"/>
    <path d="M-24 -6 Q0 -28 24 -6 Q0 16 -24 -6 Z" fill="${c.ink}" stroke="${c.light}" stroke-width="2"/>
    <g filter="url(#glow)"><circle cx="0" cy="-6" r="9" fill="${c.glow}"/></g>
    <circle cx="0" cy="-6" r="4" fill="${c.ink}"/>
    <ellipse cx="-16" cy="-28" rx="10" ry="6" fill="#ffffff" opacity="0.35" transform="rotate(-30 -16 -28)"/>
    <path d="M-30 -30 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z M26 14 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 Z" fill="${c.light}"/>`,

  sorciere: (c) => `
    <g transform="translate(-20 4) rotate(-10)">
      <rect x="-8" y="-50" width="16" height="10" rx="3" fill="#8a5a33"/>
      <path d="M-7 -40 L7 -40 L7 -22 Q22 -12 22 12 Q22 38 0 38 Q-22 38 -22 12 Q-22 -12 -7 -22 Z" fill="${c.ink}" stroke="${c.light}" stroke-width="2.5"/>
      <path d="M-20 6 Q-10 0 0 6 Q10 12 20 6 Q22 30 0 36 Q-20 32 -20 6 Z" fill="${c.main}" opacity="0.9"/>
      <path d="M-5 16 q5 -8 10 0 q-5 8 -10 0 Z M-4 14 l4 10 l4 -10" fill="${c.light}" opacity="0.9"/>
    </g>
    <g transform="translate(24 12) rotate(12)">
      <rect x="-6" y="-44" width="12" height="9" rx="3" fill="#8a5a33"/>
      <path d="M-5 -35 L5 -35 L5 -18 L18 20 Q18 34 0 34 Q-18 34 -18 20 L-5 -18 Z" fill="${c.ink}" stroke="${c.light}" stroke-width="2.5"/>
      <path d="M-11 2 L11 2 L17 20 Q17 32 0 32 Q-17 32 -17 20 Z" fill="#b04aff" opacity="0.9"/>
      <circle cx="0" cy="18" r="6" fill="${c.ink}" opacity="0.8"/>
      <path d="M-3 16 h2 v2 h-2 Z M1 16 h2 v2 h-2 Z" fill="#e0c2ff"/>
    </g>
    <g filter="url(#glow)" opacity="0.8"><circle cx="-24" cy="-2" r="4" fill="${c.glow}"/><circle cx="26" cy="4" r="3" fill="#d49bff"/></g>`,

  chasseur: (c) => `
    <circle cx="0" cy="0" r="44" fill="none" stroke="${c.main}" stroke-width="2" opacity="0.5"/>
    <circle cx="0" cy="0" r="26" fill="none" stroke="${c.main}" stroke-width="2" opacity="0.4"/>
    <path d="M0 -54 V-34 M0 34 V54 M-54 0 H-34 M34 0 H54" stroke="${c.main}" stroke-width="3" opacity="0.7"/>
    <path d="M-26 -50 Q34 0 -26 50" fill="none" stroke="${c.light}" stroke-width="7" stroke-linecap="round"/>
    <path d="M-26 -50 Q34 0 -26 50" fill="none" stroke="${c.ink}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
    <path d="M-26 -50 L-40 0 L-26 50" fill="none" stroke="${c.light}" stroke-width="1.5" opacity="0.85"/>
    <path d="M-40 0 L46 0" stroke="${c.light}" stroke-width="3.5"/>
    <path d="M58 0 L42 -8 L46 0 L42 8 Z" fill="${c.glow}" filter="url(#glow)"/>
    <path d="M-40 0 L-52 -9 L-46 0 L-52 9 Z M-32 0 L-44 -9 L-38 0 L-44 9 Z" fill="${c.main}"/>`,

  villageois: (c) => `
    <path d="M-40 0 L0 -36 L40 0" fill="none" stroke="${c.light}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M-30 -4 L0 -30 L30 -4 L30 44 L-30 44 Z" fill="${c.ink}" stroke="${c.main}" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="-8" y="18" width="16" height="26" rx="2" fill="${c.main}" opacity="0.45"/>
    <g filter="url(#glow)"><rect x="-22" y="4" width="12" height="12" rx="1.5" fill="${c.glow}"/><rect x="10" y="4" width="12" height="12" rx="1.5" fill="${c.glow}"/></g>
    <path d="M-16 4 V16 M-22 10 H-10 M16 4 V16 M10 10 H22" stroke="${c.ink}" stroke-width="1.5"/>
    <g transform="translate(34 6) rotate(18)">
      <path d="M0 -46 V50" stroke="#b07a47" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M-11 -50 V-36 Q-11 -30 0 -30 Q11 -30 11 -36 V-50 M0 -52 V-30" fill="none" stroke="${c.light}" stroke-width="3" stroke-linecap="round"/>
    </g>`,

  cupidon: (c) => `
    <path d="M0 42 C-58 4 -44 -44 0 -20 C44 -44 58 4 0 42 Z" fill="${c.ink}" stroke="${c.light}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M0 30 C-40 4 -32 -30 0 -10 C32 -30 40 4 0 30 Z" fill="${c.main}" opacity="0.55"/>
    <ellipse cx="-18" cy="-18" rx="8" ry="5" fill="#ffffff" opacity="0.35" transform="rotate(-35 -18 -18)"/>
    <path d="M-54 30 L52 -30" stroke="${c.light}" stroke-width="3.5"/>
    <path d="M60 -35 L44 -34 L49 -28 L50 -20 Z" fill="${c.glow}" filter="url(#glow)"/>
    <path d="M-54 30 L-60 18 L-50 26 Z M-54 30 L-66 30 L-56 34 Z M-46 25 L-52 13 L-42 21 Z M-46 25 L-58 25 L-48 29 Z" fill="${c.main}"/>`,

  imposteur: (c) => `
    <path d="M-50 -8 Q0 -22 50 -8 Q30 2 0 0 Q-30 2 -50 -8 Z" fill="${c.ink}" stroke="${c.main}" stroke-width="2.5"/>
    <path d="M-30 -10 Q-30 -46 -6 -44 Q0 -36 6 -44 Q30 -46 30 -10 Q0 -2 -30 -10 Z" fill="${c.ink}" stroke="${c.main}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M-29 -18 Q0 -10 29 -18 L30 -10 Q0 -2 -30 -10 Z" fill="${c.main}"/>
    <path d="M-26 2 Q0 8 26 2 Q30 30 0 44 Q-30 30 -26 2 Z" fill="${c.ink}"/>
    <g filter="url(#glow)"><path d="M-18 12 L-5 15 L-16 19 Z M18 12 L5 15 L16 19 Z" fill="${c.glow}"/></g>
    <path d="M-34 46 Q-22 34 0 44 Q22 34 34 46 L40 58 L-40 58 Z" fill="${c.ink}" stroke="${c.main}" stroke-width="2"/>
    <path d="M0 44 L-8 58 M0 44 L8 58" stroke="${c.main}" stroke-width="2"/>`,

  civil: (c) => `
    <g opacity="0.75">
      <circle cx="-30" cy="-14" r="13" fill="${c.ink}" stroke="${c.main}" stroke-width="2"/>
      <path d="M-54 34 Q-54 4 -30 4 Q-6 4 -6 34 Z" fill="${c.ink}" stroke="${c.main}" stroke-width="2"/>
      <circle cx="30" cy="-14" r="13" fill="${c.ink}" stroke="${c.main}" stroke-width="2"/>
      <path d="M6 34 Q6 4 30 4 Q54 4 54 34 Z" fill="${c.ink}" stroke="${c.main}" stroke-width="2"/>
    </g>
    <circle cx="0" cy="-20" r="17" fill="${c.ink}" stroke="${c.light}" stroke-width="2.5"/>
    <path d="M-30 46 Q-30 4 0 4 Q30 4 30 46 Z" fill="${c.ink}" stroke="${c.light}" stroke-width="2.5"/>
    <path d="M-8 -22 h4 M4 -22 h4" stroke="${c.glow}" stroke-width="3" stroke-linecap="round" filter="url(#glow)"/>`,

  motsecret: (c) => `
    <rect x="-50" y="-30" width="100" height="66" rx="6" fill="${c.ink}" stroke="${c.light}" stroke-width="2.5"/>
    <path d="M-50 -26 L0 12 L50 -26" fill="none" stroke="${c.light}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M-50 36 L-14 6 M50 36 L14 6" stroke="${c.main}" stroke-width="2" opacity="0.6"/>
    <g filter="url(#glow)"><circle cx="0" cy="12" r="16" fill="${c.glow}"/></g>
    <circle cx="0" cy="12" r="15" fill="${c.main}" stroke="${c.light}" stroke-width="1.5"/>
    <text x="0" y="13" font-family="${SERIF}" font-weight="bold" font-size="22" text-anchor="middle" dominant-baseline="central" fill="${c.ink}">?</text>`,
};

// Le dos de la carte : l'emblème du jeu.
const BACKS = {
  loupgarou: { title: 'LOUP-GAROU', emblem: (c) => `
    <circle cx="0" cy="0" r="46" fill="#f4e6c2" opacity="0.92"/>
    <circle cx="16" cy="-10" r="44" fill="${c.ink}"/>
    <path d="M-44 44 L-30 8 L-36 8 L-24 -18 L-30 -18 L-20 -40 L-10 -18 L-16 -18 L-4 8 L-10 8 L2 30 L12 2 L6 2 L18 -26 L30 2 L24 2 L38 44 Z" fill="${c.ink}" stroke="${c.main}" stroke-width="1.5" stroke-linejoin="round"/>
    <g filter="url(#glow)"><path d="M-8 26 l5 1.5 l-4.5 2 Z M4 26 l-5 1.5 l4.5 2 Z" fill="${c.glow}"/></g>` },
  imposteur: { title: "L'IMPOSTEUR", emblem: (c) => `
    <circle cx="-8" cy="-8" r="30" fill="none" stroke="${c.light}" stroke-width="8"/>
    <circle cx="-8" cy="-8" r="22" fill="${c.main}" opacity="0.25"/>
    <path d="M14 14 L42 42" stroke="${c.light}" stroke-width="12" stroke-linecap="round"/>
    <text x="-8" y="-6" font-family="${SERIF}" font-weight="bold" font-size="32" text-anchor="middle" dominant-baseline="central" fill="${c.light}">?</text>` },
};

// ============================== les rôles ==============================

const CARDS = {
  // ---- Imposteur
  motsecret: { game: 'imposteur', art: 'motsecret', particles: 'dust', name: 'MOT SECRET', team: 'Partie d’imposteur', tagline: 'Un mot pour tous… sauf un. Et personne ne sait qui.', colors: { bg1: '#2a1440', bg2: '#0d0616', ink: '#160a24', main: '#c08bff', light: '#f1e2ff', glow: '#ffd36b' } },
  imposteur: { game: 'imposteur', art: 'imposteur', particles: 'dust', name: 'IMPOSTEUR', team: 'Seul contre tous', tagline: 'Ton mot était différent. Tu as su mentir… ou pas.', colors: { bg1: '#40091f', bg2: '#120207', ink: '#1a040c', main: '#ff3d6b', light: '#ffc2d0', glow: '#ff5c80' } },
  civil: { game: 'imposteur', art: 'civil', particles: 'motes', name: 'CIVIL', team: 'Camp des civils', tagline: 'Trouve celui dont le mot n’est pas le tien.', colors: { bg1: '#0a2c42', bg2: '#020c14', ink: '#06151f', main: '#37b6ff', light: '#c5ebff', glow: '#7fd4ff' } },
  // ---- Loup-garou
  loup: { game: 'loupgarou', art: 'loup', particles: 'embers', name: 'LOUP-GAROU', team: 'Camp des loups', tagline: 'Chaque nuit, dévore un villageois. Le jour, mens.', colors: { bg1: '#3f0e0b', bg2: '#110303', ink: '#1a0605', main: '#ff5a36', light: '#ffcdb8', glow: '#ffb020' } },
  villageois: { game: 'loupgarou', art: 'villageois', particles: 'fireflies', name: 'VILLAGEOIS', team: 'Camp du village', tagline: 'Pas de pouvoir. Juste ton flair et ton vote.', colors: { bg1: '#163d0c', bg2: '#051202', ink: '#081a04', main: '#7ee83f', light: '#dcffc4', glow: '#ffe066' } },
  voyante: { game: 'loupgarou', art: 'voyante', particles: 'stars', name: 'VOYANTE', team: 'Camp du village', tagline: 'Chaque nuit, découvre le vrai rôle d’un joueur.', colors: { bg1: '#2d0b42', bg2: '#0b0216', ink: '#13051f', main: '#b04aff', light: '#ead4ff', glow: '#6fe7ff' } },
  sorciere: { game: 'loupgarou', art: 'sorciere', particles: 'bubbles', name: 'SORCIÈRE', team: 'Camp du village', tagline: 'Une potion de vie, une potion de mort. Une fois.', colors: { bg1: '#0a3d34', bg2: '#021411', ink: '#031a16', main: '#2fffc8', light: '#c9fff1', glow: '#7dffda' } },
  chasseur: { game: 'loupgarou', art: 'chasseur', particles: 'sparks', name: 'CHASSEUR', team: 'Camp du village', tagline: 'Si tu tombes, ta dernière flèche part avec toi.', colors: { bg1: '#3f2a09', bg2: '#140c02', ink: '#1c1203', main: '#ffb02f', light: '#ffe7bd', glow: '#ffd36b' } },
  cupidon: { game: 'loupgarou', art: 'cupidon', particles: 'hearts', name: 'CUPIDON', team: 'Camp du village', tagline: 'Lie deux cœurs : ils vivent et meurent ensemble.', colors: { bg1: '#3f0a2f', bg2: '#140210', ink: '#1c0415', main: '#ff3fae', light: '#ffc9e8', glow: '#ff8fd0' } },
};

// ============================== particules ==============================

/** Des particules qui bouclent : chacune a sa trajectoire, sa vitesse et sa phase. */
function particles(kind, c, t, seed, strength) {
  if (strength <= 0) return '';
  const r = rng(seed);
  const out = [];
  const count = { embers: 26, stars: 22, bubbles: 20, sparks: 24, fireflies: 16, hearts: 12, dust: 22, motes: 20 }[kind] ?? 18;
  for (let i = 0; i < count; i++) {
    const x0 = CARD.x + 10 + r() * (CARD.w - 20);
    const y0 = CARD.y + r() * CARD.h;
    const speed = 1 + Math.floor(r() * 2); // 1 ou 2 tours par boucle : la boucle se referme sans saut
    const size = 1 + r() * 2.6;
    const ph = r();
    const life = (t * speed + ph) % 1; // 0 -> 1 puis recommence
    let fade = Math.sin(life * Math.PI) * strength;
    let x = x0;
    let y = y0;
    if (['embers', 'bubbles', 'sparks', 'hearts', 'motes'].includes(kind)) y = CARD.y + CARD.h - life * CARD.h * 1.1;
    if (kind === 'embers' || kind === 'motes') x = x0 + Math.sin((life + ph) * Math.PI * 4) * 8;
    if (kind === 'bubbles') x = x0 + Math.sin((life + ph) * Math.PI * 6) * 4;
    if (kind === 'sparks') x = x0 + (life - 0.5) * 30 * (r() > 0.5 ? 1 : -1);
    if (kind === 'fireflies') { x = x0 + Math.sin((t + ph) * Math.PI * 2) * 14; y = y0 + Math.cos((t * 1.3 + ph) * Math.PI * 2) * 10; }
    if (kind === 'dust') { x = x0 + life * 30 - 15; y = y0 - life * 12; }
    const colour = i % 3 === 0 ? c.light : i % 3 === 1 ? c.glow : c.main;
    // Presque invisibles quand elles passent derrière le texte : il doit rester lisible.
    const overText = x > TEXT_X - 8 && y > 64 && y < 230;
    fade *= overText ? 0.2 : 1;
    if (kind === 'stars') {
      const tw = (0.5 + 0.5 * Math.sin((t * 2 + ph) * Math.PI * 2)) * strength * (overText ? 0.2 : 1);
      const s = size * 1.6;
      out.push(`<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" d="M0 ${-s * 2} L${s * 0.5} ${-s * 0.5} L${s * 2} 0 L${s * 0.5} ${s * 0.5} L0 ${s * 2} L${-s * 0.5} ${s * 0.5} L${-s * 2} 0 L${-s * 0.5} ${-s * 0.5} Z" fill="${colour}" opacity="${tw.toFixed(2)}"/>`);
    } else if (kind === 'bubbles') {
      out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(size * 1.4).toFixed(1)}" fill="none" stroke="${colour}" stroke-width="1" opacity="${fade.toFixed(2)}"/>`);
    } else if (kind === 'hearts') {
      const s = size * 1.3;
      out.push(`<path transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(s / 6).toFixed(2)})" d="M0 5 C-9 -1 -6 -8 0 -4 C6 -8 9 -1 0 5 Z" fill="${colour}" opacity="${fade.toFixed(2)}"/>`);
    } else {
      out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(1)}" fill="${colour}" opacity="${fade.toFixed(2)}"/>`);
    }
  }
  return `<g filter="url(#soft)">${out.join('')}</g>`;
}

// ============================== la carte ==============================

function defs(c) {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c.bg1}"/><stop offset="100%" stop-color="${c.bg2}"/></linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${c.main}" stop-opacity="0.55"/><stop offset="60%" stop-color="${c.main}" stop-opacity="0.12"/><stop offset="100%" stop-color="${c.main}" stop-opacity="0"/></radialGradient>
    <radialGradient id="medal" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="${c.bg1}"/><stop offset="100%" stop-color="${c.ink}"/></radialGradient>
    <radialGradient id="orb" cx="40%" cy="35%" r="65%"><stop offset="0%" stop-color="${c.light}" stop-opacity="0.55"/><stop offset="45%" stop-color="${c.main}" stop-opacity="0.55"/><stop offset="100%" stop-color="${c.ink}" stop-opacity="0.95"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fff1c4"/><stop offset="45%" stop-color="#d9a441"/><stop offset="100%" stop-color="#7a5316"/></linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fff" stop-opacity="0"/><stop offset="50%" stop-color="#fff" stop-opacity="0.22"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <pattern id="lattice" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0 0 H22 M0 0 V22" stroke="${c.main}" stroke-width="1" opacity="0.28"/>
      <circle cx="11" cy="11" r="1.4" fill="${c.light}" opacity="0.35"/>
    </pattern>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.6"/></filter>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="8"/></filter>
    <clipPath id="card"><rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}"/></clipPath>
  </defs>`;
}

/** Cadre doré avec coins ornés, commun aux deux faces. */
function frame(c, glowOpacity) {
  const { x, y, w, h, r } = CARD;
  const corner = (cx, cy, sx, sy) => `<path transform="translate(${cx} ${cy}) scale(${sx} ${sy})" d="M0 18 Q0 0 18 0 M6 22 Q6 6 22 6 M0 0 m10 10 l4 0 l0 4 l-4 0 Z" fill="none" stroke="url(#gold)" stroke-width="1.6"/>`;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${c.main}" stroke-width="6" opacity="${(glowOpacity * 0.35).toFixed(2)}" filter="url(#glow)"/>
    <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="${r - 1}" fill="none" stroke="url(#gold)" stroke-width="2.2"/>
    <rect x="${x + 9}" y="${y + 9}" width="${w - 18}" height="${h - 18}" rx="${r - 8}" fill="none" stroke="url(#gold)" stroke-width="0.9" opacity="0.7"/>
    ${corner(x + 14, y + 14, 1, 1)}${corner(x + w - 14, y + 14, -1, 1)}${corner(x + 14, y + h - 14, 1, -1)}${corner(x + w - 14, y + h - 14, -1, -1)}`;
}

function back(design, t) {
  const c = design.colors;
  const game = BACKS[design.game];
  const cx = CARD.x + CARD.w / 2;
  const sweep = -200 + t * 900;
  return `
    <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="url(#bg)"/>
    <g clip-path="url(#card)">
      <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" fill="url(#lattice)"/>
      <circle cx="${cx}" cy="128" r="90" fill="url(#halo)"/>
      <rect x="${sweep}" y="-40" width="120" height="${H + 80}" fill="url(#sheen)" transform="skewX(-20)"/>
    </g>
    <g transform="translate(${cx} 124)">
      <circle r="62" fill="${c.ink}" stroke="url(#gold)" stroke-width="3"/>
      <circle r="54" fill="none" stroke="url(#gold)" stroke-width="1" opacity="0.6"/>
      ${game.emblem(c)}
    </g>
    <text x="${cx}" y="226" font-family="${SERIF}" font-weight="bold" font-size="24" letter-spacing="5" text-anchor="middle" fill="url(#gold)">${esc(game.title)}</text>
    <text x="${cx}" y="250" font-family="${SANS}" font-size="11" letter-spacing="4" text-anchor="middle" fill="${c.light}" opacity="0.7">TA CARTE SECRÈTE</text>
    ${frame(c, 0.6)}`;
}

function front(design, name, t, sinceReveal, sweepP = 0) {
  const c = design.colors;
  const pop = easeOutBack(phase(sinceReveal, 0.05, 0.45));
  const nameIn = ease(phase(sinceReveal, 0.2, 0.45));
  const teamIn = ease(phase(sinceReveal, 0.1, 0.4));
  const tagIn = ease(phase(sinceReveal, 0.4, 0.5));
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
  const sweep = -220 + sweepP * 900;
  const bob = Math.sin(t * Math.PI * 2) * 2.5;
  const nameSize = Math.min(32, Math.floor(184 / (design.name.length * 0.8)));
  const lines = wrap(design.tagline, 27);
  // l'anneau pointillé tourne d'exactement un motif (3 + 7) par boucle
  const ringSpin = t * (10 * 360) / (2 * Math.PI * (MEDAL.r - 8));

  return `
    <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="url(#bg)"/>
    <g clip-path="url(#card)">
      <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" fill="url(#lattice)" opacity="0.35"/>
      <circle cx="${MEDAL.cx}" cy="${MEDAL.cy}" r="${MEDAL.r + 40 + pulse * 10}" fill="url(#halo)"/>
      ${particles(design.particles, c, t, name.length * 97 + 13, clamp(sinceReveal * 2))}
    </g>
    <g transform="translate(${MEDAL.cx} ${MEDAL.cy + bob}) scale(${(0.55 + 0.45 * pop).toFixed(3)})" opacity="${clamp(pop * 1.4).toFixed(2)}">
      <circle r="${MEDAL.r}" fill="url(#medal)" stroke="url(#gold)" stroke-width="3"/>
      <circle r="${MEDAL.r - 8}" fill="none" stroke="${c.main}" stroke-width="1.2" stroke-dasharray="3 7" opacity="0.7" transform="rotate(${ringSpin.toFixed(1)})"/>
      <g transform="scale(1.12)">${ART[design.art](c)}</g>
    </g>
    <g opacity="${teamIn.toFixed(2)}" transform="translate(${((1 - teamIn) * 16).toFixed(1)} 0)">
      <text x="${TEXT_X}" y="84" font-family="${SANS}" font-weight="bold" font-size="11" letter-spacing="3.5" fill="${c.main}">${esc(design.team.toUpperCase())}</text>
    </g>
    <g opacity="${nameIn.toFixed(2)}" transform="translate(${((1 - nameIn) * 22).toFixed(1)} 0)">
      <text x="${TEXT_X}" y="124" font-family="${SERIF}" font-weight="bold" font-size="${nameSize}" letter-spacing="1.5" fill="#ffffff">${esc(design.name)}</text>
      <path d="M${TEXT_X} 142 H${TEXT_X + 150 * nameIn}" stroke="url(#gold)" stroke-width="1.6"/>
      <path d="M${TEXT_X + 156 * nameIn} 142 l5 -5 l5 5 l-5 5 Z" fill="url(#gold)"/>
    </g>
    <g opacity="${tagIn.toFixed(2)}">
      ${lines.map((line, i) => `<text x="${TEXT_X}" y="${172 + i * 21}" font-family="${SANS}" font-size="14" fill="${c.light}">${esc(line)}</text>`).join('')}
    </g>
    <text x="${TEXT_X}" y="${CARD.y + CARD.h - 26}" font-family="${SANS}" font-size="9.5" letter-spacing="3" fill="${c.light}" opacity="${(0.55 * tagIn).toFixed(2)}">${design.game === 'loupgarou' ? 'GARDE-LA POUR TOI' : 'NE LE DIS À PERSONNE'}</text>
    <g clip-path="url(#card)"><rect x="${sweep}" y="-40" width="110" height="${H + 80}" fill="url(#sheen)" transform="skewX(-20)"/></g>
    ${frame(c, 0.6 + pulse * 0.4)}`;
}

/** Une image de la boucle, au temps `seconds`. */
function scene(name, design, seconds) {
  const c = design.colors;
  const t = seconds / DURATION;
  const face = front(design, name, t, 10, phase(t, 0.3, 0.32));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${defs(c)}
  <rect width="${W}" height="${H}" fill="#07050b"/>
  <ellipse cx="${W / 2}" cy="${H - 12}" rx="180" ry="10" fill="#000" opacity="0.6" filter="url(#shadow)"/>
  ${face}
</svg>`;
}

/** Une face seule, sans le fond ni l'ombre, en double résolution : pour le site. */
function still(name, design, face) {
  const c = design.colors;
  const body = face === 'back' ? back(design, 0.1) : front(design, name, 0.35, 5);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.w * 2}" height="${CARD.h * 2}" viewBox="${CARD.x} ${CARD.y} ${CARD.w} ${CARD.h}">${defs(c)}${body}</svg>`;
}

// ============================== fabrication ==============================

async function build(name, design, preview) {
  const dir = path.join(TMP, name);
  await mkdir(dir, { recursive: true });
  const frames = Math.round(DURATION * FPS);
  for (let i = 0; i < frames; i++) {
    await sharp(Buffer.from(scene(name, design, i / FPS))).png().toFile(path.join(dir, `${String(i).padStart(3, '0')}.png`));
  }
  if (preview) await sharp(Buffer.from(scene(name, design, 0))).png().toFile(path.join(process.env.APERCU_DIR ?? OUT, `apercu-${name}.png`));
  const input = path.join(dir, '%03d.png');
  const palette = path.join(dir, 'palette.png');
  const out = path.join(OUT, `${name}.gif`);
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-vf', 'palettegen=max_colors=96:stats_mode=full', palette]);
  // -loop 0 : en boucle. La première image est déjà la face du rôle.
  await run(ffmpeg, ['-y', '-framerate', String(FPS), '-i', input, '-i', palette, '-lavfi', 'paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '0', out]);
  const { size } = await stat(out);
  console.log(`  ${name}.gif — ${(size / 1024).toFixed(0)} Ko`);
  return size;
}

const args = process.argv.slice(2);
const preview = args.includes('--png');
const only = args.filter((a) => !a.startsWith('--'));
await mkdir(OUT, { recursive: true });
console.log('Fabrication des cartes de rôle…');
let total = 0;
const list = Object.entries(CARDS).filter(([name]) => !only.length || only.includes(name));
for (const [name, design] of list) total += await build(name, design, preview);
if (args.includes('--site')) {
  const SITE = path.resolve('site/cartes');
  await mkdir(SITE, { recursive: true });
  const backs = new Set();
  for (const [name, design] of list) {
    await sharp(Buffer.from(still(name, design, 'front'))).webp({ quality: 88 }).toFile(path.join(SITE, `${name}.webp`));
    if (!backs.has(design.game)) {
      backs.add(design.game);
      await sharp(Buffer.from(still(name, design, 'back'))).webp({ quality: 88 }).toFile(path.join(SITE, `dos-${design.game}.webp`));
    }
  }
  console.log(`Images du site : ${SITE}`);
}
await rm(TMP, { recursive: true, force: true });
console.log(`Terminé : ${list.length} cartes, ${(total / 1024).toFixed(0)} Ko au total.`);
