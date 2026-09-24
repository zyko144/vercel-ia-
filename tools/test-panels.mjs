/**
 * Banc d'essai des panneaux (/sanction, /jeux, /musique, /ia, /serveur, /pannel).
 * Vérifie que chaque panneau et chaque fenêtre respectent les limites de Discord, que chaque action
 * mène à une vraie commande, et que les réponses reviennent en embed avec l'image animée.
 *
 *   npm run test:panels
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
process.env.ALLOWED_CHANNEL_IDS = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'panneaux-'));

const { Collection, MessageFlags, PermissionsBitField } = await import('discord.js');
const { PANELS } = await import('../src/panels/catalog.js');
const panels = await import('../src/panels/index.js');
await import('../src/panels/extra.js');
const { buildModal } = await import('../src/panels/ui.js');
const { LEGACY_COMMAND_NAMES } = await import('../src/commands/definitions.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

const replies = [];
const makeInteraction = (extra = {}) => ({
  user: { id: '222222222222222222', username: 'membre' },
  guildId: '444444444444444444',
  guild: null,
  channelId: '555555555555555555',
  channel: { id: '555555555555555555' },
  client: { user: { username: 'AI Vercel' }, ws: { ping: 42 }, channels: { cache: new Collection() } },
  memberPermissions: new PermissionsBitField(PermissionsBitField.All),
  replied: false,
  deferred: false,
  reply(payload) { replies.push(payload); this.replied = true; return Promise.resolve(); },
  editReply(payload) { replies.push(payload); return Promise.resolve(); },
  followUp(payload) { replies.push(payload); return Promise.resolve(); },
  deferReply() { this.deferred = true; return Promise.resolve(); },
  isStringSelectMenu: () => true,
  isModalSubmit: () => false,
  isChatInputCommand: () => false,
  isMessageContextMenuCommand: () => false,
  ...extra,
});

await check('6 commandes, chacune ouvre un panneau avec bannière animée et menus valides', async () => {
  for (const key of ['sanction', 'jeux', 'pannel', 'musique', 'serveur', 'ia']) {
    const msg = panels.panelMessage(makeInteraction(), key);
    const embed = msg.embeds[0].toJSON();
    assert.match(embed.image.url, new RegExp(`${key}\\.gif`), `${key} : la bannière`);
    assert.ok(msg.components.length >= 1 && msg.components.length <= 5, `${key} : 1 à 5 menus`);
    for (const row of msg.components) {
      const json = row.toJSON();
      assert.ok(json.components[0].options.length <= 25, `${key} : 25 choix maximum par menu`);
      assert.ok(json.components[0].options.length >= 1);
    }
  }
});

await check('chaque action mène à une vraie commande ou à une fonction dédiée', async () => {
  for (const panel of Object.values(PANELS)) {
    for (const group of panel.groups) {
      for (const action of group.actions) {
        assert.ok(action.run || LEGACY_COMMAND_NAMES.has(action.cmd), `${panel.key}/${action.id} : commande « ${action.cmd} » inconnue`);
      }
    }
  }
});

await check('chaque fenêtre respecte les limites de Discord (5 champs, textes courts)', async () => {
  for (const panel of Object.values(PANELS)) {
    for (const group of panel.groups) {
      for (const action of group.actions) {
        if (typeof action.fields === 'function' || !action.fields?.length) continue;
        assert.ok(action.fields.length <= 5, `${panel.key}/${action.id} : 5 champs maximum`);
        const json = buildModal(`pm:${panel.key}:${action.id}`, `${action.emoji} ${action.label}`, action.fields).toJSON();
        assert.ok(json.title.length <= 45);
        assert.ok(`pm:${panel.key}:${action.id}`.length <= 100);
      }
    }
  }
});

await check('une action sans champ passe par la commande d’origine et répond en embed avec l’image', async () => {
  replies.length = 0;
  const interaction = makeInteraction({ customId: 'pn:jeux:1', values: ['pile'] });
  await panels.handlePanelComponent(interaction.client, interaction);
  assert.equal(replies.length, 1);
  const embed = replies[0].embeds[0].toJSON();
  assert.match(embed.description, /Pile|Face/);
  assert.match(embed.author.name, /Pile ou face/);
  assert.ok(embed.thumbnail.url.includes('jeux.gif'), 'la bannière animée du panneau');
});

await check('une fenêtre remplie donne ses valeurs à la commande (dés : 3 dés à 20 faces)', async () => {
  replies.length = 0;
  const interaction = makeInteraction({
    customId: 'pm:jeux:des',
    isStringSelectMenu: () => false,
    isModalSubmit: () => true,
    fields: { getTextInputValue: (id) => ({ faces: '20', nombre: '3' }[id] ?? '') },
  });
  await panels.handlePanelComponent(interaction.client, interaction);
  const text = replies[0].embeds[0].toJSON().description;
  assert.match(text, /d20|20 faces|3/);
});

await check('un nombre hors limites est refusé clairement', async () => {
  replies.length = 0;
  const interaction = makeInteraction({
    customId: 'pm:jeux:des',
    isStringSelectMenu: () => false,
    isModalSubmit: () => true,
    fields: { getTextInputValue: (id) => ({ faces: '5000' }[id] ?? '') },
  });
  await panels.handlePanelComponent(interaction.client, interaction);
  assert.match(replies[0].embeds[0].toJSON().description, /entre 2 et 1000/);
});

await check('une action réservée est refusée sans la permission', async () => {
  replies.length = 0;
  const interaction = makeInteraction({ customId: 'pn:sanction:0', values: ['ban'], memberPermissions: new PermissionsBitField(0n) });
  await panels.handlePanelComponent(interaction.client, interaction);
  assert.match(replies[0].embeds[0].toJSON().description, /permission/);
  assert.ok(replies[0].flags & MessageFlags.Ephemeral);
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
