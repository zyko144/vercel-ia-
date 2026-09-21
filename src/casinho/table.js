// La table : une commande, un embed, et tout se fait dedans.
// On choisit sa mise avec les boutons, son pari avec le menu, puis on joue —
// sans jamais retaper de commande. Chaque table affiche son animation.
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
import { balance, chips } from './economy.js';
import { DICE_BETS, ROULETTE_BETS, diceRtp, evenRtp, resolveInstant, rouletteRtp, slotRtp } from './games.js';
import { startBlackjack } from './blackjack.js';
import { minesMultiplier, startCrash, startHiLo, startMines } from './live.js';
import { CALL, animationFor } from './render/animations.js';
import { resultImage } from './render/scenes.js';

const COLOR = 0xff3fa6;
const PRESETS = [10, 50, 100, 500, 1000];
const LIFETIME_MS = 15 * 60_000;

const panels = new Map();
const lastBet = new Map(); // dernière mise de chaque joueur, pour « Rejouer »
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const isTableComponent = (interaction) =>
  (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) && interaction.customId.startsWith('ctb:');

// --------------------------------------------------------------- Les tables
const TABLES = {
  blackjack: {
    title: '♠️ Blackjack',
    art: 'cartes',
    kind: 'live',
    blurb: 'Battre le croupier sans dépasser 21. Tirer, rester, doubler, séparer.',
    info: 'Croupier sur 17 · blackjack payé 3:2 · TRJ ≈ 99,5 %',
    start: (interaction, panel) => startBlackjack(interaction, panel.bet, { viaUpdate: true }),
  },
  roulette: {
    title: '🎡 Roulette',
    art: 'roulette',
    kind: 'instant',
    blurb: 'Roulette européenne, 37 cases et un seul zéro.',
    info: () => `TRJ 97,3 % sur tous les paris`,
    option: {
      id: 'type',
      placeholder: 'Choisis ton pari',
      value: 'rouge',
      choices: Object.entries(ROULETTE_BETS).map(([value, rule]) => ({
        value,
        label: `${rule.label} — ×${rule.pays}`,
        description: value === 'plein' ? 'Un numéro précis : te demande lequel' : `${rule.count} numéros sur 37`,
      })),
    },
    label: (panel) =>
      panel.option.type === 'plein'
        ? `Numéro plein ${panel.option.number ?? '—'} (×36)`
        : `${ROULETTE_BETS[panel.option.type].label} (×${ROULETTE_BETS[panel.option.type].pays})`,
  },
  machine: {
    title: '🎰 Machine à sous',
    art: 'machine',
    kind: 'instant',
    blurb: 'Trois rouleaux. Trois 7️⃣ paient ×200.',
    info: () => `TRJ ${(slotRtp() * 100).toFixed(2)} % · table complète dans /casino-gains`,
  },
  des: {
    title: '🎲 Dés',
    art: 'des',
    kind: 'instant',
    blurb: 'Deux dés, 36 combinaisons. Parie sur le total.',
    info: (panel) => `TRJ ${(diceRtp(panel.option.type) * 100).toFixed(1)} %`,
    option: {
      id: 'type',
      placeholder: 'Choisis ton pari',
      value: 'plus',
      choices: Object.entries(DICE_BETS).map(([value, rule]) => ({
        value,
        label: `${rule.label} — ×${rule.pays}`,
        description: `${rule.ways} combinaisons sur 36`,
      })),
    },
    label: (panel) => DICE_BETS[panel.option.type].label,
  },
  pileouface: {
    title: '🪙 Pile ou face',
    art: 'piece',
    kind: 'instant',
    blurb: 'Une pièce, deux issues, gain ×1,95.',
    info: () => `TRJ ${(evenRtp() * 100).toFixed(1)} %`,
    option: {
      id: 'side',
      placeholder: 'Pile ou face ?',
      value: 'pile',
      choices: [
        { value: 'pile', label: 'Pile', description: 'Une chance sur deux' },
        { value: 'face', label: 'Face', description: 'Une chance sur deux' },
      ],
    },
    label: (panel) => (panel.option.side === 'pile' ? 'Pile' : 'Face'),
  },
  rougenoir: {
    title: '🃏 Rouge ou noir',
    art: 'cartes',
    kind: 'instant',
    blurb: 'Une carte est tirée. Devine sa couleur, gain ×1,95.',
    info: () => `26 cartes sur 52 · TRJ ${(evenRtp() * 100).toFixed(1)} %`,
    option: {
      id: 'colour',
      placeholder: 'Rouge ou noir ?',
      value: 'rouge',
      choices: [
        { value: 'rouge', label: 'Rouge', description: '♥ et ♦ — 26 cartes sur 52' },
        { value: 'noir', label: 'Noir', description: '♠ et ♣ — 26 cartes sur 52' },
      ],
    },
    label: (panel) => (panel.option.colour === 'rouge' ? 'Rouge' : 'Noir'),
  },
  mines: {
    title: '💣 Mines',
    art: 'mines',
    kind: 'live',
    blurb: 'Ouvre des cases sans tomber sur une bombe. Encaisse quand tu veux.',
    info: (panel) => `Première case ×${minesMultiplier(Number(panel.option.bombs), 1).toFixed(2)} · TRJ 97 %`,
    option: {
      id: 'bombs',
      placeholder: 'Combien de bombes ?',
      value: '3',
      // Calculé à l'affichage, pas au chargement : live.js et table.js s'importent
      // mutuellement, et l'ordre d'évaluation ne doit rien casser.
      choices: () =>
        [1, 2, 3, 5, 10].map((n) => ({
          value: String(n),
          label: `${n} bombe${n > 1 ? 's' : ''} sur 20 cases`,
          description: `Première case ×${minesMultiplier(n, 1).toFixed(2)}`,
        })),
    },
    label: (panel) => `${panel.option.bombs} bombe(s)`,
    start: (interaction, panel) => startMines(interaction, { bet: panel.bet, bombs: Number(panel.option.bombs) }, { viaUpdate: true }),
  },
  crash: {
    title: '🚀 Crash',
    art: 'crash',
    kind: 'live',
    blurb: 'Le multiplicateur grimpe. Encaisse avant l’explosion.',
    info: 'Plafond ×100 · TRJ 97 %',
    start: (interaction, panel) => startCrash(interaction, panel.bet, { viaUpdate: true }),
  },
  plusoumoins: {
    title: '🔼 Plus ou moins',
    art: 'cartes',
    kind: 'live',
    blurb: 'La carte suivante sera-t-elle plus haute ou plus basse ? Les gains s’enchaînent.',
    info: 'Multiplicateurs calculés carte par carte · TRJ 97 %',
    start: (interaction, panel) => startHiLo(interaction, panel.bet, { viaUpdate: true }),
  },
};

