// Blackjack : sabot de 6 paquets, croupier qui reste sur 17, blackjack payé 3:2.
// Doubler et séparer sont disponibles ; l'assurance ne l'est pas (elle est toujours
// défavorable au joueur, autant ne pas la proposer).
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { blackjackScene } from './render/scenes.js';
import { canSplit, draw, handValue, HIDDEN, isBlackjack, shoe, showHand } from './cards.js';
import { chips, settle, stake } from './economy.js';
import { replayRow } from './table.js';
import { config } from '../config.js';

const COLOR = 0xff3fa6;
const TIMEOUT_MS = 120_000;
const tables = new Map();
const key = (channelId, userId) => `${channelId}:${userId}`;

export const isBlackjackButton = (interaction) => interaction.isButton() && interaction.customId.startsWith('cbj:');

function hand(cards, bet, { blackjack = false } = {}) {
  return { cards, bet, done: false, doubled: false, blackjack, surrendered: false };
}

function buttons(table) {
  const current = table.hands[table.active];
  // Doubler et séparer ne sont offerts que sur une main de deux cartes ;
  // le solde nécessaire, lui, est vérifié au moment du clic.
  const first = current.cards.length === 2 && !current.doubled;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cbj:hit:${table.id}`).setLabel('Tirer').setEmoji('🃏').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cbj:stand:${table.id}`).setLabel('Rester').setEmoji('✋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`cbj:double:${table.id}`)
        .setLabel('Doubler')
        .setEmoji('💰')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!first),
      new ButtonBuilder()
        .setCustomId(`cbj:split:${table.id}`)
        .setLabel('Séparer')
        .setEmoji('✂️')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!first || table.hands.length > 1 || !canSplit(current.cards)),
    ),
  ];
}

function handLine(entry, { active = false, index = 0, many = false } = {}) {
  const { total, soft, bust } = handValue(entry.cards);
  const title = many ? `Main ${index + 1}` : 'Votre main';
  const marks = [
    entry.blackjack ? '**BLACKJACK**' : null,
    bust ? '**sauté**' : null,
    entry.doubled ? 'doublée' : null,
    active && many ? '← en cours' : null,
  ].filter(Boolean);
  const score = bust ? `${total}` : soft ? `${total} (souple)` : `${total}`;
  return `**${title}** · mise ${chips(entry.bet)}\n${showHand(entry.cards)} — ${score}${marks.length ? ` · ${marks.join(' · ')}` : ''}`;
}

/**
 * La table telle qu'elle est : l'image rendue, et le détail en texte.
 * `note` raconte ce que fait le croupier ; `outcome` affiche le verdict sur l'image.
 */
async function view(table, { reveal = false, note = null, result = null, outcome = null, components = [] } = {}) {
  const dealerLine = reveal
    ? `${showHand(table.dealer)} — ${handValue(table.dealer).total}${handValue(table.dealer).bust ? ' · **sauté**' : ''}`
    : `${showHand([table.dealer[0]])} ${HIDDEN} — ${handValue([table.dealer[0]]).total} + ?`;

  const many = table.hands.length > 1;
  const body = table.hands
    .map((entry, index) => handLine(entry, { active: index === table.active && !table.finished, index, many }))
    .join('\n\n');

  table.renders = (table.renders ?? 0) + 1;
  const name = `blackjack-${table.id}-${table.renders}.jpg`;
  const image = await blackjackScene(table, { reveal, result: outcome });

  const built = new EmbedBuilder()
    .setColor(outcome ? (outcome.tone === 'win' ? 0x49c78a : outcome.tone === 'lose' ? 0xd2536a : COLOR) : COLOR)
    .setTitle('♠️ Blackjack')
    .setDescription([note ? `*${note}*` : null, `**Croupier** · ${dealerLine}`, body].filter(Boolean).join('\n\n'))
    .setImage(`attachment://${name}`)
    .setFooter({ text: table.finished ? 'Partie terminée' : 'Le croupier reste sur 17 · blackjack payé 3:2' });
  if (result) built.addFields({ name: 'Résultat', value: result });

  // attachments: [] remplace l'image précédente au lieu de l'empiler.
  return { embeds: [built], files: [new AttachmentBuilder(image, { name })], attachments: [], components };
}

