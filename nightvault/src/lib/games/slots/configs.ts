import type { SlotConfig } from './engine';
import paytables from './paytables.json';

/**
 * Configurations des machines à sous.
 * Les bandes (strips) déterminent toute la probabilité : elles sont réglées avec
 * `npm run simulate -- --game=<id>` jusqu'à atteindre le RTP annoncé.
 */

// 20 lignes classiques sur 5 rouleaux × 3 rangées
const LINES_20 = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 0, 1, 0, 0], [2, 2, 1, 2, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2], [0, 2, 0, 2, 0],
];

/** Construit une bande en répétant chaque symbole selon son poids. */
function strip(weights: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [id, count] of Object.entries(weights)) for (let i = 0; i < count; i++) out.push(id);
  // Mélange fixe (pas d'aléa au démarrage) pour éviter de longs blocs identiques
  return out.map((id, i) => ({ id, key: (i * 7919) % out.length })).sort((a, b) => a.key - b.key).map((entry) => entry.id);
}

export const NEON_FORTUNE: SlotConfig = {
  id: 'neon-fortune',
  name: 'Neon Fortune',
  tagline: 'La ville ne dort jamais, les rouleaux non plus',
  accent: '#ff2d9b',
  reels: 5,
  rows: 3,
  symbols: [
    { id: 'seven', name: 'Seven', pays: [0, 25, 125, 600], color: '#ff2d9b' },
    { id: 'diamond', name: 'Diamant', pays: [0, 12, 50, 250], color: '#35d0ff' },
    { id: 'bell', name: 'Cloche', pays: [0, 8, 30, 125], color: '#f0d38a' },
    { id: 'cherry', name: 'Cerise', pays: [1, 5, 20, 75], color: '#ff4d5e' },
    { id: 'bar', name: 'BAR', pays: [0, 4, 12, 50], color: '#c9d3e4' },
    { id: 'grape', name: 'Raisin', pays: [0, 2, 9, 30], color: '#b06bff' },
    { id: 'lemon', name: 'Citron', pays: [0, 2, 6, 22], color: '#ffe066' },
    { id: 'wild', name: 'Wild', pays: [0, 30, 185, 1250], kind: 'wild', color: '#ffffff' },
    { id: 'scatter', name: 'Scatter', pays: [0, 1, 6, 30], kind: 'scatter', color: '#2ee08a' },
  ],
  strips: [
    strip({ seven: 2, diamond: 3, bell: 4, cherry: 5, bar: 6, grape: 7, lemon: 8, wild: 1, scatter: 2 }),
    strip({ seven: 2, diamond: 3, bell: 4, cherry: 5, bar: 6, grape: 7, lemon: 8, wild: 2, scatter: 2 }),
    strip({ seven: 1, diamond: 3, bell: 4, cherry: 5, bar: 7, grape: 7, lemon: 9, wild: 2, scatter: 2 }),
    strip({ seven: 2, diamond: 3, bell: 4, cherry: 5, bar: 6, grape: 7, lemon: 8, wild: 2, scatter: 2 }),
    strip({ seven: 2, diamond: 3, bell: 5, cherry: 6, bar: 7, grape: 8, lemon: 9, wild: 1, scatter: 2 }),
  ],
  paylines: LINES_20,
  scatter: { id: 'scatter', freeSpins: [8, 12, 20], multiplier: 2, pays: [0, 1, 6, 30] },
  math: { rtp: 0.962, volatility: 'moyenne', maxWin: 5000, hitFrequency: 0.42 },
};

