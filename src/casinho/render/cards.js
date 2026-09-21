// Cartes à jouer dessinées en vectoriel : les enseignes sont des tracés (aucune
// police d'emoji nécessaire), seules les valeurs utilisent une police livrée avec le bot.
import { SANS, SERIF, esc } from './engine.js';

export const CARD_W = 92;
export const CARD_H = 130;

const RED = '#c8102e';
const INK = '#1b1b24';

// Enseignes dessinées dans une boîte de 100 × 100.
const SUITS = {
  '♥': 'M50 90 C20 66 4 49 4 30 C4 15 16 5 29 5 C39 5 46 11 50 20 C54 11 61 5 71 5 C84 5 96 15 96 30 C96 49 80 66 50 90 Z',
  '♦': 'M50 3 L90 50 L50 97 L10 50 Z',
  '♠': 'M50 5 C38 23 7 39 7 59 C7 73 19 81 30 81 C38 81 44 77 47 72 C46 81 43 88 37 95 L63 95 C57 88 54 81 53 72 C56 77 62 81 70 81 C81 81 93 73 93 59 C93 39 62 23 50 5 Z',
  '♣': 'M50 6 C60 6 68 14 68 25 C68 31 65 36 61 40 C65 37 70 36 74 36 C85 36 93 44 93 55 C93 66 85 74 74 74 C66 74 59 69 56 62 C57 75 59 86 65 95 L35 95 C41 86 43 75 44 62 C41 69 34 74 26 74 C15 74 7 66 7 55 C7 44 15 36 26 36 C30 36 35 37 39 40 C35 36 32 31 32 25 C32 14 40 6 50 6 Z',
};

const isRed = (suit) => suit === '♥' || suit === '♦';

/** Une enseigne à la position (x, y), de taille `size`, centrée. */
export function suit(symbol, x, y, size, color = isRed(symbol) ? RED : INK) {
  const scale = size / 100;
  return `<path d="${SUITS[symbol]}" fill="${color}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${scale})"/>`;
}

/** Les figures : un grand monogramme dans un cadre, plus élégant qu'un dessin approximatif. */
function faceArt(card, x, y) {
  const color = isRed(card.suit) ? RED : INK;
  return `
    <rect x="${x + 22}" y="${y + 26}" width="${CARD_W - 44}" height="${CARD_H - 52}" rx="5" fill="none" stroke="${color}" stroke-width="1.6" opacity="0.55"/>
    <text x="${x + CARD_W / 2}" y="${y + CARD_H / 2 - 6}" font-family="${SERIF}" font-weight="700" font-size="40" fill="${color}"
          text-anchor="middle" dominant-baseline="middle">${card.rank}</text>
    ${suit(card.suit, x + CARD_W / 2, y + CARD_H / 2 + 24, 18, color)}`;
}

/**
 * Une carte face visible, coin supérieur gauche en (x, y).
 * `tilt` fait légèrement pivoter la carte, comme posée à la main.
 */
