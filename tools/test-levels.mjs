/**
 * Banc d'essai des niveaux, de la carte de profil, de la récompense du jour et de la boutique.
 *
 *   npm run test:levels            (APERCU_DIR=… : enregistre les cartes pour les regarder)
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.OWNER_ID = '111111111111111111';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'niveaux-'));

const { Collection, PermissionsBitField } = await import('discord.js');
const levels = await import('../src/features/levels.js');
const { setGuildSettings } = await import('../src/features/guildConfig.js');
const economy = await import('../src/casinho/economy.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

const G = '444444444444444444';
const U = '222222222222222222';
const sent = [];
const roles = new Collection([['777777777777777777', { id: '777777777777777777', members: new Collection() }]]);
const user = { id: U, username: 'lina', displayAvatarURL: () => 'https://cdn.invalid/avatar.png', toString: () => `<@${U}>` };
const member = { id: U, user, displayName: 'Lina', roles: { cache: new Collection(), add: async (ids) => { for (const r of [ids].flat()) member.roles.cache.set(r.id ?? r, {}); } }, toString: () => `<@${U}>` };
const channel = { id: 'c', isTextBased: () => true, send: async (p) => { sent.push(p); } };
const guild = { id: G, name: 'Serveur', roles: { cache: roles }, channels: { cache: new Collection([['c', channel]]) }, members: { cache: new Collection([[U, member]]) } };
setGuildSettings(G, { 'levels.roles': ['2 = 777777777777777777'] });
const message = () => ({ inGuild: () => true, guildId: G, guild, member, author: { id: U, bot: false }, channel });

await check('XP par message (une fois par minute), montée de niveau avec carte et rôle de palier', async () => {
  const realNow = Date.now;
  let t = realNow();
  Date.now = () => t;
  for (let i = 0; i < 40; i++) {
    await levels.xpForMessage(message());
    t += 61_000;
  }
  Date.now = realNow;
  const up = sent.filter((p) => /passe \*\*niveau/.test(p.content));
  assert.ok(up.length >= 2, 'au moins deux niveaux gagnés');
  assert.equal(up[0].files[0].name, 'niveau.png');
  assert.ok(member.roles.cache.has('777777777777777777'), 'rôle du niveau 2 donné');
  if (process.env.APERCU_DIR) writeFileSync(path.join(process.env.APERCU_DIR, 'carte-niveau.png'), up.at(-1).files[0].attachment);
});

await check('carte de profil : une image PNG', async () => {
  const card = await levels.profileCard(guild, user);
  assert.equal(card.name, 'profil.png');
  assert.ok(card.attachment.length > 5000);
  if (process.env.APERCU_DIR) writeFileSync(path.join(process.env.APERCU_DIR, 'carte-profil.png'), card.attachment);
});

await check('récompense du jour : une fois par jour, série comptée', async () => {
  const first = await levels.claimDaily(G, U);
  assert.equal(first.ok, true);
  assert.equal(first.amount, 250 + 50);
  assert.equal((await levels.claimDaily(G, U)).ok, false);
});

await check('boutique : achat d’un rôle, puis demande de rôle personnalisé acceptée par le staff', async () => {
  setGuildSettings(G, { 'shop.items': ['100 | 777777777777777777 | 🎨 Rôle test'], 'shop.requestsChannelId': '888888888888888888', 'shop.customRolePrice': 200 });
  roles.set('777777777777777777', { id: '777777777777777777', members: new Collection() });
  member.roles.cache.delete('777777777777777777');
  await economy.grant(U, 5000);
  const replies = [];
  const base = { user, member, guild, guildId: G, memberPermissions: new PermissionsBitField(PermissionsBitField.All), reply: async (p) => replies.push(p), update: async (p) => replies.push(p), showModal: async () => {} };
  await levels.handleShopComponent({}, { ...base, customId: 'sh:buy', values: ['0'] });
  assert.match(replies.at(-1).embeds[0].toJSON().description, /Acheté/);

  const requests = [];
  guild.channels.cache.set('888888888888888888', { id: '888888888888888888', isTextBased: () => true, send: async (p) => { requests.push(p); } });
  const before = await economy.balance(U);
  await levels.handleShopComponent({}, { ...base, customId: 'sh:customsend', fields: { getTextInputValue: (id) => ({ nom: '👑 Le Boss', hex: '#ff5fd2' }[id] ?? ''), getStringSelectValues: () => [] } });
  assert.equal(await economy.balance(U), before - 200, 'payé à la demande');
  const buttons = requests[0].components[0].toJSON().components;
  assert.equal(requests[0].embeds[0].toJSON().color, 0xff5fd2, 'l’embed a la couleur demandée');
  const created = [];
  guild.members.me = { roles: { highest: { position: 10 } } };
  guild.roles.create = async (o) => { created.push(o); return { id: 'r2' }; };
  guild.members.fetch = async () => member;
  await levels.handleShopComponent({ users: { fetch: async () => ({ send: async () => {} }) } }, { ...base, customId: buttons[0].custom_id, message: { embeds: [requests[0].embeds[0]] } });
  assert.equal(created[0].name, '👑 Le Boss');
  assert.equal(created[0].color, 0xff5fd2);
  assert.ok(member.roles.cache.has('r2'));
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
