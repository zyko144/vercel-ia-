// Les jeux de l'arcade en plus du dessin, du morpion et du puissance 4 :
// - duels à deux (contre un joueur ou le bot) : bataille navale, pierre-feuille-ciseaux, allumettes, memory,
//   abordage de navires, duel de rimes (jugé par l'IA) ; même moteur que les duels de Discord (games/duels.js) ;
// - jeux de groupe : quiz (questions de l'IA), pendu, devine le nombre ;
// - jeux solo, chacun de son côté : démineur, et la taverne en pièces d'or (pile ou face, dés, roue,
//   machine à sous, blackjack) ;
// Les jeux de soirée (loup-garou, blind test, petit bac…) sont dans party*.js.
import { chatJson } from '../ai/gemini.js';
import { DUEL_GAMES } from '../games/duels.js';
import { _test as defis } from '../games/defis.js';
import { handValue, slotPayout, WHEEL, _test as tripot } from '../games/tripot.js';
import { addGold, addToChest, goldOf } from '../features/economy.js';
import { playedGame, questProgress, rewardWin } from '../features/treasury.js';

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const BOT = 'bot';

export const DUEL_KINDS = {
  navale: 'Bataille navale', pfc: 'Pierre-feuille-ciseaux', allumettes: 'Allumettes', memory: 'Memory', abordage: 'Abordage de navires', rimes: 'Duel de rimes',
};

