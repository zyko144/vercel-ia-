// Images et fiches des jeux qui ne viennent ni de Steam ni d'Epic (Riot, Ubisoft, EA, applis…) :
//  1. SteamGridDB (si l'utilisateur a mis sa clé gratuite) : jaquette, grand fond, logo, icône pour presque tout ;
//  2. sinon le magasin Steam : beaucoup de jeux d'autres launchers y sont aussi (même nom) → images officielles Steam.
// Tout est gardé en cache 14 jours : rien n'est redemandé à chaque ouverture.
import { steamArt, steamDetails, steamStoreAssets } from './steam.js';
import { norm } from './sort.js';
import { epicStoreArt } from './epic.js';

const DAY = 86_400_000;
export const CACHE_DAYS = 14;
const ART_V = 5; // change à chaque correction de la recherche d'images : les anciennes recherches sont refaites
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

/** Images officielles actuelles d'un jeu Steam (API du magasin), sinon les anciennes adresses. */
export async function steamImages(appid, fetchImpl = fetch) {
  const found = (await steamStoreAssets([appid], fetchImpl))[String(appid)] ?? {};
  const clean = Object.fromEntries(Object.entries(found).filter(([, v]) => v));
  return { ...steamArt(appid), ...clean };
}

// Jeux renommés sur Steam ou installés par un autre launcher (Ubisoft, Rockstar, FiveM…) : numéro Steam connu,
// pour avoir leurs vraies images même quand le nom ne correspond plus (« Rainbow Six Siege X », « GTA V Enhanced »…)
const KNOWN_STEAM = [
  [/rainbowsix(siege)?(x)?$/, '359550'], [/^(grandtheftauto(v|5)|gta(v|5))(enhanced|legacy)?$/, '271590'], [/^fivem$/, '271590'], [/^redm$/, '1174180'],
  [/^counterstrike2$|^cs2$/, '730'], [/^counterstrikeglobaloffensive$|^csgo$/, '730'], [/^left4dead2$|^l4d2$/, '550'], [/^left4dead$/, '500'],
  [/^reddeadredemption2$|^rdr2$/, '1174180'], [/^apexlegends$/, '1172470'], [/^rocketleague$/, '252950'], [/^dota2$/, '570'], [/^teamfortress2$/, '440'],
  [/^pubg(battlegrounds)?$|^playerunknownsbattlegrounds$/, '578080'], [/^callofduty(hq|modernwarfare(ii|iii)?|blackops(6|7)?)?$/, '1938090'], [/^fallguys$/, '1097150'],
  [/^rust$/, '252490'], [/^garrysmod$/, '4000'], [/^eldenring$/, '1245620'], [/^cyberpunk2077$/, '1091500'], [/^thefinals$|^finals$/, '2073850'],
  [/^marvelrivals$/, '2767030'], [/^helldivers2$/, '553850'], [/^overwatch2?$/, '2357570'], [/^destiny2$/, '1085660'], [/^warframe$/, '230410'],
];
export function knownSteamId(name) {
  const n = norm(name).replace(/^tomclancys/, '');
  return KNOWN_STEAM.find(([re]) => re.test(n))?.[1] ?? null;
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
  const fresh = cache && cache.v === ART_V && now - cache.at < CACHE_DAYS * DAY && (cache.gridKey ?? null) === (gridKey ? 'oui' : null);
  if (fresh && (!details || cache.details || item.kind !== 'game')) return cache;
  if (fresh && details) {
    const id = cache.steamId ?? item.steamId;
    return { ...cache, details: id ? await steamDetails(id, fetchImpl) : null };
  }
  const out = { v: ART_V, at: now, gridKey: gridKey ? 'oui' : null, art: {}, details: null, steamId: item.steamId ?? null };
  const local = item.localArt ?? {};
  const hasArt = Boolean(item.art?.cover || item.art?.hero || (local.cover && local.hero));

  // Jeu Steam sans images sur le PC : adresses officielles actuelles du magasin
  if (item.source === 'steam' && item.steamId && !(local.cover && local.hero && local.logo)) {
    out.art = await steamImages(item.steamId, fetchImpl);
  } else if (!hasArt || item.kind !== 'game') {
    const grid = await gridArt(item.name, gridKey, fetchImpl);
    if (grid) out.art = grid;
    if (!grid?.cover && item.kind === 'game' && !out.steamId) {
      out.steamId = knownSteamId(item.name) ?? await steamMatch(item.name, fetchImpl);
      if (out.steamId) out.art = { ...await steamImages(out.steamId, fetchImpl), ...Object.fromEntries(Object.entries(out.art).filter(([, v]) => v)) };
    }
  }
  // Jeux Epic (Fortnite…) : ce qui manque (logo, grand fond, jaquette) vient du magasin Epic, sinon de Steam
  if (item.kind === 'game' && item.source === 'epic') {
    const ok = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v));
    const have = () => ({ ...ok(item.art), ...ok(out.art) });
    if (!have().logo || !have().hero || !have().cover) {
      const e = await epicStoreArt(item.name, sameName, fetchImpl);
      if (e) out.art = { ...ok(e), ...ok(out.art) };
    }
    if (!have().logo) {
      out.steamId ??= knownSteamId(item.name) ?? await steamMatch(item.name, fetchImpl);
      if (out.steamId) out.art = { ...ok(await steamImages(out.steamId, fetchImpl)), ...ok(out.art) };
    }
  }
  // Magasin injoignable : on réessaie dans 6 h au lieu d'attendre la fin du cache
  if (item.source === 'epic' && !Object.values({ ...item.art, ...out.art }).some(Boolean)) out.at = now - CACHE_DAYS * DAY + 6 * 3600_000;
  if (details && out.steamId && item.kind === 'game') out.details = await steamDetails(out.steamId, fetchImpl);
  return out;
}
