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
const economy = await import('../src/features/economy.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

const G = '444444444444444444';
const U = '222222222222222222';
const V = '333333333333333333';
const sent = [];
const roles = new Collection([['777777777777777777', { id: '777777777777777777', members: new Collection() }]]);
const user = { id: U, username: 'lina', bot: false, displayAvatarURL: () => 'https://cdn.invalid/avatar.png', toString: () => `<@${U}>`, send: async () => {} };
const member = { id: U, user, displayName: 'Lina', roles: { cache: new Collection(), add: async (ids) => { for (const r of [ids].flat()) member.roles.cache.set(r.id ?? r, {}); } }, setNickname: async (n) => { member.displayName = n; }, toString: () => `<@${U}>` };
const channel = { id: 'c', isTextBased: () => true, send: async (p) => { sent.push(p); } };
const guild = { id: G, name: 'Serveur', roles: { cache: roles }, channels: { cache: new Collection([['c', channel]]) }, members: { cache: new Collection([[U, member]]) } };
setGuildSettings(G, { 'levels.roles': ['2 = 777777777777777777'] });
const message = () => ({ inGuild: () => true, guildId: G, guild, member, author: { id: U, bot: false }, channel, content: 'un message normal' });

await check('XP par message, 200 pièces par niveau, mention seulement tous les 5 niveaux, carte parchemin', async () => {
  const realNow = Date.now;
  let t = realNow();
  Date.now = () => t;
  for (let i = 0; i < 160; i++) {
    await levels.xpForMessage(message());
    t += 61_000;
  }
  Date.now = realNow;
  const up = sent.filter((p) => /passe \*\*niveau/.test(p.content));
  assert.ok(up.length >= 5, `au moins 5 niveaux gagnés (${up.length})`);
  assert.equal(up[0].files[0].name, 'niveau.png');
  assert.ok(member.roles.cache.has('777777777777777777'), 'rôle du niveau 2 donné');
  const five = up.find((p) => /niveau 5\*\*/.test(p.content));
  const two = up.find((p) => /niveau 2\*\*/.test(p.content));
  assert.deepEqual(five.allowedMentions.users, [U], 'ping au niveau 5');
  assert.deepEqual(two.allowedMentions.users, [], 'pas de ping au niveau 2');
  assert.match(two.content, /\+🪙 200 pièces/);
  const fromLevels = economy._test.purse(G, U).history.filter((h) => /^Niveau/.test(h.why)).reduce((a, h) => a + h.n, 0);
  assert.equal(fromLevels, up.length * 200, '200 pièces par niveau');
  assert.ok(await economy.goldOf(G, U) >= fromLevels, 'plus les quêtes de messages');
  if (process.env.APERCU_DIR) writeFileSync(path.join(process.env.APERCU_DIR, 'carte-niveau.png'), five.files[0].attachment);
});

await check('carte de profil : une image PNG', async () => {
  const card = await levels.profileCard(guild, user);
  assert.equal(card.name, 'profil.png');
  assert.ok(card.attachment.length > 5000);
  if (process.env.APERCU_DIR) writeFileSync(path.join(process.env.APERCU_DIR, 'carte-profil.png'), card.attachment);
});

await check('récompense du jour en pièces d’or : une fois par jour, série comptée', async () => {
  const before = await economy.goldOf(G, U);
  const first = await levels.claimDaily(G, U);
  assert.equal(first.ok, true);
  assert.equal(first.amount, 100 + 15);
  assert.equal(await economy.goldOf(G, U), before + 115);
  assert.equal((await levels.claimDaily(G, U)).ok, false);
  const booster = await levels.claimDaily(G, V, { premiumSince: new Date() });
  assert.equal(booster.amount, Math.round(115 * 1.5), 'boosters : +50 %');
  assert.equal(booster.booster, true);
});

const replies = [];
const base = (extra = {}) => ({ user, member, guild, guildId: G, memberPermissions: new PermissionsBitField(PermissionsBitField.All), reply: async (p) => replies.push(p), update: async (p) => replies.push(p), showModal: async () => {}, ...extra });
const text = () => replies.at(-1).embeds[0].toJSON().description;

await check('boutique : achat dans la cale, puis utilisation (XP ×2, immunité, coffre 3 par jour)', async () => {
  const shop = await levels.shopMessage(guild, U);
  assert.match(shop.embeds[0].toJSON().title, /comptoir/);
  const p = economy._test.purse(G, U);
  p.gold = 100;
  await levels.handleShopComponent({}, base({ customId: 'sh:buy', values: ['immunite'] }));
  assert.match(text(), /Il te faut/);
  p.gold = 50_000;
  const cost = (k) => economy.priceOf(G, k);
  await levels.handleShopComponent({}, base({ customId: 'sh:buy', values: ['xp'] }));
  assert.match(text(), /dans ta cale/);
  assert.equal(economy.xpMultiplier(G, U), 1, 'pas encore utilisé');
  assert.equal(replies.at(-1).components[0].toJSON().components[0].custom_id, 'sh:usenow:xp');
  await levels.handleShopComponent({}, base({ customId: 'sh:usenow:xp' }));
  assert.equal(economy.xpMultiplier(G, U), 2);
  await levels.handleShopComponent({}, base({ customId: 'sh:buy', values: ['immunite'] }));
  await levels.handleShopComponent({}, base({ customId: 'sh:use', values: ['immunite'] }));
  assert.equal(economy.isImmune(G, U), true);
  assert.equal(p.gold, 50_000 - cost('xp') - cost('immunite'));
  for (let i = 0; i < 4; i++) await levels.handleShopComponent({}, base({ customId: 'sh:buy', values: ['coffre'] }));
  for (let i = 0; i < 3; i++) await levels.handleShopComponent({}, base({ customId: 'sh:usenow:coffre' }));
  await levels.handleShopComponent({}, base({ customId: 'sh:usenow:coffre' }));
  assert.match(text(), /Trois coffres/);
  assert.equal(p.inv.coffre, 1, 'le 4e coffre reste dans la cale');
  await levels.handleShopComponent({}, base({ customId: 'sh:usenow:xp' }));
  assert.match(text(), /cale|pas/i, 'plus d’XP ×2 en stock');
});

await check('objets rares : stock du mois limité', async () => {
  const p = economy._test.purse(G, U);
  p.gold = 1_000_000;
  for (let i = 0; i < 6; i++) await levels.handleShopComponent({}, base({ customId: 'sh:buy', values: ['kraken'] }));
  assert.match(text(), /Épuisé/);
  assert.equal(p.inv.kraken, 5);
});

await check('don entre membres taxé à 5 %, rôle personnalisé payé en or et accepté', async () => {
  const p = economy._test.purse(G, U);
  p.gold = 30_000;
  const vBefore = await economy.goldOf(G, V);
  await levels.handleShopComponent({}, base({ customId: 'sh:giftsend', fields: {
    getSelectedUsers: () => new Collection([[V, { id: V, bot: false, username: 'sami', send: async () => {} }]]), getTextInputValue: (id) => (id === 'montant' ? '1000' : ''),
  }, guild: { ...guild, members: { ...guild.members, fetch: async () => null } } }));
  assert.equal(await economy.goldOf(G, V), vBefore + 950);
  assert.equal(p.gold, 29_000);
  setGuildSettings(G, { 'shop.requestsChannelId': '888888888888888888' });
  const requests = [];
  guild.channels.cache.set('888888888888888888', { id: '888888888888888888', isTextBased: () => true, send: async (x) => { requests.push(x); } });
  await levels.handleShopComponent({}, base({ customId: 'sh:customsend', fields: { getTextInputValue: (id) => ({ nom: '👑 Le Boss', hex: '#ff5fd2' }[id] ?? ''), getStringSelectValues: () => [] } }));
  assert.equal(p.gold, 9_000, '20 000 pièces payées');
  assert.equal(economy._test.meta(G).chest >= 50, true, 'taxe du don au coffre commun');
  const buttons = requests[0].components[0].toJSON().components;
  const created = [];
  guild.members.me = { roles: { highest: { position: 10 } } };
  guild.roles.create = async (o) => { created.push(o); return { id: 'r2' }; };
  guild.members.fetch = async () => member;
  await levels.handleShopComponent({ users: { fetch: async () => ({ send: async () => {} }) } }, base({ customId: buttons[0].custom_id, message: { embeds: [requests[0].embeds[0]] } }));
  assert.equal(created[0].name, '👑 Le Boss');
  assert.ok(member.roles.cache.has('r2'));
});

await check('titres, coffre tous les 10 niveaux, classement du mois, carte animée', async () => {
  const m = levels._test.me(G, U);
  assert.equal(levels.titleOf(0), 'Mousse');
  assert.equal(levels.titleOf(12), 'Canonnier');
  const p = economy._test.purse(G, U);
  const chests = p.inv.coffre ?? 0;
  // Juste avant le niveau 10
  let xp = 0;
  for (let n = 0; n < 10; n++) xp += levels.xpFor(n);
  m.xp = xp - 5;
  m.lastXp = 0;
  sent.length = 0;
  await levels.xpForMessage({ ...message(), content: 'un vrai message assez long' });
  const up = sent.find((x) => /niveau 10\*\*/.test(x.content));
  assert.ok(up, 'niveau 10 annoncé');
  assert.match(up.content, /coffre au trésor/);
  assert.match(up.content, /nouveau titre : \*\*Canonnier/);
  assert.equal(up.files[0].name, 'palier.gif', 'grand palier animé');
  assert.ok(up.files[0].attachment.subarray(0, 6).toString() === 'GIF89a');
  if (process.env.APERCU_DIR) writeFileSync(path.join(process.env.APERCU_DIR, 'palier.gif'), up.files[0].attachment);
  assert.equal(p.inv.coffre, chests + 1);
  assert.ok(m.month.xp > 0);
  const month = (await levels.leaderboardEmbed(guild, { month: true })).toJSON();
  assert.match(month.title, /du mois/);
  assert.match(month.description, new RegExp(U));
});

await check('messages courts : moins d’XP ; salons sans XP ; XP des réactions', async () => {
  const m = levels._test.me(G, U);
  const realRandom = Math.random;
  Math.random = () => 0;
  m.lastXp = 0; let before = m.xp;
  await levels.xpForMessage({ ...message(), content: 'ok' });
  const short = m.xp - before;
  m.lastXp = 0; before = m.xp;
  await levels.xpForMessage({ ...message(), content: 'un message bien plus long' });
  const long = m.xp - before;
  Math.random = realRandom;
  assert.ok(short * 2 < long, `court ${short} < long ${long}`);
  setGuildSettings(G, { 'levels.noXpChannels': ['<#c>', '123456789012345678'] });
  // « c » n'est pas un identifiant : on règle le vrai salon
  channel.id = '123456789012345678';
  m.lastXp = 0; before = m.xp;
  await levels.xpForMessage({ ...message(), content: 'dans le salon sans XP' });
  assert.equal(m.xp, before, 'pas d’XP ici');
  channel.id = 'c';
  before = m.xp;
  await levels.xpForReaction({ message: { guildId: G, guild, channel, author: { id: V } } }, user);
  assert.equal(m.xp - before, 3 * economy.xpMultiplier(G, U));
  before = m.xp;
  await levels.xpForReaction({ message: { guildId: G, guild, channel, author: { id: V } } }, user);
  assert.equal(m.xp, before, 'une fois par minute');
});

await check('prestige au niveau 50, comparaison, statistiques, thème de carte', async () => {
  const m = levels._test.me(G, U);
  assert.equal((await levels.prestige(G, U)).ok, false);
  let xp = 0;
  for (let n = 0; n < 50; n++) xp += levels.xpFor(n);
  m.xp = xp;
  const gold = await economy.goldOf(G, U);
  const r = await levels.prestige(G, U);
  assert.equal(r.ok, true);
  assert.equal(r.prestige, 1);
  assert.equal(m.xp, 0);
  assert.equal(await economy.goldOf(G, U), gold + 5000);
  const cmp = (await levels.compareEmbed(guild, user, { id: V, username: 'sami' })).toJSON();
  assert.match(cmp.title, /Lina contre sami/);
  assert.match(cmp.description, /Niveau/);
  const st = (await levels.statsEmbed(guild, user)).toJSON();
  assert.ok(st.fields.some((f) => /Prestige ⭐/.test(f.value)));
  economy._test.purse(G, U).cardTheme = 'ocean';
  const card = await levels.profileCard(guild, user);
  if (process.env.APERCU_DIR) writeFileSync(path.join(process.env.APERCU_DIR, 'carte-ocean.png'), card.attachment);
  assert.ok(card.attachment.length > 5000);
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
