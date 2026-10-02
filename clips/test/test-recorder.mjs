import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/ui/recorder.js', import.meta.url), 'utf8');
const track = kind => ({ kind, stopped: false, stop() { this.stopped = true; }, addEventListener() {} });
const stream = tracks => ({ getTracks: () => tracks, getAudioTracks: () => tracks.filter(t => t.kind === 'audio'), getVideoTracks: () => tracks.filter(t => t.kind === 'video'), addTrack: t => tracks.push(t) });
let start, stop; const made = [], states = [], chunks = [];
class Recorder {
  static isTypeSupported(mime) { return !mime.includes('h264,opus'); }
  constructor(s, opts) { this.stream = s; this.opts = opts; this.state = 'inactive'; made.push(this); }
  start() { this.state = 'recording'; } stop() { this.state = 'inactive'; }
}
const screen = stream([track('video'),track('audio')]), mic = stream([track('audio')]);
const context = { MediaRecorder: Recorder, navigator: { mediaDevices: { getDisplayMedia: async () => screen, getUserMedia: async () => mic } }, window: { rec: { onStart: fn => start = fn, onStop: fn => stop = fn, state: s => states.push(s), chunk: (data, kind) => chunks.push({ data, kind }) } } };
vm.runInNewContext(source, context);
await start('screen:1', { audio: true, mic: true });
assert.equal(made[0].opts.mimeType, 'video/webm;codecs=vp8,opus', 'aucun repli H264 sans audio');
assert.equal(made[1].opts.mimeType, 'audio/webm;codecs=opus'); assert.equal(states.at(-1), 'on');
let resolveFirst;
made[0].ondataavailable({ data: { size: 1, arrayBuffer: () => new Promise(r => resolveFirst = r) } });
made[0].ondataavailable({ data: { size: 1, arrayBuffer: async () => 2 } });
await new Promise(r => setImmediate(r)); assert.equal(chunks.length, 0);
resolveFirst(1); await new Promise(r => setImmediate(r));
assert.deepEqual(chunks.map(c => c.data), [1,2], 'conversion asynchrone conserve l’ordre des fragments');
stop(); assert.ok([...screen.getTracks(),...mic.getTracks()].every(t => t.stopped));
let resolveCapture; const late = stream([track('video')]);
context.navigator.mediaDevices.getDisplayMedia = () => new Promise(r => resolveCapture = r);
const pending = start('screen:1', { audio: false }); stop(); resolveCapture(late); await pending;
assert.ok(late.getTracks().every(t => t.stopped), 'capture tardive libérée après arrêt');
console.log('✅ Enregistreur : codec avec son, micro, ordre des fragments, arrêt et capture tardive');
