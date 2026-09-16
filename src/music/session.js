// Sauvegarde de la musique en cours : si le bot redémarre (Render le fait souvent),
// il reprend la file d'attente là où elle en était.
import { load, save } from '../storage.js';
import { getOrCreatePlayer } from './player.js';

const KEY = 'music-sessions';
const MAX_AGE_MS = 20 * 60_000;
const MAX_QUEUE = 200;

const serialize = (t) => ({
  title: t.title, artist: t.artist ?? null, duration: t.duration ?? 0, thumbnail: t.thumbnail ?? null,
  url: t.url ?? null, playUrl: t.playUrl ?? null, source: t.source, query: t.query ?? null,
  spotifyId: t.spotifyId ?? null, deezerId: t.deezerId ?? null, artistId: t.artistId ?? null,
  requestedBy: t.requestedBy ?? null,
});

export async function saveSession(player) {
  if (player.blind) return;
  const sessions = await load(KEY, {});
  if (!player.current) {
    delete sessions[player.guild.id];
  } else {
    sessions[player.guild.id] = {
      at: Date.now(),
      voiceChannelId: player.botVoiceChannelId,
      textChannelId: player.textChannelId,
      volume: player.volume,
      filters: player.filters,
      loop: player.loop,
      autoplay: player.autoplay,
      position: Math.floor(player.position()),
      current: serialize(player.current),
      queue: player.queue.slice(0, MAX_QUEUE).map(serialize),
    };
  }
  save(KEY, sessions);
}

export async function clearSession(guildId) {
  const sessions = await load(KEY, {});
  if (!sessions[guildId]) return;
  delete sessions[guildId];
  save(KEY, sessions);
}

/** Au démarrage : on relance ce qui jouait avant, si des gens sont encore dans le vocal. */
export async function restoreSessions(client) {
  const sessions = await load(KEY, {});
  for (const [guildId, session] of Object.entries(sessions)) {
    if (Date.now() - session.at > MAX_AGE_MS) {
      delete sessions[guildId];
      continue;
    }
    try {
      const guild = client.guilds.cache.get(guildId);
      const voiceChannel = guild?.channels.cache.get(session.voiceChannelId);
      const humans = voiceChannel?.members.filter((m) => !m.user.bot).size ?? 0;
      if (!voiceChannel || !humans) {
        delete sessions[guildId];
        continue;
      }

      const player = getOrCreatePlayer(client, guild);
      player.textChannelId = session.textChannelId;
      player.volume = Math.min(session.volume ?? 100, 100);
      player.filters = [];
      player.loop = session.loop ?? 'off';
      player.autoplay = Boolean(session.autoplay);
      await player.connect(voiceChannel);
      player.add([{ ...session.current, seekTo: session.position ?? 0 }, ...(session.queue ?? [])]);

      const channel = await client.channels.fetch(session.textChannelId).catch(() => null);
      await channel?.send({
        content: `🔄 Je reprends la musique là où on s'était arrêtés : **${session.current.title}**${session.queue?.length ? ` (+${session.queue.length} en attente)` : ''}.`,
        allowedMentions: { parse: [] },
      }).catch(() => {});
      console.log(`[musique] session reprise sur ${guild.name}`);
    } catch (err) {
      console.warn('[musique] reprise impossible :', err.message);
      delete sessions[guildId];
    }
  }
  save(KEY, sessions);
}
