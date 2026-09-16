// Commandes, boutons, menus et suggestions de la musique.
import {
  EmbedBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '../config.js';
import { musicSuggestions } from './autocomplete.js';
import { blindTestActive, handleBlindTestMessage, startBlindTest, stopBlindTest } from './blindtest.js';
import { deezer, rankResults, trackFromDeezer } from './deezer.js';
import { musicStats } from './stats.js';
import { FILTERS, filtersLabel } from './filters.js';
import { adjustLyrics, showLyrics } from './livelyrics.js';
import { getOrCreatePlayer, getPlayer } from './player.js';
import * as playlists from './playlists.js';
import { aiPlaylist, resolveQuery } from './sources.js';
import { nowPlayingPayload, parseTime, queuePayload, trackLine } from './ui.js';
import { truncate } from '../utils/discord.js';
import { MusicError } from './ytdlp.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const say = (content) => ({ content, ...PRIVATE });
const LOOP_TEXT = { off: '➡️ Boucle désactivée', track: '🔂 Je répète ce son', queue: '🔁 Je répète toute la file' };

const isDj = (interaction) => interaction.user.id === config.ownerId
  || Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Pour contrôler la musique il faut être dans le même vocal que le bot (sauf admins / chef). */
function controlProblem(interaction, player) {
  if (!player?.current) return '🎵 Y a rien en cours de lecture. Lance un son avec `/play` !';
  if (isDj(interaction)) return null;
  const userChannel = interaction.member?.voice?.channelId;
  if (!userChannel || userChannel !== player.botVoiceChannelId) {
    return `🎧 Rejoins <#${player.botVoiceChannelId}> pour contrôler la musique.`;
  }
  return null;
}

/** Vérifie qu'on peut lancer de la musique pour ce membre. */
function joinProblem(interaction) {
  const channel = interaction.member?.voice?.channel;
  if (!channel) return { error: "🎧 Rejoins d'abord un salon vocal, puis relance la commande." };
  const player = getPlayer(interaction.guildId);
  const botChannelId = player?.botVoiceChannelId;
  if (player?.current && botChannelId && botChannelId !== channel.id && !isDj(interaction)) {
    const listeners = interaction.guild.channels.cache.get(botChannelId)?.members.filter((m) => !m.user.bot).size ?? 0;
    if (listeners > 0) return { error: `🎶 Je joue déjà de la musique dans <#${botChannelId}>, viens là-bas !` };
  }
  return { channel };
}

async function queueTracks(client, interaction, result, { next = false, shuffle = false, label = '' } = {}) {
  if (blindTestActive(interaction.guildId)) return interaction.editReply('🎧 Un blind test est en cours ! Attends la fin (ou `/blindtest arreter:true`).');
  const { channel, error } = joinProblem(interaction);
  if (error) return interaction.editReply(error);
  if (!result.tracks.length) return interaction.editReply("😕 J'ai rien trouvé, essaie avec un autre nom ou un lien.");

  const player = getOrCreatePlayer(client, interaction.guild);
  player.textChannelId = interaction.channelId;
  await player.connect(channel);

  const tracks = shuffle ? shuffled(result.tracks) : result.tracks;
  const wasPlaying = Boolean(player.current);
  const position = next ? 1 : player.queue.length + 1;
  player.add(tracks, { next });

  if (tracks.length === 1 && !result.isPlaylist) {
    return interaction.editReply(wasPlaying
      ? `✅ Ajouté à la file (position **${position}**) : ${trackLine(tracks[0])}`
      : `▶️ C'est parti : ${trackLine(tracks[0])}`);
  }
  return interaction.editReply(`📜 **${tracks.length} sons** ajoutés${label || (result.name ? ` depuis **${result.name}**` : '')}${wasPlaying ? '' : ', la lecture commence !'}`);
}

const stamp = (tracks, userId) => tracks.map((t) => ({ ...t, requestedBy: userId, streamUrl: null }));

/** Sons d'une radio : un style demandé, sinon le top du moment. */
async function radioTracks(style, userId) {
  let tracks = [];
  if (style) {
    // Une playlist du style demandé donne des sons cohérents
    const playlist = await deezer.searchPlaylist(style).catch(() => null);
    if (playlist) {
      const items = await deezer.playlistTracks(playlist.id).catch(() => []);
      tracks = items.filter((t) => (t.rank ?? 0) > 300_000).map((t) => trackFromDeezer(t));
    }
    if (tracks.length < 15) {
      const results = await deezer.search(style, 60).catch(() => []);
      tracks = [...tracks, ...rankResults(style, results).filter((t) => (t.rank ?? 0) > 400_000).map((t) => trackFromDeezer(t))];
    }
    if (tracks.length < 10) {
      const generated = await aiPlaylist(`radio ${style}`, 25).catch(() => null);
      if (generated?.tracks?.length) tracks = [...tracks, ...generated.tracks];
    }
  } else {
    tracks = (await deezer.chart().catch(() => [])).map((t) => trackFromDeezer(t));
  }
  const seen = new Set();
  return tracks
    .filter((t) => t.title && !seen.has(`${t.title}|${t.artist}`) && seen.add(`${t.title}|${t.artist}`))
    .slice(0, 60)
    .map((t) => ({ ...t, requestedBy: userId }));
}

/**
 * Passer un son : le chef, les admins, celui qui l'a demandé ou une salle presque vide passent direct.
 * Sinon il faut la moitié des personnes dans le vocal.
 */
function skipDecision(interaction, player) {
  const listeners = interaction.guild.channels.cache.get(player.botVoiceChannelId)?.members.filter((m) => !m.user.bot).size ?? 1;
  if (isDj(interaction) || player.current?.requestedBy === interaction.user.id || listeners <= 2) return { skip: true };
  player.skipVotes.add(interaction.user.id);
  const needed = Math.ceil(listeners / 2);
  return { skip: player.skipVotes.size >= needed, votes: player.skipVotes.size, needed };
}

/** Salon jukebox : écrire un nom de son suffit à l'ajouter à la file. */
export async function handleJukeboxMessage(client, message) {
  const text = message.content.trim();
  if (!text || text.length > 500 || /^[/!?.>]/.test(text)) return;
  if (blindTestActive(message.guildId)) return;

  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) {
    await message.react('🔇').catch(() => {});
    return;
  }

  await message.react('⏳').catch(() => {});
  const removeHourglass = () => message.reactions.cache.get('⏳')?.users.remove(client.user.id).catch(() => {});
  try {
    const result = await resolveQuery(text, { requestedBy: message.author.id });
    if (!result.tracks.length) throw new MusicError('rien trouvé');
    const player = getOrCreatePlayer(client, message.guild);
    player.textChannelId = message.channelId;
    await player.connect(voiceChannel);
    player.add(result.tracks);
    await removeHourglass();
    await message.react('✅').catch(() => {});
  } catch (err) {
    await removeHourglass();
    await message.react('❌').catch(() => {});
    console.warn('[jukebox]', err.message);
  }
}

