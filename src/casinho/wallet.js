// Commandes de banque et d'information : solde, cadeaux du jour, classement, règles.
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { blackjackRules } from './blackjack.js';
import { DICE_BETS, diceRtp, ROULETTE_BETS, rouletteRtp, slotPaytable, slotRtp } from './games.js';
import { MINES_TOTAL, minesMultiplier } from './live.js';
import { balance, chips, daily, grant, isAdmin, leaderboard, reset, rescue, stats, transfer, waitLabel } from './economy.js';

const COLOR = 0xff3fa6;
const MEDALS = ['🥇', '🥈', '🥉'];
const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

export async function showBalance(interaction) {
  const target = interaction.options.getUser('joueur') ?? interaction.user;
  const amount = await balance(target.id);
  const mine = target.id === interaction.user.id;
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({ name: target.displayName ?? target.username, iconURL: target.displayAvatarURL() })
        .setTitle(mine ? 'Ton solde' : `Le solde de ${target.displayName ?? target.username}`)
        .setDescription(`## ${chips(amount)}`)
        .setFooter({ text: 'Jetons fictifs : ni achat, ni dépôt, ni retrait, aucun argent réel.' }),
    ],
  });
}

export async function claimDaily(interaction) {
  const result = await daily(interaction.user.id);
  if (!result.ok) return interaction.reply(ephemeral(`⏳ Reviens dans **${waitLabel(result.wait)}** pour tes jetons du jour.`));
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x49c78a)
        .setTitle('🎁 Jetons du jour')
        .setDescription(
          [
            `Tu reçois **${chips(result.amount)}**.`,
            `Série de ${result.streak} jour(s) · bonus +${chips(Math.min(7, result.streak) * config.casinho.dailyStreakBonus)}`,
            `Nouveau solde : ${chips(result.balance)}`,
          ].join('\n'),
        )
        .setFooter({ text: 'La série repart de zéro après 48 h sans passage.' }),
    ],
  });
}

export async function claimRescue(interaction) {
  const result = await rescue(interaction.user.id);
  if (result.ok) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x49c78a)
          .setTitle('🛟 Coup de pouce')
          .setDescription(`Tu récupères **${chips(result.amount)}**.\nNouveau solde : ${chips(result.balance)}`),
      ],
    });
  }
  if (result.reason === 'attente') return interaction.reply(ephemeral(`⏳ Encore **${waitLabel(result.wait)}** avant le prochain coup de pouce.`));
  return interaction.reply(ephemeral(`Le coup de pouce n’arrive qu’en dessous de ${chips(config.casinho.rescueThreshold)}.`));
}

export async function givePlayer(interaction) {
  const target = interaction.options.getUser('joueur');
  const amount = interaction.options.getInteger('montant');
  if (target.bot) return interaction.reply(ephemeral('Les bots n’ont pas de portefeuille.'));

  const result = await transfer(interaction.user.id, target.id, amount);
  if (!result.ok) {
    if (result.reason === 'soi-même') return interaction.reply(ephemeral('Tu ne peux pas te donner des jetons à toi-même.'));
    if (result.reason === 'solde') return interaction.reply(ephemeral(`Tu n’as que ${chips(result.chips)}.`));
    return interaction.reply(ephemeral('Montant invalide.'));
  }
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('🤝 Jetons envoyés')
        .setDescription(`<@${interaction.user.id}> donne **${chips(amount)}** à <@${target.id}>.`)
        .setFooter({ text: `Il te reste ${Math.round(result.from).toLocaleString('fr-FR')} jetons.` }),
    ],
  });
}

export async function showLeaderboard(interaction) {
  const top = await leaderboard(10);
  if (!top.length) return interaction.reply(ephemeral('Personne n’a encore joué. Lance `/quotidien` pour ouvrir le bal.'));

  const lines = await Promise.all(
    top.map(async (entry, index) => {
      const user = await interaction.client.users.fetch(entry.id).catch(() => null);
      const name = user ? (user.displayName ?? user.username) : `Joueur ${entry.id.slice(-4)}`;
      return `${MEDALS[index] ?? `**${index + 1}.**`} ${name} — ${chips(entry.chips)}`;
    }),
  );

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🏆 Les plus riches du Casinho').setDescription(lines.join('\n'))],
  });
}

export async function showStats(interaction) {
  const target = interaction.options.getUser('joueur') ?? interaction.user;
  const me = await stats(target.id);
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({ name: target.displayName ?? target.username, iconURL: target.displayAvatarURL() })
        .setTitle('📊 Statistiques')
        .addFields(
          { name: 'Solde', value: chips(me.chips), inline: true },
          { name: 'Classement', value: me.rank ? `#${me.rank}` : '—', inline: true },
          { name: 'Parties', value: me.played.toLocaleString('fr-FR'), inline: true },
          { name: 'Total misé', value: chips(me.wagered), inline: true },
          { name: 'Total gagné', value: chips(me.won), inline: true },
          { name: 'Plus gros gain', value: chips(me.biggest), inline: true },
        )
        .setFooter({ text: 'Jetons fictifs · aucun argent réel' }),
    ],
  });
}

