import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { handleBlindTestComponent, isBlindTestComponent } from '../music/blindtest.js';
import { config } from '../config.js';
import { chat, describeError, errorDetail } from '../ai/gemini.js';
import { toolPrompt } from '../ai/persona.js';
import { COMMANDS_ALLOWED_EVERYWHERE } from '../commands/definitions.js';
import { askAI, channelLink, pausedAnswer } from '../features/chat.js';
import { isAllowed, loginLinkFor } from '../dashboard/auth.js';
import { reportProblem } from '../features/alerts.js';
import { dmOwner, whereLabel } from '../features/escalation.js';
import { createImageMessage } from '../features/images.js';
import { handleReport, handleReportButton } from '../features/report.js';
import { handleTribunalComponent, isTribunalComponent } from '../features/tribunal.js';
import { hitCooldown, imagesToday } from '../features/limits.js';
import { conversationKey, forget, memoryStats } from '../features/memory.js';
import { createQuiz, handleQuizButton } from '../features/quiz.js';
import { addReminder, parseDuration } from '../features/reminders.js';
import { rejoinVoice, voiceStatus } from '../features/voice.js';
import { storageBackend } from '../storage.js';
import { allowedChannelsMention, attachmentsToContent, fetchBase64, isAllowedChannel, truncate } from '../utils/discord.js';
import { buildAnswerPayload, handleCopyButton, handleCopyModal } from '../utils/reply.js';
import { MUSIC_COMMAND_NAMES } from '../music/commands.js';
import { handleLiveComponent, handleMusicAutocomplete, handleMusicCommand, handleMusicComponent, isLiveComponent, isMusicComponent } from '../music/handlers.js';
import { lavalink } from '../music/lavalink.js';
import { allPlayers } from '../music/player.js';
import { GAME_HANDLERS, handleGameAutocomplete, handleGameComponent, isGameComponent } from '../games/index.js';
import { MODERATION_HANDLERS } from './moderation.js';
import { UTILITY_HANDLERS } from './utility.js';
import { handlePanelComponent, isPanelCommand, isPanelComponent, openPanel } from '../panels/index.js';
import { handleAiActionComponent, isAiActionComponent } from '../features/aiActions.js';
import { handleTicketComponent, isTicketComponent } from '../features/tickets.js';
import { handleBuildComponent, isBuildComponent } from '../features/build.js';
import { countEvent } from '../features/weekly.js';
import { handlePremiumComponent, isPremiumComponent } from '../features/premiumPanel.js';
import { handleSecurityComponent, isSecurityComponent } from '../features/security.js';
import { handleShopComponent, isShopComponent } from '../features/levels.js';
import { handleMemoryComponent, isMemoryComponent } from '../features/aiExtras.js';
import { handleBackupComponent, handleSuggestionComponent, isBackupComponent, isSuggestionComponent } from '../features/community.js';

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
    if (interaction.isAutocomplete()) {
      if (MUSIC_COMMAND_NAMES.has(interaction.commandName)) return await handleMusicAutocomplete(interaction);
      return await handleGameAutocomplete(interaction);
    }
    // Boutons, menus et fenêtres (ils n'existent que là où le bot a déjà répondu)
    if (isPanelComponent(interaction)) return await handlePanelComponent(client, interaction);
    if (isAiActionComponent(interaction)) return await handleAiActionComponent(client, interaction);
    if (isTicketComponent(interaction)) return await handleTicketComponent(client, interaction);
    if (isBuildComponent(interaction)) return await handleBuildComponent(client, interaction);
    if (isPremiumComponent(interaction)) return await handlePremiumComponent(client, interaction);
    if (isSecurityComponent(interaction)) return await handleSecurityComponent(client, interaction);
    if (isShopComponent(interaction)) return await handleShopComponent(client, interaction);
    if (isMemoryComponent(interaction)) return await handleMemoryComponent(client, interaction);
    if (isSuggestionComponent(interaction)) return await handleSuggestionComponent(client, interaction);
    if (isBackupComponent(interaction)) return await handleBackupComponent(client, interaction);
    if (isGameComponent(interaction)) return await handleGameComponent(client, interaction);
    if (isBlindTestComponent(interaction)) return await handleBlindTestComponent(client, interaction);
    if (isMusicComponent(interaction)) return await handleMusicComponent(client, interaction);
    if (isLiveComponent(interaction)) return await handleLiveComponent(client, interaction);
    if (isTribunalComponent(interaction)) return await handleTribunalComponent(client, interaction);
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('report:')) return await handleReportButton(client, interaction);
      if (interaction.customId === 'copy:code') return await handleCopyButton(interaction);
      if (interaction.customId.startsWith('quiz')) return await handleQuizButton(client, interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'copy-modal') return await handleCopyModal(interaction);
      return;
    }
    if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;
    // Les 6 commandes principales ouvrent un panneau
    if (isPanelCommand(interaction)) return await openPanel(client, interaction);
    return await runCommand(client, interaction);
  } catch (err) {
    // Clic déjà traité (double clic, ou 2e copie du bot) ou arrivé trop tard : rien à montrer ni à signaler.
    if (err?.code === 10062 || err?.code === 40060) {
      console.warn(`[interaction] ${interaction.commandName ?? interaction.customId} : ${err.code === 10062 ? 'clic expiré' : 'déjà traité'} (une 2e copie du bot tourne ?)`);
      return;
    }
    console.error(`[interaction] ${interaction.commandName ?? interaction.customId}`, err.body ? errorDetail(err) : err);
    const payload = { content: `❌ ${err.body ? describeError(err) : "Ça a pas marché (permission manquante ou erreur Discord). Réessaie stp."}`, ...PRIVATE };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
    reportProblem({
      what: interaction.commandName ? `/${interaction.commandName}` : `bouton ${interaction.customId}`,
      error: err.body ? errorDetail(err) : err,
      userId: interaction.user.id,
      guild: interaction.guild,
      channelId: interaction.channelId,
      shown: payload.content,
    }).catch(() => {});
  }
}

