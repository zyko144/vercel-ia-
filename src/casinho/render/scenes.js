// Les scènes de chaque jeu : le décor photo, et par-dessus le jeu tel qu'il est
// vraiment (les cartes de la main, le numéro tiré, les rouleaux arrêtés…).
// Mise en page « table en direct » : le croupier en haut, le jeu posé sur le bas assombri.
import { handValue } from '../cards.js';
import { card, hand } from './cards.js';
import { HEIGHT, SANS, SERIF, WIDTH, badge, banner, chipStack, esc, renderScene, vignette } from './engine.js';
import { angleFor, pocketColor, wheel } from './wheel.js';

const PINK = '#ff3fa6';
const WIN = '#49e08c';
const LOSE = '#ff5a77';

/** Assombrit le bas de l'image à partir de `from` : c'est là que le jeu se pose. */
const tableShade = (from = 200, strength = 0.9) => `
  <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0a0308" stop-opacity="0"/>
    <stop offset="${(from / HEIGHT).toFixed(3)}" stop-color="#0a0308" stop-opacity="0"/>
    <stop offset="${((from + 120) / HEIGHT).toFixed(3)}" stop-color="#0a0308" stop-opacity="${(strength * 0.72).toFixed(2)}"/>
    <stop offset="1" stop-color="#0a0308" stop-opacity="${strength}"/>
  </linearGradient></defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#shade)"/>`;

/** Bandeau de résultat, avec la couleur de l'issue. */
function outcomeBanner(result, y = 150) {
  if (!result) return '';
  const color = result.tone === 'win' ? WIN : result.tone === 'lose' ? LOSE : '#ffd98a';
  return banner(result.title, { color: '#ffffff', glow: color, y, sub: result.sub });
}

// ---------------------------------------------------------------- Blackjack
// Dans Discord l'image s'affiche à environ 400 px de large : les deux mains sont
// posées côte à côte (croupier à gauche, joueur à droite) pour pouvoir les montrer
// en grand, avec le total écrit en gros au-dessus de chacune.
const BJ_SCALE = 1.4;
const BJ_SPLIT_SCALE = 1.05;
const BJ_SPREAD = 64;
const COLUMN = 420; // largeur disponible pour une main

/** Grande étiquette au-dessus d'une main : le nom, et le total en gros. */
function handTitle(cx, y, name, total, { color = '#ffffff', accent = null, small = false } = {}) {
  const size = small ? 22 : 30;
  const text = `${name}  ${total}`;
  const width = Math.round(text.length * size * 0.6 + 40);
  return `
    <rect x="${cx - width / 2}" y="${y - size}" width="${width}" height="${size * 1.75}" rx="${size * 0.875}"
          fill="rgba(12,4,10,0.8)" stroke="${accent ?? 'rgba(255,255,255,0.25)'}" stroke-width="${accent ? 3 : 1.5}"/>
    <text x="${cx}" y="${y + size * 0.1}" font-family="${SANS}" font-weight="700" font-size="${size}" fill="${color}"
          text-anchor="middle" dominant-baseline="middle" letter-spacing="1">
      <tspan font-size="${Math.round(size * 0.62)}" fill="#e6b8d2">${esc(name)}</tspan>  ${esc(String(total))}
    </text>`;
}

/**
 * La table de blackjack telle qu'elle est : main du croupier (carte cachée tant
 * que la manche n'est pas finie), main(s) du joueur, mise, et le résultat.
 */
