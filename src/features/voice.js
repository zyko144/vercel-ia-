// Garde le bot connecté 24h/24 dans le vocal "bureau" de la catégorie "vercel".
import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';

const CHECK_EVERY_MS = 60_000;
const joining = new Set();
const warned = new Set();

const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const isVoice = (c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice;

export function findTargetChannel(guild) {
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

async function ensureInVoice(guild) {
  const target = findTargetChannel(guild);
  if (!target) {
    if (!warned.has(guild.id)) {
      warned.add(guild.id);
      console.warn(`[voc] "${guild.name}" : pas de vocal "${config.voice.channelName}" dans la catégorie "${config.voice.categoryName}".`);
    }
    return;
  }

  const existing = getVoiceConnection(guild.id);
  const alive = existing && existing.state.status !== VoiceConnectionStatus.Destroyed
    && existing.state.status !== VoiceConnectionStatus.Disconnected;
  const botChannelId = guild.members.me?.voice.channelId;
  if (alive && existing.joinConfig.channelId === target.id && (!botChannelId || botChannelId === target.id)) return;
  if (joining.has(guild.id)) return;

  const perms = target.permissionsFor(guild.members.me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
    if (!warned.has(`perm:${guild.id}`)) {
      warned.add(`perm:${guild.id}`);
      console.warn(`[voc] Pas la permission de rejoindre #${target.name} sur "${guild.name}".`);
    }
    return;
  }

  joining.add(guild.id);
  let connection;
  try {
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) existing.destroy();
    connection = joinVoiceChannel({
      channelId: target.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });

    connection.on('error', (err) => console.warn('[voc] erreur :', err.message));
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Discord peut juste changer de serveur vocal : on laisse 5 s pour se reconnecter tout seul
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
        setTimeout(() => ensureInVoice(guild).catch(() => {}), 5_000);
      }
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log(`[voc] Connecté à #${target.name} (${guild.name}) 🎧`);
  } catch (err) {
    console.warn(`[voc] Connexion à #${target.name} ratée, nouvel essai dans 1 min :`, err.message);
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
  } finally {
    joining.delete(guild.id);
  }
}

export function startVoiceKeeper(client) {
  if (!config.voice.enabled) return;

  const checkAll = () => {
    for (const guild of client.guilds.cache.values()) {
      ensureInVoice(guild).catch((err) => console.warn('[voc]', err.message));
    }
  };

  checkAll();
  setInterval(checkAll, CHECK_EVERY_MS);

  // Kick / déplacement du bot -> il revient
  client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.id !== client.user.id) return;
    const target = findTargetChannel(newState.guild);
    if (target && newState.channelId !== target.id) {
      setTimeout(() => ensureInVoice(newState.guild).catch(() => {}), 3_000);
    }
  });

  client.on('channelCreate', (channel) => channel.guild && ensureInVoice(channel.guild).catch(() => {}));
}

export async function rejoinVoice(guild) {
  const existing = getVoiceConnection(guild.id);
  if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) existing.destroy();
  await ensureInVoice(guild);
  return getVoiceConnection(guild.id)?.state.status === VoiceConnectionStatus.Ready;
}

export function voiceStatus(guild) {
  const conn = getVoiceConnection(guild.id);
  if (!conn) return 'déconnecté';
  const channel = guild.channels.cache.get(conn.joinConfig.channelId);
  return `${conn.state.status} dans #${channel?.name ?? '?'}`;
}
