// Cartes à jouer : un sabot mélangé, et le comptage du blackjack.
import { shuffle } from './economy.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Sabot de `decks` paquets mélangés, comme à une vraie table. */
export function shoe(decks = 6) {
  const cards = [];
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  }
  return shuffle(cards);
}

export const draw = (deck) => deck.pop();

export const red = (card) => card.suit === '♥' || card.suit === '♦';
export const show = (card) => `\`${card.rank}${card.suit}\``;
export const showHand = (cards) => cards.map(show).join(' ');
export const HIDDEN = '`🂠`';

/** Valeur d'une carte au blackjack : les figures valent 10, l'as 11 (ajusté plus bas). */
function cardValue(card) {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return Number(card.rank);
}

/**
 * Total d'une main. Chaque as compte 11 puis retombe à 1 tant que la main dépasse 21.
 * `soft` = il reste un as à 11, donc tirer ne peut pas faire sauter la main.
 */
export function handValue(cards) {
  let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = cards.filter((card) => card.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 && total <= 21, bust: total > 21 };
}

export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;
export const canSplit = (cards) => cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);

/** Rang d'une carte pour les jeux « plus ou moins » (l'as est la plus haute). */
export const highValue = (card) => (card.rank === 'A' ? 14 : { K: 13, Q: 12, J: 11 }[card.rank] ?? Number(card.rank));
