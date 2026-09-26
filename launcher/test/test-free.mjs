import assert from 'node:assert/strict';
import { parseEpicFree } from '../src/core/freegames.js';

const now = Date.parse('2026-09-26T12:00:00Z');
const promo = (start, end, pct = 0) => [{ promotionalOffers: [{ startDate: start, endDate: end, discountSetting: { discountPercentage: pct } }] }];
const el = (title, slug, promotions, price = 0) => ({ title, offerMappings: [{ pageSlug: slug }], keyImages: [{ type: 'Thumbnail', url: 't.jpg' }, { type: 'OfferImageWide', url: `${slug}.jpg` }], price: { totalPrice: { discountPrice: price } }, promotions });
const json = { data: { Catalog: { searchStore: { elements: [
  el('Jeu Gratuit', 'jeu-gratuit', { promotionalOffers: promo('2026-09-24T15:00:00Z', '2026-10-01T15:00:00Z') }),
  el('Bientôt', 'bientot', { promotionalOffers: [], upcomingPromotionalOffers: promo('2026-10-01T15:00:00Z', '2026-10-08T15:00:00Z') }, 1999),
  el('Juste en promo', 'promo', { promotionalOffers: promo('2026-09-24T15:00:00Z', '2026-10-01T15:00:00Z', 50) }, 999),
  el('Lien piégé', '../../x', { promotionalOffers: promo('2026-09-24T15:00:00Z', '2026-10-01T15:00:00Z') }),
] } } } };
const list = parseEpicFree(json, now);
assert.deepEqual(list.map((g) => [g.name, g.now]), [['Jeu Gratuit', true], ['Bientôt', false]], 'gratuit maintenant puis à venir ; ni simple promo ni lien douteux');
assert.equal(list[0].image, 'jeu-gratuit.jpg');
assert.equal(list[0].until, Date.parse('2026-10-01T15:00:00Z'));
assert.deepEqual(parseEpicFree(null), []);
console.log('✅ jeux gratuits Epic : 4 vérifications');