export const ROYAL_VAULT: SlotConfig = {
  id: 'royal-vault',
  name: 'Royal Vault',
  tagline: 'Le coffre du roi ne s’ouvre pas pour tout le monde',
  accent: '#f0d38a',
  reels: 5,
  rows: 3,
  symbols: [
    { id: 'crown', name: 'Couronne', pays: [0, 25, 120, 600], color: '#f0d38a' },
    { id: 'vault', name: 'Coffre', pays: [0, 10, 48, 240], color: '#c8a24a' },
    { id: 'ruby', name: 'Rubis', pays: [0, 6, 24, 120], color: '#ff4d5e' },
    { id: 'emerald', name: 'Émeraude', pays: [0, 4, 16, 64], color: '#2ee08a' },
    { id: 'coin', name: 'Pièce', pays: [1, 2, 10, 36], color: '#ffd166' },
    { id: 'ring', name: 'Anneau', pays: [0, 2, 6, 24], color: '#c9d3e4' },
    { id: 'key', name: 'Clé', pays: [0, 1, 5, 16], color: '#8a93a8' },
    { id: 'wild', name: 'Sceau royal', pays: [0, 30, 160, 1000], kind: 'wild', color: '#ffffff' },
    { id: 'scatter', name: 'Parchemin', pays: [0, 1, 6, 32], kind: 'scatter', color: '#ff9f43' },
  ],
  strips: [
    strip({ crown: 1, vault: 2, ruby: 3, emerald: 4, coin: 6, ring: 7, key: 9, wild: 1, scatter: 2 }),
    strip({ crown: 1, vault: 2, ruby: 3, emerald: 4, coin: 6, ring: 8, key: 9, wild: 2, scatter: 2 }),
    strip({ crown: 1, vault: 2, ruby: 3, emerald: 5, coin: 6, ring: 8, key: 10, wild: 2, scatter: 2 }),
    strip({ crown: 1, vault: 2, ruby: 3, emerald: 4, coin: 6, ring: 8, key: 9, wild: 2, scatter: 2 }),
    strip({ crown: 1, vault: 2, ruby: 4, emerald: 5, coin: 7, ring: 8, key: 10, wild: 1, scatter: 2 }),
  ],
  paylines: LINES_20.slice(0, 10),
  scatter: { id: 'scatter', freeSpins: [10, 15, 25], multiplier: 3, pays: [0, 1, 6, 32] },
  math: { rtp: 0.955, volatility: 'haute', maxWin: 10_000, hitFrequency: 0.28 },
};

export const DIAMOND_RUSH: SlotConfig = {
  id: 'diamond-rush',
  name: 'Diamond Rush',
  tagline: 'Des éclats partout, une ruée qui ne s’arrête pas',
  accent: '#35d0ff',
  reels: 5,
  rows: 3,
  symbols: [
    { id: 'blue', name: 'Diamant bleu', pays: [0, 24, 120, 570], color: '#35d0ff' },
    { id: 'pink', name: 'Diamant rose', pays: [0, 12, 48, 240], color: '#ff2d9b' },
    { id: 'white', name: 'Diamant blanc', pays: [0, 7, 33, 150], color: '#eef1f8' },
    { id: 'green', name: 'Émeraude', pays: [0, 5, 20, 85], color: '#2ee08a' },
    { id: 'gold', name: 'Lingot', pays: [1, 3, 13, 50], color: '#f0d38a' },
    { id: 'pick', name: 'Pioche', pays: [0, 2, 9, 33], color: '#c9d3e4' },
    { id: 'cart', name: 'Wagonnet', pays: [0, 1, 6, 21], color: '#8a93a8' },
    { id: 'wild', name: 'Cristal', pays: [0, 33, 165, 1050], kind: 'wild', color: '#ffffff' },
    { id: 'scatter', name: 'Dynamite', pays: [0, 1, 6, 30], kind: 'scatter', color: '#ff4d5e' },
  ],
  strips: [
    strip({ blue: 2, pink: 3, white: 4, green: 5, gold: 6, pick: 7, cart: 8, wild: 1, scatter: 2 }),
    strip({ blue: 2, pink: 3, white: 4, green: 5, gold: 6, pick: 7, cart: 8, wild: 2, scatter: 2 }),
    strip({ blue: 1, pink: 3, white: 4, green: 5, gold: 7, pick: 7, cart: 9, wild: 3, scatter: 2 }),
    strip({ blue: 2, pink: 3, white: 4, green: 5, gold: 6, pick: 7, cart: 8, wild: 2, scatter: 2 }),
    strip({ blue: 2, pink: 4, white: 5, green: 6, gold: 7, pick: 8, cart: 9, wild: 1, scatter: 2 }),
  ],
  paylines: LINES_20,
  scatter: { id: 'scatter', freeSpins: [8, 14, 22], multiplier: 2, pays: [0, 1, 6, 30] },
  math: { rtp: 0.965, volatility: 'moyenne', maxWin: 6000, hitFrequency: 0.55 },
};

/**
 * Les tables de gains définitives vivent dans paytables.json : elles sont produites par
 * `npx tsx scripts/autotune.ts`, qui mesure le RTP réel et met les gains à l'échelle jusqu'à la cible.
 */
function applyPaytable(config: SlotConfig): SlotConfig {
  const table = (paytables as Record<string, Record<string, number[]>>)[config.id];
  if (!table) return config;
  for (const symbol of config.symbols) if (table[symbol.id]) symbol.pays = table[symbol.id];
  if (config.scatter && table._scatter) config.scatter.pays = table._scatter;
  return config;
}

export const SLOT_CONFIGS = [NEON_FORTUNE, ROYAL_VAULT, DIAMOND_RUSH].map(applyPaytable);
