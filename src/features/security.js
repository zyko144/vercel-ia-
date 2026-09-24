// Sécurité du serveur : anti-raid, vérification à l'arrivée, filtre de liens, anti-spam, anti-arnaque, journal,
// casier des membres et contestation des sanctions. Chaque protection se règle par serveur
// (tableau de bord › Mon serveur › Sécurité), et le staff (Gérer les messages) n'est jamais filtré.
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, GuildVerificationLevel, MessageFlags, PermissionFlagsBits as P,
} from 'discord.js';
import { config } from '../config.js';
import { load, save } from '../storage.js';
import { truncate } from '../utils/discord.js';
import { buildModal, field as f, readModal } from '../panels/ui.js';
import { cfg } from './guildConfig.js';
import { countEvent } from './weekly.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const MINUTE = 60_000;

// ===================== Journal =====================

/** Écrit dans le salon du journal du serveur (s'il est réglé). */
export async function logEvent(guild, { color = 0x5865f2, title, description, fields = [], thumbnail }) {
  const channelId = cfg(guild.id, 'logs.channelId');
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel?.isTextBased?.()) return;
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
  if (description) embed.setDescription(truncate(description, 4000));
  if (fields.length) embed.addFields(fields.map((x) => ({ ...x, value: truncate(String(x.value || '—'), 1000) })));
  if (thumbnail) embed.setThumbnail(thumbnail);
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

// ===================== Sanctions automatiques =====================

async function autoWarn(guild, userId, kind, reason) {
  const all = (await load('warnings', {}).catch(() => ({}))) ?? {};
  all[guild.id] ??= {};
  (all[guild.id][userId] ??= []).push({ reason, by: guild.client.user.id, at: Date.now(), kind });
  save('warnings', all);
  countEvent(guild.id, 'sanctions');
}