/** Répond au bouton la première fois, puis modifie le même message. */
async function send(interaction, payload) {
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function outcomeOf(entry, dealer) {
  if (handValue(entry.cards).bust) return { payout: 0, label: 'perdue (main sautée)' };
  if (entry.blackjack && !entry.fromSplit) {
    if (isBlackjack(dealer)) return { payout: entry.bet, label: 'égalité (deux blackjacks)' };
    return { payout: Math.round(entry.bet * 2.5), label: 'BLACKJACK, payé 3:2' };
  }
  const player = handValue(entry.cards).total;
  const house = handValue(dealer);
  if (house.bust) return { payout: entry.bet * 2, label: 'gagnée (croupier sauté)' };
  if (isBlackjack(dealer)) return { payout: 0, label: 'perdue (blackjack du croupier)' };
  if (player > house.total) return { payout: entry.bet * 2, label: `gagnée (${player} contre ${house.total})` };
  if (player === house.total) return { payout: entry.bet, label: `égalité (${player}), mise rendue` };
  return { payout: 0, label: `perdue (${player} contre ${house.total})` };
}

async function finish(interaction, table) {
  clearTimeout(table.timer);
  table.finished = true;
  // La table est rangée sous deux clés : celle du joueur et celle des boutons.
  tables.delete(key(table.channelId, table.userId));
  tables.delete(table.id);

  const allBust = table.hands.every((entry) => handValue(entry.cards).bust);
  const naturals = table.dealer.length === 2 && (isBlackjack(table.dealer) || table.hands.every((entry) => entry.blackjack && !entry.fromSplit));
  if (!allBust && !naturals) {
    // Le croupier retourne sa carte cachée…
    await send(interaction, await view(table, { reveal: true, note: 'Le croupier retourne sa carte…' }));
    // …puis tire tant qu'il est sous 17, une carte à la fois.
    while (handValue(table.dealer).total < 17) {
      await pause(1_100);
      const drawn = draw(table.deck);
      table.dealer.push(drawn);
      const now = handValue(table.dealer);
      await send(interaction, await view(table, {
        reveal: true,
        note: `Le croupier tire ${showHand([drawn])} — ${now.bust ? `${now.total}, il saute !` : now.total}`,
      }));
    }
    await pause(900);
  }
  // Blackjack d'entrée (d'un côté ou de l'autre) : le croupier ne tire pas.

  const lines = [];
  let total = 0;
  let wagered = 0;
  for (const [index, entry] of table.hands.entries()) {
    const { payout, label } = outcomeOf(entry, table.dealer);
    total += payout;
    wagered += entry.bet;
    lines.push(`${table.hands.length > 1 ? `Main ${index + 1} : ` : ''}${label} → ${chips(payout)}`);
  }

  const { balance, net } = await settle(table.userId, total, wagered);
  const sign = net > 0 ? '+' : '';
  lines.push(`\n**Bilan : ${sign}${chips(net)}** · solde : ${chips(balance)}`);

  // Le verdict affiché sur la table.
  const natural = table.hands.some((entry) => entry.blackjack && !entry.fromSplit) && net > 0;
  const outcome = {
    tone: net > 0 ? 'win' : net < 0 ? 'lose' : 'push',
    title: natural ? 'BLACKJACK !' : net > 0 ? 'GAGNÉ' : net < 0 ? (allBust ? 'SAUTÉ' : 'PERDU') : 'ÉGALITÉ',
    sub: `${sign}${Math.round(net).toLocaleString('fr-FR')} jetons · solde ${Math.round(balance).toLocaleString('fr-FR')}`,
  };
  await send(interaction, await view(table, {
    reveal: true,
    result: lines.join('\n'),
    outcome,
    components: replayRow(table.userId, 'blackjack', table.baseBet),
  }));
}

async function advance(interaction, table) {
  // Passe à la main suivante, ou conclut si tout est joué.
  while (table.active < table.hands.length && table.hands[table.active].done) table.active += 1;
  if (table.active >= table.hands.length) return finish(interaction, table);
  await send(interaction, await view(table, { components: buttons(table) }));
}

const open = (interaction, payload, viaUpdate) => (viaUpdate ? interaction.update(payload) : interaction.reply(payload));

export async function startBlackjack(interaction, bet, { viaUpdate = false } = {}) {
  const id = key(interaction.channelId, interaction.user.id);
  if (tables.has(id)) {
    return interaction.reply({ content: '♠️ Tu as déjà une partie en cours ici. Termine-la avant d’en lancer une autre.', flags: MessageFlags.Ephemeral });
  }

  const taken = await stake(interaction.user.id, bet);
  if (taken === null) {
    return interaction.reply({ content: `Mise impossible : il te faut ${chips(bet)}. Regarde \`/solde\`, \`/quotidien\` ou \`/secours\`.`, flags: MessageFlags.Ephemeral });
  }

  const deck = shoe(6);
  const player = [draw(deck), draw(deck)];
  const dealer = [draw(deck), draw(deck)];
  const table = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    userId: interaction.user.id,
    channelId: interaction.channelId,
    deck,
    dealer,
    baseBet: bet,
    hands: [hand(player, bet, { blackjack: isBlackjack(player) })],
    active: 0,
    finished: false,
  };
  tables.set(id, table);
  // Le raccourci par identifiant de table sert aux boutons.
  tables.set(table.id, table);

  // Blackjack immédiat (ou blackjack du croupier) : la main se règle sans interaction.
  if (isBlackjack(player) || isBlackjack(dealer)) {
    await open(interaction, await view(table, { note: 'Distribution…' }), viaUpdate);
    await pause(1_000);
    table.hands[0].done = true;
    return finish(interaction, table);
  }

  table.timer = setTimeout(() => {
    const live = tables.get(id);
    if (!live || live.finished) return;
    live.hands.forEach((entry) => { entry.done = true; });
    finish(interaction, live).catch(() => {});
  }, TIMEOUT_MS).unref();

  return open(interaction, await view(table, { note: 'Le croupier distribue. À toi de jouer.', components: buttons(table) }), viaUpdate);
}

