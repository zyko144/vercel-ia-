// Surveillance vocale : le bot écoute son salon vocal et repère les vraies insultes contre le chef (Noam),
// seulement quand il est lui-même dans ce vocal, et seulement si son nom est dit. Personne d'autre n'est
// protégé (ni le bot, ni les autres membres). 1er et 2e : avertissement. Dès le 3e : exclusion d'1 minute,
// sortie du vocal et avertissement de plus. Chaque sanction s'affiche avec une carte animée (tampon néon).
//
// Comment ça marche, sans exploser le quota Gemini :
//  - on n'enregistre que quand quelqu'un parle (Discord signale le début de parole), jusqu'à 1 s de silence ;
//  - les phrases d'une même personne sont regroupées (jusqu'à ~20 s) et envoyées en UNE demande à Gemini,
//    qui transcrit et juge en même temps ;
//  - un plafond de demandes par heure, et les bouts trop courts ou trop silencieux sont ignorés ;
//  - une insulte n'est retenue que si Gemini la confirme ET qu'un vrai mot d'insulte est dans la transcription.
// Le chef n'est jamais écouté ni sanctionné. Rien n'est gardé : l'audio est jeté après la vérification.
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { cfg } from './guildConfig.js';
import { EndBehaviorType, getVoiceConnection } from '@discordjs/voice';
import { chat } from '../ai/gemini.js';
import { config } from '../config.js';
import { dmOwner } from './escalation.js';
import { addInsultWarning, findInsults } from './protectOwner.js';
import { guardOptionsOf } from './premium.js';
import { onVoiceReady } from './voice.js';
import { truncate } from '../utils/discord.js';
import { opusToOgg } from '../utils/ogg.js';

// La voix n'est jamais décodée : les paquets Opus de Discord (20 ms chacun) sont mis tels quels dans un
// fichier Ogg pour Gemini. Décoder en JavaScript (opusscript) bloquait le bot sur le petit processeur de Render,
// au point de répondre trop tard aux commandes (« Unknown interaction »).
const PACKETS_PER_SEC = 50;
const SILENT_PACKET = 3; // taille d'un paquet de silence Discord (F8 FF FE)
const SILENCE_MS = 1000; // fin d'une phrase
const MAX_PHRASE_S = 12;
const MIN_PHRASE_S = 0.6;
const GROUP_WAIT_MS = 2500; // attente d'une phrase suivante avant d'envoyer le paquet
const MAX_GROUP_S = 20;
const USER_GAP_MS = 4000; // au moins 4 s entre deux vérifications d'une même personne
const TIMEOUT_MS = 60_000;
export const SANCTION_AT = 3; // avertissements avant l'exclusion
const GIFS = { avertissement: 'assets/sanction/avertissement.gif', sanction: 'assets/sanction/sanction.gif' };

const attached = new WeakSet();
const recording = new Set(); // guild:user en cours d'enregistrement
const groups = new Map(); // guild:user -> { packets, timer, channelId }
const lastCheck = new Map(); // user -> date
// Façons dont Gemini peut écrire « Noam » en transcrivant
const NOAM_SPELLINGS = ['noam', 'noham', 'nohm', 'noame', 'nohame', 'noan', 'naom'];
let hour = { start: 0, count: 0 };
export const voiceGuardStats = { checks: 0, insults: 0, skipped: 0, lastAt: null, recent: [] };

/** Garde les 15 dernières écoutes (pour comprendre depuis le tableau de bord pourquoi ça a marché ou pas). */
function note(entry) {
  voiceGuardStats.recent.unshift({ at: Date.now(), ...entry });
  voiceGuardStats.recent.length = Math.min(voiceGuardStats.recent.length, 15);
  console.log(`[surveillance vocale] ${entry.who} : « ${truncate(entry.heard ?? '', 140)} » → ${entry.decision}`);
}

/** Faut-il que le bot entende (et donc ne soit pas en sourdine) ? */
export const guardWantsAudio = () => config.voiceGuard.enabled;

