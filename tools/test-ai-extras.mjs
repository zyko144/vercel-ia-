/**
 * Banc d'essai des fonctions IA : mémoire des membres, traduction auto, note de punchline, FAQ apprise.
 * Gemini est simulé (aucune demande ne sort).
 *
 *   npm run test:ai-extras
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY = 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'ia-'));

let answer = '';
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = typeof url === 'string' ? url : url?.url ?? String(url);
  if (!href.includes('googleapis')) return realFetch(url, init);
  asked.push(JSON.parse(init?.body ?? await url.text()));
  return new Response(JSON.stringify({ id: 'x', status: 'completed', output_text: answer, outputs: [{ type: 'text', text: answer }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { Collection, PermissionsBitField } = await import('discord.js');
const ai = await import('../src/features/aiExtras.js');
const { setGuildSettings } = await import('../src/features/guildConfig.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const G = '444444444444444444';
const user = { id: '222222222222222222', username: 'lina' };

await check('mémoire : un message personnel est retenu, un message banal ne coûte rien', async () => {
  const before = asked.length;
  await ai.learnFacts(G, user, 'tu peux m’expliquer les fractions ?');
  assert.equal(asked.length, before, 'pas de demande à Gemini');
  answer = JSON.stringify({ faits: ['Adore Jul', 'Joue à Valorant (pseudo LinaV)'] });
  await ai.learnFacts(G, user, 'moi j’adore Jul et je joue à Valo sous le pseudo LinaV');
  assert.deepEqual((await ai.factsOf(user.id)).map((x) => x.text), ['Adore Jul', 'Joue à Valorant (pseudo LinaV)']);
  assert.match(await ai.factsPrompt(G, user.id, 'Lina'), /Adore Jul/);
  setGuildSettings(G, { 'memory.enabled': false });
  assert.equal(await ai.factsPrompt(G, user.id, 'Lina'), '', 'coupé sur ce serveur');
  setGuildSettings(G, { 'memory.enabled': true });
  await ai.forgetFacts(user.id);
  assert.equal((await ai.factsOf(user.id)).length, 0);
});

await check('note de punchline : note globale, 4 critères, commentaire', async () => {
  answer = JSON.stringify({ note: 8.5, rimes: 9, jeu_de_mots: 8, originalite: 7, impact: 9, commentaire: 'Propre, ça claque.' });
  const embed = (await ai.ratePunchline('J’ai la dalle comme un bus sans chauffeur', 'Lina')).toJSON();
  assert.match(embed.title, /8,5 \/ 10/);
  assert.equal(embed.fields.filter((x) => x.name !== '​').length, 4);
  assert.match(embed.description, /Propre/);
});

const replies = [];
const makeMessage = (content, extra = {}) => ({
  content, guildId: G, channelId: 'aide', inGuild: () => true, author: { id: '3', bot: false },
  member: { permissions: new PermissionsBitField(0n) }, react: async () => {},
  reply: async (p) => { replies.push(p); }, channel: { messages: { fetch: async () => null } }, ...extra,
});

await check('traduction : seulement dans les salons réglés, pas si c’est déjà la bonne langue', async () => {
  setGuildSettings(G, { 'translate.channels': ['aide = anglais'] });
  answer = 'Hello everyone, who wants to play?';
  assert.equal(await ai.autoTranslate(makeMessage('Salut tout le monde, qui veut jouer ?')), false, 'salon non réglé');
  setGuildSettings(G, { 'translate.channels': ['555555555555555555 = anglais'] });
  assert.equal(await ai.autoTranslate(makeMessage('Salut tout le monde, qui veut jouer ?', { channelId: '555555555555555555' })), true);
  assert.match(replies.at(-1).embeds[0].toJSON().description, /Hello/);
  answer = 'IDEM';
  assert.equal(await ai.autoTranslate(makeMessage('Already in English', { channelId: '555555555555555555' })), false);
});

await check('FAQ : le staff répond et c’est appris, puis l’IA répond toute seule', async () => {
  setGuildSettings(G, { 'faq.channelId': '666666666666666666' });
  const question = { content: 'Comment on a le rôle VIP ?', author: { bot: false } };
  const staffReply = makeMessage('Il faut être niveau 10 ou l’acheter dans la boutique.', {
    channelId: '666666666666666666', member: { permissions: new PermissionsBitField(PermissionsBitField.All) },
    reference: { messageId: 'q1' }, channel: { messages: { fetch: async () => question } },
  });
  await ai.faqMessage(staffReply);
  assert.equal((await ai.faqEntries(G)).length, 1);
  answer = JSON.stringify({ index: 0 });
  const handled = await ai.faqMessage(makeMessage('comment avoir le rôle vip ?', { channelId: '666666666666666666' }));
  assert.equal(handled, true);
  assert.match(replies.at(-1).embeds[0].toJSON().description, /niveau 10/);
  answer = JSON.stringify({ index: -1 });
  assert.equal(await ai.faqMessage(makeMessage('quelle heure est-il ?', { channelId: '666666666666666666' })), false);
});

globalThis.fetch = realFetch;
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
