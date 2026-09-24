/**
 * Banc d'essai du tableau de bord : on vérifie surtout qu'il se défend bien.
 * Un faux client Discord suffit, rien n'est envoyé à Discord ni à Gemini.
 *
 *   npm run test:dashboard
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const OWNER = '111111111111111111';
const ADMIN = '222222222222222222';
const STRANGER = '333333333333333333';
// Faux secrets, fabriqués ici pour qu'aucun n'apparaisse tel quel dans le code (ils ont
// juste la forme d'un vrai token et d'une vraie clé, pour tester qu'ils sont bien masqués).
process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY = `AIza${'X'.repeat(35)}`;
process.env.OWNER_ID = OWNER;
// Jamais les vraies données : pas de Supabase, et un dossier de stockage temporaire.
// (dotenv ne remplace pas une variable déjà définie, même vide.)
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'tableau-de-bord-'));
process.env.DASHBOARD_ADMINS = ADMIN;

const { Collection } = await import('discord.js');
const { config } = await import('../src/config.js');
const { createDashboard } = await import('../src/dashboard/index.js');
const { createLoginToken, loginLinkFor } = await import('../src/dashboard/auth.js');

let passed = 0;
const check = async (name, fn) => {
  await fn();
  passed += 1;
  console.log('✅', name);
};

// ---- faux client Discord
const dms = [];
const makeUser = (id, name) => ({ id, username: name, globalName: name, displayAvatarURL: () => null, send: async (payload) => { dms.push({ id, payload }); } });
const users = new Collection([[OWNER, makeUser(OWNER, 'Chef')], [ADMIN, makeUser(ADMIN, 'Admin')], [STRANGER, makeUser(STRANGER, 'Inconnu')]]);
const client = {
  isReady: () => true,
  once() {},
  user: { username: 'AI Vercel', displayAvatarURL: () => null, setPresence() {} },
  ws: { ping: 42 },
  guilds: { cache: new Collection() },
  users: { cache: users, fetch: async (id) => { if (!users.has(id)) throw new Error('inconnu'); return users.get(id); } },
};

const handler = createDashboard(client);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!(await handler(req, res, url))) { res.writeHead(404); res.end('hors tableau de bord'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

let cookie = '';
async function request(path, { method = 'GET', body, headers = {}, withCookie = true, raw = false } = {}) {
  const init = { method, headers: { ...headers } };
  if (withCookie && cookie) init.headers.cookie = cookie;
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['content-type'] ??= 'application/json';
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: raw ? null : (() => { try { return JSON.parse(text); } catch { return null; } })() };
}
const post = (path, body, extra = {}) => request(path, { ...extra, method: 'POST', body, headers: { 'x-dashboard': '1', ...(extra.headers ?? {}) } });

await check('la page est servie avec des en-têtes de sécurité stricts', async () => {
  const r = await request('/dashboard');
  assert.equal(r.status, 200);
  assert.match(r.text, /Tableau de bord/);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(r.text, /<script>(?!\s*<\/script>)[^<]/, 'aucun script en ligne dans la page');
  const js = await request('/dashboard/app.js', { raw: true });
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
});

await check('sans session, aucune donnée ne sort', async () => {
  for (const path of ['apercu', 'ia', 'conversations', 'jeux', 'musique', 'casino', 'journaux', 'securite']) {
    const r = await request(`/dashboard/api/${path}`, { withCookie: false });
    assert.equal(r.status, 401, `${path} doit demander une connexion`);
  }
  const moi = await request('/dashboard/api/moi', { withCookie: false });
  assert.equal(moi.json.connecte, false);
});

await check('une modification sans l’en-tête du tableau de bord, ou d’un autre site, est refusée', async () => {
  const token = createLoginToken(OWNER);
  const sansEntete = await request('/dashboard/api/login', { method: 'POST', body: { jeton: token } });
  assert.equal(sansEntete.status, 403);
  const autreSite = await post('/dashboard/api/login', { jeton: token }, { headers: { origin: 'https://site-pirate.example' } });
  assert.equal(autreSite.status, 403);
  const pasJson = await request('/dashboard/api/login', { method: 'POST', body: `jeton=${token}`, headers: { 'x-dashboard': '1', 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(pasJson.status, 403);
});

await check('seuls le chef et les admins désignés peuvent recevoir un lien', async () => {
  assert.throws(() => createLoginToken(STRANGER));
  assert.throws(() => createLoginToken('pas-un-id'));
  assert.ok(createLoginToken(ADMIN));
  assert.match(loginLinkFor(OWNER), /\/dashboard\/connexion#[A-Za-z0-9_-]{43}$/, 'le jeton est après le #, jamais envoyé au serveur dans l’adresse');
});

await check('demander un lien ne révèle pas qui a accès, et n’écrit qu’aux comptes autorisés', async () => {
  const pourInconnu = await post('/dashboard/api/lien', { discordId: STRANGER }, { withCookie: false, headers: { 'x-forwarded-for': '10.0.0.1' } });
  const pourChef = await post('/dashboard/api/lien', { discordId: OWNER }, { withCookie: false, headers: { 'x-forwarded-for': '10.0.0.2' } });
  assert.equal(pourInconnu.status, 200);
  assert.equal(pourInconnu.json.message, pourChef.json.message, 'même réponse dans les deux cas');
  assert.ok(!dms.some((d) => d.id === STRANGER), 'aucun MP à un compte non autorisé');
  const mp = dms.find((d) => d.id === OWNER);
  assert.ok(mp, 'le chef reçoit son lien en MP');
  const bouton = mp.payload.components[0].components[0].data;
  assert.equal(bouton.style, 5, 'le lien est dans un bouton (Discord n’en fait pas d’aperçu)');
  assert.match(bouton.url, /^http:\/\/localhost:\d+\/dashboard\/connexion#/, 'l’adresse vient de la config, jamais de l’en-tête Host');
});

await check('trop de demandes de lien depuis la même adresse : bloqué', async () => {
  let last;
  for (let i = 0; i < 5; i++) last = await post('/dashboard/api/lien', { discordId: STRANGER }, { withCookie: false, headers: { 'x-forwarded-for': '10.0.0.9' } });
  assert.equal(last.status, 429);
});

await check('un jeton faux ou déjà utilisé ne connecte pas', async () => {
  const faux = await post('/dashboard/api/login', { jeton: 'A'.repeat(43) }, { headers: { 'x-forwarded-for': '10.0.1.1' } });
  assert.equal(faux.status, 401);
  const token = createLoginToken(OWNER);
  const ok = await post('/dashboard/api/login', { jeton: token }, { headers: { 'x-forwarded-for': '10.0.1.1' } });
  assert.equal(ok.status, 200);
  const encore = await post('/dashboard/api/login', { jeton: token }, { headers: { 'x-forwarded-for': '10.0.1.1' } });
  assert.equal(encore.status, 401, 'un lien ne sert qu’une fois');
});

await check('tentatives de connexion en rafale : bloquées', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await post('/dashboard/api/login', { jeton: 'B'.repeat(43) }, { headers: { 'x-forwarded-for': '10.0.2.2' } });
  assert.equal(last.status, 429);
});

await check('la connexion pose un cookie HttpOnly et SameSite strict', async () => {
  const r = await post('/dashboard/api/login', { jeton: createLoginToken(OWNER) }, { headers: { 'x-forwarded-for': '10.0.3.3' } });
  assert.equal(r.status, 200);
  const setCookie = r.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Path=\//);
  cookie = setCookie.split(';')[0];
  const moi = await request('/dashboard/api/moi');
  assert.equal(moi.json.connecte, true);
  assert.equal(moi.json.user.id, OWNER);
});

await check('la vue d’ensemble ne contient aucun secret', async () => {
  const r = await request('/dashboard/api/apercu');
  assert.equal(r.status, 200);
  assert.equal(r.json.bot.name, 'AI Vercel');
  assert.ok(!r.text.includes(config.geminiKey), 'la clé Gemini ne sort jamais');
  assert.ok(!r.text.includes(config.discordToken), 'le token Discord ne sort jamais');
  assert.equal(r.json.services.gemini, true, 'on dit seulement qu’elle est configurée');
});

await check('les réglages invalides sont refusés, les bons appliqués et notés au journal', async () => {
  const mauvais = await post('/dashboard/api/ia/reglages', { changes: { thinkingLevel: 'max', chatModel: 'rm -rf /', inconnu: 1 } });
  assert.equal(mauvais.status, 400);
  assert.ok(mauvais.json.errors.thinkingLevel && mauvais.json.errors.chatModel && mauvais.json.errors.inconnu);
  assert.equal(config.models.thinkingLevel !== 'max', true, 'rien n’a changé');
  const bon = await post('/dashboard/api/ia/reglages', { changes: { thinkingLevel: 'low', chatCooldownSeconds: 5, extraInstructions: 'Tournoi samedi à 20 h.' } });
  assert.equal(bon.status, 200);
  assert.equal(config.models.thinkingLevel, 'low');
  assert.equal(config.limits.chatCooldownMs, 5000);
  assert.equal(config.ai.extraInstructions, 'Tournoi samedi à 20 h.');
  const secu = await request('/dashboard/api/securite');
  assert.ok(secu.json.journal.some((e) => /thinkingLevel/.test(e.action)), 'le changement est au journal');
});

await check('mettre l’IA en pause', async () => {
  const r = await post('/dashboard/api/ia/reglages', { changes: { paused: true, pauseMessage: 'Maintenance, retour à 18 h.' } });
  assert.equal(r.status, 200);
  const { pausedAnswer } = await import('../src/features/chat.js');
  assert.match(JSON.stringify(pausedAnswer(STRANGER)), /Maintenance, retour à 18 h/);
  assert.equal(pausedAnswer(OWNER), null, 'le chef peut toujours tester');
  await post('/dashboard/api/ia/reglages', { changes: { paused: false } });
  assert.equal(pausedAnswer(STRANGER), null);
});

await check('les journaux masquent les clés et les tokens', async () => {
  console.log(`[essai] clé ${config.geminiKey} et token ${config.discordToken}`);
  const r = await request('/dashboard/api/journaux?filtre=essai');
  assert.equal(r.status, 200);
  assert.ok(r.json.lines.length, 'la ligne de test est trouvée');
  assert.ok(!r.text.includes(config.geminiKey));
  assert.ok(!r.text.includes(config.discordToken));
  assert.match(r.text, /masqué/);
});

await check('les conversations montrent qui et quand, jamais le contenu', async () => {
  const { remember } = await import('../src/features/memory.js');
  remember(`u:${STRANGER}`, 'mon secret : 1234', 'ok');
  const r = await request('/dashboard/api/conversations');
  assert.equal(r.json.conversations.length, 1);
  assert.ok(!r.text.includes('1234'), 'le contenu ne sort pas');
  const effacer = await post('/dashboard/api/conversations/effacer', { key: `u:${STRANGER}` });
  assert.equal(effacer.json.ok, true);
  const invalide = await post('/dashboard/api/conversations/effacer', { key: '../../etc' });
  assert.equal(invalide.status, 400);
});

await check('une demande trop grosse ou illisible est refusée proprement', async () => {
  const gros = await post('/dashboard/api/ia/reglages', { changes: { extraInstructions: 'x'.repeat(40_000) } });
  assert.equal(gros.status, 413);
  const illisible = await request('/dashboard/api/ia/reglages', { method: 'POST', body: '{pas du json', headers: { 'x-dashboard': '1' } });
  assert.equal(illisible.status, 400);
});

await check('fermer les autres sessions, puis se déconnecter', async () => {
  const autre = await post('/dashboard/api/login', { jeton: createLoginToken(ADMIN) }, { withCookie: false, headers: { 'x-forwarded-for': '10.0.4.4' } });
  const autreCookie = autre.headers.get('set-cookie').split(';')[0];
  const fermer = await post('/dashboard/api/securite/deconnecter', { toutes: true });
  assert.ok(fermer.json.count >= 1);
  const autreApres = await request('/dashboard/api/apercu', { withCookie: false, headers: { cookie: autreCookie } });
  assert.equal(autreApres.status, 401, 'l’autre appareil est déconnecté');
  const sortie = await post('/dashboard/api/logout', {});
  assert.match(sortie.headers.get('set-cookie'), /Max-Age=0/);
  const apres = await request('/dashboard/api/apercu');
  assert.equal(apres.status, 401);
});

server.close();
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
