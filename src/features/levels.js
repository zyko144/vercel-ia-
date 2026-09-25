// Niveaux et XP, carte de profil, récompense du jour, boutique à jetons, rôle personnalisé et membre de la semaine.
// - XP : 15 à 25 par message (une fois par minute), et de l'XP par minute de vocal (réglable).
// - Chaque palier peut donner un rôle (tableau de bord › Mon serveur › Niveaux).
// - Les jetons sont ceux du casino (même banque) : récompense du jour, boutique, rôle personnalisé.
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { SANS } from '../casinho/render/engine.js';
import { balance, grant } from '../casinho/economy.js';
import { load, save } from '../storage.js';
import { buildModal, field as f, readModal } from '../panels/ui.js';
import { cfg, parseLevelRoles, parseShopItems, setInternal } from './guildConfig.js';
import { COLORS } from './tickets.js';
import { weekOf } from './weekly.js';

const KEY = 'niveaux';
const PRIVATE = { flags: MessageFlags.Ephemeral };
const MSG_COOLDOWN = 60_000;
const DAY = 86_400_000;
const TZ = 'Europe/Paris';

let store = null; // { [guildId]: { [userId]: { xp, level, messages, voiceMin, lastXp, dailyAt, streak, weekWins } } }
let dirty = false;
async function data() {
  store ??= (await load(KEY, {}).catch(() => ({}))) ?? {};
  return store;
}
function me(guildId, userId) {
  const g = (store[guildId] ??= {});
  return (g[userId] ??= { xp: 0, level: 0, messages: 0, voiceMin: 0, lastXp: 0, dailyAt: 0, streak: 0, weekWins: 0 });
}

/** XP pour passer du niveau n au suivant (courbe douce au début, plus longue ensuite). */
export const xpFor = (n) => 5 * n * n + 50 * n + 100;
function levelFromXp(xp) {
  let level = 0;
  let rest = xp;
  while (rest >= xpFor(level)) rest -= xpFor(level++);
  return { level, into: rest, need: xpFor(level) };
}

// ===================== Gagner de l'XP =====================

/** Un message : de l'XP (une fois par minute) et, peut-être, un niveau de plus. */
export async function xpForMessage(message) {
  if (!message.inGuild() || message.author.bot || !cfg(message.guildId, 'levels.enabled')) return;
  await data();
  const m = me(message.guildId, message.author.id);
  m.messages += 1;
  dirty = true;
  if (Date.now() - m.lastXp < MSG_COOLDOWN) return;
  m.lastXp = Date.now();
  await addXp(message.guild, message.member, 15 + Math.floor(Math.random() * 11), message.channel);
}

async function addXp(guild, member, amount, where) {
  if (!member) return;
  const m = me(guild.id, member.id);
  const before = levelFromXp(m.xp).level;
  m.xp += amount;
  const after = levelFromXp(m.xp).level;
  m.level = after;
  dirty = true;
  if (after > before) await levelUp(guild, member, after, where);
}

async function levelUp(guild, member, level, where) {
  const rewards = parseLevelRoles(cfg(guild.id, 'levels.roles'));
  const earned = rewards.filter((r) => r.level <= level).map((r) => r.roleId).filter((id) => guild.roles.cache.has(id) && !member.roles.cache.has(id));
  if (earned.length) await member.roles.add(earned, `Niveau ${level}`).catch(() => {});
  const channelId = cfg(guild.id, 'levels.channelId');
  const channel = (channelId && guild.channels.cache.get(channelId)) || where;
  if (!channel?.isTextBased?.()) return;
  const card = await profileCard(guild, member.user, { levelUp: level }).catch(() => null);
  await channel.send({
    content: `🎉 ${member} passe **niveau ${level}** !${earned.length ? ` Nouveau rôle : ${earned.map((id) => `<@&${id}>`).join(', ')}` : ''}`,
    files: card ? [card] : [],
    allowedMentions: { users: [member.id] },
  }).catch(() => {});
}

