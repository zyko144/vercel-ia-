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
import { FILTERS, filtersLabel } from './filters.js';
import { showLyrics } from './livelyrics.js';
import { getOrCreatePlayer, getPlayer } from './player.js';
import * as playlists from './playlists.js';
import { aiPlaylist, resolveQuery } from './sources.js';
import { nowPlayingPayload, parseTime, queuePayload, trackLine } from './ui.js';
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
        const { error, playlist } = await playlists.createPlaylist(userId, interaction.options.getString('nom', true));
        return interaction.reply(say(error ? `❌ ${error}` : `✅ Playlist **${playlist.name}** créée ! Ajoute des sons avec \`/playlist ajouter\` ou le bouton ❤️.`));
      }
      case 'ajouter': {
        await interaction.deferReply(PRIVATE);
        const name = interaction.options.getString('nom', true);
        const query = interaction.options.getString('recherche');
        let tracks;
        if (query) {
          tracks = (await resolveQuery(query, { requestedBy: userId })).tracks;
        } else {
          const current = getPlayer(interaction.guildId)?.current;
          if (!current) return interaction.editReply('🎵 Y a rien en cours : précise le son à ajouter dans `recherche`.');
          tracks = [current];
        }
        const { error, playlist, added } = await playlists.addToPlaylist(userId, name, tracks);
        if (error) return interaction.editReply(`❌ ${error}`);
        return interaction.editReply(added
          ? `✅ ${added > 1 ? `**${added} sons** ajoutés` : `${trackLine(tracks[0])} ajouté`} à **${playlist.name}** (${playlist.tracks.length} sons).`
          : `Ce son est déjà dans **${playlist.name}** 👌`);
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
      await player.stop();
    } else {
      player.destroy();
    }
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
    case 'skip':
      await interaction.deferUpdate();
      player.skip();
      return;
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