export async function handleBlackjackButton(interaction) {
  const [, action, tableId] = interaction.customId.split(':');
  const table = tables.get(tableId);
  if (!table || table.finished) {
    return interaction.reply({ content: 'Cette partie est terminée. Relance `/blackjack`.', flags: MessageFlags.Ephemeral });
  }
  if (interaction.user.id !== table.userId) {
    return interaction.reply({ content: 'C’est la partie de quelqu’un d’autre — lance la tienne avec `/blackjack`.', flags: MessageFlags.Ephemeral });
  }

  clearTimeout(table.timer);
  table.timer = setTimeout(() => {
    if (table.finished) return;
    table.hands.forEach((entry) => { entry.done = true; });
    finish(interaction, table).catch(() => {});
  }, TIMEOUT_MS).unref();

  const entry = table.hands[table.active];

  if (action === 'hit') {
    entry.cards.push(draw(table.deck));
    if (handValue(entry.cards).bust || handValue(entry.cards).total === 21) entry.done = true;
    return advance(interaction, table);
  }

  if (action === 'stand') {
    entry.done = true;
    return advance(interaction, table);
  }

  if (action === 'double') {
    const extra = await stake(table.userId, entry.bet);
    if (extra === null) {
      return interaction.reply({ content: `Doubler demande ${chips(entry.bet)} de plus, ton solde ne suffit pas.`, flags: MessageFlags.Ephemeral });
    }
    entry.bet += extra;
    entry.doubled = true;
    entry.cards.push(draw(table.deck));
    entry.done = true;
    return advance(interaction, table);
  }

  if (action === 'split') {
    if (!canSplit(entry.cards) || table.hands.length > 1) {
      return interaction.reply({ content: 'Cette main ne peut pas être séparée.', flags: MessageFlags.Ephemeral });
    }
    const extra = await stake(table.userId, entry.bet);
    if (extra === null) {
      return interaction.reply({ content: `Séparer demande ${chips(entry.bet)} de plus, ton solde ne suffit pas.`, flags: MessageFlags.Ephemeral });
    }
    const moved = entry.cards.pop();
    const second = hand([moved, draw(table.deck)], extra);
    entry.cards.push(draw(table.deck));
    entry.fromSplit = true;
    second.fromSplit = true;
    table.hands.push(second);

    // Deux as séparés reçoivent une seule carte chacun : les deux mains sont closes.
    if (moved.rank === 'A') {
      entry.done = true;
      second.done = true;
    }
    return advance(interaction, table);
  }

  return interaction.deferUpdate();
}

/** Nombre de tables ouvertes (affiché dans /casino-stats). */
export const openTables = () => new Set([...tables.values()]).size;

export const blackjackRules = [
  `Sabot de 6 paquets mélangés, remélangé à chaque partie.`,
  `Le croupier tire jusqu’à 17 et reste sur 17 (y compris 17 souple).`,
  `Blackjack payé **3:2**, gain normal 1:1, égalité = mise rendue.`,
  `**Doubler** : seulement sur les deux premières cartes, une seule carte ensuite.`,
  `**Séparer** : deux cartes de même valeur, une seule fois ; deux as reçoivent une carte chacun.`,
  `Pas d’assurance : elle est toujours perdante à long terme.`,
  `Avantage de la maison ≈ 0,5 % avec une stratégie correcte.`,
  `Mise entre ${chips(1)} et ${chips(config.casinho.maxBet)} · partie abandonnée après 2 min d’inactivité.`,
].join('\n• ');
