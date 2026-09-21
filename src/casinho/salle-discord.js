// La salle de jeux côté Discord : pour chaque jeu choisi dans le hall, un message
// qui ouvre la table cliquable, et le résultat des tours partagés affiché dedans.
//
// « Ouvrir la table » lance l'Activité Discord (la salle s'ouvre dans Discord, sur
// ce jeu). Si l'Activité n'est pas encore activée pour Casinho, le bot donne à la
// place un lien personnel, en privé. « Jouer ici » garde le jeu dans le message.
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import path from 'node:path';
import { config } from '../config.js';
import { chips } from './economy.js';
import { pocketLabel } from './games.js';
import { CATALOG, gameInfo } from './salle/catalog.js';
import { onRoundEnd } from './salle/common.js';
import { winningSpots } from './salle/roulette.js';
import { openOnArrival, personalLink } from './salle/web.js';
import { openTable } from './table.js';
import { tapisScene } from './render/tapis.js';

const COLOR = 0xff3fa6;
const tableMessages = new Map(); // `${jeu}:${salon}` → le message qui montre la table

export const isSalleButton = (interaction) => interaction.isButton() && interaction.customId.startsWith('csl:');

const nameOf = (interaction) => interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;
const ephemeral = (payload) => ({ ...payload, flags: MessageFlags.Ephemeral });

// L'animation de chaque jeu (assets/casinho/*.gif), pour l'affiche du message.
const ART = { blackjack: 'cartes', crash: 'crash', mines: 'mines', plusoumoins: 'cartes', machine: 'machine', des: 'des', pileouface: 'piece', rougenoir: 'cartes', duel: 'piece' };

function buttons(game) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`csl:ouvrir:${game}`).setLabel('Ouvrir la table').setEmoji('🎰').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`csl:lien:${game}`).setLabel('Dans le navigateur').setEmoji('🌐').setStyle(ButtonStyle.Secondary),
  );
  // La roulette n'existe plus qu'en table cliquable ; les autres jeux se jouent aussi dans le message.
  if (game !== 'roulette' && game !== 'salle') {
    row.addComponents(new ButtonBuilder().setCustomId(`csl:ici:${game}`).setLabel('Jouer ici').setEmoji('💬').setStyle(ButtonStyle.Secondary));
  }
  return [row];
}

// Le tapis vide de la roulette, dessiné une fois : c'est l'affiche de sa table.
let poster = null;
const posterImage = () => {
  poster ??= tapisScene({ seats: [], title: 'CLIQUE POUR JOUER', right: 'TOUT LE SALON' }).catch((err) => {
    poster = null;
    throw err;
  });
  return poster;
};

async function artwork(game) {
  if (game === 'roulette') {
    const image = await posterImage().catch(() => null);
    return image ? { url: 'attachment://table-roulette.jpg', files: [new AttachmentBuilder(image, { name: 'table-roulette.jpg' })] } : { url: null, files: [] };
  }
  const file = `${ART[game] ?? 'roulette'}.gif`;
  if (config.publicUrl) return { url: `${config.publicUrl}/casino/${file}`, files: [] };
  return { url: `attachment://${file}`, files: [new AttachmentBuilder(path.resolve('assets/casinho', file), { name: file })] };
}

