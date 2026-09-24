import {
  ApplicationCommandType,
  ChannelType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { musicCommands, MUSIC_COMMAND_NAMES } from '../music/commands.js';
import { FAN_THEMES } from '../games/fans.js';
import { BEAT_STYLES } from '../games/freestyle.js';
import { STORY_LENGTHS, STORY_THEMES } from '../games/histoire.js';
import { IMPOSTOR_THEMES } from '../games/imposteur.js';
import { REBUS_THEMES } from '../games/rebus.js';

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
    .setName('jeu-quiz')
    .setDescription('🧠 Quiz IA : une question à 4 choix sur le sujet de ton choix')
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

  new SlashCommandBuilder().setName('jeu-pile-ou-face').setDescription('🪙 Pile ou face'),

  new SlashCommandBuilder()
    .setName('jeu-des')
    .setDescription('🎲 Lance un ou plusieurs dés')
    .addIntegerOption((o) => o.setName('faces').setDescription('Nombre de faces (défaut 6)').setMinValue(2).setMaxValue(1000))
    .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de dés (défaut 1)').setMinValue(1).setMaxValue(20)),

  new SlashCommandBuilder()
    .setName('choisir')
    .setDescription('Le bot choisit au hasard pour toi')
    .addStringOption((o) => o.setName('options').setDescription('Les options séparées par | (ex : Fortnite | Minecraft | Valo)').setRequired(true).setMaxLength(600)),

  guildOnly(new SlashCommandBuilder().setName('tribunal').setDescription('⚖️ Tribunal des sons (réservé aux juges)')
    .setDefaultMemberPermissions(0)
    .addStringOption((o) => o.setName('action').setDescription('Ce que tu veux faire').addChoices(
      { name: '📜 Publier le règlement dans le salon des sons', value: 'reglement' },
      { name: '📊 État de la semaine', value: 'semaine' },
      { name: '🏛️ Bilan animé (GIF) dans les annonces', value: 'bilan' },
      { name: '⚔️ Battle : deux sons validés, le serveur vote 24 h', value: 'battle' },
      { name: '⚖️ Clôturer la semaine (distribue les Bouffons)', value: 'cloturer' },
    ))),

  new SlashCommandBuilder().setName('aide').setDescription('Tout ce que le bot sait faire'),
  new SlashCommandBuilder().setName('ping').setDescription('Vérifie si le bot est en forme'),
  new SlashCommandBuilder().setName('vocal').setDescription("Parle à l'IA vocale dans le vocal du bot : elle te répond à voix haute")
    .addBooleanOption((o) => o.setName('arreter').setDescription('Arrête la conversation en cours')),

  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Commandes réservées au chef')
    .addSubcommand((s) => s.setName('stats').setDescription('Statistiques du bot'))
    .addSubcommand((s) => s.setName('voc').setDescription('Force le bot à (re)rejoindre le vocal'))
    .addSubcommand((s) => s.setName('musique').setDescription('État des serveurs audio (musique)'))
    .addSubcommand((s) => s.setName('dashboard').setDescription('Lien de connexion au tableau de bord de l’IA (usage unique, 10 min)')),
];

// ===== JEUX =====
const choicesOf = (map) => Object.entries(map).map(([value, item]) => ({ name: `${item.emoji} ${item.label}`, value }));

const gameCommands = [
  guildOnly(new SlashCommandBuilder().setName('jeu-freestyle').setDescription("🎤 Battle de freestyle sur une instru : l'IA écoute et désigne le gagnant")
    .addUserOption((o) => o.setName('adversaire').setDescription('Qui tu défies').setRequired(true))
    .addStringOption((o) => o.setName('instru').setDescription("Style de l'instru").addChoices(...choicesOf(BEAT_STYLES)))
    .addIntegerOption((o) => o.setName('duree').setDescription('Secondes par rappeur').addChoices(
      { name: '30 s', value: 30 }, { name: '45 s', value: 45 }, { name: '60 s', value: 60 },
    ))),
  guildOnly(new SlashCommandBuilder().setName('jeu-loupgarou').setDescription('🐺 Loup-garou avec le bot comme meneur (et un narrateur à voix haute)')),
  guildOnly(new SlashCommandBuilder().setName('jeu-histoire').setDescription("📖 Histoire dont vous êtes les héros : l'IA raconte, vous décidez")
    .addStringOption((o) => o.setName('univers').setDescription("Univers de l'histoire").addChoices(...choicesOf(STORY_THEMES)))
    .addStringOption((o) => o.setName('mode').setDescription("À l'écrit ou 100 % à l'oral").addChoices(
      { name: "📝 À l'écrit (+ narration à voix haute)", value: 'texte' },
      { name: "🎙️ 100 % vocal (vous parlez à l'IA)", value: 'vocal' },
    ))
    .addStringOption((o) => o.setName('longueur').setDescription('Nombre de chapitres (mode écrit)').addChoices(
      ...Object.entries(STORY_LENGTHS).map(([value, n]) => ({ name: `${value.charAt(0).toUpperCase()}${value.slice(1)} (${n} chapitres)`, value })),
    ))),
  guildOnly(new SlashCommandBuilder().setName('jeu-fans').setDescription('📊 Plus ou moins de fans sur Deezer ? Enchaîne les bonnes réponses')
    .addStringOption((o) => o.setName('theme').setDescription('Quels artistes').addChoices(...choicesOf(FAN_THEMES)))),
  guildOnly(new SlashCommandBuilder().setName('jeu-rebus').setDescription("🧩 Rébus en emojis : devine le film, l'animé ou le son")
    .addStringOption((o) => o.setName('theme').setDescription('Thème').addChoices(...choicesOf(REBUS_THEMES)))
    .addIntegerOption((o) => o.setName('manches').setDescription('Nombre de rébus (3-20)').setMinValue(3).setMaxValue(20))),
  guildOnly(new SlashCommandBuilder().setName('jeu-imposteur').setDescription("🕵️ L'imposteur : un mot secret, un intrus qui ne le sait pas, un vote")
    .addStringOption((o) => o.setName('theme').setDescription('Thème des mots').addChoices(...choicesOf(IMPOSTOR_THEMES)))),
  guildOnly(new SlashCommandBuilder().setName('jeu-fantasy').setDescription('🏆 Fantasy Rap FR : ton équipe de 5 rappeurs, points avec les vrais chiffres Deezer')
    .addSubcommand((s) => {
      s.setName('equipe').setDescription('Choisis tes 5 rappeurs (sans option : voir ton équipe)');
      for (let i = 1; i <= 5; i++) s.addStringOption((o) => o.setName(`rappeur${i}`).setDescription(`Rappeur n°${i}`).setAutocomplete(true).setMaxLength(100));
      return s;
    })
    .addSubcommand((s) => s.setName('classement').setDescription('Classement de la saison'))),
];
export const GAME_COMMAND_NAMES = new Set(gameCommands.map((c) => c.name));

export const commandDefinitions = [...aiCommands, ...moderationCommands, ...utilityCommands, ...musicCommands, ...gameCommands];

// Commandes qui marchent partout (les autres seulement dans le salon IA)
export const COMMANDS_ALLOWED_EVERYWHERE = new Set([
  ...moderationCommands.map((c) => c.name),
  ...MUSIC_COMMAND_NAMES,
  ...GAME_COMMAND_NAMES,
  'userinfo', 'serverinfo', 'avatar', 'aide', 'ping', 'admin', 'vocal', 'tribunal',
  'Expliquer ce message', 'Traduire en français', 'Signaler au staff',
]);
