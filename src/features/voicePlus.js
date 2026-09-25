// Vocal : classement du temps en vocal, récompense des soirées vocales, playlist votée, karaoké noté par l'IA,
// radio à thème, salon vocal d'attente. Boutons : « vp: ».
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { chat } from '../ai/gemini.js';
import { truncate } from '../utils/discord.js';
import { addGold } from './economy.js';
import { cfg } from './guildConfig.js';
import { topLevels } from './levels.js';
import { rewardWin } from './treasury.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const GOLD = 0xc9a978;
const MEDALS = ['🥇', '🥈', '🥉'];

// ===================== Classement du vocal (idée 74) =====================

export async function voiceLeaderboard(guild) {
  const list = (await topLevels(guild.id, 500)).sort((a, b) => b.voiceMin - a.voiceMin).filter((x) => x.voiceMin > 0).slice(0, 10);
  const hours = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  return new EmbedBuilder().setColor(GOLD).setTitle(`🎙️ Les pirates du vocal · ${guild.name}`)
    .setDescription(list.length ? list.map((x, i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${x.userId}> · **${hours(x.voiceMin)}**`).join('\n') : 'Personne n’a encore passé de temps en vocal.')
    .setFooter({ text: 'Temps compté quand on est au moins 2 et pas en sourdine' });
}

// ===================== Soirées vocales (idée 75) =====================

const party = new Map(); // serveur:membre -> { day, minutes, paid }
const PARTY_SIZE = 5;
const PARTY_MINUTES = 60;
const PARTY_REWARD = 150;
const today = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

async function partyTick(client) {
  const day = today();
  for (const guild of client.guilds.cache.values()) {
    if (!cfg(guild.id, 'voiceParty.enabled')) continue;
    for (const channel of guild.channels.cache.filter((c) => c.isVoiceBased?.()).values()) {
      const humans = channel.members.filter((m) => !m.user.bot && !m.voice.selfDeaf && !m.voice.serverDeaf);
      if (humans.size < PARTY_SIZE) continue;
      for (const m of humans.values()) {
        const key = `${guild.id}:${m.id}`;
        const p = party.get(key)?.day === day ? party.get(key) : { day, minutes: 0, paid: false };
        p.minutes += 1;
        party.set(key, p);
        if (!p.paid && p.minutes >= PARTY_MINUTES) {
          p.paid = true;
          await addGold(guild.id, m.id, PARTY_REWARD, 'Soirée vocale');
          m.send(`🎉 Belle soirée vocale sur **${guild.name}** ! **+🪙 ${PARTY_REWARD} pièces d’or** pour cette heure passée ensemble.`).catch(() => {});
        }
      }
    }
  }
  if (party.size > 20_000) party.clear();
}

// ===================== Radio à thème (idée 78) et playlist votée (idée 76) =====================

export const RADIO_THEMES = {
  pirate: { label: 'Chants de marins', emoji: '🏴‍☠️', style: 'sea shanty pirate' },
  rapfr: { label: 'Rap FR', emoji: '🎤', style: 'rap fr' },
  lofi: { label: 'Lofi pour réviser', emoji: '📚', style: 'lofi hip hop' },
  annees2000: { label: 'Années 2000', emoji: '💿', style: 'hits années 2000' },
  afro: { label: 'Afro / amapiano', emoji: '🌍', style: 'afrobeat amapiano' },
  jeux: { label: 'Musiques de jeux vidéo', emoji: '🎮', style: 'video game soundtrack' },
  chill: { label: 'Chill du soir', emoji: '🌙', style: 'chill rnb' },
  rock: { label: 'Rock', emoji: '🎸', style: 'rock classics' },
};

/** Lance la radio d'un style dans le vocal du bot. */
export async function startThemeRadio(client, guild, style) {
  const { radioTracks } = await import('../music/handlers.js');
  const { getOrCreatePlayer } = await import('../music/player.js');
  const { homeChannel } = await import('./voice.js');
  const home = homeChannel(guild);
  if (!home) return { error: 'Le bot n’a pas de salon vocal.' };
  const tracks = await radioTracks(style, client.user.id);
  if (!tracks.length) return { error: 'Aucun son trouvé pour ce style.' };
  const p = getOrCreatePlayer(client, guild);
  await p.connect(home);
  p.queue = [];
  p.add(tracks.sort(() => Math.random() - 0.5));
  p.loop = 'queue';
  p.autoplay = true;
  p.refreshPanel?.(true);
  return { count: tracks.length, home };
}

const polls = new Map(); // id -> { guildId, options, votes }
export async function playlistVote(interaction, seconds = 45) {
  const options = Object.entries(RADIO_THEMES).sort(() => Math.random() - 0.5).slice(0, 4);
  const id = Math.random().toString(36).slice(2, 9);
  const poll = { guildId: interaction.guildId, options, votes: new Map() };
  polls.set(id, poll);
  const view = (done = false) => ({
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🗳️ Quelle radio pour la suite ?')
      .setDescription(options.map(([k, t]) => `${t.emoji} **${t.label}** · ${[...poll.votes.values()].filter((v) => v === k).length} vote(s)`).join('\n'))
      .setFooter({ text: done ? 'Vote terminé' : `Fin du vote dans ${seconds} s · un vote par personne (tu peux changer)` })],
    components: done ? [] : [new ActionRowBuilder().addComponents(options.map(([k, t]) => new ButtonBuilder().setCustomId(`vp:vote:${id}:${k}`).setLabel(t.label).setEmoji(t.emoji).setStyle(ButtonStyle.Secondary)))],
  });
  poll.view = view;
  await interaction.reply(view());
  const message = await interaction.fetchReply().catch(() => null);
  setTimeout(async () => {
    polls.delete(id);
    const counts = options.map(([k]) => [k, [...poll.votes.values()].filter((v) => v === k).length]).sort((a, b) => b[1] - a[1]);
    const [winner] = counts[0][1] ? counts[0] : [options[0][0]];
    const theme = RADIO_THEMES[winner];
    const r = await startThemeRadio(interaction.client, interaction.guild, theme.style).catch((err) => ({ error: err.message }));
    await message?.edit(view(true)).catch(() => {});
    await interaction.followUp({ content: r.error ? `😕 ${r.error}` : `${theme.emoji} **${theme.label}** l’emporte ! La radio démarre dans ${r.home} (${r.count} sons).` }).catch(() => {});
  }, seconds * 1000).unref?.();
}

// ===================== Karaoké noté par l'IA (idée 77) =====================

let karaokeBusy = false;
export async function karaoke(interaction, { chanson }) {
  const { borrowVoiceAi, createNarrator, recordVoice, toWav, voiceAiChannelId } = await import('../voice-ai/assistant.js');
  const home = voiceAiChannelId();
  if (interaction.member?.voice?.channelId !== home) return interaction.reply({ content: `🎤 Rejoins <#${home}> pour chanter devant le jury.`, ...PRIVATE });
  if (karaokeBusy) return interaction.reply({ content: '🎤 Quelqu’un chante déjà, attends ton tour.', ...PRIVATE });
  karaokeBusy = true;
  let release = null;
  let narrator = null;
  try {
    release = await borrowVoiceAi('karaoké', { listen: true });
    narrator = createNarrator({ voice: 'Puck', style: 'Tu es un présentateur de karaoké enjoué et bienveillant.' });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xff5fa2).setTitle('🎤 Karaoké').setDescription(`${interaction.user} chante **${truncate(chanson, 120)}** !\nTu as **40 secondes** à partir du signal. Le jury IA écoute…`)] });
    await narrator.say(`Place à ${interaction.member.displayName} qui va chanter ${chanson} ! Trois, deux, un, à toi !`);
    const take = await recordVoice(interaction.user.id, 40_000);
    if (take.spokenMs < 4000) {
      await narrator.say('Oh, je n’ai presque rien entendu ! Rapproche-toi du micro et réessaie.');
      return interaction.followUp({ content: '🔇 Presque rien entendu : vérifie ton micro et réessaie.' });
    }
    const { text } = await chat({
      tag: 'jeux', web: false, thinking: 'low', exactThinking: true,
      system: 'Tu es le jury d’un karaoké entre amis : bienveillant, drôle, jamais méchant. Tu réponds uniquement en JSON.',
      content: [
        { type: 'text', text: `La personne chante « ${chanson} » a cappella. Note de 0 à 10 la justesse, le rythme et l'énergie, puis une note globale, et écris un commentaire de 2 phrases à lire à voix haute. Si l'audio ne ressemble pas à du chant, mets des notes basses.` },
        { type: 'audio', mime_type: 'audio/wav', data: toWav(take.pcm).toString('base64') },
      ],
      responseFormat: { type: 'text', mime_type: 'application/json', schema: { type: 'object', properties: { justesse: { type: 'number' }, rythme: { type: 'number' }, energie: { type: 'number' }, note: { type: 'number' }, commentaire: { type: 'string' } }, required: ['justesse', 'rythme', 'energie', 'note', 'commentaire'] } },
    });
    const r = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const note = Math.max(0, Math.min(10, Math.round(r.note * 10) / 10));
    const won = note >= 7 ? await rewardWin(interaction.guildId, interaction.user.id, 100, 'Karaoké') : 0;
    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor(note >= 7 ? 0x3fbf6a : GOLD).setTitle(`🎤 ${note}/10 pour ${interaction.member.displayName}`)
        .setDescription(`🎯 Justesse **${r.justesse}/10** · 🥁 Rythme **${r.rythme}/10** · ⚡ Énergie **${r.energie}/10**\n\n*${truncate(r.commentaire, 400)}*${won ? `\n\n**+🪙 ${won} pièces d’or** !` : ''}`)],
    });
    await narrator.say(`${note} sur 10 ! ${r.commentaire}`);
    return undefined;
  } catch (err) {
    const msg = `🎤 Karaoké impossible : ${err.message}.`;
    return interaction.replied ? interaction.followUp({ content: msg }).catch(() => {}) : interaction.reply({ content: msg, ...PRIVATE });
  } finally {
    narrator?.close();
    await release?.().catch(() => {});
    karaokeBusy = false;
  }
}

