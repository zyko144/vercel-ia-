// Vocal : salons temporaires, radio 24 h/24 avec le son du moment affiché, et micros saturés.
// - Rejoindre « ➕ Créer ton vocal » crée un salon à ton nom (tu le gères), supprimé dès qu'il est vide.
// - Radio : quand quelqu'un est dans le vocal du bot et que rien ne joue, la radio démarre toute seule.
// - Micros saturés : on décode seulement 1 paquet sur 10 (le processeur de Render reste libre) ; un micro
//   qui sature en continu reçoit un conseil amical en MP (pas de sanction).
import { createRequire } from 'node:module';
import { ChannelType, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { EndBehaviorType } from '@discordjs/voice';
import { load, save } from '../storage.js';
import { blindTestActive } from '../music/blindtest.js';
import { radioTracks } from '../music/handlers.js';
import { getOrCreatePlayer, getPlayer } from '../music/player.js';
import { cfg } from './guildConfig.js';
import { homeChannel, onVoiceReady } from './voice.js';
import { logEvent } from './security.js';

const require = createRequire(import.meta.url);

// ===================== Vocaux temporaires =====================

let temp = null; // Set des salons créés
async function tempSet() {
  temp ??= new Set((await load('vocaux-temp', []).catch(() => [])) ?? []);
  return temp;
}
const persistTemp = () => save('vocaux-temp', [...temp]);

async function onVoiceState(oldState, newState) {
  const guild = newState.guild;
  const set = await tempSet();
  // Un salon temporaire se vide : on le supprime
  if (oldState.channelId && set.has(oldState.channelId)) {
    const channel = guild.channels.cache.get(oldState.channelId);
    if (!channel) {
      set.delete(oldState.channelId);
      persistTemp();
    } else if (!channel.members.filter((m) => !m.user.bot).size) {
      set.delete(channel.id);
      persistTemp();
      await channel.delete('Vocal temporaire vide').catch(() => {});
    }
  }
  // Quelqu'un rejoint « Créer ton vocal » : on lui crée le sien
  const creator = cfg(guild.id, 'tempVoice.creatorId');
  if (!creator || newState.channelId !== creator || !newState.member || newState.member.user.bot) return;
  const source = guild.channels.cache.get(creator);
  const parent = cfg(guild.id, 'tempVoice.categoryId') || source?.parentId || null;
  const name = `🔊 ${newState.member.displayName}`.slice(0, 90);
  const channel = await guild.channels.create({
    name, type: ChannelType.GuildVoice, parent,
    permissionOverwrites: [{ id: newState.member.id, allow: [P.ManageChannels, P.MoveMembers, P.MuteMembers, P.Connect] }],
    reason: `Vocal temporaire de ${newState.member.user.username}`,
  }).catch((err) => {
    console.warn('[vocaux temporaires]', err.message);
    return null;
  });
  if (!channel) return;
  set.add(channel.id);
  persistTemp();
  await newState.member.voice.setChannel(channel).catch(() => {});
}

// ===================== Radio 24 h/24 =====================

const nowPlaying = new Map(); // guild -> message « en ce moment »

async function radioTick(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!cfg(guild.id, 'radio.enabled')) continue;
    const home = homeChannel(guild);
    const player = getPlayer(guild.id);
    const listeners = home?.members.filter((m) => !m.user.bot).size ?? 0;
    if (home && listeners && !player?.current && !blindTestActive(guild.id)) {
      try {
        const tracks = await radioTracks(cfg(guild.id, 'radio.style') || null, client.user.id);
        if (tracks.length) {
          const p = getOrCreatePlayer(client, guild);
          await p.connect(home);
          p.add(tracks.sort(() => Math.random() - 0.5));
          p.loop = 'queue';
          p.autoplay = true;
          console.log(`[radio] ${guild.name} : radio ${cfg(guild.id, 'radio.style') || 'top du moment'} lancée (${tracks.length} sons)`);
        }
      } catch (err) {
        console.warn('[radio]', err.message);
      }
    }
    await showNowPlaying(guild).catch(() => {});
  }
}

