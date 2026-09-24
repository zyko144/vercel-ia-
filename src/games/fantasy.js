// Fantasy Rap FR : chacun choisit 5 rappeurs pour le mois. Chaque lundi, les points tombent selon
// leurs vrais chiffres Deezer : progression du nombre de fans + bonus pour chaque sortie de la semaine.
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { deezer, matchRatio } from '../music/deezer.js';
import { frenchRapCatalog } from '../music/blindpools.js';
import { load, save } from '../storage.js';
import { MEDALS, PRIVATE, normalize, rulesLink } from './common.js';

const KEY = 'jeu-fantasy';
const TEAM_SIZE = 5;
const MERCATO_DAYS = 3; // équipe modifiable les 3 premiers jours du mois
const RELEASE_BONUS = 15;
const MAX_RELEASE_BONUS = 30;
const CHECK_EVERY_MS = 30 * 60_000;
const WEEK_MS = 7 * 24 * 60 * 60_000;

const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const monthLabel = (key) => {
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
};

/** Lundi 00 h (heure de Paris approximée par l'heure du serveur) de la semaine en cours. */
function mondayOf(at = Date.now()) {
  const date = new Date(at);
  const day = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  return date.getTime() - day * 24 * 60 * 60_000;
}

async function state() {
  const data = await load(KEY, null);
  const current = data?.season ? data : { season: monthKey(), teams: {}, points: {}, history: [], lastScored: mondayOf(), archive: {} };
  current.teams ??= {};
  current.points ??= {};
  current.history ??= [];
  current.archive ??= {};
  return current;
}

const mercatoOpen = (data, userId) => new Date().getDate() <= MERCATO_DAYS || !data.teams[userId];

/** Autocomplétion : les rappeurs du catalogue rap FR. */
export async function fantasyAutocomplete(interaction) {
  const typed = normalize(interaction.options.getFocused() ?? '');
  const catalog = await frenchRapCatalog().catch(() => ({ artists: [] }));
  const matches = catalog.artists
    .filter((artist) => !typed || normalize(artist.name).includes(typed) || matchRatio(typed, artist.name) >= 0.7)
    .slice(0, 25)
    .map((artist) => ({ name: artist.name.slice(0, 100), value: String(artist.id) }));
  return interaction.respond(matches).catch(() => {});
}

/** Retrouve un rappeur tapé à la main (id Deezer venant de l'autocomplétion, ou nom). */
async function resolveArtist(value) {
  if (/^\d+$/.test(value)) {
    const artist = await deezer.artist(value).catch(() => null);
    if (artist?.id) return artist;
  }
  const found = await deezer.searchArtist(value, 5).catch(() => []);
  return found.sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0)).find((a) => matchRatio(value, a.name) >= 0.7) ?? null;
}

/** /jeu-fantasy equipe : choisit (ou montre) son équipe de 5 rappeurs. */
export async function fantasyTeam(interaction) {
  const values = [1, 2, 3, 4, 5].map((i) => interaction.options.getString(`rappeur${i}`)).filter(Boolean);
  const data = await state();
  const userId = interaction.user.id;

  if (!values.length) {
    const team = data.teams[userId];
    if (!team) return interaction.reply({ content: `🎤 T'as pas encore d'équipe : **/jeux** › Fantasy Rap : mon équipe avec 5 rappeurs.\n${rulesLink('fantasy') ?? ''}`, ...PRIVATE });
    return interaction.reply({ embeds: [teamEmbed(interaction, data, userId)], ...PRIVATE });
  }
  if (!mercatoOpen(data, userId)) {
    return interaction.reply({ content: `🔒 Le mercato est fermé : ton équipe est bloquée jusqu'au 1er du mois prochain (modifiable les ${MERCATO_DAYS} premiers jours).`, ...PRIVATE });
  }
  if (values.length !== TEAM_SIZE) return interaction.reply({ content: `Il faut **${TEAM_SIZE} rappeurs**, pas un de moins 😉`, ...PRIVATE });

  await interaction.deferReply(PRIVATE);
  const artists = [];
  for (const value of values) {
    const artist = await resolveArtist(value);
    if (!artist) return interaction.editReply(`😕 Je trouve pas **${value}** sur Deezer.`);
    if (artists.some((a) => a.id === artist.id)) return interaction.editReply(`**${artist.name}** est en double dans ton équipe.`);
    artists.push(artist);
  }
  // Pas deux fois la même équipe : chaque équipe doit être unique
  const key = artists.map((a) => a.id).sort().join(',');
  const clone = Object.entries(data.teams).find(([id, team]) => id !== userId && team.artists.map((a) => a.id).sort().join(',') === key);
  if (clone) return interaction.editReply(`🙅 <@${clone[0]}> a déjà exactement cette équipe : change au moins un rappeur.`);

  data.teams[userId] = {
    since: Date.now(),
    artists: artists.map((a) => ({ id: a.id, name: a.name, fans: a.nb_fan ?? 0, picture: a.picture_medium ?? null })),
  };
  data.points[userId] ??= 0;
  save(KEY, data);
  const total = artists.reduce((n, a) => n + (a.nb_fan ?? 0), 0);
  return interaction.editReply({
    content: '✅ Équipe enregistrée ! Les points tombent chaque lundi.',
    embeds: [teamEmbed(interaction, data, userId).setFooter({ text: `${Math.round(total / 1000).toLocaleString('fr-FR')} k fans au départ · saison ${monthLabel(data.season)}` })],
  });
}