/** MP au membre sanctionné, avec un bouton « Contester » (si c'est activé sur le serveur). */
export async function notifySanction(user, guild, { title, reason, color = 0xed4245, fields = [] }) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title)
    .addFields({ name: 'Serveur', value: guild.name, inline: true }, { name: 'Raison', value: truncate(reason, 1000) }, ...fields)
    .setTimestamp();
  const components = cfg(guild.id, 'appeals.enabled')
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ap:open:${guild.id}`).setLabel('Contester').setEmoji('⚖️').setStyle(ButtonStyle.Secondary))]
    : [];
  return user.send({ embeds: [embed], components }).then(() => true).catch(() => false);
}

async function punish(message, { kind, reason, timeoutMs = 0, notice }) {
  const { guild, member, author } = message;
  await message.delete().catch(() => {});
  if (timeoutMs && member?.moderatable) await member.timeout(timeoutMs, reason).catch(() => {});
  await autoWarn(guild, author.id, kind, reason);
  if (notice) {
    const sent = await message.channel.send({ content: `${author} ${notice}`, allowedMentions: { users: [author.id] } }).catch(() => null);
    if (sent) setTimeout(() => sent.delete().catch(() => {}), 8_000);
  }
  if (timeoutMs) await notifySanction(author, guild, { title: `🔇 Rendu muet ${Math.round(timeoutMs / MINUTE)} min`, reason });
  await logEvent(guild, { color: 0xff3355, title: `🛡️ ${reason}`, description: `${author} dans ${message.channel}\n>>> ${truncate(message.content || '(vide)', 900)}`, thumbnail: author.displayAvatarURL?.({ size: 64 }) });
}

// ===================== Anti-arnaque =====================

// Faux Nitro, faux cadeaux Steam, sites qui imitent Discord ou Steam pour voler les comptes
const SCAM_DOMAINS = /\b(?:d[i1l]s[ck]o[r]?[dcl]?[-.]?(?:gift|nitro|app|give)|dlscord|disc0rd|discorcl|dicsord|discrod|discordnitro|nitro-?(?:gift|free|drop)|steamcommunlty|steamcomunity|stearncommunity|steamcommunity-[a-z]+|steam-?(?:gift|trade)s?)\.[a-z]{2,}/i;
const SCAM_WORDS = /\b(?:free\s+nitro|nitro\s+(?:gratuit|free|for\s+free)|steam\s+gift\s*\$?\d+|gift\s+(?:for|pour)\s+you|airdrop|claim\s+(?:your|ton)\s+(?:nitro|gift|reward))\b/i;
const LINK = /https?:\/\/[^\s<>]+/gi;

export function looksLikeScam(text) {
  if (!text) return false;
  const links = text.match(LINK) ?? [];
  if (links.some((l) => SCAM_DOMAINS.test(l))) return true;
  return links.length > 0 && SCAM_WORDS.test(text);
}

// ===================== Liens =====================

const INVITE = /(?:discord(?:app)?\.(?:gg|com\/invite)|dsc\.gg)\/[\w-]+/i;
function badLink(guildId, text) {
  if (!text) return null;
  if (cfg(guildId, 'links.invites') && INVITE.test(text)) return 'invitation Discord';
  if (!cfg(guildId, 'links.enabled')) return null;
  const allow = (cfg(guildId, 'links.allow') ?? []).map((d) => d.toLowerCase().replace(/^www\./, ''));
  for (const link of text.match(LINK) ?? []) {
    let host;
    try { host = new URL(link).hostname.toLowerCase().replace(/^www\./, ''); } catch { continue; }
    if (!allow.some((d) => host === d || host.endsWith(`.${d}`))) return `lien vers ${host}`;
  }
  return null;
}

// ===================== Anti-spam =====================

const recent = new Map(); // guild:user -> dates des derniers messages
const spamWarned = new Map(); // guild:user -> date du dernier avertissement

function spamProblem(message) {
  const g = message.guildId;
  const key = `${g}:${message.author.id}`;
  const now = Date.now();
  const windowMs = cfg(g, 'antiSpam.seconds') * 1000;
  const times = (recent.get(key) ?? []).filter((t) => now - t < windowMs);
  times.push(now);
  recent.set(key, times);
  if (recent.size > 5000) recent.clear();
  const mentions = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 5 : 0);
  if (mentions >= cfg(g, 'antiSpam.mentions')) return { kind: 'mentions', reason: `Mentions de masse (${mentions})`, timeout: 10 * MINUTE };
  if (times.length > cfg(g, 'antiSpam.messages')) {
    const warned = now - (spamWarned.get(key) ?? 0) < 5 * MINUTE;
    spamWarned.set(key, now);
    return { kind: 'spam', reason: 'Messages en rafale', timeout: warned ? 5 * MINUTE : 0, notice: warned ? null : 'doucement, pas de spam 🙏 (la prochaine fois : muet 5 min)' };
  }
  if (cfg(g, 'antiSpam.caps')) {
    const letters = message.content.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (letters.length >= 15 && letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length > 0.75) return { kind: 'majuscules', reason: 'Message en majuscules', notice: 'pas besoin de crier 🙂' };
  }
  return null;
}

/**
 * Vérifie un message. Renvoie true s'il a été supprimé (le reste du bot ne le traite alors pas).
 */
export async function guardMessage(message) {
  if (!message.inGuild() || message.author.bot) return false;
  const staff = message.member?.permissions?.has(P.ManageMessages) || message.author.id === config.ownerId;
  const g = message.guildId;
  if (cfg(g, 'antiScam.enabled') && looksLikeScam(message.content)) {
    await punish(message, { kind: 'auto-arnaque', reason: 'Lien d’arnaque (faux Nitro / faux Steam)', timeoutMs: staff ? 0 : 60 * MINUTE, notice: 'lien d’arnaque supprimé 🛡️' });
    return true;
  }
  if (staff) return false;
  const link = badLink(g, message.content);
  if (link) {
    await punish(message, { kind: 'auto-lien', reason: `Lien interdit (${link})`, notice: `les liens de ce type ne sont pas autorisés ici (${link}).` });
    return true;
  }
  if (cfg(g, 'antiSpam.enabled')) {
    const spam = spamProblem(message);
    if (spam) {
      await punish(message, { kind: `auto-${spam.kind}`, reason: spam.reason, timeoutMs: spam.timeout, notice: spam.notice });
      return true;
    }
  }
  return false;
}

// ===================== Anti-raid =====================

const joins = new Map(); // guild -> [{ id, at }]
const raids = new Map(); // guild -> { until, previousLevel }

export async function onMemberJoin(member) {
  const { guild } = member;
  const created = Math.round(member.user.createdTimestamp / 1000);
  await logEvent(guild, { color: 0x3dff9a, title: '📥 Arrivée', description: `${member} (${member.user.username})\nCompte créé <t:${created}:R>`, thumbnail: member.displayAvatarURL({ size: 64 }) });
  if (!cfg(guild.id, 'antiRaid.enabled')) return;
  const now = Date.now();
  const windowMs = cfg(guild.id, 'antiRaid.seconds') * 1000;
  const list = (joins.get(guild.id) ?? []).filter((j) => now - j.at < windowMs);
  list.push({ id: member.id, at: now });
  joins.set(guild.id, list);
  if (raids.has(guild.id)) {
    if (cfg(guild.id, 'antiRaid.action') === 'expulser' && member.kickable) await member.kick('Anti-raid : arrivée pendant un raid').catch(() => {});
    return;
  }
  if (list.length >= cfg(guild.id, 'antiRaid.joins')) await startRaidMode(guild, list);
}

async function startRaidMode(guild, list) {
  const previousLevel = guild.verificationLevel;
  raids.set(guild.id, { until: Date.now() + 10 * MINUTE, previousLevel });
  const kick = cfg(guild.id, 'antiRaid.action') === 'expulser';
  await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, 'Anti-raid').catch(() => {});
  await guild.disableInvites(true).catch(() => {});
  if (kick) {
    for (const j of list) await guild.members.cache.get(j.id)?.kick('Anti-raid').catch(() => {});
  }
  console.warn(`[anti-raid] ${guild.name} : ${list.length} arrivées en rafale, serveur verrouillé 10 min`);
  await logEvent(guild, { color: 0xff3355, title: '🚨 RAID DÉTECTÉ', description: `${list.length} arrivées en moins de ${cfg(guild.id, 'antiRaid.seconds')} s.\n• Niveau de vérification au maximum\n• Invitations suspendues\n${kick ? '• Les comptes du raid sont expulsés\n' : ''}Retour à la normale dans 10 minutes.` });
  const owner = await guild.fetchOwner().catch(() => null);
  owner?.send(`🚨 **Raid détecté sur ${guild.name}** : ${list.length} arrivées d'un coup. Le serveur est verrouillé pendant 10 minutes.`).catch(() => {});
  setTimeout(async () => {
    raids.delete(guild.id);
    await guild.setVerificationLevel(previousLevel, 'Fin de l’anti-raid').catch(() => {});
    await guild.disableInvites(false).catch(() => {});
    await logEvent(guild, { color: 0x3dff9a, title: '✅ Fin du mode anti-raid', description: 'Invitations et niveau de vérification rétablis.' });
  }, 10 * MINUTE).unref?.();
}

