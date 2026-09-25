// Modération avancée : sanctions progressives, mots interdits, comptes trop récents, mode lent automatique,
// rapport de la semaine, doubles comptes, sauvegarde automatique, confinement d'urgence.
import { EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { load, save } from '../storage.js';
import { truncate } from '../utils/discord.js';
import { cfg, setInternal } from './guildConfig.js';
import { logEvent, notifySanction } from './security.js';
import { weekOf } from './weekly.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TZ = 'Europe/Paris';

// ===================== Compteurs de la semaine =====================

const STATS_KEY = 'moderation-stats';
let stats = null;
let loading = null;
async function statsData() {
  // Un seul chargement, même si plusieurs appels arrivent en même temps
  loading ??= load(STATS_KEY, {}).catch(() => ({})).then((d) => { stats = d ?? {}; return stats; });
  return loading;
}
/** Compte une action de modération (warn, mute, kick, ban, deleted, slow, lockdown). */
export async function countMod(guildId, kind, n = 1) {
  const s = await statsData();
  const w = ((s[guildId] ??= {})[weekOf()] ??= {});
  w[kind] = (w[kind] ?? 0) + n;
  // On ne garde que 8 semaines
  const weeks = Object.keys(s[guildId]).sort();
  for (const old of weeks.slice(0, -8)) delete s[guildId][old];
  save(STATS_KEY, s);
}
export async function modStats(guildId, week = weekOf()) {
  return (await statsData())[guildId]?.[week] ?? {};
}

// ===================== Sanctions progressives (idée 57) =====================

export const LADDER = [
  { at: 3, action: 'mute', ms: HOUR, label: 'muet 1 h' },
  { at: 5, action: 'mute', ms: DAY, label: 'muet 1 jour' },
  { at: 7, action: 'kick', label: 'expulsion' },
];

/** Après un avertissement : applique le palier atteint (s'il y en a un). */
export async function escalate(guild, userId, count) {
  countMod(guild.id, 'warn').catch(() => {});
  if (!cfg(guild.id, 'mod.escalate')) return null;
  const step = LADDER.find((s) => s.at === count);
  if (!step) return null;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member || member.permissions.has(P.ManageMessages)) return null;
  const reason = `Sanction progressive : ${count} avertissements`;
  let done = false;
  if (step.action === 'mute' && member.moderatable) done = await member.timeout(step.ms, reason).then(() => true, () => false);
  if (step.action === 'kick' && member.kickable) {
    await notifySanction(member.user, guild, { title: '👢 Expulsé du serveur', reason });
    done = await member.kick(reason).then(() => true, () => false);
  }
  if (!done) return null;
  if (step.action === 'mute') await notifySanction(member.user, guild, { title: `🔇 ${step.label}`, reason, fields: [{ name: 'Prochain palier', value: LADDER.find((s) => s.at > count)?.label ?? '—' }] });
  countMod(guild.id, step.action).catch(() => {});
  await logEvent(guild, { color: 0xff3355, title: `📈 ${reason}`, description: `${member.user} : **${step.label}**` });
  return step;
}

// ===================== Mots interdits (idée 58) =====================

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Le mot interdit trouvé dans le texte (ou null). */
export function bannedWord(guildId, text) {
  const words = (cfg(guildId, 'automod.words') ?? []).map((w) => norm(w).trim()).filter(Boolean);
  if (!words.length || !text) return null;
  const t = ` ${norm(text).replace(/[^a-z0-9]+/g, ' ')} `;
  return words.find((w) => t.includes(` ${w.replace(/[^a-z0-9]+/g, ' ').trim()} `)) ?? null;
}

// ===================== Comptes récents et doubles comptes (idées 59, 63) =====================

const banCache = new Map(); // serveur -> { at, list: [{ name, avatar }] }
const simple = (s) => norm(s).replace(/[^a-z0-9]/g, '').replace(/[0-9]+$/, '');
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function looksLikeAlt(user, banned) {
  const name = simple(user.username);
  return banned.find((b) => (user.avatar && b.avatar && user.avatar === b.avatar) || (name.length >= 4 && b.name.length >= 4 && distance(name, b.name) <= (name.length > 7 ? 2 : 1))) ?? null;
}

