// History Launcher ↔ Discord :
// - /launcher lier code:XXXXXX : lie ton compte History (code affiché dans le launcher, Paramètres › Compte)
// - /launcher profil [membre] : niveau, benchmark, jeu du moment, temps de la semaine
// - rôles automatiques selon le niveau et le benchmark (sur le serveur des annonces du launcher)
// - jeux gratuits de la semaine sur l'Epic Games Store annoncés avec leur image
import { AttachmentBuilder, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { allowAttempt } from '../dashboard/auth.js';
import { load, save } from '../storage.js';
import { launcherCardGif } from './launcherCard.js';
import { accountByDiscord, linkDiscord, linkedAccounts } from './launcherAccounts.js';
import { RELEASES_CHANNEL } from './launcherReleases.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const DEALS_NAME = '🎁・jeux-gratuits-et-promos';
/** Salon des jeux gratuits et des promos : celui de LAUNCHER_GRATUIT_SALON, sinon créé à côté du salon des nouveautés. */
export async function dealsChannel(client) {
  if (process.env.LAUNCHER_GRATUIT_SALON) return client.channels.fetch(process.env.LAUNCHER_GRATUIT_SALON).catch(() => null);
  const st = (await load('launcher-bons-plans', null)) ?? {};
  if (st.channelId) { const c = await client.channels.fetch(st.channelId).catch(() => null); if (c) return c; }
  const news = await client.channels.fetch(RELEASES_CHANNEL).catch(() => null);
  const guild = news?.guild;
  if (!guild) return news;
  let c = guild.channels.cache.find((x) => x.name === DEALS_NAME);
  if (!c) {
    c = await guild.channels.create({ name: DEALS_NAME, parent: news.parentId ?? undefined, topic: 'Jeux gratuits de la semaine sur Epic Games et grosses promos Steam, postés tout seuls par le bot (History Launcher).', reason: 'History Launcher : bons plans' })
      .catch((err) => { console.warn('[bons plans] création du salon impossible (permission « Gérer les salons ») :', err.message); return null; });
  }
  if (c) save('launcher-bons-plans', { ...st, channelId: c.id });
  return c ?? news;
}
const EPIC_FEED = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR';

export const launcherCommand = new SlashCommandBuilder().setName('launcher').setDescription('🚀 History Launcher : ton profil, lier ton compte')
  .addSubcommand((s) => s.setName('profil').setDescription('Profil History : niveau, benchmark, jeu du moment')
    .addUserOption((o) => o.setName('membre').setDescription('Voir le profil de quelqu’un d’autre')))
  .addSubcommand((s) => s.setName('lier').setDescription('Lier ton compte History (code dans Paramètres › Compte du launcher)')
    .addStringOption((o) => o.setName('code').setDescription('Le code à 6 caractères').setRequired(true).setMinLength(6).setMaxLength(6)));

// Paliers de rôles (créés s'ils manquent). Le benchmark suit les paliers du launcher.
export const BENCH_TIERS = [[1600, '🏁 Monstre de jeu'], [1150, '🏁 Très haut de gamme'], [850, '🏁 Bon PC de jeu']];
export const LEVEL_TIERS = [[50, '👑 Niveau 50+'], [25, '🔥 Niveau 25+'], [10, '⏱ Niveau 10+']];
export const rolesFor = ({ level, bench }) => [
  BENCH_TIERS.find(([min]) => (bench ?? 0) >= min)?.[1],
  LEVEL_TIERS.find(([min]) => (level ?? 0) >= min)?.[1],
].filter(Boolean);
const ALL_ROLES = [...BENCH_TIERS, ...LEVEL_TIERS].map(([, n]) => n);

/** Ce que le launcher a envoyé au serveur pour ce compte (présence, benchmark v2). */
export async function profileOf(accountId) {
  const s = (await load('launcher-social', null)) ?? {};
  const p = s.presence?.[accountId] ?? {};
  const online = Date.now() - (p.seen ?? 0) < 3 * 60_000;
  const b = s.bench2?.[accountId] ?? null;
  return { level: p.level ?? null, bench: b?.total ?? null, benchCpu: b?.cpu ?? null, benchGpu: b?.gpuName ?? null, cpu1: b?.cpu1 ?? null, cpuN: b?.cpuN ?? null, ram: b?.ram ?? null, disk: b?.disk ?? null, gpu: b?.gpu ?? null, playing: online ? p.playing ?? null : null, online, week: p.week ?? 0, top: p.top ?? null, friends: (s.friends?.[accountId] ?? []).length };
}
const hours = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}` : `${Math.round(m)} min`);

export async function handleLauncherCommand(client, interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'lier') {
    const r = await linkDiscord(interaction.options.getString('code', true), interaction.user.id);
    if (!r.ok) return interaction.reply({ content: `❌ ${r.error}`, ...PRIVATE });
    await interaction.deferReply(PRIVATE);
    const p = await profileOf(r.id);
    syncMember(client, interaction.user.id, p).catch(() => {});
    return cardReply(interaction, { id: r.id, pseudo: r.pseudo }, interaction.user, p, `✅ Ton compte Discord est lié au compte History **${r.pseudo}**. Tes rôles arrivent dans quelques secondes.`);
  }
  const user = interaction.options.getUser('membre') ?? interaction.user;
  const acc = await accountByDiscord(user.id);
  if (!acc) {
    return interaction.reply({ content: user.id === interaction.user.id ? '🔗 Ton compte n’est pas encore lié : dans le launcher, ouvre Paramètres › Compte › « Lier Discord », puis tape `/launcher lier code:XXXXXX`.' : `${user.username} n’a pas lié de compte History.`, ...PRIVATE });
  }
  const p = await profileOf(acc.id);
  // Carte animée aux couleurs du launcher (texte seul si trop de demandes ou si le rendu échoue)
  if (!allowAttempt('launcher-card', interaction.user.id, 4, 60_000)) return interaction.reply({ embeds: [profileEmbed(acc, user, p)] });
  await interaction.deferReply();
  return cardReply(interaction, acc, user, p);
}

/** Répond (après deferReply) avec la carte GIF, ou l'embed texte si le rendu échoue. */
async function cardReply(interaction, acc, user, p, content = undefined) {
  try {
    const gif = await launcherCardGif({ ...p, pseudo: acc.pseudo }, { avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }) });
    return await interaction.editReply({ content, files: [new AttachmentBuilder(gif, { name: 'history-profil.gif' })] });
  } catch (err) {
    console.error('[launcher] carte profil :', err.message);
    return interaction.editReply({ content, embeds: [profileEmbed(acc, user, p)] });
  }
}

function profileEmbed(acc, user, p) {
  const e = new EmbedBuilder().setColor(0x2f8bff).setAuthor({ name: `${acc.pseudo} · History Launcher`, iconURL: user.displayAvatarURL() })
    .setDescription(p.playing ? `🟢 **Joue à ${p.playing}**` : p.online ? '🟢 En ligne' : '⚫ Hors ligne')
    .addFields(
      { name: '⭐ Niveau', value: p.level ? String(p.level) : '—', inline: true },
      { name: '🏁 Benchmark', value: p.bench ? `**${p.bench}**${rolesFor({ bench: p.bench })[0] ? `\n${rolesFor({ bench: p.bench })[0].slice(2)}` : ''}` : 'pas encore fait', inline: true },
      { name: '🕒 Cette semaine', value: p.week ? hours(p.week) : '—', inline: true },
      { name: '🎮 Jeu de la semaine', value: p.top ?? '—', inline: true },
      { name: '👥 Amis History', value: String(p.friends), inline: true },
    )
    .setFooter({ text: 'historylauncher.vercel.app' });
  if (p.benchCpu || p.benchGpu) e.addFields({ name: '🖥 PC', value: [p.benchCpu, p.benchGpu].filter(Boolean).join('\n').slice(0, 200) });
  return e;
}

/** Donne les bons rôles à un membre (et retire les paliers qui ne s'appliquent plus). */
async function syncMember(client, discordId, profile) {
  const channel = await client.channels.fetch(RELEASES_CHANNEL).catch(() => null);
  const guild = channel?.guild;
  if (!guild) return;
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return;
  const want = new Set(rolesFor(profile));
  for (const name of ALL_ROLES) {
    let role = guild.roles.cache.find((r) => r.name === name);
    if (want.has(name) && !role) role = await guild.roles.create({ name, mentionable: false, reason: 'History Launcher : paliers automatiques' }).catch(() => null);
    if (!role) continue;
    if (want.has(name) && !member.roles.cache.has(role.id)) await member.roles.add(role, 'History Launcher').catch(() => {});
    if (!want.has(name) && member.roles.cache.has(role.id)) await member.roles.remove(role, 'History Launcher').catch(() => {});
  }
}
async function syncAll(client) {
  for (const a of await linkedAccounts()) await syncMember(client, a.discordId, await profileOf(a.id)).catch(() => {});
}

/** Jeux gratuits Epic de la semaine : un message par nouveau jeu, avec son image. */
async function announceFree(client, fetchImpl = fetch) {
  const json = await fetchImpl(EPIC_FEED, { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const { parseEpicFree } = await import('../../launcher/src/core/freegames.js');
  const now = parseEpicFree(json).filter((g) => g.now);
  if (!now.length) return;
  const st = (await load('launcher-epic-annonces', null)) ?? { done: [] };
  const fresh = now.filter((g) => !st.done.includes(`${g.slug}:${g.until}`));
  if (!fresh.length) return;
  const channel = await dealsChannel(client);
  if (!channel?.isTextBased?.()) return;
  for (const g of fresh) {
    const until = new Date(g.until).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
    const files = [];
    if (g.image) {
      const img = await fetchImpl(g.image, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (img?.ok) files.push(new AttachmentBuilder(Buffer.from(await img.arrayBuffer()), { name: 'jeu-gratuit.jpg' }));
    }
    await channel.send({ content: `# 🎁 ${g.name} est gratuit sur Epic Games\nRécupère-le avant le **${until}** : il reste à toi pour toujours.\n-# [Page du jeu](https://store.epicgames.com/fr/p/${g.slug}) · History Launcher te prévient aussi dans l’appli`, files, allowedMentions: { parse: [] } });
    st.done = [...st.done, `${g.slug}:${g.until}`].slice(-100);
  }
  save('launcher-epic-annonces', st);
}

