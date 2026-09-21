// La table de roulette cliquable, servie par le bot : la page (web/roulette/) et
// son API. On y arrive de deux façons :
//   • en Activité Discord : la page s'ouvre dans Discord, le joueur est reconnu par
//     la connexion Discord (OAuth2, avec le secret de l'application) ;
//   • par un lien personnel que le bot donne en privé : le lien porte une « session »
//     signée par le serveur, qui dit qui est le joueur.
// Dans les deux cas, la page parle ensuite à l'API avec cette session.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { act, isRoomId, view } from './roulette.js';

const WEB = path.resolve('web/roulette');
const FONTS = path.resolve('assets');
const SESSION_MS = 12 * 60 * 60_000;
const MAX_BODY = 16 * 1024;

const FILES = {
  'index.html': 'text/html; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'sdk.js': 'text/javascript; charset=utf-8',
};
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

/** Le lien personnel vers la table d'un salon (donné en privé par le bot). */
export function personalLink(user, roomId) {
  const base = config.publicUrl || `http://localhost:${config.port}`; // en local : le serveur du bot
  return `${base}/roulette/?room=${roomId}#s=${createSession(user)}`;
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

/**
 * Répond aux requêtes de la table. Renvoie false si l'adresse ne la concerne pas.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 */
export async function handleRouletteWeb(req, res, url) {
  // Derrière le relais de Discord, les adresses peuvent arriver préfixées de « /.proxy ».
  const pathname = url.pathname.startsWith('/.proxy/') ? url.pathname.slice('/.proxy'.length) : url.pathname;
  if (isActivityEntry(url) || pathname === '/roulette' || pathname === '/roulette/') {
    await serveFile(res, path.join(WEB, 'index.html'), FILES['index.html']);
    return true;
  }
  if (!pathname.startsWith('/roulette/')) return false;
  const rest = pathname.slice('/roulette/'.length);

  if (FILES[rest]) {
    await serveFile(res, path.join(WEB, rest), FILES[rest], rest === 'sdk.js' ? 'public, max-age=86400' : 'no-cache');
    return true;
  }
  if (rest.startsWith('fonts/') && FONT_FILES[rest.slice(6)]) {
    await serveFile(res, path.join(FONTS, FONT_FILES[rest.slice(6)]), 'font/ttf', 'public, max-age=604800');
    return true;
  }
  if (rest === 'fond.jpg') {
    await serveFile(res, path.resolve('assets/casinho/tables/roulette.jpg'), 'image/jpeg', 'public, max-age=86400');
    return true;
  }

  try {
    if (req.method === 'GET' && rest === 'api/config') {
      json(res, 200, { clientId: config.casinho.clientId, activity: Boolean(config.casinho.clientId && config.casinho.clientSecret) });
      return true;
    }
    if (req.method === 'POST' && rest === 'api/discord') {
      const { code } = await readBody(req);
      if (typeof code !== 'string' || !code) {
        json(res, 400, { error: 'code manquant' });
        return true;
      }
      json(res, 200, await discordLogin(code));
      return true;
    }

    // Tout le reste demande de savoir qui joue.
    const user = sessionOf(req);
    if (!user) {
      json(res, 401, { error: 'Session expirée : rouvre la table depuis Discord.' });
      return true;
    }
    if (req.method === 'GET' && rest === 'api/state') {
      const room = url.searchParams.get('room') ?? '';
      if (!isRoomId(room)) {
        json(res, 400, { error: 'Table inconnue.' });
        return true;
      }
      json(res, 200, await view(room, user));
      return true;
    }
    if (req.method === 'POST' && rest === 'api/action') {
      const body = await readBody(req);
      const result = await act(String(body.room ?? ''), user, { action: body.action, spot: body.spot, value: Number(body.value) });
      const state = isRoomId(String(body.room ?? '')) ? await view(String(body.room), user) : null;
      json(res, result.ok ? 200 : 409, { ...result, state });
      return true;
    }
    json(res, 404, { error: 'introuvable' });
  } catch (err) {
    console.warn('[casinho] roulette web :', err.message);
    json(res, 500, { error: err.message });
  }
  return true;
}
