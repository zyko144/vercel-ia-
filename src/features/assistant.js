// L'IA au service du serveur : résumé du soir, alerte d'ambiance, idées d'événements, annonces rédigées,
// réponse à voix haute, traduction lue en vocal, résumé des tickets.
// Pour économiser : on garde seulement un court extrait des derniers messages (jamais tout l'historique).
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { chat, chatJson } from '../ai/gemini.js';
import { truncate } from '../utils/discord.js';
import { cfg, setInternal } from './guildConfig.js';
import { logEvent } from './security.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const TZ = 'Europe/Paris';
const GOLD = 0xc9a978;
const parisNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
const today = () => parisNow().toISOString().slice(0, 10);

// ===================== Extraits des messages du jour =====================

const buffers = new Map(); // serveur -> [{ at, n, t, c }]
const seenSinceMood = new Map();
const MAX_KEEP = 400;

/** Appelé pour chaque message : garde un extrait court (nom, 160 caractères, salon). */
export function recordMessage(message) {
  if (!message.inGuild() || message.author.bot) return;
  const text = message.content?.replace(/\s+/g, ' ').trim();
  if (!text || text.length < 3) return;
  const list = buffers.get(message.guildId) ?? [];
  list.push({ at: Date.now(), n: message.member?.displayName ?? message.author.username, t: text.slice(0, 160), c: message.channel?.name ?? '' });
  if (list.length > MAX_KEEP) list.splice(0, list.length - MAX_KEEP);
  buffers.set(message.guildId, list);
  seenSinceMood.set(message.guildId, (seenSinceMood.get(message.guildId) ?? 0) + 1);
}
const excerpt = (guildId, sinceMs, max = 250) => (buffers.get(guildId) ?? []).filter((m) => Date.now() - m.at < sinceMs).slice(-max)
  .map((m) => `[#${m.c}] ${m.n} : ${m.t}`).join('\n');

/** Le résumé de la journée (idée 47). */
export async function daySummary(guild) {
  const text = excerpt(guild.id, 24 * 3_600_000);
  if (text.split('\n').length < 10) return null;
  const { text: out } = await chat({
    tag: 'tâches', web: false, thinking: 'minimal',
    system: 'Tu écris le résumé du soir d’un serveur Discord, façon journal de bord de pirate, en français, 8 lignes maximum, avec des emojis. Tu cites les moments forts et les sujets, jamais d’info privée ni de moquerie.',
    content: [{ type: 'text', text: `Serveur : ${guild.name}\nExtraits de la journée :\n${text}` }],
  });
  return out?.trim() || null;
}

// ===================== Idées d'événements et annonces =====================

export async function eventIdeas(guild, theme = '') {
  const data = await chatJson({
    tag: 'tâches', thinking: 'minimal',
    system: 'Tu proposes des événements concrets et faisables pour un serveur Discord francophone (jeux, soirées vocales, concours, tournois). Tu utilises ce que le bot sait faire : quiz, tournoi, blind test, loup-garou, dessin en arcade, chasse au trésor, enchères, loterie.',
    prompt: `Serveur : ${guild.name} (${guild.memberCount} membres).${theme ? ` Thème souhaité : ${theme}.` : ''}\nDonne 5 idées avec un titre court, une description d'une phrase, le meilleur moment et la récompense conseillée en pièces d'or.`,
    schema: { type: 'object', properties: { idees: { type: 'array', items: { type: 'object', properties: { titre: { type: 'string' }, description: { type: 'string' }, quand: { type: 'string' }, recompense: { type: 'integer' } }, required: ['titre', 'description', 'quand', 'recompense'] } } }, required: ['idees'] },
  });
  return new EmbedBuilder().setColor(GOLD).setTitle(`🎉 Idées d’événements · ${guild.name}`)
    .setDescription((data.idees ?? []).slice(0, 5).map((i, k) => `**${k + 1}. ${truncate(i.titre, 80)}**\n${truncate(i.description, 250)}\n-# 🕒 ${truncate(i.quand, 60)} · 🪙 ${Number(i.recompense || 0).toLocaleString('fr-FR')}`).join('\n\n') || 'Pas d’idée pour l’instant, réessaie.');
}

