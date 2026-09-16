// Transforme ce que tape le membre (nom, lien Spotify / Apple Music / YouTube / SoundCloud / Deezer) en sons jouables.
import { chatJson } from '../ai/gemini.js';
import { appleTracks, parseAppleUrl } from './apple.js';
import { bestMatch, deezer, matchRatio, popularMatch, trackFromDeezer } from './deezer.js';
import { biggestImage, parseSpotifyUrl, spotifyEntity, spotifyTracks } from './spotify.js';
import { lavalink } from './lavalink.js';
import { MusicError, extractAudio, flatPlaylist, streamExpiry } from './ytdlp.js';

export const SOURCES = {
  youtube: { label: 'YouTube', color: 0xff0033 },
  spotify: { label: 'Spotify', color: 0x1db954 },
  soundcloud: { label: 'SoundCloud', color: 0xff5500 },
  deezer: { label: 'Deezer', color: 0xa238ff },
  apple: { label: 'Apple Music', color: 0xfa243c },
  web: { label: 'Lien web', color: 0x5865f2 },
};

// Garde-fou mémoire uniquement : largement au-dessus de n'importe quelle playlist
const MAX_QUEUE_ADD = 5000;
const YOUTUBE_BLOCK_PAUSE_MS = 10 * 60_000;
let youtubeBlockedUntil = 0;
const isUrl = (s) => /^https?:\/\//i.test(s) || /^spotify:/i.test(s);
const youtubeUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

function youtubeId(url) {
  return url.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([\w-]{11})/)?.[1] ?? null;
}

function trackFromMeta(meta) {
  const extractor = meta.extractor_key ?? '';
  const isYouTube = /youtube/i.test(extractor);
  const isSoundCloud = /soundcloud/i.test(extractor);
  const pageUrl = isYouTube ? youtubeUrl(meta.id) : meta.webpage_url;
  return {
    title: meta.track || meta.title,
    artist: meta.artist || meta.channel || meta.uploader || null,
    duration: Math.round(meta.duration ?? 0),
    isLive: meta.live_status === 'is_live',
    thumbnail: isYouTube ? youtubeThumb(meta.id) : meta.thumbnail?.replace('-original.', '-t500x500.') ?? null,
    url: pageUrl,
    playUrl: pageUrl,
    source: isYouTube ? 'youtube' : isSoundCloud ? 'soundcloud' : 'web',
  };
}

function withStream(track, { streamUrl, meta }) {
  return { ...track, streamUrl, streamExpiresAt: streamExpiry(streamUrl), acodec: meta?.acodec ?? null, protocol: meta?.protocol ?? null };
}

const LAVALINK_SOURCES = {
  youtube: 'youtube', ytmusic: 'youtube', youtubemusic: 'youtube', soundcloud: 'soundcloud',
  spotify: 'spotify', applemusic: 'apple', deezer: 'deezer',
};

function trackFromLavalink(item) {
  const info = item.info;
  const source = LAVALINK_SOURCES[info.sourceName?.toLowerCase()] ?? 'web';
  return {
    title: info.title,
    artist: info.author ?? null,
    duration: Math.round((info.length ?? 0) / 1000),
    isLive: Boolean(info.isStream),
    thumbnail: info.artworkUrl ?? (source === 'youtube' && info.identifier ? youtubeThumb(info.identifier) : null),
    url: info.uri,
    playUrl: info.uri,
    source,
    query: `${info.author ?? ''} ${info.title}`.trim(),
  };
}

/** Passe le lien (ou la recherche) aux serveurs audio : ils gèrent YouTube, SoundCloud et bien d'autres sites. */
async function resolveWithLavalink(identifier, { searchOnly = false } = {}) {
  const loaded = await lavalink.loadAny(identifier);
  if (!loaded) return null;
  const { result } = loaded;
  if (result.loadType === 'playlist') {
    const tracks = result.data.tracks.map(trackFromLavalink);
    return tracks.length ? { name: result.data.info?.name, isPlaylist: true, tracks } : null;
  }
  const items = result.loadType === 'search' ? result.data : [result.data];
  const first = items?.[0];
  if (!first) return null;
  return { tracks: [trackFromLavalink(first)], isPlaylist: false, searched: searchOnly };
}

