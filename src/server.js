// Mini serveur HTTP : obligatoire pour un "Web Service" Render + garde le service réveillé.
// Il expose aussi une petite API d'admin (logs, état, tests) protégée par une clé dérivée du token du bot.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { config } from './config.js';

const KEEP_ALIVE_MS = 10 * 60_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
// Images préparées à l'avance (tools/make-casino-gifs.mjs, tools/make-jeux-gifs.mjs).
// Elles sont servies telles quelles : Discord les récupère une fois puis les garde en cache.
const PUBLIC_ASSETS = { '/casino/': path.resolve('assets/casinho'), '/jeux/': path.resolve('assets/jeux') };

/** Clé d'admin : personne ne peut la deviner sans le token du bot. */
export function adminKey() {
  return createHmac('sha256', config.discordToken).update('vercel-admin').digest('hex');
}

function isAdmin(req) {
  const given = Buffer.from(String(req.headers['x-admin-key'] ?? ''));
  const expected = Buffer.from(adminKey());
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('requête trop grosse'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
  });
}

const send = (res, status, body) => {
  const isText = typeof body === 'string';
  res.writeHead(status, { 'Content-Type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8' });
  res.end(isText ? body : JSON.stringify(body, null, 2));
};

/**
 * @param {() => object} getStatus
 * @param {Record<string, (url: URL, body: object) => Promise<unknown>>} adminRoutes ex : { 'GET /admin/logs': fn }
 */
export function startHttpServer(getStatus, adminRoutes = {}, publicFile = () => null, liveRoute = null) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname.startsWith('/voice-test/')) {
      const file = publicFile(url.pathname);
      if (!file) return send(res, 404, 'introuvable');
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': file.length });
      return res.end(file);
    }

    // Animations du casino et cartes de rôle des jeux.
    const assetDir = Object.entries(PUBLIC_ASSETS).find(([prefix]) => url.pathname.startsWith(prefix))?.[1];
    if (assetDir) {
      const name = path.basename(url.pathname);
      if (!/^[a-z-]+\.gif$/.test(name)) return send(res, 404, 'introuvable');
      try {
        const gif = await readFile(path.join(assetDir, name));
        res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': gif.length, 'Cache-Control': 'public, max-age=604800' });
        return res.end(gif);
      } catch {
        return send(res, 404, 'introuvable');
      }
    }

    // Son du PC diffusé en direct (le serveur audio vient le chercher ici)
    if (url.pathname.startsWith('/live/') && liveRoute) return liveRoute(req, res, url);

    if (url.pathname.startsWith('/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'clé admin invalide' });
      const route = adminRoutes[`${req.method} ${url.pathname}`];
      if (!route) return send(res, 404, { error: 'route inconnue' });
      try {
        const body = req.method === 'POST' ? await readJson(req) : {};
        return send(res, 200, await route(url, body));
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    }

    const status = getStatus();
    if (url.pathname.startsWith('/health')) return send(res, 200, status);
    return send(res, 200, `${status.bot ?? 'Bot'} : ${status.discord === 'ready' ? 'en ligne ✅' : 'démarrage…'}`);
  });

  server.listen(config.port, () => console.log(`🌐 Serveur HTTP sur le port ${config.port}`));
  startHttpServer.server = server;

  // Render gratuit met le service en veille après 15 min sans visite : on se ping soi-même
  if (config.publicUrl) {
    setInterval(() => {
      fetch(`${config.publicUrl}/health`).catch((err) => console.warn('[keep-alive]', err.message));
    }, KEEP_ALIVE_MS);
    console.log(`⏰ Keep-alive activé sur ${config.publicUrl}/health`);
  }
  return server;
}
