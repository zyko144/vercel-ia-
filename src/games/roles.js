// Envoi des rôles en message privé, avec une carte animée qui se retourne.
// Tout part en même temps (Promise.all) : personne n'attend son tour, et la partie
// n'a plus besoin de laisser 20 secondes à tout le monde pour appuyer sur un bouton.
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import path from 'node:path';
import { config } from '../config.js';

const DIR = path.resolve('assets/jeux');
// À augmenter quand les cartes sont refaites : Discord garde les images en cache
// par adresse, pendant des jours, et montrerait encore les anciennes.
const CARD_VERSION = 3;

/**
 * La carte d'un rôle : par URL quand le bot est en ligne (Discord la met en cache,
 * donc c'est instantané), sinon jointe au message.
 */
export function roleCard(name) {
  const file = `${name}.gif`;
  if (config.publicUrl) return { url: `${config.publicUrl}/jeux/${file}?v=${CARD_VERSION}`, files: [] };
  return { url: `attachment://${file}`, files: [new AttachmentBuilder(path.join(DIR, file), { name: file })] };
}

/**
 * Le message privé d'un rôle : la carte animée, puis ce qu'il faut savoir, rangé
 * en rubriques courtes (objectif, pouvoir, comment jouer) plutôt qu'en un bloc.
 *
 * @param {{ card: string, title: string, description?: string, lines?: string[], fields?: [string, string][],
 *           color: number, author?: string, footer?: string, link?: string }} role
 */
export function roleMessage({ card, title, description, lines, fields = [], color, author, footer, link }) {
  const art = roleCard(card);
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setImage(art.url)
    .setFooter({ text: footer ?? 'Garde ça pour toi 🤫' })
    .setTimestamp();
  if (author) embed.setAuthor({ name: author });
  const text = description ?? (lines ?? []).filter(Boolean).join('\n');
  if (text) embed.setDescription(text);
  const shown = fields.filter(([name, value]) => name && value);
  if (shown.length) embed.addFields(shown.map(([name, value]) => ({ name, value: String(value).slice(0, 1024) })));
  const components = link
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel('Aller à la partie').setEmoji('🎲'))]
    : [];
  return { embeds: [embed], files: art.files, components };
}

/**
 * Envoie son rôle à chaque joueur, en privé et en parallèle.
 *
 * @param {import('discord.js').Client} client
 * @param {(Parameters<typeof roleMessage>[0] & { userId: string })[]} cards
 * @returns {Promise<{ delivered: string[], failed: string[] }>} qui a reçu, qui a ses MP fermés
 */
export async function sendRoleCards(client, cards) {
  const results = await Promise.all(
    cards.map(async ({ userId, ...role }) => {
      try {
        const user = await client.users.fetch(userId);
        await user.send(roleMessage(role));
        return { userId, ok: true };
      } catch {
        // MP fermés : le joueur passera par le bouton « Voir mon rôle ».
        return { userId, ok: false };
      }
    }),
  );
  return {
    delivered: results.filter((r) => r.ok).map((r) => r.userId),
    failed: results.filter((r) => !r.ok).map((r) => r.userId),
  };
}

/** Phrase à afficher dans le fil quand certains joueurs n'ont pas pu recevoir leur rôle. */
export function missingDmNotice(failed, buttonLabel = 'Voir mon rôle') {
  if (!failed.length) return null;
  return `📪 ${failed.map((id) => `<@${id}>`).join(', ')} : tes MP sont fermés, utilise **${buttonLabel}** ci-dessous (Paramètres › Confidentialité › autoriser les MP du serveur).`;
}
