/** Banc d'essai des annonces du launcher sur Discord (GitHub et Discord simulés). */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.LAUNCHER_ANNONCES_SALON = '1553051501578948769';
process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'annonces-'));
const { releaseMessage, _test, RELEASES_CHANNEL } = await import('../src/features/launcherReleases.js');
const { notesFor } = await import('./launcher-notes.mjs');

const rel = {
  tag_name: 'v0.13.0', body: notesFor('0.13.0'),
  assets: [{ name: 'History-Launcher-Setup-0.13.0.exe', browser_download_url: 'https://x/setup.exe' }, { name: 'latest.yml' }, { name: 'apercu-2.png', browser_download_url: 'https://x/apercu-2.png' }, { name: 'apercu.png', browser_download_url: 'https://x/apercu.png' }],
};
const m = releaseMessage(rel);
assert.match(m.content, /^# 🚀 History Launcher v0\.13\.0/);
assert.match(m.content, /\n# 🛡 Double authentification\n/);
assert.match(m.content, /Version 0\.13\.0 · \[Télécharger l’installateur\]\(https:\/\/x\/setup\.exe\)/);
assert.equal(m.image, 'https://x/apercu.png');
assert.deepEqual(m.images, ['https://x/apercu.png', 'https://x/apercu-2.png']);
assert.ok(releaseMessage({ ...rel, body: 'x'.repeat(5000) }).content.length <= 2000);
assert.equal(RELEASES_CHANNEL, '1553051501578948769');

const sent = [];
const client = { channels: { fetch: async (id) => ({ id, isTextBased: () => true, send: async (p) => sent.push({ id, ...p }) }) } };
const fetchImpl = async (u) => (String(u).includes('api.github.com') ? new Response(JSON.stringify(rel)) : new Response(new Uint8Array([137, 80, 78, 71])));
await _test.tick(client, fetchImpl);
assert.equal(sent.length, 1);
assert.equal(sent[0].id, '1553051501578948769');
assert.equal(sent[0].files.length, 2, 'une capture PNG par nouveauté');
await new Promise((r) => setTimeout(r, 1200));
await _test.tick(client, fetchImpl);
assert.equal(sent.length, 1, 'une seule annonce par version');
await _test.tick(client, async (u) => (String(u).includes('api.github.com') ? new Response(JSON.stringify({ ...rel, tag_name: 'v0.13.1', assets: [] })) : null));
assert.equal(sent.length, 1, 'release incomplète : pas encore annoncée');
// Version précise donnée par GitHub : on lit cette release-là, même si « latest » montre encore l'ancienne
const urls = [];
await new Promise((r) => setTimeout(r, 1200));
await _test.tick(client, async (u) => { urls.push(String(u)); return String(u).includes('api.github.com') ? new Response(JSON.stringify({ ...rel, tag_name: 'v0.13.2' })) : new Response(new Uint8Array([137, 80, 78, 71])); }, '0.13.2');
assert.ok(urls[0].endsWith('/releases/tags/v0.13.2'), urls[0]);
assert.equal(sent.length, 2, 'nouvelle version annoncée');
// « latest » en retard (plus ancienne que la dernière annonce) : rien
await new Promise((r) => setTimeout(r, 1200));
await _test.tick(client, fetchImpl);
assert.equal(sent.length, 2, 'pas de retour en arrière');
assert.ok(_test.vnum('v0.21.1') > _test.vnum('v0.21.0') && _test.vnum('0.100.0') > _test.vnum('0.99.9'));
// Repli quand l'API GitHub refuse (limite par adresse IP) : version lue dans latest.yml, captures testées une par une
const { latestRelease } = await import('../src/features/launcherReleases.js');
const fb = await latestRelease(async (u, o) => {
  u = String(u);
  if (u.includes('api.github.com')) return new Response('{"message":"API rate limit exceeded"}', { status: 403 });
  if (u.endsWith('/latest/download/latest.yml')) return new Response('version: 0.13.0\nfiles: []\n');
  if (o?.method === 'HEAD') return new Response(null, { status: /apercu(-2)?\.png$/.test(u) ? 200 : 404 });
  return new Response('', { status: 404 });
});
assert.equal(fb.tag_name, 'v0.13.0');
assert.deepEqual(fb.assets.map((a) => a.name), ['latest.yml', 'History-Launcher-Setup-0.13.0.exe', 'apercu.png', 'apercu-2.png']);
assert.match(releaseMessage(fb).content, /# 🛡 Double authentification/, 'notes tirées du CHANGELOG');
assert.equal(releaseMessage(fb).images.length, 2);
console.log('✅ Annonces du launcher : 17 vérifications');
process.exit(0);

// Chaque version doit avoir sa propre image : au moins une nouveauté avec des éléments à cliquer pour la capture
{
  const { shotCount } = await import('./launcher-notes.mjs');
  const { readFileSync } = await import('node:fs');
  const { version } = JSON.parse(readFileSync(new URL('../launcher/package.json', import.meta.url)));
  assert.ok(shotCount(version) > 0, `v${version} : ajoute ['sélecteur', 'waitN'] à une nouveauté du CHANGELOG pour capturer son image`);
}
