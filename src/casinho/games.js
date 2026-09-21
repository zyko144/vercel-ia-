// Jeux instantanés : un tirage, un résultat. Les gains sont calculés à partir des
// vraies probabilités, jamais choisis à la main — chaque table affiche son taux de
// redistribution (TRJ), c'est-à-dire ce que le jeu rend en moyenne sur 100 misés.
//
// Rien ici ne parle à Discord : ces fonctions rendent un embed, et c'est la table
// (table.js) qui décide de l'afficher ou de le remplacer.
import { EmbedBuilder } from 'discord.js';
import { chips, pick, rand, settle, stake } from './economy.js';
import { red, shoe } from './cards.js';

const COLOR = 0xff3fa6;

// ---------------------------------------------------------------- Roulette
// Roulette européenne : 37 cases (0 à 36), un seul zéro.
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const POCKETS = 37;

/** Chaque pari : les numéros gagnants et ce que paie la mise (mise comprise). */
export const ROULETTE_BETS = {
  rouge: { label: 'Rouge', wins: (n) => RED_NUMBERS.has(n), count: 18, pays: 2 },
  noir: { label: 'Noir', wins: (n) => n !== 0 && !RED_NUMBERS.has(n), count: 18, pays: 2 },
  pair: { label: 'Pair', wins: (n) => n !== 0 && n % 2 === 0, count: 18, pays: 2 },
  impair: { label: 'Impair', wins: (n) => n % 2 === 1, count: 18, pays: 2 },
  manque: { label: 'Manque (1-18)', wins: (n) => n >= 1 && n <= 18, count: 18, pays: 2 },
  passe: { label: 'Passe (19-36)', wins: (n) => n >= 19, count: 18, pays: 2 },
  douzaine1: { label: '1re douzaine (1-12)', wins: (n) => n >= 1 && n <= 12, count: 12, pays: 3 },
  douzaine2: { label: '2e douzaine (13-24)', wins: (n) => n >= 13 && n <= 24, count: 12, pays: 3 },
  douzaine3: { label: '3e douzaine (25-36)', wins: (n) => n >= 25, count: 12, pays: 3 },
  colonne1: { label: '1re colonne', wins: (n) => n !== 0 && n % 3 === 1, count: 12, pays: 3 },
  colonne2: { label: '2e colonne', wins: (n) => n !== 0 && n % 3 === 2, count: 12, pays: 3 },
  colonne3: { label: '3e colonne', wins: (n) => n !== 0 && n % 3 === 0, count: 12, pays: 3 },
  plein: { label: 'Numéro plein', wins: null, count: 1, pays: 36 },
};

export const rouletteRtp = (key) => (ROULETTE_BETS[key].count * ROULETTE_BETS[key].pays) / POCKETS;

export const pocketLabel = (n) => (n === 0 ? '🟢 **0**' : `${RED_NUMBERS.has(n) ? '🔴' : '⚫'} **${n}**`);
export const isRed = (n) => RED_NUMBERS.has(n);

/** Un tour de roulette, sans affichage : la case tirée et le multiplicateur obtenu. */
export function rouletteSpin(type, number) {
  const rule = ROULETTE_BETS[type];
  const pocket = rand(POCKETS);
  const won = type === 'plein' ? pocket === number : rule.wins(pocket);
  return { pocket, won, multiplier: won ? rule.pays : 0 };
}

// ------------------------------------------------------------ Machine à sous
// Trois rouleaux identiques. La bande détermine les probabilités : elles ne sont
// pas décidées à la main, elles découlent du nombre de symboles.
const STRIP = [
  ...Array(5).fill('🍒'),
  ...Array(5).fill('🍋'),
  ...Array(4).fill('🔔'),
  ...Array(3).fill('⭐'),
  ...Array(2).fill('💎'),
  ...Array(1).fill('7️⃣'),
];
const TRIPLE_PAYS = { '7️⃣': 200, '💎': 80, '⭐': 30, '🔔': 18, '🍋': 10, '🍒': 10 };
const PAIR_PAYS = { '🍒': 1.8, '💎': 1.5 }; // exactement deux, n'importe où

const countOf = (symbol) => STRIP.filter((s) => s === symbol).length;
const share = (symbol) => countOf(symbol) / STRIP.length;

