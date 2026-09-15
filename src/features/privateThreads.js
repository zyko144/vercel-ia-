// Un fil privé par membre dans le salon IA : seuls la personne (et les admins) voient ses questions et les réponses.
import { ChannelType, PermissionFlagsBits, ThreadAutoArchiveDuration } from 'discord.js';
import { load, save } from '../storage.js';
import { displayName, truncate } from '../utils/discord.js';

const KEY = 'private-threads';
let warnedPerms = false;

/** Renvoie l'ID du membre à qui appartient ce fil privé (ou null). */
export async function privateThreadOwner(threadId) {
  const map = await load(KEY, {});
  return Object.keys(map).find((userId) => map[userId] === threadId) ?? null;
}

/** Récupère (ou crée) le fil privé IA du membre dans ce salon. Renvoie null si impossible. */
export async function getPrivateThread(client, channel, user, member) {
  const perms = channel.permissionsFor(channel.guild.members.me);
  if (!perms?.has([PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads])) {
    if (!warnedPerms) {
      warnedPerms = true;
      console.warn('[fils privés] Il me manque « Créer des fils privés » ou « Envoyer des messages dans les fils » : je réponds en public.');
    }
    return null;
  }

  const map = await load(KEY, {});
  if (map[user.id]) {
    const existing = await client.channels.fetch(map[user.id]).catch(() => null);
    if (existing?.isThread() && existing.parentId === channel.id && !existing.locked) {
      if (existing.archived) await existing.setArchived(false).catch(() => {});
      await existing.members.add(user.id).catch(() => {});
      return existing;
    }
  }

  const thread = await channel.threads.create({
    name: truncate(`🔒 IA · ${displayName(member, user)}`, 100),
    type: ChannelType.PrivateThread,
    invitable: false,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    reason: `Conversation privée avec l'IA pour ${user.username}`,
  });
  await thread.members.add(user.id);
  map[user.id] = thread.id;
  save(KEY, map);

  await thread.send({
    content: `🔒 ${user}, voilà ton fil privé avec l'IA : ici, seuls toi et les admins du serveur pouvez voir tes questions et mes réponses.\n-# Écris directement ici pour continuer · \`/clear\` pour tout effacer.`,
    allowedMentions: { users: [user.id] },
  });
  return thread;
}

/** Supprime le fil privé du membre (ou l'archive si je n'ai pas la permission). */
export async function deletePrivateThread(client, userId) {
  const map = await load(KEY, {});
  const threadId = map[userId];
  if (!threadId) return false;
  delete map[userId];
  save(KEY, map);

  const thread = await client.channels.fetch(threadId).catch(() => null);
  if (thread?.isThread()) {
    await thread.delete('Conversation IA effacée par le membre')
      .catch(() => thread.setArchived(true).catch(() => {}));
  }
  return true;
}
