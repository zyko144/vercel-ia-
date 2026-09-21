// Bot Casinho : un deuxième client Discord, avec son propre token et ses propres
// commandes. Il tourne dans le même processus que le bot principal mais n'a rien en
// commun avec lui, à part le stockage (Supabase ou fichiers locaux).
import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { casinhoCommands } from './commands.js';
import { handleBlackjackButton, isBlackjackButton } from './blackjack.js';
import { handleLiveButton, isLiveButton } from './live.js';
import { handleMultiComponent, isMultiComponent } from './multi.js';
import { handleTableComponent, isTableComponent, openLobby } from './table.js';
import { adminChips, claimDaily, claimRescue, givePlayer, showBalance, showHelp, showLeaderboard, showPaytable, showStats } from './wallet.js';

let client = null;

// Tous les jeux, duel compris, se lancent depuis le hall ouvert par /casino.
const HANDLERS = {
  casino: openLobby,
  // Banque
  solde: showBalance,
  quotidien: claimDaily,
  secours: claimRescue,
  donner: givePlayer,
  classement: showLeaderboard,
  stats: showStats,
  // Informations
  'casino-aide': showHelp,
  'casino-gains': showPaytable,
  'casino-admin': adminChips,
};

async function onInteraction(interaction) {
  try {
    if (isMultiComponent(interaction)) return await handleMultiComponent(interaction);
    if (isTableComponent(interaction)) return await handleTableComponent(interaction);
    if (isBlackjackButton(interaction)) return await handleBlackjackButton(interaction);
    if (isLiveButton(interaction)) return await handleLiveButton(interaction);
    if (!interaction.isChatInputCommand()) return;

    const handler = HANDLERS[interaction.commandName];
    if (!handler) return;
    await handler(interaction);
  } catch (err) {
    console.error(`[casinho] ${interaction.commandName ?? interaction.customId} :`, err);
    const payload = { content: 'Aïe, la table a bugué. Réessaie — si une mise est passée, elle est bien enregistrée.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}

export async function startCasinho() {
  if (!config.casinho.token) {
    console.log('🎰 Bot Casinho en pause : aucun token trouvé (ajoute TOKEN_CASINHO dans .env ou dans Render > Environment).');
    return null;
  }

  client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: { parse: ['users'] },
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`🎰 Casinho connecté en tant que ${c.user.tag} sur ${c.guilds.cache.size} serveur(s) (token : ${config.casinho.tokenSource})`);
    c.user.setPresence({
      activities: [{ name: 'custom', type: ActivityType.Custom, state: config.casinho.status }],
      status: 'online',
    });
    try {
      const payload = casinhoCommands.map((command) => command.toJSON());
      // Enregistrement sur le serveur du casino : les commandes apparaissent tout de suite.
      if (config.casinho.guildId) {
        const guild = await c.guilds.fetch(config.casinho.guildId).catch(() => null);
        if (guild) {
          await guild.commands.set(payload);
          console.log(`🎰 ${payload.length} commandes disponibles sur ${guild.name}`);
          return;
        }
        console.warn(`🎰 Serveur ${config.casinho.guildId} introuvable : enregistrement global (jusqu’à 1 h d’attente).`);
      }
      await c.application.commands.set(payload);
      console.log(`🎰 ${payload.length} commandes enregistrées globalement`);
    } catch (err) {
      console.error('🎰 Enregistrement des commandes impossible :', err);
    }
  });

  client.on(Events.InteractionCreate, (interaction) => {
    onInteraction(interaction).catch((err) => console.error('[casinho:interaction]', err));
  });
  client.on(Events.Error, (err) => console.error('[casinho]', err));

  try {
    await client.login(config.casinho.token);
  } catch (err) {
    console.error(`🎰 Connexion impossible (token ${config.casinho.tokenSource}) :`, err.message);
    client = null;
    return null;
  }
  return client;
}

export const casinhoClient = () => client;
