// Tables à plusieurs : roulette, crash et blackjack.
// Le hall /casino est un message public : la table s'y ouvre devant tout le salon.
// Chacun choisit sa mise avec les boutons (et son pari dans le menu), puis un seul
// tirage vaut pour tout le monde, et chacun est payé selon son propre pari.
//
// Les mises ne sont prélevées qu'au départ : changer d'avis pendant les 30 secondes
// de mise ne coûte rien. Un joueur qui n'a plus de quoi payer au départ est écarté.
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import path from 'node:path';
import { config } from '../config.js';
import { draw, handValue, isBlackjack, shoe, showHand } from './cards.js';
import { balance, chips, rand, settle, stake } from './economy.js';
import { ROULETTE_BETS, pocketLabel } from './games.js';
import { animationFor } from './render/animations.js';
import { blackjackMultiScene, crashScene, rouletteScene } from './render/scenes.js';

const COLOR = 0xff3fa6;
const PRESETS = [100, 1_000, 10_000, 100_000, 1_000_000];
const short = (n) => (n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 1_000 ? `${n / 1_000}k` : String(n));
const BETTING_MS = 30_000; // temps laissé pour miser
const TURN_MS = 30_000; // temps de réflexion au blackjack, par joueur
const EDGE = 0.97;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const nameOf = (interaction) => interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;

const tables = new Map();

export const isMultiComponent = (interaction) =>
  (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) && interaction.customId.startsWith('cmp:');

// ------------------------------------------------------------------ Les jeux
const CRASH_AUTOS = [1.5, 2, 3, 5, 10];

export const MULTI_GAMES = {
  roulette: {
    title: '🎡 Roulette à plusieurs',
    art: 'roulette.gif',
    max: 10,
    blurb: 'Une seule bille pour toute la table. Chacun choisit son pari et sa mise.',
    option: {
      placeholder: 'Ton pari (rouge par défaut)',
      value: 'rouge',
      choices: () => Object.entries(ROULETTE_BETS).map(([value, rule]) => ({ value, label: `${rule.label} — ×${rule.pays}` })),
      label: (option) => (option.value === 'plein' ? `n° ${option.number ?? '?'}` : ROULETTE_BETS[option.value].label),
    },
  },
  crash: {
    title: '🚀 Crash à plusieurs',
    art: 'crash.gif',
    max: 10,
    blurb: 'Une seule fusée pour toute la table. Chacun encaisse quand il veut — le premier qui a peur rate la suite.',
    option: {
      placeholder: 'Ton encaissement (manuel par défaut)',
      value: 'manuel',
      choices: () => [
        { value: 'manuel', label: 'Encaissement manuel' },
        ...CRASH_AUTOS.map((target) => ({ value: String(target), label: `Auto à ×${target} (${Math.round((EDGE / target) * 100)} %)` })),
      ],
      label: (option) => (option.value === 'manuel' ? 'manuel' : `auto ×${option.value}`),
    },
  },
  blackjack: {
    title: '♠️ Blackjack à plusieurs',
    art: 'cartes.gif',
    max: 5,
    blurb: 'Jusqu’à cinq joueurs contre le même croupier. Chacun joue sa main à son tour.',
  },
};

/** L'animation générique du jeu, par URL (bot en ligne) ou en pièce jointe. */
function art(file) {
  if (config.publicUrl) return { url: `${config.publicUrl}/casino/${file}`, files: [] };
  return { url: `attachment://${file}`, files: [new AttachmentBuilder(path.resolve('assets/casinho', file), { name: file })] };
}

/** Toutes les modifications passent par l'interaction d'origine, dans l'ordre. */
function push(table, payload) {
  table.queue = (table.queue ?? Promise.resolve()).then(() => table.origin.editReply(payload)).catch((err) => {
    console.warn('[casinho] table à plusieurs :', err.message);
  });
  return table.queue;
}

function image(buffer, name) {
  return buffer ? { files: [new AttachmentBuilder(buffer, { name })], url: `attachment://${name}` } : { files: [], url: null };
}

// ------------------------------------------------------------- Les mises
const seatLine = (table, seat) => {
  const spec = MULTI_GAMES[table.game];
  const option = spec.option ? ` · ${spec.option.label(seat.option)}` : '';
  return `• **${seat.name}** — ${chips(seat.bet)}${option}`;
};

