// Les actions dédiées des panneaux (pas de commande d'origine) : chaque module s'inscrit dans son panneau.
import { MessageFlags } from 'discord.js';
import { addActions } from './catalog.js';
import { ANNOUNCE_FIELDS, TICKET_FIELDS, openTickets, startDraft } from '../features/tickets.js';
import { BUILD_FIELDS, startBuild } from '../features/build.js';
import { panelEmbed } from './ui.js';
import '../features/premiumPanel.js'; // groupe « Premium » de /serveur
import { ChannelType, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { field as f } from './ui.js';
import { addNote, casierEmbed, verificationPanel } from '../features/security.js';
import { PRESTIGE_LEVEL, claimDaily, compareEmbed, leaderboardEmbed, prestige, profileCard, shopMessage, statsEmbed } from '../features/levels.js';
import { addFaq, faqEntries, memoryMessage, ratePunchline, removeFaq } from '../features/aiExtras.js';
import { startActionVerite, startPendu, startPetitBac, startQuizServeur, startUndercover } from '../games/soirees.js';
import { backupsOf, createBackup, restoreConfirm, welcomeCard } from '../features/community.js';
import { PANELS } from './catalog.js';
import './games.js'; // groupes Duels, Taverne, Défis de /jeux
import './more.js'; // IA, urgence, communauté, outils du staff, soirée vocale
import { TREASURY_ACTIONS, questProgress } from '../features/treasury.js';
import { installBotChannels, installEmbed } from '../features/botChannels.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };

// ===================== /pannel =====================
addActions('pannel', 'Créer', [
  { id: 'ticket', label: 'Panneau de tickets', emoji: '🎫', desc: 'Titre, message, image, aperçu, puis publication', fields: TICKET_FIELDS(), run: (client, i, v) => startDraft(i, v, 'ticket') },
  { id: 'annonce', label: 'Annonce avec aperçu', emoji: '📣', desc: 'Un bel embed avec image, relu avant d’être publié', fields: ANNOUNCE_FIELDS(), run: (client, i, v) => startDraft(i, v, 'annonce') },
  { id: 'build', label: 'Construire des salons', emoji: '🏗️', desc: 'Thème, nombre de salons, catégorie : le bot crée tout', fields: BUILD_FIELDS(), run: (client, i, v) => startBuild(i, v) },
  {
    id: 'tickets-ouverts', label: 'Tickets ouverts', emoji: '📋', desc: 'La liste des tickets en cours',
    run: async (client, interaction) => {
      const list = (await openTickets(interaction.guildId)).filter((t) => interaction.guild.channels.cache.has(t.channelId));
      const { embed, files } = panelEmbed(interaction.guildId, PANELS.pannel, {
        title: `📋 ${list.length} ticket(s) ouvert(s)`,
        description: list.length
          ? list.map((t) => `🎫 <#${t.channelId}> · n°${t.number} · <@${t.userId}> · <t:${Math.round(t.openedAt / 1000)}:R>${t.claimedBy ? ` · 🙋 <@${t.claimedBy}>` : ''}`).join('\n').slice(0, 4000)
          : 'Aucun ticket ouvert. Crée un panneau avec **Panneau de tickets** pour que les membres puissent en ouvrir.',
        image: false, thumbnail: true,
      });
      return interaction.reply({ embeds: [embed], files, ...PRIVATE });
    },
  },
]);

// ===================== /sanction : casier et notes =====================
addActions('sanction', 'Suivi des membres', [
  {
    id: 'casier', label: 'Casier d’un membre', emoji: '🗂️', desc: 'Sanctions, notes du staff, état', fields: [f.user('membre', 'Membre', { req: true })],
    run: async (client, interaction, v) => interaction.reply({ embeds: [await casierEmbed(interaction.guild, v.membre.user)], ...PRIVATE }),
  },
  {
    id: 'note', label: 'Ajouter une note', emoji: '🗒️', desc: 'Visible seulement par le staff, dans le casier', fields: [f.user('membre', 'Membre', { req: true }), f.para('note', 'Note', { req: true, max: 500 })],
    run: async (client, interaction, v) => {
      await addNote(interaction.guildId, v.membre.user.id, interaction.user.id, v.note);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription(`🗒️ Note ajoutée au casier de ${v.membre.user}.`)], ...PRIVATE });
    },
  },
]);

