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
import { claimDaily, leaderboardEmbed, profileCard, shopMessage } from '../features/levels.js';
import { addFaq, faqEntries, memoryMessage, ratePunchline, removeFaq } from '../features/aiExtras.js';
import { PANELS } from './catalog.js';

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
    id: 'profil', label: 'Carte de profil', emoji: '🪪', desc: 'Niveau, rang, XP, jetons, badges', fields: [f.user('membre', 'Membre (vide = toi)')],
    run: async (client, interaction, v) => {
      await interaction.deferReply(PRIVATE);
      const card = await profileCard(interaction.guild, v.membre?.user ?? interaction.user);
      return interaction.editReply({ files: [card] });
    },
  },
  { id: 'classement', label: 'Classement des niveaux', emoji: '📈', run: async (client, interaction) => interaction.reply({ embeds: [await leaderboardEmbed(interaction.guild)], ...PRIVATE }) },
  {
    id: 'daily', label: 'Récompense du jour', emoji: '🎁', desc: 'Des jetons chaque jour, plus si tu enchaînes',
    run: async (client, interaction) => {
      const r = await claimDaily(interaction.guildId, interaction.user.id);
      const embed = new EmbedBuilder().setColor(r.ok ? 0x3dff9a : 0xffb020).setDescription(r.ok
        ? `🎁 **+${r.amount.toLocaleString('fr-FR')} jetons** · série de **${r.streak} jour(s)** 🔥
Solde : 🪙 ${r.balance.toLocaleString('fr-FR')}`
        : '⏳ Déjà prise aujourd’hui : reviens après minuit pour garder ta série.');
      return interaction.reply({ embeds: [embed], ...PRIVATE });
    },
  },
  { id: 'boutique', label: 'Boutique', emoji: '🛒', desc: 'Rôles à acheter, rôle personnalisé', run: async (client, interaction) => interaction.reply({ ...(await shopMessage(interaction.guild, interaction.user.id)), ...PRIVATE }) },
]);

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
