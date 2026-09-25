import './utils/logbuffer.js'; // en premier : capte tous les logs pour l'API d'admin
import { startTreasury } from './features/treasury.js';
import { autoInstallBotChannels } from './features/botChannels.js';
import { setAppClient } from './dashboard/userApp.js';
import { setPaymentsClient } from './features/payments.js';
import { ActivityType, Client, Events, GatewayIntentBits, IntentsBitField, Partials } from 'discord.js';
import { adminRoutes, testAudioFile } from './admin.js';
import { startCasinho } from './casinho/index.js';
import { startVoiceAssistant } from './voice-ai/assistant.js';
import { config } from './config.js';
import { commandDefinitions } from './commands/definitions.js';
import { onInteraction } from './handlers/interactions.js';
import { onMessage } from './handlers/messages.js';
import { putSiteInBio } from './features/bio.js';
import { instance, waitForTurn } from './features/instance.js';
import { createDashboard } from './dashboard/index.js';
import { reportProblem, setAlertClient } from './features/alerts.js';
import { startReminderLoop } from './features/reminders.js';
import { attachLiveServer, serveLive, setLiveClient } from './features/livestream.js';
import { startSpotifyWatch } from './features/spotify.js';
import { startBattleLoop, startFantasyLoop } from './games/index.js';
import { startVoiceKeeper } from './features/voice.js';
import { startVoiceGuard } from './features/voiceGuard.js';
import { loadServers } from './features/premium.js';
import { loadGuildConfig } from './features/guildConfig.js';
import { attachSecurityEvents } from './features/security.js';
import { startLevelLoops } from './features/levels.js';
import { startVoiceExtras } from './features/voiceExtras.js';
import { startWeeklyReports } from './features/weekly.js';
import { ensureBinaries } from './music/binaries.js';
import { handleMusicVoiceState } from './music/handlers.js';
import { lavalink } from './music/lavalink.js';
import { restoreSessions } from './music/session.js';
import { startHttpServer } from './server.js';
import { storageBackend } from './storage.js';

const INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.DirectMessages,
];

const client = new Client({
  // L'intent « Présence » sert au partage Spotify ; il est retiré au démarrage s'il n'est pas activé dans le portail Discord
  intents: config.spotify.enabled ? [...INTENTS, GatewayIntentBits.GuildPresences] : INTENTS,
  // Message / membre partiels : le journal voit aussi les messages supprimés qui n'étaient plus en mémoire
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
  // Par défaut le bot ne ping personne (pas de @everyone même si l'IA l'écrit)
  allowedMentions: { parse: [], repliedUser: true },
});

client.once(Events.ClientReady, async (c) => {
  setAlertClient(c);
  setPaymentsClient(c);
  setAppClient(c);
  console.log(`✅ Connecté en tant que ${c.user.tag} sur ${c.guilds.cache.size} serveur(s)`);
  console.log(`🧠 Chat : ${config.models.chat} (réflexion ${config.models.thinkingLevel}) · 🎨 Images : ${config.limits.imagesEnabled ? config.models.image : 'désactivées'} · 💾 Stockage : ${storageBackend}`);

  c.user.setPresence({
    activities: [{ name: 'custom', type: ActivityType.Custom, state: config.botStatus }],
    status: 'online',
  });

  try {
    await c.application.commands.set(commandDefinitions.map((cmd) => cmd.toJSON()));
    console.log(`📜 ${commandDefinitions.length} commandes enregistrées`);
  } catch (err) {
    console.error('❌ Enregistrement des commandes impossible :', err);
  }

  putSiteInBio(c, { tag: 'bot' });
  lavalink.init(c);
  startVoiceGuard(c);
  startLevelLoops(c);
  startTreasury(c);
  autoInstallBotChannels(c).catch((err) => console.warn('[salons] installation :', err.message));
  startVoiceExtras(c);
  startWeeklyReports(c).catch((err) => console.warn('[rapport] démarrage :', err.message));
  startVoiceKeeper(c).catch((err) => console.warn('[voc] démarrage :', err.message));
  startVoiceAssistant(c).catch((err) => console.warn('[vocal] démarrage :', err.message));
  startReminderLoop(c);
  startSpotifyWatch(c);
  startFantasyLoop(c);
  startBattleLoop(c);
  setLiveClient(c);
  // Reprise de la musique interrompue par un redémarrage
  setTimeout(() => restoreSessions(c).catch((err) => console.warn('[musique] reprise :', err.message)), 8_000);
});

attachSecurityEvents(client);

client.on(Events.MessageCreate, (message) => {
  onMessage(client, message).catch((err) => console.error('[messageCreate]', err));
});

client.on(Events.InteractionCreate, (interaction) => {
  onInteraction(client, interaction).catch((err) => console.error('[interactionCreate]', err));
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

// Render arrête l'ancienne version à chaque mise à jour : on coupe proprement ses lecteurs audio
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`🛑 ${signal} reçu : arrêt propre`);
  await Promise.race([lavalink.shutdown(), new Promise((resolve) => setTimeout(resolve, 5_000))]).catch(() => {});
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
  await client.login(config.discordToken).catch((err) => {
    console.error('❌ Connexion à Discord impossible (token invalide ou intents pas activés ?) :', err.message);
    process.exit(1);
  });
  // Le casino a son propre bot : il se connecte à côté, et son absence ne gêne pas le reste.
  startCasinho().catch((err) => console.error('🎰 Casinho :', err.message));
})();
