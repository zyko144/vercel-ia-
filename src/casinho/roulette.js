// La roulette avec un vrai tapis. On prend un jeton (de 10 à un million), on le
// pose — sur une chance, une douzaine, une colonne ou un numéro — et on recommence :
// autant de jetons qu'on veut, où on veut. Chaque case est payée à part.
//
// Seul ou à plusieurs, c'est la même table. À plusieurs, tout le salon pose ses
// jetons sur le même tapis (chacun sa couleur, comme au casino) et une seule
// bille décide pour tout le monde.
//
// Les jetons posés ne sont prélevés qu'au lancement : on peut les retirer
// jusqu'au dernier moment.
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} from 'discord.js';
import { config } from '../config.js';
import { balance, chips, rand, settle, stake } from './economy.js';
import { ROULETTE_BETS, isRed, pocketLabel, resultEmbed } from './games.js';
import { CALL, animationFor } from './render/animations.js';
import { CHIPS, PLAYER_COLORS, chipStyle, tapisScene } from './render/tapis.js';

const COLOR = 0xff3fa6;
const BETTING_MS = 45_000; // à plusieurs : le temps de poser ses jetons
const LIFETIME_MS = 15 * 60_000;
const MAX_PLAYERS = 10;
const MAX_CHIPS = 50; // jetons par joueur et par tour : le tapis reste lisible
const DEFAULT_CHIP = 1_000;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const nameOf = (interaction) => interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;
const amount = (n) => Math.round(n).toLocaleString('fr-FR');
const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

const tables = new Map();
const lastChip = new Map(); // le dernier jeton choisi par chaque joueur

export const ROULETTE_MULTI = {
  title: '🎡 Roulette à plusieurs',
  blurb: 'Tout le salon pose ses jetons sur le même tapis. Une seule bille pour tous.',
};

