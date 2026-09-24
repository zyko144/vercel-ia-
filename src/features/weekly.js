// Rapport de la semaine : chaque dimanche à 20 h (heure de Paris), le propriétaire de chaque serveur
// premium reçoit en MP un résumé de la semaine (messages, membres les plus actifs, salons, jeux, musique,
// tickets, sanctions, IA vocale). On peut aussi le voir à tout moment depuis /serveur › Premium.
// Les compteurs ne gardent que des nombres (jamais le contenu des messages).
import { EmbedBuilder } from 'discord.js';
import { load, save } from '../storage.js';
import { art } from '../panels/ui.js';
import { brandingOf, planOf, reportWanted, voiceUsage } from './premium.js';

const KEY = 'activite';
const TZ = 'Europe/Paris';
let stats = null; // { [guildId]: { [semaine]: { messages, users: {id: n}, channels: {id: n}, jeux, musique, tickets, sanctions } } }
let dirty = false;

/** Clé de la semaine (lundi de la semaine, heure de Paris) : « 2026-09-21 ». */
export function weekOf(at = Date.now()) {
  const paris = new Date(new Date(at).toLocaleString('en-US', { timeZone: TZ }));
  const day = (paris.getDay() + 6) % 7; // lundi = 0
  paris.setDate(paris.getDate() - day);
  return `${paris.getFullYear()}-${String(paris.getMonth() + 1).padStart(2, '0')}-${String(paris.getDate()).padStart(2, '0')}`;
}
const previousWeek = (week) => weekOf(new Date(`${week}T12:00:00Z`).getTime() - 7 * 86_400_000);

async function all() {
  stats ??= (await load(KEY, {}).catch(() => ({}))) ?? {};
  return stats;
}
function bucket(guildId, week = weekOf()) {
  const g = (stats[guildId] ??= {});
  // On ne garde que les 3 dernières semaines
  for (const key of Object.keys(g).sort().slice(0, -3)) delete g[key];
  return (g[week] ??= { messages: 0, users: {}, channels: {}, jeux: 0, musique: 0, tickets: 0, sanctions: 0 });
}

/** Un message du serveur (appelé pour chaque message, ne compte que des nombres). */
export function countMessage(message) {
  if (!stats || !message.guildId || message.author.bot) return;
  const b = bucket(message.guildId);
  b.messages += 1;
  b.users[message.author.id] = (b.users[message.author.id] ?? 0) + 1;
  b.channels[message.channelId] = (b.channels[message.channelId] ?? 0) + 1;
  dirty = true;
}

/** Un événement : « jeux », « musique », « tickets », « sanctions ». */
export function countEvent(guildId, kind, n = 1) {
  if (!stats || !guildId) return;
  const b = bucket(guildId);
  b[kind] = (b[kind] ?? 0) + n;
  dirty = true;
}

const pct = (now, before) => (!before ? (now ? ' (nouveau)' : '') : ` (${now >= before ? '+' : ''}${Math.round(((now - before) / before) * 100)} %)`);
const medal = (i) => ['🥇', '🥈', '🥉', '4.', '5.'][i];

/** Le rapport d'un serveur, prêt à envoyer. */
export async function buildReport(guild, { week = weekOf() } = {}) {
  await all();
  const b = bucket(guild.id, week);
  const before = stats[guild.id]?.[previousWeek(week)] ?? { messages: 0, users: {} };
  const topUsers = Object.entries(b.users).sort((x, y) => y[1] - x[1]).slice(0, 5);
  const topChannels = Object.entries(b.channels).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const active = Object.keys(b.users).length;
  const voice = voiceUsage(guild.id);
  const brand = brandingOf(guild.id);
  const gif = art('panneaux', 'serveur');
  const embed = new EmbedBuilder()
    .setColor(brand?.color ?? 0x4db8ff)
    .setAuthor({ name: brand?.name ?? guild.name, iconURL: brand?.logo ?? guild.iconURL() ?? undefined })
    .setTitle(`📊 La semaine du ${new Date(`${week}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`)
    .setDescription(`**${b.messages.toLocaleString('fr-FR')}** messages${pct(b.messages, before.messages)} · **${active}** membres actifs${pct(active, Object.keys(before.users).length)}`)
    .addFields(
      { name: '🏆 Les plus actifs', value: topUsers.length ? topUsers.map(([id, n], i) => `${medal(i)} <@${id}> · ${n} msg`).join('\n') : 'Personne n’a encore écrit.', inline: true },
      { name: '💬 Salons les plus vivants', value: topChannels.length ? topChannels.map(([id, n]) => `<#${id}> · ${n}`).join('\n') : '—', inline: true },
      { name: '​', value: '​', inline: false },
      { name: '🎮 Parties lancées', value: String(b.jeux ?? 0), inline: true },
      { name: '🎵 Sons joués', value: String(b.musique ?? 0), inline: true },
      { name: '🎫 Tickets ouverts', value: String(b.tickets ?? 0), inline: true },
      { name: '🛡️ Sanctions', value: String(b.sanctions ?? 0), inline: true },
      { name: '🎙️ IA vocale (mois)', value: voice.limit === Infinity ? `${voice.used} min` : `${voice.used} / ${voice.limit} min`, inline: true },
      { name: '⭐ Offre', value: `${planOf(guild.id).emoji} ${planOf(guild.id).label}${planOf(guild.id).trial ? ' (essai)' : ''}`, inline: true },
    )
    .setImage(gif.url)
    .setFooter({ text: 'Rapport de la semaine · AI Vercel · que des nombres, jamais le contenu des messages' });
  return { embeds: [embed], files: gif.files };
}

/** Tous les dimanches à 20 h : un MP au propriétaire de chaque serveur qui a le rapport. */
export async function startWeeklyReports(client) {
  await all();
  setInterval(() => {
    if (!dirty) return;
    dirty = false;
    save(KEY, stats);
  }, 60_000).unref();
  const tick = async () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
    if (now.getDay() !== 0 || now.getHours() < 20) return;
    const week = weekOf();
    const sent = (await load('rapports-envoyes', {}).catch(() => ({}))) ?? {};
    for (const guild of client.guilds.cache.values()) {
      if (!reportWanted(guild.id) || sent[guild.id] === week) continue;
      sent[guild.id] = week;
      save('rapports-envoyes', sent);
      const owner = await guild.fetchOwner().catch(() => null);
      await owner?.send(await buildReport(guild, { week })).catch((err) => console.warn(`[rapport] MP impossible pour ${guild.name} :`, err.message));
      console.log(`[rapport] rapport de la semaine envoyé pour ${guild.name}`);
    }
  };
  setInterval(() => tick().catch((err) => console.warn('[rapport]', err.message)), 15 * 60_000).unref();
}
