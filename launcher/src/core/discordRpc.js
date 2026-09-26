// Statut Discord (« Joue à … via History Launcher ») : dialogue local avec l'appli Discord du PC (canal discord-ipc).
// Aucune connexion à un compte : Discord affiche simplement l'activité envoyée par le launcher. Rien si Discord est fermé.
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

// Identifiant PUBLIC de l'application Discord du bot History (le même que dans le lien d'invitation du bot)
export const DISCORD_APP_ID = '1549507270193193071';

export function encodeFrame(op, obj) {
  const json = Buffer.from(JSON.stringify(obj));
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}
/** Découpe les messages reçus ; renvoie les messages complets et le reste en attente. */
export function decodeFrames(buf) {
  const frames = [];
  let pos = 0;
  while (buf.length - pos >= 8) {
    const len = buf.readInt32LE(pos + 4);
    if (len < 0 || len > 1 << 20) return { frames, rest: Buffer.alloc(0) };
    if (buf.length - pos - 8 < len) break;
    let data = null;
    try { data = JSON.parse(buf.toString('utf8', pos + 8, pos + 8 + len)); } catch { /* message illisible : ignoré */ }
    frames.push({ op: buf.readInt32LE(pos), data });
    pos += 8 + len;
  }
  return { frames, rest: buf.subarray(pos) };
}

/** L'activité affichée sur le profil Discord. */
export function activityFor(session, item = null) {
  if (!session?.name) return null;
  const cover = [item?.art?.cover, item?.art?.header, item?.art?.hero].find((u) => /^https:\/\//.test(u ?? ''));
  return {
    details: String(session.name).slice(0, 120), state: 'Via History Launcher',
    ...(session.start ? { timestamps: { start: Math.floor(session.start) } } : {}),
    assets: { ...(cover ? { large_image: cover, large_text: String(session.name).slice(0, 120) } : {}) },
    instance: false,
  };
}

const pipes = () => Array.from({ length: 10 }, (_, i) => (process.platform === 'win32' ? `\\\\?\\pipe\\discord-ipc-${i}` : path.join(process.env.XDG_RUNTIME_DIR ?? process.env.TMPDIR ?? '/tmp', `discord-ipc-${i}`)));

export class DiscordPresence {
  constructor(appId = DISCORD_APP_ID) { this.appId = appId; this.sock = null; this.ready = false; this.last = undefined; }

  async connect() {
    if (this.ready) return true;
    for (const p of pipes()) {
      const ok = await new Promise((resolve) => {
        const sock = net.connect(p);
        let buf = Buffer.alloc(0);
        const fail = () => { clearTimeout(timer); sock.destroy(); resolve(false); };
        const timer = setTimeout(fail, 4000);
        sock.once('error', fail);
        sock.once('connect', () => sock.write(encodeFrame(0, { v: 1, client_id: this.appId })));
        sock.on('data', (chunk) => {
          const { frames, rest } = decodeFrames(Buffer.concat([buf, chunk]));
          buf = rest;
          for (const f of frames) {
            if (f.op === 1 && f.data?.evt === 'READY' && !this.ready) {
              clearTimeout(timer);
              this.sock = sock; this.ready = true;
              sock.removeAllListeners('error');
              sock.on('error', () => this.reset());
              sock.on('close', () => this.reset());
              resolve(true);
            }
            if (f.op === 2) fail(); // Discord a refusé (application inconnue…)
          }
        });
      });
      if (ok) return true;
    }
    return false;
  }

  reset() { this.ready = false; this.last = undefined; this.sock?.destroy(); this.sock = null; }

  /** Envoie l'activité (null = efface). Ne renvoie rien si c'est la même qu'avant. */
  async set(activity) {
    const key = JSON.stringify(activity);
    if (key === this.last && this.ready) return true;
    if (!(await this.connect())) return false;
    this.sock.write(encodeFrame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: randomUUID() }));
    this.last = key;
    return true;
  }
}