export function blackjackScene(table, { reveal = false, result = null } = {}) {
  const dealerCards = table.dealer;
  const dealerValue = handValue(reveal ? dealerCards : [dealerCards[0]]);
  const cardsTop = 262;
  const dealerX = 250;
  const playerX = 710;

  let overlay = vignette(0.45) + tableShade(140, 0.94);

  // Le croupier, à gauche.
  overlay += handTitle(dealerX, 222, 'CROUPIER', reveal ? (dealerValue.bust ? `${dealerValue.total} SAUTÉ` : dealerValue.total) : `${dealerValue.total} + ?`, {
    color: reveal && dealerValue.bust ? LOSE : '#ffffff',
  });
  overlay += hand(dealerCards, dealerX, cardsTop, { hidden: reveal ? [] : [1], scale: BJ_SCALE, spread: BJ_SPREAD, maxWidth: COLUMN });

  // Le joueur, à droite : une main, ou deux après séparation (la main en cours en rose).
  const many = table.hands.length > 1;
  const centers = many ? [playerX - 118, playerX + 118] : [playerX];
  const scale = many ? BJ_SPLIT_SCALE : BJ_SCALE;
  table.hands.forEach((entry, index) => {
    const cx = centers[index];
    const { total, soft, bust } = handValue(entry.cards);
    const active = !table.finished && index === table.active;
    // Main souple (un as compté 11) : les deux valeurs, comme sur les tables en ligne (« 7/17 »).
    const value = bust ? `${total} SAUTÉ` : soft && total < 21 ? `${total - 10}/${total}` : total;
    overlay += handTitle(cx, 222, many ? `MAIN ${index + 1}` : 'TOI', value, {
      color: bust ? LOSE : '#ffffff',
      accent: active || !many ? PINK : null,
      small: many,
    });
    overlay += hand(entry.cards, cx, cardsTop + (many ? 14 : 0), {
      glow: active ? PINK : null,
      scale,
      spread: many ? 44 : BJ_SPREAD,
      maxWidth: many ? 220 : COLUMN,
    });
  });

  const totalBet = table.hands.reduce((sum, entry) => sum + entry.bet, 0);
  overlay += chipStack(WIDTH / 2, 505, totalBet);
  overlay += outcomeBanner(result, 105);
  return renderScene('blackjack', overlay);
}

// ------------------------------------------------------ Blackjack à plusieurs
/**
 * La table à plusieurs : la main du croupier au centre, et jusqu'à cinq joueurs
 * alignés en bas, chacun avec son nom et son total. Le joueur dont c'est le tour
 * est souligné en rose ; à la fin, chaque total prend la couleur de son résultat.
 *
 * @param {{ dealer: object[], seats: { name: string, cards: object[], bet: number, outcome?: 'win'|'lose'|'push'|'blackjack' }[], turn: number }} table
 */
export function blackjackMultiScene(table, { reveal = false, result = null } = {}) {
  const dealerValue = handValue(reveal ? table.dealer : [table.dealer[0]]);
  let overlay = vignette(0.45) + tableShade(120, 0.95);

  overlay += handTitle(WIDTH / 2, 176, 'CROUPIER', reveal ? (dealerValue.bust ? `${dealerValue.total} SAUTÉ` : dealerValue.total) : `${dealerValue.total} + ?`, {
    color: reveal && dealerValue.bust ? LOSE : '#ffffff',
    small: true,
  });
  overlay += hand(table.dealer, WIDTH / 2, 202, { hidden: reveal ? [] : [1], scale: 0.95, spread: 56, maxWidth: 360 });

  const count = table.seats.length;
  const column = WIDTH / count;
  table.seats.forEach((seat, index) => {
    const cx = column * index + column / 2;
    const { total, soft, bust } = handValue(seat.cards);
    const active = !reveal && index === table.turn;
    const tone = seat.outcome === 'win' || seat.outcome === 'blackjack' ? WIN : seat.outcome === 'lose' ? LOSE : seat.outcome === 'push' ? '#ffd98a' : null;
    const value = seat.outcome === 'blackjack' ? 'BJ !' : bust ? `${total} ✗` : soft && total < 21 ? `${total - 10}/${total}` : String(total);
    overlay += hand(seat.cards, cx, 372, { glow: active ? PINK : null, scale: count > 3 ? 0.66 : 0.78, spread: 48, maxWidth: column - 24 });
    const max = count > 3 ? 8 : 11;
    const name = seat.name.length > max ? `${seat.name.slice(0, max - 1)}…` : seat.name;
    overlay += handTitle(cx, 510, name, value, { color: tone ?? (bust ? LOSE : '#ffffff'), accent: active ? PINK : tone, small: true });
  });

  overlay += outcomeBanner(result, 92);
  return renderScene('blackjack', overlay);
}

