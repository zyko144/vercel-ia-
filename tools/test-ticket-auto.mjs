/**
 * Banc d'essai des automatisations de tickets : ouverture, mot-clé, staff qui ne répond pas, ticket inactif fermé.
 *
 *   node tools/test-ticket-auto.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'ticket-auto-'));
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o) => (String(url).includes('generativelanguage') ? { ok: false, status: 500, json: async () => ({}), text: async () => 'non' } : realFetch(url, o));

const { Collection } = await import('discord.js');
const auto = await import('../src/features/ticketAutomations.js');
const { ticketData } = await import('../src/features/tickets.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const G = '444444444444444444';
const CH = '555555555555555555';
const MEMBER = '222222222222222222';
const STAFF = '333333333333333333';

const sent = [];
let deleted = false;
const channel = {
  id: CH, guildId: G, name: 'ticket-0001',
  send: async (p) => { sent.push(p); return { id: String(sent.length) }; },
  messages: { fetch: async () => new Collection() },
  delete: async () => { deleted = true; },
};
const guild = { id: G, name: 'Le Navire', channels: { cache: new Collection([[CH, channel]]) } };
channel.guild = guild;
const client = { user: { id: '999', username: 'bot', toString: () => '@bot' }, guilds: { cache: new Collection([[G, guild]]) }, channels: { cache: new Collection() }, users: { fetch: async () => null } };
const msg = (authorId, content) => ({ inGuild: () => true, guildId: G, channelId: CH, channel, client, content, author: { id: authorId, bot: false } });
const text = (p) => p.content ?? p.embeds?.[0]?.data?.description ?? '';

const g = await ticketData(G);
g.panels.p1 = { id: 'p1', title: 'Support', staffRoleId: '777777777777777777' };
g.open[CH] = { userId: MEMBER, number: '0001', panelId: 'p1', openedAt: Date.now(), claimedBy: null, topic: 'Paiement' };

await check('règles nettoyées : déclencheur inconnu, mots vides, délais bornés', async () => {
  const rules = auto.cleanRules([
    { trigger: 'keyword', words: '', action: 'reply', text: 'x' },
    { trigger: 'no_staff', minutes: 999999, action: 'ping' },
    { trigger: 'bidon', words: 'a', action: 'bidon', text: 'y' },
  ]);
  assert.equal(rules.length, 2, 'la règle mot-clé sans mot est retirée');
  assert.equal(rules[0].minutes, 10080);
  assert.equal(rules[1].trigger, 'keyword');
  assert.equal(rules[1].action, 'reply');
});

await auto.saveRules(G, [
  { id: 'accueil', name: 'Accueil', trigger: 'open', action: 'reply', text: 'Bienvenue {membre}, ticket {ticket} ({motif}) sur {serveur}' },
  { id: 'rembourse', name: 'Remboursement', trigger: 'keyword', words: 'rembourse, paiement', action: 'reply', text: 'Donne ton numéro de commande. {staff} arrive.' },
  { id: 'relance', name: 'Relance', trigger: 'no_staff', minutes: 30, action: 'ping', text: 'Le ticket {ticket} attend.' },
  { id: 'ferme', name: 'Fermeture', trigger: 'inactive', minutes: 1440, action: 'close', text: 'Je ferme, 24 h sans nouvelles.' },
]);

await check('ticket ouvert : message d’accueil avec les variables remplacées', async () => {
  await auto.onTicketOpened(client, channel);
  assert.equal(text(sent.at(-1)), `Bienvenue <@${MEMBER}>, ticket n°0001 (Paiement) sur Le Navire`);
});

await check('mot-clé du membre (accents et majuscules ignorés) : réponse, une seule fois', async () => {
  const before = sent.length;
  await auto.onTicketMessage(msg(MEMBER, 'Je veux être REMBOURSÉ svp'));
  assert.equal(sent.length, before + 1);
  assert.match(text(sent.at(-1)), /<@&777777777777777777> arrive/);
  await auto.onTicketMessage(msg(MEMBER, 'rembourse moi'));
  assert.equal(sent.length, before + 1, 'une seule fois par ticket');
  await auto.onTicketMessage(msg(STAFF, 'paiement reçu ?'));
  assert.equal(sent.length, before + 1, 'le staff ne déclenche pas les mots-clés');
});

await check('staff silencieux 30 min : le staff est pingé ; après sa réponse, la relance peut repartir', async () => {
  const t = g.open[CH];
  t.lastUserAt = Date.now() - 31 * 60_000;
  t.lastStaffAt = Date.now() - 60 * 60_000;
  t.lastAt = Date.now() - 31 * 60_000;
  const before = sent.length;
  await auto.ticketTimers(client);
  assert.equal(sent.length, before + 1);
  assert.match(sent.at(-1).content, /^<@&777777777777777777> Le ticket n°0001 attend\./);
  await auto.ticketTimers(client);
  assert.equal(sent.length, before + 1, 'pas de double relance');
  await auto.onTicketMessage(msg(STAFF, 'je regarde'));
  assert.ok(!g.open[CH].fired.relance, 'relance réarmée après la réponse du staff');
});

await check('inactif 24 h : dernier message puis fermeture du ticket', async () => {
  g.open[CH].lastAt = Date.now() - 25 * 3_600_000;
  g.open[CH].lastStaffAt = Date.now() - 25 * 3_600_000;
  await auto.ticketTimers(client);
  assert.ok(sent.some((p) => p.content === 'Je ferme, 24 h sans nouvelles.'));
  assert.equal(g.open[CH], undefined, 'ticket retiré des ouverts');
  await new Promise((r) => setTimeout(r, 5200));
  assert.ok(deleted, 'salon supprimé');
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
