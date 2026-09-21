// Jeux à plusieurs manches : mines, crash, plus ou moins, duel.
// Chacun garde un état en mémoire le temps de la partie ; rien n'est écrit en base
// avant le règlement, et une partie oubliée se règle toute seule après son délai.
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { hiloScene } from './render/scenes.js';
import { highValue, shoe, show } from './cards.js';
import { chips, rand, refund, settle, stake } from './economy.js';
import { replayRow } from './table.js';

const COLOR = 0xff3fa6;
/** Démarrer depuis la table remplace le message ; depuis une commande, on en crée un. */
const open = (interaction, payload, viaUpdate) => (viaUpdate ? interaction.update(payload) : interaction.reply(payload));
const refuse = (interaction, bet) =>
  interaction.reply({ content: `Il te faut ${chips(bet)} pour cette mise. Vois \`/solde\`, \`/quotidien\` ou \`/secours\`.`, flags: MessageFlags.Ephemeral });
const EDGE = 0.97; // 3 % pour la maison, le même partout
const rounds = new Map();
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const isLiveButton = (interaction) =>
  interaction.isButton() && ['cmn:', 'ccr:', 'chl:', 'cdu:'].some((prefix) => interaction.customId.startsWith(prefix));

function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

function claim(interaction, prefix) {
  const [, action, id] = interaction.customId.split(':');
  const round = rounds.get(id);
  if (!round || round.done) {
    interaction.reply({ content: 'Cette partie est terminée.', flags: MessageFlags.Ephemeral }).catch(() => {});
    return null;
  }
  return { action, round };
}

function close(round) {
  round.done = true;
  clearTimeout(round.timer);
  clearInterval(round.ticker);
  rounds.delete(round.id);
}

// ------------------------------------------------------------------ Mines
// 20 cases, dont `bombs` piégées. Le multiplicateur après k cases sûres vaut
// C(20,k) / C(20-bombs,k) : l'inverse exact de la probabilité de survie.
const MINES_CELLS = 20;

export const minesMultiplier = (bombs, picks) =>
  picks === 0 ? 1 : (EDGE * combinations(MINES_CELLS, picks)) / combinations(MINES_CELLS - bombs, picks);

