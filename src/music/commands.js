import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { FILTERS } from './filters.js';

const guildOnly = (builder) => builder.setContexts(InteractionContextType.Guild);
const searchOption = (o, required = true) => o
  .setName('recherche')
  .setDescription('Nom du son, artiste, ou lien Spotify / YouTube / SoundCloud / Deezer')
  .setRequired(required)
  .setAutocomplete(true)
  .setMaxLength(500);
const playlistName = (o) => o.setName('nom').setDescription('Nom de la playlist').setRequired(true).setAutocomplete(true).setMaxLength(50);

export const musicCommands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Joue un son : nom ou lien Spotify, YouTube, SoundCloud, Deezer')
    .addStringOption((o) => searchOption(o))
    .addBooleanOption((o) => o.setName('suivant').setDescription('Le jouer juste après le son en cours')),

  new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Playlists : lien, playlist IA, ou tes playlists perso')
    .addSubcommand((s) => s.setName('jouer').setDescription('Joue une playlist / un album (Spotify, YouTube, SoundCloud, Deezer)')
      .addStringOption((o) => o.setName('lien').setDescription('Lien de la playlist ou de l\'album').setRequired(true).setMaxLength(500))
      .addBooleanOption((o) => o.setName('melanger').setDescription('Mélanger les sons')))
    .addSubcommand((s) => s.setName('generer').setDescription("L'IA crée une playlist selon une ambiance")
      .addStringOption((o) => o.setName('ambiance').setDescription('Ex : soirée rap FR, chill pour réviser, sport, années 2000...').setRequired(true).setMaxLength(200))
      .addIntegerOption((o) => o.setName('nombre').setDescription('Nombre de sons (5-25, défaut 15)').setMinValue(5).setMaxValue(25)))
    .addSubcommand((s) => s.setName('creer').setDescription('Crée une playlist perso')
      .addStringOption((o) => o.setName('nom').setDescription('Nom de la playlist').setRequired(true).setMaxLength(50)))
    .addSubcommand((s) => s.setName('ajouter').setDescription('Ajoute un son à ta playlist (par défaut : le son en cours)')
      .addStringOption(playlistName)
      .addStringOption((o) => searchOption(o, false)))
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
    .addIntegerOption((o) => o.setName('niveau').setDescription('0 à 150 (défaut 80)').setRequired(true).setMinValue(0).setMaxValue(150)),
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
  new SlashCommandBuilder().setName('join').setDescription('Fait venir le bot dans ton salon vocal'),
  new SlashCommandBuilder().setName('leave').setDescription('Arrête la musique et renvoie le bot dans son vocal'),
].map(guildOnly);

export const MUSIC_COMMAND_NAMES = new Set(musicCommands.map((c) => c.name));
