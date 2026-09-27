// Progression du joueur : niveau (tiré du temps de jeu réel), badges, série de jours, jeux à redécouvrir,
// répartition par heure de la journée et sessions récentes. Tout est calculé à partir des données du launcher.
const DAY = 86_400_000;

/** Niveau : chaque niveau demande un peu plus d'heures que le précédent (niveau 2 = 2 h, 10 = 90 h, 30 = 870 h). */
export function levelOf(totalMinutes) {
  const h = Math.max(0, totalMinutes / 60);
  const need = (n) => n * (n - 1); // heures cumulées pour atteindre le niveau n
  let n = 1;
  while (need(n + 1) <= h && n < 200) n += 1;
  const from = need(n); const to = need(n + 1);
  return { level: n, pct: Math.round((100 * (h - from)) / (to - from)), hoursToNext: Math.max(0, Math.ceil(to - h)) };
}

/** Jours consécutifs avec du jeu (jusqu'à aujourd'hui ou hier). */
export function streakOf(days, now = Date.now()) {
  const key = (t) => new Date(t).toISOString().slice(0, 10);
  let n = 0;
  let t = now;
  if (!(days?.[key(t)]?.jeux > 0)) t -= DAY;
  while (days?.[key(t)]?.jeux > 0) { n += 1; t -= DAY; }
  return n;
}

/** Minutes de jeu par heure de la journée (0 à 23) sur les `n` derniers jours. */
export function hourly(days, n = 30, now = Date.now()) {
  const out = Array(24).fill(0);
  for (let i = 0; i < n; i++) {
    const d = days?.[new Date(now - i * DAY).toISOString().slice(0, 10)];
    (d?.h ?? []).forEach((m, hIdx) => { out[hIdx] += m || 0; });
  }
  return out.map((m) => Math.round(m));
}

/** Jeux installés, bien joués autrefois, pas lancés depuis plus de 30 jours. */
export function rediscover(items, now = Date.now()) {
  return items.filter((i) => i.kind === 'game' && i.installed && !i.hidden && i.minutes >= 120 && i.lastPlayed && now - i.lastPlayed > 30 * DAY)
    .sort((a, b) => b.minutes - a.minutes).slice(0, 6);
}

/** Badges : { id, icon, title, desc, got, progress (0-100) }. */
export function badges(ctx) {
  const { items = [], days = {}, sessions = [], friends = 0, bench = null, health = null, collections = 0, now = Date.now() } = ctx;
  const games = items.filter((i) => i.kind === 'game');
  const total = games.reduce((n, i) => n + (i.minutes || 0), 0);
  const played = games.filter((i) => i.minutes >= 30).length;
  const sources = new Set(games.filter((i) => i.installed).map((i) => i.source)).size;
  const longest = Math.max(0, ...sessions.map((s) => (s.end - s.start) / 60_000));
  const night = sessions.some((s) => { const h = new Date(s.start).getHours(); return h >= 2 && h < 5; });
  const fivem = games.find((i) => i.source === 'fivem')?.minutes ?? 0;
  const streak = streakOf(days, now);
  const b = (id, icon, title, desc, value, goal) => ({ id, icon, title, desc, got: value >= goal, progress: Math.min(100, Math.round((100 * value) / goal)) });
  return [
    b('h10', '⏱', 'Échauffement', '10 h de jeu au total', total / 60, 10),
    b('h100', '🔥', 'Passionné', '100 h de jeu au total', total / 60, 100),
    b('h1000', '👑', 'Légende', '1 000 h de jeu au total', total / 60, 1000),
    b('g10', '🎮', 'Touche-à-tout', '10 jeux joués au moins 30 min', played, 10),
    b('g50', '📚', 'Collectionneur', '50 jeux joués au moins 30 min', played, 50),
    b('src4', '🧭', 'Explorateur', 'Des jeux sur 4 plateformes différentes', sources, 4),
    b('marathon', '🏃', 'Marathon', 'Une session de 4 h d’affilée', longest, 240),
    b('night', '🦉', 'Oiseau de nuit', 'Jouer entre 2 h et 5 h du matin', night ? 1 : 0, 1),
    b('streak7', '📅', 'Assidu', '7 jours de jeu d’affilée', streak, 7),
    b('friends5', '👥', 'Bien entouré', '5 amis History', friends, 5),
    b('bench', '🏁', 'Chronométré', 'Faire un benchmark', bench ? 1 : 0, 1),
    b('bench1500', '🚀', 'Machine de guerre', 'Score de benchmark de 1 500', bench?.scores?.total ?? 0, 1500),
    b('health90', '💚', 'PC en pleine forme', 'Score de santé du PC de 90', health ?? 0, 90),
    b('cols3', '🗂', 'Bien rangé', '3 collections', collections, 3),
    b('fivem50', '🌆', 'Citoyen de Los Santos', '50 h sur FiveM', fivem / 60, 50),
  ];
}

/** Ajoute ou prolonge une session de jeu (pause de moins de 3 min = même session). */
export function logSession(sessions, id, now = Date.now(), everyMs = 60_000) {
  const list = sessions ?? [];
  const last = [...list].reverse().find((s) => s.id === id);
  if (last && now - last.end <= everyMs * 3) last.end = now;
  else list.push({ id, start: now - everyMs, end: now });
  return list.slice(-300);
}
