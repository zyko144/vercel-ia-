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
export async function esportImage(type, name, { ai = null, jeu = '', pseudo = '' } = {}) {
  if (!['logo', 'bg', 'event', 'joueur'].includes(type) || !String(name).trim()) return null;
  const key = `esport/${type}-${slug(name)}`;
  const have = await getBlob(key).catch(() => null); if (have) return have;
  if (busy.has(key)) return busy.get(key);
  const job = (async () => {
    const miss = (await readFresh('esport-img-miss')) ?? {};
    if (Date.now() - (miss[key] ?? 0) < 6 * 3_600_000) return null;
    if (jeu && (type === 'joueur' || type === 'event')) { // d'abord la photo / l'affiche de sa page Liquipedia
      for (const u of [await lpImage(jeu, type === 'joueur' ? pseudo || name : name).catch(() => '')].filter(Boolean)) {
        const img = await download(u);
        if (img) { await putBlob(key, img.buf, img.mime).catch(() => {}); return img; }
      }
    }
    const chat = ai ?? (await import('../ai/gemini.js')).chat;
    const what = { logo: `the official current logo of the esports organisation "${name}" as a transparent PNG or SVG (the crest/emblem alone, no background)`, bg: `a wide official wallpaper, banner or key visual of the esports organisation "${name}" in its brand colours (like their Twitter/X banner or announcement visuals)`, event: `an official key art or banner image of the esports competition "${name}"`, joueur: `an official headshot photo of the professional esports player "${name}" (team photoshoot portrait, face visible), as used on Liquipedia, HLTV, VLR.gg or the team's site` }[type];
    const r = await chat({ tag: 'esport-images', web: true, system: 'You find direct image file URLs on the web. Answer only with JSON.', content: [{ type: 'text', text: `Find ${what}. Return {"urls": [...]} with up to 5 DIRECT image file URLs (ending in .png, .jpg, .webp or .svg, or image CDN links), high resolution (at least 1000 px wide for photos and banners), best first. Prefer liquipedia.net, wikimedia, official sites.` }] }).catch(() => null);
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

// Liquipedia (API publique : 1 requête / 2 s, « parse » 1 / 30 s, gzip + User-Agent obligatoires) : source fiable donnée à l'IA
const WIKI = { 'rocket league': 'rocketleague', 'rainbow six': 'rainbowsix', 'rainbow six siege': 'rainbowsix', 'counter-strike 2': 'counterstrike', cs2: 'counterstrike', valorant: 'valorant', 'league of legends': 'leagueoflegends' };
const lpNext = { q: 0, parse: 0 };
async function lpGet(wiki, q) {
  const k = q.startsWith('action=parse') ? 'parse' : 'q', wait = Math.max(0, lpNext[k] - Date.now()); lpNext[k] = Date.now() + wait + (k === 'parse' ? 30_500 : 2100);
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const r = await fetch(`https://liquipedia.net/${wiki}/api.php?format=json&formatversion=2&${q}`, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'HistoryLauncher/1.0 (https://zyko144.github.io/vercel-ia-/)', 'Accept-Encoding': 'gzip' } }).catch(() => null);
  return r?.ok ? r.json().catch(() => null) : null;
}
const lpCache = new Map();
const lpUrl = (jeu, nom) => { const w = WIKI[String(jeu).toLowerCase().split(',')[0].trim()]; return w && nom ? `https://liquipedia.net/${w}/${encodeURI(String(nom).trim().replace(/ /g, '_'))}` : ''; };
/** JSON de la réponse IA, même entouré de texte, de ``` ou de renvois [1] en fin. */
export function looseJson(t) {
  const s = String(t ?? '').replace(/```(json)?/gi, ''), i = s.indexOf('{'); if (i < 0) return null;
  for (let j = s.lastIndexOf('}'), n = 0; j > i && n < 60; j = s.lastIndexOf('}', j - 1), n++) { try { return JSON.parse(s.slice(i, j + 1)); } catch { /* on raccourcit */ } }
  return null;
}
// Sites officiels lus pour les actus de chaque jeu
const OFFICIAL = { 'rocket league': 'https://www.rocketleague.com/competitive', 'rainbow six siege': 'https://www.ubisoft.com/en-us/esports/rainbow-six/siege', 'counter-strike 2': 'https://www.hltv.org/', valorant: 'https://valorantesports.com/', 'league of legends': 'https://lolesports.com/' };
async function pageCtx(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { 'User-Agent': 'Mozilla/5.0 HistoryLauncher/1.0' } }).catch(() => null);
  const html = r?.ok ? await r.text().catch(() => '') : ''; if (!html) return '';
  const abs = (u) => { try { return new URL(u.replace(/&amp;/g, '&'), url).href; } catch { return ''; } };
  const imgs = [...new Set([...html.matchAll(/(?:src|content|data-src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/gi)].map((m) => abs(m[1])).filter((u) => u.startsWith('https://')))].slice(0, 40);
  const text = html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, '').replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, (_, h) => ` [${abs(h)}] `).replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').slice(0, 25_000);
  return `\n\nPage officielle ${url} :\n${text}\nImages de la page : ${imgs.join(' ')}`;
}
/** Image principale d'une page (photo du joueur, affiche de la compétition), sans lire toute la page. */
async function lpImage(jeu, nom) {
  const wiki = WIKI[String(jeu).toLowerCase().trim()]; if (!wiki || !nom) return '';
  const title = (await lpGet(wiki, `action=opensearch&limit=1&search=${encodeURIComponent(nom)}`))?.[1]?.[0]; if (!title) return '';
  const r = await lpGet(wiki, `action=query&prop=pageimages&piprop=original&redirects=1&titles=${encodeURIComponent(title)}`);
  return r?.query?.pages?.[0]?.original?.source ?? '';
}
/** Page Liquipedia la plus proche de « nom » sur le wiki du jeu : texte lisible + images. */
export async function liquipedia(jeu, nom) {
  const wiki = WIKI[String(jeu).toLowerCase().split(',')[0].trim()]; if (!wiki || !nom) return null;
  const key = `${wiki}|${slug(nom)}`, hit = lpCache.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.data;
  const title = String(nom).trim().replace(/ /g, '_');
  if (lpNext.parse - Date.now() > 8000) return null; // file d'attente trop longue : l'IA lira la page elle-même
  const page = await lpGet(wiki, `action=parse&redirects=1&prop=text&page=${encodeURIComponent(title)}`);
  const html = String(page?.parse?.text ?? ''); if (!html) return null;
  const images = [...new Set([...html.matchAll(/src="(\/commons\/images\/[^"]+\.(?:png|jpe?g|webp))"/gi)].map((m) => `https://liquipedia.net${m[1].replace(/\/thumb(\/.+?\.(?:png|jpe?g|webp))\/[^/]+$/i, '$1')}`))].slice(0, 30);
  const main = html.match(/infobox-image[\s\S]{0,600}?src="(\/commons\/images\/[^"]+)"/i)?.[1]?.replace(/\/thumb(\/.+?\.(?:png|jpe?g|webp))\/[^/]+$/i, '$1');
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<(br|\/tr|\/p|\/li|\/h\d|\/div)[^>]*>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').slice(0, 20_000);
  const data = { url: `https://liquipedia.net/${wiki}/${encodeURIComponent(title.replace(/ /g, '_'))}`, title, text, images, main: main ? `https://liquipedia.net${main}` : '' };
  lpCache.set(key, { at: Date.now(), data });
  return data;
}

// Fiches e-sport (équipe, joueur, compétition) : l'IA lit les sites e-sport (Liquipedia, HLTV, VLR, Dexerto, sites officiels)
// et renvoie un résumé structuré, gardé en mémoire pour tout le monde. Rien n'est inventé : champ vide si inconnu.
const infoCache = new Map();
const S = (v, n = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const URL_OK = (u) => (/^https:\/\/[^\s"'<>]+$/.test(String(u ?? '')) ? String(u) : '');
const list = (v, n, f) => (Array.isArray(v) ? v : []).slice(0, n).map(f).filter((x) => Object.values(x).some(Boolean));
const KINDS = {
  equipe: {
    ttl: 2 * 3_600_000,
    ask: ({ nom, jeu }) => `Équipe e-sport « ${nom} » sur ${jeu}. Donne :
- team : fondation (année), région, pays, coach, manager, gains cumulés sur ce jeu, classement mondial actuel si connu, présentation (3 phrases), palmarès (10 titres max : tournoi + année + place), réseaux (site, twitter/x, twitch, youtube : liens https).
- players : effectif actuel complet sur ${jeu} (titulaires + remplaçants + coach si rôle) : pseudo, vrai nom, rôle, pays, âge, date d'arrivée dans l'équipe.
- results : 8 derniers matchs (date AAAA-MM-JJ, compétition, adversaire, score, victoire true/false).
- upcoming : prochains matchs annoncés (date, compétition, adversaire).
- news : 5 dernières actus (titre, résumé d'une phrase, date, lien, image https directe si elle existe).
JSON : {"team":{"founded":"","region":"","country":"","coach":"","manager":"","earnings":"","ranking":"","about":"","titles":[{"event":"","year":"","place":""}],"links":{"site":"","twitter":"","twitch":"","youtube":""}},"players":[{"name":"","realName":"","role":"","country":"","age":"","joined":""}],"results":[{"date":"","event":"","opponent":"","score":"","win":true}],"upcoming":[{"date":"","event":"","opponent":""}],"news":[{"title":"","summary":"","date":"","url":"","image":""}]}`,
    clean: (d) => ({
      team: { ...Object.fromEntries(['founded', 'region', 'country', 'coach', 'manager', 'earnings', 'ranking'].map((k) => [k, S(d.team?.[k], 60)])), about: S(d.team?.about, 700), titles: list(d.team?.titles, 10, (t) => ({ event: S(t.event, 80), year: S(t.year, 10), place: S(t.place, 20) })), links: Object.fromEntries(['site', 'twitter', 'twitch', 'youtube'].map((k) => [k, URL_OK(d.team?.links?.[k])])) },
      players: list(d.players, 12, (p) => ({ name: S(p.name, 40), realName: S(p.realName, 60), role: S(p.role, 30), country: S(p.country, 30), age: S(p.age, 10), joined: S(p.joined, 20) })),
      results: list(d.results, 10, (r) => ({ date: S(r.date, 10), event: S(r.event, 80), opponent: S(r.opponent, 50), score: S(r.score, 15), win: r.win === true })),
      upcoming: list(d.upcoming, 6, (r) => ({ date: S(r.date, 16), event: S(r.event, 80), opponent: S(r.opponent, 50) })),
      news: list(d.news, 6, (n) => ({ title: S(n.title, 140), summary: S(n.summary, 300), date: S(n.date, 10), url: URL_OK(n.url), image: URL_OK(n.image) })),
    }),
  },
  joueur: {
    ttl: 12 * 3_600_000,
    ask: ({ nom, equipe, jeu }) => `Joueur e-sport « ${nom} » (${equipe}, ${jeu}). Donne : vrai nom, date de naissance, âge, pays, rôle, équipe actuelle, présentation (3 phrases), parcours (équipes : nom + de + à), palmarès (10 max : tournoi + année + place), stats clés connues (ex. rating, K/D, ACS : libellé + valeur, 6 max), réglages connus (ex. sensibilité, DPI, caméra, résolution : libellé + valeur, 6 max), réseaux (twitter/x, twitch, youtube : liens https), photo (URL https directe d'une photo officielle si elle existe).
JSON : {"realName":"","born":"","age":"","country":"","role":"","team":"","about":"","photo":"","history":[{"team":"","from":"","to":""}],"titles":[{"event":"","year":"","place":""}],"stats":[{"label":"","value":""}],"settings":[{"label":"","value":""}],"links":{"twitter":"","twitch":"","youtube":""}}`,
    clean: (d) => ({ ...Object.fromEntries(['realName', 'born', 'age', 'country', 'role', 'team'].map((k) => [k, S(d[k], 60)])), about: S(d.about, 700), photo: URL_OK(d.photo), history: list(d.history, 12, (h) => ({ team: S(h.team, 50), from: S(h.from, 12), to: S(h.to, 12) })), titles: list(d.titles, 10, (t) => ({ event: S(t.event, 80), year: S(t.year, 10), place: S(t.place, 20) })), stats: list(d.stats, 6, (x) => ({ label: S(x.label, 30), value: S(x.value, 30) })), settings: list(d.settings, 6, (x) => ({ label: S(x.label, 30), value: S(x.value, 40) })), links: Object.fromEntries(['twitter', 'twitch', 'youtube'].map((k) => [k, URL_OK(d.links?.[k])])) }),
  },
  actus: {
    ttl: 30 * 60_000,
    ask: ({ jeu }) => `E-sport ${jeu}, nous sommes le ${new Date().toISOString().slice(0, 10)}. Donne :
- news : les 8 actus les plus récentes (dernières 48 h si possible, priorité aux compétitions en cours, résultats, transferts) : titre, résumé d'une phrase, jeu, date AAAA-MM-JJ, lien de l'article, image (URL https directe de la grande image de l'article, og:image, au moins 1200 px de large).
- results : les 12 derniers matchs pros joués (date, compétition, équipe A, équipe B, score « 4-2 », phase).
- upcoming : les 10 prochains matchs pros (date et heure ISO 8601 UTC, compétition, équipe A, équipe B, phase).
JSON : {"news":[{"title":"","summary":"","game":"","date":"","url":"","image":""}],"results":[{"date":"","event":"","a":"","b":"","score":"","stage":""}],"upcoming":[{"date":"","event":"","a":"","b":"","stage":""}]}`,
    clean: (d) => ({
      news: list(d.news, 8, (n) => ({ title: S(n.title, 140), summary: S(n.summary, 300), game: S(n.game, 30), date: S(n.date, 10), url: URL_OK(n.url), image: URL_OK(n.image) })).filter((n) => n.title),
      results: list(d.results, 12, (m) => ({ date: S(m.date, 16), event: S(m.event, 80), a: S(m.a, 50), b: S(m.b, 50), score: S(m.score, 15), stage: S(m.stage, 40) })).filter((m) => m.a && m.b),
      upcoming: list(d.upcoming, 10, (m) => ({ date: S(m.date, 25), event: S(m.event, 80), a: S(m.a, 50), b: S(m.b, 50), stage: S(m.stage, 40) })).filter((m) => m.a && m.b),
    }),
  },
  tournoi: {
    ttl: 3_600_000,
    ask: ({ nom, jeu }) => `Compétition e-sport « ${nom} » (${jeu}). Donne : lieu, dates, cashprize, format (2 phrases), statut (à venir / en cours / terminé), vainqueur s'il y en a un, équipes participantes (nom + résultat/place si connu), derniers matchs joués et prochains matchs (date, équipe A, équipe B, score si joué, phase).
JSON : {"place":"","dates":"","prize":"","format":"","status":"","winner":"","teams":[{"name":"","result":""}],"matches":[{"date":"","a":"","b":"","score":"","stage":""}]}`,
    clean: (d) => ({ ...Object.fromEntries(['place', 'dates', 'prize', 'status', 'winner'].map((k) => [k, S(d[k], 80)])), format: S(d.format, 400), teams: list(d.teams, 24, (t) => ({ name: S(t.name, 50), result: S(t.result, 30) })), matches: list(d.matches, 16, (m) => ({ date: S(m.date, 16), a: S(m.a, 50), b: S(m.b, 50), score: S(m.score, 15), stage: S(m.stage, 40) })) }),
  },
};
export async function esportFiche(kind, args = {}, { ai = null } = {}) {
  const K = KINDS[kind]; if (!K) return null;
  const a = Object.fromEntries(['nom', 'equipe', 'jeu'].map((k) => [k, S(args[k], 60)]));
  if (!a.nom) return null;
  const key = `${kind}|${slug(a.nom)}|${slug(a.equipe)}|${slug(a.jeu)}`, file = `esport/fiche-${slug(key.replace(/\|/g, '-'))}.json`;
  if (!infoCache.has(key)) { const b = await getBlob(file).catch(() => null); const saved = b && looseJson(b.buf.toString('utf8')); if (saved?.at) infoCache.set(key, { at: saved.at, data: saved }); } // fiche sauvegardée
  const hit = infoCache.get(key);
  if (hit && Date.now() - hit.at < K.ttl) return hit.data;
  if (busy.has(key)) return hit?.data ?? busy.get(key);
  const job = (async () => {
    const chat = ai ?? (await import('../ai/gemini.js')).chat;
    const one = !a.jeu.includes(',') && a.jeu.toLowerCase();
    const lp = kind === 'actus' ? (one ? await liquipedia(a.jeu, 'Main Page').catch(() => null) : null) : await liquipedia(a.jeu, a.nom).catch(() => null);
    const off = kind === 'actus' && OFFICIAL[one] ? await pageCtx(OFFICIAL[one]) : '';
    const read = (kind === 'actus' ? [OFFICIAL[one], one && lpUrl(one, 'Main_Page'), one && lpUrl(one, 'Liquipedia:Matches')] : kind === 'equipe' ? [lpUrl(a.jeu, a.nom), lpUrl(a.jeu, `${a.nom}/Results`)] : [lpUrl(a.jeu, a.nom)]).filter(Boolean);
    const urls = read.length ? `\n\nLis d'abord ces pages (outil de lecture d'URL), elles contiennent la réponse : ${read.join(' ')}` : '';
    const ctx = lp ? `\n\nPage Liquipedia « ${lp.title} » (${lp.url}) déjà lue pour toi, source fiable à utiliser en priorité (effectif, palmarès, résultats, matchs) :\n${lp.text}\n\nImages de la page (logo, photos des joueurs) : ${lp.images.join(' ')}\nComplète avec une recherche web pour ce qui manque (actus, matchs à venir).` : '';
    const r = await chat({ tag: 'esport-fiches', web: true, thinking: 'low', system: `Tu es un journaliste e-sport à fond sur l’actu, nous sommes le ${new Date().toISOString().slice(0, 10)}. Toujours l’info la plus récente (résultats, effectifs, transferts du jour) et des images en grand format (og:image de l’article, pas de miniature). Réponds uniquement en JSON valide, en français. Uniquement des faits vérifiés sur le web ; laisse un champ vide plutôt que d’inventer.`, content: [{ type: 'text', text: K.ask(a) + urls + ctx + off }] }).catch(() => null);
    let d = null;
    d = looseJson(r?.text);
    if (!d) console.warn(`[esport] fiche ${kind} « ${a.nom} » : ${r ? 'réponse IA illisible' : 'IA indisponible'}`);
    if (!d) return hit?.data ?? null;
    if (lp?.main && kind === 'joueur') d.photo = lp.main;
    const data = { ...K.clean(d), ...(lp ? { liquipedia: lp.url } : {}), sources: (r?.sources ?? []).slice(0, 6).map((x) => ({ url: URL_OK(x.url), title: S(x.title, 60) })).filter((x) => x.url), at: Date.now() };
    const empty = kind === 'equipe' ? !data.players.length : kind === 'actus' ? !data.news.length : false;
    infoCache.set(key, { at: empty ? Date.now() - K.ttl + 300_000 : Date.now(), data }); // vide : on réessaie dans 5 min
    if (!empty) await putBlob(file, Buffer.from(JSON.stringify(data)), 'application/json').catch(() => {}); // sauvegardée : survit aux redémarrages
    return data;
  })().finally(() => busy.delete(key));
  busy.set(key, job);
  return hit?.data ?? job; // fiche périmée : réponse immédiate, l'IA la met à jour en fond
}

// Direct : pour les équipes suivies, match en cours (et sa chaîne Twitch) ou prochain match avec l'heure exacte. Gardé 5 min.
export async function esportLive(teams = [], { ai = null } = {}) {
  const list = (Array.isArray(teams) ? teams : []).slice(0, 12).map((t) => ({ nom: S(t.nom, 50), jeu: S(t.jeu, 40) })).filter((t) => t.nom);
  if (!list.length) return { matches: [] };
  const key = `live|${list.map((t) => `${slug(t.nom)}:${slug(t.jeu)}`).sort().join(',')}`, hit = infoCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.data;
  if (busy.has(key)) return busy.get(key);
  const job = (async () => {
    const chat = ai ?? (await import('../ai/gemini.js')).chat;
    const r = await chat({ tag: 'esport-direct', web: true, system: 'Tu suis l’e-sport en direct. Réponds uniquement en JSON valide. N’invente rien : pas de match = ne le mets pas.', content: [{ type: 'text', text: `Nous sommes le ${new Date().toISOString()}. Pour chacune de ces équipes, trouve son match en cours ou son prochain match officiel dans les 48 h (Liquipedia, HLTV, VLR.gg, sites officiels) : ${list.map((t) => `${t.nom} (${t.jeu})`).join(' ; ')}.
Pour chaque match : équipe suivie, jeu, adversaire, compétition, heure de début exacte en ISO 8601 UTC, en direct maintenant (true/false), score actuel si en direct, et le lien https de la chaîne Twitch officielle qui le diffuse (sinon YouTube).
JSON : {"matches":[{"team":"","game":"","opponent":"","event":"","start":"","live":false,"score":"","stream":""}]}` }] }).catch(() => null);
    const d = looseJson(r?.text);
    if (!d) return hit?.data ?? { matches: [] };
    const known = new Set(list.map((t) => t.nom.toLowerCase()));
    const data = { matches: (Array.isArray(d.matches) ? d.matches : []).slice(0, 20).map((m) => ({ team: S(m.team, 50), game: S(m.game, 40), opponent: S(m.opponent, 50), event: S(m.event, 80), start: Number.isNaN(Date.parse(m.start)) ? '' : new Date(m.start).toISOString(), live: m.live === true, score: S(m.score, 15), stream: /^https:\/\/(www\.)?(twitch\.tv|youtube\.com|youtu\.be)\//.test(String(m.stream)) ? String(m.stream).slice(0, 200) : '' })).filter((m) => known.has(m.team.toLowerCase()) && (m.live || m.start)) };
    infoCache.set(key, { at: Date.now(), data });
    return data;
  })().finally(() => busy.delete(key));
  busy.set(key, job);
  return job;
}