// ---------------------------------------------------------------- Roulette
/** La roue arrêtée sur le numéro tiré, et le détail du pari. */
export function rouletteScene({ pocket, betLabel, bet, result, summary = null }) {
  const color = pocketColor(pocket);
  const traits = pocket === 0
    ? 'ZÉRO'
    : [color === '#c21f43' ? 'ROUGE' : 'NOIR', pocket % 2 ? 'IMPAIR' : 'PAIR', pocket <= 18 ? 'MANQUE' : 'PASSE'].join(' · ');

  let overlay = vignette(0.5) + tableShade(150, 0.92);
  overlay += wheel({ cx: 205, cy: 372, r: 138, rotation: angleFor(pocket), ball: 0 });
  overlay += `
    <circle cx="700" cy="318" r="74" fill="${color}" stroke="#e6c47a" stroke-width="5"/>
    <text x="700" y="320" font-family="${SERIF}" font-weight="700" font-size="70" fill="#fff" text-anchor="middle" dominant-baseline="middle">${pocket}</text>
    <text x="700" y="422" font-family="${SANS}" font-weight="700" font-size="18" fill="#ffd9ee" text-anchor="middle" letter-spacing="2">${traits}</text>`;
  overlay += badge(700, 470, summary ?? `TON PARI · ${betLabel.toUpperCase()}`, { size: 16 });
  if (bet) overlay += chipStack(880, 505, bet);
  overlay += outcomeBanner(result, 120);
  return renderScene('roulette', overlay);
}

// ------------------------------------------------------------- Machine à sous
// Symboles dessinés dans une boîte de 100 × 100.
const SYMBOL_ART = {
  cerise: `
    <path d="M52 18 C46 34 38 44 31 56" stroke="#4d9a36" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M52 18 C60 32 66 42 69 53" stroke="#4d9a36" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M52 18 C62 12 72 14 76 20 C68 24 60 23 52 18 Z" fill="#5fb83e"/>
    <circle cx="30" cy="68" r="18" fill="#d11f3c"/><circle cx="70" cy="65" r="18" fill="#e02449"/>
    <circle cx="24" cy="62" r="5" fill="#ff9aac"/><circle cx="64" cy="59" r="5" fill="#ff9aac"/>`,
  citron: `
    <path d="M12 52 C18 30 40 20 60 24 C78 27 90 40 90 52 C90 66 76 80 54 81 C34 82 16 72 12 52 Z" fill="#ffd23f" stroke="#e0a800" stroke-width="2"/>
    <path d="M86 44 L95 38 L92 50 Z" fill="#e0a800"/><ellipse cx="40" cy="42" rx="12" ry="6" fill="#fff3b0" opacity="0.8"/>`,
  cloche: `
    <path d="M50 14 C30 14 26 34 26 50 C26 62 20 68 14 74 L86 74 C80 68 74 62 74 50 C74 34 70 14 50 14 Z" fill="#f2c14e" stroke="#b8860b" stroke-width="2.5"/>
    <rect x="44" y="8" width="12" height="9" rx="3" fill="#b8860b"/><circle cx="50" cy="82" r="8" fill="#b8860b"/>
    <path d="M36 28 C34 40 34 52 36 62" stroke="#fff4c7" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>`,
  etoile: `
    <polygon points="50,6 62,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 38,38" fill="#ffcc33" stroke="#d9971a" stroke-width="3" stroke-linejoin="round"/>
    <polygon points="50,20 57,40 42,40" fill="#fff4c2" opacity="0.8"/>`,
  diamant: `
    <polygon points="22,32 36,14 64,14 78,32 50,90" fill="#57d2ff" stroke="#1d8ec2" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="22,32 78,32 50,90" fill="#2fb3ec"/><polygon points="36,14 50,32 64,14" fill="#b8ecff"/>
    <polygon points="22,32 36,14 50,32" fill="#8fe0ff"/>`,
  sept: `
    <text x="50" y="56" font-family="${SERIF}" font-weight="700" font-size="92" fill="${PINK}" stroke="#ffd98a" stroke-width="4"
          paint-order="stroke" text-anchor="middle" dominant-baseline="middle">7</text>`,
};
const EMOJI_TO_ART = { '🍒': 'cerise', '🍋': 'citron', '🔔': 'cloche', '⭐': 'etoile', '💎': 'diamant', '7️⃣': 'sept' };
const ART_NAMES = Object.keys(SYMBOL_ART);

