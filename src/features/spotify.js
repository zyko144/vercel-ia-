// Partage en direct de ce qu'une personne écoute sur Spotify (via son statut Discord) :
// un message qui se met à jour dans le salon musique, et le bot peut jouer la même chose en vocal, au même moment.
import { ActivityType, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { blindTestActive } from '../music/blindtest.js';
import { lockedChannel } from './voice.js';
import { getOrCreatePlayer, getPlayer } from '../music/player.js';
import { resolveQuery } from '../music/sources.js';

const BAR_LENGTH = 18;
const RESYNC_MS = 4_000; // écart accepté entre Spotify et le bot avant de resynchroniser
const MIN_REMAINING_S = 12; // moins que ça sur le son : on ne le lance pas, le suivant arrive

const live = new Map(); // guildId -> { messageId, channelId, trackId }
const watched = new Set(); // personnes dont on partage le Spotify (config + /spotify)
const following = new Map(); // guildId -> userId suivi en vocal
let watching = null;

/** Le son écouté sur Spotify, vu depuis le statut Discord. */
export function spotifyActivity(member) {
  const activity = member?.presence?.activities?.find((a) => a.type === ActivityType.Listening && a.name === 'Spotify');
  if (!activity?.details) return null;
  const start = activity.timestamps?.start?.getTime?.() ?? activity.timestamps?.start ?? null;
  const end = activity.timestamps?.end?.getTime?.() ?? activity.timestamps?.end ?? null;
  const cover = activity.assets?.largeImage?.replace('spotify:', '');
  return {
    title: activity.details,
    artist: activity.state ?? '',
    album: activity.assets?.largeText ?? '',
    trackId: activity.syncId ?? null,
    url: activity.syncId ? `https://open.spotify.com/track/${activity.syncId}` : null,
    cover: cover ? `https://i.scdn.co/image/${cover}` : null,
    start,
    end,
    duration: start && end ? Math.round((end - start) / 1000) : 0,
    position: start ? Math.max(0, Math.round((Date.now() - start) / 1000)) : 0,
  };
}

const time = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.max(0, Math.round(seconds % 60))).padStart(2, '0')}`;

function progressBar(track) {
  if (!track.duration) return '';
  const done = Math.min(BAR_LENGTH, Math.round((track.position / track.duration) * BAR_LENGTH));
  return `\`${'─'.repeat(done)}🟢${'─'.repeat(Math.max(0, BAR_LENGTH - done))}\` ${time(track.position)} / ${time(track.duration)}`;
}

function embedFor(member, track, followed) {
  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setAuthor({ name: `${member.displayName} écoute sur Spotify`, iconURL: member.displayAvatarURL() })
    .setTitle(track.title.slice(0, 256))
    .setDescription([
      `🎤 **${track.artist}**`,
      track.album ? `💿 ${track.album}` : null,
      progressBar(track),
      followed ? `\n🔊 Le bot joue la même chose dans <#${followed}>` : null,
    ].filter(Boolean).join('\n'));
  if (track.cover) embed.setThumbnail(track.cover);
  if (track.url) embed.setURL(track.url);
  return embed;
}

/** Salon où le partage s'affiche (par défaut : le salon musique). */
function shareChannel(guild) {
  const id = config.spotify.channelId || config.jukeboxChannelIds[0] || config.music.blindtestChannelId;
  return id ? guild.channels.cache.get(id) ?? null : null;
}

async function showLive(member, track) {
  const channel = shareChannel(member.guild);
  if (!channel?.send) return;
  const previous = live.get(member.guild.id);
  const payload = { embeds: [embedFor(member, track, following.get(member.guild.id) === member.id ? lockedChannel(member.guild)?.id : null)] };

  // Même son : on met juste le message à jour (pas de spam)
  if (previous?.trackId === track.trackId && previous.messageId) {
    const message = await channel.messages.fetch(previous.messageId).catch(() => null);
    if (message) return message.edit(payload).catch(() => {});
  }
  if (previous?.messageId) {
    const old = await channel.messages.fetch(previous.messageId).catch(() => null);
    await old?.delete().catch(() => {});
  }
  const sent = await channel.send(payload).catch(() => null);
  if (sent) live.set(member.guild.id, { messageId: sent.id, channelId: channel.id, trackId: track.trackId });
}

