// Les jeux de la salle, tels que les présentent le hall de la page et Discord.
// `shared` : une seule table pour tout le salon.
export const CATALOG = [
  { id: 'roulette', emoji: '🎡', title: 'Roulette', blurb: 'Pose tes jetons sur le tapis. Tout le salon joue à la même table.', shared: true },
  { id: 'blackjack', emoji: '♠️', title: 'Blackjack', blurb: 'Cinq places, un croupier : chacun joue sa main. Blackjack payé 3:2.', shared: true },
  { id: 'crash', emoji: '🚀', title: 'Crash', blurb: 'Une fusée pour tout le salon. Encaisse avant qu’elle explose.', shared: true },
  { id: 'mines', emoji: '💣', title: 'Mines', blurb: 'Ouvre les cases sans tomber sur une bombe. Encaisse quand tu veux.' },
  { id: 'plusoumoins', emoji: '🔼', title: 'Plus ou moins', blurb: 'La carte suivante, plus haute ou plus basse ? Les gains s’enchaînent.' },
  { id: 'machine', emoji: '🎰', title: 'Machine à sous', blurb: 'Trois rouleaux. Trois 7 paient ×200.' },
  { id: 'des', emoji: '🎲', title: 'Dés', blurb: 'Pose tes jetons sur moins de 7, 7 ou plus de 7.' },
  { id: 'pileouface', emoji: '🪙', title: 'Pile ou face', blurb: 'Une chance sur deux, gain ×1,95.' },
  { id: 'rougenoir', emoji: '🃏', title: 'Rouge ou noir', blurb: 'Devine la couleur de la carte, gain ×1,95.' },
  { id: 'duel', emoji: '⚔️', title: 'Duel', blurb: 'Défie un joueur de la salle à pile ou face : le gagnant prend tout.' },
];
export const gameInfo = (id) => CATALOG.find((game) => game.id === id) ?? null;
