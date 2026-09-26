import assert from 'node:assert/strict';
import { dayKey } from '../src/core/tracker.js';
import { cleanNews, dominantColor, looksFrench, mondayOf, playReminders, steamNews, translateNews, weeklyRecap } from '../src/core/daily.js';

const now = new Date(2026, 8, 28, 10).getTime(); // lundi 28 septembre 2026
assert.equal(new Date(mondayOf(now)).getDate(), 28);
const day = (d) => dayKey(new Date(2026, 8, d, 12).getTime());
const days = { [day(22)]: { jeux: 120, items: { 'steam:1': 90, 'epic:2': 30 } }, [day(26)]: { jeux: 60, items: { 'steam:1': 60 } }, [day(15)]: { jeux: 90, items: { 'epic:2': 90 } } };
const items = [{ id: 'steam:1', name: 'Rocket League', kind: 'game' }, { id: 'epic:2', name: 'Fortnite', kind: 'game' }];
const r = weeklyRecap(days, items, now);
assert.equal(r.minutes, 180);
assert.equal(r.change, 100, 'deux fois plus que la semaine d’avant');
assert.deepEqual(r.top.map((x) => [x.name, x.minutes]), [['Rocket League', 150], ['Fortnite', 30]]);

const sent = {};
assert.equal(playReminders({ today: 200, limit: 180, sessionMinutes: 0, breakEvery: 0 }, sent, now).length, 1);
assert.equal(playReminders({ today: 240, limit: 180, sessionMinutes: 0, breakEvery: 0 }, sent, now).length, 0, 'une fois par jour');
assert.equal(playReminders({ today: 0, limit: 0, sessionMinutes: 125, breakEvery: 60 }, sent, now)[0].kind, 'pause');
assert.equal(playReminders({ today: 0, limit: 0, sessionMinutes: 130, breakEvery: 60 }, sent, now).length, 0);

assert.equal(cleanNews('[h1]Patch 1.2[/h1][img]{STEAM_CLAN_IMAGE}/x.png[/img] Fixed <b>bugs</b> https://x.y'), 'Patch 1.2 Fixed bugs');
const news = await steamNews(252950, 2, async () => ({ ok: true, json: async () => ({ appnews: { newsitems: [{ gid: '123', title: 'Update 2.40', contents: 'x', date: 10, tags: [] }, { gid: 'bad', title: 'x' }] } }) }));
assert.deepEqual(news.map((n) => [n.gid, n.patch]), [['123', true]]);

const px = (R, G, B, n) => Array.from({ length: n }, () => [B, G, R, 255]).flat();
assert.equal(dominantColor(Uint8Array.from([...px(0, 0, 0, 50), ...px(250, 30, 30, 10), ...px(128, 128, 128, 40)])), '#fa1e1e', 'rouge vif malgré le noir et le gris');
assert.equal(dominantColor(Uint8Array.from(px(20, 20, 20, 10))), null);
assert.ok(looksFrench('La nouvelle mise à jour ajoute une carte et des modes'));
assert.ok(!looksFrench('The new update adds a map and new modes for everyone'));
const fakeAi = { ask: async () => ({ items: [{ gid: '9', title: 'Mise à jour 2.40', text: 'Corrections de bugs.' }] }) };
const cache = {};
const tr = await translateNews(fakeAi, [{ gid: '9', title: 'Update 2.40', text: 'Fixed many bugs in the game today' }], cache);
assert.equal(tr[0].title, 'Mise à jour 2.40');
assert.ok(cache['9'], 'traduction gardée');
console.log('✅ résumé, rappels, actus, couleur : 13 vérifications');
