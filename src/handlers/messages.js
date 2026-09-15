import { config } from '../config.js';
import { describeError, errorDetail } from '../ai/gemini.js';
import { askAI } from '../features/chat.js';
import { createImageMessage } from '../features/images.js';
import { hitCooldown } from '../features/limits.js';
import { conversationKey } from '../features/memory.js';
import { attachmentsToContent, fetchBase64, inChannelList, isAllowedChannel, truncate } from '../utils/discord.js';

// "génère une image de...", "dessine-moi un logo...", "fais une photo de..."
const IMAGE_INTENT = /^(?:(?:est-ce que\s+)?(?:tu\s+peux|peux[- ]tu|stp|svp|vas-y)\s+)?(?:me\s+)?(?:g[ée]n[èeé]rer?|cr[ée]er?|dessiner?|fais|fait|faire|imaginer?)(?:[- ]moi)?\s+(?:une?|des|l[ae']|ma|mon)?\s*(?:image|dessin|photo|illustration|logo|wallpaper|fond d'[ée]cran|affiche|banni[èe]re|avatar|pp|pdp)\b/i;
// "modifie cette image", "mets-lui des lunettes"... (image jointe ou message cité qui contient une image)
const EDIT_INTENT = /^(?:(?:tu\s+peux|peux[- ]tu|stp|svp|vas-y)\s+)?(?:me\s+)?(?:(?:modifie|retouche|transforme|[ée]dite)\b|(?:mets?|ajoute|enl[èe]ve|supprime|remplace|change)\b.*\b(?:image|photo|fond|arri[èe]re-plan|style|couleur|dessus|dessin|pp|pdp|lunettes|chapeau|ciel|texte)\b)/i;
const isImage = (a) => a.contentType?.startsWith('image/');

export async function onMessage(client, message) {
  if (message.author.bot || message.system) return;
  if (!isAllowedChannel(message.channel, message.channelId)) return;

  const isDM = !message.inGuild();
  const mentioned = message.mentions.users.has(client.user.id);
  const repliedToBot = message.mentions.repliedUser?.id === client.user.id;
  const inAiChannel = inChannelList(config.aiChannelIds, message.channel, message.channelId);
  if (!isDM && !mentioned && !repliedToBot && !inAiChannel) return;
  // Dans le salon IA, on laisse tranquilles les messages adressés à quelqu'un d'autre
  if (inAiChannel && !mentioned && !repliedToBot && (message.mentions.users.size || message.mentions.repliedUser)) return;

  const text = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .replace(/<@!?(\d+)>/g, (_, id) => `@${message.guild?.members.cache.get(id)?.displayName ?? client.users.cache.get(id)?.username ?? 'quelqu\'un'}`)
    .replace(/@(everyone|here)/g, '$1')
    .trim();

  if (!text && !message.attachments.size) {
    return message.reply(`Yo ${message.author} 👋 pose-moi ta question direct, ou tape \`/aide\` pour voir tout ce que jsais faire.`);
  }

  if (hitCooldown(message.author.id, 'chat', config.limits.chatCooldownMs)) {
    return message.react('⏳').catch(() => {});
  }

  const typing = startTyping(message.channel);
  try {
    const ref = message.reference?.messageId ? await message.fetchReference().catch(() => null) : null;
    let imageAttachments = [...message.attachments.values()].filter(isImage);
    const wantsEdit = EDIT_INTENT.test(text);
    if (!imageAttachments.length && wantsEdit && ref) imageAttachments = [...ref.attachments.values()].filter(isImage);

    // Génération / modification d'image directement en discutant
    if ((IMAGE_INTENT.test(text) && !imageAttachments.length) || (imageAttachments.length && wantsEdit)) {
      const images = [];
      for (const att of imageAttachments.slice(0, 3)) {
        images.push({ mimeType: att.contentType.split(';')[0], data: await fetchBase64(att.url) });
      }
      const reply = await createImageMessage({ user: message.author, prompt: text, images });
      return await safeReply(message, reply);
    }

    const { content, notes } = await attachmentsToContent(message.attachments);

    // Si la personne répond au message de quelqu'un d'autre, on donne ce message en contexte
    if (ref && !repliedToBot) {
      if (ref.content) {
        content.unshift({
          type: 'text',
          text: `(Message auquel ${message.member?.displayName ?? message.author.username} répond, écrit par ${ref.member?.displayName ?? ref.author.username} : "${truncate(ref.content, 1500)}")`,
        });
      }
      if (ref.attachments.size) {
        const refAtt = await attachmentsToContent(ref.attachments, { maxImages: 2 });
        content.push(...refAtt.content);
      }
    }

    const { chunks, allowedMentions } = await askAI({
      client,
      user: message.author,
      member: message.member,
      guild: message.guild,
      channel: message.channel,
      link: message.url,
      prompt: text,
      extraContent: content,
      notes,
      historyKey: conversationKey({ guildId: message.guildId, channelId: message.channelId, userId: message.author.id }),
    });

    let first = true;
    for (const chunk of chunks) {
      if (first) await safeReply(message, { content: chunk, allowedMentions });
      else await message.channel.send({ content: chunk, allowedMentions: { ...allowedMentions, repliedUser: false } });
      first = false;
    }
  } catch (err) {
    console.error('[message]', err.body ? errorDetail(err) : err);
    await safeReply(message, { content: `❌ ${describeError(err)}` });
  } finally {
    typing.stop();
  }
}

async function safeReply(message, payload) {
  try {
    return await message.reply(payload);
  } catch {
    // message supprimé entre temps -> on envoie dans le salon
    return message.channel.send(payload).catch(() => {});
  }
}

function startTyping(channel) {
  channel.sendTyping().catch(() => {});
  const timer = setInterval(() => channel.sendTyping().catch(() => {}), 8_000);
  return { stop: () => clearInterval(timer) };
}