// ===================== Salon vocal d'attente (idée 79) =====================

const lastAlert = new Map();
export async function onVoiceWaiting(oldState, newState) {
  const waitingId = cfg(newState.guild.id, 'waiting.channelId');
  if (!waitingId || newState.channelId !== waitingId || oldState.channelId === waitingId || newState.member?.user.bot) return;
  const key = `${newState.guild.id}:${newState.id}`;
  if (Date.now() - (lastAlert.get(key) ?? 0) < 5 * 60_000) return;
  lastAlert.set(key, Date.now());
  const channel = newState.guild.channels.cache.get(cfg(newState.guild.id, 'waiting.alertChannelId') ?? cfg(newState.guild.id, 'logs.channelId') ?? '');
  if (!channel?.isTextBased?.()) return;
  await channel.send({
    embeds: [new EmbedBuilder().setColor(0xff9f2e).setDescription(`⏳ ${newState.member} attend dans <#${waitingId}>.`)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`vp:move:${newState.id}`).setLabel('Le déplacer vers moi').setEmoji('🎧').setStyle(ButtonStyle.Primary))],
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

// ===================== Boutons =====================

export const isVoicePlusComponent = (interaction) => /^vp:/.test(interaction.customId ?? '');
export async function handleVoicePlusComponent(client, interaction) {
  const [, what, id, arg] = interaction.customId.split(':');
  if (what === 'vote') {
    const poll = polls.get(id);
    if (!poll) return interaction.reply({ content: 'Le vote est terminé.', ...PRIVATE });
    poll.votes.set(interaction.user.id, arg);
    return interaction.update(poll.view());
  }
  if (what === 'move') {
    const me = interaction.member?.voice?.channel;
    if (!me) return interaction.reply({ content: '🎧 Rejoins d’abord un salon vocal.', ...PRIVATE });
    const target = await interaction.guild.members.fetch(id).catch(() => null);
    if (!target?.voice?.channelId) return interaction.reply({ content: 'Cette personne n’est plus en vocal.', ...PRIVATE });
    const ok = await target.voice.setChannel(me, `Déplacé par ${interaction.user.username}`).then(() => true, () => false);
    return interaction.update({ embeds: [new EmbedBuilder().setColor(ok ? 0x3fbf6a : 0xe0433a).setDescription(ok ? `✅ ${target} a été déplacé dans ${me} par ${interaction.user}.` : '❌ Impossible de le déplacer (permission « Déplacer des membres »).')], components: [] });
  }
  return undefined;
}

export function startVoicePlus(client) {
  setInterval(() => partyTick(client).catch((err) => console.warn('[soirée vocale]', err.message)), 60_000).unref();
  client.on('voiceStateUpdate', (o, n) => onVoiceWaiting(o, n).catch(() => {}));
}

export const _test = { party, partyTick, polls, PARTY_REWARD };
