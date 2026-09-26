// Protections contre la prise de contrôle d'un serveur (ou du bot) :
//  - anti-nuke : quelqu'un (compte piraté, admin malveillant, bot ajouté) supprime des salons ou des rôles,
//    bannit / expulse à la chaîne ou crée des webhooks : ses rôles sont retirés, il est exclu et le chef prévenu ;
//  - rôle dangereux : un rôle reçoit la permission Administrateur, ou un bot est ajouté : le journal et le chef sont prévenus ;
//  - fuite de secrets : un token Discord ou une clé d'API collé dans un salon est supprimé tout de suite.
// Le propriétaire du serveur, le chef du bot et le bot lui-même ne sont jamais visés.
import { AuditLogEvent, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { config } from '../config.js';
import { cfg } from './guildConfig.js';
import { dmOwner } from './escalation.js';
import { logEvent } from './security.js';

const WINDOW_MS = 60_000;
const COUNTED = {
  [AuditLogEvent.ChannelDelete]: 'salon supprimé',
  [AuditLogEvent.RoleDelete]: 'rôle supprimé',
  [AuditLogEvent.MemberBanAdd]: 'bannissement',
  [AuditLogEvent.MemberKick]: 'expulsion',
  [AuditLogEvent.WebhookCreate]: 'webhook créé',
  [AuditLogEvent.MemberPrune]: 'purge de membres',
};
const actions = new Map(); // serveur:membre -> [dates]
const punished = new Map(); // serveur:membre -> date (une seule réaction par minute)

const trusted = (guild, id) => !id || id === guild.ownerId || id === config.ownerId || id === guild.client.user.id;

/** Une action destructrice : renvoie true si la limite est dépassée. */
export function countAction(guildId, userId, now = Date.now()) {
  const key = `${guildId}:${userId}`;
  const list = (actions.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  actions.set(key, list);
  return list.length >= (cfg(guildId, 'antiNuke.limit') || 4);
}

async function neutralize(guild, executorId, what) {
  const key = `${guild.id}:${executorId}`;
  if (Date.now() - (punished.get(key) ?? 0) < WINDOW_MS) return;
  punished.set(key, Date.now());
  const member = await guild.members.fetch(executorId).catch(() => null);
  const done = [];
  if (member) {
    const roles = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.editable);
    if (roles.size && await member.roles.remove([...roles.keys()], 'Anti-nuke : actions destructrices à la chaîne').then(() => true, () => false)) done.push(`${roles.size} rôle(s) retiré(s)`);
    if (member.moderatable && await member.timeout(24 * 3_600_000, 'Anti-nuke').then(() => true, () => false)) done.push('exclu 24 h');
    if (member.user.bot && member.kickable && await member.kick('Anti-nuke : bot destructeur').then(() => true, () => false)) done.push('bot expulsé');
  }
  const text = `<@${executorId}> a fait trop d’actions destructrices en 1 minute (${what}).\n${done.length ? `**Mesures :** ${done.join(', ')}.` : '⚠️ Je n’ai rien pu faire : son rôle est au-dessus du mien. Retire-lui ses permissions à la main.'}`;
  console.warn(`[anti-nuke] ${guild.name} : ${executorId} (${what}) → ${done.join(', ') || 'aucune mesure possible'}`);
  await logEvent(guild, { color: 0xff0033, title: '🛡️ Anti-nuke déclenché', description: text }).catch(() => {});
  await dmOwner(guild.client, { title: `🛡️ Anti-nuke sur ${guild.name}`, description: text }).catch(() => {});
  const ownerOfGuild = guild.ownerId !== config.ownerId ? await guild.client.users.fetch(guild.ownerId).catch(() => null) : null;
  await ownerOfGuild?.send({ embeds: [new EmbedBuilder().setColor(0xff0033).setTitle(`🛡️ Anti-nuke sur ${guild.name}`).setDescription(text)] }).catch(() => {});
}

export async function onAuditEntry(entry, guild) {
  if (!cfg(guild.id, 'antiNuke.enabled')) return;
  const executorId = entry.executorId;
  if (trusted(guild, executorId)) return;
  const what = COUNTED[entry.action];
  if (what) {
    if (countAction(guild.id, executorId)) await neutralize(guild, executorId, what);
    return;
  }
  // Un rôle qui devient Administrateur, ou un bot ajouté : on prévient
  if (entry.action === AuditLogEvent.RoleUpdate || entry.action === AuditLogEvent.RoleCreate) {
    const role = guild.roles.cache.get(entry.targetId);
    const change = entry.changes?.find((c) => c.key === 'permissions');
    const became = change && (BigInt(change.new ?? 0) & P.Administrator) && !(BigInt(change.old ?? 0) & P.Administrator);
    if (became) await logEvent(guild, { color: 0xffb020, title: '⚠️ Rôle Administrateur', description: `<@${executorId}> a donné la permission **Administrateur** au rôle ${role ?? entry.targetId}.` }).catch(() => {});
  }
  if (entry.action === AuditLogEvent.BotAdd) {
    await logEvent(guild, { color: 0xffb020, title: '🤖 Bot ajouté', description: `<@${executorId}> a ajouté le bot <@${entry.targetId}>. Vérifie ses permissions.` }).catch(() => {});
  }
}

// ===================== Fuite de secrets =====================

const SECRET_PATTERNS = [
  /\b[MNO][A-Za-z\d_-]{23,27}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,40}\b/, // token de bot / de compte Discord
  /\bAIza[\dA-Za-z_-]{35}\b/, // clé Google (Gemini)
  /\bsk-(?:ant-)?[A-Za-z\d_-]{32,}\b/, // clés OpenAI / Anthropic
  /\bgh[pousr]_[A-Za-z\d]{36,}\b/, // jeton GitHub
];

export const looksLikeSecret = (text) => SECRET_PATTERNS.some((re) => re.test(String(text ?? '')));

/** Supprime un message qui contient un token ou une clé. Renvoie true si supprimé. */
export async function guardSecrets(message) {
  if (!message.inGuild() || message.author.bot || !looksLikeSecret(message.content)) return false;
  await message.delete().catch(() => {});
  await message.channel.send({ content: `🔐 ${message.author}, ton message contenait un **token ou une clé secrète** : je l’ai supprimé. Change-le tout de suite (quelqu’un a pu le voir).`, allowedMentions: { users: [message.author.id] } }).catch(() => {});
  await logEvent(message.guild, { color: 0xff0033, title: '🔐 Secret supprimé', description: `Un token ou une clé collé par ${message.author} dans ${message.channel} a été supprimé.` }).catch(() => {});
  return true;
}

export function attachAntiNuke(client) {
  client.on('guildAuditLogEntryCreate', (entry, guild) => {
    onAuditEntry(entry, guild).catch((err) => console.warn('[anti-nuke]', err.message));
  });
}
