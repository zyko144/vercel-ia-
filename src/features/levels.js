// Niveaux et XP, carte de profil (parchemin de pirate), récompense du jour et membre de la semaine.
// - XP : 15 à 25 par message (une fois par minute), et de l'XP par minute de vocal (réglable), doublée si achetée.
// - Chaque niveau rapporte 200 pièces d'or (voir economy.js). Mention du membre seulement tous les 5 niveaux.
// - Chaque palier peut donner un rôle (tableau de bord › Mon serveur › Niveaux).
// - Remise à zéro de tout le monde avec la version « pièces d'or » : nouvelle clé de stockage (niveaux-v2).
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { SANS, SERIF } from '../casinho/render/engine.js';
import { LEVEL_REWARD, addGold, dailyMultiplier, goldOf, richest, xpMultiplier } from './economy.js';
import { load, save } from '../storage.js';
import { cfg, parseLevelRoles, setInternal } from './guildConfig.js';
import { weekOf } from './weekly.js';

const KEY = 'niveaux-v2';
export { shopMessage, isShopComponent, handleShopComponent } from './economy.js';
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
  m.xp += amount * xpMultiplier(guild.id, member.id);
  const after = levelFromXp(m.xp).level;
  m.level = after;
  dirty = true;
  if (after > before) await levelUp(guild, member, after, where, after - before);
}