async function showNowPlaying(guild) {
  const channel = guild.channels.cache.get(cfg(guild.id, 'radio.channelId') ?? '');
  if (!channel?.isTextBased?.()) return;
  const track = getPlayer(guild.id)?.current;
  const embed = new EmbedBuilder().setColor(0xff5fd2).setTitle('📻 En ce moment à la radio')
    .setDescription(track ? `**${track.title}**${track.artist ? `\n${track.artist}` : ''}` : '_Silence radio : rejoins le vocal du bot pour lancer la musique._')
    .setFooter({ text: `Radio ${cfg(guild.id, 'radio.style') || 'top du moment'} · mise à jour toutes les 30 s` });
  if (track?.thumbnail) embed.setThumbnail(track.thumbnail);
  const key = `${track?.title ?? ''}`;
  const current = nowPlaying.get(guild.id);
  if (current?.key === key) return;
  if (current?.message) {
    const ok = await current.message.edit({ embeds: [embed] }).then(() => true, () => false);
    if (ok) {
      current.key = key;
      return;
    }
  }
  const message = await channel.send({ embeds: [embed] });
  nowPlaying.set(guild.id, { message, key });
}

// ===================== Micros saturés =====================

const CLIP = 32_000;
const sampling = new Set();
const clipped = new Map(); // guild:user -> dates des paquets saturés
const advised = new Map(); // guild:user -> dernier conseil
let OpusScript = null;

function attachLoudMic(client, guild, connection) {
  connection.receiver.speaking.on('start', (userId) => {
    if (!cfg(guild.id, 'loudMic.enabled') || sampling.has(userId) || userId === client.user.id) return;
    sampling.add(userId);
    OpusScript ??= require('opusscript');
    const decoder = new OpusScript(48_000, 2, OpusScript.Application.AUDIO);
    const stream = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: 800 } });
    let n = 0;
    const done = () => {
      sampling.delete(userId);
      try { decoder.delete(); } catch { /* déjà libéré */ }
    };
    stream.on('data', (packet) => {
      if (n++ % 10 || packet.length <= 3) return; // 1 paquet sur 10 seulement
      try {
        const pcm = decoder.decode(packet);
        const samples = pcm.length / 2;
        let hot = 0;
        for (let i = 0; i < samples; i++) if (Math.abs(pcm.readInt16LE(i * 2)) >= CLIP) hot++;
        if (hot / samples > 0.02) noteClip(client, guild, userId);
      } catch {
        // paquet illisible : on ignore
      }
    });
    stream.once('end', done);
    stream.once('close', done);
    stream.on('error', () => {});
  });
}

async function noteClip(client, guild, userId) {
  const key = `${guild.id}:${userId}`;
  const now = Date.now();
  const list = (clipped.get(key) ?? []).filter((t) => now - t < 20_000);
  list.push(now);
  clipped.set(key, list);
  if (list.length < 5 || now - (advised.get(key) ?? 0) < 30 * 60_000) return;
  advised.set(key, now);
  clipped.delete(key);
  const user = await client.users.fetch(userId).catch(() => null);
  await user?.send({ embeds: [new EmbedBuilder().setColor(0xffb020).setTitle('🎙️ Ton micro sature')
    .setDescription(`Sur **${guild.name}**, ton micro est trop fort : ça grésille pour les autres.\n• Baisse le volume d’entrée (Paramètres › Voix et vidéo)\n• Active « Réduction du bruit » et « Contrôle automatique du gain »\n• Éloigne un peu le micro de ta bouche`)] }).catch(() => {});
  await logEvent(guild, { color: 0xffb020, title: '🎙️ Micro saturé', description: `<@${userId}> a été prévenu en MP.` });
}

// ===================== Démarrage =====================

export function startVoiceExtras(client) {
  client.on('voiceStateUpdate', (oldState, newState) => {
    onVoiceState(oldState, newState).catch((err) => console.warn('[vocaux temporaires]', err.message));
  });
  onVoiceReady((guild, connection) => attachLoudMic(client, guild, connection));
  setInterval(() => radioTick(client).catch((err) => console.warn('[radio]', err.message)), 30_000).unref();
}

export const _test = { onVoiceState, noteClip, tempSet };
