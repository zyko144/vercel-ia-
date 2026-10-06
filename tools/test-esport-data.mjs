// Fiches e-sport : lecture des vraies pages Liquipedia (équipe, joueur, matchs) sans IA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseEvent, parseMatches, parsePlayer, parseTeam } from '../src/features/liquipedia.js';

const page = (f) => JSON.parse(gunzipSync(readFileSync(new URL(`fixtures/liquipedia/${f}.json.gz`, import.meta.url)))).parse.text;
const kc = parseTeam(page('rocketleague__Karmine_Corp'));
assert.equal(kc.team.country, 'France');
assert.ok(kc.players.some((p) => p.name === 'Vatira' && p.realName === 'Axel Touret' && p.joined === '2022-10-02'));
assert.ok(kc.titles.some((t) => t.event === 'RLCS 2026 - Paris Major'));
assert.ok(kc.matches.length >= 5 && kc.matches.every((m) => /^\d+-\d+$/.test(m.score) && m.opponent));
assert.ok(kc.news.length && /^\d{4}-\d{2}-\d{2}$/.test(kc.news[0].date));
const v = parsePlayer(page('rocketleague__Vatira'));
assert.equal(v.realName, 'Axel Touret');
assert.ok(v.settings.some((s) => s.label === 'fov' && s.value === '110'));
assert.ok(v.photo.startsWith('https://liquipedia.net/commons/images/'));
assert.equal(v.history[0].team, 'Karmine Corp');
const ms = parseMatches(page('counterstrike__Liquipedia_Matches'), Date.parse('2026-10-06T14:10:00Z'));
assert.ok(ms.length > 30 && ms.some((m) => m.finished && /^\d+-\d+$/.test(m.score)) && ms.some((m) => !m.finished));
const ev = parseEvent(page('rocketleague__Rocket_League_Championship_Series_2026'));
assert.equal(ev.winner, 'Team Falcons'); assert.equal(ev.info.prize, '$1,200,000'); assert.equal(ev.teams.length, 20);
assert.ok(ev.teams.find((t) => t.name === 'Karmine Corp')?.players.includes('Vatira'));
assert.ok(ev.matches.length > 40 && ev.matches.every((m) => m.a && m.b && m.finished));
console.log('✅ Fiches e-sport : équipe, joueur, compétition et matchs lus sur Liquipedia');
