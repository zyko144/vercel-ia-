/**
 * Banc d'essai : parrainage, page de paiement PayPal, vérification IPN (PayPal simulé),
 * page de statut, et sauvegarde / restauration / suggestions (communauté).
 *
 *   npm run test:payments
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY = 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'pay-'));
process.env.PAYPAL_EMAIL = 'caisse@exemple.fr';

let verdict = 'VERIFIED';
const verified = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = typeof url === 'string' ? url : String(url);
  if (!href.includes('paypal.com')) return realFetch(url, init);
  verified.push(init.body);
  return new Response(verdict, { status: 200 });
};

const { Collection, ChannelType, PermissionsBitField } = await import('discord.js');
const pay = await import('../src/features/payments.js');
const { planOf } = await import('../src/features/premium.js');
const community = await import('../src/features/community.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const A = '111111111111111111';
const B = '222222222222222222';
const dms = [];
const fakeGuild = (id, name) => ({ id, name, fetchOwner: async () => ({ send: async (t) => dms.push(t) }) });
const guilds = new Collection([[A, fakeGuild(A, 'Parrain')], [B, fakeGuild(B, 'Filleul')]]);
pay.setPaymentsClient({
  guilds: { cache: guilds }, users: { fetch: async () => ({ send: async (t) => dms.push(t) }) },
  isReady: () => true, ws: { ping: 42 }, user: { username: 'AI Vercel', displayAvatarURL: () => 'https://cdn/x.png' },
});

await check('parrainage : code stable, pas soi-même, une seule fois', async () => {
  const code = pay.referralCode(A);
  assert.match(code, /^VERCEL-[0-9A-F]{6}$/);
  assert.equal(pay.referralCode(A), code);
  assert.ok((await pay.useReferral(A, code)).error, 'soi-même refusé');
  assert.ok((await pay.useReferral(B, 'VERCEL-000000')).error, 'code inconnu');
  assert.equal((await pay.useReferral(B, code.toLowerCase())).sponsor.id, A);
  assert.ok((await pay.useReferral(B, code)).error, 'déjà entré');
  assert.equal((await pay.referralStats(A)).invited, 1);
});

await check('page de paiement : formulaire PayPal avec le serveur et l’offre', async () => {
  const html = pay.paymentPage(new URL(`http://x/payer?serveur=${B}&offre=gardien`));
  assert.match(html, /name="business" value="caisse@exemple.fr"/);
  assert.match(html, new RegExp(`value="${B}\\|gardien"`));
  assert.match(html, /value="9.99"/);
  assert.match(pay.paymentPage(new URL('http://x/payer?serveur=abc&offre=gardien')), /Lien incomplet/);
});

const ipn = (extra = {}) => new URLSearchParams({
  payment_status: 'Completed', receiver_email: 'caisse@exemple.fr', custom: `${B}|gardien`, mc_currency: 'EUR', mc_gross: '9.99', txn_id: 'T1', ...extra,
}).toString();

await check('IPN : refusé si PayPal ne confirme pas, si le montant est faux', async () => {
  verdict = 'INVALID';
  assert.equal((await pay.handleIpn(ipn())).ok, false);
  assert.match(verified.at(-1), /^cmd=_notify-validate&/);
  verdict = 'VERIFIED';
  assert.equal((await pay.handleIpn(ipn({ mc_gross: '1.00' }))).ok, false);
  assert.equal((await pay.handleIpn(ipn({ receiver_email: 'autre@x.fr' }))).ok, false);
  assert.equal(planOf(B).key, 'gratuit');
});

await check('IPN : paiement vérifié → offre active, parrain récompensé, pas deux fois', async () => {
  const r = await pay.handleIpn(ipn());
  assert.equal(r.ok, true);
  assert.equal(planOf(B).key, 'gardien');
  assert.equal(planOf(A).key, 'veilleur', '1 mois offert au parrain');
  assert.equal((await pay.referralStats(A)).paid, 1);
  assert.equal((await pay.handleIpn(ipn())).ok, false, 'même transaction');
  assert.equal((await pay.paymentHistory()).length, 1);
  assert.ok(dms.some((t) => /Paiement reçu/.test(t)));
});

await check('statut public : en ligne, latence, nombre de serveurs', async () => {
  const s = pay.statusJson();
  assert.equal(s.enLigne, true);
  assert.equal(s.serveurs, 2);
  assert.match(pay.statusPage(), /en ligne/);
});

await check('sauvegarde puis restauration : recrée seulement ce qui manque', async () => {
  const G = '333333333333333333';
  const perms = (n) => ({ bitfield: BigInt(n) });
  const roles = new Collection([
    [G, { id: G, name: '@everyone', managed: false, position: 0, color: 0, permissions: perms(1) }],
    ['r1', { id: 'r1', name: 'Staff', managed: false, position: 2, color: 0xff0000, hoist: true, mentionable: false, permissions: perms(8) }],
  ]);
  const overwrites = { cache: new Collection([['r1', { id: 'r1', type: 0, allow: perms(1024), deny: perms(0) }]]) };
  const cat = { name: 'Infos', type: ChannelType.GuildCategory, rawPosition: 0, parent: null, permissionOverwrites: { cache: new Collection() } };
  const channels = new Collection([
    ['c0', cat],
    ['c1', { name: 'annonces', type: ChannelType.GuildText, rawPosition: 1, parent: cat, topic: 'Les news', permissionOverwrites: overwrites }],
  ]);
  const guild = {
    id: G, roles: { cache: roles, everyone: roles.get(G), create: async (o) => { const r = { id: `n${roles.size}`, ...o }; roles.set(r.id, r); return r; } },
    channels: { cache: channels, create: async (o) => { const c = { ...o }; channels.set(`n${channels.size}`, c); return c; } },
  };
  const entry = await community.createBackup(guild, 'moi');
  assert.equal(entry.roles, 1);
  assert.equal(entry.channels, 2);
  assert.equal((await community.backupsOf(G)).length, 1);
  roles.delete('r1');
  channels.delete('c1');
  const r = await community.restoreBackup(guild, entry.id);
  assert.deepEqual(r.made, { roles: 1, channels: 1 });
  const again = await community.restoreBackup(guild, entry.id);
  assert.deepEqual(again.made, { roles: 0, channels: 0 }, 'rien en double');
  assert.match(JSON.stringify(community.restoreConfirm(entry).components[0].toJSON()), /bk:restore:/);
});

await check('suggestion : le message devient un embed voté avec les boutons du staff', async () => {
  const { setGuildSettings } = await import('../src/features/guildConfig.js');
  const G = '444444444444444444';
  setGuildSettings(G, { 'suggestions.channelId': '555555555555555555' });
  const sent = [];
  const reactions = [];
  const message = {
    inGuild: () => true, guildId: G, channelId: '555555555555555555', content: 'Ajouter un salon mèmes', author: { id: '666666666666666666', bot: false, username: 'lina', displayAvatarURL: () => null },
    member: { displayName: 'Lina' }, delete: async () => {},
    channel: { send: async (p) => { sent.push(p); return { react: async (e) => reactions.push(e), startThread: async () => {} }; } },
  };
  assert.equal(await community.suggestionMessage(message), true);
  assert.match(sent[0].embeds[0].toJSON().description, /mèmes/);
  assert.deepEqual(reactions, ['👍', '👎']);
  assert.equal(await community.suggestionMessage({ ...message, channelId: 'autre' }), false);
});

globalThis.fetch = realFetch;
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
