// IA du launcher passée par le serveur : l'appli n'a plus besoin de clé Gemini. Réservée aux comptes connectés,
// avec un plafond par compte (heure et jour) pour éviter tout abus.
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { allowAttempt } from '../dashboard/auth.js';
import { me } from './launcherAccounts.js';

let client = null;
const gen = () => (client ??= new GoogleGenAI({ apiKey: config.geminiKey }));
const MODEL = config.models?.chat || 'gemini-3.5-flash-lite';
const MAX_TEXT = 60_000;
const MAX_AUDIO = 1_900_000; // la requête entière est limitée à 2 Mo

/** Capture d'écran jointe (lire un message d'erreur) : PNG / JPEG / WebP en base64, 1,9 Mo max. */
const image = (i) => (i && /^image\/(png|jpeg|webp)$/.test(String(i.mime)) && /^[A-Za-z0-9+/=]{100,1900000}$/.test(String(i.data)) ? { type: 'image', mime_type: i.mime, data: i.data } : null);

export async function handleLauncherAi(req, res, { readJson, send }) {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  const compte = await me(token);
  if (!compte) return send(res, 401, { error: 'Connecte-toi à ton compte History pour utiliser l’IA.' });
  // L'IA fait partie du Premium (pack « History IA » ou « Pack Premium ») : la table Supabase « premium » décide
  const { premiumOf } = await import('./launcherPremium.js');
  if (!(await premiumOf(compte)).ia) return send(res, 402, { error: 'L’IA fait partie de History IA Premium : ouvre ⭐ Premium dans le launcher.', premium: 'ia' });
  if (!allowAttempt('launcher-ia-h', compte.id, 120, 60 * 60_000) || !allowAttempt('launcher-ia-j', compte.id, 600, 24 * 3_600_000)) {
    return send(res, 429, { error: 'Tu as beaucoup utilisé l’IA : réessaie un peu plus tard.' });
  }
  if (!config.geminiKey) return send(res, 503, { error: 'IA indisponible pour le moment.' });
  const b = await readJson(req);
  try {
    if (b.audio) {
      const data = String(b.audio.data ?? '');
      const mime = String(b.audio.mime ?? '');
      if (!data || data.length > MAX_AUDIO || !/^audio\/[\w.+-]{1,30}$/.test(mime)) return send(res, 400, { error: 'Enregistrement illisible.' });
      const r = await gen().interactions.create({
        model: MODEL, store: false, generation_config: { thinking_level: 'minimal' },
        system_instruction: 'Tu transcris exactement ce qui est dit, en français, sans rien ajouter.',
        input: [{ type: 'text', text: 'Transcris cet enregistrement.' }, { type: 'audio', mime_type: mime, data }],
      });
      return send(res, 200, { text: String(r.output_text ?? '').trim() });
    }
    const text = String(b.text ?? '').slice(0, MAX_TEXT);
    if (!text) return send(res, 400, { error: 'Demande vide.' });
    const r = await gen().interactions.create({
      model: MODEL, store: false, generation_config: { thinking_level: 'minimal' },
      system_instruction: String(b.system ?? '').slice(0, 12_000) || undefined, input: image(b.image) ? [{ type: 'text', text }, image(b.image)] : text,
      ...(b.web ? { tools: [{ type: 'google_search' }, { type: 'url_context' }] } : {}),
      ...(b.schema && typeof b.schema === 'object' ? { response_format: { type: 'text', mime_type: 'application/json', schema: b.schema } } : {}),
    });
    return send(res, 200, { text: String(r.output_text ?? '') });
  } catch (err) {
    return send(res, 502, { error: `IA injoignable (${String(err?.message ?? err).slice(0, 120)})` });
  }
}
