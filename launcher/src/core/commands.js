// L'assistant gratuit du launcher : comprend les demandes courantes en français, sans IA payante ni internet.
// « Hey History, lance Rocket League », « ferme Discord », « mets pause », « monte le son », « trie par taille »…
// Ce qui n'est pas compris ici peut être confié à Gemini (s'il y a une clé), pour les vraies questions.
import { norm } from './sort.js';

const WAKE = /^\s*(?:(?:hey|he+|eh|hé|ok|salut|dis)\s*,?\s*)?h[iy]st(?:or(?:y|ie|i|ique)?|oire)\b[\s,!.:-]*/i;
/** Retire « Hey History » du début ; null si le mot d'éveil n'y est pas (pour l'écoute vocale). */
export function stripWake(text) {
  const m = String(text ?? '').match(WAKE);
  return m ? String(text).slice(m[0].length).trim() : null;
}

// Surnoms courants → nom (ou début de nom) du jeu
const ALIASES = { gta: 'grand theft auto', lol: 'league of legends', cs: 'counter strike', csgo: 'counter strike', r6: 'rainbow six', valo: 'valorant', cod: 'call of duty', mc: 'minecraft', rl: 'rocket league', fifa: 'ea sports fc', fc: 'ea sports fc', ow: 'overwatch', wow: 'world of warcraft', bg3: 'baldurs gate 3', rdr2: 'red dead redemption 2', rdr: 'red dead redemption', apex: 'apex legends', pubg: 'pubg', tlou: 'the last of us', chrome: 'google chrome' };
const initials = (name) => String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map((w) => (/^\d+$/.test(w) ? w : w[0])).join('');

