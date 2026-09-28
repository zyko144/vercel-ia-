// Annonces du launcher sur Discord : à chaque nouvelle version publiée sur GitHub, le bot poste dans le salon
// des mises à jour le numéro de version, les nouveautés (chaque titre en « # » pour écrire en grand) et la capture
// PNG de la nouveauté, avec le lien de téléchargement.
import { AttachmentBuilder } from 'discord.js';
import { load, save } from '../storage.js';
import { broadcast } from './launcherServers.js';

const KEY = 'launcher-annonces';
const REPO = 'zyko144/vercel-ia-';
// Ancien salon (ddv) coupé : tout le launcher est sur son serveur (launcherServers.js). Variable pour en ajouter un.
export const RELEASES_CHANNEL = process.env.LAUNCHER_ANNONCES_SALON || '';

/** Message Discord (2000 caractères max) à partir de la release GitHub. */
export function releaseMessage(rel) {
  const version = String(rel.tag_name ?? '').replace(/^v/, '');
  const setup = (rel.assets ?? []).find((a) => /\.exe$/i.test(a.name));
  let body = String(rel.body ?? '').trim() || `# 🚀 History Launcher v${version} est disponible`;
  if (!body.startsWith('#')) body = `# 🚀 History Launcher v${version}\n${body}`;
  const foot = `\n\n-# Version ${version}${setup ? ` · [Télécharger l’installateur](${setup.browser_download_url})` : ''} · [Site](https://zyko144.github.io/vercel-ia-)`;
  if (body.length + foot.length > 2000) body = `${body.slice(0, 1990 - foot.length).replace(/\n[^\n]*$/, '')}\n…`;
  // Une capture par nouveauté : apercu.png puis apercu-2.png, apercu-3.png… (10 fichiers max sur Discord)
  const rank = (n) => Number(n.match(/^apercu(?:-(\d+))?\.png$/)?.[1] ?? 1);
  const images = (rel.assets ?? []).filter((a) => /^apercu(-\d+)?\.png$/.test(a.name)).sort((a, b) => rank(a.name) - rank(b.name)).slice(0, 10).map((a) => a.browser_download_url);
  return { content: body + foot, image: images[0] ?? null, images, version };
}

/** Dernière version publiée : API GitHub, sinon (limite de 60 appels/h par adresse IP, vite atteinte sur un
 *  hébergeur partagé) directement depuis les fichiers de la release, avec les notes tirées du CHANGELOG. */
/**
 * Dernière version publiée. `want` (ex. « 0.21.1 », donné par GitHub juste après la publication) : on va chercher
 * exactement cette version, sans dépendre de « latest » qui peut encore montrer l'ancienne pendant quelques minutes.
 */
