// Salons dédiés du bot : une catégorie « History IA » avec un salon par usage (niveaux, trésor, jeux,
// annonces, demandes et journal du staff), pour ne pas encombrer les salons de discussion.
import { ChannelType, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { cfg, setGuildSettings, setInternal } from './guildConfig.js';

const CATEGORY = '🏴‍☠️ History IA';
// staff : visible seulement du staff ; readOnly : les membres lisent, le bot écrit ; keys : réglages remplis
export const BOT_CHANNELS = [
  { name: '📈・niveaux', topic: 'Montées de niveau, cartes d’XP et membre de la semaine.', readOnly: true, keys: ['levels.channelId', 'weekMember.channelId'] },
  { name: '🪙・trésor', topic: 'Classement des plus riches, loterie, enchères et abordages.', readOnly: false, keys: ['economy.channelId'] },
  { name: '🎲・jeux', topic: 'Les parties lancées avec /jeux s’ouvrent ici.', readOnly: false, keys: ['games.channelId'] },
  { name: '📢・annonces-du-bot', topic: 'Nouveautés du bot, événements et grandes annonces.', readOnly: true, keys: ['announce.channelId'] },
  { name: '🎨・demandes-boutique', topic: 'Demandes de rôle personnalisé à accepter ou refuser.', staff: true, keys: ['shop.requestsChannelId'] },
  { name: '📜・journal-du-bot', topic: 'Journal : messages supprimés, arrivées, départs, sanctions.', staff: true, keys: ['logs.channelId'] },
];

const staffRoles = (guild) => guild.roles.cache.filter((r) => !r.managed && r.id !== guild.id && (r.permissions.has(P.ManageMessages) || r.permissions.has(P.Administrator)));

/**
 * Crée ce qui manque et règle les salons du bot.
 * replace = true : même les réglages déjà faits pointent vers les nouveaux salons.
 */
export async function installBotChannels(guild, { replace = false } = {}) {
  const me = guild.members.me;
  if (!me?.permissions.has(P.ManageChannels)) return { ok: false, error: 'Il me faut la permission « Gérer les salons ».' };
  await guild.channels.fetch().catch(() => {});
  const byName = (name, type) => guild.channels.cache.find((c) => c.type === type && c.name === name);
  let category = byName(CATEGORY, ChannelType.GuildCategory);
  const created = [];
  if (!category) {
    category = await guild.channels.create({ name: CATEGORY, type: ChannelType.GuildCategory, reason: 'Salons dédiés du bot' }).catch(() => null);
    if (!category) return { ok: false, error: 'Création de la catégorie impossible.' };
  }
  const changes = {};
  const done = [];
  for (const spec of BOT_CHANNELS) {
    let channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === spec.name && c.parentId === category.id);
    if (!channel) {
      const overwrites = [{ id: me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ManageMessages, P.CreatePublicThreads, P.SendMessagesInThreads] }];
      if (spec.staff) {
        overwrites.push({ id: guild.id, deny: [P.ViewChannel] });
        for (const role of staffRoles(guild).values()) overwrites.push({ id: role.id, allow: [P.ViewChannel, P.SendMessages] });
      } else if (spec.readOnly) {
        overwrites.push({ id: guild.id, deny: [P.SendMessages], allow: [P.AddReactions] });
      }
      channel = await guild.channels.create({
        name: spec.name, type: ChannelType.GuildText, parent: category.id, topic: spec.topic,
        permissionOverwrites: overwrites, reason: 'Salons dédiés du bot',
      }).catch(() => null);
      if (!channel) continue;
      created.push(channel);
    }
    done.push({ spec, channel });
    for (const key of spec.keys) if (replace || !cfg(guild.id, key)) changes[key] = channel.id;
  }
  if (Object.keys(changes).length) setGuildSettings(guild.id, changes);
  setInternal(guild.id, 'botChannels.installedAt', Date.now());
  return { ok: true, category, created, done, changed: Object.keys(changes) };
}

export function installEmbed(r) {
  if (!r.ok) return new EmbedBuilder().setColor(0xe0433a).setDescription(`❌ ${r.error}`);
  return new EmbedBuilder().setColor(0xc9a978).setTitle('🏴‍☠️ Salons du bot installés')
    .setDescription(`${r.done.map(({ spec, channel }) => `${channel} · ${spec.topic}${spec.staff ? ' *(staff)*' : ''}`).join('\n')}

${r.created.length ? `**${r.created.length}** salon(s) créé(s)` : 'Tout existait déjà'} · **${r.changed.length}** réglage(s) mis à jour.
-# Change-les quand tu veux : tableau de bord › Mon serveur › Boutique, trésor et salons.`);
}

/** Au démarrage : une seule installation automatique par serveur (jamais refaite si on supprime les salons). */
export async function autoInstallBotChannels(client) {
  for (const guild of client.guilds.cache.values()) {
    if (cfg(guild.id, 'botChannels.installedAt')) continue;
    await installBotChannels(guild).catch(() => {});
  }
}
