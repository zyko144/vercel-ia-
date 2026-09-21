// Outils partagés par les jeux de la salle : formats, jetons, mise, cartes, messages.

export const $ = (id) => document.getElementById(id);
export const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const dec = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
export const short = (n) => (n >= 1e6 ? `${dec(n / 1e6)}M` : n >= 1e3 ? `${dec(n / 1e3)}k` : String(n));
export const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const mult = (m) => `×${m.toFixed(2).replace('.', ',')}`;

/** Le stockage du navigateur : pratique, jamais indispensable (il peut être bloqué). */
export const saved = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* sans stockage, tant pis */ } },
};

// ------------------------------------------------------------------ Jetons
export const CHIPS = [
  [10, '#ece7e2', '#3b2a33'], [20, '#f4c542', '#3b2a10'], [50, '#ff8a3d', '#fff'], [100, '#2a262c', '#fff'],
  [500, '#8e44ad', '#fff'], [1_000, '#d11f3c', '#fff'], [5_000, '#2f6fe0', '#fff'], [10_000, '#1f9a55', '#fff'],
  [50_000, '#8a5a2b', '#fff'], [100_000, '#ff3fa6', '#fff'], [500_000, '#18b6c4', '#fff'], [1_000_000, '#d4af37', '#2a1a00'],
].map(([value, color, ink]) => ({ value, color, ink }));
export const chipStyle = (value) => CHIPS.find((c) => c.value === value) ?? CHIPS[5];

/** Un jeton (ou une pile) en SVG, vu de dessus. */
export function chipSvg(x, y, r, text, { layers = [chipStyle(1000)], faded = false, glow = false } = {}) {
  const shown = layers.slice(-5);
  const inner = r - 3.2;
  const dash = ((2 * Math.PI * inner) / 12).toFixed(2);
  let out = `<g opacity="${faded ? 0.3 : 1}"><circle cx="${x + 1.5}" cy="${y + 4}" r="${r}" fill="rgba(0,0,0,0.45)"/>`;
  shown.forEach((layer, i) => {
    const cy = y + (shown.length - 1 - i) * 3;
    out += `<circle cx="${x}" cy="${cy}" r="${r}" fill="${layer.color}" stroke="rgba(0,0,0,0.6)" stroke-width="1.2"/>
      <circle cx="${x}" cy="${cy}" r="${inner}" fill="none" stroke="#fff" stroke-width="3.6" stroke-dasharray="${dash}" opacity="0.9"/>
      <circle cx="${x}" cy="${cy}" r="${r - 7}" fill="${layer.color}" stroke="rgba(255,255,255,0.75)" stroke-width="0.8"/>`;
  });
  if (glow) out += `<circle cx="${x}" cy="${y}" r="${r + 4}" fill="none" stroke="#49e08c" stroke-width="3.5"/>`;
  const top = shown.at(-1);
  out += `<text x="${x}" y="${y + 0.5}" font-size="${text.length > 3 ? 9.5 : 11.5}" fill="${top.ink}" text-anchor="middle" dominant-baseline="central" font-weight="700">${text}</text></g>`;
  return out;
}

/**
 * Le présentoir de jetons. `pick` : on choisit un jeton (puis on clique où le poser) ;
 * `add` : chaque jeton cliqué s'ajoute à la mise.
 */
export function chipRack(el, { onPick, selected = null } = {}) {
  el.classList.add('rack');
  el.innerHTML = CHIPS.map(
    ({ value, color, ink }) =>
      `<button type="button" class="chip" data-value="${value}" style="--c:${color};--ink:${ink}" aria-label="Jeton de ${fmt(value)}"><span>${short(value)}</span></button>`,
  ).join('');
  el.addEventListener('click', (event) => {
    const button = event.target.closest('.chip');
    if (button && !button.disabled) onPick(Number(button.dataset.value));
  });
  const api = {
    select(value) {
      for (const button of el.children) button.classList.toggle('on', Number(button.dataset.value) === value);
    },
    limit(available, enabled = true) {
      for (const button of el.children) button.disabled = !enabled || Number(button.dataset.value) > available;
    },
  };
  if (selected !== null) api.select(selected);
  return api;
}

/**
 * La mise : on clique sur des jetons pour la monter, « Effacer » pour recommencer.
 * Elle est retenue d'une partie à l'autre, pour chaque jeu.
 */
