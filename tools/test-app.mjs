/**
 * Banc d'essai du tableau de bord public (/app) : session, droits, réglages, premium verrouillé, essai, publication.
 * Discord est simulé. `node tools/test-app.mjs --serve` laisse le serveur allumé (port 8812) pour regarder la page.
 *
 *   npm run test:app
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const serve = process.argv.includes('--serve');
process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY = 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.DISCORD_CLIENT_SECRET = 'secret-essai';
process.env.PORT = serve ? '8812' : '0';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'app-'));

// Une session déjà ouverte (comme après « Se connecter avec Discord »)
const COOKIE = 'a'.repeat(43);
const G = '444444444444444444';
const OTHER = '555555555555555555';
const USER = '222222222222222222';
const now = Date.now();
writeFileSync(path.join(process.env.STORAGE_DIR, 'app-sessions.json'), JSON.stringify({
  [createHash('sha256').update(COOKIE).digest('hex')]: {
    userId: USER, name: 'Lina', avatar: null, createdAt: now, lastSeen: now,
    guilds: [{ id: G, name: 'Les Veilleurs', icon: null }, { id: OTHER, name: 'Sans le bot', icon: null }],
  },
}));

const { Collection, ChannelType, PermissionsBitField } = await import('discord.js');
const { setAppClient } = await import('../src/dashboard/userApp.js');
const { startHttpServer } = await import('../src/server.js');

const sent = [];
const channel = {
  id: '666666666666666666', guildId: G, name: 'général', type: ChannelType.GuildText, rawPosition: 0, isTextBased: () => true,
  permissionsFor: () => ({ has: () => true }), send: async (p) => { sent.push(p); return { id: 'm1', url: 'https://discord.com/channels/x/y/z' }; },
};
const members = new Collection([[USER, { id: USER, permissions: new PermissionsBitField(PermissionsBitField.Flags.ManageGuild) }]]);
const guild = {
  id: G, name: 'Les Veilleurs', ownerId: '1', memberCount: 1284, iconURL: () => null,
  members: { fetch: async (id) => members.get(id) ?? null, me: {} },
  channels: { cache: new Collection([[channel.id, channel]]) },
  roles: { cache: new Collection([['777777777777777777', { id: '777777777777777777', name: 'Staff', color: 0x5865f2, managed: false, position: 1 }]]) },
};
channel.guild = guild;
const client = {
  isReady: () => true, user: { id: '1549507270193193071', username: 'History IA', displayAvatarURL: () => null },
  guilds: { cache: new Collection([[G, guild]]) }, channels: { cache: new Collection([[channel.id, channel]]) }, users: { cache: new Collection() },
};
setAppClient(client);
const server = startHttpServer(() => ({ bot: 'x', discord: 'ready' }));
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}`;
const call = (method, p, body, cookie = true) => fetch(`${url}/app/api/${p}`, {
  method, headers: { ...(cookie ? { Cookie: `vercel_app=${COOKIE}` } : {}), ...(body ? { 'Content-Type': 'application/json', 'X-App': '1' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

if (serve) {
  console.log(`Page : ${url}/app (cookie vercel_app=${COOKIE})`);
} else {
  let passed = 0;
  const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

  await check('sans session : on demande de se connecter ; la connexion part vers Discord', async () => {
    assert.equal((await (await call('GET', 'me', null, false)).json()).connected, false);
    assert.equal((await call('GET', 'servers', null, false)).status, 401);
    const login = await fetch(`${url}/app/login`, { redirect: 'manual' });
    assert.equal(login.status, 302);
    assert.match(login.headers.get('location'), /^https:\/\/discord\.com\/oauth2\/authorize\?.*scope=identify\+guilds/);
    const bad = await fetch(`${url}/app/callback?code=x&state=faux`, { redirect: 'manual' });
    assert.match(bad.headers.get('location'), /erreur=etat/);
  });

  await check('mes serveurs : gérer là où le bot est, l’ajouter ailleurs', async () => {
    const { servers } = await (await call('GET', 'servers')).json();
    assert.equal(servers[0].id, G);
    assert.equal(servers[0].botIn, true);
    assert.match(servers[1].invite, /guild_id=555555555555555555/);
  });

  await check('droits : sans « Gérer le serveur », refusé', async () => {
    members.get(USER).permissions = new PermissionsBitField(0n);
    assert.equal((await call('GET', `server?id=${G}`)).status, 403);
    members.get(USER).permissions = new PermissionsBitField(PermissionsBitField.Flags.ManageGuild);
    const d = await (await call('GET', `server?id=${G}`)).json();
    assert.equal(d.plan.key, 'gratuit');
    assert.ok(d.settings.length > 20);
  });

  await check('réglages gratuits : enregistrés, valeur invalide refusée', async () => {
    assert.equal((await call('POST', 'server/settings', { guildId: G, changes: { 'antiSpam.enabled': false } })).status, 200);
    const d = await (await call('GET', `server?id=${G}`)).json();
    assert.equal(d.settings.find((s) => s.key === 'antiSpam.enabled').value, false);
    assert.equal((await call('POST', 'server/settings', { guildId: G, changes: { 'antiSpam.messages': 999 } })).status, 400);
    const forged = await fetch(`${url}/app/api/server/settings`, { method: 'POST', headers: { Cookie: `vercel_app=${COOKIE}`, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(forged.status, 403, 'sans l’en-tête de la page');
  });

  await check('premium verrouillé en gratuit, débloqué par l’essai de 7 jours (vraie date de fin)', async () => {
    const locked = await call('POST', 'server/premium', { guildId: G, feature: 'voices', data: { voice: 'Puck' } });
    assert.equal(locked.status, 402);
    const trial = await (await call('POST', 'server/trial', { guildId: G })).json();
    assert.equal(trial.plan.trial, true);
    assert.ok(Math.abs(trial.plan.until - (Date.now() + 7 * 86_400_000)) < 60_000);
    assert.equal((await call('POST', 'server/trial', { guildId: G })).status, 400, 'une seule fois');
    const d = await (await call('GET', `server?id=${G}`)).json();
    const voice = d.premium.voice.voices[0].key;
    assert.equal((await call('POST', 'server/premium', { guildId: G, feature: 'voices', data: { voice } })).status, 200);
    assert.equal((await call('POST', 'server/premium', { guildId: G, feature: 'branding', data: { name: 'Veilleurs', color: '#ff0000' } })).status, 200);
    assert.equal((await (await call('GET', `server?id=${G}`)).json()).premium.branding.color, '#ff0000');
  });

  await check('tickets : panneau publié dans le salon, visible dans la liste', async () => {
    const r = await call('POST', 'server/publish', { guildId: G, kind: 'ticket', channelId: channel.id, title: 'Support', message: 'Clique ici', color: 'cyan' });
    assert.equal(r.status, 200);
    assert.equal(sent.length, 1);
    assert.match(JSON.stringify(sent[0].components[0].toJSON()), /tk:open:/);
    assert.equal((await (await call('GET', `server?id=${G}`)).json()).tickets.panels.length, 1);
    assert.equal((await call('POST', 'server/publish', { guildId: G, kind: 'ticket', channelId: '999999999999999999', title: 'x', message: 'y' })).status, 400);
  });

  await check('jouer depuis le site : un lien personnel vers l’arcade du serveur (salle « site »)', async () => {
    const r = await call('GET', 'arcade');
    const body = await r.json();
    assert.equal(r.status, 200, JSON.stringify(body));
    const { servers } = body;
    assert.equal(servers[0].id, G);
    assert.match(servers[0].link, new RegExp(`^/arcade/\\?room=${G}&guild=${G}#s=`));
  });
  console.log(`\n${passed} vérifications passées.`);
  process.exit(0);
}
