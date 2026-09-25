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
import { load, save } from '../storage.js';

const CHECK_EVERY_MS = 20_000;
const ANCHOR_KEY = 'voice-anchor';
const anchors = new Map(); // guildId -> dernier salon vocal du chef (le bot y reste)
const holds = new Map(); // guildId -> salon bloqué (blind test en cours : le bot ne bouge pas)
const joining = new Map(); // guildId -> Promise
const warned = new Set();
const managed = new WeakSet();
const musicOverrides = new Map(); // guildId -> channelId
const externalOwners = new Set(); // serveurs où c'est Lavalink qui tient le vocal
const readyListeners = new Set();
const ownerTemps = new Map(); // guildId -> vocal privé que le chef vient de créer (le bot l'y rejoint)

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

/** Salon vocal autorisé en plus du salon habituel (bureau…). */
export function isAllowedVoice(guild, channel) {
  if (!channel) return false;
  return channel.id === homeChannel(guild)?.id || config.voice.extraChannels.includes(channel.id);
}

/**
 * Vocal verrouillé : le bot ne va que dans son salon... sauf dans les salons autorisés en plus.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').VoiceBasedChannel|null} [wanted] salon demandé (s'il est autorisé, il est gardé)
 */
export function lockedChannel(guild, wanted = null) {
  if (!config.voice.lockHome) return null;
  if (wanted && config.voice.extraChannels.includes(wanted.id)) return wanted;
  const temp = ownerTempChannel(guild);
  if (temp) return temp;
  // Déjà dans un salon autorisé (on l'y a emmené) : il y reste tant qu'il y a du monde
  const current = guild.members.me?.voice?.channel;
  const withSomeone = current?.members?.some((m) => !m.user.bot);
  if (!wanted && current && withSomeone && config.voice.extraChannels.includes(current.id)) return current;
  return homeChannel(guild);
}

/** Le vocal privé du chef, tant qu'il existe et que le chef y est. */
function ownerTempChannel(guild) {
  const channel = guild.channels.cache.get(ownerTemps.get(guild.id));
  if (!channel || !isVoice(channel) || guild.voiceStates.cache.get(config.ownerId)?.channelId !== channel.id) return null;
  return channel;
}

/** Le chef vient de créer son vocal privé : le bot le rejoint (même avec le vocal verrouillé). */
export async function joinOwnerTemp(guild, channel) {
  ownerTemps.set(guild.id, channel.id);
  if (holds.has(guild.id)) return undefined; // blind test en cours : le bot reste avec les joueurs
  return followNow(guild);
}

/** Le vocal privé est supprimé : le bot retourne dans son salon. */
export function leaveOwnerTemp(guild, channelId) {
  if (ownerTemps.get(guild.id) !== channelId) return;
  ownerTemps.delete(guild.id);
  followNow(guild).catch(() => {});
}

/** Pendant un blind test le bot reste dans le salon de la partie, même si le chef bouge. */
export function holdVoice(guildId, channelId) {
  holds.set(guildId, channelId);
}

export function releaseVoiceHold(guildId) {
  holds.delete(guildId);
}

export function heldChannel(guild) {
  if (config.voice.lockHome) return null;
  const channel = guild.channels.cache.get(holds.get(guild.id));
  return channel && isVoice(channel) ? channel : null;
}

/** Salon vocal où est le chef en ce moment (null s'il n'est pas en vocal, ou dans le salon AFK). */
export function followedChannel(guild) {
  if (config.voice.lockHome || !config.voice.followOwner || !config.ownerId) return null;
  const channel = guild.voiceStates.cache.get(config.ownerId)?.channel;
  if (!channel || channel.id === guild.afkChannelId || !isVoice(channel)) return null;
  return channel;
}

function rememberAnchor(guild, channel) {
  if (anchors.get(guild.id) === channel.id) return;
  anchors.set(guild.id, channel.id);
  save(ANCHOR_KEY, Object.fromEntries(anchors));
}

/** Là où le bot doit être : avec le chef, sinon dans le dernier salon du chef, sinon son vocal habituel. */
export function anchorChannel(guild) {
  if (config.voice.lockHome) return homeChannel(guild);
  const owner = followedChannel(guild);
  if (owner) {
    rememberAnchor(guild, owner);
    return owner;
  }
  const last = config.voice.followOwner && guild.channels.cache.get(anchors.get(guild.id));
  if (last && isVoice(last)) return last;
  return homeChannel(guild);
}

