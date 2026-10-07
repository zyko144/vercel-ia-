// Paroles via lrclib.net (gratuit, sans clé).
const API = 'https://lrclib.net/api';
const HEADERS = { 'User-Agent': 'AI-Vercel-Discord-Bot (https://github.com/zyko144/vercel-ia-)' };

function cleanTitle(title = '') {
  return title
    .replace(/\s*[([](?:feat|ft|with|prod|official|clip|lyrics?|paroles?|audio|video|visuali[sz]er|remaster|live)[^)\]]*[)\]]/gi, '')
    .replace(/\s*-\s*(?:official|clip|lyrics?|audio|remaster).*$/i, '')
    .trim();
}

function splitArtistTitle(track) {
  // Vidéos YouTube "Artiste - Titre"
  const match = track.title.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (match && (!track.artist || track.source === 'youtube')) return { artist: match[1], title: match[2] };
  return { artist: track.artist ?? '', title: track.title };
}

export async function findLyrics(track) {
  const { artist, title } = splitArtistTitle(track);
  const cleanName = cleanTitle(title);
  const mainArtist = artist.split(/,|&| feat\.? | ft\.? | x /i)[0].trim();

  const params = new URLSearchParams({ track_name: cleanName, artist_name: mainArtist });
  if (track.duration) params.set('duration', String(track.duration));
  const exact = await fetch(`${API}/get?${params}`, { headers: HEADERS, signal: AbortSignal.timeout(6_000) })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (exact?.plainLyrics) return exact;

  const results = await fetch(`${API}/search?q=${encodeURIComponent(`${mainArtist} ${cleanName}`)}`, { headers: HEADERS, signal: AbortSignal.timeout(6_000) })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return results.find((r) => r.plainLyrics) ?? null;
}
