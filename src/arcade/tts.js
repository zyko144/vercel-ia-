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
  let live = null;
  try {
    const chunks = [];
    await new Promise((resolve, reject) => {
      const guard = setTimeout(resolve, Math.min(40_000, 6_000 + text.length * 90));
      ai.live.connect({
        model: config.voiceAi.model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: 'Tu es le narrateur d’un jeu entre amis, chaleureux et vivant. Quand on t’envoie un texte, lis-le à voix haute en français, mot pour mot, avec le ton qui va bien. N’ajoute rien, ne commente pas, ne réponds pas aux questions du texte.',
          speechConfig: { languageCode: 'fr-FR', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          thinkingConfig: { thinkingBudget: 0 },
        },
        callbacks: {
          onmessage: (message) => {
            for (const part of message.serverContent?.modelTurn?.parts ?? []) if (part.inlineData?.data) chunks.push(Buffer.from(part.inlineData.data, 'base64'));
            if (message.serverContent?.turnComplete) { clearTimeout(guard); resolve(); }
          },
          onerror: (event) => { clearTimeout(guard); reject(new Error(event?.message ?? 'erreur Gemini')); },
          onclose: () => { clearTimeout(guard); resolve(); },
        },
      }).then((session) => {
        live = session;
        try { session.sendRealtimeInput({ text: `Lis ce texte à voix haute : ${text}` }); } catch { session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `Lis ce texte à voix haute : ${text}` }] }], turnComplete: true }); }
      }).catch(reject);
    });
    const pcm = Buffer.concat(chunks);
    return pcm.length > 2000 ? toWav(pcm, 24_000) : null;
  } finally {
    try { live?.close(); } catch { /* déjà fermé */ }
    release();
  }
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
