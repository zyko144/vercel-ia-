// Commandes de base / modération. Toutes les réponses sont visibles seulement par la personne qui tape la commande.
import { notifySanction } from '../features/security.js';
import { countEvent } from '../features/weekly.js';
import { EmbedBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { load, save } from '../storage.js';
import { conversationKey, forget } from '../features/memory.js';
import { deletePrivateThread } from '../features/privateThreads.js';
import { parseDuration } from '../features/reminders.js';
import { truncate } from '../utils/discord.js';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60_000;
const private_ = (content) => ({ content, flags: MessageFlags.Ephemeral });
const reasonOf = (interaction) => interaction.options.getString('raison') ?? 'Aucune raison donnée';
const auditReason = (interaction, reason) => truncate(`${reason} (par ${interaction.user.username})`, 500);

function hasPerm(interaction, permission, label) {
  if (interaction.memberPermissions?.has(permission)) return true;
  interaction.reply(private_(`🔒 Il te faut la permission **${label}** pour faire ça.`)).catch(() => {});
  return false;
}

async function executorOf(interaction) {
  return interaction.member?.roles?.highest ? interaction.member : interaction.guild.members.fetch(interaction.user.id);
}

/** Vérifie qu'on a le droit d'agir sur ce membre. Renvoie un message d'erreur ou null. */
async function targetProblem(interaction, member, { capability, verb }) {
  const { guild, user, client } = interaction;
  if (member.id === user.id) return `Tu peux pas te ${verb} toi-même 😅`;
  if (member.id === client.user.id) return `Je vais pas me ${verb} moi-même 😅`;
  if (member.id === guild.ownerId) return "Impossible, c'est le propriétaire du serveur.";
  const executor = await executorOf(interaction);
  if (user.id !== guild.ownerId && executor.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
    return 'Ce membre a un rôle égal ou au-dessus du tien.';
  }
  if (capability && !member[capability]) {
    return 'Je peux pas : mon rôle est en dessous du sien. Monte le rôle du bot tout en haut dans Paramètres du serveur › Rôles.';
  }
  return null;
}

/** Prévient le membre sanctionné en MP (si ses MP sont ouverts). */
async function notifyMember(user, guild, title, reason, extra = []) {
  // Avec un bouton « Contester » si c'est activé sur le serveur
  return notifySanction(user, guild, { title, reason, fields: extra });
}

async function warningsOf(guildId, userId) {
  const all = await load('warnings', {});
  all[guildId] ??= {};
  all[guildId][userId] ??= [];
  return { all, list: all[guildId][userId] };
}

export const MODERATION_HANDLERS = {
  async clear(client, interaction) {
    const amount = interaction.options.getInteger('nombre');

    // Sans nombre : chacun peut effacer sa propre conversation avec l'IA
    if (!amount) {
      forget(conversationKey({ userId: interaction.user.id }));
      const hadThread = await deletePrivateThread(client, interaction.user.id);
      return interaction.reply(private_(`🧹 Ta conversation avec l'IA est effacée${hadThread ? ' (mémoire + fil privé)' : ''}. On repart de zéro !`));
    }

    if (!hasPerm(interaction, PermissionFlagsBits.ManageMessages, 'Gérer les messages')) return;
    const channel = interaction.channel;
    if (!channel?.bulkDelete) return interaction.reply(private_('Je peux pas supprimer de messages ici.'));

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const target = interaction.options.getUser('membre');
    const fetched = await channel.messages.fetch({ limit: target ? 100 : amount });
    const toDelete = target ? [...fetched.filter((m) => m.author.id === target.id).values()].slice(0, amount) : [...fetched.values()];
    const deleted = await channel.bulkDelete(toDelete, true);
    const skipped = toDelete.length - deleted.size;

    await interaction.editReply(`🧹 **${deleted.size}** message(s) supprimé(s)${target ? ` de ${target}` : ''}.${
      skipped > 0 ? `\n-# ${skipped} ignoré(s) : Discord bloque la suppression des messages de plus de 14 jours.` : ''}`);
  },

  async kick(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.KickMembers, 'Expulser des membres')) return;
    const member = interaction.options.getMember('membre');
    if (!member) return interaction.reply(private_("Ce membre est pas sur le serveur."));
    const problem = await targetProblem(interaction, member, { capability: 'kickable', verb: 'kick' });
    if (problem) return interaction.reply(private_(`❌ ${problem}`));

    const reason = reasonOf(interaction);
    const notified = await notifyMember(member.user, interaction.guild, '👢 Expulsion du serveur', reason);
    await member.kick(auditReason(interaction, reason));
    countEvent(interaction.guildId, 'sanctions');
    await interaction.reply(private_(`👢 Expulsion de **${member.user.username}** effectuée.\n-# Raison : ${reason}${notified ? ' · MP envoyé' : ''}`));
  },

  async ban(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.BanMembers, 'Bannir des membres')) return;
    const user = interaction.options.getUser('membre', true);
    const member = interaction.options.getMember('membre');
    if (member) {
      const problem = await targetProblem(interaction, member, { capability: 'bannable', verb: 'ban' });
      if (problem) return interaction.reply(private_(`❌ ${problem}`));
    } else if (user.id === interaction.user.id) {
      return interaction.reply(private_('Tu peux pas te ban toi-même 😅'));
    }

    const reason = reasonOf(interaction);
    const notified = member ? await notifyMember(user, interaction.guild, '🔨 Bannissement du serveur', reason) : false;
    await interaction.guild.members.ban(user.id, {
      reason: auditReason(interaction, reason),
      deleteMessageSeconds: Number(interaction.options.getString('messages') ?? 0),
    });
    countEvent(interaction.guildId, 'sanctions');
    await interaction.reply(private_(`🔨 Bannissement de **${user.username}** effectué.\n-# Raison : ${reason}${notified ? ' · MP envoyé' : ''}`));
  },

  async unban(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.BanMembers, 'Bannir des membres')) return;
    const id = interaction.options.getString('id', true).replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(id)) return interaction.reply(private_("Cet ID est pas valide (clic droit sur l'utilisateur › Copier l'identifiant)."));
    const ban = await interaction.guild.bans.fetch(id).catch(() => null);
    if (!ban) return interaction.reply(private_('Cet utilisateur est pas banni.'));

    await interaction.guild.members.unban(id, auditReason(interaction, reasonOf(interaction)));
    await interaction.reply(private_(`✅ Débannissement de **${ban.user.username}** effectué.`));
  },

  async mute(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers, 'Exclure temporairement des membres')) return;
    const member = interaction.options.getMember('membre');
    if (!member) return interaction.reply(private_("Ce membre est pas sur le serveur."));
    const ms = parseDuration(interaction.options.getString('duree', true));
    if (!ms || ms < 5_000 || ms > MAX_TIMEOUT_MS) {
      return interaction.reply(private_('Durée pas valide 🤔 Exemples : `10m`, `1h`, `1j` (max 28 jours).'));
    }
    const problem = await targetProblem(interaction, member, { capability: 'moderatable', verb: 'mute' });
    if (problem) return interaction.reply(private_(`❌ ${problem}`));

    const reason = reasonOf(interaction);
    await member.timeout(ms, auditReason(interaction, reason));
    const until = Math.floor((Date.now() + ms) / 1000);
    const notified = await notifyMember(member.user, interaction.guild, '🔇 Exclusion temporaire', reason, [
      { name: "Jusqu'à", value: `<t:${until}:f> (<t:${until}:R>)` },
    ]);
    countEvent(interaction.guildId, 'sanctions');
    await interaction.reply(private_(`🔇 Mute de **${member.user.username}** jusqu'à <t:${until}:f> (<t:${until}:R>).\n-# Raison : ${reason}${notified ? ' · MP envoyé' : ''}`));
  },

  async unmute(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers, 'Exclure temporairement des membres')) return;
    const member = interaction.options.getMember('membre');
    if (!member) return interaction.reply(private_("Ce membre est pas sur le serveur."));
    if (!member.isCommunicationDisabled()) return interaction.reply(private_("Ce membre est pas mute."));
    const problem = await targetProblem(interaction, member, { capability: 'moderatable', verb: 'unmute' });
    if (problem) return interaction.reply(private_(`❌ ${problem}`));

    await member.timeout(null, auditReason(interaction, reasonOf(interaction)));
    await interaction.reply(private_(`🔊 Fin du mute pour **${member.user.username}**.`));
  },

  async warn(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers, 'Exclure temporairement des membres')) return;
    const member = interaction.options.getMember('membre');
    if (!member) return interaction.reply(private_("Ce membre est pas sur le serveur."));
    const problem = await targetProblem(interaction, member, { verb: 'warn' });
    if (problem) return interaction.reply(private_(`❌ ${problem}`));

    const reason = interaction.options.getString('raison', true);
    const { all, list } = await warningsOf(interaction.guildId, member.id);
    list.push({ reason, by: interaction.user.id, at: Date.now() });
    save('warnings', all);

    const notified = await notifyMember(member.user, interaction.guild, '⚠️ Avertissement', reason, [
      { name: 'Total', value: `${list.length} avertissement(s)` },
    ]);
    countEvent(interaction.guildId, 'sanctions');
    await interaction.reply(private_(`⚠️ Avertissement donné à **${member.user.username}** (total : **${list.length}**).\n-# Raison : ${reason}${notified ? ' · MP envoyé' : ''}`));
  },

  async warns(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers, 'Exclure temporairement des membres')) return;
    const user = interaction.options.getUser('membre', true);
    const { all, list } = await warningsOf(interaction.guildId, user.id);

    if (interaction.options.getBoolean('effacer')) {
      const count = list.length;
      all[interaction.guildId][user.id] = [];
      save('warnings', all);
      return interaction.reply(private_(`🧽 ${count} avertissement(s) effacé(s) pour **${user.username}**.`));
    }
    if (!list.length) return interaction.reply(private_(`✅ **${user.username}** a aucun avertissement.`));

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle(`⚠️ Avertissements de ${user.username} (${list.length})`)
      .setDescription(list.slice(-15).map((w, i) =>
        `**${i + 1}.** ${truncate(w.reason, 200)}\n-# par <@${w.by}> · <t:${Math.floor(w.at / 1000)}:R>`).join('\n'));
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  async slowmode(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.ManageChannels, 'Gérer les salons')) return;
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    const seconds = interaction.options.getInteger('secondes', true);
    await channel.setRateLimitPerUser(seconds, `Mode lent par ${interaction.user.username}`);
    await interaction.reply(private_(seconds
      ? `🐢 Mode lent de **${seconds}s** activé dans ${channel}.`
      : `⚡ Mode lent désactivé dans ${channel}.`));
  },

  async lock(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.ManageChannels, 'Gérer les salons')) return;
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
    }, { reason: auditReason(interaction, reasonOf(interaction)) });
    await interaction.reply(private_(`🔒 ${channel} est verrouillé.`));
  },

  async unlock(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.ManageChannels, 'Gérer les salons')) return;
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: null,
      SendMessagesInThreads: null,
      CreatePublicThreads: null,
      CreatePrivateThreads: null,
    }, { reason: `Déverrouillé par ${interaction.user.username}` });
    await interaction.reply(private_(`🔓 ${channel} est déverrouillé.`));
  },

  async role(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.ManageRoles, 'Gérer les rôles')) return;
    const member = interaction.options.getMember('membre');
    const role = interaction.options.getRole('role', true);
    const add = interaction.options.getString('action', true) === 'add';
    if (!member) return interaction.reply(private_("Ce membre est pas sur le serveur."));
    if (role.managed || role.id === interaction.guildId) return interaction.reply(private_('Ce rôle peut pas être donné à la main.'));

    const executor = await executorOf(interaction);
    if (interaction.user.id !== interaction.guild.ownerId && executor.roles.highest.comparePositionTo(role) <= 0) {
      return interaction.reply(private_('Ce rôle est égal ou au-dessus du tien.'));
    }
    if (interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
      return interaction.reply(private_('Ce rôle est au-dessus du mien : monte le rôle du bot dans Paramètres du serveur › Rôles.'));
    }
    if (add === member.roles.cache.has(role.id)) {
      return interaction.reply(private_(add ? `${member} a déjà ${role}.` : `${member} a pas ${role}.`));
    }

    const reason = `Par ${interaction.user.username}`;
    if (add) await member.roles.add(role, reason);
    else await member.roles.remove(role, reason);
    await interaction.reply(private_(add ? `✅ ${role} ajouté à ${member}.` : `✅ ${role} retiré à ${member}.`));
  },

  async say(client, interaction) {
    if (!hasPerm(interaction, PermissionFlagsBits.ManageMessages, 'Gérer les messages')) return;
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    const text = interaction.options.getString('message', true).replace(/\\n/g, '\n');
    await channel.send({ content: text, allowedMentions: { parse: ['users'] } });
    await interaction.reply(private_(`✅ Message envoyé dans ${channel}.`));
  },
};