const symbol = (name, x, y, size) => `<g transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 100})">${SYMBOL_ART[name]}</g>`;

/** Les trois rouleaux arrêtés : la ligne du milieu est le tirage, au-dessus et en dessous le reste de la bande. */
export function slotScene({ reels, bet, result, fillers = null }) {
  const x0 = 250;
  const reelW = 140;
  const gap = 12;
  const top = 128;
  const rowH = 108;
  const names = reels.map((emoji) => EMOJI_TO_ART[emoji] ?? 'etoile');
  const extras = fillers ?? names.map((_, i) => [ART_NAMES[(i * 2 + 1) % ART_NAMES.length], ART_NAMES[(i * 3 + 4) % ART_NAMES.length]]);
  const winning = result?.tone === 'win';

  let overlay = vignette(0.6) + `<rect width="${WIDTH}" height="${HEIGHT}" fill="rgba(10,3,8,0.38)"/>`;
  overlay += `
    <rect x="${x0 - 28}" y="${top - 34}" width="${3 * reelW + 2 * gap + 56}" height="${3 * rowH + 68}" rx="26"
          fill="#1a0914" stroke="${PINK}" stroke-width="4"/>
    <rect x="${x0 - 16}" y="${top - 22}" width="${3 * reelW + 2 * gap + 32}" height="${3 * rowH + 44}" rx="18" fill="#0d0409" stroke="#d9b56a" stroke-width="2"/>`;
  names.forEach((name, i) => {
    const x = x0 + i * (reelW + gap);
    overlay += `
      <defs><linearGradient id="reel${i}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#cfc6d4"/><stop offset="0.18" stop-color="#fbf8fc"/><stop offset="0.82" stop-color="#fbf8fc"/><stop offset="1" stop-color="#cfc6d4"/>
      </linearGradient></defs>
      <rect x="${x}" y="${top}" width="${reelW}" height="${3 * rowH}" rx="10" fill="url(#reel${i})"/>`;
    overlay += `<g opacity="0.45">${symbol(extras[i][0], x + reelW / 2, top + rowH / 2, 70)}${symbol(extras[i][1], x + reelW / 2, top + rowH * 2.5, 70)}</g>`;
    overlay += symbol(name, x + reelW / 2, top + rowH * 1.5, 92);
  });
  // La ligne de paie : rose si elle gagne.
  overlay += `
    <rect x="${x0 - 10}" y="${top + rowH}" width="${3 * reelW + 2 * gap + 20}" height="${rowH}" rx="8" fill="none"
          stroke="${winning ? WIN : '#ffffff'}" stroke-width="${winning ? 5 : 2}" opacity="${winning ? 1 : 0.5}"/>
    <path d="M${x0 - 26} ${top + rowH * 1.5 - 12} l14 12 l-14 12 Z" fill="${PINK}"/>
    <path d="M${x0 + 3 * reelW + 2 * gap + 26} ${top + rowH * 1.5 - 12} l-14 12 l14 12 Z" fill="${PINK}"/>
    <text x="${WIDTH / 2}" y="${top - 46}" font-family="${SERIF}" font-weight="700" font-size="30" fill="#ffd9ee" text-anchor="middle" letter-spacing="8">CASINHO</text>`;
  overlay += chipStack(880, 505, bet);
  overlay += outcomeBanner(result, 470);
  return renderScene('machine', overlay);
}

// --------------------------------------------------------------------- Dés
const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