/** TRJ exact de la machine, calculé à partir de la bande et de la table des gains. */
export function slotRtp() {
  let rtp = 0;
  for (const [symbol, pays] of Object.entries(TRIPLE_PAYS)) rtp += share(symbol) ** 3 * pays;
  for (const [symbol, pays] of Object.entries(PAIR_PAYS)) {
    const p = share(symbol);
    rtp += 3 * p ** 2 * (1 - p) * pays; // exactement deux sur trois rouleaux
  }
  return rtp;
}

function slotPayout(reels) {
  const [a, b, c] = reels;
  if (a === b && b === c) return { multiplier: TRIPLE_PAYS[a] ?? 0, label: `Trois ${a} !` };
  for (const [symbol, pays] of Object.entries(PAIR_PAYS)) {
    if (reels.filter((s) => s === symbol).length === 2) return { multiplier: pays, label: `Deux ${symbol}` };
  }
  return { multiplier: 0, label: 'Aucune combinaison.' };
}

/** Un tour de machine, sans affichage. */
export function slotSpin() {
  const reels = [pick(STRIP), pick(STRIP), pick(STRIP)];
  return { reels, ...slotPayout(reels) };
}

export function slotPaytable() {
  const lines = Object.entries(TRIPLE_PAYS).map(([symbol, pays]) => {
    const p = share(symbol) ** 3;
    return `${symbol}${symbol}${symbol} → ×${pays}  ·  1 chance sur ${Math.round(1 / p).toLocaleString('fr-FR')}`;
  });
  for (const [symbol, pays] of Object.entries(PAIR_PAYS)) {
    const p = share(symbol);
    const chance = 3 * p ** 2 * (1 - p);
    lines.push(`${symbol}${symbol} (exactement deux) → ×${pays}  ·  1 chance sur ${Math.round(1 / chance)}`);
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------- Dés
// Deux dés à six faces : 36 combinaisons, toutes équiprobables.
export const DICE_BETS = {
  plus: { label: 'Plus de 7 (8 à 12)', wins: (total) => total > 7, ways: 15, pays: 2.32 },
  moins: { label: 'Moins de 7 (2 à 6)', wins: (total) => total < 7, ways: 15, pays: 2.32 },
  sept: { label: 'Exactement 7', wins: (total) => total === 7, ways: 6, pays: 5.75 },
};
export const diceRtp = (key) => (DICE_BETS[key].ways * DICE_BETS[key].pays) / 36;

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** Un lancer de deux dés, sans affichage. */
export function diceRoll(type) {
  const rule = DICE_BETS[type];
  const a = rand(6) + 1;
  const b = rand(6) + 1;
  const total = a + b;
  const won = rule.wins(total);
  return { a, b, total, won, multiplier: won ? rule.pays : 0 };
}

// ------------------------------------------- Pile ou face · Rouge ou noir
const EVEN_PAYS = 1.95; // une chance sur deux payée 1,95 → TRJ 97,5 %
export const evenRtp = () => EVEN_PAYS / 2;

export function coinToss(side) {
  const result = rand(2) === 0 ? 'pile' : 'face';
  return { result, won: result === side, multiplier: result === side ? EVEN_PAYS : 0 };
}

export function cardColour(colour) {
  const card = shoe(1).pop();
  const result = red(card) ? 'rouge' : 'noir';
  return { card, result, won: result === colour, multiplier: result === colour ? EVEN_PAYS : 0 };
}

// --------------------------------------------------------------- Résultats
export function resultEmbed({ title, lines, net, balance, footer }) {
  const sign = net > 0 ? '+' : '';
  return new EmbedBuilder()
    .setColor(net > 0 ? 0x49c78a : net < 0 ? 0xd2536a : COLOR)
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .addFields({ name: 'Bilan', value: `${sign}${chips(net)}`, inline: true }, { name: 'Solde', value: chips(balance), inline: true })
    .setFooter({ text: footer });
}

/**
 * Joue une manche d'un jeu instantané : prélève la mise, tire, verse le gain, et rend
 * l'embed du résultat. Ne parle jamais à Discord — c'est la table qui affiche.
 */
export async function resolveInstant(gameId, userId, bet, option = {}) {
  const taken = await stake(userId, bet);
  if (taken === null) return { ok: false, reason: 'solde' };

  let multiplier = 0;
  let title = '';
  let lines = [];
  let footer = '';
  let scene = null; // ce que montrera l'image du résultat

  if (gameId === 'roulette') {
    const rule = ROULETTE_BETS[option.type];
    const spin = rouletteSpin(option.type, option.number);
    multiplier = spin.multiplier;
    title = '🎡 Roulette';
    lines = [
      `La bille s’arrête sur ${pocketLabel(spin.pocket)}.`,
      `Pari : **${option.type === 'plein' ? `${rule.label} ${option.number}` : rule.label}**`,
      spin.won ? `Gagné : ${rule.pays}× la mise` : 'Perdu.',
    ];
    footer = `TRJ ${(rouletteRtp(option.type) * 100).toFixed(1)} % · roulette européenne, un seul zéro`;
    scene = { kind: 'roulette', pocket: spin.pocket, betLabel: option.type === 'plein' ? `${option.number}` : rule.label };
  } else if (gameId === 'machine') {
    const spin = slotSpin();
    multiplier = spin.multiplier;
    title = '🎰 Machine à sous';
    lines = [`\`\`\`\n${spin.reels.join(' | ')}\n\`\`\``, `${spin.label}${multiplier ? ` → **×${multiplier}**` : ''}`];
    footer = `TRJ ${(slotRtp() * 100).toFixed(1)} % · /casino-gains pour la table complète`;
    scene = { kind: 'machine', reels: spin.reels, label: spin.label, multiplier };
  } else if (gameId === 'des') {
    const rule = DICE_BETS[option.type];
    const roll = diceRoll(option.type);
    multiplier = roll.multiplier;
    title = '🎲 Dés';
    lines = [`${FACES[roll.a - 1]} ${FACES[roll.b - 1]} → total **${roll.total}**`, `Pari : **${rule.label}**`, roll.won ? 'Gagné !' : 'Perdu.'];
    footer = `${rule.ways} combinaisons sur 36 · TRJ ${(diceRtp(option.type) * 100).toFixed(1)} %`;
    scene = { kind: 'des', a: roll.a, b: roll.b, betLabel: rule.label };
  } else if (gameId === 'pileouface') {
    const toss = coinToss(option.side);
    multiplier = toss.multiplier;
    title = '🪙 Pile ou face';
    lines = [`La pièce tombe sur **${toss.result}**.`, `Ton choix : **${option.side}**`, toss.won ? 'Gagné !' : 'Perdu.'];
    footer = `Gain ×${EVEN_PAYS} · TRJ ${(evenRtp() * 100).toFixed(1)} %`;
    scene = { kind: 'piece', side: toss.result, choice: option.side };
  } else if (gameId === 'rougenoir') {
    const deal = cardColour(option.colour);
    multiplier = deal.multiplier;
    title = '🃏 Rouge ou noir';
    lines = [`Carte tirée : \`${deal.card.rank}${deal.card.suit}\` → **${deal.result}**`, `Ton choix : **${option.colour}**`, deal.won ? 'Gagné !' : 'Perdu.'];
    footer = `26 cartes sur 52 · gain ×${EVEN_PAYS} · TRJ ${(evenRtp() * 100).toFixed(1)} %`;
    scene = { kind: 'carte', card: deal.card, choice: option.colour };
  } else {
    // Jeu inconnu : la mise est rendue plutôt que gardée.
    await settle(userId, bet, bet);
    return { ok: false, reason: 'inconnu' };
  }

  const payout = Math.round(bet * multiplier);
  const { balance, net } = await settle(userId, payout, bet);
  lines.push(`Mise ${chips(bet)}${payout ? ` · rendu ${chips(payout)}` : ''}`);
  const sign = net > 0 ? '+' : '';
  const outcome = {
    tone: net > 0 ? 'win' : net < 0 ? 'lose' : 'push',
    title: net > 0 ? (multiplier >= 30 ? `JACKPOT ×${multiplier}` : 'GAGNÉ') : net < 0 ? 'PERDU' : 'ÉGALITÉ',
    sub: `${sign}${Math.round(net).toLocaleString('fr-FR')} jetons · solde ${Math.round(balance).toLocaleString('fr-FR')}`,
  };
  return { ok: true, embed: resultEmbed({ title, lines, net, balance, footer }), won: multiplier > 0, scene: { ...scene, bet, outcome } };
}
