import { startSupportDiscord, onSupportInteraction } from './features/supportDiscord.js';
import './utils/logbuffer.js'; // en premier : capte tous les logs pour l'API d'admin
import { onPromoInteraction } from './features/promoDM.js'; // chargé d'avance : la fenêtre de note doit s'ouvrir en moins de 3 s
import { setArcadeClient } from './arcade/server.js';
import { setPublicClient } from './features/publicStats.js';
import { startAssistant } from './features/assistant.js';
import { loadMaintenance } from './features/maintenance.js';
import { startModeration } from './features/moderation.js';
import { startServerTools } from './features/serverTools.js';
import { startVoicePlus } from './features/voicePlus.js';
import { startTreasury } from './features/treasury.js';
import { autoInstallBotChannels } from './features/botChannels.js';
import { setAppClient } from './dashboard/userApp.js';
import { setPaymentsClient } from './features/payments.js';
import { ActivityType, Client, Events, GatewayIntentBits, IntentsBitField, Partials } from 'discord.js';
import { adminRoutes, testAudioFile } from './admin.js';
import { startCasinho } from './casinho/index.js';
import { startClipsBot } from './clips/bot.js';
import { startVoiceAssistant } from './voice-ai/assistant.js';
import { config } from './config.js';
import { guildCommandDefinitions } from './commands/definitions.js';
import { onInteraction } from './handlers/interactions.js';
import { onMessage } from './handlers/messages.js';
import { putSiteInBio } from './features/bio.js';
import { instance, waitForTurn } from './features/instance.js';
import { createDashboard } from './dashboard/index.js';
import { reportProblem, setAlertClient } from './features/alerts.js';
import { startReminderLoop } from './features/reminders.js';
import { attachLiveServer, serveLive, setLiveClient } from './features/livestream.js';
import { startSpotifyWatch } from './features/spotify.js';
import { startBattleLoop, startDefis, startFantasyLoop } from './games/index.js';
import { startVoiceKeeper } from './features/voice.js';
import { startVoiceGuard } from './features/voiceGuard.js';
import { loadServers } from './features/premium.js';
import { loadGuildConfig } from './features/guildConfig.js';
import { attachSecurityEvents } from './features/security.js';
import { startLevelLoops, xpForReaction } from './features/levels.js';
import { startVoiceExtras } from './features/voiceExtras.js';
import { startWeeklyReports } from './features/weekly.js';
import { ensureBinaries } from './music/binaries.js';
import { handleMusicVoiceState } from './music/handlers.js';
import { lavalink } from './music/lavalink.js';
import { restoreSessions } from './music/session.js';
import { startHttpServer } from './server.js';
import { flushAll, storageBackend } from './storage.js';

const INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.DirectMessages,
];

const client = new Client({
  // L'intent « Présence » sert au partage Spotify ; il est retiré au démarrage s'il n'est pas activé dans le portail Discord
  intents: config.spotify.enabled ? [...INTENTS, GatewayIntentBits.GuildPresences] : INTENTS,
  // Message / membre partiels : le journal voit aussi les messages supprimés qui n'étaient plus en mémoire
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.Reaction],
  // Par défaut le bot ne ping personne (pas de @everyone même si l'IA l'écrit)
  allowedMentions: { parse: [], repliedUser: true },
});

