// History Launcher ↔ Discord :
// - /launcher lier code:XXXXXX : lie ton compte History (code affiché dans le launcher, Paramètres › Compte)
// - /launcher profil [membre] : niveau, benchmark, jeu du moment, temps de la semaine
// - rôles automatiques selon le niveau et le benchmark (sur le serveur des annonces du launcher)
// - jeux gratuits de la semaine sur l'Epic Games Store annoncés avec leur image
// - /launcher comparer : duel de deux profils ; /launcher fps : FPS mesurés par les membres sur un jeu
// - clips et captures envoyés depuis le launcher, parties de groupe (« Je viens »), promos en message privé
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { allowAttempt } from '../dashboard/auth.js';
import { load, save } from '../storage.js';
import { compareCardGif, launcherCardGif } from './launcherCard.js';
import { accountByDiscord, linkDiscord, linkedAccounts } from './launcherAccounts.js';
import { gameKey, notifyAccount, saveSocial, socialData } from './launcherSocial.js';
import { latestRelease } from './launcherReleases.js';
import { broadcast, HOME_GUILD, installHere, SITE } from './launcherServers.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const DEALS_NAME = '🎁・jeux-gratuits-et-promos';
/** Salon du launcher : celui de la variable d'environnement, sinon créé une fois à côté du salon des nouveautés. */
async function launcherChannel(client, { key, name, topic, env }) {
  if (env && process.env[env]) return client.channels.fetch(process.env[env]).catch(() => null);
  const st = (await load(key, null)) ?? {};
  if (st.channelId) { const c = await client.channels.fetch(st.channelId).catch(() => null); if (c) return c; }
  // Salons créés sur le serveur du launcher, dans sa catégorie
  const guild = await client.guilds.fetch(HOME_GUILD).catch(() => null);
  if (!guild) return null;
  let c = guild.channels.cache.find((x) => x.name === name);
  if (!c) {
    c = await guild.channels.create({ name, parent: guild.channels.cache.find((x) => x.name === '🚀 History Launcher')?.id, topic, reason: 'History Launcher' })
      .catch((err) => { console.warn(`[launcher] création du salon ${name} impossible (permission « Gérer les salons ») :`, err.message); return null; });
  }
  if (c) save(key, { ...((await load(key, null)) ?? {}), channelId: c.id });
  return c;
}
/** Salon des jeux gratuits et des promos. */
export const dealsChannel = (client) => launcherChannel(client, { key: 'launcher-bons-plans', name: DEALS_NAME, env: 'LAUNCHER_GRATUIT_SALON', topic: 'Jeux gratuits de la semaine sur Epic Games et grosses promos Steam, postés tout seuls par le bot (History Launcher).' });
const clipsChannel = (client) => launcherChannel(client, { key: 'launcher-clips', name: '🎬・clips-history', env: 'LAUNCHER_CLIPS_SALON', topic: 'Clips et captures envoyés depuis History Launcher (bouton « Discord » après un clip ou dans la fiche d’un jeu).' });
const partyChannel = (client) => launcherChannel(client, { key: 'launcher-parties-salon', name: '🎮・on-joue', env: 'LAUNCHER_PARTIES_SALON', topic: 'Parties lancées depuis les groupes de History Launcher : clique « Je viens » pour rejoindre.' });
const EPIC_FEED = 'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=fr&country=FR&allowCountries=FR';