export const TABLE_GAMES = Object.keys(TABLES);

// ------------------------------------------------------------- Illustration
/** L'animation du jeu : par URL si le bot est en ligne, sinon jointe au message. */
function artwork(gameId) {
  const name = TABLES[gameId]?.art;
  if (!name) return null;
  const file = `${name}.gif`;
  if (config.publicUrl) return { url: `${config.publicUrl}/casino/${file}`, files: null };
  return { url: `attachment://${file}`, files: [new AttachmentBuilder(path.resolve('assets/casinho', file), { name: file })] };
}

// ------------------------------------------------------------------ Affichage
function describe(table, panel) {
  const info = typeof table.info === 'function' ? table.info(panel) : table.info;
  return [table.blurb, info ? `\n*${info}*` : ''].join('');
}

async function panelPayload(panel, { withFiles = false, note = null } = {}) {
  const table = TABLES[panel.gameId];
  const art = artwork(panel.gameId);
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(table.title)
    .setDescription([note, describe(table, panel)].filter(Boolean).join('\n\n'))
    .addFields(
      { name: 'Mise', value: chips(panel.bet), inline: true },
      { name: 'Solde', value: chips(await balance(panel.userId)), inline: true },
      ...(table.label ? [{ name: 'Ton pari', value: table.label(panel), inline: true }] : []),
    )
    .setFooter({ text: 'Jetons fictifs · aucun argent réel' });
  if (art) embed.setImage(art.url);

  const rows = [];
  if (table.option) {
    const choices = typeof table.option.choices === 'function' ? table.option.choices() : table.option.choices;
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ctb:opt:${panel.id}`)
          .setPlaceholder(table.option.placeholder)
          .addOptions(
            choices.map((choice) => ({
              ...choice,
              default: String(panel.option[table.option.id]) === String(choice.value),
            })),
          ),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      PRESETS.map((amount) =>
        new ButtonBuilder()
          .setCustomId(`ctb:set${amount}:${panel.id}`)
          .setLabel(String(amount))
          .setStyle(panel.bet === amount ? ButtonStyle.Primary : ButtonStyle.Secondary),
      ),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ctb:half:${panel.id}`).setLabel('÷2').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ctb:double:${panel.id}`).setLabel('×2').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ctb:max:${panel.id}`).setLabel('Tout').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ctb:play:${panel.id}`).setLabel('Jouer').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ctb:close:${panel.id}`).setLabel('Fermer').setStyle(ButtonStyle.Secondary),
    ),
  );

  const payload = { embeds: [embed], components: rows };
  if (withFiles && art?.files) payload.files = art.files;
  return payload;
}

