// Blind test « œuvres » : films, séries, animés, jeux vidéo. On devine l'œuvre à partir de sa musique,
// ou à partir d'une image qui se dévoile petit à petit (mode Images).
import { spawn } from 'node:child_process';
import { FFMPEG_PATH } from './binaries.js';
import { deezer, matchRatio } from './deezer.js';

// [œuvre, autres noms acceptés (séparés par |), artiste, titre du son, image]
// image : wiki:<article Wikipédia anglais> (affiche / jaquette) · tv:<nom sur TVmaze> (fond sans texte) · steam:<appid> (capture d'écran)
const FILMS = [
  ['Harry Potter', 'hp', 'John Williams', "Hedwig's Theme", "wiki:Harry Potter and the Philosopher's Stone (film)"],
  ['Star Wars', 'la guerre des etoiles', 'John Williams', 'Star Wars (Main Theme)', 'wiki:Star Wars (film)'],
  ['Pirates des Caraïbes', 'pirates of the caribbean|pirate des caraibes', 'Klaus Badelt', "He's a Pirate", 'wiki:Pirates of the Caribbean: The Curse of the Black Pearl'],
  ['Titanic', '', 'Céline Dion', 'My Heart Will Go On', 'wiki:Titanic (1997 film)'],
  ['Interstellar', '', 'Hans Zimmer', 'Cornfield Chase', 'wiki:Interstellar (film)'],
  ['Inception', '', 'Hans Zimmer', 'Time', 'wiki:Inception'],
  ['Le Seigneur des Anneaux', 'lord of the rings|seigneur des anneaux|lotr|sda', 'Howard Shore', 'Concerning Hobbits', 'wiki:The Lord of the Rings: The Fellowship of the Ring'],
  ['Jurassic Park', 'jurassic world', 'John Williams', 'Theme From Jurassic Park', 'wiki:Jurassic Park (film)'],
  ['Retour vers le futur', 'back to the future', 'Alan Silvestri', 'Back to the Future (Main Theme)', 'wiki:Back to the Future'],
  ['Rocky', '', 'Bill Conti', 'Gonna Fly Now', 'wiki:Rocky'],
  ['Mission Impossible', '', 'Lalo Schifrin', 'Mission: Impossible Theme', 'wiki:Mission: Impossible (film)'],
  ['James Bond', '007', 'Monty Norman', 'James Bond Theme', 'wiki:Skyfall'],
  ['Indiana Jones', '', 'John Williams', 'Raiders March', 'wiki:Raiders of the Lost Ark'],
  ['Les Dents de la mer', 'jaws|dents de la mer', 'John Williams', 'Main Title (Theme From Jaws)', 'wiki:Jaws (film)'],
  ['SOS Fantômes', 'ghostbusters|sos fantome', 'Ray Parker Jr.', 'Ghostbusters', 'wiki:Ghostbusters'],
  ['Top Gun', '', 'Kenny Loggins', 'Danger Zone', 'wiki:Top Gun'],
  ['Spider-Man', 'spiderman|spider man|spider verse|new generation', 'Post Malone', 'Sunflower', 'wiki:Spider-Man: Into the Spider-Verse'],
  ['Avengers', 'the avengers|marvel', 'Alan Silvestri', 'The Avengers', 'wiki:The Avengers (2012 film)'],
  ['Batman', 'the dark knight|dark knight|joker', 'Hans Zimmer', 'Why So Serious?', 'wiki:The Dark Knight'],
  ['Gladiator', '', 'Lisa Gerrard', 'Now We Are Free', 'wiki:Gladiator (2000 film)'],
  ['Le Parrain', 'the godfather|parrain', 'Nino Rota', 'The Godfather Waltz', 'wiki:The Godfather'],
  ['Pulp Fiction', '', 'Dick Dale and His Del-Tones', 'Misirlou', 'wiki:Pulp Fiction'],
  ['Intouchables', 'intouchable', 'Ludovico Einaudi', 'Fly', 'wiki:The Intouchables'],
  ["Le Fabuleux Destin d'Amélie Poulain", 'amelie poulain|amelie', 'Yann Tiersen', "Comptine d'un autre été, l'après-midi", 'wiki:Amélie'],
  ['Shrek', '', 'Smash Mouth', 'All Star', 'wiki:Shrek'],
  ['Fast & Furious', 'fast and furious|furious 7|fast furious', 'Wiz Khalifa', 'See You Again', 'wiki:Furious 7'],
  ['Barbie', '', 'Dua Lipa', 'Dance The Night', 'wiki:Barbie (film)'],
  ['Oppenheimer', '', 'Ludwig Göransson', 'Can You Hear The Music', 'wiki:Oppenheimer (film)'],
  ['La Panthère rose', 'pink panther|panthere rose', 'Henry Mancini', 'The Pink Panther Theme', 'wiki:The Pink Panther (1963 film)'],
  ['E.T.', 'et l extraterrestre|l extraterrestre|extraterrestre', 'John Williams', 'Flying Theme', 'wiki:E.T. the Extra-Terrestrial'],
  ['Kill Bill', '', 'Tomoyasu Hotei', 'Battle Without Honor or Humanity', 'wiki:Kill Bill: Volume 1'],
  ['Grease', '', 'John Travolta', "You're The One That I Want", 'wiki:Grease (film)'],
  ['Dirty Dancing', '', 'Bill Medley', "(I've Had) The Time of My Life", 'wiki:Dirty Dancing'],
  ['Super Mario Bros. le film', 'super mario|mario', 'Jack Black', 'Peaches', 'wiki:The Super Mario Bros. Movie'],
];

