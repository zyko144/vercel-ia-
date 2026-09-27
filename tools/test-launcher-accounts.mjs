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

await check('mot de passe : règle claire, accents et symboles acceptés, trop faciles refusés', async () => {
  const { passwordProblem } = await import('../src/features/launcherAccounts.js');
  assert.equal(passwordProblem('motdepassesecret'), null, 'que des lettres mais 10+ caractères');
  assert.equal(passwordProblem('Élodie2024'), null, 'accents acceptés');
  assert.equal(passwordProblem('chat!noir'), null, 'lettres + symbole');
  assert.equal(passwordProblem('Soleil7'), 'Le mot de passe doit faire au moins 8 caractères.');
  assert.match(passwordProblem('12345678'), /trop facile/);
  assert.match(passwordProblem('aaaaaaaaaa'), /trop facile/);
  assert.match(passwordProblem('soleilbl'), /chiffre ou un symbole/);
  const r = await post('inscription', { pseudo: 'Léa', email: 'lea@exemple.fr', motDePasse: 'Élodie2024' }, '4.4.4.4');
  assert.equal(r.status, 201, 'inscription avec un mot de passe accentué');
});

// E-mails simulés : on intercepte l'appel à Resend (rien n'est envoyé) pour lire le code
const mails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  if (String(u).startsWith('https://api.resend.com/')) { mails.push(JSON.parse(o.body)); return new Response('{}', { status: 200 }); }
  return realFetch(u, o);
};
process.env.RESEND_API_KEY = 'cle-de-test';
const codeFrom = (m) => m.subject.match(/^(\d{6})/)[1];
const { totp } = await import('../src/features/launcherSecurity.js');

await check('vérification de l’e-mail : code envoyé, mauvais code refusé, bon code accepté', async () => {
  const r = await post('inscription', { pseudo: 'Zoe', email: 'zoe@exemple.fr', motDePasse: 'Zoe-2026!' }, '5.5.5.5');
  assert.equal(r.compte.verified, false);
  await new Promise((ok) => setTimeout(ok, 50));
  assert.equal(mails.at(-1).to[0], 'zoe@exemple.fr');
  assert.ok(!JSON.stringify(await load('launcher-comptes', {})).includes(codeFrom(mails.at(-1))), 'code jamais gardé en clair');
  assert.equal((await post('verif', { code: '000000' }, '5.5.5.5', r.token)).status, 400);
  const ok = await post('verif', { code: codeFrom(mails.at(-1)) }, '5.5.5.5', r.token);
  assert.equal(ok.compte.verified, true);
});

await check('mot de passe oublié : même réponse sans compte, code par e-mail, sessions coupées', async () => {
  const n = mails.length;
  assert.equal((await post('mdp/oubli', { email: 'personne@exemple.fr' }, '6.6.6.6')).ok, true);
  assert.equal(mails.length, n, 'aucun e-mail pour un compte inexistant');
  await post('mdp/oubli', { email: 'zoe@exemple.fr' }, '6.6.6.6');
  const code = codeFrom(mails.at(-1));
  assert.equal((await post('mdp/nouveau', { email: 'zoe@exemple.fr', code, motDePasse: 'court' }, '6.6.6.6')).status, 400);
  assert.equal((await post('mdp/nouveau', { email: 'zoe@exemple.fr', code, motDePasse: 'Nouveau-2026!' }, '6.6.6.6')).ok, true);
  assert.equal((await post('connexion', { email: 'zoe@exemple.fr', motDePasse: 'Zoe-2026!' }, '6.6.6.6')).status, 401);
  assert.equal((await post('connexion', { email: 'zoe@exemple.fr', motDePasse: 'Nouveau-2026!' }, '6.6.6.6')).status, 200);
});

await check('double authentification : QR, activation, connexion en 2 étapes, code de secours', async () => {
  const login = await post('connexion', { email: 'zoe@exemple.fr', motDePasse: 'Nouveau-2026!' }, '7.7.7.7');
  const t = login.token;
  const other = (await post('connexion', { email: 'zoe@exemple.fr', motDePasse: 'Nouveau-2026!' }, '7.7.7.7')).token; // autre PC déjà connecté
  const start = await post('2fa/debut', {}, '7.7.7.7', t);
  assert.match(start.url, /^otpauth:\/\/totp\/History%3Azoe%40exemple\.fr\?secret=[A-Z2-7]+&issuer=History/);
  assert.equal((await post('2fa/activer', { code: '123456' }, '7.7.7.7', t)).status, 400);
  const on = await post('2fa/activer', { code: totp(start.secret) }, '7.7.7.7', t);
  assert.equal(on.compte.twoFactor, true);
  assert.equal(on.recovery.length, 8);
  assert.equal((await post('2fa/verifier', { code: '000000' }, '7.7.7.7', other)).status, 401, 'autres appareils déconnectés à l’activation');
  assert.equal((await post('2fa/verifier', { code: '000000' }, '7.7.7.7', t)).status, 401, 'déverrouillage : mauvais code refusé');
  assert.equal((await post('2fa/verifier', { code: on.recovery[7] }, '7.7.7.7', t)).ok, true, 'déverrouillage avec un code');
  const step1 = await post('connexion', { email: 'zoe@exemple.fr', motDePasse: 'Nouveau-2026!' }, '7.7.7.7');
  assert.equal(step1.need2fa, true);
  assert.equal(step1.token, undefined, 'pas de session avant le code');
  assert.equal((await post('connexion/2fa', { ticket: step1.ticket, code: '000000' }, '7.7.7.7')).status, 401);
  const step2 = await post('connexion/2fa', { ticket: step1.ticket, code: on.recovery[0] }, '7.7.7.7');
  assert.ok(step2.token);
  assert.equal(step2.recoveryLeft, 6, 'code de secours à usage unique');
  const again = await post('connexion', { email: 'zoe@exemple.fr', motDePasse: 'Nouveau-2026!' }, '7.7.7.7');
  assert.equal((await post('connexion/2fa', { ticket: again.ticket, code: on.recovery[0] }, '7.7.7.7')).status, 401, 'code de secours déjà utilisé');
  assert.equal((await post('2fa/desactiver', { motDePasse: 'faux', code: on.recovery[1] }, '7.7.7.7', step2.token)).status, 401);
  assert.equal((await post('2fa/desactiver', { motDePasse: 'Nouveau-2026!', code: on.recovery[1] }, '7.7.7.7', step2.token)).compte.twoFactor, false);
});

server.close();
await check('e-mails par Brevo (sans nom de domaine) quand BREVO_API_KEY est défini', async () => {
  const { sendMail } = await import('../src/features/launcherSecurity.js');
  const sent = [];
  process.env.BREVO_API_KEY = 'cle-brevo-test'; process.env.BREVO_FROM = 'history.launcher@gmail.com';
  const r = await sendMail('zoe@exemple.fr', 'Code', '<b>1</b>', async (u, o) => { sent.push({ u, o }); return new Response('{}', { status: 201 }); });
  delete process.env.BREVO_API_KEY; delete process.env.BREVO_FROM;
  assert.equal(r.ok, true);
  assert.equal(sent[0].u, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(sent[0].o.headers['api-key'], 'cle-brevo-test');
  const body = JSON.parse(sent[0].o.body);
  assert.deepEqual(body.to, [{ email: 'zoe@exemple.fr' }]);
  assert.equal(body.sender.email, 'history.launcher@gmail.com');
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
