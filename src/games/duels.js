// Duels à deux, joués avec des boutons dans un seul message : morpion, puissance 4, bataille navale,
// pierre-feuille-ciseaux, allumettes, memory, abordage de navires et duel de rimes (jugé par l'IA).
// On défie un membre (ou tout le salon, ou le bot) avec une mise en pièces d'or facultative :
// les deux mises sont bloquées, le gagnant emporte le pot (5 % au coffre commun), égalité = remboursé.
// Boutons : « g:duel:<id>:<action>:<arg> ».
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { chatJson } from '../ai/gemini.js';
import { addGold, addToChest, goldOf } from '../features/economy.js';
import { playedGame, rewardWin } from '../features/treasury.js';
import { buildModal, field as f, readModal } from '../panels/ui.js';
import { PRIVATE, gameChannel, pick, registerGame, shortId, shuffle, unregisterGame } from './common.js';

const duels = new Map();
const TURN_MS = 120_000;
const speed = { bot: 900, hide: 1600 }; // délais (réduits pendant les tests)
const MAX_BET = 50_000;
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const btn = (id, { label, emoji, style = ButtonStyle.Secondary, disabled = false } = {}) => {
  const b = new ButtonBuilder().setCustomId(id).setStyle(style).setDisabled(disabled);
  if (label) b.setLabel(label);
  if (emoji) b.setEmoji(emoji);
  if (!label && !emoji) b.setLabel('​');
  return b;
};
const rows = (buttons, per = 5) => {
  const out = [];
  for (let i = 0; i < buttons.length; i += per) out.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + per)));
  return out;
};
const other = (d, id) => (id === d.a ? d.b : d.a);
const tag = (d, id) => (id === d.botId ? '🤖 le bot' : `<@${id}>`);

// =====================================================================
// Les jeux : init (état), view (texte + boutons), play (un coup), ai (coup du bot)
// =====================================================================

const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winner3 = (b) => LINES3.map((l) => l.map((i) => b[i])).find((l) => l[0] && l[0] === l[1] && l[1] === l[2])?.[0] ?? null;

function minimax(b, me, turn) {
  const w = winner3(b);
  if (w) return { score: w === me ? 10 : -10 };
  const free = b.map((v, i) => (v ? null : i)).filter((i) => i !== null);
  if (!free.length) return { score: 0 };
  let best = null;
  for (const i of free) {
    b[i] = turn;
    const r = minimax(b, me, turn === 'X' ? 'O' : 'X');
    b[i] = null;
    const score = r.score * 0.9;
    if (!best || (turn === me ? score > best.score : score < best.score)) best = { score, move: i };
  }
  return best;
}

const P4_W = 7;
const P4_H = 6;
function p4Winner(g) {
  const at = (x, y) => (x >= 0 && x < P4_W && y >= 0 && y < P4_H ? g[y][x] : null);
  for (let y = 0; y < P4_H; y++) for (let x = 0; x < P4_W; x++) {
    const v = g[y][x];
    if (!v) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) if ([1, 2, 3].every((k) => at(x + dx * k, y + dy * k) === v)) return v;
  }
  return null;
}
const p4Drop = (g, col, v) => {
  for (let y = P4_H - 1; y >= 0; y--) if (!g[y][col]) { g[y][col] = v; return true; }
  return false;
};

const SHIPS = [3, 2, 2];
function placeFleet() {
  const cells = new Set();
  for (const size of SHIPS) {
    for (;;) {
      const horiz = Math.random() < 0.5;
      const x = Math.floor(Math.random() * (horiz ? 6 - size : 5));
      const y = Math.floor(Math.random() * (horiz ? 5 : 6 - size));
      const ship = Array.from({ length: size }, (_, k) => (horiz ? y * 5 + x + k : (y + k) * 5 + x));
      if (ship.some((c) => cells.has(c))) continue;
      ship.forEach((c) => cells.add(c));
      break;
    }
  }
  return [...cells];
}