export function card(c, x, y, { tilt = 0, glow = null } = {}) {
  const color = isRed(c.suit) ? RED : INK;
  const cx = x + CARD_W / 2;
  const cy = y + CARD_H / 2;
  // Dans Discord l'image est réduite : la valeur s'écrit en grand au centre de chaque
  // carte, et pas seulement dans les coins, sinon on ne la lit pas.
  const center = ['J', 'Q', 'K'].includes(c.rank)
    ? faceArt(c, x, y)
    : `
    <text x="${cx}" y="${cy - 8}" font-family="${SANS}" font-weight="700" font-size="${c.rank === '10' ? 42 : 50}" fill="${color}"
          text-anchor="middle" dominant-baseline="middle">${esc(c.rank)}</text>
    ${suit(c.suit, cx, cy + 30, 26, color)}`;

  // Le coin haut-gauche ; celui du bas est le même, retourné autour du centre de la carte.
  // C'est lui qu'on voit quand les cartes se chevauchent : il est gros exprès.
  const corner = `
    <text x="${x + 7}" y="${y + 26}" font-family="${SANS}" font-weight="700" font-size="${c.rank === '10' ? 21 : 26}" fill="${color}">${esc(c.rank)}</text>
    ${suit(c.suit, x + 17, y + 42, 17, color)}`;

  return `
  <g transform="rotate(${tilt} ${cx} ${cy})">
    <rect x="${x + 3}" y="${y + 5}" width="${CARD_W}" height="${CARD_H}" rx="9" fill="rgba(0,0,0,0.45)"/>
    ${glow ? `<rect x="${x - 4}" y="${y - 4}" width="${CARD_W + 8}" height="${CARD_H + 8}" rx="12" fill="none" stroke="${glow}" stroke-width="4" opacity="0.9"/>` : ''}
    <rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="9" fill="#fbf8f2" stroke="#d9cfbf" stroke-width="1"/>
    ${corner}
    <g transform="rotate(180 ${cx} ${cy})">${corner}</g>
    ${center}
  </g>`;
}

/** Le dos d'une carte : motif rose Casinho et monogramme. */
export function cardBack(x, y, { tilt = 0 } = {}) {
  const cx = x + CARD_W / 2;
  const cy = y + CARD_H / 2;
  return `
  <defs>
    <pattern id="back-${x}-${y}" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="10" height="10" fill="#7a0f45"/><rect width="5" height="10" fill="#a3175e"/>
    </pattern>
  </defs>
  <g transform="rotate(${tilt} ${cx} ${cy})">
    <rect x="${x + 3}" y="${y + 5}" width="${CARD_W}" height="${CARD_H}" rx="9" fill="rgba(0,0,0,0.45)"/>
    <rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="9" fill="#fbf8f2"/>
    <rect x="${x + 6}" y="${y + 6}" width="${CARD_W - 12}" height="${CARD_H - 12}" rx="6" fill="url(#back-${x}-${y})"/>
    <circle cx="${cx}" cy="${cy}" r="22" fill="#fbf8f2" opacity="0.95"/>
    <text x="${cx}" y="${cy + 2}" font-family="${SERIF}" font-weight="700" font-size="30" fill="#c2186b"
          text-anchor="middle" dominant-baseline="middle">C</text>
  </g>`;
}

/**
 * Une main posée en éventail, centrée sur `cx`. Les cartes se chevauchent assez
 * pour que 6 ou 7 cartes tiennent sur la table.
 */
export function hand(cards, cx, y, { hidden = [], glow = null, spread = 58, scale = 1, maxWidth = null } = {}) {
  // Beaucoup de cartes : on les resserre pour tenir dans la place donnée.
  if (maxWidth && cards.length > 1) spread = Math.min(spread, (maxWidth / scale - CARD_W) / (cards.length - 1));
  const width = CARD_W + spread * (cards.length - 1);
  const left = cx - width / 2;
  const body = cards
    .map((c, i) => {
      const tilt = (i - (cards.length - 1) / 2) * 2.2;
      const x = Math.round(left + i * spread);
      const yy = Math.round(y + Math.abs(i - (cards.length - 1) / 2) * 2);
      return hidden.includes(i) ? cardBack(x, yy, { tilt }) : card(c, x, yy, { tilt, glow: i === cards.length - 1 ? glow : null });
    })
    .join('');
  // Réduction autour du haut de la main : la main reste centrée sur cx.
  return scale === 1 ? body : `<g transform="translate(${cx} ${y}) scale(${scale}) translate(${-cx} ${-y})">${body}</g>`;
}

/** Largeur occupée par une main, pour placer ce qui l'entoure. */
export function handWidth(count, { spread = 58, scale = 1, maxWidth = null } = {}) {
  if (maxWidth && count > 1) spread = Math.min(spread, (maxWidth / scale - CARD_W) / (count - 1));
  return (CARD_W + spread * Math.max(0, count - 1)) * scale;
}