export const launcherCommand = new SlashCommandBuilder().setName('launcher').setDescription('🚀 History Launcher : ton profil, lier ton compte')
  .addSubcommand((s) => s.setName('profil').setDescription('Profil History : niveau, benchmark, jeu du moment')
    .addUserOption((o) => o.setName('membre').setDescription('Voir le profil de quelqu’un d’autre')))
  .addSubcommand((s) => s.setName('lier').setDescription('Lier ton compte History (code dans Paramètres › Compte du launcher)')
    .addStringOption((o) => o.setName('code').setDescription('Le code à 6 caractères').setRequired(true).setMinLength(6).setMaxLength(6)))
  .addSubcommand((s) => s.setName('comparer').setDescription('Duel de profils : niveau, benchmark, composants, temps de jeu')
    .addUserOption((o) => o.setName('membre').setDescription('Avec qui te comparer').setRequired(true))
    .addUserOption((o) => o.setName('avec').setDescription('Comparer deux autres membres (sinon : toi)')))
  .addSubcommand((s) => s.setName('fps').setDescription('FPS mesurés par les joueurs History sur un jeu, avec leur PC')
    .addStringOption((o) => o.setName('jeu').setDescription('Le jeu').setRequired(true).setAutocomplete(true).setMaxLength(80)))
  .addSubcommand((s) => s.setName('opti').setDescription('🚀 Ticket Opti Pro : ton PC optimisé pas à pas par l’IA (BIOS, overclocking, Windows, NVIDIA)'))
  .addSubcommand((s) => s.setName('aide').setDescription('Un souci avec History Launcher ? Écris au support (réponse dans l’appli)'))
  .addSubcommand((s) => s.setName('pc').setDescription('🖥 La config de ton PC (ou d’un membre), lue par History Launcher')
    .addUserOption((o) => o.setName('membre').setDescription('Voir le PC de quelqu’un d’autre')))
  .addSubcommand((s) => s.setName('bug').setDescription('🐛 Signaler un bug du launcher (réponse dans l’appli)'))
  .addSubcommand((s) => s.setName('telecharger').setDescription('Lien de la dernière version de History Launcher'))
  .addSubcommand((s) => s.setName('installer').setDescription('Admin : crée les salons infos, nouveautés et jeux gratuits ici'));

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

const LINK_CHANNEL = process.env.LAUNCHER_LIER_SALON || '1556408553982402671';
export async function handleLauncherCommand(client, interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'telecharger') {
    const rel = await latestRelease().catch(() => null);
    const setup = (rel?.assets ?? []).find((a) => /\.exe$/i.test(a.name));
    return interaction.reply({ content: `# 🚀 History Launcher${rel?.tag_name ? ` ${rel.tag_name}` : ''}\n${setup ? `**[📥 Télécharger l’installateur](${setup.browser_download_url})** · ` : ''}[Site](${SITE})`, ...PRIVATE });
  }
  if (sub === 'opti') return (await import('./optiPro.js')).onOptiProInteraction(Object.assign(interaction, { customId: 'opro:open' }));
  if (sub === 'aide') {
    if (!(await accountByDiscord(interaction.user.id))) return interaction.reply({ content: `🔗 Lie d’abord ton compte History dans <#${LINK_CHANNEL}> : la réponse du support arrive dans ton launcher.`, ...PRIVATE });
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
    const field = (id, label, style, min, max) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMinLength(min).setMaxLength(max).setRequired(true));
    return interaction.showModal(new ModalBuilder().setCustomId('hlaide').setTitle('🆘 Support History Launcher').addComponents(field('title', 'Le souci en quelques mots', TextInputStyle.Short, 4, 100), field('description', 'Explique ce qui se passe', TextInputStyle.Paragraph, 10, 4000)));
  }
  if (sub === 'bug') {
    if (!(await accountByDiscord(interaction.user.id))) return interaction.reply({ content: `🔗 Lie d’abord ton compte History dans <#${LINK_CHANNEL}> : la réponse arrive dans ton launcher.`, ...PRIVATE });
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
    const field = (id, label, style, min, max) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMinLength(min).setMaxLength(max).setRequired(true));
    return interaction.showModal(new ModalBuilder().setCustomId('hlbug').setTitle('🐛 Signaler un bug').addComponents(field('title', 'Le bug en quelques mots', TextInputStyle.Short, 4, 100), field('description', 'Ce que tu faisais, ce qui s’est passé', TextInputStyle.Paragraph, 10, 1500)));
  }
  if (sub === 'pc') {
    const who = interaction.options.getUser('membre') ?? interaction.user, acc = await accountByDiscord(who.id);
    if (!acc) return interaction.reply({ content: who.id === interaction.user.id ? `🔗 Lie ton compte History dans <#${LINK_CHANNEL}> puis lance un benchmark dans Mon PC.` : 'Ce membre n’a pas lié son compte History.', ...PRIVATE });
    const p = await profileOf(acc.id), o = ((await load('opti-pro-specs', {})) ?? {})[acc.id] ?? {};
    const rows = [['🧠 Processeur', p.benchCpu ?? o.cpu], ['🎮 Carte graphique', p.benchGpu ?? o.gpu], ['🧩 Mémoire', o.ramText], ['🔧 Carte mère', o.board], ['❄️ Refroidissement', o.cooling], ['🏁 Benchmark History', p.bench && `${p.bench} points`]].filter(([, v]) => v);
    if (!rows.length) return interaction.reply({ content: 'Pas encore de config : ouvre Mon PC › Performances dans le launcher et lance le benchmark.', ...PRIVATE });
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x619fff).setAuthor({ name: `🖥 PC de ${acc.pseudo}`, iconURL: who.displayAvatarURL() }).setDescription(rows.map(([k, v]) => `**${k}** · ${String(v).slice(0, 120)}`).join('\n')).setFooter({ text: 'Lu par History Launcher' })], allowedMentions: { parse: [] } });
  }
  if (sub === 'installer') {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has('ManageGuild')) return interaction.reply({ content: '❌ Réservé aux admins du serveur (permission « Gérer le serveur »).', ...PRIVATE });
    await interaction.deferReply(PRIVATE);
    const r = await installHere(interaction.guild).catch((err) => ({ error: err.message }));
    return interaction.editReply(r.error ? `❌ Impossible : ${r.error} (le bot a besoin de « Gérer les salons »).` : `✅ Salons prêts : <#${r.infos}> · <#${r.news}> · <#${r.deals}>. Les 3 dernières mises à jour sont postées, les suivantes arriveront toutes seules.`);
  }
  if (sub === 'lier') {
    // Seulement dans #lier-son-compte ; réponse tout de suite (plus de « réfléchit » sans fin), rôles ensuite en fond
    if (interaction.channelId !== LINK_CHANNEL) return interaction.reply({ content: `🔗 Colle cette commande dans le salon <#${LINK_CHANNEL}>.`, ...PRIVATE });
    await interaction.deferReply(PRIVATE);
    const r = await linkDiscord(interaction.options.getString('code', true), interaction.user.id).catch((err) => ({ ok: false, error: err.message }));
    if (!r.ok) return interaction.editReply({ content: `❌ ${r.error}` });
    profileOf(r.id).then((p) => syncMember(client, interaction.user.id, p)).catch(() => {});
    return interaction.editReply({ content: `✅ **Ton compte a bien été lié** au compte History **${r.pseudo}**. Tes rôles arrivent dans quelques secondes.` });
  }
  if (sub === 'comparer') return compareCommand(interaction);
  if (sub === 'fps') return fpsCommand(interaction);
  const user = interaction.options.getUser('membre') ?? interaction.user;
  const acc = await accountByDiscord(user.id);
  if (!acc) {
    return interaction.reply({ content: user.id === interaction.user.id ? `🔗 Ton compte n’est pas encore lié : dans le launcher, ouvre Paramètres › Compte › « Lier Discord », puis colle \`/launcher lier code:XXXXXX\` dans <#${LINK_CHANNEL}>.` : `${user.username} n’a pas lié de compte History.`, ...PRIVATE });
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
    .setFooter({ text: 'zyko144.github.io/vercel-ia-' });
  if (p.benchCpu || p.benchGpu) e.addFields({ name: '🖥 PC', value: [p.benchCpu, p.benchGpu].filter(Boolean).join('\n').slice(0, 200) });
  return e;
}

