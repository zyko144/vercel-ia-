// Les actions dédiées des panneaux (pas de commande d'origine) : chaque module s'inscrit dans son panneau.
import { MessageFlags } from 'discord.js';
import { addActions } from './catalog.js';
import { ANNOUNCE_FIELDS, TICKET_FIELDS, openTickets, startDraft } from '../features/tickets.js';
import { BUILD_FIELDS, startBuild } from '../features/build.js';
import { panelEmbed } from './ui.js';
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
