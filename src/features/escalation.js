import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { ESCALATION_TAG } from '../ai/persona.js';
import { truncate } from '../utils/discord.js';

const lastPing = new Map();

export function detectEscalation(text) {
  if (!text.includes(ESCALATION_TAG)) return { escalate: false, text };
  return { escalate: true, text: text.replaceAll(ESCALATION_TAG, '').trim() };
}

/** Envoie un MP au chef. Renvoie true si le MP est parti. */
export async function dmOwner(client, { title, description, fields = [], link }) {
  try {
    const owner = await client.users.fetch(config.ownerId);
    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle(title)
      .setDescription(truncate(description || '(pas de texte)', 3500))
      .addFields(fields.map((f) => ({ ...f, value: truncate(f.value || '—', 1000) })))
      .setTimestamp();
    await owner.send({ content: link ? `➡️ ${link}` : undefined, embeds: [embed] });
    return true;
  } catch (err) {
    console.warn('[escalation] MP au chef impossible :', err.message);
    return false;
  }
}

export function whereLabel(guild, channel) {
  return guild ? `${guild.name} · ${channel ?? 'salon inconnu'}` : 'En MP avec le bot';
}

/**
 * Le bot ne sait pas répondre : prévient le chef (MP + ping) et prépare le message pour le membre.
 * @returns {{ suffix: string, allowedUsers: string[] }}
 */
export async function escalateToOwner({ client, user, guild, channel, question, answer, link }) {
  const ownerId = config.ownerId;
  if (user.id === ownerId) {
    return { suffix: "\n\n-# (c'est toi le chef, jpeux pas te renvoyer vers toi-même 😅)", allowedUsers: [] };
  }

  const fresh = Date.now() - (lastPing.get(user.id) ?? 0) > config.limits.escalationCooldownMs;
  if (!fresh) {
    return {
      suffix: `\n\n👉 ${user}, contacte directement <@${ownerId}> en MP, le chef a déjà reçu une notif pour toi y'a pas longtemps ✅`,
      allowedUsers: [],
    };
  }

  lastPing.set(user.id, Date.now());
  await dmOwner(client, {
    title: '🔔 Un membre a besoin de toi',
    description: question,
    fields: [
      { name: 'Membre', value: `${user} (\`${user.username}\`)`, inline: true },
      { name: 'Où', value: whereLabel(guild, channel), inline: true },
      { name: 'Réponse du bot', value: answer },
    ],
    link,
  });

  const ping = guild ? `🔔 <@${ownerId}> on a besoin de toi ici !\n` : '';
  return {
    suffix: `\n\n${ping}👉 ${user}, contacte directement <@${ownerId}> en MP, j'ai déjà envoyé une notif au chef ✅`,
    allowedUsers: guild ? [ownerId] : [],
  };
}
