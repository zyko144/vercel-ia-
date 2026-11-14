import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/ui/clip-notice.js', import.meta.url), 'utf8');
const elements = Object.fromEntries(['game','title','state'].map(id => [id, {textContent:''}]));
let show;
let contexts = 0, starts = 0, closes = 0;
const parameter = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
class Audio {
  constructor() { contexts++; this.currentTime = 0; this.destination = {}; }
  resume() { return Promise.resolve(); }
  close() { closes++; return Promise.resolve(); }
  createGain() { return { gain: parameter, connect() {} }; }
  createOscillator() { const oscillator = { frequency: parameter, connect: gain => gain, start: () => starts++, stop: () => queueMicrotask(() => oscillator.onended()) }; return oscillator; }
}
vm.runInNewContext(source, { window: { clipNotice: { onShow: fn => show = fn } }, document: { getElementById: id => elements[id] }, AudioContext: Audio });
assert.equal(contexts,0,'préchargement silencieux');
show({game:'<b>Rocket League</b>',phase:'saving',sound:false});
assert.equal(elements.game.textContent, '<b>Rocket League</b> · Enregistrement en cours…');
assert.equal(elements.title.textContent,'Clip pris !');
assert.equal(contexts,0,'réglage silencieux respecté');
show({game:'Rocket League',phase:'saving',sound:true});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(starts,1,'son immédiat pendant la prise du clip');
assert.equal(closes,1,'sortie audio libérée');
show({game:'Rocket League',phase:'saved',sound:true});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(elements.title.textContent,'Clip bien enregistré');
assert.equal(starts,1,'aucun deuxième son à la fin de la sauvegarde');
show({game:'Rocket League',phase:'error',detail:'Disque plein',sound:true});
assert.equal(elements.title.textContent,'Clip non enregistré');
assert.equal(elements.game.textContent,'Disque plein');
assert.equal(starts,1,'aucun son de réussite en cas d’erreur');
console.log('✅ Confirmation : préchargement silencieux, prise immédiate, carillon unique, succès et erreur');
