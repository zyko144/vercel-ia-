// Steam côté social : amis (statut, jeu en cours, rejoindre la partie) et promos de la liste de souhaits.
// Les amis demandent la clé d'API Steam de l'utilisateur (Paramètres) ; la liste de souhaits doit être publique.
const API = 'https://api.steampowered.com';
const get = (url, fetchImpl) => fetchImpl(url, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const ID64 = /^7656119\d{10}$/;

const STATES = ['Hors ligne', 'En ligne', 'Occupé', 'Absent', 'Absent', 'En ligne', 'En ligne'];

/** Amis Steam : en jeu d'abord, puis en ligne, puis hors ligne. */
export async function steamFriends(apiKey, id64, fetchImpl = fetch) {
  if (!apiKey || !ID64.test(String(id64))) return { ok: false, reason: apiKey ? 'compte' : 'cle', friends: [] };
  const list = await get(`${API}/ISteamUser/GetFriendList/v1/?key=${encodeURIComponent(apiKey)}&steamid=${id64}&relationship=friend`, fetchImpl);
  if (!list) return { ok: false, reason: 'prive', friends: [] };
  const ids = (list.friendslist?.friends ?? []).map((f) => f.steamid).filter((id) => ID64.test(id));
  const friends = [];
  for (let n = 0; n < ids.length; n += 100) {
    const data = await get(`${API}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${ids.slice(n, n + 100).join(',')}`, fetchImpl);
    for (const p of data?.response?.players ?? []) {
      const state = Number(p.personastate ?? 0);
      friends.push({
        id64: p.steamid, name: String(p.personaname ?? p.steamid), avatar: p.avatarfull ?? p.avatarmedium ?? null,
        online: state > 0, status: p.gameextrainfo ? 'En jeu' : STATES[state] ?? 'En ligne',
        game: p.gameextrainfo ?? null, appid: /^\d+$/.test(p.gameid ?? '') ? p.gameid : null,
        lobby: /^\d{17,20}$/.test(p.lobbysteamid ?? '') ? p.lobbysteamid : null, lastSeen: (p.lastlogoff ?? 0) * 1000,
      });
    }
  }
  const rank = (f) => (f.game ? 0 : f.online ? 1 : 2);
  friends.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.lastSeen - a.lastSeen : a.name.localeCompare(b.name, 'fr')));
  return { ok: true, friends };
}

/** Liens Steam autorisés pour un ami (rejoindre sa partie, lui écrire, voir son profil). */
export function friendLink(action, f) {
  if (!ID64.test(String(f?.id64))) return null;
  if (action === 'join') return f.appid && f.lobby ? `steam://joinlobby/${f.appid}/${f.lobby}/${f.id64}` : null;
  if (action === 'message') return `steam://friends/message/${f.id64}`;
  if (action === 'profile') return `https://steamcommunity.com/profiles/${f.id64}`;
  return null;
}

/** Jeux de la liste de souhaits en promo (prix en euros), la plus grosse réduction d'abord. */
export async function wishlistDeals(id64, fetchImpl = fetch) {
  if (!ID64.test(String(id64))) return [];
  const wl = await get(`${API}/IWishlistService/GetWishlist/v1/?steamid=${id64}`, fetchImpl);
  const appids = (wl?.response?.items ?? []).map((i) => Number(i.appid)).filter((n) => n > 0);
  const deals = [];
  for (let n = 0; n < appids.length; n += 50) {
    const input = { ids: appids.slice(n, n + 50).map((appid) => ({ appid })), context: { language: 'french', country_code: 'FR' }, data_request: { include_assets: true, include_all_purchase_options: true } };
    const data = await get(`${API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`, fetchImpl);
    for (const it of data?.response?.store_items ?? []) {
      const opt = it.best_purchase_option ?? it.purchase_options?.[0];
      const pct = Number(opt?.discount_pct ?? 0);
      if (!pct) continue;
      const a = it.assets;
      const img = a?.asset_url_format && (a.header || a.main_capsule) ? `https://shared.akamai.steamstatic.com/store_item_assets/${a.asset_url_format.replace('${FILENAME}', a.header ?? a.main_capsule)}` : null;
      deals.push({ appid: String(it.appid ?? it.id), name: it.name, pct, price: opt.formatted_final_price ?? null, before: opt.formatted_original_price ?? null, image: img, until: (opt.active_discounts?.[0]?.discount_end_date ?? 0) * 1000 });
    }
  }
  return deals.sort((a, b) => b.pct - a.pct);
}

/** Promos pas encore annoncées (même jeu avec une réduction plus forte = nouvelle alerte). */
export function newDeals(deals, seen = {}) {
  return deals.filter((d) => !(seen[d.appid] >= d.pct));
}
