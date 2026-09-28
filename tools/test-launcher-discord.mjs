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
process.env.LAUNCHER_CLIPS_SALON = 'clips1';
process.env.LAUNCHER_PARTIES_SALON = 'parties1';
const mails = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => (String(u).startsWith('https://api.resend.com/') ? (mails.push(JSON.parse(o.body)), new Response('{}')) : realFetch(u, o));

const { startHttpServer } = await import('../src/server.js');
const { profileOf, rolesFor, handleLauncherCommand, handlePartyButton, handleLauncherAutocomplete, _test } = await import('../src/features/launcherDiscord.js');
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
  const inter = (sub, opts = {}) => ({ user: { id: 'd1', username: 'noam', displayAvatarURL: () => 'https://x/a.png' }, deferReply: async () => {}, editReply: async (p) => replies.push(p), options: { getSubcommand: () => sub, getString: () => opts.code, getUser: () => null }, reply: async (p) => replies.push(p) });
  await handleLauncherCommand({ channels: { fetch: async () => null } }, inter('lier', { code: 'ZZZZZZ' }));
  assert.match(replies.at(-1).content, /inconnu ou expiré/);
  await handleLauncherCommand({ channels: { fetch: async () => null } }, inter('lier', { code: c.code }));
  assert.match(replies.at(-1).content, /Noam/);
  assert.equal(replies.at(-1).files[0].attachment.subarray(0, 4).toString(), 'GIF8', 'carte envoyée à la liaison');
  await handleLauncherCommand({ channels: { fetch: async () => null } }, inter('lier', { code: c.code }));
  assert.match(replies.at(-1).content, /inconnu ou expiré/, 'code à usage unique');
  await handleLauncherCommand({}, inter('profil'));
  const file = replies.at(-1).files[0];
  assert.equal(file.name, 'history-profil.gif');
  assert.equal(file.attachment.subarray(0, 4).toString(), 'GIF8', 'carte animée');
  const p = await profileOf((await call('moi', noam)).compte.id);
  assert.equal(p.level, 27); assert.equal(p.bench, 1650); assert.equal(p.week, 600); assert.equal(p.playing, 'Rocket League');
  const { launcherCardSvg } = await import('../src/features/launcherCard.js');
  const svg = launcherCardSvg({ ...p, pseudo: 'Noam' });
  for (const x of ['NIVEAU 27', '1650', '10 h 00', 'Rocket League']) assert.ok(svg.includes(x), x);
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
  await _test.syncMember({ guilds: { fetch: async () => guild } }, 'd1', await profileOf(noamId));
  assert.ok(has.has('🏁 Monstre de jeu') && has.has('🔥 Niveau 25+'), 'rôles donnés (et créés)');
  assert.ok(!has.has('old'), 'ancien palier retiré');
});

await check('jeux gratuits Epic : annoncés une seule fois, avec image', async () => {
  const now = Date.now();
  const feed = { data: { Catalog: { searchStore: { elements: [{ title: 'Super Jeu', productSlug: 'super-jeu', keyImages: [{ type: 'OfferImageWide', url: 'https://img/x.jpg' }], price: { totalPrice: { discountPrice: 0 } }, promotions: { promotionalOffers: [{ promotionalOffers: [{ startDate: new Date(now - 86_400_000).toISOString(), endDate: new Date(now + 5 * 86_400_000).toISOString(), discountSetting: { discountPercentage: 0 } }] }] } }] } } } };
  const fetchImpl = async (u) => (String(u).includes('freeGamesPromotions') ? new Response(JSON.stringify(feed)) : new Response(new Uint8Array([1, 2, 3])));
  const sent = [];
  // Serveur du launcher installé : les annonces vont dans son salon jeux-gratuits
  await (await import('../src/storage.js')).save('launcher-serveurs', [{ guildId: 'g1', news: 'n1', deals: 'd1' }]);
  const client = { channels: { fetch: async () => ({ isTextBased: () => true, send: async (p) => sent.push(p) }) } };
  await _test.announceFree(client, fetchImpl);
  await new Promise((r) => setTimeout(r, 1200));
  await _test.announceFree(client, fetchImpl);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /^# 🎁 Super Jeu est gratuit/);
  assert.equal(sent[0].files.length, 1);
});

await check('grosses promos Steam une fois par jour, dans le salon jeux-gratuits', async () => {
  const sent = [];
  const client = { channels: { fetch: async () => ({ send: async (p) => sent.push(p) }) } };
  const steam = { specials: { items: [
    { id: 1, name: 'Gros Jeu', discounted: true, discount_percent: 75, original_price: 5999, final_price: 1499, header_image: 'https://x/1.jpg', discount_expiration: 1_900_000_000 },
    { id: 2, name: 'Petite promo', discounted: true, discount_percent: 20, original_price: 1000, final_price: 800 },
  ] } };
  const fetchImpl = async () => new Response(JSON.stringify(steam));
  await _test.announceDeals(client, fetchImpl);
  await new Promise((r) => setTimeout(r, 1200));
  await _test.announceDeals(client, fetchImpl);
  assert.equal(sent.length, 1, 'une fois par jour');
  assert.equal(sent[0].embeds.length, 1, 'seulement les promos de -50 % et plus');
  assert.match(sent[0].embeds[0].toJSON().description, /14,99 €/);
});

