// Liens Spotify sans clé API : on lit les infos de la page "embed" publique (titres, artistes, pochettes).
// Spotify ne fournit pas l'audio : chaque son est ensuite retrouvé sur YouTube.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
};

export function parseSpotifyUrl(input) {
  const match = input.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|artist)\/([A-Za-z0-9]+)/i)
    ?? input.match(/^spotify:(track|album|playlist|artist):([A-Za-z0-9]+)$/i);
  return match ? { type: match[1].toLowerCase(), id: match[2] } : null;
}

export async function spotifyEntity(type, id) {
  const res = await fetch(`https://open.spotify.com/embed/${type}/${id}`, { headers: HEADERS, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`Spotify ${res.status}`);
  const html = await res.text();
  const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s)?.[1];
  const entity = json && JSON.parse(json)?.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error('lien Spotify introuvable ou privé');
  return entity;
}

export function biggestImage(images = []) {
  return [...images].sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0))[0]?.url ?? null;
}

/** Transforme un lien Spotify (son, album, playlist, artiste) en liste de sons. */
export async function spotifyTracks(url) {
  const parsed = parseSpotifyUrl(url);
  if (!parsed) return null;
  const entity = await spotifyEntity(parsed.type, parsed.id);
  const cover = biggestImage(entity.visualIdentity?.image ?? entity.coverArt?.sources);

  if (parsed.type === 'track') {
    const artist = entity.artists?.map((a) => a.name).join(', ') ?? null;
    return {
      name: entity.name,
      tracks: [{
        title: entity.name,
        artist,
        duration: Math.round((entity.duration ?? 0) / 1000),
        thumbnail: cover,
        url: `https://open.spotify.com/track/${parsed.id}`,
        source: 'spotify',
        spotifyId: parsed.id,
        query: `${artist ?? ''} ${entity.name}`.trim(),
      }],
    };
  }

  const tracks = (entity.trackList ?? [])
    .filter((item) => item.isPlayable !== false && item.uri?.startsWith('spotify:track:'))
    .map((item) => {
      const trackId = item.uri.split(':').pop();
      const artist = item.subtitle || (parsed.type === 'artist' ? entity.name : null);
      return {
        title: item.title,
        artist,
        duration: Math.round((item.duration ?? 0) / 1000),
        thumbnail: parsed.type === 'album' ? cover : null, // pochette récupérée au moment de jouer
        url: `https://open.spotify.com/track/${trackId}`,
        source: 'spotify',
        spotifyId: trackId,
        query: `${artist ?? ''} ${item.title}`.trim(),
      };
    });

  return { name: entity.name ?? entity.title, cover, tracks };
}
