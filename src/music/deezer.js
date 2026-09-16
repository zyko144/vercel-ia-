// API publique Deezer (sans clé) : recherche, popularité, pochettes, charts, radios d'artiste.
const API = 'https://api.deezer.com';

async function call(pathOrUrl) {
  const res = await fetch(pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`, { signal: AbortSignal.timeout(8_000) });
  const data = await res.json();
  if (data?.error) throw new Error(`Deezer : ${data.error.message ?? 'erreur'}`);
  return data;
}

/** Récupère toutes les pages d'une liste (playlists et albums complets, sans limite). */
async function allPages(pathname) {
  const items = [];
  let next = `${pathname}?limit=100&index=0`;
  for (let page = 0; next && page < 100; page++) {
    const data = await call(next);
    items.push(...(data.data ?? []));
    next = data.next ?? null;
  }
  return items;
}

export const deezer = {
  search: (query, limit = 25) => call(`/search?limit=${limit}&q=${encodeURIComponent(query)}`).then((r) => r.data ?? []),
  track: (id) => call(`/track/${id}`),
  album: (id) => call(`/album/${id}`),
  albumTracks: (id) => allPages(`/album/${id}/tracks`),
  playlist: (id) => call(`/playlist/${id}`),
  playlistTracks: (id) => allPages(`/playlist/${id}/tracks`),
  artistRadio: (id) => call(`/artist/${id}/radio?limit=40`).then((r) => r.data ?? []),
  // Playlist publique qui colle le mieux au thème (la plus fournie)
  searchPlaylist: (query) => call(`/search/playlist?limit=5&q=${encodeURIComponent(query)}`)
    .then((r) => (r.data ?? []).sort((a, b) => (b.nb_tracks ?? 0) - (a.nb_tracks ?? 0))[0] ?? null),
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
    || (token.length >= 3 && similarity(token, word) >= (token.length >= 5 ? 0.65 : 0.7)) // mots longs : 2 fautes tolérées
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

/**
 * Recherche tolérante aux fautes : parmi les résultats qui ressemblent à ce qui est tapé,
 * on prend le plus connu (Deezer classe déjà par popularité à l'intérieur de chaque niveau).
 */
export async function popularMatch(query, minRatio = 0.5) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  const close = (track) => {
    const ratio = matchRatio(query, trackText(track));
    // Au moins deux mots retrouvés dès que la recherche en contient plusieurs (sinon c'est du hasard)
    return ratio >= minRatio && (tokens.length < 2 || ratio * tokens.length >= 2);
  };
  const pick = (list) => rankResults(query, list).find(close) ?? null;

  const direct = pick(await deezer.search(query, 25).catch(() => []));
  if (direct) return direct;

  // Recherche vide (trop de fautes d'un coup) : on retente mot par mot, l'artiste est souvent bien écrit
  for (const token of normalize(query).split(' ').filter((t) => t.length >= 4).slice(0, 3)) {
    const match = pick(await deezer.search(token, 25).catch(() => []));
    if (match) return match;
  }
  return null;
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
