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
  if (!['logo', 'bg', 'event', 'joueur'].includes(type) || !String(name).trim()) return null;
  const key = `esport/${type}-${slug(name)}`;
  const have = await getBlob(key).catch(() => null); if (have) return have;
  if (busy.has(key)) return busy.get(key);
  const job = (async () => {
    const miss = (await readFresh('esport-img-miss')) ?? {};
    if (Date.now() - (miss[key] ?? 0) < 86_400_000) return null;
    const chat = ai ?? (await import('../ai/gemini.js')).chat;
    const what = { logo: `the official current logo of the esports organisation "${name}" as a transparent PNG or SVG (the crest/emblem alone, no background)`, bg: `a wide official wallpaper, banner or key visual of the esports organisation "${name}" in its brand colours (like their Twitter/X banner or announcement visuals)`, event: `an official key art or banner image of the esports competition "${name}"`, joueur: `an official headshot photo of the professional esports player "${name}" (team photoshoot portrait, face visible), as used on Liquipedia, HLTV, VLR.gg or the team's site` }[type];
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

// Fiches e-sport (équipe, joueur, compétition) : l'IA lit les sites e-sport (Liquipedia, HLTV, VLR, Dexerto, sites officiels)
// et renvoie un résumé structuré, gardé en mémoire pour tout le monde. Rien n'est inventé : champ vide si inconnu.
const infoCache = new Map();
const S = (v, n = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const URL_OK = (u) => (/^https:\/\/[^\s"'<>]+$/.test(String(u ?? '')) ? String(u) : '');
const list = (v, n, f) => (Array.isArray(v) ? v : []).slice(0, n).map(f).filter((x) => Object.values(x).some(Boolean));
const KINDS = {
  equipe: {
    ttl: 6 * 3_600_000,
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
    ttl: 24 * 3_600_000,
    ask: ({ nom, equipe, jeu }) => `Joueur e-sport « ${nom} » (${equipe}, ${jeu}). Donne : vrai nom, date de naissance, âge, pays, rôle, équipe actuelle, présentation (3 phrases), parcours (équipes : nom + de + à), palmarès (10 max : tournoi + année + place), stats clés connues (ex. rating, K/D, ACS : libellé + valeur, 6 max), réglages connus (ex. sensibilité, DPI, caméra, résolution : libellé + valeur, 6 max), réseaux (twitter/x, twitch, youtube : liens https), photo (URL https directe d'une photo officielle si elle existe).
JSON : {"realName":"","born":"","age":"","country":"","role":"","team":"","about":"","photo":"","history":[{"team":"","from":"","to":""}],"titles":[{"event":"","year":"","place":""}],"stats":[{"label":"","value":""}],"settings":[{"label":"","value":""}],"links":{"twitter":"","twitch":"","youtube":""}}`,
    clean: (d) => ({ ...Object.fromEntries(['realName', 'born', 'age', 'country', 'role', 'team'].map((k) => [k, S(d[k], 60)])), about: S(d.about, 700), photo: URL_OK(d.photo), history: list(d.history, 12, (h) => ({ team: S(h.team, 50), from: S(h.from, 12), to: S(h.to, 12) })), titles: list(d.titles, 10, (t) => ({ event: S(t.event, 80), year: S(t.year, 10), place: S(t.place, 20) })), stats: list(d.stats, 6, (x) => ({ label: S(x.label, 30), value: S(x.value, 30) })), settings: list(d.settings, 6, (x) => ({ label: S(x.label, 30), value: S(x.value, 40) })), links: Object.fromEntries(['twitter', 'twitch', 'youtube'].map((k) => [k, URL_OK(d.links?.[k])])) }),
  },
  actus: {
    ttl: 2 * 3_600_000,
    ask: ({ jeu }) => `Les 6 actus e-sport les plus récentes (dernières 48 h si possible) sur : ${jeu}. Priorité aux compétitions en cours (résultats, qualifiés, transferts marquants). Pour chacune : titre, résumé d'une phrase, jeu, date AAAA-MM-JJ, lien de l'article, image (URL https directe de l'image de l'article).
JSON : {"news":[{"title":"","summary":"","game":"","date":"","url":"","image":""}]}`,
    clean: (d) => ({ news: list(d.news, 6, (n) => ({ title: S(n.title, 140), summary: S(n.summary, 300), game: S(n.game, 30), date: S(n.date, 10), url: URL_OK(n.url), image: URL_OK(n.image) })).filter((n) => n.title && n.image) }),
  },
  tournoi: {
    ttl: 3 * 3_600_000,
    ask: ({ nom, jeu }) => `Compétition e-sport « ${nom} » (${jeu}). Donne : lieu, dates, cashprize, format (2 phrases), statut (à venir / en cours / terminé), vainqueur s'il y en a un, équipes participantes (nom + résultat/place si connu), derniers matchs joués et prochains matchs (date, équipe A, équipe B, score si joué, phase).
JSON : {"place":"","dates":"","prize":"","format":"","status":"","winner":"","teams":[{"name":"","result":""}],"matches":[{"date":"","a":"","b":"","score":"","stage":""}]}`,
    clean: (d) => ({ ...Object.fromEntries(['place', 'dates', 'prize', 'status', 'winner'].map((k) => [k, S(d[k], 80)])), format: S(d.format, 400), teams: list(d.teams, 24, (t) => ({ name: S(t.name, 50), result: S(t.result, 30) })), matches: list(d.matches, 16, (m) => ({ date: S(m.date, 16), a: S(m.a, 50), b: S(m.b, 50), score: S(m.score, 15), stage: S(m.stage, 40) })) }),
  },
};
export async function esportFiche(kind, args = {}, { ai = null } = {}) {
  const K = KINDS[kind]; if (!K) return null;
  const a = Object.fromEntries(['nom', 'equipe', 'jeu'].map((k) => [k, S(args[k], 60)]));
  if (!a.nom) return null;
  const key = `${kind}|${slug(a.nom)}|${slug(a.equipe)}|${slug(a.jeu)}`, hit = infoCache.get(key);
  if (hit && Date.now() - hit.at < K.ttl) return hit.data;
  if (busy.has(key)) return busy.get(key);
  const job = (async () => {
    const chat = ai ?? (await import('../ai/gemini.js')).chat;
    const r = await chat({ tag: 'esport-fiches', web: true, system: 'Tu es un journaliste e-sport. Réponds uniquement en JSON valide, en français. Uniquement des faits vérifiés sur le web ; laisse un champ vide plutôt que d’inventer.', content: [{ type: 'text', text: K.ask(a) }] }).catch(() => null);
    let d = null;
    try { d = JSON.parse(String(r?.text ?? '').replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')); } catch { /* réponse illisible */ }
    if (!d) return hit?.data ?? null;
    const data = { ...K.clean(d), sources: (r?.sources ?? []).slice(0, 6).map((x) => ({ url: URL_OK(x.url), title: S(x.title, 60) })).filter((x) => x.url), at: Date.now() };
    infoCache.set(key, { at: Date.now(), data });
    return data;
  })().finally(() => busy.delete(key));
  busy.set(key, job);
  return job;
}

// Direct : pour les équipes suivies, match en cours (et sa chaîne Twitch) ou prochain match avec l'heure exacte. Gardé 10 min.
export async function esportLive(teams = [], { ai = null } = {}) {
  const list = (Array.isArray(teams) ? teams : []).slice(0, 12).map((t) => ({ nom: S(t.nom, 50), jeu: S(t.jeu, 40) })).filter((t) => t.nom);
  if (!list.length) return { matches: [] };
  const key = `live|${list.map((t) => `${slug(t.nom)}:${slug(t.jeu)}`).sort().join(',')}`, hit = infoCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.data;
  if (busy.has(key)) return busy.get(key);
  const job = (async () => {
    const chat = ai ?? (await import('../ai/gemini.js')).chat;
    const r = await chat({ tag: 'esport-direct', web: true, system: 'Tu suis l’e-sport en direct. Réponds uniquement en JSON valide. N’invente rien : pas de match = ne le mets pas.', content: [{ type: 'text', text: `Nous sommes le ${new Date().toISOString()}. Pour chacune de ces équipes, trouve son match en cours ou son prochain match officiel dans les 48 h (Liquipedia, HLTV, VLR.gg, sites officiels) : ${list.map((t) => `${t.nom} (${t.jeu})`).join(' ; ')}.
Pour chaque match : équipe suivie, jeu, adversaire, compétition, heure de début exacte en ISO 8601 UTC, en direct maintenant (true/false), score actuel si en direct, et le lien https de la chaîne Twitch officielle qui le diffuse (sinon YouTube).
JSON : {"matches":[{"team":"","game":"","opponent":"","event":"","start":"","live":false,"score":"","stream":""}]}` }] }).catch(() => null);
    let d = null; try { d = JSON.parse(String(r?.text ?? '').replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1')); } catch { /* illisible */ }
    if (!d) return hit?.data ?? { matches: [] };
    const known = new Set(list.map((t) => t.nom.toLowerCase()));
    const data = { matches: (Array.isArray(d.matches) ? d.matches : []).slice(0, 20).map((m) => ({ team: S(m.team, 50), game: S(m.game, 40), opponent: S(m.opponent, 50), event: S(m.event, 80), start: Number.isNaN(Date.parse(m.start)) ? '' : new Date(m.start).toISOString(), live: m.live === true, score: S(m.score, 15), stream: /^https:\/\/(www\.)?(twitch\.tv|youtube\.com|youtu\.be)\//.test(String(m.stream)) ? String(m.stream).slice(0, 200) : '' })).filter((m) => known.has(m.team.toLowerCase()) && (m.live || m.start)) };
    infoCache.set(key, { at: Date.now(), data });
    return data;
  })().finally(() => busy.delete(key));
  busy.set(key, job);
  return job;
}