export async function adminChips(interaction) {
  if (!isAdmin(interaction.user.id)) return interaction.reply(ephemeral('Cette commande est réservée aux responsables du casino.'));
  const action = interaction.options.getString('action');
  const target = interaction.options.getUser('joueur');
  const amount = interaction.options.getInteger('montant');

  if (action === 'reset') {
    const after = await reset(target.id);
    return interaction.reply(ephemeral(`Compte de ${target.username} remis à zéro : ${chips(after)}.`));
  }
  if (!amount) return interaction.reply(ephemeral('Indique un montant.'));
  const after = await grant(target.id, action === 'retirer' ? -amount : amount);
  return interaction.reply(ephemeral(`${action === 'retirer' ? 'Retiré' : 'Ajouté'} ${chips(amount)} — ${target.username} a maintenant ${chips(after)}.`));
}

export async function showHelp(interaction) {
  const site = config.casinho.siteUrl ? `\n\n🌐 Le casino en ligne : ${config.casinho.siteUrl}` : '';
  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('🎰 Bienvenue au Casinho')
        .setDescription(
          [
            'Tape **`/casino`** et choisis ta table — ou lance directement le jeu qui te tente.',
            'Tout se passe ensuite dans l’embed : la mise avec les boutons, le pari avec le menu, puis **Jouer**.',
            '',
            `Tout se joue en **jetons fictifs**. Ils ne s’achètent pas, ne se retirent pas, et ne valent rien en dehors du serveur.${site}`,
          ].join('\n'),
        )
        .addFields(
          {
            name: '💰 Banque',
            value: [
              '`/solde` — combien il te reste',
              '`/quotidien` — tes jetons du jour (+ bonus de série)',
              '`/secours` — un coup de pouce quand tu es à sec',
              '`/donner` — envoyer des jetons à quelqu’un',
              '`/classement` · `/stats` — qui mène la danse',
            ].join('\n'),
          },
          {
            name: '🎰 Ouvrir le casino',
            value: '`/casino` — le hall : choisis ta table dans le menu, tout se joue ensuite dans l’embed.',
          },
          {
            name: '🃏 Jeux de table',
            value: [
              '`/blackjack` — contre le croupier, avec doubler et séparer',
              '`/roulette` — européenne, un seul zéro',
              '`/rougenoir` — une carte, une couleur',
            ].join('\n'),
          },
          {
            name: '🎲 Jeux rapides',
            value: ['`/machine` — trois rouleaux', '`/des` — le total de deux dés', '`/pileouface` — une pièce, deux issues'].join('\n'),
          },
          {
            name: '🚀 Jeux à encaissement',
            value: [
              '`/mines` — ouvre des cases, encaisse avant la bombe',
              '`/crash` — le multiplicateur grimpe, encaisse à temps',
              '`/plusoumoins` — la carte suivante, plus haute ou plus basse',
              '`/duel` — joueur contre joueur, sans avantage de la maison',
            ].join('\n'),
          },
          { name: '📈 Les chances', value: 'Tout est calculé, rien n’est inventé : `/casino-gains` donne les probabilités exactes de chaque jeu.' },
        )
        .setFooter({ text: 'Aucune option à retenir : la mise se règle avec les boutons. Joue pour le plaisir.' }),
    ],
  });
}

export async function showPaytable(interaction) {
  const roulette = ['rouge', 'douzaine1', 'plein']
    .map((key) => `${ROULETTE_BETS[key].label} → ×${ROULETTE_BETS[key].pays} · ${ROULETTE_BETS[key].count}/37 · TRJ ${(rouletteRtp(key) * 100).toFixed(1)} %`)
    .join('\n');
  const dice = Object.entries(DICE_BETS)
    .map(([key, rule]) => `${rule.label} → ×${rule.pays} · ${rule.ways}/36 · TRJ ${(diceRtp(key) * 100).toFixed(1)} %`)
    .join('\n');
  const mines = [1, 3, 5]
    .map((bombs) => `${bombs} bombe(s) : 1 case ×${minesMultiplier(bombs, 1).toFixed(2)} · 5 cases ×${minesMultiplier(bombs, 5).toFixed(2)}`)
    .join('\n');

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('📈 Gains et probabilités')
        .setDescription('Le **TRJ** est ce que le jeu rend en moyenne sur 100 jetons misés. Le reste est l’avantage de la maison.')
        .addFields(
          { name: `🎰 Machine à sous — TRJ ${(slotRtp() * 100).toFixed(2)} %`, value: slotPaytable() },
          { name: '🎡 Roulette', value: roulette },
          { name: '🎲 Dés', value: dice },
          { name: '🪙 Pile ou face · 🃏 Rouge ou noir', value: '×1,95 pour une chance sur deux · TRJ 97,5 %' },
          { name: `💣 Mines (${MINES_TOTAL} cases)`, value: mines },
          { name: '🚀 Crash · 🔼 Plus ou moins', value: 'Multiplicateurs calculés à 97 % de la valeur équitable · TRJ 97 %' },
          { name: '♠️ Blackjack', value: `• ${blackjackRules}` },
        )
        .setFooter({ text: 'Ces nombres sont calculés à partir du code, pas écrits à la main.' }),
    ],
  });
}
