// Automatisations des tickets, créées depuis le tableau de bord (/app › Tickets).
// Une règle = un déclencheur + une action, pour un panneau précis ou tous :
//   déclencheurs : ticket ouvert · le membre écrit un mot-clé · le staff ne répond pas depuis X min · ticket inactif depuis X min
//   actions      : message automatique · réponse de l'IA (selon tes consignes) · ping du staff · fermeture du ticket
// Variables dans les messages : {membre} {staff} {ticket} {serveur} {motif}
import { EmbedBuilder } from 'discord.js';
import { chat } from '../ai/gemini.js';
import { closeTicket, saveTickets, ticketData } from './tickets.js';

export const TRIGGERS = {
  open: 'Ticket ouvert',
  keyword: 'Le membre écrit un mot-clé',
  no_staff: 'Le staff ne répond pas depuis…',
  inactive: 'Ticket inactif depuis…',
};
export const ACTIONS = {
  reply: 'Envoyer un message',
  ai: 'Réponse de l’IA (selon tes consignes)',
  ping: 'Prévenir le staff',
  close: 'Fermer le ticket',
};
const MAX_RULES = 25;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Nettoie une liste de règles venue du tableau de bord. */
export function cleanRules(list) {
  return (Array.isArray(list) ? list : []).slice(0, MAX_RULES).map((r) => {
    const trigger = TRIGGERS[r.trigger] ? r.trigger : 'keyword';
    const action = ACTIONS[r.action] ? r.action : 'reply';
    return {
      id: /^[a-z0-9]{4,12}$/.test(r.id) ? r.id : Math.random().toString(36).slice(2, 10),
      name: String(r.name ?? '').trim().slice(0, 60) || `${TRIGGERS[trigger]} → ${ACTIONS[action]}`,
      on: r.on !== false,
      trigger, action,
      words: trigger === 'keyword' ? String(Array.isArray(r.words) ? r.words.join(',') : r.words ?? '').split(',').map((w) => w.trim()).filter(Boolean).slice(0, 20).map((w) => w.slice(0, 40)) : [],
      minutes: ['no_staff', 'inactive'].includes(trigger) ? Math.max(1, Math.min(10_080, Math.round(Number(r.minutes) || 30))) : null,
      panelId: r.panelId ? String(r.panelId).slice(0, 20) : null,
      text: String(r.text ?? '').slice(0, 1500),
      once: r.once !== false,
    };
  }).filter((r) => r.trigger !== 'keyword' || r.words.length);
}

export async function rulesOf(guildId) {
  return (await ticketData(guildId)).automations ?? [];
}
export async function saveRules(guildId, list) {
  const g = await ticketData(guildId);
  g.automations = cleanRules(list);
  saveTickets();
  return g.automations;
}

// ---------------------------------------------------------------- Exécution
const fill = (text, ctx) => String(text ?? '')
  .replace(/\{membre\}/g, `<@${ctx.ticket.userId}>`)
  .replace(/\{staff\}/g, ctx.panel?.staffRoleId ? `<@&${ctx.panel.staffRoleId}>` : 'le staff')
  .replace(/\{ticket\}/g, `n°${ctx.ticket.number}`)
  .replace(/\{serveur\}/g, ctx.channel.guild.name)
  .replace(/\{motif\}/g, ctx.ticket.topic ?? 'ton ticket');

async function aiAnswer(ctx, rule) {
  const recent = await ctx.channel.messages.fetch({ limit: 15 }).catch(() => null);
  const convo = [...(recent?.values() ?? [])].reverse().filter((m) => m.content).map((m) => `${m.author.bot ? 'Bot' : m.author.id === ctx.ticket.userId ? 'Membre' : 'Staff'} : ${m.content}`).join('\n');
  const answer = await Promise.race([
    chat({
      tag: 'tickets', web: false, thinking: 'minimal',
      system: `Tu réponds dans un ticket de support du serveur Discord « ${ctx.channel.guild.name} ». Réponse courte, polie, en français. Consignes du staff : ${rule.text || 'aide le membre au mieux.'} Si tu ne sais pas, dis que le staff arrive très vite. N'invente jamais de règle ni de promesse.`,
      content: [{ type: 'text', text: `Conversation du ticket :\n${convo || '(vide)'}\n\nÉcris la réponse du bot.` }],
    }).then((r) => r.text).catch(() => null),
    new Promise((resolve) => { setTimeout(resolve, 20_000, null).unref?.(); }),
  ]);
  return answer ? String(answer).slice(0, 1900) : null;
}

