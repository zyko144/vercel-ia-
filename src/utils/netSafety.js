// Protection SSRF : le bot ne va jamais chercher une adresse interne (localhost, réseau privé, métadonnées du
// serveur cloud…) quand une URL vient d'un utilisateur, et les téléchargements sont bornés en taille et en temps.
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const PRIVATE_V4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const v4ToInt = (ip) => ip.split('.').reduce((n, x) => (n << 8) + Number(x), 0) >>> 0;

/** Adresse IP interne, privée, locale ou réservée ? */
export function isPrivateIp(ip) {
  let addr = String(ip).toLowerCase();
  if (addr.startsWith('::ffff:')) addr = addr.slice(7);
  if (net.isIPv4(addr)) {
    const n = v4ToInt(addr);
    return PRIVATE_V4.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  }
  if (net.isIPv6(addr)) {
    return addr === '::' || addr === '::1' || /^f[cd]/.test(addr) || /^fe[89ab]/.test(addr) || addr.startsWith('ff');
  }
  return true; // pas une IP lisible : refusé
}

/**
 * L'URL est-elle sûre à ouvrir ? http(s) seulement, pas d'identifiants dans l'URL, pas de port exotique,
 * et le nom de domaine ne doit pas pointer vers une adresse interne.
 */
export async function isPublicUrl(raw, { hosts = null } = {}) {
  let url;
  try { url = new URL(String(raw)); } catch { return false; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
  if (url.port && !['80', '443'].includes(url.port)) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hosts && !hosts.some((h) => host === h || host.endsWith(`.${h}`))) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false;
  if (net.isIP(host)) return !isPrivateIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

// Hébergeurs de fichiers de Discord (pièces jointes, avatars)
export const DISCORD_CDN = ['cdn.discordapp.com', 'media.discordapp.net', 'images-ext-1.discordapp.net', 'images-ext-2.discordapp.net'];

/**
 * Téléchargement sûr : URL vérifiée (et chaque redirection aussi), taille maximale, délai maximal,
 * type de contenu éventuellement imposé. Renvoie { buf, type } ou lance une erreur.
 */
export async function safeFetch(raw, { hosts = null, maxBytes = 10 * 1024 * 1024, timeout = 15_000, types = null, headers = {} } = {}) {
  let current = String(raw);
  for (let hop = 0; hop < 4; hop++) {
    if (!await isPublicUrl(current, { hosts })) throw new Error('adresse refusée');
    const res = await fetch(current, { redirect: 'manual', headers, signal: AbortSignal.timeout(timeout) });
    const status = res.status ?? (res.ok ? 200 : 500);
    if (status >= 300 && status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).href;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (types && !types.some((t) => (t.endsWith('/') ? type.startsWith(t) : type === t))) throw new Error('type de fichier refusé');
    if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new Error('fichier trop gros');
    if (!res.body?.[Symbol.asyncIterator]) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) throw new Error('fichier trop gros');
      return { buf, type };
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('fichier trop gros');
      chunks.push(chunk);
    }
    return { buf: Buffer.concat(chunks), type };
  }
  throw new Error('trop de redirections');
}