/** Toutes les minutes : XP pour le vocal (au moins 2 personnes, pas en sourdine). */
export function startLevelLoops(client) {
  setInterval(async () => {
    await data();
    for (const guild of client.guilds.cache.values()) {
      if (!cfg(guild.id, 'levels.enabled')) continue;
      const perMinute = cfg(guild.id, 'levels.voiceXp');
      for (const channel of guild.channels.cache.filter((c) => c.isVoiceBased?.()).values()) {
        const humans = channel.members.filter((m) => !m.user.bot);
        if (humans.size < 2) continue;
        for (const member of humans.values()) {
          if (member.voice.selfDeaf || member.voice.serverDeaf) continue;
          me(guild.id, member.id).voiceMin += 1;
          if (perMinute) await addXp(guild, member, perMinute, null);
        }
      }
    }
  }, 60_000).unref();
  setInterval(() => {
    if (!dirty) return;
    dirty = false;
    save(KEY, store);
  }, 30_000).unref();
  // Membre de la semaine : le lundi matin, pour la semaine écoulée
  setInterval(() => weekMemberTick(client).catch((err) => console.warn('[membre de la semaine]', err.message)), 15 * 60_000).unref();
}

// ===================== Carte de profil (image néon) =====================

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function avatarData(user) {
  try {
    const res = await fetch(user.displayAvatarURL({ extension: 'png', size: 128 }));
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Rang d'un membre dans le classement du serveur (1 = premier). */
async function rankOf(guildId, userId) {
  await data();
  const list = Object.entries(store[guildId] ?? {}).sort((a, b) => b[1].xp - a[1].xp);
  return list.findIndex(([id]) => id === userId) + 1 || list.length + 1;
}

export async function profileCard(guild, user, { levelUp = null } = {}) {
  await data();
  const m = me(guild.id, user.id);
  const { level, into, need } = levelFromXp(m.xp);
  const rank = await rankOf(guild.id, user.id);
  const chips = await balance(user.id).catch(() => 0);
  const avatar = await avatarData(user);
  const member = guild.members.cache.get(user.id);
  const name = esc((member?.displayName ?? user.username).slice(0, 22));
  const color = levelUp ? '#3dff9a' : '#5ff0ff';
  const pct = Math.max(0.02, Math.min(1, into / need));
  const badges = [
    // Pas d'emoji dans l'image : les polices du serveur ne les dessinent pas
    m.messages >= 1000 ? 'BAVARD · 1000 MESSAGES' : m.messages >= 100 ? '100 MESSAGES' : null,
    m.voiceMin >= 600 ? '10 H DE VOCAL' : m.voiceMin >= 60 ? '1 H DE VOCAL' : null,
    m.streak >= 7 ? `SÉRIE DE ${m.streak} JOURS` : null,
    m.weekWins ? `${m.weekWins}× MEMBRE DE LA SEMAINE` : null,
  ].filter(Boolean).slice(0, 3);
  const W = 800;
  const H = 260;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="25%" cy="30%" r="95%"><stop offset="0" stop-color="#1b1026"/><stop offset="0.6" stop-color="#0b0812"/><stop offset="1" stop-color="#050408"/></radialGradient>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="round"><circle cx="130" cy="130" r="78"/></clipPath>
    <linearGradient id="bar" x1="0" x2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#ff5fd2"/></linearGradient>
    <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="${color}" stroke-opacity="0.06"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" rx="24" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" rx="24" fill="url(#grid)"/>
  <rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="20" fill="none" stroke="${color}" stroke-width="2.5" filter="url(#glow)" opacity="0.9"/>
  <circle cx="130" cy="130" r="84" fill="none" stroke="${color}" stroke-width="4" filter="url(#glow)"/>
  ${avatar ? `<image href="${avatar}" x="52" y="52" width="156" height="156" clip-path="url(#round)" preserveAspectRatio="xMidYMid slice"/>` : `<circle cx="130" cy="130" r="78" fill="#241a33"/>`}
  <g font-family="${SANS}" font-weight="700">
    <text x="245" y="${levelUp ? 70 : 78}" font-size="34" fill="#ffffff">${name}</text>
    ${levelUp ? `<text x="245" y="104" font-size="20" fill="${color}" filter="url(#glow)">NIVEAU ${level} ATTEINT !</text>` : ''}
    <text x="${W - 40}" y="70" font-size="18" fill="#a9b0c0" text-anchor="end">RANG <tspan font-size="34" fill="${color}">#${rank}</tspan></text>
    <text x="${W - 40}" y="112" font-size="18" fill="#a9b0c0" text-anchor="end">NIVEAU <tspan font-size="34" fill="#ff5fd2">${level}</tspan></text>
    <rect x="245" y="140" width="${W - 285}" height="26" rx="13" fill="#1d1628" stroke="#2f2540"/>
    <rect x="245" y="140" width="${Math.round((W - 285) * pct)}" height="26" rx="13" fill="url(#bar)" filter="url(#glow)"/>
    <text x="${W - 48}" y="159" font-size="15" fill="#ffffff" text-anchor="end">${into.toLocaleString('fr-FR')} / ${need.toLocaleString('fr-FR')} XP</text>
    <text x="245" y="205" font-size="16" fill="#cfd3e0">MESSAGES <tspan fill="#ffffff">${m.messages.toLocaleString('fr-FR')}</tspan>   ·   VOCAL <tspan fill="#ffffff">${Math.round(m.voiceMin / 60)} h</tspan>   ·   JETONS <tspan fill="#ffffff">${chips.toLocaleString('fr-FR')}</tspan></text>
    <text x="245" y="235" font-size="13" letter-spacing="1.5" fill="${color}">${esc(badges.join('   ·   '))}</text>
  </g>
</svg>`;
  const { default: sharp } = await import('sharp');
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new AttachmentBuilder(png, { name: levelUp ? 'niveau.png' : 'profil.png' });
}

// ===================== Classement =====================

/** Les 10 premiers du serveur (pour le tableau de bord). */
export async function topLevels(guildId, n = 10) {
  await data();
  return Object.entries(store[guildId] ?? {}).sort((a, b) => b[1].xp - a[1].xp).slice(0, n)
    .map(([userId, m]) => ({ userId, xp: m.xp, level: levelFromXp(m.xp).level, messages: m.messages ?? 0, voiceMin: m.voiceMin ?? 0, streak: m.streak ?? 0 }));
}

export async function leaderboardEmbed(guild) {
  await data();
  const list = Object.entries(store[guild.id] ?? {}).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
  const medals = ['🥇', '🥈', '🥉'];
  return new EmbedBuilder().setColor(0x5ff0ff).setTitle(`📈 Classement des niveaux · ${guild.name}`)
    .setDescription(list.length ? list.map(([id, m], i) => `${medals[i] ?? `**${i + 1}.**`} <@${id}> · niveau **${levelFromXp(m.xp).level}** · ${m.xp.toLocaleString('fr-FR')} XP`).join('\n') : 'Personne n’a encore d’XP : écrivez, parlez en vocal !');
}

// ===================== Récompense du jour =====================

const dayOf = (at) => new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

export async function claimDaily(guildId, userId) {
  await data();
  const m = me(guildId, userId);
  const now = Date.now();
  if (m.dailyAt && dayOf(m.dailyAt) === dayOf(now)) return { ok: false };
  m.streak = m.dailyAt && dayOf(m.dailyAt) === dayOf(now - DAY) ? m.streak + 1 : 1;
  m.dailyAt = now;
  const amount = cfg(guildId, 'daily.amount') + Math.min(7, m.streak) * cfg(guildId, 'daily.streak');
  const total = await grant(userId, amount);
  dirty = true;
  return { ok: true, amount, streak: m.streak, balance: total };
}

// ===================== Boutique =====================

export async function shopMessage(guild, userId) {
  const items = parseShopItems(cfg(guild.id, 'shop.items')).filter((i) => guild.roles.cache.has(i.roleId));
  const chips = await balance(userId).catch(() => 0);
  const custom = cfg(guild.id, 'shop.customRolePrice');
  const embed = new EmbedBuilder().setColor(0xffc94d).setTitle('🛒 Boutique du serveur')
    .setDescription([
      `Ton solde : **🪙 ${chips.toLocaleString('fr-FR')}**`,
      '',
      items.length ? items.map((i) => `**${i.name}** · <@&${i.roleId}> · 🪙 ${i.price.toLocaleString('fr-FR')}`).join('\n') : '_Aucun article pour l’instant (tableau de bord › Mon serveur › Boutique)._',
      custom ? `\n🎨 **Rôle personnalisé** (ton nom, ta couleur, validé par le staff) · 🪙 ${custom.toLocaleString('fr-FR')}` : null,
    ].filter((x) => x !== null).join('\n'));
  const rows = [];
  if (items.length) {
    const { StringSelectMenuBuilder } = await import('discord.js');
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sh:buy').setPlaceholder('Acheter un article')
      .addOptions(items.slice(0, 25).map((i) => ({ label: i.name.slice(0, 100), value: i.id, description: `${i.price} jetons` })))));
  }
  if (custom) rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('sh:custom').setLabel('Demander un rôle personnalisé').setEmoji('🎨').setStyle(ButtonStyle.Primary)));
  return { embeds: [embed], components: rows };
}

const CUSTOM_FIELDS = () => [
  f.text('nom', 'Nom du rôle', { req: true, max: 40, ph: 'Ex : 👑 Le Boss' }),
  f.choice('couleur', 'Couleur', Object.entries(COLORS).map(([value, c]) => ({ label: c.label, value, emoji: c.emoji }))),
  f.text('hex', 'Ou une couleur précise (#RRGGBB)', { max: 7, ph: '#ff5fd2' }),
];

export const isShopComponent = (interaction) => /^sh:/.test(interaction.customId ?? '');

export async function handleShopComponent(client, interaction) {
  const [, what, ref] = interaction.customId.split(':');
  const guild = interaction.guild;
  if (what === 'buy') {
    const item = parseShopItems(cfg(guild.id, 'shop.items')).find((i) => i.id === interaction.values[0]);
    if (!item || !guild.roles.cache.has(item.roleId)) return interaction.reply({ content: '❌ Cet article n’existe plus.', ...PRIVATE });
    if (interaction.member.roles.cache.has(item.roleId)) return interaction.reply({ content: '✅ Tu l’as déjà.', ...PRIVATE });
    if ((await balance(interaction.user.id)) < item.price) return interaction.reply({ content: `❌ Il te faut 🪙 ${item.price.toLocaleString('fr-FR')}.`, ...PRIVATE });
    const ok = await interaction.member.roles.add(item.roleId, `Boutique : ${item.name}`).then(() => true, () => false);
    if (!ok) return interaction.reply({ content: '❌ Je ne peux pas donner ce rôle (il est au-dessus du mien).', ...PRIVATE });
    const left = await grant(interaction.user.id, -item.price);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setDescription(`✅ Acheté : **${item.name}** (<@&${item.roleId}>). Il te reste 🪙 ${left.toLocaleString('fr-FR')}.`)], ...PRIVATE });
  }
  if (what === 'custom') return interaction.showModal(buildModal('sh:customsend', '🎨 Mon rôle personnalisé', CUSTOM_FIELDS()));
  if (what === 'customsend') {
    const { values, error } = await readModal(interaction, CUSTOM_FIELDS());
    if (error) return interaction.reply({ content: `❌ ${error}`, ...PRIVATE });
    const price = cfg(guild.id, 'shop.customRolePrice');
    const hex = /^#?[0-9a-f]{6}$/i.test(values.hex ?? '') ? parseInt(values.hex.replace('#', ''), 16) : COLORS[values.couleur]?.value ?? COLORS.violet.value;
    const channel = guild.channels.cache.get(cfg(guild.id, 'shop.requestsChannelId') ?? '');
    if (!channel?.isTextBased?.()) return interaction.reply({ content: '❌ Le salon des demandes n’est pas réglé (tableau de bord › Mon serveur › Boutique).', ...PRIVATE });
    if ((await balance(interaction.user.id)) < price) return interaction.reply({ content: `❌ Il te faut 🪙 ${price.toLocaleString('fr-FR')}.`, ...PRIVATE });
    await grant(interaction.user.id, -price); // remboursé si le staff refuse
    const id = Math.random().toString(36).slice(2, 10);
    const all = (await load('demandes-roles', {}).catch(() => ({}))) ?? {};
    all[id] = { guildId: guild.id, userId: interaction.user.id, name: values.nom, color: hex, price, at: Date.now() };
    save('demandes-roles', all);
    await channel.send({
      embeds: [new EmbedBuilder().setColor(hex).setTitle('🎨 Demande de rôle personnalisé')
        .setDescription(`${interaction.user} veut le rôle **${values.nom}**`)
        .addFields({ name: 'Couleur', value: `#${hex.toString(16).padStart(6, '0')} (couleur de cet embed)`, inline: true }, { name: 'Payé', value: `🪙 ${price.toLocaleString('fr-FR')}`, inline: true })
        .setThumbnail(interaction.user.displayAvatarURL({ size: 64 }))],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`sh:accept:${id}`).setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sh:refuse:${id}`).setLabel('Refuser (remboursé)').setEmoji('✖️').setStyle(ButtonStyle.Danger),
      )],
      allowedMentions: { parse: [] },
    });
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(hex).setDescription(`📨 Demande envoyée au staff : **${values.nom}**. Tu seras prévenu en MP (remboursé si c’est refusé).`)], ...PRIVATE });
  }
  if (what === 'accept' || what === 'refuse') {
    if (!interaction.memberPermissions?.has(P.ManageRoles)) return interaction.reply({ content: '🔒 Il faut pouvoir gérer les rôles.', ...PRIVATE });
    const all = (await load('demandes-roles', {}).catch(() => ({}))) ?? {};
    const req = all[ref];
    if (!req) return interaction.reply({ content: 'Cette demande a déjà été traitée.', ...PRIVATE });
    delete all[ref];
    save('demandes-roles', all);
    const user = await client.users.fetch(req.userId).catch(() => null);
    if (what === 'refuse') {
      await grant(req.userId, req.price);
      await user?.send(`✖️ Ta demande de rôle **${req.name}** sur **${guild.name}** a été refusée. Tes 🪙 ${req.price.toLocaleString('fr-FR')} jetons te sont rendus.`).catch(() => {});
      return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `Refusé par ${interaction.user.username} · remboursé` })], components: [] });
    }
    const me = guild.members.me;
    const role = await guild.roles.create({ name: req.name, color: req.color, position: Math.max(1, me.roles.highest.position - 1), reason: `Rôle personnalisé accepté par ${interaction.user.username}` }).catch(() => null);
    if (!role) return interaction.reply({ content: '❌ Impossible de créer le rôle (permission « Gérer les rôles » ?).', ...PRIVATE });
    const member = await guild.members.fetch(req.userId).catch(() => null);
    await member?.roles.add(role).catch(() => {});
    await user?.send(`✅ Ton rôle **${req.name}** sur **${guild.name}** est accepté et t’a été donné 🎉`).catch(() => {});
    return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `Accepté par ${interaction.user.username}` })], components: [] });
  }
  return undefined;
}

// ===================== Membre de la semaine =====================

async function weekMemberTick(client) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  if (now.getDay() !== 1 || now.getHours() < 10) return;
  const lastWeek = weekOf(Date.now() - 7 * DAY);
  const activity = (await load('activite', {}).catch(() => ({}))) ?? {};
  for (const guild of client.guilds.cache.values()) {
    if (!cfg(guild.id, 'weekMember.enabled') || cfg(guild.id, 'weekMember.lastWeek') === lastWeek) continue;
    setInternal(guild.id, 'weekMember.lastWeek', lastWeek);
    const users = activity[guild.id]?.[lastWeek]?.users ?? {};
    const [winnerId, count] = Object.entries(users).sort((a, b) => b[1] - a[1])[0] ?? [];
    if (!winnerId) continue;
    await data();
    me(guild.id, winnerId).weekWins += 1;
    dirty = true;
    const roleId = cfg(guild.id, 'weekMember.roleId');
    if (roleId && guild.roles.cache.has(roleId)) {
      for (const member of guild.roles.cache.get(roleId).members.values()) await member.roles.remove(roleId).catch(() => {});
      await (await guild.members.fetch(winnerId).catch(() => null))?.roles.add(roleId).catch(() => {});
    }
    const channel = guild.channels.cache.get(cfg(guild.id, 'weekMember.channelId') ?? '');
    if (!channel?.isTextBased?.()) continue;
    const user = await client.users.fetch(winnerId).catch(() => null);
    const card = user ? await profileCard(guild, user).catch(() => null) : null;
    await channel.send({
      content: `⭐ **Membre de la semaine : <@${winnerId}>** avec ${count} messages ! Bravo 🎉${roleId ? ` (rôle <@&${roleId}> pour 7 jours)` : ''}`,
      files: card ? [card] : [],
      allowedMentions: { users: [winnerId] },
    }).catch(() => {});
  }
}