export function betBuilder(el, { key, onChange = () => {} } = {}) {
  el.classList.add('bet');
  el.innerHTML = `
    <div class="bet-line"><span>Mise</span><strong class="bet-amount">0</strong>
      <button type="button" class="mini" data-do="effacer">Effacer</button>
      <button type="button" class="mini" data-do="moitie">½</button>
      <button type="button" class="mini" data-do="double">×2</button></div>
    <div class="bet-rack"></div>`;
  let value = Number(saved.get(`salle:mise:${key}`)) || 1_000;
  let available = Infinity;
  let enabled = true;
  const amount = el.querySelector('.bet-amount');
  let rack = null;
  const set = (next) => {
    value = Math.max(0, Math.min(Math.round(next), available));
    amount.textContent = fmt(value);
    saved.set(`salle:mise:${key}`, String(value));
    rack?.limit(available - value, enabled); // un jeton qui ferait dépasser le solde se grise
    onChange(value);
  };
  rack = chipRack(el.querySelector('.bet-rack'), { onPick: (chip) => set(value + chip) });
  el.querySelector('.bet-line').addEventListener('click', (event) => {
    const action = event.target.closest('[data-do]')?.dataset.do;
    if (!action || !enabled) return;
    if (action === 'effacer') set(0);
    if (action === 'moitie') set(Math.floor(value / 2));
    if (action === 'double') set(value * 2);
  });
  amount.textContent = fmt(value);
  return {
    get value() { return value; },
    set value(next) { set(next); },
    /** Solde disponible : les jetons trop gros se grisent. */
    limit(balance, isEnabled = true) {
      available = balance;
      enabled = isEnabled;
      for (const button of el.querySelectorAll('.mini')) button.disabled = !isEnabled;
      if (value > balance) set(balance);
      else rack.limit(available - value, isEnabled);
    },
  };
}

// ------------------------------------------------------------------ Cartes
const RED_SUITS = new Set(['♥', '♦']);

/** Une carte à jouer en SVG : le rang en grand au centre, lisible même petite. */
export function cardSvg(card, { width = 84, hidden = false, extra = '' } = {}) {
  const height = Math.round(width * 1.4);
  if (hidden || !card) {
    return `<svg class="card back ${extra}" viewBox="0 0 100 140" width="${width}" height="${height}">
      <rect x="1" y="1" width="98" height="138" rx="9" fill="#7a1348" stroke="#fff" stroke-width="2"/>
      <rect x="8" y="8" width="84" height="124" rx="6" fill="none" stroke="#ff9ad2" stroke-width="2"/>
      <path d="M50 30 L70 70 L50 110 L30 70 Z" fill="#ff3fa6" opacity="0.7"/><circle cx="50" cy="70" r="9" fill="#ffd9ee"/></svg>`;
  }
  const color = RED_SUITS.has(card.suit) ? '#c21f43' : '#15101a';
  return `<svg class="card ${extra}" viewBox="0 0 100 140" width="${width}" height="${height}">
    <rect x="1" y="1" width="98" height="138" rx="9" fill="#fffdf8" stroke="#d9cfc6" stroke-width="2"/>
    <text x="10" y="24" font-size="20" font-weight="700" fill="${color}">${card.rank}</text>
    <text x="10" y="42" font-size="17" fill="${color}">${card.suit}</text>
    <text x="50" y="80" font-size="${card.rank === '10' ? 44 : 52}" font-weight="700" fill="${color}" text-anchor="middle" dominant-baseline="central">${card.rank}</text>
    <text x="50" y="118" font-size="22" fill="${color}" text-anchor="middle">${card.suit}</text>
    <g transform="rotate(180 50 70)"><text x="10" y="24" font-size="20" font-weight="700" fill="${color}">${card.rank}</text></g></svg>`;
}

// ------------------------------------------------------------------ Messages
let toastTimer = null;
export function toast(text, tone = 'error') {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast ${tone}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

/** Un grand bandeau de résultat par-dessus le jeu : « GAGNÉ +12 000 ». */
export function flash(el, { title, sub = '', tone = 'win' }) {
  const banner = document.createElement('div');
  banner.className = `flash ${tone}`;
  banner.innerHTML = `<div class="flash-title">${esc(title)}</div>${sub ? `<div class="flash-sub">${esc(sub)}</div>` : ''}`;
  el.append(banner);
  setTimeout(() => banner.classList.add('out'), 2200);
  setTimeout(() => banner.remove(), 2700);
}

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