function bettingView(table) {
  const spec = MULTI_GAMES[table.game];
  const artwork = art(spec.art);
  const seats = [...table.seats.values()];
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(spec.title)
    .setDescription(
      [
        spec.blurb,
        '',
        `**Pour jouer** : clique sur une mise${spec.option ? ', puis choisis ton pari dans le menu' : ''}. Tu peux changer d’avis jusqu’au départ.`,
        `Départ <t:${Math.ceil(table.endsAt / 1000)}:R>, ou quand <@${table.hostId}> appuie sur **Lancer**.`,
      ].join('\n'),
    )
    .addFields({
      name: `Joueurs (${seats.length}/${spec.max})`,
      value: seats.length ? seats.map((seat) => seatLine(table, seat)).join('\n') : '*Personne encore — sois le premier !*',
    })
    .setImage(artwork.url)
    .setFooter({ text: 'Les mises sont prélevées au départ · jetons fictifs' });

  const rows = [];
  if (spec.option) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`cmp:opt:${table.id}`).setPlaceholder(spec.option.placeholder).addOptions(spec.option.choices()),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      PRESETS.map((amount) => new ButtonBuilder().setCustomId(`cmp:bet${amount}:${table.id}`).setLabel(short(amount)).setStyle(ButtonStyle.Primary)),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cmp:go:${table.id}`).setLabel('Lancer').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cmp:leave:${table.id}`).setLabel('Me retirer').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cmp:cancel:${table.id}`).setLabel('Annuler').setStyle(ButtonStyle.Danger),
    ),
  );
  return { embeds: [embed], components: rows, files: artwork.files, attachments: [] };
}

/** Ouvre une table à plusieurs à la place du hall (ou d'une partie terminée). */
export async function openMultiTable(interaction, game) {
  if (!MULTI_GAMES[game]) return interaction.reply({ content: 'Jeu inconnu.', flags: MessageFlags.Ephemeral });
  const table = {
    id: newId(),
    game,
    hostId: interaction.user.id,
    phase: 'mises',
    seats: new Map(),
    endsAt: Date.now() + BETTING_MS,
    origin: interaction,
  };
  tables.set(table.id, table);
  table.countdown = setTimeout(() => launch(table).catch((err) => console.warn('[casinho] départ :', err.message)), BETTING_MS).unref();
  return interaction.update(bettingView(table));
}

function seatFor(table, interaction) {
  const spec = MULTI_GAMES[table.game];
  let seat = table.seats.get(interaction.user.id);
  if (!seat) {
    seat = { userId: interaction.user.id, name: nameOf(interaction), bet: 1_000, option: spec.option ? { value: spec.option.value } : {} };
    table.seats.set(seat.userId, seat);
  }
  return seat;
}

async function onBetting(interaction, table, action) {
  const spec = MULTI_GAMES[table.game];
  const joined = table.seats.has(interaction.user.id);
  if (!joined && table.seats.size >= spec.max && (action.startsWith('bet') || action === 'opt')) {
    return interaction.reply({ content: `La table est complète (${spec.max} joueurs).`, flags: MessageFlags.Ephemeral });
  }

  if (action.startsWith('bet')) {
    const amount = Number(action.slice(3));
    const available = await balance(interaction.user.id);
    if (amount > available) {
      return interaction.reply({ content: `Tu as ${chips(available)} : pas assez pour miser ${chips(amount)}. \`/quotidien\` en donne un million par jour.`, flags: MessageFlags.Ephemeral });
    }
    seatFor(table, interaction).bet = amount;
    return interaction.update(bettingView(table));
  }

  if (action === 'opt') {
    const seat = seatFor(table, interaction);
    const value = interaction.values[0];
    seat.option = { value };
    if (table.game === 'roulette' && value === 'plein') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`cmp:plein:${table.id}`)
          .setTitle('Numéro plein')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('numero').setLabel('Ton numéro (0 à 36)').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(2).setRequired(true),
            ),
          ),
      );
    }
    return interaction.update(bettingView(table));
  }

  if (action === 'plein') {
    const number = Number(interaction.fields.getTextInputValue('numero'));
    if (!Number.isInteger(number) || number < 0 || number > 36) {
      return interaction.reply({ content: 'Il faut un nombre entier entre 0 et 36.', flags: MessageFlags.Ephemeral });
    }
    seatFor(table, interaction).option = { value: 'plein', number };
    return interaction.update(bettingView(table));
  }

  if (action === 'leave') {
    table.seats.delete(interaction.user.id);
    return interaction.update(bettingView(table));
  }

  const isHost = interaction.user.id === table.hostId || interaction.user.id === config.ownerId;
  if (action === 'cancel') {
    if (!isHost) return interaction.reply({ content: `Seul <@${table.hostId}> peut annuler.`, flags: MessageFlags.Ephemeral });
    clearTimeout(table.countdown);
    tables.delete(table.id);
    return interaction.update({ content: 'Table fermée. À bientôt 🎰', embeds: [], components: [], files: [], attachments: [] });
  }
  if (action === 'go') {
    if (!isHost) return interaction.reply({ content: `Seul <@${table.hostId}> peut lancer (sinon, départ automatique à la fin du compte à rebours).`, flags: MessageFlags.Ephemeral });
    if (!table.seats.size) return interaction.reply({ content: 'Personne n’a encore misé.', flags: MessageFlags.Ephemeral });
    await interaction.deferUpdate();
    return launch(table);
  }
  return interaction.deferUpdate();
}

