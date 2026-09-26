/**
 * Banc d'essai des commandes « !! » : !!clear, routage vers les vraies commandes (ban, warn, role…), aide.
 *
 *   node tools/test-prefix.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'prefix-'));
const { Collection, PermissionFlagsBits } = await import('discord.js');
const { prefixCommand, helpEmbeds, _test } = await import('../src/features/prefixCommands.js');
const { MODERATION_HANDLERS } = await import('../src/handlers/moderation.js');
const { UTILITY_HANDLERS } = await import('../src/handlers/utility.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const perms = (ok) => ({ has: (p) => ok && (p === PermissionFlagsBits.ManageMessages || Array.isArray(p)) });
const A = '111111111111111111';
const B = '222222222222222222';
const ROLE = '333333333333333333';

function setup({ canManage = true } = {}) {
  const history = Array.from({ length: 60 }, (_, i) => ({ id: String(1000 + i), author: { id: i % 2 ? B : A } }));
  const sent = [];
  const memberB = { id: B, user: { id: B, username: 'sami' }, roles: { cache: new Collection() } };
  const guild = {
    id: '9', name: 'Le Navire',
    members: { me: { permissionsIn: () => perms(true) }, fetch: async (id) => (id === B ? memberB : null) },
    roles: { cache: new Collection([[ROLE, { id: ROLE, name: 'VIP' }]]) },
    channels: { cache: new Collection() },
  };
  const channel = {
    sent, removed: [],
    send: async (p) => { sent.push(p); return { delete: async () => {}, edit: async () => {} }; },
    messages: { fetch: async ({ limit }) => new Collection(history.slice(0, limit).map((x) => [x.id, x])) },
    bulkDelete: async (list) => { channel.removed.push(...list.map((x) => x.id)); return new Collection(list.map((x) => [x.id, x])); },
  };
  const make = (content) => ({
    id: 'cmd', content, channel, guild, guildId: guild.id, channelId: 'c', client: { users: { fetch: async () => null }, ws: { ping: 42 } },
    author: { id: A, toString: () => '@A' },
    member: { permissionsIn: () => perms(canManage), permissions: perms(canManage) },
    delete: async () => { channel.cmdDeleted = true; },
  });
  return { channel, make, memberB };
}

await check('!!clear 20 : efface les 20 derniers messages et la commande', async () => {
  const { channel, make } = setup();
  assert.equal(await prefixCommand(make('!!clear 20')), true);
  assert.equal(channel.removed.length, 20);
  assert.ok(channel.cmdDeleted);
});

await check('!!clear 5 @membre, plafond à 100, refus sans permission', async () => {
  let t = setup();
  await prefixCommand(t.make(`!!clear 5 <@${B}>`));
  assert.equal(t.channel.removed.length, 5);
  t = setup();
  await prefixCommand(t.make('!!clear 500'));
  assert.ok(t.channel.removed.length <= 100);
  t = setup({ canManage: false });
  await prefixCommand(t.make('!!clear 10'));
  assert.equal(t.channel.removed.length, 0);
});

await check('!!ban, !!warn, !!mute, !!role : passent par les vraies commandes avec les bonnes valeurs', async () => {
  const seen = {};
  for (const k of ['ban', 'warn', 'mute', 'role']) {
    const real = MODERATION_HANDLERS[k];
    MODERATION_HANDLERS[k] = async (client, i) => { seen[k] = { i, real }; };
  }
  const { make, memberB } = setup();
  await prefixCommand(make(`!!ban <@${B}> spam de liens`));
  assert.equal(seen.ban.i.options.getUser('membre', true).id, B);
  assert.equal(seen.ban.i.options.getMember('membre'), memberB);
  assert.equal(seen.ban.i.options.getString('raison'), 'spam de liens');
  await prefixCommand(make(`!!warn <@${B}> insultes`));
  assert.equal(seen.warn.i.options.getString('raison', true), 'insultes');
  await prefixCommand(make(`!!mute <@${B}> 10m calme-toi`));
  assert.equal(seen.mute.i.options.getString('duree', true), '10m');
  await prefixCommand(make(`!!role <@${B}> @VIP`.replace('@VIP', `<@&${ROLE}>`)));
  assert.equal(seen.role.i.options.getRole('role', true).name, 'VIP');
  assert.equal(seen.role.i.options.getString('action', true), 'add');
  for (const k of Object.keys(seen)) MODERATION_HANDLERS[k] = seen[k].real;
});

await check('réponses : les « privées » s’affichent dans le salon puis disparaissent', async () => {
  const { make, channel } = setup();
  const i = _test.fromMessage(make('!!x'), 'x');
  await i.reply({ content: 'secret', flags: 64 });
  assert.equal(channel.sent[0].content, 'secret');
  assert.equal(channel.sent[0].flags, undefined, 'plus de drapeau éphémère');
});

await check('!!userinfo sans membre : passe par la vraie commande', async () => {
  const real = UTILITY_HANDLERS.userinfo;
  let got = null;
  UTILITY_HANDLERS.userinfo = async (c, i) => { got = i; };
  const { make } = setup();
  await prefixCommand(make('!!userinfo'));
  assert.equal(got.options.getUser('membre'), null);
  UTILITY_HANDLERS.userinfo = real;
});

await check('!!aide : toutes les commandes rangées par groupe ; les messages en « ! » simple sont ignorés', async () => {
  const text = JSON.stringify(helpEmbeds().map((e) => e.toJSON()));
  for (const c of ['!!clear', '!!ban', '!!close', '!!roles', '!!play', '!!mute', '!!lock']) assert.ok(text.includes(c), c);
  const { make } = setup();
  assert.equal(await prefixCommand(make('!clear 20')), false);
  assert.equal(await prefixCommand(make('!!inconnue')), false);
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