/** Branche les jeux dans l'arcade. h : { say, bump, nameOf, reward, client } */
export function registerArcadeGames(GAMES, h) {
  const other = (d, id) => (id === d.a ? d.b : d.a);

  // ===================== Duels =====================
  const botPlays = (r, g) => {
    const d = g.d;
    const G = DUEL_GAMES[g.game];
    if (d.over || !(d.a === BOT || d.b === BOT) || !G.ai) return;
    const waiting = G.simultaneous ? !(d.state.picks ?? {})[BOT] : d.turn === BOT;
    if (!waiting || g.botAt) return;
    g.botAt = Date.now() + 800; // le bot « réfléchit » un instant (joué par le minuteur)
  };
  const endDuel = (r, g) => {
    const d = g.d;
    if (!(d.winner || d.draw) || d.over) return;
    d.over = true;
    h.say(r, d.winner ? `🏆 ${d.winner === BOT ? 'Le bot' : h.nameOf(r, d.winner)} gagne ${DUEL_KINDS[g.game].toLowerCase()} !` : '🤝 Égalité !', 'good');
    const humans = [d.a, d.b].filter((x) => x && x !== BOT);
    if (d.winner && d.winner !== BOT) h.reward(r, d.winner, humans.length > 1 ? 40 : 20, `Arcade : ${DUEL_KINDS[g.game]}`, humans, { solo: humans.length < 2 });
    else playedGame(r.guildId, humans).catch(() => {});
  };
  const begin = (g) => {
    const d = g.d;
    d.state = DUEL_GAMES[g.game].init(d);
    d.turn = Math.random() < 0.5 ? d.a : d.b;
    d.deadline = Date.now() + (g.game === 'rimes' ? 150_000 : 120_000);
    g.phase = 'play';
  };
  // Ce que chacun voit (jamais la flotte adverse, les choix en cours ni les cartes cachées)
  const duelView = (g, me) => {
    const d = g.d;
    const s = d.state;
    const base = { kind: 'duel', game: g.game, label: DUEL_KINDS[g.game], phase: g.phase, a: d.a, b: d.b, turn: d.turn, winner: d.winner ?? null, draw: !!d.draw, over: !!d.over, deadline: d.deadline ?? null, you: me === d.a ? 'a' : me === d.b ? 'b' : null };
    if (!s) return base;
    if (g.game === 'navale') {
      const mine = me === d.a || me === d.b ? me : d.a;
      const foe = other(d, mine);
      const board = (owner, shooter, reveal) => Array.from({ length: 25 }, (_, i) => {
        const shot = s.shots[shooter]?.includes(i);
        const ship = s.fleets[owner].includes(i);
        return shot ? (ship ? 'hit' : 'miss') : ship && (reveal || d.over) ? 'ship' : '';
      });
      return { ...base, mine: board(mine, foe, me === mine), target: board(foe, mine, false), last: s.last, left: { [d.a]: s.fleets[d.a].filter((c) => !s.shots[d.b].includes(c)).length, [d.b]: s.fleets[d.b].filter((c) => !s.shots[d.a].includes(c)).length } };
    }
    if (g.game === 'pfc') return { ...base, score: s.score, round: s.round, picked: { a: !!s.picks[d.a], b: !!s.picks[d.b] }, log: s.log.slice(-4) };
    if (g.game === 'allumettes') return { ...base, left: s.left, log: s.log.slice(-4) };
    if (g.game === 'memory') return { ...base, cards: s.cards.map((c, i) => (s.found.includes(i) || s.open.includes(i) || d.over ? c : null)), found: s.found, pairs: s.pairs };
    if (g.game === 'abordage') return { ...base, hp: s.hp, repairs: s.repairs, log: s.log.slice(-5) };
    if (g.game === 'rimes') return { ...base, theme: s.theme, sent: { a: !!s.texts[d.a], b: !!s.texts[d.b] }, verdict: s.verdict, texts: s.verdict ? s.texts : null };
    return base;
  };

  GAMES.duel = {
    min: 1,
    label: (g) => DUEL_KINDS[g.game],
    start(r, host, body) {
      const game = DUEL_KINDS[body.duel] ? body.duel : 'navale';
      return { kind: 'duel', game, phase: 'wait', d: { id: Math.random().toString(36).slice(2, 8), a: host, b: null, botId: BOT, state: null, turn: null, over: false } };
    },
    view: duelView,
    over: (g) => g.d.over,
    act(r, g, me, body) {
      const d = g.d;
      const G = DUEL_GAMES[g.game];
      if (body.type === 'sit' && g.phase === 'wait' && me !== d.a) { d.b = me; begin(g); h.say(r, `⚔️ ${h.nameOf(r, me)} relève le défi !`); botPlays(r, g); return true; }
      if (body.type === 'bot' && g.phase === 'wait' && me === d.a && g.game !== 'rimes') { d.b = BOT; begin(g); botPlays(r, g); return true; }
      if (g.phase !== 'play' || d.over || (me !== d.a && me !== d.b)) return false;
      if (body.type === 'forfeit') { d.winner = other(d, me); endDuel(r, g); return true; }
      if (body.type === 'rhyme' && g.game === 'rimes') {
        const text = String(body.text ?? '').trim().slice(0, 400);
        if (!text || d.state.texts[me]) return false;
        d.state.texts[me] = text;
        if (d.state.texts[d.a] && d.state.texts[d.b]) judge(r, g);
        return true;
      }
      if (body.type !== 'play') return false;
      if (G.settle?.(d)) return true;
      if (!G.simultaneous && d.turn !== me) return false;
      const err = G.play(d, me, g.game === 'pfc' || g.game === 'abordage' ? String(body.arg) : Number(body.arg));
      if (err) return false;
      d.deadline = Date.now() + 120_000;
      endDuel(r, g);
      botPlays(r, g);
      return true;
    },
    tick(r, g) {
      const d = g.d;
      const G = DUEL_GAMES[g.game];
      let changed = false;
      if (g.phase === 'play' && !d.over && G.settle?.(d)) { changed = true; botPlays(r, g); }
      if (g.botAt && Date.now() > g.botAt && !d.over) {
        g.botAt = 0;
        if (!G.settle?.(d) && !d.state.hideAt) {
          G.play(d, BOT, G.ai(d));
          endDuel(r, g);
        }
        botPlays(r, g);
        changed = true;
      }
      if (g.phase === 'play' && !d.over && d.deadline && Date.now() > d.deadline) {
        if (G.simultaneous) {
          const done = g.game === 'rimes' ? d.state.texts : d.state.picks;
          const played = [d.a, d.b].filter((x) => done?.[x]);
          if (played.length === 1) d.winner = played[0]; else d.draw = true;
        } else d.winner = other(d, d.turn);
        endDuel(r, g);
        changed = true;
      }
      return changed;
    },
  };
  async function judge(r, g) {
    const d = g.d;
    const s = d.state;
    try {
      const out = await chatJson({
        tag: 'jeux', thinking: 'minimal',
        system: 'Tu es le jury d’un duel de rimes en français, bienveillant mais exigeant. Tu notes chaque texte sur 10 (rime, flow, originalité, thème).',
        prompt: `Thème : ${s.theme}\nTexte A :\n${s.texts[d.a]}\n\nTexte B :\n${s.texts[d.b]}`,
        schema: { type: 'object', properties: { noteA: { type: 'number' }, noteB: { type: 'number' }, avis: { type: 'string' } }, required: ['noteA', 'noteB', 'avis'] },
      });
      s.verdict = { [d.a]: Math.round(out.noteA * 10) / 10, [d.b]: Math.round(out.noteB * 10) / 10, avis: String(out.avis).slice(0, 300) };
    } catch {
      const score = (t) => Math.min(10, 3 + t.split('\n').length * 1.5);
      s.verdict = { [d.a]: score(s.texts[d.a]), [d.b]: score(s.texts[d.b]), avis: 'Le jury a perdu sa voix : note au nombre de lignes.' };
    }
    if (s.verdict[d.a] === s.verdict[d.b]) d.draw = true; else d.winner = s.verdict[d.a] > s.verdict[d.b] ? d.a : d.b;
    endDuel(r, g);
    h.bump(r);
  }

  // ===================== Quiz de groupe =====================
  GAMES.quiz = {
    min: 1,
    label: () => 'le quiz',
    start(r, host, body) {
      const g = { kind: 'quiz', phase: 'loading', theme: String(body.theme ?? '').slice(0, 60), questions: [], i: -1, answers: {}, scores: {}, endsAt: Date.now() + 20_000, first: null };
      const ready = (qs) => { if (g.phase !== 'loading') return; g.questions = qs?.length ? qs : shuffle(defis.FALLBACK_QUIZ).slice(0, 10); g.phase = 'answer'; g.endsAt = 0; h.bump(r); };
      defis.quizQuestions(g.theme, 10).then(ready).catch(() => ready(null));
      return g;
    },
    view(g, me) {
      const q = g.questions[g.i];
      return {
        kind: 'quiz', phase: g.phase, theme: g.theme, n: g.i + 1, total: g.questions.length, endsAt: g.endsAt, scores: g.scores,
        question: q ? q.question : null, choices: q ? q.choix : null, mine: g.answers[me] ?? null, answered: Object.keys(g.answers).length,
        right: g.phase === 'answer' && q ? q.bonne : null,
      };
    },
    act(r, g, me, body) {
      if (body.type !== 'answer' || g.phase !== 'question' || g.answers[me] !== undefined) return false;
      const i = Number(body.i);
      if (!(i >= 0 && i < 4)) return false;
      g.answers[me] = i;
      if (i === g.questions[g.i].bonne && !g.first) g.first = me;
      if ([...r.players.keys()].every((id) => g.answers[id] !== undefined)) g.endsAt = Date.now();
      return true;
    },
    tick(r, g) {
      // L'IA ne répond pas : on part avec les questions de secours
      if (g.phase === 'loading' && Date.now() > g.endsAt) { g.questions = shuffle(defis.FALLBACK_QUIZ).slice(0, 10); g.phase = 'answer'; g.endsAt = 0; }
      if (g.phase === 'loading' || Date.now() < g.endsAt) return false;
      if (g.phase === 'question') {
        const q = g.questions[g.i];
        for (const [id, a] of Object.entries(g.answers)) {
          g.scores[id] ??= 0;
          if (a === q.bonne) g.scores[id] += 1 + (id === g.first ? 1 : 0);
        }
        g.phase = 'answer';
        g.endsAt = Date.now() + 4000;
        return true;
      }
      // Question suivante, ou la fin
      if (g.i + 1 >= g.questions.length) {
        const podium = Object.entries(g.scores).sort((a, b) => b[1] - a[1]);
        r.game = { kind: 'fin', from: 'quiz', podium, at: Date.now() };
        h.say(r, podium[0] ? `🏆 ${h.nameOf(r, podium[0][0])} gagne le quiz !` : 'Quiz terminé.', 'good');
        h.reward(r, podium[0]?.[0], 60, 'Arcade : quiz', Object.keys(g.scores), { solo: Object.keys(g.scores).length < 2 });
        return true;
      }
      g.i += 1;
      g.answers = {};
      g.first = null;
      g.phase = 'question';
      g.endsAt = Date.now() + 15_000;
      return true;
    },
  };

  // ===================== Pendu (tous ensemble) =====================
  GAMES.pendu = {
    min: 1,
    label: () => 'le pendu',
    start() {
      const word = norm(pick(tripot.WORDS));
      return { kind: 'pendu', word, found: [' '], misses: [], winner: null, over: false, players: [] };
    },
    view: (g) => ({ kind: 'pendu', masked: [...g.word].map((c) => (g.found.includes(c) || g.over ? c : c === ' ' ? ' ' : '_')), misses: g.misses, max: 6, over: g.over, winner: g.winner, word: g.over ? g.word : null, found: g.found }),
    over: (g) => g.over,
    act(r, g, me, body) {
      if (body.type !== 'letter' || g.over) return false;
      const c = norm(String(body.letter ?? '')).slice(0, 1);
      if (!/[a-z]/.test(c) || g.found.includes(c) || g.misses.includes(c)) return false;
      if (!g.players.includes(me)) g.players.push(me);
      if (g.word.includes(c)) g.found.push(c); else g.misses.push(c);
      if ([...g.word].every((x) => g.found.includes(x))) {
        g.over = true;
        g.winner = me;
        h.say(r, `🎉 ${h.nameOf(r, me)} trouve la dernière lettre : ${g.word.toUpperCase()} !`, 'good');
        h.reward(r, me, 40, 'Arcade : pendu', g.players, { solo: g.players.length < 2 });
      } else if (g.misses.length >= 6) {
        g.over = true;
        h.say(r, `💀 Pendu ! Le mot était ${g.word.toUpperCase()}.`);
        playedGame(r.guildId, g.players).catch(() => {});
      }
      return true;
    },
  };

  // ===================== Devine le nombre =====================
  GAMES.nombre = {
    min: 1,
    label: () => 'devine le nombre',
    start: () => ({ kind: 'nombre', secret: 1 + Math.floor(Math.random() * 1000), tries: [], winner: null, over: false }),
    view: (g) => ({ kind: 'nombre', tries: g.tries.slice(-12), count: g.tries.length, over: g.over, winner: g.winner, secret: g.over ? g.secret : null }),
    over: (g) => g.over,
    act(r, g, me, body) {
      if (body.type !== 'guess' || g.over) return false;
      const n = Math.trunc(Number(body.n));
      if (!(n >= 1 && n <= 1000)) return false;
      g.tries.push({ who: me, n, hint: n === g.secret ? 'ok' : n < g.secret ? 'plus' : 'moins' });
      if (n === g.secret) {
        g.over = true;
        g.winner = me;
        h.say(r, `🎉 ${h.nameOf(r, me)} trouve ${g.secret} en ${g.tries.length} essais !`, 'good');
        const players = [...new Set(g.tries.map((t) => t.who))];
        h.reward(r, me, 40, 'Arcade : devine le nombre', players, { solo: players.length < 2 });
      }
      return true;
    },
  };
}

