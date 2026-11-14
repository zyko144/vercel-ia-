import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/ui/clip-notice.js', import.meta.url), 'utf8');
const label = { textContent: '' };
let contexts = 0, starts = 0, closes = 0;
const parameter = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
class Audio {
  constructor() { contexts++; this.currentTime = 0; this.destination = {}; }
  resume() { return Promise.resolve(); }
  close() { closes++; return Promise.resolve(); }
  createGain() { return { gain: parameter, connect() {} }; }
  createOscillator() { const oscillator = { frequency: parameter, connect: gain => gain, start: () => starts++, stop: () => queueMicrotask(() => oscillator.onended()) }; return oscillator; }
}
const run = async search => {
  vm.runInNewContext(source, { URLSearchParams, location: { search }, document: { getElementById: () => label }, AudioContext: Audio });
  await new Promise(resolve => setImmediate(resolve));
};
await run('?game=%3Cb%3ERocket%20League%3C%2Fb%3E&sound=0');
assert.equal(label.textContent, '<b>Rocket League</b>');
assert.equal(contexts, 0, 'réglage silencieux respecté');
await run('?game=Rocket%20League&sound=1');
assert.equal(starts, 1, 'un seul carillon par confirmation');
assert.equal(closes, 1, 'sortie audio libérée');
console.log('✅ Confirmation : texte du jeu, mode silencieux, carillon unique et libération audio');
