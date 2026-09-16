// Statistiques d'écoute du serveur : top sons, top artistes, top par membre, récap du mois.
import { load, save } from '../storage.js';

const KEY = 'music-stats';
const MAX_TRACKS = 400;
const MAX_ARTISTS = 300;
const MAX_MONTHS = 6;

const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);
const keyOf = (track) => `${(track.title ?? '').toLowerCase()}|${(track.artist ?? '').toLowerCase()}`.slice(0, 150);
const emptyScope = () => ({ tracks: {}, artists: {}, users: {} });

/** Garde seulement les entrées les plus écoutées pour ne pas gonfler le stockage. */
function prune(scope) {
  const trim = (object, max, value) => {
    const keys = Object.keys(object);
    if (keys.length <= max) return;
    keys.sort((a, b) => value(object[b]) - value(object[a]));
    for (const key of keys.slice(max)) delete object[key];
  };
  trim(scope.tracks, MAX_TRACKS, (t) => t.plays);
  trim(scope.artists, MAX_ARTISTS, (n) => n);
}

/** Enregistre un son écouté (appelé quand le son se termine ou qu'on passe au suivant). */
export async function recordPlay(guildId, track, seconds = 0) {
  if (!track?.title) return;
  const all = await load(KEY, {});
  const guild = (all[guildId] ??= { all: emptyScope(), months: {} });
  const month = (guild.months[monthKey()] ??= emptyScope());
  const listened = Math.max(0, Math.round(seconds));
  const userId = track.requestedBy && !['autoplay', 'blindtest', 'radio'].includes(track.requestedBy) ? track.requestedBy : null;

  for (const scope of [guild.all, month]) {
    const entry = (scope.tracks[keyOf(track)] ??= {
      title: track.title, artist: track.artist ?? null, url: track.url ?? null, thumbnail: track.thumbnail ?? null, plays: 0, seconds: 0,
    });
    entry.plays++;
    entry.seconds += listened;
    entry.url ??= track.url ?? null;
    entry.thumbnail ??= track.thumbnail ?? null;

    if (track.artist) scope.artists[track.artist] = (scope.artists[track.artist] ?? 0) + 1;
    if (userId) {
      const user = (scope.users[userId] ??= { plays: 0, seconds: 0, tracks: {}, artists: {} });
      user.plays++;
      user.seconds += listened;
      user.tracks[keyOf(track)] = (user.tracks[keyOf(track)] ?? 0) + 1;
      if (track.artist) user.artists[track.artist] = (user.artists[track.artist] ?? 0) + 1;
      if (Object.keys(user.tracks).length > 200) {
        const worst = Object.entries(user.tracks).sort((a, b) => a[1] - b[1])[0];
        delete user.tracks[worst[0]];
      }
    }
    prune(scope);
  }

  const months = Object.keys(guild.months).sort();
  while (months.length > MAX_MONTHS) delete guild.months[months.shift()];
  save(KEY, all);
}

const sortEntries = (object, take) => Object.entries(object).sort((a, b) => b[1] - a[1]).slice(0, take);

/**
 * Classements.
 * @param {{ period?: 'all'|'month', userId?: string|null, limit?: number }} options
 */
export async function musicStats(guildId, { period = 'all', userId = null, limit = 10 } = {}) {
  const guild = (await load(KEY, {}))[guildId];
  const scope = period === 'month' ? guild?.months?.[monthKey()] : guild?.all;
  if (!scope) return null;

  if (userId) {
    const user = scope.users[userId];
    if (!user) return null;
    const tracks = sortEntries(user.tracks ?? {}, limit)
      .map(([key, plays]) => ({ ...(scope.tracks[key] ?? { title: key.split('|')[0] }), plays }));
    return {
      tracks,
      artists: sortEntries(user.artists ?? {}, 5),
      totalPlays: user.plays,
      totalSeconds: user.seconds,
      listeners: null,
    };
  }

  const tracks = sortEntries(Object.fromEntries(Object.entries(scope.tracks).map(([k, v]) => [k, v.plays])), limit)
    .map(([key, plays]) => ({ ...scope.tracks[key], plays }));
  return {
    tracks,
    artists: sortEntries(scope.artists, 5),
    totalPlays: Object.values(scope.tracks).reduce((sum, t) => sum + t.plays, 0),
    totalSeconds: Object.values(scope.tracks).reduce((sum, t) => sum + t.seconds, 0),
    listeners: sortEntries(Object.fromEntries(Object.entries(scope.users).map(([id, u]) => [id, u.plays])), 5),
  };
}

/** Sons les plus écoutés du serveur : sert de réserve pour le blind test. */
export async function popularTracks(guildId, limit = 40) {
  const guild = (await load(KEY, {}))[guildId];
  if (!guild) return [];
  return Object.values(guild.all.tracks)
    .filter((t) => t.title && t.artist)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, limit)
    .map((t) => ({ title: t.title, artist: t.artist, thumbnail: t.thumbnail, url: t.url, duration: 0, source: 'deezer', query: `${t.artist} ${t.title}` }));
}