const DISNEY = [
  ['Le Roi Lion', 'the lion king|roi lion', 'Elton John', 'Circle of Life', 'wiki:The Lion King'],
  ['La Reine des neiges', 'frozen|reine des neiges', 'Anaïs Delva', 'Libérée, délivrée', 'wiki:Frozen (2013 film)'],
  ['Toy Story', '', 'Randy Newman', "You've Got a Friend in Me", 'wiki:Toy Story'],
  ['Vaiana', 'moana', 'Cerise Calixte', "Le bleu lumière", 'wiki:Moana (2016 film)'],
  ['Aladdin', '', 'Karine Costa', 'Ce rêve bleu', 'wiki:Aladdin (1992 Disney film)'],
  ['Encanto', '', 'Carolina Gaitán - La Gaita', "We Don't Talk About Bruno", 'wiki:Encanto (film)'],
  ['Le Livre de la jungle', 'the jungle book|livre de la jungle', 'Phil Harris', 'The Bare Necessities', 'wiki:The Jungle Book (1967 film)'],
  ['Coco', '', 'Benjamin Bratt', 'Remember Me (Ernesto de la Cruz)', 'wiki:Coco (2017 film)'],
  ['La Petite Sirène', 'the little mermaid|little mermaid|petite sirene', 'Samuel E. Wright', 'Under the Sea', 'wiki:The Little Mermaid (1989 film)'],
  ['La Belle et la Bête', 'beauty and the beast|belle et la bete', 'Angela Lansbury', 'Beauty and the Beast', 'wiki:Beauty and the Beast (1991 film)'],
  ['Mulan', '', 'Donny Osmond', "I'll Make a Man Out of You", 'wiki:Mulan (1998 film)'],
  ['Raiponce', 'tangled', 'Mandy Moore', 'I See the Light', 'wiki:Tangled'],
  ['Pocahontas', '', 'Judy Kuhn', 'Colors of the Wind', 'wiki:Pocahontas (1995 film)'],
  ['Hercule', 'hercules', 'Susan Egan', "I Won't Say (I'm in Love)", 'wiki:Hercules (1997 film)'],
  ['Tarzan', '', 'Phil Collins', "You'll Be in My Heart", 'wiki:Tarzan (1999 film)'],
  ['Lilo & Stitch', 'lilo et stitch|lilo and stitch|stitch', 'Mark Keali\'i Ho\'omalu', 'He Mele No Lilo', 'wiki:Lilo & Stitch'],
  ['Cendrillon', 'cinderella', 'Ilene Woods', 'Bibbidi-Bobbidi-Boo', 'wiki:Cinderella (1950 film)'],
  ['Blanche-Neige', 'snow white|blanche neige', 'Adriana Caselotti', 'Someday My Prince Will Come', 'wiki:Snow White and the Seven Dwarfs (1937 film)'],
  ['Mary Poppins', '', 'Julie Andrews', 'Supercalifragilisticexpialidocious', 'wiki:Mary Poppins (film)'],
  ['Les Aristochats', 'aristochats|the aristocats|aristocats', 'Phil Harris', 'Ev\'rybody Wants to Be a Cat', 'wiki:The Aristocats'],
  ['Zootopie', 'zootopia', 'Shakira', 'Try Everything', 'wiki:Zootopia'],
  ['Là-haut', 'up|la haut', 'Michael Giacchino', 'Married Life', 'wiki:Up (2009 film)'],
  ['Ratatouille', '', 'Camille', 'Le Festin', 'wiki:Ratatouille (film)'],
  ['Cars', '', 'Rascal Flatts', 'Life Is a Highway', 'wiki:Cars (film)'],
  ['Les Indestructibles', 'the incredibles|incredibles|indestructibles', 'Michael Giacchino', 'The Incredits', 'wiki:The Incredibles'],
  ['Pinocchio', '', 'Cliff Edwards', 'When You Wish Upon a Star', 'wiki:Pinocchio (1940 film)'],
  ['High School Musical', 'hsm', 'Zac Efron', 'Breaking Free', 'wiki:High School Musical'],
  ['Les 101 Dalmatiens', '101 dalmatiens|cruella|101 dalmatians', 'Bill Lee', 'Cruella De Vil', 'wiki:One Hundred and One Dalmatians'],
  ['Frère des ours', 'brother bear|frere des ours', 'Phil Collins', 'On My Way', 'wiki:Brother Bear'],
  ['Wish', 'wish asha et la bonne etoile', 'Ariana DeBose', 'This Wish', 'wiki:Wish (2023 film)'],
  ['Vice-versa', 'inside out|vice versa', 'Michael Giacchino', 'Bundle of Joy', 'wiki:Inside Out (2015 film)'],
];

