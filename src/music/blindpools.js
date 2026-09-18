// Réserves de sons du blind test : thèmes (sons du moment, rap FR par année...), niveaux, modes de jeu,
// sons vérifiés un par un (année de sortie + code ISRC pour jouer exactement le bon morceau).
import { load, save } from '../storage.js';
import { deezer, rankResults, trackFromDeezer } from './deezer.js';
import { findLyrics } from './lyrics.js';
import { resolveWorkSong, WORK_CATEGORIES, workKey, worksOf } from './blindworks.js';
import { aiPlaylist } from './sources.js';
import { popularTracks } from './stats.js';

// Playlists Deezer (éditoriales pour la plupart) qui servent de base à chaque thème
const PL = {
  actuRap: 1071669561, rapstars: 3272614282, hitsDeRue: 1701025601, tasCapte: 13134487943, certifie: 3830830902,
  rap2026: 1140276541, best2025: 14478423703, rapstars2020: 9563400362, best2024: 13154564983, mega2024: 12251400891,
  best2023: 3525945442, rap2324: 12317765831, skyrock2022: 10704136442, ete2022: 10302916242,
  topFrance: 1109890291, topFrance2025: 14591586961, hits2024: 13200756823,
  // 2016 → 2020
  pnl: 5709242102, rapstars2010: 5175061384, rapfr2010: 10259601162, rap161718: 11022901282, bestof1821: 9400450122,
  prime1520: 15613524303, annee2010: 8088419282,
  // Tendances TikTok
  tiktokFr: 1082651151, tiktokWorld: 4403076402, laTrend: 1589484015, tiktokViralFr: 9013665122, rapViral: 7764652862,
  // Notre génération : les tubes des années 2010
  hitsDeRue2010: 14055903761, enMode2010: 2051712324, party10s: 715215865, tubes2010: 2474339902, bleuBlanc2010: 1162725851,
  carreVip2010: 10039276362, best2015: 1103656501, best2016: 1376135575, best2018: 5229773802, afro2010: 12546279743,
  // Rap US
  hotUrban: 1677006641, rapBangers: 1996494362, rap10s: 7662551722, rapUs2026: 1060978321, rapUs2024: 13241781803, newSchool: 6712593324,
  // Afro
  hitsAfroFr: 1440933255, afroHits: 1440614715, afrobeats: 3153080842,
  // Hits
  titresDuMoment: 53362031, bleuBlancHits: 1189520191,
};

// Playlists 100 % rap français : leurs artistes servent à écarter les sons étrangers des playlists mélangées
// (« Certifié » et les mix Filtr contiennent aussi des tubes étrangers, ils ne comptent pas ici)
const FRENCH_RAP_PLAYLISTS = [PL.actuRap, PL.rapstars, PL.hitsDeRue, PL.tasCapte, PL.best2025, PL.best2024, PL.best2023, PL.rapstars2020, PL.rap2324, PL.pnl, PL.rapstars2010, PL.rapfr2010, PL.annee2010];
const FRENCH_ISRC = new Set(['FR', 'BE', 'CH', 'LU', 'MC']);
// Titres qui ne disent rien en blind test, ou versions qui ne ressemblent pas au son connu (live, remix, émission TV...)
const BAD_TITLE = /\b(intro|outro|interlude|skit|freestyle|nouvelle [ée]cole)\b/i;
// Tout ce qui n'est pas le son d'origine : remix, accéléré, ralenti, live, reprise, karaoké...
const VARIANT_TITLE = /\b(remix(ed)?|rmx|sped ?up|speed ?up|slowed|reverb|nightcore|8d|bass ?boost(ed)?|karaok[eé]|instrumental|acapella|a cappella|acoustique|acoustic|unplugged|live|session|colors show|cover|reprise|tribute|mashup|medley|version|(?<!radio )edit|mix|rework|bootleg|vip|flip|extended|acc[eé]l[eé]r[eé]e?|piano|orchestral|lofi|lo-fi|jersey club|super slowed|techno|phonk remix)\b/i;
const VARIANT_ALBUM = /\b(remix(es)?|sped ?up|slowed|nightcore|karaok[eé]|instrumentals?|acoustic|live|tribute|covers?|8d|lofi|lo-fi|piano)\b/i;
const VARIANT_ARTIST = /\b(sped ?up|slowed|nightcore|8d|karaok[eé]|tribute|covers?|lofi|piano|orchestra|remix(es)?|reverb)\b/i;
const isVariant = (item) => VARIANT_TITLE.test(`${item.title ?? ''} ${item.title_version ?? ''}`)
  || VARIANT_ALBUM.test(item.album?.title ?? '')
  || VARIANT_ARTIST.test(item.artist?.name ?? '');

