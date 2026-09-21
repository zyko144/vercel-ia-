// Le tapis de roulette vu de dessus : les 37 numéros, les douzaines, les colonnes,
// les chances simples — et les jetons que chaque joueur y a posés, empilés.
// En haut, le croupier (le décor photo) ; après le tirage, la roue et le numéro.
import { SANS, SERIF, WIDTH, badge, banner, esc, renderScene, vignette } from './engine.js';
import { angleFor, pocketColor, wheel } from './wheel.js';

/** Les jetons, du plus petit au plus gros : valeur, couleur, et l'emoji du menu. */
export const CHIPS = [
  { value: 10, color: '#ece7e2', ink: '#3b2a33', emoji: '⚪' },
  { value: 20, color: '#f4c542', ink: '#3b2a10', emoji: '🟡' },
  { value: 50, color: '#ff8a3d', ink: '#ffffff', emoji: '🟠' },
  { value: 100, color: '#2a262c', ink: '#ffffff', emoji: '⚫' },
  { value: 500, color: '#8e44ad', ink: '#ffffff', emoji: '🟣' },
  { value: 1_000, color: '#d11f3c', ink: '#ffffff', emoji: '🔴' },
  { value: 5_000, color: '#2f6fe0', ink: '#ffffff', emoji: '🔵' },
  { value: 10_000, color: '#1f9a55', ink: '#ffffff', emoji: '🟢' },
  { value: 50_000, color: '#8a5a2b', ink: '#ffffff', emoji: '🟤' },
  { value: 100_000, color: '#ff3fa6', ink: '#ffffff', emoji: '💗' },
  { value: 500_000, color: '#18b6c4', ink: '#ffffff', emoji: '💎' },
  { value: 1_000_000, color: '#d4af37', ink: '#2a1a00', emoji: '👑' },
];
export const chipStyle = (value) => CHIPS.find((chip) => chip.value === value) ?? CHIPS[5];

/** À plusieurs, chacun sa couleur de jetons — comme sur une vraie table de roulette. */
export const PLAYER_COLORS = [
  { color: '#ff3fa6', ink: '#ffffff', emoji: '💗' },
  { color: '#3a86ff', ink: '#ffffff', emoji: '🔵' },
  { color: '#ffd23f', ink: '#3b2a10', emoji: '🟡' },
  { color: '#2ecc71', ink: '#0d2a1a', emoji: '🟢' },
  { color: '#9b5de5', ink: '#ffffff', emoji: '🟣' },
  { color: '#ff8a3d', ink: '#ffffff', emoji: '🟠' },
  { color: '#f1f1f1', ink: '#2a1a22', emoji: '⚪' },
  { color: '#e63946', ink: '#ffffff', emoji: '🔴' },
  { color: '#a0714f', ink: '#ffffff', emoji: '🟤' },
  { color: '#1b1b1b', ink: '#ffffff', emoji: '⚫' },
];

const decimal = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
/** « 1,5k », « 20k », « 1M » : ce qui tient sur un jeton. */
export const shortAmount = (n) => (n >= 1_000_000 ? `${decimal(n / 1_000_000)}M` : n >= 1_000 ? `${decimal(n / 1_000)}k` : String(n));

// ------------------------------------------------------------------ Géométrie
// Disposition classique : le zéro à gauche, trois rangées de douze numéros
// (3, 6… 36 en haut ; 1, 4… 34 en bas), les colonnes « 2 à 1 » à droite,
// puis les douzaines et les chances simples en dessous.
const X0 = 36;
const ZERO_W = 56;
const COL_W = 64;
const TOP = 150;
const ROW_H = 66;
const BAND_H = 50;
const NUM_X = X0 + ZERO_W;
const NUM_END = NUM_X + 12 * COL_W;
const RIGHT = NUM_END + COL_W;
const NUM_BOTTOM = TOP + 3 * ROW_H;
const DOZEN_BOTTOM = NUM_BOTTOM + BAND_H;
const CHANCE_BOTTOM = DOZEN_BOTTOM + BAND_H;