const drafts = new Map(); // id -> { guildId, text, channelId, by }
export async function draftAnnouncement(interaction, { points, ton = 'enthousiaste', salon = null }) {
  await interaction.deferReply(PRIVATE);
  const { text } = await chat({
    tag: 'tâches', web: false, thinking: 'minimal',
    system: `Tu rédiges des annonces Discord en français, ton ${ton}, claires, avec un titre en gras, des emojis bien placés et des paragraphes courts. 1200 caractères maximum. Pas de @everyone.`,
    content: [{ type: 'text', text: `Serveur : ${interaction.guild.name}\nPoints à annoncer :\n${points}` }],
  });
  const id = Math.random().toString(36).slice(2, 9);
  const channelId = salon?.id ?? cfg(interaction.guildId, 'announce.channelId') ?? interaction.channelId;
  drafts.set(id, { guildId: interaction.guildId, text: truncate(text.trim(), 1900), channelId, by: interaction.user.id, points, ton });
  setTimeout(() => drafts.delete(id), 30 * 60_000).unref?.();
  return interaction.editReply(draftView(id));
}
function draftView(id) {
  const d = drafts.get(id);
  return {
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle('📜 Annonce proposée').setDescription(d.text).setFooter({ text: 'Aperçu : rien n’est publié tant que tu n’as pas cliqué sur Publier.' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`as:pub:${id}`).setLabel('Publier').setEmoji('📢').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`as:redo:${id}`).setLabel('Autre version').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    )],
  };
}

// ===================== Réponse à voix haute et traduction lue =====================

/** L'IA vocale lit un texte dans le salon vocal du bot (idées 49 et 53). */
export async function speakInVoice(text, { voice = 'Charon', style = 'Tu es une voix chaleureuse et claire.', channelId = null } = {}) {
  const { borrowVoiceAi, createNarrator } = await import('../voice-ai/assistant.js');
  // Dans le vocal de la personne si elle y est, sinon dans le vocal habituel de l'IA
  const release = await borrowVoiceAi('lecture à voix haute', { channelId });
  const narrator = createNarrator({ voice, style });
  try {
    await narrator.say(text);
  } finally {
    narrator.close();
    await release();
  }
}

