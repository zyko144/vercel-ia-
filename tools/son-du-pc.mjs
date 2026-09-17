// Envoie le son de ton PC (Spotify, YouTube, jeu…) au bot Discord, qui le diffuse tel quel dans le vocal.
//
//   node tools/son-du-pc.mjs --liste            → montre les entrées audio de ton PC
//   node tools/son-du-pc.mjs                    → démarre avec l'entrée trouvée automatiquement
//   node tools/son-du-pc.mjs --entree "CABLE Output (VB-Audio Virtual Cable)"
//
// Sur Windows il faut une entrée qui capte la SORTIE de ton PC : « Mix stéréo » (à activer dans
// Paramètres son › Enregistrement) ou VB-CABLE (https://vb-audio.com/Cable/) avec Spotify réglé dessus.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import WebSocket from 'ws';
import { FILTERS } from '../src/music/filters.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] ?? true : fallback;
};

function env(key) {
  const line = readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : '';
}

const token = env('DISCORD_TOKEN').split(';')[0].trim();
if (!token) {
  console.error('❌ DISCORD_TOKEN introuvable dans .env');
  process.exit(1);
}
const key = createHmac('sha256', token).update('vercel-stream').digest('hex').slice(0, 32);
const base = (option('bot', env('PUBLIC_URL') || 'https://vercel-ia.onrender.com')).replace(/^http/, 'ws').replace(/\/+$/, '');
const userId = option('membre', env('OWNER_ID') || '');

/** Entrées audio du PC (Windows). */
function listDevices() {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
    let text = '';
    proc.stderr.on('data', (chunk) => { text += chunk; });
    proc.on('close', () => {
      const devices = [...text.matchAll(/"([^"]+)"\s*\(audio\)/g)].map((m) => m[1]);
      resolve(devices);
    });
  });
}

const PREFERRED = [/cable output/i, /voicemeeter out b1/i, /voicemeeter out b2/i, /voicemeeter out b3/i, /voicemeeter out/i, /mix st[ée]r[ée]o/i, /stereo mix/i, /what u hear/i, /virtual-audio-capturer/i, /loopback/i];

/** Niveau sonore moyen d'une entrée (en dB) : sert à trouver celle qui reçoit vraiment le son du PC. */
function levelOf(name, seconds = 2) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-f', 'dshow', '-i', `audio=${name}`, '-t', String(seconds), '-af', 'volumedetect', '-f', 'null', '-']);
    let text = '';
    proc.stderr.on('data', (chunk) => { text += chunk; });
    proc.on('close', () => {
      const mean = Number(text.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/)?.[1]);
      resolve(Number.isFinite(mean) ? mean : -999);
    });
    proc.on('error', () => resolve(-999));
  });
}

/** Cherche l'entrée qui capte le son du PC : celle qui a du son en ce moment. */
async function findLoudest(candidates) {
  const results = [];
  for (const name of candidates) {
    const level = await levelOf(name);
    results.push({ name, level });
    console.log(`   ${level > -70 ? '🔊' : '🔇'} ${name} : ${level > -900 ? `${level.toFixed(1)} dB` : 'pas de son'}`);
  }
  return results.sort((a, b) => b.level - a.level)[0];
}

const devices = await listDevices();
if (option('liste')) {
  console.log(devices.length ? `Entrées audio :\n - ${devices.join('\n - ')}` : 'Aucune entrée audio trouvée.');
  process.exit(0);
}

// Entrées qui peuvent capter la sortie du PC (VB-CABLE, Voicemeeter, Mix stéréo…)
const candidates = [...new Set(PREFERRED.flatMap((rx) => devices.filter((d) => rx.test(d))))];

let device = option('entree');
if (!device && candidates.length) {
  console.log('🔎 Je cherche laquelle reçoit le son (mets un son en route) :');
  const best = await findLoudest(candidates);
  device = best?.level > -70 ? best.name : candidates[0];
  if (!(best?.level > -70)) console.warn(`⚠️ Aucune entrée n'a de son en ce moment. Je prends « ${device} » : si personne n'entend rien, lance un son puis relance, ou choisis avec --entree "nom".`);
}
if (option('test')) {
  if (!candidates.length) console.log('Aucune entrée capable de capter le son du PC.');
  else await findLoudest(candidates);
  process.exit(0);
}
if (!device) {
  console.error(`❌ Aucune entrée qui capte le son du PC.\nEntrées disponibles :\n - ${devices.join('\n - ') || '(aucune)'}\n\nAvec Voicemeeter : mets la sortie de Spotify sur « Voicemeeter Input », et envoie-la sur le bus B1.\nSinon : active « Mix stéréo » dans Paramètres son › Enregistrement, ou installe VB-CABLE. Puis relance avec --entree "nom".`);
  process.exit(1);
}