// ===================== /pannel : vérification =====================
addActions('pannel', 'Créer', [
  {
    id: 'verification', label: 'Panneau de vérification', emoji: '🛡️', desc: 'Bouton « Je suis humain » + petit calcul', fields: [f.channel('salon', 'Salon où publier', { req: true, types: [ChannelType.GuildText] })],
    run: async (client, interaction, v) => {
      if (!v.salon.permissionsFor(interaction.guild.members.me)?.has([P.SendMessages, P.EmbedLinks])) return interaction.reply({ content: `❌ Je ne peux pas écrire dans ${v.salon}.`, ...PRIVATE });
      await v.salon.send(verificationPanel(interaction.guild));
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setDescription(`✅ Panneau publié dans ${v.salon}.
-# Règle le rôle donné dans le tableau de bord › Mon serveur › Sécurité (ou il n’y aura rien à gagner).`)], ...PRIVATE });
    },
  },
]);

// ===================== /serveur : niveaux, récompense du jour, boutique =====================
addActions('serveur', 'Niveaux et boutique', [
  {
    id: 'profil', label: 'Carte de profil', emoji: '🪪', desc: 'Niveau, rang, XP, pièces d’or, badges', fields: [f.user('membre', 'Membre (vide = toi)')],
    run: async (client, interaction, v) => {
      await interaction.deferReply(PRIVATE);
      const card = await profileCard(interaction.guild, v.membre?.user ?? interaction.user);
      return interaction.editReply({ files: [card] });
    },
  },
  {
    id: 'classement', label: 'Classement des niveaux', emoji: '📈', desc: 'De toujours ou du mois (remis à zéro le 1er)',
    fields: [f.choice('periode', 'Quel classement ?', [{ label: 'De toujours', value: 'tout' }, { label: 'Du mois', value: 'mois' }])],
    run: async (client, interaction, v) => interaction.reply({ embeds: [await leaderboardEmbed(interaction.guild, { month: v.periode === 'mois' })], ...PRIVATE }),
  },
  {
    id: 'stats', label: 'Mes statistiques', emoji: '📜', desc: 'Titre, progression, activité, trésor, badges', fields: [f.user('membre', 'Membre (vide = toi)')],
    run: async (client, interaction, v) => interaction.reply({ embeds: [await statsEmbed(interaction.guild, v.membre?.user ?? interaction.user)], ...PRIVATE }),
  },
  {
    id: 'comparer', label: 'Comparer deux profils', emoji: '⚔️', desc: 'Niveau, or, messages, vocal côte à côte', fields: [f.user('membre', 'Contre qui ?', { req: true }), f.bool('public', 'Le montrer au salon ?')],
    run: async (client, interaction, v) => interaction.reply({ embeds: [await compareEmbed(interaction.guild, interaction.user, v.membre.user ?? v.membre)], ...(v.public ? {} : PRIVATE) }),
  },
  {
    id: 'prestige', label: 'Prestige', emoji: '⭐', desc: `Au niveau ${PRESTIGE_LEVEL} : repartir de zéro avec une étoile et +10 % d’XP`,
    fields: [f.bool('confirmer', 'Repartir du niveau 0 ?', { req: true })],
    run: async (client, interaction, v) => {
      if (!v.confirmer) return interaction.reply({ content: 'Rien n’a changé.', ...PRIVATE });
      const r = await prestige(interaction.guildId, interaction.user.id);
      if (!r.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffb020).setDescription(`⭐ Le prestige s’ouvre au **niveau ${PRESTIGE_LEVEL}** (tu es niveau ${r.level}).`)], ...PRIVATE });
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf2c14e).setTitle(`⭐ Prestige ${r.prestige} !`).setDescription(`${interaction.user} repart du niveau 0 avec **+🪙 ${r.gold.toLocaleString('fr-FR')}** et **+${r.bonus} % d’XP** pour toujours. L’étoile brille sur sa carte.`)] });
    },
  },
  {
    id: 'daily', label: 'Récompense du jour', emoji: '🎁', desc: 'Des pièces d’or chaque jour, plus si tu enchaînes',
    run: async (client, interaction) => {
      const r = await claimDaily(interaction.guildId, interaction.user.id, interaction.member);
      if (r.ok) await questProgress(interaction.guildId, interaction.user.id, 'daily');
      const embed = new EmbedBuilder().setColor(r.ok ? 0x3dff9a : 0xffb020).setDescription(r.ok
        ? `🎁 **+🪙 ${r.amount.toLocaleString('fr-FR')} pièces d’or** · série de **${r.streak} jour(s)** 🔥${r.booster ? ' · 💎 bonus booster +50 %' : ''}
Bourse : 🪙 ${r.balance.toLocaleString('fr-FR')}`
        : '⏳ Déjà prise aujourd’hui : reviens après minuit pour garder ta série.');
      return interaction.reply({ embeds: [embed], ...PRIVATE });
    },
  },
  { id: 'boutique', label: 'Boutique du capitaine', emoji: '🏴‍☠️', desc: 'Immunité, XP ×2, coffres, rôle perso…', run: async (client, interaction) => interaction.reply({ ...(await shopMessage(interaction.guild, interaction.user.id)), ...PRIVATE }) },
]);

