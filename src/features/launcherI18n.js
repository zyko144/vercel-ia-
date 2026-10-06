// Anglais complet du launcher : chaque texte affiché est traduit une seule fois par l'IA, puis gardé pour tout le monde.
import { readFresh, writeNow } from '../storage.js';

let cache = null, saving = null;
const SCHEMA = { type: 'object', properties: { en: { type: 'array', items: { type: 'string' } } }, required: ['en'] };

export async function translate(texts, ai = null) {
  cache ??= (await readFresh('launcher-i18n-en')) ?? {};
  const list = [...new Set((Array.isArray(texts) ? texts : []).map((t) => String(t).slice(0, 400)).filter((t) => /\p{L}/u.test(t)))].slice(0, 60);
  const missing = list.filter((t) => !(t in cache));
  if (missing.length) {
    const chatJson = ai ?? (await import('../ai/gemini.js')).chatJson;
    const r = await chatJson({
      system: 'You translate the French user interface of "History Launcher", a PC game launcher, into natural, concise UK/US English as a professional localiser would. Keep game titles, brand names, product names (History, Opti Pro, Premium, Steam, Epic, Discord, Windows, NVIDIA…), keyboard keys, placeholders like {0} and emoji exactly as they are. Keep the same capitalisation style and punctuation. Never add explanations.',
      prompt: `Translate each string. Return {"en": [...]} with exactly ${missing.length} items in the same order.\n${JSON.stringify(missing)}`,
      schema: SCHEMA, thinking: 'low', tag: 'traduction',
    });
    if (!Array.isArray(r?.en) || r.en.length !== missing.length) throw new Error('traduction incomplète');
    missing.forEach((t, i) => { cache[t] = String(r.en[i] ?? t).slice(0, 600); });
    clearTimeout(saving); saving = setTimeout(() => writeNow('launcher-i18n-en', cache).catch(() => {}), 5000);
  }
  return Object.fromEntries(list.map((t) => [t, cache[t]]));
}
