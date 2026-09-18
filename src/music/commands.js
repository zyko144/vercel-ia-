import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { DIFFICULTIES, MODES, QUIZ_MODES, QUIZ_THEMES, THEMES } from './blindpools.js';
import { FILTERS } from './filters.js';

const guildOnly = (builder) => builder.setContexts(InteractionContextType.Guild);
const searchOption = (o, required = true) => o
  .setName('recherche')
  .setDescription('Nom du son ou lien Spotify, Apple Music, YouTube, SoundCloud, Deezer')
  .setRequired(required)
  .setAutocomplete(true)
  .setMaxLength(500);
const playlistName = (o) => o.setName('nom').setDescription('Nom de la playlist').setRequired(true).setAutocomplete(true).setMaxLength(50);

export const musicCommands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Joue un son : nom ou lien Spotify, Apple Music, YouTube, SoundCloud, Deezer')
    .addStringOption((o) => searchOption(o))
    .addBooleanOption((o) => o.setName('suivant').setDescription('Le jouer juste après le son en cours')),

  new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Playlists : lien, playlist IA, ou tes playlists perso')
    .addSubcommand((s) => s.setName('jouer').setDescription('Joue une playlist / un album complet (Spotify, Apple Music, YouTube, SoundCloud, Deezer)')
      .addStringOption((o) => o.setName('lien').setDescription('Lien de la playlist ou de l\'album').setRequired(true).setMaxLength(500))
      .addBooleanOption((o) => o.setName('melanger').setDescription('Mélanger les sons')))
    .addSubcommand((s) => s.setName('generer').setDescription("L'IA crée une playlist selon une ambiance")
      .addStringOption((o) => o.setName('ambiance').setDescription('Ex : soirée rap FR, chill pour réviser, sport, années 2000...').setRequired(true).setMaxLength(200))
      .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de sons (5-25, défaut 15)').setMinValue(5).setMaxValue(25)))
    .addSubcommand((s) => s.setName('creer').setDescription('Crée une playlist perso (avec un lien à importer, au choix)')
      .addStringOption((o) => o.setName('nom').setDescription('Nom de la playlist').setRequired(true).setMaxLength(50))
      .addStringOption((o) => o.setName('lien').setDescription('Lien de playlist/album à importer tout de suite').setMaxLength(500)))
    .addSubcommand((s) => s.setName('ajouter').setDescription('Ajoute un ou plusieurs sons (séparés par |) ou le son en cours')
      .addStringOption(playlistName)
      .addStringOption((o) => searchOption(o, false)))
    .addSubcommand((s) => s.setName('ajouter-plusieurs').setDescription("Ajoute plein de sons d'un coup : une fenêtre s'ouvre, un son par ligne")
      .addStringOption(playlistName))
    .addSubcommand((s) => s.setName('ajouter-file').setDescription("Ajoute toute la file d'attente à une de tes playlists")
      .addStringOption(playlistName))
    .addSubcommand((s) => s.setName('importer').setDescription('Importe une playlist entière (Spotify, YouTube, Apple, Deezer, SoundCloud)')
      .addStringOption(playlistName)
      .addStringOption((o) => o.setName('lien').setDescription('Lien de la playlist ou de l\'album').setRequired(true).setMaxLength(500)))
    .addSubcommand((s) => s.setName('retirer').setDescription('Retire un son de ta playlist')
      .addStringOption(playlistName)
      .addIntegerOption((o) => o.setName('position').setDescription('Numéro du son (voir /playlist voir)').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('voir').setDescription("Affiche les sons d'une de tes playlists")
      .addStringOption(playlistName))
    .addSubcommand((s) => s.setName('lancer').setDescription('Joue une de tes playlists perso')
      .addStringOption(playlistName)
      .addBooleanOption((o) => o.setName('melanger').setDescription('Mélanger les sons')))
    .addSubcommand((s) => s.setName('liste').setDescription('Liste tes playlists perso'))
    .addSubcommand((s) => s.setName('supprimer').setDescription('Supprime une de tes playlists')
      .addStringOption(playlistName)),

  new SlashCommandBuilder().setName('skip').setDescription('Passe au son suivant')
    .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de sons à passer').setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('previous').setDescription('Revient au son précédent'),
  new SlashCommandBuilder().setName('stop').setDescription('Arrête la musique et vide la file'),
  new SlashCommandBuilder().setName('pause').setDescription('Met en pause / relance la musique'),
  new SlashCommandBuilder().setName('resume').setDescription('Relance la musique'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Réaffiche le panneau du son en cours'),
  new SlashCommandBuilder().setName('queue').setDescription("Affiche la file d'attente"),
  new SlashCommandBuilder().setName('volume').setDescription('Change le volume')
    .addIntegerOption((o) => o.setName('niveau').setDescription('0 à 100 (défaut 100)').setRequired(true).setMinValue(0).setMaxValue(100)),
  new SlashCommandBuilder().setName('loop').setDescription('Répète le son ou la file')
    .addStringOption((o) => o.setName('mode').setDescription('Mode de boucle').setRequired(true).addChoices(
      { name: 'Désactivée', value: 'off' },
      { name: 'Ce son', value: 'track' },
      { name: 'Toute la file', value: 'queue' },
    )),
  new SlashCommandBuilder().setName('shuffle').setDescription('Mélange la file d\'attente'),
  new SlashCommandBuilder().setName('seek').setDescription('Avance ou recule dans le son')
    .addStringOption((o) => o.setName('temps').setDescription('Ex : 1:30 ou 90').setRequired(true).setMaxLength(10)),
  new SlashCommandBuilder().setName('remove').setDescription('Retire un son de la file')
    .addIntegerOption((o) => o.setName('position').setDescription('Position dans la file').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('move').setDescription('Déplace un son dans la file')
    .addIntegerOption((o) => o.setName('de').setDescription('Position actuelle').setRequired(true).setMinValue(1))
    .addIntegerOption((o) => o.setName('vers').setDescription('Nouvelle position').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('clearqueue').setDescription("Vide la file d'attente (garde le son en cours)"),
  new SlashCommandBuilder().setName('filter').setDescription('Active / désactive un effet audio (8D, bass boost, nightcore...)')
    .addStringOption((o) => o.setName('effet').setDescription("L'effet").setRequired(true).addChoices(
      { name: '❌ Enlever tous les effets', value: 'none' },
      ...Object.entries(FILTERS).map(([value, f]) => ({ name: `${f.emoji} ${f.label}`, value })),
    )),
  new SlashCommandBuilder().setName('autoplay').setDescription('Enchaîne des sons du même style quand la file est vide'),
  new SlashCommandBuilder().setName('lyrics').setDescription('Affiche les paroles (du son en cours ou d\'un autre)')
    .addStringOption((o) => searchOption(o, false)),
  new SlashCommandBuilder().setName('jeu-blindtest').setDescription('🎧 Blind test musical : rap FR, TikTok, rap US, années 2010… (sans option : menu)')
    .addStringOption((o) => o.setName('theme').setDescription('Thème (lance direct la partie)')
      .addChoices(...Object.entries(THEMES).filter(([key]) => key !== 'custom').map(([key, theme]) => ({ name: `${theme.emoji} ${theme.label}`, value: key }))))
    .addStringOption((o) => o.setName('mode').setDescription('Mode de jeu')
      .addChoices(...Object.entries(MODES).map(([key, mode]) => ({ name: `${mode.emoji} ${mode.label}`, value: key }))))
    .addStringOption((o) => o.setName('difficulte').setDescription('Difficulté')
      .addChoices(...Object.entries(DIFFICULTIES).map(([key, level]) => ({ name: `${level.emoji} ${level.label} (${level.snippet} s)`, value: key }))))
    .addIntegerOption((o) => o.setName('manches').setDescription('Nombre de manches (3-30)').setMinValue(3).setMaxValue(30))
    .addStringOption((o) => o.setName('theme_perso').setDescription('Ton propre thème : afro trap, Jul, années 2000…').setMaxLength(80))
    .addBooleanOption((o) => o.setName('arreter').setDescription('Arrête le blind test en cours')),

  new SlashCommandBuilder().setName('jeu-devine').setDescription('🎲 Devine films, Disney, séries, animés et jeux vidéo mélangés (sans option : menu)')
    .addStringOption((o) => o.setName('categorie').setDescription('Catégorie (lance direct la partie)')
      .addChoices(...QUIZ_THEMES.map((key) => ({ name: `${THEMES[key].emoji} ${THEMES[key].label}`, value: key }))))
    .addStringOption((o) => o.setName('mode').setDescription('Mode de jeu')
      .addChoices(...QUIZ_MODES.map((key) => ({ name: key === 'classique' ? '🎵 Musique' : `${MODES[key].emoji} ${MODES[key].label}`, value: key }))))
    .addStringOption((o) => o.setName('difficulte').setDescription('Difficulté')
      .addChoices(...Object.entries(DIFFICULTIES).map(([key, level]) => ({ name: `${level.emoji} ${level.label}`, value: key }))))
    .addIntegerOption((o) => o.setName('manches').setDescription('Nombre de manches (3-30)').setMinValue(3).setMaxValue(30))
    .addBooleanOption((o) => o.setName('arreter').setDescription('Arrête la partie en cours')),

  gameCommand('jeu-films', "🎬 Devine le film avec sa musique ou son image"),
  gameCommand('jeu-disney', "🏰 Devine le Disney ou le Pixar avec sa chanson ou son image"),
  gameCommand('jeu-series', "📺 Devine la série ou le dessin animé avec son générique ou son image"),
  gameCommand('jeu-animes', "🍥 Devine l'animé avec son opening ou son image"),
  gameCommand('jeu-jeuxvideo', "🎮 Devine le jeu vidéo : musiques, sons cultes et images"),
  musicModeCommand('jeu-paroles', '🎙️ Le son se coupe juste avant une phrase : écris la suite en premier'),
  musicModeCommand('jeu-annee', "📅 Devine l'année de sortie du son : le plus proche marque aussi"),

  new SlashCommandBuilder().setName('direct').setDescription("🔴 Diffuse le son de ton PC (Spotify compris) dans le vocal, sans passer par YouTube")
    .addBooleanOption((o) => o.setName('arreter').setDescription('Arrête la diffusion')),

  new SlashCommandBuilder().setName('spotify').setDescription("🎧 Partage en direct ce que tu écoutes sur Spotify (et le bot peut le jouer en vocal)")
    .addBooleanOption((o) => o.setName('suivre').setDescription('Le bot joue la même chose en vocal, au même moment'))
    .addBooleanOption((o) => o.setName('arreter').setDescription('Arrête le partage')),

  new SlashCommandBuilder().setName('karaoke').setDescription('Joue un son sans la voix, avec les paroles en direct')
    .addStringOption((o) => searchOption(o, false)),

  new SlashCommandBuilder().setName('radio').setDescription('Lance une radio non-stop (le bot enchaîne tout seul)')
    .addStringOption((o) => o.setName('style').setDescription('Ex : rap fr, chill, rock, années 90… (vide = top du moment)').setMaxLength(100))
    .addBooleanOption((o) => o.setName('arreter').setDescription('Arrête la radio')),

  new SlashCommandBuilder().setName('topsons').setDescription('Les sons les plus écoutés du serveur (ou les tiens)')
    .addStringOption((o) => o.setName('periode').setDescription('Période').addChoices(
      { name: 'Ce mois-ci', value: 'month' },
      { name: 'Depuis le début', value: 'all' },
    ))
    .addUserOption((o) => o.setName('membre').setDescription('Voir le top de quelqu\'un (par défaut : tout le serveur)')),

  new SlashCommandBuilder().setName('join').setDescription('Fait venir le bot dans ton salon vocal'),
  new SlashCommandBuilder().setName('leave').setDescription('Arrête la musique et renvoie le bot dans son vocal'),
].map(guildOnly);

/** Commande d'une catégorie de /jeu-devine (films, Disney...) : mode, difficulté, manches. */
function gameCommand(name, description) {
  return new SlashCommandBuilder().setName(name).setDescription(description)
    .addStringOption((o) => o.setName('mode').setDescription('Mode de jeu (sans option : menu)')
      .addChoices(...QUIZ_MODES.map((key) => ({ name: key === 'classique' ? '🎵 Musique' : `${MODES[key].emoji} ${MODES[key].label}`, value: key }))))
    .addStringOption((o) => o.setName('difficulte').setDescription('Difficulté')
      .addChoices(...Object.entries(DIFFICULTIES).map(([key, level]) => ({ name: `${level.emoji} ${level.label}`, value: key }))))
    .addIntegerOption((o) => o.setName('manches').setDescription('Nombre de manches (3-30)').setMinValue(3).setMaxValue(30))
    .addBooleanOption((o) => o.setName('arreter').setDescription('Arrête la partie en cours'));
}

/** Jeu musical à mode imposé (Suite des paroles, Année) : thème, difficulté, manches. */
function musicModeCommand(name, description) {
  return new SlashCommandBuilder().setName(name).setDescription(description)
    .addStringOption((o) => o.setName('theme').setDescription('Thème (sans option : menu)')
      .addChoices(...Object.entries(THEMES).filter(([key, theme]) => key !== 'custom' && !theme.works).map(([key, theme]) => ({ name: `${theme.emoji} ${theme.label}`, value: key }))))
    .addStringOption((o) => o.setName('difficulte').setDescription('Difficulté')
      .addChoices(...Object.entries(DIFFICULTIES).map(([key, level]) => ({ name: `${level.emoji} ${level.label}`, value: key }))))
    .addIntegerOption((o) => o.setName('manches').setDescription('Nombre de manches (3-30)').setMinValue(3).setMaxValue(30))
    .addBooleanOption((o) => o.setName('arreter').setDescription('Arrête la partie en cours'));
}

/** Commande -> mode de blind test imposé */
export const MODE_COMMANDS = { 'jeu-paroles': 'suite', 'jeu-annee': 'annee' };

/** Commande -> catégorie de jeu */
export const GAME_COMMAND_THEMES = { 'jeu-films': 'films', 'jeu-disney': 'disney', 'jeu-series': 'series', 'jeu-animes': 'anime', 'jeu-jeuxvideo': 'jeux' };

export const MUSIC_COMMAND_NAMES = new Set(musicCommands.map((c) => c.name));
