// Embeds et boutons de la musique.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { FILTERS, filtersLabel } from './filters.js';
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

function progressBar(position, duration, size = 16) {
  if (!duration) return '';
  const ratio = Math.min(Math.max(position / duration, 0), 1);
  const index = Math.min(size - 1, Math.round(ratio * (size - 1)));
  return Array.from({ length: size }, (_, i) => (i < index ? '▬' : i === index ? '🔘' : '─')).join('');
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
  const next = player.queue[0];
  const queueDuration = player.queue.reduce((sum, t) => sum + (t.duration || 0), 0);
  const timeLine = track.isLive
    ? '🔴 **EN DIRECT**'
    : `${progressBar(position, track.duration)}\n\`${formatTime(position)} / ${formatTime(track.duration)}\``;

  const embed = new EmbedBuilder()
    .setColor(source.color)
    .setAuthor({ name: player.paused ? '⏸️ En pause' : '🎶 En cours de lecture' })
    .setTitle(cut(track.title, 250))
    .setDescription(`${track.artist ? `**${escape(track.artist)}**\n\n` : ''}${timeLine}`)
    .addFields(
      { name: '👤 Demandé par', value: requester(track), inline: true },
      { name: '🔊 Volume', value: `${player.volume}%`, inline: true },
      { name: '🔁 Boucle', value: LOOP_LABELS[player.loop], inline: true },
      { name: '🎛️ Effets', value: filtersLabel(player.filters), inline: true },
      { name: '📜 File', value: `${player.queue.length} son(s)${queueDuration ? ` · ${formatTime(queueDuration)}` : ''}`, inline: true },
      { name: '♾️ Autoplay', value: player.autoplay ? 'Activé' : 'Désactivé', inline: true },
    )
    .setFooter({ text: cut(`${source.label}${next ? ` · Ensuite : ${next.title}${next.artist ? ` — ${next.artist}` : ''}` : ''}`, 200) });
  if (track.url) embed.setURL(track.url);
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);

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
    .setDescription(lastTrack ? `Dernier son : ${trackLine(lastTrack)}\n\nTape \`/play\` pour relancer la musique 🎶` : 'Tape `/play` pour relancer la musique 🎶');
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
      lines.length ? lines.join('\n') : '*La file est vide, ajoute des sons avec `/play`*',
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
