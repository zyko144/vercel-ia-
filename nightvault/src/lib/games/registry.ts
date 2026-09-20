import { dice } from './instant/dice';
import { keno } from './instant/keno';
import { limbo } from './instant/limbo';
import { plinko } from './instant/plinko';
import { roulette } from './instant/roulette';
import { wheel } from './instant/wheel';
import { createSlot } from './slots/engine';
import { SLOT_CONFIGS } from './slots/configs';
import { crash } from './stateful/crash';
import { mines } from './stateful/mines';
import { tower } from './stateful/tower';
import type { InstantGame, StatefulGame } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = InstantGame<any, any> | StatefulGame<any, any, any>;

const slots = SLOT_CONFIGS.map((config) => createSlot(config));

export const GAMES: Record<string, Any> = Object.fromEntries(
  [dice, limbo, plinko, wheel, keno, roulette, mines, crash, tower, ...slots].map((game) => [game.meta.id, game as Any]),
);

export const getGame = (id: string): Any | undefined => GAMES[id];
export const listGames = () => Object.values(GAMES);

/** Jeux annoncés au catalogue mais pas encore jouables (affichés « bientôt »). */
export const COMING_SOON: { id: string; name: string; category: string; accent: string }[] = [
  { id: 'cyber-samurai', name: 'Cyber Samurai', category: 'slots', accent: '#35d0ff' },
  { id: 'pharaohs-legacy', name: "Pharaoh's Legacy", category: 'slots', accent: '#f0d38a' },
  { id: 'midnight-joker', name: 'Midnight Joker', category: 'slots', accent: '#b06bff' },
  { id: 'dragon-crown', name: 'Dragon Crown', category: 'slots', accent: '#ff4d5e' },
  { id: 'ocean-treasure', name: 'Ocean Treasure', category: 'slots', accent: '#2ee08a' },
  { id: 'pirate-gold', name: 'Pirate Gold', category: 'slots', accent: '#c8a24a' },
  { id: 'cosmic-jackpot', name: 'Cosmic Jackpot', category: 'slots', accent: '#7b5cff' },
  { id: 'wild-west-gold', name: 'Wild West Gold', category: 'slots', accent: '#ff9f43' },
  { id: 'mystic-forest', name: 'Mystic Forest', category: 'slots', accent: '#2ee08a' },
  { id: 'inferno-coins', name: 'Inferno Coins', category: 'slots', accent: '#ff4d5e' },
  { id: 'golden-temple', name: 'Golden Temple', category: 'slots', accent: '#f0d38a' },
  { id: 'lunar-fortune', name: 'Lunar Fortune', category: 'slots', accent: '#c9d3e4' },
  { id: 'american-roulette', name: 'Roulette américaine', category: 'table', accent: '#ff4d5e' },
  { id: 'blackjack', name: 'Blackjack', category: 'table', accent: '#2ee08a' },
  { id: 'baccarat', name: 'Baccarat', category: 'table', accent: '#c8a24a' },
  { id: 'three-card-poker', name: 'Three Card Poker', category: 'table', accent: '#35d0ff' },
  { id: 'video-poker', name: 'Video Poker', category: 'table', accent: '#b06bff' },
  { id: 'war', name: 'War', category: 'table', accent: '#ff9f43' },
  { id: 'red-or-black', name: 'Red or Black', category: 'table', accent: '#ff4d5e' },
  { id: 'higher-or-lower', name: 'Higher or Lower', category: 'table', accent: '#2ee08a' },
  { id: 'sic-bo', name: 'Sic Bo', category: 'table', accent: '#f0d38a' },
  { id: 'double-dice', name: 'Double Dice', category: 'dice', accent: '#35d0ff' },
  { id: 'lucky-dice', name: 'Lucky Dice', category: 'dice', accent: '#2ee08a' },
  { id: 'dice-duel', name: 'Dice Duel', category: 'dice', accent: '#ff2d9b' },
  { id: 'hi-lo-dice', name: 'Hi-Lo Dice', category: 'dice', accent: '#b06bff' },
  { id: 'rocket', name: 'Rocket', category: 'arcade', accent: '#ff9f43' },
  { id: 'ladder', name: 'Ladder', category: 'arcade', accent: '#c9d3e4' },
  { id: 'color-crash', name: 'Color Crash', category: 'arcade', accent: '#ff2d9b' },
  { id: 'multiplier', name: 'Multiplier', category: 'arcade', accent: '#7b5cff' },
  { id: 'scratch-card', name: 'Scratch Card', category: 'quick', accent: '#f0d38a' },
  { id: 'mystery-box', name: 'Mystery Box', category: 'quick', accent: '#b06bff' },
  { id: 'treasure-chest', name: 'Treasure Chest', category: 'quick', accent: '#c8a24a' },
  { id: 'pick-a-card', name: 'Pick a Card', category: 'quick', accent: '#35d0ff' },
  { id: 'bomb-finder', name: 'Bomb Finder', category: 'quick', accent: '#ff4d5e' },
  { id: 'safe-vault', name: 'Safe Vault', category: 'quick', accent: '#c9d3e4' },
  { id: 'lucky-envelope', name: 'Lucky Envelope', category: 'quick', accent: '#2ee08a' },
  { id: 'jackpot-ladder', name: 'Jackpot Ladder', category: 'quick', accent: '#ff9f43' },
  { id: 'mystery-wheel', name: 'Mystery Wheel', category: 'quick', accent: '#7b5cff' },
];