export const THEMES = {
  moment: { label: 'Sons du moment (2025-2026)', emoji: '🔥', french: true, years: [2025, 2026], playlists: [PL.actuRap, PL.rapstars, PL.hitsDeRue, PL.tasCapte, PL.best2025, PL.rap2026, PL.rapViral] },
  tiktok: { label: 'Trends TikTok', emoji: '📱', playlists: [PL.tiktokFr, PL.tiktokWorld, PL.laTrend, PL.tiktokViralFr, PL.rapViral] },
  genz: { label: 'Notre enfance : tubes 2010-2020', emoji: '🧃', years: [2009, 2020], playlists: [PL.hitsDeRue2010, PL.enMode2010, PL.party10s, PL.tubes2010, PL.bleuBlanc2010, PL.carreVip2010, PL.best2015, PL.best2016, PL.best2018, PL.afro2010] },
  recent: { label: 'Rap FR récent (2022 → 2026)', emoji: '🎧', french: true, years: [2022, 2026], playlists: [PL.actuRap, PL.rapstars, PL.hitsDeRue, PL.certifie, PL.best2025, PL.best2024, PL.best2023, PL.rapstars2020, PL.skyrock2022] },
  y2026: { label: 'Rap FR 2026', emoji: '🆕', french: true, years: [2026, 2026], playlists: [PL.actuRap, PL.rapstars, PL.hitsDeRue, PL.tasCapte, PL.certifie, PL.rap2026] },
  y2025: { label: 'Rap FR 2025', emoji: '💿', french: true, years: [2025, 2025], playlists: [PL.best2025, PL.rapstars2020, PL.certifie, PL.hitsDeRue, PL.rap2026] },
  y2024: { label: 'Rap FR 2024', emoji: '💿', french: true, years: [2024, 2024], playlists: [PL.best2024, PL.mega2024, PL.rapstars2020, PL.rap2324] },
  y2023: { label: 'Rap FR 2023', emoji: '💿', french: true, years: [2023, 2023], playlists: [PL.best2023, PL.rap2324, PL.rapstars2020, PL.mega2024] },
  y2022: { label: 'Rap FR 2022', emoji: '💿', french: true, years: [2022, 2022], playlists: [PL.skyrock2022, PL.ete2022, PL.rapstars2020] },
  y1620: { label: 'Rap FR 2016 → 2020 (PNL, Nekfeu, Damso…)', emoji: '📼', french: true, years: [2016, 2020], playlists: [PL.pnl, PL.rapstars2010, PL.rapfr2010, PL.rap161718, PL.bestof1821, PL.prime1520, PL.annee2010, PL.rapstars2020] },
  hits: { label: 'Hits France du moment', emoji: '🇫🇷', years: [2023, 2026], playlists: [PL.topFrance, PL.topFrance2025, PL.hits2024, PL.titresDuMoment, PL.bleuBlancHits] },
  usrap: { label: 'Rap US', emoji: '🇺🇸', years: [2010, 2026], playlists: [PL.hotUrban, PL.rapBangers, PL.rap10s, PL.rapUs2026, PL.rapUs2024, PL.newSchool] },
  afro: { label: 'Afro, shatta, amapiano', emoji: '🌍', playlists: [PL.hitsAfroFr, PL.afroHits, PL.afrobeats, PL.afro2010] },
  films: { label: 'Films (musiques de films)', emoji: '🎬', works: 'films' },
  series: { label: 'Séries et dessins animés', emoji: '📺', works: 'series' },
  anime: { label: 'Animés (openings)', emoji: '🍥', works: 'anime' },
  jeux: { label: 'Jeux vidéo (musiques et sons cultes)', emoji: '🎮', works: 'games' },
  disney: { label: 'Disney & Pixar', emoji: '🏰', works: 'disney' },
  oeuvres: { label: 'Tout mélangé (films, Disney, séries, jeux…)', emoji: '🎲', works: 'all' },
  server: { label: 'Sons du serveur', emoji: '🏠' },
  custom: { label: 'Thème perso', emoji: '✏️' },
};