// =====================================================================
// Jeux solo : chacun sa partie (démineur) et la taverne en pièces d'or
// =====================================================================

const MAX_BET = 10_000;
function minesweeperNew(level) {
  const [size, mines] = { facile: [8, 8], moyen: [10, 15], difficile: [12, 26] }[level] ?? [10, 15];
  return { game: 'demineur', level, size, mines, cells: null, open: [], flags: [], over: false, won: false, startedAt: Date.now() };
}
function msPlace(s, safe) {
  const n = s.size * s.size;
  const around = (i) => { const x = i % s.size; const y = Math.floor(i / s.size); const out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx; const ny = y + dy; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < s.size && ny < s.size) out.push(ny * s.size + nx); } return out; };
  const forbidden = new Set([safe, ...around(safe)]);
  const mines = new Set(shuffle([...Array(n).keys()].filter((i) => !forbidden.has(i))).slice(0, s.mines));
  s.cells = Array.from({ length: n }, (_, i) => (mines.has(i) ? -1 : around(i).filter((j) => mines.has(j)).length));
  s.around = around;
}
function msReveal(s, i) {
  if (!s.cells) msPlace(s, i);
  const stack = [i];
  while (stack.length) {
    const c = stack.pop();
    if (s.open.includes(c) || s.flags.includes(c)) continue;
    s.open.push(c);
    if (s.cells[c] === -1) { s.over = true; return; }
    if (s.cells[c] === 0) stack.push(...s.around(c));
  }
  if (s.open.length === s.cells.length - s.mines) { s.over = true; s.won = true; }
}
const msView = (s) => ({
  game: 'demineur', level: s.level, size: s.size, mines: s.mines, over: s.over, won: s.won, flags: s.flags,
  cells: Array.from({ length: s.size * s.size }, (_, i) => (s.open.includes(i) || (s.over && s.cells?.[i] === -1) ? s.cells[i] : null)),
});

