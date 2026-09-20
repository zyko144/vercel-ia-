// Envoi des rôles en message privé, avec une carte animée.
// Tout part en même temps (Promise.all) : personne n'attend son tour, et la partie
// n'a plus besoin de laisser 20 secondes à tout le monde pour appuyer sur un bouton.
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import path from 'node:path';
import { config } from '../config.js';

const DIR = path.resolve('assets/jeux');

/**
 * La carte d'un rôle : par URL quand le bot est en ligne (Discord la met en cache,
 * donc c'est instantané), sinon jointe au message.
 */
export function roleCard(name) {
  const file = `${name}.gif`;
  if (config.publicUrl) return { url: `${config.publicUrl}/jeux/${file}`, files: [] };
  return { url: `attachment://${file}`, files: [new AttachmentBuilder(path.join(DIR, file), { name: file })] };
}

/**
 * Envoie son rôle à chaque joueur, en privé et en parallèle.
 *
 * @param {import('discord.js').Client} client
 * @param {{ userId: string, card: string, title: string, lines: string[], color: number, footer?: string }[]} cards
 * @returns {Promise<{ delivered: string[], failed: string[] }>} qui a reçu, qui a ses MP fermés
 */
export async function sendRoleCards(client, cards) {
  const results = await Promise.all(
    cards.map(async ({ userId, card, title, lines, color, footer }) => {
      try {
        const user = await client.users.fetch(userId);
        const art = roleCard(card);
        const embed = new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(lines.filter(Boolean).join('\n'))
          .setImage(art.url)
          .setFooter({ text: footer ?? 'Garde ça pour toi 🤫' });
        await user.send({ embeds: [embed], files: art.files });
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
