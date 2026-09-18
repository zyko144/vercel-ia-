// Battle du tribunal : deux sons validés de la semaine s'affrontent, le serveur vote pendant 24 h,
// le gagnant reçoit le rôle 🏆 Champion du Tribunal jusqu'à la battle suivante.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { config } from '../config.js';
import { acceptedThisWeek, isJudge } from '../features/tribunal.js';
import { load, save } from '../storage.js';
import { PRIVATE, shortId } from './common.js';

const KEY = 'tribunal-battles';
const DURATION_MS = 24 * 60 * 60_000;
const CHAMPION_ROLE = '🏆 Champion du Tribunal';
const picks = new Map(); // id de sélection -> sons proposés

const nameOf = (guild, id) => guild.members.cache.get(id)?.displayName ?? guild.client.users.cache.get(id)?.username ?? 'Artiste';

/** /tribunal action:battle (déjà en attente de réponse privée). */
export async function startBattle(interaction) {
  const songs = (await acceptedThisWeek()).filter((s) => interaction.guild.members.cache.has(s.userId));
  if (songs.length < 2) return interaction.editReply('⚔️ Il faut au moins **2 sons validés** cette semaine pour lancer une battle.');
  if (songs.length === 2) {
    const message = await publish(interaction.guild, songs[0], songs[1]);
    return interaction.editReply(message ? `⚔️ Battle lancée : ${message.url}` : "😕 Impossible d'écrire dans le salon des annonces.");
  }
  const id = shortId();
  picks.set(id, songs);
  return interaction.editReply({
    content: '⚔️ Choisis les **deux sons** qui s\'affrontent :',
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId(`g:bat:${id}:pick`)
      .setPlaceholder('Deux sons validés de la semaine')
      .setMinValues(2)
      .setMaxValues(2)
      .addOptions(songs.slice(0, 25).map((song) => ({
        label: nameOf(interaction.guild, song.userId).slice(0, 100),
        value: song.userId,
        description: (song.file ?? song.link ?? song.summary ?? 'son').slice(0, 100),
      }))))],
  });
}

function battleEmbed(guild, battle, { closed = false } = {}) {
  const votes = Object.values(battle.votes ?? {});
  const a = votes.filter((v) => v === 'a').length;
  const b = votes.length - a;
  const link = (song) => (song.url ? `[écouter](${song.url})` : 'son introuvable');
  const embed = new EmbedBuilder()
    .setColor(0xc8a24a)
    .setAuthor({ name: '⚔️ BATTLE DU TRIBUNAL' })
    .setTitle(`${nameOf(guild, battle.a.userId)} 🆚 ${nameOf(guild, battle.b.userId)}`)
    .addFields(
      { name: `🅰️ ${nameOf(guild, battle.a.userId)}`, value: `${link(battle.a)}${closed ? ` · **${a}** vote${a > 1 ? 's' : ''}` : ''}`, inline: true },
      { name: `🅱️ ${nameOf(guild, battle.b.userId)}`, value: `${link(battle.b)}${closed ? ` · **${b}** vote${b > 1 ? 's' : ''}` : ''}`, inline: true },
    );
  embed.setDescription(closed
    ? null
    : `Écoutez les deux sons, puis votez pour votre préféré. Un vote par personne (vous pouvez changer), les deux artistes ne votent pas.\n🗳️ **${votes.length}** vote${votes.length > 1 ? 's' : ''} pour l'instant · fin <t:${Math.floor(battle.endsAt / 1000)}:R>\n🏆 Le gagnant devient **${CHAMPION_ROLE}**.`);
  return embed;
}

const voteButtons = (battle) => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`g:bat:${battle.id}:a`).setLabel('Vote A').setEmoji('🅰️').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`g:bat:${battle.id}:b`).setLabel('Vote B').setEmoji('🅱️').setStyle(ButtonStyle.Danger),
)];

async function publish(guild, first, second) {
  const channel = await guild.client.channels.fetch(config.tribunal.announceChannelId).catch(() => null);
  if (!channel?.send) return null;
  const battle = { id: shortId(), guildId: guild.id, a: first, b: second, votes: {}, endsAt: Date.now() + DURATION_MS, channelId: channel.id };
  const message = await channel.send({
    content: `⚔️ <@${first.userId}> 🆚 <@${second.userId}> : la battle du tribunal commence !`,
    embeds: [battleEmbed(guild, battle)],
    components: voteButtons(battle),
    allowedMentions: { users: [first.userId, second.userId] },
  });
  battle.messageId = message.id;
  const data = await load(KEY, { battles: {} });
  data.battles ??= {};
  data.battles[battle.id] = battle;
  save(KEY, data);
  return message;
}

