// Les scènes de chaque jeu : le décor photo, et par-dessus le jeu tel qu'il est
// vraiment (les cartes de la main, le numéro tiré, les rouleaux arrêtés…).
// Mise en page « table en direct » : le croupier en haut, le jeu posé sur le bas assombri.
import { handValue } from '../cards.js';
import { CARD_H, card, hand, handWidth } from './cards.js';
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
const BJ_SCALE = 0.8;

/**
 * La table de blackjack telle qu'elle est : main du croupier (carte cachée tant
 * que la manche n'est pas finie), main(s) du joueur, mise, et le résultat.
 */
export function blackjackScene(table, { reveal = false, result = null } = {}) {
  const dealerCards = table.dealer;
  const dealerTotal = reveal ? handValue(dealerCards).total : handValue([dealerCards[0]]).total;
  const dealerY = 238;
  const dealerW = handWidth(dealerCards.length, { scale: BJ_SCALE });

  let overlay = vignette(0.45) + tableShade(185);
  overlay += hand(dealerCards, WIDTH / 2, dealerY, { hidden: reveal ? [] : [1], scale: BJ_SCALE });
  overlay += badge(WIDTH / 2 - dealerW / 2 - 18, dealerY + 52, `CROUPIER · ${dealerTotal}${reveal ? '' : ' + ?'}`, { anchor: 'end', size: 17 });

  // Une ou deux mains (après séparation), la main en cours soulignée en rose.
  const many = table.hands.length > 1;
  const centers = many ? [WIDTH / 2 - 190, WIDTH / 2 + 190] : [WIDTH / 2];
  const playerY = 384;
  table.hands.forEach((entry, index) => {
    const cx = centers[index];
    const { total, soft, bust } = handValue(entry.cards);
    const active = !table.finished && index === table.active;
    const width = handWidth(entry.cards.length, { scale: BJ_SCALE });
    overlay += hand(entry.cards, cx, playerY, { glow: active ? PINK : null, scale: BJ_SCALE });
    const label = `${many ? `MAIN ${index + 1}` : 'TOI'} · ${bust ? `${total} SAUTÉ` : soft ? `${total} SOUPLE` : total}`;
    const tag = many
      ? badge(cx, playerY + CARD_H * BJ_SCALE + 30, label, { size: 15, accent: active ? PINK : null, color: bust ? LOSE : '#fff' })
      : badge(cx - width / 2 - 18, playerY + 52, label, { anchor: 'end', size: 17, accent: PINK, color: bust ? LOSE : '#fff' });
    overlay += tag;
  });

  const totalBet = table.hands.reduce((sum, entry) => sum + entry.bet, 0);
  overlay += chipStack(880, 470, totalBet);
  overlay += outcomeBanner(result, 150);
  return renderScene('blackjack', overlay);
}

// ---------------------------------------------------------------- Roulette
/** La roue arrêtée sur le numéro tiré, et le détail du pari. */
export function rouletteScene({ pocket, betLabel, bet, result }) {
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
  overlay += badge(700, 470, `TON PARI · ${betLabel.toUpperCase()}`, { size: 16 });
  overlay += chipStack(880, 505, bet);
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
