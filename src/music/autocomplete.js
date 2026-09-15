// Suggestions pendant qu'on tape /play : sons classés du plus connu au moins connu (Deezer), + suggestions YouTube.
import { deezer, rankResults } from './deezer.js';
import { formatTime } from './ui.js';

const CACHE_MS = 10 * 60_000;
const cache = new Map();
const cut = (text, max = 100) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function remember(key, choices) {
  cache.set(key, { at: Date.now(), choices });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return choices;
}

async function youtubeSuggestions(query) {
  const res = await fetch(
    `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=fr&q=${encodeURIComponent(query)}`,
    { signal: AbortSignal.timeout(1_500) },
  );
  const data = await res.json();
  return Array.isArray(data?.[1]) ? data[1] : [];
}

const trackChoice = (t, prefix = '') => ({
  name: cut(`${prefix}${t.title} — ${t.artist?.name ?? '?'} · ${formatTime(t.duration)}`),
  value: `dz:${t.id}`,
});

export async function musicSuggestions(rawQuery) {
  const query = rawQuery.trim();
  if (/^https?:\/\//i.test(query)) return query.length <= 100 ? [{ name: cut(`🔗 ${query}`), value: query }] : [];

  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.choices;

  // Rien de tapé : le top du moment
  if (!query) {
    const chart = await deezer.chart().catch(() => []);
    return remember(key, chart.slice(0, 25).map((t, i) => trackChoice(t, i < 3 ? ['🥇 ', '🥈 ', '🥉 '][i] : '🔥 ')));
  }

  const [results, suggestions] = await Promise.all([
    deezer.search(query, 25).catch(() => []),
    youtubeSuggestions(query).catch(() => []),
  ]);
  const choices = rankResults(query, results).slice(0, 20).map((t) => trackChoice(t));

  // Peu de résultats musique (vidéo YouTube, remix, son rare...) : on complète avec les recherches YouTube
  for (const suggestion of suggestions) {
    if (choices.length >= (results.length >= 5 ? 22 : 25)) break;
    if (suggestion.length <= 100) choices.push({ name: cut(`🔎 ${suggestion}`), value: suggestion });
  }
  return remember(key, choices.slice(0, 25));
}
