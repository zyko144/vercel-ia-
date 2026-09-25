// Cartes cadeaux premium : le chef crée des codes (tableau de bord), un serveur les utilise
// (/serveur › Premium › Utiliser une carte cadeau) pour activer l'offre pendant la durée prévue.
import { randomBytes } from 'node:crypto';
import { load, save } from '../storage.js';
import { PLANS, setPlan } from './premium.js';

const KEY = 'cartes-cadeaux';
let cards = null;
let loading = null;
async function data() {
  loading ??= load(KEY, {}).catch(() => ({})).then((d) => { cards = d ?? {}; return cards; });
  return loading;
}
// Sans lettres ambiguës (0/O, 1/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => `VERCEL-${[...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join('').replace(/(.{4})(.{4})/, '$1-$2')}`;

export async function createGiftCards(plan, days, count = 1, by = null) {
  await data();
  if (!PLANS[plan] || plan === 'gratuit') throw new Error('Offre inconnue.');
  const out = [];
  for (let i = 0; i < Math.min(50, Math.max(1, count)); i++) {
    const code = newCode();
    cards[code] = { plan, days, at: Date.now(), by, usedBy: null, usedAt: null };
    out.push(code);
  }
  save(KEY, cards);
  return out;
}

export async function redeemGiftCard(code, guildId, userId) {
  await data();
  const key = String(code ?? '').trim().toUpperCase();
  const c = cards[key];
  if (!c) return { error: 'Ce code n’existe pas.' };
  if (c.usedBy) return { error: 'Ce code a déjà été utilisé.' };
  c.usedBy = guildId;
  c.usedAt = Date.now();
  c.user = userId;
  save(KEY, cards);
  return { plan: setPlan(guildId, c.plan, c.days), days: c.days };
}

export async function giftCardList() {
  await data();
  return Object.entries(cards).map(([code, c]) => ({ code, ...c })).sort((a, b) => b.at - a.at).slice(0, 100);
}