client.once(Events.ClientReady, async (c) => {
  // Code modifié depuis la version livrée ? (INTEGRITY_CHECK=1 et security/manifest.json)
  if (process.env.INTEGRITY_CHECK === '1') {
    import('./utils/integrity.js').then((m) => m.checkIntegrity()).then(async (r) => {
      if (!r) return console.warn('[intégrité] pas de manifeste : lance npm run integrity');
      if (!r.changed.length) return console.log(`🔒 Intégrité du code vérifiée (${r.version})`);
      console.warn(`[intégrité] ${r.changed.length} fichier(s) modifié(s) :`, r.changed.slice(0, 10).join(', '));
      const owner = await c.users.fetch(config.ownerId).catch(() => null);
      await owner?.send(`🔒 **Alerte intégrité** : ${r.changed.length} fichier(s) du bot ne correspondent pas à la version ${r.version}.\n${r.changed.slice(0, 10).map((f) => `• \`${f}\``).join('\n')}`).catch(() => {});
    }).catch((err) => console.warn('[intégrité]', err.message));
  }
  setAlertClient(c);
  setPaymentsClient(c);
  setAppClient(c);
  setArcadeClient(c);
  setPublicClient(c);
  console.log(`✅ Connecté en tant que ${c.user.tag} sur ${c.guilds.cache.size} serveur(s)`);
  console.log(`🧠 Chat : ${config.models.chat} (réflexion ${config.models.thinkingLevel}) · 🎨 Images : ${config.limits.imagesEnabled ? config.models.image : 'désactivées'} · 💾 Stockage : ${storageBackend}`);

  c.user.setPresence({
    activities: [{ name: 'custom', type: ActivityType.Custom, state: config.botStatus }],
    status: 'online',
  });

  const old = false; // /serveur, /pannel, /ia, /jeux, /musique… supprimées : seulement /play (et /launcher sur le serveur du launcher)
  // Commandes globales supprimées une par une : le « point d'entrée » de l'Activité (type 4) ne peut pas être retiré en bloc
  const clearGlobal = async () => {
    const all = await c.application.commands.fetch();
    let n = 0;
    for (const cmd of all.values()) if (cmd.type !== 4) { await cmd.delete(); n++; }
    if (n) console.log(`📜 ${n} ancienne(s) commande(s) globale(s) retirée(s) : seulement /play (et /launcher)`);
  };
  // /play sur chaque serveur : visible tout de suite, sans attendre la mise à jour globale de Discord
  const { HOME_GUILD } = await import('./features/launcherServers.js');
  const pick = (name) => guildCommandDefinitions.filter((cmd) => cmd.name === name).map((cmd) => cmd.toJSON());
  // /launcher sur le serveur du launcher, /play (musique) sur les autres
  const payloadFor = (guild) => (old ? guildCommandDefinitions.map((cmd) => cmd.toJSON()) : [...pick('play'), ...(guild.id === HOME_GUILD ? pick('launcher') : [])]);
  const registerOn = (guild) => guild.commands.set(payloadFor(guild)).catch((err) => console.warn(`[commandes] ${guild.name} :`, err.message));
  // Remis toutes les 30 min : si une ancienne copie du bot (ancien hébergeur) remet les vieilles commandes, elles repartent
  const syncCommands = async () => {
    await clearGlobal().catch((err) => console.warn('[commandes] globales :', err.message));
    await Promise.all([...c.guilds.cache.values()].map(registerOn));
    console.log(`▶️ /play et /launcher enregistrées sur ${c.guilds.cache.size} serveur(s)`);
  };
  await syncCommands();
  setInterval(() => syncCommands().catch(() => {}), 30 * 60_000).unref();
  c.on(Events.GuildCreate, (guild) => registerOn(guild));
  // Résumé des commandes « !! » dans le salon agora (une fois par version)
  if (FULL) import('./features/prefixCommands.js').then((m) => m.postCommandSummary(c)).catch((err) => console.warn('[!!aide]', err.message));

  // Le nom du bot (History IA) : Discord n'autorise que 2 changements par heure, on ne le fait que s'il diffère
  if (config.botName && c.user.username !== config.botName) {
    c.user.setUsername(config.botName).then(() => console.log(`🏷️ Nom du bot : ${config.botName}`)).catch((err) => console.warn('[nom du bot]', err.message));
  }
  putSiteInBio(c, { tag: 'bot' });
  lavalink.init(c);
  // Base légère : seulement la musique (/play) et History Launcher. BOT_FULL=1 remet les anciennes fonctions
  // (vocal 24/24, surveillance vocale, IA dans les messages, niveaux, modération…), qui consomment beaucoup sur Render.
  if (FULL) { startVoiceGuard(c); startLevelLoops(c); startTreasury(c); }
  // Le vocal sert à la musique (comme avant) : le bot rejoint le salon de la personne pour /play,
  // mais sans vocal 24/24 en base légère (il part quand la musique s'arrête)
  if (!FULL) { config.voice.enabled = false; config.voice.lockHome = false; } // sinon le bot restait bloqué dans son salon et /play ne le rejoignait pas
  startVoiceKeeper(c).catch((err) => console.warn('[voc] démarrage :', err.message));
  (await import('./features/launcherReleases.js')).startLauncherReleases(c);
  // Vidéos de présentation : MP d'abord (indépendants), puis l'annonce dans les nouveautés des serveurs du launcher
  import('./features/launcherPremium.js').then((m) => m.startPremiumSync(c)).catch((err) => console.warn('[premium]', err.message));
  if (FULL) import('./features/promoDM.js').then((m) => { m.startPromoReminders(c); m.syncDiscordReviews(c).catch(() => {}); return m.sendPromoDMs(c); }).catch((err) => console.warn('[vidéos MP]', err.message));
  (await import('./features/launcherServers.js')).autoInstall(c).then(async () => {
    if (!FULL) return;
    const { postPromoVideos } = await import('./features/promoVideos.js');
    const { load } = await import('./storage.js');
    for (const s of (await load('launcher-serveurs', null)) ?? []) if (s.news) await postPromoVideos(await c.channels.fetch(s.news).catch(() => null));
  }).catch((err) => console.warn('[vidéos salon]', err.message));
  c.on(Events.GuildCreate, () => import('./features/launcherServers.js').then((m) => m.autoInstall(c)).catch(() => {}));
  (await import('./features/launcherDiscord.js')).startLauncherDiscord(c);
  loadMaintenance().catch(() => {});
  if (FULL) {
  startAssistant(c);
  startModeration(c);
  startServerTools(c);
  import('./features/ticketAutomations.js').then((m) => m.startTicketAutomations(c)).catch((err) => console.warn('[tickets auto]', err.message));
  startVoicePlus(c);
  import('./features/aiStatus.js').then((m) => m.startAiStatus(c)).catch(() => {});
  autoInstallBotChannels(c).catch((err) => console.warn('[salons] installation :', err.message));
  startVoiceExtras(c);
  startWeeklyReports(c).catch((err) => console.warn('[rapport] démarrage :', err.message));
  startVoiceAssistant(c).catch((err) => console.warn('[vocal] démarrage :', err.message));
  startReminderLoop(c);
  startSpotifyWatch(c);
  startFantasyLoop(c);
  startBattleLoop(c);
  startDefis(c);
  setLiveClient(c);
  }
  startSupportDiscord(c);
  // Reprise de la musique interrompue par un redémarrage
  setTimeout(() => restoreSessions(c).catch((err) => console.warn('[musique] reprise :', err.message)), 8_000);
});

const FULL = process.env.BOT_FULL === '1';
if (FULL) attachSecurityEvents(client);
if (FULL) import('./features/antiNuke.js').then((m) => m.attachAntiNuke(client)).catch((err) => console.warn('[anti-nuke]', err.message));

// Base légère : seulement les commandes « !! » (!!clear, !!ban, !!play…), pas l'IA ni le reste
if (!FULL) {
  client.on(Events.MessageCreate, (message) => {
    if (message.author.bot || !message.inGuild() || !message.content.startsWith('!!')) return;
    import('./features/prefixCommands.js').then((m) => m.prefixCommand(message)).catch((err) => console.warn('[!!]', err.message));
  });
}
if (FULL) client.on(Events.MessageCreate, (message) => {
  onMessage(client, message).catch((err) => console.error('[messageCreate]', err));
});

client.on(Events.InteractionCreate, (interaction) => {
  if (String(interaction.customId ?? '').startsWith('support:')) return void onSupportInteraction(interaction).catch(err => console.warn('[support]', err.message));
  // Notes ⭐ des vidéos de présentation (MP)
  if (String(interaction.customId ?? '').startsWith('prem:')) return void import('./features/launcherPremium.js').then((m) => m.onPremiumInteraction(interaction)).catch((err) => console.error('[premium]', err));
  if (String(interaction.customId ?? '').startsWith('promo:')) return void onPromoInteraction(client, interaction).catch((err) => console.error('[promo]', err));
  onInteraction(client, interaction).catch((err) => console.error('[interactionCreate]', err));
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
    await xpForReaction(reaction, user);
  } catch (err) {
    console.warn('[niveaux] réaction :', err.message);
  }
});
client.on(Events.VoiceStateUpdate, (oldState, newState) => handleMusicVoiceState(oldState, newState));

// Les serveurs audio ont besoin des événements vocaux bruts de Discord
client.on(Events.Raw, (packet) => lavalink.handleRaw(packet));

client.on(Events.Error, (err) => {
  console.error('[discord]', err);
  reportProblem({ what: 'erreur Discord', error: err, ping: false }).catch(() => {});
});

// Prépare yt-dlp dès le démarrage pour que le premier /play soit rapide
ensureBinaries().catch((err) => console.warn('[musique] yt-dlp indisponible :', err.message));
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
  reportProblem({ what: 'erreur interne', error: err, ping: false }).catch(() => {});
});
// Une erreur imprévue ne fait plus tomber tout le bot (et le site avec) : on la note et on continue
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  reportProblem({ what: 'erreur interne (non rattrapée)', error: err, ping: false }).catch(() => {});
});

// Render arrête l'ancienne version à chaque mise à jour : on coupe proprement ses lecteurs audio
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`🛑 ${signal} reçu : arrêt propre`);
  await Promise.race([Promise.all([lavalink.shutdown(), flushAll()]), new Promise((resolve) => setTimeout(resolve, 5_000))]).catch(() => {});
  process.exit(0);
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

const httpServer = startHttpServer(() => ({
  bot: client.user?.username,
  discord: client.isReady() ? 'ready' : instance.waitingFor ? 'waiting' : 'connecting',
  instance: instance.where,
  ...(instance.waitingFor ? { waitingFor: instance.waitingFor } : {}),
  uptime: Math.round(process.uptime()),
}), adminRoutes(client), testAudioFile, serveLive, createDashboard(client));
// Le PC du chef envoie son son ici, en direct
attachLiveServer(httpServer);

/** Les intents « privilégiés » activés dans le portail Discord (Présence, Membres). */
async function privilegedIntents() {
  try {
    const response = await fetch('https://discord.com/api/v10/applications/@me', { headers: { Authorization: `Bot ${config.discordToken}` } });
    const flags = BigInt((await response.json())?.flags ?? 0);
    return { presence: Boolean(flags & ((1n << 12n) | (1n << 13n))), members: Boolean(flags & ((1n << 14n) | (1n << 15n))) };
  } catch {
    return { presence: false, members: false };
  }
}

(async () => {
  // Une seule copie du bot connectée à la fois (sinon chaque clic reçoit deux réponses)
  await waitForTurn();
  // Offres premium des serveurs (plans, couleurs, voix) : chargées avant la première commande
  await loadServers().catch((err) => console.warn('[premium] chargement :', err.message));
  await loadGuildConfig().catch((err) => console.warn('[réglages serveurs] chargement :', err.message));
  // Intents selon le portail Discord : Présence (Spotify) et Membres (arrivées, anti-raid, bienvenue, journal des rôles)
  const allowed = await privilegedIntents();
  const intents = [...INTENTS, GatewayIntentBits.GuildModeration];
  if (config.spotify.enabled && allowed.presence) intents.push(GatewayIntentBits.GuildPresences);
  else if (config.spotify.enabled) {
    console.warn("⚠️ Partage Spotify désactivé : active « Presence Intent » dans le portail Discord (Developer Portal › Bot), puis redémarre.");
    config.spotify.enabled = false;
  }
  if (allowed.members) intents.push(GatewayIntentBits.GuildMembers);
  else console.warn("⚠️ Anti-raid, vérification, bienvenue et journal des arrivées désactivés : active « Server Members Intent » dans le portail Discord (Developer Portal › Bot), puis redémarre.");
  client.options.intents = new IntentsBitField(intents);
  // Discord refuse la connexion (limite de connexions, panne, token) : on ne s'arrête pas.
  // Le site reste en ligne et le bot retente, de plus en plus espacé (30 s, 1 min, 2 min… jusqu'à 10 min).
  let wait = 30_000;
  for (;;) {
    try {
      await client.login(config.discordToken);
      break;
    } catch (err) {
      const fatal = /TokenInvalid|invalid token|disallowed intents/i.test(`${err.code ?? ''} ${err.message}`);
      console.error(`❌ Connexion à Discord impossible${fatal ? ' (token invalide ou intents pas activés ?)' : ''} : ${err.message}. Nouvel essai dans ${Math.round(wait / 1000)} s (le site reste en ligne).`);
      reportProblem({ what: 'connexion à Discord', error: err, ping: false }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, wait));
      wait = Math.min(wait * 2, 600_000);
    }
  }
  // Le casino a son propre bot : il se connecte à côté, et son absence ne gêne pas le reste.
  startCasinho().catch((err) => console.error('🎰 Casinho :', err.message));
  // History Clips a aussi son bot (serveur de l'appli) : absent = on continue sans
  startClipsBot().catch((err) => console.error('🎬 History Clips :', err.message));
})();