const avatarPng = (u) => u.displayAvatarURL({ extension: 'png', size: 128 });

/** /launcher comparer : duel de deux comptes liés, en carte GIF. */
async function compareCommand(interaction) {
  const other = interaction.options.getUser('membre', true);
  const me = interaction.options.getUser('avec') ?? interaction.user;
  if (other.id === me.id) return interaction.reply({ content: 'Choisis quelqu’un d’autre pour le duel.', ...PRIVATE });
  const [accA, accB] = await Promise.all([accountByDiscord(me.id), accountByDiscord(other.id)]);
  const missing = [[me, accA], [other, accB]].filter(([, a]) => !a).map(([u]) => (u.id === interaction.user.id ? 'toi' : u.username));
  if (missing.length) return interaction.reply({ content: `🔗 Pas de compte History lié pour ${missing.join(' et ')} : dans le launcher, Paramètres › Compte › « Lier Discord », puis \`/launcher lier\`.`, ...PRIVATE });
  if (!allowAttempt('launcher-card', interaction.user.id, 4, 60_000)) return interaction.reply({ content: '⏳ Attends une minute avant une nouvelle carte.', ...PRIVATE });
  await interaction.deferReply();
  const [a, b] = await Promise.all([profileOf(accA.id), profileOf(accB.id)]);
  try {
    const gif = await compareCardGif({ ...a, pseudo: accA.pseudo }, { ...b, pseudo: accB.pseudo }, { avatarA: avatarPng(me), avatarB: avatarPng(other) });
    return await interaction.editReply({ files: [new AttachmentBuilder(gif, { name: 'history-duel.gif' })] });
  } catch (err) {
    console.error('[launcher] carte duel :', err.message);
    const line = (p, acc) => `**${acc.pseudo}** · niveau ${p.level ?? '–'} · benchmark ${p.bench ?? '–'} · ${hours(p.week || 0)} cette semaine`;
    return interaction.editReply({ content: `⚔️ Duel\n${line(a, accA)}\n${line(b, accB)}` });
  }
}

