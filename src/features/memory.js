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