function teamEmbed(interaction, data, userId) {
  const team = data.teams[userId];
  const last = data.history.at(-1)?.details?.[userId];
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: `🎤 FANTASY RAP FR · ${monthLabel(data.season)}` })
    .setTitle(`Équipe de ${interaction.guild?.members.cache.get(userId)?.displayName ?? 'toi'}`)
    .setDescription([
      ...team.artists.map((a) => `• **${a.name}**${last?.[a.id] !== undefined ? ` · ${last[a.id] >= 0 ? '+' : ''}${last[a.id]} pts la semaine dernière` : ''}`),
      '',
      `🏆 **${data.points[userId] ?? 0} pts** cette saison`,
      mercatoOpen(data, userId) ? `🔓 Mercato ouvert jusqu'au ${MERCATO_DAYS} du mois` : '🔒 Mercato fermé jusqu\'au mois prochain',
    ].join('\n'));
}

/** /jeu-fantasy classement */
export async function fantasyRanking(interaction) {
  const data = await state();
  return interaction.reply({ embeds: [rankingEmbed(data)], allowedMentions: { parse: [] } });
}

function rankingEmbed(data, title = null) {
  const ranking = Object.keys(data.teams)
    .map((id) => [id, data.points[id] ?? 0])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id, points], i) => `${MEDALS[i] ?? `\`${i + 1}.\``} <@${id}> · **${points}** pts · ${data.teams[id].artists.map((a) => a.name).join(', ')}`);
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: `🎤 FANTASY RAP FR · ${monthLabel(data.season)}` })
    .setTitle(title ?? 'Classement de la saison')
    .setDescription(ranking.join('\n') || 'Aucune équipe pour le moment : **/jeux** › Fantasy Rap : mon équipe !')
    .setFooter({ text: 'Points = progression des fans Deezer (×100 en %) + 15 par sortie de la semaine' });
}

/** Points d'un rappeur pour la semaine : sa progression de fans en %, ×100, + bonus de sortie. */
async function artistWeek(artist, since) {
  const fresh = await deezer.artist(artist.id).catch(() => null);
  if (!fresh?.nb_fan) return { points: 0, fans: artist.fans };
  const growth = artist.fans ? ((fresh.nb_fan - artist.fans) / artist.fans) * 100 : 0;
  const albums = await deezer.artistAlbums(artist.id, 10).catch(() => []);
  const releases = albums.filter((album) => {
    const at = Date.parse(album.release_date ?? '');
    return at && at >= since - 24 * 60 * 60_000 && at <= Date.now();
  }).length;
  const bonus = Math.min(MAX_RELEASE_BONUS, releases * RELEASE_BONUS);
  return { points: Math.round(growth * 100) + bonus, fans: fresh.nb_fan, releases };
}

/** Le lundi : on calcule les points de la semaine et on publie le classement. */
async function scoreWeek(client) {
  const data = await state();
  const since = data.lastScored ?? mondayOf() - WEEK_MS;
  const details = {};
  const weekPoints = {};
  const cache = new Map();
  for (const [userId, team] of Object.entries(data.teams)) {
    details[userId] = {};
    let total = 0;
    for (const artist of team.artists) {
      if (!cache.has(artist.id)) cache.set(artist.id, await artistWeek(artist, since));
      const week = cache.get(artist.id);
      details[userId][artist.id] = week.points;
      total += week.points;
      artist.fans = week.fans; // nouvelle base pour la semaine suivante
    }
    weekPoints[userId] = total;
    data.points[userId] = (data.points[userId] ?? 0) + total;
  }
  data.history.push({ at: Date.now(), details, weekPoints });
  data.history = data.history.slice(-8);
  data.lastScored = mondayOf();
  save(KEY, data);
  console.log(`[fantasy] semaine calculée pour ${Object.keys(data.teams).length} équipe(s)`);

  const channel = await client.channels.fetch(config.games.miniGamesChannelId).catch(() => null);
  if (!channel?.send || !Object.keys(data.teams).length) return;
  const best = Object.entries(weekPoints).sort((a, b) => b[1] - a[1])[0];
  const stars = [...cache.entries()].sort((a, b) => b[1].points - a[1].points).slice(0, 3)
    .map(([id, week]) => {
      const artist = Object.values(data.teams).flatMap((t) => t.artists).find((a) => a.id === id);
      return `${artist?.name ?? id} **${week.points >= 0 ? '+' : ''}${week.points}**${week.releases ? ` (${week.releases} sortie${week.releases > 1 ? 's' : ''})` : ''}`;
    }).join(' · ');
  await channel.send({
    content: best ? `📈 Meilleure semaine : <@${best[0]}> avec **${best[1]} pts** !` : undefined,
    embeds: [rankingEmbed(data, '📊 Les points de la semaine sont tombés').addFields({ name: '⭐ Rappeurs de la semaine', value: stars || '—' })],
    allowedMentions: best ? { users: [best[0]] } : { parse: [] },
  }).catch(() => {});
}

/** Le 1er du mois : on sacre le champion et on repart de zéro. */
async function closeSeason(client) {
  const data = await state();
  const ranking = Object.keys(data.teams).map((id) => [id, data.points[id] ?? 0]).sort((a, b) => b[1] - a[1]);
  const channel = await client.channels.fetch(config.games.miniGamesChannelId).catch(() => null);
  if (channel?.send && ranking.length) {
    await channel.send({
      content: `👑 <@${ranking[0][0]}> est champion de la Fantasy Rap FR de ${monthLabel(data.season)} avec **${ranking[0][1]} pts** ! Le mercato est ouvert : **/jeux** › Fantasy Rap : mon équipe.`,
      embeds: [rankingEmbed(data, `🏁 Fin de la saison ${monthLabel(data.season)}`)],
      allowedMentions: { users: [ranking[0][0]] },
    }).catch(() => {});
  }
  data.archive[data.season] = ranking.slice(0, 10);
  data.season = monthKey();
  data.points = Object.fromEntries(Object.keys(data.teams).map((id) => [id, 0]));
  // Les équipes restent (modifiables pendant le mercato), mais repartent de leurs chiffres actuels
  for (const team of Object.values(data.teams)) {
    for (const artist of team.artists) {
      const fresh = await deezer.artist(artist.id).catch(() => null);
      if (fresh?.nb_fan) artist.fans = fresh.nb_fan;
    }
  }
  data.history = [];
  save(KEY, data);
}

/** Vérifie régulièrement s'il faut calculer la semaine ou clôturer la saison. */
export function startFantasyLoop(client) {
  const tick = async () => {
    try {
      const data = await state();
      if (data.season !== monthKey()) {
        // Dernière semaine de la saison d'abord, puis la clôture
        if (Object.keys(data.teams).length) await scoreWeek(client);
        await closeSeason(client);
        return;
      }
      if (mondayOf() > (data.lastScored ?? 0) && Object.keys(data.teams).length) await scoreWeek(client);
    } catch (err) {
      console.warn('[fantasy] calcul :', err.message);
    }
  };
  setTimeout(tick, 60_000);
  setInterval(tick, CHECK_EVERY_MS).unref?.();
}
