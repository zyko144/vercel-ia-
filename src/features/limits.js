import { config } from '../config.js';
import { load, save } from '../storage.js';

const cooldowns = new Map();

/** Renvoie le temps restant (ms) si l'utilisateur est en cooldown, sinon 0 et démarre le cooldown. */
export function hitCooldown(userId, bucket, ms) {
  if (userId === config.ownerId) return 0;
  const key = `${bucket}:${userId}`;
  const remaining = (cooldowns.get(key) ?? 0) - Date.now();
  if (remaining > 0) return remaining;
  cooldowns.set(key, Date.now() + ms);
  return 0;
}

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

async function usage() {
  const data = await load('image-usage', { date: today(), counts: {} });
  if (data.date !== today()) {
    data.date = today();
    data.counts = {};
  }
  return data;
}

/** Vérifie et consomme 1 image du quota journalier. */
export async function takeImageQuota(userId) {
  const limit = config.limits.imagesPerDay;
  if (userId === config.ownerId) return { ok: true, left: Infinity, limit };
  const data = await usage();
  const used = data.counts[userId] ?? 0;
  if (used >= limit) return { ok: false, left: 0, limit };
  data.counts[userId] = used + 1;
  save('image-usage', data);
  return { ok: true, left: limit - used - 1, limit };
}

/** Rend l'image au quota si la génération a échoué. */
export async function refundImageQuota(userId) {
  if (userId === config.ownerId) return;
  const data = await usage();
  if (data.counts[userId]) {
    data.counts[userId]--;
    save('image-usage', data);
  }
}

export async function imagesToday() {
  const data = await usage();
  return Object.values(data.counts).reduce((a, b) => a + b, 0);
}
