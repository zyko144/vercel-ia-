// Réseau : latence réelle vers les services de jeu et vitesse des serveurs DNS (mesurées, médiane de 3 essais).
import { promises as dns } from 'node:dns';
import https from 'node:https';

export const HOSTS = [
  ['Steam', 'store.steampowered.com'], ['Epic Games', 'www.epicgames.com'], ['Riot Games', 'www.riotgames.com'],
  ['Discord', 'discord.com'], ['Cloudflare', 'www.cloudflare.com'], ['Google', 'www.google.com'],
];
export const DNS_SERVERS = [['Cloudflare', '1.1.1.1'], ['Google', '8.8.8.8'], ['Quad9', '9.9.9.9'], ['OpenDNS', '208.67.222.222']];
export const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** Temps de connexion TCP vers un site (ms), sans télécharger la page. */
function connectTime(host, timeout = 4000) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const req = https.request({ host, method: 'HEAD', path: '/', timeout, agent: false }, (res) => { res.resume(); });
    req.on('socket', (s) => s.once('connect', () => { resolve(Math.round(performance.now() - t0)); req.destroy(); }));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}
export async function pingHosts(hosts = HOSTS) {
  return Promise.all(hosts.map(async ([name, host]) => {
    const tries = [];
    for (let i = 0; i < 3; i++) tries.push(await connectTime(host));
    return { name, host, ms: median(tries) };
  }));
}

async function resolveTime(server, name) {
  const r = new dns.Resolver({ timeout: 2500, tries: 1 });
  if (server) r.setServers([server]);
  const t0 = performance.now();
  try { await r.resolve4(name); return Math.round(performance.now() - t0); } catch { return null; }
}
/** Vitesse de chaque DNS (y compris celui du PC) sur des noms variés pour éviter le cache. */
export async function dnsTest(servers = DNS_SERVERS) {
  const names = ['www.wikipedia.org', 'store.steampowered.com', 'www.reddit.com'];
  const all = [['Ton DNS actuel', null], ...servers];
  const out = [];
  for (const [name, ip] of all) {
    const tries = [];
    for (const n of names) tries.push(await resolveTime(ip, n));
    out.push({ name, ip, ms: median(tries) });
  }
  const current = out[0];
  const best = out.slice(1).filter((x) => x.ms != null).sort((a, b) => a.ms - b.ms)[0] ?? null;
  return { list: out, best, gain: current.ms != null && best ? current.ms - best.ms : null };
}

/** Débit internet réel : téléchargement puis envoi vers Cloudflare (serveur le plus proche), en mégabits par seconde. */
export async function speedTest(fetchImpl = fetch) {
  const t0 = performance.now();
  const down = await fetchImpl('https://speed.cloudflare.com/__down?bytes=25000000', { signal: AbortSignal.timeout(25_000) }).then((r) => r.arrayBuffer()).catch(() => null);
  const t1 = performance.now();
  const body = new Uint8Array(8_000_000);
  const up = await fetchImpl('https://speed.cloudflare.com/__up', { method: 'POST', body, signal: AbortSignal.timeout(25_000) }).then((r) => r.ok).catch(() => false);
  const t2 = performance.now();
  const mbps = (bytes, ms) => Math.round((bytes * 8) / (ms / 1000) / 1e6);
  return { down: down ? mbps(down.byteLength, t1 - t0) : null, up: up ? mbps(body.length, t2 - t1) : null };
}
