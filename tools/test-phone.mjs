// Relais téléphone ↔ PC : état, ordres, PC éteint, actions refusées
import assert from 'node:assert/strict';
const { pcRoute } = await import('../src/features/launcherPhone.js');
const call = async (method, path, body) => { let out; await pcRoute({ method }, null, new URL(`http://x${path}`), { id: 'a1' }, { readJson: async () => body, send: (_r, code, j) => { out = { code, ...j }; } }); return out; };
assert.equal((await call('POST', '/api/compte/pc/ordre', { pc: 'p1', do: 'launch' })).code, 409);
assert.equal((await call('POST', '/api/compte/pc/etat', { pc: 'p1', nom: 'PC salon', etat: { cpu: '50 °C' } })).ordres.length, 0);
const list = await call('GET', '/api/compte/pc'); assert.equal(list.pcs[0].enLigne, true); assert.equal(list.pcs[0].etat.cpu, '50 °C');
assert.equal((await call('POST', '/api/compte/pc/ordre', { pc: 'p1', do: 'rm -rf' })).code, 400);
assert.equal((await call('POST', '/api/compte/pc/ordre', { pc: 'p1', do: 'launch', id: 'steam-730' })).ok, true);
const r = await call('POST', '/api/compte/pc/etat', { pc: 'p1', nom: 'PC salon' }); assert.deepEqual(r.ordres.map((o) => o.do), ['launch']); assert.equal(r.rapide, true);
console.log('✅ Relais téléphone ↔ PC');
