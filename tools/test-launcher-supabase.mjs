/**
 * Comptes du launcher reliés à Supabase : faux Supabase local (REST + Storage), on vérifie que les comptes sont
 * recopiés dans la table launcher_comptes (sans secret), que les images vont dans Storage et sont relues.
 *
 *   node tools/test-launcher-supabase.mjs
 */
import assert from 'node:assert/strict';
import http from 'node:http';

const kv = new Map(); const tables = { launcher_comptes: new Map() }; const blobs = new Map(); let bucket = false;
const fake = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks); const u = new URL(req.url, 'http://x');
    assert.equal(req.headers.apikey, 'sb_secret_essai', 'clé envoyée');
    const json = (code, v) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(v === undefined ? '' : JSON.stringify(v)); };
    if (u.pathname === '/rest/v1/bot_kv') {
      if (req.method === 'GET') { const k = decodeURIComponent(u.searchParams.get('key').slice(3)); return json(200, kv.has(k) ? [{ value: kv.get(k) }] : []); }
      for (const r of JSON.parse(body)) kv.set(r.key, r.value); return json(201);
    }
    if (u.pathname === '/rest/v1/launcher_comptes') {
      if (req.method === 'POST') { for (const r of JSON.parse(body)) tables.launcher_comptes.set(r.id, r); return json(201); }
      if (req.method === 'DELETE') { const ids = u.searchParams.get('id').slice(4, -1).split(',').map((x) => x.replace(/"/g, '')); for (const id of ids) tables.launcher_comptes.delete(id); return json(204); }
    }
    if (u.pathname === '/storage/v1/bucket' && req.method === 'POST') { bucket = JSON.parse(body); return json(200, { name: 'launcher' }); }
    const m = u.pathname.match(/^\/storage\/v1\/object\/launcher\/(.+)$/);
    if (m && req.method === 'POST') { blobs.set(decodeURIComponent(m[1]), { buf: body, mime: req.headers['content-type'] }); return json(200, {}); }
    if (m && req.method === 'GET') { const b = blobs.get(decodeURIComponent(m[1])); if (!b) return json(404, { error: 'not found' }); res.writeHead(200, { 'Content-Type': b.mime }); return res.end(b.buf); }
    if (u.pathname === '/storage/v1/object/launcher' && req.method === 'DELETE') { for (const p of JSON.parse(body).prefixes) blobs.delete(p); return json(200, []); }
    json(404, { error: 'route inconnue' });
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = `http://127.0.0.1:${fake.address().port}`;
process.env.SUPABASE_SERVICE_KEY = 'sb_secret_essai';
process.env.PORT = String(20000 + Math.floor(Math.random() * 20000));

const { startHttpServer } = await import('../src/server.js');
const { flushAll } = await import('../src/storage.js');
const server = startHttpServer(() => ({ discord: 'ready' }));
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${process.env.PORT}/api/compte`;
const call = (p, token, body) => fetch(`${base}/${p}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
let n = 0;
const ok = (c, msg) => { assert.ok(c, msg); n += 1; console.log('✅', msg); };

const r = await call('inscription', null, { pseudo: 'Noam', email: 'noam@exemple.fr', motDePasse: 'Jeu-Noam-1x' });
ok(r.token, 'inscription');
ok((await call('etat')).supabase === true, 'le launcher voit que les comptes sont sur Supabase');
const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]).toString('base64')}`;
const prof = await call('profil', r.token, { avatar: png, couleur: '#22c55e', bio: 'RP' });
const id = prof.compte.id;
ok(blobs.has(`avatar/${id}`) && bucket?.public === false, 'photo envoyée dans Supabase Storage (bucket privé)');
const got = await fetch(new URL(prof.compte.profile.avatar).pathname.replace(/^/, `http://127.0.0.1:${process.env.PORT}`));
ok(got.status === 200 && got.headers.get('content-type') === 'image/png', 'photo relue depuis Storage');
await flushAll();
ok(kv.has('launcher-comptes'), 'comptes gardés dans Supabase (bot_kv)');
await new Promise((res) => setTimeout(res, 4600));
const row = tables.launcher_comptes.get(id);
ok(row && row.pseudo === 'Noam' && row.email === 'noam@exemple.fr' && row.photo === true && row.couleur === '#22c55e', 'compte recopié dans la table launcher_comptes');
ok(!Object.keys(row).some((k) => /hash|salt|totp|token|session|secret|mot/i.test(k)) && !JSON.stringify(row).includes('Jeu-Noam'), 'aucun secret dans la table');
await call('profil', r.token, { avatar: null });
await new Promise((res) => setTimeout(res, 300));
ok(!blobs.has(`avatar/${id}`), 'photo retirée : fichier supprimé de Storage');

server.close(); fake.close();
console.log(`\n${n} vérifications passées.`);
process.exit(0);
