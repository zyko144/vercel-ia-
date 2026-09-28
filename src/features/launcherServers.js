// Serveurs qui reçoivent les annonces du launcher : « /launcher installer » crée 3 salons en lecture seule
// (infos, nouveautés, jeux gratuits) et le serveur reçoit ensuite chaque nouvelle version et chaque jeu gratuit.
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { load, save } from '../storage.js';

const KEY = 'launcher-serveurs';
export const SITE = 'https://zyko144.github.io/vercel-ia-';
export const SALONS = [
  ['infos', 'ℹ・infos', 'History Launcher : c’est quoi, le télécharger, lier ton compte.'],
  ['news', '📢・nouveautés', 'Chaque nouvelle version de History Launcher, avec ses nouveautés en image.'],
  ['deals', '🎁・jeux-gratuits', 'Jeux gratuits Epic Games et grosses promos Steam.'],
];
// Le lien en clair (sans < >) : Discord affiche sous le message l'aperçu du site avec sa bannière
export const INFO_MESSAGE = `# 🚀 History Launcher

Tous tes jeux dans une seule appli : Steam, Epic, Xbox, EA, FiveM, Roblox…
Optimisation du PC, amis en direct et vrai compteur de FPS.

## 📥 Télécharger
${SITE}

## 🔗 Lier ton compte
\`/launcher lier\` avec le code de Paramètres › Compte

## 🎮 Commandes
\`/launcher profil\` : ton profil
\`/launcher comparer\` : duel entre deux joueurs
\`/launcher fps\` : FPS mesurés sur un jeu
\`/launcher telecharger\` : dernière version`;

/** Crée (ou retrouve) la catégorie et les 3 salons dans ce serveur, puis l'enregistre pour les annonces. */
export async function installHere(guild) {
  const everyone = guild.roles.everyone.id;
  const readOnly = [{ id: everyone, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads] }, { id: guild.client.user.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] }];
  const find = (name, type) => guild.channels.cache.find((c) => c.name === name && c.type === type);
  const cat = find('🚀 History Launcher', ChannelType.GuildCategory) ?? await guild.channels.create({ name: '🚀 History Launcher', type: ChannelType.GuildCategory, reason: 'History Launcher' });
  const entry = { guildId: guild.id };
  for (const [key, name, topic] of SALONS) {
    const c = find(name, ChannelType.GuildText) ?? await guild.channels.create({ name, type: ChannelType.GuildText, parent: cat.id, topic, permissionOverwrites: readOnly, reason: 'History Launcher' });
    entry[key] = c.id;
    if (key === 'infos') { // message mis à jour s'il a changé
      const mine = (await c.messages.fetch({ limit: 10 }).catch(() => null))?.find((m) => m.author.id === guild.client.user.id);
      if (mine?.content !== INFO_MESSAGE) await (mine ? mine.edit({ content: INFO_MESSAGE }) : c.send({ content: INFO_MESSAGE, allowedMentions: { parse: [] } }));
    }
  }
  // Un salon général où les membres peuvent discuter
  const talk = find('💬 Communauté', ChannelType.GuildCategory) ?? await guild.channels.create({ name: '💬 Communauté', type: ChannelType.GuildCategory, reason: 'History Launcher' });
  if (!find('💬・général', ChannelType.GuildText)) await guild.channels.create({ name: '💬・général', type: ChannelType.GuildText, parent: talk.id, topic: 'Discute avec les autres joueurs History Launcher.', reason: 'History Launcher' });
  const list = ((await load(KEY, null)) ?? []).filter((x) => x.guildId !== guild.id);
  const fresh = !((await load(KEY, null)) ?? []).some((x) => x.guildId === guild.id);
  await save(KEY, [...list, entry]);
  // Première installation : les 3 dernières mises à jour, pour que le salon ne soit pas vide
  if (fresh) {
    const { recentReleases, releasePayload } = await import('./launcherReleases.js');
    const news = await guild.channels.fetch(entry.news).catch(() => null);
    for (const rel of await recentReleases(3)) await news?.send({ ...(await releasePayload(rel)), allowedMentions: { parse: [] } }).catch(() => {});
  }
  return entry;
}

/** Envoie aussi l'annonce dans les salons installés (nouveautés ou jeux gratuits). Une erreur ne bloque rien. */
export async function broadcast(client, kind, payload, except = null) {
  let sent = 0;
  for (const s of (await load(KEY, null)) ?? []) {
    if (!s[kind] || s[kind] === except) continue;
    const c = await client.channels.fetch(s[kind]).catch(() => null);
    if (await c?.send?.({ allowedMentions: { parse: [] }, ...payload }).catch((err) => console.warn(`[launcher] annonce ${kind} :`, err.message))) sent += 1;
  }
  return sent;
}

// Serveur officiel du launcher : installé tout seul au démarrage du bot (sans taper /launcher installer)
export const HOME_GUILD = process.env.LAUNCHER_SERVEUR || '1554084922665205780';
export async function autoInstall(client) {
  const guild = await client.guilds.fetch(HOME_GUILD).catch(() => null);
  if (!guild) return console.warn('[launcher] le bot n’est pas encore sur le serveur', HOME_GUILD);
  await installHere(guild).then(() => console.log('🚀 Salons du launcher installés sur', guild.name)).catch((err) => console.warn('[launcher] installation :', err.message));
}
