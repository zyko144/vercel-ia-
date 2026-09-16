// Signalement intelligent : clic droit sur un message > Signaler au staff.
// L'IA analyse le message (avec le contexte du salon) et envoie un rapport au staff, avec des boutons d'action.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { config } from '../config.js';
import { chatJson, describeError } from '../ai/gemini.js';
import { dmOwner } from './escalation.js';
import { hitCooldown } from './limits.js';
import { truncate } from '../utils/discord.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const MUTE_MS = 60 * 60_000;
const reported = new Map(); // messageId -> { count, reporters:Set }

const SEVERITY = {
  1: { label: 'Rien de grave', color: 0x57f287, emoji: '🟢' },
  2: { label: 'Limite', color: 0xfee75c, emoji: '🟡' },
  3: { label: 'Problématique', color: 0xff9500, emoji: '🟠' },
  4: { label: 'Grave', color: 0xed4245, emoji: '🔴' },
  5: { label: 'Très grave', color: 0x9b1c1c, emoji: '🚨' },
};

const SCHEMA = {
  type: 'object',
  properties: {
    categorie: {
      type: 'string',
      enum: ['insulte', 'harcelement', 'menace', 'arnaque', 'publicite', 'contenu_sexuel', 'haine', 'spam', 'hors_sujet', 'rien'],
    },
    gravite: { type: 'integer', minimum: 1, maximum: 5 },
    resume: { type: 'string' },
    action_conseillee: { type: 'string' },
    faux_signalement: { type: 'boolean' },
  },
  required: ['categorie', 'gravite', 'resume', 'action_conseillee', 'faux_signalement'],
};

async function analyse(botName, { target, context, reason }) {
  return chatJson({
    system: `Tu es le modérateur IA du serveur Discord, tu assistes le staff. Tu es factuel et neutre. Le second degré, les vannes entre potes et le langage familier ne sont PAS des infractions.`,
    prompt: `Un membre signale ce message.

MESSAGE SIGNALÉ (de ${target.author}) :
"""${target.content}"""

CONTEXTE (messages juste avant) :
"""${context}"""

${reason ? `Raison donnée par la personne qui signale : "${reason}"\n` : ''}
Analyse : catégorie, gravité de 1 (rien) à 5 (très grave), résumé en une phrase pour le staff, action conseillée (ignorer / avertir / supprimer / mute / ban), et si c'est un faux signalement (message inoffensif).`,
    schema: SCHEMA,
    thinking: 'low',
    exactThinking: true,
  });
}

function buildEmbed({ target, reporter, guild, verdict, link }) {
  const level = SEVERITY[verdict.gravite] ?? SEVERITY[3];
  return new EmbedBuilder()
    .setColor(level.color)
    .setAuthor({ name: `🚨 Signalement · ${level.emoji} ${level.label}`, iconURL: target.author.displayAvatarURL?.() })
    .setDescription(`>>> ${truncate(target.content || '(pas de texte)', 1500)}`)
    .addFields(
      { name: 'Auteur', value: `${target.author} (\`${target.author.username}\`)`, inline: true },
      { name: 'Signalé par', value: `${reporter}`, inline: true },
      { name: 'Salon', value: `<#${target.channelId}>`, inline: true },
      { name: `${verdict.faux_signalement ? '🤖 Analyse IA (semble inoffensif)' : '🤖 Analyse IA'}`, value: `**${verdict.categorie}** · gravité ${verdict.gravite}/5\n${truncate(verdict.resume, 900)}` },
      { name: '👉 Conseil', value: truncate(verdict.action_conseillee, 500) },
    )
    .setFooter({ text: guild.name })
    .setTimestamp();
}

function buildButtons(target) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`report:delete:${target.channelId}:${target.id}`).setLabel('Supprimer le message').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`report:mute:${target.author.id}`).setLabel('Mute 1h').setEmoji('🔇').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('report:dismiss').setLabel('Rien à faire').setEmoji('✅').setStyle(ButtonStyle.Secondary),
  );
}

