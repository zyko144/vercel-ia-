/**
 * Banc d'essai des commandes « ! » : !clear 20, !clear 5 @membre, refus sans permission.
 *
 *   node tools/test-prefix.mjs
 */
import assert from 'node:assert/strict';
const { Collection, PermissionFlagsBits } = await import('discord.js');
const { prefixCommand } = await import('../src/features/prefixCommands.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const perms = (ok) => ({ has: (p) => ok && p === PermissionFlagsBits.ManageMessages });

function setup({ canManage = true, botCan = true } = {}) {
  const history = Array.from({ length: 60 }, (_, i) => ({ id: String(1000 + i), author: { id: i % 2 ? '222222222222222222' : '111111111111111111' } }));
  const sent = [];
  const channel = {
    sent, removed: [],
    send: async (text) => { sent.push(text); return { delete: async () => {} }; },
    messages: { fetch: async ({ limit }) => new Collection(history.slice(0, limit).map((x) => [x.id, x])) },
    bulkDelete: async (list) => { channel.removed.push(...list.map((x) => x.id)); return new Collection(list.map((x) => [x.id, x])); },
  };
  const make = (content) => ({
    id: 'cmd', content, channel, author: { id: 'A', toString: () => '@A' },
    member: { permissionsIn: () => perms(canManage) },
    guild: { members: { me: { permissionsIn: () => perms(botCan) } } },
    delete: async () => { channel.cmdDeleted = true; },
  });
  return { channel, make };
}

await check('!clear 20 : efface les 20 derniers messages et la commande', async () => {
  const { channel, make } = setup();
  assert.equal(await prefixCommand(make('!clear 20')), true);
  assert.equal(channel.removed.length, 20);
  assert.ok(channel.cmdDeleted);
  assert.match(channel.sent[0], /20\*\* messages supprimés/);
});

await check('!clear 5 @membre : seulement ses messages', async () => {
  const { channel, make } = setup();
  await prefixCommand(make('!clear 5 <@222222222222222222>'));
  assert.equal(channel.removed.length, 5);
});

await check('!clear 500 : plafonné à 100 (limite de Discord)', async () => {
  const { channel, make } = setup();
  await prefixCommand(make('!clear 500'));
  assert.ok(channel.removed.length <= 100);
});

await check('sans la permission Gérer les messages : refusé, rien n’est effacé', async () => {
  const { channel, make } = setup({ canManage: false });
  assert.equal(await prefixCommand(make('!clear 10')), true);
  assert.equal(channel.removed.length, 0);
  assert.match(channel.sent[0], /Gérer les messages/);
});

await check('autres messages en « ! » : ignorés', async () => {
  const { make } = setup();
  assert.equal(await prefixCommand(make('!bonjour')), false);
  assert.equal(await prefixCommand(make('!clear')), false);
});

console.log(`\n${passed} vérifications passées.`);
