// Mini serveur HTTP : obligatoire pour un "Web Service" Render + garde le service réveillé.
import http from 'node:http';
import { config } from './config.js';

const KEEP_ALIVE_MS = 10 * 60_000;

export function startHttpServer(getStatus) {
  const server = http.createServer((req, res) => {
    const status = getStatus();
    if (req.url?.startsWith('/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(status));
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`${status.bot ?? 'Bot'} : ${status.discord === 'ready' ? 'en ligne ✅' : 'démarrage…'}`);
  });

  server.listen(config.port, () => console.log(`🌐 Serveur HTTP sur le port ${config.port}`));

  // Render gratuit met le service en veille après 15 min sans visite : on se ping soi-même
  if (config.publicUrl) {
    setInterval(() => {
      fetch(`${config.publicUrl}/health`).catch((err) => console.warn('[keep-alive]', err.message));
    }, KEEP_ALIVE_MS);
    console.log(`⏰ Keep-alive activé sur ${config.publicUrl}/health`);
  }
}