export const raidActive = (guildId) => raids.has(guildId);

// ===================== Vérification à l'arrivée =====================

const challenges = new Map(); // user -> { answer, at }

/** Le message avec le bouton « Je suis humain », publié depuis /pannel. */
export function verificationPanel(guild) {
  return {
    embeds: [new EmbedBuilder().setColor(0x5ff0ff).setTitle('🛡️ Vérification')
      .setDescription(`Bienvenue sur **${guild.name}** !\nClique sur le bouton et réponds au petit calcul pour accéder au serveur.`)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('vf:start').setLabel('Je suis humain').setEmoji('✅').setStyle(ButtonStyle.Success))],
  };
}

async function handleVerification(interaction) {
  const [, what] = interaction.customId.split(':');
  const roleId = cfg(interaction.guildId, 'verification.roleId');
  if (!roleId) return interaction.reply({ content: '❌ Le rôle de vérification n’est pas réglé (tableau de bord › Mon serveur › Sécurité).', ...PRIVATE });
  if (interaction.member.roles.cache.has(roleId)) return interaction.reply({ content: '✅ Tu es déjà vérifié.', ...PRIVATE });
  if (what === 'start') {
    const a = 2 + Math.floor(Math.random() * 8);
    const b = 2 + Math.floor(Math.random() * 8);
    challenges.set(interaction.user.id, { answer: a + b, at: Date.now() });
    return interaction.showModal(buildModal('vf:answer', '🛡️ Vérification', [f.int('reponse', `Combien font ${a} + ${b} ?`, { req: true, min: 0, top: 100 })]));
  }
  if (what === 'answer') {
    const { values, error } = await readModal(interaction, [f.int('reponse', 'Réponse', { req: true, min: 0, top: 100 })]);
    const c = challenges.get(interaction.user.id);
    challenges.delete(interaction.user.id);
    if (error || !c || Date.now() - c.at > 5 * MINUTE || values.reponse !== c.answer) {
      return interaction.reply({ content: '❌ Mauvaise réponse, clique à nouveau sur le bouton.', ...PRIVATE });
    }
    await interaction.member.roles.add(roleId, 'Vérification réussie').catch(() => null);
    await logEvent(interaction.guild, { color: 0x3dff9a, title: '✅ Membre vérifié', description: `${interaction.user}` });
    return interaction.reply({ content: '✅ Vérifié ! Bienvenue 🎉', ...PRIVATE });
  }
  return undefined;
}