const MEMORY = ['🦜', '🏴‍☠️', '⚓', '💰', '🗺️', '🦑', '💎', '🍾'];
const PFC = { pierre: '🪨', feuille: '📄', ciseaux: '✂️' };
const BEATS = { pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' };
const RHYME_THEMES = ['la mer', 'l’or', 'la trahison', 'la victoire', 'la nuit', 'le respect', 'l’argent facile', 'la famille', 'la rue', 'le temps qui passe'];

export const DUEL_GAMES = {
  morpion: {
    name: 'Morpion', emoji: '❌',
    init: (d) => ({ board: Array(9).fill(null), marks: { [d.a]: 'X', [d.b]: 'O' } }),
    view: (d) => {
      const s = d.state;
      const buttons = s.board.map((v, i) => btn(`g:duel:${d.id}:play:${i}`, { emoji: v === 'X' ? '❌' : v === 'O' ? '⭕' : undefined, style: v ? (v === 'X' ? ButtonStyle.Danger : ButtonStyle.Primary) : ButtonStyle.Secondary, disabled: !!v || d.over }));
      return { text: `❌ ${tag(d, d.a)}  contre  ⭕ ${tag(d, d.b)}`, rows: rows(buttons, 3) };
    },
    play: (d, userId, arg) => {
      const s = d.state;
      const i = Number(arg);
      if (s.board[i]) return 'Case déjà prise.';
      s.board[i] = s.marks[userId];
      const w = winner3(s.board);
      if (w) d.winner = userId;
      else if (s.board.every(Boolean)) d.draw = true;
      else d.turn = other(d, userId);
      return null;
    },
    ai: (d) => {
      const s = d.state;
      if (Math.random() < 0.25) return pick(s.board.map((v, i) => (v ? null : i)).filter((i) => i !== null));
      return minimax([...s.board], s.marks[d.botId], s.marks[d.botId]).move;
    },
  },

  puissance4: {
    name: 'Puissance 4', emoji: '🔴',
    init: (d) => ({ grid: Array.from({ length: P4_H }, () => Array(P4_W).fill(null)), marks: { [d.a]: 'R', [d.b]: 'J' } }),
    view: (d) => {
      const s = d.state;
      const art = s.grid.map((r) => r.map((v) => (v === 'R' ? '🔴' : v === 'J' ? '🟡' : '⚫')).join('')).join('\n');
      const buttons = Array.from({ length: P4_W }, (_, c) => btn(`g:duel:${d.id}:play:${c}`, { label: String(c + 1), style: ButtonStyle.Primary, disabled: d.over || !!s.grid[0][c] }));
      return { text: `🔴 ${tag(d, d.a)}  contre  🟡 ${tag(d, d.b)}\n\n1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣\n${art}`, rows: rows(buttons, 4) };
    },
    play: (d, userId, arg) => {
      const s = d.state;
      if (!p4Drop(s.grid, Number(arg), s.marks[userId])) return 'Colonne pleine.';
      if (p4Winner(s.grid)) d.winner = userId;
      else if (s.grid[0].every(Boolean)) d.draw = true;
      else d.turn = other(d, userId);
      return null;
    },
    ai: (d) => {
      const s = d.state;
      const me = s.marks[d.botId];
      const them = me === 'R' ? 'J' : 'R';
      const free = [...Array(P4_W).keys()].filter((c) => !s.grid[0][c]);
      const wins = (v) => free.find((c) => { const g = s.grid.map((r) => [...r]); p4Drop(g, c, v); return p4Winner(g) === v; });
      const safe = free.filter((c) => { const g = s.grid.map((r) => [...r]); p4Drop(g, c, me); return !free.some((c2) => { const g2 = g.map((r) => [...r]); return p4Drop(g2, c2, them) && p4Winner(g2) === them; }); });
      return wins(me) ?? wins(them) ?? pick(safe.length ? safe.sort((x, y) => Math.abs(3 - x) - Math.abs(3 - y)).slice(0, 3) : free);
    },
  },

  navale: {
    name: 'Bataille navale', emoji: '🚢',
    init: (d) => ({ fleets: { [d.a]: placeFleet(), [d.b]: placeFleet() }, shots: { [d.a]: [], [d.b]: [] }, last: null }),
    view: (d) => {
      const s = d.state;
      const shooter = d.over ? d.winner ?? d.a : d.turn;
      const target = other(d, shooter);
      const buttons = Array.from({ length: 25 }, (_, i) => {
        const shot = s.shots[shooter].includes(i);
        const hit = shot && s.fleets[target].includes(i);
        const reveal = d.over && !shot && s.fleets[target].includes(i);
        return btn(`g:duel:${d.id}:play:${i}`, { emoji: hit ? '💥' : shot ? '🌊' : reveal ? '🚢' : undefined, style: hit ? ButtonStyle.Danger : shot ? ButtonStyle.Primary : ButtonStyle.Secondary, disabled: shot || d.over });
      });
      const left = (id) => s.fleets[id].filter((c) => !s.shots[other(d, id)].includes(c)).length;
      return {
        text: `🚢 Flotte de ${tag(d, d.a)} : **${left(d.a)}/7** cases intactes\n🚢 Flotte de ${tag(d, d.b)} : **${left(d.b)}/7** cases intactes\n\nLa grille montre la mer de ${tag(d, target)} (navires de 3, 2 et 2 cases). Touché = tu rejoues.${s.last ? `\n-# ${s.last}` : ''}`,
        rows: rows(buttons, 5),
        noForfeit: true,
      };
    },
    play: (d, userId, arg) => {
      const s = d.state;
      const i = Number(arg);
      if (s.shots[userId].includes(i)) return 'Déjà tiré ici.';
      s.shots[userId].push(i);
      const target = other(d, userId);
      const hit = s.fleets[target].includes(i);
      s.last = `${hit ? '💥 Touché' : '🌊 À l’eau'} en ${'ABCDE'[i % 5]}${Math.floor(i / 5) + 1}`;
      if (s.fleets[target].every((c) => s.shots[userId].includes(c))) d.winner = userId;
      else if (!hit) d.turn = target;
      return null;
    },
    ai: (d) => {
      const s = d.state;
      const mine = s.shots[d.botId];
      const target = s.fleets[other(d, d.botId)];
      const hits = mine.filter((c) => target.includes(c));
      const free = [...Array(25).keys()].filter((c) => !mine.includes(c));
      const near = hits.flatMap((c) => [c - 5, c + 5, c % 5 ? c - 1 : -1, c % 5 < 4 ? c + 1 : -1]).filter((c) => free.includes(c));
      return near.length ? pick(near) : pick(free);
    },
  },

  pfc: {
    name: 'Pierre-feuille-ciseaux', emoji: '✂️', simultaneous: true,
    init: () => ({ round: 1, score: {}, picks: {}, log: [] }),
    view: (d) => {
      const s = d.state;
      const status = (id) => (s.picks[id] ? '✅ a choisi' : '⏳ réfléchit');
      const buttons = Object.entries(PFC).map(([k, e]) => btn(`g:duel:${d.id}:play:${k}`, { emoji: e, label: k[0].toUpperCase() + k.slice(1), style: ButtonStyle.Primary, disabled: d.over }));
      return {
        text: `Premier à **2 manches**.\n${tag(d, d.a)} **${s.score[d.a] ?? 0}** · **${s.score[d.b] ?? 0}** ${tag(d, d.b)}\n\n${d.over ? '' : `Manche ${s.round} : ${tag(d, d.a)} ${status(d.a)} · ${tag(d, d.b)} ${status(d.b)}`}${s.log.length ? `\n${s.log.slice(-3).map((l) => `-# ${l}`).join('\n')}` : ''}`,
        rows: [new ActionRowBuilder().addComponents(buttons)],
      };
    },
    play: (d, userId, arg) => {
      const s = d.state;
      if (s.picks[userId]) return 'Tu as déjà choisi pour cette manche.';
      s.picks[userId] = arg;
      if (!s.picks[d.a] || !s.picks[d.b]) return null;
      const [x, y] = [s.picks[d.a], s.picks[d.b]];
      const w = x === y ? null : BEATS[x] === y ? d.a : d.b;
      if (w) s.score[w] = (s.score[w] ?? 0) + 1;
      s.log.push(`Manche ${s.round} : ${PFC[x]} contre ${PFC[y]} → ${w ? `point pour ${w === d.botId ? 'le bot' : `<@${w}>`}` : 'égalité'}`);
      s.picks = {};
      s.round += 1;
      if ((s.score[w] ?? 0) >= 2) d.winner = w;
      return null;
    },
    ai: () => pick(Object.keys(PFC)),
    private: true,
  },

  allumettes: {
    name: 'Allumettes', emoji: '🔥',
    init: () => ({ left: 21, log: [] }),
    view: (d) => {
      const s = d.state;
      const sticks = '🪵'.repeat(s.left) || '—';
      const buttons = [1, 2, 3].map((n) => btn(`g:duel:${d.id}:play:${n}`, { label: `Prendre ${n}`, style: ButtonStyle.Primary, disabled: d.over || n > s.left }));
      return { text: `Chacun prend **1, 2 ou 3** allumettes. **Celui qui prend la dernière perd.**\n\n${sticks}\n**${s.left}** restante(s)${s.log.length ? `\n-# ${s.log.slice(-2).join(' · ')}` : ''}`, rows: [new ActionRowBuilder().addComponents(buttons)] };
    },
    play: (d, userId, arg) => {
      const s = d.state;
      const n = Number(arg);
      if (n < 1 || n > 3 || n > s.left) return 'Pas possible.';
      s.left -= n;
      s.log.push(`${userId === d.botId ? 'le bot' : `<@${userId}>`} prend ${n}`);
      if (s.left === 0) d.winner = other(d, userId);
      else d.turn = other(d, userId);
      return null;
    },
    ai: (d) => {
      const r = (d.state.left - 1) % 4;
      return r === 0 ? 1 + Math.floor(Math.random() * Math.min(3, d.state.left)) : r;
    },
  },

  memory: {
    name: 'Memory', emoji: '🧠',
    init: () => ({ cards: shuffle([...MEMORY, ...MEMORY]), found: [], open: [], pairs: {}, hideAt: 0 }),
    view: (d) => {
      const s = d.state;
      const buttons = s.cards.map((e, i) => {
        const shown = s.found.includes(i) || s.open.includes(i) || d.over;
        return btn(`g:duel:${d.id}:play:${i}`, { emoji: shown ? e : '❔', style: s.found.includes(i) ? ButtonStyle.Success : s.open.includes(i) ? ButtonStyle.Primary : ButtonStyle.Secondary, disabled: shown });
      });
      return { text: `Retourne deux cartes : une paire = un point et tu rejoues.\n${tag(d, d.a)} **${s.pairs[d.a] ?? 0}** · **${s.pairs[d.b] ?? 0}** ${tag(d, d.b)}`, rows: rows(buttons, 4) };
    },
    play: (d, userId, arg) => {
      const s = d.state;
      const i = Number(arg);
      if (s.hideAt) return 'Attends que les cartes se retournent.';
      if (s.found.includes(i) || s.open.includes(i)) return 'Carte déjà retournée.';
      s.open.push(i);
      if (s.open.length < 2) return null;
      const [x, y] = s.open;
      if (s.cards[x] === s.cards[y]) {
        s.found.push(x, y);
        s.open = [];
        s.pairs[userId] = (s.pairs[userId] ?? 0) + 1;
        if (s.found.length === s.cards.length) {
          const pa = s.pairs[d.a] ?? 0;
          const pb = s.pairs[d.b] ?? 0;
          if (pa === pb) d.draw = true;
          else d.winner = pa > pb ? d.a : d.b;
        }
      } else {
        s.hideAt = Date.now() + speed.hide; // les deux cartes restent visibles un instant
        d.turn = other(d, userId);
      }
      return null;
    },
    settle: (d) => {
      if (d.state.hideAt && Date.now() >= d.state.hideAt) {
        d.state.hideAt = 0;
        d.state.open = [];
        return true;
      }
      return false;
    },
    ai: (d) => {
      const s = d.state;
      const hidden = s.cards.map((_, i) => i).filter((i) => !s.found.includes(i) && !s.open.includes(i));
      // Le bot a une mémoire de poisson rouge : il retrouve parfois la paire
      if (s.open.length === 1 && Math.random() < 0.45) {
        const twin = hidden.find((i) => s.cards[i] === s.cards[s.open[0]]);
        if (twin !== undefined) return twin;
      }
      return pick(hidden);
    },
  },

  abordage: {
    name: 'Abordage de navires', emoji: '🏴‍☠️',
    init: (d) => ({ hp: { [d.a]: 30, [d.b]: 30 }, repairs: { [d.a]: 2, [d.b]: 2 }, log: [] }),
    view: (d) => {
      const s = d.state;
      const bar = (hp) => `${'🟥'.repeat(Math.ceil(hp / 3))}${'⬛'.repeat(10 - Math.ceil(hp / 3))} ${hp}/30`;
      const me = d.turn;
      const enemy = other(d, me);
      const buttons = [
        btn(`g:duel:${d.id}:play:canon`, { emoji: '💣', label: 'Canon (sûr)', style: ButtonStyle.Primary, disabled: d.over }),
        btn(`g:duel:${d.id}:play:bordee`, { emoji: '🔥', label: 'Bordée (risqué)', style: ButtonStyle.Danger, disabled: d.over }),
        btn(`g:duel:${d.id}:play:reparer`, { emoji: '🔧', label: `Réparer (${s.repairs[me] ?? 0})`, style: ButtonStyle.Success, disabled: d.over || !(s.repairs[me] > 0) }),
        btn(`g:duel:${d.id}:play:aborder`, { emoji: '⚔️', label: 'Aborder', style: ButtonStyle.Secondary, disabled: d.over || s.hp[enemy] > 10 }),
      ];
      return {
        text: `⛵ ${tag(d, d.a)}\n${bar(s.hp[d.a])}\n⛵ ${tag(d, d.b)}\n${bar(s.hp[d.b])}\n\n-# Canon : 80 % pour 3-6 · Bordée : 45 % pour 7-12 · Réparer : +5 (2 fois) · Aborder (coque adverse ≤ 10) : une chance sur deux de gagner, sinon -6\n${s.log.slice(-3).map((l) => `> ${l}`).join('\n')}`,
        rows: [new ActionRowBuilder().addComponents(buttons)],
      };
    },
    play: (d, userId, arg) => {
      const s = d.state;
      const enemy = other(d, userId);
      const who = userId === d.botId ? 'Le bot' : `<@${userId}>`;
      const roll = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
      if (arg === 'canon') {
        const dmg = Math.random() < 0.8 ? roll(3, 6) : 0;
        s.hp[enemy] = Math.max(0, s.hp[enemy] - dmg);
        s.log.push(dmg ? `💣 ${who} touche au canon : -${dmg}` : `💣 ${who} rate son tir`);
      } else if (arg === 'bordee') {
        const dmg = Math.random() < 0.45 ? roll(7, 12) : 0;
        s.hp[enemy] = Math.max(0, s.hp[enemy] - dmg);
        s.log.push(dmg ? `🔥 Bordée de ${who} : -${dmg} !` : `🔥 La bordée de ${who} finit dans l’eau`);
      } else if (arg === 'reparer') {
        if (!(s.repairs[userId] > 0)) return 'Plus de réparations.';
        s.repairs[userId] -= 1;
        s.hp[userId] = Math.min(30, s.hp[userId] + 5);
        s.log.push(`🔧 ${who} répare sa coque : +5`);
      } else if (arg === 'aborder') {
        if (s.hp[enemy] > 10) return 'Sa coque est encore trop solide.';
        if (Math.random() < 0.5) { s.hp[enemy] = 0; s.log.push(`⚔️ ${who} prend le navire à l’abordage !`); } else { s.hp[userId] = Math.max(0, s.hp[userId] - 6); s.log.push(`⚔️ L’abordage de ${who} est repoussé : -6`); }
      } else return 'Action inconnue.';
      if (s.hp[enemy] <= 0) d.winner = userId;
      else if (s.hp[userId] <= 0) d.winner = enemy;
      else d.turn = enemy;
      return null;
    },
    ai: (d) => {
      const s = d.state;
      const enemy = other(d, d.botId);
      if (s.hp[enemy] <= 10 && Math.random() < 0.6) return 'aborder';
      if (s.hp[d.botId] <= 12 && s.repairs[d.botId] > 0) return 'reparer';
      return Math.random() < 0.6 ? 'canon' : 'bordee';
    },
  },

  rimes: {
    name: 'Duel de rimes', emoji: '🎤', simultaneous: true, noBot: true,
    init: () => ({ theme: pick(RHYME_THEMES), texts: {}, verdict: null }),
    view: (d) => {
      const s = d.state;
      const status = (id) => (s.texts[id] ? '✅ a rendu sa rime' : '✍️ écrit…');
      const body = s.verdict
        ? `**Thème : ${s.theme}**\n\n${[d.a, d.b].map((id) => `${tag(d, id)} · **${s.verdict.notes?.[id] ?? '?'}/10**\n> ${s.texts[id] ?? '(rien)'}`).join('\n\n')}\n\n🎙️ *${s.verdict.avis ?? ''}*`
        : `**Thème : ${s.theme}**\nÉcrivez 2 à 4 lignes qui riment. L’IA note la rime, le flow et l’originalité.\n\n${tag(d, d.a)} ${status(d.a)} · ${tag(d, d.b)} ${status(d.b)}`;
      return { text: body, rows: d.over ? [] : [new ActionRowBuilder().addComponents(btn(`g:duel:${d.id}:write`, { emoji: '✍️', label: 'Écrire ma rime', style: ButtonStyle.Primary }))] };
    },
    play: () => null,
  },
};

// =====================================================================
// Défi, mises, tours
// =====================================================================

function duelEmbed(d) {
  const g = DUEL_GAMES[d.kind];
  const e = new EmbedBuilder().setColor(0xc9a978).setTitle(`${g.emoji} ${g.name}${d.bet ? ` · mise 🪙 ${fmt(d.bet)}` : ''}`);
  if (d.phase === 'invite') {
    return {
      embeds: [e.setDescription(`${tag(d, d.a)} ${d.b ? `défie ${tag(d, d.b)}` : 'lance un défi à tout le salon'} !${d.bet ? `\nChacun mise **🪙 ${fmt(d.bet)}** : le gagnant emporte **🪙 ${fmt(d.bet * 2 * 0.95)}**.` : ''}\n-# Le défi expire <t:${Math.round(d.inviteEnds / 1000)}:R>.`)],
      components: [new ActionRowBuilder().addComponents(
        btn(`g:duel:${d.id}:accept`, { emoji: '⚔️', label: 'Accepter', style: ButtonStyle.Success }),
        btn(`g:duel:${d.id}:refuse`, { label: d.b ? 'Refuser' : 'Annuler', style: ButtonStyle.Secondary }),
      )],
    };
  }
  const v = g.view(d);
  let footer;
  if (d.over) {
    footer = d.winner ? `🏆 Victoire de ${tag(d, d.winner)}${d.payout ? ` · +🪙 ${fmt(d.payout)}` : ''}${d.reason ? ` (${d.reason})` : ''}` : d.draw ? `🤝 Égalité${d.bet ? ' · mises rendues' : ''}` : '⏹️ Partie annulée';
  } else if (g.simultaneous) footer = `⏳ Chacun joue de son côté · fin <t:${Math.round(d.deadline / 1000)}:R>`;
  else footer = `👉 À ${tag(d, d.turn)} de jouer · <t:${Math.round(d.deadline / 1000)}:R>`;
  const components = [...v.rows];
  if (!d.over && !v.noForfeit && components.length < 5) components.push(new ActionRowBuilder().addComponents(btn(`g:duel:${d.id}:forfeit`, { emoji: '🏳️', label: 'Abandonner', style: ButtonStyle.Secondary })));
  return { embeds: [e.setDescription(`${v.text}\n\n${footer}`)], components: components.slice(0, 5) };
}

/** Lance un défi. opponent : un membre, null (tout le salon) ou le bot. */
export async function startDuel(interaction, kind, { opponent = null, bet = 0 } = {}) {
  const g = DUEL_GAMES[kind];
  const botId = interaction.client.user.id;
  const vsBot = opponent?.id === botId;
  if (opponent?.bot && !vsBot) return interaction.reply({ content: 'Choisis un membre (ou moi, le bot).', ...PRIVATE });
  if (opponent?.id === interaction.user.id) return interaction.reply({ content: 'Tu ne peux pas te défier toi-même 😄', ...PRIVATE });
  if (vsBot && g.noBot) return interaction.reply({ content: 'Ce duel se joue contre un membre.', ...PRIVATE });
  bet = vsBot ? 0 : Math.max(0, Math.min(MAX_BET, Math.floor(bet || 0)));
  if (bet && (await goldOf(interaction.guildId, interaction.user.id)) < bet) return interaction.reply({ content: `Il te faut 🪙 ${fmt(bet)} pour miser.`, ...PRIVATE });
  const channel = await gameChannel(interaction);
  const d = { id: shortId(), kind, a: interaction.user.id, b: opponent?.id ?? null, botId, bet, guildId: interaction.guildId, phase: 'invite', inviteEnds: Date.now() + 5 * 60_000, turn: null, over: false };
  duels.set(d.id, d);
  if (vsBot) {
    d.phase = 'play';
    begin(d);
  }
  d.message = await channel.send({ ...duelEmbed(d), content: d.b && !vsBot ? `<@${d.b}>` : undefined, allowedMentions: { users: d.b && !vsBot ? [d.b] : [] } });
  registerGame({ id: `duel-${d.id}`, kind: g.name, emoji: g.emoji, info: () => ({ channelId: channel.id, players: [d.a, d.b].filter(Boolean) }), stop: () => end(d, { cancel: true }) });
  if (vsBot) botTurns(d).catch(() => {});
  if (channel.id !== interaction.channelId) return interaction.reply({ content: `${g.emoji} Le duel t’attend dans ${channel}.`, ...PRIVATE });
  return interaction.reply({ content: `${g.emoji} Défi lancé !`, ...PRIVATE });
}

function begin(d) {
  const g = DUEL_GAMES[d.kind];
  d.state = g.init(d);
  d.turn = Math.random() < 0.5 ? d.a : d.b;
  if (d.kind === 'morpion' || d.kind === 'puissance4') {
    // Celui qui commence a les croix / le rouge
    d.state.marks = d.kind === 'morpion' ? { [d.turn]: 'X', [other(d, d.turn)]: 'O' } : { [d.turn]: 'R', [other(d, d.turn)]: 'J' };
    if (d.turn !== d.a) [d.a, d.b] = [d.b, d.a];
  }
  d.deadline = Date.now() + (d.kind === 'rimes' ? 150_000 : TURN_MS);
}

async function end(d, { cancel = false, reason = null } = {}) {
  if (d.over) return;
  d.over = true;
  d.reason = reason;
  duels.delete(d.id);
  unregisterGame(`duel-${d.id}`);
  const g = DUEL_GAMES[d.kind];
  const humans = [d.a, d.b].filter((id) => id && id !== d.botId);
  if (d.bet && d.escrow) {
    if (d.winner && !cancel) {
      const pot = d.bet * 2;
      d.payout = Math.round(pot * 0.95);
      await addGold(d.guildId, d.winner, d.payout, `Duel gagné : ${g.name}`);
      await addToChest(d.guildId, pot - d.payout);
    } else {
      for (const id of humans) await addGold(d.guildId, id, d.bet, `Duel ${cancel ? 'annulé' : 'nul'} : mise rendue`);
    }
  }
  if (!cancel && d.phase === 'play') {
    await playedGame(d.guildId, humans);
    if (d.winner && d.winner !== d.botId) {
      const won = await rewardWin(d.guildId, d.winner, d.b === d.botId || d.a === d.botId ? 25 : 50, `Victoire : ${g.name}`);
      if (!d.bet && won) d.payout = won;
    }
  }
}

async function refresh(d, interaction = null) {
  const payload = duelEmbed(d);
  if (interaction && !interaction.replied && !interaction.deferred) return interaction.update(payload).catch(() => d.message?.edit(payload).catch(() => {}));
  return d.message?.edit(payload).catch(() => {});
}

/** Tour du bot : il réfléchit un peu, puis joue. */
async function botTurns(d) {
  const g = DUEL_GAMES[d.kind];
  if (d.a !== d.botId && d.b !== d.botId) return;
  while (!d.over && d.phase === 'play' && (g.simultaneous ? !(d.state.picks ?? {})[d.botId] : d.turn === d.botId)) {
    await new Promise((r) => setTimeout(r, g.simultaneous ? speed.bot / 3 : speed.bot));
    if (g.settle?.(d)) await refresh(d);
    const err = g.play(d, d.botId, g.ai(d));
    if (err) break;
    d.deadline = Date.now() + TURN_MS;
    if (d.winner || d.draw) await end(d);
    await refresh(d);
    if (d.kind === 'memory' && d.state.hideAt) {
      await new Promise((r) => setTimeout(r, speed.hide + 100));
      g.settle(d);
      await refresh(d);
    }
  }
}

export async function handleDuelComponent(interaction) {
  const [, , id, action, arg] = interaction.customId.split(':');
  const d = duels.get(id);
  if (!d) return interaction.reply({ content: 'Ce duel est terminé.', ...PRIVATE });
  const g = DUEL_GAMES[d.kind];
  const userId = interaction.user.id;

  if (action === 'refuse') {
    if (userId !== d.a && userId !== d.b) return interaction.reply({ content: 'Ce défi ne te concerne pas.', ...PRIVATE });
    await end(d, { cancel: true });
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x6b5a45).setDescription(`${g.emoji} ${userId === d.a ? 'Défi annulé.' : `${tag(d, d.b)} refuse le défi.`}`)], components: [] });
  }
  if (action === 'accept') {
    if (d.phase !== 'invite') return interaction.reply({ content: 'Le duel a déjà commencé.', ...PRIVATE });
    if (userId === d.a) return interaction.reply({ content: 'Attends que quelqu’un accepte ton défi.', ...PRIVATE });
    if (d.b && userId !== d.b) return interaction.reply({ content: 'Ce défi est pour quelqu’un d’autre.', ...PRIVATE });
    if (d.bet) {
      const [ga, gb] = await Promise.all([goldOf(d.guildId, d.a), goldOf(d.guildId, userId)]);
      if (gb < d.bet) return interaction.reply({ content: `Il te faut 🪙 ${fmt(d.bet)} pour suivre la mise.`, ...PRIVATE });
      if (ga < d.bet) return interaction.reply({ content: 'Celui qui a lancé le défi n’a plus assez d’or.', ...PRIVATE });
      await addGold(d.guildId, d.a, -d.bet, `Mise : ${g.name}`);
      await addGold(d.guildId, userId, -d.bet, `Mise : ${g.name}`);
      d.escrow = true;
    }
    d.b = userId;
    d.phase = 'play';
    begin(d);
    await interaction.update(duelEmbed(d));
    return botTurns(d);
  }
  if (d.phase !== 'play' || d.over) return interaction.reply({ content: 'La partie n’a pas commencé.', ...PRIVATE });
  if (userId !== d.a && userId !== d.b) return interaction.reply({ content: 'Tu ne joues pas dans ce duel.', ...PRIVATE });

  if (action === 'forfeit') {
    d.winner = other(d, userId);
    await end(d, { reason: 'abandon' });
    return refresh(d, interaction);
  }
  if (action === 'write') {
    if (d.state.texts[userId]) return interaction.reply({ content: 'Ta rime est déjà rendue.', ...PRIVATE });
    return interaction.showModal(buildModal(`g:duel:${d.id}:rhyme`, `🎤 Thème : ${d.state.theme}`.slice(0, 45), [f.para('rime', 'Ta rime (2 à 4 lignes)', { req: true, max: 400 })]));
  }
  if (action === 'rhyme') {
    const { values, error } = await readModal(interaction, [f.para('rime', 'Ta rime', { req: true, max: 400 })]);
    if (error) return interaction.reply({ content: error, ...PRIVATE });
    d.state.texts[userId] = values.rime.trim();
    await interaction.reply({ content: '🎤 Rime rendue, place au jury !', ...PRIVATE });
    if (d.state.texts[d.a] && d.state.texts[d.b]) await judgeRhymes(d);
    return refresh(d);
  }
  if (action === 'play') {
    if (g.settle?.(d)) await refresh(d);
    if (!g.simultaneous && userId !== d.turn) return interaction.reply({ content: 'Ce n’est pas ton tour.', ...PRIVATE });
    const err = g.play(d, userId, arg);
    if (err) return interaction.reply({ content: err, ...PRIVATE });
    d.deadline = Date.now() + TURN_MS;
    if (d.winner || d.draw) await end(d);
    await refresh(d, interaction);
    if (d.kind === 'memory' && d.state.hideAt) {
      setTimeout(async () => { if (g.settle(d)) await refresh(d); botTurns(d); }, speed.hide + 100);
      return undefined;
    }
    return botTurns(d);
  }
  return undefined;
}

