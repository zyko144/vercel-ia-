// Mémoire courte des conversations, une par membre (gardée en RAM).
const MAX_TURNS = 16;
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
  const turns = [...getHistory(key), { role: 'user', text: userText }, { role: 'model', text: modelText }];
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
