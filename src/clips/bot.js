// Bot History Clips : un client Discord à part (token CLIPS_BOT_TOKEN), pour le serveur de l'appli History Clips.
// Il crée les salons qui manquent (jamais deux fois), poste les infos, annonce les nouvelles versions de l'appli,
// reçoit les clips envoyés depuis History Clips et remonte les meilleurs (🔥) dans un salon à part.
import { AttachmentBuilder, ChannelType, Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, Partials, PermissionFlagsBits } from 'discord.js';
import { config } from '../config.js';
import { fitForDiscord } from '../features/launcherDiscord.js';

const YELLOW = 0xffc233;
const SITE = 'https://zyko144.github.io/vercel-ia-/clips/';
const SETUP = 'https://github.com/zyko144/vercel-ia-/releases/download/clips-latest/History-Clips-Setup.exe';
const LOGO = 'https://zyko144.github.io/vercel-ia-/clips/logo.png';
const RELEASES = 'https://api.github.com/repos/zyko144/vercel-ia-/releases?per_page=30';
const HOT = 5; // 🔥 nécessaires pour entrer dans les meilleurs clips

// Salons du serveur (créés seulement s'ils manquent). « lecture » = seuls le bot et les admins écrivent.
const LAYOUT = [
  { cat: '📌 INFOS', channels: [
    { name: 'bienvenue', topic: 'Bienvenue sur le serveur de History Clips', lecture: true },
    { name: 'annonces', topic: 'Les nouveautés de History Clips', lecture: true },
    { name: 'nouveautés', topic: 'Chaque nouvelle version de History Clips, annoncée ici automatiquement', lecture: true },
    { name: 'regles', topic: 'Les règles du serveur', lecture: true },
  ] },
  { cat: '🎬 CLIPS', channels: [
    { name: 'clips', topic: 'Les clips envoyés depuis History Clips (réagis 🔥 à tes préférés)', lecture: true },
    { name: 'meilleurs-clips', topic: `Les clips qui ont reçu ${HOT} 🔥 ou plus`, lecture: true },
    { name: 'captures', topic: 'Tes plus belles captures d’écran de jeu' },
  ] },
  { cat: '💬 COMMUNAUTÉ', channels: [
    { name: 'general', topic: 'On discute de tout' },
    { name: 'aide', topic: 'Un souci avec History Clips ? Demande ici' },
    { name: 'idees', topic: 'Tes idées pour améliorer History Clips' },
  ] },
  { cat: '🔊 VOCAL', channels: [{ name: 'Général', voice: true }, { name: 'En jeu', voice: true }] },
];

let client = null;
const byName = (guild, name, type) => guild.channels.cache.find((c) => c.name === name && c.type === type);
const chan = (name) => { const g = client?.guilds.cache.get(config.clips.guildId); return g ? byName(g, name, ChannelType.GuildText) : null; };

async function setupServer(guild) {
  const everyone = guild.roles.everyone;
  // Ancien nom du salon des versions : renommé plutôt que recréé
  const old = byName(guild, 'mises-a-jour', ChannelType.GuildText);
  if (old && !byName(guild, 'nouveautés', ChannelType.GuildText)) await old.setName('nouveautés').catch(() => {});
  for (const block of LAYOUT) {
    let cat = byName(guild, block.cat, ChannelType.GuildCategory);
    if (!cat) cat = await guild.channels.create({ name: block.cat, type: ChannelType.GuildCategory }).catch(() => null);
    for (const c of block.channels) {
      const type = c.voice ? ChannelType.GuildVoice : ChannelType.GuildText;
      if (byName(guild, c.name, type)) continue;
      await guild.channels.create({ name: c.name, type, parent: cat?.id, topic: c.topic,
        permissionOverwrites: c.lecture ? [{ id: everyone.id, deny: [PermissionFlagsBits.SendMessages] }, { id: guild.members.me.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }] : undefined,
      }).catch((err) => console.warn(`🎬 Salon ${c.name} :`, err.message));
    }
  }
}

