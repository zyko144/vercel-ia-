/**
 * Banc d'essai de la sécurité du serveur : anti-arnaque, liens, anti-spam, anti-raid, casier.
 *
 *   npm run test:security
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
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'securite-'));

const { Collection, PermissionsBitField } = await import('discord.js');
const security = await import('../src/features/security.js');
const { setGuildSettings } = await import('../src/features/guildConfig.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

const G = '444444444444444444';
const logs = [];
const logChannel = { id: '666666666666666666', isTextBased: () => true, send: async (p) => { logs.push(p); } };
const guild = {
  id: G, name: 'Serveur', client: { user: { id: '999999999999999999' } }, verificationLevel: 1,
  channels: { cache: new Collection([[logChannel.id, logChannel]]) },
  members: { cache: new Collection(), fetch: async () => null },
  setVerificationLevel: async (level) => { guild.verificationLevel = level; },
  disableInvites: async (v) => { guild.invitesOff = v; },
  fetchOwner: async () => ({ send: async () => {} }),
};
setGuildSettings(G, { 'logs.channelId': logChannel.id });

let deleted = 0;
const timeouts = [];
const makeMessage = (content, { staff = false, id = '222222222222222222' } = {}) => ({
  content, guildId: G, guild, inGuild: () => true,
  author: { id, bot: false, send: async () => {}, displayAvatarURL: () => null, toString: () => `<@${id}>` },
  member: { permissions: new PermissionsBitField(staff ? PermissionsBitField.All : 0n), moderatable: true, timeout: async (ms) => { timeouts.push(ms); } },
  mentions: { users: new Collection(), roles: new Collection(), everyone: false },
  channel: { send: async () => ({ delete: async () => {} }), toString: () => '#general' },
  delete: async () => { deleted += 1; },
});

await check('anti-arnaque : faux Nitro supprimé, membre muet 1 h, journal écrit', async () => {
  assert.equal(security.looksLikeScam('free nitro here https://dlscord.gift/abc'), true);
  assert.equal(security.looksLikeScam('regarde https://discord.com/channels/1/2'), false);
  assert.equal(security.looksLikeScam('https://steamcommunlty.com/tradeoffer/new'), true);
  const removed = await security.guardMessage(makeMessage('Free nitro 🎁 https://discord-nitro.gift/claim'));
  assert.equal(removed, true);
  assert.equal(timeouts.at(-1), 60 * 60_000);
  assert.match(logs.at(-1).embeds[0].toJSON().title, /arnaque/);
});

await check('liens : invitation Discord bloquée, sites autorisés passent, le staff n’est pas filtré', async () => {
  assert.equal(await security.guardMessage(makeMessage('rejoins https://discord.gg/abcdef')), true);
  setGuildSettings(G, { 'links.enabled': true });
  assert.equal(await security.guardMessage(makeMessage('écoute https://open.spotify.com/track/1', { id: '3' })), false);
  assert.equal(await security.guardMessage(makeMessage('va sur https://site-louche.xyz', { id: '4' })), true);
  assert.equal(await security.guardMessage(makeMessage('va sur https://site-louche.xyz', { staff: true })), false);
});

await check('anti-spam : rafale → avertissement puis muet 5 min ; majuscules et mentions', async () => {
  const before = deleted;
  for (let i = 0; i < 7; i++) await security.guardMessage(makeMessage(`msg ${i}`, { id: '5' }));
  assert.equal(deleted, before + 1, 'le 7e message est supprimé');
  for (let i = 0; i < 7; i++) await security.guardMessage(makeMessage(`encore ${i}`, { id: '5' }));
  assert.equal(timeouts.at(-1), 5 * 60_000, 'récidive : muet 5 min');
  assert.equal(await security.guardMessage(makeMessage('POURQUOI PERSONNE NE ME REPOND ICI', { id: '6' })), true);
  const mass = makeMessage('coucou', { id: '7' });
  for (let i = 0; i < 6; i++) mass.mentions.users.set(String(i), {});
  assert.equal(await security.guardMessage(mass), true);
});

await check('anti-raid : 8 arrivées en rafale → serveur verrouillé et invitations suspendues', async () => {
  for (let i = 0; i < 8; i++) {
    await security.onMemberJoin({ id: `8${i}`, guild, user: { username: `raid${i}`, createdTimestamp: Date.now() }, displayAvatarURL: () => null, kickable: true, toString: () => `<@8${i}>` });
  }
  assert.equal(security.raidActive(G), true);
  assert.equal(guild.invitesOff, true);
  assert.equal(guild.verificationLevel, 4);
  assert.ok(logs.some((l) => /RAID/.test(l.embeds[0].toJSON().title)));
});

await check('casier : sanctions automatiques et notes du staff au même endroit', async () => {
  await security.addNote(G, '5', '111111111111111111', 'Déjà prévenu en vocal');
  const embed = (await security.casierEmbed(guild, { id: '5', username: 'spammeur', createdTimestamp: Date.now(), displayAvatarURL: () => null })).toJSON();
  assert.match(embed.fields[0].name, /Avertissements \(\d\)/);
  assert.match(embed.fields[0].value, /rafale/);
  assert.match(embed.fields[1].value, /Déjà prévenu/);
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
