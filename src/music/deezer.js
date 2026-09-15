// API publique Deezer (sans clé) : recherche, popularité, pochettes, charts, radios d'artiste.
const API = 'https://api.deezer.com';

async function call(pathname) {
  const res = await fetch(`${API}${pathname}`, { signal: AbortSignal.timeout(5_000) });
  const data = await res.json();
  if (data?.error) throw new Error(`Deezer : ${data.error.message ?? 'erreur'}`);
  return data;
}

export const deezer = {
  search: (query, limit = 25) => call(`/search?limit=${limit}&q=${encodeURIComponent(query)}`).then((r) => r.data ?? []),
  track: (id) => call(`/track/${id}`),
  album: (id) => call(`/album/${id}`),
  albumTracks: (id) => call(`/album/${id}/tracks?limit=200`).then((r) => r.data ?? []),
  playlist: (id) => call(`/playlist/${id}`),
  playlistTracks: (id) => call(`/playlist/${id}/tracks?limit=200`).then((r) => r.data ?? []),
  artistRadio: (id) => call(`/artist/${id}/radio?limit=40`).then((r) => r.data ?? []),
  chart: () => call('/chart/0/tracks?limit=25').then((r) => r.data ?? []),
};

const normalize = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const baseTitle = (title) => normalize(title.replace(/\s*[([].*?[)\]]\s*/g, ' '));

/** Ressemblance entre deux mots (0 à 1), pour accepter les fautes de frappe. */
function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

/** Part des mots tapés retrouvés dans le son (début de mot, ou mot proche malgré une faute). */
export function matchRatio(query, text) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return 0;
  const haystack = normalize(text);
  const words = haystack.split(' ');
  const found = tokens.filter((token) => words.some((word) => word.startsWith(token)
    || (token.length >= 3 && similarity(token, word) >= 0.7)
    || (token.length >= 4 && similarity(token, word.slice(0, token.length)) >= 0.75))
    || (token.length >= 4 && haystack.includes(token)));
  return found.length / tokens.length;
}

const trackText = (track) => `${track.title} ${track.artist?.name ?? ''}`;

/**
 * Classe les résultats : d'abord ceux qui correspondent à tous les mots tapés (fautes comprises),
 * puis du plus connu au moins connu. Les doublons (même titre + même artiste) sont retirés.
 */
export function rankResults(query, results) {
  const seen = new Set();
  return results
    .map((track) => {
      const ratio = matchRatio(query, trackText(track));
      return { track, tier: ratio === 1 ? 0 : ratio > 0 ? 1 : 2 };
    })
    .sort((a, b) => a.tier - b.tier || (b.track.rank ?? 0) - (a.track.rank ?? 0))
    .map(({ track }) => track)
    .filter((track) => {
      const key = `${baseTitle(track.title)}|${normalize(track.artist?.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Meilleur son pour une recherche texte : il doit correspondre à tous les mots tapés, sinon null. */
export async function bestMatch(query) {
  const results = await deezer.search(query, 25).catch(() => []);
  const top = rankResults(query, results)[0];
  return top && matchRatio(query, trackText(top)) === 1 ? top : null;
}

export function trackFromDeezer(item, { cover } = {}) {
  return {
    title: item.title,
    artist: item.artist?.name ?? null,
    duration: item.duration ?? 0,
    thumbnail: item.album?.cover_xl ?? item.album?.cover_big ?? cover ?? null,
    url: null, // rempli avec le lien YouTube quand le son est trouvé
    source: 'deezer',
    deezerId: item.id,
    artistId: item.artist?.id ?? null,
    query: `${item.artist?.name ?? ''} ${item.title}`.trim(),
  };
}
