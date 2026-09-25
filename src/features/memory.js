// Mémoire courte des conversations, une par membre (gardée en RAM).
// Pour économiser : seulement les derniers échanges, et chaque message gardé est raccourci
// (le début suffit pour suivre la conversation ; la réponse complète a déjà été envoyée).
const MAX_TURNS = 10;
const KEEP_CHARS = { user: 800, model: 600 };
const shorten = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);
const TTL_MS = 45 * 60_000;
const conversations = new Map();

export function conversationKey({ userId }) {
  return `u:${userId}`;
}

export function getHistory(key) {
  const convo = conversations.get(key);
  if (!convo || Date.now() - convo.updatedAt > TTL_MS) {
    conversations.delete(key);
    return [];
  }
  return convo.turns;
}

export function remember(key, userText, modelText) {
  const turns = [...getHistory(key), { role: 'user', text: shorten(String(userText), KEEP_CHARS.user) }, { role: 'model', text: shorten(String(modelText), KEEP_CHARS.model) }];
  conversations.set(key, { turns: turns.slice(-MAX_TURNS), updatedAt: Date.now() });
}

export function forget(key) {
  return conversations.delete(key);
}

export function memoryStats() {
  return conversations.size;
}

/**
 * Les conversations en mémoire, pour le tableau de bord : qui, combien d'échanges, quand.
 * Jamais le contenu des messages.
 */
export function listConversations() {
  const now = Date.now();
  const list = [];
  for (const [key, convo] of conversations) {
    if (now - convo.updatedAt > TTL_MS) continue;
    list.push({ key, userId: key.startsWith('u:') ? key.slice(2) : null, exchanges: Math.ceil(convo.turns.length / 2), updatedAt: convo.updatedAt, expiresAt: convo.updatedAt + TTL_MS });
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Efface toutes les conversations en mémoire. Renvoie combien il y en avait. */
export function forgetAll() {
  const count = conversations.size;
  conversations.clear();
  return count;
}
