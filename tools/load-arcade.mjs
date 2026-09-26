/**
 * Test de charge de l'arcade : N salles × M joueurs qui rafraîchissent (long polling) et jouent en même temps.
 * Mesure la mémoire, le processeur et le temps de réponse du serveur.
 *
 *   node tools/load-arcade.mjs [salles=40] [joueurs=8] [secondes=40]
 */
import { mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const [ROOMS = 40, PLAYERS = 8, SECONDS = 40] = process.argv.slice(2).map(Number);
process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'charge-'));
globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => 'non' });

const arcade = await import('../src/arcade/server.js');
const { Collection } = await import('discord.js');
const G = '444444444444444444';
arcade.setArcadeClient({ user: { id: '999999999999999999', username: 'History IA' }, guilds: { cache: new Collection([[G, { id: G, members: { fetch: async () => ({}) } }]]) }, users: { fetch: async () => null } });

const server = http.createServer(async (req, res) => { if (!(await arcade.handleArcadeWeb(req, res, new URL(req.url, 'http://x')))) { res.writeHead(404); res.end(); } });
server.maxConnections = 100_000;
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const agent = new http.Agent({ keepAlive: true, maxSockets: Infinity });
function call(token, room, route, body, query = '') {
  const start = performance.now();
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, agent, method: body ? 'POST' : 'GET', path: `/arcade/api/${route}?room=${room}&guild=${G}${query}`, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const buf = Buffer.concat(chunks); resolve({ status: res.statusCode, ms: performance.now() - start, bytes: buf.length, text: buf.toString() }); });
    });
    req.on('error', () => resolve({ status: 0, ms: performance.now() - start, bytes: 0 }));
    if (body) req.end(JSON.stringify(body)); else req.end();
  });
}

const stats = { act: [], poll: 0, errors: 0, bytes: 0, limited: 0 };
let running = true;
const rooms = Array.from({ length: ROOMS }, (_, i) => String(600000000000000000n + BigInt(i)));
const players = rooms.flatMap((room, r) => Array.from({ length: PLAYERS }, (_, p) => ({ room, id: String(700000000000000000n + BigInt(r * 100 + p)), host: p === 0 })));
for (const pl of players) pl.token = arcade.createSession({ id: pl.id, name: `J${pl.id.slice(-4)}` });

// Chaque joueur : une boucle de long polling, comme le navigateur
async function pollLoop(pl) {
  let since = 0;
  while (running) {
    const r = await call(pl.token, pl.room, 'poll', null, `&since=${since}&epoch=&ops=0`);
    stats.poll += 1;
    stats.bytes += r.bytes;
    if (r.status === 429) { stats.limited += 1; await new Promise((z) => setTimeout(z, 1000)); continue; }
    if (r.status !== 200) { stats.errors += 1; await new Promise((z) => setTimeout(z, 500)); continue; }
    since = JSON.parse(r.text).seq; // comme le navigateur : on attend la version suivante
  }
}
// Les joueurs jouent : un quiz par salle, chacun répond, discute, et l'hôte relance
async function playLoop(pl) {
  await new Promise((z) => setTimeout(z, 500 + Math.random() * 1500));
  if (pl.host) await call(pl.token, pl.room, 'act', { type: 'start', game: 'dessin' });
  while (running) {
    const body = pl.host && Math.random() < 0.7
      ? { type: 'stroke', id: Math.random().toString(36).slice(2, 8), pts: Array.from({ length: 12 }, () => [Math.random(), Math.random()]), c: '#2a1606', s: 8 }
      : Math.random() < 0.5 ? { type: 'chat', text: 'bateau ?' } : { type: 'choose', i: 0 };
    const r = await call(pl.token, pl.room, 'act', body);
    if (r.status === 429) stats.limited += 1; else if (r.status >= 400 && r.status !== 400) stats.errors += 1;
    stats.act.push(r.ms);
    await new Promise((z) => setTimeout(z, 300 + Math.random() * 700));
  }
}

const cpu0 = process.cpuUsage();
const t0 = Date.now();
let peakRss = 0;
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 500);
const loops = players.flatMap((pl) => [pollLoop(pl), playLoop(pl)]);
await new Promise((z) => setTimeout(z, SECONDS * 1000));
running = false;
clearInterval(sampler);
const elapsed = (Date.now() - t0) / 1000;
const cpu = process.cpuUsage(cpu0);
const sorted = stats.act.sort((a, b) => a - b);
const pct = (q) => sorted[Math.floor(sorted.length * q)]?.toFixed(1);
console.log(JSON.stringify({
  salles: ROOMS, joueurs: players.length, secondes: Math.round(elapsed),
  actionsParSeconde: Math.round(sorted.length / elapsed), rafraichissementsParSeconde: Math.round(stats.poll / elapsed),
  tempsReponseMs: { median: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
  processeurPourcent: Math.round(((cpu.user + cpu.system) / 1000 / (elapsed * 1000)) * 100),
  memoireMaxMo: Math.round(peakRss / 1048576), debitSortantKoParSeconde: Math.round(stats.bytes / 1024 / elapsed),
  erreurs: stats.errors, limitees: stats.limited,
}, null, 1));
process.exit(0);
