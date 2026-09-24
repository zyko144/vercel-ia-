// Explications des jeux, publiées chacune dans son salon de règles (lecture seule).
// Les salons sont passés en paramètre pour que les liens pointent au bon endroit.

export const RULES = {
  freestyle: {
    channel: '│・freestyle',
    topic: '🎤 /jeu-freestyle · battle de freestyle notée par l\'IA',
    color: 0xe67e22,
    title: '🎤 FREESTYLE BATTLE',
    intro: 'Deux rappeurs, une instru, un jury IA. Chacun pose son freestyle à son tour, l\'IA écoute tout et désigne le gagnant.',
    fields: (c) => [
      ['🚀 Lancer', '**/jeux** › Battle de freestyle\nOptions : `instru` (Trap, Drill, Boom bap, Afro, Mélo) et `duree` (30, 45 ou 60 s par rappeur).'],
      ['🎧 Où', `Les deux rappeurs doivent être dans <#${c.dictature}> : l'instru y passe et l'IA vocale vient écouter.`],
      ['🔁 Déroulement', '1. L\'adversaire accepte le défi.\n2. Pile ou face pour savoir qui commence.\n3. L\'instru se lance, le premier rappe pendant le temps choisi, puis le second sur la même instru.\n4. Le jury IA délibère et annonce le verdict à l\'écrit **et à voix haute**.'],
      ['🧑‍⚖️ Notation', 'Chaque rappeur est noté sur 10 en **rimes**, **punchlines**, **flow** (placement sur le rythme) et **originalité**, soit une note sur 100. L\'IA cite ta meilleure phrase et te glisse un commentaire.'],
      ['🏆 Classement', 'Chaque victoire compte dans le classement des battles, affiché à la fin de chaque verdict.'],
      ['💡 Conseils', '• Micro ouvert pour le rappeur, **micro coupé pour les autres** (sinon l\'IA vous entend aussi).\n• Parle bien fort par-dessus l\'instru.\n• Si t\'as rien dit, l\'IA le voit : pas de victoire en restant muet.'],
    ],
  },
  paroles: {
    channel: '│・suite-des-paroles',
    topic: '🎙️ /jeu-paroles · le son se coupe, écris la suite',
    color: 0x1abc9c,
    title: '🎙️ SUITE DES PAROLES',
    intro: 'Le bot lance un son et le coupe **juste avant une phrase**. Le premier qui écrit la suite gagne la manche.',
    fields: (c) => [
      ['🚀 Lancer', '**/jeux** › Suite des paroles (menu : thème, difficulté, manches).\nC\'est aussi un mode du blind test : **/jeux** › Blind test › Suite des paroles.'],
      ['🎧 Où', `Le son passe dans <#${c.dictature}>, les réponses s'écrivent dans <#${c.blindtest}>.`],
      ['🔁 Déroulement', '1. Le son démarre quelques secondes avant le moment choisi, les deux phrases d\'avant s\'affichent.\n2. ⏸️ Il se coupe juste avant la phrase à trouver.\n3. Vous écrivez la suite le plus vite possible.\n4. Le son repart : vous entendez la vraie phrase.'],
      ['🎯 Points', '**+2** pour la bonne phrase · **+1** si tu réponds très vite.\nLes fautes d\'orthographe passent, les « (ouais) » et ad-libs ne comptent pas. 🔥 = t\'étais pas loin.'],
      ['📈 Difficulté', '**Facile** : des phrases du refrain (celles que tout le monde connaît).\n**Difficile / Expert** : des phrases des couplets.'],
    ],
  },
  loupgarou: {
    channel: '│・loup-garou',
    topic: '🐺 /jeu-loupgarou · le bot est le meneur',
    color: 0x2c2f33,
    title: '🐺 LOUP-GAROU',
    intro: 'Le vrai loup-garou, avec le bot comme meneur : il distribue les rôles en secret, gère les nuits, les votes, et un **narrateur raconte la partie à voix haute**.',
    fields: (c) => [
      ['🚀 Lancer', `**/jeux** › Loup-garou puis tout le monde appuie sur **Rejoindre** (4 à 16 joueurs). La partie se joue dans un fil de <#${c.mini}>.`],
      ['🔊 Narrateur', `Rejoignez <#${c.iaVocal}> pour entendre le narrateur (si l'IA vocale est libre).`],
      ['🎭 Rôles', '🐺 **Loups-garous** : chaque nuit, ils choisissent une victime.\n🔮 **Voyante** : chaque nuit, elle voit le rôle d\'un joueur (ses visions restent dans **Voir mon rôle**).\n🧪 **Sorcière** (6 joueurs et +) : une potion de vie, une potion de mort, une fois chacune (les deux la même nuit si elle veut).\n🏹 **Chasseur** (8 et +) : en mourant, il tire sur quelqu\'un.\n🧑‍🌾 **Villageois** : pas de pouvoir, mais un vote.'],
      ['🌙 La nuit', 'Bouton **Agir cette nuit** : les loups choisissent leur victime, la voyante regarde un rôle, puis la sorcière décide. Tout est privé, personne ne voit vos actions.'],
      ['☀️ Le jour', 'Les morts sont annoncés avec leur rôle. Débat (90 s, ou l\'hôte lance le vote plus tôt), puis vote : le plus désigné est éliminé. Égalité = personne.'],
      ['🏆 Victoire', '**Village** : tous les loups sont morts.\n**Loups** : ils sont aussi nombreux que les villageois.'],
      ['🤫 Règle d\'or', 'Les morts ne parlent plus et ne donnent aucun indice !'],
      ['🧪 Tester seul', 'Bouton **Tester avec des bots** dans la salle d\'attente : 5 bots complètent le village, débattent, votent et utilisent leurs pouvoirs.'],
    ],
  },
  histoire: {
    channel: '│・histoire',
    topic: '📖 /jeu-histoire · l\'IA raconte, vous décidez',
    color: 0x8e44ad,
    title: '📖 HISTOIRE DONT VOUS ÊTES LES HÉROS',
    intro: 'L\'IA invente une aventure dont vous êtes les héros. Elle raconte, s\'arrête, et c\'est vous qui décidez de la suite.',
    fields: (c) => [
      ['🚀 Lancer', '**/jeux** › Histoire avec les options `univers` (Fantasy, Horreur, Braquage, Zombies, Espace, Animé, Rap game), `mode` et `longueur` (5, 8 ou 12 chapitres).'],
      ['📝 Mode écrit', `Salle d'attente puis un fil dans <#${c.mini}>. À chaque chapitre, chacun écrit ce que fait son personnage (un message). Quand tout le monde a joué, ou après 90 s, l'IA continue avec vos choix. Le narrateur lit aussi chaque chapitre dans <#${c.iaVocal}>.`],
      ['🎙️ Mode 100 % vocal', `Allez tous dans <#${c.iaVocal}>, lancez **/jeux** › Histoire › 100 % vocal : l'IA raconte à voix haute et vous lui parlez directement. 25 minutes maximum, dites « on arrête » pour finir.`],
      ['💡 Conseils', '• Les idées farfelues sont permises, mais elles ont des conséquences 😏\n• Plus vous êtes précis, plus l\'histoire part dans votre sens.\n• L\'hôte peut passer au chapitre suivant avec **Suite**.'],
    ],
  },
  fans: {
    channel: '│・plus-ou-moins',
    topic: '📊 /jeu-fans · qui a le plus de fans sur Deezer ?',
    color: 0x5865f2,
    title: '📊 PLUS OU MOINS DE FANS',
    intro: 'Deux artistes, un seul chiffre connu. Le deuxième a-t-il **plus** ou **moins** de fans sur Deezer ? Enchaîne les bonnes réponses.',
    fields: (c) => [
      ['🚀 Lancer', `**/jeux** › Plus ou moins de fans avec l'option \`theme\` : Rap FR, Stars du monde ou Tout mélangé. Tu peux jouer dans <#${c.mini}>, tout le monde voit ta série.`],
      ['🔁 Déroulement', 'Tu vois le nombre de fans de l\'artiste 🅰️. Devine si 🅱️ en a plus ⬆️ ou moins ⬇️. Bonne réponse : 🅱️ devient 🅰️ et un nouvel artiste arrive. Une erreur et c\'est fini.'],
      ['⏱️ Temps', '30 secondes par réponse. Plus ta série est longue, plus les écarts deviennent serrés.'],
      ['🏆 Records', 'Ton meilleur score est gardé, et le top 5 du serveur s\'affiche à la fin de chaque partie.'],
      ['📌 Les chiffres', 'Ce sont les **vrais chiffres Deezer**, mis à jour en direct.'],
    ],
  },
  annee: {
    channel: '│・devine-l-annee',
    topic: '📅 /jeu-annee · en quelle année est sorti ce son ?',
    color: 0xfee75c,
    title: '📅 DEVINE L\'ANNÉE',
    intro: 'Un son passe : en quelle année est-il sorti ? La bonne année rapporte gros, mais le plus proche marque aussi.',
    fields: (c) => [
      ['🚀 Lancer', '**/jeux** › Devine l’année (menu : thème, difficulté, manches) ou avec les options. C\'est aussi un mode du blind test.'],
      ['🎧 Où', `Le son passe dans <#${c.dictature}>, les réponses s'écrivent dans <#${c.blindtest}> (juste l'année, ex : 2019).`],
      ['🎯 Points', '**Bonne année** : +3 (et +1 si t\'es rapide).\n**À 1 an près** : +1 🔥\n**Le plus proche** quand personne n\'a trouvé (5 ans d\'écart max) : +1'],
      ['⚠️ Règle', '**Une seule réponse par manche** : réfléchis avant d\'envoyer !'],
    ],
  },
  rebus: {
    channel: '│・rebus',
    topic: '🧩 /jeu-rebus · devine avec des emojis',
    color: 0xeb459e,
    title: '🧩 RÉBUS EN EMOJIS',
    intro: 'L\'IA transforme un titre en emojis : film, Disney, série, animé, jeu vidéo ou son de rap FR. Le premier qui trouve marque.',
    fields: (c) => [
      ['🚀 Lancer', `**/jeux** › Rébus en emojis avec les options \`theme\` et \`manches\` (3 à 20). La partie se joue dans <#${c.mini}>.`],
      ['🔁 Déroulement', 'Un rébus s\'affiche (ex : 🚢👩‍❤️‍👨🧊🌊). Écris ta réponse dans le salon. 35 secondes par rébus, un indice apparaît à la moitié (première lettre de chaque mot, et l\'artiste pour les sons).'],
      ['🎯 Points', '**+2** pour la bonne réponse · **+1** si tu trouves en moins de 10 secondes. Les fautes d\'orthographe passent.'],
      ['⏳ Préparation', 'L\'IA fabrique tous les rébus avant de commencer : ça peut prendre une trentaine de secondes.'],
    ],
  },
  imposteur: {
    channel: '│・imposteur',
    topic: '🕵️ /jeu-imposteur · trouve l\'intrus',
    color: 0x9b59b6,
    title: '🕵️ L\'IMPOSTEUR',
    intro: 'Tout le monde reçoit le même mot secret… sauf l\'imposteur, qui a un mot proche **et ne sait pas qu\'il est l\'imposteur**.',
    fields: (c) => [
      ['🚀 Lancer', `**/jeux** › L’imposteur avec l'option \`theme\` (Rap FR, Bouffe, Jeux vidéo, Animés, Foot, Lieux ou Tout), puis **Rejoindre** (3 à 10 joueurs). La partie se joue dans un fil de <#${c.mini}>.`],
      ['👁️ Ton mot', 'Il arrive en **message privé** avec sa carte (ou bouton **Voir mon mot**). Exemple : les civils ont « Pizza », l\'imposteur a « Burger ». Tout le monde reçoit la même carte : **personne ne sait qui est l\'imposteur, pas même lui**.'],
      ['🗣️ Les indices', 'Chacun son tour, écris **un indice de 1 à 5 mots** sur ton mot, sans le dire (45 s par joueur). Trop précis, l\'imposteur devine ; trop vague, on te soupçonne !'],
      ['🗳️ Le vote', 'Après le tour d\'indices, votez avec le menu. Le plus désigné est éliminé (égalité : personne, on refait un tour). On annonce s\'il était l\'imposteur, jamais le mot des civils.'],
      ['🏆 Victoire', '**Civils** : ils éliminent l\'imposteur… sauf s\'il devine leur mot dans les 25 secondes (dernière chance).\n**Imposteur** : il survit jusqu\'à ce qu\'il ne reste que deux joueurs, ou pendant 6 tours.'],
      ['🧪 Tester seul', 'Bouton **Tester avec des bots** dans la salle d\'attente : 3 bots complètent la table et jouent vraiment (indices, votes).'],
    ],
  },
  fantasy: {
    channel: '│・fantasy-rap',
    topic: '🏆 /jeu-fantasy · ton équipe de rappeurs, les vrais chiffres Deezer',
    color: 0xf1c40f,
    title: '🏆 FANTASY RAP FR',
    intro: 'Comme la Fantasy foot, mais avec des rappeurs. Choisis 5 rappeurs pour le mois : leurs **vrais chiffres Deezer** te rapportent des points chaque semaine.',
    fields: (c) => [
      ['🚀 Ton équipe', '**/jeux** › Fantasy Rap : mon équipe et choisis tes 5 rappeurs (le bot te propose les noms en tapant). Sans option : tu vois ton équipe et tes points.\nDeux joueurs ne peuvent pas avoir exactement la même équipe.'],
      ['📈 Les points', 'Chaque **lundi**, pour chaque rappeur :\n• **progression de ses fans Deezer** en % × 100 (ex : +0,35 % = +35 pts)\n• **+15 par sortie** (album, single) de la semaine, 30 max.\nLes petits artistes qui explosent rapportent souvent plus que les géants !'],
      ['🔓 Mercato', 'Une saison = un mois. Ton équipe est modifiable les **3 premiers jours du mois** (ou à tout moment si t\'en as pas encore).'],
      ['🏆 Classement', `**/jeux** › Fantasy Rap : classement à tout moment. Chaque lundi, les points et les rappeurs de la semaine sont publiés dans <#${c.mini}>. Le 1er du mois, le champion est sacré.`],
    ],
  },
  battle: {
    channel: '│・battle-tribunal',
    topic: '⚔️ Battle du tribunal · le serveur vote',
    color: 0xc8a24a,
    title: '⚔️ BATTLE DU TRIBUNAL',
    intro: 'Chaque semaine, deux sons validés par le tribunal s\'affrontent. C\'est le serveur qui vote.',
    fields: (c) => [
      ['⚖️ Lancement', `Les juges lancent la battle avec **/serveur** › Tribunal des sons › Battle et choisissent deux sons validés de la semaine. Elle est publiée dans <#${c.annonces}>.`],
      ['🎧 Le vote', 'Écoutez les deux sons (liens dans le message), puis appuyez sur **Vote A** ou **Vote B**. Un vote par personne, modifiable jusqu\'à la fin. Les deux artistes ne votent pas.'],
      ['⏱️ Durée', '24 heures. Le nombre de votes s\'affiche en direct, le détail seulement à la fin.'],
      ['🏆 Récompense', 'Le gagnant reçoit le rôle **🏆 Champion du Tribunal** jusqu\'à la battle suivante. Égalité parfaite : pas de champion.'],
      ['📜 Pour participer', `Il faut un son **validé** par le tribunal : dépose-le dans <#${c.sons}>.`],
    ],
  },
};

/** Embed d'un jeu au format de l'API Discord (utilisé par le script qui publie les règles). */
export function rulesEmbed(key, channels) {
  const rule = RULES[key];
  return {
    color: rule.color,
    title: rule.title,
    description: rule.intro,
    fields: rule.fields(channels).map(([name, value]) => ({ name, value })),
    footer: { text: 'Toutes les commandes : /aide' },
  };
}
