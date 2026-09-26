/**
 * Banc d'essai de l'arcade (Activité Discord) : sessions, salle commune, dessin, morpion, puissance 4.
 *
 *   node tools/test-arcade-web.mjs            (--serve : garde le serveur ouvert sur le port 8814)
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'arcade-web-'));
// Pas d'IA pendant le test : le quiz prend ses questions de secours
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o) => (String(url).includes('generativelanguage') ? { ok: false, status: 500, json: async () => ({}), text: async () => 'non' } : realFetch(url, o));

const arcade = await import('../src/arcade/server.js');
const economy = await import('../src/features/economy.js');
const { Collection } = await import('discord.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

const G = '444444444444444444';
const ROOM = '555555555555555555';
const A = { id: '222222222222222222', name: 'Lina' };
const B = { id: '333333333333333333', name: 'Sami' };
const C = { id: '666666666666666666', name: 'Noa' };
const members = new Collection([[A.id, {}], [B.id, {}], [C.id, {}]]);
arcade.setArcadeClient({
  user: { id: '999999999999999999', username: 'History IA' },
  guilds: { cache: new Collection([[G, { id: G, members: { fetch: async (id) => members.get(id) ?? null } }]]) },
  users: { fetch: async () => null },
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!(await arcade.handleArcadeWeb(req, res, url))) { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(process.argv.includes('--serve') ? 8814 : 0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const tokens = Object.fromEntries([A, B, C].map((u) => [u.id, arcade.createSession(u)]));
const call = async (who, route, { method = 'GET', body, query = {} } = {}) => {
  const q = new URLSearchParams({ room: ROOM, guild: G, ...query });
  const res = await fetch(`${base}/arcade/api/${route}?${q}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who.id]}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
};
const act = (who, body) => call(who, 'act', { method: 'POST', body });
const poll = (who, query = {}) => call(who, 'poll', { query: { since: 0, ...query } });

await check('pages : index, script, SDK, police ; session obligatoire pour l’API', async () => {
  const page = await fetch(`${base}/arcade/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors/);
  assert.match(await page.text(), /app\.js/);
  assert.equal((await fetch(`${base}/.proxy/arcade/app.js`)).status, 200, 'derrière le relais de Discord');
  assert.equal((await fetch(`${base}/arcade/sdk.js`)).status, 200);
  assert.equal((await fetch(`${base}/arcade/fonts/cinzel.ttf`)).status, 200);
  assert.equal((await fetch(`${base}/arcade`, { redirect: 'manual' })).status, 302);
  const denied = await fetch(`${base}/arcade/api/poll?room=${ROOM}`, { headers: { Authorization: 'Bearer faux.jeton' } });
  assert.equal(denied.status, 401);
  assert.equal(arcade.readSession(`${tokens[A.id]}x`), null, 'signature vérifiée');
});

await check('salle : les joueurs du salon se retrouvent, le long polling répond au changement', async () => {
  const a = await poll(A);
  assert.equal(a.status, 200);
  assert.equal(a.data.players.length, 1);
  const waiting = poll(A, { since: a.data.seq });
  await new Promise((r) => setTimeout(r, 100));
  await poll(B);
  const woke = await waiting;
  assert.equal(woke.data.players.length, 2, 'réveillé par l’arrivée de Sami');
  assert.equal(woke.data.host, A.id);
});

await check('dessin : mot choisi, traits partagés, bonne réponse, points, indices cachés', async () => {
  await poll(C);
  const started = await act(A, { type: 'start', game: 'dessin' });
  assert.equal(started.status, 200);
  let s = (await poll(A)).data;
  const drawer = s.game.drawer;
  const [d, g1, g2] = [A, B, C].sort((x) => (x.id === drawer ? -1 : 1));
  s = (await poll(d)).data;
  assert.equal(s.game.phase, 'choose');
  assert.equal(s.game.choices.length, 3);
  assert.equal((await poll(g1)).data.game.choices, null, 'les autres ne voient pas les mots');
  await act(d, { type: 'choose', i: 1 });
  const word = s.game.choices[1];
  const seen = (await poll(g1)).data;
  assert.equal(seen.game.phase, 'draw');
  assert.equal(seen.game.word, null);
  assert.ok(/^[_ \-’']+$/.test(seen.game.hint), `indice masqué (${seen.game.hint})`);
  assert.equal((await act(g1, { type: 'stroke', id: 'x', pts: [[0.1, 0.1]], c: '#000000', s: 4 })).status, 200);
  await act(d, { type: 'stroke', id: 's1', pts: [[0.1, 0.1], [0.5, 0.5]], c: '#8c1c13', s: 6 });
  await act(d, { type: 'stroke', id: 's1', pts: [[0.5, 0.5], [0.9, 0.2]], c: '#8c1c13', s: 6 });
  let c = (await poll(g1)).data.canvas;
  assert.equal(c.total, 2, 'seul le dessinateur dessine');
  c = (await poll(g1, { epoch: c.epoch, ops: 1 })).data.canvas;
  assert.equal(c.from, 1);
  assert.equal(c.ops.length, 1, 'seulement les nouveaux traits');
  await act(d, { type: 'undo' });
  assert.equal((await poll(g1)).data.canvas.ops.at(-1).undo, 's1');
  await act(g1, { type: 'chat', text: 'bateau pirate volant' });
  await act(g1, { type: 'chat', text: word.toUpperCase() });
  s = (await poll(g1)).data;
  assert.ok(s.game.guessed.includes(g1.id));
  assert.equal(s.game.word, word, 'celui qui a trouvé voit le mot');
  assert.ok(s.game.scores[g1.id] >= 100, 'premier à trouver : bonus');
  assert.equal(s.game.scores[d.id], 25);
  assert.ok(!s.chat.some((m) => m.kind === 'msg' && m.text.toUpperCase() === word.toUpperCase()), 'la réponse n’apparaît pas dans le chat');
  await act(g2, { type: 'chat', text: word });
  s = (await poll(g2)).data;
  assert.equal(s.game.phase, 'reveal', 'tout le monde a trouvé');
});

await check('dessin : tours suivants puis fin de partie, gagnant payé en or', async () => {
  const room = arcade._test.rooms.get(ROOM);
  const g = room.game;
  let guard = 0;
  while (room.game?.kind === 'dessin' && guard++ < 20) {
    room.game.endsAt = 0;
    // Le minuteur avance tout seul chaque seconde
    await new Promise((r) => setTimeout(r, 1100));
  }
  assert.equal(room.game.kind, 'fin');
  assert.equal(room.game.podium.length, 3);
  await new Promise((r) => setTimeout(r, 100));
  const [winner] = room.game.podium[0];
  assert.ok(economy._test.purse(G, winner).gold >= 80, 'récompense');
  assert.ok(g.order.length === 3);
});

await check('morpion : places, tours, victoire, revanche', async () => {
  await act(A, { type: 'start', game: 'morpion' });
  let s = (await poll(C)).data;
  assert.deepEqual(s.game.seats, [A.id, B.id]);
  assert.equal((await act(C, { type: 'play', i: 0 })).status, 200);
  assert.deepEqual((await poll(C)).data.game.board, Array(9).fill(null), 'un spectateur ne joue pas');
  for (const [who, i] of [[A, 0], [B, 3], [A, 1], [B, 4], [A, 2]]) await act(who, { type: 'play', i });
  s = (await poll(B)).data;
  assert.equal(s.game.winner, A.id);
  assert.deepEqual(s.game.line, [0, 1, 2]);
  assert.equal((await act(C, { type: 'start', game: 'morpion' })).status, 200, 'revanche possible après la fin');
});

await check('puissance 4 : jetons qui tombent, 4 en diagonale', async () => {
  const room = arcade._test.rooms.get(ROOM);
  room.game = null;
  await act(B, { type: 'start', game: 'puissance4' });
  const moves = [[B, 0], [A, 1], [B, 1], [A, 2], [B, 2], [A, 3], [B, 2], [A, 3], [B, 3], [A, 6], [B, 3]];
  for (const [who, i] of moves) await act(who, { type: 'play', i });
  const s = (await poll(A)).data;
  assert.equal(s.game.winner, B.id);
  assert.equal(s.game.line.length, 4);
});

await check('duel contre le bot (bataille navale) : ma flotte visible, pas celle du bot, le bot joue seul', async () => {
  const room = arcade._test.rooms.get(ROOM);
  room.game = null;
  await act(A, { type: 'start', game: 'duel', duel: 'navale' });
  let s = (await poll(A)).data;
  assert.equal(s.game.kind, 'duel');
  assert.equal(s.game.phase, 'wait');
  await act(A, { type: 'bot' });
  s = (await poll(A)).data;
  assert.equal(s.game.phase, 'play');
  assert.equal(s.game.mine.filter((c) => c === 'ship').length, 7, 'ma flotte');
  assert.equal(s.game.target.filter((c) => c === 'ship').length, 0, 'flotte adverse cachée');
  const g = room.game;
  // La flotte du bot sur les 7 premières cases : touché = on rejoue, donc la partie se termine vite
  g.d.state.fleets.bot = [0, 1, 2, 3, 4, 5, 6];
  let guard = 0;
  while (!g.d.over && guard++ < 120) {
    if (g.d.turn === A.id) {
      const free = g.d.state.shots[A.id].length;
      const next = [...Array(25).keys()].find((i) => !g.d.state.shots[A.id].includes(i));
      await act(A, { type: 'play', arg: next });
      assert.ok(g.d.state.shots[A.id].length > free || g.d.over);
    } else await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(g.d.over, true, 'partie finie');
});

await check('quiz de groupe : questions, une réponse par joueur, fin et podium', async () => {
  const room = arcade._test.rooms.get(ROOM);
  room.game = null;
  await act(A, { type: 'start', game: 'quiz' });
  let s;
  for (let k = 0; k < 20; k++) { await new Promise((r) => setTimeout(r, 300)); s = (await poll(A)).data; if (s.game.phase === 'question') break; }
  assert.equal(s.game.phase, 'question');
  assert.equal(s.game.choices.length, 4);
  assert.equal(s.game.right, null, 'la réponse reste cachée pendant la question');
  const q = room.game.questions[room.game.i];
  await act(A, { type: 'answer', i: q.bonne });
  await act(A, { type: 'answer', i: (q.bonne + 1) % 4 });
  assert.equal(room.game.answers[A.id], q.bonne, 'une seule réponse');
  room.game.questions = room.game.questions.slice(0, room.game.i + 1);
  await act(B, { type: 'answer', i: (q.bonne + 1) % 4 });
  for (let k = 0; k < 12 && room.game.kind !== 'fin'; k++) { room.game.endsAt = 0; await new Promise((r) => setTimeout(r, 1100)); }
  assert.equal(room.game.kind, 'fin');
  assert.equal(room.game.podium[0][0], A.id);
});

await check('pendu et devine le nombre : tout le salon joue ensemble', async () => {
  const room = arcade._test.rooms.get(ROOM);
  room.game = null;
  await act(A, { type: 'start', game: 'pendu' });
  const word = room.game.word;
  for (const c of new Set(word.replace(/ /g, ''))) await act(c.charCodeAt(0) % 2 ? A : B, { type: 'letter', letter: c });
  let s = (await poll(B)).data;
  assert.equal(s.game.over, true);
  assert.equal(s.game.word, word);
  await act(A, { type: 'start', game: 'nombre' });
  const secret = room.game.secret;
  await act(B, { type: 'guess', n: secret === 500 ? 400 : 500 });
  s = (await poll(A)).data;
  assert.equal(s.game.secret, null, 'le nombre reste caché');
  assert.equal(s.game.tries[0].hint, secret > 500 ? 'plus' : secret < 500 ? 'moins' : 'plus');
  await act(A, { type: 'guess', n: secret });
  assert.equal(room.game.winner, A.id);
});

await check('taverne en or (pile ou face, blackjack) et démineur, chacun sa partie', async () => {
  economy._test.purse(G, A.id).gold = 5000;
  economy._test.purse(G, B.id).gold = 5;
  const realRandom = Math.random;
  Math.random = () => 0.1;
  assert.equal((await act(A, { type: 'solo', game: 'pile', bet: 1000, side: 'pile' })).status, 200);
  Math.random = realRandom;
  let s = (await poll(A)).data;
  assert.equal(s.solo.game, 'pile');
  assert.equal(s.gold, 5900);
  assert.equal((await poll(B)).data.solo, null, 'Sami ne voit pas la partie de Lina');
  assert.match((await act(B, { type: 'solo', game: 'pile', bet: 100, side: 'face' })).data.error, /Pas assez/);
  await act(A, { type: 'solo', game: 'blackjack', action: 'new', bet: 100 });
  s = (await poll(A)).data;
  assert.equal(s.solo.game, 'blackjack');
  if (!s.solo.done) {
    assert.equal(s.solo.dealer[1], '?', 'carte cachée du capitaine');
    await act(A, { type: 'solo', game: 'blackjack', action: 'stand' });
    assert.equal((await poll(A)).data.solo.done, true);
  }
  await act(A, { type: 'solo', game: 'demineur', action: 'new', level: 'facile' });
  await act(A, { type: 'solo', game: 'demineur', action: 'open', i: 27 });
  s = (await poll(A)).data;
  assert.equal(s.solo.game, 'demineur');
  assert.ok(s.solo.cells[27] !== null && s.solo.cells[27] !== -1, 'la première case n’est jamais une mine');
  assert.ok(s.solo.cells.filter((c) => c === -1).length === 0 || s.solo.over, 'les mines restent cachées');
});

await check('jeux de soirée : lancés et joués dans l’arcade (jeu inconnu refusé, l’hôte peut arrêter)', async () => {
  assert.equal((await act(A, { type: 'start', game: 'party', party: 'inconnu' })).data.error, 'Jeu inconnu.');
  await act(A, { type: 'lobby' });
  assert.equal((await act(A, { type: 'start', game: 'party', party: 'chasse' })).status, 200);
  const s = (await poll(B)).data;
  assert.equal(s.game.kind, 'party');
  assert.equal(s.game.game, 'chasse');
  assert.ok(s.game.screen.title);
  await act(A, { type: 'lobby' });
  assert.equal((await poll(A)).data.game, null);
});

await check('départ : un joueur silencieux quitte la salle', async () => {
  const room = arcade._test.rooms.get(ROOM);
  room.players.get(C.id).seen = Date.now() - 60_000;
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(room.players.has(C.id), false);
});

console.log(`\n${passed} vérifications passées.`);
if (process.argv.includes('--serve')) {
  console.log(`Arcade : ${base}/arcade/?room=${ROOM}&guild=${G}#s=${tokens[A.id]}`);
  console.log(`Joueur 2 : ${base}/arcade/?room=${ROOM}&guild=${G}#s=${tokens[B.id]}`);
} else process.exit(0);
