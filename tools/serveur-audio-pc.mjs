// Fait tourner le serveur audio du bot (Lavalink) sur ton PC et le relie au bot sur Render par un tunnel gratuit.
// Tant que cette fenêtre est ouverte, la musique marche ; fermée, le bot affiche « musique en travaux ».
//   node tools/serveur-audio-pc.mjs      (ou double-clic sur musique-pc.bat)
// 1re fois : télécharge Java, Lavalink et le tunnel Cloudflare dans data/audio-pc (rien à installer à la main).
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'data', 'audio-pc');
const win = process.platform === 'win32';
const PORT = 2333;
mkdirSync(dir, { recursive: true });

const env = (key) => readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? '';
const token = env('DISCORD_TOKEN').split(';')[0].trim();
if (!token) { console.error('❌ DISCORD_TOKEN introuvable dans .env'); process.exit(1); }
const key = createHmac('sha256', token).update('vercel-stream').digest('hex').slice(0, 32);
const bot = (env('PUBLIC_URL') || 'https://vercel-ia.onrender.com').replace(/\/+$/, '');

async function download(url, file) {
  if (existsSync(file)) return;
  console.log(`⬇️  ${path.basename(file)}…`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`téléchargement impossible (${res.status}) : ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`${file}.part`));
  (await import('node:fs')).renameSync(`${file}.part`, file);
}

// Java (Lavalink en a besoin) : celui du PC s'il est assez récent, sinon une copie portable
async function java() {
  const v = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (Number((v.stderr ?? '').match(/version "(\d+)/)?.[1]) >= 17) return 'java';
  const jre = path.join(dir, 'jre');
  if (!existsSync(jre)) {
    const os = win ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
    const archive = path.join(dir, win ? 'jre.zip' : 'jre.tar.gz');
    await download(`https://api.adoptium.net/v3/binary/latest/21/ga/${os}/${arch}/jre/hotspot/normal/eclipse`, archive);
    mkdirSync(jre);
    spawnSync('tar', ['-xf', archive, '-C', jre], { stdio: 'inherit' });
  }
  const home = path.join(jre, readdirSync(jre)[0]);
  return path.join(home, process.platform === 'darwin' ? 'Contents/Home/bin/java' : 'bin/java');
}

const youtubeVersion = async () => (await (await fetch('https://api.github.com/repos/lavalink-devs/youtube-source/releases/latest')).json()).tag_name;
const cloudflaredUrl = () => `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${win ? 'windows-amd64.exe' : process.platform === 'darwin' ? 'darwin-amd64.tgz' : `linux-${process.arch === 'arm64' ? 'arm64' : 'amd64'}`}`;

const children = [];
const stop = () => { for (const c of children) c.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const javaBin = await java();
await download('https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar', path.join(dir, 'Lavalink.jar'));
const cloudflared = path.join(dir, win ? 'cloudflared.exe' : 'cloudflared');
await download(cloudflaredUrl(), cloudflared);
if (!win) spawnSync('chmod', ['+x', cloudflared]);

const passFile = path.join(dir, 'password');
if (!existsSync(passFile)) writeFileSync(passFile, randomBytes(18).toString('hex'));
const password = readFileSync(passFile, 'utf8').trim();
writeFileSync(path.join(dir, 'application.yml'), `server:
  port: ${PORT}
  address: 127.0.0.1
lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:${await youtubeVersion()}"
      snapshot: false
  server:
    password: "${password}"
    sources: { youtube: false, soundcloud: true, bandcamp: true, http: true }
    bufferDurationMs: 400
    frameBufferDurationMs: 10000
    playerUpdateInterval: 2
    trackStuckThresholdMs: 10000
plugins:
  youtube:
    enabled: true
    allowSearch: true
    clients: ["MUSIC", "ANDROID_VR", "WEB", "WEBEMBEDDED", "TV"]
`);

console.log('🎵 Démarrage du serveur audio…');
const lava = spawn(javaBin, ['-Xmx1G', '-jar', 'Lavalink.jar'], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] });
children.push(lava);
lava.on('exit', (code) => { console.error(`❌ Le serveur audio s'est arrêté (code ${code}).`); stop(); });
for (let i = 0; ; i++) {
  const ok = await fetch(`http://127.0.0.1:${PORT}/version`, { headers: { Authorization: password } }).then((r) => r.ok, () => false);
  if (ok) break;
  if (i > 90) { console.error('❌ Le serveur audio ne démarre pas.'); stop(); }
  await new Promise((r) => setTimeout(r, 2000));
}

// Tunnel gratuit Cloudflare (sans compte) : donne une adresse publique au serveur audio, sans toucher à la box
const tunnel = spawn(cloudflared, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`]);
children.push(tunnel);
tunnel.on('exit', () => { console.error('❌ Le tunnel s\'est arrêté.'); stop(); });
const host = await new Promise((resolve) => {
  const read = (chunk) => { const m = String(chunk).match(/https:\/\/([a-z0-9-]+\.trycloudflare\.com)/); if (m) resolve(m[1]); };
  tunnel.stdout.on('data', read);
  tunnel.stderr.on('data', read);
});

// Le bot est prévenu tout de suite, puis chaque minute (sans nouvelles pendant 2 min 30, il débranche le PC)
let online = null;
async function announce() {
  const ok = await fetch(`${bot}/api/audio-pc`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-key': key }, body: JSON.stringify({ host, password }) })
    .then((r) => r.ok, () => false);
  if (ok !== online) console.log(ok ? `✅ Musique en ligne (${host}). Laisse cette fenêtre ouverte.` : '⚠️  Le bot ne répond pas (Render endormi ?), nouvel essai dans 1 min…');
  online = ok;
}
await announce();
setInterval(announce, 60_000);
