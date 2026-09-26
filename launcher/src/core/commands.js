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
// Similarité de deux textes (0 à 1) : tolère les fautes de la dictée (« rocket ligue », « discorde »)
export function similarity(a, b) {
  const x = norm(a); const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const m = x.length; const n = y.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}
// Façons polies ou naturelles de demander : retirées avant de comprendre (« tu peux me lancer… », « je veux jouer à… »)
const POLITE = /^(?:(?:est ce que |est-ce que )?(?:tu peux|peux tu|tu pourrais|pourrais tu|je veux|je voudrais|j aimerais|on va|vas y|allez|stp|s il te plait|s il te plaît|please)\s+(?:me\s+|m\s+)?)+/;
const TAIL = /\s+(?:s il te pla[iî]t|stp|merci|please)$/;
/** Réécrit les demandes naturelles en commandes simples (« je veux jouer à X » → « lance X »). */
export function simplify(t) {
  let x = t.replace(POLITE, '').replace(TAIL, '').trim();
  x = x.replace(/^(?:jouer|joue|jouons|on joue|je joue)\s+(?:a|à|au|aux)\s+/, 'lance ');
  x = x.replace(/^(?:mets|met|mettre)\s+(?:moi\s+)?(?:le jeu|l appli|l application)\s+/, 'lance ');
  x = x.replace(/^(?:demarre|démarre|ouvre|lance|allume)\s*moi\s+/, 'lance ');
  x = x.replace(/^(?:lancer|ouvrir|demarrer|démarrer|fermer|quitter|installer|desinstaller|désinstaller|verifier|vérifier)\b/, (v) => ({ lancer: 'lance', ouvrir: 'ouvre', demarrer: 'demarre', démarrer: 'demarre', fermer: 'ferme', quitter: 'quitte', installer: 'installe', desinstaller: 'desinstalle', désinstaller: 'desinstalle', verifier: 'verifie', vérifier: 'verifie' })[v]);
  return x;
}

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
    else if (q.length >= 4) {
      // Dictée approximative : nom entier ou même nombre de mots au début du nom
      const words = n.split(' ');
      const head = words.slice(0, q.split(' ').length).join(' ');
      const sim = Math.max(similarity(q, n), similarity(q, head) - 0.05);
      if (sim >= 0.72) score = Math.round(40 + sim * 20);
    }
    if (score) scored.push({ i, score: score + (i.installed ? 3 : 0) + Math.min(2, i.minutes / 6000) });
  }
  return scored.sort((a, b) => b.score - a.score)[0]?.i ?? null;
}

