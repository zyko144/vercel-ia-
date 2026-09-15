import { ActivityType, Client, Events, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { commandDefinitions } from './commands/definitions.js';
import { onInteraction } from './handlers/interactions.js';
import { onMessage } from './handlers/messages.js';
import { startReminderLoop } from './features/reminders.js';
import { startVoiceKeeper } from './features/voice.js';
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

  startVoiceKeeper(c);
  startReminderLoop(c);
});

client.on(Events.MessageCreate, (message) => {
  onMessage(client, message).catch((err) => console.error('[messageCreate]', err));
});

client.on(Events.InteractionCreate, (interaction) => {
  onInteraction(client, interaction).catch((err) => console.error('[interactionCreate]', err));
});

client.on(Events.Error, (err) => console.error('[discord]', err));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

startHttpServer(() => ({
  bot: client.user?.username,
  discord: client.isReady() ? 'ready' : 'connecting',
  uptime: Math.round(process.uptime()),
}));

client.login(config.discordToken).catch((err) => {
  console.error('❌ Connexion à Discord impossible (token invalide ou intents pas activés ?) :', err.message);
  process.exit(1);
});
