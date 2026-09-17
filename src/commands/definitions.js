import {
  ApplicationCommandType,
  ChannelType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { musicCommands, MUSIC_COMMAND_NAMES } from '../music/commands.js';

const guildOnly = (builder) => builder.setContexts(InteractionContextType.Guild);
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildVoice];

// ===== IA =====
const aiCommands = [
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription("Pose une question à l'IA (réponse visible que par toi)")
    .addStringOption((o) => o.setName('question').setDescription('Ta question').setRequired(true).setMaxLength(3000))
    .addAttachmentOption((o) => o.setName('fichier').setDescription('Image, PDF ou fichier texte à analyser')),

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
    .setDescription('Explique un sujet, un cours, un concept')
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
    .addAttachmentOption((o) => o.setName('fichier').setDescription("Fichier de code ou capture d'écran de l'erreur")),

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
    .setName('resume-salon')
    .setDescription("Résume les derniers messages du salon (t'as raté quoi ?)")
    .addIntegerOption((o) => o.setName('messages').setDescription('Nombre de messages à lire (10-100)').setMinValue(10).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Lance un quiz perso sur un sujet')
    .addStringOption((o) => o.setName('sujet').setDescription('Ex : histoire, maths, jeux vidéo, Naruto...').setRequired(true).setMaxLength(200))
    .addStringOption((o) =>
      o.setName('difficulte').setDescription('Difficulté').addChoices(
        { name: 'Facile', value: 'facile' },
        { name: 'Moyen', value: 'moyen' },
        { name: 'Difficile', value: 'difficile' },
      )),

  new SlashCommandBuilder()
    .setName('rappel')
    .setDescription('Le bot te rappelle un truc plus tard (en MP)')
    .addStringOption((o) => o.setName('dans').setDescription('Ex : 10m, 2h, 1h30, 3j').setRequired(true).setMaxLength(30))
    .addStringOption((o) => o.setName('message').setDescription('De quoi je dois te rappeler').setRequired(true).setMaxLength(500)),

  new SlashCommandBuilder()
    .setName('sondage')
    .setDescription('Crée un sondage Discord (visible par tout le monde)')
    .addStringOption((o) => o.setName('question').setDescription('La question').setRequired(true).setMaxLength(300))
    .addStringOption((o) => o.setName('choix').setDescription('Les choix séparés par | (ex : Pizza | Sushi | Tacos)').setRequired(true).setMaxLength(600))
    .addIntegerOption((o) => o.setName('duree').setDescription('Durée en heures (1-168, défaut 24)').setMinValue(1).setMaxValue(168))
    .addBooleanOption((o) => o.setName('multiple').setDescription('Autoriser plusieurs réponses')),

  new SlashCommandBuilder()
    .setName('contacter-chef')
    .setDescription('Envoie un message direct au chef du bot')
    .addStringOption((o) => o.setName('message').setDescription('Ton message').setRequired(true).setMaxLength(1500)),

  new SlashCommandBuilder().setName('reset').setDescription("Efface la mémoire de l'IA (garde ton fil privé)"),

  new ContextMenuCommandBuilder().setName('Expliquer ce message').setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder().setName('Traduire en français').setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder().setName('Signaler au staff').setType(ApplicationCommandType.Message),
];

// ===== BASE / MODÉRATION =====
const moderationCommands = [
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Sans nombre : efface ta conv avec l\'IA · Avec nombre : supprime des messages (modos)')
    .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de messages à supprimer (1-100)').setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('membre').setDescription('Supprimer seulement les messages de ce membre')),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('La raison').setMaxLength(400)),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un membre du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Le membre (ou un ID)').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('La raison').setMaxLength(400))
    .addStringOption((o) =>
      o.setName('messages').setDescription('Supprimer ses messages récents').addChoices(
        { name: 'Ne rien supprimer', value: '0' },
        { name: 'Dernière heure', value: '3600' },
        { name: 'Dernières 24 h', value: '86400' },
        { name: '7 derniers jours', value: '604800' },
      )),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Débannit un utilisateur')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) => o.setName('id').setDescription("L'ID de l'utilisateur banni").setRequired(true).setMaxLength(25))
    .addStringOption((o) => o.setName('raison').setDescription('La raison').setMaxLength(400)),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Rend un membre muet pendant un temps (exclusion temporaire)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addStringOption((o) => o.setName('duree').setDescription('Ex : 10m, 1h, 1j (max 28j)').setRequired(true).setMaxLength(30))
    .addStringOption((o) => o.setName('raison').setDescription('La raison').setMaxLength(400)),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription("Enlève l'exclusion temporaire d'un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('La raison').setMaxLength(400)),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Donne un avertissement à un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addStringOption((o) => o.setName('raison').setDescription('La raison').setRequired(true).setMaxLength(400)),

  new SlashCommandBuilder()
    .setName('warns')
    .setDescription("Affiche (ou efface) les avertissements d'un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addBooleanOption((o) => o.setName('effacer').setDescription('Effacer tous ses avertissements')),

  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Règle le mode lent du salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) => o.setName('secondes').setDescription('0 pour désactiver (max 21600 = 6h)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .addChannelOption((o) => o.setName('salon').setDescription('Le salon (par défaut : ici)').addChannelTypes(...TEXT_CHANNELS)),

  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Verrouille un salon (plus personne ne peut écrire)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) => o.setName('salon').setDescription('Le salon (par défaut : ici)').addChannelTypes(...TEXT_CHANNELS))
    .addStringOption((o) => o.setName('raison').setDescription('La raison').setMaxLength(400)),

  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Déverrouille un salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) => o.setName('salon').setDescription('Le salon (par défaut : ici)').addChannelTypes(...TEXT_CHANNELS)),

  new SlashCommandBuilder()
    .setName('role')
    .setDescription("Ajoute ou retire un rôle à un membre")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addStringOption((o) => o.setName('action').setDescription('Ajouter ou retirer').setRequired(true).addChoices(
      { name: 'Ajouter', value: 'add' },
      { name: 'Retirer', value: 'remove' },
    ))
    .addUserOption((o) => o.setName('membre').setDescription('Le membre').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Le rôle').setRequired(true)),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Fait parler le bot dans un salon')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName('message').setDescription('Le message (\\n pour un retour à la ligne)').setRequired(true).setMaxLength(2000))
    .addChannelOption((o) => o.setName('salon').setDescription('Le salon (par défaut : ici)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice)),
].map(guildOnly);

// ===== INFOS & FUN =====
const utilityCommands = [
  guildOnly(new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription("Infos sur un membre")
    .addUserOption((o) => o.setName('membre').setDescription('Le membre (par défaut : toi)'))),

  guildOnly(new SlashCommandBuilder().setName('serverinfo').setDescription('Infos sur le serveur')),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Affiche la photo de profil d'un membre")
    .addUserOption((o) => o.setName('membre').setDescription('Le membre (par défaut : toi)')),

  new SlashCommandBuilder().setName('pile-ou-face').setDescription('Lance une pièce'),

  new SlashCommandBuilder()
    .setName('de')
    .setDescription('Lance un ou plusieurs dés')
    .addIntegerOption((o) => o.setName('faces').setDescription('Nombre de faces (défaut 6)').setMinValue(2).setMaxValue(1000))
    .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de dés (défaut 1)').setMinValue(1).setMaxValue(20)),

  new SlashCommandBuilder()
    .setName('choisir')
    .setDescription('Le bot choisit au hasard pour toi')
    .addStringOption((o) => o.setName('options').setDescription('Les options séparées par | (ex : Fortnite | Minecraft | Valo)').setRequired(true).setMaxLength(600)),

  new SlashCommandBuilder().setName('aide').setDescription('Tout ce que le bot sait faire'),
  new SlashCommandBuilder().setName('ping').setDescription('Vérifie si le bot est en forme'),
  new SlashCommandBuilder().setName('vocal').setDescription("Parle à l'IA vocale dans le vocal du bot : elle te répond à voix haute")
    .addBooleanOption((o) => o.setName('arreter').setDescription('Arrête la conversation en cours')),

  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Commandes réservées au chef')
    .addSubcommand((s) => s.setName('stats').setDescription('Statistiques du bot'))
    .addSubcommand((s) => s.setName('voc').setDescription('Force le bot à (re)rejoindre le vocal'))
    .addSubcommand((s) => s.setName('musique').setDescription('État des serveurs audio (musique)')),
];

export const commandDefinitions = [...aiCommands, ...moderationCommands, ...utilityCommands, ...musicCommands];

// Commandes qui marchent partout (les autres seulement dans le salon IA)
export const COMMANDS_ALLOWED_EVERYWHERE = new Set([
  ...moderationCommands.map((c) => c.name),
  ...MUSIC_COMMAND_NAMES,
  'userinfo', 'serverinfo', 'avatar', 'aide', 'ping', 'admin',
  'Expliquer ce message', 'Traduire en français', 'Signaler au staff',
]);