export const isRouletteComponent = (interaction) =>
  (interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('crl:');

// ------------------------------------------------------------------ Les paris
const OUTSIDE = Object.keys(ROULETTE_BETS).filter((key) => key !== 'plein');

/** Ce que paie une case du tapis (mise comprise), et les numéros qui la font gagner. */
export function spotRule(spot) {
  if (spot.startsWith('plein-')) {
    const n = Number(spot.slice(6));
    if (!Number.isInteger(n) || n < 0 || n > 36) return null;
    return { label: `n° ${n}`, pays: 36, wins: (pocket) => pocket === n };
  }
  if (!OUTSIDE.includes(spot)) return null;
  const rule = ROULETTE_BETS[spot];
  return { label: rule.label, pays: rule.pays, wins: rule.wins };
}

/** Toutes les cases qui gagnent sur ce numéro (elles s'allument sur le tapis). */
export const winningSpots = (pocket) => new Set([...OUTSIDE.filter((key) => ROULETTE_BETS[key].wins(pocket)), `plein-${pocket}`]);

const sum = (values) => values.reduce((total, value) => total + value, 0);
const totalOf = (seat) => [...seat.bets.values()].reduce((total, values) => total + sum(values), 0);

/** Ce que rendent des jetons sur ce numéro : chaque case gagnante, mise × gain. */
export function payoutFor(bets, pocket) {
  let payout = 0;
  for (const [spot, values] of bets) {
    const rule = spotRule(spot);
    if (rule?.wins(pocket)) payout += sum(values) * rule.pays;
  }
  return payout;
}

// ------------------------------------------------------------------- La table
function touch(table) {
  clearTimeout(table.expiry);
  table.expiry = setTimeout(() => {
    clearTimeout(table.countdown);
    tables.delete(table.id);
  }, LIFETIME_MS).unref();
}

function seatFor(table, interaction) {
  let seat = table.seats.get(interaction.user.id);
  if (!seat) {
    // À plusieurs, chacun sa couleur : la première qui n'est pas déjà prise.
    const taken = new Set([...table.seats.values()].map((other) => other.colour));
    const colour = PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[table.seats.size % PLAYER_COLORS.length];
    seat = {
      userId: interaction.user.id,
      name: nameOf(interaction),
      colour,
      chip: lastChip.get(interaction.user.id) ?? DEFAULT_CHIP,
      bets: new Map(), // case → jetons posés, dans l'ordre
      order: [], // les cases, dans l'ordre où les jetons ont été posés (pour « retirer le dernier »)
      previous: null, // les jetons du tour précédent (pour « remettre ma mise »)
    };
    table.seats.set(seat.userId, seat);
  }
  return seat;
}

const playing = (table) => [...table.seats.values()].filter((seat) => seat.order.length);

// ---------------------------------------------------------------- Affichage
const spotSummary = (seat, limit = 4) => {
  const entries = [...seat.bets].map(([spot, values]) => `${spotRule(spot).label} ${amount(sum(values))}`);
  return entries.length > limit ? `${entries.slice(0, limit).join(' · ')} · +${entries.length - limit}` : entries.join(' · ');
};
const chipLabel = (value) => `${chipStyle(value).emoji} ${amount(value)}`;

function bettingEmbed(table) {
  const embed = new EmbedBuilder().setColor(COLOR).setFooter({ text: 'Jetons prélevés au lancement · retire-les quand tu veux avant · jetons fictifs' });

  if (table.solo) {
    const seat = table.seats.get(table.hostId);
    const lines = [...seat.bets].map(([spot, values]) => {
      const rule = spotRule(spot);
      return `• **${rule.label}** — ${chips(sum(values))} · paie ×${rule.pays}`;
    });
    return embed
      .setTitle('🎡 Roulette')
      .setDescription(
        [
          'Prends un **jeton** dans le premier menu, puis **pose-le** avec les autres : une chance, une douzaine, une colonne ou un numéro.',
          'Chaque choix pose un jeton : recommence pour en empiler, ou pour en mettre partout.',
          '',
          '**Sur le tapis**',
          lines.length ? lines.slice(0, 20).join('\n') + (lines.length > 20 ? `\n… et ${lines.length - 20} autres cases` : '') : '*Aucun jeton pour l’instant.*',
        ].join('\n'),
      )
      .addFields(
        { name: 'Jeton en main', value: chipLabel(seat.chip), inline: true },
        { name: 'Mise totale', value: chips(totalOf(seat)), inline: true },
        { name: 'Solde', value: chips(seat.balance ?? 0), inline: true },
      );
  }

  const seats = [...table.seats.values()];
  return embed
    .setTitle(ROULETTE_MULTI.title)
    .setDescription(
      [
        'Tout le salon pose ses jetons sur le **même tapis** — chacun sa couleur — et une seule bille décide pour tout le monde.',
        'Prends un jeton dans le premier menu, pose-le avec les autres, recommence autant que tu veux.',
        '',
        `Départ <t:${Math.ceil(table.endsAt / 1000)}:R>, ou quand <@${table.hostId}> appuie sur **Lancer**.`,
      ].join('\n'),
    )
    .addFields({
      name: `Joueurs (${playing(table).length}/${MAX_PLAYERS})`,
      value: seats.length
        ? seats
            .map((seat) =>
              seat.order.length
                ? `${seat.colour.emoji} **${seat.name}** — ${chips(totalOf(seat))} : ${spotSummary(seat)} · jeton ${chipLabel(seat.chip)}`
                : `${seat.colour.emoji} **${seat.name}** — jeton ${chipLabel(seat.chip)}, rien de posé`,
            )
            .join('\n')
            .slice(0, 1024)
        : '*Personne encore — pose le premier jeton !*',
    });
}

function controls(table) {
  const { id, solo } = table;
  const me = solo ? table.seats.get(table.hostId) : null;
  const empty = solo && !me.order.length;
  const select = (customId, placeholder, options) =>
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options));
  const number = (n) => ({ value: `plein-${n}`, label: String(n), emoji: { name: n === 0 ? '🟢' : isRed(n) ? '🔴' : '⚫' } });

  const rows = [
    select(
      `crl:chip:${id}`,
      solo ? 'Changer de jeton' : `Choisis ton jeton (${amount(DEFAULT_CHIP)} par défaut)`,
      CHIPS.map((chip) => ({
        value: String(chip.value),
        label: `Jeton de ${amount(chip.value)}`,
        emoji: { name: chip.emoji },
        default: solo && me.chip === chip.value,
      })),
    ),
    select(
      `crl:put:${id}`,
      'Poser sur une chance, une douzaine ou une colonne',
      OUTSIDE.map((key) => ({
        value: key,
        label: `${ROULETTE_BETS[key].label} — paie ×${ROULETTE_BETS[key].pays}`,
        description: OUTSIDE_HINT[key],
        ...(key === 'rouge' ? { emoji: { name: '🔴' } } : key === 'noir' ? { emoji: { name: '⚫' } } : {}),
      })),
    ),
    select(`crl:put1:${id}`, 'Poser sur un numéro de 0 à 18 — paie ×36', Array.from({ length: 19 }, (_, n) => number(n))),
    select(`crl:put2:${id}`, 'Poser sur un numéro de 19 à 36 — paie ×36', Array.from({ length: 18 }, (_, n) => number(n + 19))),
  ];

  const button = (action, label, style, { emoji = null, disabled = false } = {}) => {
    const b = new ButtonBuilder().setCustomId(`crl:${action}:${id}`).setLabel(label).setStyle(style).setDisabled(disabled);
    if (emoji) b.setEmoji(emoji);
    return b;
  };
  rows.push(
    new ActionRowBuilder().addComponents(
      solo
        ? [
            button('go', 'Lancer la bille', ButtonStyle.Success, { emoji: '▶️', disabled: empty }),
            button('undo', 'Retirer le dernier', ButtonStyle.Secondary, { emoji: '↩️', disabled: empty }),
            button('clear', 'Tout retirer', ButtonStyle.Secondary, { emoji: '🗑️', disabled: empty }),
            button('double', '×2', ButtonStyle.Secondary, { disabled: empty }),
            button('close', 'Fermer', ButtonStyle.Secondary),
          ]
        : [
            button('go', 'Lancer', ButtonStyle.Success, { emoji: '▶️' }),
            button('undo', 'Retirer mon dernier', ButtonStyle.Secondary, { emoji: '↩️' }),
            button('clear', 'Retirer les miens', ButtonStyle.Secondary, { emoji: '🗑️' }),
            ...(table.round ? [button('rebet', 'Remettre ma mise', ButtonStyle.Primary, { emoji: '🔁' })] : []),
            button('cancel', 'Annuler', ButtonStyle.Danger),
          ],
    ),
  );
  return rows;
}

