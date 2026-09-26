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
const agoraSent = [];
const agora = { id: 'a', name: '│・𝐚𝐠𝐨𝐫𝐚', type: 0, isTextBased: () => true, send: async (p) => { agoraSent.push(p); } };
const guild = { id: 'g', name: 'Serveur', channels: { cache: new Collection([['v', voice], ['a', agora]]) }, members: { cache: members, fetch: async (id) => members.get(id) } };
const client = {
  user: { id: BOT, username: 'History IA', toString: () => `<@${BOT}>` },
  users: { fetch: async () => ({ send: async () => {} }), cache: new Collection() },
  isReady: () => true,
};

// 2 s de « voix » : 100 paquets Opus de 20 ms, comme ceux que Discord envoie
const speech = Array.from({ length: 100 }, (_, i) => Buffer.alloc(60, i));
const { opusToOgg } = await import('../src/utils/ogg.js');
const wait = () => new Promise((r) => setTimeout(r, 20));

await check('la voix part en Ogg Opus, sans être décodée', async () => {
  const ogg = opusToOgg(speech);
  assert.equal(ogg.toString('ascii', 0, 4), 'OggS');
  assert.ok(ogg.includes(Buffer.from('OpusHead')));
  assert.ok(ogg.length > 100 * 60, 'tous les paquets sont dedans');
});

await check('un juron sans cible ne donne rien', async () => {
  verdict = { transcription: 'putain j’ai encore perdu', insulte: false, cible: 'aucune', mot: '', raison: 'juron' };
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(asked.length, 1, 'une seule demande à Gemini');
  assert.equal(asked[0].input.at(-1).content.at(-1).type, 'audio');
  assert.equal(asked[0].input.at(-1).content.at(-1).mime_type, 'audio/ogg');
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
  assert.match(sent[0].content, new RegExp(`<@${BAD}>`), 'le membre est pingé');
  assert.deepEqual(sent[0].allowedMentions, { users: [BAD] }, 'il reçoit la notif');
  assert.equal(agoraSent.length, 1, 'la carte part aussi dans #agora');
  assert.equal(agoraSent[0].files[0].name, 'avertissement.gif');
  assert.equal(sanctions.length, 0, 'pas encore d’exclusion');
  assert.equal(dms.length, 1, 'le membre est prévenu en MP');
});

const next = () => new Promise((r) => setTimeout(r, 4100)); // écart minimal entre deux vérifications d'une personne

await check('le chef est dans le vocal mais n’est pas nommé : rien', async () => {
  verdict = { transcription: 't’es qu’un connard toi', insulte: true, cible: 'chef', mot: 'connard', raison: '?' };
  await next();
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 1);
});

await check('« Vercel ferme ta gueule » : ne compte pas, seul Noam est protégé', async () => {
  verdict = { transcription: 'Vercel ferme ta gueule', insulte: true, cible: 'aucune', mot: 'ferme ta gueule', raison: 'vise le bot' };
  await next();
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 1);
});

await check('Noam insulté mais PAS dans le vocal : rien, et rien n’est envoyé à Gemini', async () => {
  voice.members = new Collection([[BAD, members.get(BAD)]]);
  const before = asked.length;
  verdict = { transcription: 'Noam c’est un fdp', insulte: true, cible: 'chef', mot: 'fdp', raison: '?' };
  await next();
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 1);
  assert.equal(asked.length, before, 'pas de demande à Gemini');
  voice.members = new Collection([[OWNER, members.get(OWNER)], [BAD, members.get(BAD)]]);
});

await check('2e insulte : encore un avertissement (pas d’exclusion)', async () => {
  verdict = { transcription: 'Noham t’es un fdp', insulte: true, cible: 'chef', mot: 'fdp', raison: 'insulte le chef' };
  await next();
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 2);
  assert.match(sent[1].embeds[0].toJSON().author.name, /AVERTISSEMENT/);
  assert.equal(sanctions.length, 0);
});

await check('3e insulte : exclu 1 min, sorti du vocal, carte SANCTION partout', async () => {
  verdict = { transcription: 'ferme ta gueule Noam', insulte: true, cible: 'chef', mot: 'ferme ta gueule', raison: 'insulte le chef' };
  await next();
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 3);
  assert.match(sent[2].embeds[0].toJSON().author.name, /SANCTION/);
  assert.equal(sent[2].files[0].name, 'sanction.gif');
  assert.match(sent[2].content, /sanctionné/);
  assert.equal(agoraSent.at(-1).files[0].name, 'sanction.gif');
  assert.deepEqual(sanctions.map((x) => x.what).sort(), ['exclu', 'vocal']);
  assert.equal(sanctions.find((x) => x.what === 'exclu').ms, 60_000);
  assert.ok(voiceGuardStats.recent.length >= 5, 'les dernières écoutes sont gardées pour le tableau de bord');
});

await check('Gardien : un mot interdit compte même sans le chef (offre premium seulement)', async () => {
  const premium = await import('../src/features/premium.js');
  voice.members = new Collection([[BAD, members.get(BAD)]]);
  verdict = { transcription: 'franchement c’est du caca boudin', insulte: false, cible: 'aucune', mot: '', raison: '-' };
  premium.setGuardOptions('g', { protectedIds: [], words: ['caca boudin'] });
  await next();
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 3, 'offre gratuite : les options Gardien ne comptent pas');
  premium.startTrial('g', OWNER);
  await next();
  await _test.check(client, guild, BAD, 'v', speech);
  assert.equal(sent.length, 4);
  assert.match(sent[3].content, /mot interdit/);
});

globalThis.fetch = realFetch;
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