const SERIES = [
  ['Stranger Things', '', 'Kyle Dixon & Michael Stein', 'Stranger Things', 'tv:Stranger Things'],
  ['Game of Thrones', 'got', 'Ramin Djawadi', 'Main Title', 'tv:Game of Thrones'],
  ['La Casa de Papel', 'money heist|casa de papel', 'Manu Pilas', 'Bella ciao', 'tv:Money Heist'],
  ['Squid Game', '', 'Jung Jae Il', 'Way Back then', 'tv:Squid Game'],
  ['Peaky Blinders', '', 'Nick Cave & The Bad Seeds', 'Red Right Hand', 'tv:Peaky Blinders'],
  ['Breaking Bad', '', 'Dave Porter', 'Breaking Bad Main Title Theme', 'tv:Breaking Bad'],
  ['Friends', '', 'The Rembrandts', "I'll Be There for You", 'tv:Friends'],
  ['Mercredi', 'wednesday', 'The Cramps', 'Goo Goo Muck', 'tv:Wednesday'],
  ['The Walking Dead', 'walking dead|twd', 'Bear McCreary', 'The Walking Dead Main Title', 'tv:The Walking Dead'],
  ['Arcane', '', 'Imagine Dragons', 'Enemy', 'tv:Arcane'],
  ['Euphoria', '', 'Labrinth', 'Still Don’t Know My Name', 'tv:Euphoria'],
  ['Prison Break', '', 'Ramin Djawadi', 'Prison Break Main Title', 'tv:Prison Break'],
  ['Les Simpson', 'simpson|simpsons|the simpsons', 'Danny Elfman', 'The Simpsons Theme', 'tv:The Simpsons'],
  ["Bob l'éponge", 'bob l eponge|spongebob|bob leponge', 'SpongeBob SquarePants', 'SpongeBob SquarePants Theme Song', 'tv:SpongeBob SquarePants'],
  ['Vikings', '', 'Fever Ray', 'If I Had a Heart', 'tv:Vikings'],
  ['Narcos', '', 'Rodrigo Amarante', 'Tuyo', 'tv:Narcos'],
  ['How I Met Your Mother', 'himym', 'The Solids', 'Hey Beautiful', 'tv:How I Met Your Mother'],
  ['The Mandalorian', 'mandalorian', 'Ludwig Göransson', 'The Mandalorian', 'tv:The Mandalorian'],
  ['Code Lyoko', 'lyoko', 'Noam Kaniel', 'Un monde sans danger', 'tv:Code Lyoko'],
  ['Totally Spies', '', 'Totally Spies', 'Here We Go', 'tv:Totally Spies!'],
  ['Phinéas et Ferb', 'phineas et ferb|phineas and ferb|phineas ferb', 'Bowling for Soup', 'Today Is Gonna Be a Great Day', 'tv:Phineas and Ferb'],
  ['Hannah Montana', '', 'Hannah Montana', 'The Best of Both Worlds', 'tv:Hannah Montana'],
  ['Pokémon', 'pokemon', 'Jason Paige', 'Pokémon Theme', 'tv:Pokémon'],
  ['The Office', 'office', 'The Scrantones', 'The Office Theme', 'tv:The Office'],
  ['Sherlock', '', 'David Arnold & Michael Price', 'Sherlock Main Theme', 'tv:Sherlock'],
];

