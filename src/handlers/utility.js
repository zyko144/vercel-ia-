// Commandes d'infos et petits jeux (réponses visibles seulement par la personne).
import { ChannelType, EmbedBuilder, GuildPremiumTier, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { startVoiceSession, stopVoiceSession } from '../voice-ai/assistant.js';
import { load } from '../storage.js';
import { BRAND_COLOR } from '../utils/reply.js';
import { truncate } from '../utils/discord.js';

const ts = (ms, style = 'D') => `<t:${Math.floor(ms / 1000)}:${style}>`;
const private_ = (payload) => ({ ...payload, flags: MessageFlags.Ephemeral });
const random = (max) => Math.floor(Math.random() * max);

export const UTILITY_HANDLERS = {
  async vocal(client, interaction) {
    const reply = (content) => (interaction.deferred ? interaction.editReply(content) : interaction.reply({ content, flags: MessageFlags.Ephemeral }));
    if (interaction.options.getBoolean('arreter')) {
      return reply((await stopVoiceSession(interaction.user.id)) ? '🎙️ Conversation arrêtée.' : "Y a pas de conversation en cours avec toi.");
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await startVoiceSession({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      userName: interaction.member?.displayName ?? interaction.user.username,
      memberChannelId: interaction.member?.voice?.channelId ?? null,
    });
    if (result.error) return reply(result.error);
    if (result.stopped) return reply('🎙️ Conversation arrêtée.');
    return reply(`🎙️ Je t'écoute ! Parle normalement, je te réponds à voix haute.\n-# Je peux aussi gérer la musique (« mets du Jul », « pause », « passe »). Je m'arrête après ${config.voiceAi.idleSeconds} s sans parler, si tu dis « au revoir », ou avec \`/vocal arreter:true\`.`);
  },

  async userinfo(client, interaction) {
    const user = await (interaction.options.getUser('membre') ?? interaction.user).fetch();
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const warnings = (await load('warnings', {}))[interaction.guildId]?.[user.id]?.length ?? 0;

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor || BRAND_COLOR)
      .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
      .setThumbnail((member ?? user).displayAvatarURL({ size: 512 }))
      .addFields(
        { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
        { name: '🤖 Bot', value: user.bot ? 'Oui' : 'Non', inline: true },
        { name: '⚠️ Avertissements', value: `${warnings}`, inline: true },
        { name: '📅 Compte créé', value: `${ts(user.createdTimestamp)} (${ts(user.createdTimestamp, 'R')})`, inline: true },
      );

    if (member) {
      const roles = member.roles.cache
        .filter((r) => r.id !== interaction.guildId)
        .sort((a, b) => b.position - a.position);
      const roleList = roles.first(15).map((r) => `${r}`).join(' ') || 'Aucun';
      embed.addFields(
        { name: '📥 Arrivée sur le serveur', value: `${ts(member.joinedTimestamp)} (${ts(member.joinedTimestamp, 'R')})`, inline: true },
        { name: `🎭 Rôles (${roles.size})`, value: truncate(`${roleList}${roles.size > 15 ? ' …' : ''}`, 1024) },
      );
      if (member.isCommunicationDisabled()) {
        embed.addFields({ name: '🔇 Mute', value: `jusqu'à ${ts(member.communicationDisabledUntilTimestamp, 'f')}` });
      }
    } else {
      embed.setFooter({ text: "Cette personne est pas sur le serveur" });
    }
    if (user.bannerURL()) embed.setImage(user.bannerURL({ size: 1024 }));

    await interaction.reply(private_({ embeds: [embed] }));
  },

  async serverinfo(client, interaction) {
    const guild = await client.guilds.fetch({ guild: interaction.guildId, withCounts: true, force: true });
    const channels = guild.channels.cache;
    const count = (...types) => channels.filter((c) => types.includes(c.type)).size;
    const tiers = { [GuildPremiumTier.None]: 'Aucun', [GuildPremiumTier.Tier1]: 'Niveau 1', [GuildPremiumTier.Tier2]: 'Niveau 2', [GuildPremiumTier.Tier3]: 'Niveau 3' };

    const embed = new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 512 }))
      .addFields(
        { name: '👑 Propriétaire', value: `<@${guild.ownerId}>`, inline: true },
        { name: '🆔 ID', value: `\`${guild.id}\``, inline: true },
        { name: '📅 Créé', value: `${ts(guild.createdTimestamp)} (${ts(guild.createdTimestamp, 'R')})`, inline: true },
        { name: '👥 Membres', value: `${guild.approximateMemberCount ?? guild.memberCount}`, inline: true },
        { name: '🟢 En ligne', value: `${guild.approximatePresenceCount ?? '?'}`, inline: true },
        { name: '🎭 Rôles', value: `${guild.roles.cache.size - 1}`, inline: true },
        { name: '💬 Salons', value: `${count(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)} textuels · ${count(ChannelType.GuildVoice, ChannelType.GuildStageVoice)} vocaux`, inline: true },
        { name: '🚀 Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (${tiers[guild.premiumTier]})`, inline: true },
        { name: '😀 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
      );
    if (guild.description) embed.setDescription(guild.description);
    if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }));

    await interaction.reply(private_({ embeds: [embed] }));
  },

  async avatar(client, interaction) {
    const user = interaction.options.getUser('membre') ?? interaction.user;
    const member = interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null;
    const url = user.displayAvatarURL({ size: 1024 });
    const links = ['png', 'jpg', 'webp', ...(user.avatar?.startsWith('a_') ? ['gif'] : [])]
      .map((ext) => `[${ext.toUpperCase()}](${user.displayAvatarURL({ size: 1024, extension: ext })})`).join(' · ');

    const embeds = [new EmbedBuilder().setColor(BRAND_COLOR).setTitle(`Avatar de ${user.username}`).setDescription(links).setImage(url)];
    if (member?.avatar) {
      embeds.push(new EmbedBuilder().setColor(BRAND_COLOR).setTitle('Avatar sur ce serveur').setImage(member.displayAvatarURL({ size: 1024 })));
    }
    await interaction.reply(private_({ embeds }));
  },

  async 'pile-ou-face'(client, interaction) {
    await interaction.reply(private_({ content: `🪙 La pièce tourne… **${random(2) ? 'Pile' : 'Face'}** !` }));
  },

  async de(client, interaction) {
    const faces = interaction.options.getInteger('faces') ?? 6;
    const amount = interaction.options.getInteger('nombre') ?? 1;
    const rolls = Array.from({ length: amount }, () => random(faces) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);
    await interaction.reply(private_({
      content: `🎲 ${amount > 1 ? `${amount} dés à ${faces} faces : ${rolls.map((r) => `**${r}**`).join(' + ')} = **${total}**` : `Dé à ${faces} faces : **${total}**`}`,
    }));
  },

  async choisir(client, interaction) {
    const options = interaction.options.getString('options', true).split(/[|,]/).map((s) => s.trim()).filter(Boolean);
    if (options.length < 2) return interaction.reply(private_({ content: 'Donne-moi au moins 2 options séparées par `|` 😉' }));
    await interaction.reply(private_({ content: `🤔 Entre ${options.map((o) => `*${truncate(o, 80)}*`).join(', ')}… je choisis **${options[random(options.length)]}** !` }));
  },
};
