/**
 * Banc d'essai des lots IA, modération, outils et vocal.
 *
 *   node tools/test-outils.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'outils-'));
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o) => (String(url).includes('generativelanguage') ? { ok: false, status: 500, json: async () => ({}), text: async () => 'non' } : realFetch(url, o));

const { Collection, PermissionsBitField } = await import('discord.js');
const mod = await import('../src/features/moderation.js');
const tools = await import('../src/features/serverTools.js');
const assistant = await import('../src/features/assistant.js');
const voice = await import('../src/features/voicePlus.js');
const economy = await import('../src/features/economy.js');
const { setGuildSettings, setInternal } = await import('../src/features/guildConfig.js');
await economy.data();

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const G = '444444444444444444';
const U = '222222222222222222';

await check('mots interdits : mot entier, accents et majuscules ignorés', async () => {
  setGuildSettings(G, { 'automod.words': ['gros mot', 'Épave'] });
  assert.equal(mod.bannedWord(G, 'quel GROS  MOT !'), 'gros mot');
  assert.equal(mod.bannedWord(G, 'une epave'), 'epave');
  assert.equal(mod.bannedWord(G, 'épaves'), null, 'mot entier seulement');
  assert.equal(mod.bannedWord(G, 'rien à voir'), null);
});

await check('doubles comptes : même avatar ou nom presque identique', async () => {
  const banned = [{ name: mod._test.simple('capitaine_crochet'), avatar: 'abc', tag: 'capitaine_crochet' }];
  assert.ok(mod.looksLikeAlt({ username: 'capitaine.crochet2', avatar: null }, banned));
  assert.ok(mod.looksLikeAlt({ username: 'toto', avatar: 'abc' }, banned));
  assert.equal(mod.looksLikeAlt({ username: 'marin_perdu', avatar: 'xyz' }, banned), null);
});

await check('sanctions progressives : muet à 3, expulsion à 7, jamais le staff', async () => {
  const actions = [];
  const member = { user: { id: U, username: 'lina', send: async () => {} }, permissions: new PermissionsBitField(0n), moderatable: true, kickable: true, timeout: async (ms) => actions.push(['mute', ms]), kick: async () => actions.push(['kick']) };
  const guild = { id: G, name: 'Navire', members: { fetch: async () => member }, channels: { cache: new Collection() } };
  assert.equal(await mod.escalate(guild, U, 2), null);
  assert.equal((await mod.escalate(guild, U, 3)).label, 'muet 1 h');
  assert.equal((await mod.escalate(guild, U, 7)).action, 'kick');
  assert.deepEqual(actions.map((a) => a[0]), ['mute', 'kick']);
  member.permissions = new PermissionsBitField(PermissionsBitField.Flags.ManageMessages);
  assert.equal(await mod.escalate(guild, U, 5), null, 'staff épargné');
  const s = await mod.modStats(G);
  assert.ok(s.warn >= 4 && s.mute === 1 && s.kick === 1);
});

await check('confinement : ferme puis rouvre les salons', async () => {
  const edits = [];
  const mkChannel = (id) => ({ id, isTextBased: () => true, isThread: () => false, permissionOverwrites: { cache: new Collection(), edit: async (who, perms) => edits.push([id, perms]), delete: async () => edits.push([id, 'delete']) } });
  const guild = { id: G, channels: { cache: new Collection([['1', mkChannel('1')], ['2', mkChannel('2')]]) } };
  const r = await mod.lockdown(guild, { id: U, username: 'chef' });
  assert.equal(r.count, 2);
  assert.equal(edits[0][1].SendMessages, false);
  assert.match((await mod.lockdown(guild, { id: U, username: 'chef' })).error, /déjà/);
  assert.equal((await mod.unlockdown(guild, { id: U, username: 'chef' })).count, 2);
  assert.equal(edits.at(-1)[1], 'delete');
});

await check('mode lent : 15 messages en 10 s', async () => {
  let slow = null;
  const channel = { id: 'c1', rateLimitPerUser: 0, setRateLimitPerUser: async (n) => { slow = n; }, send: async () => {}, permissionsFor: () => new PermissionsBitField(PermissionsBitField.All) };
  const msg = { inGuild: () => true, guildId: G, guild: { members: { me: {} } }, author: { bot: false }, channel };
  for (let i = 0; i < 14; i++) await mod.watchBurst(msg);
  assert.equal(slow, null);
  await mod.watchBurst(msg);
  assert.equal(slow, 10);
});

await check('messages programmés : dates comprises, envoi et répétition', async () => {
  const now = Date.UTC(2026, 8, 25, 10, 0); // 12 h à Paris
  assert.equal(new Date(tools.parseWhen('18:30', now)).getUTCHours(), 16);
  assert.ok(tools.parseWhen('11:00', now) - now > 20 * 3_600_000, 'heure passée : demain');
  assert.equal(tools.parseWhen('dans 2h', now), now + 7_200_000);
  assert.equal(new Date(tools.parseWhen('25/12 20:00', now)).getUTCDate(), 25);
  assert.equal(tools.parseWhen('n’importe quoi', now), null);
  const sent = [];
  const channel = { id: '555555555555555555', send: async (p) => sent.push(p) };
  const guild = { id: G, memberCount: 42, channels: { cache: new Collection([[channel.id, channel]]) }, roles: { cache: new Collection() } };
  await tools.scheduleMessage(G, { channelId: channel.id, text: 'Bonjour équipage', at: Date.now() - 1000, repeat: 'jour', by: U });
  await tools.scheduleMessage(G, { channelId: channel.id, text: 'Une fois', at: Date.now() - 1000, by: U });
  await tools._test.tick({ guilds: { cache: new Collection([[G, guild]]) } });
  assert.deepEqual(sent.map((s) => s.content), ['Bonjour équipage', 'Une fois']);
  const left = await tools.schedulesOf(G);
  assert.equal(left.length, 1, 'le message unique est retiré');
  assert.ok(left[0].at > Date.now(), 'le quotidien est reprogrammé');
});

await check('anniversaires : date vérifiée, fête et cadeau', async () => {
  assert.equal(await tools.setBirthday(G, U, 31, 2), false);
  const paris = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  assert.equal(await tools.setBirthday(G, U, paris.getDate(), paris.getMonth() + 1), true);
  setGuildSettings(G, { 'birthdays.channelId': '666666666666666666' });
  setInternal(G, 'birthdays.lastDay', null);
  const sent = [];
  const channel = { id: '666666666666666666', send: async (p) => sent.push(p) };
  const guild = { id: G, memberCount: 42, channels: { cache: new Collection([[channel.id, channel]]) }, roles: { cache: new Collection() }, members: { fetch: async () => null } };
  const before = await economy.goldOf(G, U);
  if (paris.getHours() >= 9) {
    await tools._test.tick({ guilds: { cache: new Collection([[G, guild]]) } });
    assert.match(sent[0].embeds[0].toJSON().title, /anniversaire/i);
    assert.equal(await economy.goldOf(G, U), before + 500);
  }
});

await check('résumé : extraits courts seulement, suppression expliquée en MP', async () => {
  for (let i = 0; i < 5; i++) assistant.recordMessage({ inGuild: () => true, guildId: G, author: { bot: false, username: 'lina' }, member: null, content: `message ${i} ${'x'.repeat(300)}`, channel: { name: 'général' } });
  const ex = assistant._test.excerpt(G, 60_000);
  assert.equal(ex.split('\n').length, 5);
  assert.ok(ex.split('\n')[0].length < 200, 'coupé à 160 caractères');
  const dms = [];
  await assistant.explainDeletion({ send: async (p) => dms.push(p) }, { id: G, name: 'Navire' }, { kind: 'auto-lien', reason: 'Lien interdit', content: 'http://x' });
  assert.match(dms[0].embeds[0].toJSON().description, /Lien interdit/);
});

await check('soirée vocale : 5 personnes pendant 1 h = 150 pièces, une fois par jour', async () => {
  const members = new Collection(Array.from({ length: 5 }, (_, i) => [`70000000000000000${i}`, { id: `70000000000000000${i}`, user: { bot: false }, voice: {}, send: async () => {} }]));
  const channel = { isVoiceBased: () => true, members };
  const guild = { id: G, channels: { cache: new Collection([['v', channel]]) } };
  const client = { guilds: { cache: new Collection([[G, guild]]) } };
  for (let i = 0; i < 61; i++) await voice._test.partyTick(client);
  assert.equal(await economy.goldOf(G, '700000000000000000'), 150);
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
