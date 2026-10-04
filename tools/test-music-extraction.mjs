import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mock } from 'node:test';

let results = [];
const calls = [];
mock.module('node:child_process', { namedExports: { spawn: (file, args) => {
  calls.push(args);
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.kill = () => {};
  const result = results.shift();
  assert.ok(result, 'aucune extraction supplémentaire inattendue');
  process.nextTick(() => {
    child.stdout.emit('data', result.stdout ?? '');
    child.stderr.emit('data', result.stderr ?? '');
    child.emit('close', result.code ?? 1);
  });
  return child;
} } });
mock.module('../src/music/binaries.js', { namedExports: {
  COOKIES_PATH: 'missing-test-cookies', YTDLP_PATH: 'fake-ytdlp', ensureBinaries: async () => {},
} });
const { extractAudio, MusicError } = await import('../src/music/ytdlp.js');
const target = 'https://www.youtube.com/watch?v=abcdefghijk';
const ok = { code: 0, stdout: '{"id":"abcdefghijk","title":"Son","duration":180,"acodec":"opus"}\nhttps://audio.example/stream\n' };

results = [{ stderr: 'WARNING: Some tv client formats are DRM protected\nERROR: Requested format is not available' }, ok];
assert.equal((await extractAudio(target)).streamUrl, 'https://audio.example/stream');
assert.equal(calls.length, 2);
assert.ok(calls[1].includes('youtube:player_client=default,-tv,-tv_downgraded,web_safari,web_embedded'));
assert.ok(!calls[1].includes('--allow-unplayable-formats'));

calls.length = 0;
results = [ok];
await extractAudio(target);
assert.equal(calls.length, 1, 'un flux lisible ne doit pas être réextrait');

calls.length = 0;
results = [{ stderr: 'ERROR: This video is DRM protected' }, { stderr: 'ERROR: This video is DRM protected' }];
await assert.rejects(extractAudio(target), (e) => e instanceof MusicError && /protégé \(DRM\)/.test(e.message));
assert.equal(calls.length, 2, 'un seul nouvel essai');

calls.length = 0;
results = [{ stderr: 'WARNING: Some tv client formats are DRM protected\nERROR: Video unavailable' }, { stderr: 'WARNING: Some tv client formats are DRM protected\nERROR: Video unavailable' }];
await assert.rejects(extractAudio(target), /le son n'est pas disponible/);

calls.length = 0;
results = [{ stderr: 'ERROR: This video is DRM protected' }];
await assert.rejects(extractAudio('https://example.com/protected'), /protégé/);
assert.equal(calls.length, 1, 'pas de clients YouTube pour une autre plateforme');

calls.length = 0;
results = [{ stderr: 'ERROR: Sign in to confirm you are not a bot' }, ok];
await extractAudio('ytsearch1:mon son', { firstResult: true });
assert.equal(calls.length, 2);
assert.ok(calls[1].includes('--force-ipv4'));
console.log('✅ Musique : nouvel essai YouTube, recherche /play, DRM réel, erreur finale et flux déjà lisible');
