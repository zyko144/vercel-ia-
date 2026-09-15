import { EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { chat, describeError, errorDetail } from '../ai/gemini.js';
import { toolPrompt } from '../ai/persona.js';
import { COMMANDS_ALLOWED_EVERYWHERE } from '../commands/definitions.js';
import { askAI, channelLink } from '../features/chat.js';
import { dmOwner, whereLabel } from '../features/escalation.js';
import { createImageMessage } from '../features/images.js';
import { hitCooldown, imagesToday } from '../features/limits.js';
import { conversationKey, forget, memoryStats } from '../features/memory.js';
import { createQuiz, handleQuizButton } from '../features/quiz.js';
import { addReminder, parseDuration } from '../features/reminders.js';
import { rejoinVoice, voiceStatus } from '../features/voice.js';
import { storageBackend } from '../storage.js';
import { allowedChannelsMention, attachmentsToContent, fetchBase64, isAllowedChannel, truncate } from '../utils/discord.js';
import { buildAnswerPayload, handleCopyButton, handleCopyModal } from '../utils/reply.js';
import { MODERATION_HANDLERS } from './moderation.js';
import { UTILITY_HANDLERS } from './utility.js';

const EXPLAIN_LEVELS = {
  simple: "Explique comme à quelqu'un de 12 ans : mots simples, une analogie de la vie de tous les jours, pas de jargon.",
  normal: 'Explique clairement et de façon structurée, avec un exemple concret.',
  expert: 'Explication détaillée et rigoureuse, avec les termes techniques exacts, les nuances et les cas particuliers.',
};

// Toutes les réponses sont visibles seulement par la personne qui a tapé la commande
const PRIVATE = { flags: MessageFlags.Ephemeral };
const isOwner = (user) => user.id === config.ownerId;

export async function onInteraction(client, interaction) {
  try {
    // Boutons et fenêtres (ils n'existent que là où le bot a déjà répondu)
    if (interaction.isButton()) {
      if (interaction.customId === 'copy:code') return await handleCopyButton(interaction);
      if (interaction.customId.startsWith('quiz')) return await handleQuizButton(client, interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'copy-modal') return await handleCopyModal(interaction);
      return;
    }
    if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;

    if (!COMMANDS_ALLOWED_EVERYWHERE.has(interaction.commandName) && !isAllowedChannel(interaction.channel, interaction.channelId)) {
      return await interaction.reply({ content: `👉 Cette commande marche que dans ${allowedChannelsMention()}, viens me parler là-bas !`, ...PRIVATE });
    }

    if (interaction.isMessageContextMenuCommand()) return await handleContextMenu(client, interaction);
    const handler = SLASH_HANDLERS[interaction.commandName] ?? MODERATION_HANDLERS[interaction.commandName] ?? UTILITY_HANDLERS[interaction.commandName];
    if (handler) await handler(client, interaction);
  } catch (err) {
    console.error(`[interaction] ${interaction.commandName ?? interaction.customId}`, err.body ? errorDetail(err) : err);
    const payload = { content: `❌ ${err.body ? describeError(err) : "Ça a pas marché (permission manquante ou erreur Discord). Réessaie stp."}`, ...PRIVATE };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}

function cooldownGuard(interaction, bucket, ms) {
  const wait = hitCooldown(interaction.user.id, bucket, ms);
  if (!wait) return false;
  interaction.reply({ content: `⏳ Doucement, attends encore ${Math.ceil(wait / 1000)}s stp.`, ...PRIVATE }).catch(() => {});
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
    visibility: 'private',
  };
}

const historyKeyFor = (interaction) => conversationKey({ userId: interaction.user.id });

async function fileContent(interaction, optionName) {
  const file = interaction.options.getAttachment(optionName);
  return file ? attachmentsToContent(new Map([[file.id, file]])) : { content: [], notes: [] };
}

async function simpleTool(client, interaction, { task, prompt }) {
  await interaction.deferReply(PRIVATE);
  const { text } = await chat({
    system: toolPrompt(client.user.username, task),
    content: [{ type: 'text', text: prompt }],
    web: false,
  });
  await interaction.editReply(buildAnswerPayload({ text: text || "J'ai rien pu en tirer, désolé." }));
}

const SLASH_HANDLERS = {
  async ask(client, interaction) {
    if (cooldownGuard(interaction, 'chat', config.limits.chatCooldownMs)) return;
    await interaction.deferReply(PRIVATE);
    const { content, notes } = await fileContent(interaction, 'fichier');
    await interaction.editReply(await askAI({
      ...askContext(client, interaction),
      prompt: interaction.options.getString('question', true),
      extraContent: content,
      notes,
      historyKey: historyKeyFor(interaction),
    }));
  },

  async image(client, interaction) {
    if (cooldownGuard(interaction, 'image', 15_000)) return;
    await interaction.deferReply(PRIVATE);
    await interaction.editReply(await createImageMessage({
      user: interaction.user,
      prompt: interaction.options.getString('prompt', true),
      aspectRatio: interaction.options.getString('format') ?? undefined,
      pro: interaction.options.getBoolean('pro') ?? false,
    }));
  },

  async 'modifier-image'(client, interaction) {
    if (cooldownGuard(interaction, 'image', 15_000)) return;
    const attachments = [interaction.options.getAttachment('image', true), interaction.options.getAttachment('image2')].filter(Boolean);
    if (attachments.some((a) => !a.contentType?.startsWith('image/'))) {
      return interaction.reply({ content: 'Envoie une vraie image stp (png, jpg, webp).', ...PRIVATE });
    }
    await interaction.deferReply(PRIVATE);
    const images = [];
    if (config.limits.imagesEnabled) {
      for (const att of attachments) images.push({ mimeType: att.contentType.split(';')[0], data: await fetchBase64(att.url) });
    }
    await interaction.editReply(await createImageMessage({
      user: interaction.user,
      prompt: interaction.options.getString('consigne', true),
      images,
    }));
  },

  async explique(client, interaction) {
    if (cooldownGuard(interaction, 'chat', config.limits.chatCooldownMs)) return;
    await interaction.deferReply(PRIVATE);
    const level = interaction.options.getString('niveau') ?? 'normal';
    await interaction.editReply(await askAI({
      ...askContext(client, interaction),
      prompt: `Explique-moi : ${interaction.options.getString('sujet', true)}`,
      instructions: `${EXPLAIN_LEVELS[level]} Termine par un mini résumé en 1 phrase et, si pertinent, 1 ou 2 liens pour approfondir.`,
      historyKey: historyKeyFor(interaction),
      thinking: level === 'expert' ? 'high' : undefined,
    }));
  },

  async code(client, interaction) {
    if (cooldownGuard(interaction, 'chat', config.limits.chatCooldownMs)) return;
    await interaction.deferReply(PRIVATE);
    const lang = interaction.options.getString('langage');
    const { content, notes } = await fileContent(interaction, 'fichier');
    await interaction.editReply(await askAI({
      ...askContext(client, interaction),
      prompt: `${lang ? `[Langage : ${lang}] ` : ''}${interaction.options.getString('demande', true)}`,
      extraContent: content,
      notes,
      instructions: "Tu es un dev senior pédagogue. Donne du code complet, fonctionnel et commenté juste ce qu'il faut, dans des blocs avec le bon langage. S'il y a un bug, explique la cause puis la correction. Explique les points clés en quelques puces. Mets un lien vers la doc officielle si utile.",
      historyKey: historyKeyFor(interaction),
      thinking: 'high',
    }));
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
    await interaction.deferReply(PRIVATE);
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

    await interaction.editReply(await askAI({
      ...askContext(client, interaction),
      prompt: `Résume cette conversation du salon :\n\n${transcript}`,
      instructions: "Fais un résumé clair : les sujets abordés en puces (qui a dit quoi d'important), les décisions ou infos à retenir, et les questions restées sans réponse. Pas de mention (@).",
      web: false,
    }));
  },

  async quiz(client, interaction) {
    if (cooldownGuard(interaction, 'quiz', 10_000)) return;
    await interaction.deferReply(PRIVATE);
    await interaction.editReply(await createQuiz({
      botName: client.user.username,
      userId: interaction.user.id,
      topic: interaction.options.getString('sujet', true),
      difficulty: interaction.options.getString('difficulte') ?? 'moyen',
    }));
  },

  async rappel(client, interaction) {
    const delayMs = parseDuration(interaction.options.getString('dans', true));
    if (!delayMs || delayMs < 10_000) {
      return interaction.reply({ content: 'Durée pas comprise 🤔 Exemples : `10m`, `2h`, `1h30`, `3j`.', ...PRIVATE });
    }
    const text = interaction.options.getString('message', true);
    const { error, reminder } = await addReminder({
      userId: interaction.user.id,
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      text,
      delayMs,
    });
    if (error) return interaction.reply({ content: `❌ ${error}`, ...PRIVATE });
    const when = Math.floor(reminder.at / 1000);
    await interaction.reply({
      content: `✅ C'est noté ! Je te rappelle **${truncate(text, 200)}** en MP <t:${when}:R> (<t:${when}:f>).`,
      ...PRIVATE,
    });
  },

  // Seule commande publique : un sondage sert à faire voter tout le monde
  async sondage(client, interaction) {
    const answers = interaction.options.getString('choix', true).split('|').map((s) => s.trim()).filter(Boolean);
    if (answers.length < 2 || answers.length > 10 || answers.some((a) => a.length > 55)) {
      return interaction.reply({ content: 'Il faut entre **2 et 10 choix** séparés par `|`, et chaque choix fait max 55 caractères.', ...PRIVATE });
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
      return interaction.reply({ content: `✅ Message envoyé au chef en MP ! Tu peux aussi le contacter direct : <@${config.ownerId}>`, ...PRIVATE });
    }
    // MP du chef fermés : on le ping dans le salon, sans afficher le message
    await interaction.channel?.send({
      content: `🔔 <@${config.ownerId}>, ${interaction.user} veut te parler (ouvre tes MP pour recevoir son message).`,
      allowedMentions: { users: [config.ownerId] },
    }).catch(() => {});
    await interaction.reply({ content: `✅ Le chef a été pingé. Contacte-le aussi direct : <@${config.ownerId}>`, ...PRIVATE });
  },

  async reset(client, interaction) {
    const cleared = forget(historyKeyFor(interaction));
    await interaction.reply({
      content: cleared ? "🧹 Mémoire de l'IA effacée, on repart de zéro ! (`/clear` pour supprimer aussi ton fil privé)" : 'Y avait rien en mémoire tkt 👌',
      ...PRIVATE,
    });
  },

  async aide(client, interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🤖 ${client.user.username}, ton assistant IA`)
      .setDescription(`${config.aiChannelIds.length
        ? `Écris dans ${config.aiChannelIds.map((id) => `<#${id}>`).join(', ')} : ta question part dans **ton fil privé**, personne d'autre (à part les admins) voit la conversation.`
        : `Mentionne-moi (${client.user}) pour discuter.`}\nToutes les réponses aux commandes sont visibles **que par toi**.`)
      .addFields(
        { name: '💬 IA', value: '`/ask` question · `/explique` un sujet · `/code` aide en code · `/corriger` orthographe · `/traduire` traduction · `/resume` résume le salon · `/quiz` quiz perso' },
        ...(config.limits.imagesEnabled ? [{ name: '🎨 Images', value: '`/image` génère · `/modifier-image` retouche' }] : []),
        { name: '🧰 Pratique', value: '`/rappel` rappel en MP · `/sondage` sondage public · `/contacter-chef` écrire au chef · `/clear` efface ta conv IA · `/reset` efface juste la mémoire' },
        { name: '🛡️ Modération', value: '`/clear nombre` · `/kick` · `/ban` · `/unban` · `/mute` · `/unmute` · `/warn` · `/warns` · `/slowmode` · `/lock` · `/unlock` · `/role` · `/say`' },
        { name: 'ℹ️ Infos & fun', value: '`/userinfo` · `/serverinfo` · `/avatar` · `/pile-ou-face` · `/de` · `/choisir` · `/ping`' },
        { name: '🖱️ Clic droit sur un message', value: 'Applications › **Expliquer ce message** / **Traduire en français**' },
        { name: '🆘 Besoin du chef ?', value: `\`/contacter-chef\`, ou demande à l'IA : si elle sait pas, elle prévient <@${config.ownerId}>.` },
      )
      .setFooter({ text: 'Propulsé par Gemini · 📋 bouton « Copier le code » sous les réponses avec du code' });
    await interaction.reply({ embeds: [embed], ...PRIVATE });
  },

  async ping(client, interaction) {
    const voice = interaction.guild ? voiceStatus(interaction.guild) : '—';
    await interaction.reply({ content: `🏓 Pong ! Latence : **${Math.round(client.ws.ping)} ms** · Vocal : ${voice}`, ...PRIVATE });
  },

  async admin(client, interaction) {
    if (!isOwner(interaction.user)) return interaction.reply({ content: '🔒 Commande réservée au chef.', ...PRIVATE });

    if (interaction.options.getSubcommand() === 'voc') {
      if (!interaction.guild) return interaction.reply({ content: 'À utiliser dans le serveur.', ...PRIVATE });
      await interaction.deferReply(PRIVATE);
      const ok = await rejoinVoice(interaction.guild);
      return interaction.editReply(ok
        ? `🎧 Reconnecté : ${voiceStatus(interaction.guild)}`
        : "⚠️ Pas réussi à rejoindre le vocal. Vérifie l'ID du salon vocal et que j'ai la permission Se connecter.");
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
        { name: 'Modèles', value: `Chat : \`${config.models.chat}\` (réflexion ${config.models.thinkingLevel})\nSecours : \`${config.models.fallback}\`` },
      );
    await interaction.reply({ embeds: [embed], ...PRIVATE });
  },
};

