// Côté Discord de l'arcade : le bouton « Ouvrir l'arcade » lance l'Activité dans le salon.
// Si l'Activité n'est pas activée pour le bot, on donne un lien personnel vers la même salle.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { art } from '../panels/ui.js';
import { arcadeLink } from './server.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const nameOf = (interaction) => interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;

export const arcadeRow = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('arc:open').setLabel('Ouvrir l’arcade').setEmoji('🕹️').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('arc:link').setLabel('Dans le navigateur').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
);

function linkReply(interaction, intro) {
  const url = arcadeLink({ id: interaction.user.id, name: nameOf(interaction) }, interaction.channelId, interaction.guildId);
  return interaction.reply({
    content: `${intro}\nCe lien est **personnel** (il te connecte à ton compte) : ne le partage pas. Il reste valable 12 h.`,
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel('Ouvrir l’arcade').setEmoji('🕹️'))],
    ...PRIVATE,
  });
}

async function launch(interaction) {
  try {
    return await interaction.launchActivity();
  } catch (err) {
    console.warn('[arcade] Activité indisponible :', err.message);
    return linkReply(interaction, '🕹️ L’arcade ne peut pas encore s’ouvrir dans Discord (Activité à activer dans le portail) : voici ton lien.');
  }
}

/** Depuis /jeux : annonce l'arcade dans le salon (pour que les autres rejoignent) et l'ouvre. */
export async function openArcade(interaction) {
  await interaction.channel?.send({
    embeds: [new EmbedBuilder().setColor(0xc9a978).setTitle('🕹️ L’arcade du navire est ouverte !')
      .setDescription(`${interaction.user} lance l’arcade dans ce salon : **Dessine et devine**, **Morpion**, **Puissance 4**… Tout le monde joue ensemble, les victoires rapportent des pièces d’or.`)
      .setImage(art('panneaux', 'jeux'))],
    components: [arcadeRow()],
  }).catch(() => {});
  return launch(interaction);
}

export const isArcadeComponent = (interaction) => /^arc:/.test(interaction.customId ?? '');
export async function handleArcadeComponent(client, interaction) {
  const action = interaction.customId.split(':')[1];
  if (action === 'open') return launch(interaction);
  if (action === 'link') return linkReply(interaction, '🌐 Ton arcade, dans le navigateur :');
  return undefined;
}
