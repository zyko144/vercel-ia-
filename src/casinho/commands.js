// Les commandes du bot Casinho.
// Elles servent surtout à ouvrir une table : la mise, le pari et le jeu se règlent
// ensuite dans l'embed, avec les boutons. Aucune option n'est obligatoire.
import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';

const guildOnly = (builder) => builder.setContexts(InteractionContextType.Guild);
/** Mise de départ facultative : sans elle, la table reprend la dernière mise du joueur. */
const betOption = (o) =>
  o.setName('mise').setDescription('Mise de départ (réglable ensuite avec les boutons)').setMinValue(1).setMaxValue(config.casinho.maxBet);

const game = (name, description) => guildOnly(new SlashCommandBuilder().setName(name).setDescription(description).addIntegerOption(betOption));

export const casinhoCommands = [
  // ---------- Entrée ----------
  guildOnly(new SlashCommandBuilder().setName('casino').setDescription('Ouvrir le casino et choisir un jeu')),

  // ---------- Banque ----------
  guildOnly(
    new SlashCommandBuilder()
      .setName('solde')
      .setDescription('Voir ton solde de jetons')
      .addUserOption((o) => o.setName('joueur').setDescription('Le solde de quelqu’un d’autre')),
  ),
  guildOnly(new SlashCommandBuilder().setName('quotidien').setDescription('Récupérer tes jetons du jour (série de connexions bonus)')),
  guildOnly(new SlashCommandBuilder().setName('secours').setDescription('À sec ? Un petit coup de pouce, une fois par heure')),
  guildOnly(
    new SlashCommandBuilder()
      .setName('donner')
      .setDescription('Donner des jetons à un autre joueur')
      .addUserOption((o) => o.setName('joueur').setDescription('À qui ?').setRequired(true))
      .addIntegerOption((o) => o.setName('montant').setDescription('Combien de jetons').setRequired(true).setMinValue(1)),
  ),
  guildOnly(new SlashCommandBuilder().setName('classement').setDescription('Les dix plus gros tas de jetons du serveur')),
  guildOnly(
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Tes statistiques de joueur')
      .addUserOption((o) => o.setName('joueur').setDescription('Les statistiques de quelqu’un d’autre')),
  ),

  // ---------- Tables ----------
  game('blackjack', 'Blackjack : tirer, rester, doubler, séparer, tout dans l’embed'),
  game('roulette', 'Roulette européenne : choisis ton pari et ta mise dans l’embed'),
  game('machine', 'Machine à sous à trois rouleaux'),
  game('des', 'Deux dés : parie sur le total'),
  game('pileouface', 'Pile ou face, gain ×1,95'),
  game('rougenoir', 'Une carte est tirée : rouge ou noir ?'),
  game('mines', 'Ouvre des cases sans tomber sur une bombe, encaisse quand tu veux'),
  game('crash', 'Le multiplicateur grimpe : encaisse avant l’explosion'),
  game('plusoumoins', 'La carte suivante sera-t-elle plus haute ou plus basse ?'),
  guildOnly(
    new SlashCommandBuilder()
      .setName('duel')
      .setDescription('Défie un joueur à pile ou face : le gagnant prend les deux mises')
      .addUserOption((o) => o.setName('joueur').setDescription('Qui tu défies').setRequired(true))
      .addIntegerOption((o) => o.setName('mise').setDescription('Mise du duel').setRequired(true).setMinValue(1).setMaxValue(config.casinho.maxBet)),
  ),

  // ---------- Informations ----------
  guildOnly(new SlashCommandBuilder().setName('casino-aide').setDescription('Toutes les commandes du casino et comment ça marche')),
  guildOnly(new SlashCommandBuilder().setName('casino-gains').setDescription('Les gains et les probabilités de chaque jeu')),
  guildOnly(
    new SlashCommandBuilder()
      .setName('casino-admin')
      .setDescription('Gérer les jetons (réservé aux responsables du casino)')
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('Ce que tu veux faire')
          .setRequired(true)
          .addChoices(
            { name: 'Donner des jetons', value: 'donner' },
            { name: 'Retirer des jetons', value: 'retirer' },
            { name: 'Remettre le compte à zéro', value: 'reset' },
          ),
      )
      .addUserOption((o) => o.setName('joueur').setDescription('Le joueur concerné').setRequired(true))
      .addIntegerOption((o) => o.setName('montant').setDescription('Combien de jetons').setMinValue(1)),
  ),
];

export const CASINHO_COMMAND_NAMES = new Set(casinhoCommands.map((command) => command.name));
