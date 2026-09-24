import { AttachmentBuilder } from 'discord.js';
import { config } from '../config.js';
import { describeError, errorDetail } from '../ai/gemini.js';
import { reportProblem } from '../features/alerts.js';
import { askAI } from '../features/chat.js';
import { createImageMessage } from '../features/images.js';
import { hitCooldown } from '../features/limits.js';
import { protectOwner } from '../features/protectOwner.js';
import { countMessage } from '../features/weekly.js';
import { guardMessage } from '../features/security.js';
import { conversationKey } from '../features/memory.js';
import { getPrivateThread, privateThreadOwner } from '../features/privateThreads.js';
import { handleSonMessage } from '../features/tribunal.js';
import { routeGameMessage } from '../games/index.js';
import { blindTestActive, handleBlindTestMessage, handleJukeboxMessage } from '../music/handlers.js';
import { attachmentsToContent, displayName, fetchBase64, inChannelList, isAllowedChannel, truncate } from '../utils/discord.js';

// "génère une image de...", "dessine-moi un logo...", "fais une photo de..."
const IMAGE_INTENT = /^(?:(?:est-ce que\s+)?(?:tu\s+peux|peux[- ]tu|stp|svp|vas-y)\s+)?(?:me\s+)?(?:g[ée]n[èeé]rer?|cr[ée]er?|dessiner?|fais|fait|faire|imaginer?)(?:[- ]moi)?\s+(?:une?|des|l[ae']|ma|mon)?\s*(?:image|dessin|photo|illustration|logo|wallpaper|fond d'[ée]cran|affiche|banni[èe]re|avatar|pp|pdp)\b/i;
// "modifie cette image", "mets-lui des lunettes"... (image jointe ou message cité qui contient une image)
const EDIT_INTENT = /^(?:(?:tu\s+peux|peux[- ]tu|stp|svp|vas-y)\s+)?(?:me\s+)?(?:(?:modifie|retouche|transforme|[ée]dite)\b|(?:mets?|ajoute|enl[èe]ve|supprime|remplace|change)\b.*\b(?:image|photo|fond|arri[èe]re-plan|style|couleur|dessus|dessin|pp|pdp|lunettes|chapeau|ciel|texte)\b)/i;
const isImage = (a) => a.contentType?.startsWith('image/');
const MAX_REUPLOAD_BYTES = 8 * 1024 * 1024;

export async function onMessage(client, message) {
  if (message.author.bot || message.system) return;
  // Sécurité : arnaques, liens interdits, spam (le message supprimé ne va pas plus loin)
  if (message.inGuild() && await guardMessage(message).catch(() => false)) return;
  // Rapport de la semaine : on compte (juste un nombre par membre et par salon)
  if (message.inGuild()) countMessage(message);
  // Insultes envers le chef : vérifié sur tout le serveur, sans bloquer le reste
  if (message.inGuild()) protectOwner(client, message).catch((err) => console.warn('[protection]', err.message));
  // Jeux en cours (rébus, imposteur, histoire…) : les messages du salon sont des réponses
  if (message.inGuild() && routeGameMessage(message)) return;
  if (!isAllowedChannel(message.channel, message.channelId)) return;

  // Salon des sons : dépôt du son de la semaine (le tribunal vérifie)
  if (message.inGuild() && message.channelId === config.tribunal.sonsChannelId) {
    return handleSonMessage(client, message).catch((err) => console.warn('[tribunal]', err.message));
  }

  // Blind test en cours : les messages du salon sont des réponses au jeu
  if (message.inGuild() && blindTestActive(message.guildId) && handleBlindTestMessage(message)) return;
  // Salon jukebox : écrire un nom de son l'ajoute à la file
  if (message.inGuild() && inChannelList(config.jukeboxChannelIds, message.channel, message.channelId)) {
    return handleJukeboxMessage(client, message);
  }

  const isDM = !message.inGuild();
  const mentioned = message.mentions.users.has(client.user.id);
  const repliedToBot = message.mentions.repliedUser?.id === client.user.id;
  const inAiChannel = inChannelList(config.aiChannelIds, message.channel, message.channelId);
  if (!isDM && !mentioned && !repliedToBot && !inAiChannel) return;

  // Dans le fil privé de quelqu'un, on ne répond qu'à son propriétaire (le chef peut y parler tranquille)
  if (message.channel.isThread()) {
    const owner = await privateThreadOwner(message.channelId);
    if (owner && owner !== message.author.id && !mentioned) return;
  }
  // Dans le salon IA, on laisse tranquilles les messages adressés à quelqu'un d'autre
  if (inAiChannel && !mentioned && !repliedToBot && (message.mentions.users.size || message.mentions.repliedUser)) return;

  const text = message.content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .replace(/<@!?(\d+)>/g, (_, id) => `@${message.guild?.members.cache.get(id)?.displayName ?? client.users.cache.get(id)?.username ?? 'quelqu\'un'}`)
    .replace(/@(everyone|here)/g, '$1')
    .trim();

  // Réponse privée : les messages écrits dans le salon IA partent dans le fil privé du membre
  const moveToPrivateThread = config.privateReplies && inAiChannel && !isDM && !message.channel.isThread();

  if (!text && !message.attachments.size) {
    if (moveToPrivateThread) return;
    return message.reply(`Yo ${message.author} 👋 pose-moi ta question direct, ou tape **/serveur** › Aide pour voir tout ce que jsais faire.`);
  }

  if (hitCooldown(message.author.id, 'chat', config.limits.chatCooldownMs)) {
    return message.react('⏳').catch(() => {});
  }

  let target = message.channel;
  let replyTo = message;
  let typing = null;

  try {
    // 1. On récupère tout AVANT de supprimer le message (les pièces jointes disparaissent avec lui)
    const ref = message.reference?.messageId ? await message.fetchReference().catch(() => null) : null;
    let imageAttachments = [...message.attachments.values()].filter(isImage);
    const wantsEdit = EDIT_INTENT.test(text);
    if (!imageAttachments.length && wantsEdit && ref) imageAttachments = [...ref.attachments.values()].filter(isImage);
    const isImageRequest = (IMAGE_INTENT.test(text) && !imageAttachments.length) || (imageAttachments.length > 0 && wantsEdit);

    const images = [];
    if (isImageRequest && config.limits.imagesEnabled) {
      for (const att of imageAttachments.slice(0, 3)) {
        images.push({ mimeType: att.contentType.split(';')[0], data: await fetchBase64(att.url) });
      }
    }

    const { content, notes } = isImageRequest ? { content: [], notes: [] } : await attachmentsToContent(message.attachments);
    if (!isImageRequest && ref && !repliedToBot) {
      if (ref.content) {
        content.unshift({
          type: 'text',
          text: `(Message auquel ${displayName(message.member, message.author)} répond, écrit par ${displayName(ref.member, ref.author)} : "${truncate(ref.content, 1500)}")`,
        });
      }
      if (ref.attachments.size) content.push(...(await attachmentsToContent(ref.attachments, { maxImages: 2 })).content);
    }

    // 2. Direction le fil privé
    if (moveToPrivateThread) {
      const thread = await getPrivateThread(client, message.channel, message.author, message.member);
      if (thread) {
        const files = await reuploadAttachments(message);
        await message.delete().catch(() => {});
        await thread.send({
          content: `💬 ${message.author} » ${truncate(text || '(pièce jointe)', 1900)}`,
          files,
          allowedMentions: { users: [message.author.id] },
        });
        target = thread;
        replyTo = null;
      }
    }

    typing = startTyping(target);

    // 3. Réponse
    let payload;
    if (isImageRequest) {
      payload = await createImageMessage({ user: message.author, prompt: text, images });
    } else {
      payload = await askAI({
        client,
        user: message.author,
        member: message.member,
        guild: message.guild,
        channel: target,
        link: replyTo ? message.url : target.url,
        prompt: text,
        extraContent: content,
        notes,
        historyKey: conversationKey({ userId: message.author.id }),
      });
    }
    await send(target, replyTo, payload);
  } catch (err) {
    console.error('[message]', err.body ? errorDetail(err) : err);
    const shown = `❌ ${describeError(err)}`;
    await send(target, replyTo, { content: shown });
    reportProblem({ what: 'réponse de l\'IA', error: err.body ? errorDetail(err) : err, userId: message.author.id, guild: message.guild, channelId: message.channelId, shown }).catch(() => {});
  } finally {
    typing?.stop();
  }
}

async function send(target, replyTo, payload) {
  if (replyTo) {
    try {
      return await replyTo.reply(payload);
    } catch {
      // message supprimé entre temps
    }
  }
  return target.send(payload).catch((err) => console.warn('[message] envoi impossible :', err.message));
}

async function reuploadAttachments(message) {
  const files = [];
  for (const att of [...message.attachments.values()].slice(0, 4)) {
    if (att.size > MAX_REUPLOAD_BYTES) continue;
    const res = await fetch(att.url).catch(() => null);
    if (res?.ok) files.push(new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name: att.name }));
  }
  return files;
}

function startTyping(channel) {
  channel.sendTyping().catch(() => {});
  const timer = setInterval(() => channel.sendTyping().catch(() => {}), 8_000);
  return { stop: () => clearInterval(timer) };
}