/** Le hall devient la table de ce jeu : présentation, et les boutons qui l'ouvrent. */
export async function openGameHall(interaction, game) {
  const info = gameInfo(game);
  const art = await artwork(game);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${info.emoji} ${info.title}`)
    .setDescription(
      [
        info.blurb,
        '',
        '**🎰 Ouvrir la table** : le jeu s’ouvre dans Discord, et tu joues **en cliquant** — tes jetons, les cartes, les cases, la fusée…',
        info.shared ? '👥 Tout le salon joue à la **même table** : chacun mise de son côté, et le résultat s’affiche ici.' : null,
        game !== 'roulette' ? '**💬 Jouer ici** : la version dans ce message, avec les boutons.' : null,
      ].filter((line) => line !== null).join('\n'),
    )
    .setFooter({ text: 'Jetons fictifs · aucun argent réel · tous les jeux sont dans la salle' });
  if (art.url) embed.setImage(art.url);
  await interaction.update({ content: '', embeds: [embed], components: buttons(game), files: art.files, attachments: [] });
  if (interaction.message) tableMessages.set(`${game}:${interaction.channelId}`, interaction.message);
}

/** Le lien personnel, en privé : il connecte à son propre compte de jetons. */
function linkReply(interaction, game, intro) {
  const link = personalLink({ id: interaction.user.id, name: nameOf(interaction) }, interaction.channelId, game === 'salle' ? null : game);
  return interaction.reply(
    ephemeral({
      content: `${intro}\nCe lien est **personnel** (il joue avec tes jetons) : ne le partage pas. Il reste valable 12 h.`,
      components: [
        new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel('Ouvrir la salle de jeux').setEmoji('🎰')),
      ],
    }),
  );
}

export async function handleSalleButton(interaction) {
  const [, action, game = 'salle'] = interaction.customId.split(':');
  if (game !== 'salle' && !gameInfo(game)) return interaction.reply(ephemeral({ content: 'Jeu inconnu.' }));
  if (interaction.message && game !== 'salle') tableMessages.set(`${game}:${interaction.channelId}`, interaction.message);

  if (action === 'ouvrir') {
    if (game !== 'salle') openOnArrival(interaction.user.id, game);
    try {
      // La salle s'ouvre dans Discord, pour ce joueur, dans ce salon.
      return await interaction.launchActivity();
    } catch (err) {
      console.warn('[casinho] Activité indisponible :', err.message);
      return linkReply(interaction, game, '🎰 La salle ne peut pas encore s’ouvrir dans Discord : voici ton lien pour jouer dans le navigateur.');
    }
  }
  if (action === 'lien') return linkReply(interaction, game, '🌐 Ta salle de jeux, dans le navigateur :');
  if (action === 'ici' && game !== 'roulette' && game !== 'salle') return openTable(interaction, game, { viaUpdate: true });
  return interaction.deferUpdate();
}

/** Le bouton du hall qui ouvre la salle entière. */
export const salleButton = () =>
  new ButtonBuilder().setCustomId('csl:ouvrir:salle').setLabel('Salle de jeux').setEmoji('🎰').setStyle(ButtonStyle.Primary);

// ------------------------------------------------------------ Fin des tours partagés
const signed = (n) => `${n > 0 ? '+' : ''}${chips(n)}`;

async function rouletteImage(summary, played) {
  const winners = played.filter((result) => result.net > 0).length;
  return tapisScene({
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
}

/** Le message du salon montre le dernier tour : ce qui est sorti, et qui a gagné quoi. */
async function showRound(summary) {
  const key = `${summary.game}:${summary.roomId}`;
  const message = tableMessages.get(key);
  if (!message) return;
  const info = gameInfo(summary.game);
  const played = summary.results.filter((result) => !result.dropped);
  let headline;
  let lines;
  let image = null;
  if (summary.game === 'roulette') {
    headline = `La bille est tombée sur ${pocketLabel(summary.pocket)}.`;
    lines = summary.results.map((result) =>
      result.dropped ? `➖ **${result.name}** — solde insuffisant au lancement, jetons rendus` : `${result.net > 0 ? '✅' : result.net < 0 ? '❌' : '➖'} **${result.name}** ${signed(result.net)} · mise ${chips(result.total)}`,
    );
    image = await rouletteImage(summary, played);
  } else if (summary.game === 'crash') {
    headline = `💥 La fusée a explosé à **×${summary.point.toFixed(2)}**.`;
    lines = summary.results.map((result) =>
      result.cashedAt ? `✅ **${result.name}** encaisse à ×${result.cashedAt.toFixed(2)} · ${signed(result.net)}` : `❌ **${result.name}** saute avec la fusée · ${signed(result.net)}`,
    );
  } else {
    headline = `Le croupier fait **${summary.dealer}**${summary.dealerBust ? ' : il saute !' : '.'}`;
    lines = summary.results.map((result) => `${result.net > 0 ? '✅' : result.net < 0 ? '❌' : '➖'} **${result.name}** ${signed(result.net)} · ${result.labels.join(', ')}`);
  }
  const winners = played.filter((result) => result.net > 0).length;
  const embed = new EmbedBuilder()
    .setColor(winners ? 0x49c78a : 0xd2536a)
    .setTitle(`${info.emoji} ${info.title} — tour ${summary.round}`)
    .setDescription([headline, '', ...lines].join('\n').slice(0, 4000))
    .setFooter({ text: 'La table continue : « Ouvrir la table » pour jouer le tour suivant' });
  const name = `${summary.game}-tour-${summary.round}.jpg`;
  if (image) embed.setImage(`attachment://${name}`);
  await message.edit({ content: '', embeds: [embed], components: buttons(summary.game), files: image ? [new AttachmentBuilder(image, { name })] : [], attachments: [] });
}

onRoundEnd((summary) =>
  showRound(summary).catch((err) => {
    console.warn('[casinho] salle (message du salon) :', err.message);
    // Message supprimé ou inaccessible : on arrête de le mettre à jour.
    tableMessages.delete(`${summary.game}:${summary.roomId}`);
  }),
);

export const SALLE_GAMES = CATALOG.map((game) => game.id);
