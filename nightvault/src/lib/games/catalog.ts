import { COMING_SOON, listGames } from './registry';
import type { GameCategory } from './types';

export type CatalogEntry = {
  id: string;
  name: string;
  category: GameCategory | string;
  tagline: string;
  accent: string;
  rtp: number | null;
  volatility: string | null;
  maxWin: number | null;
  playable: boolean;
};

export const CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'all', label: 'Tous', icon: '✦' },
  { id: 'slots', label: 'Machines à sous', icon: '🎰' },
  { id: 'table', label: 'Jeux de table', icon: '♠' },
  { id: 'dice', label: 'Dés', icon: '🎲' },
  { id: 'arcade', label: 'Arcade & Risk', icon: '🚀' },
  { id: 'quick', label: 'Jeux rapides', icon: '⚡' },
];

const TAGLINES: Record<string, string> = {
  'cyber-samurai': 'Lames de néon et rouleaux tranchants',
  'pharaohs-legacy': 'Les sables gardent encore leurs secrets',
  'midnight-joker': 'Le joker ne dort jamais',
  'dragon-crown': 'La couronne se mérite par le feu',
  'ocean-treasure': 'Les abysses paient comptant',
  'pirate-gold': 'Le butin n’attend pas',
  'cosmic-jackpot': 'Une orbite, un jackpot',
  'wild-west-gold': 'Dégaine plus vite que les rouleaux',
  'mystic-forest': 'La forêt choisit ses gagnants',
  'inferno-coins': 'Chauffé à blanc',
  'golden-temple': 'Chaque marche vaut de l’or',
  'lunar-fortune': 'Sous la pleine lune, tout est possible',
  blackjack: 'Le croupier tire à 16, reste à 17',
  baccarat: 'Banquier ou joueur, choisis ton camp',
  'american-roulette': 'Double zéro, double frisson',
  'three-card-poker': 'Trois cartes, une décision',
  'video-poker': 'La quinte flush existe vraiment',
  war: 'La carte la plus forte gagne, c’est tout',
  'red-or-black': 'Une couleur, un pari',
  'higher-or-lower': 'Plus haut ou plus bas ?',
  'sic-bo': 'Trois dés, cinquante paris',
};

/** Catalogue complet : jouable maintenant + annoncé. */
export function catalog(): CatalogEntry[] {
  const playable = listGames().map((game) => ({
    id: game.meta.id,
    name: game.meta.name,
    category: game.meta.category,
    tagline: game.meta.tagline,
    accent: game.meta.accent,
    rtp: game.meta.math.rtp,
    volatility: game.meta.math.volatility,
    maxWin: game.meta.math.maxWin,
    playable: true,
  }));
  const soon = COMING_SOON.map((game) => ({
    ...game,
    tagline: TAGLINES[game.id] ?? 'Bientôt disponible',
    rtp: null,
    volatility: null,
    maxWin: null,
    playable: false,
  }));
  return [...playable, ...soon];
}

export const countByCategory = (entries: CatalogEntry[]) =>
  entries.reduce<Record<string, number>>((acc, entry) => ({ ...acc, [entry.category]: (acc[entry.category] ?? 0) + 1 }), {});
