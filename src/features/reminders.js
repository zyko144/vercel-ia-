import { load, save } from '../storage.js';
import { truncate } from '../utils/discord.js';

const KEY = 'reminders';
const MAX_PER_USER = 10;
const MAX_DELAY_MS = 60 * 24 * 60 * 60_000; // 60 jours

const UNITS = {
  s: 1_000, sec: 1_000, seconde: 1_000, secondes: 1_000,
  m: 60_000, mn: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
  h: 3_600_000, hr: 3_600_000, heure: 3_600_000, heures: 3_600_000,
  j: 86_400_000, d: 86_400_000, jour: 86_400_000, jours: 86_400_000,
  sem: 604_800_000, semaine: 604_800_000, semaines: 604_800_000,
};

/** "10m", "2h30", "1j 4h", "45 minutes" -> millisecondes (ou null) */
export function parseDuration(input) {
  const text = input.toLowerCase().replace(/,/g, '.').trim();
  const regex = /(\d+(?:\.\d+)?)\s*([a-z]+)?/g;
  let total = 0;
  let lastUnit = null;
  let matched = false;
  for (const [, num, unitRaw] of text.matchAll(regex)) {
    let unit = unitRaw ? UNITS[unitRaw] : null;
    // "2h30" -> 30 = minutes
    if (!unit && lastUnit === UNITS.h) unit = UNITS.m;
    if (!unit) return null;
    total += Number(num) * unit;
    lastUnit = unit;
    matched = true;
  }
  return matched && total > 0 ? total : null;
}

export async function addReminder({ userId, channelId, guildId, text, delayMs }) {
  const reminders = await load(KEY, []);
  if (delayMs > MAX_DELAY_MS) return { error: 'Max 60 jours pour un rappel.' };
  if (reminders.filter((r) => r.userId === userId).length >= MAX_PER_USER) {
    return { error: `T'as déjà ${MAX_PER_USER} rappels en attente, attends qu'ils passent.` };
  }
  const reminder = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    userId, channelId, guildId,
    text: truncate(text, 500),
    at: Date.now() + delayMs,
  };
  reminders.push(reminder);
  save(KEY, reminders);
  return { reminder };
}

export function startReminderLoop(client) {
  const tick = async () => {
    const reminders = await load(KEY, []);
    const due = reminders.filter((r) => r.at <= Date.now());
    if (!due.length) return;

    save(KEY, reminders.filter((r) => !due.includes(r)));

    for (const r of due) {
      const content = `⏰ <@${r.userId}> rappel : **${r.text}**`;
      const allowedMentions = { users: [r.userId] };
      try {
        const channel = await client.channels.fetch(r.channelId);
        await channel.send({ content, allowedMentions });
      } catch {
        try {
          const user = await client.users.fetch(r.userId);
          await user.send({ content, allowedMentions });
        } catch (err) {
          console.warn('[rappels] impossible de livrer le rappel', r.id, err.message);
        }
      }
    }
  };
  setInterval(() => tick().catch((err) => console.warn('[rappels]', err.message)), 15_000);
}