const ANIME = [
  ['Naruto', 'naruto shippuden', 'Ikimono-gakari', 'Blue Bird', 'tv:Naruto Shippuden'],
  ['One Piece', '', 'Hiroshi Kitadani', 'We Are!', 'tv:One Piece'],
  ['Dragon Ball Z', 'dragon ball|dbz|dragon ball super', 'Hironobu Kageyama', 'Cha-La Head-Cha-La', 'tv:Dragon Ball Z'],
  ["L'Attaque des Titans", 'attaque des titans|snk|shingeki no kyojin|attack on titan|aot', 'Linked Horizon', 'Guren no Yumiya', 'tv:Attack on Titan'],
  ['Demon Slayer', 'kimetsu no yaiba', 'LiSA', 'Gurenge', 'tv:Demon Slayer'],
  ['Jujutsu Kaisen', 'jjk', 'Eve', 'Kaikai Kitan', 'tv:Jujutsu Kaisen'],
  ['Death Note', '', 'Nightmare', 'the WORLD', 'tv:Death Note'],
  ['Tokyo Ghoul', '', 'TK from Ling tosite sigure', 'unravel', 'tv:Tokyo Ghoul'],
  ['My Hero Academia', 'mha|boku no hero academia|boku no hero', 'Kenshi Yonezu', 'Peace Sign', 'tv:My Hero Academia'],
  ['Chainsaw Man', '', 'Kenshi Yonezu', 'KICK BACK', 'tv:Chainsaw Man'],
  ['Hunter x Hunter', 'hxh|hunter hunter', 'Masatoshi Ono', 'departure!', 'tv:Hunter x Hunter'],
  ['Fullmetal Alchemist', 'fma|fullmetal alchemist brotherhood', 'YUI', 'Again', 'tv:Fullmetal Alchemist: Brotherhood'],
  ['Spy x Family', 'spy family', 'Official HIGE DANdism', 'Mixed Nuts', 'tv:Spy x Family'],
  ['Evangelion', 'neon genesis evangelion|eva', 'Yoko Takahashi', "A Cruel Angel's Thesis", 'tv:Neon Genesis Evangelion'],
  ['Sword Art Online', 'sao', 'LiSA', 'crossing field', 'tv:Sword Art Online'],
  ['Blue Lock', '', 'UNISON SQUARE GARDEN', 'Chaos ga Kiwamaru', 'tv:Blue Lock'],
  ['Solo Leveling', '', 'SawanoHiroyuki[nZk]', 'LEveL', 'tv:Solo Leveling'],
  ['Oshi no Ko', '', 'YOASOBI', 'Idol', 'tv:Oshi no Ko'],
  ['Bleach', '', 'ORANGE RANGE', 'Asterisk', 'tv:Bleach'],
  ['Frieren', '', 'YOASOBI', 'Yuusha', "tv:Frieren: Beyond Journey's End"],
];