/** Mesures de FPS d'un jeu (dernière partie de chaque joueur), du plus fluide au moins fluide. */
export async function fpsOf(game) {
  const d = await socialData();
  const g = d.fps?.[gameKey(game)];
  if (!g) return null;
  const accs = (await load('launcher-comptes', null))?.accounts ?? {};
  const rows = Object.entries(g.by).filter(([id]) => accs[id]).map(([id, x]) => ({ pseudo: accs[id].pseudo, ...x, cpu: d.bench2?.[id]?.cpu ?? null, gpu: d.bench2?.[id]?.gpuName ?? null, bench: d.bench2?.[id]?.total ?? null }))
    .sort((a, b) => b.avg - a.avg);
  return { name: g.name, rows };
}
async function fpsCommand(interaction) {
  const q = interaction.options.getString('jeu', true);
  const r = await fpsOf(q);
  if (!r?.rows.length) return interaction.reply({ content: `Personne n’a encore mesuré ses FPS sur **${q.slice(0, 80)}**. Dans le launcher : Paramètres › Jeux › « Mesurer les vrais FPS », puis joue au moins 5 minutes.`, ...PRIVATE });
  const med = r.rows.map((x) => x.avg).sort((a, b) => a - b)[Math.floor(r.rows.length / 2)];
  const e = new EmbedBuilder().setColor(0x22d3ee).setTitle(`📈 FPS sur ${r.name}`)
    .setDescription(r.rows.slice(0, 15).map((x, i) => `**${i + 1}. ${x.pseudo}** · **${x.avg} FPS** (1 % low ${x.low1})${x.gpu || x.cpu ? `\n-# ${[x.gpu, x.cpu].filter(Boolean).join(' · ').slice(0, 120)}` : ''}`).join('\n'))
    .addFields({ name: 'Joueurs', value: String(r.rows.length), inline: true }, { name: 'FPS médians', value: String(med), inline: true })
    .setFooter({ text: 'Mesuré en jeu par History Launcher (PresentMon) · dernière partie de chaque joueur' });
  return interaction.reply({ embeds: [e] });
}
export async function handleLauncherAutocomplete(interaction) {
  const q = gameKey(interaction.options.getFocused() ?? '');
  const d = await socialData();
  const list = Object.entries(d.fps ?? {}).filter(([k]) => !q || k.includes(q)).sort((a, b) => Object.keys(b[1].by).length - Object.keys(a[1].by).length)
    .slice(0, 25).map(([, g]) => ({ name: `${g.name} · ${Object.keys(g.by).length} joueur${Object.keys(g.by).length > 1 ? 's' : ''}`.slice(0, 100), value: g.name.slice(0, 100) }));
  return interaction.respond(list).catch(() => {});
}

// ---------- Clips et captures envoyés depuis le launcher ----------
let clientRef = null;
const DISCORD_MAX = 9.5 * 1024 * 1024;
/** Discord refuse plus de 10 Mo : une vidéo trop lourde est réencodée en 720p H.264 (sans perdre la fin du clip). */
export async function fitForDiscord(buf, ext, seconds = 45) {
  if (buf.length <= DISCORD_MAX) return { buf, ext };
  if (!['webm', 'mp4'].includes(ext)) throw new Error('image trop lourde (10 Mo maximum)');
  const [{ default: ffmpeg }, fs, os, path, { spawn }] = await Promise.all([import('ffmpeg-static'), import('node:fs/promises'), import('node:os'), import('node:path'), import('node:child_process')]);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hclip-'));
  try {
    const src = path.join(dir, `in.${ext}`);
    await fs.writeFile(src, buf);
    // Débit calculé pour remplir au mieux les 10 Mo de Discord (au lieu d'un débit fixe bas) : 1080p si ça tient, sinon 720p
    const best = Math.min(8000, Math.floor(((DISCORD_MAX * 8) / 1000 / Math.max(5, seconds)) * 0.92 - 128));
    for (const kbps of [best, Math.round(best * 0.7), Math.round(best * 0.45)].filter((k) => k >= 250)) {
      const out = path.join(dir, `out-${kbps}.mp4`);
      const height = kbps >= 4000 ? 1080 : 720;
      await new Promise((resolve, reject) => {
        const p = spawn(ffmpeg, ['-y', '-i', src, '-t', '120', '-vf', `scale=-2:'min(${height},ih)'`, '-c:v', 'libx264', '-preset', 'faster', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.15)}k`, '-bufsize', `${kbps * 2}k`, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], { stdio: 'ignore' });
        p.on('error', reject);
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`réencodage impossible (${code})`))));
      });
      const b = await fs.readFile(out);
      if (b.length <= DISCORD_MAX) return { buf: b, ext: 'mp4' };
    }
    throw new Error('clip trop long pour Discord');
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
export async function postClip({ discordId, pseudo, buf, ext, game, note, toDiscordId = null, seconds = 45 }) {
  if (!clientRef) return { ok: false, error: 'Le bot Discord démarre, réessaie dans une minute.' };
  // À un ami précis : en message privé ; sinon dans le salon des clips
  const channel = toDiscordId ? await clientRef.users.fetch(toDiscordId).catch(() => null) : await clipsChannel(clientRef);
  if (!channel?.send) return { ok: false, error: toDiscordId ? 'Impossible de joindre ton ami sur Discord.' : 'Salon des clips introuvable sur Discord.' };
  const file = await fitForDiscord(buf, ext, seconds);
  const kind = ['webm', 'mp4'].includes(file.ext) ? '🎬 un clip' : '📸 une capture';
  const msg = await channel.send({
    content: `**${pseudo}** (<@${discordId}>) partage ${kind}${game ? ` de **${game}**` : ''}${note ? `\n> ${note}` : ''}\n-# Envoyé depuis History Launcher`,
    files: [new AttachmentBuilder(file.buf, { name: `history-${Date.now()}.${file.ext}` })], allowedMentions: { parse: [] },
  });
  return { ok: true, url: msg.url ?? null };
}

// ---------- Parties de groupe : mention des membres liés + boutons « Je viens » / « Pas dispo » ----------
const PARTIES = 'launcher-parties';
function partyView(p) {
  const who = [...p.yes.map((x) => `✅ ${x}`), ...p.no.map((x) => `❌ ${x}`)];
  const e = new EmbedBuilder().setColor(0x2f8bff).setTitle(`🎮 ${p.owner} lance ${p.game ?? 'une partie'}`).setDescription(p.text)
    .addFields({ name: 'Groupe', value: p.group, inline: true }, { name: `Qui vient ? (${p.yes.length})`, value: who.join('\n').slice(0, 1000) || '—', inline: true })
    .setFooter({ text: 'History Launcher · les membres du groupe sont aussi prévenus dans le launcher' }).setTimestamp(p.at);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hlparty:oui:${p.id}`).setLabel('Je viens').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hlparty:non:${p.id}`).setLabel('Pas dispo').setEmoji('❌').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [e], components: [row] };
}
export async function postParty({ group, owner, members, game, text }) {
  if (!clientRef) return { ok: false, error: 'Le bot Discord démarre, réessaie dans une minute.' };
  const channel = await partyChannel(clientRef);
  if (!channel?.isTextBased?.()) return { ok: false, error: 'Salon des parties introuvable sur Discord.' };
  const ping = members.filter((m) => m.discordId && m.id !== owner?.id).map((m) => m.discordId);
  const p = { id: Math.random().toString(36).slice(2, 10), owner: owner?.pseudo ?? '?', ownerId: owner?.id ?? null, group, game, text, yes: [owner?.discordId ? `<@${owner.discordId}>` : owner?.pseudo ?? '?'], no: [], at: Date.now() };
  const msg = await channel.send({ content: ping.length ? ping.map((x) => `<@${x}>`).join(' ') : undefined, ...partyView(p), allowedMentions: { users: ping } });
  const st = (await load(PARTIES, null)) ?? {};
  st[p.id] = p;
  for (const k of Object.keys(st).sort((a, b) => st[a].at - st[b].at).slice(0, Math.max(0, Object.keys(st).length - 50))) delete st[k];
  save(PARTIES, st);
  return { ok: true, mentioned: ping.length, url: msg.url };
}
export async function handlePartyButton(interaction) {
  const [, choice, id] = interaction.customId.split(':');
  const st = (await load(PARTIES, null)) ?? {};
  const p = st[id];
  if (!p || Date.now() - p.at > 12 * 3_600_000) return interaction.reply({ content: 'Cette partie est terminée.', ...PRIVATE });
  const me = `<@${interaction.user.id}>`;
  const was = p.yes.includes(me);
  p.yes = p.yes.filter((x) => x !== me); p.no = p.no.filter((x) => x !== me);
  (choice === 'oui' ? p.yes : p.no).push(me);
  save(PARTIES, st);
  await interaction.update(partyView(p));
  // L'organisateur est prévenu dans le launcher
  if (choice === 'oui' && !was && p.ownerId) {
    const acc = await accountByDiscord(interaction.user.id);
    if (acc?.id !== p.ownerId) await notifyAccount(p.ownerId, { type: 'group', from: acc?.id ?? p.ownerId, group: p.group, text: `${acc?.pseudo ?? interaction.user.username} vient à ta partie (Discord) !` }).catch(() => {});
  }
}

// ---------- Promos en message privé : prix suivis et liste de souhaits Steam, toutes les 6 h ----------
async function checkWatch(client, fetchImpl = fetch) {
  const d = await socialData();
  const accs = (await load('launcher-comptes', null))?.accounts ?? {};
  const { steamPrice, priceAlert } = await import('../../launcher/src/core/gametools.js');
  const { wishlistDeals, newDeals } = await import('../../launcher/src/core/social.js');
  const eur = (v) => `${Number(v).toFixed(2).replace('.', ',')} €`;
  let sent = 0;
  for (const [id, w] of Object.entries(d.watch ?? {})) {
    const acc = accs[id];
    if (!w.dm || !acc?.discordId) continue;
    w.seen ??= {}; w.wish ??= {};
    const embeds = [];
    for (const a of w.alerts ?? []) {
      const now = await steamPrice(a.appId, fetchImpl).catch(() => null);
      if (!now) continue;
      if (now.price > a.target) { delete w.seen[a.appId]; continue; }
      if (!priceAlert({ target: a.target, lastNotified: w.seen[a.appId] ?? null }, now)) continue;
      w.seen[a.appId] = now.price;
      embeds.push(new EmbedBuilder().setColor(0x2ee07a).setTitle(`💸 ${a.name || `Jeu ${a.appId}`} à ${eur(now.price)}`).setURL(`https://store.steampowered.com/app/${a.appId}`)
        .setDescription(`Sous ton prix de ${eur(a.target)}${now.discount ? ` (-${now.discount} %)` : ''}.`));
    }
    if (w.steam) {
      const deals = newDeals(await wishlistDeals(w.steam, fetchImpl).catch(() => []), w.wish);
      for (const x of deals.slice(0, 6)) {
        embeds.push(new EmbedBuilder().setColor(0x22d3ee).setTitle(`${x.name} : -${x.pct} %`).setURL(`https://store.steampowered.com/app/${x.appid}`)
          .setDescription(`${x.before ? `~~${x.before}~~ ` : ''}**${x.price ?? ''}** · dans ta liste de souhaits Steam`).setThumbnail(x.image ?? null));
      }
      for (const x of deals) w.wish[x.appid] = x.pct;
    }
    if (!embeds.length) continue;
    if (process.env.BOT_DM !== '1') continue; // jamais de MP aux membres sans l'accord du chef (BOT_DM=1)
    const user = await client.users.fetch(acc.discordId).catch(() => null);
    await user?.send({ content: '🔔 **Promos pour toi** (History Launcher)\n-# Pour arrêter : Paramètres › Amis & partage › « Promos en message privé Discord ».', embeds: embeds.slice(0, 10) }).then(() => { sent += 1; }).catch(() => {});
  }
  saveSocial(d);
  return sent;
}

/** Donne les bons rôles à un membre (et retire les paliers qui ne s'appliquent plus). */
async function syncMember(client, discordId, profile) {
  const guild = await client.guilds.fetch(HOME_GUILD).catch(() => null);
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
  for (const g of fresh) {
    const until = new Date(g.until).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
    const files = [];
    if (g.image) {
      const img = await fetchImpl(g.image, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
      if (img?.ok) files.push(new AttachmentBuilder(Buffer.from(await img.arrayBuffer()), { name: 'jeu-gratuit.jpg' }));
    }
    const payload = { content: `# 🎁 ${g.name} est gratuit sur Epic Games\nRécupère-le avant le **${until}** : il reste à toi pour toujours.\n-# [Page du jeu](https://store.epicgames.com/fr/p/${g.slug}) · History Launcher te prévient aussi dans l’appli`, files };
    await broadcast(client, 'deals', payload); // salon jeux-gratuits du serveur du launcher
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
  const eur = (c) => `${(c / 100).toFixed(2).replace('.', ',')} €`;
  const embeds = deals.map((x) => new EmbedBuilder().setColor(0x22d3ee).setTitle(`${x.name} : -${x.discount_percent} %`).setURL(`https://store.steampowered.com/app/${x.id}`)
    .setDescription(`~~${eur(x.original_price)}~~ **${eur(x.final_price)}**${x.discount_expiration ? ` · jusqu’au ${new Date(x.discount_expiration * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}` : ''}`)
    .setThumbnail(x.header_image ?? x.large_capsule_image ?? null));
  const payload = { content: '# 🔥 Grosses promos Steam du jour\n-# Suis un prix dans History Launcher (Paramètres › Jeux › Alertes de prix) pour être prévenu sous ton prix.', embeds };
  await broadcast(client, 'deals', payload);
  save('launcher-bons-plans', { ...st, dealsDay: today, dealsSeen: [...seen, ...deals.map((x) => `${x.id}:${x.final_price}`)].slice(-300) });
}

/** Invitation permanente vers le serveur History Launcher (créée une fois par le bot, puis réutilisée). */
export async function launcherInvite() {
  const saved = await load('launcher-invite', null);
  if (saved?.url) return saved.url;
  const { HOME_GUILD } = await import('./launcherServers.js');
  const g = clientRef?.guilds.cache.get(HOME_GUILD);
  const ch = g && (g.systemChannel ?? g.channels.cache.find((c) => c.isTextBased?.() && c.type === 0));
  const inv = ch ? await ch.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: 'Bouton Discord de l’appli' }).catch(() => null) : null;
  if (inv?.url) save('launcher-invite', { url: inv.url });
  return inv?.url ?? null;
}

// Rôle « 🎮 <jeu> » pendant qu'un membre (compte lié) joue dans History Launcher : ajouté au lancement, retiré à la fin.
// Les rôles de jeu vides sont supprimés. Toutes les 60 s, seulement les comptes liés (peu de travail pour Render).
async function syncPlayingRoles(client) {
  const guild = await client.guilds.fetch(HOME_GUILD).catch(() => null);
  if (!guild) return;
  const d = await socialData();
  const want = new Map(); // discordId -> jeu
  for (const a of await linkedAccounts()) {
    const p = d.presence?.[a.id];
    if (p?.playing && Date.now() - (p.seen ?? 0) < 3 * 60_000) want.set(a.discordId, `🎮 ${String(p.playing).replace(/\s+—.*$/, '').slice(0, 90)}`);
  }
  await guild.roles.fetch().catch(() => {});
  const roleFor = async (name) => guild.roles.cache.find((r) => r.name === name) ?? guild.roles.create({ name, color: 0x2ee07a, hoist: true, mentionable: false, reason: 'En jeu dans History Launcher' }).catch(() => null);
  for (const [id, name] of want) {
    const m = await guild.members.fetch(id).catch(() => null);
    if (!m) continue;
    const role = await roleFor(name);
    if (role && !m.roles.cache.has(role.id)) await m.roles.add(role).catch(() => {});
    for (const r of m.roles.cache.values()) if (r.name.startsWith('🎮 ') && r.id !== role?.id) await m.roles.remove(r).catch(() => {});
  }
  for (const r of guild.roles.cache.filter((x) => x.name.startsWith('🎮 ')).values()) {
    for (const m of r.members.values()) if (want.get(m.id) !== r.name) await m.roles.remove(r).catch(() => {});
    if (!r.members.size || ![...want.values()].includes(r.name)) await r.delete('Plus personne en jeu').catch(() => {});
  }
}
export function startLauncherDiscord(client) {
  clientRef = client;
  setInterval(() => syncPlayingRoles(client).catch((err) => console.warn('[rôles en jeu]', err.message)), 60_000).unref();
  setTimeout(() => checkWatch(client).catch((err) => console.warn('[promos mp]', err.message)), 8 * 60_000).unref();
  setInterval(() => checkWatch(client).catch((err) => console.warn('[promos mp]', err.message)), 6 * 3_600_000).unref();
  setTimeout(() => announceDeals(client).catch((err) => console.warn('[bons plans]', err.message)), 4 * 60_000).unref();
  setInterval(() => announceDeals(client).catch((err) => console.warn('[bons plans]', err.message)), 2 * 3_600_000).unref();
  const safe = (f) => () => f(client).catch((err) => console.warn('[launcher discord]', err.message));
  setTimeout(safe(announceFree), 2 * 60_000).unref();
  setInterval(safe(announceFree), 3 * 3_600_000).unref();
  setTimeout(safe(syncAll), 3 * 60_000).unref();
  setInterval(safe(syncAll), 30 * 60_000).unref();
}
export const _test = { announceFree, announceDeals, syncMember, checkWatch, fitForDiscord, setClient: (c) => { clientRef = c; } };

/** Fenêtre de /launcher aide envoyée : même demande que depuis l'appli (réponse visible dans le launcher). */
export async function handleHelpModal(interaction, bug = false) {
  const account = await accountByDiscord(interaction.user.id);
  if (!account) return interaction.reply({ content: '🔗 Lie d’abord ton compte History.', ...PRIVATE });
  if (!allowAttempt('support-create', account.id, 5, 3600000)) return interaction.reply({ content: '⏳ Cinq demandes par heure maximum.', ...PRIVATE });
  const { cleanReport, createTicket } = await import('./launcherSupport.js');
  try {
    await createTicket(account, cleanReport({ title: `${bug ? '🐛 Bug : ' : ''}${interaction.fields.getTextInputValue('title')}`, description: `${interaction.fields.getTextInputValue('description')}\n\n(Envoyé depuis Discord)` }));
    return interaction.reply({ content: '✅ **Demande envoyée !** La réponse arrive dans ton launcher (Paramètres › Aide).', ...PRIVATE });
  } catch (err) { return interaction.reply({ content: `❌ ${err.message}`, ...PRIVATE }); }
}

// Un jeu d'un joueur History vient d'être mis à jour : annonce dans #maj-des-jeux (une fois par jeu et par version)
const updSeen = new Map();
export async function announceGameUpdate({ name, steamId, version }) {
  const key = `${name}|${version}`.toLowerCase();
  if (!clientRef || updSeen.has(key) || Date.now() - (updSeen.get(name.toLowerCase()) ?? 0) < 6 * 3_600_000) return false;
  updSeen.set(key, Date.now()); updSeen.set(name.toLowerCase(), Date.now());
  const notes = steamId ? `https://store.steampowered.com/news/app/${steamId}` : null;
  const embed = new EmbedBuilder().setColor(0x619fff).setTitle(`🆕 ${name} a été mis à jour`).setDescription(`${notes ? `[📰 Lire les patch notes](${notes})\n` : ''}-# Repéré par History Launcher`);
  if (steamId) embed.setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${steamId}/header.jpg`);
  return (await broadcast(clientRef, 'maj', { embeds: [embed] })) > 0;
}

// FPS gagnés après une opti du launcher : annonce anonyme dans #gains-opti (au plus une par jeu toutes les 6 h)
export async function announceOptiGain({ jeu, avant, apres }) {
  const key = `gain|${jeu.toLowerCase()}`;
  if (!clientRef || Date.now() - (updSeen.get(key) ?? 0) < 6 * 3_600_000) return false;
  updSeen.set(key, Date.now());
  const gain = Math.round(((apres - avant) / avant) * 100);
  const embed = new EmbedBuilder().setColor(0x36c995).setTitle(`📈 +${gain} % de FPS sur ${jeu}`).setDescription(`Un joueur History est passé de **${avant}** à **${apres} FPS** en moyenne après l’optimisation du launcher.\n-# Mesuré en vrai pendant ses parties · anonyme`);
  return (await broadcast(clientRef, 'gains', { embeds: [embed] })) > 0;
}
