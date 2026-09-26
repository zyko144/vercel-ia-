/**
 * Banc d'essai des comptes History Launcher : inscription, connexion, sessions, sécurité.
 *
 *   node tools/test-launcher-accounts.mjs
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
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'comptes-'));

const { startHttpServer } = await import('../src/server.js');
const { load } = await import('../src/storage.js');
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const server = startHttpServer(() => ({ discord: 'ready' }));
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${process.env.PORT}/api/compte`;
const post = (p, body, ip = '1.1.1.1', token) => fetch(`${base}/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const meOf = (token) => fetch(`${base}/moi`, { headers: { Authorization: `Bearer ${token}` } }).then(async (r) => ({ status: r.status, ...(await r.json()) }));

let token;
await check('inscription : compte créé, jeton renvoyé, mot de passe jamais gardé en clair', async () => {
  const r = await post('inscription', { pseudo: 'Noam', email: 'Noam@Exemple.fr', motDePasse: 'motdepasse42' });
  assert.equal(r.status, 201);
  assert.equal(r.compte.email, 'noam@exemple.fr');
  token = r.token;
  const saved = JSON.stringify(await load('launcher-comptes', {}));
  assert.ok(!saved.includes('motdepasse42'), 'pas de mot de passe en clair');
  assert.ok(!saved.includes(token), 'pas de jeton en clair');
});

await check('règles : mot de passe faible, e-mail invalide, pseudo invalide, e-mail déjà pris', async () => {
  assert.equal((await post('inscription', { pseudo: 'A', email: 'a@b.fr', motDePasse: 'motdepasse42' }, '2.2.2.2')).status, 400);
  assert.equal((await post('inscription', { pseudo: 'Bob', email: 'pas-un-mail', motDePasse: 'motdepasse42' }, '2.2.2.2')).status, 400);
  assert.equal((await post('inscription', { pseudo: 'Bob', email: 'bob@b.fr', motDePasse: 'court1' }, '2.2.2.2')).status, 400);
  assert.equal((await post('inscription', { pseudo: 'Bob', email: 'noam@exemple.fr', motDePasse: 'motdepasse42' }, '2.2.2.2')).status, 409);
});

await check('connexion et profil ; mauvais mot de passe refusé avec un message neutre', async () => {
  const ok = await post('connexion', { email: 'NOAM@exemple.fr', motDePasse: 'motdepasse42' }, '3.3.3.3');
  assert.equal(ok.status, 200);
  assert.equal((await meOf(ok.token)).compte.pseudo, 'Noam');
  const bad = await post('connexion', { email: 'noam@exemple.fr', motDePasse: 'mauvais123' }, '3.3.3.3');
  const unknown = await post('connexion', { email: 'personne@exemple.fr', motDePasse: 'mauvais123' }, '3.3.3.3');
  assert.equal(bad.status, 401);
  assert.equal(bad.error, unknown.error, 'on ne sait pas si l’e-mail existe');
});

await check('force brute : au-delà de 8 essais pour un e-mail, bloqué 15 minutes', async () => {
  let last;
  for (let i = 0; i < 10; i++) last = await post('connexion', { email: 'cible@exemple.fr', motDePasse: `essai${i}xyz` }, `9.9.9.${i}`);
  assert.equal(last.status, 429);
});

await check('déconnexion : le jeton ne marche plus ; faux jeton refusé', async () => {
  assert.equal((await meOf(token)).status, 200);
  await post('deconnexion', {}, '1.1.1.1', token);
  assert.equal((await meOf(token)).status, 401);
  assert.equal((await meOf('x'.repeat(43))).status, 401);
});

server.close();
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