export function die(cx, cy, size, face, rotation = 0) {
  const half = size / 2;
  const gap = size * 0.27;
  const pips = PIPS[face].map(([dx, dy]) => `<circle cx="${cx + dx * gap}" cy="${cy + dy * gap}" r="${size * 0.09}" fill="${face === 1 ? '#c21f43' : '#2a0f1f'}"/>`).join('');
  return `
    <g transform="rotate(${rotation} ${cx} ${cy})">
      <rect x="${cx - half + 5}" y="${cy - half + 8}" width="${size}" height="${size}" rx="${size * 0.18}" fill="rgba(0,0,0,0.45)"/>
      <rect x="${cx - half}" y="${cy - half}" width="${size}" height="${size}" rx="${size * 0.18}" fill="#fbf7f0" stroke="#e6c47a" stroke-width="3"/>
      ${pips}
    </g>`;
}

export function diceScene({ a, b, betLabel, bet, result }) {
  let overlay = vignette(0.5) + tableShade(170, 0.9);
  overlay += die(390, 350, 118, a, -9) + die(570, 356, 118, b, 11);
  overlay += `<text x="${WIDTH / 2}" y="470" font-family="${SERIF}" font-weight="700" font-size="40" fill="#fff" text-anchor="middle">TOTAL ${a + b}</text>`;
  overlay += badge(WIDTH / 2, 510, `TON PARI · ${betLabel.toUpperCase()}`, { size: 15 });
  overlay += chipStack(880, 505, bet);
  overlay += outcomeBanner(result, 150);
  return renderScene('des', overlay);
}

// ------------------------------------------------------------- Pile ou face
export function coinFace(cx, cy, r, side, { label = true } = {}) {
  const face = side === 'face';
  return `
    <defs><radialGradient id="gold" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffe9a8"/><stop offset="0.6" stop-color="#e3a93a"/><stop offset="1" stop-color="#9c6716"/></radialGradient></defs>
    <circle cx="${cx + 4}" cy="${cy + 8}" r="${r}" fill="rgba(0,0,0,0.45)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gold)" stroke="#fff1c7" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.8}" fill="none" stroke="#9c6716" stroke-width="3" stroke-dasharray="4 6"/>
    ${face
      ? `<path d="M${cx - r * 0.42} ${cy + r * 0.25} L${cx - r * 0.42} ${cy - r * 0.2} L${cx - r * 0.2} ${cy} L${cx} ${cy - r * 0.38} L${cx + r * 0.2} ${cy} L${cx + r * 0.42} ${cy - r * 0.2} L${cx + r * 0.42} ${cy + r * 0.25} Z" fill="#7a4a0c"/>`
      : `<text x="${cx}" y="${cy + 3}" font-family="${SERIF}" font-weight="700" font-size="${r * 1.05}" fill="#7a4a0c" text-anchor="middle" dominant-baseline="middle">C</text>`}
    ${label ? `<text x="${cx}" y="${cy + r + 34}" font-family="${SANS}" font-weight="700" font-size="22" fill="#fff" text-anchor="middle" letter-spacing="4">${face ? 'FACE' : 'PILE'}</text>` : ''}`;
}

export function coinScene({ side, choice, bet, result }) {
  let overlay = vignette(0.5) + tableShade(170, 0.9);
  overlay += coinFace(WIDTH / 2, 350, 92, side);
  overlay += badge(WIDTH / 2, 510, `TON CHOIX · ${choice.toUpperCase()}`, { size: 15 });
  overlay += chipStack(880, 505, bet);
  overlay += outcomeBanner(result, 150);
  return renderScene('des', overlay);
}

// -------------------------------------------------------------- Cartes seules
/** Rouge ou noir : la carte tirée, retournée au centre de la table. */
export function cardScene({ drawn, choice, bet, result }) {
  let overlay = vignette(0.5) + tableShade(185);
  overlay += `<g transform="translate(${WIDTH / 2} 300) scale(1.25) translate(${-WIDTH / 2} -300)">${card(drawn, WIDTH / 2 - 46, 250, { glow: result?.tone === 'win' ? WIN : null })}</g>`;
  overlay += badge(WIDTH / 2, 510, `TON CHOIX · ${choice.toUpperCase()}`, { size: 15 });
  overlay += chipStack(880, 505, bet);
  overlay += outcomeBanner(result, 150);
  return renderScene('blackjack', overlay);
}

