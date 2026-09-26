/**
 * Banc d'essai des offres premium (essai 7 jours, plans, minutes d'IA vocale, couleurs du serveur,
 * options Gardien) et du rapport de la semaine.
 *
 *   npm run test:premium
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.RENDER_EXTERNAL_URL = 'https://vercel-ia.onrender.com';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'premium-'));

const premium = await import('../src/features/premium.js');
const weekly = await import('../src/features/weekly.js');
await premium.loadServers();

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };
const G = '444444444444444444';

await check('gratuit : 60 min d’IA vocale, pas de couleurs, pas de voix au choix', async () => {
  assert.equal(premium.planOf(G).key, 'gratuit');
  assert.equal(premium.voiceUsage(G).limit, 60);
  premium.setBranding(G, { name: 'Dictature', color: 0xff0000 });
  assert.equal(premium.brandingOf(G), null, 'les couleurs attendent une offre');
  premium.setVoice(G, 'Kore');
  assert.equal(premium.voiceOf(G, 'Puck'), 'Puck');
});

await check('essai gratuit : 7 jours de Gardien, une seule fois', async () => {
  const { plan } = premium.startTrial(G, '1');
  assert.equal(plan.key, 'gardien');
  assert.ok(plan.trial);
  assert.ok(Math.abs(plan.until - Date.now() - 7 * 86_400_000) < 5_000);
  assert.match(premium.startTrial(G, '1').error, /déjà/);
  assert.equal(premium.brandingOf(G).name, 'Dictature', 'les couleurs s’appliquent');
  assert.equal(premium.voiceOf(G, 'Puck'), 'Kore', 'la voix choisie s’applique');
});

await check('minutes d’IA vocale : comptées au mois', async () => {
  premium.setPlan(G, 'veilleur', 30);
  premium.addVoiceMinutes(G, 12.4);
  const usage = premium.voiceUsage(G);
  assert.equal(usage.used, 12);
  assert.equal(usage.limit, 150);
  assert.equal(usage.left, 138);
});

await check('Gardien : options réservées à l’offre Gardien', async () => {
  premium.setGuardOptions(G, { protectedIds: ['555555555555555555', 'pas un id'], words: ['Wesh gros', 'x'] });
  assert.deepEqual(premium.guardOptionsOf(G), { protectedIds: [], words: [] }, 'Veilleur : pas de Gardien');
  premium.setPlan(G, 'gardien', 30);
  assert.deepEqual(premium.guardOptionsOf(G), { protectedIds: ['555555555555555555'], words: ['wesh gros'] });
});

await check('le chef retire l’offre payée : l’essai en cours reprend, et ne se relance pas', async () => {
  premium.setPlan(G, 'gratuit', 0);
  assert.equal(premium.planOf(G).key, 'gardien');
  assert.ok(premium.planOf(G).trial);
  assert.match(premium.startTrial(G, '1').error, /déjà|offre/);
});

await check('rapport de la semaine : messages, membres, salons et événements', async () => {
  await weekly.buildReport({ id: G, name: 'Serveur', iconURL: () => null }); // charge les compteurs
  const message = (author, channel) => ({ guildId: G, channelId: channel, author: { id: author, bot: false } });
  for (let i = 0; i < 5; i++) weekly.countMessage(message('1', 'a'));
  weekly.countMessage(message('2', 'b'));
  weekly.countEvent(G, 'jeux', 2);
  weekly.countEvent(G, 'tickets');
  const { embeds } = await weekly.buildReport({ id: G, name: 'Serveur', iconURL: () => null });
  const json = embeds[0].toJSON();
  assert.match(json.description, /\*\*6\*\* messages/);
  assert.match(json.description, /\*\*2\*\* membres actifs/);
  const field = (name) => json.fields.find((x) => x.name.includes(name)).value;
  assert.match(field('Les plus actifs'), /🥇 <@1> · 5 msg/);
  assert.equal(field('Parties'), '2');
  assert.equal(field('Tickets'), '1');
});

await check('plafond de questions à l’IA : 60 par jour en gratuit, puis refus ; 1 000 en Gardien', async () => {
  const { takeAiQuestion, PLANS } = await import('../src/features/premium.js');
  let last;
  for (let i = 0; i < 61; i++) last = takeAiQuestion('123456789012345670', 'u');
  assert.equal(last.ok, false);
  assert.equal(last.limit, 60);
  assert.equal(PLANS.gardien.aiPerDay, 1000);
  assert.equal(PLANS.veilleur.voiceMinutes, 150);
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
