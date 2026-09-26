// Mini serveur HTTP : obligatoire pour un "Web Service" Render + garde le service réveillé.
// Il expose aussi une petite API d'admin (logs, état, tests) protégée par une clé dérivée du token du bot.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { config } from './config.js';
import { handleSalleWeb } from './casinho/salle/web.js';
import { allowAttempt, clientIp, isSecure } from './dashboard/auth.js';

const KEEP_ALIVE_MS = 10 * 60_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
// Images préparées à l'avance (tools/make-casino-gifs.mjs, tools/make-jeux-gifs.mjs).
// Elles sont servies telles quelles : Discord les récupère une fois puis les garde en cache.
const PUBLIC_ASSETS = { '/casino/': path.resolve('assets/casinho'), '/jeux/': path.resolve('assets/jeux'), '/panneaux/': path.resolve('assets/panneaux'), '/sanction/': path.resolve('assets/sanction'), '/iastatus/': path.resolve('assets/iastatus') };
// Le site vitrine (site/index.html) : servi à l'adresse principale du bot, avec les images des cartes.
const SITE_DIR = path.resolve('site');
const SITE_TYPES = { '.html': 'text/html; charset=utf-8', '.webp': 'image/webp' };

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

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('requête trop grosse')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * En-têtes de sécurité sur toutes les réponses. Les pages qui ont leurs propres règles (tableaux de bord,
 * arcade dans l'Activité Discord) les remplacent ensuite.
 */
function hardenResponse(req, res, url) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Powered-By', '');
  res.removeHeader('X-Powered-By');
  if (isSecure(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // L'arcade s'ouvre dans l'Activité Discord (iframe) ; le reste ne doit jamais être encadré par un autre site
  const framed = url.pathname.startsWith('/arcade') || url.pathname.startsWith('/.proxy') || url.pathname.startsWith('/salle');
  if (!framed) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self' https://www.paypal.com");
  }
}

/** Origines du site public (Vercel, Render) : les seules autorisées à lire l'API publique depuis un navigateur. */
function siteOrigins() {
  return [config.publicUrl, config.site.url, process.env.APP_URL, 'https://historyia.vercel.app']
    .filter(Boolean).map((u) => { try { return new URL(u).origin; } catch { return null; } }).filter(Boolean);
}
function allowSiteOrigin(req, res) {
  const origin = String(req.headers.origin ?? '');
  if (origin && siteOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
}
function preflight(req, res) {
  allowSiteOrigin(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Max-Age', '600');
  res.writeHead(204);
  return res.end();
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
export function startHttpServer(getStatus, adminRoutes = {}, publicFile = () => null, liveRoute = null, dashboard = null) {
  const server = http.createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (err) {
      // Jamais de détail interne (pile d'appels, message d'erreur) renvoyé au visiteur
      console.error('[http]', req.method, String(req.url).split('?')[0], err?.message ?? err);
      if (!res.headersSent) send(res, 500, { error: 'Erreur du serveur.' });
      else res.end();
    }
  });

  async function route(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    hardenResponse(req, res, url);
    // Surface d'attaque réduite : seulement GET, HEAD, POST et OPTIONS
    if (!['GET', 'HEAD', 'POST', 'OPTIONS'].includes(req.method)) return send(res, 405, 'méthode refusée');
    if (req.method === 'OPTIONS') return preflight(req, res);
    // Anti-automatisation : au-delà de 600 requêtes par minute depuis une même adresse, on refuse
    if (!url.pathname.startsWith('/health') && !allowAttempt('http', clientIp(req), 600, 60_000)) {
      res.setHeader('Retry-After', '60');
      return send(res, 429, { error: 'Trop de requêtes, ralentis un peu.' });
    }

    if (url.pathname.startsWith('/voice-test/')) {
      const file = publicFile(url.pathname);
      if (!file) return send(res, 404, 'introuvable');
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': file.length });
      return res.end(file);
    }

    // Tableau de bord public (/app) : connexion Discord, gestion de ses serveurs.
    if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
      const { handleUserApp } = await import('./dashboard/userApp.js');
      if (await handleUserApp(req, res, url)) return undefined;
    }

    // Tableau de bord de l'IA (/dashboard) : il gère lui-même sa sécurité (session, en-têtes).
    if (dashboard && await dashboard(req, res, url)) return undefined;

    // Animations du casino (dont roulette/17.gif, des/3-4.gif…) et cartes de rôle des jeux.
    const asset = Object.entries(PUBLIC_ASSETS).find(([prefix]) => url.pathname.startsWith(prefix));
    if (asset) {
      const [prefix, assetDir] = asset;
      const relative = url.pathname.slice(prefix.length);
      // Un nom, ou « dossier/nom » : rien qui permette de remonter hors du dossier.
      if (!/^(?:[a-z]+\/)?[a-z0-9-]+\.gif$/.test(relative)) return send(res, 404, 'introuvable');
      try {
        const gif = await readFile(path.join(assetDir, relative));
        res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': gif.length, 'Cache-Control': 'public, max-age=604800' });
        return res.end(gif);
      } catch {
        return send(res, 404, 'introuvable');
      }
    }

    // L'arcade multijoueur de History IA (Activité Discord ou lien personnel)
    if (url.pathname.startsWith('/arcade') || url.pathname.startsWith('/.proxy/arcade')) {
      const { handleArcadeWeb } = await import('./arcade/server.js');
      if (await handleArcadeWeb(req, res, url)) return undefined;
    }

    // La salle de jeux cliquable du casino (pages, API, et entrée de l'Activité Discord)
    if (await handleSalleWeb(req, res, url)) return;

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

    // Paiement PayPal, statut public (voir features/payments.js)
    if (['/payer', '/merci', '/statut', '/api/statut', '/paypal/ipn', '/avatar.png'].includes(url.pathname)) {
      const pay = await import('./features/payments.js');
      const html = (body) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); };
      if (url.pathname === '/paypal/ipn' && req.method === 'POST') {
        // PayPal veut une réponse 200 tout de suite ; la vérification se fait ensuite.
        const raw = await readRaw(req).catch(() => '');
        send(res, 200, 'OK');
        pay.handleIpn(raw).then((r) => { if (!r.ok) console.warn('[paypal] refusé :', r.why); }).catch((err) => console.warn('[paypal]', err.message));
        return undefined;
      }
      if (req.method !== 'GET') return send(res, 405, 'méthode refusée');
      if (url.pathname === '/avatar.png') {
        const img = await pay.botAvatar();
        res.writeHead(200, { 'Content-Type': img.type, 'Cache-Control': 'public, max-age=3600' });
        return res.end(img.body);
      }
      if (url.pathname === '/payer') return html(pay.paymentPage(url));
      if (url.pathname === '/merci') return html(pay.thanksPage());
      if (url.pathname === '/statut') return html(pay.statusPage());
      allowSiteOrigin(req, res);
      return send(res, 200, pay.statusJson());
    }

    // Chiffres en direct et classement public des serveurs (site vitrine)
    if ((url.pathname === '/api/public' || url.pathname === '/api/classement') && req.method === 'GET') {
      const { publicStats, publicRanking } = await import('./features/publicStats.js');
      allowSiteOrigin(req, res);
      res.setHeader('Cache-Control', 'public, max-age=60');
      return send(res, 200, url.pathname === '/api/public' ? await publicStats() : await publicRanking());
    }

    // Logo d'un serveur premium (cartes personnalisées)
    const logoMatch = url.pathname.match(/^\/logo\/(\d{15,21})\.png$/);
    if (logoMatch && req.method === 'GET') {
      const { logoPng } = await import('./features/premium.js');
      const png = logoPng(logoMatch[1]);
      if (!png) return send(res, 404, { error: 'pas de logo' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'public, max-age=86400' });
      return res.end(png);
    }

    // Le site vitrine : la page, puis ses images (cartes/, images/ et images/nuit/, en .webp seulement).
    const PAGES = { '/': 'index.html', '/site': 'index.html', '/demo': 'demo.html', '/nouveautes': 'nouveautes.html', '/classement': 'classement.html', '/conditions': 'conditions.html', '/confidentialite': 'confidentialite.html', '/mentions': 'mentions.html' };
    const sitePath = PAGES[url.pathname] ?? (/^\/(?:cartes|images(?:\/nuit)?)\/[a-z0-9-]+\.webp$/.test(url.pathname) ? url.pathname.slice(1) : null);
    if (sitePath && req.method === 'GET') {
      try {
        const file = await readFile(path.join(SITE_DIR, sitePath));
        res.writeHead(200, { 'Content-Type': SITE_TYPES[path.extname(sitePath)], 'Content-Length': file.length, 'Cache-Control': sitePath.endsWith('.html') ? 'public, max-age=300' : 'public, max-age=604800' });
        return res.end(file);
      } catch {
        // Pas de site déployé : on retombe sur la page d'état ci-dessous.
      }
    }

    const status = getStatus();
    // Page d'état publique : le strict minimum (pas de version, de mémoire ni de détail interne)
    if (url.pathname.startsWith('/health')) return send(res, 200, { ok: true, discord: status.discord ?? null });
    if (url.pathname !== '/') return send(res, 404, 'introuvable');
    return send(res, 200, `${status.bot ?? 'Bot'} : ${status.discord === 'ready' ? 'en ligne ✅' : 'démarrage…'}`);
  }

  // Lenteurs volontaires (slowloris) : délais maximaux pour recevoir en-têtes et corps
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  server.maxHeadersCount = 100;

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
