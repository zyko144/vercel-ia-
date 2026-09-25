/**
 * Banc d'essai du trésor : quêtes, banque, marché, enchères, loterie, abordage, impôt, salons dédiés.
 *
 *   node tools/test-treasury.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.OWNER_ID = '111111111111111111';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'tresor-'));

const { ChannelType, Collection, PermissionsBitField } = await import('discord.js');
const tr = await import('../src/features/treasury.js');
const economy = await import('../src/features/economy.js');
const { cfg, setGuildSettings } = await import('../src/features/guildConfig.js');
const { installBotChannels } = await import('../src/features/botChannels.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

const G = '444444444444444444';
const U = '222222222222222222';
const V = '333333333333333333';
const posts = [];
const treasury = { id: '555555555555555555', isTextBased: () => true, send: async (p) => { posts.push(p); return { id: `m${posts.length}`, url: 'https://discord.com/x' }; }, messages: { fetch: async () => ({ edit: async (p) => posts.push(p) }) } };
const channels = new Collection([[treasury.id, treasury]]);
const guild = { id: G, name: 'Navire', channels: { cache: channels }, members: { cache: new Collection() } };
const user = (id, name) => ({ id, username: name, bot: false, send: async () => {}, toString: () => `<@${id}>` });
const replies = [];
const base = (who, extra = {}) => ({ user: who, guild, guildId: G, memberPermissions: new PermissionsBitField(PermissionsBitField.All), reply: async (p) => replies.push(p), update: async (p) => replies.push(p), showModal: async (m) => replies.push({ modal: m }), ...extra });
const modal = (values) => ({ fields: { getTextInputValue: (id) => String(values[id] ?? '') } });
const text = () => replies.at(-1).embeds?.[0]?.toJSON().description ?? replies.at(-1).content ?? '';
await economy.data();
const lina = user(U, 'lina');
const sami = user(V, 'sami');

await check('quêtes : 3 du jour + 1 de la semaine, payées une fois, bonus quand tout est fait', async () => {
  const q = tr._test.questsOf(G, U);
  assert.equal(q.daily.length, 3);
  assert.ok(q.weekly?.goal > 0);
  const before = await economy.goldOf(G, U);
  for (const quest of q.daily) await tr.questProgress(G, U, quest.kind, quest.goal);
  const after = await economy.goldOf(G, U);
  assert.ok(after - before >= 3 * tr._test.DAILY_REWARD + 200, `3 quêtes + bonus (${after - before})`);
  const again = await economy.goldOf(G, U);
  for (const quest of q.daily) await tr.questProgress(G, U, quest.kind, quest.goal);
  assert.ok(await economy.goldOf(G, U) - again < tr._test.DAILY_REWARD * 3, 'pas payé deux fois');
});

await check('banque : dépôt et retrait, bourse protégée', async () => {
  const p = economy._test.purse(G, U);
  p.gold = 10_000;
  await tr.handleTreasuryComponent({}, base(lina, { customId: 'tr:depositsend', ...modal({ montant: 4000 }) }));
  assert.equal(p.gold, 6000);
  assert.equal(p.bank, 4000);
  await tr.handleTreasuryComponent({}, base(lina, { customId: 'tr:withdrawsend', ...modal({ montant: 9999 }) }));
  assert.match(text(), /que 🏦/);
  await tr.handleTreasuryComponent({}, base(lina, { customId: 'tr:withdrawsend', ...modal({ montant: 1000 }) }));
  assert.equal(p.bank, 3000);
  assert.equal(p.gold, 7000);
});

await check('marché : mise en vente depuis la cale, achat taxé à 5 % au coffre commun', async () => {
  await economy.giveItem(G, U, 'xp');
  const p = economy._test.purse(G, U);
  const q = economy._test.purse(G, V);
  q.gold = 5000;
  await tr.handleTreasuryComponent({}, base(lina, { customId: 'tr:sellsend:xp', ...modal({ prix: 2000 }) }));
  assert.equal(p.inv.xp, 0);
  const listing = economy._test.meta(G).market[0];
  const chest = economy._test.meta(G).chest;
  const sellerBefore = p.gold;
  await tr.handleTreasuryComponent({}, base(sami, { customId: 'tr:buy', values: [listing.id] }));
  assert.equal(q.gold, 3000);
  assert.equal(q.inv.xp, 1);
  assert.equal(p.gold, sellerBefore + 1900);
  assert.equal(economy._test.meta(G).chest, chest + 100);
});

await check('enchère : offre, offre dépassée remboursée, fin : objet au gagnant, moitié au coffre', async () => {
  setGuildSettings(G, { 'economy.channelId': treasury.id });
  const r = await tr.createAuction(guild, 'kraken', 5, 1000, U);
  assert.ok(r.url);
  const a = economy._test.meta(G).auctions[0];
  economy._test.purse(G, U).gold = 10_000;
  economy._test.purse(G, V).gold = 10_000;
  await tr.handleTreasuryComponent({}, base(lina, { customId: `tr:bid:${a.id}:100` }));
  assert.equal(a.bidder, U);
  assert.equal(economy._test.purse(G, U).gold, 9000);
  await tr.handleTreasuryComponent({}, base(sami, { customId: `tr:bid:${a.id}:500` }));
  assert.equal(a.bid, 1500);
  assert.equal(economy._test.purse(G, U).gold, 10_000, 'remboursé');
  const chest = economy._test.meta(G).chest;
  a.endsAt = Date.now() - 1;
  tr._test.setClient({ guilds: { cache: new Collection([[G, guild]]) } });
  await tr.treasuryTick();
  assert.equal(economy._test.purse(G, V).inv.kraken, 1);
  assert.equal(economy._test.meta(G).chest, chest + 750);
  assert.equal(economy._test.meta(G).auctions.length, 0);
});

await check('loterie : tickets payés, tirage 90 % au gagnant', async () => {
  economy._test.purse(G, U).gold = 1000;
  await tr.handleTreasuryComponent({}, base(lina, { customId: 'tr:ticket:5' }));
  assert.equal(economy._test.purse(G, U).gold, 500);
  const l = tr._test.lotteryOf(G);
  assert.equal(l.tickets[U], 5);
  await tr._test.drawLottery(guild, l);
  assert.equal(economy._test.purse(G, U).gold, 500 + 450);
});

await check('abordage : cible immunisée refusée, attente de 6 h, vol plafonné ou amende', async () => {
  const me = economy._test.purse(G, U);
  const them = economy._test.purse(G, V);
  me.gold = 5000; me.lastRob = 0;
  them.gold = 100_000; them.robbedAt = 0; them.immuneUntil = Date.now() + 1000;
  const inter = base(lina);
  let r = await tr._test.robbery(inter, sami);
  assert.match(r.embeds[0].toJSON().description, /immunité/);
  them.immuneUntil = 0;
  const realRandom = Math.random;
  Math.random = () => 0.1;
  r = await tr._test.robbery(inter, sami);
  Math.random = realRandom;
  assert.equal(them.gold, 97_000, 'plafond de 3 000');
  assert.equal(me.gold, 8000);
  r = await tr._test.robbery(inter, sami);
  assert.match(r.embeds[0].toJSON().description, /repose/);
  me.lastRob = 0; them.robbedAt = 0;
  Math.random = () => 0.9;
  await tr._test.robbery(inter, sami);
  Math.random = realRandom;
  assert.equal(me.gold, 8000 - 800, 'amende de 10 %');
});

await check('lundi : impôt de 2 % au-delà de 50 000 et intérêts de 1 % à la banque', async () => {
  const m = economy._test.meta(G);
  m.lastTaxWeek = '2000-01-03';
  const p = economy._test.purse(G, U);
  p.gold = 150_000; p.bank = 10_000;
  economy._test.purse(G, V).gold = 1000;
  const chest = m.chest;
  await tr.treasuryTick();
  assert.equal(p.gold, 148_000);
  assert.equal(p.bank, 10_100);
  assert.equal(m.chest, chest + 2000);
});

await check('gains de jeux : 10 payés par jour', async () => {
  let total = 0;
  for (let i = 0; i < 12; i++) total += await tr.rewardWin(G, V, 50);
  assert.equal(total, 500);
});

await check('salons dédiés : catégorie + 6 salons, réglages remplis sans écraser', async () => {
  const created = [];
  const all = new Collection();
  const g = {
    id: '666666666666666666', name: 'Autre', roles: { cache: new Collection() },
    members: { me: { id: '999999999999999999', permissions: new PermissionsBitField(PermissionsBitField.All) } },
    channels: {
      cache: all, fetch: async () => all,
      create: async (o) => { const c = { id: String(700000000000000000n + BigInt(created.length)), name: o.name, type: o.type, parentId: o.parent ?? null, toString: () => `#${o.name}` }; created.push(o); all.set(c.id, c); return c; },
    },
  };
  setGuildSettings(g.id, { 'logs.channelId': '123456789012345678' });
  const r = await installBotChannels(g);
  assert.equal(r.ok, true);
  assert.equal(created[0].type, ChannelType.GuildCategory);
  assert.equal(created.length, 7);
  assert.ok(cfg(g.id, 'levels.channelId'));
  assert.ok(cfg(g.id, 'games.channelId'));
  assert.equal(cfg(g.id, 'logs.channelId'), '123456789012345678', 'pas écrasé');
  const again = await installBotChannels(g);
  assert.equal(again.created.length, 0, 'rien en double');
  await installBotChannels(g, { replace: true });
  assert.notEqual(cfg(g.id, 'logs.channelId'), '123456789012345678');
  const staff = created.find((o) => /journal/.test(o.name));
  assert.ok(staff.permissionOverwrites.some((o) => o.id === g.id && o.deny.length), 'journal caché aux membres');
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
