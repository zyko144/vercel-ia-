// Surveillance vocale : le bot écoute son salon vocal et repère les vraies insultes envers le chef (Noam)
// ou envers le bot lui-même (Vercel). 1re fois : avertissement. Dès la 2e : exclusion d'1 minute,
// sortie du vocal et avertissement de plus. Chaque sanction s'affiche avec une carte animée (tampon néon).
//
// Comment ça marche, sans exploser le quota Gemini :
//  - on n'enregistre que quand quelqu'un parle (Discord signale le début de parole), jusqu'à 1 s de silence ;
//  - les phrases d'une même personne sont regroupées (jusqu'à ~20 s) et envoyées en UNE demande à Gemini,
//    qui transcrit et juge en même temps ;
//  - un plafond de demandes par heure, et les bouts trop courts ou trop silencieux sont ignorés ;
//  - une insulte n'est retenue que si Gemini la confirme ET qu'un vrai mot d'insulte est dans la transcription.
// Le chef n'est jamais écouté ni sanctionné. Rien n'est gardé : l'audio est jeté après la vérification.
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { EndBehaviorType, getVoiceConnection } from '@discordjs/voice';
import prism from 'prism-media';
import { chat } from '../ai/gemini.js';
import { config } from '../config.js';
import { dmOwner } from './escalation.js';
import { addInsultWarning, findInsults } from './protectOwner.js';
import { onVoiceReady } from './voice.js';
import { truncate } from '../utils/discord.js';

const RATE = 16_000; // 16 kHz mono : bien assez pour la voix
const BYTES_PER_SEC = RATE * 2;
const SILENCE_MS = 1000; // fin d'une phrase
const MAX_PHRASE_S = 12;
const MIN_PHRASE_S = 0.6;
const GROUP_WAIT_MS = 2500; // attente d'une phrase suivante avant d'envoyer le paquet
const MAX_GROUP_S = 20;
const MIN_LEVEL = 350; // volume moyen minimal (souffle, bruit de fond : ignorés)
const USER_GAP_MS = 4000; // au moins 4 s entre deux vérifications d'une même personne
const TIMEOUT_MS = 60_000;
const GIFS = { avertissement: 'assets/sanction/avertissement.gif', sanction: 'assets/sanction/sanction.gif' };

const attached = new WeakSet();
const recording = new Set(); // guild:user en cours d'enregistrement
const groups = new Map(); // guild:user -> { chunks, bytes, timer, channelId }
const lastCheck = new Map(); // user -> date
let hour = { start: 0, count: 0 };
export const voiceGuardStats = { checks: 0, insults: 0, skipped: 0, lastAt: null };

/** Faut-il que le bot entende (et donc ne soit pas en sourdine) ? */
export const guardWantsAudio = () => config.voiceGuard.enabled;

export function startVoiceGuard(client) {
  onVoiceReady((guild, connection) => attach(client, guild, connection));
  if (config.voiceGuard.enabled) console.log('🎙️ Surveillance vocale active (insultes envers le chef ou le bot)');
}

/** Change la sourdine du bot dans les vocaux où il est (quand on active / coupe la surveillance). */
export function applyVoiceGuard(client) {
  for (const guild of client.guilds.cache.values()) {
    const connection = getVoiceConnection(guild.id);
    if (!connection) continue;
    connection.rejoin({ ...connection.joinConfig, selfDeaf: !config.voiceGuard.enabled });
    if (config.voiceGuard.enabled) attach(client, guild, connection);
  }
}

function attach(client, guild, connection) {
  if (attached.has(connection)) return;
  attached.add(connection);
  connection.receiver.speaking.on('start', (userId) => {
    if (!config.voiceGuard.enabled) return;
    listen(client, guild, connection, userId).catch((err) => console.warn('[surveillance vocale]', err.message));
  });
}

async function listen(client, guild, connection, userId) {
  const key = `${guild.id}:${userId}`;
  if (recording.has(key) || userId === config.ownerId || userId === client.user.id) return;
  const user = client.users.cache.get(userId) ?? await client.users.fetch(userId).catch(() => null);
  if (!user || user.bot) return;
  recording.add(key);

  const opus = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_MS } });
  const decoder = new prism.opus.Decoder({ rate: RATE, channels: 1, frameSize: 320 });
  const chunks = [];
  let bytes = 0;
  opus.on('error', () => {});
  decoder.on('error', () => {});
  const ended = new Promise((resolve) => {
    opus.once('end', resolve);
    opus.once('close', resolve);
  });
  decoder.on('data', (pcm) => {
    chunks.push(pcm);
    bytes += pcm.length;
    if (bytes >= MAX_PHRASE_S * BYTES_PER_SEC) opus.destroy(); // phrase trop longue : on coupe ici
  });
  opus.pipe(decoder);
  await ended;
  await new Promise((resolve) => setTimeout(resolve, 60)); // les derniers morceaux décodés
  recording.delete(key);
  decoder.destroy();
  if (bytes < MIN_PHRASE_S * BYTES_PER_SEC) return;
  queue(client, guild, userId, connection.joinConfig.channelId, Buffer.concat(chunks));
}