const deck = () => shuffle(['♠', '♥', '♦', '♣'].flatMap((c) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'].map((v) => `${v}${c}`)));

/** Une action d'un jeu solo. Renvoie { solo, message } (état à montrer au joueur). */
export async function soloAct(r, me, body, h) {
  r.solo ??= new Map();
  const cur = r.solo.get(me);
  const guildId = r.guildId;
  if (body.game === 'demineur') {
    if (body.action === 'new') { r.solo.set(me, minesweeperNew(body.level)); return { ok: true }; }
    if (cur?.game !== 'demineur' || cur.over) return { error: 'Lance une nouvelle partie.' };
    const i = Number(body.i);
    if (!(i >= 0 && i < cur.size * cur.size)) return { error: 'Case inconnue.' };
    if (body.action === 'flag') {
      if (cur.open.includes(i)) return { ok: true };
      cur.flags = cur.flags.includes(i) ? cur.flags.filter((x) => x !== i) : [...cur.flags, i];
      return { ok: true };
    }
    msReveal(cur, i);
    if (cur.over) {
      playedGame(guildId, me).catch(() => {});
      if (cur.won) {
        const won = guildId ? await rewardWin(guildId, me, { facile: 20, moyen: 40, difficile: 80 }[cur.level] ?? 40, 'Arcade : démineur').catch(() => 0) : 0;
        h.say(r, `💣 ${h.nameOf(r, me)} déjoue toutes les mines (${cur.level}) en ${Math.round((Date.now() - cur.startedAt) / 1000)} s !${won ? ` +🪙 ${won}` : ''}`, 'good');
      }
    }
    return { ok: true };
  }

  // Taverne : il faut un serveur (les pièces d'or sont celles du serveur)
  if (!guildId) return { error: 'Ouvre l’arcade depuis un serveur pour jouer en pièces d’or.' };
  const bet = Math.floor(Number(body.bet) || 0);
  const take = async (label) => {
    if (bet < 10 || bet > MAX_BET) return 'Mise entre 🪙 10 et 🪙 10 000.';
    if ((await goldOf(guildId, me)) < bet) return 'Pas assez d’or dans ta bourse.';
    await addGold(guildId, me, -bet, `Arcade : ${label}`);
    return null;
  };
  const settle = async (b, mult, label) => {
    const win = Math.floor(b * mult);
    if (win > 0) await addGold(guildId, me, win, `Arcade : ${label}${mult > 1 ? ' (gagné)' : ''}`);
    if (win < b) await addToChest(guildId, b - win);
    await playedGame(guildId, me);
    if (mult > 1) await questProgress(guildId, me, 'win').catch(() => {});
    if (mult >= 5) h.say(r, `💰 ${h.nameOf(r, me)} gagne 🪙 ${win.toLocaleString('fr-FR')} à la taverne !`, 'good');
    return { win, balance: await goldOf(guildId, me) };
  };
  if (body.game === 'pile') {
    const err = await take('pile ou face'); if (err) return { error: err };
    const got = Math.random() < 0.5 ? 'pile' : 'face';
    const s = await settle(bet, got === body.side ? 1.9 : 0, 'pile ou face');
    r.solo.set(me, { game: 'pile', got, side: body.side, bet, ...s, at: Date.now() });
    return { ok: true };
  }
  if (body.game === 'des') {
    const err = await take('dés'); if (err) return { error: err };
    const roll = () => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    const mine = roll(); const cap = roll();
    const a = mine[0] + mine[1]; const c = cap[0] + cap[1];
    const s = await settle(bet, a > c ? 1.9 : a === c ? 1 : 0, 'dés');
    r.solo.set(me, { game: 'des', mine, cap, bet, ...s, at: Date.now() });
    return { ok: true };
  }
  if (body.game === 'roue') {
    const err = await take('roue'); if (err) return { error: err };
    const i = Math.floor(Math.random() * WHEEL.length);
    const s = await settle(bet, WHEEL[i], 'roue');
    r.solo.set(me, { game: 'roue', index: i, mult: WHEEL[i], wheel: WHEEL, bet, ...s, at: Date.now() });
    return { ok: true };
  }
  if (body.game === 'machine') {
    const err = await take('machine à sous'); if (err) return { error: err };
    const REELS = ['🍒', '🍋', '🦜', '⚓', '💰', '💎', '🏴‍☠️'];
    const W = [30, 25, 18, 13, 8, 4, 2];
    const spin = () => { let x = Math.random() * 100; return REELS[W.findIndex((w) => (x -= w) < 0)]; };
    const line = [spin(), spin(), spin()];
    const mult = slotPayout(line);
    const s = await settle(bet, mult, 'machine à sous');
    r.solo.set(me, { game: 'machine', line, mult, bet, ...s, at: Date.now() });
    return { ok: true };
  }
  if (body.game === 'blackjack') {
    if (body.action === 'new') {
      const err = await take('blackjack'); if (err) return { error: err };
      const cards = deck();
      const t = { game: 'blackjack', bet, cards, hand: [cards.pop(), cards.pop()], dealer: [cards.pop(), cards.pop()], done: false };
      r.solo.set(me, t);
      if (handValue(t.hand) === 21) await bjFinish(t, settle);
      return { ok: true };
    }
    if (cur?.game !== 'blackjack' || cur.done) return { error: 'Lance une nouvelle main.' };
    if (body.action === 'hit') { cur.hand.push(cur.cards.pop()); if (handValue(cur.hand) >= 21) await bjFinish(cur, settle); }
    else if (body.action === 'double' && cur.hand.length === 2) {
      if ((await goldOf(guildId, me)) < cur.bet) return { error: 'Pas assez d’or pour doubler.' };
      await addGold(guildId, me, -cur.bet, 'Arcade : blackjack (doublé)');
      cur.bet *= 2;
      cur.hand.push(cur.cards.pop());
      await bjFinish(cur, settle);
    } else if (body.action === 'stand') await bjFinish(cur, settle);
    return { ok: true };
  }
  return { error: 'Jeu inconnu.' };
}
async function bjFinish(t, settle) {
  const me = handValue(t.hand);
  const natural = me === 21 && t.hand.length === 2;
  if (me <= 21 && !natural) while (handValue(t.dealer) < 17) t.dealer.push(t.cards.pop());
  const dv = handValue(t.dealer);
  const mult = me > 21 ? 0 : natural && !(dv === 21 && t.dealer.length === 2) ? 2.5 : dv > 21 || me > dv ? 2 : me === dv ? 1 : 0;
  Object.assign(t, await settle(t.bet, mult, 'blackjack'), { done: true, mult });
}
/** Ce que le joueur voit de sa partie solo. */
export function soloView(s) {
  if (!s) return null;
  if (s.game === 'demineur') return msView(s);
  if (s.game === 'blackjack') {
    const { cards, ...rest } = s;
    return { ...rest, dealer: s.done ? s.dealer : [s.dealer[0], '?'], handValue: handValue(s.hand), dealerValue: s.done ? handValue(s.dealer) : null };
  }
  return s;
}
export const soloGold = async (guildId, userId) => (guildId ? goldOf(guildId, userId).catch(() => null) : null);
