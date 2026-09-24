// Communauté : carte de bienvenue, suggestions votées, sauvegarde et restauration du serveur.
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, OverwriteType, PermissionFlagsBits as P,
} from 'discord.js';
import { SANS } from '../casinho/render/engine.js';
import { load, save } from '../storage.js';
import { truncate } from '../utils/discord.js';
import { cfg } from './guildConfig.js';
import { brandingOf } from './premium.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ===================== Carte de bienvenue =====================

async function avatarData(user) {
  try {
    const res = await fetch(user.displayAvatarURL({ extension: 'png', size: 128 }));
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

export async function welcomeCard(member) {
  const avatar = await avatarData(member.user);
  const color = brandingOf(member.guild.id)?.color ? `#${brandingOf(member.guild.id).color.toString(16).padStart(6, '0')}` : '#5ff0ff';
  const W = 800;
  const H = 300;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="20%" r="100%"><stop offset="0" stop-color="#1b1026"/><stop offset="0.6" stop-color="#0b0812"/><stop offset="1" stop-color="#050408"/></radialGradient>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="round"><circle cx="${W / 2}" cy="104" r="66"/></clipPath>
    <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="${color}" stroke-opacity="0.06"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" rx="24" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" rx="24" fill="url(#grid)"/>
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="20" fill="none" stroke="${color}" stroke-width="2.5" filter="url(#glow)"/>
  <circle cx="${W / 2}" cy="104" r="72" fill="none" stroke="${color}" stroke-width="4" filter="url(#glow)"/>
  ${avatar ? `<image href="${avatar}" x="${W / 2 - 66}" y="38" width="132" height="132" clip-path="url(#round)" preserveAspectRatio="xMidYMid slice"/>` : `<circle cx="${W / 2}" cy="104" r="66" fill="#241a33"/>`}
  <g font-family="${SANS}" font-weight="700" text-anchor="middle">
    <text x="${W / 2}" y="214" font-size="30" letter-spacing="6" fill="${color}" filter="url(#glow)">BIENVENUE</text>
    <text x="${W / 2}" y="250" font-size="26" fill="#ffffff">${esc(member.displayName.slice(0, 26))}</text>
    <text x="${W / 2}" y="278" font-size="15" letter-spacing="2" fill="#a9b0c0">MEMBRE N°${member.guild.memberCount} · ${esc(member.guild.name.toUpperCase().slice(0, 30))}</text>
  </g>
</svg>`;
  const { default: sharp } = await import('sharp');
  return new AttachmentBuilder(await sharp(Buffer.from(svg)).png().toBuffer(), { name: 'bienvenue.png' });
}

export async function welcome(member) {
  if (!cfg(member.guild.id, 'welcome.enabled')) return;
  const channel = member.guild.channels.cache.get(cfg(member.guild.id, 'welcome.channelId') ?? '');
  if (!channel?.isTextBased?.()) return;
  const text = String(cfg(member.guild.id, 'welcome.message') ?? '')
    .replaceAll('{membre}', `${member}`).replaceAll('{serveur}', member.guild.name).replaceAll('{numero}', String(member.guild.memberCount));
  const card = await welcomeCard(member).catch(() => null);
  await channel.send({ content: text, files: card ? [card] : [], allowedMentions: { users: [member.id] } }).catch(() => {});
}

// ===================== Suggestions =====================

const STATUS = {
  attente: { label: 'En attente de votes', color: 0x5865f2, emoji: '🗳️' },
  encours: { label: 'En cours de réalisation', color: 0xffc94d, emoji: '🛠️' },
  acceptee: { label: 'Acceptée', color: 0x3dff9a, emoji: '✅' },
  refusee: { label: 'Refusée', color: 0xff3355, emoji: '✖️' },
};

const suggestionButtons = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('sg:acceptee').setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('sg:encours').setLabel('En cours').setEmoji('🛠️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('sg:refusee').setLabel('Refuser').setEmoji('✖️').setStyle(ButtonStyle.Danger),
);

/** Un message dans le salon des suggestions devient une suggestion votée. */
export async function suggestionMessage(message) {
  if (!message.inGuild() || message.author.bot || message.channelId !== cfg(message.guildId, 'suggestions.channelId')) return false;
  const text = message.content?.trim();
  if (!text) return false;
  await message.delete().catch(() => {});
  const s = STATUS.attente;
  const posted = await message.channel.send({
    embeds: [new EmbedBuilder().setColor(s.color).setAuthor({ name: `💡 Suggestion de ${message.member?.displayName ?? message.author.username}`, iconURL: message.author.displayAvatarURL({ size: 64 }) })
      .setDescription(truncate(text, 4000)).addFields({ name: 'Statut', value: `${s.emoji} ${s.label}` }).setFooter({ text: `Vote avec 👍 ou 👎 · ${message.author.id}` }).setTimestamp()],
    components: [suggestionButtons()],
    allowedMentions: { parse: [] },
  }).catch(() => null);
  if (!posted) return true;
  await posted.react('👍').catch(() => {});
  await posted.react('👎').catch(() => {});
  await posted.startThread?.({ name: `💬 ${truncate(text, 60)}`, autoArchiveDuration: 1440 }).catch(() => {});
  return true;
}

export const isSuggestionComponent = (interaction) => /^sg:/.test(interaction.customId ?? '');
export async function handleSuggestionComponent(client, interaction) {
  if (!interaction.memberPermissions?.has(P.ManageMessages)) return interaction.reply({ content: '🔒 Réservé au staff.', ...PRIVATE });
  const status = STATUS[interaction.customId.split(':')[1]];
  const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(status.color)
    .setFields({ name: 'Statut', value: `${status.emoji} ${status.label} · par ${interaction.user}` });
  const up = interaction.message.reactions.cache.get('👍')?.count ?? 1;
  const down = interaction.message.reactions.cache.get('👎')?.count ?? 1;
  embed.addFields({ name: 'Votes', value: `👍 ${up - 1} · 👎 ${down - 1}`, inline: true });
  await interaction.update({ embeds: [embed], components: status === STATUS.acceptee || status === STATUS.refusee ? [] : [suggestionButtons()] });
  const authorId = interaction.message.embeds[0]?.footer?.text?.match(/(\d{15,21})$/)?.[1];
  if (authorId) {
    const user = await client.users.fetch(authorId).catch(() => null);
    await user?.send(`💡 Ta suggestion sur **${interaction.guild.name}** : **${status.emoji} ${status.label}**.\n> ${truncate(interaction.message.embeds[0].description ?? '', 300)}`).catch(() => {});
  }
  return undefined;
}

// ===================== Sauvegarde et restauration =====================

const BACKUP_KEY = 'sauvegardes';

/** Photographie les rôles, catégories, salons et permissions (pas les messages). */
export async function createBackup(guild, byId) {
  const roleName = (id) => (id === guild.id ? '@everyone' : guild.roles.cache.get(id)?.name ?? null);
  const overwrites = (c) => c.permissionOverwrites.cache
    .filter((o) => o.type === OverwriteType.Role && roleName(o.id))
    .map((o) => ({ role: roleName(o.id), allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() }));
  const data = {
    roles: guild.roles.cache.filter((r) => !r.managed && r.id !== guild.id).sort((a, b) => a.position - b.position)
      .map((r) => ({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString() })),
    everyone: guild.roles.everyone.permissions.bitfield.toString(),
    channels: guild.channels.cache.filter((c) => !c.isThread?.()).sort((a, b) => (a.type === ChannelType.GuildCategory ? -1 : 0) - (b.type === ChannelType.GuildCategory ? -1 : 0) || a.rawPosition - b.rawPosition)
      .map((c) => ({
        name: c.name, type: c.type, parent: c.parent?.name ?? null, position: c.rawPosition, topic: c.topic ?? null, nsfw: Boolean(c.nsfw),
        slowmode: c.rateLimitPerUser ?? 0, bitrate: c.bitrate ?? null, userLimit: c.userLimit ?? null, overwrites: overwrites(c),
      })),
  };
  const all = (await load(BACKUP_KEY, {}).catch(() => ({}))) ?? {};
  const list = (all[guild.id] ??= []);
  const entry = { id: Math.random().toString(36).slice(2, 8), at: Date.now(), by: byId, roles: data.roles.length, channels: data.channels.length, data };
  list.push(entry);
  while (list.length > 3) list.shift();
  save(BACKUP_KEY, all);
  return entry;
}

export async function backupsOf(guildId) {
  return ((await load(BACKUP_KEY, {}).catch(() => ({}))) ?? {})[guildId] ?? [];
}

/** Recrée ce qui manque (rôles, catégories, salons, permissions). Ne supprime jamais rien. */
export async function restoreBackup(guild, backupId) {
  const entry = (await backupsOf(guild.id)).find((b) => b.id === backupId);
  if (!entry) return { error: 'Sauvegarde introuvable.' };
  const { data } = entry;
  const made = { roles: 0, channels: 0 };
  for (const r of data.roles) {
    if (guild.roles.cache.some((x) => x.name === r.name)) continue;
    const ok = await guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: BigInt(r.permissions), reason: 'Restauration de sauvegarde' }).catch(() => null);
    if (ok) made.roles++;
  }
  const roleId = (name) => (name === '@everyone' ? guild.id : guild.roles.cache.find((x) => x.name === name)?.id);
  const overwrites = (list) => list.map((o) => ({ id: roleId(o.role), type: OverwriteType.Role, allow: BigInt(o.allow), deny: BigInt(o.deny) })).filter((o) => o.id);
  for (const c of data.channels) {
    const exists = guild.channels.cache.some((x) => x.name === c.name && x.type === c.type);
    if (exists) continue;
    const parent = c.parent ? guild.channels.cache.find((x) => x.type === ChannelType.GuildCategory && x.name === c.parent)?.id : null;
    const created = await guild.channels.create({
      name: c.name, type: c.type, parent, topic: c.topic ?? undefined, nsfw: c.nsfw, rateLimitPerUser: c.slowmode || undefined,
      bitrate: c.bitrate ?? undefined, userLimit: c.userLimit ?? undefined, permissionOverwrites: overwrites(c.overwrites), reason: 'Restauration de sauvegarde',
    }).catch(() => null);
    if (created) made.channels++;
  }
  return { made, entry };
}

export const isBackupComponent = (interaction) => /^bk:/.test(interaction.customId ?? '');
export async function handleBackupComponent(client, interaction) {
  if (!interaction.memberPermissions?.has(P.Administrator) && interaction.guild.ownerId !== interaction.user.id) return interaction.reply({ content: '🔒 Réservé aux administrateurs.', ...PRIVATE });
  const [, what, id] = interaction.customId.split(':');
  if (what === 'restore') {
    await interaction.update({ embeds: [new EmbedBuilder().setColor(0xffc94d).setDescription('♻️ Restauration en cours…')], components: [] });
    const r = await restoreBackup(interaction.guild, id);
    if (r.error) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${r.error}`)] });
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setTitle('♻️ Restauration terminée').setDescription(`Recréés : **${r.made.roles}** rôle(s) et **${r.made.channels}** salon(s).\nRien n’a été supprimé ; ce qui existait déjà n’a pas été touché.`)] });
  }
  if (what === 'cancel') return interaction.update({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('Rien n’a été restauré.')], components: [] });
  return undefined;
}

export function restoreConfirm(entry) {
  return {
    embeds: [new EmbedBuilder().setColor(0xffc94d).setTitle('♻️ Restaurer cette sauvegarde ?')
      .setDescription(`Sauvegarde du <t:${Math.round(entry.at / 1000)}:f> : ${entry.roles} rôles, ${entry.channels} salons.\nLe bot **recrée seulement ce qui manque** (rôles, catégories, salons, permissions). Rien n’est supprimé.`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bk:restore:${entry.id}`).setLabel('Restaurer').setEmoji('♻️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bk:cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
    )],
  };
}
