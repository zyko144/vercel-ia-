// /jeux : les duels à deux, la taverne (jeux en pièces d'or et jeux solo) et les défis.
// Les groupes sont remis dans l'ordre : groupe, duels, taverne, défis, musique.
import { ChannelType } from 'discord.js';
import { PANELS, addActions } from './catalog.js';
import { field as f } from './ui.js';
import { DUEL_GAMES, startDuel } from '../games/duels.js';
import { blackjack, coinFlip, diceDuel, slots, startGuessNumber, startHangman, startMinesweeper, wheel } from '../games/tripot.js';
import { openArcade } from '../arcade/discord.js';
import { startCrossword, startEscapeGame, startGuessRapper, startQuizTournament, startTreasureHunt, startWhoSaidIt } from '../games/defis.js';

const BET = () => f.int('mise', 'Mise en pièces d’or (10 à 10 000)', { req: true, min: 10, top: 10_000 });
const duelFields = (kind) => [
  f.user('adversaire', 'Qui tu défies (vide = tout le salon)'),
  f.int('mise', 'Mise en pièces d’or (vide = pour le fun)', { min: 0, top: 50_000 }),
  ...(DUEL_GAMES[kind].noBot ? [] : [f.bool('bot', 'Jouer contre le bot ?')]),
];
const duel = (kind, desc) => ({
  id: `duel-${kind}`, label: DUEL_GAMES[kind].name, emoji: DUEL_GAMES[kind].emoji, desc, fields: duelFields(kind),
  run: (client, interaction, v) => startDuel(interaction, kind, {
    opponent: v.bot ? client.user : (v.adversaire?.user ?? v.adversaire ?? null),
    bet: v.mise ?? 0,
  }),
});

addActions('jeux', 'Jeux de groupe', [
  { id: 'arcade', label: 'Arcade (Activité Discord)', emoji: '🕹️', desc: 'Dessine et devine, morpion, puissance 4 : tous ensemble', run: (c, i) => openArcade(i) },
]);
// L'arcade en tête du menu
const group = PANELS.jeux.groups.find((g) => g.label === 'Jeux de groupe');
group.actions.unshift(group.actions.pop());

addActions('jeux', 'Duels à deux', [
  duel('morpion', 'Trois pions alignés, contre un ami ou le bot'),
  duel('puissance4', 'Quatre jetons alignés, 7 colonnes'),
  duel('navale', 'Coule la flotte adverse sur une grille 5×5'),
  duel('pfc', 'Pierre-feuille-ciseaux en 2 manches gagnantes'),
  duel('allumettes', 'Prends 1 à 3 allumettes, pas la dernière'),
  duel('memory', 'Retrouve les paires de trésors'),
  duel('abordage', 'Canons, bordées et abordage : coule son navire'),
  duel('rimes', 'Chacun écrit sa rime, l’IA désigne le gagnant'),
]);

addActions('jeux', 'Taverne : or et jeux solo', [
  { id: 'pile-or', label: 'Pile ou face', emoji: '🪙', desc: 'Mise sur pile ou face : ×1,9', fields: [BET(), f.choice('cote', 'Ton choix', [{ label: 'Pile', value: 'pile' }, { label: 'Face', value: 'face' }], { req: true })], run: (c, i, v) => coinFlip(i, { bet: v.mise, side: v.cote }) },
  { id: 'des-or', label: 'Dés contre le capitaine', emoji: '🎲', desc: '2 dés chacun, le plus haut gagne : ×1,9', fields: [BET()], run: (c, i, v) => diceDuel(i, { bet: v.mise }) },
  { id: 'blackjack', label: 'Blackjack', emoji: '🃏', desc: 'Approche 21 sans dépasser : ×2, blackjack ×2,5', fields: [BET()], run: (c, i, v) => blackjack(i, { bet: v.mise }) },
  { id: 'roue', label: 'Roue de la fortune', emoji: '🎡', desc: 'Jusqu’à ×5 ta mise', fields: [BET()], run: (c, i, v) => wheel(i, { bet: v.mise }) },
  { id: 'machine', label: 'Machine à sous', emoji: '🎰', desc: 'Trois 🏴‍☠️ = ×100', fields: [BET()], run: (c, i, v) => slots(i, { bet: v.mise }) },
  { id: 'demineur', label: 'Démineur', emoji: '💣', desc: 'Cases cachées : évite les mines', fields: [f.choice('niveau', 'Niveau', [{ label: 'Facile', value: 'facile' }, { label: 'Moyen', value: 'moyen' }, { label: 'Difficile', value: 'difficile' }])], run: (c, i, v) => startMinesweeper(i, { level: v.niveau ?? 'moyen' }) },
  { id: 'pendu-classique', label: 'Pendu', emoji: '🪢', desc: 'Des lettres dans le salon, 6 erreurs max', run: (c, i) => startHangman(i) },
  { id: 'nombre', label: 'Devine le nombre', emoji: '🔢', desc: 'Entre 1 et 1 000, plus haut ou plus bas', run: (c, i) => startGuessNumber(i) },
]);

addActions('jeux', 'Défis et événements', [
  { id: 'chasse', label: 'Chasse au trésor', emoji: '🗺️', desc: '3 énigmes, 3 morceaux de carte, un coffre', run: (c, i) => startTreasureHunt(i) },
  { id: 'tournoi', label: 'Tournoi de quiz', emoji: '🏆', desc: '10 questions, podium payé en or', fields: [f.text('theme', 'Thème (vide = culture générale)', { max: 100 })], run: (c, i, v) => startQuizTournament(i, { theme: v.theme ?? '' }) },
  { id: 'quiditca', label: 'Qui a dit ça ?', emoji: '🗨️', desc: 'Retrouve l’auteur de vrais messages', fields: [f.channel('salon', 'Salon des citations (vide = ici)', { types: [ChannelType.GuildText] })], run: (c, i, v) => startWhoSaidIt(i, { source: v.salon ?? null }) },
  { id: 'rappeur', label: 'Devine le rappeur', emoji: '🎤', desc: 'La photo floutée se dévoile petit à petit', run: (c, i) => startGuessRapper(i) },
  { id: 'motscroises', label: 'Mots croisés de l’IA', emoji: '🧩', desc: '6 définitions, des lettres qui se dévoilent', fields: [f.text('theme', 'Thème (vide = la mer)', { max: 100 })], run: (c, i, v) => startCrossword(i, { theme: v.theme ?? '' }) },
  { id: 'escape', label: 'Escape game', emoji: '🗝️', desc: '3 salles, 10 minutes, en équipe', fields: [f.text('theme', 'Thème (vide = navire fantôme)', { max: 100 })], run: (c, i, v) => startEscapeGame(i, { theme: v.theme ?? '' }) },
]);

// Ordre des menus
const ORDER = ['Jeux de groupe', 'Duels à deux', 'Taverne : or et jeux solo', 'Défis et événements', 'Jeux musicaux'];
PANELS.jeux.groups.sort((a, b) => ORDER.indexOf(a.label) - ORDER.indexOf(b.label));
