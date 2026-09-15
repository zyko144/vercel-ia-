// Liens Apple Music sans clé : API iTunes pour les sons et albums, données de la page pour les playlists.
// Apple ne fournit pas l'audio : chaque son est ensuite retrouvé sur YouTube.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
};

export function parseAppleUrl(input) {
  const match = input.match(/music\.apple\.com\/([a-z]{2})\/(album|playlist|song)\/(?:[^/]+\/)?([\w.-]+)/i);
  if (!match) return null;
  const trackId = input.match(/[?&]i=(\d+)/)?.[1];
  return { country: match[1], type: trackId ? 'song' : match[2].toLowerCase(), id: trackId ?? match[3] };
}

const artwork = (url, size = 600) => url?.replace(/\{w\}x\{h\}(bb)?(\.\{f\}|\.\w+)?/, `${size}x${size}bb.jpg`)
  .replace(/\/\d+x\d+bb\.(jpg|png|webp)$/, `/${size}x${size}bb.jpg`) ?? null;

function fromItunes(item) {
  return {
    title: item.trackName,
    artist: item.artistName,
    duration: Math.round((item.trackTimeMillis ?? 0) / 1000),
    thumbnail: artwork(item.artworkUrl100),
    url: item.trackViewUrl?.replace(/[?&]uo=\d+/, '') ?? null,
    source: 'apple',
    query: `${item.artistName} ${item.trackName}`,
  };
}

async function lookup(id, country, entity) {
  const params = new URLSearchParams({ id, country, limit: '500', ...(entity ? { entity } : {}) });
  const res = await fetch(`https://itunes.apple.com/lookup?${params}`, { signal: AbortSignal.timeout(8_000) });
  return (await res.json()).results ?? [];
}

async function playlistFromPage(url) {
  const html = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) }).then((r) => r.text());
  const json = html.match(/<script type="application\/json" id="serialized-server-data">(.+?)<\/script>/s)?.[1];
  if (!json) throw new Error('playlist Apple Music introuvable ou privée');

  const items = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.id === 'string' && node.id.startsWith('track-lockup') && node.title) items.push(node);
    else for (const value of Object.values(node)) walk(value);
  };
  walk(JSON.parse(json));

  const name = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1]?.replace(/ sur Apple Music$| on Apple Music$/, '') ?? 'Playlist Apple Music';
  const cover = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null;
  const tracks = items.map((item) => ({
    title: item.title,
    artist: item.artistName ?? null,
    duration: Math.round((item.duration ?? 0) / 1000),
    thumbnail: artwork(item.artwork?.dictionary?.url) ?? cover,
    url: url.split('?')[0],
    source: 'apple',
    query: `${item.artistName ?? ''} ${item.title}`.trim(),
  }));
  return { name, cover, tracks };
}

/** Transforme un lien Apple Music (son, album, playlist) en liste de sons. */
export async function appleTracks(url) {
  const parsed = parseAppleUrl(url);
  if (!parsed) return null;

  if (parsed.type === 'song') {
    const [item] = await lookup(parsed.id, parsed.country);
    if (!item) throw new Error('son Apple Music introuvable');
    return { name: item.trackName, tracks: [fromItunes(item)] };
  }
  if (parsed.type === 'album') {
    const results = await lookup(parsed.id, parsed.country, 'song');
    const album = results.find((r) => r.wrapperType === 'collection');
    return {
      name: album?.collectionName ?? 'Album Apple Music',
      cover: artwork(album?.artworkUrl100),
      tracks: results.filter((r) => r.wrapperType === 'track').map(fromItunes),
    };
  }
  return playlistFromPage(url);
}
