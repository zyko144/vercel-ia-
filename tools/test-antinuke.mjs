/**
 * Banc d'essai : anti-nuke, secrets collés dans un salon, salon des cartes de niveau.
 *
 *   node tools/test-antinuke.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.OWNER_ID = '111111111111111111';
process.env.LEVELS_CHANNEL_ID = '777777777777777777';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'antinuke-'));

const { AuditLogEvent, Collection } = await import('discord.js');
const nuke = await import('../src/features/antiNuke.js');
const { levelChannel } = await import('../src/features/levels.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

await check('secrets repérés : token Discord et clé Gemini, pas les phrases normales', async () => {
  assert.ok(nuke.looksLikeSecret(`voila ${'M'.repeat(1)}${'a'.repeat(25)}.${'b'.repeat(6)}.${'c'.repeat(30)}`));
  assert.ok(nuke.looksLikeSecret(`AIza${'x'.repeat(35)}`));
  assert.ok(!nuke.looksLikeSecret('salut tout le monde, ce soir soirée loup-garou à 21h.'));
});

await check('anti-nuke : 4 suppressions de salons en 1 min → rôles retirés et exclusion', async () => {
  const done = [];
  const roles = new Collection([['r1', { id: 'r1', managed: false, editable: true }]]);
  const member = { id: 'BAD', user: { bot: false }, roles: { cache: roles, remove: async () => done.push('roles') }, moderatable: true, timeout: async () => done.push('timeout') };
  const client = { user: { id: 'BOT' }, users: { fetch: async () => ({ send: async () => {} }) } };
  const guild = { id: 'g', name: 'Serveur', ownerId: 'OWN', client, members: { fetch: async () => member }, channels: { cache: new Collection() }, roles: { cache: new Collection() } };
  for (let i = 0; i < 3; i++) await nuke.onAuditEntry({ action: AuditLogEvent.ChannelDelete, executorId: 'BAD' }, guild);
  assert.deepEqual(done, []);
  await nuke.onAuditEntry({ action: AuditLogEvent.ChannelDelete, executorId: 'BAD' }, guild);
  assert.deepEqual(done, ['roles', 'timeout']);
  for (let i = 0; i < 6; i++) await nuke.onAuditEntry({ action: AuditLogEvent.ChannelDelete, executorId: 'OWN' }, guild);
  assert.equal(done.length, 2, 'le propriétaire du serveur n’est jamais visé');
});

await check('cartes de niveau : le salon choisi, jamais le général', async () => {
  const mk = (id, name) => ({ id, name, isTextBased: () => true, isThread: () => false, isVoiceBased: () => false, permissionsFor: () => ({ has: () => true }) });
  const general = mk('1', 'général');
  const niveau = mk('777777777777777777', '📈・niveaux');
  const guild = { id: 'g', members: { me: {} }, channels: { cache: new Collection([['1', general]]), fetch: async (id) => (id === niveau.id ? niveau : null) } };
  assert.equal(await levelChannel(guild), niveau, 'trouvé même s’il n’est pas en cache');
  const other = { id: 'h', members: { me: {} }, channels: { cache: new Collection([['1', general]]), fetch: async () => null } };
  assert.ok(!(await levelChannel(other)), 'pas de salon des niveaux : pas d’annonce (et pas dans le général)');
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