function minesComponents(round) {
  const rows = [];
  for (let row = 0; row < 4; row++) {
    const buttons = [];
    for (let col = 0; col < 5; col++) {
      const index = row * 5 + col;
      const opened = round.opened.has(index);
      const blown = round.done && round.bombs.has(index);
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`cmn:${index}:${round.id}`)
          .setEmoji(opened ? '💎' : blown ? '💣' : '⬜')
          .setStyle(opened ? ButtonStyle.Success : blown ? ButtonStyle.Danger : ButtonStyle.Secondary)
          .setDisabled(round.done || opened),
      );
    }
    rows.push(new ActionRowBuilder().addComponents(buttons));
  }
  const multiplier = minesMultiplier(round.bombCount, round.opened.size);
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cmn:cash:${round.id}`)
        .setLabel(round.opened.size ? `Encaisser ${Math.round(round.bet * multiplier)}` : 'Encaisser')
        .setEmoji('💰')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(round.done || round.opened.size === 0),
    ),
  );
  return rows;
}

function minesEmbed(round, { note = null } = {}) {
  const picks = round.opened.size;
  const multiplier = minesMultiplier(round.bombCount, picks);
  const safe = MINES_CELLS - round.bombCount;
  const next = picks < safe ? minesMultiplier(round.bombCount, picks + 1) : null;
  const survival = picks < safe ? ((safe - picks) / (MINES_CELLS - picks)) * 100 : 0;
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('💣 Mines')
    .setDescription(
      [
        note,
        `Mise ${chips(round.bet)} · **${round.bombCount}** bombe(s) sur ${MINES_CELLS} cases`,
        `Trouvées : **${picks}** · gain actuel **×${multiplier.toFixed(2)}** = ${chips(round.bet * multiplier)}`,
        next ? `Case suivante : **×${next.toFixed(2)}** · ${survival.toFixed(1)} % de chances de passer` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .setFooter({ text: 'Encaisse quand tu veux · partie réglée automatiquement après 3 min' });
}

export async function startMines(interaction, { bet, bombs }, { viaUpdate = false } = {}) {
  if (!Number.isInteger(bombs) || bombs < 1 || bombs > MINES_CELLS - 1) {
    return interaction.reply({ content: `Choisis entre 1 et ${MINES_CELLS - 1} bombes.`, flags: MessageFlags.Ephemeral });
  }
  const taken = await stake(interaction.user.id, bet);
  if (taken === null) return refuse(interaction, bet);

  const positions = new Set();
  while (positions.size < bombs) positions.add(rand(MINES_CELLS));

  const round = {
    id: newId(),
    kind: 'mines',
    userId: interaction.user.id,
    bet,
    bombCount: bombs,
    bombs: positions,
    opened: new Set(),
    done: false,
  };
  rounds.set(round.id, round);
  round.timer = setTimeout(() => cashMines(interaction, round, true).catch(() => {}), 180_000).unref();

  return open(interaction, { embeds: [minesEmbed(round)], components: minesComponents(round), files: [] }, viaUpdate);
}

async function cashMines(interaction, round, auto = false) {
  const multiplier = minesMultiplier(round.bombCount, round.opened.size);
  const payout = Math.round(round.bet * multiplier);
  close(round);
  const { balance, net } = await settle(round.userId, payout, round.bet);
  const embed = minesEmbed(round, { note: auto ? '⏳ Temps écoulé : encaissement automatique.' : '💰 Encaissé !' })
    .addFields({ name: 'Bilan', value: `${net > 0 ? '+' : ''}${chips(net)}`, inline: true }, { name: 'Solde', value: chips(balance), inline: true });
  const payload = { embeds: [embed], components: replayRow(round.userId, 'mines', round.bet) };
  if (auto || interaction.replied || interaction.deferred) await interaction.editReply(payload);
  else await interaction.update(payload);
}

async function handleMines(interaction) {
  const claimed = claim(interaction, 'cmn');
  if (!claimed) return;
  const { action, round } = claimed;
  if (interaction.user.id !== round.userId) {
    return interaction.reply({ content: 'Ce n’est pas ta partie — lance la tienne avec `/mines`.', flags: MessageFlags.Ephemeral });
  }
  if (action === 'cash') return cashMines(interaction, round);

  const index = Number(action);
  if (round.bombs.has(index)) {
    close(round);
    const { balance, net } = await settle(round.userId, 0, round.bet);
    const embed = minesEmbed(round, { note: '💥 Bombe ! La partie s’arrête ici.' }).addFields(
      { name: 'Bilan', value: `${chips(net)}`, inline: true },
      { name: 'Solde', value: chips(balance), inline: true },
    );
    return interaction.update({ embeds: [embed], components: replayRow(round.userId, 'mines', round.bet) });
  }

  round.opened.add(index);
  // Toutes les cases sûres trouvées : la partie s'arrête au gain maximum.
  if (round.opened.size === MINES_CELLS - round.bombCount) return cashMines(interaction, round);
  return interaction.update({ embeds: [minesEmbed(round)], components: minesComponents(round) });
}

// ------------------------------------------------------------------ Crash
// Le multiplicateur grimpe jusqu'à un point de rupture tiré au départ :
// 0,97 / (1 - u), la loi habituelle de ce jeu. Encaisser avant, c'est gagné.
const CRASH_SPEED = 6000;
const CRASH_CAP = 100;
const crashAt = (start) => Math.exp((Date.now() - start) / CRASH_SPEED);

export async function startCrash(interaction, bet, { viaUpdate = false } = {}) {
  const taken = await stake(interaction.user.id, bet);
  if (taken === null) return refuse(interaction, bet);

  const u = rand(1_000_000) / 1_000_000;
  const point = Math.min(CRASH_CAP, Math.max(1, Math.floor((EDGE / (1 - u)) * 100) / 100));
  const round = { id: newId(), kind: 'crash', userId: interaction.user.id, bet, point, start: Date.now(), done: false };
  rounds.set(round.id, round);

  const body = (multiplier) =>
    new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('🚀 Crash')
      .setDescription(`**×${multiplier.toFixed(2)}**\nMise ${chips(round.bet)} · gain actuel ${chips(round.bet * multiplier)}`)
      .setFooter({ text: `Encaisse avant l’explosion · plafond ×${CRASH_CAP}` });

  const cashButton = (disabled = false) => [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ccr:cash:${round.id}`).setLabel('Encaisser').setEmoji('💰').setStyle(ButtonStyle.Success).setDisabled(disabled),
    ),
  ];

  await open(interaction, { embeds: [body(1)], components: cashButton(), files: [] }, viaUpdate);
  round.render = body;

  // Une modification toutes les deux secondes : au-delà, Discord limite les éditions.
  round.ticker = setInterval(() => {
    if (round.done) return;
    const now = crashAt(round.start);
    if (now >= round.point) {
      explode(interaction, round).catch(() => {});
      return;
    }
    interaction.editReply({ embeds: [body(now)], components: cashButton() }).catch(() => {});
  }, 2000).unref();
  round.timer = setTimeout(() => explode(interaction, round).catch(() => {}), 120_000).unref();
}