// ===================== Casier et notes =====================

export async function addNote(guildId, userId, byId, text) {
  const all = (await load('notes-staff', {}).catch(() => ({}))) ?? {};
  ((all[guildId] ??= {})[userId] ??= []).push({ by: byId, at: Date.now(), text: truncate(text, 500) });
  save('notes-staff', all);
}

/** La fiche complète d'un membre : sanctions, notes du staff, état. */
export async function casierEmbed(guild, user) {
  const warnings = ((await load('warnings', {}).catch(() => ({})))?.[guild.id]?.[user.id]) ?? [];
  const notes = ((await load('notes-staff', {}).catch(() => ({})))?.[guild.id]?.[user.id]) ?? [];
  const member = await guild.members.fetch(user.id).catch(() => null);
  const muted = member?.communicationDisabledUntilTimestamp > Date.now() ? member.communicationDisabledUntilTimestamp : null;
  const kinds = { 'insulte-vocal': '🎙️', 'insulte-protege': '💬', 'insulte-chef': '💬' };
  return new EmbedBuilder()
    .setColor(warnings.length >= 3 ? 0xff3355 : warnings.length ? 0xffb020 : 0x3dff9a)
    .setAuthor({ name: `Casier de ${member?.displayName ?? user.username}`, iconURL: user.displayAvatarURL({ size: 64 }) })
    .setDescription([
      member ? `Arrivé <t:${Math.round(member.joinedTimestamp / 1000)}:R> · compte créé <t:${Math.round(user.createdTimestamp / 1000)}:R>` : 'N’est plus sur le serveur.',
      muted ? `🔇 Muet jusqu’à <t:${Math.round(muted / 1000)}:f>` : null,
    ].filter(Boolean).join('\n'))
    .addFields(
      { name: `⚠️ Avertissements (${warnings.length})`, value: warnings.length ? warnings.slice(-10).reverse().map((w) => `${kinds[w.kind] ?? (w.kind?.startsWith('auto') ? '🤖' : '🛡️')} <t:${Math.round(w.at / 1000)}:d> · ${truncate(w.reason ?? '—', 90)}`).join('\n') : 'Aucun' },
      { name: `🗒️ Notes du staff (${notes.length})`, value: notes.length ? notes.slice(-6).reverse().map((n) => `<t:${Math.round(n.at / 1000)}:d> · <@${n.by}> : ${truncate(n.text, 120)}`).join('\n') : 'Aucune' },
    )
    .setFooter({ text: '🎙️ vocal · 💬 écrit · 🛡️ staff · 🤖 automatique' });
}

// ===================== Contestation d'une sanction =====================