export async function latestRelease(fetchImpl = fetch, want = null) {
  const headers = { 'User-Agent': 'HistoryBot', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const api = want ? `releases/tags/v${want}` : 'releases/latest';
  const r = await fetchImpl(`https://api.github.com/repos/${REPO}/${api}`, { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (r?.ok) { const rel = await r.json().catch(() => null); if (rel?.tag_name && !rel.draft) return rel; }
  const ymlUrl = want ? `https://github.com/${REPO}/releases/download/v${want}/latest.yml` : `https://github.com/${REPO}/releases/latest/download/latest.yml`;
  const y = await fetchImpl(ymlUrl, { redirect: 'follow', signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!y?.ok) return null;
  const v = (await y.text()).match(/^version:\s*([\d.]+)\s*$/m)?.[1];
  if (!v || (want && v !== want)) return null;
  const dl = (f) => `https://github.com/${REPO}/releases/download/v${v}/${f}`;
  const assets = [{ name: 'latest.yml' }, { name: `History-Launcher-Setup-${v}.exe`, browser_download_url: dl(`History-Launcher-Setup-${v}.exe`) }];
  for (let i = 1; i <= 10; i++) {
    const name = i === 1 ? 'apercu.png' : `apercu-${i}.png`;
    const h = await fetchImpl(dl(name), { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!h?.ok) break;
    assets.push({ name, browser_download_url: dl(name) });
  }
  let body = '';
  try { body = (await import('../../tools/launcher-notes.mjs')).notesFor(v); } catch { /* notes indisponibles : titre seul */ }
  return { tag_name: `v${v}`, body, assets };
}

const vnum = (t) => String(t ?? '').replace(/^v/, '').split('.').map(Number).reduce((n, x) => n * 1000 + (x || 0), 0);
async function tick(client, fetchImpl = fetch, want = null) {
  const rel = await latestRelease(fetchImpl, want);
  if (!rel?.tag_name) return false;
  // La release doit être complète (installateur + fichier de mise à jour) avant d'être annoncée
  if (!(rel.assets ?? []).some((a) => a.name === 'latest.yml')) return false;
  const st = (await load(KEY, null)) ?? {};
  // Déjà annoncée, ou plus ancienne que la dernière annonce (« latest » en retard) : rien
  if (st.last === rel.tag_name || (st.last && vnum(rel.tag_name) < vnum(st.last))) return false;
  const channel = RELEASES_CHANNEL ? await client.channels.fetch(RELEASES_CHANNEL).catch(() => null) : null;
  const payload = await releasePayload(rel, fetchImpl);
  if (channel?.isTextBased?.()) await channel.send({ ...payload, allowedMentions: { parse: [] } });
  const sent = await broadcast(client, 'news', payload, channel?.id); // serveur du launcher (et autres serveurs installés)
  if (!channel && !sent) return false; // aucun salon prêt : on réessaie plus tard
  save(KEY, { last: rel.tag_name, at: Date.now() });
  return true;
}
/** Texte + captures d'une version, prêts à envoyer. */
export async function releasePayload(rel, fetchImpl = fetch) {
  const msg = releaseMessage(rel);
  const files = [];
  for (const [i, url] of msg.images.entries()) {
    const img = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (img?.ok) files.push(new AttachmentBuilder(Buffer.from(await img.arrayBuffer()), { name: `history-v${msg.version}${i ? `-${i + 1}` : ''}.png` }));
  }
  return { content: msg.content, files };
}
/** Les n dernières versions complètes, de la plus ancienne à la plus récente (vide si GitHub ne répond pas). */
export async function recentReleases(n = 3, fetchImpl = fetch) {
  const headers = { 'User-Agent': 'HistoryBot', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const r = await fetchImpl(`https://api.github.com/repos/${REPO}/releases?per_page=15`, { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const list = r?.ok ? await r.json().catch(() => []) : [];
  return (Array.isArray(list) ? list : []).filter((x) => !x.draft && /^v\d/.test(x.tag_name) && (x.assets ?? []).some((a) => a.name === 'latest.yml')).slice(0, n).reverse();
}
let clientRef = null;
let lastTrigger = 0;
/** Appelé par GitHub juste après la publication d'une version (le bot n'attend pas sa vérification suivante). */
export async function announceNow(version = null) {
  if (!clientRef) return { ok: false, error: 'bot pas encore prêt' };
  const want = /^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(String(version ?? '')) ? String(version) : null;
  if (Date.now() - lastTrigger < 10_000) return { ok: true, skipped: true };
  lastTrigger = Date.now();
  const posted = await tick(clientRef, fetch, want);
  const st = (await load(KEY, null)) ?? {};
  // « already » : cette version est déjà dans le salon (GitHub arrête alors de réessayer)
  return { ok: true, posted, already: Boolean(want && st.last === `v${want}`), last: st.last ?? null };
}

export function startLauncherReleases(client) {
  clientRef = client;
  const run = () => tick(client).catch((err) => console.warn('[annonces launcher]', err.message));
  setTimeout(run, 60_000).unref();
  setInterval(run, 10 * 60_000).unref();
}
export const _test = { tick, vnum };
