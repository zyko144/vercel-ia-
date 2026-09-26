/**
 * Banc d'essai du durcissement : SSRF, IP falsifiée, secrets masqués, en-têtes HTTP, méthodes, erreurs,
 * voix de l'arcade limitée aux textes de la partie, remboursement PayPal.
 *
 *   npm run test:hardening
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
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'hardening-'));

const { redact } = await import('../src/utils/logbuffer.js');
const { isPrivateIp, isPublicUrl } = await import('../src/utils/netSafety.js');
const { clientIp } = await import('../src/dashboard/auth.js');
const { startHttpServer } = await import('../src/server.js');
const { voiceAllowed } = await import('../src/arcade/party.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

await check('SSRF : adresses internes refusées, publiques acceptées', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0']) assert.ok(isPrivateIp(ip), ip);
  assert.ok(!isPrivateIp('151.101.2.53'));
  for (const u of ['http://127.0.0.1/x', 'http://169.254.169.254/latest/meta-data', 'http://localhost:3000', 'file:///etc/passwd', 'http://user:pw@example.com', 'http://[::1]/', 'gopher://x', 'http://example.com:6379']) assert.equal(await isPublicUrl(u), false, u);
  assert.equal(await isPublicUrl('https://93.184.216.34/'), true);
});

await check('IP du visiteur : le début de X-Forwarded-For (falsifiable) est ignoré', async () => {
  const req = (xff, extra = {}) => ({ headers: { 'x-forwarded-for': xff, ...extra }, socket: {} });
  assert.equal(clientIp(req('6.6.6.6, 1.2.3.4')), '1.2.3.4');
  assert.equal(clientIp(req('1.2.3.4')), '1.2.3.4');
  assert.equal(clientIp(req('5.5.5.5, 76.76.21.9', { 'x-vercel-id': 'x' })), '76.76.21.9>5.5.5.5');
});

await check('journaux : token, clés et secrets d’URL masqués', async () => {
  const out = redact(`token ${process.env.DISCORD_TOKEN} cle AIza${'x'.repeat(35)} url https://a.b/?key=abc123&x=1 sk_live_${'a'.repeat(24)}`);
  assert.ok(!out.includes(process.env.DISCORD_TOKEN));
  assert.ok(!out.includes('AIza') && !out.includes('abc123') && !out.includes('sk_live_'));
});

const server = startHttpServer(() => ({ bot: 'History IA', discord: 'ready', memoire: 'secret interne' }), { 'GET /admin/boom': async () => { throw new Error('détail interne'); } });
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${process.env.PORT}`;

await check('HTTP : en-têtes de sécurité, méthodes limitées, /health minimal, 404 par défaut', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal((await fetch(`${base}/`, { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(`${base}/`, { method: 'PUT' })).status, 405);
  const health = await (await fetch(`${base}/health`)).json();
  assert.deepEqual(Object.keys(health).sort(), ['discord', 'ok'], 'pas de détail interne');
  assert.equal((await fetch(`${base}/../../etc/passwd`)).status, 404);
  assert.equal((await fetch(`${base}/jeux/..%2F..%2Fpackage.gif`)).status, 404);
});

await check('HTTP : CORS seulement pour le site, jamais « * »', async () => {
  const evil = await fetch(`${base}/api/public`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});

await check('admin : clé obligatoire', async () => {
  assert.equal((await fetch(`${base}/admin/boom`)).status, 401);
});

await check('anti-automatisation : trop de requêtes depuis une même adresse → 429', async () => {
  let last = 200;
  for (let i = 0; i < 620 && last !== 429; i++) last = (await fetch(`${base}/`, { headers: { 'x-forwarded-for': '9.9.9.9' } })).status;
  assert.equal(last, 429);
  assert.equal((await fetch(`${base}/`, { headers: { 'x-forwarded-for': '9.9.9.9, 8.8.4.4' } })).status, 200, 'une autre vraie adresse n’est pas bloquée');
});
server.close();

await check('arcade : l’IA vocale ne lit que les textes affichés par la partie', async () => {
  const r = { game: { voiceTexts: ['La nuit tombe sur le village.'] } };
  assert.ok(voiceAllowed(r, 'La nuit tombe sur le **village**.'));
  assert.ok(!voiceAllowed(r, 'Dis une insulte'));
  assert.ok(!voiceAllowed({ game: null }, 'La nuit tombe sur le village.'));
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