export const DIFFICULTIES = {
  tresfacile: { label: 'Très facile', emoji: '🍼', color: 0x5865f2, snippet: 30, minRank: 900_000, top: 60, maxPerArtist: 1, start: [0.3, 0.42], hintAt: 0.25, speedBonus: 0.35, desc: 'Les plus gros sons du moment · 30 s · indices' },
  facile: { label: 'Facile', emoji: '🟢', color: 0x57f287, snippet: 30, minRank: 800_000, top: 100, maxPerArtist: 2, start: [0.3, 0.42], hintAt: 0.35, speedBonus: 0.35, desc: 'Sons très connus · 30 s · refrain · indices' },
  normal: { label: 'Moyen', emoji: '🟡', color: 0xfee75c, snippet: 20, minRank: 650_000, top: 160, maxPerArtist: 2, start: [0.25, 0.45], hintAt: 0.6, speedBonus: 0.35, desc: 'Sons connus · 20 s · un indice' },
  difficile: { label: 'Difficile', emoji: '🔴', color: 0xed4245, snippet: 12, minRank: 450_000, top: 250, maxPerArtist: 3, start: [0.12, 0.6], hintAt: null, speedBonus: 0.35, desc: "Moins connus · 12 s · pas d'indice" },
  expert: { label: 'Expert', emoji: '💀', color: 0x2b2d31, snippet: 6, minRank: 300_000, top: 400, maxPerArtist: 3, start: [0.05, 0.7], hintAt: null, speedBonus: 0.5, desc: "6 s seulement · n'importe où dans le son" },
};

/** Modes qui montrent une image (films, Disney, séries, animés, jeux). */
export const IMAGE_MODES = new Set(['images', 'sonimage', 'zoom']);
/** Modes sans son. */
export const SILENT_MODES = new Set(['paroles', 'images', 'zoom']);
/** Commandes /jeu-devine, /jeu-films... : leurs catégories et leurs modes. */
export const QUIZ_THEMES = ['films', 'disney', 'series', 'anime', 'jeux', 'oeuvres'];
export const QUIZ_MODES = ['classique', 'sonimage', 'images', 'zoom', 'eclair', 'intro', 'unessai', 'premier10'];

export const MODES = {
  classique: { label: 'Classique', emoji: '🎯', desc: 'Titre +2 · artiste +1 · rapidité +1' },
  titre: { label: 'Titre seulement', emoji: '🎵', desc: 'Seul le titre compte' },
  artiste: { label: 'Artiste seulement', emoji: '🎤', desc: 'Trouve qui chante' },
  intro: { label: 'Intro', emoji: '🎬', desc: 'Les toutes premières secondes du son' },
  eclair: { label: 'Éclair', emoji: '⚡', desc: '3 secondes de son, pas une de plus', snippet: 3 },
  annee: { label: 'Année', emoji: '📅', desc: "Devine l'année de sortie" },
  suite: { label: 'Suite des paroles', emoji: '🎙️', desc: 'Le son se coupe : écris la phrase qui suit' },
  paroles: { label: 'Paroles', emoji: '📝', desc: 'Pas de son : devine avec les paroles' },
  images: { label: 'Image floutée', emoji: '🖼️', desc: "Pas de son : l'image floutée devient de plus en plus nette" },
  sonimage: { label: 'Son + image', emoji: '🎬', desc: "La musique et l'image floutée en même temps" },
  zoom: { label: 'Zoom', emoji: '🔍', desc: "Pas de son : l'image part d'un détail et recule petit à petit" },
  premier10: { label: 'Premier à 10', emoji: '👑', desc: 'Le premier à 10 points gagne' },
  unessai: { label: 'Un seul essai', emoji: '🎲', desc: 'Une seule réponse par manche' },
};