// Faux Discord pour les salons du launcher (clips, parties) et les messages privés
const posted = { clips1: [], parties1: [] }; const dms = [];
const fakeChannel = (id) => ({ id, isTextBased: () => true, send: async (p) => { posted[id].push(p); return { url: `https://discord.com/channels/x/${id}/1` }; } });
_test.setClient({ channels: { fetch: async (id) => (posted[id] ? fakeChannel(id) : null) }, users: { fetch: async (id) => ({ send: async (p) => dms.push({ id, ...p }) }) } });
const raw = (p, token, buf) => realFetch(`${base}/${p}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: buf }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const linkAs = async (token, discordId) => { const c = await call('discord/code', token, {}); const replies = []; await handleLauncherCommand({ channels: { fetch: async () => null } }, { user: { id: discordId, username: discordId, displayAvatarURL: () => 'https://x/a.png' }, deferReply: async () => {}, editReply: async (p) => replies.push(p), options: { getSubcommand: () => 'lier', getString: () => c.code, getUser: () => null }, reply: async (p) => replies.push(p) }); };

await check('clips : refusé sans Discord lié, image envoyée dans le salon des clips, vidéo trop lourde réencodée', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000', 'hex');
  assert.equal((await raw('discord/clip?type=png', zoe, png)).status, 403, 'compte non lié');
  assert.equal((await raw('discord/clip?type=exe', noam, png)).status, 400);
  const r = await raw(`discord/clip?type=png&jeu=${encodeURIComponent('Rocket League')}&texte=GG`, noam, png);
  assert.equal(r.ok, true, r.error);
  const m = posted.clips1.at(-1);
  assert.match(m.content, /Noam.*<@d1>.*capture de \*\*Rocket League\*\*/s);
  assert.deepEqual(m.allowedMentions, { parse: [] });
  assert.equal(m.files[0].name.endsWith('.png'), true);
  // Vidéo de 12 Mo : réencodée en 720p pour passer sous la limite de Discord
  const { default: ffmpeg } = await import('ffmpeg-static');
  const { execFileSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');
  const big = path.join(process.env.STORAGE_DIR, 'big.mp4');
  execFileSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'anoisesrc=d=8', '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '14M', '-minrate', '14M', '-maxrate', '14M', '-bufsize', '2M', '-c:a', 'aac', big], { stdio: 'ignore' });
  const buf = readFileSync(big);
  assert.ok(buf.length > 10 * 1024 * 1024, `vidéo de test trop petite (${buf.length})`);
  const fit = await _test.fitForDiscord(buf, 'mp4');
  assert.ok(fit.buf.length <= 9.5 * 1024 * 1024 && fit.ext === 'mp4');
  await assert.rejects(_test.fitForDiscord(Buffer.alloc(11 * 1024 * 1024), 'png'), /image trop lourde/);
});

await check('partie de groupe : mention des membres liés, « Je viens » prévient l’organisateur dans le launcher', async () => {
  await linkAs(max, 'd2');
  const g = await call('groupes', noam, { nom: 'Squad', membres: [maxId] });
  const gid = g.groupes.find((x) => x.name === 'Squad').id;
  assert.equal((await call('groupes/partie', zoe, { id: gid })).status, 404);
  const r = await call('groupes/partie', noam, { id: gid, jeu: 'Rocket League', texte: 'Ranked à 21 h ?' });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.mentioned, 1);
  const m = posted.parties1.at(-1);
  assert.equal(m.content, '<@d2>');
  assert.deepEqual(m.allowedMentions, { users: ['d2'] });
  const e = m.embeds[0].toJSON();
  assert.match(e.title, /Noam lance Rocket League/);
  const btn = m.components[0].toJSON().components[0].custom_id;
  assert.match(btn, /^hlparty:oui:/);
  let upd = null;
  await handlePartyButton({ customId: btn, user: { id: 'd2', username: 'max' }, update: async (p) => { upd = p; }, reply: async () => {} });
  assert.match(upd.embeds[0].toJSON().fields[1].value, /✅ <@d2>/);
  assert.match(upd.embeds[0].toJSON().fields[1].name, /\(2\)/);
  const box = (await call('boite', noam)).items;
  assert.match(box.at(-1).text, /Max vient à ta partie/);
  assert.equal((await call('boite', max)).items.filter((x) => x.type === 'group').at(-1).text, 'Ranked à 21 h ?');
});

await check('/launcher comparer (duel en GIF) et /launcher fps (classement du jeu, autocomplétion)', async () => {
  const replies = [];
  const inter = (sub, o = {}) => ({ user: { id: 'd1', username: 'noam', displayAvatarURL: () => 'https://x/a.png' }, deferReply: async () => {}, editReply: async (p) => replies.push(p), reply: async (p) => replies.push(p),
    options: { getSubcommand: () => sub, getUser: (n) => o[n] ?? null, getString: () => o.jeu, getFocused: () => o.focus } });
  await handleLauncherCommand({}, inter('comparer', { membre: { id: 'd3', username: 'zoe' } }));
  assert.match(replies.at(-1).content, /Pas de compte History lié pour zoe/);
  await handleLauncherCommand({}, inter('comparer', { membre: { id: 'd2', username: 'max', displayAvatarURL: () => 'https://x/b.png' } }));
  assert.equal(replies.at(-1).files[0].name, 'history-duel.gif');
  assert.equal(replies.at(-1).files[0].attachment.subarray(0, 4).toString(), 'GIF8');
  assert.equal((await call('fps', noam, { jeu: 'Rocket League', avg: 240, low1: 180, minutes: 2 })).status, 400, 'partie trop courte');
  await call('fps', noam, { jeu: 'Rocket League', avg: 240, low1: 180, minutes: 30 });
  await call('fps', max, { jeu: 'rocket league', avg: 144, low1: 90, minutes: 12 });
  await handleLauncherCommand({}, inter('fps', { jeu: 'Rocket League' }));
  const e = replies.at(-1).embeds[0].toJSON();
  assert.match(e.description, /1\. Noam\*\* · \*\*240 FPS\*\*.*RTX 4070/s);
  assert.match(e.description, /2\. Max\*\* · \*\*144 FPS/);
  let choices = null;
  await handleLauncherAutocomplete({ options: { getFocused: () => 'rock' }, respond: async (c) => { choices = c; } });
  assert.equal(choices[0].value, 'Rocket League', 'le premier nom reste');
  assert.match(choices[0].name, /2 joueurs/);
  await handleLauncherCommand({}, inter('fps', { jeu: 'Jeu inconnu' }));
  assert.match(replies.at(-1).content, /Personne n’a encore mesuré/);
});

await check('partage de sauvegarde entre amis : seulement l’ami destinataire, 24 h', async () => {
  const data = Buffer.from('sauvegarde-de-test');
  assert.equal((await raw(`partage?a=${encodeURIComponent('inconnu')}`, noam, data)).status, 404);
  assert.equal((await raw(`partage?a=${maxId}&jeu=Minecraft&nom=Monde`, noam, data)).ok, true);
  const item = (await call('boite', max)).items.find((x) => x.type === 'share');
  assert.equal(item.game, 'Minecraft'); assert.equal(item.size, data.length);
  const get = (token) => realFetch(`${base}/partage?id=${item.share}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal((await get(zoe)).status, 404, 'pas pour les autres');
  assert.equal(Buffer.from(await (await get(max)).arrayBuffer()).toString(), 'sauvegarde-de-test');
});