/** Grosses promos Steam du jour (au moins -50 %), une fois par jour, en un seul message avec les images. */
async function announceDeals(client, fetchImpl = fetch) {
  const today = new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  const st = (await load('launcher-bons-plans', null)) ?? {};
  if (st.dealsDay === today) return;
  const j = await fetchImpl('https://store.steampowered.com/api/featuredcategories?cc=fr&l=french', { signal: AbortSignal.timeout(15_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const seen = new Set(st.dealsSeen ?? []);
  const deals = (j?.specials?.items ?? []).filter((x) => x.discounted && x.discount_percent >= 50 && !seen.has(`${x.id}:${x.final_price}`))
    .sort((a, b) => b.discount_percent - a.discount_percent).slice(0, 6);
  if (!deals.length) return;
  const channel = await dealsChannel(client);
  if (!channel?.isTextBased?.()) return;
  const eur = (c) => `${(c / 100).toFixed(2).replace('.', ',')} €`;
  const embeds = deals.map((x) => new EmbedBuilder().setColor(0x22d3ee).setTitle(`${x.name} : -${x.discount_percent} %`).setURL(`https://store.steampowered.com/app/${x.id}`)
    .setDescription(`~~${eur(x.original_price)}~~ **${eur(x.final_price)}**${x.discount_expiration ? ` · jusqu’au ${new Date(x.discount_expiration * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}` : ''}`)
    .setThumbnail(x.header_image ?? x.large_capsule_image ?? null));
  await channel.send({ content: '# 🔥 Grosses promos Steam du jour\n-# Suis un prix dans History Launcher (Paramètres › Jeux › Alertes de prix) pour être prévenu sous ton prix.', embeds, allowedMentions: { parse: [] } });
  save('launcher-bons-plans', { ...st, dealsDay: today, dealsSeen: [...seen, ...deals.map((x) => `${x.id}:${x.final_price}`)].slice(-300) });
}

export function startLauncherDiscord(client) {
  setTimeout(() => announceDeals(client).catch((err) => console.warn('[bons plans]', err.message)), 4 * 60_000).unref();
  setInterval(() => announceDeals(client).catch((err) => console.warn('[bons plans]', err.message)), 2 * 3_600_000).unref();
  const safe = (f) => () => f(client).catch((err) => console.warn('[launcher discord]', err.message));
  setTimeout(safe(announceFree), 2 * 60_000).unref();
  setInterval(safe(announceFree), 3 * 3_600_000).unref();
  setTimeout(safe(syncAll), 3 * 60_000).unref();
  setInterval(safe(syncAll), 30 * 60_000).unref();
}
export const _test = { announceFree, announceDeals, syncMember };