const PLAYLIST_CACHE_MS = 3 * 60 * 60_000;
const DETAILS_CACHE_MS = 24 * 60 * 60_000;
const RECENT_KEY = 'blindtest-recent';
const RECENT_MAX = 900;
const playlistCache = new Map(); // id -> { at, tracks }
const detailsCache = new Map(); // deezerId -> { at, details }
let recent = null; // guildId -> [clés des derniers sons joués]
let frenchArtistsCache = null;

const normalize = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => normalize(s).split(' ').filter(Boolean);

/** Titre sans (feat. ...), [Remix], - Radio Edit... */
export const cleanTitle = (text = '') => text
  .replace(/\s*[([].*?[)\]]/g, ' ')
  .replace(/\s+-\s+.*$/, ' ')
  .replace(/\s*(feat|ft)\.?\s.*$/i, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const songKey = (track) => `${normalize(cleanTitle(track.title))}|${normalize(track.artist ?? '')}`;
const yearOf = (details) => Number(details?.release_date?.slice(0, 4)) || null;

async function playlistTracks(id) {
  const cached = playlistCache.get(id);
  if (cached && Date.now() - cached.at < PLAYLIST_CACHE_MS) return cached.tracks;
  const tracks = await deezer.playlistTracks(id).catch(() => []);
  if (tracks.length) playlistCache.set(id, { at: Date.now(), tracks });
  return tracks;
}

let catalogCache = null;

/** Rappeurs FR (du plus présent au moins présent) et leurs sons, tirés des playlists rap FR + Top France. */
export async function frenchRapCatalog() {
  if (catalogCache && Date.now() - catalogCache.at < PLAYLIST_CACHE_MS) return catalogCache;
  const lists = await Promise.all([...FRENCH_RAP_PLAYLISTS, PL.topFrance].map(playlistTracks));
  const artists = new Map();
  const tracks = new Map();
  for (const item of lists.flat()) {
    if (!item?.artist?.name) continue;
    const artist = artists.get(item.artist.id) ?? { id: item.artist.id, name: item.artist.name, count: 0, rank: 0 };
    artist.count++;
    artist.rank = Math.max(artist.rank, item.rank ?? 0);
    artists.set(item.artist.id, artist);
    if (!tracks.has(item.id)) tracks.set(item.id, { id: item.id, title: item.title, artist: item.artist.name, artistId: item.artist.id, rank: item.rank ?? 0 });
  }
  const catalog = {
    at: Date.now(),
    artists: [...artists.values()].sort((a, b) => b.count - a.count || b.rank - a.rank),
    tracks: [...tracks.values()],
  };
  if (catalog.artists.length) catalogCache = catalog;
  return catalog;
}

/** Artistes présents dans les playlists rap FR éditoriales. */
async function frenchArtists() {
  if (frenchArtistsCache && Date.now() - frenchArtistsCache.at < PLAYLIST_CACHE_MS) return frenchArtistsCache.names;
  const lists = await Promise.all(FRENCH_RAP_PLAYLISTS.map(playlistTracks));
  const names = new Set(lists.flat().map((item) => item.artist?.name).filter(Boolean).map(normalize));
  frenchArtistsCache = { at: Date.now(), names };
  return names;
}

/** Infos complètes d'un son Deezer (date de sortie, ISRC). */
async function trackDetails(id) {
  const cached = detailsCache.get(id);
  if (cached && Date.now() - cached.at < DETAILS_CACHE_MS) return cached.details;
  const details = await deezer.track(id).catch(() => null);
  if (details?.id) detailsCache.set(id, { at: Date.now(), details });
  return details;
}

async function recentFor(guildId) {
  if (!recent) {
    const saved = await load(RECENT_KEY, {}).catch(() => ({}));
    recent = new Map(Object.entries(saved ?? {}));
  }
  return new Set(recent.get(guildId) ?? []);
}

/** Mémorise les sons joués pour ne pas les ressortir à la prochaine partie. */
export function rememberPlayed(guildId, track) {
  if (!recent) recent = new Map();
  const key = track.work ? workKey(track) : songKey(track);
  const list = (recent.get(guildId) ?? []).filter((saved) => saved !== key);
  list.push(key);
  recent.set(guildId, list.slice(-RECENT_MAX));
  save(RECENT_KEY, Object.fromEntries(recent));
}

const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Sons bruts (Deezer) du thème choisi. */
async function rawTracks(settings, guildId) {
  const theme = THEMES[settings.theme] ?? THEMES.moment;
  if (settings.theme === 'server') return { tracks: await popularTracks(guildId, 80), fromDeezer: false };
  if (settings.theme === 'custom') {
    const query = settings.customTheme?.trim() || 'rap fr';
    const playlist = await deezer.searchPlaylist(query).catch(() => null);
    let items = playlist ? await playlistTracks(playlist.id) : [];
    if (items.length < 30) items = [...items, ...rankResults(query, await deezer.search(query, 100).catch(() => []))];
    if (items.length < 10) {
      const generated = await aiPlaylist(query, 25).catch(() => null);
      return { tracks: generated?.tracks ?? [], fromDeezer: false };
    }
    return { tracks: items, fromDeezer: true };
  }
  const lists = await Promise.all(theme.playlists.map(playlistTracks));
  return { tracks: lists.flat(), fromDeezer: true };
}

/**
 * Construit la liste des sons d'une partie : dédoublonnée, filtrée par popularité selon la difficulté,
 * variée (pas trop de sons du même artiste), vérifiée (année de sortie, ISRC), sans les sons des dernières parties.
 * @param {{ theme: string, customTheme?: string, difficulty: string, mode?: string, rounds: number }} settings
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function buildPool(settings, guildId, onProgress = () => {}) {
  const theme = THEMES[settings.theme] ?? THEMES.moment;
  const level = DIFFICULTIES[settings.difficulty] ?? DIFFICULTIES.normal;
  // Sons de secours (son illisible, pas de paroles en mode Paroles...)
  const wanted = settings.rounds + (settings.mode === 'paroles' ? 12 : 6);
  if (theme.works || IMAGE_MODES.has(settings.mode)) return buildWorksPool(settings, theme, guildId, wanted, onProgress);
  const { tracks: raw, fromDeezer } = await rawTracks(settings, guildId);
  const played = await recentFor(guildId);
  const perArtist = new Map();
  let artistLimit = level.maxPerArtist ?? 3;
  const artistOk = (name) => (perArtist.get(normalize(name)) ?? 0) < artistLimit;
  const countArtist = (name) => perArtist.set(normalize(name), (perArtist.get(normalize(name)) ?? 0) + 1);

  if (!fromDeezer) {
    const seen = new Set();
    return shuffle(raw).filter((track) => {
      const key = songKey(track);
      if (!track.title || !track.artist || seen.has(key) || !artistOk(track.artist)) return false;
      if (settings.mode === 'annee' && !track.year) return false;
      seen.add(key);
      countArtist(track.artist);
      return true;
    }).slice(0, wanted);
  }

  // Doublons (même son sur plusieurs playlists, versions différentes) enlevés, du plus connu au moins connu
  const seen = new Set();
  const unique = raw
    .filter((item) => item?.id && item.readable !== false && item.title && item.artist?.name && !BAD_TITLE.test(item.title) && !isVariant(item))
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .filter((item) => {
      const key = songKey({ title: item.title, artist: item.artist.name });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  // Les sons joués lors des dernières parties passent en dernier : chaque partie est différente
  const isFresh = (item) => !played.has(songKey({ title: item.title, artist: item.artist.name }));
  const freshUnique = unique.filter(isFresh);
  const base = freshUnique.length >= wanted * 2 ? freshUnique : unique;
  let candidates = base.filter((item) => (item.rank ?? 0) >= level.minRank).slice(0, level.top);
  // Pas assez de sons assez connus : on élargit
  if (candidates.length < wanted * 2) candidates = base.slice(0, Math.max(level.top, wanted * 3));
  const ordered = shuffle(candidates);

  // Vérification un par un (par petits paquets) jusqu'à avoir assez de sons valides.
  // Pas assez (vieux sons moins écoutés aujourd'hui...) : on élargit petit à petit.
  const pool = [];
  const checked = new Set();
  const [minYear, maxYear] = settings.theme === 'custom' ? [0, 9999] : theme.years ?? [0, 9999];
  const french = theme.french ? await frenchArtists() : null;
  const passes = [
    { list: ordered, limit: level.maxPerArtist ?? 3 },
    { list: shuffle(base.slice(0, Math.max(level.top * 3, wanted * 4))), limit: (level.maxPerArtist ?? 3) + 1 },
    { list: shuffle(unique), limit: 4 },
  ];
  for (const pass of passes) {
    if (pool.length >= wanted) break;
    artistLimit = pass.limit;
    const todo = pass.list.filter((item) => !checked.has(item.id));
    for (let i = 0; i < todo.length && pool.length < wanted; i += 4) {
      const batch = await Promise.all(todo.slice(i, i + 4).map(async (item) => ({ item, details: await trackDetails(item.id) })));
      for (const { item, details } of batch) {
        if (pool.length >= wanted || !details || !artistOk(item.artist.name)) continue;
        checked.add(item.id);
        const year = yearOf(details);
        if (year && (year < minYear || year > maxYear)) continue;
        if (settings.mode === 'annee' && !year) continue;
        // Thèmes rap FR : artiste connu du rap français ou son enregistré en France / Belgique / Suisse
        if (french && !french.has(normalize(item.artist.name)) && !FRENCH_ISRC.has(details.isrc?.slice(0, 2))) continue;
        countArtist(item.artist.name);
        pool.push({
          ...trackFromDeezer({ ...item, album: details.album ?? item.album }),
          isrc: details.isrc ?? null,
          contributors: (details.contributors ?? []).map((c) => c.name),
          year,
          duration: details.duration ?? item.duration ?? 0,
          deezerUrl: details.link ?? `https://www.deezer.com/track/${item.id}`,
        });
      }
      onProgress(pool.length, wanted);
    }
  }
  return pool;
}

/**
 * Partie « œuvres » (films, séries, animés, jeux) : la musique de l'œuvre, ou une image en mode Images.
 * Les œuvres des dernières parties passent en dernier.
 */
async function buildWorksPool(settings, theme, guildId, wanted, onProgress) {
  const played = await recentFor(guildId);
  const categories = theme.works && theme.works !== 'all' ? [theme.works] : Object.keys(WORK_CATEGORIES);
  const imageOnly = SILENT_MODES.has(settings.mode);
  // Image seule : pas d'effets sonores (même image que la musique du jeu). Chaque œuvre une seule fois par partie.
  const seenWorks = new Set();
  const entries = shuffle(worksOf(categories, { sounds: !imageOnly })).filter((entry) => {
    const name = normalize(entry.work);
    if (seenWorks.has(name)) return false;
    seenWorks.add(name);
    return true;
  });
  const chosen = [...entries.filter((e) => !played.has(workKey(e))), ...entries.filter((e) => played.has(workKey(e)))].slice(0, wanted);
  if (imageOnly) {
    return chosen.map((entry) => ({ ...entry, title: entry.work, artist: WORK_CATEGORIES[entry.category].label, visual: true, requestedBy: 'blindtest' }));
  }
  const pool = [];
  for (let i = 0; i < chosen.length; i += 6) {
    const batch = await Promise.all(chosen.slice(i, i + 6).map((entry) => resolveWorkSong(entry).catch(() => null)));
    pool.push(...batch.filter(Boolean));
    onProgress(pool.length, chosen.length);
  }
  return pool;
}

/** Deux lignes des paroles qui ne donnent pas directement le titre ni l'artiste (mode Paroles). */
export async function lyricsExcerpt(track) {
  const found = await findLyrics({ title: track.title, artist: track.artist, duration: track.duration, source: 'deezer' }).catch(() => null);
  const lines = (found?.plainLyrics ?? '').split('\n').map((line) => line.trim()).filter((line) => line && !/^[[(].*[\])]$/.test(line));
  const hidden = [...tokens(cleanTitle(track.title)), ...tokens(track.artist)].filter((word) => word.length >= 3);
  const usable = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const words = tokens(`${lines[i]} ${lines[i + 1]}`);
    if (words.length < 8 || words.length > 30) continue;
    if (hidden.some((word) => words.includes(word))) continue;
    usable.push(`${lines[i]}\n${lines[i + 1]}`);
  }
  if (!usable.length) return null;
  // Évite le tout début et la toute fin (souvent l'intro et l'outro)
  return usable[Math.floor(usable.length * (0.2 + Math.random() * 0.6))] ?? usable[0];
}