await check('promos en message privé : prix suivi et liste de souhaits, une seule fois par baisse', async () => {
  const r = await call('alertes', noam, { steam: '76561198000000001', prix: [{ appId: '252950', name: 'Rocket League', target: 10 }, { appId: 'x', name: 'mauvais' }], mp: true });
  assert.equal(r.suivis, 1);
  await call('alertes', max, { prix: [{ appId: '1', name: 'X', target: 5 }], mp: false });
  const fetchImpl = async (u) => {
    u = String(u);
    if (u.includes('appdetails')) return new Response(JSON.stringify({ 252950: { success: true, data: { price_overview: { final: 799, initial: 1999, discount_percent: 60 } } }, 1: { success: true, data: { price_overview: { final: 100, initial: 1000, discount_percent: 90 } } } }));
    if (u.includes('GetWishlist')) return new Response(JSON.stringify({ response: { items: [{ appid: 570 }] } }));
    if (u.includes('GetItems')) return new Response(JSON.stringify({ response: { store_items: [{ appid: 570, name: 'Jeu Souhaité', best_purchase_option: { discount_pct: 40, formatted_final_price: '12,00€', formatted_original_price: '20,00€' } }] } }));
    return new Response('{}', { status: 404 });
  };
  dms.length = 0;
  assert.equal(await _test.checkWatch({ users: { fetch: async (id) => ({ send: async (p) => dms.push({ id, ...p }) }) } }, fetchImpl), 1);
  assert.equal(dms.length, 1, 'Max a coupé les messages privés');
  assert.equal(dms[0].id, 'd1');
  const titles = dms[0].embeds.map((x) => x.toJSON().title);
  assert.ok(titles.includes('💸 Rocket League à 7,99 €'), titles.join());
  assert.ok(titles.includes('Jeu Souhaité : -40 %'));
  await _test.checkWatch({ users: { fetch: async (id) => ({ send: async (p) => dms.push({ id, ...p }) }) } }, fetchImpl);
  assert.equal(dms.length, 1, 'pas deux fois la même promo');
});

server.close();
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
