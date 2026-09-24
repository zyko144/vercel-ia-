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