export async function answerAloud(interaction, question) {
  await interaction.deferReply();
  const { askAI } = await import('./chat.js');
  const payload = await askAI({ client: interaction.client, user: interaction.user, member: interaction.member, guild: interaction.guild, channel: interaction.channel, prompt: `${question}\n(Réponds en 4 phrases maximum : ta réponse sera lue à voix haute.)`, web: true, tag: 'conversation' });
  const text = payload.embeds?.[0]?.data?.description ?? payload.content ?? '';
  await interaction.editReply(payload);
  try {
    await speakInVoice(text.replace(/[*_`>#]/g, '').slice(0, 900));
    return interaction.followUp({ content: '🔊 Lu à voix haute dans le vocal du bot.', ...PRIVATE });
  } catch (err) {
    return interaction.followUp({ content: `🔇 Pas de lecture à voix haute : ${err.message}.`, ...PRIVATE });
  }
}

export async function translateAloud(interaction, { texte, langue }) {
  await interaction.deferReply();
  const { text } = await chat({
    tag: 'tâches', web: false, thinking: 'minimal',
    system: 'Tu es traducteur. Tu donnes uniquement la traduction, naturelle et fidèle, sans guillemets ni commentaire.',
    content: [{ type: 'text', text: `Traduis en ${langue} :\n${texte}` }],
  });
  const out = text.trim();
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle(`🌍 Traduction · ${langue}`).addFields({ name: 'Texte', value: truncate(texte, 1000) }, { name: 'Traduction', value: truncate(out, 1000) })] });
  try {
    await speakInVoice(out.slice(0, 900), { style: `Tu lis des traductions en ${langue}, avec l’accent et la prononciation de cette langue.` });
    return interaction.followUp({ content: '🔊 Traduction lue dans le vocal du bot.', ...PRIVATE });
  } catch (err) {
    return interaction.followUp({ content: `🔇 Pas de lecture à voix haute : ${err.message}.`, ...PRIVATE });
  }
}

// ===================== Résumé d'un ticket =====================

/** Résumé en 3 lignes d'une transcription (idée 55). null si l'IA ne répond pas. */
export async function summarizeTicket(transcriptText) {
  const lines = transcriptText.split('\n').slice(-120).join('\n');
  if (lines.length < 80) return null;
  try {
    const { text } = await chat({
      tag: 'tâches', web: false, thinking: 'minimal',
      system: 'Tu résumes un ticket de support Discord en français : le problème, ce qui a été fait, et comment ça s’est terminé. 3 lignes courtes maximum, avec un emoji au début de chaque ligne.',
      content: [{ type: 'text', text: lines.slice(-6000) }],
    });
    return truncate(text.trim(), 900);
  } catch {
    return null;
  }
}

// ===================== Explication d'une suppression =====================

const HOW_TO = {
  'auto-lien': 'Pose ton lien dans un salon prévu pour ça, ou demande au staff d’ajouter le site aux liens autorisés.',
  'auto-spam': 'Écris en un seul message plutôt qu’en rafale.',
  'auto-mentions': 'Mentionne seulement les personnes concernées.',
  'auto-majuscules': 'Écris en minuscules : les majuscules donnent l’impression de crier.',
  'auto-arnaque': 'Ce lien imite un site connu pour voler les comptes. Si ton compte l’a envoyé tout seul, change ton mot de passe.',
  'auto-mot': 'Ce mot est interdit par les règles du serveur.',
};
export async function explainDeletion(user, guild, { kind, reason, content }) {
  if (!cfg(guild.id, 'ai.explainDeletions')) return;
  await user.send({
    embeds: [new EmbedBuilder().setColor(0xffb020).setTitle('🧹 Ton message a été retiré')
      .setDescription(`Sur **${guild.name}**, le bot a supprimé ton message : **${reason}**.\n\n💡 ${HOW_TO[kind] ?? 'Relis les règles du serveur, et en cas de doute demande au staff.'}`)
      .addFields({ name: 'Ton message', value: truncate(content || '(vide)', 500) })
      .setFooter({ text: 'Ce n’est pas une sanction lourde : c’est pour garder le serveur agréable.' })],
  }).catch(() => {});
}

// ===================== Boutons =====================

export const isAssistantComponent = (interaction) => /^as:/.test(interaction.customId ?? '');
export async function handleAssistantComponent(client, interaction) {
  const [, what, id] = interaction.customId.split(':');
  const d = drafts.get(id);
  if (!d) return interaction.reply({ content: 'Cet aperçu a expiré, relance la rédaction.', ...PRIVATE });
  if (what === 'pub') {
    const channel = interaction.guild.channels.cache.get(d.channelId);
    if (!channel?.isTextBased?.() || !channel.permissionsFor(interaction.guild.members.me)?.has(P.SendMessages)) return interaction.reply({ content: '❌ Je ne peux pas écrire dans le salon des annonces.', ...PRIVATE });
    await channel.send({ content: d.text, allowedMentions: { parse: [] } });
    drafts.delete(id);
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x3fbf6a).setDescription(`📢 Annonce publiée dans ${channel}.`)], components: [] });
  }
  if (what === 'redo') {
    await interaction.deferUpdate();
    const { text } = await chat({
      tag: 'tâches', web: false, thinking: 'minimal',
      system: `Tu rédiges des annonces Discord en français, ton ${d.ton}, avec un titre en gras et des emojis. 1200 caractères maximum. Propose une version différente de la précédente.`,
      content: [{ type: 'text', text: `Points :\n${d.points}\n\nVersion précédente (à ne pas recopier) :\n${d.text}` }],
    });
    d.text = truncate(text.trim(), 1900);
    return interaction.editReply(draftView(id));
  }
  return undefined;
}

// ===================== Minuteries : résumé du soir et ambiance =====================

async function tick(client) {
  const now = parisNow();
  for (const guild of client.guilds.cache.values()) {
    // Résumé du soir, à 22 h
    if (cfg(guild.id, 'ai.eveningSummary') && now.getHours() >= 22 && cfg(guild.id, 'ai.lastSummary') !== today()) {
      setInternal(guild.id, 'ai.lastSummary', today());
      const channel = guild.channels.cache.get(cfg(guild.id, 'announce.channelId') ?? '');
      const text = channel?.isTextBased?.() ? await daySummary(guild).catch(() => null) : null;
      if (text) await channel.send({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle(`🌙 Le journal de bord du ${now.toLocaleDateString('fr-FR')}`).setDescription(truncate(text, 3500))], allowedMentions: { parse: [] } }).catch(() => {});
    }
    // Ambiance : on regarde seulement s'il y a eu beaucoup de messages depuis la dernière fois
    if (cfg(guild.id, 'ai.moodAlerts') && (seenSinceMood.get(guild.id) ?? 0) >= 40) {
      seenSinceMood.set(guild.id, 0);
      const mood = await chatJson({
        tag: 'tâches', thinking: 'minimal',
        system: 'Tu surveilles l’ambiance d’un serveur Discord. Tu notes la tension de 0 (calme) à 10 (dispute grave, harcèlement, insultes répétées). Tu ne signales pas les taquineries amicales.',
        prompt: excerpt(guild.id, 60 * 60_000, 120),
        schema: { type: 'object', properties: { tension: { type: 'integer' }, raison: { type: 'string' }, salon: { type: 'string' } }, required: ['tension', 'raison'] },
      }).catch(() => null);
      if (mood?.tension >= 7) {
        await logEvent(guild, { color: 0xff9f2e, title: `🌡️ Le ton monte (${mood.tension}/10)`, description: `${truncate(mood.raison, 500)}${mood.salon ? `\nSalon : #${mood.salon}` : ''}\n-# Alerte de l’IA : jetez un œil, rien n’a été fait automatiquement.` });
      }
    }
  }
}

export function startAssistant(client) {
  setInterval(() => tick(client).catch((err) => console.warn('[assistant]', err.message)), 10 * 60_000).unref();
}

export const _test = { buffers, excerpt, drafts, tick, seenSinceMood };
