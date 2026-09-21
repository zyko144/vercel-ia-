// La roue de roulette européenne, dessinée en vectoriel. Partagée entre l'image
// du résultat et les GIF d'atterrissage, pour que les deux soient identiques.
import { SANS } from './engine.js';

// L'ordre réel des 37 cases sur une roue européenne, dans le sens des aiguilles d'une montre.
export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const STEP = 360 / WHEEL_ORDER.length;

export const pocketColor = (n) => (n === 0 ? '#1f8a55' : RED.has(n) ? '#c21f43' : '#1a1016');

/**
 * Angle dont il faut tourner la roue pour amener la case `number` en haut,
 * sous la bille. Les angles se mesurent depuis le haut, dans le sens horaire.
 */
export const angleFor = (number) => -(WHEEL_ORDER.indexOf(number) * STEP + STEP / 2);

const rad = (deg) => ((deg - 90) * Math.PI) / 180;

/**
 * La roue, centrée en (cx, cy), tournée de `rotation` degrés. La bille est posée à
 * l'angle `ball` (0 = en haut), à `ballDepth` du centre (1 = sur la piste extérieure).
 */
export function wheel({ cx, cy, r, rotation = 0, ball = 0, ballDepth = 0.74, blur = 0, numbers = true }) {
  const inner = r * 0.62;
  const sectors = WHEEL_ORDER.map((n, i) => {
    const a0 = rad(i * STEP);
    const a1 = rad((i + 1) * STEP);
    const mid = rad((i + 0.5) * STEP);
    const tx = cx + r * 0.86 * Math.cos(mid);
    const ty = cy + r * 0.86 * Math.sin(mid);
    const outer = (a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    const innerPt = (a) => `${(cx + inner * Math.cos(a)).toFixed(2)} ${(cy + inner * Math.sin(a)).toFixed(2)}`;
    // Sans numéros quand la roue tourne vite : illisibles, et un GIF bien plus léger.
    const label = numbers
      ? `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" font-family="${SANS}" font-weight="700" font-size="${(r * 0.085).toFixed(1)}" fill="#fff"
            text-anchor="middle" dominant-baseline="central" transform="rotate(${(i + 0.5) * STEP} ${tx.toFixed(2)} ${ty.toFixed(2)})">${n}</text>`
      : '';
    return `
      <path d="M${innerPt(a0)} L${outer(a0)} A${r} ${r} 0 0 1 ${outer(a1)} L${innerPt(a1)} A${inner} ${inner} 0 0 0 ${innerPt(a0)} Z"
            fill="${pocketColor(n)}" stroke="#d9b56a" stroke-width="0.8"/>
      ${label}`;
  }).join('');

  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = rad(i * 45);
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + inner * 0.9 * Math.cos(a)).toFixed(2)}" y2="${(cy + inner * 0.9 * Math.sin(a)).toFixed(2)}"
                  stroke="#e6c47a" stroke-width="${(r * 0.03).toFixed(1)}" stroke-linecap="round"/>`;
  }).join('');

  const ballR = r * 0.055;
  const ballA = rad(ball);
  const bx = cx + r * ballDepth * Math.cos(ballA);
  const by = cy + r * ballDepth * Math.sin(ballA);

  return `
    <defs>
      <radialGradient id="rim" cx="50%" cy="45%" r="55%"><stop offset="80%" stop-color="#5a3313"/><stop offset="100%" stop-color="#2a1506"/></radialGradient>
      <radialGradient id="cone" cx="45%" cy="40%" r="60%"><stop offset="0%" stop-color="#8a5a24"/><stop offset="100%" stop-color="#3b220b"/></radialGradient>
      <radialGradient id="ballShade" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#b9b3ac"/></radialGradient>
      ${blur ? `<filter id="spin"><feGaussianBlur stdDeviation="${blur}"/></filter>` : ''}
    </defs>
    <circle cx="${cx}" cy="${cy + r * 0.04}" r="${r * 1.13}" fill="rgba(0,0,0,0.45)"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 1.12}" fill="url(#rim)" stroke="#d9b56a" stroke-width="${(r * 0.025).toFixed(1)}"/>
    <g transform="rotate(${rotation.toFixed(2)} ${cx} ${cy})" ${blur ? 'filter="url(#spin)"' : ''}>
      ${sectors}
      <circle cx="${cx}" cy="${cy}" r="${inner}" fill="url(#cone)" stroke="#d9b56a" stroke-width="1.5"/>
      ${spokes}
      <circle cx="${cx}" cy="${cy}" r="${(r * 0.1).toFixed(1)}" fill="#e6c47a"/>
    </g>
    <circle cx="${bx.toFixed(2)}" cy="${(by + ballR * 0.35).toFixed(2)}" r="${ballR.toFixed(2)}" fill="rgba(0,0,0,0.45)"/>
    <circle cx="${bx.toFixed(2)}" cy="${by.toFixed(2)}" r="${ballR.toFixed(2)}" fill="url(#ballShade)"/>`;
}