addActions('serveur', 'Trésor du navire', TREASURY_ACTIONS);

// ===================== IA : mémoire, punchline, FAQ =====================
addActions('ia', 'Demander à l’IA', [
  { id: 'memoire', label: 'Ce que l’IA sait de moi', emoji: '🧠', desc: 'Voir ou effacer ses souvenirs', run: async (client, interaction) => interaction.reply({ ...(await memoryMessage(interaction.user)), ...PRIVATE }) },
]);
addActions('jeux', 'Jeux de groupe', [
  {
    id: 'punchline', label: 'Noter une punchline', emoji: '🎤', desc: 'Le jury IA note sur 10', fields: [f.para('punchline', 'Ta punchline', { req: true, max: 800 }), f.bool('public', 'La montrer à tout le salon ?')],
    run: async (client, interaction, v) => {
      await interaction.deferReply(v.public ? {} : PRIVATE);
      const embed = await ratePunchline(v.punchline, interaction.member?.displayName ?? interaction.user.username);
      return interaction.editReply({ embeds: [embed] });
    },
  },
]);
addActions('pannel', 'FAQ du salon d’aide', [
  {
    id: 'faq-ajouter', label: 'Ajouter à la FAQ', emoji: '📚', desc: 'L’IA répondra toute seule à cette question', perm: P.ManageMessages,
    fields: [f.text('question', 'Question', { req: true, max: 300 }), f.para('reponse', 'Réponse', { req: true, max: 1500 })],
    run: async (client, interaction, v) => {
      const n = await addFaq(interaction.guildId, v.question, v.reponse);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5ff0ff).setDescription(`📚 Ajouté à la FAQ (${n} questions). Règle le salon d’aide dans le tableau de bord › Mon serveur › IA.`)], ...PRIVATE });
    },
  },
  {
    id: 'faq-voir', label: 'Voir / retirer de la FAQ', emoji: '🗂️', perm: P.ManageMessages, fields: [f.int('retirer', 'Numéro à retirer (vide = juste voir)', { min: 1, top: 60 })],
    run: async (client, interaction, v) => {
      if (v.retirer) await removeFaq(interaction.guildId, v.retirer - 1);
      const list = await faqEntries(interaction.guildId);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5ff0ff).setTitle(`📚 FAQ (${list.length})`)
        .setDescription(list.length ? list.map((e, i) => `**${i + 1}.** ${e.q}
-# ${e.a.slice(0, 120)}`).join('\n').slice(0, 4000) : 'Vide : ajoute des questions, ou réponds aux membres dans le salon d’aide (en « répondre ») pour que l’IA apprenne.')], ...PRIVATE });
    },
  },
]);

