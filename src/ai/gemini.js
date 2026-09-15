import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

const ai = new GoogleGenAI({ apiKey: config.geminiKey });

const THINKING_ORDER = ['minimal', 'low', 'medium', 'high'];

/** Garde le niveau de réflexion le plus élevé entre la config et la demande. */
function thinkingLevel(requested) {
  const base = config.models.thinkingLevel;
  if (!requested) return base;
  return THINKING_ORDER.indexOf(requested) > THINKING_ORDER.indexOf(base) ? requested : base;
}

const SEARCH_RETRY_MS = 60 * 60_000;
let searchBlockedUntil = 0;

/** La recherche Google est-elle utilisable en ce moment ? */
export function webSearchAvailable() {
  return config.models.webSearch && Date.now() >= searchBlockedUntil;
}

function webTools() {
  return webSearchAvailable() ? [{ type: 'google_search' }, { type: 'url_context' }] : [{ type: 'url_context' }];
}

const statusOf = (err) => err?.status ?? err?.statusCode ?? 0;
const isRetryable = (err) => [429, 500, 502, 503, 504].includes(statusOf(err));

/** Message d'erreur lisible renvoyé par l'API Google (pour les logs). */
export function errorDetail(err) {
  const raw = typeof err?.body === 'string' ? err.body : '';
  try {
    const parsed = JSON.parse(raw);
    const e = (Array.isArray(parsed) ? parsed[0] : parsed)?.error;
    if (e?.message) return `${statusOf(err)} ${e.status ?? ''} ${e.message}`.trim();
  } catch { /* corps pas en JSON */ }
  return err?.message ?? String(err);
}

const isConfigError = (err) => /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|billing|free tier/i.test(err?.body ?? '');

export function describeError(err) {
  const status = statusOf(err);
  const body = err?.body ?? '';
  if (/API_KEY_INVALID|API key not valid/i.test(body) || status === 401) {
    return 'La clé API Gemini est invalide. Le chef doit vérifier la config.';
  }
  if (/billing|free tier|FAILED_PRECONDITION/i.test(body)) {
    return "Cette fonction demande d'activer la facturation sur le projet Google AI Studio (les images ne sont pas dans l'offre gratuite). Le chef doit s'en occuper.";
  }
  if (status === 429) return "jsuis un peu surchargé là (trop de demandes d'un coup), réessaie dans 1 min stp 🙏";
  if (status === 404) return "Le modèle Gemini configuré n'existe pas ou plus. Le chef doit mettre à jour le nom du modèle.";
  if (status === 403) return "La clé API Gemini n'a pas accès à ce modèle. Le chef doit vérifier la config.";
  if (status === 400) return 'Gemini a refusé la demande (contenu bloqué ou fichier pas supporté).';
  if (status >= 500) return 'Les serveurs de Gemini ont un souci en ce moment, réessaie dans quelques instants.';
  return "Une erreur inattendue s'est produite, réessaie stp.";
}

function textFromTurn(turn) {
  return { type: 'text', text: turn.text };
}

// Historique = alternance user_input / model_output
function buildSteps(history, userContent) {
  const steps = history.map((turn) => ({
    type: turn.role === 'model' ? 'model_output' : 'user_input',
    content: [textFromTurn(turn)],
  }));
  steps.push({ type: 'user_input', content: userContent });
  return steps;
}

// Solution de secours : tout l'historique aplati dans un seul message
function buildFlatInput(history, userContent) {
  if (!history.length) return userContent;
  const transcript = history
    .map((t) => (t.role === 'model' ? `Toi (le bot) : ${t.text}` : t.text))
    .join('\n');
  return [
    { type: 'text', text: `Conversation récente (contexte) :\n${transcript}\n\n--- Nouveau message ---` },
    ...userContent,
  ];
}