const OUTSIDE_HINT = {
  rouge: '18 numéros rouges',
  noir: '18 numéros noirs',
  pair: '2, 4, 6 … 36',
  impair: '1, 3, 5 … 35',
  manque: 'De 1 à 18',
  passe: 'De 19 à 36',
  douzaine1: 'De 1 à 12',
  douzaine2: 'De 13 à 24',
  douzaine3: 'De 25 à 36',
  colonne1: '1, 4, 7 … 34',
  colonne2: '2, 5, 8 … 35',
  colonne3: '3, 6, 9 … 36',
};

/** Le tapis tel qu'il est, avec le texte et les menus. */
async function bettingPayload(table) {
  const seats = [...table.seats.values()];
  const me = table.solo ? table.seats.get(table.hostId) : null;
  if (me) me.balance = await balance(me.userId);
  const staked = playing(table);
  const image = await tapisScene({
    seats: seats.map((seat) => ({ color: table.solo ? null : seat.colour, bets: [...seat.bets] })),
    right: me ? `MISE ${amount(totalOf(me))}` : `${staked.length} JOUEUR${staked.length > 1 ? 'S' : ''}`,
    hand: me?.chip ?? null,
    players: me ? [] : staked.map((seat) => ({ name: seat.name, text: amount(totalOf(seat)), color: seat.colour.color })),
  }).catch((err) => {
    console.warn('[casinho] tapis :', err.message);
    return null;
  });
  const embed = bettingEmbed(table);
  const name = `tapis-${table.id}-${Date.now().toString(36)}.jpg`;
  if (image) embed.setImage(`attachment://${name}`);
  return { content: '', embeds: [embed], components: controls(table), files: image ? [new AttachmentBuilder(image, { name })] : [], attachments: [] };
}

