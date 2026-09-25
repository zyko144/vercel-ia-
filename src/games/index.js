// Point d'entrée des jeux : commandes /jeu-…, boutons (préfixe « g: ») et réponses écrites dans les salons.
import { handleBattleComponent } from './battle.js';
import { PRIVATE, gameChannel, handleLobbyButton } from './common.js';
import { fantasyAutocomplete, fantasyRanking, fantasyTeam } from './fantasy.js';
import { handleFansButton, startFans } from './fans.js';
import { handleFreestyleButton, startFreestyle } from './freestyle.js';
import { handleStoryButton, startStory } from './histoire.js';
import { handleImpostorComponent, startImpostor } from './imposteur.js';
import { handleWerewolfComponent, startWerewolf } from './loupgarou.js';
import { handleRebusButton, startRebus } from './rebus.js';
import { handleSoireeComponent } from './soirees.js';
import { handleDuelComponent } from './duels.js';
import { handleTripotComponent } from './tripot.js';
import { handleDefiComponent } from './defis.js';

export { routeGameMessage } from './common.js';
export { startFantasyLoop } from './fantasy.js';
export { startBattleLoop, startBattle } from './battle.js';
export { startDefis } from './defis.js';

export const isGameComponent = (interaction) => (interaction.customId ?? '').startsWith('g:');

const COMPONENTS = {
  lobby: handleLobbyButton,
  fans: handleFansButton,
  rebus: handleRebusButton,
  imp: handleImpostorComponent,
  lg: handleWerewolfComponent,
  hist: handleStoryButton,
  fs: handleFreestyleButton,
  bat: handleBattleComponent,
  ng: handleSoireeComponent,
  duel: handleDuelComponent,
  tp: handleTripotComponent,
  df: handleDefiComponent,
};

export async function handleGameComponent(client, interaction) {
  const kind = interaction.customId.split(':')[1];
  const handler = COMPONENTS[kind];
  if (!handler) return interaction.reply({ content: 'Ce bouton ne marche plus.', ...PRIVATE });
  return handler(interaction);
}

export const GAME_HANDLERS = {
  'jeu-freestyle': (client, interaction) => startFreestyle(interaction, {
    opponent: interaction.options.getUser('adversaire', true),
    style: interaction.options.getString('instru') ?? 'trap',
    seconds: interaction.options.getInteger('duree') ?? 45,
  }),
  'jeu-loupgarou': (client, interaction) => startWerewolf(interaction),
  'jeu-histoire': (client, interaction) => startStory(interaction, {
    theme: interaction.options.getString('univers') ?? 'fantasy',
    length: interaction.options.getString('longueur') ?? 'normale',
    mode: interaction.options.getString('mode') ?? 'texte',
  }),
  'jeu-fans': (client, interaction) => startFans(interaction, interaction.options.getString('theme') ?? 'tout'),
  'jeu-rebus': async (client, interaction) => startRebus(interaction, {
    theme: interaction.options.getString('theme') ?? 'tout',
    rounds: interaction.options.getInteger('manches') ?? 10,
    channel: await gameChannel(interaction),
  }),
  'jeu-imposteur': (client, interaction) => startImpostor(interaction, interaction.options.getString('theme') ?? 'tout'),
  'jeu-fantasy': (client, interaction) => (interaction.options.getSubcommand() === 'classement' ? fantasyRanking(interaction) : fantasyTeam(interaction)),
};

export async function handleGameAutocomplete(interaction) {
  if (interaction.commandName === 'jeu-fantasy') return fantasyAutocomplete(interaction);
  return interaction.respond([]);
}