/** À l'arrivée d'un membre : compte trop récent, ou ressemblance avec un banni. Renvoie true s'il est expulsé. */
export async function checkNewMember(member) {
  const { guild, user } = member;
  const minDays = cfg(guild.id, 'security.minAccountDays');
  if (minDays > 0 && Date.now() - user.createdTimestamp < minDays * DAY && !user.bot) {
    await user.send(`👋 Ton compte Discord est trop récent pour rejoindre **${guild.name}** (il faut ${minDays} jour(s)). Reviens un peu plus tard !`).catch(() => {});
    if (await member.kick(`Compte de moins de ${minDays} jour(s)`).then(() => true, () => false)) {
      countMod(guild.id, 'kick').catch(() => {});
      await logEvent(guild, { color: 0xff9f2e, title: '🍼 Compte trop récent refusé', description: `${user} (${user.username}) · compte créé <t:${Math.round(user.createdTimestamp / 1000)}:R>` });
      return true;
    }
  }
  if (cfg(guild.id, 'alts.enabled') && guild.members.me?.permissions.has(P.BanMembers)) {
    let cache = banCache.get(guild.id);
    if (!cache || Date.now() - cache.at > HOUR) {
      const bans = await guild.bans.fetch({ limit: 1000 }).catch(() => null);
      cache = { at: Date.now(), list: [...(bans?.values() ?? [])].map((b) => ({ id: b.user.id, name: simple(b.user.username), avatar: b.user.avatar, tag: b.user.username })) };
      banCache.set(guild.id, cache);
    }
    const twin = looksLikeAlt(user, cache.list);
    if (twin) {
      await logEvent(guild, { color: 0xff3355, title: '👥 Double compte possible', description: `${user} (${user.username}) ressemble à **${twin.tag}**, banni du serveur (${user.avatar && user.avatar === twin.avatar ? 'même avatar' : 'nom presque identique'}).\n-# Rien n’a été fait automatiquement : à vérifier par le staff.` });
    }
  }
  return false;
}

// ===================== Mode lent automatique (idée 60) =====================

const bursts = new Map(); // salon -> [dates]
const slowed = new Set();
export async function watchBurst(message) {
  if (!message.inGuild() || message.author.bot || !cfg(message.guildId, 'autoSlow.enabled')) return;
  const channel = message.channel;
  if (!channel.setRateLimitPerUser || slowed.has(channel.id) || channel.rateLimitPerUser > 0) return;
  const now = Date.now();
  const list = (bursts.get(channel.id) ?? []).filter((t) => now - t < 10_000);
  list.push(now);
  bursts.set(channel.id, list);
  if (bursts.size > 2000) bursts.clear();
  if (list.length < 15) return;
  if (!channel.permissionsFor(message.guild.members.me)?.has(P.ManageChannels)) return;
  slowed.add(channel.id);
  bursts.delete(channel.id);
  await channel.setRateLimitPerUser(10, 'Mode lent automatique : le salon s’emballe').catch(() => {});
  await channel.send('🐢 Ça va vite ici ! Mode lent de 10 secondes pendant 5 minutes.').catch(() => {});
  countMod(message.guildId, 'slow').catch(() => {});
  setTimeout(async () => {
    slowed.delete(channel.id);
    await channel.setRateLimitPerUser(0, 'Fin du mode lent automatique').catch(() => {});
  }, 5 * MINUTE).unref?.();
}

// ===================== Confinement d'urgence (idée 65) =====================