const CHANCES = ['manque', 'pair', 'rouge', 'noir', 'impair', 'passe'];
const CHANCE_TEXT = { manque: '1 – 18', pair: 'PAIR', impair: 'IMPAIR', passe: '19 – 36' };

/** Le rectangle d'une case du tapis. */
function box(spot) {
  if (spot === 'plein-0') return { x: X0, y: TOP, w: ZERO_W, h: 3 * ROW_H };
  if (spot.startsWith('plein-')) {
    const n = Number(spot.slice(6));
    const column = Math.floor((n - 1) / 3);
    const row = 2 - ((n - 1) % 3);
    return { x: NUM_X + column * COL_W, y: TOP + row * ROW_H, w: COL_W, h: ROW_H };
  }
  if (spot.startsWith('colonne')) return { x: NUM_END, y: TOP + (3 - Number(spot.slice(7))) * ROW_H, w: COL_W, h: ROW_H };
  if (spot.startsWith('douzaine')) return { x: NUM_X + (Number(spot.slice(8)) - 1) * 4 * COL_W, y: NUM_BOTTOM, w: 4 * COL_W, h: BAND_H };
  const i = CHANCES.indexOf(spot);
  if (i >= 0) return { x: NUM_X + i * 2 * COL_W, y: DOZEN_BOTTOM, w: 2 * COL_W, h: BAND_H };
  return null;
}
const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/**
 * Où se posent les jetons d'une case. Le numéro ou le libellé se pousse sur le
 * côté (voir layout) : on voit toujours sur quoi on a misé.
 */
function anchor(spot) {
  const b = box(spot);
  if (spot === 'plein-0') return { x: b.x + b.w / 2 + 3, y: b.y + b.h - 40 };
  if (spot.startsWith('plein-') || spot.startsWith('colonne')) return { x: b.x + b.w / 2, y: b.y + 45 };
  if (spot.startsWith('douzaine')) return { x: b.x + b.w - 60, y: b.y + b.h / 2 };
  return { x: b.x + b.w - 32, y: b.y + b.h / 2 };
}

const GOLD = '#e6c47a';
const WIN = '#49e08c';
const LOSE = '#ff5a77';
const FELT = '#0f3b2b';

function diamond(cx, cy, fill, scale = 1) {
  const w = 26 * scale;
  const h = 15 * scale;
  return `<polygon points="${cx},${cy - h} ${cx + w},${cy} ${cx},${cy + h} ${cx - w},${cy}" fill="${fill}" stroke="${GOLD}" stroke-width="1.5"/>`;
}

/**
 * Le tapis nu, avec en surbrillance les cases gagnantes après le tirage.
 * Sur une case où il y a des jetons (`occupied`), le numéro ou le libellé se
 * décale pour laisser la place à la pile.
 */
