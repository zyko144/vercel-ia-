// Réserves de sons du blind test : thèmes (sons du moment, rap FR par année...), niveaux, modes de jeu,
// sons vérifiés un par un (année de sortie + code ISRC pour jouer exactement le bon morceau).
import { load, save } from '../storage.js';
import { deezer, rankResults, trackFromDeezer } from './deezer.js';
import { findLyrics } from './lyrics.js';
import { aiPlaylist } from './sources.js';
import { popularTracks } from './stats.js';

// Playlists Deezer (éditoriales pour la plupart) qui servent de base à chaque thème
const PL = {
  actuRap: 1071669561, rapstars: 3272614282, hitsDeRue: 1701025601, tasCapte: 13134487943, certifie: 3830830902,
  rap2026: 1140276541, best2025: 14478423703, rapstars2020: 9563400362, best2024: 13154564983, mega2024: 12251400891,
  best2023: 3525945442, rap2324: 12317765831, skyrock2022: 10704136442, ete2022: 10302916242,
  topFrance: 1109890291, topFrance2025: 14591586961, hits2024: 13200756823,
};

// Playlists 100 % rap français : leurs artistes servent à écarter les sons étrangers des playlists mélangées
// (« Certifié » et les mix Filtr contiennent aussi des tubes étrangers, ils ne comptent pas ici)
const FRENCH_RAP_PLAYLISTS = [PL.actuRap, PL.rapstars, PL.hitsDeRue, PL.tasCapte, PL.best2025, PL.best2024, PL.best2023, PL.rapstars2020, PL.rap2324];
const FRENCH_ISRC = new Set(['FR', 'BE', 'CH', 'LU', 'MC']);
// Titres qui ne disent rien en blind test, ou versions qui ne ressemblent pas au son connu (live, remix, émission TV...)
const BAD_TITLE = /\b(intro|outro|interlude|skit|freestyle|live|session|colors show|acoustique|acoustic|remix|instrumental|sped up|slowed|nouvelle [ée]cole)\b/i;

export const THEMES = {
  moment: { label: 'Sons du moment (2025-2026)', emoji: '🔥', french: true, years: [2025, 2026], playlists: [PL.actuRap, PL.rapstars, PL.hitsDeRue, PL.tasCapte, PL.best2025, PL.rap2026] },
  recent: { label: 'Rap FR récent (2022 → 2026)', emoji: '🎧', french: true, years: [2022, 2026], playlists: [PL.actuRap, PL.rapstars, PL.hitsDeRue, PL.certifie, PL.best2025, PL.best2024, PL.best2023, PL.rapstars2020, PL.skyrock2022] },
  y2026: { label: 'Rap FR 2026', emoji: '🆕', french: true, years: [2026, 2026], playlists: [PL.actuRap, PL.rapstars, PL.hitsDeRue, PL.tasCapte, PL.certifie, PL.rap2026] },
  y2025: { label: 'Rap FR 2025', emoji: '💿', french: true, years: [2025, 2025], playlists: [PL.best2025, PL.rapstars2020, PL.certifie, PL.hitsDeRue, PL.rap2026] },
  y2024: { label: 'Rap FR 2024', emoji: '💿', french: true, years: [2024, 2024], playlists: [PL.best2024, PL.mega2024, PL.rapstars2020, PL.rap2324] },
  y2023: { label: 'Rap FR 2023', emoji: '💿', french: true, years: [2023, 2023], playlists: [PL.best2023, PL.rap2324, PL.rapstars2020, PL.mega2024] },
  y2022: { label: 'Rap FR 2022', emoji: '💿', french: true, years: [2022, 2022], playlists: [PL.skyrock2022, PL.ete2022, PL.rapstars2020] },
  hits: { label: 'Hits France du moment', emoji: '🇫🇷', years: [2023, 2026], playlists: [PL.topFrance, PL.topFrance2025, PL.hits2024] },
  server: { label: 'Sons du serveur', emoji: '🏠' },
  custom: { label: 'Thème perso', emoji: '✏️' },
};

export const DIFFICULTIES = {
  tresfacile: { label: 'Très facile', emoji: '🍼', color: 0x5865f2, snippet: 30, minRank: 900_000, top: 45, maxPerArtist: 1, start: [0.3, 0.42], hintAt: 0.25, speedBonus: 0.35, desc: 'Les plus gros sons du moment · 30 s · indices' },
  facile: { label: 'Facile', emoji: '🟢', color: 0x57f287, snippet: 30, minRank: 800_000, top: 70, maxPerArtist: 2, start: [0.3, 0.42], hintAt: 0.35, speedBonus: 0.35, desc: 'Sons très connus · 30 s · refrain · indices' },
  normal: { label: 'Normal', emoji: '🟡', color: 0xfee75c, snippet: 20, minRank: 650_000, top: 120, maxPerArtist: 2, start: [0.25, 0.45], hintAt: 0.6, speedBonus: 0.35, desc: 'Sons connus · 20 s · un indice' },
  difficile: { label: 'Difficile', emoji: '🔴', color: 0xed4245, snippet: 12, minRank: 450_000, top: 250, maxPerArtist: 3, start: [0.12, 0.6], hintAt: null, speedBonus: 0.35, desc: "Moins connus · 12 s · pas d'indice" },
  expert: { label: 'Expert', emoji: '💀', color: 0x2b2d31, snippet: 6, minRank: 300_000, top: 400, maxPerArtist: 3, start: [0.05, 0.7], hintAt: null, speedBonus: 0.5, desc: "6 s seulement · n'importe où dans le son" },
};

