// Salon « IA STATUS » : dès que l'IA (Gemini) tombe en panne, un message avec une carte rouge
// part dans tous les serveurs ; quand elle revient, un message vert l'annonce.
import { ChannelType, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { art } from '../panels/ui.js';

const CHANNEL = '🔴・ia-status';
const CATEGORY = '🏴‍☠️ History IA';
const FAILS_FOR_DOWN = 5; // échecs d'affilée…
const DOWN_AFTER_MS = 60_000; // …sur au moins une minute
const PROBE_MS = 2 * 60_000; // en panne : on reteste l'IA toutes les 2 min
const MIN_GAP_MS = 30 * 60_000; // pas plus d'une alerte par demi-heure

let client = null;
let fails = 0;
let firstFailAt = 0;
let down = false;
let downSince = 0;
let lastAlertAt = 0;
let probeTimer = null;

// Erreurs qui disent que l'IA ne répond plus (et pas qu'une demande a été refusée)
const isOutage = (status) => !status || status >= 500 || [401, 403, 429].includes(status);

export function aiIsDown() { return down; }

/** Appelé après chaque demande à l'IA. */
export function noteAiResult(ok, status) {
  if (ok) {
    fails = 0;
    firstFailAt = 0;
    if (down) setUp();
    return;
  }
  if (!isOutage(status)) return;
  if (!fails) firstFailAt = Date.now();
  fails++;
  if (!down && fails >= FAILS_FOR_DOWN && Date.now() - firstFailAt >= DOWN_AFTER_MS) setDown();
}

function setDown() {
  down = true;
  downSince = Date.now();
  console.warn('[ia-status] IA en panne');
  if (Date.now() - lastAlertAt >= MIN_GAP_MS) {
    lastAlertAt = Date.now();
    broadcast('down').catch((err) => console.warn('[ia-status]', err.message));
  }
  clearInterval(probeTimer);
  probeTimer = setInterval(probe, PROBE_MS);
  probeTimer.unref?.();
}

function setUp() {
  down = false;
  clearInterval(probeTimer);
  probeTimer = null;
  console.log('[ia-status] IA de retour');
  // Pas de message de retour si l'alerte n'est pas partie
  if (lastAlertAt >= downSince) broadcast('up').catch((err) => console.warn('[ia-status]', err.message));
}

async function probe() {
  const { chat } = await import('../ai/gemini.js');
  // chat() rapporte lui-même le résultat : une réussite fait repasser l'IA « en ligne »
  await chat({ content: [{ type: 'text', text: 'Réponds juste : ok' }], system: 'Réponds en un mot.', web: false, thinking: 'minimal', tag: 'statut' }).catch(() => {});
}

export function statusMessage(kind, since = downSince) {
  const gif = art('iastatus', kind);
  const embed = kind === 'down'
    ? new EmbedBuilder().setColor(0xe0233a).setTitle('🔴 IA indisponible')
      .setDescription(`L'IA ne répond plus pour le moment. **Nos équipes travaillent dessus.**\n\nLes commandes sans IA (musique, modération, tickets, jeux) continuent de marcher. Un message sera posté ici dès son retour.\n-# Panne détectée <t:${Math.floor(since / 1000)}:R>`)
    : new EmbedBuilder().setColor(0x1fd67a).setTitle('🟢 IA de retour')
      .setDescription(`L'IA répond de nouveau. Merci pour votre patience !\n-# Indisponible pendant ${Math.max(1, Math.round((Date.now() - since) / 60_000))} min`);
  embed.setImage(gif.url).setFooter({ text: 'History IA · statut' }).setTimestamp();
  return { embeds: [embed], files: gif.files };
}

/** Trouve le salon IA STATUS du serveur, ou le crée (lecture seule pour les membres). */
export async function statusChannel(guild) {
  const found = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === CHANNEL);
  if (found) return found;
  const me = guild.members.me;
  if (!me?.permissions.has(P.ManageChannels)) return null;
  const parent = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY);
  return guild.channels.create({
    name: CHANNEL, type: ChannelType.GuildText, parent: parent?.id, topic: 'État de l’IA du bot : pannes et retours.',
    permissionOverwrites: [
      { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles] },
      { id: guild.id, deny: [P.SendMessages], allow: [P.ViewChannel, P.AddReactions] },
    ],
    reason: 'Salon IA STATUS',
  }).catch(() => null);
}

async function broadcast(kind) {
  if (!client) return;
  const payload = statusMessage(kind);
  for (const guild of client.guilds.cache.values()) {
    const channel = await statusChannel(guild).catch(() => null);
    await channel?.send(payload).catch(() => {});
  }
}

export function startAiStatus(c) {
  client = c;
}
