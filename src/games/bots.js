// Joueurs virtuels pour tester un jeu seul. En mode test, ils complètent la table
// et jouent automatiquement (indices, votes, actions de nuit), avec un petit délai
// pour qu'on voie la partie se dérouler.
//
// Ils n'ont pas de compte Discord : leur identifiant commence par « bot- », on
// écrit leur nom au lieu de les mentionner, et ils ne reçoivent pas de MP.

const NAMES = ['Nova', 'Pixel', 'Zed', 'Luna', 'Kiko', 'Onyx', 'Sora', 'Vega', 'Milo', 'Jinx', 'Rio', 'Iris', 'Tao', 'Nox', 'Maddox'];
const PREFIX = 'bot-';

export const isBot = (id) => typeof id === 'string' && id.startsWith(PREFIX);
export const botName = (id) => `🤖 ${NAMES[Number(id.slice(PREFIX.length)) % NAMES.length]}`;

/** `count` joueurs virtuels, numérotés à la suite. */
export const makeBots = (count) => Array.from({ length: Math.max(0, count) }, (_, i) => `${PREFIX}${i}`);

/** Les vrais joueurs d'une liste (les seuls qu'on peut mentionner ou joindre en MP). */
export const humans = (ids) => ids.filter((id) => !isBot(id));

/** Nom affichable d'un joueur : mention Discord, ou nom en gras pour un bot. */
export const who = (id) => (isBot(id) ? `**${botName(id)}**` : `<@${id}>`);
export const whoList = (ids) => ids.map(who).join(', ');

/** Un joueur au hasard parmi `ids`, en excluant `exclude`. */
export function pickFrom(ids, exclude = []) {
  const pool = ids.filter((id) => !exclude.includes(id));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

/** Délai « humain » avant qu'un bot joue. */
export const botPause = (min = 1_500, spread = 2_000) => new Promise((resolve) => setTimeout(resolve, min + Math.random() * spread));

/**
 * Fait jouer les bots d'une phase, chacun après un petit délai. `still()` dit si la
 * phase est toujours en cours : un bot en retard ne joue pas dans la phase suivante.
 */
export function botsPlay(ids, still, act) {
  for (const id of ids.filter(isBot)) {
    botPause().then(() => {
      if (still()) act(id);
    }).catch(() => {});
  }
}