/**
 * Exécute une commande par son nom (les anciennes commandes sont maintenant des actions des panneaux :
 * le panneau passe ici une interaction qui se présente comme la commande d'origine).
 */
export async function runCommand(client, interaction) {
  if (!COMMANDS_ALLOWED_EVERYWHERE.has(interaction.commandName) && !isAllowedChannel(interaction.channel, interaction.channelId)) {
    return interaction.reply({ content: `👉 Ça marche que dans ${allowedChannelsMention()}, viens me parler là-bas !`, ...PRIVATE });
  }
  if (interaction.commandName.startsWith('jeu-') && !interaction.options?.getBoolean?.('arreter')) countEvent(interaction.guildId, 'jeux');
  if (interaction.commandName === 'Signaler au staff') return handleReport(client, interaction);
  if (interaction.isMessageContextMenuCommand()) return handleContextMenu(client, interaction);
  if (MUSIC_COMMAND_NAMES.has(interaction.commandName)) return handleMusicCommand(client, interaction);
  const handler = SLASH_HANDLERS[interaction.commandName] ?? GAME_HANDLERS[interaction.commandName] ?? MODERATION_HANDLERS[interaction.commandName] ?? UTILITY_HANDLERS[interaction.commandName];
  if (handler) return handler(client, interaction);
  return undefined;
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
    tag: 'commandes',
  };
}

const historyKeyFor = (interaction) => conversationKey({ userId: interaction.user.id });

async function fileContent(interaction, optionName) {
  const file = interaction.options.getAttachment(optionName);
  return file ? attachmentsToContent(new Map([[file.id, file]])) : { content: [], notes: [] };
}

