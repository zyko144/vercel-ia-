// Niveaux et XP, carte de profil (parchemin de pirate), récompense du jour et membre de la semaine.
// - XP : 15 à 25 par message (une fois par minute), et de l'XP par minute de vocal (réglable), doublée si achetée.
// - Chaque niveau rapporte 200 pièces d'or (voir economy.js). Mention du membre seulement tous les 5 niveaux.
// - Chaque palier peut donner un rôle (tableau de bord › Mon serveur › Niveaux).
// - Remise à zéro de tout le monde avec la version « pièces d'or » : nouvelle clé de stockage (niveaux-v2).
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { SANS, SERIF } from '../casinho/render/engine.js';
import { LEVEL_REWARD, THEMES, addGold, cosmeticsOf, data as economyData, dailyMultiplier, giveItem, goldOf, purse, richest, xpMultiplier } from './economy.js';
import { load, save } from '../storage.js';
import { cfg, parseLevelRoles, setInternal } from './guildConfig.js';
import { weekOf } from './weekly.js';
import { questProgress } from './treasury.js';

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
// Titres de l'équipage, du mousse à l'amiral
export const TITLES = [[0, 'Mousse'], [5, 'Matelot'], [10, 'Canonnier'], [15, 'Quartier-maître'], [20, 'Bosco'], [30, 'Second'], [40, 'Capitaine'], [50, 'Amiral']];
export const titleOf = (level) => TITLES.filter(([n]) => level >= n).at(-1)[1];
export const PRESTIGE_LEVEL = 50;
const PRESTIGE_GOLD = 5000;
const prestigeBonus = (m) => 1 + Math.min(5, m.prestige ?? 0) * 0.1; // +10 % d'XP par prestige (50 % max)
const monthKey = () => new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(new Date());
const ids = (lines = []) => new Set([lines].flat().map((l) => String(l).match(/\d{15,21}/)?.[0]).filter(Boolean));
/** Salons où l'on ne gagne pas d'XP (et leurs fils). */
const noXp = (guildId, channel) => {
  const set = ids(cfg(guildId, 'levels.noXpChannels'));
  return !!channel && (set.has(channel.id) || set.has(channel.parentId ?? '') || set.has(channel.parent?.parentId ?? ''));
};
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
  questProgress(message.guildId, message.author.id, 'msg').catch(() => {});
  if (noXp(message.guildId, message.channel)) return;
  if (Date.now() - m.lastXp < MSG_COOLDOWN) return;
  m.lastXp = Date.now();
  // Les messages très courts (« ok », « mdr ») rapportent trois fois moins
  const short = (message.content ?? '').trim().length < 6;
  const amount = 15 + Math.floor(Math.random() * 11);
  await addXp(message.guild, message.member, short ? Math.ceil(amount / 3) : amount, message.channel);
}

/** Une réaction posée : un peu d'XP (une fois par minute). */
export async function xpForReaction(reaction, user) {
  const message = reaction.message;
  if (user.bot || !message.guildId || !cfg(message.guildId, 'levels.enabled')) return;
  if (message.author?.id === user.id || noXp(message.guildId, message.channel)) return;
  await data();
  const m = me(message.guildId, user.id);
  if (Date.now() - (m.lastReact ?? 0) < MSG_COOLDOWN) return;
  m.lastReact = Date.now();
  const member = message.guild.members.cache.get(user.id) ?? await message.guild.members.fetch(user.id).catch(() => null);
  await addXp(message.guild, member, 3, null);
}

async function addXp(guild, member, amount, where) {
  if (!member) return;
  const m = me(guild.id, member.id);
  const before = levelFromXp(m.xp).level;
  const gained = Math.round(amount * xpMultiplier(guild.id, member.id) * prestigeBonus(m));
  m.xp += gained;
  const month = monthKey();
  if (m.month?.key !== month) m.month = { key: month, xp: 0 };
  m.month.xp += gained;
  const after = levelFromXp(m.xp).level;
  m.level = after;
  dirty = true;
  if (after > before) await levelUp(guild, member, after, where, after - before);
}

