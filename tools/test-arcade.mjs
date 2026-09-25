/**
 * Banc d'essai des nouveaux jeux : duels (mises, tours, bot), taverne (or), défis.
 *
 *   node tools/test-arcade.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.OWNER_ID = '111111111111111111';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'arcade-'));
// Pas d'IA pendant le test : les jeux prennent leurs questions de secours
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o) => (String(url).includes('generativelanguage') ? { ok: false, status: 500, json: async () => ({}), text: async () => 'non' } : realFetch(url, o));

const { Collection } = await import('discord.js');
const duels = await import('../src/games/duels.js');
const tripot = await import('../src/games/tripot.js');
const defis = await import('../src/games/defis.js');
const economy = await import('../src/features/economy.js');
const { setGuildSettings } = await import('../src/features/guildConfig.js');
const { routeGameMessage } = await import('../src/games/common.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

const G = '444444444444444444';
const A = '222222222222222222';
const B = '333333333333333333';
const BOT = '999999999999999999';
const GAMES = '555555555555555555';
duels._test.speed.bot = 20;
duels._test.speed.hide = 30;
await economy.data();
setGuildSettings(G, { 'games.channelId': GAMES });

const posted = [];
const makeMsg = (p) => {
  const m = { ...p, id: `m${posted.length}`, url: 'https://discord.com/x', edits: [], edit: async (x) => { m.edits.push(x); m.last = x; return m; }, react: async () => {}, startThread: undefined };
  m.last = p;
  return m;
};
const channel = { id: GAMES, type: 0, isTextBased: () => true, send: async (p) => { const m = makeMsg(typeof p === 'string' ? { content: p } : p); posted.push(m); return m; }, messages: { fetch: async () => null } };
const guild = { id: G, name: 'Navire', channels: { cache: new Collection([[GAMES, channel]]) }, members: { cache: new Collection() } };
const client = { user: { id: BOT, bot: true }, channels: { cache: new Collection([[GAMES, channel]]), fetch: async () => channel } };
const user = (id) => ({ id, username: `u${id.slice(0, 2)}`, bot: false });
const inter = (id, extra = {}) => {
  const i = {
    user: user(id), guild, guildId: G, channelId: GAMES, channel, client, replies: [],
    reply: async (p) => { i.replies.push(p); i.replied = true; return p; },
    editReply: async (p) => { i.replies.push(p); return p; },
    update: async (p) => { i.replies.push(p); i.updated = p; return p; },
    deferUpdate: async () => {}, showModal: async (m) => i.replies.push({ modal: m }),
    ...extra,
  };
  return i;
};
const gold = (id) => economy._test.purse(G, id).gold;
const setGold = (id, n) => { economy._test.purse(G, id).gold = n; };
const lastDuel = () => [...duels._test.duels.values()].at(-1);
const click = async (who, d, action, arg = '') => duels.handleDuelComponent(inter(who, { customId: `g:duel:${d.id}:${action}${arg !== '' ? `:${arg}` : ''}`, message: d.message }));

await check('morpion : défi avec mise, acceptation, victoire, pot payé (5 % au coffre)', async () => {
  setGold(A, 5000); setGold(B, 5000);
  await duels.startDuel(inter(A), 'morpion', { opponent: user(B), bet: 1000 });
  const d = lastDuel();
  assert.equal(d.phase, 'invite');
  await click(A, d, 'accept');
  assert.equal(d.phase, 'invite', 'on n’accepte pas son propre défi');
  await click(B, d, 'accept');
  assert.equal(d.phase, 'play');
  assert.equal(gold(A), 4000);
  assert.equal(gold(B), 4000);
  const x = d.turn;
  const o = x === A ? B : A;
  const chest = economy._test.meta(G).chest;
  for (const [who, cell] of [[x, 0], [o, 3], [x, 1], [o, 4], [x, 2]]) await click(who, d, 'play', cell);
  assert.equal(d.winner, x);
  assert.equal(d.over, true);
  assert.equal(gold(x), 4000 + 1900 + 50, 'pot + gain de partie');
  assert.equal(economy._test.meta(G).chest, chest + 100);
});

await check('morpion : ce n’est pas ton tour, case prise, abandon', async () => {
  await duels.startDuel(inter(A), 'morpion', { opponent: user(B) });
  const d = lastDuel();
  await click(B, d, 'accept');
  const notTurn = d.turn === A ? B : A;
  const i = inter(notTurn, { customId: `g:duel:${d.id}:play:4` });
  await duels.handleDuelComponent(i);
  assert.match(i.replies[0].content, /pas ton tour/);
  await click(d.turn, d, 'play', 4);
  const again = inter(d.turn, { customId: `g:duel:${d.id}:play:4` });
  await duels.handleDuelComponent(again);
  assert.match(again.replies[0].content, /déjà prise/);
  await click(A, d, 'forfeit');
  assert.equal(d.winner, B);
});

await check('contre le bot : il joue tout seul (morpion, allumettes, puissance 4, memory, navale, pfc, abordage)', async () => {
  for (const kind of ['morpion', 'allumettes', 'puissance4', 'memory', 'navale', 'pfc', 'abordage']) {
    await duels.startDuel(inter(A), kind, { opponent: client.user, bet: 500 });
    const d = lastDuel();
    assert.equal(d.phase, 'play', kind);
    assert.equal(d.bet, 0, 'pas de mise contre le bot');
    let guard = 0;
    while (!d.over && guard++ < 200) {
      const g = duels.DUEL_GAMES[kind];
      if (g.settle?.(d)) continue;
      if (d.turn === d.botId && !g.simultaneous) { await new Promise((r) => setTimeout(r, 30)); continue; }
      const move = g.ai({ ...d, botId: A });
      await click(A, d, 'play', move);
      await new Promise((r) => setTimeout(r, 80));
    }
    assert.equal(d.over, true, `${kind} terminé`);
  }
});

await check('règles : puissance 4 en diagonale, flotte de 7 cases, allumettes', async () => {
  const g = Array.from({ length: 6 }, () => Array(7).fill(null));
  g[5][0] = 'R'; g[4][1] = 'R'; g[3][2] = 'R'; g[2][3] = 'R';
  assert.equal(duels._test.p4Winner(g), 'R');
  for (let i = 0; i < 50; i++) assert.equal(new Set(duels._test.placeFleet()).size, 7);
  assert.equal(duels._test.winner3(['X', 'O', null, 'O', 'X', null, null, null, 'X']), 'X');
});

await check('duel de rimes : l’IA indisponible, le jury de secours tranche', async () => {
  await duels.startDuel(inter(A), 'rimes', { opponent: user(B) });
  const d = lastDuel();
  await click(B, d, 'accept');
  const write = (who, text) => duels.handleDuelComponent(inter(who, { customId: `g:duel:${d.id}:rhyme`, fields: { getTextInputValue: () => text } }));
  await write(A, 'ligne une\nligne deux\nligne trois');
  await write(B, 'une seule ligne');
  assert.equal(d.over, true);
  assert.equal(d.winner, A);
});

await check('taverne : pile ou face, dés, machine à sous, roue (mises et coffre)', async () => {
  setGold(A, 10_000);
  const realRandom = Math.random;
  Math.random = () => 0.1; // pile
  await tripot.coinFlip(inter(A), { bet: 1000, side: 'pile' });
  assert.equal(gold(A), 10_000 + 900);
  const chest = economy._test.meta(G).chest;
  await new Promise((r) => setTimeout(r, 3100));
  await tripot.coinFlip(inter(A), { bet: 1000, side: 'face' });
  assert.equal(gold(A), 9900);
  assert.equal(economy._test.meta(G).chest, chest + 1000, 'mise perdue au coffre');
  Math.random = realRandom;
  const slow = inter(A);
  await tripot.coinFlip(slow, { bet: 1000, side: 'face' });
  assert.match(slow.replies[0].embeds[0].toJSON().description, /Doucement/);
  const poor = inter(B);
  setGold(B, 5);
  await tripot.diceDuel(poor, { bet: 100 });
  assert.match(poor.replies[0].embeds[0].toJSON().description, /Il te faut/);
  assert.equal(tripot.slotPayout(['🏴‍☠️', '🏴‍☠️', '🏴‍☠️']), 100);
  assert.equal(tripot.slotPayout(['🍒', '🍋', '🍒']), 1.5);
  assert.equal(tripot.slotPayout(['🍒', '🍋', '⚓']), 0);
  const ev = tripot.WHEEL.reduce((a, b) => a + b, 0) / tripot.WHEEL.length;
  assert.ok(ev < 1 && ev > 0.9, 'la roue rend un peu moins que la mise');
});

await check('blackjack : valeur des mains, tirer, rester, doubler', async () => {
  assert.equal(tripot.handValue(['A♠', 'R♥']), 21);
  assert.equal(tripot.handValue(['A♠', 'A♥', '9♦']), 21);
  assert.equal(tripot.handValue(['10♠', '9♥', '5♦']), 24);
  setGold(B, 5000);
  await new Promise((r) => setTimeout(r, 3100));
  const i = inter(B);
  await tripot.blackjack(i, { bet: 500 });
  const t = [...tripot._test.tables.values()].at(-1);
  if (t) {
    // Main forcée : 10 + 9 contre 10 + 7 → rester gagne
    t.hand = ['10♠', '9♥']; t.dealer = ['10♦', '7♣'];
    const before = gold(B);
    await tripot.handleTripotComponent(inter(B, { customId: `g:tp:${t.id}:stand` }));
    assert.equal(gold(B), before + 1000);
    assert.equal(tripot._test.tables.has(t.id), false);
  }
});

await check('démineur : la bonne quantité de mines', async () => {
  const grid = tripot.minesweeper(8, 10);
  assert.equal((grid.match(/💣/g) ?? []).length, 10);
  assert.equal(grid.split('\n').length, 8);
});

await check('pendu et devine le nombre : réponses lues dans le salon des jeux', async () => {
  const realRandom = Math.random;
  Math.random = () => 0; // premier mot de la liste, nombre = 1
  await tripot.startHangman(inter(A));
  Math.random = realRandom;
  const word = tripot._test.WORDS[0];
  const before = gold(A);
  routeGameMessage({ channelId: GAMES, author: { id: A, bot: false, toString: () => `<@${A}>` }, content: word, react: async () => {} });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(tripot._test.channelGames.has(GAMES), false, 'partie finie');
  assert.ok(gold(A) >= before + 60);
  Math.random = () => 0;
  await tripot.startGuessNumber(inter(B));
  Math.random = realRandom;
  const higher = [];
  routeGameMessage({ channelId: GAMES, author: { id: B, bot: false }, content: '500', react: async (e) => higher.push(e) });
  assert.deepEqual(higher, ['🔽']);
  routeGameMessage({ channelId: GAMES, author: { id: B, bot: false, toString: () => `<@${B}>` }, content: '1', react: async () => {} });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(tripot._test.channelGames.has(GAMES), false);
});

await check('défis : questions de secours, grille de mots croisés, réponses tolérantes', async () => {
  const qs = await defis._test.quizQuestions('', 5);
  assert.equal(qs.length, 5);
  for (const q of qs) assert.equal(q.choix.length, 4);
  const grid = defis._test.crosswordGrid([{ mot: 'ancre', shown: [0] }, { mot: 'vigie', shown: [] }], [null, B]);
  assert.match(grid, /🇦/);
  assert.equal((grid.split('\n')[0].match(/⬜/g) ?? []).length, 4);
  assert.ok(defis._test.same('Boussole', 'boussole'));
  assert.ok(defis._test.same('ile  deserte', 'île déserte'));
  assert.ok(!defis._test.same('bou', 'boussole'));
});

await check('quiz du jour : publié à 18 h, une réponse par membre, payé à la clôture', async () => {
  const RealDate = Date;
  const at = new RealDate('2026-09-25T17:30:00Z'); // 19 h 30 à Paris
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [at])); } static now() { return at.getTime(); } };
  await defis.dailyQuizTick({ guilds: { cache: new Collection([[G, guild]]) } });
  global.Date = RealDate;
  const state = defis._test.dailyState()[G];
  assert.equal(state.open, true);
  const right = state.q.bonne;
  const ans = (who, n) => defis.handleDefiComponent(inter(who, { customId: `g:df:daily:${G}:${n}` }));
  await ans(A, right);
  const twice = inter(A, { customId: `g:df:daily:${G}:${right}` });
  await defis.handleDefiComponent(twice);
  assert.match(twice.replies[0].content, /déjà/);
  await ans(B, (right + 1) % 4);
  const before = gold(A);
  const bBefore = gold(B);
  await defis._test.closeDailyQuiz(guild, state);
  assert.equal(gold(A), before + 100);
  assert.equal(gold(B), bBefore);
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
