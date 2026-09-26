// Au quotidien : résumé de la semaine, temps de jeu du jour (limite et pauses), actus et notes de mise à jour
// des jeux Steam, couleur principale d'une image (thème automatique).
import { dayKey } from './tracker.js';

const DAY = 86_400_000;
/** Lundi (00:00, heure locale) de la semaine qui contient t. */
export function mondayOf(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Résumé de la semaine écoulée (lundi → dimanche) comparée à la précédente. */
export function weeklyRecap(days, items, now = Date.now()) {
  const thisMonday = mondayOf(now);
  const sum = (from) => {
    const byItem = {};
    let games = 0;
    for (let i = 0; i < 7; i++) {
      const d = days?.[dayKey(from + i * DAY + 12 * 3_600_000)];
      if (!d) continue;
      games += d.jeux ?? 0;
      for (const [id, m] of Object.entries(d.items ?? {})) byItem[id] = (byItem[id] ?? 0) + m;
    }
    return { games, byItem };
  };
  const last = sum(thisMonday - 7 * DAY);
  const before = sum(thisMonday - 14 * DAY);
  const top = Object.entries(last.byItem).map(([id, m]) => ({ item: items.find((i) => i.id === id), m })).filter((x) => x.item?.kind === 'game').sort((a, b) => b.m - a.m);
  return {
    week: dayKey(thisMonday - 7 * DAY + 12 * 3_600_000), minutes: Math.round(last.games), previous: Math.round(before.games),
    change: before.games ? Math.round(((last.games - before.games) / before.games) * 100) : null,
    top: top.slice(0, 3).map((x) => ({ id: x.item.id, name: x.item.name, minutes: Math.round(x.m) })), count: top.length,
  };
}

/** Minutes de jeu aujourd'hui (d'après le suivi du launcher). */
export const todayGameMinutes = (days, now = Date.now()) => Math.round(days?.[dayKey(now)]?.jeux ?? 0);

/** Rappels : limite du jour dépassée (une fois par jour), pause toutes les N minutes de partie. */
export function playReminders({ today, limit, sessionMinutes, breakEvery }, sent = {}, now = Date.now()) {
  const out = [];
  const key = dayKey(now);
  if (limit > 0 && today >= limit && sent.limit !== key) { sent.limit = key; out.push({ kind: 'limit', text: `Tu as joué ${Math.floor(today / 60)} h ${String(today % 60).padStart(2, '0')} aujourd’hui : ta limite est atteinte.` }); }
  if (breakEvery > 0 && sessionMinutes >= breakEvery) {
    const step = Math.floor(sessionMinutes / breakEvery);
    if ((sent.breakStep ?? 0) < step) { sent.breakStep = step; out.push({ kind: 'pause', text: `Ça fait ${Math.round(sessionMinutes)} min que tu joues : petite pause pour les yeux et une gorgée d’eau ?` }); }
  } else if (!sessionMinutes) sent.breakStep = 0;
  return out;
}

// ===================== Actus et notes de mise à jour (Steam) =====================

/** Texte lisible d'une actu Steam (BBCode et HTML retirés). */
export function cleanNews(text, max = 220) {
  const t = String(text ?? '').replace(/\[(img|previewyoutube|video)[^\]]*\].*?\[\/\1\]/gis, ' ').replace(/\[\/?[^\]]+\]/g, ' ').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\{STEAM_CLAN_IMAGE\}\S*/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
}
export async function steamNews(appid, count = 3, fetchImpl = fetch) {
  if (!/^\d{1,8}$/.test(String(appid))) return [];
  const r = await fetchImpl(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=${count}&maxlength=800&format=json`, { signal: AbortSignal.timeout(10_000) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  return (r?.appnews?.newsitems ?? []).filter((n) => /^\d+$/.test(String(n.gid))).map((n) => ({
    appid: String(appid), gid: String(n.gid), title: cleanNews(n.title, 120), text: cleanNews(n.contents), at: (n.date ?? 0) * 1000,
    patch: (n.tags ?? []).includes('patchnotes') || /patch|update|mise à jour|hotfix/i.test(n.title ?? ''),
  }));
}

// ===================== Couleur principale d'une image =====================

/** Couleur dominante (vive) d'une image en pixels BGRA, pour le thème automatique. */
export function dominantColor(bgra) {
  let r = 0; let g = 0; let b = 0; let w = 0;
  for (let i = 0; i + 3 < bgra.length; i += 4) {
    const B = bgra[i]; const G = bgra[i + 1]; const R = bgra[i + 2];
    const max = Math.max(R, G, B); const min = Math.min(R, G, B);
    const sat = max ? (max - min) / max : 0;
    if (max < 40 || sat < 0.25) continue; // on ignore le noir, le blanc et les gris
    const weight = sat * sat * max;
    r += R * weight; g += G * weight; b += B * weight; w += weight;
  }
  if (!w) return null;
  const hex = (v) => Math.round(v / w).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Traduit en français les actus qui ne le sont pas (IA), en gardant les traductions déjà faites. */
export async function translateNews(ai, list, cache = {}) {
  const todo = list.filter((n) => !cache[n.gid] && !looksFrench(`${n.title} ${n.text}`));
  if (ai && todo.length) {
    const r = await ai.ask({
      schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { gid: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' } }, required: ['gid', 'title', 'text'] } } }, required: ['items'] },
      system: 'Tu traduis en français naturel des actus de jeux vidéo. Garde les noms propres (jeux, cartes, modes). Réponse courte et fidèle, sans rien ajouter.',
      text: JSON.stringify(todo.slice(0, 12).map(({ gid, title, text }) => ({ gid, title, text }))),
    }).catch(() => null);
    for (const t of r?.items ?? []) if (todo.some((n) => n.gid === t.gid) && t.title) cache[t.gid] = { title: cleanNews(t.title, 140), text: cleanNews(t.text, 260) };
  }
  return list.map((n) => (cache[n.gid] ? { ...n, ...cache[n.gid], fr: true } : n));
}
/** Texte déjà en français ? (mots très fréquents) */
export function looksFrench(text) {
  const words = String(text).toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ]+/g) ?? [];
  if (words.length < 4) return false;
  const fr = words.filter((w) => /^(le|la|les|des|du|de|et|est|une|un|pour|avec|dans|sur|nous|vous|nouveau|nouvelle|mise|jour|pas|plus|au|aux|ce|cette)$/.test(w)).length;
  return fr / words.length > 0.12;
}
