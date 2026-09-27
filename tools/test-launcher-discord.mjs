/**
 * Banc d'essai : groupes de jeu, alerte de connexion depuis un nouveau PC, liaison Discord, profil /launcher,
 * rôles automatiques et annonce des jeux gratuits Epic (Discord et e-mails simulés).
 *   node tools/test-launcher-discord.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.PORT = String(20000 + Math.floor(Math.random() * 20000));
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'ldiscord-'));
process.env.RESEND_API_KEY = 'essai';
const mails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => (String(u).startsWith('https://api.resend.com/') ? (mails.push(JSON.parse(o.body)), new Response('{}')) : realFetch(u, o));

const { startHttpServer } = await import('../src/server.js');
const { profileOf, rolesFor, handleLauncherCommand, _test } = await import('../src/features/launcherDiscord.js');
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const server = startHttpServer(() => ({ discord: 'ready' }));
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${process.env.PORT}/api/compte`;
const call = (p, token, body) => realFetch(`${base}/${p}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const signup = async (pseudo) => (await call('inscription', null, { pseudo, email: `${pseudo.toLowerCase()}@exemple.fr`, motDePasse: `Jeu-${pseudo}-2026x` })).token;
const noam = await signup('Noam'); const max = await signup('Max'); const zoe = await signup('Zoe');
const code = (await call('amis', max)).code;
await call('amis/ajouter', noam, { code });
await call('amis/accepter', max, { id: (await call('amis', max)).demandes[0].id });
const maxId = (await call('amis', noam)).amis[0].id;

await check('groupes de jeu : création avec ses amis seulement, message à tout le groupe, quitter', async () => {
  assert.equal((await call('groupes', noam, { nom: 'Squad RL', membres: ['inconnu'] })).status, 400, 'pas d’ami = refusé');
  const r = await call('groupes', noam, { nom: 'Squad <b>RL', membres: [maxId, 'inconnu'] });
  assert.equal(r.groupes[0].name, 'Squad bRL');
  assert.equal(r.groupes[0].members.length, 2);
  const gid = r.groupes[0].id;
  assert.equal((await call('groupes/prevenir', zoe, { id: gid, text: 'x' })).status, 404, 'pas membre');
  assert.equal((await call('groupes/prevenir', noam, { id: gid, text: 'On lance à 21 h ?' })).sent, 1);
  const box = (await call('boite', max)).items.filter((x) => x.type === 'group');
  assert.equal(box.at(-1).text, 'On lance à 21 h ?');
  assert.equal(box.at(-1).group, 'Squad bRL');
  assert.equal((await call('groupes/quitter', max, { id: gid })).groupes.length, 0);
  assert.equal((await call('amis', noam)).groupes[0].members.length, 1);
});

await check('alerte de connexion : e-mail seulement depuis un nouveau PC', async () => {
  const login = (appareil) => call('connexion', null, { email: 'zoe@exemple.fr', motDePasse: 'Jeu-Zoe-2026x', appareil });
  await login('pc-maison-123456');
  const before = mails.length;
  await login('pc-maison-123456');
  assert.equal(mails.length, before, 'même PC : rien');
  await login('pc-inconnu-987654');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(mails.length, before + 1);
  assert.match(mails.at(-1).subject, /Nouvelle connexion/);
  assert.equal(mails.at(-1).to[0], 'zoe@exemple.fr');
});

let noamId;
await check('liaison Discord : code à usage unique, profil /launcher avec niveau et benchmark', async () => {
  const c = await call('discord/code', noam, {});
  assert.match(c.code, /^[A-Z2-9]{6}$/);
  await call('presence', noam, { playing: 'Rocket League', week: 600, top: 'Rocket League', level: 27 });
  await call('benchmark', noam, { v: 2, scores: { total: 1650 }, cpu: 'Ryzen 7 7800X3D', gpu: 'RTX 4070' });
  const replies = [];
  const inter = (sub, opts = {}) => ({ user: { id: 'd1', username: 'noam', displayAvatarURL: () => 'https://x/a.png' }, options: { getSubcommand: () => sub, getString: () => opts.code, getUser: () => null }, reply: async (p) => replies.push(p) });
  await handleLauncherCommand({ channels: { fetch: async () => null } }, inter('lier', { code: 'ZZZZZZ' }));
  assert.match(replies.at(-1).content, /inconnu ou expiré/);
  await handleLauncherCommand({ channels: { fetch: async () => null } }, inter('lier', { code: c.code }));
  assert.match(replies.at(-1).content, /Noam/);
  await handleLauncherCommand({ channels: { fetch: async () => null } }, inter('lier', { code: c.code }));
  assert.match(replies.at(-1).content, /inconnu ou expiré/, 'code à usage unique');
  await handleLauncherCommand({}, inter('profil'));
  const e = replies.at(-1).embeds[0].toJSON();
  assert.match(e.description, /Rocket League/);
  const f = Object.fromEntries(e.fields.map((x) => [x.name, x.value]));
  assert.equal(f['⭐ Niveau'], '27');
  assert.match(f['🏁 Benchmark'], /1650/);
  assert.equal(f['🕒 Cette semaine'], '10 h 00');
  noamId = (await call('moi', noam)).compte.id;
});

await check('rôles automatiques selon le niveau et le benchmark', async () => {
  assert.deepEqual(rolesFor({ level: 27, bench: 1650 }), ['🏁 Monstre de jeu', '🔥 Niveau 25+']);
  assert.deepEqual(rolesFor({ level: 3, bench: null }), []);
  const roles = new Map(); const has = new Set(['old']);
  roles.set('old', { id: 'old', name: '👑 Niveau 50+' });
  const guild = {
    roles: { cache: { find: (fn) => [...roles.values()].find(fn) }, create: async ({ name }) => { const r = { id: name, name }; roles.set(name, r); return r; } },
    members: { fetch: async () => ({ roles: { cache: { has: (id) => has.has(id) }, add: async (r) => has.add(r.id), remove: async (r) => has.delete(r.id) } }) },
  };
  await _test.syncMember({ channels: { fetch: async () => ({ guild }) } }, 'd1', await profileOf(noamId));
  assert.ok(has.has('🏁 Monstre de jeu') && has.has('🔥 Niveau 25+'), 'rôles donnés (et créés)');
  assert.ok(!has.has('old'), 'ancien palier retiré');
});

await check('jeux gratuits Epic : annoncés une seule fois, avec image', async () => {
  const now = Date.now();
  const feed = { data: { Catalog: { searchStore: { elements: [{ title: 'Super Jeu', productSlug: 'super-jeu', keyImages: [{ type: 'OfferImageWide', url: 'https://img/x.jpg' }], price: { totalPrice: { discountPrice: 0 } }, promotions: { promotionalOffers: [{ promotionalOffers: [{ startDate: new Date(now - 86_400_000).toISOString(), endDate: new Date(now + 5 * 86_400_000).toISOString(), discountSetting: { discountPercentage: 0 } }] }] } }] } } } };
  const fetchImpl = async (u) => (String(u).includes('freeGamesPromotions') ? new Response(JSON.stringify(feed)) : new Response(new Uint8Array([1, 2, 3])));
  const sent = [];
  const client = { channels: { fetch: async () => ({ isTextBased: () => true, send: async (p) => sent.push(p) }) } };
  await _test.announceFree(client, fetchImpl);
  await new Promise((r) => setTimeout(r, 1200));
  await _test.announceFree(client, fetchImpl);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /^# 🎁 Super Jeu est gratuit/);
  assert.equal(sent[0].files.length, 1);
});

await check('salon des bons plans créé tout seul + grosses promos Steam une fois par jour', async () => {
  const created = []; const sent = [];
  const chan = { id: 'bp1', name: '🎁・jeux-gratuits-et-promos', isTextBased: () => true, send: async (p) => sent.push(p) };
  const guild = { channels: { cache: { find: () => null }, create: async (o) => { created.push(o); return chan; } } };
  const client = { channels: { fetch: async (id) => (id === 'bp1' ? chan : { guild, parentId: 'cat', isTextBased: () => true }) } };
  const steam = { specials: { items: [
    { id: 1, name: 'Gros Jeu', discounted: true, discount_percent: 75, original_price: 5999, final_price: 1499, header_image: 'https://x/1.jpg', discount_expiration: 1_900_000_000 },
    { id: 2, name: 'Petite promo', discounted: true, discount_percent: 20, original_price: 1000, final_price: 800 },
  ] } };
  const fetchImpl = async () => new Response(JSON.stringify(steam));
  await _test.announceDeals(client, fetchImpl);
  await new Promise((r) => setTimeout(r, 1200));
  await _test.announceDeals(client, fetchImpl);
  assert.equal(created.length, 1, 'salon créé une fois');
  assert.equal(created[0].parent, 'cat');
  assert.equal(sent.length, 1, 'une fois par jour');
  assert.equal(sent[0].embeds.length, 1, 'seulement les promos de -50 % et plus');
  assert.match(sent[0].embeds[0].toJSON().description, /14,99 €/);
});

server.close();
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
