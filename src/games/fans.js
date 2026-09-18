// Plus ou moins de fans : qui a le plus de fans sur Deezer ? Une bonne réponse, on continue ; une erreur, c'est fini.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { deezer } from '../music/deezer.js';
import { frenchRapCatalog } from '../music/blindpools.js';
import { load, save } from '../storage.js';
import { PRIVATE, MEDALS, pick, rulesLink, shortId } from './common.js';

const KEY = 'jeu-fans';
const ANSWER_MS = 30_000;
const FAN_CACHE_MS = 12 * 60 * 60_000;
const fanCache = new Map(); // id artiste -> { at, artist }
const runs = new Map(); // id partie -> partie

export const FAN_THEMES = {
  rapfr: { label: 'Rap FR', emoji: '🇫🇷' },
  monde: { label: 'Stars du monde', emoji: '🌍' },
  tout: { label: 'Tout mélangé', emoji: '🎲' },
};

/** 5 207 168 -> « 5,2 M » */
export function formatFans(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.', ',')} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`;
  return String(n);
}

async function artistInfo(id) {
  const cached = fanCache.get(id);
  if (cached && Date.now() - cached.at < FAN_CACHE_MS) return cached.artist;
  const data = await deezer.artist(id).catch(() => null);
  const artist = data?.id ? { id: data.id, name: data.name, fans: data.nb_fan ?? 0, picture: data.picture_big ?? data.picture_medium ?? null } : null;
  if (artist?.fans) fanCache.set(id, { at: Date.now(), artist });
  return artist;
}

/** Les artistes possibles pour un thème (ids Deezer). */
async function candidates(theme) {
  const ids = new Set();
  if (theme !== 'monde') {
    const catalog = await frenchRapCatalog().catch(() => ({ artists: [] }));
    for (const artist of catalog.artists.slice(0, 160)) ids.add(artist.id);
  }
  if (theme !== 'rapfr') {
    for (const artist of await deezer.chartArtists(100).catch(() => [])) ids.add(artist.id);
    const tracks = await deezer.chart().catch(() => []);
    for (const track of tracks) if (track.artist?.id) ids.add(track.artist.id);
  }
  return [...ids];
}

/** Prochain artiste : pas trop proche de l'autre (sinon c'est du pile ou face), un peu plus serré à chaque manche. */
async function nextArtist(run, against) {
  const gap = Math.max(1.12, 1.8 - run.streak * 0.06); // au moins 12 % d'écart
  for (let tries = 0; tries < 14; tries++) {
    const id = pick(run.pool);
    if (run.seen.has(id)) continue;
    run.seen.add(id);
    const artist = await artistInfo(id);
    if (!artist?.fans || artist.fans < 5_000) continue;
    const ratio = Math.max(artist.fans, against.fans) / Math.min(artist.fans, against.fans);
    if (ratio >= gap) return artist;
  }
  // Rien d'assez éloigné : on prend quand même un artiste différent
  for (const id of run.pool) {
    if (run.seen.has(id)) continue;
    run.seen.add(id);
    const artist = await artistInfo(id);
    if (artist?.fans && artist.fans !== against.fans) return artist;
  }
  return null;
}

function artistEmbed(artist, { hidden = false, color = 0x2b2d31, label }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: label })
    .setTitle(artist.name)
    .setDescription(hidden ? '## ❓ fans' : `## ${formatFans(artist.fans)} fans`);
  if (artist.picture) embed.setThumbnail(artist.picture);
  return embed;
}

function buttons(run, disabled = false) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`g:fans:${run.id}:plus`).setLabel('Plus de fans').setEmoji('⬆️').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`g:fans:${run.id}:moins`).setLabel('Moins de fans').setEmoji('⬇️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`g:fans:${run.id}:stop`).setLabel('Arrêter').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  )];
}

function questionPayload(run, extra = null) {
  return {
    content: [
      `🎯 <@${run.userId}> · série : **${run.streak}**${run.best ? ` · ton record : **${run.best}**` : ''}`,
      `**${run.right.name}** a-t-il **plus** ou **moins** de fans que **${run.left.name}** sur Deezer ? Réponse <t:${Math.floor(run.deadline / 1000)}:R>.`,
      extra,
    ].filter(Boolean).join('\n'),
    embeds: [
      artistEmbed(run.left, { color: 0x5865f2, label: '🅰️ Connu' }),
      artistEmbed(run.right, { hidden: true, color: 0xfee75c, label: '🅱️ À deviner' }),
    ],
    components: buttons(run),
    allowedMentions: { users: [run.userId] },
  };
}

