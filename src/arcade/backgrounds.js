// Fonds d'écran des jeux de l'arcade : les images du dossier « fond jeu » (à la racine du projet),
// reconnues par leur nom de fichier. Exemple : « scene de crime.jpg » pour l'imposteur, « foret.png » pour le loup-garou.
// Un jeu sans image qui correspond n'a pas de fond.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const DIRS = ['fond jeu', 'fond-jeu', 'fond_jeu', 'fonds jeux', 'assets/fonds'];
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
// Mots cherchés dans le nom du fichier, du plus précis au plus large
const KEYWORDS = {
  loupgarou: ['loup garou', 'loupgarou', 'loup', 'foret', 'forest', 'village'],
  imposteur: ['imposteur', 'scene de crime', 'crime', 'enquete'],
  undercover: ['undercover', 'espion', 'scene de crime', 'crime', 'enquete'],
  histoire: ['histoire', 'conte', 'livre', 'chateau', 'aventure'],
  petitbac: ['petit bac', 'petitbac', 'bac', 'ecole', 'classe'],
  actionverite: ['action ou verite', 'action verite', 'actionverite', 'verite', 'soiree', 'fete'],
  quizserveur: ['quiz serveur', 'quizserveur', 'quiz', 'plateau tv', 'plateau'],
  quiz: ['quiz', 'plateau tv', 'plateau'],
  quiditca: ['qui a dit', 'quiditca', 'message', 'discussion'],
  rebus: ['rebus', 'emoji', 'enigme'],
  fans: ['plus ou moins', 'fans', 'concert', 'stade'],
  chasse: ['chasse au tresor', 'chasse', 'tresor', 'ile', 'carte au tresor'],
  motscroises: ['mots croises', 'motscroises', 'journal', 'mots'],
  escape: ['escape', 'cale', 'prison', 'cachot'],
  blindtest: ['blind test', 'blindtest', 'blind', 'musique', 'concert'],
  blindperso: ['blind test perso', 'blindperso', 'blind', 'musique', 'concert'],
  devine: ['devine l oeuvre', 'cinema', 'film', 'oeuvre', 'blind test', 'musique'],
  pendumusical: ['pendu musical', 'pendumusical', 'pendu', 'musique'],
  rappeur: ['rappeur', 'rap', 'studio'],
  freestyle: ['freestyle', 'battle', 'rap', 'micro'],
  dessin: ['dessin', 'dessine', 'atelier', 'peinture'],
  pendu: ['pendu classique', 'potence'],
  nombre: ['nombre', 'chiffre'],
  morpion: ['morpion'],
  puissance4: ['puissance 4', 'puissance4'],
};
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

let files = null; // [{ name, file }]
let loadedAt = 0;
async function list() {
  if (files && Date.now() - loadedAt < 60_000) return files;
  const out = [];
  for (const dir of DIRS) {
    const entries = await readdir(path.resolve(dir)).catch(() => []);
    for (const f of entries) if (TYPES[path.extname(f).toLowerCase()]) out.push({ name: norm(path.basename(f, path.extname(f))), file: path.resolve(dir, f) });
  }
  files = out;
  loadedAt = Date.now();
  return files;
}

/** Le fichier de fond d'un jeu, ou null. */
export async function backgroundFile(game) {
  const words = KEYWORDS[game];
  if (!words) return null;
  const all = await list();
  for (const w of words) {
    const hit = all.find((f) => ` ${f.name} `.includes(` ${w} `)) ?? all.find((f) => f.name.includes(w.replace(/ /g, '')));
    if (hit) return hit.file;
  }
  return null;
}

export async function backgroundImage(game) {
  const file = await backgroundFile(game);
  if (!file) return null;
  const buf = await readFile(file).catch(() => null);
  return buf ? { buf, type: TYPES[path.extname(file).toLowerCase()] } : null;
}
