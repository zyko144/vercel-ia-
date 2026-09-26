/**
 * Banc d'essai du salon IA STATUS : panne détectée après 5 échecs sur 1 min, message dans chaque serveur,
 * refus de contenu ignorés, message de retour à la première réussite.
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
status.startAiStatus({ guilds: { cache: new Collection(guilds.map((g) => [g.id, g])) } });
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const flush = () => new Promise((r) => setTimeout(r, 20));

await check('refus de contenu (400) : pas une panne', async () => {
  for (let i = 0; i < 10; i++) { status.noteAiResult(false, 400); now += 20_000; }
  assert.equal(status.aiIsDown(), false);
});

await check('5 échecs 503 sur plus d’une minute : panne, message rouge dans chaque serveur (salon créé)', async () => {
  for (let i = 0; i < 5; i++) { status.noteAiResult(false, 503); now += 16_000; }
  assert.equal(status.aiIsDown(), true);
  await flush();
  assert.equal(sent.length, 2);
  assert.match(sent[0].p.embeds[0].data.title, /indisponible/);
  assert.match(sent[0].p.embeds[0].data.description, /Nos équipes travaillent dessus/);
  assert.match(sent[0].p.embeds[0].data.image.url, /iastatus\/down\.gif/);
  assert.ok(guilds[1].channels.cache.some((c) => c.name === '🔴・ia-status'), 'salon créé');
});

await check('première réussite : message vert de retour', async () => {
  now += 5 * 60_000;
  status.noteAiResult(true);
  assert.equal(status.aiIsDown(), false);
  await flush();
  assert.equal(sent.length, 4);
  assert.match(sent[3].p.embeds[0].data.title, /de retour/);
});

await check('rechute rapide : pas de nouvelle alerte avant 30 min', async () => {
  for (let i = 0; i < 6; i++) { status.noteAiResult(false, 500); now += 15_000; }
  assert.equal(status.aiIsDown(), true);
  status.noteAiResult(true);
  await flush();
  assert.equal(sent.length, 4);
});

Date.now = realNow;
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