export async function handleBattleComponent(interaction) {
  const [, , id, action] = interaction.customId.split(':');
  if (action === 'pick') {
    if (!isJudge(interaction.user.id)) return interaction.reply({ content: '⚖️ Réservé aux juges.', ...PRIVATE });
    const songs = picks.get(id);
    if (!songs) return interaction.update({ content: 'Sélection expirée, relance `/tribunal action:battle`.', components: [] });
    picks.delete(id);
    const [first, second] = interaction.values.map((userId) => songs.find((s) => s.userId === userId));
    const message = await publish(interaction.guild, first, second);
    return interaction.update({ content: message ? `⚔️ Battle lancée : ${message.url}` : "😕 Impossible d'écrire dans le salon des annonces.", components: [] });
  }

  const data = await load(KEY, { battles: {} });
  const battle = data.battles?.[id];
  if (!battle || battle.closed) return interaction.reply({ content: 'Cette battle est terminée.', ...PRIVATE });
  const userId = interaction.user.id;
  if (userId === battle.a.userId || userId === battle.b.userId) return interaction.reply({ content: 'Les artistes de la battle ne votent pas 😉', ...PRIVATE });
  battle.votes[userId] = action;
  save(KEY, data);
  await interaction.update({ embeds: [battleEmbed(interaction.guild, battle)], components: voteButtons(battle) });
  return interaction.followUp({ content: `🗳️ Tu votes pour **${nameOf(interaction.guild, action === 'a' ? battle.a.userId : battle.b.userId)}** (tu peux changer jusqu'à la fin).`, ...PRIVATE });
}

/** Rôle du champion (créé la première fois). */
async function championRole(guild) {
  return guild.roles.cache.find((role) => role.name === CHAMPION_ROLE)
    ?? guild.roles.create({ name: CHAMPION_ROLE, color: 0xf1c40f, hoist: true, reason: 'Battle du tribunal' }).catch(() => null);
}

async function closeBattle(client, battle) {
  const guild = client.guilds.cache.get(battle.guildId);
  if (!guild) return;
  const votes = Object.values(battle.votes ?? {});
  const a = votes.filter((v) => v === 'a').length;
  const b = votes.length - a;
  const winner = a === b ? null : a > b ? battle.a.userId : battle.b.userId;
  const channel = await client.channels.fetch(battle.channelId).catch(() => null);
  const message = await channel?.messages.fetch(battle.messageId).catch(() => null);
  await message?.edit({ embeds: [battleEmbed(guild, battle, { closed: true })], components: [] }).catch(() => {});
  if (winner) {
    const role = await championRole(guild);
    if (role) {
      for (const member of role.members.values()) if (member.id !== winner) await member.roles.remove(role, 'Nouveau champion du tribunal').catch(() => {});
      await guild.members.fetch(winner).then((m) => m.roles.add(role, 'Victoire à la battle du tribunal')).catch(() => {});
    }
  }
  await channel?.send({
    content: winner
      ? `🏆 <@${winner}> remporte la battle du tribunal (**${Math.max(a, b)}** contre **${Math.min(a, b)}**) et devient **${CHAMPION_ROLE}** !`
      : `🤝 Égalité parfaite (**${a}** partout) entre <@${battle.a.userId}> et <@${battle.b.userId}> : pas de champion cette fois.`,
    reply: message ? { messageReference: message.id, failIfNotExists: false } : undefined,
    allowedMentions: { users: [battle.a.userId, battle.b.userId] },
  }).catch(() => {});
}

/** Toutes les minutes : les battles terminées sont clôturées (même après un redémarrage). */
export function startBattleLoop(client) {
  setInterval(async () => {
    try {
      const data = await load(KEY, { battles: {} });
      let changed = false;
      for (const battle of Object.values(data.battles ?? {})) {
        if (battle.closed || Date.now() < battle.endsAt) continue;
        battle.closed = true;
        changed = true;
        await closeBattle(client, battle).catch((err) => console.warn('[battle] clôture :', err.message));
      }
      // On ne garde que les 20 dernières battles
      const all = Object.values(data.battles ?? {}).sort((x, y) => y.endsAt - x.endsAt);
      if (all.length > 20) {
        data.battles = Object.fromEntries(all.slice(0, 20).map((battle) => [battle.id, battle]));
        changed = true;
      }
      if (changed) save(KEY, data);
    } catch (err) {
      console.warn('[battle] vérification :', err.message);
    }
  }, 60_000).unref?.();
}