/** Poste un message du bot seulement s'il n'y en a pas déjà un avec ce titre (redémarrage = pas de doublon). */
async function postOnce(name, embed) {
  const c = chan(name);
  if (!c) return;
  const last = await c.messages.fetch({ limit: 50 }).catch(() => null);
  if (last?.some((m) => m.author.id === client.user.id && m.embeds[0]?.title === embed.data.title)) return;
  await c.send({ embeds: [embed] }).catch(() => {});
}
async function postInfos() {
  const base = () => new EmbedBuilder().setColor(YELLOW).setThumbnail(LOGO);
  await postOnce('bienvenue', base().setTitle('🎬 Bienvenue sur History Clips').setDescription([
    '## Ton meilleur moment, gardé en un appui',
    'History Clips filme ta partie en fond. Tu fais une dinguerie ? Appuie sur **F8** : les dernières secondes sont gardées, rangées par jeu, prêtes à couper et à partager ici.',
    '', `### ⬇ Télécharger\n[History Clips pour Windows](${SETUP}) · [Le site](${SITE})`,
    '', '### 📌 Les salons', '• <#' + (chan('clips')?.id ?? '0') + '> : les clips envoyés depuis l’appli (réagis 🔥)', `• <#${chan('meilleurs-clips')?.id ?? '0'}> : ceux qui ont reçu ${HOT} 🔥`, `• <#${chan('aide')?.id ?? '0'}> : un souci ? on t’aide`,
  ].join('\n')));
  await postOnce('regles', base().setTitle('📜 Règles du serveur').setDescription(['1. Respect entre tous, pas d’insultes ni de harcèlement.', '2. Pas de contenu choquant, NSFW ou illégal dans les clips.', '3. Pas de pub ni de spam.', '4. Les clips restent des clips de jeu 🎮.', '', 'Les modérateurs peuvent retirer tout message qui ne respecte pas ces règles.'].join('\n')));
  await postOnce('annonces', base().setTitle('🚀 History Clips est disponible').setDescription([
    '### Tout pour tes clips', '🔴 **Replay en fond** : garde les 15 s à 2 min qui viennent de se passer', '🎮 **Le jeu seulement** ou tout l’écran, au choix', '✂ **Découpe** au dixième de seconde', '🗂 **Galerie par jeu** avec les images de tes jeux', '📤 **Envoi ici** ou en privé à un ami, en un clic', '⚡ **0 FPS perdu** hors partie : le replay ne tourne que quand un jeu est ouvert', '🔗 **Même compte que History Launcher**',
    '', `[⬇ Télécharger History Clips](${SETUP})`,
  ].join('\n')));
}

// Nouvelles versions de l'appli (releases GitHub « clips-vX ») dans #nouveautés, comme le launcher : une seule fois chacune
async function announceReleases() {
  const c = chan('nouveautés');
  if (!c) return;
  const list = await fetch(RELEASES, { headers: { 'User-Agent': 'history-clips-bot' }, signal: AbortSignal.timeout(15_000) }).then((r) => r.json()).catch(() => []);
  const rel = (Array.isArray(list) ? list : []).filter((r) => /^clips-v\d/.test(r.tag_name) && !r.draft).slice(0, 3).reverse();
  const last = await c.messages.fetch({ limit: 50 }).catch(() => null);
  for (const r of rel) {
    const v = r.tag_name.replace('clips-v', '');
    const title = `🎬 History Clips ${v} est disponible`;
    if (last?.some((m) => m.embeds[0]?.title === title || m.embeds[0]?.title === `⬆ History Clips ${v}`)) continue;
    // Notes en liste à puces aérée (une phrase = une nouveauté)
    const notes = String(r.body ?? '').split(/(?<=[.!])\s+(?=[A-ZÀ-Ü«])/).map((x) => x.trim()).filter(Boolean).map((x) => `✨ ${x}`).join('\n\n').slice(0, 3500);
    await c.send({ embeds: [new EmbedBuilder().setColor(YELLOW).setThumbnail(LOGO).setTitle(title).setURL(SITE)
      .setDescription(`## Les nouveautés\n${notes || '✨ Améliorations et corrections.'}\n\n### ⬇ Mise à jour\nL’appli se met à jour toute seule. Pas encore installée ? **[Télécharger History Clips](${SETUP})**`)
      .setFooter({ text: 'History Clips · mises à jour automatiques' }).setTimestamp(new Date(r.published_at ?? Date.now()))] }).catch(() => {});
  }
}