export const MODES = {
  classique: { label: 'Classique', emoji: '🎯', desc: 'Titre +2 · artiste +1 · rapidité +1' },
  titre: { label: 'Titre seulement', emoji: '🎵', desc: 'Seul le titre compte' },
  artiste: { label: 'Artiste seulement', emoji: '🎤', desc: 'Trouve qui chante' },
  intro: { label: 'Intro', emoji: '🎬', desc: 'Les toutes premières secondes du son' },
  eclair: { label: 'Éclair', emoji: '⚡', desc: '3 secondes de son, pas une de plus', snippet: 3 },
  accelere: { label: 'Accéléré', emoji: '🐿️', desc: 'Le son passe en accéléré', filter: 'nightcore' },
  ralenti: { label: 'Ralenti', emoji: '🐌', desc: 'Le son passe au ralenti', filter: 'slowed' },
  sansvoix: { label: 'Voix cachée', emoji: '🎙️', desc: 'La voix est presque effacée', filter: 'karaoke' },
  annee: { label: 'Année', emoji: '📅', desc: "Devine l'année de sortie" },
  paroles: { label: 'Paroles', emoji: '📝', desc: 'Pas de son : devine avec les paroles' },
  premier10: { label: 'Premier à 10', emoji: '👑', desc: 'Le premier à 10 points gagne' },
  unessai: { label: 'Un seul essai', emoji: '🎲', desc: 'Une seule réponse par manche' },
};

const PLAYLIST_CACHE_MS = 3 * 60 * 60_000;
const DETAILS_CACHE_MS = 24 * 60 * 60_000;
const RECENT_KEY = 'blindtest-recent';
const RECENT_MAX = 250;
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
  const list = (recent.get(guildId) ?? []).filter((key) => key !== songKey(track));
  list.push(songKey(track));
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
  const { tracks: raw, fromDeezer } = await rawTracks(settings, guildId);
  const played = await recentFor(guildId);
  const perArtist = new Map();
  const artistOk = (name) => (perArtist.get(normalize(name)) ?? 0) < (level.maxPerArtist ?? 3);
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
    .filter((item) => item?.id && item.readable !== false && item.title && item.artist?.name && !BAD_TITLE.test(item.title))
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .filter((item) => {
      const key = songKey({ title: item.title, artist: item.artist.name });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  let candidates = unique.filter((item) => (item.rank ?? 0) >= level.minRank).slice(0, level.top);
  // Pas assez de sons assez connus : on élargit
  if (candidates.length < wanted * 2) candidates = unique.slice(0, Math.max(level.top, wanted * 3));
  const fresh = candidates.filter((item) => !played.has(songKey({ title: item.title, artist: item.artist.name })));
  const ordered = shuffle(fresh.length >= wanted ? fresh : candidates);

  // Vérification un par un (par petits paquets) jusqu'à avoir assez de sons valides
  const pool = [];
  const [minYear, maxYear] = settings.theme === 'custom' ? [0, 9999] : theme.years;
  const french = theme.french ? await frenchArtists() : null;
  for (let i = 0; i < ordered.length && pool.length < wanted; i += 8) {
    const batch = await Promise.all(ordered.slice(i, i + 8).map(async (item) => ({ item, details: await trackDetails(item.id) })));
    for (const { item, details } of batch) {
      if (pool.length >= wanted || !details || !artistOk(item.artist.name)) continue;
      const year = yearOf(details);
      if (year && (year < minYear || year > maxYear)) continue;
      if (settings.mode === 'annee' && !year) continue;
      // Thèmes rap FR : artiste connu du rap français ou son enregistré en France / Belgique / Suisse
      if (french && !french.has(normalize(item.artist.name)) && !FRENCH_ISRC.has(details.isrc?.slice(0, 2))) continue;
      countArtist(item.artist.name);
      pool.push({
        ...trackFromDeezer({ ...item, album: details.album ?? item.album }),
        isrc: details.isrc ?? null,
        year,
        duration: details.duration ?? item.duration ?? 0,
        deezerUrl: details.link ?? `https://www.deezer.com/track/${item.id}`,
      });
    }
    onProgress(pool.length, wanted);
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
