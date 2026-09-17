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
// DISCORD_TOKEN peut contenir 2 tokens séparés par ";" : le bot principal, puis le bot de l'IA vocale
const discordTokens = str('DISCORD_TOKEN').split(/[;,\s]+/).filter(Boolean);

// Token du bot de l'IA vocale : VOICE_BOT_TOKEN, 2e token de DISCORD_TOKEN,
// ou n'importe quelle variable qui contient un autre token de bot (peu importe son nom)
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}$/;
function findVoiceToken() {
  for (const name of ['VOICE_BOT_TOKEN', 'DISCORD_VOICE_TOKEN']) if (str(name)) return { token: str(name), source: name };
  if (discordTokens[1]) return { token: discordTokens[1], source: 'DISCORD_TOKEN (2e token)' };
  for (const [name, value] of Object.entries(process.env)) {
    const candidate = (value ?? '').trim();
    if (TOKEN_SHAPE.test(candidate) && candidate !== discordTokens[0]) return { token: candidate, source: name };
  }
  return { token: '', source: null };
}
const voiceToken = findVoiceToken();
if (missing.length) {
  console.error(`❌ Variables manquantes : ${missing.join(', ')}. Copie .env.example en .env (ou ajoute-les dans Render > Environment).`);
  process.exit(1);
}

// Serveurs audio publics gratuits (testés le 16/09/2026), essayés dans cet ordre
const DEFAULT_LAVALINK_NODES = [
  { name: 'kasawa', host: 'lava2.kasawa.pro', port: 2334, password: 'youshallnotpass', secure: false },
  { name: 'serenetia', host: 'lavalinkv4.serenetia.com', port: 443, password: 'https://seretia.link/discord', secure: true },
  { name: 'nodelink', host: 'nodelink.triniumhost.com', port: 443, password: 'free', secure: true },
  { name: 'trinium', host: 'lavalink-v4.triniumhost.com', port: 443, password: 'free', secure: true },
];

function parseNodes(raw) {
  if (!raw) return DEFAULT_LAVALINK_NODES;
  try {
    const nodes = JSON.parse(raw);
    return Array.isArray(nodes) && nodes.length ? nodes : DEFAULT_LAVALINK_NODES;
  } catch {
    console.error('❌ LAVALINK_NODES doit être du JSON : [{"host":"...","port":443,"password":"...","secure":true}]');
    return DEFAULT_LAVALINK_NODES;
  }
}

export const config = {
  discordToken: discordTokens[0] ?? '',
  geminiKey: str('GEMINI_API_KEY'),

  // IA vocale (2e bot qui écoute et répond à voix haute dans le vocal du bot)
  voiceAi: {
    token: voiceToken.token,
    tokenSource: voiceToken.source,
    model: str('GEMINI_VOICE_MODEL', 'gemini-3.8-live'),
    voice: str('GEMINI_VOICE_NAME', 'Puck'),
    idleSeconds: int('VOICE_AI_IDLE_SECONDS', 45),
    // Salon vocal de l'IA vocale (le bot musique, lui, reste dans VOICE_CHANNEL_ID)
    channelId: str('VOICE_AI_CHANNEL_ID', '1550100131569868871'),
    // Seuls ces comptes peuvent utiliser /vocal (vide = tout le monde)
    allowedUsers: list('VOICE_AI_USERS', '855176142096039997,734865069904756766,923551925113323542'),
  },
  ownerId: str('OWNER_ID', '1543726919168557087'),
  // Membres protégés contre les insultes, en plus du chef (warn puis exclusion 1 min)
  protectedUsers: list('PROTECTED_USERS', '923551925113323542'),
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
    // Le bot ne va jamais dans un autre vocal que le sien (musique et mini-jeux compris), 24h/24
    lockHome: bool('VOICE_LOCK_HOME', true),
    // Le bot suit le chef dans chaque vocal (seulement si le vocal n'est pas verrouillé)
    followOwner: bool('VOICE_FOLLOW_OWNER', false),
  },

  // Salons où le bot répond à tous les messages (sans mention)
  aiChannelIds: list('AI_CHANNEL_IDS', '1549523857252028538'),
  // Vide = le bot répond partout. Rempli = il ne répond QUE dans ces salons.
  allowedChannelIds: list('ALLOWED_CHANNEL_IDS').filter((id) => id !== '*'),
  // Réponses visibles seulement par la personne (fil privé + messages éphémères)
  privateReplies: bool('PRIVATE_REPLIES', true),
  // Salons où écrire un nom de son l'ajoute direct à la file (jukebox)
  jukeboxChannelIds: list('JUKEBOX_CHANNEL_IDS', '1549658865002487839'),
  // Salon où arrivent les signalements (vide = MP au chef)
  staffChannelId: str('STAFF_CHANNEL_ID'),

  limits: {
    // Les modèles d'image ne sont pas dans l'offre gratuite de Gemini
    imagesEnabled: bool('IMAGES_ENABLED', false),
    imagesPerDay: int('IMAGE_DAILY_LIMIT', 5),
    proImageOwnerOnly: bool('PRO_IMAGE_OWNER_ONLY', true),
    chatCooldownMs: int('CHAT_COOLDOWN_SECONDS', 3) * 1000,
    escalationCooldownMs: int('ESCALATION_COOLDOWN_MINUTES', 10) * 60_000,
  },

  music: {
    // auto = Lavalink si dispo, sinon lecteur local · lavalink = uniquement Lavalink · local = uniquement local
    engine: str('MUSIC_ENGINE', 'auto'),
    lavalinkNodes: parseNodes(str('LAVALINK_NODES')),
    // Rafraîchissement de la barre de progression (3 s minimum : Discord limite les modifications)
    panelRefreshMs: Math.max(3, int('MUSIC_PANEL_REFRESH_SECONDS', 4)) * 1000,
    // Décalage des paroles : négatif = elles s'affichent plus tard (compense le retard du son)
    lyricsOffsetMs: int('LYRICS_OFFSET_MS', -900),
    // Salon où se déroulent les blind tests (vide = là où la commande est tapée)
    blindtestChannelId: str('BLINDTEST_CHANNEL_ID', '1549658986935222363'),
  },

  port: int('PORT', 3000),
  publicUrl: str('RENDER_EXTERNAL_URL') || str('PUBLIC_URL'),

  supabase: {
    url: str('SUPABASE_URL').replace(/\/+$/, ''),
    key: str('SUPABASE_SERVICE_KEY'),
  },
};
