/**
 * Banc d'essai du côté social des comptes History Launcher : amis par code, présence, soirées jeu.
 *
 *   node tools/test-launcher-social.mjs
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
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'social-'));

const { startHttpServer } = await import('../src/server.js');
let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const server = startHttpServer(() => ({ discord: 'ready' }));
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${process.env.PORT}/api/compte`;
const call = (p, token, body) => fetch(`${base}/${p}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const signup = async (pseudo, n) => (await call('inscription', null, { pseudo, email: `${pseudo.toLowerCase()}@exemple.fr`, motDePasse: `Jeu-${pseudo}-${n}x` })).token;

const noam = await signup('Noam', 1);
const max = await signup('Max', 2);
const zoe = await signup('Zoe', 3);

await check('sans session : refusé', async () => {
  assert.equal((await call('amis', null)).status, 401);
});

let maxCode;
await check('code ami, demande, acceptation : amis des deux côtés', async () => {
  maxCode = (await call('amis', max)).code;
  assert.match(maxCode, /^Max#[0-9A-F]{6}$/);
  assert.equal((await call('amis/ajouter', noam, { code: 'Personne#000000' })).status, 404);
  assert.equal((await call('amis/ajouter', max, { code: maxCode })).status, 400, 'pas soi-même');
  assert.equal((await call('amis/ajouter', noam, { code: maxCode.toLowerCase() })).envoye, true);
  const inbox = await call('amis', max);
  assert.equal(inbox.demandes[0].pseudo, 'Noam');
  await call('amis/accepter', max, { id: inbox.demandes[0].id });
  assert.deepEqual((await call('amis', noam)).amis.map((a) => a.pseudo), ['Max']);
  assert.deepEqual((await call('amis', max)).amis.map((a) => a.pseudo), ['Noam']);
});

await check('présence : jeu en cours et minutes de la semaine visibles par les amis seulement', async () => {
  await call('presence', max, { playing: 'Rocket League', week: 540, top: 'Rocket League' });
  const f = (await call('amis', noam)).amis[0];
  assert.equal(f.online, true);
  assert.equal(f.playing, 'Rocket League');
  assert.equal(f.week, 540);
  assert.equal((await call('amis', zoe)).amis.length, 0, 'Zoé n’est l’amie de personne : elle ne voit rien');
  await call('presence', max, { week: 1e9 });
  assert.equal((await call('amis', noam)).amis[0].week, 10_080, 'plafonné à une semaine');
});

let evId;
await check('soirée jeu : seulement des amis invités, réponse, annulation par l’organisateur', async () => {
  const zoeId = (await call('amis', zoe)).code;
  assert.equal((await call('soirees', noam, { jeu: 'Rocket League', at: Date.now() + 3_600_000, invites: [zoeId] })).status, 400, 'Zoé n’est pas une amie');
  const maxId = (await call('amis', noam)).amis[0].id;
  const r = await call('soirees', noam, { jeu: 'Rocket League', at: Date.now() + 3_600_000, invites: [maxId] });
  assert.equal(r.status, 201);
  evId = r.soirees[0].id;
  const invit = (await call('soirees', max)).soirees[0];
  assert.equal(invit.organisateur, 'Noam');
  assert.equal(invit.ma, null);
  await call('soirees/repondre', max, { id: evId, reponse: 'oui' });
  assert.equal((await call('soirees', noam)).soirees[0].invites[0].reponse, 'oui');
  assert.equal((await call('soirees', zoe)).soirees.length, 0);
  assert.equal((await call('soirees/annuler', max, { id: evId })).status, 404, 'seul l’organisateur annule');
  await call('soirees/annuler', noam, { id: evId });
  assert.equal((await call('soirees', max)).soirees.length, 0);
});

await check('messages, « on joue ? », invitation et réponse avec de quoi rejoindre', async () => {
  const maxId = (await call('amis', noam)).amis[0].id;
  const noamId = (await call('amis', max)).amis[0].id;
  const zoeId = (await call('boite', zoe)).code;
  assert.equal((await call('messages', noam, { to: zoeId, text: 'salut' })).status, 404, 'pas amis');
  assert.equal((await call('messages', noam, { to: maxId, text: '   ' })).status, 400);
  const t0 = Date.now() - 1;
  assert.equal((await call('messages', noam, { to: maxId, text: 'On lance une partie ?' })).fil.length, 1);
  const box = await call(`boite?apres=${t0}`, max);
  assert.equal(box.items[0].type, 'msg');
  assert.equal(box.items[0].pseudo, 'Noam');
  assert.equal(box.items[0].text, 'On lance une partie ?');
  assert.equal((await call(`messages?avec=${noamId}`, max)).fil[0].text, 'On lance une partie ?');
  // Max joue sur un serveur FiveM : Noam voit de quoi rejoindre, demande à jouer, Max accepte
  await call('presence', max, { playing: 'FiveM', join: { fivem: 'abc123' }, week: 10 });
  const f = (await call('amis', noam)).amis[0];
  assert.deepEqual(f.join, { fivem: 'abc123' });
  assert.ok(f.since > 0);
  await call('presence', max, { playing: 'FiveM', join: { fivem: '<script>' }, week: 10 });
  assert.equal((await call('amis', noam)).amis[0].join, null, 'lien invalide ignoré');
  await call('presence', max, { playing: 'FiveM', join: { fivem: 'abc123' }, week: 10 });
  assert.equal((await call('inviter', noam, { to: maxId, type: 'ask' })).ok, true);
  assert.equal((await call('inviter', noam, { to: maxId, type: 'ask' })).status, 429, 'pas de spam');
  const ask = (await call('boite', max)).items.find((x) => x.type === 'ask');
  assert.equal(ask.game, 'FiveM');
  await call('inviter/repondre', max, { id: ask.id, oui: true });
  const reply = (await call('boite', noam)).items.find((x) => x.type === 'reply');
  assert.equal(reply.oui, true);
  assert.deepEqual(reply.join, { fivem: 'abc123' });
  // Invitation de Noam (Steam) → Max accepte et reçoit le lien
  await call('inviter', noam, { to: maxId, type: 'invite', game: 'Rocket League', join: { steam: '252950' } });
  const inv = (await call('boite', max)).items.find((x) => x.type === 'invite');
  assert.deepEqual((await call('inviter/repondre', max, { id: inv.id, oui: true })).join, { steam: '252950' });
});

await check('sauvegarde en ligne : par compte, retrouvée, taille plafonnée', async () => {
  assert.equal((await call('sauvegarde', null)).status, 401);
  assert.equal((await call('sauvegarde', noam)).data, null);
  const r = await call('sauvegarde', noam, { pc: 'PC-Noam', data: { collections: { c1: { name: 'Potes', items: [] } }, time: { 'steam:1': 120 } } });
  assert.equal(r.ok, true);
  const back = await call('sauvegarde', noam);
  assert.equal(back.data.collections.c1.name, 'Potes');
  assert.equal(back.pc, 'PC-Noam');
  assert.equal((await call('sauvegarde', max)).data, null, 'chacun sa sauvegarde');
  assert.equal((await call('sauvegarde', noam, { data: 'pas un objet' })).status, 400);
  assert.equal((await call('sauvegarde', noam, { data: { gros: 'x'.repeat(1_600_000) } })).status, 413);
});

await check('appel vocal : sonnerie, réponse, signaux dans les deux sens, fin', async () => {
  const maxId = (await call('amis', noam)).amis[0].id;
  await call('presence', max, { week: 1 });
  const c = await call('appel', noam, { to: maxId });
  assert.equal(c.state, 'ringing');
  assert.equal((await call('appel', noam, { to: maxId })).status, 409, 'déjà en appel');
  const inbox = (await call('boite', max)).items.find((x) => x.type === 'call');
  assert.equal(inbox.callId, c.id);
  assert.equal((await call('appel/repondre', noam, { call: c.id, oui: true })).status, 409, 'seul l’appelé répond');
  assert.equal((await call('appel/repondre', max, { call: c.id, oui: true })).state, 'live');
  await call('appel/signal', noam, { call: c.id, data: { sdp: 'offre' } });
  await call('appel/signal', max, { call: c.id, data: { sdp: 'réponse' } });
  const forMax = await call(`appel/signal?call=${c.id}&apres=-1`, max);
  assert.deepEqual(forMax.signals.map((s) => s.data.sdp), ['offre']);
  const forNoam = await call(`appel/signal?call=${c.id}&apres=-1`, noam);
  assert.deepEqual(forNoam.signals.map((s) => s.data.sdp), ['réponse']);
  assert.equal((await call(`appel/signal?call=${c.id}&apres=0`, max)).signals.length, 0, 'déjà lus');
  assert.equal((await call(`appel/signal?call=${c.id}`, zoe)).status, 404, 'personne d’autre ne voit l’appel');
  assert.equal((await call('appel/fin', max, { call: c.id })).state, 'ended');
});

await check('statut, ne pas déranger, benchmark visible des amis et classement mondial', async () => {
  await call('presence', max, { status: 'Soirée RP <b>', dnd: true, bench: 1420, week: 5 });
  const f = (await call('amis', noam)).amis[0];
  assert.equal(f.status, 'Soirée RP b', 'texte nettoyé');
  assert.equal(f.dnd, true);
  assert.equal(f.bench, 1420);
  assert.equal((await call('benchmark', noam, { scores: { total: 'x' } })).status, 400);
  await call('benchmark', noam, { v: 2, scores: { total: 1200, gpu: 1300 }, raw: { gpu: { geometry: 310 } }, cpu: 'Ryzen 5', gpu: 'RTX 3060' });
  await call('benchmark', max, { v: 2, scores: { total: 1500 } });
  await call('benchmark', noam, { v: 2, scores: { total: 900 } });
  await call('benchmark', noam, { scores: { total: 5000 } }); // ancienne version : pas dans le classement v2
  const r = await call('benchmark/classement', noam);
  assert.deepEqual(r.top.map((x) => x.total), [1500, 1200], 'meilleur score gardé');
  assert.equal(r.rang, 2);
  assert.equal(r.top[0].ami, true);
  assert.equal(r.top[1].moi, true);
  assert.equal(r.top[1].raw, undefined, 'mesures brutes gardées côté serveur');
});

await check('retirer un ami : des deux côtés', async () => {
  const maxId = (await call('amis', noam)).amis[0].id;
  await call('amis/retirer', noam, { id: maxId });
  assert.equal((await call('amis', max)).amis.length, 0);
});

await check('boîte en attente longue : message et appel reçus tout de suite, rien de perdu', async () => {
  // (redevenir amis après le test précédent)
  await call('amis/ajouter', noam, { code: (await call('amis', max)).code });
  await call('amis/accepter', max, { id: (await call('amis', max)).demandes[0].id });
  const maxId = (await call('amis', noam)).amis[0].id;
  const start = (await call('boite', max)).now;
  // Rien de nouveau : la requête attend (au moins ~1 s ici) puis répond vide
  let t = Date.now();
  const empty = await call(`boite?apres=${start}&attente=1`, max);
  assert.equal(empty.items.length, 0);
  assert.ok(Date.now() - t >= 900, 'a bien attendu');
  // Un message arrive pendant l'attente : réponse immédiate (bien avant les 20 s)
  t = Date.now();
  const waiting = call(`boite?apres=${empty.now}&attente=20`, max);
  await new Promise((r) => setTimeout(r, 300));
  await call('messages', noam, { to: maxId, text: 'Tu es là ?' });
  const got = await waiting;
  assert.ok(Date.now() - t < 3000, `réveil immédiat (${Date.now() - t} ms)`);
  assert.equal(got.items.at(-1).text, 'Tu es là ?');
  assert.equal(got.now, got.items.at(-1).at, 'curseur = dernier élément reçu');
  // Deux éléments dans la même milliseconde : tous les deux arrivent
  await call('messages', noam, { to: maxId, text: 'un' });
  await call('messages', noam, { to: maxId, text: 'deux' });
  const both = await call(`boite?apres=${got.now}`, max);
  assert.deepEqual(both.items.map((x) => x.text), ['un', 'deux']);
  // Appel : l'appelé le reçoit sans attendre
  await call('presence', max, { week: 1 });
  const waitCall = call(`boite?apres=${both.now}&attente=20`, max);
  await new Promise((r) => setTimeout(r, 200));
  t = Date.now();
  const c = await call('appel', noam, { to: maxId });
  const ring = await waitCall;
  assert.ok(Date.now() - t < 3000);
  assert.equal(ring.items.find((x) => x.type === 'call').callId, c.id);
  await call('appel/fin', noam, { call: c.id });
});

server.close();
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