// ------------------------------------------------------------------ Le départ
async function launch(table) {
  if (table.phase !== 'mises') return;
  clearTimeout(table.countdown);
  table.phase = 'jeu';

  // Chaque mise est prélevée maintenant ; qui n'a plus de quoi payer est écarté.
  const dropped = [];
  for (const seat of [...table.seats.values()]) {
    if (table.game === 'roulette' && seat.option.value === 'plein' && !Number.isInteger(seat.option.number)) seat.option = { value: 'rouge' };
    if ((await stake(seat.userId, seat.bet)) === null) {
      table.seats.delete(seat.userId);
      dropped.push(seat.name);
    }
  }
  table.dropped = dropped;

  if (!table.seats.size) {
    tables.delete(table.id);
    return push(table, {
      content: dropped.length ? `Table fermée : ${dropped.join(', ')} n’avai(en)t plus assez de jetons.` : 'Personne n’a misé : table fermée.',
      embeds: [],
      components: [],
      files: [],
      attachments: [],
    });
  }

  if (table.game === 'roulette') return playRoulette(table);
  if (table.game === 'crash') return playCrash(table);
  return playBlackjack(table);
}

const againRow = (game) => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cmp:again:${game}`).setLabel('Nouvelle table').setEmoji('🔁').setStyle(ButtonStyle.Success),
  ),
];

const resultLine = (seat, detail = '') =>
  `${seat.net > 0 ? '✅' : seat.net < 0 ? '❌' : '➖'} **${seat.name}** ${seat.net > 0 ? '+' : ''}${chips(seat.net)}${detail ? ` · ${detail}` : ''}`;

// ------------------------------------------------------------------ Roulette
async function playRoulette(table) {
  const pocket = rand(37);
  const seats = [...table.seats.values()];
  const animation = animationFor({ kind: 'roulette', pocket });
  await push(table, {
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(MULTI_GAMES.roulette.title)
        .setDescription(`Faites vos jeux… **Rien ne va plus !**\n${seats.length} joueur${seats.length > 1 ? 's' : ''} à la table.`)
        .setImage(animation.url),
    ],
    components: [],
    files: animation.files,
    attachments: [],
  });

  for (const seat of seats) {
    const rule = ROULETTE_BETS[seat.option.value];
    const won = seat.option.value === 'plein' ? pocket === seat.option.number : rule.wins(pocket);
    const { net } = await settle(seat.userId, won ? seat.bet * rule.pays : 0, seat.bet);
    seat.net = net;
  }
  const winners = seats.filter((seat) => seat.net > 0).length;

  const [buffer] = await Promise.all([
    rouletteScene({ pocket, betLabel: '', bet: 0, summary: `${seats.length} JOUEUR${seats.length > 1 ? 'S' : ''} · ${winners} GAGNANT${winners > 1 ? 'S' : ''}` }).catch(() => null),
    pause(animation.durationMs),
  ]);
  const picture = image(buffer, `roulette-${table.id}.jpg`);
  tables.delete(table.id);
  const embed = new EmbedBuilder()
    .setColor(winners ? 0x49c78a : 0xd2536a)
    .setTitle(MULTI_GAMES.roulette.title)
    .setDescription([`La bille s’arrête sur ${pocketLabel(pocket)}.`, '', ...seats.map((seat) => resultLine(seat, MULTI_GAMES.roulette.option.label(seat.option)))].join('\n'))
    .setFooter({ text: table.dropped.length ? `Écarté(s) faute de jetons : ${table.dropped.join(', ')}` : 'Roulette européenne · TRJ 97,3 %' });
  if (picture.url) embed.setImage(picture.url);
  return push(table, { embeds: [embed], components: againRow('roulette'), files: picture.files, attachments: [] });
}

// --------------------------------------------------------------------- Crash
const CRASH_SPEED = 6_000;
const CRASH_CAP = 100;
const flightTime = (m) => CRASH_SPEED * Math.log(Math.max(1, m));

function crashList(table, now = null) {
  return [...table.seats.values()]
    .map((seat) => {
      if (seat.cashedAt) return `✅ **${seat.name}** ×${seat.cashedAt.toFixed(2)} · +${chips(seat.bet * seat.cashedAt - seat.bet)}`;
      if (table.exploded) return `💥 **${seat.name}** · -${chips(seat.bet)}`;
      const auto = seat.option.value !== 'manuel' ? ` · auto ×${seat.option.value}` : '';
      return `🚀 **${seat.name}** en vol${now ? ` · ${chips(seat.bet * now)}` : ''}${auto}`;
    })
    .join('\n');
}

async function crashView(table, state, multiplier = 1) {
  const seats = [...table.seats.values()];
  const cashouts = seats.filter((seat) => seat.cashedAt).map((seat) => ({ m: seat.cashedAt, name: seat.name }));
  table.frame = (table.frame ?? 0) + 1;
  const buffer = await crashScene({
    state,
    multiplier,
    point: state === 'crash' ? table.point : null,
    bet: 0,
    cashouts,
    players: `${seats.length} joueur${seats.length > 1 ? 's' : ''} · ${cashouts.length} encaissé${cashouts.length > 1 ? 's' : ''}`,
  }).catch(() => null);
  const picture = image(buffer, `crash-${table.id}-${table.frame}.jpg`);
  const title = state === 'crash' ? `💥 Explosion à ×${table.point.toFixed(2)}` : state === 'vol' ? `**×${multiplier.toFixed(2)}**` : '🚀 **Décollage imminent…**';
  const embed = new EmbedBuilder()
    .setColor(state === 'crash' ? 0xd2536a : COLOR)
    .setTitle(MULTI_GAMES.crash.title)
    .setDescription(`${title}\n\n${crashList(table, state === 'vol' ? multiplier : null)}`);
  if (picture.url) embed.setImage(picture.url);
  const components =
    state === 'crash'
      ? againRow('crash')
      : [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`cmp:cash:${table.id}`)
              .setLabel(state === 'vol' ? 'Encaisser' : 'Décollage…')
              .setEmoji(state === 'vol' ? '💰' : '🚀')
              .setStyle(ButtonStyle.Success)
              .setDisabled(state !== 'vol'),
          ),
        ];
  return { embeds: [embed], components, files: picture.files, attachments: [] };
}

async function playCrash(table) {
  const u = rand(1_000_000) / 1_000_000;
  table.point = Math.min(CRASH_CAP, Math.max(1, Math.floor((EDGE / (1 - u)) * 100) / 100));
  await push(table, await crashView(table, 'decollage'));
  await pause(1_800);

  table.start = Date.now();
  table.boom = setTimeout(() => explodeTable(table).catch(() => {}), flightTime(table.point)).unref();
  // Encaissements automatiques, chacun à l'instant exact de son multiplicateur.
  for (const seat of table.seats.values()) {
    const target = Number(seat.option.value);
    if (target && target < table.point) seat.timer = setTimeout(() => cashSeat(table, seat, target), flightTime(target)).unref();
  }
  const tick = async () => {
    if (table.exploded) return;
    const now = Math.exp((Date.now() - table.start) / CRASH_SPEED);
    if (now >= table.point) return;
    const payload = await crashView(table, 'vol', now);
    if (table.exploded) return;
    await push(table, payload);
    if (!table.exploded) table.ticker = setTimeout(tick, 1_800).unref();
  };
  tick();
}

async function cashSeat(table, seat, multiplier) {
  if (table.exploded || seat.cashedAt) return null;
  seat.cashedAt = multiplier;
  clearTimeout(seat.timer);
  const { net } = await settle(seat.userId, Math.round(seat.bet * multiplier), seat.bet);
  seat.net = net;
  // Tout le monde a encaissé : inutile d'attendre, on montre où la fusée explose.
  // (sans attendre : la réponse au clic du joueur ne doit pas en dépendre)
  if ([...table.seats.values()].every((s) => s.cashedAt)) explodeTable(table).catch(() => {});
  return net;
}

async function explodeTable(table) {
  if (table.exploded) return;
  table.exploded = true;
  clearTimeout(table.boom);
  clearTimeout(table.ticker);
  for (const seat of table.seats.values()) {
    clearTimeout(seat.timer);
    if (!seat.cashedAt) {
      const { net } = await settle(seat.userId, 0, seat.bet);
      seat.net = net;
    }
  }
  tables.delete(table.id);
  await push(table, await crashView(table, 'crash', table.point));
}

// ----------------------------------------------------------------- Blackjack
function bjButtons(table) {
  const seat = table.order[table.turn];
  const first = seat && seat.cards.length === 2 && !seat.doubled;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cmp:hit:${table.id}`).setLabel('Tirer').setEmoji('🃏').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cmp:stand:${table.id}`).setLabel('Rester').setEmoji('✋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cmp:double:${table.id}`).setLabel('Doubler').setEmoji('💰').setStyle(ButtonStyle.Success).setDisabled(!first),
    ),
  ];
}

