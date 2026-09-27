import assert from 'node:assert/strict';
import { badges, hourly, levelOf, logSession, rediscover, streakOf } from '../src/core/progress.js';
import { checkReq, parseReq } from '../src/core/reqs.js';
import { median } from '../src/core/net.js';
import { gogGames, ubisoftGames } from '../src/core/stores.js';
import { scamCheck } from '../src/core/friendsync.js';
import { demoActivity, demoItems, demoTemps } from '../src/core/demo.js';

assert.deepEqual(levelOf(0), { level: 1, pct: 0, hoursToNext: 2 });
assert.equal(levelOf(90 * 60).level, 10);
assert.equal(levelOf(870 * 60).level, 30);
const now = Date.parse('2026-09-27T12:00:00Z');
const d = (off) => new Date(now - off * 86_400_000).toISOString().slice(0, 10);
const days = { [d(0)]: { jeux: 30, h: Array.from({ length: 24 }, (_, i) => (i === 21 ? 30 : 0)) }, [d(1)]: { jeux: 60, h: Array.from({ length: 24 }, (_, i) => (i === 21 ? 60 : 0)) }, [d(2)]: { jeux: 10 }, [d(4)]: { jeux: 5 } };
assert.equal(streakOf(days, now), 3);
assert.equal(hourly(days, 30, now)[21], 90);
const items = [
  { id: 'a', kind: 'game', installed: true, minutes: 600, lastPlayed: now - 40 * 86_400_000, source: 'steam' },
  { id: 'b', kind: 'game', installed: true, minutes: 600, lastPlayed: now - 2 * 86_400_000, source: 'epic' },
  { id: 'c', kind: 'game', installed: true, minutes: 60, lastPlayed: now - 90 * 86_400_000, source: 'steam' },
];
assert.deepEqual(rediscover(items, now).map((i) => i.id), ['a'], 'joué > 2 h et pas lancé depuis 30 j');
let s = logSession([], 'a', now);
s = logSession(s, 'a', now + 60_000);
assert.equal(s.length, 1, 'session prolongée');
s = logSession(s, 'a', now + 30 * 60_000);
assert.equal(s.length, 2, 'nouvelle session après une pause');
const bd = badges({ items, days, sessions: [{ start: Date.parse('2026-09-27T01:30:00Z') + 3600_000 * 1, end: 0 }], friends: 5, bench: { scores: { total: 1600 } }, health: 80, now });
const got = Object.fromEntries(bd.map((x) => [x.id, x.got]));
assert.equal(got.h10, true);
assert.equal(got.friends5, true);
assert.equal(got.bench1500, true);
assert.equal(got.health90, false);
assert.equal(bd.find((x) => x.id === 'health90').progress, 89);

const req = parseReq('<strong>Minimum:</strong><br><ul class="bb_ul"><li><strong>OS:</strong> Windows 10 64-bit<br></li><li><strong>Processor:</strong> Intel Core i5-4460<br></li><li><strong>Memory:</strong> 8 GB RAM<br></li><li><strong>Graphics:</strong> NVIDIA GeForce GTX 970 (4 GB VRAM)<br></li><li><strong>Storage:</strong> 50 GB available space</li></ul>');
assert.equal(req.ramGb, 8);
assert.equal(req.diskGb, 50);
assert.equal(req.vramGb, 4);
assert.match(req.cpu, /i5-4460/);
const v = checkReq(req, { ramGb: 16, freeGb: 30, vramGb: 12 });
assert.equal(v.checks.ram.ok, true);
assert.equal(v.checks.disk.ok, false, 'pas assez de place');
assert.equal(v.pass, false);
assert.equal(median([30, null, 10, 20]), 20);
const gog = gogGames([{ key: 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1207658924', values: { gameName: 'The Witcher', path: 'C:\\GOG\\Witcher', exe: 'witcher.exe' } }, { key: 'HKLM\\x\\GOG.com\\Games\\abc', values: { gameName: 'x', path: 'y' } }]);
assert.equal(gog.length, 1);
assert.equal(gog[0].id, 'gog:1207658924');
assert.match(gog[0].exe, /witcher\.exe$/);
const ubi = ubisoftGames([{ key: 'HKLM\\SOFTWARE\\WOW6432Node\\Ubisoft\\Launcher\\Installs\\635', values: { InstallDir: 'C:/Ubisoft/Rainbow Six Siege/' } }]);
assert.equal(ubi[0].id, 'ubisoft:635');
assert.equal(ubi[0].name, 'Rainbow Six Siege');
assert.match(scamCheck('free nitro ici https://discorcl-gift.xyz/claim'), /imite|cadeau/);
assert.match(scamCheck('va sur steamcommunitty.com/tradeoffer'), /imite|inconnu/);
assert.equal(scamCheck('https://store.steampowered.com/app/730'), null);
assert.equal(scamCheck('on lance une partie ?'), null);
const act = demoActivity();
assert.ok(streakOf(act.days) >= 9, 'démo : série affichée');
assert.ok(badges({ items: demoItems(), days: act.days, sessions: act.sessions, friends: 4 }).filter((b) => b.got).length >= 5, 'démo : badges débloqués');
assert.equal(demoTemps().length, 144);
console.log('✅ Progression, badges, config requise, magasins, arnaques, démo : 36 vérifications');
