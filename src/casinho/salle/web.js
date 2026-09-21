// La salle de jeux cliquable, servie par le bot : la page (web/salle/) et son API.
// On y arrive de deux façons :
//   • en Activité Discord : la page s'ouvre dans Discord, le joueur est reconnu par
//     la connexion Discord (OAuth2, avec le secret de l'application) ;
//   • par un lien personnel que le bot donne en privé : le lien porte une « session »
//     signée par le serveur, qui dit qui est le joueur.
// Dans les deux cas, la page parle ensuite à l'API avec cette session.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { balance, daily, dailyStatus, waitLabel } from '../economy.js';
import * as blackjack from './blackjack.js';
import { CATALOG } from './catalog.js';
import { isRoomId, markPresent, presentIn } from './common.js';
import * as crash from './crash.js';
import * as duel from './duel.js';
import * as roulette from './roulette.js';
import { cartesGame, desGame, hiloGame, machineGame, minesGame, pieceGame } from './solo.js';

/** Les jeux de la salle : chacun sait se montrer (view) et répondre aux clics (act). */
export const GAMES = {
  roulette,
  blackjack,
  crash,
  mines: minesGame,
  plusoumoins: hiloGame,
  machine: machineGame,
  des: desGame,
  pileouface: pieceGame,
  rougenoir: cartesGame,
  duel,
};
export const GAME_IDS = Object.keys(GAMES);

const WEB = path.resolve('web/salle');
const SESSION_MS = 12 * 60 * 60_000;
const PENDING_MS = 3 * 60_000;
const MAX_BODY = 16 * 1024;

const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
const STATIC = new Set(['index.html', 'app.js', 'kit.js', 'style.css', 'sdk.js', ...GAME_IDS.map((id) => `games/${id}.js`)]);
const FONT_FILES = { 'cinzel.ttf': 'Cinzel-Bold.ttf', 'noto.ttf': 'NotoSans-Bold.ttf' };

// ------------------------------------------------------------------ Sessions
// Signées avec une clé dérivée du token du bot : impossible à fabriquer sans lui.
const secret = () => createHmac('sha256', config.casinho.token || config.discordToken || 'casinho').update('casinho-roulette').digest();
const b64 = (value) => Buffer.from(value).toString('base64url');
const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

/** Une session pour ce joueur : qui il est, et jusqu'à quand. */
export function createSession({ id, name }, ttl = SESSION_MS) {
  const payload = b64(JSON.stringify({ u: String(id), n: String(name ?? '').slice(0, 40), e: Date.now() + ttl }));
  return `${payload}.${sign(payload)}`;
}

export function readSession(token) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!/^\d{5,25}$/.test(data.u) || !(data.e > Date.now())) return null;
    return { id: data.u, name: data.n || 'Joueur' };
  } catch {
    return null;
  }
}

/** Le lien personnel vers la salle d'un salon (donné en privé par le bot), ouvert sur un jeu. */
export function personalLink(user, roomId, game = null) {
  const base = config.publicUrl || `http://localhost:${config.port}`; // en local : le serveur du bot
  const jeu = game && GAMES[game] ? `&jeu=${game}` : '';
  return `${base}/salle/?room=${roomId}${jeu}#s=${createSession(user)}`;
}

// L'Activité Discord ne transmet pas de paramètre : le bouton « Ouvrir » d'un jeu
// note ce jeu, et la salle l'ouvre directement à l'arrivée du joueur.
const pending = new Map(); // joueur → { game, until }
export function openOnArrival(userId, game) {
  if (GAMES[game]) pending.set(userId, { game, until: Date.now() + PENDING_MS });
}
function takePending(userId) {
  const entry = pending.get(userId);
  pending.delete(userId);
  return entry && entry.until > Date.now() ? entry.game : null;
}

// ------------------------------------------------------------------ Connexion Discord
/** Échange le code de l'Activité contre un jeton Discord, et reconnaît le joueur. */
async function discordLogin(code) {
  const { clientId, clientSecret } = config.casinho;
  if (!clientId || !clientSecret) throw new Error('Activité pas encore configurée : il manque le secret OAuth2 de Casinho dans Render.');
  const response = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code }),
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || !token.access_token) throw new Error(`connexion Discord refusée (${token.error ?? response.status})`);
  const me = await (await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } })).json();
  if (!me?.id) throw new Error('profil Discord introuvable');
  const user = { id: me.id, name: me.global_name || me.username };
  return { access_token: token.access_token, session: createSession(user), user };
}

// ------------------------------------------------------------------ HTTP
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('requête trop grosse'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

const sessionOf = (req) => readSession(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));

async function serveFile(res, file, type, cache = 'no-cache') {
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': cache });
    res.end(body);
  } catch {
    json(res, 404, { error: 'introuvable' });
  }
}

/** L'Activité Discord charge la racine du site : on la reconnaît à ses paramètres. */
export const isActivityEntry = (url) => url.pathname === '/' && url.searchParams.has('frame_id');

