/** Banc d'essai des annonces du launcher sur Discord (GitHub et Discord simulés). */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'annonces-'));
const { releaseMessage, _test, RELEASES_CHANNEL } = await import('../src/features/launcherReleases.js');
const { notesFor } = await import('./launcher-notes.mjs');

const rel = {
  tag_name: 'v0.13.0', body: notesFor('0.13.0'),
  assets: [{ name: 'History-Launcher-Setup-0.13.0.exe', browser_download_url: 'https://x/setup.exe' }, { name: 'latest.yml' }, { name: 'apercu.png', browser_download_url: 'https://x/apercu.png' }],
};
const m = releaseMessage(rel);
assert.match(m.content, /^# 🚀 History Launcher v0\.13\.0/);
assert.match(m.content, /\n# 🛡 Double authentification\n/);
assert.match(m.content, /Version 0\.13\.0 · \[Télécharger l’installateur\]\(https:\/\/x\/setup\.exe\)/);
assert.equal(m.image, 'https://x/apercu.png');
assert.ok(releaseMessage({ ...rel, body: 'x'.repeat(5000) }).content.length <= 2000);
assert.equal(RELEASES_CHANNEL, '1553051501578948769');

const sent = [];
const client = { channels: { fetch: async (id) => ({ id, isTextBased: () => true, send: async (p) => sent.push({ id, ...p }) }) } };
const fetchImpl = async (u) => (String(u).includes('api.github.com') ? new Response(JSON.stringify(rel)) : new Response(new Uint8Array([137, 80, 78, 71])));
await _test.tick(client, fetchImpl);
assert.equal(sent.length, 1);
assert.equal(sent[0].id, '1553051501578948769');
assert.equal(sent[0].files.length, 1, 'capture PNG jointe');
await new Promise((r) => setTimeout(r, 1200));
await _test.tick(client, fetchImpl);
assert.equal(sent.length, 1, 'une seule annonce par version');
await _test.tick(client, async (u) => (String(u).includes('api.github.com') ? new Response(JSON.stringify({ ...rel, tag_name: 'v0.13.1', assets: [] })) : null));
assert.equal(sent.length, 1, 'release incomplète : pas encore annoncée');
console.log('✅ Annonces du launcher : 10 vérifications');
process.exit(0);