async function clearLive(guild) {
  const previous = live.get(guild.id);
  live.delete(guild.id);
  if (!previous?.messageId) return;
  const channel = guild.channels.cache.get(previous.channelId);
  const message = await channel?.messages.fetch(previous.messageId).catch(() => null);
  await message?.delete().catch(() => {});
}

/** Joue (ou resynchronise) dans le vocal le son écouté sur Spotify. */
async function playAlong(client, member, track) {
  const guild = member.guild;
  if (blindTestActive(guild.id)) return;
  const voiceChannel = lockedChannel(guild) ?? guild.channels.cache.get(config.voice.channelId);
  if (!voiceChannel) return;
  const player = getOrCreatePlayer(client, guild);
  const remaining = track.duration ? track.duration - track.position : 999;
  if (remaining < MIN_REMAINING_S) return;

  // Déjà le bon son au bon endroit : on ne touche à rien
  if (player.current?.spotifyId === track.trackId) {
    const gap = Math.abs(player.position() - track.position);
    if (gap < RESYNC_MS / 1000) return;
    await player.seek?.(track.position).catch?.(() => {});
    return;
  }

  const result = await resolveQuery(`${track.artist} ${track.title}`, { requestedBy: member.id }).catch(() => null);
  const found = result?.tracks?.[0];
  if (!found) {
    console.warn(`[spotify] introuvable pour le vocal : ${track.artist} - ${track.title}`);
    return;
  }
  await player.connect(voiceChannel);
  player.textChannelId ??= shareChannel(guild)?.id;
  player.playNow({ ...found, spotifyId: track.trackId, requestedBy: member.id, seekTo: track.position + 1 });
  console.log(`[spotify] ${member.displayName} écoute "${track.artist} - ${track.title}" : le bot suit dans le vocal (à ${track.position}s)`);
}

/** Partage en direct pour cette personne (et suivi en vocal si demandé). */
export function setShare(guildId, userId, { share = true, follow = null } = {}) {
  if (share) watched.add(userId);
  else {
    watched.delete(userId);
    if (following.get(guildId) === userId) following.delete(guildId);
  }
  if (follow === true) following.set(guildId, userId);
  if (follow === false && following.get(guildId) === userId) following.delete(guildId);
  return { share: watched.has(userId), follow: following.get(guildId) === userId };
}

export const isWatched = (userId) => watched.has(userId) || config.spotify.users.includes(userId);

export const isFollowing = (guildId, userId) => following.get(guildId) === userId;
export const followedUser = (guildId) => following.get(guildId) ?? null;

export async function shareNow(client, member) {
  return onPresence(client, member, true);
}

async function onPresence(client, member, forced = false) {
  if (!forced && !isWatched(member.id)) return;
  const track = spotifyActivity(member);
  if (!track) {
    await clearLive(member.guild);
    // La personne a mis en pause / fermé Spotify : le bot se tait aussi
    if (following.get(member.guild.id) === member.id) {
      const player = getPlayer(member.guild.id);
      if (player?.current?.spotifyId) player.stop();
    }
    return;
  }
  await showLive(member, track);
  if (following.get(member.guild.id) === member.id) await playAlong(client, member, track).catch((err) => console.warn('[spotify]', err.message));
}

/** Suit en direct le Spotify des personnes configurées. */
export function startSpotifyWatch(client) {
  if (watching || !config.spotify.enabled) return;
  watching = client;
  client.on('presenceUpdate', (oldPresence, newPresence) => {
    const member = newPresence?.member;
    if (!member || !isWatched(member.id)) return;
    onPresence(client, member).catch((err) => console.warn('[spotify]', err.message));
  });
  // Mise à jour régulière : barre de progression et resynchronisation
  const timer = setInterval(() => {
    for (const guild of client.guilds.cache.values()) {
      for (const userId of new Set([...config.spotify.users, ...watched])) {
        const member = guild.members.cache.get(userId);
        if (member?.presence) onPresence(client, member).catch(() => {});
      }
    }
  }, 15_000);
  timer.unref?.();
  console.log(`[spotify] partage en direct activé pour ${config.spotify.users.length} membre(s)`);
}
