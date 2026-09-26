import assert from 'node:assert/strict';
import { activityFor, decodeFrames, encodeFrame } from '../src/core/discordRpc.js';

const a = encodeFrame(1, { evt: 'READY' });
const b = encodeFrame(1, { cmd: 'SET_ACTIVITY' });
const both = Buffer.concat([a, b]);
const half = decodeFrames(both.subarray(0, a.length + 5));
assert.equal(half.frames.length, 1, 'un message complet');
assert.equal(half.frames[0].data.evt, 'READY');
const rest = decodeFrames(Buffer.concat([half.rest, both.subarray(a.length + 5)]));
assert.equal(rest.frames[0].data.cmd, 'SET_ACTIVITY', 'le reste arrive plus tard');
const act = activityFor({ name: 'Rocket League', start: 1000 }, { art: { cover: 'libimg://x', header: 'https://cdn/x.jpg' } });
assert.equal(act.details, 'Rocket League');
assert.equal(act.assets.large_image, 'https://cdn/x.jpg', 'image en ligne seulement');
assert.deepEqual(act.timestamps, { start: 1000 });
assert.equal(activityFor(null), null);
console.log('✅ statut Discord : 7 vérifications');
