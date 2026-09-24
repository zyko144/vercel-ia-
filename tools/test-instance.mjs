/**
 * Banc d'essai de la garde « une seule copie du bot » (src/features/instance.js),
 * avec un faux Supabase local : rien ne part sur Internet.
 *
 *   node tools/test-instance.mjs
 */
import assert from 'node:assert/strict';
import http from 'node:http';

const rows = new Map();
let renderHealth = { discord: 'connecting' }; // ce que répond la page /health du faux Render
const fake = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.end(JSON.stringify(renderHealth));
    return;
  }
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
process.env.PRIMARY_URL = `http://127.0.0.1:${fake.address().port}`; // le « Render » interrogé est le faux serveur
// cette copie joue le rôle du PC (pas de variable RENDER)
delete process.env.RENDER;

const { instance, waitForTurn } = await import('../src/features/instance.js');
assert.equal(instance.guarded, true);
assert.match(instance.where, /^PC/);

// Le bot tourne déjà sur Render (prioritaire) : le PC attend.
rows.set('instance-lock', { id: 'render', startedAt: Date.now() - 5000, where: 'Render', priority: 2, at: Date.now() });
let done = false;
const turn = waitForTurn().then(() => { done = true; });
await new Promise((r) => setTimeout(r, 800));
assert.equal(done, false, 'le PC attend tant que Render tourne');
assert.equal(instance.waitingFor, 'Render');
console.log('✅ le PC attend tant que le bot tourne sur Render');

// Render s'arrête : son bail n'est plus renouvelé, le PC prend le relais au tour suivant.
rows.set('instance-lock', { ...rows.get('instance-lock'), at: Date.now() - 120_000 });
await turn;
assert.equal(rows.get('instance-lock').id, instance.id, 'le PC a pris le bail');
assert.equal(instance.waitingFor, null);
console.log('✅ le PC prend le relais tout seul si Render s’arrête');

// Render connecté à Discord mais sans Supabase (aucun bail) : le PC le voit quand même par /health
rows.clear();
renderHealth = { discord: 'ready', instance: 'Render' };
const { _test } = await import('../src/features/instance.js');
assert.equal(await _test.ahead(), 'Render', 'le PC voit Render par sa page /health');
renderHealth = { discord: 'connecting' };
assert.equal(await _test.ahead(), null, 'Render pas encore connecté : le PC peut tourner');
console.log('✅ sans bail Supabase, le PC voit quand même que Render tourne (page /health)');

fake.close();
process.exit(0);
