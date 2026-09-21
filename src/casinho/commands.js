// Les commandes du bot Casinho. Un seul point d'entrée pour jouer : /casino ouvre
// le hall, on y choisit sa table, et tout se règle ensuite dans l'embed. Les autres
// commandes servent à la banque et aux informations.
import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

const guildOnly = (builder) => builder.setContexts(InteractionContextType.Guild);

export const casinhoCommands = [
  // ---------- Jouer ----------
  guildOnly(new SlashCommandBuilder().setName('casino').setDescription('Ouvrir le casino : choisis ton jeu, ta mise, et joue')),

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

  // ---------- Informations ----------
  guildOnly(new SlashCommandBuilder().setName('casino-aide').setDescription('Comment jouer, et toutes les commandes du casino')),
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