/** Clic droit sur un message > Signaler au staff. */
export async function handleReport(client, interaction) {
  const target = interaction.targetMessage;
  if (target.author.bot) return interaction.reply({ content: "Pas la peine de me signaler moi 😅", ...PRIVATE });
  if (target.author.id === interaction.user.id) return interaction.reply({ content: 'Tu peux pas te signaler toi-même 😅', ...PRIVATE });

  const wait = hitCooldown(interaction.user.id, 'report', 3 * 60_000);
  if (wait) return interaction.reply({ content: `⏳ Doucement avec les signalements, réessaie dans ${Math.ceil(wait / 60_000)} min.`, ...PRIVATE });

  await interaction.deferReply(PRIVATE);

  // Déjà signalé : on prévient sans refaire toute l'analyse
  const seen = reported.get(target.id) ?? { count: 0, reporters: new Set() };
  seen.count++;
  seen.reporters.add(interaction.user.id);
  reported.set(target.id, seen);
  if (reported.size > 200) reported.delete(reported.keys().next().value);

  const messages = await interaction.channel?.messages.fetch({ limit: 6, before: target.id }).catch(() => null);
  const context = [...(messages?.values() ?? [])].reverse()
    .map((m) => `${m.member?.displayName ?? m.author.username} : ${truncate(m.content, 200)}`)
    .join('\n');

  let verdict;
  try {
    verdict = await analyse(client.user.username, {
      target: { author: target.member?.displayName ?? target.author.username, content: target.content },
      context,
      reason: null,
    });
  } catch (err) {
    console.warn('[signalement] analyse impossible :', err.message);
    verdict = { categorie: 'rien', gravite: 3, resume: `L'IA n'a pas pu analyser (${describeError(err)})`, action_conseillee: 'À regarder à la main', faux_signalement: false };
  }

  const embed = buildEmbed({ target, reporter: interaction.user, guild: interaction.guild, verdict, link: target.url });
  if (seen.count > 1) embed.addFields({ name: '📣 Signalements', value: `${seen.count} personnes ont signalé ce message` });

  const payload = { content: `➡️ ${target.url}`, embeds: [embed], components: [buildButtons(target)], allowedMentions: { parse: [] } };
  const staffChannel = config.staffChannelId ? await client.channels.fetch(config.staffChannelId).catch(() => null) : null;
  const sent = staffChannel ? await staffChannel.send(payload).then(() => true).catch(() => false) : false;
  if (!sent) {
    await dmOwner(client, {
      title: `🚨 Signalement (${SEVERITY[verdict.gravite]?.label ?? '?'})`,
      description: `${truncate(target.content || '(pas de texte)', 1000)}\n\n**IA :** ${verdict.categorie} · ${verdict.gravite}/5 — ${verdict.resume}\n**Conseil :** ${verdict.action_conseillee}`,
      fields: [
        { name: 'Auteur', value: `${target.author}`, inline: true },
        { name: 'Signalé par', value: `${interaction.user}`, inline: true },
      ],
      link: target.url,
    });
  }

  return interaction.editReply(`✅ C'est signalé au staff${verdict.faux_signalement ? " (l'IA trouve ce message plutôt inoffensif, mais le staff regardera quand même)" : ''}. Merci !`);
}

/** Boutons du rapport : réservés au staff. */
export async function handleReportButton(client, interaction) {
  const [, action, ...rest] = interaction.customId.split(':');
  const isStaff = interaction.user.id === config.ownerId
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)
    || interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers);
  if (!isStaff) return interaction.reply({ content: '🔒 Réservé au staff.', ...PRIVATE });

  if (action === 'dismiss') {
    await interaction.update({ components: [] });
    return interaction.followUp({ content: `✅ Classé sans suite par ${interaction.user}.`, allowedMentions: { parse: [] } });
  }

  if (action === 'delete') {
    const [channelId, messageId] = rest;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    const message = await channel?.messages.fetch(messageId).catch(() => null);
    if (!message) return interaction.reply({ content: 'Message introuvable (déjà supprimé ?).', ...PRIVATE });
    const deleted = await message.delete().then(() => true).catch(() => false);
    await interaction.update({ components: [] });
    return interaction.followUp({ content: deleted ? `🗑️ Message supprimé par ${interaction.user}.` : "❌ J'ai pas pu supprimer (permission manquante).", allowedMentions: { parse: [] } });
  }

  if (action === 'mute') {
    const member = await interaction.guild?.members.fetch(rest[0]).catch(() => null);
    if (!member) return interaction.reply({ content: "Ce membre est plus sur le serveur.", ...PRIVATE });
    if (!member.moderatable) return interaction.reply({ content: '❌ Je peux pas le mute : mon rôle est en dessous du sien.', ...PRIVATE });
    await member.timeout(MUTE_MS, `Signalement traité par ${interaction.user.username}`);
    await interaction.update({ components: [] });
    return interaction.followUp({ content: `🔇 ${member} est mute 1h (par ${interaction.user}).`, allowedMentions: { parse: [] } });
  }
  return undefined;
}