async function explode(interaction, round) {
  close(round);
  const { balance, net } = await settle(round.userId, 0, round.bet);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xd2536a)
        .setTitle('🚀 Crash')
        .setDescription(`💥 **Explosion à ×${round.point.toFixed(2)}**\nMise perdue : ${chips(round.bet)}`)
        .addFields({ name: 'Bilan', value: chips(net), inline: true }, { name: 'Solde', value: chips(balance), inline: true }),
    ],
    components: replayRow(round.userId, 'crash', round.bet),
  });
}

async function handleCrash(interaction) {
  const claimed = claim(interaction, 'ccr');
  if (!claimed) return;
  const { round } = claimed;
  if (interaction.user.id !== round.userId) {
    return interaction.reply({ content: 'Ce n’est pas ta partie — lance la tienne avec `/crash`.', flags: MessageFlags.Ephemeral });
  }
  // Le multiplicateur est recalculé à l'instant du clic, pas repris du dernier affichage.
  const now = crashAt(round.start);
  if (now >= round.point) return explode(interaction, round);

  close(round);
  const payout = Math.round(round.bet * now);
  const { balance, net } = await settle(round.userId, payout, round.bet);
  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x49c78a)
        .setTitle('🚀 Crash')
        .setDescription(`💰 Encaissé à **×${now.toFixed(2)}** — l’explosion était prévue à ×${round.point.toFixed(2)}.`)
        .addFields({ name: 'Bilan', value: `+${chips(net)}`, inline: true }, { name: 'Solde', value: chips(balance), inline: true }),
    ],
    components: replayRow(round.userId, 'crash', round.bet),
  });
}

// ----------------------------------------------------------- Plus ou moins
// À chaque carte, le multiplicateur vaut 0,97 × 51 / (cartes qui font gagner).
// L'égalité est perdante, et c'est annoncé.
function hiloOdds(card) {
  const value = highValue(card);
  return {
    higher: (14 - value) * 4,
    lower: (value - 2) * 4,
  };
}

function hiloComponents(round) {
  const { higher, lower } = hiloOdds(round.card);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`chl:higher:${round.id}`)
        .setLabel(higher ? `Plus haut ×${(EDGE * 51 / higher).toFixed(2)}` : 'Plus haut — impossible')
        .setEmoji('⬆️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(round.done || higher === 0),
      new ButtonBuilder()
        .setCustomId(`chl:lower:${round.id}`)
        .setLabel(lower ? `Plus bas ×${(EDGE * 51 / lower).toFixed(2)}` : 'Plus bas — impossible')
        .setEmoji('⬇️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(round.done || lower === 0),
      new ButtonBuilder()
        .setCustomId(`chl:cash:${round.id}`)
        .setLabel(`Encaisser ${Math.round(round.bet * round.multiplier)}`)
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success)
        .setDisabled(round.done || round.multiplier <= 1),
    ),
  ];
}

