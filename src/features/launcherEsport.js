// E-sport : l'IA cherche sur le web le logo d'une équipe ou une image d'une compétition, le serveur vérifie
// que c'est bien une image et la garde (une seule recherche pour tout le monde).
import { getBlob, putBlob, readFresh, writeNow } from '../storage.js';

const OK_TYPES = /^image\/(png|jpeg|webp|svg\+xml|gif)$/;
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const busy = new Map();

async function download(url) {
  if (!/^https:\/\//.test(url)) return null;
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'HistoryLauncher/1.0 (esport images)' } }).catch(() => null);
  const mime = r?.headers.get('content-type')?.split(';')[0].trim() ?? '';
  if (!r?.ok || !OK_TYPES.test(mime)) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length > 800 && buf.length < 4_000_000 ? { buf, mime } : null;
}

/** type : logo (équipe) | bg (fond d'équipe) | event (compétition). */
export async function esportImage(type, name, { ai = null } = {}) {
  if (!['logo', 'bg', 'event'].includes(type) || !String(name).trim()) return null;
  const key = `esport/${type}-${slug(name)}`;
  const have = await getBlob(key).catch(() => null); if (have) return have;
  if (busy.has(key)) return busy.get(key);
  const job = (async () => {
    const miss = (await readFresh('esport-img-miss')) ?? {};
    if (Date.now() - (miss[key] ?? 0) < 86_400_000) return null;
    const chat = ai ?? (await import('../ai/gemini.js')).chat;
    const what = { logo: `the official current logo of the esports organisation "${name}" as a transparent PNG or SVG (the crest/emblem alone, no background)`, bg: `a wide official wallpaper, banner or key visual of the esports organisation "${name}" in its brand colours (like their Twitter/X banner or announcement visuals)`, event: `an official key art or banner image of the esports competition "${name}"` }[type];
    const r = await chat({ tag: 'esport-images', web: true, system: 'You find direct image file URLs on the web. Answer only with JSON.', content: [{ type: 'text', text: `Find ${what}. Return {"urls": [...]} with up to 5 DIRECT image file URLs (ending in .png, .jpg, .webp or .svg, or image CDN links), best first. Prefer liquipedia.net, wikimedia, official sites.` }] }).catch(() => null);
    const urls = String(r?.text ?? '').match(/https:\/\/[^\s"'<>)]+/g) ?? [];
    for (const u of [...new Set(urls)].slice(0, 6)) {
      const img = await download(u);
      if (img) { await putBlob(key, img.buf, img.mime).catch(() => {}); return img; }
    }
    miss[key] = Date.now(); await writeNow('esport-img-miss', miss).catch(() => {});
    return null;
  })().finally(() => busy.delete(key));
  busy.set(key, job);
  return job;
}
