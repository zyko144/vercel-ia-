// Banque du casino : des jetons, et rien d'autre.
// Aucun lien avec de l'argent réel : pas d'achat, pas de dépôt, pas de retrait.
import { randomInt } from 'node:crypto';
import { config } from '../config.js';
import { load, save } from '../storage.js';

const KEY = 'casinho-banque';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Tirage uniforme, sans biais : c'est le hasard du système, pas Math.random(). */
export const rand = (max) => randomInt(max);
export const pick = (list) => list[rand(list.length)];
export function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const CHIP = '🪙';
export const chips = (amount) => `${CHIP} ${Math.round(amount).toLocaleString('fr-FR')}`;

async function bank() {
  return load(KEY, {});
}

function blank() {
  return {
    chips: config.casinho.startingBalance,
    daily: 0,
    streak: 0,
    played: 0,
    wagered: 0,
    won: 0,
    biggest: 0,
    since: Date.now(),
  };
}

export async function account(userId) {
  const all = await bank();
  all[userId] ??= blank();
  return all[userId];
}

export async function balance(userId) {
  return (await account(userId)).chips;
}

/** Ajoute (ou retire, si négatif) des jetons. Le solde ne descend jamais sous zéro. */
export async function grant(userId, amount) {
  const all = await bank();
  all[userId] ??= blank();
  all[userId].chips = Math.max(0, Math.round(all[userId].chips + amount));
  save(KEY, all);
  return all[userId].chips;
}

/**
 * Retire la mise avant la partie. Renvoie null si le solde ne suffit pas :
 * une manche ne démarre jamais à crédit.
 */
export async function stake(userId, amount) {
  const all = await bank();
  all[userId] ??= blank();
  const me = all[userId];
  if (!Number.isInteger(amount) || amount < 1) return null;
  if (amount > me.chips) return null;
  me.chips -= amount;
  me.played += 1;
  me.wagered += amount;
  save(KEY, all);
  return amount;
}

/** Verse le retour d'une manche (mise incluse : 0 = tout perdu, 2× la mise = gain simple). */
export async function settle(userId, payout, wagered) {
  const all = await bank();
  all[userId] ??= blank();
  const me = all[userId];
  const rounded = Math.round(payout);
  me.chips += rounded;
  const net = rounded - wagered;
  if (net > 0) me.won += net;
  if (net > me.biggest) me.biggest = net;
  save(KEY, all);
  return { balance: me.chips, net };
}

/** Rembourse une manche annulée (égalité, partie abandonnée par le bot). */
export async function refund(userId, amount) {
  return grant(userId, amount);
}

// Les jetons « du jour » suivent le calendrier de Paris : ils reviennent à minuit,
// pas 24 h pile après le dernier clic.
const TIME_ZONE = 'Europe/Paris';
const dayFormat = new Intl.DateTimeFormat('fr-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const clockFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
export const dayOf = (timestamp) => dayFormat.format(timestamp); // « 2026-09-21 »

/** Temps restant avant minuit, heure de Paris. */
export function untilMidnight(now = Date.now()) {
  const parts = Object.fromEntries(clockFormat.formatToParts(now).map((part) => [part.type, Number(part.value)]));
  const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000;
  return Math.max(60_000, DAY_MS - elapsed);
}

export async function daily(userId, now = Date.now()) {
  const all = await bank();
  all[userId] ??= blank();
  const me = all[userId];
  const reward = config.casinho.dailyReward;
  const today = dayOf(now);
  const lastDay = me.daily ? dayOf(me.daily) : null;

  // Déjà pris aujourd'hui, au montant actuel : rendez-vous à minuit.
  // Si le cadeau a augmenté depuis (de 500 à un million, par exemple), on peut
  // prendre le nouveau tout de suite : l'ancien, plus petit, ne doit pas le bloquer.
  if (lastDay === today && (me.dailyReward ?? 0) >= reward) {
    return { ok: false, wait: untilMidnight(now), claimedAt: me.daily, claimed: me.dailyAmount ?? null };
  }

  // Série : +1 si le dernier passage date d'hier, inchangée si c'était aujourd'hui.
  if (lastDay === today) me.streak = Math.max(1, me.streak || 0);
  else me.streak = lastDay === dayOf(now - DAY_MS) ? (me.streak || 0) + 1 : 1;

  const bonus = Math.min(7, me.streak) * config.casinho.dailyStreakBonus;
  const amount = reward + bonus;
  me.chips += amount;
  me.daily = now;
  me.dailyReward = reward;
  me.dailyAmount = amount;
  save(KEY, all);
  return { ok: true, amount, streak: me.streak, balance: me.chips };
}

/** Les jetons du jour sont-ils à prendre ? (sans les prendre : pour l'affichage) */
export async function dailyStatus(userId, now = Date.now()) {
  const me = await account(userId);
  const taken = me.daily && dayOf(me.daily) === dayOf(now) && (me.dailyReward ?? 0) >= config.casinho.dailyReward;
  return taken ? { available: false, wait: untilMidnight(now) } : { available: true, amount: config.casinho.dailyReward };
}

/** Filet de sécurité : un joueur à sec récupère de quoi rejouer, une fois par heure. */
export async function rescue(userId) {
  const all = await bank();
  all[userId] ??= blank();
  const me = all[userId];
  if (me.chips >= config.casinho.rescueThreshold) return { ok: false, reason: 'solde' };
  const since = Date.now() - (me.rescued || 0);
  if (since < 60 * 60 * 1000) return { ok: false, reason: 'attente', wait: 60 * 60 * 1000 - since };
  me.chips += config.casinho.rescueAmount;
  me.rescued = Date.now();
  save(KEY, all);
  return { ok: true, amount: config.casinho.rescueAmount, balance: me.chips };
}

export async function transfer(fromId, toId, amount) {
  if (fromId === toId) return { ok: false, reason: 'soi-même' };
  if (!Number.isInteger(amount) || amount < 1) return { ok: false, reason: 'montant' };
  const all = await bank();
  all[fromId] ??= blank();
  all[toId] ??= blank();
  if (all[fromId].chips < amount) return { ok: false, reason: 'solde', chips: all[fromId].chips };
  all[fromId].chips -= amount;
  all[toId].chips += amount;
  save(KEY, all);
  return { ok: true, from: all[fromId].chips, to: all[toId].chips };
}

export async function leaderboard(count = 10) {
  const all = await bank();
  return Object.entries(all)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.chips - a.chips)
    .slice(0, count);
}

export async function stats(userId) {
  const me = await account(userId);
  const rank = (await leaderboard(500)).findIndex((entry) => entry.id === userId) + 1;
  return { ...me, rank };
}

/** Remise à zéro d'un compte (réservée aux administrateurs du casino). */
export async function reset(userId) {
  const all = await bank();
  all[userId] = blank();
  save(KEY, all);
  return all[userId].chips;
}

export const isAdmin = (userId) => config.casinho.admins.includes(userId) || userId === config.ownerId;

export function waitLabel(ms) {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`;
}