/** Trouve l'élément de la bibliothèque dont on parle (nom exact, surnom, début de nom, initiales). */
export function findItem(items, query) {
  // Petits mots retirés seulement s'ils sont des mots entiers (« le jeu gta » → « gta », mais « lol » reste « lol »)
  const q = norm(String(query ?? '').toLowerCase().replace(/^(?:(?:le|la|les|l['’]|mon|ma|mes|du|de|des|d['’]|jeu|l['’]appli|appli|application)\s*)+/, ''));
  if (!q) return null;
  const alias = ALIASES[q] ?? ALIASES[q.replace(/\d+$/, '')];
  const scored = [];
  for (const i of items) {
    const n = norm(i.name);
    let score = 0;
    if (n === q) score = 100;
    else if (alias && n.startsWith(norm(alias))) score = 90 + (q.match(/\d+$/) && n.includes(q.match(/\d+$/)[0]) ? 5 : 0);
    else if (n.startsWith(q)) score = 80;
    else if (q.length >= 3 && n.includes(q)) score = 70;
    else if (q.length >= 2 && initials(i.name) === q) score = 65;
    else if (q.length >= 4 && q.includes(n) && n.length >= 4) score = 60;
    if (score) scored.push({ i, score: score + (i.installed ? 3 : 0) + Math.min(2, i.minutes / 6000) });
  }
  return scored.sort((a, b) => b.score - a.score)[0]?.i ?? null;
}

const VIEWS = [
  [/classement|podium|meilleurs jeux/, 'classement'], [/stat/, 'stats'], [/favori/, 'favoris'],
  [/appli|logiciel|programme/, 'applis'], [/jeux|jeu/, 'jeux'], [/biblioth|tout/, 'bibliotheque'], [/accueil/, 'accueil'], [/param|r[ée]glage/, 'parametres'],
];
const SORTS = [[/taille|lourd|place/, 'taille'], [/nom|alpha/, 'nom'], [/r[ée]cent|dernier/, 'recents'], [/jou[ée]|temps|heure/, 'joues']];
const hours = (m) => (m < 60 ? `${Math.round(m)} minutes` : `${Math.round(m / 60)} heures`);

/**
 * Comprend une demande. Renvoie { action, itemId?, value?, reply } ; action = 'unknown' si ce n'est pas compris.
 * Actions : launch, close, install, uninstall, verify, folder, favorite, hide, show, sort, search, music, volume, answer.
 */
export function understand(text, items, { music = null } = {}) {
  const raw = String(text ?? '').trim();
  const t = raw.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’'-]/g, ' ').replace(/[?!.]+$/, '').replace(/\s+/g, ' ').trim();
  const rest = (re) => raw.replace(new RegExp(`^.*?${re.source}\\s*`, 'i'), '').trim();
  const withItem = (action, re, verb) => {
    const item = findItem(items, rest(re));
    return item ? { action, itemId: item.id, reply: `${verb} ${item.name}.` } : { action: 'answer', reply: `Je ne trouve pas « ${rest(re) || '…'} » dans ta bibliothèque.` };
  };

  // Musique et volume
  if (/\b(pause|stop)\b.*(musique|son|chanson|spotify|deezer)?|mets? (la musique )?en pause/.test(t) && !/lance|ouvre/.test(t)) return { action: 'music', value: 'pause', reply: 'Musique en pause.' };
  if (/(chanson|musique|titre|son) suivant|\bsuivant(e)?\b|\bnext\b|passe (la|le|a la)/.test(t)) return { action: 'music', value: 'next', reply: 'Titre suivant.' };
  if (/precedent|reviens|\bprevious\b/.test(t)) return { action: 'music', value: 'previous', reply: 'Titre précédent.' };
  if (/(reprend|relance|remets?) (la )?musique|^(play|lecture)$|remets? le son/.test(t)) return { action: 'music', value: 'play', reply: 'Lecture.' };
  if (/(monte|augmente|plus fort)/.test(t) && /(son|volume|fort)/.test(t)) return { action: 'volume', value: 'volup', reply: 'Je monte le son.' };
  if (/(baisse|diminue|moins fort)/.test(t) && /(son|volume|fort)/.test(t)) return { action: 'volume', value: 'voldown', reply: 'Je baisse le son.' };
  if (/(coupe|mute|silence)/.test(t)) return { action: 'volume', value: 'mute', reply: 'Son coupé.' };
  if (/(qu est ce que|quoi|quel(le)? (musique|son|chanson)).*(ecoute|joue|passe)|c est quoi (cette|la) (musique|chanson)/.test(t)) {
    return { action: 'answer', reply: music?.title ? `Tu écoutes « ${music.title} » de ${music.artist}.` : 'Aucune musique en cours sur Spotify ou Deezer.' };
  }

  // Vues, tri, recherche
  if (/^(montre|affiche|ouvre|va (dans|sur|a)|voir)\b.*\b(mes |les |la |le |l )?(classement|podium|stat|favori|appli|logiciel|jeux|biblioth|accueil|param|reglage)/.test(t) && !findItem(items, rest(/(montre|affiche|ouvre|voir)/))) {
    const v = VIEWS.find(([re]) => re.test(t));
    return { action: 'show', value: v?.[1] ?? 'bibliotheque', reply: 'Voilà.' };
  }
  if (/^(trie|range|classe|ordonne)/.test(t)) {
    const s = SORTS.find(([re]) => re.test(t));
    return { action: 'sort', value: s?.[1] ?? 'joues', reply: `Trié par ${{ taille: 'taille', nom: 'nom', recents: 'date de dernière partie', joues: 'temps de jeu' }[s?.[1] ?? 'joues']}.` };
  }
  if (/^(cherche|recherche|trouve)\b/.test(t)) return { action: 'search', value: rest(/(cherche|recherche|trouve)/), reply: 'Voici ce que j’ai trouvé.' };

  // Questions sur la bibliothèque (réponses directes, sans IA)
  if (/(plus joue|jeu prefere|joue le plus)/.test(t)) {
    const top = items.filter((i) => i.kind === 'game').sort((a, b) => b.minutes - a.minutes)[0];
    return { action: 'answer', reply: top ? `Ton jeu le plus joué : ${top.name}, avec ${hours(top.minutes)}.` : 'Pas encore de temps de jeu enregistré.' };
  }
  if (/(combien|temps).*(heure|temps|joue)/.test(t)) {
    const item = findItem(items, raw.replace(/^.*?\b(sur|a|à|de)\s+/i, ''));
    if (item) return { action: 'answer', itemId: item.id, reply: `${item.name} : ${hours(item.minutes)}.` };
    const total = items.filter((i) => i.kind === 'game').reduce((n, i) => n + i.minutes, 0);
    return { action: 'answer', reply: `En tout : ${hours(total)} de jeu.` };
  }
  if (/(quel|que).*(desinstaller|supprimer|liberer)/.test(t) || /place (sur le|disque)/.test(t)) {
    const old = items.filter((i) => i.kind === 'game' && i.installed && i.size).sort((a, b) => (a.lastPlayed - b.lastPlayed) || (b.size - a.size)).slice(0, 3);
    return { action: 'answer', reply: old.length ? `Tu pourrais désinstaller : ${old.map((i) => `${i.name} (${(i.size / 1e9).toFixed(0)} Go)`).join(', ')}. Ce sont les jeux lancés le moins récemment.` : 'Rien à conseiller pour l’instant.' };
  }
  if (/combien de jeux/.test(t)) {
    const g = items.filter((i) => i.kind === 'game');
    return { action: 'answer', reply: `${g.filter((i) => i.installed).length} jeux installés, ${g.length} en tout.` };
  }

  // Actions sur un jeu ou une appli
  if (/^(desinstalle|supprime|efface|vire)\b/.test(t)) return withItem('uninstall', /(desinstalle|désinstalle|supprime|efface|vire)/, 'Je prépare la désinstallation de');
  if (/^(installe|telecharge)\b/.test(t)) return withItem('install', /(installe|télécharge|telecharge)/, 'Installation de');
  if (/^(verifie|repare|check)\b/.test(t)) return withItem('verify', /(vérifie|verifie|répare|repare|check)(\s+les\s+fichiers\s+(de|du|d))?/, 'Je vérifie les fichiers de');
  if (/^(ferme|quitte|arrete|kill|stoppe)\b/.test(t)) return withItem('close', /(ferme|quitte|arrête|arrete|kill|stoppe)/, 'Je ferme');
  if (/^(ouvre|montre) (le )?dossier/.test(t)) return withItem('folder', /dossier\s+(de|du|d)?/, 'Dossier de');
  if (/(ajoute|mets?).*(favori)/.test(t)) {
    const item = findItem(items, raw.replace(/^(ajoute|mets?)\s+/i, '').replace(/\s+(aux|en|dans les)\s+favoris?.*$/i, ''));
    return item ? { action: 'favorite', itemId: item.id, reply: `${item.name} ajouté aux favoris.` } : { action: 'answer', reply: 'Je ne trouve pas ce jeu.' };
  }
  if (/^(masque|cache)\b/.test(t)) return withItem('hide', /(masque|cache)/, 'Je masque');
  if (/^(lance|ouvre|demarre|joue|mets?|go|start|allume)\b/.test(t)) return withItem('launch', /(lance|ouvre|démarre|demarre|joue(\s+a|\s+à)?|mets?|go|start|allume)/, 'Je lance');

  return { action: 'unknown', reply: '' };
}
