/**
 * Banc d'essai des vocaux temporaires (création, suppression quand ils se vident).
 *
 *   npm run test:voice-extras
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'vocal-'));

const { Collection } = await import('discord.js');
const { _test } = await import('../src/features/voiceExtras.js');
const { setGuildSettings } = await import('../src/features/guildConfig.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const G = '444444444444444444';
const CREATOR = '555555555555555555';
const channels = new Collection([[CREATOR, { id: CREATOR, parentId: '100000000000000000', members: new Collection() }]]);
const deleted = [];
const guild = {
  id: G, channels: {
    cache: channels,
    create: async (o) => {
      const c = { id: '999000000000000001', ...o, members: new Collection(), delete: async () => { deleted.push(c.id); channels.delete(c.id); } };
      channels.set(c.id, c);
      return c;
    },
  },
};
setGuildSettings(G, { 'tempVoice.creatorId': CREATOR });
const member = { id: '222222222222222222', displayName: 'Lina', user: { bot: false, username: 'lina' }, voice: { setChannel: async (c) => { member.moved = c.id; } } };

await check('rejoindre « Créer ton vocal » crée un salon à ton nom et t’y déplace', async () => {
  await _test.onVoiceState({ channelId: null, guild }, { channelId: CREATOR, guild, member });
  const created = channels.get('999000000000000001');
  assert.equal(created.name, '🔊 Lina');
  assert.equal(created.parent, '100000000000000000');
  assert.equal(member.moved, created.id);
  assert.ok((await _test.tempSet()).has(created.id));
});

await check('le salon temporaire est supprimé quand il se vide', async () => {
  await _test.onVoiceState({ channelId: '999000000000000001', guild }, { channelId: null, guild, member });
  assert.deepEqual(deleted, ['999000000000000001']);
  assert.ok(!(await _test.tempSet()).has('999000000000000001'));
});

await check('vocal verrouillé : le bot rejoint le vocal privé que le chef vient de créer, puis revient', async () => {
  const { config } = await import('../src/config.js');
  const voice = await import('../src/features/voice.js');
  const { ChannelType } = await import('discord.js');
  const home = { id: '700000000000000001', type: ChannelType.GuildVoice };
  const temp = { id: '700000000000000002', type: ChannelType.GuildVoice };
  const states = new Collection([[config.ownerId, { channelId: temp.id }]]);
  const g = { id: '444444444444444445', channels: { cache: new Collection([[home.id, home], [temp.id, temp]]) }, voiceStates: { cache: states }, members: { me: { voice: { channelId: temp.id } } } };
  assert.ok(config.voice.lockHome, 'réglage par défaut : vocal verrouillé');
  await voice.joinOwnerTemp(g, temp).catch(() => {});
  assert.equal(voice.lockedChannel(g)?.id, temp.id, 'le bot va dans le vocal privé du chef');
  states.set(config.ownerId, { channelId: home.id });
  assert.notEqual(voice.lockedChannel(g)?.id, temp.id, 'le chef en est parti : le bot n’y reste pas');
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