// Autres serveurs où le bot est invité (ex. DDV) : un salon « clips-history » créé une seule fois pour les partages
const SHARE = 'clips-history';
async function shareChannel(guild) {
  await guild.channels.fetch().catch(() => {});
  return byName(guild, SHARE, ChannelType.GuildText) ?? guild.channels.create({ name: SHARE, type: ChannelType.GuildText, topic: '🎬 Les clips partagés depuis History Clips · réagis 🔥' }).catch((err) => { console.warn(`🎬 Salon ${SHARE} sur ${guild.name} :`, err.message); return null; });
}
/** Serveurs où le bot est ET dont ce joueur est membre (pour le choix dans l'appli). */
export async function clipsServers(discordId) {
  if (!client?.isReady() || !discordId) return [];
  const out = [];
  for (const g of client.guilds.cache.values()) {
    const m = await g.members.fetch(discordId).catch(() => null);
    if (m) out.push({ id: g.id, name: g.name, icon: g.iconURL({ size: 64 }) ?? null, home: g.id === config.clips.guildId });
  }
  return out.sort((a, b) => Number(b.home) - Number(a.home) || a.name.localeCompare(b.name));
}

/** Clip envoyé depuis History Clips : dans #clips du serveur History Clips (ou le salon clips-history d'un autre serveur), avec 🔥 pour voter. */
export async function postClipToClipsServer({ discordId, pseudo, buf, ext, game, seconds = 45, guildId = null }) {
  let c;
  if (guildId && guildId !== config.clips.guildId) {
    const g = client?.guilds.cache.get(String(guildId));
    if (!g || !(await g.members.fetch(discordId).catch(() => null))) return { ok: false, error: 'Tu n’es pas sur ce serveur, ou le bot History Clips n’y est plus.' };
    c = await shareChannel(g);
    if (!c) return { ok: false, error: 'Le bot n’a pas le droit de créer ou d’écrire dans le salon des clips sur ce serveur.' };
  } else c = chan(ext === 'png' || ext === 'jpg' ? 'captures' : 'clips') ?? chan('clips');
  if (!c) return null;
  const file = await fitForDiscord(buf, ext, seconds);
  const kind = ['webm', 'mp4'].includes(file.ext) ? '🎬 un clip' : '📸 une capture';
  const msg = await c.send({
    content: `**${pseudo}** (<@${discordId}>) partage ${kind}${game ? ` de **${game}**` : ''}\n-# Envoyé depuis History Clips · réagis 🔥 si c’est lourd`,
    files: [new AttachmentBuilder(file.buf, { name: `history-clips-${Date.now()}.${file.ext}` })], allowedMentions: { parse: [] },
  });
  await msg.react('🔥').catch(() => {});
  return { ok: true, url: msg.url };
}
/** Invitation permanente vers le serveur History Clips (salon bienvenue). */
let inviteUrl = null;
export async function clipsInvite() {
  if (inviteUrl) return inviteUrl;
  const c = chan('bienvenue') ?? chan('general');
  const inv = c ? await c.createInvite({ maxAge: 0, maxUses: 0, unique: false, reason: 'Bouton Discord de l’appli' }).catch(() => null) : null;
  inviteUrl = inv?.url ?? null;
  return inviteUrl;
}
export const clipsBotReady = () => Boolean(client?.isReady() && chan('clips'));

