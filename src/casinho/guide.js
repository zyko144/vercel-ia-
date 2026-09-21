// Le guide du casino : ce qu'affiche /casino-aide, et le message épinglé du salon
// des jeux. Un seul texte pour les deux, pour qu'ils ne se contredisent jamais.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { slotRtp } from './games.js';

const COLOR = 0xff3fa6;
const n = (value) => Math.round(value).toLocaleString('fr-FR');

export function guideEmbeds() {
  const daily = config.casinho.dailyReward;
  const site = config.casinho.siteUrl ? `\n🌐 Le casino en ligne : ${config.casinho.siteUrl}` : '';

  const welcome = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎰 Bienvenue au Casinho')
    .setDescription(
      [
        '**Une seule commande pour jouer : `/casino`.**',
        '',
        '1️⃣ Tape `/casino` et choisis ta table dans le menu.',
        '2️⃣ Règle ta mise avec les boutons (100 · 1k · 10k · 100k · 1M, ÷2, ×2, Tout).',
        '3️⃣ Choisis ton pari dans le menu si le jeu en a un, puis appuie sur **▶️ Jouer**.',
        '4️⃣ À la fin, **🔁 Rejouer** relance avec la même mise.',
        '',
        '👥 **À plusieurs** : dans le même menu, choisis une table « à plusieurs » (roulette, crash, blackjack). Elle s’ouvre pour tout le salon : chacun clique sur sa mise, et un seul tirage vaut pour tout le monde.',
        '',
        `🎁 Chaque jour : **${n(daily)} jetons** avec \`/quotidien\` (ou le bouton du hall), et un bonus si tu reviens plusieurs jours de suite.`,
        '',
        `Les jetons sont **fictifs** : ils ne s’achètent pas, ne se retirent pas et ne valent rien en dehors du serveur.${site}`,
      ].join('\n'),
    );

  const games = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🃏 Les jeux')
    .addFields(
      {
        name: '♠️ Blackjack',
        value: 'Bats le croupier sans dépasser 21. **Tirer**, **Rester**, **Doubler**, **Séparer**. Quand tu restes, le croupier retourne sa carte et tire devant toi. Blackjack payé 3:2.',
      },
      {
        name: '🎡 Roulette',
        value: 'Roulette européenne, un seul zéro. Rouge, noir, pair, impair, manque, passe (×2), douzaines et colonnes (×3), ou un numéro plein (×36). La bille tombe dans la vraie case tirée.',
      },
      { name: '🎰 Machine à sous', value: `Trois rouleaux. Trois 7 paient ×200, trois 💎 ×80. Redistribution ${(slotRtp() * 100).toFixed(1)} %.` },
      { name: '🎲 Dés', value: 'Deux dés : plus de 7 ou moins de 7 (×2,32), exactement 7 (×5,75).', inline: true },
      { name: '🪙 Pile ou face', value: 'Une chance sur deux, gain ×1,95.', inline: true },
      { name: '🃏 Rouge ou noir', value: 'Devine la couleur de la carte, gain ×1,95.', inline: true },
      {
        name: '🚀 Crash',
        value: 'La fusée décolle et le multiplicateur grimpe. Appuie sur **Encaisser** avant qu’elle explose — ou choisis un encaissement **automatique** (×1,5 à ×10) avant le départ.',
      },
      { name: '💣 Mines', value: '20 cases, des bombes cachées. Chaque case sûre fait monter le gain ; encaisse quand tu veux.', inline: true },
      { name: '🔼 Plus ou moins', value: 'La carte suivante sera-t-elle plus haute ou plus basse ? Les gains s’enchaînent.', inline: true },
      { name: '⚔️ Duel', value: 'Défie un membre à pile ou face : choisis-le dans le menu, le gagnant prend les deux mises. Aucun prélèvement.' },
      {
        name: '👥 Tables à plusieurs',
        value: [
          '**Roulette** — une seule bille, chacun son pari.',
          '**Crash** — une seule fusée, chacun encaisse quand il veut (ou en automatique).',
          '**Blackjack** — jusqu’à 5 joueurs contre le même croupier, chacun joue sa main à son tour.',
          'Clique sur ta mise pour t’asseoir. Départ quand l’hôte lance, ou tout seul au bout de 30 s. Les mises ne sont prélevées qu’au départ.',
        ].join('\n'),
      },
    );

  const commands = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('⌨️ Les commandes')
    .addFields(
      { name: 'Jouer', value: '`/casino` — le hall : tous les jeux sont là' },
      {
        name: 'Banque',
        value: [
          '`/solde` — ton solde (ou celui d’un autre)',
          `\`/quotidien\` — ${n(daily)} jetons par jour`,
          '`/secours` — un coup de pouce quand tu es à sec',
          '`/donner` — envoyer des jetons à quelqu’un',
          '`/classement` · `/stats` — qui mène la danse',
        ].join('\n'),
      },
      { name: 'Infos', value: '`/casino-aide` — ce guide\n`/casino-gains` — les gains et les probabilités exactes de chaque jeu' },
    )
    .setFooter({ text: 'Tout est calculé, rien n’est inventé : les chances affichées découlent du code. Joue pour le plaisir.' });

  return [welcome, games, commands];
}

/** Le bouton posé sous le guide épinglé : un clic ouvre le casino, sans taper /casino. */
export function guideButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ctb:open:guide').setLabel('Ouvrir le casino').setEmoji('🎰').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ctb:daily:guide').setLabel('Jetons du jour').setEmoji('🎁').setStyle(ButtonStyle.Primary),
    ),
  ];
}