/** Regroupe les phrases d'une personne pour n'envoyer qu'une demande à Gemini. */
function queue(client, guild, userId, channelId, pcm) {
  const key = `${guild.id}:${userId}`;
  const group = groups.get(key) ?? { chunks: [], bytes: 0, timer: null, channelId };
  group.chunks.push(pcm);
  group.bytes += pcm.length;
  group.channelId = channelId;
  clearTimeout(group.timer);
  groups.set(key, group);
  const flush = () => {
    groups.delete(key);
    check(client, guild, userId, group.channelId, Buffer.concat(group.chunks)).catch((err) => console.warn('[surveillance vocale] vérification :', err.message));
  };
  if (group.bytes >= MAX_GROUP_S * BYTES_PER_SEC) flush();
  else group.timer = setTimeout(flush, GROUP_WAIT_MS);
}

/** Volume moyen d'un morceau (PCM 16 bits). */
function level(pcm) {
  let sum = 0;
  const n = Math.floor(pcm.length / 2);
  for (let i = 0; i < n; i += 4) sum += Math.abs(pcm.readInt16LE(i * 2));
  return n ? sum / (n / 4) : 0;
}

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(BYTES_PER_SEC, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Plafond de demandes par heure (réglable) : au-delà, on laisse passer jusqu'à l'heure suivante. */
function allowed(userId) {
  const now = Date.now();
  if (now - hour.start > 3_600_000) hour = { start: now, count: 0 };
  if (hour.count >= config.voiceGuard.maxPerHour) return false;
  if (now - (lastCheck.get(userId) ?? 0) < USER_GAP_MS) return false;
  hour.count++;
  lastCheck.set(userId, now);
  return true;
}

const namesOf = (member, user) => [...new Set([member?.displayName, user?.globalName, user?.username].filter(Boolean))];
const simple = (text) => String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

const SCHEMA = {
  type: 'object',
  properties: {
    transcription: { type: 'string' },
    insulte: { type: 'boolean' },
    cible: { type: 'string', enum: ['chef', 'bot', 'aucune'] },
    mot: { type: 'string' },
    raison: { type: 'string' },
  },
  required: ['transcription', 'insulte', 'cible', 'mot', 'raison'],
};

async function check(client, guild, userId, channelId, pcm) {
  if (level(pcm) < MIN_LEVEL || !allowed(userId)) {
    voiceGuardStats.skipped++;
    return;
  }
  const channel = guild.channels.cache.get(channelId);
  const speaker = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
  const owner = guild.members.cache.get(config.ownerId) ?? await guild.members.fetch(config.ownerId).catch(() => null);
  const ownerNames = [...new Set(['Noam', ...namesOf(owner, owner?.user)])];
  const botNames = [...new Set(['Vercel', 'AI Vercel', client.user.username])];
  const ownerHere = Boolean(channel?.members?.has(config.ownerId));
  const others = channel?.members?.filter((m) => !m.user.bot && m.id !== userId).map((m) => m.displayName) ?? [];

  voiceGuardStats.checks++;
  voiceGuardStats.lastAt = Date.now();
  const { text } = await chat({
    tag: 'vocal',
    system: 'Tu es le modérateur vocal d\'un serveur Discord français. Tu transcris fidèlement ce qui est dit (argot, verlan, abréviations comprises) puis tu juges s\'il y a une vraie insulte envers le chef ou envers le bot. Tu es strict sur la cible : dans le doute, ce n\'est pas une insulte envers eux.',
    content: [
      { type: 'text', text: `Extrait audio de ${speaker?.displayName ?? 'un membre'} dans le salon vocal « ${channel?.name ?? '?'} ».
Le chef s'appelle : ${ownerNames.join(', ')}${ownerHere ? ' (il est dans ce vocal en ce moment)' : ' (il n\'est PAS dans ce vocal)'}.
Le bot s'appelle : ${botNames.join(', ')}.
Autres personnes présentes : ${others.join(', ') || 'personne'}.

1. transcription : ce qui est dit, mot pour mot, en français.
2. insulte : true seulement si la personne insulte VRAIMENT le chef ou le bot (fdp, ntm, connard, ta gueule, etc.), même pour rire.
   Ne compte PAS : une insulte envers quelqu'un d'autre, un juron sans cible (« putain », « merde »), se rabaisser soi-même, citer ou chanter des paroles, parler d'un jeu, ou quand on ne sait pas qui est visé.
3. cible : « chef », « bot » ou « aucune ».
4. mot : l'insulte exacte (vide sinon). 5. raison : une phrase courte.` },
      { type: 'audio', mime_type: 'audio/wav', data: wav(pcm).toString('base64') },
    ],
    web: false,
    thinking: 'low',
    exactThinking: true,
    responseFormat: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
  });
  const verdict = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  if (!verdict.insulte || verdict.cible === 'aucune') return;

  // Garde-fous : un vrai mot d'insulte doit être dans ce qui a été dit, et la cible doit être plausible
  const { strong, contextual } = findInsults(verdict.transcription);
  if (!strong.length && !contextual.length) {
    console.log(`[surveillance vocale] ignoré (pas de mot d'insulte reconnu) : « ${truncate(verdict.transcription, 120)} »`);
    return;
  }
  const said = simple(verdict.transcription);
  const named = (names) => names.some((n) => n.length >= 3 && said.includes(simple(n)));
  if (verdict.cible === 'bot' && !named(botNames)) return;
  if (verdict.cible === 'chef' && !ownerHere && !named(ownerNames)) return;

  voiceGuardStats.insults++;
  await punish(client, guild, speaker, channel, verdict);
}

async function punish(client, guild, member, channel, verdict) {
  if (!member) return;
  const target = verdict.cible === 'bot' ? 'le bot' : 'le chef';
  const word = truncate(verdict.mot || verdict.transcription, 60);
  const reason = `Insulte en vocal envers ${target} (« ${word} »)`;
  const count = await addInsultWarning(guild.id, member.id, { reason, by: client.user.id, kind: 'insulte-vocal', target: verdict.cible === 'bot' ? client.user.id : config.ownerId, message: truncate(verdict.transcription, 300) });
  const severe = count >= 2;

  let timedOut = false;
  let kicked = false;
  if (severe) {
    if (member.moderatable) timedOut = await member.timeout(TIMEOUT_MS, `${reason} · ${count}e avertissement`).then(() => true, () => false);
    if (member.voice?.channelId) kicked = await member.voice.disconnect(reason).then(() => true, () => false);
  }
  console.log(`[surveillance vocale] ${member.user.username} insulte ${target} (« ${word} ») · avertissement ${count}${timedOut ? ' · exclu 1 min' : ''}${kicked ? ' · sorti du vocal' : ''}`);

  const kind = severe ? 'sanction' : 'avertissement';
  const card = () => new AttachmentBuilder(GIFS[kind], { name: `${kind}.gif` });
  const sanction = severe
    ? [timedOut ? '🔇 Exclu **1 minute**' : '⚠️ Exclusion impossible (rôle au-dessus du bot)', kicked ? '🚪 Sorti du vocal' : null].filter(Boolean).join(' · ')
    : 'Aucune pour cette fois. **La prochaine : exclusion d\'1 minute et sortie du vocal.**';
  const embed = new EmbedBuilder()
    .setColor(severe ? 0xff3355 : 0xffb020)
    .setAuthor({ name: severe ? 'SANCTION · surveillance vocale' : 'AVERTISSEMENT · surveillance vocale', iconURL: member.displayAvatarURL({ size: 64 }) })
    .setDescription(`${member}, on n'insulte pas ${target} en vocal.`)
    .addFields(
      { name: 'Qui', value: `${member}`, inline: true },
      { name: 'Envers', value: target === 'le bot' ? `${client.user}` : `<@${config.ownerId}>`, inline: true },
      { name: 'Avertissements', value: `**${count}**`, inline: true },
      { name: 'Entendu', value: `||${word}||`, inline: true },
      { name: 'Sanction', value: sanction, inline: false },
    )
    .setImage(`attachment://${kind}.gif`)
    .setFooter({ text: `Salon vocal : ${channel?.name ?? '?'}` })
    .setTimestamp();

  // Dans le chat du salon vocal (tout le monde voit la sanction), sinon dans le salon du staff
  const where = channel?.isTextBased?.() ? channel : config.staffChannelId ? guild.channels.cache.get(config.staffChannelId) : null;
  await where?.send({ embeds: [embed], files: [card()], allowedMentions: { users: [member.id] } }).catch((err) => console.warn('[surveillance vocale] message :', err.message));
  await member.send({ embeds: [EmbedBuilder.from(embed).setDescription(`Sur **${guild.name}** : on n'insulte pas ${target} en vocal.`)], files: [card()] }).catch(() => {});
  dmOwner(client, {
    title: `🎙️ ${severe ? 'Sanction' : 'Avertissement'} vocal : ${member.user.username}`,
    description: `Envers ${target} · ${count} avertissement(s)\n> ${truncate(verdict.transcription, 500)}\n-# ${verdict.raison}`,
  }).catch(() => {});
}

// Pour le banc d'essai (tools/test-voiceguard.mjs)
export const _test = { wav, level, check, queue };
