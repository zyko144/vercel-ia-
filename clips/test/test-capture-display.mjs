import assert from 'node:assert/strict';
import { matchCaptureDisplay } from '../src/captureDisplay.js';
const outputs = [
  { adapter: 0, output: 0, x: 0, y: 0, width: 1920, height: 1080 },
  { adapter: 1, output: 0, x: -2560, y: 0, width: 2560, height: 1440 },
];
assert.equal(matchCaptureDisplay(outputs, { x: -1280, y: 0, width: 1280, height: 720 }, r => ({ x:r.x/2, y:r.y/2, width:r.width/2, height:r.height/2 })), outputs[1]);
assert.equal(matchCaptureDisplay(outputs, { x: 0, y: 0, width: 1920, height: 1080 }), outputs[0]);
assert.equal(matchCaptureDisplay([...outputs, {...outputs[0], adapter:2}], outputs[0]), null, 'sortie ambiguë refusée');
assert.equal(matchCaptureDisplay(outputs, { x: 1920, y:0, width:1920, height:1080 }), null, 'aucun repli vers un autre écran');
console.log('✅ Écrans natifs : plusieurs GPU, coordonnées négatives, DPI et ambiguïtés');