const GAMES = [
  ['Minecraft', '', 'C418', 'Sweden', 'steam:1672970'],
  ['Super Mario Bros.', 'super mario|mario|mario bros', 'Koji Kondo', 'Super Mario Bros. Theme', 'wiki:Super Mario Bros.'],
  ['Tetris', '', 'Hirokazu Tanaka', 'Tetris Theme A Korobeiniki', 'wiki:Tetris'],
  ['Zelda', 'the legend of zelda|legend of zelda|breath of the wild', 'Koji Kondo', 'The Legend of Zelda Main Theme', 'wiki:The Legend of Zelda: Breath of the Wild'],
  ['GTA San Andreas', 'gta|san andreas|gta sa', 'Michael Hunter', 'Grand Theft Auto San Andreas Theme', 'steam:12120'],
  ['GTA V', 'gta|gta 5|gta five|grand theft auto', 'The Chain Gang of 1974', 'Sleepwalking', 'steam:271590'],
  ['Red Dead Redemption 2', 'red dead|rdr2|rdr|red dead redemption', 'Daniel Lanois', "That's The Way It Is", 'steam:1174180'],
  ['Skyrim', 'the elder scrolls|elder scrolls', 'Jeremy Soule', 'Dragonborn', 'steam:489830'],
  ['Undertale', '', 'Toby Fox', 'Megalovania', 'steam:391540'],
  ['Portal', 'portal 2', 'Jonathan Coulton', 'Still Alive', 'steam:620'],
  ['Halo', '', 'Martin O’Donnell', 'Halo Theme', 'steam:976730'],
  ["Assassin's Creed", 'assassins creed|ac', 'Jesper Kyd', "Ezio's Family", 'steam:33230'],
  ['Final Fantasy VII', 'final fantasy|ff7|ffvii', 'Nobuo Uematsu', 'One-Winged Angel', 'steam:1462040'],
  ['Sonic', 'sonic the hedgehog', 'Masato Nakamura', 'Green Hill Zone', 'wiki:Sonic the Hedgehog (1991 video game)'],
  ['Street Fighter', '', 'Yoko Shimomura', "Guile's Theme", 'steam:1364780'],
  ['Mortal Kombat', '', 'The Immortals', 'Techno Syndrome (Mortal Kombat)', 'steam:1971870'],
  ['Wii Sports', 'wii', 'Kazumi Totaka', 'Wii Sports Theme', 'wiki:Wii Sports'],
  ['League of Legends', 'lol|league', 'Against The Current', 'Legends Never Die', 'wiki:League of Legends'],
  ['Fortnite', '', 'Epic Games', 'Fortnite Lobby Music', 'wiki:Fortnite: Save the World'],
  ['Among Us', '', 'Marcus Bromander', 'Among Us Theme', 'steam:945360'],
  ['Geometry Dash', '', 'ForeverBound', 'Stereo Madness', 'steam:322170'],
  ['Subway Surfers', '', 'Subway Surfers', 'Subway Surfers Theme', 'wiki:Subway Surfers'],
  ['Doom', '', 'Mick Gordon', 'BFG Division', 'steam:379720'],
  ['Kingdom Hearts', '', 'Hikaru Utada', 'Simple And Clean', 'wiki:Kingdom Hearts (video game)'],
  ['Angry Birds', '', 'Ari Pulkkinen', 'Angry Birds Theme', 'wiki:Angry Birds (video game)'],
  ['Genshin Impact', 'genshin', 'Yu-Peng Chen', 'Genshin Impact Main Theme', 'wiki:Genshin Impact'],
  ['Terraria', '', 'Scott Lloyd Shelly', 'Overworld Day', 'steam:105600'],
  ['Stardew Valley', '', 'ConcernedApe', 'Stardew Valley Overture', 'steam:413150'],
  ['Elden Ring', '', 'Tsukasa Saitoh', 'Elden Ring', 'steam:1245620'],
  ['Crash Bandicoot', 'crash', 'Josh Mancell', 'Crash Bandicoot Theme', 'steam:731490'],
  ['Fall Guys', '', 'Jukio Kallio', "Fall 'N' Roll", 'steam:1097150'],
  ['Plants vs Zombies', 'pvz|plantes contre zombies|plants vs zombie', 'Laura Shigihara', 'Grasswalk', 'steam:3590'],
  ['The Last of Us', 'last of us|tlou', 'Gustavo Santaolalla', 'The Last of Us', 'steam:1888930'],
  ['Mario Kart', 'mario kart 8', 'Nintendo Sound Team', 'Mario Kart 8 Main Theme', 'wiki:Mario Kart 8 Deluxe'],
];