/** Ce que la salle montre partout : le joueur, son solde, le cadeau du jour, les défis reçus. */
async function lobbyState(roomId, user) {
  markPresent(roomId, user);
  return {
    me: { id: user.id, name: user.name, balance: await balance(user.id) },
    daily: await dailyStatus(user.id),
    present: presentIn(roomId).length,
    tables: Object.fromEntries(GAME_IDS.map((id) => [id, GAMES[id].activity?.(roomId) ?? 0])),
    duels: duel.incomingFor(roomId, user.id),
    start: takePending(user.id),
  };
}

/**
 * Répond aux requêtes de la salle. Renvoie false si l'adresse ne la concerne pas.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 */
export async function handleSalleWeb(req, res, url) {
  // Derrière le relais de Discord, les adresses peuvent arriver préfixées de « /.proxy ».
  const pathname = url.pathname.startsWith('/.proxy/') ? url.pathname.slice('/.proxy'.length) : url.pathname;

  // L'ancienne adresse de la roulette mène à la salle, sur la roulette.
  if (pathname === '/roulette' || pathname === '/roulette/') {
    const query = new URLSearchParams(url.search);
    query.set('jeu', 'roulette');
    res.writeHead(302, { Location: `/salle/?${query}` });
    res.end();
    return true;
  }
  if (isActivityEntry(url) || pathname === '/salle' || pathname === '/salle/') {
    await serveFile(res, path.join(WEB, 'index.html'), TYPES.html);
    return true;
  }
  if (!pathname.startsWith('/salle/')) return false;
  const rest = pathname.slice('/salle/'.length);

  if (STATIC.has(rest)) {
    await serveFile(res, path.join(WEB, rest), TYPES[rest.split('.').pop()], rest === 'sdk.js' ? 'public, max-age=86400' : 'no-cache');
    return true;
  }
  if (rest.startsWith('fonts/') && FONT_FILES[rest.slice(6)]) {
    await serveFile(res, path.resolve('assets', FONT_FILES[rest.slice(6)]), 'font/ttf', 'public, max-age=604800');
    return true;
  }
  if (rest === 'fond.jpg') {
    await serveFile(res, path.resolve('assets/casinho/tables/roulette.jpg'), 'image/jpeg', 'public, max-age=86400');
    return true;
  }
  if (!rest.startsWith('api/')) {
    json(res, 404, { error: 'introuvable' });
    return true;
  }

  try {
    const route = rest.slice(4);
    if (req.method === 'GET' && route === 'config') {
      json(res, 200, { clientId: config.casinho.clientId, activity: Boolean(config.casinho.clientId && config.casinho.clientSecret), games: CATALOG });
      return true;
    }
    if (req.method === 'POST' && route === 'discord') {
      const { code } = await readBody(req);
      if (typeof code !== 'string' || !code) {
        json(res, 400, { error: 'code manquant' });
        return true;
      }
      json(res, 200, await discordLogin(code));
      return true;
    }

    // Tout le reste demande de savoir qui joue, et à quel salon.
    const user = sessionOf(req);
    if (!user) {
      json(res, 401, { error: 'Session expirée : rouvre la salle depuis Discord.' });
      return true;
    }
    const body = req.method === 'POST' ? await readBody(req) : {};
    const roomId = String((req.method === 'POST' ? body.room : url.searchParams.get('room')) ?? '');
    if (!isRoomId(roomId)) {
      json(res, 400, { error: 'Salon inconnu.' });
      return true;
    }

    if (route === 'salle' && req.method === 'GET') {
      json(res, 200, await lobbyState(roomId, user));
      return true;
    }
    if (route === 'jetons-du-jour' && req.method === 'POST') {
      const result = await daily(user.id);
      json(res, result.ok ? 200 : 409, result.ok ? { ok: true, amount: result.amount, streak: result.streak, balance: result.balance } : { ok: false, error: `Déjà récupérés aujourd’hui. Les prochains arrivent à minuit (dans ${waitLabel(result.wait)}).` });
      return true;
    }

    const game = GAMES[route];
    if (!game || !Object.hasOwn(GAMES, route)) {
      json(res, 404, { error: 'Jeu inconnu.' });
      return true;
    }
    markPresent(roomId, user);
    if (req.method === 'GET') {
      json(res, 200, await game.view(roomId, user));
      return true;
    }
    const input = { ...body };
    for (const key of ['bet', 'value', 'bombs', 'cell']) if (key in input) input[key] = Number(input[key]);
    if ('auto' in input && input.auto !== null) input.auto = Number(input.auto);
    const result = await game.act(roomId, user, input);
    json(res, result.ok ? 200 : 409, { ...result, state: await game.view(roomId, user) });
  } catch (err) {
    console.warn('[casinho] salle :', err.message);
    json(res, 500, { error: err.message });
  }
  return true;
}