async function bjView(table, { reveal = false, note = null, components = null, final = false } = {}) {
  table.frame = (table.frame ?? 0) + 1;
  const seats = table.order.map((seat) => ({ name: seat.name, cards: seat.cards, bet: seat.bet, outcome: seat.outcome }));
  const buffer = await blackjackMultiScene({ dealer: table.dealer, seats, turn: table.turn }, { reveal }).catch(() => null);
  const picture = image(buffer, `blackjack-${table.id}-${table.frame}.jpg`);
  const current = table.order[table.turn];
  const lines = table.order.map((seat, index) => {
    const { total, bust } = handValue(seat.cards);
    if (final) return resultLine(seat, `${showHand(seat.cards)} (${total})`);
    const marker = !reveal && index === table.turn ? '👉' : seat.done ? '✔️' : '⏳';
    return `${marker} **${seat.name}** — ${showHand(seat.cards)} · ${bust ? `${total} sauté` : total}`;
  });
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(MULTI_GAMES.blackjack.title)
    .setDescription(
      [
        note ? `*${note}*` : !reveal && current ? `C’est à **${current.name}** de jouer (<t:${Math.ceil(table.turnEndsAt / 1000)}:R>).` : null,
        `**Croupier** · ${reveal ? `${showHand(table.dealer)} — ${handValue(table.dealer).total}` : `${showHand([table.dealer[0]])} + ?`}`,
        '',
        ...lines,
      ]
        .filter((line) => line !== null)
        .join('\n'),
    );
  if (picture.url) embed.setImage(picture.url);
  return { embeds: [embed], components: components ?? [], files: picture.files, attachments: [] };
}