/**
 * Redessine le tapis. Si plusieurs joueurs posent des jetons en même temps, les
 * clics s'accumulent pendant le dessin et un seul nouveau dessin les montre tous.
 */
function redraw(table) {
  if (table.drawing) {
    table.dirty = true;
    return table.drawing;
  }
  table.drawing = (async () => {
    try {
      do {
        table.dirty = false;
        const payload = await bettingPayload(table);
        if (table.phase !== 'mises') break;
        await table.editor.editReply(payload);
      } while (table.dirty);
    } catch (err) {
      console.warn('[casinho] roulette :', err.message);
    } finally {
      table.drawing = null;
    }
  })();
  return table.drawing;
}

/** Accuse le clic tout de suite (le dessin peut prendre une seconde), puis redessine. */
async function refresh(table, interaction) {
  table.editor = interaction;
  await interaction.deferUpdate();
  return redraw(table);
}

// ------------------------------------------------------------------ Ouverture
/** Ouvre la roulette à la place du hall : seul (`solo`), ou pour tout le salon. */
export async function openRoulette(interaction, { solo }) {
  const table = { id: newId(), solo, hostId: interaction.user.id, phase: 'mises', seats: new Map(), round: 0, editor: interaction };
  tables.set(table.id, table);
  touch(table);
  if (solo) seatFor(table, interaction);
  else startCountdown(table);
  return refresh(table, interaction);
}

function startCountdown(table) {
  clearTimeout(table.countdown);
  table.endsAt = Date.now() + BETTING_MS;
  table.countdown = setTimeout(() => spin(table).catch((err) => console.warn('[casinho] roulette :', err.message)), BETTING_MS).unref();
}

