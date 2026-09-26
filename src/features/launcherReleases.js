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
  const foot = `\n\n-# Version ${version}${setup ? ` · [Télécharger l’installateur](${setup.browser_download_url})` : ''}`;
  if (body.length + foot.length > 2000) body = `${body.slice(0, 1990 - foot.length).replace(/\n[^\n]*$/, '')}\n…`;
  return { content: body + foot, image: (rel.assets ?? []).find((a) => a.name === 'apercu.png')?.browser_download_url ?? null, version };
}

async function tick(client, fetchImpl = fetch) {
  const r = await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'HistoryBot', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return;
  const rel = await r.json();
  if (!rel?.tag_name || rel.draft) return;
  // La release doit être complète (installateur + fichier de mise à jour) avant d'être annoncée
  if (!(rel.assets ?? []).some((a) => a.name === 'latest.yml')) return;
  const st = (await load(KEY, null)) ?? {};
  if (st.last === rel.tag_name) return;
  const channel = await client.channels.fetch(RELEASES_CHANNEL).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  const msg = releaseMessage(rel);
  const files = [];
  if (msg.image) {
    const img = await fetchImpl(msg.image, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (img?.ok) files.push(new AttachmentBuilder(Buffer.from(await img.arrayBuffer()), { name: `history-v${msg.version}.png` }));
  }
  await channel.send({ content: msg.content, files, allowedMentions: { parse: [] } });
  save(KEY, { last: rel.tag_name, at: Date.now() });
}

export function startLauncherReleases(client) {
  const run = () => tick(client).catch((err) => console.warn('[annonces launcher]', err.message));
  setTimeout(run, 60_000).unref();
  setInterval(run, 10 * 60_000).unref();
}
export const _test = { tick };
