// L'arcade d'AI Vercel : des jeux multijoueurs dans une Activité Discord (ou un lien personnel).
// Une « salle » par salon Discord : tous ceux qui ouvrent l'arcade dans ce salon jouent ensemble.
// Jeux : Dessine et devine (façon Pictionary), Morpion, Puissance 4, les duels, la taverne (games.js)
// et les jeux de soirée joués entièrement ici (party.js, party-roles.js, party-sound.js).
// Le serveur décide de tout (mots, points, coups) ; la page affiche et envoie les actions.
// Mises à jour en « long polling » : la page demande l'état et le serveur répond dès qu'il change.
//
// Pages : /arcade/ (et /.proxy/arcade/ derrière le relais de Discord)
// Dans le portail Discord : Activités › URL Mappings, cible « vercel-ia.onrender.com/arcade ».
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { playedGame, rewardWin } from '../features/treasury.js';
import { WORDS } from './words.js';
import { registerArcadeGames, soloAct, soloGold, soloView } from './games.js';
import { images, registerParty } from './party.js';
import './party-roles.js';
import { deezerImage, previewAudio } from './party-sound.js';
import { speech } from './tts.js';

const WEB = path.resolve('web/arcade');
const MAX_BODY = 3 * 1024 * 1024; // un passage de freestyle enregistré au micro
const SESSION_MS = 12 * 3_600_000;
const POLL_MS = 25_000;
const GONE_MS = 40_000;
let client = null;
export const setArcadeClient = (c) => { client = c; };

// ------------------------------------------------------------------ Sessions signées
const secret = () => createHmac('sha256', config.discordToken || 'arcade').update('arcade-ai-vercel').digest();
const sign = (p) => createHmac('sha256', secret()).update(p).digest('base64url');
export function createSession({ id, name }, ttl = SESSION_MS) {
  const payload = Buffer.from(JSON.stringify({ u: String(id), n: String(name ?? '').slice(0, 32), e: Date.now() + ttl })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function readSession(token) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(sign(payload));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return /^\d{5,25}$/.test(d.u) && d.e > Date.now() ? { id: d.u, name: d.n || 'Joueur' } : null;
  } catch {
    return null;
  }
}
/** Lien personnel (hors Discord) vers la salle d'un salon. */
export function arcadeLink(user, channelId, guildId) {
  const base = config.publicUrl || `http://localhost:${config.port}`;
  return `${base}/arcade/?room=${channelId}&guild=${guildId}#s=${createSession(user)}`;
}

// ------------------------------------------------------------------ Salles
const rooms = new Map();
function roomOf(id, guildId = null) {
  let r = rooms.get(id);
  if (!r) {
    r = { id, guildId, players: new Map(), game: null, seq: 1, waiters: new Set(), chat: [], lastGame: 'dessin' };
    rooms.set(id, r);
  }
  if (guildId && !r.guildId) r.guildId = guildId;
  return r;
}
function bump(r) {
  r.seq += 1;
  for (const w of r.waiters) w();
  r.waiters.clear();
}
const say = (r, text, kind = 'info') => {
  r.chat.push({ at: Date.now(), kind, text });
  if (r.chat.length > 40) r.chat.shift();
};
const nameOf = (r, id) => r.players.get(id)?.name ?? 'Joueur';