async function handleContextMenu(client, interaction) {
  if (cooldownGuard(interaction, 'chat', config.limits.chatCooldownMs)) return;
  const target = interaction.targetMessage;
  const targetText = target.content || target.embeds.map((e) => e.description ?? '').join('\n');
  if (!targetText && !target.attachments.size) {
    return interaction.reply({ content: 'Ce message est vide (ou je peux pas le lire).', ...PRIVATE });
  }
  await interaction.deferReply(PRIVATE);

  if (interaction.commandName === 'Traduire en français') {
    const { text } = await chat({
      system: toolPrompt(client.user.username, 'Tu es un traducteur professionnel. Traduction naturelle et fidèle.'),
      content: [{ type: 'text', text: `Traduis en français (s'il est déjà en français, traduis en anglais). Donne uniquement la traduction.\n\n${targetText}` }],
      web: false,
    });
    return interaction.editReply(buildAnswerPayload({ text: text || 'Rien à traduire.' }));
  }

  const { content, notes } = await attachmentsToContent(target.attachments);
  const author = target.member?.displayName ?? target.author.username;
  await interaction.editReply(await askAI({
    ...askContext(client, interaction),
    prompt: `Explique-moi ce message de ${author} : "${truncate(targetText || '(voir pièce jointe)', 3000)}"`,
    extraContent: content,
    notes,
    instructions: "Explique le sens du message (et les termes, références, abréviations ou le code qu'il contient) de façon simple et courte.",
  }));
}