const LOCK_KEY = 'confinement';
/** Plus personne (hors staff) ne peut écrire nulle part. On note ce qu'on change pour tout remettre après. */
export async function lockdown(guild, byUser) {
  const all = (await load(LOCK_KEY, {}).catch(() => ({}))) ?? {};
  if (all[guild.id]) return { error: 'Le serveur est déjà confiné.' };
  const changed = [];
  for (const channel of guild.channels.cache.values()) {
    if (!channel.isTextBased?.() || channel.isThread?.() || !channel.permissionOverwrites) continue;
    const current = channel.permissionOverwrites.cache.get(guild.id);
    if (current?.deny.has(P.SendMessages)) continue;
    const ok = await channel.permissionOverwrites.edit(guild.id, { SendMessages: false, SendMessagesInThreads: false, AddReactions: false }, { reason: `Confinement d’urgence par ${byUser.username}` }).then(() => true, () => false);
    if (ok) changed.push({ id: channel.id, had: current ? { allow: current.allow.bitfield.toString(), deny: current.deny.bitfield.toString() } : null });
  }
  all[guild.id] = { at: Date.now(), by: byUser.id, changed };
  save(LOCK_KEY, all);
  countMod(guild.id, 'lockdown').catch(() => {});
  await logEvent(guild, { color: 0xff3355, title: '🚨 Confinement d’urgence', description: `Par ${byUser} : ${changed.length} salon(s) fermés à l’écriture. Le staff peut toujours écrire.` });
  return { count: changed.length };
}
export async function unlockdown(guild, byUser) {
  const all = (await load(LOCK_KEY, {}).catch(() => ({}))) ?? {};
  const lock = all[guild.id];
  if (!lock) return { error: 'Le serveur n’est pas confiné.' };
  let n = 0;
  for (const { id, had } of lock.changed) {
    const channel = guild.channels.cache.get(id);
    if (!channel) continue;
    const ok = had
      ? await channel.permissionOverwrites.edit(guild.id, { SendMessages: null, SendMessagesInThreads: null, AddReactions: null }).then(() => true, () => false)
      : await channel.permissionOverwrites.delete(guild.id, 'Fin du confinement').then(() => true, () => false);
    if (ok) n += 1;
  }
  delete all[guild.id];
  save(LOCK_KEY, all);
  await logEvent(guild, { color: 0x3fbf6a, title: '✅ Fin du confinement', description: `Par ${byUser} : ${n} salon(s) rouverts.` });
  return { count: n };
}

// ===================== Rapport de la semaine (idée 61) et sauvegarde auto (idée 64) =====================

export async function modReportEmbed(guild, week = weekOf(Date.now() - 7 * DAY)) {
  const s = await modStats(guild.id, week);
  const warnings = (await load('warnings', {}).catch(() => ({})))?.[guild.id] ?? {};
  const since = Date.now() - 7 * DAY;
  const top = Object.entries(warnings).map(([id, list]) => [id, list.filter((w) => w.at > since).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const line = (emoji, label, n) => `${emoji} ${label} : **${n ?? 0}**`;
  return new EmbedBuilder().setColor(0xc9a978).setTitle(`🛡️ Rapport de modération · semaine du ${week}`)
    .setDescription([
      line('⚠️', 'Avertissements', s.warn),
      line('🔇', 'Muets', s.mute),
      line('👢', 'Expulsions', s.kick),
      line('🧹', 'Messages supprimés par le bot', s.deleted),
      line('🐢', 'Modes lents automatiques', s.slow),
      line('🚨', 'Confinements', s.lockdown),
    ].join('\n'))
    .addFields({ name: 'Les plus avertis (7 jours)', value: top.length ? top.map(([id, n], i) => `${i + 1}. <@${id}> · ${n}`).join('\n') : 'Personne 🎉' })
    .setTimestamp();
}

async function weeklyTick(client) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  if (now.getDay() !== 1 || now.getHours() < 9) return;
  const week = weekOf();
  const { createBackup } = await import('./community.js');
  for (const guild of client.guilds.cache.values()) {
    if (cfg(guild.id, 'mod.lastWeek') === week) continue;
    setInternal(guild.id, 'mod.lastWeek', week);
    if (cfg(guild.id, 'mod.weeklyReport')) {
      const channel = guild.channels.cache.get(cfg(guild.id, 'logs.channelId') ?? '');
      if (channel?.isTextBased?.()) await channel.send({ embeds: [await modReportEmbed(guild)], allowedMentions: { parse: [] } }).catch(() => {});
    }
    if (cfg(guild.id, 'backup.auto')) {
      const b = await createBackup(guild, client.user.id).catch(() => null);
      if (b) await logEvent(guild, { color: 0x3fbf6a, title: '💾 Sauvegarde automatique', description: `${b.roles} rôles et ${b.channels} salons sauvegardés.` });
    }
  }
}

export function startModeration(client) {
  setInterval(() => weeklyTick(client).catch((err) => console.warn('[modération]', err.message)), 15 * MINUTE).unref();
}

export const _test = { distance, simple, bursts, slowed, truncate };