function hiloEmbed(round, { note = null } = {}) {
  const { higher, lower } = hiloOdds(round.card);
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🔼 Plus ou moins')
    .setDescription(
      [
        note,
        `Carte en jeu : ${show(round.card)}`,
        `Mise ${chips(round.bet)} · gain actuel **×${round.multiplier.toFixed(2)}** = ${chips(round.bet * round.multiplier)}`,
        `Plus haut : ${higher}/51 · plus bas : ${lower}/51 · égalité (3/51) = perdu`,
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .setFooter({ text: 'Encaisse quand tu veux · partie réglée automatiquement après 3 min' });
}

/** L'embed accompagné de l'image : la carte précédente, la nouvelle, la série. */
async function hiloView(round, embed, { previous = null, result = null, components = [] } = {}) {
  round.renders = (round.renders ?? 0) + 1;
  const name = `plusoumoins-${round.id}-${round.renders}.jpg`;
  const image = await hiloScene({ previous, current: round.shown ?? round.card, streak: round.streak, multiplier: round.multiplier, bet: round.bet, result })
    .catch((err) => {
      console.warn('[casinho] rendu plus ou moins :', err.message);
      return null;
    });
  if (image) embed.setImage(`attachment://${name}`);
  return { embeds: [embed], files: image ? [new AttachmentBuilder(image, { name })] : [], attachments: [], components };
}

export async function startHiLo(interaction, bet, { viaUpdate = false } = {}) {
  const taken = await stake(interaction.user.id, bet);
  if (taken === null) return refuse(interaction, bet);

  const deck = shoe(1);
  const round = { id: newId(), kind: 'hilo', userId: interaction.user.id, bet, deck, card: deck.pop(), multiplier: 1, streak: 0, done: false };
  rounds.set(round.id, round);
  round.timer = setTimeout(() => cashHiLo(interaction, round, true).catch(() => {}), 180_000).unref();
  return open(interaction, await hiloView(round, hiloEmbed(round, { note: 'Le croupier retourne la première carte.' }), { components: hiloComponents(round) }), viaUpdate);
}

async function cashHiLo(interaction, round, auto = false) {
  const payout = Math.round(round.bet * round.multiplier);
  close(round);
  const { balance, net } = await settle(round.userId, payout, round.bet);
  const embed = hiloEmbed(round, { note: auto ? '⏳ Temps écoulé : encaissement automatique.' : `💰 Encaissé après ${round.streak} bonne(s) réponse(s) !` })
    .addFields({ name: 'Bilan', value: `${net > 0 ? '+' : ''}${chips(net)}`, inline: true }, { name: 'Solde', value: chips(balance), inline: true });
  const sign = net > 0 ? '+' : '';
  const payload = await hiloView(round, embed, {
    result: { tone: net > 0 ? 'win' : 'push', title: 'ENCAISSÉ', sub: `${sign}${Math.round(net).toLocaleString('fr-FR')} jetons · série de ${round.streak}` },
    components: replayRow(round.userId, 'plusoumoins', round.bet),
  });
  if (auto || interaction.replied || interaction.deferred) await interaction.editReply(payload);
  else await interaction.update(payload);
}

async function handleHiLo(interaction) {
  const claimed = claim(interaction, 'chl');
  if (!claimed) return;
  const { action, round } = claimed;
  if (interaction.user.id !== round.userId) {
    return interaction.reply({ content: 'Ce n’est pas ta partie — lance la tienne avec `/plusoumoins`.', flags: MessageFlags.Ephemeral });
  }
  if (action === 'cash') return cashHiLo(interaction, round);

  const { higher, lower } = hiloOdds(round.card);
  const winners = action === 'higher' ? higher : lower;
  if (winners === 0) return interaction.deferUpdate();

  if (!round.deck.length) round.deck = shoe(1);
  const next = round.deck.pop();
  const before = highValue(round.card);
  const after = highValue(next);
  const won = action === 'higher' ? after > before : after < before;

  if (!won) {
    const lost = round.card;
    close(round);
    const { balance, net } = await settle(round.userId, 0, round.bet);
    const embed = new EmbedBuilder()
      .setColor(0xd2536a)
      .setTitle('🔼 Plus ou moins')
      .setDescription(
        `${show(lost)} → ${show(next)}\n${after === before ? 'Égalité : perdu.' : 'Mauvaise réponse.'}\nSérie : ${round.streak} · mise perdue ${chips(round.bet)}`,
      )
      .addFields({ name: 'Bilan', value: chips(net), inline: true }, { name: 'Solde', value: chips(balance), inline: true });
    round.shown = next;
    return interaction.update(await hiloView(round, embed, {
      previous: lost,
      result: { tone: 'lose', title: after === before ? 'ÉGALITÉ : PERDU' : 'PERDU', sub: `série de ${round.streak} · -${Math.round(round.bet).toLocaleString('fr-FR')} jetons` },
      components: replayRow(round.userId, 'plusoumoins', round.bet),
    }));
  }

  const previous = round.card;
  round.multiplier *= (EDGE * 51) / winners;
  round.streak += 1;
  round.card = next;
  return interaction.update(await hiloView(round, hiloEmbed(round, { note: `✅ ${show(next)} — bien vu !` }), { previous, components: hiloComponents(round) }));
}

// ------------------------------------------------------------------- Duel
// Joueur contre joueur : pas d'avantage de la maison, le gagnant prend les deux mises.
export async function startDuel(interaction, { opponent, bet }) {
  // Le duel se lance toujours par la commande : il lui faut un adversaire.
  if (opponent.bot || opponent.id === interaction.user.id) {
    return interaction.reply({ content: 'Choisis un autre joueur (pas un bot, pas toi).', flags: MessageFlags.Ephemeral });
  }
  const taken = await stake(interaction.user.id, bet);
  if (taken === null) return refuse(interaction, bet);

  const round = {
    id: newId(),
    kind: 'duel',
    userId: interaction.user.id,
    opponentId: opponent.id,
    bet,
    done: false,
  };
  rounds.set(round.id, round);

  round.timer = setTimeout(async () => {
    if (round.done) return;
    close(round);
    await refund(round.userId, round.bet);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x8a8fa3).setTitle('⚔️ Duel').setDescription('Personne n’a répondu : mise rendue.')],
      components: [],
    }).catch(() => {});
  }, 120_000).unref();

  return interaction.reply({
    content: `<@${opponent.id}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle('⚔️ Duel')
        .setDescription(`<@${interaction.user.id}> défie <@${opponent.id}> pour ${chips(bet)}.\nPile ou face : le gagnant prend les deux mises.`)
        .setFooter({ text: 'Aucun avantage de la maison · 2 min pour répondre' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cdu:accept:${round.id}`).setLabel('Accepter').setEmoji('⚔️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cdu:refuse:${round.id}`).setLabel('Refuser').setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

async function handleDuel(interaction) {
  const claimed = claim(interaction, 'cdu');
  if (!claimed) return;
  const { action, round } = claimed;
  if (interaction.user.id !== round.opponentId) {
    return interaction.reply({ content: 'Ce duel ne t’est pas adressé.', flags: MessageFlags.Ephemeral });
  }

  if (action === 'refuse') {
    close(round);
    await refund(round.userId, round.bet);
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x8a8fa3).setTitle('⚔️ Duel').setDescription(`<@${round.opponentId}> a refusé. Mise rendue.`)],
      components: [],
    });
  }

  const taken = await stake(round.opponentId, round.bet);
  if (taken === null) {
    return interaction.reply({ content: `Il te faut ${chips(round.bet)} pour relever ce duel.`, flags: MessageFlags.Ephemeral });
  }

  close(round);
  const challengerWins = rand(2) === 0;
  const winner = challengerWins ? round.userId : round.opponentId;
  const loser = challengerWins ? round.opponentId : round.userId;
  const { balance } = await settle(winner, round.bet * 2, round.bet);
  await settle(loser, 0, round.bet);

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0x49c78a)
        .setTitle('⚔️ Duel')
        .setDescription(`La pièce tranche : **<@${winner}> gagne ${chips(round.bet * 2)}** !\n<@${loser}> perd sa mise de ${chips(round.bet)}.`)
        .setFooter({ text: `Solde du gagnant : ${Math.round(balance).toLocaleString('fr-FR')}` }),
    ],
    components: [],
  });
}

export async function handleLiveButton(interaction) {
  if (interaction.customId.startsWith('cmn:')) return handleMines(interaction);
  if (interaction.customId.startsWith('ccr:')) return handleCrash(interaction);
  if (interaction.customId.startsWith('chl:')) return handleHiLo(interaction);
  if (interaction.customId.startsWith('cdu:')) return handleDuel(interaction);
}

export const MINES_TOTAL = MINES_CELLS;
export const liveRounds = () => rounds.size;
