export const HOME_BLOCKS = { hero: 'Jeu à la une', pins: 'Mes jeux épinglés', actions: 'Mes raccourcis', top: 'Les plus joués', rediscover: 'À redécouvrir', updates: 'Mises à jour', recommendations: 'Recommandations', news: 'Actualités', deals: 'Promotions', free: 'Jeux gratuits' };
export const HOME_ACTIONS = { jeux: 'Bibliothèque', favoris: 'Favoris', amis: 'Amis', pc: 'Mon PC', optimisation: 'Optimisation', stats: 'Statistiques' };
const unique = (list, valid, max) => [...new Set((Array.isArray(list) ? list : []).filter(valid))].slice(0, max);
export function cleanHome(value = {}) {
  const order = unique(value?.order, (id) => Object.hasOwn(HOME_BLOCKS, id), 10);
  return {
    order: [...order, ...Object.keys(HOME_BLOCKS).filter((id) => !order.includes(id))],
    hidden: unique(value?.hidden, (id) => Object.hasOwn(HOME_BLOCKS, id), 10),
    pins: unique(value?.pins, validGameId, 12),
    actions: unique(value?.actions ?? ['jeux', 'amis', 'optimisation'], (id) => Object.hasOwn(HOME_ACTIONS, id), 6),
  };
}
export const validGameId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 200 && !/[\u0000-\u001f]/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);
export function cleanNotebook(value = {}, at = Date.now()) {
  const text = (key, max) => String(value?.[key] ?? '').replace(/\u0000/g, '').slice(0, max);
  const links = text('links', 4000).split('\n').map((line) => line.trim()).filter(Boolean);
  if (links.length > 12 || links.some((link) => { try { const u = new URL(link); return !['http:', 'https:'].includes(u.protocol) || !!u.username || !!u.password; } catch { return true; } })) throw new Error('Ajoute au maximum 12 liens http(s), un par ligne, sans identifiants.');
  return { notes: text('notes', 10000), build: text('build', 5000), commands: text('commands', 5000), links: links.join('\n'), updatedAt: Number.isFinite(at) ? at : 0 };
}
export function mergeNotebooks(local = {}, remote = {}) {
  const out = { ...local };
  for (const [id, value] of Object.entries(remote ?? {}).slice(0, 2000)) {
    if (!validGameId(id) || !value || typeof value !== 'object') continue;
    const at = Number(value.updatedAt);
    if (!Number.isFinite(at) || at > Date.now() + 60000 || (out[id]?.updatedAt ?? -1) > at) continue;
    try { out[id] = cleanNotebook(value, at); } catch { /* malformed backup entry */ }
  }
  return out;
}

// Coalesces concurrent reads, expires naturally and never caches a rejection.
export function cachedTask(task, ttl, now = Date.now) {
  let pending = null; let cached; let expires = 0;
  return (...args) => {
    if (pending) return pending;
    if (expires > now()) return Promise.resolve(cached);
    pending = Promise.resolve().then(() => task(...args)).then((value) => { cached = value; expires = now() + ttl; return value; }).finally(() => { pending = null; });
    return pending;
  };
}