export function startVoiceGuard(client) {
  onVoiceReady((guild, connection) => attach(client, guild, connection));
  if (config.voiceGuard.enabled) console.log('🎙️ Surveillance vocale active (insultes contre Noam quand il est en vocal)');
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
  // Aucune personne protégée dans ce vocal (et pas de mots interdits Gardien) : on n'écoute personne
  if (!protectedIn(guild, guild.channels.cache.get(connection.joinConfig.channelId)).length && !guardOptionsOf(guild.id).words.length) return;
  const user = client.users.cache.get(userId) ?? await client.users.fetch(userId).catch(() => null);
  if (!user || user.bot) return;
  recording.add(key);

  const opus = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: SILENCE_MS } });
  const packets = [];
  opus.on('error', () => {});
  const ended = new Promise((resolve) => {
    opus.once('end', resolve);
    opus.once('close', resolve);
  });
  opus.on('data', (packet) => {
    if (packet.length > SILENT_PACKET) packets.push(packet);
    if (packets.length >= MAX_PHRASE_S * PACKETS_PER_SEC) opus.destroy(); // phrase trop longue : on coupe ici
  });
  await ended;
  recording.delete(key);
  if (packets.length < MIN_PHRASE_S * PACKETS_PER_SEC) return;
  queue(client, guild, userId, connection.joinConfig.channelId, packets);
}

/** Regroupe les phrases d'une personne pour n'envoyer qu'une demande à Gemini. */
function queue(client, guild, userId, channelId, packets) {
  const key = `${guild.id}:${userId}`;
  const group = groups.get(key) ?? { packets: [], timer: null, channelId };
  group.packets.push(...packets);
  group.channelId = channelId;
  clearTimeout(group.timer);
  groups.set(key, group);
  const flush = () => {
    groups.delete(key);
    check(client, guild, userId, group.channelId, group.packets).catch((err) => console.warn('[surveillance vocale] vérification :', err.message));
  };
  if (group.packets.length >= MAX_GROUP_S * PACKETS_PER_SEC) flush();
  else group.timer = setTimeout(flush, GROUP_WAIT_MS);
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
    cible: { type: 'string', enum: ['chef', 'aucune'] },
    mot: { type: 'string' },
    raison: { type: 'string' },
  },
  required: ['transcription', 'insulte', 'cible', 'mot', 'raison'],
};