async function playBlackjack(table) {
  table.deck = shoe(6);
  table.order = [...table.seats.values()];
  for (const seat of table.order) seat.cards = [draw(table.deck), draw(table.deck)];
  table.dealer = [draw(table.deck), draw(table.deck)];
  for (const seat of table.order) seat.done = isBlackjack(seat.cards);
  table.turn = -1;

  // Blackjack du croupier : personne ne joue, on retourne tout de suite.
  if (isBlackjack(table.dealer)) return finishBlackjack(table);
  return nextTurn(table);
}

async function nextTurn(table) {
  clearTimeout(table.turnTimer);
  do table.turn += 1;
  while (table.turn < table.order.length && table.order[table.turn].done);
  if (table.turn >= table.order.length) return finishBlackjack(table);

  table.turnEndsAt = Date.now() + TURN_MS;
  const seat = table.order[table.turn];
  // Sans réponse, le joueur reste : la table n'attend pas indéfiniment.
  table.turnTimer = setTimeout(() => {
    seat.done = true;
    nextTurn(table).catch(() => {});
  }, TURN_MS).unref();
  return push(table, await bjView(table, { components: bjButtons(table) }));
}

async function onBlackjackAction(interaction, table, action) {
  const seat = table.order[table.turn];
  if (!seat) return interaction.deferUpdate();
  if (interaction.user.id !== seat.userId) {
    const mine = table.seats.has(interaction.user.id);
    return interaction.reply({ content: mine ? `Patience : c’est au tour de **${seat.name}**.` : 'Tu ne joues pas à cette table.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferUpdate();

  if (action === 'hit') {
    seat.cards.push(draw(table.deck));
    const value = handValue(seat.cards);
    if (value.bust || value.total === 21) {
      seat.done = true;
      return nextTurn(table);
    }
    table.turnEndsAt = Date.now() + TURN_MS;
    clearTimeout(table.turnTimer);
    table.turnTimer = setTimeout(() => {
      seat.done = true;
      nextTurn(table).catch(() => {});
    }, TURN_MS).unref();
    return push(table, await bjView(table, { components: bjButtons(table) }));
  }
  if (action === 'stand') {
    seat.done = true;
    return nextTurn(table);
  }
  if (action === 'double') {
    if (seat.cards.length !== 2) return undefined;
    if ((await stake(seat.userId, seat.bet)) === null) {
      return interaction.followUp({ content: `Doubler demande ${chips(seat.bet)} de plus.`, flags: MessageFlags.Ephemeral });
    }
    seat.bet *= 2;
    seat.doubled = true;
    seat.cards.push(draw(table.deck));
    seat.done = true;
    return nextTurn(table);
  }
  return undefined;
}

async function finishBlackjack(table) {
  clearTimeout(table.turnTimer);
  table.turn = table.order.length; // plus personne n'a la main
  const someoneStanding = table.order.some((seat) => !handValue(seat.cards).bust && !isBlackjack(seat.cards));
  if (someoneStanding && !isBlackjack(table.dealer)) {
    await push(table, await bjView(table, { reveal: true, note: 'Le croupier retourne sa carte…' }));
    while (handValue(table.dealer).total < 17) {
      await pause(1_100);
      const card = draw(table.deck);
      table.dealer.push(card);
      const now = handValue(table.dealer);
      await push(table, await bjView(table, { reveal: true, note: `Le croupier tire ${showHand([card])} — ${now.bust ? `${now.total}, il saute !` : now.total}` }));
    }
    await pause(900);
  }

  const house = handValue(table.dealer);
  const dealerBj = isBlackjack(table.dealer);
  for (const seat of table.order) {
    const { total, bust } = handValue(seat.cards);
    const natural = isBlackjack(seat.cards);
    let payout = 0;
    if (bust) seat.outcome = 'lose';
    else if (natural && !dealerBj) {
      payout = Math.round(seat.bet * 2.5);
      seat.outcome = 'blackjack';
    } else if (natural && dealerBj) {
      payout = seat.bet;
      seat.outcome = 'push';
    } else if (dealerBj) seat.outcome = 'lose';
    else if (house.bust || total > house.total) {
      payout = seat.bet * 2;
      seat.outcome = 'win';
    } else if (total === house.total) {
      payout = seat.bet;
      seat.outcome = 'push';
    } else seat.outcome = 'lose';
    const { net } = await settle(seat.userId, payout, seat.bet);
    seat.net = net;
  }
  tables.delete(table.id);
  return push(table, await bjView(table, { reveal: true, final: true, components: againRow('blackjack') }));
}

// -------------------------------------------------------------- Les clics
export async function handleMultiComponent(interaction) {
  const [, action, id] = interaction.customId.split(':');
  // « Nouvelle table » : id est ici le nom du jeu.
  if (action === 'again') return openMultiTable(interaction, id);

  const table = tables.get(id);
  if (!table) return interaction.reply({ content: 'Cette table est terminée. Ouvre-en une autre avec `/casino`.', flags: MessageFlags.Ephemeral });

  if (table.phase === 'mises') return onBetting(interaction, table, action);

  if (table.game === 'crash' && action === 'cash') {
    const seat = table.seats.get(interaction.user.id);
    if (!seat) return interaction.reply({ content: 'Tu ne joues pas à cette table.', flags: MessageFlags.Ephemeral });
    if (seat.cashedAt) return interaction.reply({ content: `Déjà encaissé à ×${seat.cashedAt.toFixed(2)}.`, flags: MessageFlags.Ephemeral });
    if (!table.start || table.exploded) return interaction.reply({ content: table.exploded ? '💥 Trop tard, elle a explosé !' : '🚀 Pas encore décollé !', flags: MessageFlags.Ephemeral });
    const now = Math.floor(Math.exp((Date.now() - table.start) / CRASH_SPEED) * 100) / 100;
    if (now >= table.point) return interaction.reply({ content: '💥 Trop tard, elle a explosé !', flags: MessageFlags.Ephemeral });
    const net = await cashSeat(table, seat, now);
    return interaction.reply({ content: `💰 Encaissé à **×${now.toFixed(2)}** : +${chips(net ?? 0)}`, flags: MessageFlags.Ephemeral });
  }

  if (table.game === 'blackjack' && ['hit', 'stand', 'double'].includes(action)) return onBlackjackAction(interaction, table, action);
  return interaction.deferUpdate();
}

export const openMultiTables = () => tables.size;