function armTimer(run) {
  clearTimeout(run.timer);
  run.deadline = Date.now() + ANSWER_MS;
  run.timer = setTimeout(() => finish(run, 'temps écoulé ⏱️').catch(() => {}), ANSWER_MS);
}

/** /jeu-fans : une partie par personne, visible par tout le salon. */
export async function startFans(interaction, theme = 'tout') {
  await interaction.deferReply();
  const pool = await candidates(theme);
  if (pool.length < 10) return interaction.editReply('😕 Deezer répond pas pour le moment, réessaie dans une minute.');
  const records = await load(KEY, { records: {} });
  const run = {
    id: shortId(), userId: interaction.user.id, theme, pool, seen: new Set(), streak: 0,
    best: records.records?.[interaction.user.id] ?? 0,
  };
  let left = null;
  for (let tries = 0; tries < 10 && !left; tries++) {
    const id = pick(pool);
    run.seen.add(id);
    left = await artistInfo(id);
  }
  if (!left) return interaction.editReply('😕 Deezer répond pas pour le moment, réessaie dans une minute.');
  run.left = left;
  run.right = await nextArtist(run, left);
  if (!run.right) return interaction.editReply('😕 Pas assez d\'artistes dispo, réessaie.');
  runs.set(run.id, run);
  armTimer(run);
  run.message = await interaction.editReply(questionPayload(run, rulesLink('fans') ? `-# ${rulesLink('fans')}` : null));
  return undefined;
}

export async function handleFansButton(interaction) {
  const [, , id, action] = interaction.customId.split(':');
  const run = runs.get(id);
  if (!run) return interaction.reply({ content: 'Cette partie est finie. Relance `/jeu-fans` !', ...PRIVATE });
  if (interaction.user.id !== run.userId) return interaction.reply({ content: `C'est la partie de <@${run.userId}> : lance la tienne avec \`/jeu-fans\` 😉`, ...PRIVATE });
  if (run.busy) return interaction.deferUpdate();
  run.busy = true;
  try {
    if (action === 'stop') {
      await interaction.deferUpdate();
      return await finish(run, 'partie arrêtée');
    }
    const more = run.right.fans > run.left.fans;
    const correct = (action === 'plus') === more;
    await interaction.deferUpdate();
    if (!correct) return await finish(run, null);

    run.streak++;
    const revealed = `✅ Bien vu ! **${run.right.name}** a **${formatFans(run.right.fans)}** fans (contre ${formatFans(run.left.fans)}).`;
    run.left = run.right;
    run.right = await nextArtist(run, run.left);
    if (!run.right) return await finish(run, 'plus aucun artiste à proposer, t\'as tout fait 👑');
    armTimer(run);
    await interaction.editReply(questionPayload(run, revealed));
  } finally {
    run.busy = false;
  }
  return undefined;
}

async function finish(run, reason) {
  if (run.done) return;
  run.done = true;
  clearTimeout(run.timer);
  runs.delete(run.id);
  const data = await load(KEY, { records: {} });
  data.records ??= {};
  const record = run.streak > (data.records[run.userId] ?? 0);
  if (record) data.records[run.userId] = run.streak;
  save(KEY, data);
  const top = Object.entries(data.records).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([userId, best], i) => `${MEDALS[i] ?? `\`${i + 1}.\``} <@${userId}> · **${best}**`).join('\n');
  const why = reason ?? `❌ Raté ! **${run.right.name}** a **${formatFans(run.right.fans)}** fans, ${run.right.fans > run.left.fans ? 'plus' : 'moins'} que **${run.left.name}** (${formatFans(run.left.fans)}).`;
  const embed = new EmbedBuilder()
    .setColor(record ? 0xfee75c : 0xed4245)
    .setAuthor({ name: '📊 PLUS OU MOINS DE FANS' })
    .setTitle(`Série finale : ${run.streak}${record ? ' · 🏆 nouveau record !' : ''}`)
    .setDescription([why, top ? `\n**Records du serveur**\n${top}` : null].filter(Boolean).join('\n'));
  await run.message?.edit({ content: `<@${run.userId}>`, embeds: [embed], components: [], allowedMentions: { parse: [] } }).catch(() => {});
}