/** Plus ou moins : la carte d'avant et la nouvelle, côte à côte. */
export function hiloScene({ previous, current, streak, multiplier, bet, result }) {
  let overlay = vignette(0.5) + tableShade(185);
  if (previous) {
    overlay += `<g opacity="0.75">${card(previous, WIDTH / 2 - 175, 262, { tilt: -6 })}</g>`;
    overlay += `<path d="M${WIDTH / 2 - 52} 327 l26 0 l0 -12 l24 24 l-24 24 l0 -12 l-26 0 Z" fill="${PINK}"/>`;
  }
  overlay += `<g transform="translate(${WIDTH / 2 + 70} 300) scale(1.15) translate(${-(WIDTH / 2 + 70)} -300)">${card(current, WIDTH / 2 + 24, 250, { glow: PINK })}</g>`;
  overlay += badge(WIDTH / 2, 505, `SÉRIE ${streak} · GAIN ×${multiplier.toFixed(2)}`, { size: 16, accent: PINK });
  overlay += chipStack(880, 505, bet);
  overlay += outcomeBanner(result, 150);
  return renderScene('blackjack', overlay);
}

// --------------------------------------------------------------------- Crash
/** La fusée, pointée vers la droite, centrée sur (0, 0). */
const ROCKET = `
  <path d="M-30 0 L-58 -11 L-50 0 L-58 11 Z" fill="#ff8a2a" opacity="0.95"/>
  <path d="M-30 0 L-46 -6 L-41 0 L-46 6 Z" fill="#ffe27a"/>
  <path d="M-30 -11 L14 -11 Q36 -11 44 0 Q36 11 14 11 L-30 11 Z" fill="#f7f2fb" stroke="#c9bfd6" stroke-width="1.5"/>
  <circle cx="12" cy="0" r="6" fill="#5fd0ff" stroke="#2a8fc0" stroke-width="2"/>
  <path d="M-20 -11 L-34 -24 L-8 -11 Z" fill="${PINK}"/>
  <path d="M-20 11 L-34 24 L-8 11 Z" fill="${PINK}"/>`;