// ------------------------------------------------------------------ Dessine et devine
const DRAW_MS = 80_000;
const CHOOSE_MS = 15_000;
const REVEAL_MS = 5_000;
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const pick3 = () => {
  const out = new Set();
  while (out.size < 3) out.add(WORDS[Math.floor(Math.random() * WORDS.length)]);
  return [...out];
};
function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const GAMES = {
  dessin: {
    min: 2,
    start(r) {
      const order = [...r.players.keys()];
      return { kind: 'dessin', order, turn: 0, round: 1, rounds: order.length >= 5 ? 1 : 2, scores: Object.fromEntries(order.map((id) => [id, 0])), ...this.nextTurn(r, order[0]) };
    },
    nextTurn(r, drawer) {
      return { phase: 'choose', drawer, choices: pick3(), word: null, endsAt: Date.now() + CHOOSE_MS, guessed: [], canvas: { epoch: Date.now(), ops: [] }, shown: [] };
    },
    view(g, me) {
      const isDrawer = me === g.drawer;
      const reveal = g.phase !== 'draw' && g.phase !== 'choose';
      const hint = g.word ? [...g.word].map((c, i) => (c === ' ' || c === '-' ? c : reveal || isDrawer || g.guessed.includes(me) || g.shown.includes(i) ? c : '_')).join('') : null;
      return {
        kind: 'dessin', phase: g.phase, drawer: g.drawer, round: g.round, rounds: g.rounds, endsAt: g.endsAt, scores: g.scores, guessed: g.guessed,
        choices: isDrawer && g.phase === 'choose' ? g.choices : null, hint, word: reveal || isDrawer || g.guessed.includes(me) ? g.word : null, epoch: g.canvas.epoch,
      };
    },
    act(r, g, me, body) {
      if (body.type === 'choose' && g.phase === 'choose' && me === g.drawer) {
        g.word = g.choices[Number(body.i)] ?? g.choices[0];
        g.phase = 'draw';
        g.endsAt = Date.now() + DRAW_MS;
        g.startedAt = Date.now();
        say(r, `✏️ ${nameOf(r, me)} dessine ! (${g.word.length} lettres)`);
        return true;
      }
      if (g.phase !== 'draw') return body.type === 'guess' ? guessChat(r, me, body.text) : false;
      if (me === g.drawer) {
        const ops = g.canvas.ops;
        if (body.type === 'stroke' && Array.isArray(body.pts) && body.pts.length && body.pts.length <= 400 && ops.length < 6000) {
          const pts = body.pts.slice(0, 400).map(([x, y]) => [Math.max(0, Math.min(1, +x || 0)), Math.max(0, Math.min(1, +y || 0))].map((v) => Math.round(v * 1000) / 1000));
          ops.push({ id: String(body.id).slice(0, 20), pts, c: /^#[0-9a-f]{6}$/i.test(body.c) ? body.c : '#2a1606', s: Math.max(1, Math.min(40, Number(body.s) || 4)) });
          return true;
        }
        if (body.type === 'fill' && /^#[0-9a-f]{6}$/i.test(body.c)) { ops.push({ fill: body.c }); return true; }
        if (body.type === 'undo') {
          const last = [...ops].reverse().find((o) => o.id && !o.removed);
          if (last) ops.push({ undo: last.id });
          return !!last;
        }
        if (body.type === 'clear') { ops.push({ clear: true }); return true; }
        return false;
      }
      if (body.type !== 'guess') return false;
      const text = String(body.text ?? '').slice(0, 80).trim();
      if (!text) return false;
      if (g.guessed.includes(me)) return guessChat(r, me, text, true);
      const t = norm(text);
      const w = norm(g.word);
      if (t === w) {
        const elapsed = Date.now() - g.startedAt;
        const points = Math.max(20, Math.round(100 - (elapsed / DRAW_MS) * 80)) + (g.guessed.length === 0 ? 20 : 0);
        g.scores[me] = (g.scores[me] ?? 0) + points;
        g.scores[g.drawer] = (g.scores[g.drawer] ?? 0) + 25;
        g.guessed.push(me);
        say(r, `✅ ${nameOf(r, me)} a trouvé ! (+${points})`, 'good');
        const guessers = [...r.players.keys()].filter((id) => id !== g.drawer);
        if (guessers.every((id) => g.guessed.includes(id))) endTurn(r, g);
        return true;
      }
      if (w.length > 4 && levenshtein(t, w) <= 1) {
        say(r, `🔥 ${nameOf(r, me)} : « ${text} » (tout près !)`, 'near');
        return true;
      }
      return guessChat(r, me, text);
    },
    tick(r, g) {
      const now = Date.now();
      if (g.phase === 'choose' && now > g.endsAt) return this.act(r, g, g.drawer, { type: 'choose', i: 0 });
      if (g.phase === 'draw') {
        // Indices : une lettre à 50 % et une à 75 % du temps
        const k = (now - g.startedAt) / DRAW_MS;
        const want = k > 0.75 ? 2 : k > 0.5 ? 1 : 0;
        if (g.shown.length < want && g.word.length > 3) {
          const hidden = [...g.word].map((c, i) => (c !== ' ' && !g.shown.includes(i) ? i : null)).filter((i) => i !== null);
          g.shown.push(hidden[Math.floor(Math.random() * hidden.length)]);
          return true;
        }
        if (now > g.endsAt || !r.players.has(g.drawer)) { endTurn(r, g); return true; }
      }
      if (g.phase === 'reveal' && now > g.endsAt) { nextDrawer(r, g); return true; }
      return false;
    },
  },

  morpion: {
    min: 2,
    start(r, host) {
      const others = [...r.players.keys()].filter((id) => id !== host);
      return { kind: 'morpion', seats: [host, others[0] ?? null], board: Array(9).fill(null), turn: 0, winner: null, draw: false };
    },
    view: (g) => ({ kind: 'morpion', seats: g.seats, board: g.board, turn: g.turn, winner: g.winner, draw: g.draw, line: g.line ?? null }),
    act(r, g, me, body) {
      if (body.type === 'sit') {
        const i = g.seats.indexOf(null);
        if (i < 0 || g.seats.includes(me)) return false;
        g.seats[i] = me;
        return true;
      }
      if (body.type !== 'play' || g.winner || g.draw || g.seats[g.turn] !== me || g.seats.includes(null)) return false;
      const i = Number(body.i);
      if (!(i >= 0 && i < 9) || g.board[i] !== null) return false;
      g.board[i] = g.turn;
      const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
      const line = L.find((l) => l.every((k) => g.board[k] === g.turn));
      if (line) { g.winner = me; g.line = line; finishDuel(r, g, me); } else if (g.board.every((v) => v !== null)) { g.draw = true; finishDuel(r, g, null); } else g.turn = 1 - g.turn;
      return true;
    },
  },

  puissance4: {
    min: 2,
    start(r, host) {
      const others = [...r.players.keys()].filter((id) => id !== host);
      return { kind: 'puissance4', seats: [host, others[0] ?? null], grid: Array.from({ length: 6 }, () => Array(7).fill(null)), turn: 0, winner: null, draw: false, last: null };
    },
    view: (g) => ({ kind: 'puissance4', seats: g.seats, grid: g.grid, turn: g.turn, winner: g.winner, draw: g.draw, last: g.last, line: g.line ?? null }),
    act(r, g, me, body) {
      if (body.type === 'sit') return GAMES.morpion.act(r, g, me, body);
      if (body.type !== 'play' || g.winner || g.draw || g.seats[g.turn] !== me || g.seats.includes(null)) return false;
      const col = Number(body.i);
      if (!(col >= 0 && col < 7)) return false;
      let row = -1;
      for (let y = 5; y >= 0; y--) if (g.grid[y][col] === null) { row = y; break; }
      if (row < 0) return false;
      g.grid[row][col] = g.turn;
      g.last = [row, col];
      const at = (y, x) => (y >= 0 && y < 6 && x >= 0 && x < 7 ? g.grid[y][x] : null);
      for (const [dy, dx] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const line = [[row, col]];
        for (const s of [1, -1]) for (let k = 1; k < 4 && at(row + dy * k * s, col + dx * k * s) === g.turn; k++) line.push([row + dy * k * s, col + dx * k * s]);
        if (line.length >= 4) { g.winner = me; g.line = line; finishDuel(r, g, me); return true; }
      }
      if (g.grid[0].every((v) => v !== null)) { g.draw = true; finishDuel(r, g, null); } else g.turn = 1 - g.turn;
      return true;
    },
  },
};

registerArcadeGames(GAMES, { say, bump, nameOf, reward: (...args) => reward(...args) });
registerParty(GAMES, { say, bump, nameOf, reward: (...args) => reward(...args), client: () => client });
const gameOver = (g) => !g || g.kind === 'fin' || g.winner || g.draw || GAMES[g.kind]?.over?.(g);

function guessChat(r, me, text, secret = false) {
  const t = String(text ?? '').slice(0, 80).trim();
  if (!t) return false;
  // Ceux qui ont trouvé parlent entre eux sans donner la réponse
  const g = r.game;
  if (secret || (g?.kind === 'dessin' && g.phase === 'draw' && me === g.drawer)) return false;
  r.chat.push({ at: Date.now(), kind: 'msg', from: me, name: nameOf(r, me), text: t });
  if (r.chat.length > 40) r.chat.shift();
  return true;
}
function endTurn(r, g) {
  g.phase = 'reveal';
  g.endsAt = Date.now() + REVEAL_MS;
  say(r, `🖼️ Le mot était « ${g.word ?? '…'} »`);
}
function nextDrawer(r, g) {
  const alive = g.order.filter((id) => r.players.has(id));
  let next = g.turn + 1;
  while (next < g.order.length && !r.players.has(g.order[next])) next += 1;
  if (next >= g.order.length) {
    if (g.round >= g.rounds || alive.length < 2) return finishDrawing(r, g);
    g.round += 1;
    next = g.order.findIndex((id) => r.players.has(id));
  }
  g.turn = next;
  Object.assign(g, GAMES.dessin.nextTurn(r, g.order[next]));
  return undefined;
}
function finishDrawing(r, g) {
  const podium = Object.entries(g.scores).sort((a, b) => b[1] - a[1]);
  r.game = { kind: 'fin', from: 'dessin', podium, at: Date.now() };
  say(r, podium[0] ? `🏆 ${nameOf(r, podium[0][0])} gagne la partie de dessin !` : 'Partie terminée.', 'good');
  reward(r, podium[0]?.[0], 80, 'Arcade : dessine et devine', Object.keys(g.scores));
}
function finishDuel(r, g, winner) {
  say(r, winner ? `🏆 ${nameOf(r, winner)} gagne !` : '🤝 Égalité !', 'good');
  reward(r, winner, 40, `Arcade : ${g.kind === 'morpion' ? 'morpion' : 'puissance 4'}`, g.seats.filter(Boolean));
}
async function reward(r, winner, amount, label, players, { solo = false } = {}) {
  if (!r.guildId || !client) return;
  const guild = client.guilds.cache.get(r.guildId);
  if (!guild) return;
  try {
    await playedGame(r.guildId, players);
    // En solo (ou contre le bot) le gain est plus petit, et compté dans la limite de 10 gains par jour
    if (winner && (players.length >= 2 || solo) && await guild.members.fetch(winner).catch(() => null)) {
      const won = await rewardWin(r.guildId, winner, amount, label);
      if (won) say(r, `🪙 +${won} pièces d’or pour ${nameOf(r, winner)} sur le serveur`, 'good');
      bump(r);
    }
  } catch { /* la récompense ne doit jamais casser la partie */ }
}

// ------------------------------------------------------------------ État et actions
function stateFor(r, me, since = {}) {
  const g = r.game;
  const out = {
    seq: r.seq, now: Date.now(), me,
    players: [...r.players.entries()].map(([id, p]) => ({ id, name: p.name })),
    host: [...r.players.keys()][0] ?? null,
    // Pendant un jeu de soirée, le chat des spectateurs n'est montré qu'aux spectateurs
    chat: r.chat.filter((m) => !m.spec || g?.kind !== 'party' || g.over || GAMES.party.spectator(g, me)).slice(-30),
    lastGame: r.lastGame,
    game: !g ? null : g.kind === 'fin' ? g : GAMES[g.kind].view(g, me),
    solo: soloView(r.solo?.get(me)),
  };
  if (g?.kind === 'dessin') {
    const same = Number(since.epoch) === g.canvas.epoch;
    const from = same ? Math.max(0, Math.min(g.canvas.ops.length, Number(since.ops) || 0)) : 0;
    out.canvas = { epoch: g.canvas.epoch, from, ops: g.canvas.ops.slice(from), total: g.canvas.ops.length };
  }
  return out;
}

function join(r, user) {
  const had = r.players.has(user.id);
  r.players.set(user.id, { name: user.name, seen: Date.now() });
  if (!had) {
    say(r, `👋 ${user.name} arrive dans l’arcade`);
    if (r.game?.kind === 'dessin' && !r.game.order.includes(user.id)) { r.game.order.push(user.id); r.game.scores[user.id] = 0; }
    bump(r);
  }
}

export async function act(r, me, body) {
  const p = r.players.get(me);
  if (!p) return { error: 'Rejoins d’abord la salle.' };
  p.seen = Date.now();
  if (body.type === 'start') {
    const kind = String(body.game);
    const G = GAMES[kind];
    if (!G) return { error: 'Jeu inconnu.' };
    if (!gameOver(r.game)) return { error: 'Une partie est déjà en cours.' };
    if (r.players.size < G.min) return { error: `Il faut au moins ${G.min} joueurs dans la salle.` };
    const refused = G.check?.(r, body);
    if (refused) return { error: refused };
    r.game = G.start(r, me, body);
    r.lastGame = kind;
    say(r, `🎮 ${p.name} lance ${G.label?.(r.game) ?? { dessin: 'Dessine et devine', morpion: 'le morpion', puissance4: 'le puissance 4' }[kind]} !`);
    bump(r);
    return { ok: true };
  }
  if (body.type === 'lobby') {
    if (!gameOver(r.game) && [...r.players.keys()][0] !== me && r.game?.host !== me) return { error: 'Seul l’hôte (ou celui qui a lancé la partie) peut l’arrêter.' };
    if (r.game?.kind === 'party') GAMES.party.stop(r.game);
    r.game = null;
    bump(r);
    return { ok: true };
  }
  // Jeux solo (démineur, taverne) : chacun sa partie
  if (body.type === 'solo') {
    const out = await soloAct(r, me, body, { say, nameOf });
    bump(r);
    return out;
  }
  // Jeux de soirée : le chat sert aussi aux réponses (une bonne réponse n'est pas montrée aux autres)
  if (body.type === 'chat' && r.game?.kind === 'party' && !r.game.over) {
    const text = String(body.text ?? '').slice(0, 200).trim();
    // Les spectateurs ont leur propre chat : les joueurs ne le voient pas pendant la partie
    if (text && GAMES.party.spectator(r.game, me)) {
      r.chat.push({ at: Date.now(), kind: 'msg', spec: true, from: me, name: p.name, text: text.slice(0, 80) });
      if (r.chat.length > 40) r.chat.shift();
    } else if (text && !GAMES.party.chat(r, r.game, me, text)) guessChat(r, me, text);
    bump(r);
    return { ok: true };
  }
  if (body.type === 'chat' && (!r.game || r.game.kind !== 'dessin')) {
    if (guessChat(r, me, body.text)) bump(r);
    return { ok: true };
  }
  const g = r.game;
  if (!g || g.kind === 'fin') return { error: 'Aucune partie en cours.' };
  const changed = GAMES[g.kind].act(r, g, me, body.type === 'chat' ? { ...body, type: 'guess' } : body);
  if (changed) bump(r);
  return { ok: true };
}

// Chaque seconde : minuteurs des parties, départ des joueurs partis
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    let changed = false;
    for (const [id, p] of r.players) if (now - p.seen > GONE_MS) { r.players.delete(id); say(r, `🚪 ${p.name} est parti`); changed = true; }
    const g = r.game;
    if (g && GAMES[g.kind]?.tick?.(r, g)) changed = true;
    if (!r.players.size && !r.waiters.size) { rooms.delete(r.id); continue; }
    if (changed) bump(r);
  }
}, 1000).unref();

