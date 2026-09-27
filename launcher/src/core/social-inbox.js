// A separate state object is kept per account by the Electron main process.
export function consumeInbox(sync, response) {
  const seen = new Set(sync.seen ?? []);
  const fresh = [];
  for (const item of response.items ?? []) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id); fresh.push(item);
  }
  sync.seen = [...seen].slice(-300);
  if (Number.isFinite(response.now)) sync.at = response.now;
  return fresh;
}

export function appendNotification(history, card, now = Date.now()) {
  if (!card || history.some((n) => n.id === card.id)) return false;
  history.unshift({ ...card, at: card.at ?? now, read: false });
  history.splice(150);
  return true;
}

export function markNotificationsRead(history, selector) {
  for (const n of history) {
    if (!selector || n.id === selector || (typeof selector === 'object' && n.kind === 'msg' && n.from === selector.from)) n.read = true;
  }
  return history;
}