export function extractSources(interaction) {
  const sources = new Map();
  for (const step of interaction.steps ?? []) {
    if (step.type !== 'model_output') continue;
    for (const block of step.content ?? []) {
      if (block.type !== 'text') continue;
      for (const a of block.annotations ?? []) {
        if (a.type === 'url_citation' && a.url && !sources.has(a.url)) {
          sources.set(a.url, a.title || hostname(a.url));
        }
      }
    }
  }
  return [...sources].map(([url, title]) => ({ url, title }));
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'lien';
  }
}

/**
 * Discussion avec Gemini.
 * @param {object} opts
 * @param {Array<{role:'user'|'model', text:string}>} [opts.history]
 * @param {Array<object>} opts.content  blocs Interactions API (text / image / document)
 * @param {string} opts.system
 * @param {boolean} [opts.web] active Google Search + lecture d'URL
 * @param {string} [opts.thinking] minimal | low | medium | high
 * @param {object} [opts.responseFormat]
 */
export async function chat({ history = [], content, system, web = true, thinking, responseFormat }) {
  const tools = web ? webTools() : null;
  const base = {
    system_instruction: system,
    generation_config: { thinking_level: thinkingLevel(thinking) },
    store: false,
    ...(tools ? { tools } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };

  const attempt = (model, input) => ai.interactions.create({ ...base, model, input });

  let interaction;
  try {
    interaction = await attempt(config.models.chat, buildSteps(history, content));
  } catch (err) {
    if (statusOf(err) === 429 && tools?.some((t) => t.type === 'google_search')) {
      // Offre gratuite : la recherche Google peut avoir un quota à 0 -> on continue sans elle
      searchBlockedUntil = Date.now() + SEARCH_RETRY_MS;
      console.warn('[gemini] Recherche Google refusée (quota), on continue sans pendant 1 h');
      return chat({ history, content, system, web, thinking, responseFormat });
    }
    if (statusOf(err) === 400 && history.length && !isConfigError(err)) {
      interaction = await attempt(config.models.chat, buildFlatInput(history, content));
    } else if (isRetryable(err) && config.models.fallback && config.models.fallback !== config.models.chat) {
      console.warn(`[gemini] ${config.models.chat} indispo (${statusOf(err)}), bascule sur ${config.models.fallback}`);
      interaction = await attempt(config.models.fallback, buildFlatInput(history, content));
    } else {
      throw err;
    }
  }

  return {
    text: (interaction.output_text ?? '').trim(),
    sources: extractSources(interaction),
  };
}

export async function chatJson({ prompt, system, schema, thinking }) {
  const { text } = await chat({
    content: [{ type: 'text', text: prompt }],
    system,
    web: false,
    thinking,
    responseFormat: { type: 'text', mime_type: 'application/json', schema },
  });
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
  return JSON.parse(cleaned);
}

/**
 * Génère ou modifie une image (Nano Banana).
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {Array<{mimeType:string, data:string}>} [opts.images] images source en base64
 * @param {string} [opts.aspectRatio]
 * @param {boolean} [opts.pro] utilise Nano Banana Pro
 */
export async function generateImage({ prompt, images = [], aspectRatio, pro = false }) {
  const input = images.length
    ? [{ type: 'text', text: prompt }, ...images.map((img) => ({ type: 'image', mime_type: img.mimeType, data: img.data }))]
    : prompt;

  const interaction = await ai.interactions.create({
    model: pro ? config.models.imagePro : config.models.image,
    input,
    store: false,
    response_format: {
      type: 'image',
      mime_type: 'image/png',
      image_size: pro ? '2K' : '1K',
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    },
  });

  const out = interaction.output_image;
  let buffer = null;
  if (out?.data) {
    buffer = Buffer.from(out.data, 'base64');
  } else if (out?.uri) {
    const res = await fetch(out.uri, { headers: { 'x-goog-api-key': config.geminiKey } });
    if (res.ok) buffer = Buffer.from(await res.arrayBuffer());
  }

  return {
    buffer,
    mimeType: out?.mime_type ?? 'image/png',
    text: (interaction.output_text ?? '').trim(),
  };
}