const VIEWS = [
  [/optimis|nettoi|nettoy|acceler/, 'optimisation'], [/mon pc|\bpc\b|ordi/, 'pc'], [/amis|potes|copains/, 'amis'], [/classement|podium|meilleurs jeux/, 'classement'], [/stat/, 'stats'], [/favori/, 'favoris'],
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
  const t = simplify(raw.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’'-]/g, ' ').replace(/[?!.,]+$/, '').replace(/\s+/g, ' ').trim());
  const rest = (re) => t.replace(new RegExp(`^.*?${re.source}\\s*`, 'i'), '').trim();
  const withItem = (action, re, verb) => {
    const item = findItem(items, rest(re));
    return item ? { action, itemId: item.id, reply: `${verb} ${item.name}.` } : { action: 'answer', reply: `Je ne trouve pas « ${rest(re) || '…'} » dans ta bibliothèque.` };
  };

  // ===== Actions du launcher (amis, optimisation, réglages…) =====
  const code = raw.match(/([\p{L}\p{N}._-]{2,20}#[0-9A-Fa-f]{6})/u)?.[1];
  if (code && /(ajoute|ajouter|invite|demande)/.test(t)) return { action: 'add_friend', value: code, reply: `J’envoie une demande d’ami à ${code}.` };
  if (/(accepte|valide).*(demande|invitation).*(ami|amis|potes)/.test(t)) return { action: 'accept_friends', reply: 'J’accepte tes demandes d’amis.' };
  if (/(qui|quels? amis?|mes amis?|mes potes?).*(joue|jouent|en ligne|connecte|dispo)/.test(t)) return { action: 'friends_status', reply: '' };
  if (/(mise|mises|met|mets|fais|fait|lance|installe|cherche|verifie)s? ?(a jour|la maj|les maj|la mise a jour|une mise a jour|update)|^(maj|update)\b|mettre a jour (l app|le launcher|history)|nouvelle version/.test(t) && !/(jeu|jeux|steam|epic|pilote|driver)/.test(t)) return { action: 'update', reply: 'Je cherche une mise à jour du launcher.' };
  if (/nettoyage profond|nettoie (a fond|en profondeur)|nettoyage complet de windows/.test(t)) return { action: 'deep_clean', reply: 'Je lance le nettoyage profond de Windows : accepte la demande d’autorisation.' };
  if (/(vide|videz|vider) (la |ma )?corbeille/.test(t)) return { action: 'empty_bin', reply: 'Je vide la corbeille.' };
  if (/^(optimise|nettoie|nettoye|accelere|boost(e)?)\b.*\b(pc|ordi|ordinateur)\b|^(mon pc|le pc|l ordi|mon ordi) (rame|lag|lague|est lent|galere)|fais (une |l )?opti/.test(t)) return { action: 'optimize', value: 'run', reply: 'J’analyse ton PC et je te propose l’optimisation complète.' };
  if (/(active|allume|mets?) (le )?boost/.test(t)) return { action: 'boost', value: 'on', reply: 'Boost activé pour tes prochaines parties.' };
  if (/(desactive|coupe|enleve|eteins) (le )?boost/.test(t)) return { action: 'boost', value: 'off', reply: 'Boost désactivé.' };
  if (/(combien|quelle|il reste).*(place|espace|stockage|disque)/.test(t)) return { action: 'disk_status', reply: '' };
  if (/(temperature|chauffe|chaud|cpu|processeur|carte graphique|gpu|ram|memoire).*(pc|ordi|combien|est|a)?/.test(t) && /(combien|quelle|chauffe|temperature|comment va|etat)/.test(t)) return { action: 'pc_status', reply: '' };
  const theme = t.match(/(?:theme|couleur)\s+(?:en\s+)?(bleu|violet|rouge|vert|orange|rose|auto)/)?.[1];
  if (theme) return { action: 'theme', value: theme, reply: `Thème ${theme} appliqué.` };
  if (/(mode )?grand ecran|plein ecran|mode tv/.test(t)) return { action: 'fullscreen', reply: 'Mode grand écran.' };
  if (/(infos?|ecran|overlay).*(en jeu|par dessus)/.test(t)) return { action: 'overlay', reply: 'Écran d’infos en jeu affiché (Ctrl+Alt+O pour le masquer).' };
  if (/resume de (la|ma) semaine|bilan de (la|ma) semaine/.test(t)) return { action: 'recap', reply: 'Voici ta semaine.' };
  const limit = t.match(/limite.*?(\d+)\s*(h|heure|min)/);
  if (limit) { const m = Number(limit[1]) * (limit[2].startsWith('min') ? 1 : 60); return { action: 'daily_limit', value: String(m), reply: `Limite de jeu réglée à ${limit[2].startsWith('min') ? `${m} min` : `${limit[1]} h`} par jour.` }; }
  if (/(enleve|retire|supprime|desactive).*(limite)/.test(t)) return { action: 'daily_limit', value: '0', reply: 'Plus de limite de jeu.' };
  const startup = t.match(/(?:desactive|enleve|retire|empeche)\s+(.+?)\s+(?:au|du|de)\s+demarrage/);
  if (startup) return { action: 'startup_off', target: startup[1], reply: `${startup[1]} ne se lancera plus au démarrage.` };
  const col = t.match(/(?:ajoute|mets?|range)\s+(.+?)\s+(?:dans|a) (?:la |ma )?collection\s+(.+)/);
  if (col) { const item = findItem(items, col[1]); return item ? { action: 'collection_add', itemId: item.id, value: col[2], reply: `${item.name} ajouté à la collection « ${col[2]} ».` } : { action: 'answer', reply: `Je ne trouve pas « ${col[1]} ».` }; }
  const join = t.match(/^(?:rejoins|rejoindre|rejoint)\s+(.+)/);
  if (join) return { action: 'steam_join', target: join[1].replace(/^(la partie de|mon pote|mon ami)\s+/, ''), reply: '' };
  const msg = t.match(/^(?:envoie un message a|ecris a|parle a|message a)\s+(.+)/);
  if (msg) return { action: 'steam_message', target: msg[1], reply: '' };
  if (/(retire|enleve).*(des favoris)/.test(t)) { const item = findItem(items, raw.replace(/^(retire|enl[eè]ve)\s+/i, '').replace(/\s+des\s+favoris.*$/i, '')); return item ? { action: 'unfavorite', itemId: item.id, reply: `${item.name} retiré des favoris.` } : { action: 'answer', reply: 'Je ne trouve pas ce jeu.' }; }

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

  if (/^(optimise|nettoie|nettoye|accelere|boost)\b.*\b(pc|ordi|ordinateur)\b|^(mon pc|le pc) (rame|lag|est lent)/.test(t)) return { action: 'optimize', reply: 'J’analyse ton PC : tu vas voir tout ce qui peut être optimisé.' };

  // Vues, tri, recherche
  if (/^(montre|affiche|ouvre|va (dans|sur|a)|voir)\b.*\b(mes |les |la |le |l )?(optimis|nettoy|mon pc|pc|ordi|amis|potes|classement|podium|stat|favori|appli|logiciel|jeux|biblioth|accueil|param|reglage)/.test(t) && !findItem(items, rest(/(montre|affiche|ouvre|voir)/))) {
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
