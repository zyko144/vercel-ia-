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

// Actus et effectif d'une équipe : l'IA lit les sites e-sport (Liquipedia, HLTV, VLR, sites officiels…), résumé gardé 6 h.
const infoCache = new Map();
export async function esportInfo(team, game, { ai = null } = {}) {
  team = String(team).slice(0, 60); game = String(game).slice(0, 40);
  if (!team.trim()) return null;
  const key = `${slug(team)}|${slug(game)}`, hit = infoCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3_600_000) return hit.data;
  const chat = ai ?? (await import('../ai/gemini.js')).chat;
  const r = await chat({ tag: 'esport-actus', web: true, system: 'Tu es un journaliste e-sport. Tu réponds uniquement en JSON valide, en français, avec des faits vérifiés sur le web (aucune invention).', content: [{ type: 'text', text: `Équipe : ${team} (${game}). Cherche sur les sites e-sport (Liquipedia, HLTV, VLR.gg, Dexerto, sites et réseaux officiels) :
1) ses 5 dernières actualités (résultats, transferts, annonces) : titre court, résumé d'une phrase, date (AAAA-MM-JJ), lien de l'article, et l'URL directe d'une image de l'article si elle existe ;
2) son effectif actuel sur ${game} : pseudo, rôle, pays.
Réponds {"news":[{"title":"","summary":"","date":"","url":"","image":""}],"players":[{"name":"","role":"","country":""}]}` }] }).catch(() => null);
  let data = null;
  try { data = JSON.parse(String(r?.text ?? '').replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')); } catch { /* réponse illisible */ }
  if (!data) return hit?.data ?? null;
  const https = (u) => (/^https:\/\/[^\s"'<>]+$/.test(String(u ?? '')) ? String(u) : '');
  data = {
    news: (Array.isArray(data.news) ? data.news : []).slice(0, 6).map((n) => ({ title: String(n.title ?? '').slice(0, 140), summary: String(n.summary ?? '').slice(0, 300), date: String(n.date ?? '').slice(0, 10), url: https(n.url), image: https(n.image) })).filter((n) => n.title),
    players: (Array.isArray(data.players) ? data.players : []).slice(0, 8).map((p) => ({ name: String(p.name ?? '').slice(0, 40), role: String(p.role ?? '').slice(0, 30), country: String(p.country ?? '').slice(0, 20) })).filter((p) => p.name),
    sources: (r?.sources ?? []).slice(0, 5),
  };
  infoCache.set(key, { at: Date.now(), data });
  return data;
}
