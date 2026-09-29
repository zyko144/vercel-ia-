// Rocket League en direct (API officielle du jeu + profil) et couleur des FPS de l'overlay.
import assert from 'node:assert/strict';
import { classifyAll, enableStatsIni, trackerPage, jsonStream, matchTracker, parseTracker, rlSummary, trackerUrl } from '../src/core/rocketleague.js';
import { fpsTone } from '../src/core/prelaunch.js';

// Flux TCP : messages collés, coupés en plein milieu, accolades dans les textes
const got = [];
const feed = jsonStream((o) => got.push(o));
feed('{"Event":"A","Data":{"Name":"a}b"}}{"Event":"B"');
feed(',"Data":{}}{"Ev');
feed('ent":"C"}');
assert.deepEqual(got.map((o) => o.Event), ['A', 'B', 'C']);
assert.equal(got[0].Data.Name, 'a}b');

// Match : notre équipe reconnue par l'identifiant Epic, victoire 3-2 en 3v3 ; replay et match quitté ignorés
const players = (me) => [
  { Name: 'Neyko.', PrimaryId: `Epic|${me}|0`, TeamNum: 0 }, { Name: 'A', PrimaryId: 'Epic|x|0', TeamNum: 0 }, { Name: 'B', PrimaryId: 'Steam|1|0', TeamNum: 0 },
  { Name: 'C', PrimaryId: 'Epic|y|0', TeamNum: 1 }, { Name: 'D', PrimaryId: 'Epic|z|0', TeamNum: 1 }, { Name: 'E', PrimaryId: 'Epic|w|0', TeamNum: 1 },
];
const state = (score0, score1, extra = {}) => ({ Event: 'UpdateState', Data: JSON.stringify({ MatchGuid: 'g1', Players: players('abc123'), Game: { Teams: [{ TeamNum: 0, Score: score0 }, { TeamNum: 1, Score: score1 }], ...extra } }) });
const t = matchTracker({ ids: ['ABC123'] });
assert.equal(t.event(state(2, 2)), null);
assert.deepEqual(t.player, { name: 'Neyko.', platform: 'epic', id: 'abc123' });
t.event(state(3, 2));
t.event(state(0, 0, { bReplay: true }));
const res = t.event({ Event: 'MatchEnded', Data: { WinnerTeamNum: 0 } });
assert.equal(res.win, true); assert.equal(res.us, 3); assert.equal(res.them, 2); assert.equal(res.mode, '3v3');
t.event(state(0, 1));
t.event({ Event: 'MatchDestroyed', Data: {} });
assert.equal(t.event({ Event: 'MatchEnded', Data: { WinnerTeamNum: 1 } }), null, 'match quitté avant la fin : pas compté');

// Série et bilan du jour (du plus récent au plus ancien)
const now = Date.parse('2026-09-29T20:00:00');
const games = [{ win: true, at: now - 1e5, mode: '2v2', ranked: true, mmr: 9 }, { win: true, at: now - 2e5, mode: '3v3', ranked: false }, { win: false, at: now - 3e5, mode: '2v2', ranked: true, mmr: -8 }, { win: true, at: now - 90_000_000, mode: '1v1', ranked: true, mmr: 10 }];
const sum = rlSummary(games, now);
assert.deepEqual([sum.streak, sum.wins, sum.losses, sum.net], [2, 2, 1, 1], 'net = MMR du jour');
assert.deepEqual(sum.modes, { ranked: { '2v2': [1, 1] }, casual: { '3v3': [1, 0] }, all: { '2v2': [1, 1], '3v3': [1, 0] } }, 'chaque mode a ses compteurs, hier non compté');
assert.equal(rlSummary([{ win: false, at: now }, { win: false, at: now }], now).streak, -2);

// Profil : rang et MMR par mode classé
const p = parseTracker({ data: { platformInfo: { platformUserHandle: 'Neyko.', avatarUrl: 'https://a/x.png' }, segments: [
  { type: 'overview', attributes: {}, stats: {} },
  { type: 'playlist', attributes: { playlistId: 13 }, stats: { rating: { value: 1342 }, tier: { metadata: { name: 'Champion II', iconUrl: 'https://i/c2.png' } }, division: { metadata: { name: 'Division III' } } } },
  { type: 'playlist', attributes: { playlistId: 11 }, stats: { rating: { value: 1180 }, matchesPlayed: { value: 40 }, tier: { metadata: { name: 'Champion I' } }, division: { metadata: { name: 'Division I' } } } },
  { type: 'playlist', attributes: { playlistId: 3 }, stats: { rating: { value: 900 }, matchesPlayed: { value: 7 } } },
] } });
assert.deepEqual(p.ranked['3v3'], { mmr: 1342, played: null, tier: 'Champion II', division: 'Division III', icon: 'https://i/c2.png' });
assert.deepEqual(p.casual['3v3'], { mmr: 900, played: 7 });
// Classé ou occa : les parties jouées de chaque mode entre deux lectures du profil ; rien n'est perdu
const before = { ...structuredClone(p), at: 100_000 }; const after = structuredClone(p);
after.ranked['2v2'] = { ...after.ranked['2v2'], mmr: 1172, played: 41 }; after.casual['3v3'].played = 8;
const played = [{ mode: '3v3', at: 300_000 }, { mode: '2v2', at: 200_000 }, { mode: '1v1', at: 250_000 }, { mode: '2v2', at: 10, ranked: null }];
assert.equal(classifyAll(played, before, after), 2);
assert.deepEqual(played.map((g) => [g.ranked, g.mmr]), [[false, undefined], [true, -8], [undefined, undefined], [null, undefined]], 'classé perdu -8, occa gagnée, 1v1 inconnue gardée, partie d’avant la lecture ignorée');
assert.equal(classifyAll(played, null, after), 0, 'sans lecture d’avant : on ne devine pas');
assert.equal(p.ranked['2v2'].mmr, 1180);
assert.equal(trackerUrl({ platform: 'epic', name: 'Neyko.' }), 'https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/Neyko.');
assert.equal(trackerUrl(null), null);
assert.equal(trackerPage({ platform: 'epic', name: 'Neyko.' }), 'https://rocketleague.tracker.network/rocket-league/profile/epic/Neyko./overview');
assert.match(trackerUrl({ platform: 'steam', id: '7656', name: 'x' }), /steam\/7656$/);
assert.match(trackerUrl({ platform: 'ps4', name: 'Neyko' }), /psn\/Neyko$/);

// Fichier de l'API du jeu : activée sans toucher au reste ; rien si déjà active
const ini = '[TAGame.MatchStatsExporter_TA]\r\nPort=49123\r\nPacketSendRate=0\r\n';
assert.match(enableStatsIni(ini), /PacketSendRate=30/);
assert.equal(enableStatsIni(enableStatsIni(ini)), null);

// Couleur des FPS : vert, orange en baisse, rouge trop bas
assert.equal(fpsTone(880, [900, 890], 870), 'good');
assert.equal(fpsTone(700, [], 870), 'down');
assert.equal(fpsTone(400, [], 870), 'bad');
assert.equal(fpsTone(40, [], null), 'bad');
assert.equal(fpsTone(null), null);
console.log('✅ Rocket League en direct (flux, match, série, rang/MMR, API du jeu) et couleur des FPS');
