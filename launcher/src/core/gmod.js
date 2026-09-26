// Addons Garry's Mod : ceux installés (dossier addons + Workshop), fiche d'un addon du Workshop à partir de son
// lien, et installation par Steam (abonnement : Steam le télécharge et le tient à jour, comme depuis le Workshop).
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const GMOD_APPID = '4000';

/** Numéro d'un addon à partir d'un lien du Workshop ou du numéro seul. */
export function workshopId(input) {
  const s = String(input ?? '').trim();
  const m = s.match(/[?&]id=(\d{6,12})/) ?? s.match(/^(\d{6,12})$/);
  return m ? m[1] : null;
}

/** Addons présents : fichiers .gma / dossiers dans garrysmod/addons, et contenus du Workshop téléchargés par Steam. */
export async function installedAddons(installDir, steamappsDir) {
  const out = [];
  const addons = path.join(installDir ?? '', 'garrysmod', 'addons');
  for (const e of await readdir(addons, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory() || /\.gma$/i.test(e.name)) out.push({ name: e.name.replace(/\.gma$/i, ''), where: 'addons' });
  }
  const ws = path.join(steamappsDir ?? path.join(installDir ?? '', '..', '..'), 'workshop', 'content', GMOD_APPID);
  for (const e of await readdir(ws, { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory() || !/^\d+$/.test(e.name)) continue;
    const s = await stat(path.join(ws, e.name)).catch(() => null);
    out.push({ id: e.name, name: `Workshop ${e.name}`, where: 'workshop', at: s?.mtimeMs ?? 0 });
  }
  return out;
}

export function parseDetails(json) {
  const d = json?.response?.publishedfiledetails?.[0];
  if (!d || d.result !== 1) return null;
  return {
    id: String(d.publishedfileid), title: String(d.title ?? '').slice(0, 120), preview: /^https:\/\//.test(d.preview_url ?? '') ? d.preview_url : null,
    size: Number(d.file_size) || 0, subs: Number(d.lifetime_subscriptions ?? d.subscriptions) || 0, favs: Number(d.lifetime_favorited ?? d.favorited) || 0,
    updated: Number(d.time_updated) * 1000 || null, gmod: String(d.consumer_app_id ?? d.creator_app_id) === GMOD_APPID,
    tags: (d.tags ?? []).map((t) => String(t.tag)).slice(0, 6),
  };
}

export async function workshopDetails(id, fetchImpl = fetch) {
  const body = new URLSearchParams({ itemcount: '1', 'publishedfileids[0]': id });
  const r = await fetchImpl('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Workshop ${r.status}`);
  return parseDetails(await r.json());
}
