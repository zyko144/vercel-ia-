// Test d’intégration réel : deux sons synthétiques, aucun micro ou écran de l’utilisateur.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ReplayBuffer, WebmClusters } from '../src/replay.js';
import { nativeCaptureArgs } from '../src/nativeCapture.js';
import { ffmpegArgs, micMixArgs, nativeMixArgs } from '../src/core.js';
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

// Remuxer une capture H264 60 i/s avec le micro sans altérer les images.
run(['-y','-f','lavfi','-i','testsrc2=size=320x180:rate=60','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-preset','ultrafast','-g','60','-c:a','libopus','-f','matroska',file('h264.webm')]);
run(micMixArgs(file('h264.webm'),file('micro.webm'),file('copy-mix.mp4'),{videoAudio:true,copyVideo:true}));
const frames = name => run(['-i',file(name),'-map','0:v:0','-an','-f','framemd5','-']).toString().split('\n').filter(l => l && !l.startsWith('#')).map(l=>l.split(',').at(-1).trim());
assert.deepEqual(frames('copy-mix.mp4'),frames('h264.webm'),'toutes les images 60 i/s restent identiques après mélange micro');
assert.equal(frames('copy-mix.mp4').length,180);
assert.ok(tone('copy-mix.mp4',0,440)>0.015);
assert.ok(tone('copy-mix.mp4',0,880)>0.015);
console.log('✅ Qualité : 180 images à 60 i/s conservées sans recompression avec son jeu + micro');

// Pipeline natif complet : H264 1080p60 -> clusters de replay -> MP4 + deux pistes audio.
run(['-y','-f','lavfi','-i','testsrc2=size=1920x1080:rate=60','-t','3','-c:v','libx264','-preset','ultrafast','-g','60','-bf','0','-f','matroska','-cluster_time_limit','1000',file('native.mkv')]);
const nativeBuffer = new ReplayBuffer(file('native-ring'),1,60);
for (const [kind,src] of [['video','native.mkv'],['game','source.webm'],['mic','micro.webm']]) {
  const data = await readFile(file(src));
  for (let i=0;i<data.length;i+=32768) await nativeBuffer.push(kind,data.subarray(i,i+32768));
}
const ns = await nativeBuffer.snapshot(file('native-cut.mkv'),file('native-mic.webm'),file('native-game.webm'));
assert.ok(ns.game && ns.mic && ns.duration>1 && ns.duration<=3.1);
run(nativeMixArgs(file('native-cut.mkv'),[{file:file('native-game.webm'),kind:'game',delta:0},{file:file('native-mic.webm'),kind:'mic',delta:0}],file('native.mp4'),ns.duration));
assert.deepEqual(frames('native.mp4'),frames('native-cut.mkv'),'1080p60 natif sans aucune recompression');
assert.ok(tone('native.mp4',0,440)>0.015);assert.ok(tone('native.mp4',0,880)>0.015);
assert.ok(tone('native.mp4',1,880)>0.015);
await nativeBuffer.close();
console.log('✅ Capture native simulée : replay 1080p60, durée bornée, vidéo identique, jeu + micro et piste isolée');
// Musique stéréo : deux canaux distincts, volumes du mix et pistes originales indépendants.
run(['-y','-f','lavfi','-i','aevalsrc=0.12*sin(2*PI*440*t)|0.12*sin(2*PI*660*t):s=48000:d=3','-c:a','libopus','-b:a','320k',file('stereo.webm')]);
run(nativeMixArgs(file('h264.webm'),[
  {file:file('stereo.webm'),kind:'game',delta:0,volume:0},
  {file:file('micro.webm'),kind:'mic',delta:0,volume:1},
],file('stereo-mix.mp4'),3));
assert.ok(tone('stereo-mix.mp4',0,440)<0.001,'volume jeu à zéro dans le mix');
assert.ok(tone('stereo-mix.mp4',0,880)>0.015,'micro audible dans le mix');
assert.ok(tone('stereo-mix.mp4',2,440)>0.015,'musique originale préservée même si volume jeu à zéro');
assert.ok(tone('stereo-mix.mp4',2,880)<0.001,'aucun micro dans la piste musique');
const stereo = run(['-i',file('stereo-mix.mp4'),'-map','0:a:2','-vn','-ac','2','-ar','48000','-f','f32le','pipe:1']);
function channelTone(channel, frequency) {
  const n=Math.min(stereo.length/8,48000);let real=0,imag=0;
  for(let i=0;i<n;i++){const v=stereo.readFloatLE(i*8+channel*4);real+=v*Math.cos(2*Math.PI*frequency*i/48000);imag+=v*Math.sin(2*Math.PI*frequency*i/48000);}
  return Math.hypot(real,imag)/n;
}
assert.ok(channelTone(0,440)>0.04 && channelTone(0,660)<0.001,'canal gauche intact');
assert.ok(channelTone(1,660)>0.04 && channelTone(1,440)<0.001,'canal droit intact');
run(micMixArgs(file('h264.webm'),file('micro.webm'),file('muted-mic.mp4'),{videoAudio:true,copyVideo:true,volume:0,gameVolume:0.5}));
assert.ok(tone('muted-mic.mp4',0,880)<0.001,'micro coupé seulement dans le mix');
assert.ok(tone('muted-mic.mp4',1,880)>0.015,'micro original conservé');
assert.ok(tone('muted-mic.mp4',2,440)>0.015,'jeu original conservé en mode compatible');
assert.deepEqual(frames('muted-mic.mp4'),frames('h264.webm'),'aucune perte vidéo avec pistes séparées');
console.log('✅ Audio : musique stéréo gauche/droite, volumes indépendants, pistes originales sans contamination et vidéo inchangée');

// Régression : un pipe Matroska utilise par défaut des clusters de 32 Ko.
// Vérifier le vrai muxeur FFmpeg, pas seulement la présence du paramètre.
const captureArgs = nativeCaptureArgs({ enc:'h264_amf' });
const pipeData = run(['-i',file('native.mkv'),'-map','0:v:0','-c:v','copy',...captureArgs.slice(captureArgs.lastIndexOf('-f'))]);
const clusterParser = new WebmClusters(); let clusterCount = 0;
for(let at=0;at<pipeData.length;at+=65536) clusterCount += clusterParser.push(pipeData.subarray(at,at+65536)).length;
assert.ok(clusterCount >= 2 && clusterCount <= 4, `3 secondes doivent produire environ 3 segments, obtenu ${clusterCount}`);
await writeFile(file('pipe-replay.mkv'),pipeData);
assert.deepEqual(frames('pipe-replay.mkv'),frames('native.mkv'),'la réduction des écritures préserve chaque image');
console.log(`✅ Fluidité : pipe 1080p60, ${clusterCount} segments pour 3 secondes, toutes les images inchangées`);
