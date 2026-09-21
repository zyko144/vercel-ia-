// La roulette côté Discord : le message du salon qui ouvre la table cliquable, et
// le résultat de chaque tour affiché dedans (le tapis, le numéro, les gains).
//
// « Ouvrir la table » lance l'Activité Discord (la table s'ouvre dans Discord).
// Si l'Activité n'est pas encore activée pour Casinho, ou pour jouer depuis un
// navigateur, le bot donne à la place un lien personnel, en privé.
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { chips } from './economy.js';
import { pocketLabel } from './games.js';
import { onRoundEnd, winningSpots } from './roulette.js';
import { personalLink } from './roulette-web.js';
import { tapisScene } from './render/tapis.js';

const COLOR = 0xff3fa6;
const tableMessages = new Map(); // salon → le message qui montre la table

export const isRouletteButton = (interaction) => interaction.isButton() && interaction.customId.startsWith('crl:');

const nameOf = (interaction) => interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;
const ephemeral = (payload) => ({ ...payload, flags: MessageFlags.Ephemeral });

function buttons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('crl:ouvrir').setLabel('Ouvrir la table').setEmoji('🎡').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('crl:lien').setLabel('Jouer dans le navigateur').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// Le tapis vide, dessiné une fois : c'est l'affiche de la table.
let poster = null;
const posterImage = () => {
  poster ??= tapisScene({ seats: [], title: 'CLIQUE POUR JOUER', right: 'TOUT LE SALON' }).catch((err) => {
    poster = null;
    throw err;
  });
  return poster;
};

/** Le hall devient la table du salon : présentation, et le bouton qui l'ouvre. */
export async function openRouletteHall(interaction) {
  const image = await posterImage().catch(() => null);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎡 Roulette — la table du salon')
    .setDescription(
      [
        'Une vraie table : choisis un **jeton** (10, 20, 50, 100… jusqu’au million) et **clique sur le tapis** pour le poser. Autant de jetons que tu veux, où tu veux ; clic droit pour en retirer un.',
        '',
        '👥 Tout le salon joue à la **même table** : chacun pose ses jetons de son côté, dans sa couleur, et une seule bille décide pour tout le monde.',
        '',
        'Appuie sur **Lancer** quand tu es prêt : la bille part quand tout le monde a lancé, ou 15 s après le premier.',
      ].join('\n'),
    )
    .setFooter({ text: 'Jetons fictifs · rien n’est prélevé avant le lancement · le résultat de chaque tour s’affiche ici' });
  const files = image ? [new AttachmentBuilder(image, { name: 'table-roulette.jpg' })] : [];
  if (image) embed.setImage('attachment://table-roulette.jpg');
  await interaction.update({ content: '', embeds: [embed], components: buttons(), files, attachments: [] });
  if (interaction.message) tableMessages.set(interaction.channelId, interaction.message);
}

/** Le lien personnel, en privé : il connecte à son propre compte de jetons. */
function linkReply(interaction, intro) {
  const link = personalLink({ id: interaction.user.id, name: nameOf(interaction) }, interaction.channelId);
  return interaction.reply(
    ephemeral({
      content: `${intro}\nCe lien est **personnel** (il joue avec tes jetons) : ne le partage pas. Il reste valable 12 h.`,
      components: [
        new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel('Ouvrir ma table').setEmoji('🎡')),
      ],
    }),
  );
}

export async function handleRouletteButton(interaction) {
  const [, action] = interaction.customId.split(':');
  if (interaction.message) tableMessages.set(interaction.channelId, interaction.message);

  if (action === 'ouvrir') {
    try {
      // La table s'ouvre dans Discord, pour ce joueur, dans ce salon.
      return await interaction.launchActivity();
    } catch (err) {
      console.warn('[casinho] Activité roulette indisponible :', err.message);
      return linkReply(interaction, '🎡 La table ne peut pas encore s’ouvrir dans Discord : voici ton lien pour jouer dans le navigateur.');
    }
  }
  if (action === 'lien') return linkReply(interaction, '🌐 Ta table de roulette, dans le navigateur :');
  return interaction.deferUpdate();
}

// ------------------------------------------------------------ Fin de chaque tour
/** Le message du salon montre le dernier tour : le tapis, le numéro, qui a gagné quoi. */
async function showRound(summary) {
  const message = tableMessages.get(summary.roomId);
  if (!message) return;
  const played = summary.results.filter((result) => !result.dropped);
  const winners = played.filter((result) => result.net > 0).length;
  const image = await tapisScene({
    seats: played.map((result) => ({ color: played.length > 1 ? result.colour : null, bets: result.bets })),
    pocket: summary.pocket,
    winning: winningSpots(summary.pocket),
    result: {
      tone: winners ? 'win' : 'lose',
      title: played.length === 1 ? (winners ? 'GAGNÉ' : played[0].net === 0 ? 'ÉGALITÉ' : 'PERDU') : winners ? `${winners} GAGNANT${winners > 1 ? 'S' : ''}` : 'LA BANQUE GAGNE',
      sub: played.length === 1 ? `${played[0].name} · ${played[0].net > 0 ? '+' : ''}${Math.round(played[0].net).toLocaleString('fr-FR')} jetons` : `sur ${played.length} joueurs`,
    },
    players: played.length > 1
      ? played.map((result) => ({
          name: result.name,
          text: `${result.net > 0 ? '+' : ''}${Math.round(result.net).toLocaleString('fr-FR')}`,
          color: result.colour.color,
          tone: result.net > 0 ? '#9dffc6' : result.net < 0 ? '#ffb3c1' : '#ffffff',
        }))
      : [],
  }).catch(() => null);

  const lines = summary.results.map((result) =>
    result.dropped
      ? `➖ **${result.name}** — solde insuffisant au lancement, jetons rendus`
      : `${result.net > 0 ? '✅' : result.net < 0 ? '❌' : '➖'} **${result.name}** ${result.net > 0 ? '+' : ''}${chips(result.net)} · mise ${chips(result.total)}`,
  );
  const embed = new EmbedBuilder()
    .setColor(winners ? 0x49c78a : 0xd2536a)
    .setTitle(`🎡 Roulette — tour ${summary.round}`)
    .setDescription([`La bille est tombée sur ${pocketLabel(summary.pocket)}.`, '', ...lines].join('\n').slice(0, 4000))
    .setFooter({ text: 'La table continue : « Ouvrir la table » pour jouer le tour suivant' });
  const name = `roulette-tour-${summary.round}.jpg`;
  if (image) embed.setImage(`attachment://${name}`);
  await message.edit({ content: '', embeds: [embed], components: buttons(), files: image ? [new AttachmentBuilder(image, { name })] : [], attachments: [] });
}

onRoundEnd((summary) =>
  showRound(summary).catch((err) => {
    console.warn('[casinho] roulette (message du salon) :', err.message);
    // Message supprimé ou inaccessible : on arrête de le mettre à jour.
    tableMessages.delete(summary.roomId);
  }),
);
