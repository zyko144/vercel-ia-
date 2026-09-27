// Annonces du launcher sur Discord : à chaque nouvelle version publiée sur GitHub, le bot poste dans le salon
// des mises à jour le numéro de version, les nouveautés (chaque titre en « # » pour écrire en grand) et la capture
// PNG de la nouveauté, avec le lien de téléchargement.
import { AttachmentBuilder } from 'discord.js';
import { load, save } from '../storage.js';

const KEY = 'launcher-annonces';
const REPO = 'zyko144/vercel-ia-';
export const RELEASES_CHANNEL = process.env.LAUNCHER_ANNONCES_SALON || '1553051501578948769';

/** Message Discord (2000 caractères max) à partir de la release GitHub. */
export function releaseMessage(rel) {
  const version = String(rel.tag_name ?? '').replace(/^v/, '');
  const setup = (rel.assets ?? []).find((a) => /\.exe$/i.test(a.name));
  let body = String(rel.body ?? '').trim() || `# 🚀 History Launcher v${version} est disponible`;
  if (!body.startsWith('#')) body = `# 🚀 History Launcher v${version}\n${body}`;
  const foot = `\n\n-# Version ${version}${setup ? ` · [Télécharger l’installateur](${setup.browser_download_url})` : ''} · [Site](https://historylauncher.vercel.app)`;
  if (body.length + foot.length > 2000) body = `${body.slice(0, 1990 - foot.length).replace(/\n[^\n]*$/, '')}\n…`;
  // Une capture par nouveauté : apercu.png puis apercu-2.png, apercu-3.png… (10 fichiers max sur Discord)
  const rank = (n) => Number(n.match(/^apercu(?:-(\d+))?\.png$/)?.[1] ?? 1);
  const images = (rel.assets ?? []).filter((a) => /^apercu(-\d+)?\.png$/.test(a.name)).sort((a, b) => rank(a.name) - rank(b.name)).slice(0, 10).map((a) => a.browser_download_url);
  return { content: body + foot, image: images[0] ?? null, images, version };
}

/** Dernière version publiée : API GitHub, sinon (limite de 60 appels/h par adresse IP, vite atteinte sur un
 *  hébergeur partagé) directement depuis les fichiers de la release, avec les notes tirées du CHANGELOG. */
export async function latestRelease(fetchImpl = fetch) {
  const headers = { 'User-Agent': 'HistoryBot', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const r = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (r?.ok) { const rel = await r.json().catch(() => null); if (rel?.tag_name && !rel.draft) return rel; }
  const y = await fetchImpl(`https://github.com/${REPO}/releases/latest/download/latest.yml`, { redirect: 'follow', signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!y?.ok) return null;
  const v = (await y.text()).match(/^version:\s*([\d.]+)\s*$/m)?.[1];
  if (!v) return null;
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

async function tick(client, fetchImpl = fetch) {
  const rel = await latestRelease(fetchImpl);
  if (!rel?.tag_name) return false;
  // La release doit être complète (installateur + fichier de mise à jour) avant d'être annoncée
  if (!(rel.assets ?? []).some((a) => a.name === 'latest.yml')) return false;
  const st = (await load(KEY, null)) ?? {};
  if (st.last === rel.tag_name) return false;
  const channel = await client.channels.fetch(RELEASES_CHANNEL).catch(() => null);
  if (!channel?.isTextBased?.()) { console.warn('[annonces launcher] salon introuvable ou inaccessible :', RELEASES_CHANNEL); return false; }
  const msg = releaseMessage(rel);
  const files = [];
  for (const [i, url] of msg.images.entries()) {
    const img = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (img?.ok) files.push(new AttachmentBuilder(Buffer.from(await img.arrayBuffer()), { name: `history-v${msg.version}${i ? `-${i + 1}` : ''}.png` }));
  }
  await channel.send({ content: msg.content, files, allowedMentions: { parse: [] } });
  save(KEY, { last: rel.tag_name, at: Date.now() });
  return true;
}
let clientRef = null;
let lastTrigger = 0;
/** Appelé par GitHub juste après la publication d'une version (le bot n'attend pas sa vérification suivante). */
export async function announceNow() {
  if (!clientRef) return { ok: false, error: 'bot pas encore prêt' };
  if (Date.now() - lastTrigger < 20_000) return { ok: true, skipped: true };
  lastTrigger = Date.now();
  return { ok: true, posted: await tick(clientRef) };
}

export function startLauncherReleases(client) {
  clientRef = client;
  const run = () => tick(client).catch((err) => console.warn('[annonces launcher]', err.message));
  setTimeout(run, 60_000).unref();
  setInterval(run, 10 * 60_000).unref();
}
export const _test = { tick };
