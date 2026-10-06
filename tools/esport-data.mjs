// Fiches e-sport (équipes, joueurs, matchs) lues sur Liquipedia par GitHub Actions et publiées avec le site :
// le launcher les affiche tout de suite, sans IA ni attente. Liquipedia : 1 page complète toutes les 30 s, données CC-BY-SA.
// Usage : node tools/esport-data.mjs <dossier de sortie> [--fixtures <dossier de pages déjà récupérées>]
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseMatches, parsePlayer, parseTeam } from '../src/features/liquipedia.js';

const OUT = process.argv[2] ?? 'launcher-site/esport';
const FIX = process.argv.includes('--fixtures') ? process.argv[process.argv.indexOf('--fixtures') + 1] : '';
const UA = 'HistoryLauncher/1.0 (https://zyko144.github.io/vercel-ia-/; esport data)';
const { games, teams, featured = [] } = JSON.parse(readFileSync(new URL('../launcher/src/ui/esport.json', import.meta.url)));
const load = (f) => { try { return JSON.parse(readFileSync(`${OUT}/${f}`)); } catch { return null; } };
const data = load('data.json') ?? { teams: {}, games: {} }, players = load('players.json') ?? {};
const started = Date.now(), budget = Number(process.env.ESPORT_BUDGET_MIN || (Object.keys(data.teams).length < teams.length / 2 ? 75 : 22)) * 60_000;
const left = () => !stop && Date.now() - started < budget;
const title = (s) => String(s).trim().replace(/ /g, '_');

let next = 0, refused = 0;
const get = (url) => new Promise((ok) => execFile('curl', ['-sS', '--compressed', '-m', '40', '-A', UA, '-w', '\n%{http_code}', url], { maxBuffer: 64 << 20 }, (_e, out = '') => { const i = out.lastIndexOf('\n'); ok({ status: Number(out.slice(i + 1)), body: out.slice(0, i) }); }));
async function page(wiki, t) {
  if (FIX) { try { const j = JSON.parse(readFileSync(`${FIX}/${wiki}__${t.replace(/:/g, '_')}.json`)); return { html: j.parse.text, title: j.parse.title }; } catch { return null; } }
  for (let essai = 0; essai < 2; essai++) {
    const wait = next - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    next = Date.now() + 30_500;
    const r = await get(`https://liquipedia.net/${wiki}/api.php?action=parse&format=json&formatversion=2&redirects=1&prop=text&page=${encodeURIComponent(t)}`);
    if (r.status === 429) { refused++; console.log(`… ${wiki}/${t} : 429, pause de 2 min`); next = Date.now() + 120_000; continue; }
    let j = null; try { j = JSON.parse(r.body); } catch { /* pas du JSON */ }
    if (!j?.parse?.text) { console.log(`✗ ${wiki}/${t} : ${j?.error?.info ?? r.status} ${j ? '' : r.body.slice(0, 120)}`); return null; }
    refused = 0;
    return { html: j.parse.text, title: j.parse.title };
  }
  if (refused >= 4) { console.log('Liquipedia refuse les demandes : arrêt, nouvel essai à la prochaine heure.'); stop = true; }
  return null;
}
let stop = false;
const age = (x) => (x?.at ? Date.now() - Date.parse(x.at) : Infinity);
const G = Object.fromEntries(games.map((g) => [g.id, g]));

// 1. Matchs de chaque jeu (à venir, en cours, terminés), gardés pour nos équipes
for (const g of games) {
  if (!g.wiki || !left()) continue;
  const p = await page(g.wiki, 'Liquipedia:Matches'); if (!p) continue;
  const known = new Set(teams.filter((t) => t.game === g.id).flatMap((t) => [t.name, data.teams[t.id]?.title]).filter(Boolean).map((s) => s.toLowerCase()));
  const all = parseMatches(p.html), ours = all.filter((m) => known.has(m.a.toLowerCase()) || known.has(m.b.toLowerCase()));
  data.games[g.id] = { at: new Date().toISOString(), url: `https://liquipedia.net/${g.wiki}/Liquipedia:Matches`, matches: (ours.length >= 8 ? ours : all).slice(-60) };
  console.log(`✓ ${g.name} : ${all.length} matchs, ${ours.length} pour nos équipes`);
}

// 2. Équipes : jamais lues d'abord, puis les plus anciennes ; les équipes à la une passent devant
const order = [...teams].sort((a, b) => (age(data.teams[b.id]) - age(data.teams[a.id])) || (featured.includes(b.name) - featured.includes(a.name)));
for (const t of order) {
  if (!left()) break;
  const g = G[t.game]; if (!g?.wiki || age(data.teams[t.id]) < 2 * 3_600_000) continue;
  const p = await page(g.wiki, title(t.lp ?? t.name)); if (!p) continue;
  const d = parseTeam(p.html);
  data.teams[t.id] = { at: new Date().toISOString(), title: p.title, url: `https://liquipedia.net/${g.wiki}/${title(p.title)}`, ...d };
  console.log(`✓ ${g.name} · ${t.name} : ${d.players.length} joueurs, ${d.titles.length} titres, ${d.matches.length} matchs`);
}

// 3. Joueurs des effectifs (photo, parcours, réglages, palmarès), une semaine de validité
const roster = teams.flatMap((t) => (data.teams[t.id]?.players ?? []).filter((p) => p.page).map((p) => ({ key: p.page.replace('https://liquipedia.net/', ''), star: featured.includes(t.name) })));
for (const { key } of roster.sort((a, b) => (age(players[b.key]) - age(players[a.key])) || (b.star - a.star))) {
  if (!left()) break;
  if (age(players[key]) < 7 * 86_400_000) continue;
  const [wiki, ...rest] = key.split('/'), p = await page(wiki, decodeURIComponent(rest.join('/'))); if (!p) continue;
  players[key] = { at: new Date().toISOString(), ...parsePlayer(p.html) };
  console.log(`✓ joueur ${key}`);
}

if (!Object.keys(data.teams).length) { console.log('Aucune donnée : rien n’est écrit.'); process.exit(1); }
data.at = new Date().toISOString();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/data.json`, JSON.stringify(data));
writeFileSync(`${OUT}/players.json`, JSON.stringify(players));
console.log(`Fini en ${Math.round((Date.now() - started) / 60_000)} min : ${Object.keys(data.teams).length}/${teams.length} équipes, ${Object.keys(players).length} joueurs, ${Object.keys(data.games).length} jeux.`);