/** Une explosion : éclat orange, cœur jaune, fumée. */
function explosion(x, y, size = 60) {
  const spikes = 14;
  const star = (outer, inner) => Array.from({ length: spikes * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer * (0.8 + ((i * 37) % 7) / 20);
    const a = (Math.PI * i) / spikes;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  return `
    <circle cx="${x - size * 0.5}" cy="${y - size * 0.3}" r="${size * 0.45}" fill="#3a2a35" opacity="0.6"/>
    <circle cx="${x + size * 0.45}" cy="${y - size * 0.4}" r="${size * 0.38}" fill="#3a2a35" opacity="0.5"/>
    <polygon points="${star(size, size * 0.55)}" fill="#ff5a2a"/>
    <polygon points="${star(size * 0.7, size * 0.38)}" fill="#ffb03a"/>
    <circle cx="${x}" cy="${y}" r="${size * 0.28}" fill="#fff3b0"/>`;
}

const CRASH_SPEED = 6_000; // m(t) = e^(t / CRASH_SPEED), le même que le jeu
const crashTime = (m) => CRASH_SPEED * Math.log(Math.max(1, m));

/**
 * Le vol de la fusée : la courbe du multiplicateur jusqu'à maintenant, la fusée au
 * bout, et selon l'état l'explosion ou le point d'encaissement.
 *
 * @param {{ state: 'decollage'|'vol'|'crash'|'encaisse', multiplier: number, point?: number,
 *           cashedAt?: number, auto?: number|null, bet: number }} flight
 */
export function crashScene({ state, multiplier, point = null, cashedAt = null, auto = null, bet, cashouts = [], players = null }) {
  const left = 90;
  const right = 900;
  const bottom = 470;
  const top = 120;
  // Jusqu'où va la courbe affichée : le moment présent, ou l'explosion une fois révélée.
  const shownTo = state === 'crash' || state === 'encaisse' ? point : multiplier;
  const maxM = Math.max(2, shownTo * 1.18, auto ? auto * 1.08 : 0);
  const tMax = Math.max(5_000, crashTime(shownTo) * 1.12);
  const X = (t) => left + (t / tMax) * (right - left);
  const Y = (m) => bottom - ((m - 1) / (maxM - 1)) * (bottom - top);

  /** Les points de la courbe entre deux multiplicateurs. */
  const curve = (upTo, from = 1) => {
    const start = crashTime(from);
    const end = crashTime(upTo);
    return Array.from({ length: 48 }, (_, i) => {
      const t = start + ((end - start) * i) / 47;
      return `${X(t).toFixed(1)},${Y(Math.exp(t / CRASH_SPEED)).toFixed(1)}`;
    });
  };

  const crashed = state === 'crash';
  const cashed = state === 'encaisse';
  const lineColor = crashed ? LOSE : PINK;

  let overlay = `<rect width="${WIDTH}" height="${HEIGHT}" fill="rgba(8,2,10,0.45)"/>` + vignette(0.55);

  // Graduations : quelques multiplicateurs ronds.
  const steps = [1.5, 2, 3, 5, 10, 20, 50, 100].filter((m) => m < maxM);
  overlay += steps.map((m) => `
    <line x1="${left}" y1="${Y(m)}" x2="${right}" y2="${Y(m)}" stroke="rgba(255,255,255,0.12)" stroke-width="1.5" stroke-dasharray="6 8"/>
    <text x="${left - 14}" y="${Y(m) + 6}" font-family="${SANS}" font-weight="700" font-size="17" fill="rgba(255,230,245,0.7)" text-anchor="end">×${m}</text>`).join('');
  overlay += `<line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>`;

  // Encaissement automatique demandé : une ligne verte à ce niveau.
  if (auto && auto < maxM) {
    overlay += `
      <line x1="${left}" y1="${Y(auto)}" x2="${right}" y2="${Y(auto)}" stroke="${WIN}" stroke-width="2.5" stroke-dasharray="12 8" opacity="0.85"/>
      <text x="${right}" y="${Y(auto) - 10}" font-family="${SANS}" font-weight="700" font-size="17" fill="${WIN}" text-anchor="end">AUTO ×${auto}</text>`;
  }

  // La courbe, avec la zone remplie dessous. Après un encaissement, la suite du vol
  // (jusqu'à l'explosion) est montrée en pointillés : on voit ce qu'on a laissé.
  if (state !== 'decollage') {
    const flown = curve(cashed ? cashedAt : shownTo);
    const [endX, endY] = flown.at(-1).split(',').map(Number);
    overlay += `
      <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${lineColor}" stop-opacity="0.45"/><stop offset="1" stop-color="${lineColor}" stop-opacity="0.02"/>
      </linearGradient>
      <filter id="neon"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <polygon points="${left},${bottom} ${flown.join(' ')} ${endX},${bottom}" fill="url(#area)"/>
      <polyline points="${flown.join(' ')}" fill="none" stroke="${lineColor}" stroke-width="6" stroke-linecap="round" filter="url(#neon)"/>`;
    if (cashed) {
      overlay += `<polyline points="${curve(point, cashedAt).join(' ')}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="3" stroke-dasharray="8 8"/>`;
    }
  }

  // La fusée (ou ce qu'il en reste).
  const rocketM = state === 'decollage' ? 1 : cashed ? point : shownTo;
  const tR = crashTime(rocketM);
  const rx = X(tR);
  const ry = Y(rocketM);
  // Orientation : la pente de la courbe à cet endroit, en pixels.
  const slope = ((bottom - top) / (maxM - 1)) * (rocketM / CRASH_SPEED) / ((right - left) / tMax);
  const angle = state === 'decollage' ? -65 : -(Math.atan(slope) * 180) / Math.PI;
  overlay += crashed || cashed
    ? explosion(rx, ry, crashed ? 58 : 34)
    : `<g transform="translate(${rx.toFixed(1)} ${ry.toFixed(1)}) rotate(${angle.toFixed(1)}) scale(1.3)">${ROCKET}</g>`;

  if (cashed) {
    const cx = X(crashTime(cashedAt));
    const cy = Y(cashedAt);
    overlay += `
      <circle cx="${cx}" cy="${cy}" r="13" fill="${WIN}" stroke="#fff" stroke-width="3"/>
      <path d="M${cx - 6} ${cy} l4 5 l8 -10" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  }

  // À plusieurs : chaque encaissement est un point vert sur la courbe, avec le nom du joueur.
  for (const { m, name } of cashouts) {
    if (m > shownTo) continue;
    const px = X(crashTime(m));
    const py = Y(m);
    overlay += `<circle cx="${px}" cy="${py}" r="9" fill="${WIN}" stroke="#fff" stroke-width="2.5"/>
      <text x="${px}" y="${py - 16}" font-family="${SANS}" font-weight="700" font-size="15" fill="#eafff2" text-anchor="middle"
            stroke="rgba(0,0,0,0.7)" stroke-width="3" paint-order="stroke">${esc(name.slice(0, 10))} ×${m.toFixed(2)}</text>`;
  }

  // Le multiplicateur, en très gros : c'est lui qu'on regarde.
  const shown = cashed ? cashedAt : crashed ? point : multiplier;
  const color = crashed ? LOSE : cashed ? WIN : multiplier >= 5 ? '#ffd24a' : multiplier >= 2 ? '#ff9ad2' : '#ffffff';
  overlay += `
    <text x="${left + 4}" y="92" font-family="${SERIF}" font-weight="700" font-size="76" fill="${color}"
          stroke="rgba(0,0,0,0.55)" stroke-width="4" paint-order="stroke">×${shown.toFixed(2)}</text>
    <text x="${left + 8}" y="${bottom + 44}" font-family="${SANS}" font-weight="700" font-size="21" fill="#ffd9ee">
      ${players ? esc(players) : `Mise ${Math.round(bet).toLocaleString('fr-FR')} → ${Math.round(bet * shown).toLocaleString('fr-FR')} jetons`}</text>`;

  if (state === 'decollage') overlay += banner('DÉCOLLAGE', { glow: PINK, y: 300, sub: 'Encaisse avant que la fusée n’explose' });
  // En haut à droite : la courbe et le point d'encaissement restent visibles.
  if (crashed) overlay += banner('EXPLOSION', { glow: LOSE, x: 640, y: 92, size: 40, sub: players ?? `mise perdue · -${Math.round(bet).toLocaleString('fr-FR')} jetons` });
  if (cashed) overlay += banner('ENCAISSÉ', { glow: WIN, x: 640, y: 92, size: 40, sub: `+${Math.round(bet * cashedAt - bet).toLocaleString('fr-FR')} jetons · explosion à ×${point.toFixed(2)}` });
  return renderScene('crash', overlay);
}

/** L'image du résultat d'un jeu instantané, d'après ce que resolveInstant a tiré. */
export function resultImage(scene) {
  const result = scene.outcome;
  if (scene.kind === 'roulette') return rouletteScene({ pocket: scene.pocket, betLabel: scene.betLabel, bet: scene.bet, result });
  if (scene.kind === 'machine') return slotScene({ reels: scene.reels, bet: scene.bet, result });
  if (scene.kind === 'des') return diceScene({ a: scene.a, b: scene.b, betLabel: scene.betLabel, bet: scene.bet, result });
  if (scene.kind === 'piece') return coinScene({ side: scene.side, choice: scene.choice, bet: scene.bet, result });
  if (scene.kind === 'carte') return cardScene({ drawn: scene.card, choice: scene.choice, bet: scene.bet, result });
  return null;
}

export { esc };
