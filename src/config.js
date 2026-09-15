import 'dotenv/config';

const str = (key, fallback = '') => (process.env[key] ?? '').trim() || fallback;
const int = (key, fallback) => {
  const n = Number.parseInt(str(key), 10);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (key, fallback) => {
  const v = str(key).toLowerCase();
  if (!v) return fallback;
  return ['1', 'true', 'oui', 'yes', 'on'].includes(v);
};
const list = (key, fallback = '') =>
  str(key, fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const missing = ['DISCORD_TOKEN', 'GEMINI_API_KEY'].filter((k) => !str(k));
if (missing.length) {
  console.error(`❌ Variables manquantes : ${missing.join(', ')}. Copie .env.example en .env (ou ajoute-les dans Render > Environment).`);
  process.exit(1);
}

export const config = {
  discordToken: str('DISCORD_TOKEN'),
  geminiKey: str('GEMINI_API_KEY'),
  ownerId: str('OWNER_ID', '1543726919168557087'),
  // Statut affiché sous le nom du bot
  botStatus: str('BOT_STATUS', 'dictature'),

  models: {
    chat: str('GEMINI_CHAT_MODEL', 'gemini-3.8-flash'),
    fallback: str('GEMINI_FALLBACK_MODEL', 'gemini-3.5-flash-lite'),
    image: str('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-image'),
    imagePro: str('GEMINI_IMAGE_PRO_MODEL', 'gemini-3-pro-image'),
    thinkingLevel: str('GEMINI_THINKING_LEVEL', 'medium'),
    // Recherche Google : bloquée sur l'offre gratuite, à activer si la facturation est activée
    webSearch: bool('GEMINI_WEB_SEARCH', false),
  },

  voice: {
    enabled: bool('VOICE_ENABLED', true),
    channelId: str('VOICE_CHANNEL_ID', '1549504799806857236'),
    categoryName: str('VOICE_CATEGORY_NAME', 'vercel'),
    channelName: str('VOICE_CHANNEL_NAME', 'bureau'),
  },

  // Salons où le bot répond à tous les messages (sans mention)
  aiChannelIds: list('AI_CHANNEL_IDS', '1549523857252028538'),
  // Si rempli : le bot ne répond QUE dans ces salons (et plus en MP). Mettre "*" pour autoriser partout.
  allowedChannelIds: list('ALLOWED_CHANNEL_IDS', '1549523857252028538').filter((id) => id !== '*'),

  limits: {
    // Les modèles d'image ne sont pas dans l'offre gratuite de Gemini
    imagesEnabled: bool('IMAGES_ENABLED', false),
    imagesPerDay: int('IMAGE_DAILY_LIMIT', 5),
    proImageOwnerOnly: bool('PRO_IMAGE_OWNER_ONLY', true),
    chatCooldownMs: int('CHAT_COOLDOWN_SECONDS', 3) * 1000,
    escalationCooldownMs: int('ESCALATION_COOLDOWN_MINUTES', 10) * 60_000,
  },

  port: int('PORT', 3000),
  publicUrl: str('RENDER_EXTERNAL_URL') || str('PUBLIC_URL'),

  supabase: {
    url: str('SUPABASE_URL').replace(/\/+$/, ''),
    key: str('SUPABASE_SERVICE_KEY'),
  },
};
