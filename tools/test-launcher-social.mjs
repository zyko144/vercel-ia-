/**
 * Banc d'essai du côté social des comptes History Launcher : amis par code, présence, soirées jeu.
 *
 *   node tools/test-launcher-social.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.PORT = String(20000 + Math.floor(Math.random() * 20000));
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'social-'));

const { startHttpServer } = await import('../src/server.js');
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const server = startHttpServer(() => ({ discord: 'ready' }));
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${process.env.PORT}/api/compte`;
const call = (p, token, body) => fetch(`${base}/${p}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const signup = async (pseudo, n) => (await call('inscription', null, { pseudo, email: `${pseudo.toLowerCase()}@exemple.fr`, motDePasse: `Jeu-${pseudo}-${n}x` })).token;

const noam = await signup('Noam', 1);
const max = await signup('Max', 2);
const zoe = await signup('Zoe', 3);

await check('sans session : refusé', async () => {
  assert.equal((await call('amis', null)).status, 401);
});

let maxCode;
await check('code ami, demande, acceptation : amis des deux côtés', async () => {
  maxCode = (await call('amis', max)).code;
  assert.match(maxCode, /^Max#[0-9A-F]{6}$/);
  assert.equal((await call('amis/ajouter', noam, { code: 'Personne#000000' })).status, 404);
  assert.equal((await call('amis/ajouter', max, { code: maxCode })).status, 400, 'pas soi-même');
  assert.equal((await call('amis/ajouter', noam, { code: maxCode.toLowerCase() })).envoye, true);
  const inbox = await call('amis', max);
  assert.equal(inbox.demandes[0].pseudo, 'Noam');
  await call('amis/accepter', max, { id: inbox.demandes[0].id });
  assert.deepEqual((await call('amis', noam)).amis.map((a) => a.pseudo), ['Max']);
  assert.deepEqual((await call('amis', max)).amis.map((a) => a.pseudo), ['Noam']);
});

await check('présence : jeu en cours et minutes de la semaine visibles par les amis seulement', async () => {
  await call('presence', max, { playing: 'Rocket League', week: 540, top: 'Rocket League' });
  const f = (await call('amis', noam)).amis[0];
  assert.equal(f.online, true);
  assert.equal(f.playing, 'Rocket League');
  assert.equal(f.week, 540);
  assert.equal((await call('amis', zoe)).amis.length, 0, 'Zoé n’est l’amie de personne : elle ne voit rien');
  await call('presence', max, { week: 1e9 });
  assert.equal((await call('amis', noam)).amis[0].week, 10_080, 'plafonné à une semaine');
});

let evId;
await check('soirée jeu : seulement des amis invités, réponse, annulation par l’organisateur', async () => {
  const zoeId = (await call('amis', zoe)).code;
  assert.equal((await call('soirees', noam, { jeu: 'Rocket League', at: Date.now() + 3_600_000, invites: [zoeId] })).status, 400, 'Zoé n’est pas une amie');
  const maxId = (await call('amis', noam)).amis[0].id;
  const r = await call('soirees', noam, { jeu: 'Rocket League', at: Date.now() + 3_600_000, invites: [maxId] });
  assert.equal(r.status, 201);
  evId = r.soirees[0].id;
  const invit = (await call('soirees', max)).soirees[0];
  assert.equal(invit.organisateur, 'Noam');
  assert.equal(invit.ma, null);
  await call('soirees/repondre', max, { id: evId, reponse: 'oui' });
  assert.equal((await call('soirees', noam)).soirees[0].invites[0].reponse, 'oui');
  assert.equal((await call('soirees', zoe)).soirees.length, 0);
  assert.equal((await call('soirees/annuler', max, { id: evId })).status, 404, 'seul l’organisateur annule');
  await call('soirees/annuler', noam, { id: evId });
  assert.equal((await call('soirees', max)).soirees.length, 0);
});

await check('messages, « on joue ? », invitation et réponse avec de quoi rejoindre', async () => {
  const maxId = (await call('amis', noam)).amis[0].id;
  const noamId = (await call('amis', max)).amis[0].id;
  const zoeId = (await call('boite', zoe)).code;
  assert.equal((await call('messages', noam, { to: zoeId, text: 'salut' })).status, 404, 'pas amis');
  assert.equal((await call('messages', noam, { to: maxId, text: '   ' })).status, 400);
  const t0 = Date.now() - 1;
  assert.equal((await call('messages', noam, { to: maxId, text: 'On lance une partie ?' })).fil.length, 1);
  const box = await call(`boite?apres=${t0}`, max);
  assert.equal(box.items[0].type, 'msg');
  assert.equal(box.items[0].pseudo, 'Noam');
  assert.equal(box.items[0].text, 'On lance une partie ?');
  assert.equal((await call(`messages?avec=${noamId}`, max)).fil[0].text, 'On lance une partie ?');
  // Max joue sur un serveur FiveM : Noam voit de quoi rejoindre, demande à jouer, Max accepte
  await call('presence', max, { playing: 'FiveM', join: { fivem: 'abc123' }, week: 10 });
  const f = (await call('amis', noam)).amis[0];
  assert.deepEqual(f.join, { fivem: 'abc123' });
  assert.ok(f.since > 0);
  await call('presence', max, { playing: 'FiveM', join: { fivem: '<script>' }, week: 10 });
  assert.equal((await call('amis', noam)).amis[0].join, null, 'lien invalide ignoré');
  await call('presence', max, { playing: 'FiveM', join: { fivem: 'abc123' }, week: 10 });
  assert.equal((await call('inviter', noam, { to: maxId, type: 'ask' })).ok, true);
  assert.equal((await call('inviter', noam, { to: maxId, type: 'ask' })).status, 429, 'pas de spam');
  const ask = (await call('boite', max)).items.find((x) => x.type === 'ask');
  assert.equal(ask.game, 'FiveM');
  await call('inviter/repondre', max, { id: ask.id, oui: true });
  const reply = (await call('boite', noam)).items.find((x) => x.type === 'reply');
  assert.equal(reply.oui, true);
  assert.deepEqual(reply.join, { fivem: 'abc123' });
  // Invitation de Noam (Steam) → Max accepte et reçoit le lien
  await call('inviter', noam, { to: maxId, type: 'invite', game: 'Rocket League', join: { steam: '252950' } });
  const inv = (await call('boite', max)).items.find((x) => x.type === 'invite');
  assert.deepEqual((await call('inviter/repondre', max, { id: inv.id, oui: true })).join, { steam: '252950' });
});

await check('retirer un ami : des deux côtés', async () => {
  const maxId = (await call('amis', noam)).amis[0].id;
  await call('amis/retirer', noam, { id: maxId });
  assert.equal((await call('amis', max)).amis.length, 0);
});

server.close();
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
