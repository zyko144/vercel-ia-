// Garde le bot connecté 24h/24 dans son vocal. La musique peut l'emmener temporairement dans un autre salon.
import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { lavalink } from '../music/lavalink.js';

const CHECK_EVERY_MS = 60_000;
const joining = new Map(); // guildId -> Promise
const warned = new Set();
const managed = new WeakSet();
const musicOverrides = new Map(); // guildId -> channelId
const externalOwners = new Set(); // serveurs où c'est Lavalink qui tient le vocal
const readyListeners = new Set();

const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const isVoice = (c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice;
const isAlive = (conn) => Boolean(conn)
  && conn.state.status !== VoiceConnectionStatus.Destroyed
  && conn.state.status !== VoiceConnectionStatus.Disconnected;

/** Appelé à chaque fois que le bot est prêt dans un vocal (sert à rebrancher le lecteur de musique). */
export function onVoiceReady(listener) {
  readyListeners.add(listener);
}

export function homeChannel(guild) {
  if (config.voice.channelId) {
    const byId = guild.channels.cache.get(config.voice.channelId);
    return byId && isVoice(byId) ? byId : null;
  }
  const categoryName = normalize(config.voice.categoryName);
  const channelName = normalize(config.voice.channelName);
  const categories = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildCategory && normalize(c.name).includes(categoryName),
  );
  for (const category of categories.values()) {
    const channel = guild.channels.cache.find(
      (c) => c.parentId === category.id && isVoice(c) && normalize(c.name).includes(channelName),
    );
    if (channel) return channel;
  }
  return null;
}

export function findTargetChannel(guild) {
  const musicChannelId = musicOverrides.get(guild.id);
  const musicChannel = musicChannelId && guild.channels.cache.get(musicChannelId);
  if (musicChannel) return musicChannel;
  return config.voice.enabled ? homeChannel(guild) : null;
}

async function ensureInVoice(guild) {
  const pending = joining.get(guild.id);
  if (pending) await pending.catch(() => {});
  const run = connect(guild);
  joining.set(guild.id, run);
  try {
    await run;
  } finally {
    if (joining.get(guild.id) === run) joining.delete(guild.id);
  }
}

async function connect(guild) {
  if (externalOwners.has(guild.id)) {
    // Sécurité : si plus aucune musique ne tourne côté serveur audio, on reprend la main
    if (lavalink.players.has(guild.id)) return;
    externalOwners.delete(guild.id);
  }
  const target = findTargetChannel(guild);
  if (!target) {
    if (config.voice.enabled && !warned.has(guild.id)) {
      warned.add(guild.id);
      console.warn(`[voc] "${guild.name}" : salon vocal introuvable (vérifie VOICE_CHANNEL_ID).`);
    }
    return;
  }

  let connection = getVoiceConnection(guild.id);
  const botChannelId = guild.members.me?.voice.channelId;
  if (isAlive(connection) && connection.joinConfig.channelId === target.id && (!botChannelId || botChannelId === target.id)) return;

  const perms = target.permissionsFor(guild.members.me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
    const key = `perm:${guild.id}:${target.id}`;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[voc] Pas la permission de rejoindre #${target.name} sur "${guild.name}".`);
    }
    return;
  }

  try {
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      // Déplacement : on garde la même connexion, donc la musique reste branchée dessus
      connection.rejoin({ channelId: target.id, selfDeaf: true, selfMute: false });
    } else {
      connection = joinVoiceChannel({
        channelId: target.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });
    }

    if (!managed.has(connection)) {
      managed.add(connection);
      const conn = connection;
      conn.on('error', (err) => console.warn('[voc] erreur :', err.message));
      conn.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          // Discord peut juste changer de serveur vocal : on laisse 5 s pour se reconnecter tout seul
          await Promise.race([
            entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
            entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          if (conn.state.status !== VoiceConnectionStatus.Destroyed) conn.destroy();
          setTimeout(() => ensureInVoice(guild).catch(() => {}), 5_000);
        }
      });
    }

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log(`[voc] Connecté à #${target.name} (${guild.name}) 🎧`);
    for (const listener of readyListeners) listener(guild, connection);
  } catch (err) {
    console.warn(`[voc] Connexion à #${target.name} ratée, nouvel essai dans 1 min :`, err.message);
    if (connection && ![VoiceConnectionStatus.Destroyed, VoiceConnectionStatus.Ready].includes(connection.state.status)) {
      connection.destroy();
    }
  }
}

export function startVoiceKeeper(client) {
  const checkAll = () => {
    for (const guild of client.guilds.cache.values()) {
      ensureInVoice(guild).catch((err) => console.warn('[voc]', err.message));
    }
  };

  if (config.voice.enabled) {
    checkAll();
    setInterval(checkAll, CHECK_EVERY_MS);
  }

  // Kick / déplacement du bot -> il revient là où il doit être
  client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.id !== client.user.id || externalOwners.has(newState.guild.id)) return;
    const target = findTargetChannel(newState.guild);
    if (target && newState.channelId !== target.id) {
      setTimeout(() => ensureInVoice(newState.guild).catch(() => {}), 3_000);
    }
  });
}

/** La musique emmène le bot dans le salon vocal de la personne. */
export async function connectForMusic(guild, channel) {
  musicOverrides.set(guild.id, channel.id);
  await ensureInVoice(guild);
  const connection = getVoiceConnection(guild.id);
  if (!connection || connection.joinConfig.channelId !== channel.id) {
    throw new Error("Impossible de rejoindre ton salon vocal (il me manque peut-être la permission « Se connecter »)");
  }
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  return connection;
}

/** Fin de la musique : le bot retourne dans son vocal habituel (ou quitte si le vocal 24h/24 est désactivé). */
export function releaseMusic(guild) {
  if (!musicOverrides.delete(guild.id)) return;
  if (config.voice.enabled) ensureInVoice(guild).catch(() => {});
  else getVoiceConnection(guild.id)?.destroy();
}

/**
 * Le serveur audio (Lavalink) prend la main sur le vocal.
 * On ferme la connexion locale SANS quitter le salon : le bot ne disparaît pas du vocal.
 */
export async function takeVoiceForExternal(guild) {
  externalOwners.add(guild.id);
  musicOverrides.delete(guild.id);
  const connection = getVoiceConnection(guild.id);
  if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
    connection.destroy(false); // false = on ne renvoie pas l'ordre de quitter le vocal
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

/** Fin de la musique Lavalink : le bot quitte puis retourne dans son vocal habituel. */
export async function releaseExternalVoice(guild) {
  if (!externalOwners.has(guild.id)) return;
  guild.shard.send({ op: 4, d: { guild_id: guild.id, channel_id: null, self_mute: false, self_deaf: false } });
  await new Promise((resolve) => setTimeout(resolve, 800));
  externalOwners.delete(guild.id);
  if (config.voice.enabled) ensureInVoice(guild).catch(() => {});
}

export const isExternalVoice = (guildId) => externalOwners.has(guildId);

export async function rejoinVoice(guild) {
  if (externalOwners.has(guild.id)) return false;
  const existing = getVoiceConnection(guild.id);
  if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) existing.destroy();
  await ensureInVoice(guild);
  return getVoiceConnection(guild.id)?.state.status === VoiceConnectionStatus.Ready;
}

export function voiceStatus(guild) {
  const conn = getVoiceConnection(guild.id);
  if (externalOwners.has(guild.id)) return 'tenu par le serveur audio (musique)';
  if (!conn) return 'déconnecté';
  const channel = guild.channels.cache.get(conn.joinConfig.channelId);
  return `${conn.state.status} dans #${channel?.name ?? '?'}`;
}
