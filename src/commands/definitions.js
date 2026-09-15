import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription("Pose une question à l'IA (recherche web + sources)")
    .addStringOption((o) => o.setName('question').setDescription('Ta question').setRequired(true).setMaxLength(3000))
    .addAttachmentOption((o) => o.setName('fichier').setDescription('Image, PDF ou fichier texte à analyser'))
    .addBooleanOption((o) => o.setName('prive').setDescription('Réponse visible que par toi')),

  new SlashCommandBuilder()
    .setName('image')
    .setDescription('Génère une image avec Nano Banana (Gemini)')
    .addStringOption((o) => o.setName('prompt').setDescription("Décris l'image (plus c'est précis, mieux c'est)").setRequired(true).setMaxLength(2000))
    .addStringOption((o) =>
      o.setName('format').setDescription("Format de l'image").addChoices(
        { name: 'Carré (1:1)', value: '1:1' },
        { name: 'Paysage (16:9)', value: '16:9' },
        { name: 'Portrait / story (9:16)', value: '9:16' },
        { name: 'Photo paysage (4:3)', value: '4:3' },
        { name: 'Photo portrait (3:4)', value: '3:4' },
        { name: 'Bannière large (21:9)', value: '21:9' },
      ))
    .addBooleanOption((o) => o.setName('pro').setDescription('Qualité max (Nano Banana Pro, réservé au chef)')),

  new SlashCommandBuilder()
    .setName('modifier-image')
    .setDescription('Modifie une image existante avec une consigne')
    .addAttachmentOption((o) => o.setName('image').setDescription("L'image à modifier").setRequired(true))
    .addStringOption((o) => o.setName('consigne').setDescription('Ex : "mets un fond de plage", "style manga"').setRequired(true).setMaxLength(2000))
    .addAttachmentOption((o) => o.setName('image2').setDescription('Deuxième image à combiner (optionnel)')),

  new SlashCommandBuilder()
    .setName('explique')
    .setDescription("Explique un sujet, un cours, un concept")
    .addStringOption((o) => o.setName('sujet').setDescription('Ce que tu veux comprendre').setRequired(true).setMaxLength(2000))
    .addStringOption((o) =>
      o.setName('niveau').setDescription("Niveau d'explication").addChoices(
        { name: 'Ultra simple', value: 'simple' },
        { name: 'Normal', value: 'normal' },
        { name: 'Expert / détaillé', value: 'expert' },
      )),

  new SlashCommandBuilder()
    .setName('code')
    .setDescription('Aide en programmation : écrire, corriger, expliquer du code')
    .addStringOption((o) => o.setName('demande').setDescription('Ce que tu veux (tu peux coller ton code)').setRequired(true).setMaxLength(4000))
    .addStringOption((o) => o.setName('langage').setDescription('Ex : JavaScript, Python, Lua...'))
    .addAttachmentOption((o) => o.setName('fichier').setDescription('Fichier de code ou capture d\'écran de l\'erreur')),

  new SlashCommandBuilder()
    .setName('corriger')
    .setDescription("Corrige l'orthographe et la grammaire d'un texte")
    .addStringOption((o) => o.setName('texte').setDescription('Le texte à corriger').setRequired(true).setMaxLength(4000)),

  new SlashCommandBuilder()
    .setName('traduire')
    .setDescription('Traduit un texte')
    .addStringOption((o) => o.setName('texte').setDescription('Le texte à traduire').setRequired(true).setMaxLength(4000))
    .addStringOption((o) => o.setName('langue').setDescription('Langue voulue (par défaut : français, ou anglais si déjà en français)').setMaxLength(50)),

  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Résume les derniers messages du salon (t\'as raté quoi ?)')
    .addIntegerOption((o) => o.setName('messages').setDescription('Nombre de messages à lire (10-100)').setMinValue(10).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Lance une question de quiz sur un sujet')
    .addStringOption((o) => o.setName('sujet').setDescription('Ex : histoire, maths, jeux vidéo, Naruto...').setRequired(true).setMaxLength(200))
    .addStringOption((o) =>
      o.setName('difficulte').setDescription('Difficulté').addChoices(
        { name: 'Facile', value: 'facile' },
        { name: 'Moyen', value: 'moyen' },
        { name: 'Difficile', value: 'difficile' },
      )),

  new SlashCommandBuilder()
    .setName('rappel')
    .setDescription('Le bot te rappelle un truc plus tard')
    .addStringOption((o) => o.setName('dans').setDescription('Ex : 10m, 2h, 1h30, 3j').setRequired(true).setMaxLength(30))
    .addStringOption((o) => o.setName('message').setDescription('De quoi je dois te rappeler').setRequired(true).setMaxLength(500)),

  new SlashCommandBuilder()
    .setName('sondage')
    .setDescription('Crée un sondage Discord')
    .addStringOption((o) => o.setName('question').setDescription('La question').setRequired(true).setMaxLength(300))
    .addStringOption((o) => o.setName('choix').setDescription('Les choix séparés par | (ex : Pizza | Sushi | Tacos)').setRequired(true).setMaxLength(600))
    .addIntegerOption((o) => o.setName('duree').setDescription('Durée en heures (1-168, défaut 24)').setMinValue(1).setMaxValue(168))
    .addBooleanOption((o) => o.setName('multiple').setDescription('Autoriser plusieurs réponses')),

  new SlashCommandBuilder()
    .setName('contacter-chef')
    .setDescription('Envoie un message direct au chef du bot')
    .addStringOption((o) => o.setName('message').setDescription('Ton message').setRequired(true).setMaxLength(1500)),

  new SlashCommandBuilder().setName('reset').setDescription('Efface la mémoire de conversation du bot dans ce salon'),
  new SlashCommandBuilder().setName('aide').setDescription('Tout ce que le bot sait faire'),
  new SlashCommandBuilder().setName('ping').setDescription('Vérifie si le bot est en forme'),

  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Commandes réservées au chef')
    .addSubcommand((s) => s.setName('stats').setDescription('Statistiques du bot'))
    .addSubcommand((s) => s.setName('voc').setDescription('Force le bot à (re)rejoindre le vocal bureau')),

  new ContextMenuCommandBuilder().setName('Expliquer ce message').setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder().setName('Traduire en français').setType(ApplicationCommandType.Message),
];
