// Avis sur History Launcher et History Clips : note 1 à 5, commentaire facultatif, capture facultative.
// Lus par les sites (bandeau qui défile en bas de page) et envoyés depuis les sites ou les applis.
// Depuis un site (sans compte) : note + pseudo + commentaire, 3 par jour et par adresse IP, sans image.
// Depuis une appli connectée : un avis par compte et par appli (modifiable), capture possible (PNG/JPEG/WebP, 1,4 Mo).
import { randomUUID } from 'node:crypto';
import { getBlob, load, putBlob, save } from '../storage.js';
import { allowAttempt } from '../dashboard/auth.js';
import { me } from './launcherAccounts.js';

const KEY = 'avis';
const APPS = ['launcher', 'clips'];
const IMG_MAX = 1400 * 1024; // la requête entière est limitée à 2 Mo (image en base64 comprise)
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const imgType = (b) => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : null);
const cors = (res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); res.setHeader('Access-Control-Max-Age', '600'); };

/** Note donnée sur Discord (MP des vidéos) : ajoutée aux avis des deux applis, avec pseudo et photo Discord. */
export async function addDiscordReview({ userId, name, avatar, stars, comment, at = Date.now() }) {
  const all = (await load(KEY, null)) ?? {};
  const entry = { id: `d${userId}`, discord: userId, name: clean(name, 32) || 'Membre Discord', avatar: /^https:\/\/cdn\.discordapp\.com\//.test(avatar ?? '') ? avatar : null, stars, comment: clean(comment, 500), img: null, at, app: 'discord' };
  for (const app of APPS) all[app] = [entry, ...(all[app] ?? []).filter((r) => r.discord !== userId)].sort((a, b) => b.at - a.at).slice(0, 500);
  await save(KEY, all);
}

export async function handleReviewsApi(req, res, url, { readJson, send, clientIp }) {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const img = url.pathname.match(/^\/api\/avis\/img\/([\w-]{36})$/);
  if (img && req.method === 'GET') {
    const b = await getBlob(`avis/${img[1]}`);
    if (!b) return send(res, 404, { error: 'Image introuvable' });
    res.writeHead(200, { 'Content-Type': b.mime, 'Cache-Control': 'public, max-age=86400' });
    return res.end(b.buf);
  }
  const app = String(url.searchParams.get('app') ?? '');
  if (url.pathname !== '/api/avis' || !APPS.includes(app)) return send(res, 404, { error: 'Avis introuvables' });
  const all = (await load(KEY, null)) ?? {};
  const list = all[app] ?? [];
  if (req.method === 'GET') {
    const avg = list.length ? Math.round((list.reduce((a, r) => a + r.stars, 0) / list.length) * 10) / 10 : 0;
    return send(res, 200, { avg, count: list.length, items: list.slice(0, 60).map(({ id, name, stars, comment, img: i, at, app: from, avatar }) => ({ id, name, stars, comment, img: i ? `/api/avis/img/${i}` : null, at, from, avatar: avatar ?? null })) });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non prise en charge' });
  const body = await readJson(req).catch(() => ({}));
  const stars = Math.round(Number(body.stars));
  if (!(stars >= 1 && stars <= 5)) return send(res, 400, { error: 'Choisis une note de 1 à 5 étoiles.' });
  const comment = clean(body.comment, 500);
  const compte = await me(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
  let entry;
  if (compte) {
    if (!allowAttempt('avis-compte', compte.id, 10, 3_600_000)) return send(res, 429, { error: 'Trop d’envois, réessaie plus tard.' });
    let pic = null;
    const data = String(body.img ?? '').replace(/^data:image\/\w+;base64,/, '');
    if (data) {
      const buf = Buffer.from(data, 'base64');
      const type = buf.length <= IMG_MAX && imgType(buf);
      if (!type) return send(res, 400, { error: 'Capture en PNG, JPEG ou WebP, 1,4 Mo maximum.' });
      pic = randomUUID(); await putBlob(`avis/${pic}`, buf, type);
    }
    const old = list.find((r) => r.account === compte.id);
    entry = { id: old?.id ?? randomUUID(), account: compte.id, name: clean(compte.pseudo, 32) || 'Joueur', stars, comment, img: pic ?? (body.keepImg ? old?.img : null) ?? null, at: Date.now(), app: 'appli' };
    all[app] = [entry, ...list.filter((r) => r.account !== compte.id)];
  } else {
    if (!allowAttempt('avis-site', clientIp(req), 3, 86_400_000)) return send(res, 429, { error: 'Tu as déjà donné ton avis aujourd’hui, merci !' });
    entry = { id: randomUUID(), name: clean(body.name, 32) || 'Anonyme', stars, comment, img: null, at: Date.now(), app: 'site' };
    all[app] = [entry, ...list];
  }
  all[app] = all[app].slice(0, 500);
  await save(KEY, all);
  return send(res, 200, { ok: true });
}