async function levelUp(guild, member, level, where, gained = 1) {
  const reward = LEVEL_REWARD * gained;
  const gold = await addGold(guild.id, member.id, reward, `Niveau ${level}`);
  // Un coffre au trésor tous les 10 niveaux, rangé dans la cale
  const chests = Math.floor(level / 10) - Math.floor((level - gained) / 10);
  for (let i = 0; i < chests; i++) await giveItem(guild.id, member.id, 'coffre');
  const newTitle = titleOf(level) !== titleOf(level - gained) ? titleOf(level) : null;
  const rewards = parseLevelRoles(cfg(guild.id, 'levels.roles'));
  const earned = rewards.filter((r) => r.level <= level).map((r) => r.roleId).filter((id) => guild.roles.cache.has(id) && !member.roles.cache.has(id));
  if (earned.length) await member.roles.add(earned, `Niveau ${level}`).catch(() => {});
  const channelId = cfg(guild.id, 'levels.channelId');
  const channel = (channelId && guild.channels.cache.get(channelId)) || where;
  if (!channel?.isTextBased?.()) return;
  // Mention (notification) seulement tous les 5 niveaux ; sinon le nom, sans ping
  const every = cfg(guild.id, 'levels.pingEvery') || 5;
  const ping = level % every === 0;
  // Grand palier (tous les 10 niveaux) : la carte est animée
  const big = level % 10 === 0;
  const card = await (big ? profileGif : profileCard)(guild, member.user, { levelUp: level, reward }).catch(() => null)
    ?? await profileCard(guild, member.user, { levelUp: level, reward }).catch(() => null);
  await channel.send({
    content: `${ping ? '🏴‍☠️🎉' : '🎉'} ${ping ? `${member}` : `**${member.displayName ?? member.user?.username}**`} passe **niveau ${level}** ! **+🪙 ${reward.toLocaleString('fr-FR')} pièces d’or** (bourse : ${gold.toLocaleString('fr-FR')})${chests ? ` · **📦 ${chests > 1 ? `${chests} coffres` : 'un coffre au trésor'}** dans ta cale` : ''}${newTitle ? ` · nouveau titre : **${newTitle}**` : ''}${level >= PRESTIGE_LEVEL && level - gained < PRESTIGE_LEVEL ? ' · ⭐ **le prestige est débloqué** (/serveur › Prestige)' : ''}${earned.length ? ` · nouveau rôle : ${earned.map((id) => `<@&${id}>`).join(', ')}` : ''}`,
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
          questProgress(guild.id, member.id, 'voc').catch(() => {});
          if (perMinute && !noXp(guild.id, channel)) await addXp(guild, member, perMinute, null);
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

/** Le dessin (SVG) de la carte : un parchemin de pirate déchiré et brûlé sur les bords. */
async function cardSvg(guild, user, { levelUp = null, reward = null, banner = null, shine = null } = {}) {
  await data();
  const m = me(guild.id, user.id);
  const { level, into, need } = levelFromXp(m.xp);
  const rank = await rankOf(guild.id, user.id);
  const gold = await goldOf(guild.id, user.id).catch(() => 0); // charge aussi l'économie (thème, badges)
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
  ].filter(Boolean);
  const looks = cosmeticsOf(guild.id, user.id);
  badges.unshift(...looks.badges);
  badges.length = Math.min(badges.length, 3);
  const [light, mid, dark] = THEMES[looks.theme]?.colors ?? ['#f3e4bf', '#e2c992', '#b98d4f'];
  const title = `${titleOf(level).toUpperCase()}${m.prestige ? ` · PRESTIGE ${m.prestige}` : ''}`;
  const W = 1000;
  const H = 440;
  const ink = '#3b2412';
  const red = '#8c1c13';
  const stat = (x, label, value) => `<text x="${x}" y="330" font-size="15" letter-spacing="2" fill="#6b4a2a">${label}</text><text x="${x}" y="362" font-family="${SERIF}" font-size="28" fill="${ink}">${value}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="paper" cx="45%" cy="40%" r="75%"><stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="0.85" stop-color="${dark}"/><stop offset="1" stop-color="#4a2c12"/></radialGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.1  0 0 0 0.16 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="burn" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="120%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.55"/></filter>
    <clipPath id="torn"><path d="${TORN}"/></clipPath>
    <clipPath id="round"><circle cx="165" cy="175" r="98"/></clipPath>
    <linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity="0"/><stop offset="0.5" stop-color="#fffbe8" stop-opacity="0.9"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></linearGradient>
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
    <text x="300" y="${levelUp ? 92 : 100}" font-family="${SERIF}" font-size="${levelUp ? 26 : 22}" letter-spacing="3" fill="${levelUp || banner ? red : '#6b4a2a'}">${levelUp ? `NIVEAU ${level} ATTEINT !` : esc(banner ?? 'CARNET DE BORD')}</text>
    <text x="300" y="${levelUp ? 150 : 158}" font-family="${SERIF}" font-size="48" fill="${ink}">${name}</text>
    <text x="300" y="190" font-size="19" letter-spacing="1" fill="${red}">${reward ? `+ ${reward.toLocaleString('fr-FR')} PIÈCES D’OR · ` : ''}${esc(title)}</text>
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
  ${shine == null ? '' : `<g clip-path="url(#torn)"><rect x="${Math.round(shine)}" y="-80" width="260" height="${H + 160}" fill="url(#shine)" transform="rotate(18 ${Math.round(shine) + 130} ${H / 2})"/></g>`}
</svg>`;
  return svg;
}

/** Carte de profil ou de niveau (image fixe). */
export async function profileCard(guild, user, opts = {}) {
  const svg = await cardSvg(guild, user, opts);
  const { default: sharp } = await import('sharp');
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new AttachmentBuilder(png, { name: opts.levelUp ? 'niveau.png' : 'profil.png' });
}

/** Carte animée pour les grands paliers : un reflet d'or passe sur le parchemin. */
export async function profileGif(guild, user, opts = {}) {
  const [{ default: sharp }, { default: ffmpeg }, fs, os, path, { spawn }] = await Promise.all([
    import('sharp'), import('ffmpeg-static'), import('node:fs/promises'), import('node:os'), import('node:path'), import('node:child_process'),
  ]);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'carte-'));
  const run = (args) => new Promise((resolve, reject) => {
    const p = spawn(ffmpeg, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
  try {
    const FRAMES = 14;
    for (let i = 0; i < FRAMES; i++) {
      const svg = await cardSvg(guild, user, { ...opts, shine: -300 + (i * 1400) / (FRAMES - 1) });
      await sharp(Buffer.from(svg)).resize(720).png().toFile(path.join(dir, `f${String(i).padStart(2, '0')}.png`));
    }
    // Une pause sur la carte sans reflet
    for (let i = FRAMES; i < FRAMES + 8; i++) await fs.copyFile(path.join(dir, `f${String(FRAMES - 1).padStart(2, '0')}.png`), path.join(dir, `f${String(i).padStart(2, '0')}.png`));
    const input = path.join(dir, 'f%02d.png');
    await run(['-y', '-framerate', '12', '-i', input, '-vf', 'palettegen=max_colors=128', path.join(dir, 'p.png')]);
    await run(['-y', '-framerate', '12', '-i', input, '-i', path.join(dir, 'p.png'), '-lavfi', 'paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', path.join(dir, 'c.gif')]);
    return new AttachmentBuilder(await fs.readFile(path.join(dir, 'c.gif')), { name: 'palier.gif' });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ===================== Classement =====================

/** Les 10 premiers du serveur (pour le tableau de bord). */
export async function topLevels(guildId, n = 10) {
  await data();
  return Object.entries(store[guildId] ?? {}).sort((a, b) => b[1].xp - a[1].xp).slice(0, n)
    .map(([userId, m]) => ({ userId, xp: m.xp, level: levelFromXp(m.xp).level, messages: m.messages ?? 0, voiceMin: m.voiceMin ?? 0, streak: m.streak ?? 0 }));
}

export async function leaderboardEmbed(guild, { month = false } = {}) {
  await data();
  if (month) {
    const key = monthKey();
    const list = Object.entries(store[guild.id] ?? {}).filter(([, m]) => m.month?.key === key && m.month.xp > 0).sort((a, b) => b[1].month.xp - a[1].month.xp).slice(0, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const label = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, month: 'long', year: 'numeric' }).format(new Date());
    return new EmbedBuilder().setColor(0xd9a441).setTitle(`🗓️ Classement du mois · ${label}`)
      .setDescription(list.length ? list.map(([id, m], i) => `${medals[i] ?? `**${i + 1}.**`} <@${id}> · **${m.month.xp.toLocaleString('fr-FR')} XP** ce mois-ci`).join('\n') : 'Personne n’a encore gagné d’XP ce mois-ci.')
      .setFooter({ text: 'Remis à zéro le 1er de chaque mois · tout le monde a sa chance' });
  }
  const list = Object.entries(store[guild.id] ?? {}).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);
  const medals = ['🥇', '🥈', '🥉'];
  const rich = await richest(guild.id, 5).catch(() => []);
  const embed = new EmbedBuilder().setColor(0xd9a441).setTitle(`🏴‍☠️ Classement de l’équipage · ${guild.name}`)
    .setDescription(list.length ? list.map(([id, m], i) => `${medals[i] ?? `**${i + 1}.**`} <@${id}> · niveau **${levelFromXp(m.xp).level}** ${titleOf(levelFromXp(m.xp).level)}${m.prestige ? ` ${'⭐'.repeat(Math.min(5, m.prestige))}` : ''} · ${m.xp.toLocaleString('fr-FR')} XP`).join('\n') : 'Personne n’a encore d’XP : écrivez, parlez en vocal !');
  if (rich.some((r) => r.gold > 0)) embed.addFields({ name: '🪙 Les plus riches', value: rich.filter((r) => r.gold > 0).map((r, i) => `${medals[i] ?? `**${i + 1}.**`} <@${r.userId}> · 🪙 ${r.gold.toLocaleString('fr-FR')}`).join('\n') });
  return embed;
}

// ===================== Récompense du jour =====================

const dayOf = (at) => new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

export async function claimDaily(guildId, userId, member = null) {
  await data();
  const m = me(guildId, userId);
  const now = Date.now();
  if (m.dailyAt && dayOf(m.dailyAt) === dayOf(now)) return { ok: false };
  m.streak = m.dailyAt && dayOf(m.dailyAt) === dayOf(now - DAY) ? m.streak + 1 : 1;
  m.dailyAt = now;
  // Les boosters du serveur touchent 50 % de plus
  const booster = !!member?.premiumSince;
  const base = (cfg(guildId, 'daily.amount') + Math.min(7, m.streak) * cfg(guildId, 'daily.streak')) * dailyMultiplier(guildId, userId);
  const amount = Math.round(base * (booster ? 1.5 : 1));
  const total = await addGold(guildId, userId, amount, 'Récompense du jour');
  dirty = true;
  return { ok: true, amount, streak: m.streak, balance: total, booster };
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
    const card = user ? await profileGif(guild, user, { banner: 'MEMBRE DE LA SEMAINE' }).catch(() => null) ?? await profileCard(guild, user, { banner: 'MEMBRE DE LA SEMAINE' }).catch(() => null) : null;
    await channel.send({
      content: `⭐ **Membre de la semaine : <@${winnerId}>** avec ${count} messages ! Bravo 🎉${roleId ? ` (rôle <@&${roleId}> pour 7 jours)` : ''}`,
      files: card ? [card] : [],
      allowedMentions: { users: [winnerId] },
    }).catch(() => {});
  }
}

// ===================== Prestige, comparaison, statistiques =====================

/** Prestige : au niveau 50, on repart de zéro avec une étoile, 5 000 pièces et +10 % d'XP pour toujours. */
export async function prestige(guildId, userId) {
  await data();
  const m = me(guildId, userId);
  const { level } = levelFromXp(m.xp);
  if (level < PRESTIGE_LEVEL) return { ok: false, level };
  m.prestige = (m.prestige ?? 0) + 1;
  m.xp = 0;
  m.level = 0;
  dirty = true;
  await addGold(guildId, userId, PRESTIGE_GOLD, `Prestige ${m.prestige}`);
  return { ok: true, prestige: m.prestige, gold: PRESTIGE_GOLD, bonus: Math.round((prestigeBonus(m) - 1) * 100) };
}

const nf = (n) => Math.round(n).toLocaleString('fr-FR');

/** Deux membres côte à côte. */
export async function compareEmbed(guild, a, b) {
  await data();
  await economyData();
  const side = async (user) => {
    const m = me(guild.id, user.id);
    const { level } = levelFromXp(m.xp);
    const p = purse(guild.id, user.id);
    return { name: guild.members.cache.get(user.id)?.displayName ?? user.username, level, title: titleOf(level), xp: m.xp, rank: await rankOf(guild.id, user.id), gold: p.gold + p.bank, messages: m.messages, voice: m.voiceMin, streak: m.streak, prestige: m.prestige ?? 0 };
  };
  const [x, y] = await Promise.all([side(a), side(b)]);
  const row = (label, k, fmt = nf) => `${x[k] > y[k] ? '🟢' : x[k] < y[k] ? '🔴' : '⚪'} **${fmt(x[k])}** · ${label} · **${fmt(y[k])}** ${y[k] > x[k] ? '🟢' : y[k] < x[k] ? '🔴' : '⚪'}`;
  const wins = ['level', 'gold', 'messages', 'voice', 'streak'].reduce((n, k) => n + (x[k] > y[k]) - (x[k] < y[k]), 0);
  return new EmbedBuilder().setColor(0xd9a441).setTitle(`⚔️ ${x.name} contre ${y.name}`)
    .setDescription([
      `**${x.title}**${x.prestige ? ` ${'⭐'.repeat(Math.min(5, x.prestige))}` : ''} · #${x.rank}  —  #${y.rank} · **${y.title}**${y.prestige ? ` ${'⭐'.repeat(Math.min(5, y.prestige))}` : ''}`,
      '',
      row('Niveau', 'level'),
      row('XP totale', 'xp'),
      row('Or (bourse + banque)', 'gold'),
      row('Messages', 'messages'),
      row('Vocal', 'voice', (v) => `${Math.floor(v / 60)} h ${v % 60} min`),
      row('Série du jour', 'streak', (v) => `${v} j`),
      '',
      wins > 0 ? `🏆 **${x.name}** mène l’abordage.` : wins < 0 ? `🏆 **${y.name}** mène l’abordage.` : '🤝 Égalité parfaite.',
    ].join('\n'));
}

/** Les statistiques d'un membre. */
export async function statsEmbed(guild, user) {
  await data();
  await economyData();
  const m = me(guild.id, user.id);
  const { level, into, need } = levelFromXp(m.xp);
  const p = purse(guild.id, user.id);
  const nextTitle = TITLES.find(([n]) => n > level);
  const month = m.month?.key === monthKey() ? m.month.xp : 0;
  return new EmbedBuilder().setColor(0xd9a441).setTitle(`📜 Journal de bord · ${guild.members.cache.get(user.id)?.displayName ?? user.username}`)
    .setThumbnail(user.displayAvatarURL?.({ size: 128 }) ?? null)
    .addFields(
      { name: '🏴‍☠️ Rang', value: `**${titleOf(level)}** · niveau ${level} · #${await rankOf(guild.id, user.id)}${m.prestige ? `\nPrestige ${'⭐'.repeat(Math.min(5, m.prestige))} (+${Math.round((prestigeBonus(m) - 1) * 100)} % d’XP)` : ''}`, inline: true },
      { name: '📈 Progression', value: `${nf(into)} / ${nf(need)} XP\nCe mois-ci : ${nf(month)} XP${nextTitle ? `\nProchain titre : **${nextTitle[1]}** (niv. ${nextTitle[0]})` : ''}`, inline: true },
      { name: '💬 Activité', value: `${nf(m.messages)} messages\n${Math.floor(m.voiceMin / 60)} h ${m.voiceMin % 60} min en vocal\nSérie : ${m.streak} jour(s)`, inline: true },
      { name: '🪙 Trésor', value: `Bourse : ${nf(p.gold)}\nBanque : ${nf(p.bank)}\nGagné : ${nf(p.earned)} · dépensé : ${nf(p.spent)}`, inline: true },
      { name: '🎲 Jeux', value: `Victoires aujourd’hui : ${p.wins?.count ?? 0}\nMembre de la semaine : ${m.weekWins}×`, inline: true },
      { name: '🎖️ Badges', value: [...(m.prestige ? [`PRESTIGE ${m.prestige}`] : []), ...cosmeticsOf(guild.id, user.id).badges].join(' · ') || 'Aucun pour l’instant', inline: true },
    );
}

export const _test = { levelFromXp, me, noXp, monthKey };