// [jeu, autres noms, recherche YouTube, image]
const GAME_SOUNDS = [
  ['Super Mario Bros.', 'super mario|mario|mario bros', 'Super Mario Bros Coin Sound Effect', 'wiki:Super Mario Bros.'],
  ['Among Us', '', 'Among Us Emergency Meeting Sound Effect', 'steam:945360'],
  ['Pac-Man', 'pacman|pac man', 'Pac-Man Death Sound Effect', 'wiki:Pac-Man'],
  ['Roblox', '', 'Roblox Death Sound Oof Sound Effect', 'wiki:Roblox'],
  ['GTA San Andreas', 'gta|san andreas|gta sa', 'GTA San Andreas Mission Passed Sound Effect', 'steam:12120'],
  ['GTA V', 'gta|gta 5|gta five|grand theft auto', 'GTA 5 Wasted Sound Effect', 'steam:271590'],
  ['Street Fighter', '', 'Street Fighter Hadouken Sound Effect', 'steam:1364780'],
  ['Mortal Kombat', '', 'Mortal Kombat Finish Him Sound Effect', 'steam:1971870'],
  ['PlayStation', 'ps1|playstation 1|play station|ps', 'PS1 Startup Sound', 'wiki:PlayStation (console)'],
  ['Xbox 360', 'xbox', 'Xbox 360 Startup Sound', 'wiki:Xbox 360'],
  ['GameCube', 'gamecube|game cube|nintendo gamecube', 'GameCube Startup Sound', 'wiki:GameCube'],
  ['Clash Royale', '', 'Clash Royale King Laugh Sound Effect', 'wiki:Clash Royale'],
  ['Metal Gear Solid', 'metal gear|mgs', 'Metal Gear Solid Alert Sound Effect', 'wiki:Metal Gear Solid (1998 video game)'],
  ['Minecraft', '', 'Minecraft Villager Sound Effect', 'steam:1672970'],
  ['Zelda', 'the legend of zelda|legend of zelda', 'Zelda Secret Discovery Sound Effect', 'wiki:The Legend of Zelda: Ocarina of Time'],
  ['Sonic', 'sonic the hedgehog', 'Sonic Ring Sound Effect', 'wiki:Sonic the Hedgehog (1991 video game)'],
  ['Pokémon', 'pokemon', 'Pokemon Center Healing Sound Effect', 'wiki:Pokémon Red and Blue'],
  ['Counter-Strike', 'counter strike|cs|csgo|cs go|cs2', 'Counter Strike Terrorists Win Sound Effect', 'steam:730'],
  ['Call of Duty', 'cod|modern warfare', 'Call of Duty Hitmarker Sound Effect', 'steam:10180'],
  ['Skyrim', 'the elder scrolls|elder scrolls', 'Skyrim Level Up Sound Effect', 'steam:489830'],
  ['Fortnite', '', 'Fortnite Chest Opening Sound Effect', 'wiki:Fortnite: Save the World'],
  ['Duck Hunt', '', 'Duck Hunt Dog Laugh Sound Effect', 'wiki:Duck Hunt'],
  ['League of Legends', 'lol|league', 'League of Legends Pentakill Sound Effect', 'wiki:League of Legends'],
  ['Wii', 'nintendo wii|wii sports', 'Wii Shop Channel Music', 'wiki:Wii'],
  ['Nintendo Switch', 'switch', 'Nintendo Switch Click Sound Effect', 'wiki:Nintendo Switch'],
];

export const WORK_CATEGORIES = {
  films: { label: 'film', question: 'De quel film ça vient ?', imageQuestion: "C'est quel film ?", emoji: '🎬', list: FILMS },
  disney: { label: 'Disney', question: 'De quel Disney ça vient ?', imageQuestion: "C'est quel Disney ?", emoji: '🏰', list: DISNEY },
  series: { label: 'série / dessin animé', question: 'De quelle série ça vient ?', imageQuestion: "C'est quelle série ?", emoji: '📺', list: SERIES },
  anime: { label: 'animé', question: 'De quel animé ça vient ?', imageQuestion: "C'est quel animé ?", emoji: '🍥', list: ANIME },
  games: { label: 'jeu vidéo', question: 'De quel jeu vidéo ça vient ?', imageQuestion: "C'est quel jeu vidéo ?", emoji: '🎮', list: GAMES, sounds: GAME_SOUNDS },
};

const normalize = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const VARIANT = /\b(remix|rmx|mix|sped ?up|slowed|reverb|nightcore|8d|karaok[eé]|cover|tribute|piano|lofi|lo fi|orchestral|epic|trailer|version|live|extended|hour|hours|heure|10h|1h|loop|mashup|medley|trap|drill|metal|8 ?bit|lyrics?|bootleg|rework|flip|vip|edit|arr|arrangement|arranged|animation|guitar|violin|reaction|tutorial|fanmade|fan made)\b/i;
const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

/** Toutes les œuvres d'une ou plusieurs catégories. */
export function worksOf(categories, { sounds = true } = {}) {
  const aliasesOf = (work, aliases) => [work, ...aliases.split('|')].map((a) => a.trim()).filter(Boolean);
  return categories.flatMap((category) => [
    ...WORK_CATEGORIES[category].list.map(([work, aliases, artist, title, image]) => ({
      work, aliases: aliasesOf(work, aliases), category, artist, songTitle: title, image,
    })),
    ...(sounds ? WORK_CATEGORIES[category].sounds ?? [] : []).map(([work, aliases, query, image]) => ({
      work, aliases: aliasesOf(work, aliases), category, artist: 'effet sonore', songTitle: query, image, sfx: true,
    })),
  ]);
}

