// L'animation montrée pendant le tirage. Quand un GIF existe pour ce résultat précis
// (la roue qui s'arrête sur le bon numéro, les dés qui tombent sur les bonnes faces,
// la carte qui se retourne), c'est lui qu'on montre ; sinon l'animation du jeu.
//
// Ces GIF sont fabriqués à l'avance par tools/make-casino-animations.mjs : rien
// n'est encodé pendant une partie.
import { AttachmentBuilder } from 'discord.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';

const DIR = path.resolve('assets/casinho');

// Durée de chaque animation, pour afficher le résultat juste quand elle s'arrête.
const DURATION = { roulette: 3_400, des: 2_300, piece: 2_100, carte: 1_500, machine: 1_700 };

// Phrase du croupier pendant le tirage.
export const CALL = {
  roulette: 'Faites vos jeux… **Rien ne va plus !**',
  machine: 'Les rouleaux tournent…',
  des: 'Le croupier lance les dés…',
  piece: 'La pièce tourne en l’air…',
  carte: 'Le croupier retourne une carte…',
};

const SUIT_CODE = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
export const cardFile = (card) => `${card.rank.toLowerCase()}${SUIT_CODE[card.suit]}`;

/** Le fichier propre à ce résultat, s'il y en a un. */
function specific(scene) {
  if (scene.kind === 'roulette') return `roulette/${scene.pocket}.gif`;
  if (scene.kind === 'des') return `des/${scene.a}-${scene.b}.gif`;
  if (scene.kind === 'piece') return `piece/${scene.side}.gif`;
  if (scene.kind === 'carte') return `cartes/${cardFile(scene.card)}.gif`;
  return null;
}

// L'animation générique de chaque jeu (assets/casinho/*.gif, déjà en place).
const GENERIC = { roulette: 'roulette.gif', machine: 'machine.gif', des: 'des.gif', piece: 'piece.gif', carte: 'cartes.gif' };

const present = new Map();
const exists = (file) => {
  if (!present.has(file)) present.set(file, existsSync(path.join(DIR, file)));
  return present.get(file);
};

/** URL (ou pièce jointe, en local) de l'animation à montrer pour ce tirage. */
export function animationFor(scene) {
  const own = specific(scene);
  const file = own && exists(own) ? own : GENERIC[scene.kind];
  if (!file) return null;
  const durationMs = own && file === own ? DURATION[scene.kind] : 1_600;
  if (config.publicUrl) return { url: `${config.publicUrl}/casino/${file}`, files: [], durationMs };
  // En pièce jointe, le nom garde le dossier : « roulette-17.gif », pas « 17.gif ».
  const name = file.replace('/', '-');
  return { url: `attachment://${name}`, files: [new AttachmentBuilder(path.join(DIR, file), { name })], durationMs };
}