async function handleAppeal(client, interaction) {
  const [, what, guildId] = interaction.customId.split(':');
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return interaction.reply({ content: '❌ Je ne trouve plus ce serveur.', ...PRIVATE });
  if (what === 'open') {
    return interaction.showModal(buildModal(`ap:send:${guildId}`, '⚖️ Contester la sanction', [f.para('pourquoi', 'Pourquoi la sanction est injuste ?', { req: true, max: 1500 })]));
  }
  if (what === 'send') {
    const { values, error } = await readModal(interaction, [f.para('pourquoi', 'Pourquoi', { req: true, max: 1500 })]);
    if (error) return interaction.reply({ content: `❌ ${error}`, ...PRIVATE });
    const { openCustomTicket } = await import('./tickets.js');
    const sanction = interaction.message?.embeds?.[0];
    const channel = await openCustomTicket(guild, interaction.user, {
      title: '⚖️ Contestation de sanction',
      description: `${interaction.user} conteste : **${sanction?.title ?? 'une sanction'}**\n> ${truncate(sanction?.fields?.find((x) => x.name === 'Raison')?.value ?? '—', 300)}\n\n**Sa version :**\n${values.pourquoi}`,
      categoryId: cfg(guildId, 'appeals.categoryId'),
      staffRoleId: cfg(guildId, 'appeals.staffRoleId'),
      prefix: 'appel',
    }).catch((err) => {
      console.warn('[contestation]', err.message);
      return null;
    });
    if (!channel) return interaction.reply({ content: '❌ Impossible d’ouvrir la contestation (le bot n’a pas les droits sur ce serveur).', ...PRIVATE });
    await interaction.update({ components: [] }).catch(() => {});
    return interaction.followUp({ content: `✅ Ta contestation est envoyée au staff : ${channel}`, ...PRIVATE }).catch(() => {});
  }
  return undefined;
}

export const isSecurityComponent = (interaction) => /^(vf|ap):/.test(interaction.customId ?? '');
export async function handleSecurityComponent(client, interaction) {
  if (interaction.customId.startsWith('vf:')) return handleVerification(interaction);
  return handleAppeal(client, interaction);
}

// ===================== Journal des événements Discord =====================

export function attachSecurityEvents(client) {
  client.on('guildMemberAdd', (member) => {
    onMemberJoin(member).catch((err) => console.warn('[sécurité] arrivée :', err.message));
  });
  client.on('guildMemberRemove', (member) => {
    logEvent(member.guild, { color: 0x99aab5, title: '📤 Départ', description: `${member.user} (${member.user.username})`, thumbnail: member.user.displayAvatarURL({ size: 64 }) }).catch(() => {});
  });
  client.on('messageDelete', (message) => {
    if (!message.guild || message.author?.bot) return;
    logEvent(message.guild, { color: 0xff3355, title: '🗑️ Message supprimé', description: `${message.author ?? 'Quelqu’un'} dans ${message.channel}\n>>> ${truncate(message.content || '(contenu inconnu ou pièce jointe)', 1500)}` }).catch(() => {});
  });
  client.on('messageUpdate', (before, after) => {
    if (!after.guild || after.author?.bot || before.content === after.content || !before.content) return;
    logEvent(after.guild, { color: 0xffb020, title: '✏️ Message modifié', description: `${after.author} dans ${after.channel} · [voir](${after.url})`, fields: [{ name: 'Avant', value: before.content }, { name: 'Après', value: after.content }] }).catch(() => {});
  });
  client.on('guildMemberUpdate', (before, after) => {
    const added = after.roles.cache.filter((r) => !before.roles.cache.has(r.id));
    const removed = before.roles.cache.filter((r) => !after.roles.cache.has(r.id));
    if (!added.size && !removed.size) return;
    logEvent(after.guild, { color: 0x5865f2, title: '🎭 Rôles modifiés', description: `${after.user}\n${added.map((r) => `➕ ${r}`).join('\n')}\n${removed.map((r) => `➖ ${r}`).join('\n')}` }).catch(() => {});
  });
  client.on('channelCreate', (channel) => {
    if (channel.guild) logEvent(channel.guild, { color: 0x3dff9a, title: '📁 Salon créé', description: `${channel} (${channel.name})` }).catch(() => {});
  });
  client.on('channelDelete', (channel) => {
    if (channel.guild) logEvent(channel.guild, { color: 0xff3355, title: '📁 Salon supprimé', description: `#${channel.name}` }).catch(() => {});
  });
  client.on('guildBanAdd', (ban) => {
    logEvent(ban.guild, { color: 0xff3355, title: '🔨 Bannissement', description: `${ban.user} (${ban.user.username})${ban.reason ? `\nRaison : ${ban.reason}` : ''}` }).catch(() => {});
  });
}
