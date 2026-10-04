import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { matchRatio } from '../src/music/deezer.js';
class NoAudioNodeError extends Error {}
const audioCalls = [];
let entries = [];
let responses = new Map();
class MusicError extends Error { constructor(message, { blocked = false } = {}) { super(message); this.blocked = blocked; } }
mock.module('../src/ai/gemini.js', { namedExports: { chatJson: async () => null } });
mock.module('../src/music/apple.js', { namedExports: { appleTracks: async () => null, parseAppleUrl: () => null } });
mock.module('../src/music/spotify.js', { namedExports: { biggestImage: () => null, parseSpotifyUrl: () => null, spotifyEntity: async () => null, spotifyTracks: async () => null } });
mock.module('../src/music/lavalink.js', { namedExports: { lavalink: { loadAny: async () => null, bestNode: () => null }, NoAudioNodeError } });
mock.module('../src/utils/netSafety.js', { namedExports: { isPublicUrl: async (url) => url.startsWith('https://soundcloud.com/') } });
mock.module('../src/music/ytdlp.js', { namedExports: {
  MusicError, streamExpiry: () => Date.now() + 3600000,
  flatPlaylist: async (target) => { assert.match(target, /^scsearch5:/); return { entries }; },
  extractAudio: async (target) => {
    audioCalls.push(target);
    const r = responses.get(target);
    if (r instanceof Error) throw r;
    if (!r) throw new MusicError('YouTube bloque le serveur', { blocked: true });
    return r;
  },
} });
const { prepareTrack } = await import('../src/music/sources.js');
const track = () => ({ title: 'Get Lucky', artist: 'Daft Punk', duration: 369, source: 'youtube', playUrl: 'https://www.youtube.com/watch?v=abcdefghijk', url: 'original', thumbnail: 'cover' });
const candidate = (id, title = 'Daft Punk Get Lucky', duration = 369) => ({ url: `https://soundcloud.com/test/${id}`, title, duration });
const result = (id, duration = 369) => ({ meta: { title: 'Get Lucky', duration, extractor_key: 'Soundcloud', webpage_url: `https://soundcloud.com/test/${id}`, acodec: 'opus' }, streamUrl: `https://audio.example/${id}` });
entries = [candidate('protected'), candidate('public')];
responses.set(entries[0].url, new MusicError('protégé DRM')); responses.set(entries[1].url, result('public'));
const recovered = await prepareTrack(track());
assert.equal(recovered.streamUrl, 'https://audio.example/public');
assert.equal(recovered.source, 'soundcloud');
assert.equal(recovered.title, 'Get Lucky'); assert.equal(recovered.thumbnail, 'cover');
assert.equal(recovered.playUrl, entries[1].url);
assert.ok(audioCalls.includes(entries[0].url) && audioCalls.includes(entries[1].url));

// YouTube déjà bloqué : éviter de refaire deux requêtes avant la source publique.
audioCalls.length = 0;
await prepareTrack({ title: 'Get Lucky', artist: 'Daft Punk', duration: 369, source: 'deezer' });
assert.ok(audioCalls.every((s) => s.startsWith('https://soundcloud.com/')));

// Mauvais titre, extrait et cible privée : ne jamais jouer un autre son par défaut.
entries = [candidate('wrong', 'Autre artiste autre son'), candidate('short', 'Daft Punk Get Lucky', 30), { ...candidate('private'), url: 'http://127.0.0.1/secret' }];
audioCalls.length = 0;
await assert.rejects(prepareTrack({ title: 'Get Lucky', artist: 'Daft Punk', duration: 369, source: 'deezer' }), /aucune version audio complète/);
assert.equal(audioCalls.length, 0);

// Une vraie erreur privée ne déclenche pas de recherche alternative.
responses.set(track().playUrl, new MusicError('la vidéo est privée'));
await assert.rejects(prepareTrack(track()), /privée/);
console.log('✅ Reprise audio : YouTube bloqué → candidat public, candidats illisibles, cache de blocage, titre/durée/URL contrôlés et vidéo privée');

// Les serveurs externes ont tous échoué : produire l’erreur que le lecteur auto sait reprendre.
mock.module('../src/config.js', { namedExports: { config: { music: { engine: 'auto' } } } });
mock.module('../src/features/voice.js', { namedExports: { anchorChannel: () => null, releaseExternalVoice: async () => {}, takeVoiceForExternal: async () => {} } });
const { LavalinkBackend } = await import('../src/music/backend-lavalink.js');
const backend = new LavalinkBackend({ guild: { id: 'test' }, playToken: 1 });
backend.node = { usable: true, name: 'failed-node', brokenUntil: 0, loadTracks: async () => { throw new Error('source bloquée'); } };
backend.searchOrder = () => ['ytsearch:Daft Punk Get Lucky'];
backend.switchNode = async () => false;
await assert.rejects(backend.play(track(), 0, 1), (e) => e instanceof NoAudioNodeError);
console.log('✅ Serveurs audio en échec : récupération locale activable en mode auto');
