// /jeux : tous les jeux sont dans l'arcade (Activité Discord). La commande ouvre directement l'Activité ;
// l'action reste au catalogue pour que l'IA puisse la proposer (« lance un jeu »).
import { addActions } from './catalog.js';
import { openArcade } from '../arcade/discord.js';

addActions('jeux', 'Arcade', [
  { id: 'arcade', label: 'Ouvrir l’arcade', emoji: '🕹️', desc: 'Dessin, quiz, duels, taverne, loup-garou… tous les jeux', run: (c, i) => openArcade(i) },
]);
