import assert from 'node:assert/strict';
process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY = 'test';
process.env.SUPABASE_URL = 'https://storage.test.invalid';
process.env.SUPABASE_SERVICE_KEY = 'test-only';
let row = { key: 'social-test', value: { messages: ['existing'] }, updated_at: new Date(0).toISOString() };
let collide = true, unavailable = false;
globalThis.fetch = async (url, options) => {
  if (unavailable) return new Response('', { status: 503 });
  if (!options.method) return Response.json(row ? [row] : []);
  const next = JSON.parse(options.body);
  if (options.method === 'POST') { row = next; return Response.json([row]); }
  if (collide) {
    collide = false;
    row = { ...row, value: { messages: [...row.value.messages, 'other-server'] }, updated_at: new Date(1).toISOString() };
  }
  if (new URL(url).searchParams.get('updated_at') !== `eq.${row.updated_at}`) return Response.json([]);
  row = { ...row, ...next };
  return Response.json([row]);
};
const { updateAtomic } = await import('../src/storage.js');
await updateAtomic('social-test', (data) => { data.messages.push('this-server'); });
assert.deepEqual(row.value.messages, ['existing', 'other-server', 'this-server']);
await Promise.all(Array.from({ length: 20 }, (_, i) => updateAtomic('social-test', (data) => { data.messages.push(`parallel-${i}`); })));
assert.equal(row.value.messages.length, 23);
unavailable = true;
await assert.rejects(updateAtomic('social-test', (data) => { data.messages = []; }));
assert.equal(row.value.messages.length, 23, 'failed read must never overwrite history');
unavailable = false; row = null;
await updateAtomic('new-social-test', (data) => { data.messages = ['first']; });
assert.deepEqual(row.value.messages, ['first']);
console.log('✅ Stockage social : conflit entre serveurs, 20 écritures concurrentes, panne et première création');