async function judgeRhymes(d) {
  const s = d.state;
  try {
    const r = await chatJson({
      tag: 'jeux',
      thinking: 'minimal',
      system: 'Tu es le jury d’un duel de rimes en français, bienveillant mais exigeant. Tu notes chaque texte sur 10 (rime, flow, originalité, respect du thème). Un texte vide, hors sujet ou insultant a une note basse.',
      prompt: `Thème : ${s.theme}\nTexte A :\n${s.texts[d.a]}\n\nTexte B :\n${s.texts[d.b]}`,
      schema: { type: 'object', properties: { noteA: { type: 'number' }, noteB: { type: 'number' }, avis: { type: 'string' } }, required: ['noteA', 'noteB', 'avis'] },
    });
    s.verdict = { notes: { [d.a]: Math.round(r.noteA * 10) / 10, [d.b]: Math.round(r.noteB * 10) / 10 }, avis: String(r.avis).slice(0, 300) };
  } catch {
    const na = Math.min(10, 3 + s.texts[d.a].split('\n').length * 1.5);
    const nb = Math.min(10, 3 + s.texts[d.b].split('\n').length * 1.5);
    s.verdict = { notes: { [d.a]: na, [d.b]: nb }, avis: 'Le jury a perdu sa voix : note au nombre de lignes.' };
  }
  const [na, nb] = [s.verdict.notes[d.a], s.verdict.notes[d.b]];
  if (na === nb) d.draw = true;
  else d.winner = na > nb ? d.a : d.b;
  await end(d);
}

