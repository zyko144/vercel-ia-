import assert from 'node:assert/strict';
import { canJoin, cardFor, joinFor, lastFivemServer, newlyPlaying, playingCard, playingMap } from '../src/core/friendsync.js';

assert.deepEqual(joinFor({ source: 'steam', steamId: '252950' }), { steam: '252950' });
assert.deepEqual(joinFor({ source: 'fivem' }, 'abc123'), { fivem: 'abc123' });
assert.equal(joinFor({ source: 'fivem' }, null), null);
assert.equal(joinFor({ source: 'epic' }), null);
assert.equal(lastFivemServer({ a: { code: 'old', end: 1 }, b: { code: 'new', end: 5 }, c: { code: null, end: 9 } }), 'new');
assert.equal(lastFivemServer({}, 'x'), 'x');

const before = playingMap([{ id: '1', playing: null }, { id: '2', playing: 'FiveM' }]);
assert.deepEqual(newlyPlaying(null, [{ id: '1', playing: 'GTA' }]), [], 'premier passage : pas de notification');
assert.deepEqual(newlyPlaying(before, [{ id: '1', playing: 'Rocket League' }, { id: '2', playing: 'FiveM' }]).map((a) => a.id), ['1']);

const items = [{ source: 'fivem', installed: true, name: 'FiveM' }, { source: 'steam', installed: true, name: 'Rocket League' }];
assert.equal(canJoin({ playing: 'FiveM', join: { fivem: 'abc123' } }, items), true);
assert.equal(canJoin({ playing: 'Rocket League', join: null }, items), true, 'même jeu installé');
assert.equal(canJoin({ playing: 'Valorant', join: null }, items), false);
assert.equal(canJoin({ playing: null }, items), false);

const msg = cardFor({ id: 'm', type: 'msg', from: '1', pseudo: 'Max', text: 'x'.repeat(300) });
assert.equal(msg.title, 'Max');
assert.ok(msg.body.length <= 140);
assert.deepEqual(msg.actions.map(([a]) => a), ['reply']);
assert.deepEqual(cardFor({ id: 'a', type: 'ask', from: '1', pseudo: 'Max', game: 'FiveM' }).actions.map(([a]) => a), ['accept', 'decline']);
assert.deepEqual(cardFor({ id: 'r', type: 'reply', from: '1', pseudo: 'Max', oui: true, game: 'FiveM', join: { fivem: 'abc123' } }).actions.map(([a]) => a), ['join']);
assert.equal(cardFor({ id: 'r', type: 'reply', from: '1', pseudo: 'Max', oui: false }).actions.length, 0);
assert.equal(cardFor({ type: 'bizarre' }), null);
const p = playingCard({ id: '1', pseudo: 'Max', playing: 'FiveM', join: { fivem: 'abc123' } }, true);
assert.deepEqual(p.actions.map(([a]) => a), ['join', 'ask']);
assert.deepEqual(playingCard({ id: '1', pseudo: 'Max', playing: 'Valorant' }, false).actions.map(([a]) => a), ['ask']);
console.log('✅ Amis en direct (rejoindre, notifications) : 21 vérifications');
