import './utils/logbuffer.js'; // en premier : capte tous les logs pour l'API d'admin
import { ActivityType, Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { adminRoutes, testAudioFile } from './admin.js';
import { startVoiceAssistant } from './voice-ai/assistant.js';
import { config } from './config.js';
import { commandDefinitions } from './commands/definitions.js';
import { onInteraction } from './handlers/interactions.js';
import { onMessage } from './handlers/messages.js';
import { startReminderLoop } from './features/reminders.js';
import { startVoiceKeeper } from './features/voice.js';
import { ensureBinaries } from './music/binaries.js';
import { handleMusicVoiceState } from './music/handlers.js';
import { lavalink } from './music/lavalink.js';
import { restoreSessions } from './music/session.js';
import { startHttpServer } from './server.js';
import { storageBackend } from './storage.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
  // Par défaut le bot ne ping personne (pas de @everyone même si l'IA l'écrit)
  allowedMentions: { parse: [], repliedUser: true },
});

client.once(Events.ClientReady, async (c) => {
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

  lavalink.init(c);
  startVoiceKeeper(c).catch((err) => console.warn('[voc] démarrage :', err.message));
  startVoiceAssistant(c).catch((err) => console.warn('[vocal] démarrage :', err.message));
  startReminderLoop(c);
  // Reprise de la musique interrompue par un redémarrage
  setTimeout(() => restoreSessions(c).catch((err) => console.warn('[musique] reprise :', err.message)), 8_000);
});

client.on(Events.MessageCreate, (message) => {
  onMessage(client, message).catch((err) => console.error('[messageCreate]', err));
});

client.on(Events.InteractionCreate, (interaction) => {
  onInteraction(client, interaction).catch((err) => console.error('[interactionCreate]', err));
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => handleMusicVoiceState(oldState, newState));

// Les serveurs audio ont besoin des événements vocaux bruts de Discord
client.on(Events.Raw, (packet) => lavalink.handleRaw(packet));

client.on(Events.Error, (err) => console.error('[discord]', err));

// Prépare yt-dlp dès le démarrage pour que le premier /play soit rapide
ensureBinaries().catch((err) => console.warn('[musique] yt-dlp indisponible :', err.message));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

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

startHttpServer(() => ({
  bot: client.user?.username,
  discord: client.isReady() ? 'ready' : 'connecting',
  uptime: Math.round(process.uptime()),
}), adminRoutes(client), testAudioFile);

client.login(config.discordToken).catch((err) => {
  console.error('❌ Connexion à Discord impossible (token invalide ou intents pas activés ?) :', err.message);
  process.exit(1);
});
