// Côté social des comptes History Launcher : amis (par code ami), présence (jeu en cours), classement de la semaine
// entre amis, soirées jeu. Tout passe par la session du compte ; on ne voit que ses amis, jamais les autres comptes.
import { randomUUID } from 'node:crypto';
import { load, save } from '../storage.js';
import { allowAttempt } from '../dashboard/auth.js';
import { me } from './launcherAccounts.js';

const KEY = 'launcher-social';
const MAX_FRIENDS = 200;
const MAX_REQUESTS = 50;
const MAX_EVENTS = 20;
const ONLINE_MS = 3 * 60_000;
const MAX_INBOX = 60;
const MAX_THREAD = 100;
const INBOX_TTL = 3 * 86_400_000;

async function data() {
  const d = (await load(KEY, null)) ?? {};
  d.friends ??= {}; // id -> [ids]
  d.requests ??= {}; // id destinataire -> [ids expéditeurs]
  d.presence ??= {}; // id -> { playing, week, top, seen }
  d.events ??= {}; // id soirée -> { id, owner, game, at, invites: { id: 'oui'|'non'|null } }
  d.inbox ??= {}; // id -> [{ id, type: msg|ask|invite|reply, from, text?, game?, join?, oui?, at }]
  d.threads ??= {}; // « idA:idB » -> [{ from, text, at }]
  return d;
}
const accounts = async () => (await load('launcher-comptes', null))?.accounts ?? {};
export const friendCode = (a) => `${a.pseudo}#${a.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const listOf = (obj, id) => (obj[id] ??= []);
const pairKey = (a, b) => [a, b].sort().join(':');
/** Infos pour rejoindre une partie : jeu Steam (numéro) ou serveur FiveM (code cfx.re ou IP:port). */
export function cleanJoin(j) {
  if (!j || typeof j !== 'object') return null;
  if (/^\d{1,10}$/.test(String(j.steam ?? ''))) return { steam: String(j.steam) };
  const f = String(j.fivem ?? '').toLowerCase();
  if (/^[a-z0-9]{4,10}$/.test(f) || /^\d{1,3}(\.\d{1,3}){3}:\d{2,5}$/.test(f)) return { fivem: f };
  return null;
}
function pushInbox(d, to, item) {
  const now = Date.now();
  d.inbox[to] = [...listOf(d.inbox, to), { id: randomUUID(), at: now, ...item }].filter((x) => now - x.at < INBOX_TTL).slice(-MAX_INBOX);
}

function view(d, accs, id) {
  const now = Date.now();
  const person = (fid) => {
    const a = accs[fid];
    const p = d.presence[fid] ?? {};
    const online = now - (p.seen ?? 0) < ONLINE_MS;
    return a ? { id: fid, pseudo: a.pseudo, code: friendCode(a), online, status: p.status ?? null, dnd: online && Boolean(p.dnd), bench: p.bench ?? null, playing: online ? p.playing ?? null : null, join: online && p.playing ? p.join ?? null : null, since: online && p.playing ? p.since ?? null : null, week: p.week ?? 0, top: p.top ?? null } : null;
  };
  return {
    code: friendCode(accs[id]),
    amis: listOf(d.friends, id).map(person).filter(Boolean).sort((a, b) => (b.online - a.online) || a.pseudo.localeCompare(b.pseudo, 'fr')),
    demandes: listOf(d.requests, id).map((fid) => accs[fid] && { id: fid, pseudo: accs[fid].pseudo, code: friendCode(accs[fid]) }).filter(Boolean),
    moi: { week: d.presence[id]?.week ?? 0, top: d.presence[id]?.top ?? null },
  };
}

function eventsFor(d, accs, id) {
  const now = Date.now();
  // On garde les soirées passées pendant 6 h (le temps de jouer), puis elles disparaissent
  for (const [eid, e] of Object.entries(d.events)) if (now - e.at > 6 * 3_600_000) delete d.events[eid];
  return Object.values(d.events).filter((e) => e.owner === id || id in e.invites).sort((a, b) => a.at - b.at).map((e) => ({
    id: e.id, game: e.game, at: e.at, mine: e.owner === id, organisateur: accs[e.owner]?.pseudo ?? '?',
    ma: e.owner === id ? 'oui' : e.invites[id] ?? null,
    invites: Object.entries(e.invites).map(([fid, r]) => ({ pseudo: accs[fid]?.pseudo ?? '?', reponse: r })),
  }));
}

// ---------- Appels vocaux entre amis (WebRTC pair à pair ; le serveur ne fait que passer les signaux) ----------
const calls = new Map(); // id appel -> { id, from, to, at, state, signals: { [compte]: [..] }, endedBy }
const CALL_RING_MS = 45_000;
function sweepCalls() {
  const now = Date.now();
  for (const [k, c] of calls) {
    if (c.state === 'ringing' && now - c.at > CALL_RING_MS) { c.state = 'missed'; c.endAt = now; }
    if (c.endAt && now - c.endAt > 60_000) calls.delete(k);
    else if (now - c.at > 6 * 3_600_000) calls.delete(k);
  }
}
async function callRoute(req, res, url, route, id, { readJson, send }) {
  sweepCalls();
  const body = req.method === 'POST' ? await readJson(req) : {};
  const d = await data();
  const accs = await accounts();
  const other = (c) => (c.from === id ? c.to : c.from);
  const view = (c) => ({ id: c.id, state: c.state, from: c.from, to: c.to, avec: accs[other(c)]?.pseudo ?? '?', moi: c.from === id ? 'appelant' : 'appele', since: c.acceptedAt ?? null });
  if (route === 'POST /api/compte/appel') {
    const to = String(body.to ?? '');
    if (!listOf(d.friends, id).includes(to) || !accs[to]) return send(res, 404, { error: 'Ce joueur n’est pas dans tes amis.' });
    if (Date.now() - (d.presence[to]?.seen ?? 0) > ONLINE_MS) return send(res, 409, { error: `${accs[to].pseudo} n’est pas en ligne.` });
    for (const c of calls.values()) if ([c.from, c.to].includes(to) && ['ringing', 'live'].includes(c.state)) return send(res, 409, { error: `${accs[to].pseudo} est déjà en appel.` });
    const c = { id: randomUUID(), from: id, to, at: Date.now(), state: 'ringing', signals: { [id]: [], [to]: [] } };
    calls.set(c.id, c);
    pushInbox(d, to, { type: 'call', from: id, callId: c.id });
    save(KEY, d);
    return send(res, 201, view(c));
  }
  const c = calls.get(String(body.call ?? url.searchParams.get('call') ?? ''));
  if (!c || (c.from !== id && c.to !== id)) return send(res, 404, { error: 'Appel introuvable ou terminé.' });
  if (route === 'POST /api/compte/appel/repondre') {
    if (c.to !== id || c.state !== 'ringing') return send(res, 409, { error: 'Cet appel n’attend plus de réponse.' });
    c.state = body.oui ? 'live' : 'declined';
    if (body.oui) c.acceptedAt = Date.now(); else c.endAt = Date.now();
    return send(res, 200, view(c));
  }
  if (route === 'POST /api/compte/appel/signal') {
    const raw = JSON.stringify(body.data ?? null);
    if (!['ringing', 'live'].includes(c.state) || raw.length > 20_000) return send(res, 400, { error: 'Signal refusé.' });
    const q = c.signals[other(c)];
    if (q.length >= 300) return send(res, 429, { error: 'Trop de signaux.' });
    q.push({ n: q.length, data: body.data });
    return send(res, 200, { ok: true });
  }
  if (route === 'GET /api/compte/appel/signal') {
    const after = Number(url.searchParams.get('apres') ?? -1);
    return send(res, 200, { ...view(c), signals: c.signals[id].filter((x) => x.n > after) });
  }
  if (route === 'POST /api/compte/appel/fin') {
    if (['ringing', 'live'].includes(c.state)) { c.state = 'ended'; c.endAt = Date.now(); c.endedBy = id; }
    return send(res, 200, view(c));
  }
  return send(res, 404, { error: 'route inconnue' });
}

export async function handleSocialApi(req, res, url, { readJson, send }) {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  const compte = await me(token);
  if (!compte) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
  const id = compte.id;
  const route = `${req.method} ${url.pathname}`;
  // Appels : la mise en relation (signaux WebRTC) est interrogée chaque seconde pendant un appel, plafond à part
  if (url.pathname.startsWith('/api/compte/appel')) {
    if (!allowAttempt('compte-appel', id, 4000, 60 * 60_000)) return send(res, 429, { error: 'Trop de demandes, réessaie plus tard.' });
    return callRoute(req, res, url, route, id, { readJson, send });
  }
  if (!allowAttempt('compte-social', id, 900, 60 * 60_000)) return send(res, 429, { error: 'Trop de demandes, réessaie plus tard.' });
  const body = req.method === 'POST' ? await readJson(req) : {};
  const d = await data();
  const accs = await accounts();
  const done = (status, payload) => { save(KEY, d); return send(res, status, payload); };

  if (route === 'GET /api/compte/amis') return send(res, 200, view(d, accs, id));

  if (route === 'POST /api/compte/amis/ajouter') {
    const code = text(body.code, 40).toLowerCase();
    const target = Object.values(accs).find((a) => friendCode(a).toLowerCase() === code);
    if (!target) return send(res, 404, { error: 'Aucun joueur avec ce code ami.' });
    if (target.id === id) return send(res, 400, { error: 'C’est ton propre code 🙂' });
    if (listOf(d.friends, id).includes(target.id)) return send(res, 409, { error: 'Vous êtes déjà amis.' });
    if (listOf(d.friends, id).length >= MAX_FRIENDS) return send(res, 400, { error: 'Liste d’amis pleine.' });
    // Il m'avait déjà demandé : on devient amis directement
    if (listOf(d.requests, id).includes(target.id)) {
      d.requests[id] = d.requests[id].filter((x) => x !== target.id);
      listOf(d.friends, id).push(target.id);
      listOf(d.friends, target.id).push(id);
      return done(200, { ok: true, amis: true });
    }
    const inbox = listOf(d.requests, target.id);
    if (!inbox.includes(id)) {
      if (inbox.length >= MAX_REQUESTS) return send(res, 400, { error: 'Ce joueur a trop de demandes en attente.' });
      inbox.push(id);
    }
    return done(200, { ok: true, envoye: true });
  }

  if (route === 'POST /api/compte/amis/accepter') {
    const fid = String(body.id ?? '');
    if (!listOf(d.requests, id).includes(fid) || !accs[fid]) return send(res, 404, { error: 'Demande introuvable.' });
    d.requests[id] = d.requests[id].filter((x) => x !== fid);
    if (!listOf(d.friends, id).includes(fid)) listOf(d.friends, id).push(fid);
    if (!listOf(d.friends, fid).includes(id)) listOf(d.friends, fid).push(id);
    return done(200, view(d, accs, id));
  }

  if (route === 'POST /api/compte/amis/retirer') {
    const fid = String(body.id ?? '');
    d.requests[id] = listOf(d.requests, id).filter((x) => x !== fid);
    d.friends[id] = listOf(d.friends, id).filter((x) => x !== fid);
    d.friends[fid] = listOf(d.friends, fid).filter((x) => x !== id);
    return done(200, view(d, accs, id));
  }

  if (route === 'POST /api/compte/presence') {
    const prev = d.presence[id] ?? {};
    const playing = body.playing ? text(body.playing, 80) : null;
    d.presence[id] = {
      playing, join: playing ? cleanJoin(body.join) : null,
      since: playing ? (prev.playing === playing && prev.since ? prev.since : Date.now()) : null,
      week: Math.max(0, Math.min(10_080, Math.round(Number(body.week) || 0))), // minutes sur 7 jours, plafonnées
      status: body.status ? text(body.status, 60) : null, dnd: Boolean(body.dnd),
      bench: Number.isFinite(Number(body.bench)) && Number(body.bench) > 0 ? Math.min(20_000, Math.round(Number(body.bench))) : prev.bench ?? null,
      top: body.top ? text(body.top, 80) : null, seen: Date.now(),
    };
    return done(200, { ok: true });
  }

  // Boîte de réception (messages, « on joue ? », invitations) + amis, en un seul appel (interrogé toutes les ~15 s)
  if (route === 'GET /api/compte/boite') {
    const after = Number(url.searchParams.get('apres')) || 0;
    if (d.presence[id]) d.presence[id].seen = Date.now();
    const items = listOf(d.inbox, id).filter((x) => x.at > after).map((x) => ({ ...x, pseudo: accs[x.from]?.pseudo ?? '?' }));
    return done(200, { items, now: Date.now(), ...view(d, accs, id) });
  }

  const friendOf = (fid) => listOf(d.friends, id).includes(fid) && accs[fid];

  if (route === 'POST /api/compte/messages') {
    const to = String(body.to ?? '');
    const msg = text(body.text, 500);
    if (!friendOf(to)) return send(res, 404, { error: 'Ce joueur n’est pas dans tes amis.' });
    if (!msg) return send(res, 400, { error: 'Message vide.' });
    const key = pairKey(id, to);
    d.threads[key] = [...listOf(d.threads, key), { from: id, text: msg, at: Date.now() }].slice(-MAX_THREAD);
    pushInbox(d, to, { type: 'msg', from: id, text: msg });
    return done(200, { ok: true, fil: d.threads[key] });
  }

  if (route === 'GET /api/compte/messages') {
    const fid = String(url.searchParams.get('avec') ?? '');
    if (!friendOf(fid)) return send(res, 404, { error: 'Ce joueur n’est pas dans tes amis.' });
    return send(res, 200, { fil: d.threads[pairKey(id, fid)] ?? [] });
  }

  // « On joue ? » (demander à rejoindre sa partie) ou invitation à rejoindre la mienne
  if (route === 'POST /api/compte/inviter') {
    const to = String(body.to ?? '');
    if (!friendOf(to)) return send(res, 404, { error: 'Ce joueur n’est pas dans tes amis.' });
    const type = body.type === 'invite' ? 'invite' : 'ask';
    const recent = listOf(d.inbox, to).some((x) => x.from === id && x.type === type && Date.now() - x.at < 60_000);
    if (recent) return send(res, 429, { error: 'Déjà envoyé, attends un peu.' });
    const game = text(body.game, 80) || (type === 'invite' ? d.presence[id]?.playing : d.presence[to]?.playing) || null;
    pushInbox(d, to, { type, from: id, game, join: type === 'invite' ? cleanJoin(body.join) ?? d.presence[id]?.join ?? null : null });
    return done(200, { ok: true });
  }

  if (route === 'POST /api/compte/inviter/repondre') {
    const box = listOf(d.inbox, id);
    const item = box.find((x) => x.id === String(body.id ?? '') && ['ask', 'invite'].includes(x.type));
    if (!item || !friendOf(item.from)) return send(res, 404, { error: 'Demande introuvable.' });
    d.inbox[id] = box.filter((x) => x !== item);
    const oui = Boolean(body.oui);
    // Réponse à un « on joue ? » : si oui, on lui envoie de quoi rejoindre ma partie
    pushInbox(d, item.from, { type: 'reply', from: id, oui, game: item.game, join: oui && item.type === 'ask' ? d.presence[id]?.join ?? null : null });
    return done(200, { ok: true, join: oui && item.type === 'invite' ? item.join : null });
  }

  // Classement mondial des benchmarks (meilleur score de chaque compte)
  if (route === 'POST /api/compte/benchmark') {
    const sc = body.scores ?? {};
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(20_000, Math.round(Number(v))) : null);
    const total = num(sc.total);
    if (!total) return send(res, 400, { error: 'Score invalide.' });
    d.bench ??= {};
    const prev = d.bench[id];
    if (!prev || total >= prev.total) d.bench[id] = { total, cpu1: num(sc.cpu1), cpuN: num(sc.cpuN), ram: num(sc.ram), disk: num(sc.disk), gpu: num(sc.gpu), cpu: text(body.cpu, 80) || null, gpuName: text(body.gpu, 80) || null, at: Date.now() };
    return done(200, { ok: true, best: d.bench[id].total });
  }
  if (route === 'GET /api/compte/benchmark/classement') {
    const all = Object.entries(d.bench ?? {}).filter(([k]) => accs[k]).map(([k, v]) => ({ id: k, pseudo: accs[k].pseudo, ...v })).sort((a, b) => b.total - a.total);
    const rank = all.findIndex((x) => x.id === id);
    const friends = listOf(d.friends, id);
    return send(res, 200, { top: all.slice(0, 50).map(({ id: k, ...x }) => ({ ...x, moi: k === id, ami: friends.includes(k) })), rang: rank >= 0 ? rank + 1 : null, total: all.length });
  }

  if (route === 'GET /api/compte/soirees') return done(200, { soirees: eventsFor(d, accs, id) });

  if (route === 'POST /api/compte/soirees') {
    const game = text(body.jeu, 80);
    const at = Number(body.at);
    const mine = Object.values(d.events).filter((e) => e.owner === id).length;
    if (!game) return send(res, 400, { error: 'Choisis un jeu.' });
    if (!Number.isFinite(at) || at < Date.now() - 60_000 || at > Date.now() + 60 * 86_400_000) return send(res, 400, { error: 'Choisis une date dans les 60 prochains jours.' });
    if (mine >= MAX_EVENTS) return send(res, 400, { error: 'Trop de soirées prévues.' });
    const friends = listOf(d.friends, id);
    const invites = [...new Set((Array.isArray(body.invites) ? body.invites : []).map(String))].filter((fid) => friends.includes(fid)).slice(0, 50);
    if (!invites.length) return send(res, 400, { error: 'Invite au moins un ami.' });
    const ev = { id: randomUUID(), owner: id, game, at, invites: Object.fromEntries(invites.map((fid) => [fid, null])) };
    d.events[ev.id] = ev;
    return done(201, { soirees: eventsFor(d, accs, id) });
  }

  if (route === 'POST /api/compte/soirees/repondre') {
    const ev = d.events[String(body.id ?? '')];
    if (!ev || !(id in ev.invites)) return send(res, 404, { error: 'Soirée introuvable.' });
    ev.invites[id] = body.reponse === 'oui' ? 'oui' : 'non';
    return done(200, { soirees: eventsFor(d, accs, id) });
  }

  if (route === 'POST /api/compte/soirees/annuler') {
    const ev = d.events[String(body.id ?? '')];
    if (!ev || ev.owner !== id) return send(res, 404, { error: 'Soirée introuvable.' });
    delete d.events[ev.id];
    return done(200, { soirees: eventsFor(d, accs, id) });
  }

  return send(res, 404, { error: 'route inconnue' });
}
