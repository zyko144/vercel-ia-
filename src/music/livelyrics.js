// Paroles synchronisées : la ligne en cours est surlignée et suit la musique, comme sur Spotify.
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { findLyrics } from './lyrics.js';

const REFRESH_MS = 3_000;
const MAX_DURATION_MS = 14 * 60_000; // le jeton Discord de la commande expire au bout de 15 min
const LINES_BEFORE = 3;
const LINES_AFTER = 5;
const sessions = new Map(); // userId -> arrêt de la session en cours

/** Transforme des paroles LRC ("[01:23.45] texte") en lignes horodatées. */
export function parseLrc(text = '') {
  const lines = [];
  for (const raw of text.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g)];
    if (!stamps.length) continue;
    const content = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const [, min, sec, frac] of stamps) {
      const at = Number(min) * 60_000 + Number(sec) * 1_000 + Number((frac ?? '0').padEnd(3, '0'));
      lines.push({ at, text: content });
    }
  }
  return lines.sort((a, b) => a.at - b.at);
}

export function currentLineIndex(lines, positionMs) {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].at <= positionMs) index = i;
    else break;
  }
  return index;
}

function escape(text = '') {
  return text.replace(/([*_`~|\\[\]])/g, '\\$1');
}

function render(lines, index, { title, artist, thumbnail, position, duration, live = true }) {
  const from = Math.max(0, index - LINES_BEFORE);
  const shown = lines.slice(from, index + LINES_AFTER + 1);
  const body = shown.map((line, i) => {
    const isCurrent = from + i === index;
    const text = line.text || '♪';
    return isCurrent ? `### ▸ ${escape(text)}` : `-# ${escape(text)}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setAuthor({ name: live ? '🎤 Paroles en direct' : '🎤 Paroles' })
    .setTitle(`${title}${artist ? ` — ${artist}` : ''}`.slice(0, 250))
    .setDescription(body.slice(0, 4000) || '♪')
    .setFooter({ text: live ? `Ça suit la musique · ${formatTime(position)} / ${formatTime(duration)}` : 'Paroles : lrclib.net' });
  if (thumbnail) embed.setThumbnail(thumbnail);
  return { content: '', embeds: [embed] };
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function plainPayload(found, track) {
  const text = found.plainLyrics ?? '';
  const embeds = [new EmbedBuilder()
    .setColor(0xfee75c)
    .setAuthor({ name: '🎤 Paroles' })
    .setTitle(`${found.trackName} — ${found.artistName}`.slice(0, 250))
    .setDescription(text.slice(0, 4000) || 'Paroles vides.')
    .setFooter({ text: 'Paroles non synchronisées · lrclib.net' })];
  if (text.length > 4000) embeds.push(new EmbedBuilder().setColor(0xfee75c).setDescription(`${text.slice(4000, 5800)}${text.length > 5800 ? '\n…' : ''}`));
  if (track?.thumbnail) embeds[0].setThumbnail(track.thumbnail);
  return { content: '', embeds };
}

/**
 * Affiche les paroles et les fait défiler avec la musique.
 * La réponse est privée : chacun peut ouvrir les siennes.
 */
export async function showLyrics(interaction, player, track) {
  sessions.get(interaction.user.id)?.();
  const found = await findLyrics(track);
  if (!found) return { content: `😕 J'ai pas trouvé les paroles de **${track.title}**.` };

  const lines = parseLrc(found.syncedLyrics ?? '');
  const isCurrentTrack = player?.current === track;
  if (!lines.length || !isCurrentTrack) return plainPayload(found, track);

  const info = { title: found.trackName, artist: found.artistName, thumbnail: track.thumbnail };
  const startedAt = Date.now();
  let lastIndex = -2;

  const tick = async () => {
    if (player.current !== track || Date.now() - startedAt > MAX_DURATION_MS) return stop();
    const position = player.position();
    const index = currentLineIndex(lines, position * 1000 + 400); // petite avance : Discord met ~0,4 s à afficher
    if (index === lastIndex) return undefined;
    lastIndex = index;
    try {
      await interaction.editReply(render(lines, Math.max(index, 0), { ...info, position, duration: track.duration }));
    } catch {
      stop();
    }
    return undefined;
  };

  const timer = setInterval(() => { tick().catch(() => stop()); }, REFRESH_MS);
  const stop = () => {
    clearInterval(timer);
    if (sessions.get(interaction.user.id) === stop) sessions.delete(interaction.user.id);
  };
  sessions.set(interaction.user.id, stop);

  return render(lines, Math.max(currentLineIndex(lines, player.position() * 1000), 0), {
    ...info, position: player.position(), duration: track.duration,
  });
}

export const LYRICS_FLAGS = MessageFlags.Ephemeral;