// ------------------------------------------------------------------ Les clics
export async function handleRoulette(interaction) {
  const [, action, id] = interaction.customId.split(':');
  const table = tables.get(id);

  if (!table) {
    // « Nouveau tour » sur une table fermée depuis : on en rouvre une.
    if (action === 'again') return openRoulette(interaction, { solo: false });
    return interaction.reply(ephemeral('Cette table est fermée. Relance `/casino`.'));
  }
  if (table.solo && interaction.user.id !== table.hostId) {
    return interaction.reply(ephemeral('Cette table est à quelqu’un d’autre — ouvre la tienne avec `/casino`.'));
  }
  touch(table);
  const isHost = interaction.user.id === table.hostId || interaction.user.id === config.ownerId;

  if (action === 'close' || action === 'cancel') {
    if (!table.solo && !isHost) return interaction.reply(ephemeral(`Seul <@${table.hostId}> peut fermer la table.`));
    if (table.phase === 'tirage') return interaction.reply(ephemeral('La bille roule : attends la fin du tour.'));
    clearTimeout(table.countdown);
    clearTimeout(table.expiry);
    tables.delete(table.id);
    return interaction.update({ content: 'Table fermée. À bientôt 🎰', embeds: [], components: [], files: [], attachments: [] });
  }

  // Après le tirage.
  if (table.phase === 'fini') {
    if (action === 'again' && !table.solo) return newRound(interaction, table);
    if (action === 'edit' && table.solo) {
      table.phase = 'mises';
      return refresh(table, interaction);
    }
    if (action === 'replay' && table.solo) return launchSolo(interaction, table);
    return interaction.reply(ephemeral('Ce tour est terminé.'));
  }
  if (table.phase !== 'mises') return interaction.reply(ephemeral('Les jeux sont faits — attends le prochain tour.'));

  if (action === 'go') {
    if (table.solo) return launchSolo(interaction, table);
    if (!isHost) return interaction.reply(ephemeral(`Seul <@${table.hostId}> peut lancer (sinon, départ automatique à la fin du compte à rebours).`));
    if (!playing(table).length) return interaction.reply(ephemeral('Personne n’a encore posé de jeton.'));
    table.editor = interaction;
    await interaction.deferUpdate();
    return spin(table);
  }

  // Tout le reste touche aux jetons du joueur : la table doit avoir une place pour lui.
  const seated = table.seats.get(interaction.user.id);
  if (!seated?.order.length && playing(table).length >= MAX_PLAYERS && ['chip', 'put', 'put1', 'put2', 'rebet'].includes(action)) {
    return interaction.reply(ephemeral(`La table est complète (${MAX_PLAYERS} joueurs).`));
  }

  if (action === 'chip') {
    const value = Number(interaction.values[0]);
    if (!CHIPS.some((chip) => chip.value === value)) return interaction.deferUpdate();
    const seat = seatFor(table, interaction);
    seat.chip = value;
    lastChip.set(seat.userId, value);
    // À plusieurs le message est commun : le jeton choisi s'affiche à côté du nom.
    return refresh(table, interaction);
  }

  if (action.startsWith('put')) return place(interaction, table, interaction.values[0]);

  if (!seated) return interaction.reply(ephemeral('Tu n’as aucun jeton sur ce tapis.'));
  const seat = seated;

  if (action === 'undo') {
    if (!seat.order.length) return interaction.reply(ephemeral('Tu n’as aucun jeton sur le tapis.'));
    const spot = seat.order.pop();
    const values = seat.bets.get(spot);
    values.pop();
    if (!values.length) seat.bets.delete(spot);
    return refresh(table, interaction);
  }

  if (action === 'clear') {
    seat.bets.clear();
    seat.order = [];
    return refresh(table, interaction);
  }

  if (action === 'double') {
    if (!seat.order.length) return interaction.reply(ephemeral('Pose d’abord des jetons.'));
    const refusal = await canAfford(seat, totalOf(seat) * 2, seat.order.length * 2, [...seat.bets].map(([spot, values]) => sum(values) * 2));
    if (refusal) return interaction.reply(ephemeral(refusal));
    for (const [spot, values] of seat.bets) seat.bets.set(spot, [...values, ...values]);
    seat.order = [...seat.order, ...seat.order];
    return refresh(table, interaction);
  }

  if (action === 'rebet') {
    if (!seat.previous?.length) return interaction.reply(ephemeral('Tu n’as pas encore joué à cette table.'));
    const bets = seat.previous.map(([spot, values]) => [spot, [...values]]);
    const count = sum(bets.map(([, values]) => values.length));
    const refusal = await canAfford(seat, sum(bets.map(([, values]) => sum(values))), count, bets.map(([, values]) => sum(values)));
    if (refusal) return interaction.reply(ephemeral(refusal));
    seat.bets = new Map(bets);
    seat.order = bets.flatMap(([spot, values]) => values.map(() => spot));
    return refresh(table, interaction);
  }

  return interaction.deferUpdate();
}

/** Vérifie qu'un ensemble de jetons reste dans les règles. Renvoie le refus, ou null. */
async function canAfford(seat, total, count, perSpot) {
  if (count > MAX_CHIPS) return `Pas plus de ${MAX_CHIPS} jetons par tour : prends de plus gros jetons.`;
  if (perSpot.some((value) => value > config.casinho.maxBet)) return `Mise maximum par case : ${chips(config.casinho.maxBet)}.`;
  const available = await balance(seat.userId);
  if (total > available) {
    return `Il te faut ${chips(total)} et tu as ${chips(available)}. Prends un plus petit jeton, ou passe par \`/quotidien\`.`;
  }
  return null;
}

async function place(interaction, table, spot) {
  if (!spotRule(spot)) return interaction.deferUpdate();
  const seat = seatFor(table, interaction);
  const onSpot = sum(seat.bets.get(spot) ?? []) + seat.chip;
  const refusal = await canAfford(seat, totalOf(seat) + seat.chip, seat.order.length + 1, [onSpot]);
  if (refusal) return interaction.reply(ephemeral(refusal));
  if (!seat.bets.has(spot)) seat.bets.set(spot, []);
  seat.bets.get(spot).push(seat.chip);
  seat.order.push(spot);
  return refresh(table, interaction);
}