async function playlistFromYtDlp(url, source) {
  const data = await flatPlaylist(url, MAX_QUEUE_ADD);
  const tracks = (data.entries ?? [])
    .filter((e) => e && (e.id || e.url) && !/^\[(private|deleted)/i.test(e.title ?? ''))
    .map((e) => (source === 'youtube'
      ? {
        title: e.title, artist: e.channel ?? e.uploader ?? null, duration: Math.round(e.duration ?? 0),
        thumbnail: youtubeThumb(e.id), url: youtubeUrl(e.id), playUrl: youtubeUrl(e.id), source,
      }
      : {
        title: e.title ?? 'Son SoundCloud', artist: e.uploader ?? null, duration: Math.round(e.duration ?? 0),
        thumbnail: null, url: e.url, playUrl: e.url, source,
      }));
  return { name: data.title ?? 'Playlist', isPlaylist: true, tracks };
}

async function fromDeezerUrl(url) {
  let target = url;
  if (/link\.deezer\.com|deezer\.page\.link/i.test(url)) target = (await fetch(url, { redirect: 'follow' })).url;
  const match = target.match(/deezer\.com\/(?:[a-z]{2}\/)?(track|album|playlist)\/(\d+)/i);
  if (!match) return null;
  const [, type, id] = match;

  if (type === 'track') return { tracks: [trackFromDeezer(await deezer.track(id))] };
  if (type === 'album') {
    const [album, items] = await Promise.all([deezer.album(id), deezer.albumTracks(id)]);
    return {
      name: album.title, isPlaylist: true, cover: album.cover_xl,
      tracks: items.map((item) => trackFromDeezer({ ...item, artist: item.artist ?? album.artist }, { cover: album.cover_xl })),
    };
  }
  const [playlist, items] = await Promise.all([deezer.playlist(id), deezer.playlistTracks(id)]);
  return { name: playlist.title, isPlaylist: true, cover: playlist.picture_xl, tracks: items.map((item) => trackFromDeezer(item)) };
}

/** Gemini devine le son quand la recherche ne donne rien (fautes, abréviations, bout de paroles...). */
async function aiGuess(query) {
  try {
    const guess = await withTimeout(chatJson({
      system: 'Tu es un expert en musique (rap FR, pop, afro, rock, électro, musiques de films...). Tu identifies des morceaux qui existent vraiment.',
      prompt: `Un membre a tapé « ${query} » pour écouter un son. Devine le morceau exact qu'il veut (corrige les fautes, abréviations, bouts de paroles). Si tu ne sais vraiment pas, found = false.`,
      schema: {
        type: 'object',
        properties: { found: { type: 'boolean' }, artist: { type: 'string' }, title: { type: 'string' } },
        required: ['found'],
      },
      thinking: 'low',
      exactThinking: true,
    }), 12_000);
    return guess?.found && guess.title ? `${guess.artist ?? ''} ${guess.title}`.trim() : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} input
 * @param {{ requestedBy: string, playlistMode?: boolean, fast?: boolean }} opts fast = ajout en masse (pas d'IA, résultats sûrs uniquement) playlistMode = lien YouTube avec &list= -> toute la playlist
 * @returns {Promise<{ tracks: object[], name?: string, isPlaylist?: boolean, cover?: string }>}
 */
export async function resolveQuery(input, { requestedBy, playlistMode = false, fast = false }) {
  const query = input.trim();
  const result = await resolveRaw(query, playlistMode, fast);
  result.tracks = result.tracks.slice(0, MAX_QUEUE_ADD).map((track) => ({ ...track, requestedBy }));
  return result;
}

async function resolveRaw(query, playlistMode, fast = false) {
  // Choix venant des suggestions
  if (/^dz:\d+$/.test(query)) return { tracks: [trackFromDeezer(await deezer.track(query.slice(3)))] };

  if (isUrl(query)) {
    const spotify = parseSpotifyUrl(query);
    if (spotify) {
      const data = await spotifyTracks(query);
      return { name: data.name, cover: data.cover, isPlaylist: spotify.type !== 'track', tracks: data.tracks };
    }

    const apple = parseAppleUrl(query);
    if (apple) {
      const data = await appleTracks(query);
      return { name: data.name, cover: data.cover, isPlaylist: apple.type !== 'song', tracks: data.tracks };
    }

    const fromDeezer = /deezer/i.test(query) ? await fromDeezerUrl(query) : null;
    if (fromDeezer) return fromDeezer;

    const youtubeList = /(youtube\.com|youtu\.be)/i.test(query) ? new URL(query).searchParams.get('list') : null;
    const wholePlaylist = (youtubeList && (!youtubeId(query) || playlistMode)) || /soundcloud\.com\/[^/]+\/sets\//i.test(query);

    // Les serveurs audio savent tout charger (et ne se font pas bloquer par YouTube)
    const viaLavalink = await resolveWithLavalink(wholePlaylist ? query : query.replace(/[?&]list=[^&]+/, ''));
    if (viaLavalink) return viaLavalink;

    if (wholePlaylist) return playlistFromYtDlp(query, youtubeList ? 'youtube' : 'soundcloud');
    const extracted = await extractAudio(query);
    return { tracks: [withStream(trackFromMeta(extracted.meta), extracted)] };
  }

  // Texte : Deezer pour trouver le bon son (et sa pochette), puis l'IA si besoin, puis YouTube direct
  let match = await bestMatch(query);

  // Faute de frappe : on garde le son le plus connu qui ressemble à ce qui est tapé
  if (!match) match = await popularMatch(query, fast ? 0.7 : 0.5);

  // Ajout en masse : pas d'IA (trop lent) et pas de résultat approximatif
  if (fast) {
    if (match) return { tracks: [trackFromDeezer(match)] };
    const fromMusic = await resolveWithLavalink(`ytmsearch:${query}`, { searchOnly: true });
    const found = fromMusic?.tracks?.[0];
    // On n'ajoute pas un son au hasard : il doit vraiment ressembler à ce qui est demandé
    if (found && matchRatio(query, `${found.title} ${found.artist ?? ''}`) >= 0.7) return fromMusic;
    throw new MusicError('son introuvable');
  }

  if (!match) {
    const guess = await aiGuess(query);
    const guessed = guess ? await bestMatch(guess) : null;
    // On garde la proposition de l'IA seulement si elle ressemble à ce qui a été tapé
    if (guessed && matchRatio(query, `${guessed.title} ${guessed.artist?.name ?? ''}`) >= 0.5) match = guessed;
  }
  if (match) return { tracks: [trackFromDeezer(match)] };

  const viaLavalink = await resolveWithLavalink(`ytsearch:${query}`, { searchOnly: true });
  if (viaLavalink) return viaLavalink;

  const extracted = await extractAudio(`ytsearch1:${query}`, { firstResult: true });
  return { tracks: [withStream(trackFromMeta(extracted.meta), extracted)] };
}

/** Cherche l'audio d'un son connu (Spotify / Deezer) : YouTube Music d'abord, puis YouTube, puis SoundCloud. */
async function findAudio(track) {
  const query = track.query || `${track.artist ?? ''} ${track.title}`.trim();
  const closeEnough = (r) => !track.duration || !r.meta.duration || Math.abs(r.meta.duration - track.duration) <= 25;
  let firstError = null;
  let best = null;

  // YouTube bloqué il y a peu : on ne perd pas 2 recherches de plus, on passe direct à SoundCloud
  if (Date.now() >= youtubeBlockedUntil) {
    for (const target of [
      `https://music.youtube.com/search?q=${encodeURIComponent(query)}#songs`,
      `ytsearch1:${query} audio`,
    ]) {
      try {
        const result = await extractAudio(target, { firstResult: true });
        if (closeEnough(result)) return result;
        best ??= result;
      } catch (err) {
        firstError ??= err;
        if (err.blocked) {
          youtubeBlockedUntil = Date.now() + YOUTUBE_BLOCK_PAUSE_MS;
          break;
        }
      }
    }
    if (best) return best;
  }

  try {
    const result = await extractAudio(`scsearch1:${query}`, { firstResult: true });
    // Pas d'extrait : si SoundCloud ne donne qu'un bout du son, on refuse
    if (track.duration > 60 && result.meta.duration && result.meta.duration < track.duration * 0.6) {
      throw new MusicError('seul un extrait est disponible sur SoundCloud');
    }
    return result;
  } catch (err) {
    throw firstError ?? err ?? new MusicError('son introuvable');
  }
}

/** Récupère le flux audio juste avant de jouer (les liens de flux expirent). */
export async function prepareTrack(track, { force = false } = {}) {
  if (!force && track.streamUrl && (track.streamExpiresAt ?? 0) - Date.now() > 5 * 60_000) return track;

  if (track.source === 'spotify' && !track.thumbnail && track.spotifyId) {
    track.thumbnail = await spotifyEntity('track', track.spotifyId)
      .then((e) => biggestImage(e.visualIdentity?.image))
      .catch(() => null);
  }

  const result = track.playUrl ? await extractAudio(track.playUrl) : await findAudio(track);
  const found = trackFromMeta(result.meta);
  track.streamUrl = result.streamUrl;
  track.streamExpiresAt = streamExpiry(result.streamUrl);
  // Un son trouvé via la recherche Deezer est joué depuis YouTube : on affiche la vraie source
  if (track.source === 'deezer') track.source = found.source;
  track.playUrl ??= found.playUrl;
  track.url ??= found.url;
  track.thumbnail ??= found.thumbnail;
  track.title ||= found.title;
  track.artist ||= found.artist;
  track.duration ||= found.duration;
  track.isLive = found.isLive;
  track.acodec = result.meta.acodec ?? null;
  track.protocol = result.meta.protocol ?? null;
  return track;
}

const trackKey = (t) => `${t.title}|${t.artist}`.toLowerCase();

/** Autoplay : un son dans le même style (radio Deezer de l'artiste). */
export async function recommendNext(lastTrack, history) {
  let artistId = lastTrack.artistId;
  if (!artistId) artistId = (await bestMatch(lastTrack.query || `${lastTrack.artist ?? ''} ${lastTrack.title}`))?.artist?.id;
  if (!artistId) return null;

  const played = new Set(history.map(trackKey));
  const candidates = (await deezer.artistRadio(artistId))
    .map((item) => trackFromDeezer(item))
    .filter((t) => !played.has(trackKey(t)));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * Math.min(candidates.length, 15))];
}

/** Playlist générée par l'IA à partir d'une ambiance. */
export async function aiPlaylist(ambiance, count) {
  const data = await chatJson({
    system: 'Tu es un DJ qui connaît très bien la musique actuelle et les classiques. Tu ne proposes que des morceaux qui existent vraiment.',
    prompt: `Propose ${count} morceaux pour cette ambiance : « ${ambiance} ». Varie les artistes, mets les sons les plus connus en premier, et donne un nom court et stylé à la playlist.`,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        tracks: {
          type: 'array',
          items: { type: 'object', properties: { artist: { type: 'string' }, title: { type: 'string' } }, required: ['artist', 'title'] },
        },
      },
      required: ['name', 'tracks'],
    },
  });

  const found = await Promise.all((data.tracks ?? []).slice(0, count).map(async ({ artist, title }) => {
    const query = `${artist} ${title}`;
    const match = await bestMatch(query).catch(() => null) ?? (await deezer.search(query, 3).catch(() => []))[0];
    return match ? trackFromDeezer(match) : null;
  }));
  return { name: data.name ?? ambiance, isPlaylist: true, tracks: found.filter(Boolean) };
}