/** Après une manche : le résultat, et de quoi relancer sans retaper la commande. */
function afterRoundComponents(panel) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ctb:again:${panel.id}`).setLabel(`Rejouer ${panel.bet}`).setEmoji('🔁').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ctb:table:${panel.id}`).setLabel('Changer la mise').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ctb:close:${panel.id}`).setLabel('Fermer').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ------------------------------------------------------------------ Ouverture
export async function openTable(interaction, gameId, { bet = null, viaUpdate = false } = {}) {
  const table = TABLES[gameId];
  if (!table) return interaction.reply({ content: 'Jeu inconnu.', flags: MessageFlags.Ephemeral });

  const panel = {
    id: newId(),
    userId: interaction.user.id,
    gameId,
    bet: bet ?? lastBet.get(interaction.user.id) ?? 100,
    option: {},
  };
  if (table.option) panel.option[table.option.id] = table.option.value;
  panels.set(panel.id, panel);
  panel.timer = setTimeout(() => panels.delete(panel.id), LIFETIME_MS).unref();

  const payload = await panelPayload(panel, { withFiles: true });
  return viaUpdate ? interaction.update(payload) : interaction.reply(payload);
}

/** `/casino` : le hall, d'où l'on choisit sa table. */
export async function openLobby(interaction) {
  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle('🎰 Casinho')
    .setDescription(
      [
        'Choisis une table dans le menu. Tout se règle ensuite dans l’embed :',
        'la mise avec les boutons, le pari avec le menu, puis **Jouer**.',
        '',
        `Solde : **${chips(await balance(interaction.user.id))}**`,
        '',
        '*Jetons fictifs : ni achat, ni dépôt, ni retrait, aucun argent réel.*',
      ].join('\n'),
    )
    .setFooter({ text: '/casino-gains pour les probabilités exactes de chaque jeu' });

  return interaction.reply({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ctb:pick:hall')
          .setPlaceholder('Choisis ta table')
          .addOptions(
            TABLE_GAMES.map((id) => ({
              value: id,
              label: TABLES[id].title,
              description: TABLES[id].blurb.slice(0, 100),
            })),
          ),
      ),
    ],
  });
}

// ------------------------------------------------------------- Interactions
export async function handleTableComponent(interaction) {
  const [, action, panelId] = interaction.customId.split(':');

  // Le hall : pas encore de table, on en ouvre une.
  if (action === 'pick') return openTable(interaction, interaction.values[0], { viaUpdate: true });

  const panel = panels.get(panelId);
  if (!panel) {
    return interaction.reply({ content: 'Cette table est fermée. Relance la commande du jeu.', flags: MessageFlags.Ephemeral });
  }
  if (interaction.user.id !== panel.userId) {
    return interaction.reply({ content: 'Cette table est à quelqu’un d’autre — ouvre la tienne avec la commande du jeu.', flags: MessageFlags.Ephemeral });
  }

  clearTimeout(panel.timer);
  panel.timer = setTimeout(() => panels.delete(panel.id), LIFETIME_MS).unref();
  const table = TABLES[panel.gameId];

  // ---- Numéro plein : on demande le chiffre dans une petite fenêtre
  if (interaction.isModalSubmit()) {
    const raw = Number(interaction.fields.getTextInputValue('numero'));
    if (!Number.isInteger(raw) || raw < 0 || raw > 36) {
      return interaction.reply({ content: 'Il faut un nombre entier entre 0 et 36.', flags: MessageFlags.Ephemeral });
    }
    panel.option.number = raw;
    return interaction.update(await panelPayload(panel));
  }

  if (action === 'opt') {
    const value = interaction.values[0];
    panel.option[table.option.id] = value;
    if (panel.gameId === 'roulette' && value === 'plein') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`ctb:plein:${panel.id}`)
          .setTitle('Numéro plein')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('numero')
                .setLabel('Ton numéro (0 à 36)')
                .setStyle(TextInputStyle.Short)
                .setMinLength(1)
                .setMaxLength(2)
                .setRequired(true),
            ),
          ),
      );
    }
    return interaction.update(await panelPayload(panel));
  }

  if (action === 'close') {
    panels.delete(panel.id);
    clearTimeout(panel.timer);
    return interaction.update({ content: 'Table fermée. À bientôt 🎰', embeds: [], components: [], files: [] });
  }

  if (action === 'table') return interaction.update(await panelPayload(panel, { withFiles: true }));

  if (action.startsWith('set')) {
    panel.bet = Number(action.slice(3));
    return interaction.update(await panelPayload(panel));
  }

  if (action === 'half' || action === 'double' || action === 'max') {
    const available = await balance(panel.userId);
    if (action === 'half') panel.bet = Math.max(1, Math.floor(panel.bet / 2));
    if (action === 'double') panel.bet = Math.min(config.casinho.maxBet, panel.bet * 2);
    if (action === 'max') panel.bet = Math.max(1, Math.min(config.casinho.maxBet, available));
    return interaction.update(await panelPayload(panel));
  }

  if (action === 'play' || action === 'again') return play(interaction, panel);

  return interaction.deferUpdate();
}

async function play(interaction, panel) {
  const table = TABLES[panel.gameId];
  lastBet.set(panel.userId, panel.bet);

  if (panel.gameId === 'roulette' && panel.option.type === 'plein' && !Number.isInteger(panel.option.number)) {
    return interaction.reply({ content: 'Choisis d’abord ton numéro dans le menu « Numéro plein ».', flags: MessageFlags.Ephemeral });
  }

  const available = await balance(panel.userId);
  if (panel.bet > available) {
    return interaction.reply({
      content: `Il te faut ${chips(panel.bet)} et tu as ${chips(available)}. Baisse la mise, ou passe par \`/quotidien\` ou \`/secours\`.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Les jeux qui durent (blackjack, mines, crash, plus ou moins) prennent la main
  // sur le message : la table réapparaît à la fin, avec « Rejouer ».
  if (table.kind === 'live') return table.start(interaction, panel);

  // Les jeux instantanés : le tirage est fait tout de suite (comme n'importe quel
  // générateur de hasard), puis on joue l'animation de ce résultat-là.
  const result = await resolveInstant(panel.gameId, panel.userId, panel.bet, panel.option);
  if (!result.ok) {
    return interaction.reply({ content: `Il te faut ${chips(panel.bet)} pour cette mise.`, flags: MessageFlags.Ephemeral });
  }

  const animation = animationFor(result.scene) ?? { ...artwork(panel.gameId), durationMs: 1_600 };
  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(table.title)
        .setDescription(`Mise ${chips(panel.bet)}${table.label ? ` sur **${table.label(panel)}**` : ''}\n\n${CALL[result.scene.kind] ?? '*C’est parti…*'}`)
        .setImage(animation.url),
    ],
    components: [],
    files: animation.files ?? [],
    attachments: [],
  });

  // L'image du résultat se dessine pendant que l'animation tourne.
  const [image] = await Promise.all([
    resultImage(result.scene).catch((err) => {
      console.warn('[casinho] rendu :', err.message);
      return null;
    }),
    new Promise((resolve) => setTimeout(resolve, animation.durationMs)),
  ]);
  const name = `resultat-${panel.id}-${Date.now().toString(36)}.jpg`;
  if (image) result.embed.setImage(`attachment://${name}`);
  return interaction.editReply({
    embeds: [result.embed],
    files: image ? [new AttachmentBuilder(image, { name })] : [],
    attachments: [],
    components: afterRoundComponents(panel),
  });
}

/** Bouton « Rejouer » posé par les jeux qui durent, une fois la manche finie. */
export function replayRow(userId, gameId, bet) {
  const panel = { id: newId(), userId, gameId, bet, option: {} };
  const table = TABLES[gameId];
  if (table?.option) panel.option[table.option.id] = table.option.value;
  panels.set(panel.id, panel);
  panel.timer = setTimeout(() => panels.delete(panel.id), LIFETIME_MS).unref();
  lastBet.set(userId, bet);
  return afterRoundComponents(panel);
}

export const openPanels = () => panels.size;
