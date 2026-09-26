// Images et fiches des jeux qui ne viennent ni de Steam ni d'Epic (Riot, Ubisoft, EA, applis…) :
//  1. SteamGridDB (si l'utilisateur a mis sa clé gratuite) : jaquette, grand fond, logo, icône pour presque tout ;
//  2. sinon le magasin Steam : beaucoup de jeux d'autres launchers y sont aussi (même nom) → images officielles Steam.
// Tout est gardé en cache 14 jours : rien n'est redemandé à chaque ouverture.
import { steamArt, steamDetails } from './steam.js';
import { norm } from './sort.js';

const DAY = 86_400_000;
export const CACHE_DAYS = 14;
const json = (fetchImpl, url, opts = {}) => fetchImpl(url, { ...opts, signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

/**
 * Même jeu ? Noms identiques une fois simplifiés, sans les mots d'édition ni « Tom Clancy's »
 * (« Tom Clancy's Rainbow Six® Siege » = « Rainbow Six Siege »), mais « Portal » ≠ « Portal 2 » et ≠ « … Soundtrack ».
 */
const EDITION = /(gameoftheyear|goty|definitive|complete|deluxe|standard|ultimate|gold|premium|enhanced|anniversary)?edition$|goty$|tomclancys|^the/g;
export function sameName(a, b) {
  const clean = (n) => norm(n).replace(EDITION, '').replace(EDITION, '');
  const x = clean(a);
  const y = clean(b);
  return Boolean(x) && x === y;
}

/** Cherche le jeu sur le magasin Steam. */
export async function steamMatch(name, fetchImpl = fetch) {
  const data = await json(fetchImpl, `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=FR&l=french`);
  const hit = (data?.items ?? []).find((i) => i.type === 'app' && sameName(i.name, name));
  return hit ? String(hit.id) : null;
}

/** SteamGridDB : images de la communauté, pour les jeux et les applis. */
export async function gridArt(name, key, fetchImpl = fetch) {
  if (!key) return null;
  const api = (p) => json(fetchImpl, `https://www.steamgriddb.com/api/v2/${p}`, { headers: { Authorization: `Bearer ${key}` } });
  const found = await api(`search/autocomplete/${encodeURIComponent(name)}`);
  const game = (found?.data ?? []).find((g) => sameName(g.name, name)) ?? null;
  if (!game) return null;
  const [grids, heroes, logos, icons] = await Promise.all([
    api(`grids/game/${game.id}?dimensions=600x900&types=static`), api(`heroes/game/${game.id}?types=static`),
    api(`logos/game/${game.id}?types=static`), api(`icons/game/${game.id}?types=static`),
  ]);
  const first = (r) => r?.data?.[0]?.url ?? null;
  return { cover: first(grids), hero: first(heroes), header: null, logo: first(logos), icon: first(icons) };
}

/**
 * Complète un élément : images (si elles manquent) et fiche. `cache` est l'entrée gardée pour cet élément.
 * Renvoie la nouvelle entrée de cache, ou l'ancienne si elle est encore récente.
 */
export async function enrich(item, { cache = null, gridKey = null, fetchImpl = fetch, now = Date.now(), details = false } = {}) {
  const fresh = cache && now - cache.at < CACHE_DAYS * DAY && (cache.gridKey ?? null) === (gridKey ? 'oui' : null);
  if (fresh && (!details || cache.details || item.kind !== 'game')) return cache;
  if (fresh && details) {
    const id = cache.steamId ?? item.steamId;
    return { ...cache, details: id ? await steamDetails(id, fetchImpl) : null };
  }
  const out = { at: now, gridKey: gridKey ? 'oui' : null, art: {}, details: null, steamId: item.steamId ?? null };
  const hasArt = Boolean(item.art?.cover || item.art?.hero);

  if (!hasArt || item.kind !== 'game') {
    const grid = await gridArt(item.name, gridKey, fetchImpl);
    if (grid) out.art = grid;
    if (!grid?.cover && item.kind === 'game' && !out.steamId) {
      out.steamId = await steamMatch(item.name, fetchImpl);
      if (out.steamId) out.art = { ...steamArt(out.steamId), ...Object.fromEntries(Object.entries(out.art).filter(([, v]) => v)) };
    }
  }
  if (details && out.steamId && item.kind === 'game') out.details = await steamDetails(out.steamId, fetchImpl);
  return out;
}