function layout(winning, pocket, occupied) {
  let out = `
    <rect x="${X0 - 16}" y="${TOP - 16}" width="${RIGHT - X0 + 32}" height="${CHANCE_BOTTOM - TOP + 32}" rx="20"
          fill="${FELT}" fill-opacity="0.96" stroke="${GOLD}" stroke-width="3"/>`;

  // Le zéro, en pointe comme sur les vrais tapis.
  const z = box('plein-0');
  out += `
    <path d="M${z.x + z.w} ${z.y} L${z.x + 14} ${z.y} Q${z.x} ${z.y + z.h / 2} ${z.x + 14} ${z.y + z.h} L${z.x + z.w} ${z.y + z.h} Z"
          fill="${pocketColor(0)}" stroke="${GOLD}" stroke-width="2"/>
    <text x="${z.x + z.w / 2 + 4}" y="${occupied.has('plein-0') ? z.y + 44 : z.y + z.h / 2}" font-family="${SANS}" font-weight="700" font-size="30" fill="#fff"
          text-anchor="middle" dominant-baseline="central">0</text>`;

  for (let n = 1; n <= 36; n++) {
    const b = box(`plein-${n}`);
    out += `
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${pocketColor(n)}" stroke="${GOLD}" stroke-width="1.5"/>
      <text x="${b.x + b.w / 2}" y="${occupied.has(`plein-${n}`) ? b.y + 15 : b.y + b.h / 2}" font-family="${SANS}" font-weight="700"
            font-size="${occupied.has(`plein-${n}`) ? 20 : 28}" fill="#fff" text-anchor="middle" dominant-baseline="central">${n}</text>`;
  }

  // Le libellé d'une case extérieure : au centre, ou poussé à gauche (en haut pour
  // les colonnes) quand des jetons y sont posés.
  const outside = (spot, content) => {
    const b = box(spot);
    const busy = occupied.has(spot);
    let at = centre(b);
    if (busy && spot.startsWith('colonne')) at = { x: at.x, y: b.y + 14 };
    else if (busy && spot.startsWith('douzaine')) at = { x: b.x + (b.w - 100) / 2, y: at.y };
    else if (busy) at = { x: b.x + 42, y: at.y };
    return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="${GOLD}" stroke-width="1.5"/>${content(at, busy)}`;
  };
  const label = (text, size = 22, busySize = size) => (at, busy) =>
    `<text x="${at.x}" y="${at.y}" font-family="${SANS}" font-weight="700" font-size="${busy ? busySize : size}" fill="#f6ecd2"
           text-anchor="middle" dominant-baseline="central" letter-spacing="1">${esc(text)}</text>`;

  for (let k = 1; k <= 3; k++) out += outside(`colonne${k}`, label('2 : 1', 19, 14));
  out += outside('douzaine1', label('1 – 12'));
  out += outside('douzaine2', label('13 – 24'));
  out += outside('douzaine3', label('25 – 36'));
  for (const spot of CHANCES) {
    if (spot === 'rouge') out += outside(spot, (at, busy) => diamond(at.x, at.y, '#c21f43', busy ? 0.75 : 1));
    else if (spot === 'noir') out += outside(spot, (at, busy) => diamond(at.x, at.y, '#141014', busy ? 0.75 : 1));
    else out += outside(spot, label(CHANCE_TEXT[spot], 22, 16));
  }

  // Après le tirage : toutes les cases qui gagnent s'allument, le numéro plus que les autres.
  for (const spot of winning) {
    const b = box(spot);
    if (!b) continue;
    const isPocket = spot === `plein-${pocket}`;
    out += `<rect x="${b.x + 2}" y="${b.y + 2}" width="${b.w - 4}" height="${b.h - 4}" rx="4" fill="#ffe27a" fill-opacity="${isPocket ? 0.35 : 0.16}"
                  stroke="#ffe27a" stroke-width="${isPocket ? 5 : 2.5}"/>`;
  }
  return out;
}

// -------------------------------------------------------------------- Jetons
/** Un jeton vu de dessus : le bord à six inserts blancs, le centre de la couleur. */
function chip(x, y, style, r = 18) {
  const inner = r - 3.5;
  const dash = ((2 * Math.PI * inner) / 12).toFixed(2);
  return `
    <circle cx="${x}" cy="${y}" r="${r}" fill="${style.color}" stroke="rgba(0,0,0,0.6)" stroke-width="1.5"/>
    <circle cx="${x}" cy="${y}" r="${inner}" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-dasharray="${dash}" opacity="0.92"/>
    <circle cx="${x}" cy="${y}" r="${r - 7.5}" fill="${style.color}" stroke="rgba(255,255,255,0.75)" stroke-width="1"/>`;
}

/** Une pile de jetons : les derniers posés au-dessus, le total écrit sur le dernier. */
function stack(x, y, layers, amount, { faded = false, glow = false } = {}) {
  const shown = layers.slice(-5);
  const lift = 3.5;
  let out = `<g opacity="${faded ? 0.28 : 1}">`;
  out += `<circle cx="${x + 2}" cy="${y + 5}" r="19" fill="rgba(0,0,0,0.5)"/>`;
  shown.forEach((style, i) => {
    out += chip(x, y + (shown.length - 1 - i) * lift, style);
  });
  if (glow) out += `<circle cx="${x}" cy="${y}" r="23" fill="none" stroke="${WIN}" stroke-width="4"/>`;
  const top = shown.at(-1);
  out += `
    <text x="${x}" y="${y + 0.5}" font-family="${SANS}" font-weight="700" font-size="${shortAmount(amount).length > 3 ? 11 : 13}" fill="${top.ink}"
          text-anchor="middle" dominant-baseline="central">${esc(shortAmount(amount))}</text></g>`;
  return out;
}

// Plusieurs joueurs sur la même case : les piles se décalent un peu, sans se cacher.
const OFFSETS = [[0, 0], [18, -5], [-18, 5], [9, 8], [-9, -8], [24, 3], [-24, -3], [0, -9], [14, 9], [-14, -9]];

/** Les cases où au moins un jeton est posé. */
const occupiedBy = (seats) => new Set(seats.flatMap((seat) => seat.bets.filter(([, values]) => values.length).map(([spot]) => spot)));

/**
 * @param {Array<{ color?: object|null, bets: Array<[string, number[]]> }>} seats
 *   color : la couleur du joueur (à plusieurs), ou null pour des jetons à leur couleur de valeur.
 */
function chipsOnTable(seats, { winning = null } = {}) {
  const bySpot = new Map();
  seats.forEach((seat) => {
    for (const [spot, values] of seat.bets) {
      if (!values.length) continue;
      if (!bySpot.has(spot)) bySpot.set(spot, []);
      bySpot.get(spot).push({ seat, values });
    }
  });
  let out = '';
  for (const [spot, entries] of bySpot) {
    if (!box(spot)) continue;
    const c = anchor(spot);
    entries.forEach(({ seat, values }, i) => {
      const [dx, dy] = OFFSETS[i % OFFSETS.length];
      const layers = values.map((value) => seat.color ?? chipStyle(value));
      const amount = values.reduce((sum, v) => sum + v, 0);
      const won = winning ? winning.has(spot) : false;
      out += stack(c.x + dx, c.y + dy, layers, amount, { faded: Boolean(winning) && !won, glow: won });
    });
  }
  return out;
}

// --------------------------------------------------------------------- Scène
const traitsOf = (pocket) =>
  pocket === 0
    ? 'ZÉRO'
    : [pocketColor(pocket) === '#c21f43' ? 'ROUGE' : 'NOIR', pocket % 2 ? 'IMPAIR' : 'PAIR', pocket <= 18 ? '1 – 18' : '19 – 36'].join(' · ');

/** La légende du bas : une pastille par joueur, avec sa couleur et son montant. */
function legend(entries) {
  if (!entries.length) return '';
  const perRow = Math.min(5, entries.length);
  const cellW = Math.min(184, (WIDTH - 40) / perRow);
  return entries
    .slice(0, 10)
    .map((entry, i) => {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const inRow = Math.min(5, entries.length - row * 5);
      const x = WIDTH / 2 - (inRow * cellW) / 2 + col * cellW + 14;
      const y = entries.length > 5 ? 484 + row * 34 : 500;
      return `
        <circle cx="${x + 10}" cy="${y}" r="10" fill="${entry.color}" stroke="#fff" stroke-width="2"/>
        <text x="${x + 27}" y="${y}" font-family="${SANS}" font-weight="700" font-size="17" fill="${entry.tone ?? '#ffffff'}"
              dominant-baseline="central" stroke="rgba(0,0,0,0.7)" stroke-width="3" paint-order="stroke">${esc(`${entry.name.slice(0, 9)} ${entry.text}`)}</text>`;
    })
    .join('');
}

/**
 * Le tapis, pendant les mises (pocket = null) ou après le tirage.
 * @param {{ seats: Array, pocket?: number|null, winning?: Set<string>, title?: string, right?: string,
 *           hand?: number|null, players?: Array, footer?: string|null, result?: object|null }} scene
 */
export function tapisScene({ seats, pocket = null, winning = null, title = 'FAITES VOS JEUX', right = null, hand = null, players = [], footer = null, result = null }) {
  const drawn = pocket !== null;
  // Le bas de l'image s'assombrit en douceur : le tapis ressort, le croupier reste visible.
  let overlay = vignette(0.5) + `
    <defs><linearGradient id="tapisShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#080206" stop-opacity="0"/>
      <stop offset="${((TOP - 70) / 540).toFixed(3)}" stop-color="#080206" stop-opacity="0"/>
      <stop offset="${(TOP / 540).toFixed(3)}" stop-color="#080206" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#080206" stop-opacity="0.75"/>
    </linearGradient></defs>
    <rect width="${WIDTH}" height="540" fill="url(#tapisShade)"/>`;
  overlay += layout(drawn ? winning ?? new Set() : new Set(), pocket, occupiedBy(seats));
  overlay += chipsOnTable(seats, { winning: drawn ? winning ?? new Set() : null });

  if (!drawn) {
    overlay += badge(150, 42, title, { size: 20, accent: '#ff3fa6' });
    if (right) overlay += badge(WIDTH - 150, 42, right, { size: 20 });
    // Le jeton en main, en grand, sous le montant.
    if (hand) {
      const style = chipStyle(hand);
      overlay += `<g transform="translate(${WIDTH - 150} 100) scale(1.55)">${chip(0, 0, style)}</g>
        <text x="${WIDTH - 150}" y="100.5" font-family="${SANS}" font-weight="700" font-size="${shortAmount(hand).length > 3 ? 16 : 19}" fill="${style.ink}"
              text-anchor="middle" dominant-baseline="central">${esc(shortAmount(hand))}</text>
        <text x="${WIDTH - 196}" y="101" font-family="${SANS}" font-weight="700" font-size="15" fill="#ffd9ee" text-anchor="end"
              stroke="rgba(0,0,0,0.7)" stroke-width="3" paint-order="stroke" letter-spacing="1">JETON EN MAIN</text>`;
    }
  } else {
    // La roue arrêtée sur le numéro, et le numéro lui-même, en grand.
    overlay += wheel({ cx: 96, cy: 72, r: 56, rotation: angleFor(pocket), ball: 0 });
    overlay += `
      <circle cx="${WIDTH - 96}" cy="66" r="48" fill="${pocketColor(pocket)}" stroke="${GOLD}" stroke-width="4"/>
      <text x="${WIDTH - 96}" y="68" font-family="${SERIF}" font-weight="700" font-size="48" fill="#fff" text-anchor="middle" dominant-baseline="central">${pocket}</text>
      <text x="${WIDTH - 96}" y="128" font-family="${SANS}" font-weight="700" font-size="13" fill="#ffd9ee" text-anchor="middle" letter-spacing="1"
            stroke="rgba(0,0,0,0.7)" stroke-width="3" paint-order="stroke">${traitsOf(pocket)}</text>`;
    if (result) {
      const glow = result.tone === 'win' ? WIN : result.tone === 'lose' ? LOSE : '#ffd98a';
      overlay += banner(result.title, { glow, y: 62, size: 40, sub: result.sub });
    }
  }

  overlay += legend(players);
  if (footer && !players.length) overlay += badge(WIDTH / 2, 500, footer, { size: 18 });
  return renderScene('roulette', overlay);
}