// ===================== /jeux : jeux de soirée =====================
addActions('jeux', 'Jeux de groupe', [
  { id: 'undercover', label: 'Undercover', emoji: '🕶️', desc: 'Undercovers + Mister White, 4 joueurs min', run: (client, interaction) => startUndercover(interaction) },
  { id: 'petitbac', label: 'Petit Bac', emoji: '📝', desc: 'Une lettre, 5 catégories, l’IA vérifie', run: (client, interaction) => startPetitBac(interaction) },
  { id: 'actionverite', label: 'Action ou vérité', emoji: '🎲', desc: 'Défis gentils, les autres valident', run: (client, interaction) => startActionVerite(interaction) },
  { id: 'quizserveur', label: 'Quiz du serveur', emoji: '🧭', desc: 'Des questions sur le serveur et ses membres', run: (client, interaction) => startQuizServeur(interaction) },
]);
addActions('jeux', 'Jeux musicaux', [
  { id: 'pendu', label: 'Pendu musical', emoji: '🎵', desc: 'Le titre lettre par lettre, l’extrait en indice', run: (client, interaction) => startPendu(interaction) },
]);

// ===================== /pannel : bienvenue et sauvegardes =====================
addActions('pannel', 'Serveur', [
  {
    id: 'salons-bot', label: 'Installer les salons du bot', emoji: '🏴‍☠️', desc: 'Niveaux, trésor, jeux, annonces, journal : chacun son salon', perm: P.ManageChannels,
    fields: [f.bool('remplacer', 'Remplacer les salons déjà réglés ?')],
    run: async (client, interaction, v) => {
      await interaction.deferReply(PRIVATE);
      const r = await installBotChannels(interaction.guild, { replace: !!v.remplacer });
      return interaction.editReply({ embeds: [installEmbed(r)] });
    },
  },
  {
    id: 'bienvenue-test', label: 'Voir ma carte de bienvenue', emoji: '👋', desc: 'Aperçu de ce que reçoivent les nouveaux',
    run: async (client, interaction) => {
      await interaction.deferReply(PRIVATE);
      return interaction.editReply({ content: 'Voici la carte que reçoit un nouveau membre (réglages : tableau de bord › Mon serveur › Bienvenue).', files: [await welcomeCard(interaction.member)] });
    },
  },
  {
    id: 'sauvegarder', label: 'Sauvegarder le serveur', emoji: '💾', desc: 'Rôles, salons et permissions (3 gardées)', perm: P.Administrator,
    run: async (client, interaction) => {
      await interaction.deferReply(PRIVATE);
      const b = await createBackup(interaction.guild, interaction.user.id);
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setTitle('💾 Sauvegarde faite').setDescription(`${b.roles} rôles et ${b.channels} salons (avec leurs permissions). En cas de raid ou d’erreur : **Restaurer une sauvegarde**.`)] });
    },
  },
  {
    id: 'restaurer', label: 'Restaurer une sauvegarde', emoji: '♻️', desc: 'Recrée ce qui manque, ne supprime rien', perm: P.Administrator,
    fields: async (interaction) => {
      const list = await backupsOf(interaction.guildId);
      return [f.choice('sauvegarde', 'Sauvegarde', list.length ? list.map((b) => ({ label: `${new Date(b.at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · ${b.roles} rôles, ${b.channels} salons`, value: b.id })) : [{ label: 'Aucune sauvegarde', value: 'aucune' }], { req: true })];
    },
    run: async (client, interaction, v) => {
      const entry = (await backupsOf(interaction.guildId)).find((b) => b.id === v.sauvegarde);
      if (!entry) return interaction.reply({ content: '❌ Aucune sauvegarde : fais d’abord **Sauvegarder le serveur**.', ...PRIVATE });
      return interaction.reply({ ...restoreConfirm(entry), ...PRIVATE });
    },
  },
]);
