// Playlists perso des membres (sauvegardées dans le stockage du bot).
import { load, save } from '../storage.js';

const KEY = 'music-playlists';
const MAX_PLAYLISTS = 100;
const MAX_TRACKS = 5000;
export const FAVORITES = 'Favoris';

const keyOf = (name) => name.trim().toLowerCase();

const serialize = (t) => ({
  title: t.title, artist: t.artist ?? null, duration: t.duration ?? 0, thumbnail: t.thumbnail ?? null,
  url: t.url ?? null, playUrl: t.playUrl ?? null, source: t.source, query: t.query ?? null,
  spotifyId: t.spotifyId ?? null, deezerId: t.deezerId ?? null, artistId: t.artistId ?? null,
});

async function userPlaylists(userId) {
  const all = await load(KEY, {});
  all[userId] ??= {};
  return { all, mine: all[userId] };
}

export async function listPlaylists(userId) {
  const { mine } = await userPlaylists(userId);
  return Object.values(mine).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPlaylist(userId, name) {
  const { mine } = await userPlaylists(userId);
  return mine[keyOf(name)] ?? null;
}

export async function createPlaylist(userId, name) {
  const { all, mine } = await userPlaylists(userId);
  const clean = name.trim().slice(0, 50);
  if (!clean) return { error: 'Donne un nom à ta playlist.' };
  if (mine[keyOf(clean)]) return { error: `Tu as déjà une playlist « ${clean} ».` };
  if (Object.keys(mine).length >= MAX_PLAYLISTS) return { error: `Maximum ${MAX_PLAYLISTS} playlists.` };
  mine[keyOf(clean)] = { name: clean, tracks: [], createdAt: Date.now() };
  save(KEY, all);
  return { playlist: mine[keyOf(clean)] };
}

export async function deletePlaylist(userId, name) {
  const { all, mine } = await userPlaylists(userId);
  const playlist = mine[keyOf(name)];
  if (!playlist) return null;
  delete mine[keyOf(name)];
  save(KEY, all);
  return playlist;
}

/** Ajoute des sons (crée la playlist si createIfMissing). */
export async function addToPlaylist(userId, name, tracks, { createIfMissing = false } = {}) {
  const { all, mine } = await userPlaylists(userId);
  let playlist = mine[keyOf(name)];
  if (!playlist && createIfMissing) {
    playlist = { name: name.trim().slice(0, 50), tracks: [], createdAt: Date.now() };
    mine[keyOf(name)] = playlist;
  }
  if (!playlist) return { error: `Tu as pas de playlist « ${name} ». Crée-la avec \`/playlist creer\`.` };

  const room = MAX_TRACKS - playlist.tracks.length;
  if (room <= 0) return { error: `La playlist « ${playlist.name} » est pleine (${MAX_TRACKS} sons max).` };
  const known = new Set(playlist.tracks.map((t) => `${t.title}|${t.artist}`.toLowerCase()));
  const fresh = tracks.map(serialize).filter((t) => !known.has(`${t.title}|${t.artist}`.toLowerCase())).slice(0, room);
  playlist.tracks.push(...fresh);
  save(KEY, all);
  return { playlist, added: fresh.length };
}

export async function removeFromPlaylist(userId, name, position) {
  const { all, mine } = await userPlaylists(userId);
  const playlist = mine[keyOf(name)];
  if (!playlist) return { error: `Tu as pas de playlist « ${name} ».` };
  const [removed] = playlist.tracks.splice(position - 1, 1);
  if (!removed) return { error: `Il n'y a pas de son n°${position} dans « ${playlist.name} ».` };
  save(KEY, all);
  return { playlist, removed };
}
