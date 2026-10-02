// Test d’intégration réel : deux sons synthétiques, aucun micro ou écran de l’utilisateur.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ReplayBuffer } from '../src/replay.js';
import { ffmpegArgs, micMixArgs } from '../src/core.js';
const bin = process.env.FFMPEG_TEST_BIN;
if (!bin) throw Error('Définis FFMPEG_TEST_BIN pour exécuter les tests audio/vidéo.');
const dir = await mkdtemp(path.join(os.tmpdir(), 'clips-media-test-'));
const file = name => path.join(dir, name);
const run = args => execFileSync(bin, ['-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
run(['-y','-f','lavfi','-i','testsrc2=size=160x90:rate=15','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libvpx','-deadline','realtime','-g','15','-c:a','libopus','-cluster_time_limit','1000',file('source.webm')]);
run(['-y','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','8','-c:a','libopus','-cluster_time_limit','1000',file('micro.webm')]);
const buffer = new ReplayBuffer(file('ring'), 3);
for (const [kind, src] of [['video','source.webm'],['mic','micro.webm']]) {
  const data = await readFile(file(src));
  for (let i = 0; i < data.length; i += 731) await buffer.push(kind, data.subarray(i, i + 731));
}
await buffer.snapshot(file('tail.webm'), file('tail-mic.webm')); await buffer.close();
run(ffmpegArgs(file('tail.webm'), file('game.mp4'), { reencode: true, fixup: true }));
run(micMixArgs(file('tail.webm'),file('tail-mic.webm'),file('mix.mp4'),{videoAudio:true}));
run(ffmpegArgs(file('mix.mp4'),file('trim.mp4'),{start:0.5,end:2,reencode:true}));
// Mesurer les fréquences dans le PCM décodé, pas seulement la présence d’une piste.
function tone(name, track, frequency) {
  const pcm = run(['-i',file(name),'-map',`0:a:${track}`,'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']);
  const n = Math.min(pcm.length / 4, 48000); let real = 0, imag = 0;
  for (let i=0;i<n;i++) { const v=pcm.readFloatLE(i*4); real += v*Math.cos(2*Math.PI*frequency*i/48000); imag += v*Math.sin(2*Math.PI*frequency*i/48000); }
  return Math.hypot(real,imag)/n;
}
assert.ok(tone('game.mp4',0,440)>0.015,'son du jeu conservé après replay');
for (const name of ['mix.mp4','trim.mp4']) {
  assert.ok(tone(name,0,440)>0.015,`${name}: jeu audible`);
  assert.ok(tone(name,0,880)>0.015,`${name}: micro audible sur la piste par défaut`);
  run(['-i',file(name),'-map','0:v:0','-f','null','-']);
}
assert.ok(tone('mix.mp4',1,880)>0.015,'piste micro séparée conservée');
console.log('✅ FFmpeg : replay réellement décodé, sons 440/880 Hz présents dans MP4 et découpe, piste micro séparée');
console.log('Fixtures : '+dir);