async function launchSolo(interaction, table) {
  const seat = table.seats.get(table.hostId);
  if (!seat.order.length) return interaction.reply(ephemeral('Pose au moins un jeton sur le tapis.'));
  const available = await balance(seat.userId);
  if (totalOf(seat) > available) {
    return interaction.reply(ephemeral(`Il te faut ${chips(totalOf(seat))} et tu as ${chips(available)}. Retire des jetons, ou passe par \`/quotidien\`.`));
  }
  table.phase = 'mises';
  table.editor = interaction;
  await interaction.deferUpdate();
  return spin(table);
}

/** À plusieurs : un nouveau tour sur la même table, avec les mêmes couleurs. */
async function newRound(interaction, table) {
  for (const seat of table.seats.values()) {
    seat.bets = new Map();
    seat.order = [];
  }
  table.phase = 'mises';
  table.hostId = interaction.user.id;
  startCountdown(table);
  return refresh(table, interaction);
}

// ------------------------------------------------------------------ Le tirage
async function spin(table) {
  if (table.phase !== 'mises') return;
  table.phase = 'tirage';
  clearTimeout(table.countdown);
  if (table.drawing) await table.drawing;
  const edit = (payload) => table.editor.editReply(payload);

  // Chaque joueur paie ses jetons maintenant ; qui n'a plus de quoi payer est écarté.
  const seats = [];
  const dropped = [];
  for (const seat of playing(table)) {
    if ((await stake(seat.userId, totalOf(seat))) === null) dropped.push(seat.name);
    else seats.push(seat);
  }

  if (!seats.length) {
    if (table.solo) {
      table.phase = 'mises';
      return redraw(table);
    }
    table.phase = 'fini';
    return edit({
      content: '',
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setTitle(ROULETTE_MULTI.title)
          .setDescription(dropped.length ? `Plus assez de jetons pour ${dropped.join(', ')} : tour annulé.` : 'Personne n’a posé de jeton : tour annulé.'),
      ],
      components: againRow(table),
      files: [],
      attachments: [],
    });
  }

  const pocket = rand(37);
  const animation = animationFor({ kind: 'roulette', pocket });
  await edit({
    content: '',
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(table.solo ? '🎡 Roulette' : ROULETTE_MULTI.title)
        .setDescription(
          [
            CALL.roulette,
            '',
            ...(table.solo
              ? [`${chips(totalOf(seats[0]))} sur le tapis : ${spotSummary(seats[0], 6)}`]
              : seats.map((seat) => `${seat.colour.emoji} **${seat.name}** — ${chips(totalOf(seat))}`)),
          ].join('\n'),
        )
        .setImage(animation.url),
    ],
    components: [],
    files: animation.files,
    attachments: [],
  });

  // Chaque case est payée à part, selon ses propres chances.
  for (const seat of seats) {
    const total = totalOf(seat);
    const payout = payoutFor(seat.bets, pocket);
    const { net, balance: after } = await settle(seat.userId, payout, total);
    seat.result = { total, payout, net, balance: after };
    seat.previous = [...seat.bets].map(([spot, values]) => [spot, [...values]]);
  }
  table.round += 1;

  const winning = winningSpots(pocket);
  const [image] = await Promise.all([resultImage(table, seats, pocket, winning).catch(() => null), pause(animation.durationMs)]);
  table.phase = 'fini';
  const payload = table.solo ? soloResult(table, seats[0], pocket, image) : multiResult(table, seats, pocket, image, dropped);
  return edit(payload);
}

function resultImage(table, seats, pocket, winning) {
  const scene = { seats: seats.map((seat) => ({ color: table.solo ? null : seat.colour, bets: [...seat.bets] })), pocket, winning };
  if (table.solo) {
    const { total, payout, net, balance: after } = seats[0].result;
    return tapisScene({
      ...scene,
      result: {
        tone: net > 0 ? 'win' : net < 0 ? 'lose' : 'push',
        title: net > 0 ? (payout >= total * 10 ? 'JACKPOT' : 'GAGNÉ') : net < 0 ? 'PERDU' : 'ÉGALITÉ',
        sub: `${net > 0 ? '+' : ''}${amount(net)} jetons · solde ${amount(after)}`,
      },
      footer: `MISE ${amount(total)} · RENDU ${amount(payout)}`,
    });
  }
  const winners = seats.filter((seat) => seat.result.net > 0).length;
  return tapisScene({
    ...scene,
    result: {
      tone: winners ? 'win' : 'lose',
      title: winners ? `${winners} GAGNANT${winners > 1 ? 'S' : ''}` : 'LA BANQUE GAGNE',
      sub: `sur ${seats.length} joueur${seats.length > 1 ? 's' : ''}`,
    },
    players: seats.map((seat) => ({
      name: seat.name,
      text: `${seat.result.net > 0 ? '+' : ''}${amount(seat.result.net)}`,
      color: seat.colour.color,
      tone: seat.result.net > 0 ? '#9dffc6' : seat.result.net < 0 ? '#ffb3c1' : '#ffffff',
    })),
  });
}

