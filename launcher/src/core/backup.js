// Sauvegarde en ligne : ce qui part sur le compte (réglages, collections, favoris, temps suivi par le launcher,
// historique, serveurs FiveM) et comment on le fusionne au retour sans rien perdre.
export const BACKUP_KEYS = ['settings', 'collections', 'items', 'names', 'time', 'timeBy', 'offSteam', 'days', 'fivemFavs', 'fivemSessions', 'fivemLogs', 'fivemNames', 'priceAlerts', 'sessions', 'crashes', 'loadTimes'];
// Réglages propres à ce PC : jamais copiés d'un PC à l'autre
const LOCAL_SETTINGS = ['autostart', 'lastAccount', 'skipAccount', 'steamAccount', 'epicAccount'];

/** Ce qu'on envoie (les caches d'images, chemins de jeux ajoutés à la main et secrets restent sur le PC). */
export function pickBackup(data) {
  const out = {};
  for (const k of BACKUP_KEYS) if (data[k] !== undefined) out[k] = data[k];
  if (out.settings) out.settings = Object.fromEntries(Object.entries(out.settings).filter(([k]) => !LOCAL_SETTINGS.includes(k)));
  if (out.items) {
    // Seulement les préférences (favori, masqué, nom, note…), pas les chemins de lancement de ce PC
    out.items = Object.fromEntries(Object.entries(out.items).map(([id, v]) => { const { launch, ...keep } = v ?? {}; return [id, keep]; }).filter(([, v]) => Object.keys(v).length));
  }
  return out;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
/** Fusion « le plus grand gagne » pour les compteurs (minutes, dates), récursive. */
function maxMerge(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
  if (isObj(a) && isObj(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in a ? maxMerge(a[k], v) : v;
    return out;
  }
  return a ?? b;
}

/** Restaure une sauvegarde dans les données locales : réglages/collections/favoris de la sauvegarde, compteurs au maximum. */
export function mergeBackup(local, remote) {
  if (!isObj(remote)) return local;
  const out = { ...local };
  if (isObj(remote.settings)) {
    const keep = Object.fromEntries(Object.entries(local.settings ?? {}).filter(([k]) => LOCAL_SETTINGS.includes(k)));
    out.settings = { ...(local.settings ?? {}), ...remote.settings, ...keep };
  }
  if (isObj(remote.collections)) out.collections = { ...(local.collections ?? {}), ...remote.collections };
  if (isObj(remote.items)) {
    out.items = { ...(local.items ?? {}) };
    for (const [id, v] of Object.entries(remote.items)) out.items[id] = { ...(out.items[id] ?? {}), ...v };
  }
  if (isObj(remote.names)) out.names = { ...(local.names ?? {}), ...remote.names };
  for (const k of ['time', 'timeBy', 'offSteam', 'days', 'fivemLogs', 'fivemNames']) if (isObj(remote[k])) out[k] = maxMerge(local[k] ?? {}, remote[k]);
  if (Array.isArray(remote.fivemFavs)) out.fivemFavs = [...new Set([...(local.fivemFavs ?? []), ...remote.fivemFavs])].slice(0, 30);
  if (Array.isArray(remote.fivemSessions)) out.fivemSessions = [...(local.fivemSessions ?? []), ...remote.fivemSessions];
  if (isObj(remote.priceAlerts)) out.priceAlerts = { ...remote.priceAlerts, ...(local.priceAlerts ?? {}) };
  // Journal des parties, plantages et temps de démarrage : réunis sans doublon
  if (Array.isArray(remote.sessions)) { const seen = new Set((local.sessions ?? []).map((x) => `${x.id}@${x.start}`)); out.sessions = [...(local.sessions ?? []), ...remote.sessions.filter((x) => x && !seen.has(`${x.id}@${x.start}`))].sort((a, b) => a.start - b.start).slice(-300); }
  for (const k of ['crashes', 'loadTimes']) {
    if (!isObj(remote[k])) continue;
    out[k] = { ...(local[k] ?? {}) };
    for (const [id, list] of Object.entries(remote[k])) { if (!Array.isArray(list)) continue; const seen = new Set((out[k][id] ?? []).map((x) => x.at)); out[k][id] = [...(out[k][id] ?? []), ...list.filter((x) => x && !seen.has(x.at))].sort((a, b) => a.at - b.at).slice(-20); }
  }
  return out;
}

/** Launcher « neuf » (rien de perso) : on peut restaurer sans demander. */
export const isFresh = (data) => !Object.keys(data.collections ?? {}).length && !Object.keys(data.timeBy ?? {}).length && !Object.values(data.items ?? {}).some((v) => v?.favorite || v?.hidden);
