import { ChannelType, EmbedBuilder } from 'discord.js';
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

/** MP du chef fermés + réponse privée : on le ping dans le salon IA, sans dévoiler la question. */
async function pingOwnerInAiChannel(client, user) {
  const channelId = config.aiChannelIds[0];
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  await channel?.send({
    content: `🔔 <@${config.ownerId}>, ${user} a besoin de toi (ouvre tes MP pour que je puisse t'envoyer le détail).`,
    allowedMentions: { users: [config.ownerId] },
  }).catch(() => {});
}

/**
 * Le bot ne sait pas répondre : prévient le chef et prépare le message pour le membre.
 * @param {object} opts
 * @param {'public'|'private'} [opts.visibility] private = réponse visible seulement par le membre
 * @returns {Promise<{ notice: string, mentionLine: string, allowedUsers: string[] }>}
 */
export async function escalateToOwner({ client, user, guild, channel, question, answer, link, visibility = 'public' }) {
  const ownerId = config.ownerId;
  if (user.id === ownerId) {
    return { notice: "\n\n-# (c'est toi le chef, jpeux pas te renvoyer vers toi-même 😅)", mentionLine: '', allowedUsers: [] };
  }

  if (Date.now() - (lastPing.get(user.id) ?? 0) < config.limits.escalationCooldownMs) {
    return {
      notice: `\n\n👉 Contacte directement <@${ownerId}> en MP, le chef a déjà reçu une notif pour toi y'a pas longtemps ✅`,
      mentionLine: '',
      allowedUsers: [],
    };
  }

  lastPing.set(user.id, Date.now());
  const dmSent = await dmOwner(client, {
    title: '🔔 Un membre a besoin de toi',
    description: question,
    fields: [
      { name: 'Membre', value: `${user} (\`${user.username}\`)`, inline: true },
      { name: 'Où', value: whereLabel(guild, channel), inline: true },
      { name: 'Réponse du bot', value: answer },
    ],
    link,
  });

  const notice = `\n\n👉 Contacte directement <@${ownerId}> en MP, j'ai déjà envoyé une notif au chef ✅`;
  if (visibility === 'private' || !guild) {
    if (!dmSent && guild) await pingOwnerInAiChannel(client, user);
    return { notice, mentionLine: '', allowedUsers: [] };
  }

  // Fil privé : on ajoute le chef pour qu'il puisse voir la conversation
  if (channel?.type === ChannelType.PrivateThread) await channel.members.add(ownerId).catch(() => {});
  return { notice, mentionLine: `🔔 <@${ownerId}> on a besoin de toi ici !`, allowedUsers: [ownerId] };
}