async function check(client, guild, userId, channelId, packets) {
  if (!allowed(userId)) {
    voiceGuardStats.skipped++;
    if (hour.count >= config.voiceGuard.maxPerHour) console.warn(`[surveillance vocale] plafond de ${config.voiceGuard.maxPerHour} écoutes par heure atteint`);
    return;
  }
  const channel = guild.channels.cache.get(channelId);
  const words = guardOptionsOf(guild.id).words;
  const present = protectedIn(guild, channel).filter((id) => id !== userId);
  if (!present.length && !words.length) return note({ who: userId, heard: '', decision: 'ignoré : le chef n’est pas dans le vocal' });
  const speaker = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
  // Les noms de chaque personne protégée présente (le chef : « Noam » et ses pseudos, orthographes comprises)
  const targets = [];
  for (const id of present) {
    const m = guild.members.cache.get(id) ?? await guild.members.fetch(id).catch(() => null);
    const names = namesOf(m, m?.user);
    targets.push({ id, label: id === config.ownerId ? 'Noam' : m?.displayName ?? 'un membre protégé', names: id === config.ownerId ? [...new Set(['Noam', ...names])] : names, spellings: id === config.ownerId ? NOAM_SPELLINGS : [] });
  }
  const others = channel?.members?.filter((m) => !m.user.bot && m.id !== userId).map((m) => m.displayName) ?? [];

  voiceGuardStats.checks++;
  voiceGuardStats.lastAt = Date.now();
  const { text } = await chat({
    tag: 'vocal',
    system: 'Tu es le modérateur vocal d\'un serveur Discord français. Tu transcris fidèlement ce qui est dit (argot, verlan, abréviations comprises) puis tu juges s\'il y a une vraie insulte envers une personne protégée, nommée dans la phrase.',
    content: [
      { type: 'text', text: `Extrait audio de ${speaker?.displayName ?? 'un membre'} dans le salon vocal « ${channel?.name ?? '?'} ».
${targets.length ? `Personnes protégées présentes : ${targets.map((t) => `${t.label} (${t.names.join(', ')})`).join(' ; ')}.
Seules comptent les phrases où l'on DIT leur nom. Écris ces noms tels quels dans la transcription.` : 'Aucune personne protégée n\'est présente : transcris simplement.'}
Autres personnes présentes : ${others.join(', ') || 'personne'}.

1. transcription : ce qui est dit, mot pour mot, en français.
2. insulte : true seulement si la personne insulte VRAIMENT une personne protégée en la nommant (« Noam t'es un fdp », « ferme ta gueule Noam »), même pour rire.
   Ne compte PAS : une phrase sans son nom, une insulte envers quelqu'un d'autre (le bot, un autre membre), un juron sans cible (« putain », « merde »), se rabaisser soi-même, citer ou chanter des paroles, parler d'un jeu, ou quand on ne sait pas qui est visé.
3. cible : « chef » (une personne protégée est visée) ou « aucune ».
4. mot : l'insulte exacte (vide sinon). 5. raison : une phrase courte.` },
      { type: 'audio', mime_type: 'audio/ogg', data: opusToOgg(packets).toString('base64') },
    ],
    web: false,
    thinking: 'low',
    exactThinking: true,
    responseFormat: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
  });
  const verdict = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  const who = speaker?.displayName ?? userId;
  const said = simple(verdict.transcription);
  const squashed = said.replace(/[^a-z0-9]/g, '');
  const says = (names) => names.map(simple).some((n) => n.length >= 3 && (said.includes(n) || squashed.includes(n.replace(/[^a-z0-9]/g, ''))));

  // Gardien : un mot interdit compte quel que soit qui est visé
  const banned = words.find((w) => ` ${said} `.includes(` ${simple(w)} `));
  if (banned) {
    note({ who, heard: verdict.transcription, decision: `MOT INTERDIT (« ${banned} »)` });
    voiceGuardStats.insults++;
    return punish(client, guild, speaker, channel, { ...verdict, mot: banned }, { victimId: null });
  }

  if (!verdict.insulte || verdict.cible === 'aucune') return note({ who, heard: verdict.transcription, decision: 'pas d’insulte envers Noam' });
  // Garde-fous : un vrai mot d'insulte doit être dans ce qui a été dit, et la personne doit être nommée
  const { strong, contextual } = findInsults(verdict.transcription);
  if (!strong.length && !contextual.length) return note({ who, heard: verdict.transcription, decision: 'ignoré : pas de vrai mot d’insulte' });
  const victim = targets.find((t) => says([...t.names, ...t.spellings]));
  if (!victim) return note({ who, heard: verdict.transcription, decision: 'ignoré : Noam n’est pas visé nommément' });
  note({ who, heard: verdict.transcription, decision: `INSULTE (« ${verdict.mot} »)` });

  voiceGuardStats.insults++;
  await punish(client, guild, speaker, channel, verdict, { victimId: victim.id, victimLabel: victim.label });
}

/** Les personnes protégées présentes dans le vocal : le chef, plus celles de l'offre Gardien. */
function protectedIn(guild, channel) {
  const ids = [config.ownerId, ...guardOptionsOf(guild.id).protectedIds];
  return [...new Set(ids)].filter((id) => channel?.members?.has(id));
}

/** Le salon où les sanctions sont aussi affichées : VOICE_GUARD_CHANNEL_ID, sinon le salon texte « agora ». */
function announceChannel(guild) {
  const byId = config.voiceGuard.channelId && guild.channels.cache.get(config.voiceGuard.channelId);
  if (byId?.isTextBased?.()) return byId;
  // NFKD ramène les lettres décorées (𝐀𝐠𝐨𝐫𝐚) à des lettres normales
  return guild.channels.cache.find((c) => c.type === 0 && simple(c.name).replace(/[^a-z0-9]/g, '').includes('agora')) ?? null;
}

async function punish(client, guild, member, channel, verdict, { victimId, victimLabel }) {
  if (!member) return;
  const target = victimId ? victimLabel ?? 'Noam' : null;
  const word = truncate(verdict.mot || verdict.transcription, 60);
  const reason = target ? `Insulte en vocal envers ${target} (« ${word} »)` : `Mot interdit en vocal (« ${word} »)`;
  const count = await addInsultWarning(guild.id, member.id, { reason, by: client.user.id, kind: 'insulte-vocal', target: victimId, message: truncate(verdict.transcription, 300) });
  const severe = count >= SANCTION_AT;

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
    : `Aucune pour cette fois. **Au ${SANCTION_AT}e avertissement : exclusion d'1 minute et sortie du vocal** (encore ${SANCTION_AT - count}).`;
  const embed = new EmbedBuilder()
    .setColor(severe ? 0xff3355 : 0xffb020)
    .setAuthor({ name: severe ? 'SANCTION · surveillance vocale' : 'AVERTISSEMENT · surveillance vocale', iconURL: member.displayAvatarURL({ size: 64 }) })
    .setDescription(target ? `${member}, on n'insulte pas ${target} en vocal.` : `${member}, ce mot est interdit en vocal sur ce serveur.`)
    .addFields(
      { name: 'Qui', value: `${member}`, inline: true },
      { name: target ? 'Envers' : 'Motif', value: victimId ? `<@${victimId}>` : 'Mot interdit', inline: true },
      { name: 'Avertissements', value: `**${count}**`, inline: true },
      { name: 'Entendu', value: `||${word}||`, inline: true },
      { name: 'Sanction', value: sanction, inline: false },
    )
    .setImage(`attachment://${kind}.gif`)
    .setFooter({ text: `Salon vocal : ${channel?.name ?? '?'}` })
    .setTimestamp();

  // Dans le chat du salon vocal ET dans #agora (ou le salon choisi), avec un ping pour que le membre ait la notif
  const places = [channel?.isTextBased?.() ? channel : null, announceChannel(guild)].filter(Boolean);
  if (!places.length && config.staffChannelId) places.push(guild.channels.cache.get(config.staffChannelId));
  const why = victimId ? `pour avoir insulté <@${victimId}> en vocal` : 'pour un mot interdit en vocal';
  const content = severe ? `🚨 ${member} **sanctionné** ${why}.` : `⚠️ ${member} **avertissement** ${why}.`;
  for (const place of new Set(places)) {
    await place.send({ content, embeds: [embed], files: [card()], allowedMentions: { users: [member.id] } }).catch((err) => console.warn(`[surveillance vocale] message dans #${place.name} :`, err.message));
  }
  await member.send({ embeds: [EmbedBuilder.from(embed).setDescription(target ? `Sur **${guild.name}** : on n'insulte pas ${target} en vocal.` : `Sur **${guild.name}** : ce mot est interdit en vocal.`)], files: [card()], components: cfg(guild.id, 'appeals.enabled') ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ap:open:${guild.id}`).setLabel('Contester').setEmoji('⚖️').setStyle(ButtonStyle.Secondary))] : [] }).catch(() => {});
  dmOwner(client, {
    title: `🎙️ ${severe ? 'Sanction' : 'Avertissement'} vocal : ${member.user.username}`,
    description: `${target ? `Envers ${target}` : 'Mot interdit'} · ${count} avertissement(s)\n> ${truncate(verdict.transcription, 500)}\n-# ${verdict.raison}`,
  }).catch(() => {});
}

// Pour le banc d'essai (tools/test-voiceguard.mjs)
export const _test = { check, queue };