async function levelUp(guild, member, level, where, gained = 1) {
  const reward = LEVEL_REWARD * gained;
  const gold = await addGold(guild.id, member.id, reward);
  const rewards = parseLevelRoles(cfg(guild.id, 'levels.roles'));
  const earned = rewards.filter((r) => r.level <= level).map((r) => r.roleId).filter((id) => guild.roles.cache.has(id) && !member.roles.cache.has(id));
  if (earned.length) await member.roles.add(earned, `Niveau ${level}`).catch(() => {});
  const channelId = cfg(guild.id, 'levels.channelId');
  const channel = (channelId && guild.channels.cache.get(channelId)) || where;
  if (!channel?.isTextBased?.()) return;
  // Mention (notification) seulement tous les 5 niveaux ; sinon le nom, sans ping
  const every = cfg(guild.id, 'levels.pingEvery') || 5;
  const ping = level % every === 0;
  const card = await profileCard(guild, member.user, { levelUp: level, reward }).catch(() => null);
  await channel.send({
    content: `${ping ? '🏴‍☠️🎉' : '🎉'} ${ping ? `${member}` : `**${member.displayName ?? member.user?.username}**`} passe **niveau ${level}** ! **+🪙 ${reward.toLocaleString('fr-FR')} pièces d’or** (bourse : ${gold.toLocaleString('fr-FR')})${earned.length ? ` · nouveau rôle : ${earned.map((id) => `<@&${id}>`).join(', ')}` : ''}`,
    files: card ? [card] : [],
    allowedMentions: { users: ping ? [member.id] : [], roles: [] },
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

// Bord déchiré du parchemin (toujours le même dessin)
const TORN = 'M0,11 L25,13 L50,19 L75,11 L100,12 L125,13 L150,7 L175,12 L200,14 L225,17 L250,6 L275,9 L300,5 L325,17 L350,15 L375,5 L400,20 L425,19 L450,14 L475,14 L500,7 L525,4 L550,12 L575,5 L600,7 L625,8 L650,4 L675,11 L700,11 L725,17 L750,12 L775,14 L800,12 L825,15 L850,11 L875,8 L900,20 L925,20 L950,17 L975,15 L1000,9 L992,28 L991,55 L995,82 L984,110 L990,138 L982,165 L990,192 L981,220 L982,248 L996,275 L993,302 L981,330 L988,358 L980,385 L990,412 L1000,435 L975,426 L950,424 L925,432 L900,435 L875,431 L850,421 L825,424 L800,434 L775,432 L750,434 L725,435 L700,423 L675,433 L650,427 L625,429 L600,433 L575,424 L550,434 L525,426 L500,434 L475,429 L450,433 L425,432 L400,420 L375,423 L350,431 L325,422 L300,433 L275,430 L250,422 L225,426 L200,434 L175,420 L150,433 L125,432 L100,424 L75,431 L50,431 L25,435 L0,435 L13,412 L8,385 L14,358 L10,330 L11,302 L19,275 L12,248 L13,220 L18,192 L7,165 L6,138 L19,110 L17,82 L8,55 L7,28 Z';

/** Carte de profil ou de niveau : un parchemin de pirate déchiré et brûlé sur les bords. */
export async function profileCard(guild, user, { levelUp = null, reward = null } = {}) {
  await data();
  const m = me(guild.id, user.id);
  const { level, into, need } = levelFromXp(m.xp);
  const rank = await rankOf(guild.id, user.id);
  const gold = await goldOf(guild.id, user.id).catch(() => 0);
  const avatar = await avatarData(user);
  const member = guild.members.cache.get(user.id);
  const name = esc((member?.displayName ?? user.username).slice(0, 24));
  const pct = Math.max(0.02, Math.min(1, into / need));
  const every = cfg(guild.id, 'levels.pingEvery') || 5;
  const nextMilestone = Math.ceil((level + 1) / every) * every;
  const badges = [
    // Pas d'emoji dans l'image : les polices du serveur ne les dessinent pas
    m.messages >= 1000 ? 'BAVARD · 1000 MESSAGES' : m.messages >= 100 ? '100 MESSAGES' : null,
    m.voiceMin >= 600 ? '10 H DE VOCAL' : m.voiceMin >= 60 ? '1 H DE VOCAL' : null,
    m.streak >= 7 ? `SÉRIE DE ${m.streak} JOURS` : null,
    m.weekWins ? `${m.weekWins}× MEMBRE DE LA SEMAINE` : null,
  ].filter(Boolean).slice(0, 3);
  const W = 1000;
  const H = 440;
  const ink = '#3b2412';
  const red = '#8c1c13';
  const stat = (x, label, value) => `<text x="${x}" y="330" font-size="15" letter-spacing="2" fill="#6b4a2a">${label}</text><text x="${x}" y="362" font-family="${SERIF}" font-size="28" fill="${ink}">${value}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="paper" cx="45%" cy="40%" r="75%"><stop offset="0" stop-color="#f3e4bf"/><stop offset="0.55" stop-color="#e2c992"/><stop offset="0.85" stop-color="#b98d4f"/><stop offset="1" stop-color="#6e4520"/></radialGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.1  0 0 0 0.16 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="burn" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="120%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.55"/></filter>
    <clipPath id="torn"><path d="${TORN}"/></clipPath>
    <clipPath id="round"><circle cx="165" cy="175" r="98"/></clipPath>
    <linearGradient id="bar" x1="0" x2="1"><stop offset="0" stop-color="#8c5a1e"/><stop offset="1" stop-color="#d9a441"/></linearGradient>
  </defs>
  <g filter="url(#shadow)"><path d="${TORN}" fill="url(#paper)"/></g>
  <g clip-path="url(#torn)">
    <rect width="${W}" height="${H}" filter="url(#grain)" fill="#000"/>
    <path d="${TORN}" fill="none" stroke="#2a1606" stroke-width="26" stroke-opacity="0.55" filter="url(#burn)"/>
    <path d="${TORN}" fill="none" stroke="#120802" stroke-width="7" stroke-opacity="0.8" filter="url(#burn)"/>
  </g>
  <circle cx="165" cy="175" r="108" fill="none" stroke="${ink}" stroke-width="4" stroke-dasharray="10 6"/>
  <circle cx="165" cy="175" r="100" fill="#c9a86a"/>
  ${avatar ? `<image href="${avatar}" x="67" y="77" width="196" height="196" clip-path="url(#round)" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <g font-family="${SANS}" font-weight="700">
    <text x="300" y="${levelUp ? 92 : 100}" font-family="${SERIF}" font-size="${levelUp ? 26 : 22}" letter-spacing="3" fill="${levelUp ? red : '#6b4a2a'}">${levelUp ? `NIVEAU ${level} ATTEINT !` : 'CARNET DE BORD'}</text>
    <text x="300" y="${levelUp ? 150 : 158}" font-family="${SERIF}" font-size="48" fill="${ink}">${name}</text>
    ${reward ? `<text x="300" y="186" font-size="20" fill="${red}">+ ${reward.toLocaleString('fr-FR')} PIÈCES D’OR</text>` : ''}
    <text x="${W - 60}" y="96" font-size="17" letter-spacing="2" fill="#6b4a2a" text-anchor="end">RANG</text>
    <text x="${W - 60}" y="146" font-family="${SERIF}" font-size="52" fill="${red}" text-anchor="end">#${rank}</text>
    <text x="${W - 190}" y="96" font-size="17" letter-spacing="2" fill="#6b4a2a" text-anchor="end">NIVEAU</text>
    <text x="${W - 190}" y="146" font-family="${SERIF}" font-size="52" fill="${ink}" text-anchor="end">${level}</text>
    <rect x="300" y="214" width="${W - 360}" height="30" rx="15" fill="#a88452" fill-opacity="0.45" stroke="${ink}" stroke-opacity="0.5"/>
    <rect x="300" y="214" width="${Math.round((W - 360) * pct)}" height="30" rx="15" fill="url(#bar)"/>
    <text x="${W - 72}" y="235" font-size="16" fill="${ink}" text-anchor="end">${into.toLocaleString('fr-FR')} / ${need.toLocaleString('fr-FR')} XP</text>
    <text x="300" y="274" font-size="15" fill="#6b4a2a">PROCHAIN PALIER : NIVEAU ${nextMilestone} · CHAQUE NIVEAU = ${LEVEL_REWARD} PIÈCES</text>
    <line x1="60" y1="300" x2="${W - 60}" y2="300" stroke="${ink}" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="3 7"/>
    ${stat(70, 'PIÈCES D’OR', gold.toLocaleString('fr-FR'))}
    ${stat(290, 'MESSAGES', m.messages.toLocaleString('fr-FR'))}
    ${stat(490, 'VOCAL', `${Math.round(m.voiceMin / 60)} h`)}
    ${stat(650, 'SÉRIE', `${m.streak} j`)}
    ${stat(800, 'XP TOTALE', m.xp.toLocaleString('fr-FR'))}
    <text x="70" y="404" font-size="14" letter-spacing="2" fill="${red}">${esc(badges.join('   ·   ') || 'EN ROUTE POUR LE TRÉSOR')}</text>
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
  const rich = await richest(guild.id, 5).catch(() => []);
  const embed = new EmbedBuilder().setColor(0xd9a441).setTitle(`🏴‍☠️ Classement de l’équipage · ${guild.name}`)
    .setDescription(list.length ? list.map(([id, m], i) => `${medals[i] ?? `**${i + 1}.**`} <@${id}> · niveau **${levelFromXp(m.xp).level}** · ${m.xp.toLocaleString('fr-FR')} XP`).join('\n') : 'Personne n’a encore d’XP : écrivez, parlez en vocal !');
  if (rich.some((r) => r.gold > 0)) embed.addFields({ name: '🪙 Les plus riches', value: rich.filter((r) => r.gold > 0).map((r, i) => `${medals[i] ?? `**${i + 1}.**`} <@${r.userId}> · 🪙 ${r.gold.toLocaleString('fr-FR')}`).join('\n') });
  return embed;
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
  const amount = (cfg(guildId, 'daily.amount') + Math.min(7, m.streak) * cfg(guildId, 'daily.streak')) * dailyMultiplier(guildId, userId);
  const total = await addGold(guildId, userId, amount);
  dirty = true;
  return { ok: true, amount, streak: m.streak, balance: total };
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
