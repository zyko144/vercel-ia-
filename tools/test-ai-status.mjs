/**
 * Banc d'essai : le salon IA STATUS est retiré (supprimé des serveurs, plus aucune alerte).
 *
 *   node tools/test-ai-status.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.RENDER_EXTERNAL_URL = 'https://vercel-ia.onrender.com';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'ia-status-'));

const { Collection, ChannelType } = await import('discord.js');
const status = await import('../src/features/aiStatus.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

const sent = [];
const makeGuild = (id, withChannel) => {
  const channels = new Collection();
  const guild = { id, members: { me: { id: '9', permissions: { has: () => true } } }, channels: { cache: channels } };
  const add = (name) => {
    const ch = { id: `${id}-${name}`, name, type: ChannelType.GuildText, send: async (p) => { sent.push({ guild: id, p }); } };
    channels.set(ch.id, ch);
    return ch;
  };
  guild.channels.create = async ({ name }) => add(name);
  if (withChannel) add('🔴・ia-status');
  return guild;
};
const guilds = [makeGuild('1', true), makeGuild('2', false)];
const deleted = [];
for (const c of guilds[0].channels.cache.values()) c.delete = async () => { deleted.push(c.name); };
status.startAiStatus({ guilds: { cache: new Collection(guilds.map((g) => [g.id, g])) } });
const flush = () => new Promise((r) => setTimeout(r, 20));

await check('salon IA STATUS retiré : supprimé là où il existe', async () => {
  await flush();
  assert.deepEqual(deleted, ['🔴・ia-status']);
});
await check('panne de l’IA : suivie mais plus aucun message sur Discord', async () => {
  for (let i = 0; i < 6; i++) status.noteAiResult(false, 503);
  await flush();
  assert.equal(sent.length, 0);
});
console.log(`\n${passed} vérifications passées.`);
