// Envoie le son de ton PC (Spotify, YouTube, jeu…) au bot Discord, qui le diffuse tel quel dans le vocal.
//
//   node tools/son-du-pc.mjs --liste            → montre les entrées audio de ton PC
//   node tools/son-du-pc.mjs                    → démarre avec l'entrée trouvée automatiquement
//   node tools/son-du-pc.mjs --entree "CABLE Output (VB-Audio Virtual Cable)"
//
// Sur Windows il faut une entrée qui capte la SORTIE de ton PC : « Mix stéréo » (à activer dans
// Paramètres son › Enregistrement) ou VB-CABLE (https://vb-audio.com/Cable/) avec Spotify réglé dessus.
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import WebSocket from 'ws';

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

const PREFERRED = [/cable output/i, /mix st[ée]r[ée]o/i, /stereo mix/i, /what u hear/i, /virtual-audio-capturer/i, /loopback/i];

const devices = await listDevices();
if (option('liste')) {
  console.log(devices.length ? `Entrées audio :\n - ${devices.join('\n - ')}` : 'Aucune entrée audio trouvée.');
  process.exit(0);
}

const device = option('entree') ?? PREFERRED.map((rx) => devices.find((d) => rx.test(d))).find(Boolean);
if (!device) {
  console.error(`❌ Aucune entrée qui capte le son du PC.\nEntrées disponibles :\n - ${devices.join('\n - ') || '(aucune)'}\n\nActive « Mix stéréo » dans Paramètres son › Enregistrement, ou installe VB-CABLE, puis relance avec --entree "nom".`);
  process.exit(1);
}

console.log(`🎧 Capture de : ${device}`);
const url = `${base}/live/push?key=${key}${userId ? `&user=${userId}` : ''}`;
let ws;
let ffmpeg;
let stopping = false;

function startFfmpeg() {
  ffmpeg = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'dshow', '-audio_buffer_size', '50', '-i', `audio=${device}`,
    '-ac', '2', '-ar', '48000',
    '-c:a', 'libmp3lame', '-b:a', '160k', '-reservoir', '0',
    '-f', 'mp3', '-',
  ]);
  ffmpeg.stderr.on('data', (chunk) => process.stderr.write(`[ffmpeg] ${chunk}`));
  ffmpeg.stdout.on('data', (chunk) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(chunk);
  });
  ffmpeg.on('close', (code) => {
    if (!stopping) {
      console.error(`ffmpeg s'est arrêté (code ${code})`);
      process.exit(1);
    }
  });
}

function connect() {
  ws = new WebSocket(url);
  ws.on('open', () => {
    console.log('✅ Connecté au bot : le son de ton PC part dans le vocal.');
    if (!ffmpeg) startFfmpeg();
  });
  ws.on('close', (code) => {
    console.warn(`Connexion fermée (${code})${code === 1006 ? ' : clé refusée ou bot injoignable' : ''}. Nouvelle tentative dans 5 s…`);
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

connect();