function attach(embed, image, table) {
  if (!image) return [];
  const name = `roulette-${table.id}-${Date.now().toString(36)}.jpg`;
  embed.setImage(`attachment://${name}`);
  return [new AttachmentBuilder(image, { name })];
}

function soloResult(table, seat, pocket, image) {
  const { total, payout, net, balance: after } = seat.result;
  const lines = [...seat.bets]
    .map(([spot, values]) => {
      const rule = spotRule(spot);
      const stakeOn = sum(values);
      return rule.wins(pocket)
        ? { won: true, text: `✅ **${rule.label}** · ${chips(stakeOn)} → ${chips(stakeOn * rule.pays)}` }
        : { won: false, text: `❌ ${rule.label} · ${chips(stakeOn)}` };
    })
    .sort((a, b) => Number(b.won) - Number(a.won))
    .map((line) => line.text);
  const shown = lines.length > 15 ? [...lines.slice(0, 15), `… et ${lines.length - 15} autres cases`] : lines;
  const embed = resultEmbed({
    title: '🎡 Roulette',
    lines: [`La bille s’arrête sur ${pocketLabel(pocket)}.`, '', ...shown, '', `Mise ${chips(total)} · rendu ${chips(payout)}`],
    net,
    balance: after,
    footer: 'Roulette européenne, un seul zéro · TRJ 97,3 % sur chaque case',
  });
  const files = attach(embed, image, table);
  return {
    content: '',
    embeds: [embed],
    files,
    attachments: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`crl:replay:${table.id}`).setLabel(`Rejouer · ${amount(total)}`).setEmoji('🔁').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`crl:edit:${table.id}`).setLabel('Changer mes jetons').setEmoji('🎯').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`crl:close:${table.id}`).setLabel('Fermer').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

const againRow = (table) => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`crl:again:${table.id}`).setLabel('Nouveau tour').setEmoji('🔁').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`crl:close:${table.id}`).setLabel('Fermer la table').setStyle(ButtonStyle.Secondary),
  ),
];

function multiResult(table, seats, pocket, image, dropped) {
  const lines = seats.map((seat) => {
    const { net } = seat.result;
    const marks = [...seat.bets].map(([spot]) => `${spotRule(spot).label} ${spotRule(spot).wins(pocket) ? '✓' : '✗'}`);
    const detail = marks.length > 4 ? `${marks.slice(0, 4).join(' · ')} · +${marks.length - 4}` : marks.join(' · ');
    return `${net > 0 ? '✅' : net < 0 ? '❌' : '➖'} ${seat.colour.emoji} **${seat.name}** ${net > 0 ? '+' : ''}${chips(net)} — ${detail}`;
  });
  const embed = new EmbedBuilder()
    .setColor(seats.some((seat) => seat.result.net > 0) ? 0x49c78a : 0xd2536a)
    .setTitle(ROULETTE_MULTI.title)
    .setDescription([`La bille s’arrête sur ${pocketLabel(pocket)}.`, '', ...lines].join('\n').slice(0, 4000))
    .setFooter({
      text: dropped.length ? `Écarté(s) faute de jetons : ${dropped.join(', ')}` : '« Nouveau tour » : même table, mêmes couleurs · « Remettre ma mise » rejoue tes jetons',
    });
  const files = attach(embed, image, table);
  return { content: '', embeds: [embed], files, attachments: [], components: againRow(table) };
}

export const openRouletteTables = () => tables.size;
