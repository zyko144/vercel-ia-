// Quelqu'un tombe sur un problème avec le bot : le chef reçoit le détail en MP et un ping là où ça s'est passé.
// Anti-spam : le même problème n'envoie qu'un MP toutes les 2 min, et un salon n'est pingé qu'une fois toutes les 5 min.
import { config } from '../config.js';
import { dmOwner } from './escalation.js';
import { truncate } from '../utils/discord.js';

const SAME_PROBLEM_MS = 2 * 60_000;
const PING_EVERY_MS = 5 * 60_000;
const MAX_DMS_PER_WINDOW = 10; // au-delà (grosse panne), on attend la fin de la fenêtre
const WINDOW_MS = 10 * 60_000;

const lastDm = new Map(); // problème -> { at, repeats }
const lastPing = new Map(); // salon -> date
let window = { start: 0, count: 0 };
let mainClient = null;

/** Client du bot principal (c'est lui qui envoie les MP et les pings). */
export function setAlertClient(client) {
  mainClient = client;
}

/**
 * @param {object} problem
 * @param {string} problem.what ce qui a planté (« /play », « IA vocale », « blind test »...)
 * @param {Error|string} problem.error
 * @param {string} [problem.userId] le membre qui a eu le problème
 * @param {import('discord.js').Guild} [problem.guild]
 * @param {string} [problem.channelId] salon où le problème est arrivé (le chef y est pingé)
 * @param {string} [problem.shown] ce que le membre a vu
 * @param {boolean} [problem.ping] false : MP seulement (erreurs internes sans membre)
 */
export async function reportProblem({ what, error, userId, guild, channelId, shown, ping = true }) {
  const client = mainClient;
  if (!client?.isReady() || !config.ownerId) return;
  const message = truncate(String(error?.message ?? error ?? 'erreur inconnue').replace(/\s+/g, ' '), 900);
  const key = `${what}|${message.slice(0, 200)}`;
  const now = Date.now();

  const previous = lastDm.get(key);
  if (previous && now - previous.at < SAME_PROBLEM_MS) {
    previous.repeats++;
    return;
  }
  if (now - window.start > WINDOW_MS) window = { start: now, count: 0 };
  if (window.count >= MAX_DMS_PER_WINDOW) return;
  window.count++;
  lastDm.set(key, { at: now, repeats: 0 });
  if (lastDm.size > 300) for (const [k, v] of lastDm) if (now - v.at > SAME_PROBLEM_MS) lastDm.delete(k);

  const sent = await dmOwner(client, {
    title: `⚠️ Problème avec le bot : ${what}`,
    description: [`\`${message}\``, previous?.repeats ? `-# arrivé encore ${previous.repeats} fois juste avant` : null].filter(Boolean).join('\n'),
    fields: [
      { name: 'Qui', value: userId ? `<@${userId}>` : 'personne (erreur interne)', inline: true },
      { name: 'Où', value: channelId ? `<#${channelId}>` : guild?.name ?? '—', inline: true },
      ...(shown ? [{ name: 'Ce que le membre a vu', value: truncate(shown, 900) }] : []),
    ],
    link: guild && channelId ? `https://discord.com/channels/${guild.id}/${channelId}` : undefined,
  });

  // Ping dans le salon (pas quand c'est le chef lui-même qui a eu le problème)
  if (!ping || !channelId || userId === config.ownerId) return;
  if (now - (lastPing.get(channelId) ?? 0) < PING_EVERY_MS) return;
  lastPing.set(channelId, now);
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.send) return;
  await channel.send({
    content: `🔔 <@${config.ownerId}> ${userId ? `<@${userId}> a eu` : 'il y a eu'} un problème avec le bot (**${what}**)${sent ? ", jt'ai envoyé le détail en MP" : ''}.`,
    allowedMentions: { users: [config.ownerId] },
  }).catch(() => {});
}