// Tours trop longs : celui qui doit jouer perd (ou personne ne joue : annulé)
setInterval(async () => {
  const now = Date.now();
  for (const d of [...duels.values()]) {
    if (d.phase === 'invite' && now > d.inviteEnds) {
      await end(d, { cancel: true });
      await d.message?.edit({ embeds: [new EmbedBuilder().setColor(0x6b5a45).setDescription(`${DUEL_GAMES[d.kind].emoji} Défi expiré : personne n’a accepté.`)], components: [] }).catch(() => {});
    } else if (d.phase === 'play' && now > d.deadline) {
      const g = DUEL_GAMES[d.kind];
      if (g.simultaneous) {
        const done = d.kind === 'rimes' ? d.state.texts : d.state.picks;
        const played = [d.a, d.b].filter((id) => done?.[id]);
        if (played.length === 1) d.winner = played[0];
        await end(d, { cancel: played.length !== 1, reason: 'temps écoulé' });
      } else {
        d.winner = other(d, d.turn);
        await end(d, { reason: 'temps écoulé' });
      }
      await refresh(d);
    } else if (d.kind === 'memory' && DUEL_GAMES.memory.settle(d)) await refresh(d);
  }
}, 5_000).unref();

export const _test = { speed, duels, duelEmbed, begin, end, winner3, p4Winner, placeFleet, judgeRhymes };