export const workKey = (entry) => `oeuvre|${normalize(entry.work)}${entry.sfx ? '|son' : ''}`;

/** La réponse donne-t-elle le nom de l'œuvre ? */
export function guessesWork(track, guess, covers) {
  const compact = (text) => normalize(text).replace(/ /g, '');
  const words = normalize(guess).split(' ');
  return track.aliases.some((alias) => {
    // Écrit en entier sans espaces ni points (« ET », « lotr », « 007 »)
    if (compact(guess) === compact(alias)) return true;
    // Sigles courts : le mot exact, pas le début d'un autre mot (« ac » ≠ « accord »)
    if (compact(alias).length <= 3) return words.includes(normalize(alias));
    return covers(alias, guess);
  });
}

/**
 * Son d'une œuvre : la version Deezer officielle (code ISRC = bon enregistrement), sinon une recherche YouTube soignée.
 */
export async function resolveWorkSong(entry) {
  if (entry.sfx) {
    const title = entry.songTitle.replace(/ sound effect$/i, '');
    return { ...entry, strict: true, curated: true, requestedBy: 'blindtest', title, artist: 'Effet sonore', duration: 0, thumbnail: null, source: 'youtube', query: entry.songTitle };
  }
  // Le bon son ET le bon artiste (sinon c'est souvent une reprise), jamais une autre version
  const good = (item) => item?.readable !== false && !VARIANT.test(`${item.title ?? ''} ${item.title_version ?? ''}`)
    && matchRatio(entry.songTitle, item.title ?? '') >= 0.75
    && matchRatio(entry.artist, item.artist?.name ?? '') >= 0.5;
  let results = await deezer.search(`artist:"${entry.artist}" track:"${entry.songTitle}"`, 10).catch(() => []);
  let found = results.filter(good).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];
  if (!found) {
    results = await deezer.search(`${entry.songTitle} ${entry.artist}`, 15).catch(() => []);
    found = results.filter(good).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))[0];
  }
  const base = { ...entry, strict: true, curated: true, requestedBy: 'blindtest' };
  if (found) {
    return {
      ...base,
      title: found.title,
      artist: found.artist?.name ?? entry.artist,
      duration: found.duration ?? 0,
      thumbnail: found.album?.cover_xl ?? found.album?.cover_big ?? null,
      deezerId: found.id,
      deezerUrl: found.link ?? `https://www.deezer.com/track/${found.id}`,
      source: 'deezer',
      query: `${found.artist?.name ?? entry.artist} ${found.title}`,
    };
  }
  // Pas sur Deezer (musiques Nintendo...) : recherche YouTube, sans remix / version longue
  return { ...base, title: entry.songTitle, artist: entry.artist, duration: 0, thumbnail: null, source: 'youtube', query: `${entry.songTitle} ${entry.artist}` };
}

export const isWorkVariant = (text = '') => VARIANT.test(text);
// Vidéos d'effets sonores à éviter : compilations, évolutions, boucles
export const isBadSoundVideo = (text = '') => /\b(variations?|evolution|comparison|compilation|every|all|loop|hour|hours|remix|green ?screen|meme|earrape|bass ?boost(ed)?|reverse|slowed)\b/i.test(text);

// ===================== Images =====================

const UA = { 'User-Agent': 'AI-Vercel-Discord-Bot/1.0 (https://github.com/zyko144/vercel-ia-; blind test)' };

const jsonCache = new Map(); // url -> { at, data }
const JSON_CACHE_MS = 12 * 60 * 60_000;

async function getJson(url, attempt = 0) {
  const cached = jsonCache.get(url);
  if (cached && Date.now() - cached.at < JSON_CACHE_MS) return cached.data;
  const response = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (response.status === 429 && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 1_500 * (attempt + 1)));
    return getJson(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  jsonCache.set(url, { at: Date.now(), data });
  return data;
}

