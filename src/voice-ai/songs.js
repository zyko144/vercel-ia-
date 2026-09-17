// Trouve le son demandé à l'oral : nom d'artiste corrigé (rap FR surtout), titre rapproché de ses vrais sons,
// versions bizarres écartées. Si ce n'est pas clair, on ne lance rien et on propose des sons à la place.
import { cleanTitle, frenchRapCatalog } from '../music/blindpools.js';
import { deezer, matchRatio } from '../music/deezer.js';

const ARTIST_MIN_SCORE = 0.6;
const TITLE_MIN_SCORE = 0.55;
// Versions qu'on ne lance jamais à la voix (sauf si c'est demandé)
const JUNK = /\b(remix|cover|reprise|parodie|live|session|colors show|karaok[eé]|instrumental|intelligence artificielle|sped up|slowed|nightcore|8d|version|edit)\b/i;

const normalize = (s = '') => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' et ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Rapproche les mots qui se prononcent pareil (th/t, ph/f, y/i, h muet, lettres doublées, terminaisons muettes...). */
const phonetic = (s = '') => normalize(s)
  .split(' ')
  .map((word) => word
    .replace(/ph/g, 'f').replace(/th/g, 't').replace(/ch/g, 'k').replace(/qu/g, 'k').replace(/c(?=[aou])/g, 'k')
    .replace(/y/g, 'i').replace(/h/g, '').replace(/(.)\1+/g, '$1').replace(/(es|s|e|t|x)$/, ''))
  .filter(Boolean)
  .join('');

function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

const nameScore = (heard, name) => Math.max(similarity(phonetic(heard), phonetic(name)), similarity(normalize(heard), normalize(name)));

function titleScore(heard, title) {
  const clean = cleanTitle(title) || title;
  const words = normalize(clean).split(' ').filter((w) => w.length >= 3);
  const heardWords = normalize(heard).split(' ').filter((w) => w.length >= 3);
  if (!words.length || !heardWords.length) return nameScore(heard, clean);
  // Les mots doivent coller dans les deux sens (« tout » seul ne suffit pas pour « chanson qui existe pas du tout »)
  const titleCovered = matchRatio(words.join(' '), heard);
  const heardCovered = matchRatio(heardWords.join(' '), clean);
  const byWords = 0.6 * Math.min(titleCovered, heardCovered) + 0.4 * Math.max(titleCovered, heardCovered);
  return Math.max(nameScore(heard, clean), byWords * 0.95);
}

const describe = (item) => `${item.artist?.name ?? item.artist} - ${item.title}`;

/** Mots à faire reconnaître en priorité à l'oral : rappeurs et titres connus. */
export async function voiceVocabulary(limit = 300) {
  const { artists, tracks } = await frenchRapCatalog();
  const titles = [...tracks].sort((a, b) => b.rank - a.rank).map((t) => cleanTitle(t.title)).filter((t) => t && t.length >= 2 && !JUNK.test(t));
  return [...new Set([...artists.slice(0, 180).map((a) => a.name), ...titles])].slice(0, limit);
}

export async function popularArtistNames(count = 80) {
  const { artists } = await frenchRapCatalog();
  return artists.slice(0, count).map((a) => a.name);
}

/** Corrige un nom d'artiste mal entendu (catalogue rap FR, puis recherche Deezer). */
async function resolveArtist(heard) {
  if (!heard?.trim()) return null;
  const { artists } = await frenchRapCatalog();
  let best = null;
  for (const artist of artists) {
    const score = nameScore(heard, artist.name);
    if (!best || score > best.score || (score === best.score && artist.count > best.artist.count)) best = { artist, score };
  }
  if (best && best.score >= 0.85) return { id: best.artist.id, name: best.artist.name, score: best.score };

  // Pas sûr : recherche d'artiste Deezer. Un artiste hors rap FR ne l'emporte que s'il ressemble plus ET qu'il est connu
  // (sinon « Chimar » tomberait sur un inconnu au lieu de Timar)
  const found = await deezer.searchArtist(heard).catch(() => []);
  const match = found
    .map((artist) => ({ artist, score: nameScore(heard, artist.name) }))
    .filter((m) => m.score >= ARTIST_MIN_SCORE + 0.1 && (m.artist.nb_fan ?? 0) >= 50_000)
    .sort((a, b) => b.score - a.score || (b.artist.nb_fan ?? 0) - (a.artist.nb_fan ?? 0))[0];
  const fromCatalog = best?.score >= ARTIST_MIN_SCORE ? { id: best.artist.id, name: best.artist.name, score: best.score } : null;
  if (match && (!fromCatalog || match.score > fromCatalog.score + 0.1)) return { id: match.artist.id, name: match.artist.name, score: match.score };
  return fromCatalog;
}