export { handleBlindTestMessage, blindTestActive };

// ===== Remplir une playlist perso rapidement =====

const MAX_ENTRIES = 100;
const splitEntries = (text) => text.split(/[\n|;]+/).map((s) => s.trim()).filter(Boolean);

/** Cherche plusieurs sons en parallèle, en gardant l'ordre. */
async function resolveMany(entries, userId) {
  const wanted = entries.slice(0, MAX_ENTRIES);
  const results = new Array(wanted.length).fill(null);
  const missing = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < wanted.length) {
      const index = cursor++;
      const entry = wanted[index];
      try {
        const found = await resolveQuery(entry, { requestedBy: userId, playlistMode: true, fast: true });
        if (found.tracks.length) results[index] = found.tracks;
        else missing.push(entry);
      } catch {
        missing.push(entry);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  return { tracks: results.filter(Boolean).flat(), missing, ignored: Math.max(0, entries.length - MAX_ENTRIES) };
}

/** Enregistre les sons dans la playlist et répond avec le résumé. */
async function saveTracks(interaction, userId, name, tracks, from = '', missing = [], ignored = 0) {
  const { error, playlist, added } = await playlists.addToPlaylist(userId, name, tracks);
  if (error) return interaction.editReply(`❌ ${error}`);

  const duplicates = tracks.length - added;
  const details = [
    duplicates > 0 ? `${duplicates} déjà dedans` : '',
    missing.length ? `${missing.length} introuvable(s) : ${truncate(missing.join(', '), 300)}` : '',
    ignored > 0 ? `${ignored} ligne(s) ignorée(s) (max ${MAX_ENTRIES})` : '',
  ].filter(Boolean);

  const summary = added
    ? `✅ **${added} son(s)** ajouté(s)${from ? ` ${from}` : ''} à **${playlist.name}** (${playlist.tracks.length} au total).`
    : `Rien de nouveau à ajouter à **${playlist.name}** 👌`;
  return interaction.editReply(`${summary}${details.length ? `\n-# ${details.join(' · ')}` : ''}\n-# Écoute-la avec \`/playlist lancer nom:${playlist.name}\``);
}

/** Importe une playlist / un album entier dans une playlist perso. */
async function importLink(interaction, userId, name, link) {
  const result = await resolveQuery(link, { requestedBy: userId, playlistMode: true }).catch((err) => ({ error: err.message }));
  if (result.error || !result.tracks?.length) {
    return interaction.editReply(`😕 J'ai pas réussi à lire ce lien${result.error ? ` (${result.error})` : ''}. Il est peut-être privé.`);
  }
  return saveTracks(interaction, userId, name, result.tracks, result.name ? `depuis **${result.name}**` : '');
}

/** Fenêtre « un son par ligne ». */
export async function handlePlaylistModal(client, interaction) {
  const name = interaction.customId.slice('music:playlist-add:'.length);
  await interaction.deferReply(PRIVATE);
  const entries = splitEntries(interaction.fields.getTextInputValue('sons'));
  if (!entries.length) return interaction.editReply('Aucun son dans la liste 🤔');

  await interaction.editReply(`🔎 Je cherche **${Math.min(entries.length, MAX_ENTRIES)} sons**…`);
  const { tracks, missing, ignored } = await resolveMany(entries, interaction.user.id);
  if (!tracks.length) return interaction.editReply(`😕 J'ai trouvé aucun de ces sons : ${truncate(missing.join(', '), 800)}`);
  return saveTracks(interaction, interaction.user.id, name, tracks, '', missing, ignored);
}

// ===== Commandes =====

const COMMANDS = {
  async play(client, interaction) {
    const { error } = joinProblem(interaction);
    if (error) return interaction.reply(say(error));
    await interaction.deferReply(PRIVATE);
    const result = await resolveQuery(interaction.options.getString('recherche', true), { requestedBy: interaction.user.id });
    return queueTracks(client, interaction, result, { next: interaction.options.getBoolean('suivant') ?? false });
  },

  async playlist(client, interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (['jouer', 'generer', 'lancer'].includes(sub)) {
      const { error } = joinProblem(interaction);
      if (error) return interaction.reply(say(error));
    }

    switch (sub) {
      case 'jouer': {
        await interaction.deferReply(PRIVATE);
        const result = await resolveQuery(interaction.options.getString('lien', true), { requestedBy: userId, playlistMode: true });
        return queueTracks(client, interaction, { ...result, isPlaylist: true }, { shuffle: interaction.options.getBoolean('melanger') ?? false });
      }
      case 'generer': {
        const ambiance = interaction.options.getString('ambiance', true);
        await interaction.deferReply(PRIVATE);
        await interaction.editReply(`🤖 Je prépare une playlist « ${ambiance} »…`);
        const result = await aiPlaylist(ambiance, interaction.options.getInteger('nombre') ?? 15);
        return queueTracks(client, interaction, { ...result, tracks: stamp(result.tracks, userId) }, {
          label: ` : **${result.name}** 🤖`,
        });
      }
      case 'creer': {
        const link = interaction.options.getString('lien');
        const { error, playlist } = await playlists.createPlaylist(userId, interaction.options.getString('nom', true));
        if (error) return interaction.reply(say(`❌ ${error}`));
        if (!link) {
          return interaction.reply(say(`✅ Playlist **${playlist.name}** créée ! Remplis-la vite avec \`/playlist importer\` (lien), \`/playlist ajouter-plusieurs\` (plein de sons d'un coup) ou le bouton ❤️.`));
        }
        await interaction.deferReply(PRIVATE);
        return importLink(interaction, userId, playlist.name, link);
      }
      case 'importer': {
        await interaction.deferReply(PRIVATE);
        return importLink(interaction, userId, interaction.options.getString('nom', true), interaction.options.getString('lien', true));
      }
      case 'ajouter-plusieurs': {
        const name = interaction.options.getString('nom', true);
        if (!(await playlists.getPlaylist(userId, name))) {
          return interaction.reply(say(`❌ Tu as pas de playlist « ${name} ». Crée-la avec \`/playlist creer\`.`));
        }
        return interaction.showModal(new ModalBuilder()
          .setCustomId(`music:playlist-add:${name}`)
          .setTitle(truncate(`➕ Ajouter à ${name}`, 45))
          .addLabelComponents(new LabelBuilder()
            .setLabel('Un son par ligne')
            .setDescription('Noms ou liens (Spotify, YouTube…), 100 lignes max')
            .setTextInputComponent(new TextInputBuilder()
              .setCustomId('sons')
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('ninho jefe\nlaylow maladresse\nhttps://open.spotify.com/track/...')
              .setRequired(true)
              .setMaxLength(4000))));
      }
      case 'ajouter-file': {
        await interaction.deferReply(PRIVATE);
        const player = getPlayer(interaction.guildId);
        const tracks = [...(player?.current ? [player.current] : []), ...(player?.queue ?? [])];
        if (!tracks.length) return interaction.editReply("🎵 La file d'attente est vide.");
        return saveTracks(interaction, userId, interaction.options.getString('nom', true), tracks, "depuis la file d'attente");
      }
      case 'ajouter': {
        await interaction.deferReply(PRIVATE);
        const name = interaction.options.getString('nom', true);
        const query = interaction.options.getString('recherche');
        if (!query) {
          const current = getPlayer(interaction.guildId)?.current;
          if (!current) return interaction.editReply('🎵 Y a rien en cours : précise le ou les sons dans `recherche` (séparés par `|`).');
          return saveTracks(interaction, userId, name, [current]);
        }
        // Plusieurs sons d'un coup : "ninho jefe | laylow maladresse | ..."
        const entries = splitEntries(query);
        const { tracks, missing } = await resolveMany(entries, userId);
        if (!tracks.length) return interaction.editReply(`😕 J'ai rien trouvé pour : ${missing.join(', ')}`);
        return saveTracks(interaction, userId, name, tracks, '', missing);
      }
      case 'retirer': {
        const { error, playlist, removed } = await playlists.removeFromPlaylist(userId, interaction.options.getString('nom', true), interaction.options.getInteger('position', true));
        return interaction.reply(say(error ? `❌ ${error}` : `🗑️ ${trackLine(removed)} retiré de **${playlist.name}**.`));
      }
      case 'voir': {
        const playlist = await playlists.getPlaylist(userId, interaction.options.getString('nom', true));
        if (!playlist) return interaction.reply(say("❌ Cette playlist existe pas. Regarde tes playlists avec `/playlist liste`."));
        const lines = playlist.tracks.map((t, i) => `\`${i + 1}.\` ${trackLine(t)}`);
        let description = '';
        for (const line of lines) {
          if (description.length + line.length > 3900) {
            description += `\n… et ${lines.length - description.split('\n').length} autres`;
            break;
          }
          description += `${description ? '\n' : ''}${line}`;
        }
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`📀 ${playlist.name}`)
          .setDescription(description || '*Playlist vide*')
          .setFooter({ text: `${playlist.tracks.length} son(s) · /playlist lancer pour l'écouter` });
        if (playlist.tracks[0]?.thumbnail) embed.setThumbnail(playlist.tracks[0].thumbnail);
        return interaction.reply({ embeds: [embed], ...PRIVATE });
      }
      case 'lancer': {
        const playlist = await playlists.getPlaylist(userId, interaction.options.getString('nom', true));
        if (!playlist?.tracks.length) return interaction.reply(say('❌ Cette playlist existe pas ou elle est vide.'));
        await interaction.deferReply(PRIVATE);
        return queueTracks(client, interaction, { name: playlist.name, isPlaylist: true, tracks: stamp(playlist.tracks, userId) }, {
          shuffle: interaction.options.getBoolean('melanger') ?? false,
        });
      }
      case 'liste': {
        const mine = await playlists.listPlaylists(userId);
        if (!mine.length) return interaction.reply(say('Tu as pas encore de playlist. Crée-en une avec `/playlist creer` ou clique sur ❤️ pendant un son !'));
        return interaction.reply(say(`📀 **Tes playlists :**\n${mine.map((p) => `• **${p.name}** · ${p.tracks.length} son(s)`).join('\n')}`));
      }
      case 'supprimer': {
        const removed = await playlists.deletePlaylist(userId, interaction.options.getString('nom', true));
        return interaction.reply(say(removed ? `🗑️ Playlist **${removed.name}** supprimée.` : '❌ Cette playlist existe pas.'));
      }
    }
  },

  async skip(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    const count = interaction.options.getInteger('nombre') ?? 1;
    const title = player.current.title;
    const decision = skipDecision(interaction, player);
    if (!decision.skip) {
      return interaction.reply({
        content: `🗳️ Vote pour passer **${title}** : **${decision.votes}/${decision.needed}**. Les autres peuvent voter avec \`/skip\` ou le bouton ⏭️.`,
        allowedMentions: { parse: [] },
      });
    }
    player.skip(count);
    return interaction.reply(say(count > 1 ? `⏭️ ${count} sons passés.` : `⏭️ **${title}** passé.`));
  },

  async previous(client, interaction) {
    const player = getPlayer(interaction.guildId);
    if (!player?.history.length && !player?.current) return interaction.reply(say('Y a pas de son précédent.'));
    const problem = player.current ? controlProblem(interaction, player) : null;
    if (problem) return interaction.reply(say(problem));
    await interaction.deferReply(PRIVATE);
    await player.previous();
    return interaction.editReply('⏮️ Retour au son précédent.');
  },

  async stop(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    await player.stop();
    return interaction.reply(say('⏹️ Musique arrêtée, file vidée.'));
  },

  async leave(client, interaction) {
    const player = getPlayer(interaction.guildId);
    if (!player) return interaction.reply(say('Je joue pas de musique en ce moment.'));
    if (player.current) {
      const problem = controlProblem(interaction, player);
      if (problem) return interaction.reply(say(problem));
    }
    await player.stop();
    return interaction.reply(say('👋 Musique coupée, je retourne dans mon vocal.'));
  },

  async pause(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    const paused = player.togglePause();
    player.refreshPanel(true);
    return interaction.reply(say(paused ? '⏸️ Pause.' : '▶️ Et ça repart !'));
  },

  async resume(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    if (player.paused) player.togglePause();
    player.refreshPanel(true);
    return interaction.reply(say('▶️ Et ça repart !'));
  },

  async nowplaying(client, interaction) {
    const player = getPlayer(interaction.guildId);
    if (!player?.current) return interaction.reply(say('🎵 Y a rien en cours de lecture.'));
    player.textChannelId = interaction.channelId;
    await interaction.reply(say('🎶 Panneau réaffiché 👇'));
    return player.sendNewPanel();
  },

  async queue(client, interaction) {
    const player = getPlayer(interaction.guildId);
    if (!player?.current && !player?.queue.length) return interaction.reply(say('📜 La file est vide. Ajoute des sons avec `/play` !'));
    return interaction.reply({ ...queuePayload(player), ...PRIVATE });
  },

  async volume(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    const volume = player.setVolume(interaction.options.getInteger('niveau', true));
    player.refreshPanel(true);
    return interaction.reply(say(`🔊 Volume réglé sur **${volume}%**.`));
  },

  async loop(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    player.loop = interaction.options.getString('mode', true);
    player.refreshPanel(true);
    return interaction.reply(say(LOOP_TEXT[player.loop]));
  },

  async shuffle(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    if (player.queue.length < 2) return interaction.reply(say('Faut au moins 2 sons dans la file pour mélanger.'));
    player.shuffle();
    player.refreshPanel(true);
    return interaction.reply(say(`🔀 ${player.queue.length} sons mélangés.`));
  },

  async seek(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    const seconds = parseTime(interaction.options.getString('temps', true));
    if (seconds === null) return interaction.reply(say('Format pas compris 🤔 Exemples : `1:30` ou `90`.'));
    if (player.current.isLive) return interaction.reply(say("Impossible d'avancer dans un direct."));
    await interaction.deferReply(PRIVATE);
    await player.seek(seconds);
    return interaction.editReply(`⏩ Direction **${interaction.options.getString('temps', true)}**.`);
  },

  async remove(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    const removed = player.remove(interaction.options.getInteger('position', true));
    player.refreshPanel(true);
    return interaction.reply(say(removed ? `🗑️ ${trackLine(removed)} retiré de la file.` : "❌ Y a pas de son à cette position."));
  },

  async move(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    const to = interaction.options.getInteger('vers', true);
    const moved = player.move(interaction.options.getInteger('de', true), to);
    player.refreshPanel(true);
    return interaction.reply(say(moved ? `↕️ ${trackLine(moved)} déplacé en position **${Math.min(to, player.queue.length)}**.` : "❌ Y a pas de son à cette position."));
  },

  async clearqueue(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    const count = player.queue.length;
    player.queue = [];
    player.refreshPanel(true);
    return interaction.reply(say(`🧹 ${count} son(s) retiré(s) de la file.`));
  },

  async filter(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    const effect = interaction.options.getString('effet', true);
    const active = effect === 'none' ? player.setFilters([]) : player.toggleFilter(effect);
    player.refreshPanel(true);
    return interaction.reply(say(`🎛️ Effets : **${filtersLabel(active)}**`));
  },

  async autoplay(client, interaction) {
    const player = getPlayer(interaction.guildId);
    const problem = controlProblem(interaction, player);
    if (problem) return interaction.reply(say(problem));
    player.autoplay = !player.autoplay;
    player.refreshPanel(true);
    return interaction.reply(say(player.autoplay
      ? '♾️ Autoplay activé : quand la file est vide, j\'enchaîne des sons du même style.'
      : '♾️ Autoplay désactivé.'));
  },

  async lyrics(client, interaction) {
    await interaction.deferReply(PRIVATE);
    const query = interaction.options.getString('recherche');
    const track = query
      ? (await resolveQuery(query, { requestedBy: interaction.user.id })).tracks[0]
      : getPlayer(interaction.guildId)?.current;
    if (!track) return interaction.editReply('🎤 Y a rien en cours : précise le son dans `recherche`.');
    return interaction.editReply(await showLyrics(interaction, getPlayer(interaction.guildId), track));
  },

  async blindtest(client, interaction) {
    if (interaction.options.getBoolean('arreter')) {
      return interaction.reply(say(stopBlindTest(interaction.guildId) ? '⏹️ Blind test arrêté.' : "Y a pas de blind test en cours."));
    }
    if (blindTestActive(interaction.guildId)) return interaction.reply(say('🎧 Un blind test est déjà en cours ! (`/blindtest arreter:true` pour le couper)'));
    const { channel, error } = joinProblem(interaction);
    if (error) return interaction.reply(say(error));

    await interaction.deferReply(PRIVATE);
    return startBlindTest(client, interaction, {
      theme: interaction.options.getString('theme'),
      rounds: interaction.options.getInteger('manches') ?? 8,
      snippetSeconds: interaction.options.getInteger('duree') ?? 25,
      voiceChannel: channel,
    });
  },

  async karaoke(client, interaction) {
    const { error } = joinProblem(interaction);
    if (error) return interaction.reply(say(error));
    await interaction.deferReply(PRIVATE);

    const query = interaction.options.getString('recherche');
    const player = getPlayer(interaction.guildId);
    if (query) {
      const result = await resolveQuery(query, { requestedBy: interaction.user.id });
      await queueTracks(client, interaction, result);
    } else if (!player?.current) {
      return interaction.editReply('🎤 Lance un son ou précise-le dans `recherche`.');
    }

    // On attend que le son démarre, puis on enlève la voix et on affiche les paroles
    const ready = getPlayer(interaction.guildId);
    for (let i = 0; i < 20 && !ready?.current; i++) await new Promise((r) => setTimeout(r, 500));
    if (!ready?.current) return interaction.editReply('🎤 Le son a pas démarré, réessaie.');
    ready.setFilters([...new Set([...ready.filters, 'karaoke'])]);
    ready.refreshPanel(true);
    return interaction.editReply(await showLyrics(interaction, ready, ready.current));
  },

  async radio(client, interaction) {
    const player = getPlayer(interaction.guildId);
    if (interaction.options.getBoolean('arreter')) {
      const problem = controlProblem(interaction, player);
      if (problem) return interaction.reply(say(problem));
      player.loop = 'off';
      player.autoplay = false;
      player.queue = [];
      player.refreshPanel(true);
      return interaction.reply(say('📻 Radio arrêtée, la file est vidée (le son en cours continue).'));
    }

    const { error } = joinProblem(interaction);
    if (error) return interaction.reply(say(error));
    await interaction.deferReply(PRIVATE);

    const style = interaction.options.getString('style');
    const tracks = await radioTracks(style, interaction.user.id);
    if (!tracks.length) return interaction.editReply("😕 J'ai pas trouvé de sons pour ce style, essaie autre chose.");

    const result = { name: style ? `Radio ${style}` : 'Radio top du moment', isPlaylist: true, tracks };
    await queueTracks(client, interaction, result, { shuffle: true, label: ` : **${result.name}** 📻` });
    const started = getPlayer(interaction.guildId);
    if (started) {
      started.loop = 'queue';
      started.autoplay = true;
      started.refreshPanel(true);
    }
    return undefined;
  },

  async topsons(client, interaction) {
    await interaction.deferReply(PRIVATE);
    const member = interaction.options.getUser('membre');
    const period = interaction.options.getString('periode') ?? 'month';
    const stats = await musicStats(interaction.guildId, { period, userId: member?.id ?? null });
    if (!stats?.tracks.length) {
      return interaction.editReply(member ? `Aucune écoute pour ${member} sur cette période.` : "Aucune écoute enregistrée sur cette période. Lance des sons avec `/play` !");
    }

    const podium = ['🥇', '🥈', '🥉'];
    const embed = new EmbedBuilder()
      .setColor(0x1db954)
      .setAuthor({ name: member ? `🎧 Le top de ${member.username}` : '🎧 Top du serveur' })
      .setTitle(period === 'month' ? 'Ce mois-ci' : 'Depuis le début')
      .setDescription(stats.tracks.map((t, i) => `${podium[i] ?? `\`${i + 1}.\``} ${t.url ? `[${t.title}](${t.url})` : `**${t.title}**`}${t.artist ? ` · ${t.artist}` : ''} — **${t.plays}** écoute(s)`).join('\n'))
      .addFields(
        { name: '🎤 Artistes', value: stats.artists.map(([name, plays], i) => `${i + 1}. **${name}** (${plays})`).join('\n') || '—', inline: true },
        ...(stats.listeners?.length ? [{ name: '👑 Qui met la musique', value: stats.listeners.map(([id, plays]) => `<@${id}> · ${plays}`).join('\n'), inline: true }] : []),
        { name: '⏱️ Temps d\'écoute', value: `${Math.round(stats.totalSeconds / 60)} min · ${stats.totalPlays} sons joués`, inline: true },
      );
    if (stats.tracks[0]?.thumbnail) embed.setThumbnail(stats.tracks[0].thumbnail);
    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },

  async join(client, interaction) {
    const { channel, error } = joinProblem(interaction);
    if (error) return interaction.reply(say(error));
    await interaction.deferReply(PRIVATE);
    const player = getOrCreatePlayer(client, interaction.guild);
    player.textChannelId = interaction.channelId;
    await player.connect(channel);
    if (!player.current) player.scheduleIdle();
    return interaction.editReply(`🎧 Je suis dans <#${channel.id}>, balance un \`/play\` !`);
  },
};

export async function handleMusicCommand(client, interaction) {
  try {
    await COMMANDS[interaction.commandName]?.(client, interaction);
  } catch (err) {
    console.warn(`[musique] /${interaction.commandName} :`, err.message);
    const content = `❌ ${err instanceof MusicError ? `Oups : ${err.message}.` : err.message?.startsWith('Impossible') ? err.message : "Ça a pas marché, réessaie stp."}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content, embeds: [], components: [] }).catch(() => {});
    else await interaction.reply(say(content)).catch(() => {});
  }
}

// ===== Suggestions =====

export async function handleMusicAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  let choices = [];
  try {
    if (focused.name === 'recherche') {
      choices = await Promise.race([musicSuggestions(focused.value), new Promise((resolve) => setTimeout(() => resolve([]), 2_500))]);
    } else if (focused.name === 'nom') {
      const search = focused.value.toLowerCase();
      choices = (await playlists.listPlaylists(interaction.user.id))
        .filter((p) => p.name.toLowerCase().includes(search))
        .slice(0, 25)
        .map((p) => ({ name: `${p.name} (${p.tracks.length} sons)`.slice(0, 100), value: p.name }));
    }
  } catch (err) {
    console.warn('[musique] suggestions :', err.message);
  }
  await interaction.respond(choices).catch(() => {});
}

// ===== Boutons, menu des effets, fenêtre "Ajouter" =====

export async function handleMusicComponent(client, interaction) {
  const player = getPlayer(interaction.guildId);

  if (interaction.customId.startsWith('musicq:')) {
    if (!player) return interaction.update({ content: '⏹️ La musique est terminée.', embeds: [], components: [] });
    return interaction.update(queuePayload(player, Number(interaction.customId.split(':')[1])));
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('music:playlist-add:')) return handlePlaylistModal(client, interaction);
    const { error } = joinProblem(interaction);
    if (error) return interaction.reply(say(error));
    await interaction.deferReply(PRIVATE);
    try {
      const result = await resolveQuery(interaction.fields.getTextInputValue('query'), { requestedBy: interaction.user.id });
      return await queueTracks(client, interaction, result);
    } catch (err) {
      return interaction.editReply(`❌ ${err instanceof MusicError ? `Oups : ${err.message}.` : "Ça a pas marché, réessaie stp."}`);
    }
  }

  // Réglage des paroles (⏪ ⏩ 🔄) : ça ne touche pas à la musique
  if (interaction.customId.startsWith('music:lyrics:')) {
    const offset = adjustLyrics(interaction.user.id, interaction.customId.split(':')[2]);
    if (offset === null) {
      return interaction.reply(say('Ces paroles sont plus suivies en direct, relance `/lyrics` 😉'));
    }
    return interaction.deferUpdate();
  }

  const action = interaction.customId.split(':')[1];

  // Actions qui ne demandent pas d'être dans le vocal
  if (action === 'queue') {
    if (!player) return interaction.reply(say('📜 La file est vide.'));
    return interaction.reply({ ...queuePayload(player), ...PRIVATE });
  }
  if (action === 'lyrics') {
    if (!player?.current) return interaction.reply(say('🎵 Y a rien en cours de lecture.'));
    await interaction.deferReply(PRIVATE);
    return interaction.editReply(await showLyrics(interaction, player, player.current));
  }
  if (action === 'fav') {
    if (!player?.current) return interaction.reply(say('🎵 Y a rien en cours de lecture.'));
    const { error, added } = await playlists.addToPlaylist(interaction.user.id, playlists.FAVORITES, [player.current], { createIfMissing: true });
    return interaction.reply(say(error ? `❌ ${error}` : added
      ? `❤️ ${trackLine(player.current)} ajouté à ta playlist **${playlists.FAVORITES}** (\`/playlist lancer nom:${playlists.FAVORITES}\`).`
      : `Ce son est déjà dans tes **${playlists.FAVORITES}** ❤️`));
  }
  if (action === 'add') {
    if (!interaction.member?.voice?.channelId) return interaction.reply(say("🎧 Rejoins un salon vocal d'abord."));
    return interaction.showModal(new ModalBuilder()
      .setCustomId('music:add-modal')
      .setTitle('➕ Ajouter un son')
      .addLabelComponents(new LabelBuilder()
        .setLabel('Nom du son ou lien')
        .setDescription('Spotify, YouTube, SoundCloud, Deezer… ou juste le nom')
        .setTextInputComponent(new TextInputBuilder()
          .setCustomId('query')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('ex : Lagui Olivia Valere')
          .setRequired(true)
          .setMaxLength(500))));
  }

  const problem = controlProblem(interaction, player);
  if (problem) return interaction.reply(say(problem));
  if (player.panel && player.panel.id !== interaction.message.id) {
    return interaction.reply(say('Ce panneau est plus à jour, utilise le dernier 👇'));
  }

  if (interaction.isStringSelectMenu()) {
    player.setFilters(interaction.values);
    player.lastPanelEdit = Date.now();
    return interaction.update(nowPlayingPayload(player));
  }

  switch (action) {
    case 'pause': player.togglePause(); break;
    case 'shuffle': player.shuffle(); break;
    case 'voldown': player.setVolume(player.volume - 10); break;
    case 'volup': player.setVolume(player.volume + 10); break;
    case 'loop': player.cycleLoop(); break;
    case '8d': player.toggleFilter('8d'); break;
    case 'autoplay': player.autoplay = !player.autoplay; break;
    case 'skip': {
      const decision = skipDecision(interaction, player);
      if (!decision.skip) return interaction.reply(say(`🗳️ Vote enregistré : **${decision.votes}/${decision.needed}** pour passer ce son.`));
      await interaction.deferUpdate();
      player.skip();
      return;
    }
    case 'back':
      await interaction.deferUpdate();
      await player.previous();
      return;
    case 'stop':
      await interaction.deferUpdate();
      await player.stop();
      return;
    default:
      return interaction.deferUpdate();
  }
  player.lastPanelEdit = Date.now();
  return interaction.update(nowPlayingPayload(player));
}

export function isMusicComponent(interaction) {
  return /^music(q)?:/.test(interaction.customId ?? '');
}

/** Quelqu'un rejoint / quitte le vocal du bot. */
export function handleMusicVoiceState(oldState, newState) {
  const player = getPlayer(newState.guild.id);
  if (!player) return;
  const botChannel = player.botVoiceChannelId;
  if (oldState.channelId === botChannel || newState.channelId === botChannel) player.checkAlone();
}

export const FILTER_KEYS = Object.keys(FILTERS);
