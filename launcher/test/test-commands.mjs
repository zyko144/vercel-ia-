/**
 * Banc d'essai de l'assistant gratuit (sans IA) : « Hey History, lance Rocket League »…
 *
 *   node test/test-commands.mjs
 */
import assert from 'node:assert/strict';
import { findItem, stripWake, understand } from '../src/core/commands.js';
import { parseHeard, speakableNames } from '../src/core/voice.js';

let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log('✅', name); };
const items = [
  { id: 'rl', name: 'Rocket League', kind: 'game', installed: true, minutes: 11880, lastPlayed: 5, size: 25e9 },
  { id: 'gta', name: 'Grand Theft Auto V', kind: 'game', installed: true, minutes: 25680, lastPlayed: 9, size: 108e9 },
  { id: 'rdr2', name: 'Red Dead Redemption 2', kind: 'game', installed: true, minutes: 50, lastPlayed: 1, size: 120e9 },
  { id: 'lol', name: 'League of Legends', kind: 'game', installed: true, minutes: 600, lastPlayed: 3, size: 20e9 },
  { id: 'cs2', name: 'Counter-Strike 2', kind: 'game', installed: true, minutes: 3000, lastPlayed: 4, size: 35e9 },
  { id: 'disc', name: 'Discord', kind: 'app', installed: true, minutes: 900, lastPlayed: 8 },
  { id: 'spot', name: 'Spotify', kind: 'app', installed: true, minutes: 2400, lastPlayed: 8 },
];
const u = (t) => understand(t, items, { music: { artist: 'Bir Hakeim', title: 'Cherry Pie' } });

check('mot d’éveil « Hey History » reconnu (et variantes de la dictée)', () => {
  assert.equal(stripWake('Hey History, lance Rocket League'), 'lance Rocket League');
  assert.equal(stripWake('eh history lance gta'), 'lance gta');
  assert.equal(stripWake('Histoire ouvre discord'), 'ouvre discord');
  assert.equal(stripWake('ok historie mets pause'), 'mets pause');
  assert.equal(stripWake('lance rocket league'), null);
});

check('trouver le bon jeu : nom, début, surnom, initiales', () => {
  assert.equal(findItem(items, 'rocket league').id, 'rl');
  assert.equal(findItem(items, 'rocket').id, 'rl');
  assert.equal(findItem(items, 'gta').id, 'gta');
  assert.equal(findItem(items, 'GTA 5').id, 'gta');
  assert.equal(findItem(items, 'rdr2').id, 'rdr2');
  assert.equal(findItem(items, 'lol').id, 'lol');
  assert.equal(findItem(items, 'cs').id, 'cs2');
  assert.equal(findItem(items, 'le jeu minecraft'), null);
});

check('lancer, fermer, installer, désinstaller, vérifier', () => {
  assert.deepEqual([u('lance Rocket League').action, u('lance Rocket League').itemId], ['launch', 'rl']);
  assert.deepEqual([u('ouvre discord').action, u('ouvre discord').itemId], ['launch', 'disc']);
  assert.deepEqual([u('joue à GTA').action, u('joue à GTA').itemId], ['launch', 'gta']);
  assert.deepEqual([u('ferme spotify').action, u('ferme spotify').itemId], ['close', 'spot']);
  assert.equal(u('désinstalle rdr2').action, 'uninstall');
  assert.deepEqual([u('vérifie les fichiers de GTA').action, u('vérifie les fichiers de GTA').itemId], ['verify', 'gta']);
  assert.equal(u('lance minecraft').action, 'answer', 'jeu absent : réponse, pas d’action');
});

check('musique et volume', () => {
  assert.equal(u('mets la musique en pause').value, 'pause');
  assert.equal(u('chanson suivante').value, 'next');
  assert.equal(u('monte le son').value, 'volup');
  assert.equal(u('baisse le volume').value, 'voldown');
  assert.match(u('qu’est-ce que j’écoute ?').reply, /Cherry Pie/);
});

check('vues, tri, recherche et questions', () => {
  assert.deepEqual([u('montre mes jeux les plus joués').action, u('ouvre le classement').value], ['show', 'classement']);
  assert.equal(u('trie mes jeux par taille').value, 'taille');
  assert.equal(u('cherche rocket').value, 'rocket');
  assert.match(u('quel est mon jeu le plus joué ?').reply, /Grand Theft Auto V.*428 heures/);
  assert.match(u('combien d’heures sur rocket league ?').reply, /Rocket League : 198 heures/);
  assert.match(u('quel jeu je pourrais désinstaller ?').reply, /Red Dead Redemption 2/);
  assert.equal(u('raconte-moi une blague').action, 'unknown', 'le reste va à Gemini');
});

check('dictée approximative et demandes naturelles', () => {
  assert.equal(findItem(items, 'rocket ligue').id, 'rl', 'faute de dictée');
  assert.equal(findItem(items, 'discorde').id, 'disc');
  assert.equal(findItem(items, 'conteur strike').id, 'cs2');
  assert.equal(u('je veux jouer à rocket league').itemId, 'rl');
  assert.equal(u('tu peux me lancer GTA s’il te plaît').action, 'launch');
  assert.equal(u('est-ce que tu peux ouvrir discord').itemId, 'disc');
  assert.equal(u('on joue à league of legends').itemId, 'lol');
  assert.equal(u('fermer spotify').action, 'close');
  assert.equal(findItem(items, 'minecraft'), null, 'pas de faux positif');
});

check('écoute guidée : noms prononçables et phrases reçues', () => {
  assert.deepEqual(speakableNames(['Counter-Strike 2', 'Grand Theft Auto V']), ['Counter Strike 2', 'Counter Strike deux', 'Grand Theft Auto V', 'Grand Theft Auto cinq']);
  assert.deepEqual(parseHeard('cmd|0,83|hey history lance rocket league'), { grammar: 'cmd', confidence: 0.83, text: 'hey history lance rocket league' });
  assert.equal(u(stripWake('hey history lance Counter Strike deux')).itemId, 'cs2', 'chiffre dit en lettres');
});

check('actions du launcher : amis, optimisation, réglages', () => {
  assert.deepEqual([u('ajoute Max#3F9A2C en ami').action, u('ajoute Max#3F9A2C en ami').value], ['add_friend', 'Max#3F9A2C']);
  assert.equal(u('accepte mes demandes d’amis').action, 'accept_friends');
  assert.equal(u('qui joue en ce moment parmi mes amis').action, 'friends_status');
  assert.equal(u('optimise mon pc').value, 'run');
  assert.equal(u('fais une opti').action, 'optimize');
  assert.equal(u('mon pc rame').action, 'optimize');
  assert.equal(u('lance le nettoyage profond').action, 'deep_clean');
  assert.equal(u('vide la corbeille').action, 'empty_bin');
  assert.equal(u('coupe le boost').value, 'off', 'pas confondu avec « coupe le son »');
  assert.equal(u('coupe le son').action, 'volume');
  assert.equal(u('combien de place il me reste').action, 'disk_status');
  assert.equal(u('mets le thème rouge').value, 'rouge');
  assert.equal(u('mets une limite de 2h').value, '120');
  assert.equal(u('désactive discord au démarrage').target, 'discord');
  assert.equal(u('ajoute rocket league à la collection avec les potes').itemId, 'rl');
  assert.equal(u('rejoins Max').target, 'max');
  assert.equal(u('retire GTA des favoris').action, 'unfavorite');
  assert.equal(u('lance rocket league').action, 'launch', 'les commandes de base marchent toujours');
});

console.log(`\n${passed} vérifications passées.`);
