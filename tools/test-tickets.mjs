/**
 * Banc d'essai des tickets, des annonces et de la construction de salons (/pannel).
 * Un faux serveur Discord : rien n'est envoyé à Discord.
 *
 *   npm run test:tickets
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.OWNER_ID = '111111111111111111';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'tickets-'));

const { ChannelType, Collection, PermissionsBitField } = await import('discord.js');
const tickets = await import('../src/features/tickets.js');
const build = await import('../src/features/build.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

// ---- faux serveur
const all = new PermissionsBitField(PermissionsBitField.All);
const created = [];
const deleted = [];
const sentIn = new Map();
let nextId = 700000000000000000n;
const guild = {
  id: '444444444444444444', name: 'Serveur test', iconURL: () => null,
  roles: { everyone: { id: '444444444444444444' }, cache: new Collection() },
  members: { me: { id: '999999999999999999', permissions: all } },
  channels: { cache: new Collection() },
};
function makeChannel(name, type, extra = {}) {
  const id = String(nextId++);
  const channel = {
    id, name, type, guild, parentId: extra.parent ?? null, isTextBased: () => type !== ChannelType.GuildCategory,
    permissionsFor: () => all, toString: () => `<#${id}>`,
    send: async (payload) => { sentIn.set(id, [...(sentIn.get(id) ?? []), payload]); return { id: String(nextId++), url: `https://discord.com/channels/x/${id}/1` }; },
    messages: { fetch: async () => new Collection() },
    delete: async () => { deleted.push(id); },
    permissionOverwrites: { edit: async () => {} },
    ...extra,
  };
  guild.channels.cache.set(id, channel);
  return channel;
}
guild.channels.create = async ({ name, type, parent, permissionOverwrites }) => {
  const channel = makeChannel(name, type, { parent });
  created.push({ name, type, parent, permissionOverwrites });
  return channel;
};
const annonces = makeChannel('annonces', ChannelType.GuildText);
const client = { channels: { cache: guild.channels.cache }, users: { fetch: async () => ({ send: async () => {} }) } };

const replies = [];
const base = (extra = {}) => ({
  user: { id: '222222222222222222', username: 'Relou' }, member: { displayName: 'Relou', roles: { cache: new Collection() } },
  guildId: guild.id, guild, channelId: annonces.id, channel: annonces, memberPermissions: all,
  reply: async (p) => { replies.push(p); }, update: async (p) => { replies.push(p); }, editReply: async (p) => { replies.push(p); },
  deferReply: async () => {}, deferUpdate: async () => {}, showModal: async (m) => { replies.push({ modal: m }); },
  ...extra,
});

let draftId;
await check('panneau de tickets : l’aperçu montre l’embed, le bouton et les réglages', async () => {
  await tickets.startDraft(base(), { titre: '🎫 Support', message: 'Ouvre un ticket', bouton: 'Ouvrir', salon: annonces }, 'ticket');
  const p = replies.at(-1);
  assert.equal(p.embeds[1].toJSON().title, '🎫 Support');
  const ids = p.components.flatMap((row) => row.toJSON().components.map((c) => c.custom_id));
  draftId = ids.find((id) => id.startsWith('tkd:publish:')).split(':')[2];
  assert.ok(ids.includes(`tkd:settings:${draftId}`) && ids.includes(`tkd:color:${draftId}`), 'couleur et réglages');
});

await check('changer la couleur met l’aperçu à jour', async () => {
  await tickets.handleTicketComponent(client, base({ customId: `tkd:color:${draftId}`, values: ['rose'] }));
  assert.equal(replies.at(-1).embeds[1].toJSON().color, tickets.COLORS.rose.value);
});

await check('publier envoie le panneau avec son bouton « Ouvrir un ticket »', async () => {
  await tickets.handleTicketComponent(client, base({ customId: `tkd:publish:${draftId}` }));
  const sent = sentIn.get(annonces.id).at(-1);
  const button = sent.components[0].toJSON().components[0];
  assert.match(button.custom_id, /^tk:open:/);
  assert.equal(button.label, 'Ouvrir');
  assert.deepEqual(sent.allowedMentions, { parse: [] });
  globalThis.panelId = button.custom_id.split(':')[2];
});

let ticketChannel;
await check('ouvrir un ticket crée un salon privé (membre + bot), numéroté, avec l’accueil', async () => {
  await tickets.handleTicketComponent(client, base({ customId: `tk:open:${globalThis.panelId}` }));
  const channel = created.find((c) => c.type === ChannelType.GuildText);
  assert.match(channel.name, /^ticket-0001-relou$/);
  const everyone = channel.permissionOverwrites.find((o) => o.id === guild.id);
  assert.ok(everyone.deny.length, 'caché pour tout le monde');
  assert.ok(channel.permissionOverwrites.some((o) => o.id === '222222222222222222'), 'visible pour le membre');
  ticketChannel = [...guild.channels.cache.values()].find((c) => c.name === channel.name);
  const welcome = sentIn.get(ticketChannel.id)[0];
  assert.match(welcome.embeds[0].toJSON().title, /Ticket n°0001/);
  assert.equal(welcome.components[0].toJSON().components.length, 3, 'prendre en charge, ajouter, fermer');
});

await check('un 2e ticket du même membre renvoie vers le premier', async () => {
  await tickets.handleTicketComponent(client, base({ customId: `tk:open:${globalThis.panelId}` }));
  assert.match(replies.at(-1).embeds[0].toJSON().description, /déjà un ticket/);
});

await check('fermer : confirmation, puis le salon est supprimé', async () => {
  await tickets.handleTicketComponent(client, base({ customId: 'tk:close', channelId: ticketChannel.id, channel: ticketChannel }));
  assert.match(replies.at(-1).embeds[0].toJSON().description, /Fermer ce ticket/);
  await tickets.handleTicketComponent(client, base({ customId: 'tk:closeyes', channelId: ticketChannel.id, channel: ticketChannel }));
  await new Promise((r) => setTimeout(r, 5200));
  assert.ok(deleted.includes(ticketChannel.id));
  assert.equal((await tickets.openTickets(guild.id)).length, 0);
});

await check('construction : aperçu puis création de la catégorie et des salons', async () => {
  created.length = 0;
  await build.startBuild(base(), { theme: 'gaming', categorie: 'GAMING', ecrits: 3, vocaux: 2 });
  const preview = replies.at(-1);
  assert.match(preview.embeds[0].toJSON().description, /GAMING/);
  const goId = preview.components[0].toJSON().components[0].custom_id;
  await build.handleBuildComponent(client, base({ customId: goId }));
  assert.equal(created.filter((c) => c.type === ChannelType.GuildCategory).length, 1);
  assert.equal(created.filter((c) => c.type === ChannelType.GuildText).length, 3);
  assert.equal(created.filter((c) => c.type === ChannelType.GuildVoice).length, 2);
  assert.match(replies.at(-1).embeds[0].toJSON().title, /Construction terminée/);
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
