import { EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { chat, describeError, errorDetail } from '../ai/gemini.js';
import { toolPrompt } from '../ai/persona.js';
import { askAI, channelLink } from '../features/chat.js';
import { dmOwner, whereLabel } from '../features/escalation.js';
import { createImageMessage } from '../features/images.js';
import { hitCooldown, imagesToday } from '../features/limits.js';
import { conversationKey, forget, memoryStats } from '../features/memory.js';
import { createQuiz, handleQuizButton } from '../features/quiz.js';
import { addReminder, parseDuration } from '../features/reminders.js';
import { rejoinVoice, voiceStatus } from '../features/voice.js';
import { storageBackend } from '../storage.js';
import {
  allowedChannelsMention, attachmentsToContent, fetchBase64, isAllowedChannel, splitMessage, truncate,
} from '../utils/discord.js';

const EXPLAIN_LEVELS = {
  simple: "Explique comme à quelqu'un de 12 ans : mots simples, une analogie de la vie de tous les jours, pas de jargon.",
  normal: 'Explique clairement et de façon structurée, avec un exemple concret.',
  expert: 'Explication détaillée et rigoureuse, avec les termes techniques exacts, les nuances et les cas particuliers.',
};

const isOwner = (user) => user.id === config.ownerId;

// Commandes utilisables hors du salon IA (réponses privées)
const ALLOWED_EVERYWHERE = new Set(['admin', 'aide']);

export async function onInteraction(client, interaction) {
  try {
    if (interaction.isRepliable() && !ALLOWED_EVERYWHERE.has(interaction.commandName)
      && !isAllowedChannel(interaction.channel, interaction.channelId)) {
      return await interaction.reply({
        content: `👉 Je réponds que dans ${allowedChannelsMention()}, viens me parler là-bas !`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (interaction.isButton() && interaction.customId.startsWith('quiz:')) return await handleQuizButton(interaction);
    if (interaction.isMessageContextMenuCommand()) return await handleContextMenu(client, interaction);
    if (!interaction.isChatInputCommand()) return;

    const handler = SLASH_HANDLERS[interaction.commandName];
    if (handler) await handler(client, interaction);
  } catch (err) {
    console.error(`[interaction] ${interaction.commandName ?? interaction.customId}`, err.body ? errorDetail(err) : err);
    const payload = { content: `❌ ${describeError(err)}`, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}

/** Envoie des morceaux de texte en réponse à une interaction déjà "deferred". */
async function sendChunks(interaction, chunks, { ephemeral = false, allowedMentions = { parse: [] } } = {}) {
  const flags = ephemeral ? MessageFlags.Ephemeral : undefined;
  await interaction.editReply({ content: chunks[0], allowedMentions });
  for (const chunk of chunks.slice(1)) {
    await interaction.followUp({ content: chunk, allowedMentions, flags });
  }
}

function cooldownGuard(interaction, bucket, ms) {
  const wait = hitCooldown(interaction.user.id, bucket, ms);
  if (!wait) return false;
  interaction.reply({
    content: `⏳ Doucement, attends encore ${Math.ceil(wait / 1000)}s stp.`,
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
  return true;
}

function askContext(client, interaction) {
  return {
    client,
    user: interaction.user,
    member: interaction.member,
    guild: interaction.guild,
    channel: interaction.channel,
    link: channelLink(interaction.guildId, interaction.channelId),
  };
}

const historyKeyFor = (interaction) =>
  conversationKey({ guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id });

async function simpleTool(client, interaction, { task, prompt, thinking }) {
  await interaction.deferReply();
  const { text } = await chat({
    system: toolPrompt(client.user.username, task),
    content: [{ type: 'text', text: prompt }],
    web: false,
    thinking,
  });
  await sendChunks(interaction, splitMessage(text || "J'ai rien pu en tirer, désolé."));
}

const SLASH_HANDLERS = {
  async ask(client, interaction) {
    if (cooldownGuard(interaction, 'chat', config.limits.chatCooldownMs)) return;
    const ephemeral = interaction.options.getBoolean('prive') ?? false;
    await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });

    const file = interaction.options.getAttachment('fichier');
    const { content, notes } = file ? await attachmentsToContent(new Map([[file.id, file]])) : { content: [], notes: [] };
    const { chunks, allowedMentions } = await askAI({
      ...askContext(client, interaction),
      prompt: interaction.options.getString('question', true),
      extraContent: content,
      notes,
      historyKey: ephemeral ? null : historyKeyFor(interaction),
    });
    await sendChunks(interaction, chunks, { ephemeral, allowedMentions });
  },

  async image(client, interaction) {
    if (cooldownGuard(interaction, 'image', 15_000)) return;
    await interaction.deferReply();
    const reply = await createImageMessage({
      user: interaction.user,
      prompt: interaction.options.getString('prompt', true),
      aspectRatio: interaction.options.getString('format') ?? undefined,
      pro: interaction.options.getBoolean('pro') ?? false,
    });
    await interaction.editReply(reply);
  },

  async 'modifier-image'(client, interaction) {
    if (cooldownGuard(interaction, 'image', 15_000)) return;
    const attachments = [interaction.options.getAttachment('image', true), interaction.options.getAttachment('image2')]
      .filter(Boolean);
    if (attachments.some((a) => !a.contentType?.startsWith('image/'))) {
      return interaction.reply({ content: 'Envoie une vraie image stp (png, jpg, webp).', flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply();
    const images = [];
    for (const att of attachments) images.push({ mimeType: att.contentType.split(';')[0], data: await fetchBase64(att.url) });
    const reply = await createImageMessage({
      user: interaction.user,
      prompt: interaction.options.getString('consigne', true),
      images,
    });
    await interaction.editReply(reply);
  },

  async explique(client, interaction) {
    if (cooldownGuard(interaction, 'chat', config.limits.chatCooldownMs)) return;
    await interaction.deferReply();
    const level = interaction.options.getString('niveau') ?? 'normal';
    const { chunks, allowedMentions } = await askAI({
      ...askContext(client, interaction),
      prompt: `Explique-moi : ${interaction.options.getString('sujet', true)}`,
      instructions: `${EXPLAIN_LEVELS[level]} Termine par un mini résumé en 1 phrase et, si pertinent, 1 ou 2 liens pour approfondir.`,
      historyKey: historyKeyFor(interaction),
      thinking: level === 'expert' ? 'high' : undefined,
    });
    await sendChunks(interaction, chunks, { allowedMentions });
  },

  async code(client, interaction) {
    if (cooldownGuard(interaction, 'chat', config.limits.chatCooldownMs)) return;
    await interaction.deferReply();
    const lang = interaction.options.getString('langage');
    const file = interaction.options.getAttachment('fichier');
    const { content, notes } = file ? await attachmentsToContent(new Map([[file.id, file]])) : { content: [], notes: [] };
    const { chunks, allowedMentions } = await askAI({
      ...askContext(client, interaction),
      prompt: `${lang ? `[Langage : ${lang}] ` : ''}${interaction.options.getString('demande', true)}`,
      extraContent: content,
      notes,
      instructions: "Tu es un dev senior pédagogue. Donne du code complet, fonctionnel et commenté juste ce qu'il faut, dans des blocs avec le bon langage. S'il y a un bug, explique la cause puis la correction. Explique les points clés en quelques puces. Mets un lien vers la doc officielle si utile.",
      historyKey: historyKeyFor(interaction),
      thinking: 'high',
    });
    await sendChunks(interaction, chunks, { allowedMentions });
  },

  async corriger(client, interaction) {
    if (cooldownGuard(interaction, 'chat', config.limits.chatCooldownMs)) return;
    await simpleTool(client, interaction, {
      task: "Tu es un correcteur d'orthographe et de grammaire expert. Tu ne changes ni le sens ni le style du texte.",
      prompt: `Corrige ce texte. Donne d'abord le texte corrigé en citation (lignes commençant par "> "), puis une courte liste "**Corrections :**" avec les principales fautes et la règle en quelques mots. S'il n'y a aucune faute, dis-le simplement.\n\nTexte :\n${interaction.options.getString('texte', true)}`,
    });
  },

  async traduire(client, interaction) {
    if (cooldownGuard(interaction, 'chat', config.limits.chatCooldownMs)) return;
    const lang = interaction.options.getString('langue');
    await simpleTool(client, interaction, {
      task: 'Tu es un traducteur professionnel. Tu traduis de façon naturelle et fidèle, en gardant le ton.',
      prompt: `Traduis ce texte ${lang ? `en ${lang}` : "en français (ou en anglais s'il est déjà en français)"}. Donne uniquement la traduction, puis sur une dernière ligne : "-# Langue d'origine : <langue>".\n\nTexte :\n${interaction.options.getString('texte', true)}`,
    });
  },

  async resume(client, interaction) {
    if (cooldownGuard(interaction, 'resume', 30_000)) return;
    await interaction.deferReply();
    const limit = interaction.options.getInteger('messages') ?? 50;
    const fetched = await interaction.channel?.messages.fetch({ limit }).catch(() => null);
    if (!fetched?.size) {
      return interaction.editReply("J'arrive pas à lire les messages ici (il me faut la permission « Voir l'historique des messages »).");
    }
    const transcript = [...fetched.values()]
      .reverse()
      .filter((m) => m.content || m.attachments.size)
      .map((m) => `${m.member?.displayName ?? m.author.username}${m.author.bot ? ' [bot]' : ''} : ${truncate(m.content || '[pièce jointe]', 400)}`)
      .join('\n');

    const { chunks } = await askAI({
      ...askContext(client, interaction),
      prompt: `Résume cette conversation du salon :\n\n${transcript}`,
      instructions: "Fais un résumé clair : les sujets abordés en puces (qui a dit quoi d'important), les décisions ou infos à retenir, et les questions restées sans réponse. Pas de mention (@). Pas de recherche web nécessaire.",
      web: false,
    });
    await sendChunks(interaction, chunks);
  },

  async quiz(client, interaction) {
    if (cooldownGuard(interaction, 'quiz', 10_000)) return;
    await interaction.deferReply();
    const payload = await createQuiz({
      botName: client.user.username,
      topic: interaction.options.getString('sujet', true),
      difficulty: interaction.options.getString('difficulte') ?? 'moyen',
    });
    await interaction.editReply(payload);
  },

  async rappel(client, interaction) {
    const delayMs = parseDuration(interaction.options.getString('dans', true));
    if (!delayMs || delayMs < 10_000) {
      return interaction.reply({ content: 'Durée pas comprise 🤔 Exemples : `10m`, `2h`, `1h30`, `3j`.', flags: MessageFlags.Ephemeral });
    }
    const text = interaction.options.getString('message', true);
    const { error, reminder } = await addReminder({
      userId: interaction.user.id,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      text,
      delayMs,
    });
    if (error) return interaction.reply({ content: `❌ ${error}`, flags: MessageFlags.Ephemeral });
    const when = Math.floor(reminder.at / 1000);
    await interaction.reply({
      content: `✅ C'est noté ! Je te rappelle **${truncate(text, 200)}** <t:${when}:R> (<t:${when}:f>).`,
      flags: MessageFlags.Ephemeral,
    });
  },

  async sondage(client, interaction) {
    const answers = interaction.options.getString('choix', true)
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    if (answers.length < 2 || answers.length > 10 || answers.some((a) => a.length > 55)) {
      return interaction.reply({
        content: 'Il faut entre **2 et 10 choix** séparés par `|`, et chaque choix fait max 55 caractères.',
        flags: MessageFlags.Ephemeral,
      });
    }
    await interaction.reply({
      poll: {
        question: { text: interaction.options.getString('question', true) },
        answers: answers.map((text) => ({ text })),
        duration: interaction.options.getInteger('duree') ?? 24,
        allowMultiselect: interaction.options.getBoolean('multiple') ?? false,
      },
    });
  },

  async 'contacter-chef'(client, interaction) {
    if (cooldownGuard(interaction, 'contact', 5 * 60_000)) return;
    const text = interaction.options.getString('message', true);
    const sent = await dmOwner(client, {
      title: '📩 Nouveau message pour toi',
      description: text,
      fields: [
        { name: 'De', value: `${interaction.user} (\`${interaction.user.username}\`)`, inline: true },
        { name: 'Où', value: whereLabel(interaction.guild, interaction.channel), inline: true },
      ],
      link: channelLink(interaction.guildId, interaction.channelId),
    });

    if (sent) {
      return interaction.reply({
        content: `✅ Message envoyé au chef en MP ! Tu peux aussi le contacter direct : <@${config.ownerId}>`,
        flags: MessageFlags.Ephemeral,
      });
    }
    // MP fermés : on le ping dans le salon
    await interaction.reply({
      content: `🔔 <@${config.ownerId}>, ${interaction.user} veut te parler :\n> ${truncate(text, 1500).replace(/\n/g, '\n> ')}`,
      allowedMentions: { users: [config.ownerId] },
    });
  },

  async reset(client, interaction) {
    const cleared = forget(historyKeyFor(interaction));
    await interaction.reply({
      content: cleared ? '🧹 Mémoire de la conv effacée, on repart de zéro !' : 'Y avait rien en mémoire ici tkt 👌',
      flags: MessageFlags.Ephemeral,
    });
  },

  async aide(client, interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🤖 ${client.user.username}, ton assistant IA`)
      .setDescription(`${config.aiChannelIds.length
        ? `Écris simplement dans ${config.aiChannelIds.map((id) => `<#${id}>`).join(', ')} : je réponds à chaque message (sauf si tu parles à quelqu'un d'autre).`
        : `Mentionne-moi (${client.user}) ou réponds à un de mes messages pour discuter.`} Je me souviens de la conv, je lis les images, PDF, fichiers et les liens que tu m'envoies.`)
      .addFields(
        { name: '💬 Questions', value: '`/ask` pose une question\n`/explique` un sujet (simple → expert)\n`/code` aide en programmation\n`/resume` résume le salon' },
        ...(config.limits.imagesEnabled
          ? [{ name: '🎨 Images', value: '`/image` génère une image\n`/modifier-image` retouche une image\nOu écris « génère une image de… »' }]
          : []),
        { name: '📝 Outils', value: '`/corriger` orthographe\n`/traduire` traduction\n`/rappel` rappel perso\n`/sondage` sondage rapide\n`/quiz` question de quiz' },
        { name: '🖱️ Clic droit sur un message', value: 'Applications › **Expliquer ce message** / **Traduire en français**' },
        { name: '🆘 Besoin du chef ?', value: `\`/contacter-chef\`, ou demande-moi : si jsais pas, je préviens <@${config.ownerId}> direct.` },
        { name: '🧹 Divers', value: '`/reset` efface ma mémoire ici · `/ping` état du bot' },
      )
      .setFooter({ text: `Propulsé par Gemini${config.limits.imagesEnabled ? ` · ${config.limits.imagesPerDay} images/jour par personne` : ''}` });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  async ping(client, interaction) {
    const voice = interaction.guild ? voiceStatus(interaction.guild) : '—';
    await interaction.reply({
      content: `🏓 Pong ! Latence : **${Math.round(client.ws.ping)} ms** · Vocal : ${voice}`,
      flags: MessageFlags.Ephemeral,
    });
  },

  async admin(client, interaction) {
    if (!isOwner(interaction.user)) {
      return interaction.reply({ content: '🔒 Commande réservée au chef.', flags: MessageFlags.Ephemeral });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'voc') {
      if (!interaction.guild) return interaction.reply({ content: 'À utiliser dans le serveur.', flags: MessageFlags.Ephemeral });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ok = await rejoinVoice(interaction.guild);
      return interaction.editReply(ok
        ? `🎧 Reconnecté : ${voiceStatus(interaction.guild)}`
        : `⚠️ Pas réussi à rejoindre le vocal. Vérifie qu'il existe un salon vocal contenant « ${config.voice.channelName} » dans la catégorie « ${config.voice.categoryName} » et que j'ai la permission Se connecter.`);
    }

    const uptime = process.uptime();
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('📊 Stats du bot')
      .addFields(
        { name: 'En ligne depuis', value: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}min`, inline: true },
        { name: 'Serveurs', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Latence', value: `${Math.round(client.ws.ping)} ms`, inline: true },
        { name: 'RAM', value: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} Mo`, inline: true },
        { name: 'Convs en mémoire', value: `${memoryStats()}`, inline: true },
        { name: "Images aujourd'hui", value: `${await imagesToday()}`, inline: true },
        { name: 'Vocal', value: interaction.guild ? voiceStatus(interaction.guild) : '—', inline: true },
        { name: 'Stockage', value: storageBackend, inline: true },
        { name: 'Modèles', value: `Chat : \`${config.models.chat}\`\nSecours : \`${config.models.fallback}\`\nImage : \`${config.models.image}\`\nImage Pro : \`${config.models.imagePro}\`` },
      );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

async function handleContextMenu(client, interaction) {
  if (cooldownGuard(interaction, 'chat', config.limits.chatCooldownMs)) return;
  const target = interaction.targetMessage;
  if (!target.content && !target.attachments.size) {
    return interaction.reply({ content: 'Ce message est vide (ou je peux pas le lire).', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (interaction.commandName === 'Traduire en français') {
    const { text } = await chat({
      system: toolPrompt(client.user.username, 'Tu es un traducteur professionnel. Traduction naturelle et fidèle.'),
      content: [{ type: 'text', text: `Traduis en français (s'il est déjà en français, traduis en anglais). Donne uniquement la traduction.\n\n${target.content}` }],
      web: false,
    });
    return sendChunks(interaction, splitMessage(text || 'Rien à traduire.'), { ephemeral: true });
  }

  const { content, notes } = await attachmentsToContent(target.attachments);
  const author = target.member?.displayName ?? target.author.username;
  const { chunks } = await askAI({
    ...askContext(client, interaction),
    prompt: `Explique-moi ce message de ${author} : "${target.content || '(voir pièce jointe)'}"`,
    extraContent: content,
    notes,
    instructions: 'Explique le sens du message (et les termes, références, abréviations ou le code qu\'il contient) de façon simple et courte.',
  });
  await sendChunks(interaction, chunks, { ephemeral: true });
}
