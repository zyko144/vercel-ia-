/**
 * Banc d'essai de la surveillance vocale (src/features/voiceGuard.js).
 * Gemini est simulé (aucune demande ne sort), le serveur et le membre aussi.
 *
 *   npm run test:voiceguard
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OWNER = '111111111111111111';
const BAD = '333333333333333333';
const BOT = '999999999999999999';
process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY = 'essai';
process.env.OWNER_ID = OWNER;
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'voiceguard-'));

// ---- Faux Gemini : on répond ce que le test a prévu, et on garde la demande pour la vérifier
let verdict = null;
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = typeof url === 'string' ? url : url?.url ?? String(url);
  if (!href.includes('googleapis')) return realFetch(url, init);
  asked.push(JSON.parse(init?.body ?? await url.text()));
  const body = JSON.stringify({ id: 'x', status: 'completed', outputs: [{ type: 'text', text: JSON.stringify(verdict) }], steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(verdict) }] }], output_text: JSON.stringify(verdict) });
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
};

const { Collection } = await import('discord.js');
const { _test, voiceGuardStats } = await import('../src/features/voiceGuard.js');
const { config } = await import('../src/config.js');
config.voiceGuard.maxPerHour = 100;

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

// ---- Faux serveur : un salon vocal avec le chef et un membre
const sent = [];
const dms = [];
const sanctions = [];
const mkMember = (id, name) => ({
  id, displayName: name, user: { id, username: name.toLowerCase(), globalName: name, bot: false }, moderatable: true,
  voice: { channelId: 'v', disconnect: async () => { sanctions.push({ id, what: 'vocal' }); } },
  timeout: async (ms) => { sanctions.push({ id, what: 'exclu', ms }); },
  send: async (p) => { dms.push(p); }, displayAvatarURL: () => null, toString: () => `<@${id}>`,
});
const members = new Collection([[OWNER, mkMember(OWNER, 'Noam')], [BAD, mkMember(BAD, 'Relou')]]);
const voice = { id: 'v', name: 'Dictature', members, isTextBased: () => true, send: async (p) => { sent.push(p); } };
const guild = { id: 'g', name: 'Serveur', channels: { cache: new Collection([['v', voice]]) }, members: { cache: members, fetch: async (id) => members.get(id) } };
const client = {
  user: { id: BOT, username: 'AI Vercel', toString: () => `<@${BOT}>` },
  users: { fetch: async () => ({ send: async () => {} }), cache: new Collection() },
  isReady: () => true,
};

// 2 s de « voix » : un son assez fort pour passer le filtre de silence
const speech = Buffer.alloc(16_000 * 2 * 2);
for (let i = 0; i < speech.length / 2; i++) speech.writeInt16LE(Math.round(Math.sin(i / 8) * 6000), i * 2);
const wait = () => new Promise((r) => setTimeout(r, 20));

await check('le fichier audio envoyé est un vrai WAV 16 kHz mono', async () => {
  const w = _test.wav(speech);
  assert.equal(w.toString('ascii', 0, 4), 'RIFF');
  assert.equal(w.readUInt32LE(24), 16_000);
  assert.equal(w.readUInt16LE(22), 1);
  assert.ok(_test.level(speech) > 350);
  assert.ok(_test.level(Buffer.alloc(32_000)) < 1, 'le silence est reconnu');
});

await check('un juron sans cible ne donne rien', async () => {
  verdict = { transcription: 'putain j’ai encore perdu', insulte: false, cible: 'aucune', mot: '', raison: 'juron' };
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(asked.length, 1, 'une seule demande à Gemini');
  assert.equal(asked[0].input.at(-1).content.at(-1).type, 'audio');
  assert.equal(sent.length, 0);
});

await check('Gemini sans vrai mot d’insulte dans la transcription : ignoré', async () => {
  await wait();
  verdict = { transcription: 'Noam il est pas terrible à ce jeu', insulte: true, cible: 'chef', mot: 'pas terrible', raison: '?' };
  await new Promise((r) => setTimeout(r, 4100)); // écart minimal entre deux vérifications d'une personne
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 0);
});

await check('1re vraie insulte envers le chef : avertissement avec la carte animée', async () => {
  verdict = { transcription: 'ferme ta gueule Noam', insulte: true, cible: 'chef', mot: 'ferme ta gueule', raison: 'insulte le chef' };
  await new Promise((r) => setTimeout(r, 4100));
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 1);
  const embed = sent[0].embeds[0].toJSON();
  assert.match(embed.author.name, /AVERTISSEMENT/);
  assert.equal(embed.image.url, 'attachment://avertissement.gif');
  assert.equal(sent[0].files[0].name, 'avertissement.gif');
  assert.equal(sanctions.length, 0, 'pas encore d’exclusion');
  assert.equal(dms.length, 1, 'le membre est prévenu en MP');
});

await check('le chef est dans le vocal mais n’est pas visé nommément : rien', async () => {
  verdict = { transcription: 'ta gueule toi', insulte: true, cible: 'chef', mot: 'ta gueule', raison: 'le chef est là' };
  await new Promise((r) => setTimeout(r, 4100));
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 1, 'être présent ne suffit pas à être la cible');
});

await check('2e insulte, le chef n’est même pas dans le vocal : exclu 1 min, sorti du vocal, carte SANCTION', async () => {
  voice.members = new Collection([[BAD, members.get(BAD)]]);
  verdict = { transcription: 'Noam c’est un fdp', insulte: true, cible: 'chef', mot: 'fdp', raison: 'insulte le chef en son absence' };
  await new Promise((r) => setTimeout(r, 4100));
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 2);
  const embed = sent[1].embeds[0].toJSON();
  assert.match(embed.author.name, /SANCTION/);
  assert.equal(sent[1].files[0].name, 'sanction.gif');
  assert.deepEqual(sanctions.map((x) => x.what).sort(), ['exclu', 'vocal']);
  assert.equal(sanctions.find((x) => x.what === 'exclu').ms, 60_000);
  assert.equal(voiceGuardStats.insults, 2);
});

await check('une insulte envers le bot ne compte pas : seul le chef est protégé', async () => {
  verdict = { transcription: 'Vercel t’es un connard', insulte: true, cible: 'aucune', mot: 'connard', raison: 'vise le bot' };
  await new Promise((r) => setTimeout(r, 4100));
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 2);
});

globalThis.fetch = realFetch;
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
