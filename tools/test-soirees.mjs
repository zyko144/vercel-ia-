/**
 * Banc d'essai des jeux de soirée : points du Petit Bac, pendu musical, votes et réponses.
 * Gemini est simulé.
 *
 *   npm run test:soirees
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY = 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'soirees-'));

let answer = '{}';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = typeof url === 'string' ? url : url?.url ?? String(url);
  if (!href.includes('googleapis')) return realFetch(url, init);
  return new Response(JSON.stringify({ id: 'x', status: 'completed', output_text: answer, outputs: [{ type: 'text', text: answer }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { _test, handleSoireeComponent } = await import('../src/games/soirees.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const sent = [];
const thread = { id: 't', send: async (p) => { sent.push(p); return { edit: async () => {} }; } };

await check('Petit Bac : unique 2 pts, partagé 1 pt, mauvaise lettre 0, avis de l’IA respecté', async () => {
  const game = { thread, letter: 'P', round: 1, categories: ['Prénom', 'Pays ou ville', 'Animal', 'Métier', 'Objet'], scores: new Map([['a', 0], ['b', 0]]),
    answers: new Map([['a', ['Paul', 'Paris', 'Panda', 'Pompier', 'Poubelle']], ['b', ['Pierre', 'Paris', 'Mouton', 'Pilote', 'Pizzzzza']]]) };
  answer = JSON.stringify({ joueurs: [{ id: 'a', valides: [true, true, true, true, true] }, { id: 'b', valides: [true, true, false, true, false] }] });
  await _test.scoreBac(game);
  assert.equal(game.scores.get('a'), 2 + 1 + 2 + 2 + 2, 'Paris partagé');
  assert.equal(game.scores.get('b'), 2 + 1 + 0 + 2 + 0, 'Mouton : mauvaise lettre, Pizzzzza refusé par l’IA');
});

await check('pendu : titre nettoyé et lettres masquées', async () => {
  assert.equal(_test.cleanTitle('Bande organisée (feat. Jul)'), 'Bande organisée');
  assert.equal(_test.masked('Tchikita', new Set(['t', 'a'])), 'T ＿ ＿ ＿ ＿ ＿ T A');
});

await check('votes, validations et réponses : seuls les bons joueurs, une fois', async () => {
  const replies = [];
  const game = { id: 'z', players: ['a', 'b', 'c'], alive: ['a', 'b', 'c'], votes: new Map(), names: new Map([['b', 'Bob']]), answers: new Map(), right: 2, validations: new Map(), current: 'a', wake: () => { game.woke = true; } };
  _test.games.set('z', game);
  const click = (userId, customId, extra = {}) => handleSoireeComponent({ user: { id: userId }, customId, reply: async (p) => replies.push(p), deferUpdate: async () => {}, ...extra });
  await click('x', 'g:ng:z:vote', { values: ['b'] });
  assert.match(replies.at(-1).content, /Seuls les joueurs/);
  for (const id of ['a', 'b', 'c']) await click(id, 'g:ng:z:vote', { values: ['b'] });
  assert.ok(game.woke, 'tout le monde a voté : le tour se termine');
  await click('a', 'g:ng:z:ok:yes');
  assert.match(replies.at(-1).content, /autres joueurs/);
  await click('b', 'g:ng:z:qa:2');
  await click('c', 'g:ng:z:qa:1');
  await click('b', 'g:ng:z:qa:0');
  assert.equal(game.answers.get('b'), 2, 'la première réponse compte');
  assert.equal(game.firstRight, 'b');
});

globalThis.fetch = realFetch;
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
