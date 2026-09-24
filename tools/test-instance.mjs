/**
 * Banc d'essai de la garde « une seule copie du bot » (src/features/instance.js),
 * avec un faux Supabase local : rien ne part sur Internet.
 *
 *   node tools/test-instance.mjs
 */
import assert from 'node:assert/strict';
import http from 'node:http';

const rows = new Map();
const fake = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET') {
    const key = decodeURIComponent(url.searchParams.get('key').slice(3));
    res.end(JSON.stringify(rows.has(key) ? [{ value: rows.get(key) }] : []));
    return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => { for (const r of JSON.parse(body)) rows.set(r.key, r.value); res.end(); });
});
await new Promise((r) => fake.listen(0, r));

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY = 'essai';
process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_essai';
process.env.RENDER = 'true'; // cette copie joue le rôle de Render

const { instance, waitForTurn } = await import('../src/features/instance.js');
assert.equal(instance.guarded, true);
assert.equal(instance.where, 'Render');

// Le bot tourne déjà sur un PC (prioritaire) : Render attend.
rows.set('instance-lock', { id: 'pc', startedAt: Date.now() - 5000, where: 'PC (maison)', priority: 2, at: Date.now() });
let done = false;
const turn = waitForTurn().then(() => { done = true; });
await new Promise((r) => setTimeout(r, 800));
assert.equal(done, false, 'Render attend tant que le PC tourne');
assert.equal(instance.waitingFor, 'PC (maison)');
console.log('✅ Render attend tant que le bot tourne sur le PC');

// Le PC s'arrête : son bail n'est plus renouvelé, Render reprend au tour suivant.
rows.set('instance-lock', { ...rows.get('instance-lock'), at: Date.now() - 120_000 });
await turn;
assert.equal(rows.get('instance-lock').id, instance.id, 'Render a pris le bail');
assert.equal(instance.waitingFor, null);
console.log('✅ Render reprend tout seul une fois le PC arrêté');

fake.close();
process.exit(0);