async function run(client, ctx, rule) {
  const { channel } = ctx;
  if (rule.action === 'close') {
    if (rule.text) await channel.send({ content: fill(rule.text, ctx), allowedMentions: { users: [ctx.ticket.userId] } }).catch(() => {});
    return closeTicket(client, channel, client.user);
  }
  if (rule.action === 'ping') {
    const role = ctx.panel?.staffRoleId;
    return channel.send({ content: `${role ? `<@&${role}> ` : ''}${fill(rule.text || '🔔 Le staff est attendu dans ce ticket.', ctx)}`, allowedMentions: { roles: role ? [role] : [], users: [ctx.ticket.userId] } }).catch(() => {});
  }
  const text = rule.action === 'ai' ? await aiAnswer(ctx, rule) : fill(rule.text, ctx);
  if (!text) return undefined;
  return channel.send({
    embeds: [new EmbedBuilder().setColor(rule.action === 'ai' ? 0x5865f2 : 0x3fbf6a).setDescription(text).setFooter({ text: rule.action === 'ai' ? '🤖 Réponse automatique de l’IA · le staff peut compléter' : '⚙️ Message automatique' })],
    allowedMentions: { users: [ctx.ticket.userId] },
  }).catch(() => {});
}

async function fire(client, channel, g, ticket, rule) {
  ticket.fired ??= {};
  if (rule.once && ticket.fired[rule.id]) return;
  ticket.fired[rule.id] = Date.now();
  saveTickets();
  await run(client, { channel, ticket, panel: g.panels[ticket.panelId] }, rule).catch((err) => console.warn('[tickets auto]', err.message));
}
const applies = (rule, ticket, type) => rule.on && rule.trigger === type && (!rule.panelId || rule.panelId === ticket.panelId);

/** Un ticket vient d'être ouvert. */
export async function onTicketOpened(client, channel) {
  const g = await ticketData(channel.guildId);
  const ticket = g.open[channel.id];
  if (!ticket) return;
  ticket.lastAt = ticket.lastUserAt = Date.now();
  for (const rule of (g.automations ?? []).filter((r) => applies(r, ticket, 'open'))) await fire(client, channel, g, ticket, rule);
}

/** Un message dans un ticket : mots-clés, et suivi de qui a parlé en dernier. */
export async function onTicketMessage(message) {
  if (!message.inGuild() || message.author.bot) return;
  const g = await ticketData(message.guildId);
  const ticket = g.open[message.channelId];
  if (!ticket) return;
  const now = Date.now();
  const fromMember = message.author.id === ticket.userId;
  ticket.lastAt = now;
  if (fromMember) ticket.lastUserAt = now;
  else {
    ticket.lastStaffAt = now;
    // Le staff a répondu : les relances « pas de réponse du staff » peuvent de nouveau partir
    for (const r of g.automations ?? []) if (r.trigger === 'no_staff' && ticket.fired?.[r.id]) delete ticket.fired[r.id];
  }
  if (fromMember) {
    const text = norm(message.content);
    for (const rule of (g.automations ?? []).filter((r) => applies(r, ticket, 'keyword'))) {
      if (rule.words.some((w) => text.includes(norm(w)))) await fire(message.client, message.channel, g, ticket, rule);
    }
  }
  saveTickets();
}

/** Chaque minute : relances quand le staff ne répond pas, tickets inactifs. */
export async function ticketTimers(client, now = Date.now()) {
  for (const guild of client.guilds.cache.values()) {
    const g = await ticketData(guild.id);
    const rules = (g.automations ?? []).filter((r) => r.on && (r.trigger === 'no_staff' || r.trigger === 'inactive'));
    if (!rules.length) continue;
    for (const [channelId, ticket] of Object.entries(g.open)) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel) continue;
      for (const rule of rules.filter((r) => !r.panelId || r.panelId === ticket.panelId)) {
        const wait = rule.minutes * 60_000;
        const due = rule.trigger === 'inactive'
          ? now - (ticket.lastAt ?? ticket.openedAt) >= wait
          : (ticket.lastUserAt ?? ticket.openedAt) > (ticket.lastStaffAt ?? 0) && now - (ticket.lastUserAt ?? ticket.openedAt) >= wait;
        if (due && !ticket.fired?.[rule.id]) await fire(client, channel, g, ticket, rule);
        if (!g.open[channelId]) break; // fermé par la règle
      }
    }
  }
}

export function startTicketAutomations(client) {
  setInterval(() => ticketTimers(client).catch((err) => console.warn('[tickets auto]', err.message)), 60_000).unref?.();
}