// ------------------------------------------------------------------ HTTP
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', ttf: 'font/ttf', png: 'image/png' };
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
async function serve(res, file, type, cache = 'no-cache') {
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': cache });
    res.end(body);
  } catch {
    json(res, 404, { error: 'introuvable' });
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('trop gros')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('JSON invalide')); } });
    req.on('error', reject);
  });
}
const clientSecret = () => (process.env.DISCORD_CLIENT_SECRET ?? '').trim();
async function discordLogin(code) {
  if (!client?.user || !clientSecret()) throw new Error('Activité pas encore configurée : il manque DISCORD_CLIENT_SECRET dans Render.');
  const res = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: client.user.id, client_secret: clientSecret(), grant_type: 'authorization_code', code: String(code) }),
  });
  const token = await res.json().catch(() => ({}));
  if (!res.ok || !token.access_token) throw new Error(`connexion Discord refusée (${token.error ?? res.status})`);
  const me = await (await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } })).json();
  const user = { id: me.id, name: me.global_name || me.username };
  return { access_token: token.access_token, session: createSession(user), user };
}
const avatars = new Map();
/** La photo de profil Discord (celle du serveur si le membre en a une). */
async function avatar(id, guildId = null) {
  const key = `${guildId ?? ''}:${id}`;
  const hit = avatars.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.png;
  const member = guildId ? await client?.guilds.cache.get(guildId)?.members.fetch(id).catch(() => null) : null;
  const user = member ?? await client?.users.fetch(id).catch(() => null);
  if (!user) return null;
  const png = Buffer.from(await (await fetch(user.displayAvatarURL({ extension: 'png', size: 128 }))).arrayBuffer());
  avatars.set(key, { at: Date.now(), png });
  if (avatars.size > 500) avatars.delete(avatars.keys().next().value);
  return png;
}