/** Paroles synchronisées lrclib : « [01:23.45] texte » -> [{ time: 83.45, text }] (une ligne peut avoir plusieurs temps). */
export function parseSyncedLyrics(synced = '') {
  const lines = [];
  for (const raw of String(synced).split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!stamps.length || !text) continue;
    for (const [, min, sec] of stamps) lines.push({ time: Number(min) * 60 + Number(sec), text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

// Les « (ouais) », « [Refrain] »… ne font pas partie de la phrase à deviner
export const lyricWords = (text) => tokens(String(text).replace(/\([^)]*\)|\[[^\]]*\]/g, ' '));

/**
 * Mode Suite des paroles : un moment du son où il se coupe juste avant une phrase.
 * Facile = une phrase du refrain (elle revient souvent), difficile = une phrase des couplets.
 * @returns {Promise<null | { seek: number, cutAt: number, before: string[], answer: string }>}
 */
export async function lyricsCut(track, difficulty = 'normal') {
  const found = await findLyrics({ title: track.title, artist: track.artist, duration: track.duration, source: 'deezer' }).catch(() => null);
  const lines = parseSyncedLyrics(found?.syncedLyrics);
  if (lines.length < 8) return null;
  const counts = new Map();
  for (const line of lines) counts.set(normalize(line.text), (counts.get(normalize(line.text)) ?? 0) + 1);
  const end = (track.duration || lines.at(-1).time + 10) - 12;
  const candidates = [];
  for (let i = 2; i < lines.length; i++) {
    const words = lyricWords(lines[i].text);
    if (words.length < 4 || words.length > 14) continue;
    if (lines[i].time < 18 || lines[i].time > end) continue;
    // Deux phrases d'avant pour se repérer, sans trop attendre
    if (lines[i].time - lines[i - 2].time > 16 || lines[i].time - lines[i - 1].time < 1.2) continue;
    // La même phrase juste avant : trop facile
    if (normalize(lines[i].text) === normalize(lines[i - 1].text)) continue;
    candidates.push({ i, chorus: counts.get(normalize(lines[i].text)) >= 2 });
  }
  if (!candidates.length) return null;
  let pool = candidates;
  if (['tresfacile', 'facile'].includes(difficulty) && candidates.some((c) => c.chorus)) pool = candidates.filter((c) => c.chorus);
  if (['difficile', 'expert'].includes(difficulty) && candidates.some((c) => !c.chorus)) pool = candidates.filter((c) => !c.chorus);
  const { i } = pool[Math.floor(Math.random() * pool.length)];
  return {
    seek: Math.max(0, Math.floor(lines[i - 2].time - 1.5)),
    cutAt: lines[i].time,
    before: [lines[i - 2].text, lines[i - 1].text],
    answer: lines[i].text,
  };
}