async function simpleTool(client, interaction, { task, prompt }) {
  await interaction.deferReply(PRIVATE);
  const paused = pausedAnswer(interaction.user.id);
  if (paused) return interaction.editReply(paused);
  const { text } = await chat({
    system: toolPrompt(client.user.username, task),
    content: [{ type: 'text', text: prompt }],
    web: false,
    tag: 'outils',
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

  async 'resume-salon'(client, interaction) {
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

  async 'jeu-quiz'(client, interaction) {
    if (cooldownGuard(interaction, 'quiz', 10_000)) return;
    // Dans │・mini-jeux, tout le monde voit le quiz et peut répondre
    await interaction.deferReply(interaction.channelId === config.games.miniGamesChannelId ? {} : PRIVATE);
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
      content: cleared ? "🧹 Mémoire de l'IA effacée, on repart de zéro ! (**/ia** › Effacer ma conversation supprime aussi ton fil privé)" : 'Y avait rien en mémoire tkt 👌',
      ...PRIVATE,
    });
  },

  async aide(client, interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🤖 ${client.user.username} : 6 commandes, tout est dedans`)
      .setDescription(`Chaque commande ouvre un **panneau** : choisis une action dans le menu, remplis la petite fenêtre, c'est fait.${config.aiChannelIds.length
        ? `\nDans ${config.aiChannelIds.map((id) => `<#${id}>`).join(', ')}, écris directement : ta question part dans **ton fil privé**.`
        : ''}\nAilleurs, mentionne-moi (${client.user}).`)
      .addFields(
        { name: '🧠 /ia', value: 'Questions, explications, code, correction, traduction, résumé du salon, images, IA vocale.' },
        { name: '🎮 /jeux', value: 'Loup-garou, imposteur, histoire, freestyle, quiz, rébus, blind test et tous les « devine », Fantasy Rap, dés, pile ou face.' },
        { name: '🎵 /musique', value: 'Jouer, pause, file d’attente, volume, effets, paroles, karaoké, radio, playlists, Spotify.' },
        { name: '🧭 /serveur', value: 'Infos, rôles, faire parler le bot, sondages, rappels, contacter le chef, premium et essai gratuit.' },
        { name: '🛡️ /sanction', value: 'Avertir, rendre muet, expulser, bannir, supprimer des messages, mode lent, verrouiller (modérateurs).' },
        { name: '🧩 /pannel', value: 'Panneau de tickets et annonces avec aperçu, construction de salons en un clic (administrateurs).' },
        { name: '🖱️ Clic droit sur un message', value: 'Applications › **Expliquer ce message** / **Traduire en français** / **Signaler au staff**' },
        { name: '🆘 Besoin du chef ?', value: `**/serveur** › Contacter le chef, ou demande à l'IA : si elle sait pas, elle prévient <@${config.ownerId}>.` },
      )
      .setFooter({ text: 'AI Vercel · chaque réponse arrive dans un embed, visible que par toi' });
    await interaction.reply({ embeds: [embed], ...PRIVATE });
  },

  async ping(client, interaction) {
    const voice = interaction.guild ? voiceStatus(interaction.guild) : '—';
    await interaction.reply({ content: `🏓 Pong ! Latence : **${Math.round(client.ws.ping)} ms** · Vocal : ${voice}`, ...PRIVATE });
  },

  async admin(client, interaction) {
    // Le tableau de bord est ouvert au chef et aux comptes de DASHBOARD_ADMINS.
    if (interaction.options.getSubcommand() === 'dashboard') {
      if (!isAllowed(interaction.user.id)) return interaction.reply({ content: '🔒 Le tableau de bord est réservé au chef.', ...PRIVATE });
      const url = loginLinkFor(interaction.user.id);
      return interaction.reply({
        content: '🔐 Ton lien de connexion au tableau de bord. Il marche **une seule fois**, pendant **10 minutes**. Ne le partage à personne.',
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel('Ouvrir le tableau de bord').setEmoji('📊'))],
        ...PRIVATE,
      });
    }
    if (!isOwner(interaction.user)) return interaction.reply({ content: '🔒 Commande réservée au chef.', ...PRIVATE });

    if (interaction.options.getSubcommand() === 'voc') {
      if (!interaction.guild) return interaction.reply({ content: 'À utiliser dans le serveur.', ...PRIVATE });
      await interaction.deferReply(PRIVATE);
      const ok = await rejoinVoice(interaction.guild);
      return interaction.editReply(ok
        ? `🎧 Reconnecté : ${voiceStatus(interaction.guild)}`
        : "⚠️ Pas réussi à rejoindre le vocal (ou la musique tient le vocal en ce moment). Vérifie l'ID du salon et la permission Se connecter.");
    }

    if (interaction.options.getSubcommand() === 'musique') {
      const nodes = lavalink.status();
      const players = allPlayers();
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎶 Serveurs audio (musique)')
        .setDescription(nodes.length
          ? nodes.map((n) => {
            const state = n.connected ? (n.incompatible ? '⛔ refusé par Discord' : n.broken ? '⚠️ problèmes de lecture' : '✅ connecté') : '❌ hors ligne';
            return `**${n.name}** ${n.secure ? '🔒' : ''} · ${state}${n.version ? ` · v${n.version}` : ''}${n.connected ? ` · ${n.players} lecteur(s)` : ''}`;
          }).join('\n')
          : 'Aucun serveur audio configuré (lecteur local uniquement).')
        .addFields(
          { name: 'Moteur', value: players.length ? players.map((p) => `${p.guild.name} : ${p.backend?.name ?? 'inactif'}`).join('\n') : 'Aucune musique en cours' },
          { name: 'Derniers événements', value: lavalink.logs.length ? lavalink.logs.slice(-8).map((l) => `<t:${Math.floor(l.at / 1000)}:t> ${truncate(l.text, 90)}`).join('\n') : 'Rien à signaler' },
        );
      return interaction.reply({ embeds: [embed], ...PRIVATE });
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
  const paused = pausedAnswer(interaction.user.id);
  if (paused) return interaction.editReply(paused);

  if (interaction.commandName === 'Traduire en français') {
    const { text } = await chat({
      system: toolPrompt(client.user.username, 'Tu es un traducteur professionnel. Traduction naturelle et fidèle.'),
      content: [{ type: 'text', text: `Traduis en français (s'il est déjà en français, traduis en anglais). Donne uniquement la traduction.\n\n${targetText}` }],
      web: false,
      tag: 'clic droit',
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