console.log(`🎧 Capture de : ${device}`);
const url = `${base}/live/push?key=${key}${userId ? `&user=${userId}` : ''}`;
let ws;
let ffmpeg;
let stopping = false;

function startFfmpeg() {
  const previous = ffmpeg;
  ffmpeg = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'dshow', '-audio_buffer_size', '20', '-i', `audio=${device}`,
    '-ac', '2', '-ar', '48000',
    '-c:a', 'libmp3lame', '-b:a', '160k', '-reservoir', '0', '-flush_packets', '1', '-fflags', '+nobuffer', '-flags', 'low_delay',
    '-f', 'mp3', '-',
  ]);
  const own = ffmpeg;
  own.stderr.on('data', (chunk) => process.stderr.write(`[ffmpeg] ${chunk}`));
  own.stdout.on('data', (chunk) => {
    if (own !== ffmpeg) return;
    if (ws?.readyState === WebSocket.OPEN) ws.send(chunk);
    // Écoute de contrôle dans le navigateur
    for (const res of monitors) res.write(chunk);
  });
  own.on('close', (code) => {
    if (own !== ffmpeg || stopping) return; // remplacé par un changement d'entrée
    console.error(`ffmpeg s'est arrêté (code ${code})`);
    process.exit(1);
  });
  previous?.kill('SIGKILL');
}

/** Change l'entrée captée (demandé depuis le panneau Discord). */
function switchDevice(name) {
  if (!name || name === device) return;
  device = name;
  console.log(`🎚️ Nouvelle entrée : ${device}`);
  startFfmpeg();
}

function connect() {
  ws = new WebSocket(url);
  ws.on('open', () => {
    console.log('✅ Connecté au bot : le son de ton PC part dans le vocal.');
    // Le bot affiche ces entrées dans /direct pour pouvoir en changer sans toucher au PC
    ws.send(JSON.stringify({ type: 'devices', devices, current: device }));
    if (!ffmpeg) startFfmpeg();
  });
  ws.on('message', (data) => {
    try {
      const order = JSON.parse(String(data));
      if (order.type === 'device') switchDevice(order.name);
      if (order.type === 'stop') process.kill(process.pid, 'SIGINT');
    } catch {
      // message inconnu
    }
  });
  ws.on('close', (code, raison) => {
    if (code === 4001) {
      console.error('❌ Une autre fenêtre diffuse déjà. Ferme-la (ou clique sur Arrêter), puis relance celle-ci.');
      stopping = true;
      process.exit(1);
    }
    console.warn(`Connexion fermée (${code})${code === 1006 ? ' : clé refusée ou bot injoignable' : ''}${raison ? ' · ' + raison : ''}. Nouvelle tentative dans 5 s…`);
    if (!stopping) setTimeout(connect, 5_000);
  });
  ws.on('error', (err) => console.warn('Erreur :', err.message));
}

process.on('SIGINT', () => {
  stopping = true;
  console.log('\n⏹️ Diffusion arrêtée.');
  try { ws?.close(); } catch { /* déjà fermé */ }
  try { ffmpeg?.kill('SIGKILL'); } catch { /* déjà mort */ }
  process.exit(0);
});

const monitors = new Set();
const PANEL_PORT = Number(option('port', 8787));
const loopback = /cable output|voicemeeter out|mix st[ée]r[ée]o|stereo mix|what u hear/i;
let filters = [];

function sendFilters() {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'filters', list: filters }));
}

