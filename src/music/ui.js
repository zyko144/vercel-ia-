// Embeds et boutons de la musique.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { FILTERS, filtersLabel, speedOf } from './filters.js';
import { SOURCES } from './sources.js';

const LOOP_LABELS = { off: 'Désactivée', track: '🔂 Ce son', queue: '🔁 Toute la file' };
const escape = (text = '') => text.replace(/([*_`~|\\[\]])/g, '\\$1');
const cut = (text = '', max = 100) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "1:30", "90", "1:02:03" -> secondes */
export function parseTime(input) {
  const parts = String(input).trim().split(':').map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

function progressBar(position, duration, size = 18) {
  if (!duration) return '';
  const index = Math.round(Math.min(Math.max(position / duration, 0), 1) * (size - 1));
  return Array.from({ length: size }, (_, i) => (i < index ? '━' : i === index ? '●' : '─')).join('');
}

const requester = (track) => (track.requestedBy === 'autoplay' ? '♾️ Autoplay' : track.requestedBy ? `<@${track.requestedBy}>` : '—');

export function trackLine(track, { link = true } = {}) {
  const title = escape(cut(track.title, 70));
  const name = link && track.url ? `[${title}](${track.url})` : `**${title}**`;
  return `${name}${track.artist ? ` · ${escape(cut(track.artist, 40))}` : ''} \`${track.isLive ? 'LIVE' : formatTime(track.duration)}\``;
}

export function nowPlayingPayload(player) {
  const track = player.current;
  if (!track) return endedPayload(player.history.at(-1));

  const source = SOURCES[track.source] ?? SOURCES.web;
  const position = player.position();
  const queueDuration = player.queue.reduce((sum, t) => sum + (t.duration || 0), 0);
  // Minuterie de fin : Discord la fait défiler tout seul chez chaque personne, sans rien renvoyer
  const speed = speedOf(player.filters) || 1;
  const endsAt = Math.floor((Date.now() + Math.max(0, (track.duration - position) / speed) * 1000) / 1000);
  const timeLine = track.isLive
    ? '🔴 **EN DIRECT**'
    : `\`${formatTime(position)}\` ${progressBar(position, track.duration)} \`${formatTime(track.duration)}\`\n${player.paused ? '⏸️ En pause' : `Fin <t:${endsAt}:R>`}`;
  // Une seule ligne de réglages (plus de grille de 6 cases), les 3 prochains sons, la pochette en grand
  const infos = [`🔊 ${player.volume}%`, `🔁 ${LOOP_LABELS[player.loop]}`, `🎛️ ${filtersLabel(player.filters)}`, player.autoplay ? '♾️ Autoplay' : null].filter(Boolean).join('  ·  ');
  // Paroles en direct (ligne en cours en gras, la précédente et la suivante en gris)
  const L = player.lyrics; const li = player.lyricIndex ?? -1;
  const lyricBlock = L ? `\n\n${[L[li - 1], L[li], L[li + 1]].map((l, k) => (!l ? null : k === 1 ? `> 🎤 **${escape(l.text)}**` : `> -# ${escape(l.text)}`)).filter(Boolean).join('\n') || '> -# 🎤 Les paroles arrivent…'}` : '';
  const upNext = player.queue.slice(0, 3).map((t, i) => `\`${i + 1}\` ${trackLine(t)}`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(source.color)
    .setAuthor({ name: `${player.paused ? '⏸️ En pause' : '🎶 En cours'} · ${source.label}` })
    .setTitle(cut(track.title, 250))
    .setDescription(`${track.artist ? `### ${escape(cut(track.artist, 80))}\n` : ''}${timeLine}${lyricBlock}\n\n${infos}\nDemandé par ${requester(track)}`)
    .addFields({ name: '⏭️ À suivre', value: upNext || (player.autoplay ? 'L’autoplay choisit la suite ♾️' : 'File vide : ajoute un son avec ➕') })
    .setFooter({ text: `${player.queue.length} son${player.queue.length > 1 ? 's' : ''} dans la file${queueDuration ? ` · ${formatTime(queueDuration)}` : ''}` });
  if (track.url) embed.setURL(track.url);
  if (track.thumbnail) embed.setImage(track.thumbnail);

  return { content: '', embeds: [embed], components: controlRows(player), allowedMentions: { parse: [] } };
}

function controlRows(player) {
  const button = (id, emoji, style = ButtonStyle.Secondary, label) => {
    const b = new ButtonBuilder().setCustomId(`music:${id}`).setEmoji(emoji).setStyle(style);
    if (label) b.setLabel(label);
    return b;
  };

  const main = new ActionRowBuilder().addComponents(
    button('back', '⏮️'),
    button('pause', player.paused ? '▶️' : '⏸️', player.paused ? ButtonStyle.Success : ButtonStyle.Primary),
    button('skip', '⏭️'),
    button('stop', '⏹️', ButtonStyle.Danger),
    button('shuffle', '🔀'),
  );

  const sound = new ActionRowBuilder().addComponents(
    button('voldown', '🔉'),
    button('volup', '🔊'),
    button('loop', player.loop === 'track' ? '🔂' : '🔁', player.loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
    button('8d', '🎧', player.filters.includes('8d') ? ButtonStyle.Success : ButtonStyle.Secondary, '8D'),
    button('queue', '📜', ButtonStyle.Secondary, 'File'),
  );

  const effects = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('music:filters')
      .setPlaceholder(`🎛️ Effets audio : ${filtersLabel(player.filters).replace(/[^\p{L}\p{N} ,+.]/gu, '').replace(/\s+/g, ' ').trim() || 'aucun'}`)
      .setMinValues(0)
      .setMaxValues(Object.keys(FILTERS).length)
      .addOptions(Object.entries(FILTERS).map(([value, f]) => ({
        label: f.label, value, description: f.description, emoji: f.emoji, default: player.filters.includes(value),
      }))),
  );

  const extra = new ActionRowBuilder().addComponents(
    button('lyrics', '🎤', ButtonStyle.Secondary, 'Paroles'),
    button('add', '➕', ButtonStyle.Secondary, 'Ajouter'),
    button('fav', '❤️', ButtonStyle.Secondary, 'Favoris'),
    button('autoplay', '♾️', player.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary, 'Autoplay'),
  );

  return [main, sound, effects, extra];
}

export function endedPayload(lastTrack) {
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: '⏹️ Lecture terminée' })
    .setDescription(lastTrack ? `Dernier son : ${trackLine(lastTrack)}\n\nTape **/musique** › Jouer un son pour relancer la musique 🎶` : 'Tape **/musique** › Jouer un son pour relancer la musique 🎶');
  if (lastTrack?.thumbnail) embed.setThumbnail(lastTrack.thumbnail);
  return { content: '', embeds: [embed], components: [] };
}

const PAGE_SIZE = 10;

export function queuePayload(player, page = 0) {
  const pages = Math.max(1, Math.ceil(player.queue.length / PAGE_SIZE));
  const current = Math.min(Math.max(page, 0), pages - 1);
  const slice = player.queue.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const total = player.queue.reduce((sum, t) => sum + (t.duration || 0), 0);

  const lines = slice.map((t, i) => `\`${current * PAGE_SIZE + i + 1}.\` ${trackLine(t)} · ${requester(t)}`);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📜 File d\'attente')
    .setDescription([
      player.current ? `**En cours :** ${trackLine(player.current)}\n` : '',
      lines.length ? lines.join('\n') : '*La file est vide, ajoute des sons avec **/musique** › Jouer un son*',
    ].join('\n'))
    .setFooter({ text: `Page ${current + 1}/${pages} · ${player.queue.length} son(s) · ${formatTime(total)} · Boucle : ${LOOP_LABELS[player.loop]}` });

  const components = pages > 1
    ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`musicq:${current - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(current === 0),
      new ButtonBuilder().setCustomId(`musicq:${current + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(current >= pages - 1),
    )]
    : [];
  return { embeds: [embed], components };
}