/**
 * @param {{ artiste?: string, titre?: string, recherche?: string }} request
 * @returns {Promise<{ id: number, label: string, how: string } | { error: string, suggestions?: string[], artist?: string }>}
 */
export async function findSong({ artiste = '', titre = '', recherche = '' }) {
  const title = String(titre ?? '').trim();
  const artist = await resolveArtist(String(artiste ?? '').trim());

  if (artist) {
    const top = (await deezer.artistTop(artist.id, 50).catch(() => [])).filter((t) => !JUNK.test(t.title));
    const { tracks } = await frenchRapCatalog();
    const own = tracks.filter((t) => t.artistId === artist.id && !JUNK.test(t.title));
    const candidates = [...new Map([...top.map((t) => [t.id, { id: t.id, title: t.title, artist: t.artist?.name ?? artist.name, rank: t.rank ?? 0 }]), ...own.map((t) => [t.id, t])]).values()];

    // Juste l'artiste : son son le plus écouté où il est l'artiste principal (pas un featuring)
    if (!title) {
      const main = candidates.filter((t) => nameScore(artist.name, t.artist) >= 0.8);
      const best = [...(main.length ? main : candidates)].sort((a, b) => b.rank - a.rank)[0];
      return best ? { id: best.id, label: describe(best), how: `son le plus écouté de ${artist.name}` } : { error: `aucun son trouvé pour ${artist.name}` };
    }

    const scored = candidates.map((t) => ({ t, score: titleScore(title, t.title) })).sort((a, b) => b.score - a.score || b.t.rank - a.t.rank);
    if (scored[0]?.score >= TITLE_MIN_SCORE) return { id: scored[0].t.id, label: describe(scored[0].t), how: `artiste compris : ${artist.name}` };

    // Recherche précise Deezer (sons moins connus de l'artiste)
    const precise = await deezer.search(`artist:"${artist.name}" track:"${title}"`, 10).catch(() => []);
    const hit = precise.find((t) => !JUNK.test(t.title) && nameScore(artist.name, t.artist?.name ?? '') >= 0.8 && titleScore(title, t.title) >= TITLE_MIN_SCORE - 0.1);
    if (hit) return { id: hit.id, label: describe(hit), how: `artiste compris : ${artist.name}` };

    return {
      error: `je n'ai pas trouvé « ${title} » chez ${artist.name}`,
      artist: artist.name,
      suggestions: [...candidates].sort((a, b) => b.rank - a.rank).slice(0, 6).map((t) => cleanTitle(t.title) || t.title),
    };
  }

  // Pas d'artiste reconnu : on cherche le titre (en priorité chez les rappeurs FR connus)
  const query = [title, recherche, artiste].filter(Boolean).join(' ').trim();
  if (!query) return { error: 'je ne sais pas quel son lancer' };
  const { tracks, artists } = await frenchRapCatalog();
  const known = new Set(artists.map((a) => normalize(a.name)));
  if (title) {
    const inCatalog = tracks
      .filter((t) => !JUNK.test(t.title))
      .map((t) => ({ t, score: titleScore(title, t.title) }))
      .filter((m) => m.score >= 0.75)
      .sort((a, b) => b.score - a.score || b.t.rank - a.t.rank)[0];
    if (inCatalog) return { id: inCatalog.t.id, label: describe(inCatalog.t), how: 'titre reconnu' };
  }
  const results = (await deezer.search(query, 25).catch(() => [])).filter((t) => !JUNK.test(t.title));
  const ranked = results
    .map((t) => ({ t, score: Math.max(titleScore(query, t.title), matchRatio(query, `${t.title} ${t.artist?.name ?? ''}`)) + (known.has(normalize(t.artist?.name)) ? 0.15 : 0) }))
    .filter((m) => m.score >= 0.7)
    .sort((a, b) => b.score - a.score || (b.t.rank ?? 0) - (a.t.rank ?? 0));
  if (ranked[0]) return { id: ranked[0].t.id, label: describe(ranked[0].t), how: 'recherche' };
  return { error: `je n'ai pas trouvé « ${query} »` };
}