const PAGE = () => `<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Son du PC → Discord</title>
<style>
  :root { color-scheme: dark; --fond:#11131a; --carte:#1a1d27; --trait:#2b2f3d; --texte:#e7e9f0; --accent:#1db954; --rouge:#ed4245; }
  * { box-sizing: border-box; font-family: system-ui, "Segoe UI", sans-serif; }
  body { margin:0; padding:24px; background:var(--fond); color:#e7e9f0; }
  .carte { max-width:680px; margin:0 auto 16px; background:var(--carte); border:1px solid var(--trait); border-radius:14px; padding:18px 20px; }
  h1 { font-size:20px; margin:0 0 4px; } .sous { color:#9aa0b5; font-size:13px; margin:0 0 16px; }
  h2 { font-size:14px; text-transform:uppercase; letter-spacing:.04em; color:#9aa0b5; margin:0 0 10px; }
  select, button { font-size:14px; border-radius:10px; border:1px solid var(--trait); background:#222634; color:#e7e9f0; padding:10px 12px; }
  select { width:100%; }
  .effets { display:flex; flex-wrap:wrap; gap:8px; }
  .effets button.on { background:var(--accent); border-color:var(--accent); color:#06210f; font-weight:600; }
  .ligne { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
  .etat { display:inline-flex; align-items:center; gap:8px; font-size:13px; color:#9aa0b5; }
  .pastille { width:9px; height:9px; border-radius:50%; background:var(--rouge); }
  .pastille.ok { background:var(--accent); }
  audio { width:100%; margin-top:10px; }
  .stop { background:var(--rouge); border-color:var(--rouge); }
</style>
<div class="carte">
  <h1>🎧 Son du PC → Discord</h1>
  <p class="sous">Tout ce que tu changes ici s'applique tout de suite dans le vocal.</p>
  <div class="etat"><span class="pastille" id="pastille"></span><span id="etat">…</span></div>
</div>

<div class="carte">
  <h2>Entrée captée</h2>
  <select id="entree"></select>
  <p class="sous" id="astuce">🔊 = capte le son du PC · 🎙️ = micro. Pour ne capter que Spotify : mets Spotify sur « Voicemeeter Aux Input » et envoie cette tranche sur B2, puis choisis « Voicemeeter Out B2 ».</p>
</div>

<div class="carte">
  <h2>Effets sur le son diffusé</h2>
  <div class="effets" id="effets"></div>
</div>

<div class="carte">
  <h2>M'entendre (écoute de contrôle)</h2>
  <p class="sous">Tu entends exactement ce que le bot diffuse. Mets un casque pour éviter l'effet larsen.</p>
  <audio id="ecoute" controls preload="none"></audio>
</div>

<div class="carte ligne">
  <button id="stop" class="stop">⏹️ Arrêter la diffusion</button>
</div>

<script>
const $ = (id) => document.getElementById(id);
async function etat() {
  const r = await fetch('/api/etat').then((x) => x.json());
  $('pastille').className = 'pastille' + (r.connecte ? ' ok' : '');
  $('etat').textContent = r.connecte ? 'En direct dans le vocal · entrée : ' + r.entree : 'Pas connecté au bot…';
  if (!$('entree').options.length) {
    for (const nom of r.entrees) {
      const o = document.createElement('option');
      o.value = nom; o.textContent = (r.loopback.includes(nom) ? '🔊 ' : '🎙️ ') + nom;
      $('entree').append(o);
    }
  }
  $('entree').value = r.entree;
  if (!$('effets').children.length) {
    for (const f of r.effetsDispo) {
      const b = document.createElement('button');
      b.textContent = f.label; b.dataset.nom = f.nom;
      b.onclick = async () => {
        const actifs = await fetch('/api/effet?nom=' + encodeURIComponent(f.nom), { method: 'POST' }).then((x) => x.json());
        marquer(actifs);
      };
      $('effets').append(b);
    }
  }
  marquer(r.effets);
}
function marquer(actifs) {
  for (const b of $('effets').children) b.className = actifs.includes(b.dataset.nom) ? 'on' : '';
}
$('entree').onchange = () => fetch('/api/entree?nom=' + encodeURIComponent($('entree').value), { method: 'POST' });
$('stop').onclick = () => fetch('/api/stop', { method: 'POST' });
$('ecoute').src = '/monitor.mp3';
etat(); setInterval(etat, 3000);
</script></html>`;

function startPanel() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(PAGE());
    }
    if (url.pathname === '/api/etat') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        connecte: ws?.readyState === WebSocket.OPEN,
        entree: device,
        entrees: devices,
        loopback: devices.filter((d) => loopback.test(d)),
        effets: filters,
        effetsDispo: Object.entries(FILTERS).map(([nom, f]) => ({ nom, label: `${f.emoji} ${f.label}` })),
      }));
    }
    if (url.pathname === '/api/entree') {
      switchDevice(url.searchParams.get('nom'));
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'devices', devices, current: device }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, entree: device }));
    }
    if (url.pathname === '/api/effet') {
      const nom = url.searchParams.get('nom');
      filters = filters.includes(nom) ? filters.filter((f) => f !== nom) : [...filters, nom];
      sendFilters();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(filters));
    }
    if (url.pathname === '/api/stop') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return process.kill(process.pid, 'SIGINT');
    }
    if (url.pathname === '/monitor.mp3') {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
      monitors.add(res);
      req.on('close', () => monitors.delete(res));
      return undefined;
    }
    res.writeHead(404);
    return res.end('introuvable');
  });
  server.listen(PANEL_PORT, '127.0.0.1', () => {
    console.log(`🎛️ Panneau de contrôle : http://localhost:${PANEL_PORT}`);
    if (!option('sansnavigateur')) spawn('cmd', ['/c', 'start', '', `http://localhost:${PANEL_PORT}`], { detached: true, stdio: 'ignore' }).unref();
  });
}

startPanel();
connect();
