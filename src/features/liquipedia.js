// Lecture des pages Liquipedia (HTML renvoyé par leur API « parse ») : effectif, palmarès, résultats, matchs.
// Sans IA : tout vient de la page, rien n'est inventé. Données Liquipedia sous licence CC-BY-SA (source affichée dans l'appli).
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'param', 'track']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s) => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m));

/** Mini arbre HTML : { tag, attrs, kids, parent } et nœuds texte { text }. */
export function dom(html) {
  const root = { tag: '#root', attrs: {}, kids: [] };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  for (const m of String(html).matchAll(re)) {
    if (m[5] !== undefined) { cur.kids.push({ text: decode(m[5]), parent: cur }); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) { // fermeture : on remonte jusqu'à la balise ouverte correspondante
      for (let n = cur; n && n !== root; n = n.parent) if (n.tag === tag) { cur = n.parent; break; }
      continue;
    }
    const attrs = {};
    for (const a of m[3].matchAll(/([^\s=/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) attrs[a[1].toLowerCase()] = decode((a[2] ?? '').replace(/^["']|["']$/g, ''));
    const node = { tag, attrs, kids: [], parent: cur };
    cur.kids.push(node);
    if (!VOID.has(tag) && !m[4]) cur = node;
  }
  return root;
}
export const hasCls = (n, c) => ` ${n?.attrs?.class ?? ''} `.includes(` ${c} `);
export function all(n, f, out = []) { for (const k of n?.kids ?? []) if (k.tag) { if (f(k)) out.push(k); all(k, f, out); } return out; }
export const first = (n, f) => all(n, f)[0] ?? null;
export const byCls = (n, c) => all(n, (k) => hasCls(k, c));
export const text = (n) => (n?.text !== undefined ? n.text : (n?.kids ?? []).map((k) => (k.tag === 'br' ? '\n' : k.tag === 'sup' && hasCls(k, 'reference') ? '' : text(k))).join(''));
const clean = (s) => String(s ?? '').replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const tx = (n) => clean(text(n));
const ABS = 'https://liquipedia.net';
export const img = (src) => (src ? ABS + String(src).replace(/\/thumb(\/.+?\.(?:png|jpe?g|webp|gif|svg))\/[^/]+$/i, '$1') : '');

/** Infobox : { « Location » : nœud valeur, … } */
function infobox(root) {
  const box = first(root, (n) => hasCls(n, 'fo-nttax-infobox'));
  const out = {};
  for (const d of byCls(box, 'infobox-description')) {
    const v = d.parent?.kids.filter((k) => k.tag)[1];
    if (v) out[tx(d).replace(/:$/, '')] = v;
  }
  return { box, cells: out };
}
function links(box) {
  const l = {};
  for (const a of all(box, (n) => n.tag === 'a' && hasCls(n, 'external'))) {
    const icon = first(a, (n) => n.tag === 'i')?.attrs.class ?? '';
    const k = icon.match(/lp-(home|twitter|twitch|youtube|instagram|tiktok|discord|facebook|kick)/)?.[1];
    if (k && !l[k === 'home' ? 'site' : k]) l[k === 'home' ? 'site' : k] = a.attrs.href;
  }
  return l;
}
/** Section de la page : les nœuds entre le titre (id) et le titre suivant de même niveau ou plus haut. */
function section(root, id) {
  const h = first(root, (n) => /^h[2-4]$/.test(n.tag) && n.attrs.id === id); if (!h) return null;
  const head = h.parent?.tag === 'div' && hasCls(h.parent, 'mw-heading') ? h.parent : h, lvl = Number(h.tag[1]);
  const sibs = head.parent.kids, out = { tag: '#section', attrs: {}, kids: [] };
  for (let i = sibs.indexOf(head) + 1; i < sibs.length; i++) {
    const k = sibs[i], hk = k.tag && (/^h[2-4]$/.test(k.tag) ? k : hasCls(k, 'mw-heading') ? first(k, (n) => /^h[2-4]$/.test(n.tag)) : null);
    if (hk && Number(hk.tag[1]) <= lvl) break;
    out.kids.push(k);
  }
  return out;
}
/** Lignes d'un tableau (entêtes avec colspan) : get('Tournament') → cellules de cette colonne. */
function rows(table) {
  const trs = all(table, (n) => n.tag === 'tr');
  const head = trs.find((r) => all(r, (n) => n.tag === 'th').length > 1);
  const heads = head ? all(head, (n) => n.tag === 'th').flatMap((th) => Array(Number(th.attrs.colspan) || 1).fill(tx(th).toLowerCase())) : [];
  return trs.filter((r) => r !== head && r.kids.filter((k) => k.tag === 'td').length > 1).map((r) => {
    const cells = r.kids.filter((k) => k.tag === 'td');
    const get = (name) => heads.flatMap((h, i) => (h === name.toLowerCase() && cells[i] ? [cells[i]] : []));
    return { cells, heads, get, txt: (name) => get(name).map(tx).find(Boolean) ?? '' };
  });
}
const teamName = (c) => { const a = first(c, (n) => n.tag === 'a' && n.attrs.title && !/^File:/.test(n.attrs.title)); return a?.attrs.title?.replace(/ \(page does not exist\)$/, '') || tx(c); };
const flagOf = (n) => first(n, (k) => hasCls(k, 'flag'))?.kids.map((k) => (k.tag === 'img' ? k : first(k, (x) => x.tag === 'img'))).find(Boolean)?.attrs.alt ?? '';

/** Date d'une cellule : horodatage Liquipedia (data-timestamp) ou « 2026-09-20 » + « 18:30 UTC ». */
function when(cell, timeText = '') {
  const ts = Number(first(cell, (n) => n.attrs['data-timestamp'])?.attrs['data-timestamp'] ?? cell?.attrs?.['data-timestamp']);
  if (ts) return new Date(ts * 1000).toISOString();
  const d = tx(cell).match(/\d{4}-\d{2}-\d{2}/)?.[0]; if (!d) return '';
  const t = String(timeText).match(/(\d{1,2}):(\d{2})/);
  return t ? `${d}T${t[1].padStart(2, '0')}:${t[2]}:00Z` : d;
}
const ids = (n) => [...new Set(all(n, (k) => k.tag === 'a' && !hasCls(k, 'image') && !/Category:|File:/.test(k.attrs.href ?? '') && tx(k)).map(tx))];
/** Tableaux de la section « Results » / « Achievements » : classements et derniers matchs. */
function resultTables(root) {
  const sec = section(root, 'Results') ?? section(root, 'Achievements');
  const tables = all(sec, (n) => n.tag === 'table').map(rows);
  const results = [], matches = [];
  for (const r of tables.find((t) => t[0]?.heads.includes('place')) ?? []) {
    const date = r.txt('Date').slice(0, 10), event = r.txt('Tournament'); if (!date || !event) continue;
    const [score, opp] = r.get('Result'), sc = tx(score);
    results.push({ date, place: r.txt('Place'), tier: r.txt('Tier'), event, score: /\d/.test(sc) ? sc.replace(/\s*:\s*/, '-') : '', opponent: opp && /\d/.test(sc) ? teamName(opp) : '', prize: r.txt('Prize') });
  }
  for (const r of tables.find((t) => t[0]?.heads.some((h) => /^vs/.test(h))) ?? []) {
    const score = r.txt('Score'), [a, b] = score.split(/\s*:\s*/).map(Number); if (!/\d/.test(score)) continue;
    const vs = r.get(r.heads.find((h) => /^vs/.test(h)))[0];
    matches.push({ date: when(r.get('Date')[0], r.txt('Time')), event: r.txt('Tournament'), tier: r.txt('Tier'), score: `${a}-${b}`, opponent: vs ? teamName(vs) : '', win: a > b });
  }
  const titles = results.filter((r) => /^1(st)?\b/.test(r.place)).map((r) => ({ event: r.event, year: r.date.slice(0, 4), place: '1er' }));
  return { results: results.slice(0, 40), matches: matches.slice(0, 15), titles: titles.slice(0, 30) };
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const firstLine = (s) => String(s).split('\n')[0].trim();

/** Page d'équipe → infos, effectif, palmarès, derniers matchs. */
export function parseTeam(html) {
  const root = dom(html), { box, cells } = infobox(root);
  const cell = (...names) => { for (const n of names) if (cells[n]) return tx(cells[n]); return ''; };
  const logoBox = first(box, (n) => hasCls(n, 'infobox-image') && hasCls(n, 'darkmode')) ?? first(box, (n) => hasCls(n, 'infobox-image'));
  const team = {
    region: firstLine(cell('Region')), country: firstLine(cell('Location')),
    coach: ids(cells.Coaches ?? cells.Coach).join(', ') || cell('Coaches', 'Coach').split('\n')[0],
    manager: ids(cells.Manager ?? cells.Managers ?? cells['General Manager']).join(', '),
    founded: (cell('Created', 'Founded').match(/\d{4}/) ?? [''])[0],
    earnings: cell('Approx. Total Winnings', 'Total Winnings'), ranking: cell('LPRating', 'RLCS Points', 'VCT Points', 'Ranking'),
    logo: img(first(logoBox, (n) => n.tag === 'img')?.attrs.src), links: links(box),
    about: tx(first(root, (n) => n.tag === 'p' && tx(n).length > 60)).replace(/\[\d+\]/g, '').slice(0, 900),
  };
  const roster = section(root, 'Active') ?? section(root, 'Player_Roster');
  const players = [];
  for (const r of rows(first(roster, (n) => n.tag === 'table'))) {
    const id = first(r.cells[0], (n) => hasCls(n, 'inline-player')) ?? r.cells[0];
    const a = first(id, (n) => n.tag === 'a' && !hasCls(n, 'image'));
    const name = tx(a) || tx(id); if (!name) continue;
    players.push({ name, page: a?.attrs.href?.startsWith('/') ? ABS + a.attrs.href : '', realName: r.txt('Name'), country: flagOf(id), role: r.txt('Position') || r.txt('Role') || r.txt(''), captain: Boolean(first(r.cells[0], (n) => hasCls(n, 'fa-crown'))), joined: (r.txt('Join Date').match(/\d{4}-\d{2}-\d{2}/) ?? [''])[0] });
  }
  // Historique daté (arrivées, départs, rachats) : onglets par année de la section « Timeline », du plus récent au plus ancien
  const tl = section(root, 'Timeline');
  const years = all(first(tl, (n) => n.tag === 'ul' && hasCls(n, 'nav')), (n) => n.tag === 'li' && !hasCls(n, 'show-all')).map(tx);
  const news = all(tl, (n) => /^content\d+/.test(n.attrs.class ?? '') && n.attrs['data-count']).flatMap((c, i) => all(c, (n) => n.tag === 'li').map((li) => {
    const [d, ...rest] = tx(li).split(/\s+[–—-]\s+/), m = d.match(/^([A-Za-z]+)\s+(\d{1,2})/), mi = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) : -1;
    return { date: mi >= 0 && /^\d{4}$/.test(years[i]) ? new Date(Date.UTC(Number(years[i]), mi, Number(m[2]))).toISOString().slice(0, 10) : years[i] ?? '', text: rest.join(' – ') || tx(li) };
  })).reverse().slice(0, 12);
  return { team, players, news, ...resultTables(root) };
}

/** Page de joueur → identité, parcours, réglages, palmarès. */
export function parsePlayer(html) {
  const root = dom(html), { box, cells } = infobox(root);
  const cell = (...names) => { for (const n of names) if (cells[n]) return tx(cells[n]).replace(/\n+/g, ', '); return ''; };
  const born = cell('Born', 'Birth');
  const photo = all(first(box, (n) => hasCls(n, 'infobox-image')), (n) => n.tag === 'img').map((i) => i.attrs.src).find((src) => !/logo|allmode|lightmode|darkmode/i.test(src));
  // Parcours : lignes « 2022-10-02 — Present  Karmine Corp » sous l'entête « History » de l'infobox
  const history = [];
  const hh = byCls(box, 'infobox-header').find((n) => /^History/.test(tx(n).replace(/\[.*?\]/g, '').trim()));
  for (const row of hh ? all(hh.parent?.parent?.kids[hh.parent.parent.kids.indexOf(hh.parent) + 1] ?? null, (n) => n.tag === 'tr') : []) {
    const td = row.kids.filter((k) => k.tag === 'td'); if (td.length < 2) continue;
    const [from, to] = tx(td[0]).split(/\s*[—–-]\s*(?=\d{4}|Present)/);
    history.push({ team: teamName(td[1]), from: (from ?? '').trim(), to: /Present/i.test(to ?? '') ? '' : (to ?? '').trim() });
  }
  // Réglages : premier tableau de la section « Settings » / « Gear and Settings » (entêtes + 1re ligne)
  const set = section(root, 'Settings') ?? section(root, 'Gear_and_Settings');
  const r0 = rows(first(set, (n) => n.tag === 'table'))[0];
  const settings = r0 ? r0.heads.map((h, i) => ({ label: h, value: tx(r0.cells[i]) })).filter((x) => x.label && x.value && x.value.length < 40).slice(0, 10) : [];
  const { results, titles } = resultTables(root);
  return {
    realName: cell('Name'), born: born.replace(/\s*\(age \d+\)/, ''), age: (born.match(/age (\d+)/) ?? ['', ''])[1], country: cell('Nationality'),
    role: cell('Roles', 'Role', 'Position'), team: cell('Team'), earnings: cell('Approx. Total Winnings'), status: cell('Status'),
    photo: photo ? img(photo) : '', links: links(box), history: history.slice(-12).reverse(), settings, results: results.slice(0, 20), titles,
  };
}

/** Page « Liquipedia:Matches » → matchs à venir, en cours et terminés. */
export function parseMatches(html, now = Date.now()) {
  const out = [];
  for (const m of byCls(dom(html), 'match-info')) {
    const timer = first(m, (n) => n.attrs['data-timestamp']); const ts = Number(timer?.attrs['data-timestamp']) * 1000; if (!ts) continue;
    const ops = m.kids.find((k) => hasCls(k, 'match-info-header'))?.kids.filter((k) => hasCls(k, 'match-info-header-opponent')) ?? [];
    if (ops.length !== 2) continue;
    const scores = byCls(m, 'match-info-header-scoreholder-score').map(tx);
    const finished = timer.attrs['data-finished'] === 'finished';
    const a = teamName(first(ops[0], (n) => hasCls(n, 'name')) ?? ops[0]), b = teamName(first(ops[1], (n) => hasCls(n, 'name')) ?? ops[1]);
    if (!a || !b || /^TBD$/i.test(a) || /^TBD$/i.test(b)) continue;
    const tw = first(m, (n) => n.tag === 'a' && /Special:Stream\/twitch\//.test(n.attrs.href ?? ''))?.attrs.href.split('/twitch/')[1];
    out.push({
      start: new Date(ts).toISOString(), a, b, score: scores.every((x) => /^\d+$/.test(x)) ? scores.join('-') : '', bo: tx(first(m, (n) => hasCls(n, 'match-info-header-scoreholder-lower'))).replace(/[()]/g, ''),
      event: tx(first(m, (n) => hasCls(n, 'match-info-tournament-name'))), finished, live: !finished && ts <= now,
      winner: ops.findIndex((o) => hasCls(o, 'match-info-header-winner')), stream: tw ? `https://www.twitch.tv/${tw.split('/')[0]}` : '',
    });
  }
  const seen = new Set();
  return out.filter((x) => { const k = `${x.a}|${x.b}|${x.start}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((x, y) => x.start.localeCompare(y.start));
}