/** Adresse d'une image de l'œuvre + si c'est une affiche (titre écrit dessus, on la recadre). */
export async function imageUrl(spec) {
  const [kind, ...rest] = spec.split(':');
  const value = rest.join(':');
  if (kind === 'steam') {
    const data = await getJson(`https://store.steampowered.com/api/appdetails?appids=${value}&filters=screenshots`);
    const shots = data?.[value]?.data?.screenshots ?? [];
    // Les premières captures sont souvent des affiches avec le logo : on évite la toute première
    const pool = shots.length > 2 ? shots.slice(1) : shots;
    const shot = pickRandom(pool);
    return shot ? { url: shot.path_full, poster: false } : null;
  }
  if (kind === 'tv') {
    const show = await getJson(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(value)}`);
    const images = await getJson(`https://api.tvmaze.com/shows/${show.id}/images`);
    const backgrounds = images.filter((image) => image.type === 'background' && image.resolutions?.original?.url);
    if (backgrounds.length) return { url: pickRandom(backgrounds).resolutions.original.url, poster: false };
    const poster = images.find((image) => image.type === 'poster' && image.main) ?? images.find((image) => image.type === 'poster');
    const url = poster?.resolutions?.original?.url ?? show.image?.original;
    return url ? { url, poster: true } : null;
  }
  if (kind === 'wiki') {
    const data = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&pilicense=any&redirects=1&titles=${encodeURIComponent(value)}`);
    const page = Object.values(data?.query?.pages ?? {})[0];
    const url = page?.original?.source;
    return url && !/\.svg$/i.test(url) ? { url, poster: true } : null;
  }
  return null;
}

function ffmpegImage(input, filter) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vf', filter, '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', '-q:v', '4', 'pipe:1'], { windowsHide: true });
    const chunks = [];
    let errors = '';
    const timer = setTimeout(() => proc.kill('SIGKILL'), 15_000);
    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => { errors += chunk; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks);
      if (code === 0 && output.length) resolve(output);
      else reject(new Error(`image : ${errors.split('\n')[0] || `ffmpeg code ${code}`}`));
    });
    proc.stdin.on('error', () => {});
    proc.stdin.end(input);
  });
}

// Flou : largeur de l'image pixelisée à chaque étape (plus c'est petit, plus c'est flou), selon la difficulté
const PIXEL_STAGES = { tresfacile: [32, 64, 128], facile: [24, 48, 96], normal: [16, 32, 64], difficile: [10, 20, 40], expert: [8, 14, 24] };
// Zoom : grossissement à chaque étape (on part d'un détail et on recule)
const ZOOM_STAGES = { tresfacile: [3, 2, 1.3], facile: [4, 2.5, 1.5], normal: [5, 3, 1.8], difficile: [7, 4, 2.2], expert: [9, 5, 3] };
const WIDTH = 640;

/**
 * Prépare les images d'une manche : 3 étapes de plus en plus nettes, puis l'image complète pour la réponse.
 * @returns {Promise<{ stages: Buffer[], full: Buffer } | null>}
 */
export async function workImages(entry, { style = 'pixel', difficulty = 'normal' } = {}) {
  const found = await imageUrl(entry.image).catch(() => null);
  if (!found?.url) return null;
  const response = await fetch(found.url, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return null;
  const original = Buffer.from(await response.arrayBuffer());
  // Affiche / jaquette : le titre est souvent en haut ou en bas, on garde le milieu pendant la manche
  const crop = found.poster ? 'crop=iw:ih*0.6:0:ih*0.2,' : '';
  const full = await ffmpegImage(original, `scale=${WIDTH}:-2`);
  const stages = [];
  if (style === 'zoom') {
    // Même point de départ pour toutes les étapes (pas trop près des bords, ni du titre sur une affiche)
    const rx = (0.25 + Math.random() * 0.5).toFixed(3);
    const ry = (found.poster ? 0.35 + Math.random() * 0.3 : 0.25 + Math.random() * 0.5).toFixed(3);
    for (const zoom of ZOOM_STAGES[difficulty] ?? ZOOM_STAGES.normal) {
      stages.push(await ffmpegImage(original, `crop=iw/${zoom}:ih/${zoom}:(iw-iw/${zoom})*${rx}:(ih-ih/${zoom})*${ry},scale=${WIDTH}:-2`));
    }
  } else {
    for (const width of PIXEL_STAGES[difficulty] ?? PIXEL_STAGES.normal) {
      stages.push(await ffmpegImage(original, `${crop}scale=${width}:-2:flags=area,scale=${WIDTH}:-2:flags=neighbor`));
    }
  }
  return { stages, full };
}