// 🔥 × HOT : le clip est reposté dans #meilleurs-clips (une seule fois)
const promoted = new Set();
async function onReaction(reaction) {
  if (reaction.partial) await reaction.fetch().catch(() => null);
  const m = reaction.message;
  if (reaction.emoji.name !== '🔥' || m.channel?.name !== 'clips' || m.guildId !== config.clips.guildId || promoted.has(m.id)) return;
  if ((reaction.count ?? 0) - 1 < HOT) return; // le 🔥 du bot ne compte pas
  promoted.add(m.id);
  const best = chan('meilleurs-clips');
  const att = m.attachments.first();
  if (best && att) await best.send({ content: `🏆 **Un des meilleurs clips** · ${reaction.count - 1} 🔥\n${m.content.split('\n')[0]}\n${m.url}`, files: [att.url], allowedMentions: { parse: [] } }).catch(() => {});
}

const COMMANDS = [
  { name: 'clips', description: 'Télécharger History Clips et voir ce qu’il sait faire' },
  { name: 'version', description: 'La dernière version de History Clips' },
];
async function onCommand(i) {
  if (i.commandName === 'clips') {
    return i.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setThumbnail(LOGO).setTitle('🎬 History Clips').setURL(SITE)
      .setDescription(`Replay en fond, **F8** pour garder les dernières secondes, découpe, galerie par jeu, envoi sur Discord.\n\n[⬇ Télécharger pour Windows](${SETUP}) · [Le site](${SITE})`)] });
  }
  if (i.commandName === 'version') {
    const list = await fetch(RELEASES, { headers: { 'User-Agent': 'history-clips-bot' } }).then((r) => r.json()).catch(() => []);
    const r = (Array.isArray(list) ? list : []).find((x) => /^clips-v\d/.test(x.tag_name));
    return i.reply({ content: r ? `⬆ Dernière version : **History Clips ${r.tag_name.replace('clips-v', '')}** · l’appli se met à jour toute seule.\n[Télécharger](${SETUP})` : 'Version introuvable pour le moment.', flags: MessageFlags.Ephemeral });
  }
}

export async function startClipsBot() {
  if (!config.clips.token) { console.log('🎬 History Clips : pas de token (CLIPS_BOT_TOKEN), bot non lancé.'); return null; }
  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions], partials: [Partials.Message, Partials.Reaction, Partials.Channel] });
  client.once(Events.ClientReady, async (c) => {
    console.log(`🎬 Bot History Clips connecté : ${c.user.tag}`);
    c.user.setPresence({ activities: [{ name: '🎬 tes meilleurs clips · /clips', type: 3 }], status: 'online' });
    const guild = await c.guilds.fetch(config.clips.guildId).catch(() => null);
    if (!guild) { console.warn(`🎬 Serveur ${config.clips.guildId} introuvable : invite le bot History Clips dessus.`); return; }
    await guild.channels.fetch().catch(() => {});
    await setupServer(guild);
    await guild.commands.set(COMMANDS).catch((err) => console.warn('🎬 Commandes :', err.message));
    await postInfos();
    await announceReleases();
    setInterval(() => announceReleases().catch(() => {}), 30 * 60_000);
    for (const g of c.guilds.cache.values()) if (g.id !== config.clips.guildId) await shareChannel(g);
  });
  // Invité sur un nouveau serveur : il y crée son salon de partage
  client.on(Events.GuildCreate, (g) => { if (g.id !== config.clips.guildId) shareChannel(g).catch(() => {}); });
  client.on(Events.InteractionCreate, (i) => { if (i.isChatInputCommand()) onCommand(i).catch((err) => console.error('[clips:commande]', err)); });
  client.on(Events.MessageReactionAdd, (r) => { onReaction(r).catch(() => {}); });
  client.on(Events.Error, (err) => console.error('[clips]', err.message));
  try { await client.login(config.clips.token); } catch (err) { console.error(`🎬 Connexion impossible (token ${config.clips.tokenSource}) :`, err.message); client = null; }
  return client;
}