export function findTargetChannel(guild) {
  if (config.voice.lockHome) return lockedChannel(guild);
  const musicChannelId = musicOverrides.get(guild.id);
  const musicChannel = musicChannelId && guild.channels.cache.get(musicChannelId);
  if (musicChannel) return musicChannel;
  const held = heldChannel(guild);
  if (held) return held;
  return config.voice.enabled ? anchorChannel(guild) : null;
}

export async function ensureInVoice(guild) {
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
    const backend = lavalink.players.get(guild.id);
    const botChannelId = guild.members.me?.voice.channelId;
    const busy = backend && (backend.connecting || backend.leaving || backend.recovering);
    if (busy) return;
    // Le serveur audio tient le vocal : on vérifie juste que le bot est bien avec le chef
    if (backend && botChannelId) {
      const target = findTargetChannel(guild);
      if (target && target.id !== botChannelId) await backend.moveTo(target.id).catch((err) => console.warn('[voc] déplacement :', err.message));
      return;
    }
    if (backend?.player?.current) return; // la reprise du son gère le retour
    if (backend) {
      // Sécurité : le serveur audio "tient" le vocal mais le bot n'y est plus et rien ne joue -> on reprend la main
      console.warn(`[voc] "${guild.name}" : bot sorti du vocal après la musique, retour au salon 24h/24`);
      await backend.player.destroy().catch(() => {});
      return;
    }
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
      connection.rejoin({ channelId: target.id, selfDeaf: !config.voiceGuard.enabled, selfMute: false });
    } else {
      connection = joinVoiceChannel({
        channelId: target.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        // Pas en sourdine quand la surveillance vocale est active (sinon le bot n'entend rien)
        selfDeaf: !config.voiceGuard.enabled,
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

export async function startVoiceKeeper(client) {
  const checkAll = () => {
    for (const guild of client.guilds.cache.values()) {
      ensureInVoice(guild).catch((err) => console.warn('[voc]', err.message));
    }
  };

  // Dernier salon du chef gardé en mémoire : après un redémarrage le bot y retourne direct
  const saved = await load(ANCHOR_KEY, {}).catch(() => ({}));
  for (const [guildId, channelId] of Object.entries(saved ?? {})) anchors.set(guildId, channelId);

  if (config.voice.enabled) {
    checkAll();
    setInterval(checkAll, CHECK_EVERY_MS);
  }

  client.on('voiceStateUpdate', (oldState, newState) => {
    const { guild } = newState;

    // Le chef quitte son vocal privé (vers un autre salon) : le bot retourne là où il doit être
    if (newState.id === config.ownerId && config.voice.lockHome && oldState.channelId && oldState.channelId === ownerTemps.get(guild.id) && newState.channelId !== oldState.channelId) {
      setTimeout(() => followNow(guild).catch(() => {}), 700);
      return;
    }
    // Le chef rejoint ou change de vocal -> le bot le suit (avec la musique si elle tourne)
    if (newState.id === config.ownerId && config.voice.enabled && newState.channelId !== oldState.channelId) {
      const channel = followedChannel(guild);
      if (!channel) return;
      rememberAnchor(guild, channel);
      if (holds.has(guild.id)) return; // blind test en cours : le bot reste avec les joueurs
      console.log(`[voc] le chef est dans #${channel.name}, je le suis`);
      setTimeout(() => followNow(guild).catch((err) => console.warn('[voc] suivre le chef :', err.message)), 700);
      return;
    }

    // Kick / déplacement du bot -> il revient là où il doit être
    if (newState.id !== client.user.id) return;
    const target = findTargetChannel(guild);
    if (!target || newState.channelId === target.id) return;
    setTimeout(() => {
      if (externalOwners.has(guild.id)) {
        const backend = lavalink.players.get(guild.id);
        // Déplacé (pas éjecté) pendant que le serveur audio tient le vocal : on le ramène
        if (backend && guild.members.me?.voice.channelId && !backend.connecting) backend.moveTo(findTargetChannel(guild)?.id).catch(() => {});
        return;
      }
      ensureInVoice(guild).catch(() => {});
    }, 3_000);
  });
}

/** Emmène le bot (et la musique) dans le salon du chef. */
async function followNow(guild) {
  const target = findTargetChannel(guild);
  if (!target || guild.members.me?.voice.channelId === target.id) return;
  if (externalOwners.has(guild.id)) {
    const backend = lavalink.players.get(guild.id);
    if (backend) return backend.moveTo(target.id);
  }
  musicOverrides.delete(guild.id);
  return ensureInVoice(guild);
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
