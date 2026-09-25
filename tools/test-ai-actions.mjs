/**
 * Banc d'essai : l'IA lance les actions des panneaux (bouton « Lancer »). Gemini est simulé.
 *
 *   npm run test:ai-actions
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY = 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'aia-'));

let answer = '';
let lastSystem = '';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const href = typeof url === 'string' ? url : url?.url ?? String(url);
  if (!href.includes('googleapis')) return realFetch(url, init);
  lastSystem += init?.body ?? await url.text();
  return new Response(JSON.stringify({ id: 'x', status: 'completed', output_text: answer, outputs: [{ type: 'text', text: answer }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { Collection, PermissionsBitField } = await import('discord.js');
const aia = await import('../src/features/aiActions.js');
const { askAI } = await import('../src/features/chat.js');
const { PANELS, findAction } = await import('../src/panels/index.js').then(async () => import('../src/panels/catalog.js'));

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

const karim = { id: '333333333333333333', displayName: 'Karim', user: { id: '333333333333333333', username: 'karim_du_93', globalName: 'Karim' } };
const members = new Collection([[karim.id, karim]]);
const guild = {
  id: '444444444444444444', name: 'Les Veilleurs',
  members: { cache: members, fetch: async (q) => (typeof q === 'string' ? members.get(q) ?? null : members) },
  channels: { cache: new Collection([['555555555555555555', { id: '555555555555555555', name: 'général' }]]) },
  roles: { cache: new Collection() },
};

await check('catalogue : jeux, musique, sanctions ; rien de réservé au chef', async () => {
  const refs = aia.aiCatalog().map((a) => a.ref);
  for (const r of ['jeux.arcade', 'sanction.mute', 'sanction.warn', 'musique.play']) assert.ok(refs.includes(r), r);
  const ownerOnly = Object.entries(PANELS).flatMap(([k, p]) => p.groups.flatMap((g) => g.actions.filter((a) => a.owner).map((a) => `${k}.${a.id}`)));
  for (const r of ownerOnly) assert.ok(!refs.includes(r), `${r} ne doit pas être proposé`);
  assert.match(aia.actionsPrompt(), /\[\[ACTION/);
});

await check('la ligne d’action est lue puis enlevée ; une action inconnue est ignorée', async () => {
  const r = aia.extractAction('C’est parti 🕵️\n[[ACTION jeux.arcade {}]]');
  assert.equal(r.text, 'C’est parti 🕵️');
  assert.equal(r.action.id, 'arcade');
  const m = aia.extractAction('Ok [[ACTION sanction.mute {"membre": "Karim", "duree": "10m"}]]');
  assert.deepEqual(m.action.values, { membre: 'Karim', duree: '10m' });
  const bad = aia.extractAction('Hop [[ACTION jeux.inventé {}]]');
  assert.equal(bad.action, null);
  assert.equal(bad.text, 'Hop');
});

await check('valeurs : membre par pseudo, choix par libellé, nombre dans les limites', async () => {
  const fields = findAction('sanction', 'clear').fields;
  const v = await aia.resolveValues(fields, { nombre: '20', membre: '@karim' }, guild);
  assert.equal(v.nombre, 20);
  assert.equal(v.membre.member, karim);
  const tooMany = await aia.resolveValues(fields, { nombre: 500 }, guild);
  assert.equal(tooMany.nombre, undefined);
  const ban = await aia.resolveValues(findAction('sanction', 'ban').fields, { membre: 'karim_du_93', messages: 'Dernières 24 h' }, guild);
  assert.equal(ban.messages, '86400');
});

const client = { user: { id: '1', username: 'AI Vercel' } };
const user = { id: '222222222222222222', username: 'lina' };

await check('l’IA répond et ajoute le bouton « Lancer »', async () => {
  answer = 'Allez, à l’arcade 🕹️\n[[ACTION jeux.arcade {}]]';
  const payload = await askAI({ client, user, member: null, guild, channel: null, link: '', prompt: 'lance un jeu', actions: true, web: false });
  assert.match(lastSystem, /jeux\.arcade/, 'la liste est dans le prompt');
  assert.doesNotMatch(payload.embeds[0].toJSON().description, /\[\[ACTION/);
  const button = payload.components.at(-1).toJSON().components[0];
  assert.match(button.custom_id, /^aia:/);
  assert.match(button.label, /arcade/);
  answer = 'Salut 👋';
  const plainPayload = await askAI({ client, user, member: null, guild, channel: null, link: '', prompt: 'salut', actions: true, web: false });
  assert.ok(!plainPayload.components?.some((r) => JSON.stringify(r.toJSON()).includes('aia:')));
});

const fakeClick = (customId, { userId = user.id, perms = 0n } = {}) => {
  const calls = { reply: [], modal: null };
  return {
    calls, customId, guild, guildId: guild.id, user: { id: userId }, memberPermissions: new PermissionsBitField(perms),
    reply: async (p) => { calls.reply.push(p); }, showModal: async (m) => { calls.modal = m; },
  };
};

await check('au clic : action lancée, fenêtre préremplie s’il manque un champ, permissions vérifiées', async () => {
  // Action sans champ obligatoire : elle part tout de suite
  let ran = null;
  const action = findAction('jeux', 'arcade');
  const original = action.run;
  action.run = async (c, i, values) => { ran = values; };
  const row = aia.actionRow({ key: 'jeux', id: 'arcade', label: 'Ouvrir l’arcade', emoji: '🕹️', values: {} }, user.id);
  const click = fakeClick(row.toJSON().components[0].custom_id);
  await aia.handleAiActionComponent(client, click);
  assert.deepEqual(ran, {});
  action.run = original;

  // Quelqu'un d'autre ne peut pas cliquer
  const row2 = aia.actionRow({ key: 'sanction', id: 'mute', label: 'Rendre muet', emoji: '🔇', values: { membre: 'Karim' } }, user.id);
  const other = fakeClick(row2.toJSON().components[0].custom_id, { userId: '999999999999999999' });
  await aia.handleAiActionComponent(client, other);
  assert.match(other.calls.reply[0].embeds[0].toJSON().description, /personne qui a fait la demande/);

  // Sans permission de modérer : refusé
  const noPerm = fakeClick(row2.toJSON().components[0].custom_id);
  await aia.handleAiActionComponent(client, noPerm);
  assert.match(noPerm.calls.reply[0].embeds[0].toJSON().description, /permission/);

  // Modérateur, mais la durée manque : la fenêtre s'ouvre avec Karim déjà choisi
  const mod = fakeClick(row2.toJSON().components[0].custom_id, { perms: PermissionsBitField.Flags.ModerateMembers });
  await aia.handleAiActionComponent(client, mod);
  const modal = JSON.stringify(mod.calls.modal.toJSON());
  assert.match(modal, /pm:sanction:mute/);
  assert.match(modal, new RegExp(karim.id));
});

globalThis.fetch = realFetch;
console.log(`\n${passed} vérifications passées.`);
process.exit(0);
