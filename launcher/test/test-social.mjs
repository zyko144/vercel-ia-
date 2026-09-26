import assert from 'node:assert/strict';
import { friendLink, newDeals, steamFriends, wishlistDeals } from '../src/core/social.js';

const A = '76561198000000001';
const B = '76561198000000002';
const C = '76561198000000003';
const fake = (routes) => async (url) => {
  const hit = Object.entries(routes).find(([k]) => url.includes(k));
  return { ok: Boolean(hit), json: async () => hit?.[1] };
};

const res = await steamFriends('KEY', A, fake({
  GetFriendList: { friendslist: { friends: [{ steamid: B }, { steamid: C }, { steamid: 'pirate' }] } },
  GetPlayerSummaries: { response: { players: [
    { steamid: C, personaname: 'Zoé', personastate: 0, lastlogoff: 10 },
    { steamid: B, personaname: 'Max', personastate: 1, gameextrainfo: 'Rocket League', gameid: '252950', lobbysteamid: '109775241000000000' },
  ] } },
}));
assert.equal(res.ok, true);
assert.deepEqual(res.friends.map((f) => [f.name, f.status]), [['Max', 'En jeu'], ['Zoé', 'Hors ligne']], 'en jeu d’abord');
assert.equal(friendLink('join', res.friends[0]), `steam://joinlobby/252950/109775241000000000/${B}`);
assert.equal(friendLink('join', res.friends[1]), null, 'pas de partie ouverte : rien à rejoindre');
assert.equal(friendLink('message', { id64: 'x;rm' }), null, 'identifiant douteux refusé');
assert.equal((await steamFriends(null, A)).reason, 'cle');
assert.equal((await steamFriends('KEY', A, fake({}))).reason, 'prive');

const deals = await wishlistDeals(A, fake({
  GetWishlist: { response: { items: [{ appid: 10 }, { appid: 20 }] } },
  GetItems: { response: { store_items: [
    { appid: 10, name: 'Plein tarif', best_purchase_option: { discount_pct: 0 } },
    { appid: 20, name: 'En promo', best_purchase_option: { discount_pct: 75, formatted_final_price: '4,99€', formatted_original_price: '19,99€' }, assets: { asset_url_format: 'steam/apps/20/${FILENAME}', header: 'header.jpg' } },
  ] } },
}));
assert.deepEqual(deals.map((d) => [d.name, d.pct, d.price]), [['En promo', 75, '4,99€']]);
assert.ok(deals[0].image.endsWith('steam/apps/20/header.jpg'));
assert.equal(newDeals(deals, { 20: 75 }).length, 0, 'déjà annoncée');
assert.equal(newDeals(deals, { 20: 50 }).length, 1, 'réduction plus forte : nouvelle alerte');
console.log('✅ amis et promos Steam : 11 vérifications');
