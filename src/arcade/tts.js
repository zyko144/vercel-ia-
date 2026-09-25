// La voix de l'arcade : l'IA vocale (Gemini Live, comme le narrateur du loup-garou) lit un texte,
// et on renvoie le son en WAV pour que le navigateur le joue. Les textes déjà lus restent en cache.
import { createHash } from 'node:crypto';
import { GoogleGenAI, Modality } from '@google/genai';
import { config } from '../config.js';

function toWav(pcm, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const ai = new GoogleGenAI({ apiKey: config.geminiKey });
const cache = new Map(); // empreinte du texte -> WAV
const pending = new Map(); // empreinte -> Promise (deux joueurs demandent le même texte)
const MAX_PARALLEL = 3;
let running = 0;
const waiting = [];

const slot = () => (running < MAX_PARALLEL ? Promise.resolve() : new Promise((resolve) => waiting.push(resolve)));
const release = () => { running -= 1; waiting.shift()?.(); };

async function synthesize(text, voice) {
  await slot();
  running += 1;
  let conn = null;
  try {
    conn = await take(voice);
    const chunks = [];
    await new Promise((resolve, reject) => {
      const guard = setTimeout(resolve, Math.min(40_000, 6_000 + text.length * 90));
      conn.on = {
        message: (message) => {
          for (const part of message.serverContent?.modelTurn?.parts ?? []) if (part.inlineData?.data) chunks.push(Buffer.from(part.inlineData.data, 'base64'));
          if (message.serverContent?.turnComplete) { clearTimeout(guard); resolve(); }
        },
        error: (err) => { clearTimeout(guard); reject(err); },
        close: () => { clearTimeout(guard); resolve(); },
      };
      const say = `Lis ce texte à voix haute : ${text}`;
      try { conn.session.sendRealtimeInput({ text: say }); } catch { conn.session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: say }] }], turnComplete: true }); }
    });
    const pcm = Buffer.concat(chunks);
    return pcm.length > 2000 ? toWav(pcm, 24_000) : null;
  } finally {
    try { conn?.session.close(); } catch { /* déjà fermé */ }
    release();
  }
}

// Une connexion toujours prête pendant qu'on joue : on gagne le temps d'ouverture (souvent 1 s) à chaque phrase.
const SPARE_MS = 120_000;
const spares = new Map(); // voix -> { ready: Promise<conn>, at, timer }
function open(voice) {
  const conn = { session: null, on: null };
  const ready = ai.live.connect({
    model: config.voiceAi.model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: 'Tu es le narrateur d’un jeu entre amis, chaleureux et vivant. Quand on t’envoie un texte, lis-le à voix haute en français, mot pour mot, avec le ton qui va bien. N’ajoute rien, ne commente pas, ne réponds pas aux questions du texte.',
      speechConfig: { languageCode: 'fr-FR', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      thinkingConfig: { thinkingBudget: 0 },
    },
    callbacks: {
      onmessage: (m) => conn.on?.message(m),
      onerror: (e) => conn.on?.error(new Error(e?.message ?? 'erreur Gemini')),
      onclose: () => { conn.closed = true; conn.on?.close(); },
    },
  }).then((session) => { conn.session = session; return conn; });
  return ready;
}
async function take(voice) {
  const spare = spares.get(voice);
  spares.delete(voice);
  if (spare) clearTimeout(spare.timer);
  let conn = spare ? await spare.ready.catch(() => null) : null;
  if (!conn || conn.closed) conn = await open(voice);
  // La prochaine connexion s'ouvre déjà, et se ferme si personne ne parle pendant 2 minutes
  const next = { ready: open(voice), at: Date.now() };
  next.ready.catch(() => spares.get(voice) === next && spares.delete(voice));
  next.timer = setTimeout(() => { if (spares.get(voice) === next) { spares.delete(voice); next.ready.then((c) => c.session.close()).catch(() => {}); } }, SPARE_MS);
  next.timer.unref?.();
  spares.set(voice, next);
  return conn;
}

/** Le texte lu à voix haute (WAV), ou null si l'IA vocale ne répond pas. */
export async function speech(text, voice = 'Charon') {
  const clean = String(text ?? '').replace(/\*\*|~~/g, '').replace(/\s+/g, ' ').trim().slice(0, 700);
  if (!clean) return null;
  const key = createHash('sha1').update(`${voice}|${clean}`).digest('hex');
  if (cache.has(key)) return cache.get(key);
  if (!pending.has(key)) {
    pending.set(key, synthesize(clean, voice).catch((err) => { console.warn('[arcade] voix :', err.message); return null; }).finally(() => pending.delete(key)));
  }
  const wav = await pending.get(key);
  if (wav) {
    cache.set(key, wav);
    if (cache.size > 150) cache.delete(cache.keys().next().value);
  }
  return wav;
}

// Bancs d'essai
export const _test = { ai, spares };