const nicks = new Map();
async function serverName(guildId, id) {
  if (!guildId) return null;
  const key = `${guildId}:${id}`;
  const hit = nicks.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.name;
  const member = await client?.guilds.cache.get(guildId)?.members.fetch(id).catch(() => null);
  const name = member?.displayName ?? null;
  nicks.set(key, { at: Date.now(), name });
  if (nicks.size > 2000) nicks.delete(nicks.keys().next().value);
  return name;
}

/** Répond aux adresses de l'arcade ; false si ce n'est pas pour elle. */
export async function handleArcadeWeb(req, res, url) {
  const pathname = url.pathname.startsWith('/.proxy/') ? url.pathname.slice('/.proxy'.length) : url.pathname;
  if (pathname === '/arcade') { res.writeHead(302, { Location: `/arcade/${url.search}` }); res.end(); return true; }
  if (!pathname.startsWith('/arcade/')) return false;
  const rest = pathname.slice('/arcade/'.length);
  if (rest === '' || rest === 'index.html') {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' https://discord.com wss://*.discord.com; frame-ancestors https://discord.com https://*.discord.com https://*.discordsays.com 'self'");
    await serve(res, path.join(WEB, 'index.html'), TYPES.html);
    return true;
  }
  if (['app.js', 'style.css'].includes(rest)) { await serve(res, path.join(WEB, rest), TYPES[rest.split('.').pop()]); return true; }
  if (rest === 'sdk.js') { await serve(res, path.resolve('web/salle/sdk.js'), TYPES.js, 'public, max-age=86400'); return true; }
  if (rest === 'fonts/cinzel.ttf') { await serve(res, path.resolve('assets/Cinzel-Bold.ttf'), TYPES.ttf, 'public, max-age=604800'); return true; }
  if (/^avatar\/\d{5,25}\.png$/.test(rest)) {
    const g = url.searchParams.get('g');
    const png = await avatar(rest.slice(7, -4), /^\d{5,25}$/.test(g ?? '') ? g : null).catch(() => null);
    if (!png) {
      // Pas d'avatar : une ancre sur un médaillon de parchemin
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=600' });
      res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#c9a978"/><text x="32" y="43" font-size="30" text-anchor="middle">⚓</text></svg>');
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'public, max-age=3600' });
    res.end(png);
    return true;
  }
  // Cartes de rôle (loup-garou…), extraits audio et images des jeux de soirée
  if (/^jeux\/[a-z]+\.gif$/.test(rest)) { await serve(res, path.resolve('assets', rest), 'image/gif', 'public, max-age=604800'); return true; }
  if (/^api\/audio\/\d{1,15}\.mp3$/.test(rest)) {
    const buf = await previewAudio(rest.slice(10, -4)).catch(() => null);
    if (!buf) return json(res, 404, { error: 'extrait introuvable' }), true;
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=900' });
    res.end(buf);
    return true;
  }
  if (rest === 'api/img') {
    const img = await deezerImage(String(url.searchParams.get('u') ?? '')).catch(() => null);
    if (!img) return json(res, 404, { error: 'image introuvable' }), true;
    res.writeHead(200, { 'Content-Type': img.type, 'Content-Length': img.buf.length, 'Cache-Control': 'public, max-age=3600' });
    res.end(img.buf);
    return true;
  }
  if (/^api\/pimg\/[a-z0-9-]{5,60}\.jpg$/.test(rest)) {
    const buf = images.get(rest.slice(9, -4));
    if (!buf) return json(res, 404, { error: 'image introuvable' }), true;
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=600' });
    res.end(buf);
    return true;
  }
  if (!rest.startsWith('api/')) { json(res, 404, { error: 'introuvable' }); return true; }
  const route = rest.slice(4);
  try {
    if (route === 'config' && req.method === 'GET') return json(res, 200, { clientId: client?.user?.id ?? null, name: client?.user?.username ?? 'AI Vercel' }), true;
    if (route === 'discord' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, await discordLogin(body.code)), true;
    }
    const user = readSession(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
    if (!user) return json(res, 401, { error: 'Session expirée : rouvre l’arcade depuis Discord.' }), true;
    const roomId = String(url.searchParams.get('room') ?? '');
    if (!/^\d{5,25}$/.test(roomId)) return json(res, 400, { error: 'Salle inconnue.' }), true;
    const guildId = /^\d{5,25}$/.test(url.searchParams.get('guild') ?? '') ? url.searchParams.get('guild') : null;
    const r = roomOf(roomId, guildId);
    // Le pseudo affiché : celui du serveur Discord (comme dans le salon)
    const nick = await serverName(r.guildId, user.id);
    if (nick) user.name = nick;
    if (route === 'tts' && req.method === 'POST') {
      const body = await readBody(req);
      const wav = await speech(String(body.text ?? ''));
      if (!wav) return json(res, 503, { error: 'voix indisponible' }), true;
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'private, max-age=3600' });
      res.end(wav);
      return true;
    }
    if (route === 'poll' && req.method === 'GET') {
      join(r, user);
      const since = Number(url.searchParams.get('since')) || 0;
      const opts = { epoch: url.searchParams.get('epoch'), ops: url.searchParams.get('ops') };
      if (r.seq > since) return json(res, 200, { ...stateFor(r, user.id, opts), gold: await soloGold(r.guildId, user.id) }), true;
      await new Promise((resolve) => {
        const done = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => { r.waiters.delete(done); resolve(); }, POLL_MS);
        r.waiters.add(done);
        req.on('close', () => { r.waiters.delete(done); clearTimeout(timer); resolve(); });
      });
      if (!res.writableEnded) json(res, 200, { ...stateFor(r, user.id, opts), gold: await soloGold(r.guildId, user.id) });
      return true;
    }
    if (route === 'act' && req.method === 'POST') {
      join(r, user);
      const body = await readBody(req);
      const out = await act(r, user.id, body);
      return json(res, out.error ? 400 : 200, out), true;
    }
    if (route === 'leave' && req.method === 'POST') {
      if (r.players.delete(user.id)) { say(r, `🚪 ${user.name} est parti`); bump(r); }
      return json(res, 200, { ok: true }), true;
    }
    return json(res, 404, { error: 'route inconnue' }), true;
  } catch (err) {
    return json(res, 400, { error: err.message }), true;
  }
}

export const _test = { rooms, roomOf, join, act, stateFor, GAMES, bump, levenshtein, norm };
