// Vidéos de présentation (History Launcher et History Clips) : postées une seule fois par salon, avec @everyone.
// La vidéo est jointe si le serveur accepte sa taille (boost), sinon lien vers la vidéo et vers la page du site.
import { AttachmentBuilder } from 'discord.js';
import { load, save } from '../storage.js';

const KEY = 'promo-videos';
const SITE = 'https://zyko144.github.io/vercel-ia-';
const file = (name) => `https://github.com/zyko144/vercel-ia-/releases/download/clips-latest/${name}`;
export const VIDEOS = [
  { title: '🚀 History Launcher', name: 'History.Launcher.mp4', page: `${SITE}/#video` },
  { title: '🎬 History Clips', name: 'History.Clips.mp4', page: `${SITE}/clips/#video` },
];
export const promoMessage = () => ['@everyone', '# 🎥 Les vidéos de présentation sont là !',
  ...VIDEOS.map((v) => `## ${v.title}\n▶ [Voir la vidéo](${v.page}) · [Télécharger la vidéo](${file(v.name)})`)].join('\n');

/** Poste les deux vidéos dans ce salon (une seule fois, même après un redémarrage). */
export async function postPromoVideos(channel) {
  if (!channel?.send) return false;
  const done = (await load(KEY, null)) ?? [];
  if (done.includes(channel.id)) return false;
  const base = { content: promoMessage(), allowedMentions: { parse: ['everyone'] } };
  const files = [];
  for (const v of VIDEOS) {
    const r = await fetch(file(v.name), { redirect: 'follow', signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (r?.ok) files.push(new AttachmentBuilder(Buffer.from(await r.arrayBuffer()), { name: v.name }));
  }
  // Vidéos trop lourdes pour ce serveur : le message part avec les liens seuls
  const sent = (files.length && await channel.send({ ...base, files }).catch(() => null)) || await channel.send(base).catch((err) => { console.warn('[vidéos] envoi :', err.message); return null; });
  if (sent) await save(KEY, [...done, channel.id]);
  return Boolean(sent);
}
