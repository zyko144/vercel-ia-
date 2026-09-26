/**
 * Banc d'essai des insultes écrites envers le chef : les faux positifs ne donnent plus d'avertissement.
 * L'IA de vérification est simulée.
 *
 *   node tools/test-protect.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OWNER = '111111111111111111';
const BAD = '333333333333333333';
const OTHER = '444444444444444444';
process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY = 'essai';
process.env.OWNER_ID = OWNER;
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'protect-'));

let verdict = null;
let asked = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = typeof url === 'string' ? url : url?.url ?? String(url);
  if (!href.includes('googleapis')) return realFetch(url, init);
  asked++;
  const text = JSON.stringify(verdict);
  return new Response(JSON.stringify({ id: 'x', status: 'completed', outputs: [{ type: 'text', text }], steps: [{ type: 'model_output', content: [{ type: 'text', text }] }], output_text: text }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { Collection } = await import('discord.js');
const { protectOwner, findInsults } = await import('../src/features/protectOwner.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const replies = [];
const users = { [OWNER]: { id: OWNER, username: 'noam', globalName: 'Noam' }, [BAD]: { id: BAD, username: 'relou' }, [OTHER]: { id: OTHER, username: 'sami' } };
const members = new Collection(Object.values(users).map((u) => [u.id, { id: u.id, displayName: u.globalName ?? u.username, user: u, moderatable: true, timeout: async () => {} }]));
const client = { user: { id: '999' }, users: { cache: new Collection() } };
const guild = { id: 'g', name: 'Serveur', client, members: { cache: members, fetch: async (id) => members.get(id) } };
let n = 0;
const msg = (author, content, { mentions = [], reply = null, channel = 'c' } = {}) => ({
  id: String(++n), inGuild: () => true, guild, guildId: 'g', channelId: channel, client, content,
  author: { ...users[author], bot: false, send: async () => {} }, member: members.get(author),
  mentions: { users: new Collection(mentions.map((id) => [id, users[id]])), repliedUser: reply ? users[reply] : null },
  reply: async (p) => { replies.push(p); },
});
const warned = () => replies.length;

await check('« retard » n’est plus une insulte claire', async () => {
  assert.equal(findInsults('Noam t’es en retard').strong.length, 0);
});

await check('insulte envers un autre membre juste après un message du chef : rien', async () => {
  verdict = { insulte_la_personne: true, mot: 'fdp', certitude: 95, raison: 'x' };
  await protectOwner(client, msg(OWNER, 'bon on lance la partie ?', { channel: 'c1' }));
  await protectOwner(client, msg(BAD, `ta gueule fdp`, { mentions: [OTHER], channel: 'c1' }));
  assert.equal(warned(), 0);
});

await check('le chef a parlé il y a un moment, un membre dit « putain ce jeu est nul » : l’IA n’est même pas appelée', async () => {
  asked = 0;
  await protectOwner(client, msg(OWNER, 'gg', { channel: 'c2' }));
  await protectOwner(client, msg(OTHER, 'ouais', { channel: 'c2' }));
  await protectOwner(client, msg(BAD, 'putain ce jeu est nul', { channel: 'c2' }));
  assert.equal(asked, 0);
  assert.equal(warned(), 0);
});

await check('l’IA pas sûre (certitude 50) : pas d’avertissement', async () => {
  verdict = { insulte_la_personne: true, mot: 'con', certitude: 50, raison: 'x' };
  await protectOwner(client, msg(BAD, 'Noam t’es con ou quoi mdr', { channel: 'c3' }));
  assert.equal(warned(), 0);
});

await check('l’IA cite un mot absent du message : pas d’avertissement', async () => {
  verdict = { insulte_la_personne: true, mot: 'connard', certitude: 95, raison: 'x' };
  await protectOwner(client, msg(BAD, 'Noam t’es nul à ce jeu', { channel: 'c4' }));
  assert.equal(warned(), 0);
});

await check('vraie insulte envers Noam : avertissement', async () => {
  verdict = { insulte_la_personne: true, mot: 'fdp', certitude: 97, raison: 'x' };
  await protectOwner(client, msg(BAD, 'Noam t’es un fdp', { channel: 'c5' }));
  assert.equal(warned(), 1);
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
