// Jeux gratuits de la semaine sur l'Epic Games Store (à récupérer puis garder pour toujours).
// Source : le flux public utilisé par la page « Jeux gratuits » du magasin Epic.
const FEED = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR';

const image = (e) => {
  const imgs = e.keyImages ?? [];
  return (imgs.find((i) => i.type === 'OfferImageWide') ?? imgs.find((i) => i.type === 'DieselStoreFrontWide') ?? imgs.find((i) => i.type === 'Thumbnail') ?? imgs[0])?.url ?? null;
};
const slugOf = (e) => e.offerMappings?.find((m) => m.pageSlug)?.pageSlug ?? e.catalogNs?.mappings?.find((m) => m.pageSlug)?.pageSlug ?? e.productSlug?.replace(/\/home$/, '') ?? null;

/** Jeux gratuits en ce moment ({ now: true }) et à venir, avec la date de fin ou de début. */
export function parseEpicFree(json, now = Date.now()) {
  const out = [];
  for (const e of json?.data?.Catalog?.searchStore?.elements ?? []) {
    const slug = slugOf(e);
    if (!slug || !/^[\w-]+$/.test(slug)) continue;
    const offer = (list) => list?.flatMap((p) => p.promotionalOffers ?? []).find((o) => o.discountSetting?.discountPercentage === 0);
    const cur = offer(e.promotions?.promotionalOffers);
    const next = offer(e.promotions?.upcomingPromotionalOffers);
    const base = { name: e.title, slug, image: image(e) };
    if (cur && Date.parse(cur.startDate) <= now && Date.parse(cur.endDate) > now && e.price?.totalPrice?.discountPrice === 0) out.push({ ...base, now: true, until: Date.parse(cur.endDate) });
    else if (next && Date.parse(next.startDate) > now) out.push({ ...base, now: false, from: Date.parse(next.startDate) });
  }
  return out.sort((a, b) => b.now - a.now);
}

export async function epicFreeGames(fetchImpl = fetch) {
  const json = await fetchImpl(FEED, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return parseEpicFree(json);
}
