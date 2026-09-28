// Côté social des comptes History Launcher : amis (par code ami), présence (jeu en cours), classement de la semaine
// entre amis, soirées jeu. Tout passe par la session du compte ; on ne voit que ses amis, jamais les autres comptes.
import { randomUUID } from 'node:crypto';
import { load, save } from '../storage.js';
import { allowAttempt } from '../dashboard/auth.js';
import { PUBLIC_BASE, checkImage, me, profileOf } from './launcherAccounts.js';

const KEY = 'launcher-social';
const MAX_FRIENDS = 200;
const MAX_REQUESTS = 50;
const MAX_EVENTS = 20;
const ONLINE_MS = 3 * 60_000;
const MAX_INBOX = 150;
const MAX_GTHREAD = 200;
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
  d.groups ??= {}; // id groupe -> { id, name, owner, members: [ids], at }
  d.gthreads ??= {}; // id groupe -> [{ id, from, text, at, re?, img?, reacts? }]
  d.reads ??= {}; // « lecteur>auteur » -> dernière lecture de la discussion
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
// Boîte en « attente longue » : le launcher garde une requête ouverte (jusqu'à 25 s) et reçoit messages,
// appels et invitations dès qu'ils arrivent, au lieu d'attendre la prochaine vérification
const waiters = new Map(); // id compte -> Set(fonctions de réveil)
function wake(id) {
  const set = waiters.get(id);
  if (!set) return;
  waiters.delete(id);
  for (const fn of set) fn();
}
function waitInbox(id, ms, req) {
  return new Promise((resolve) => {
    const set = waiters.get(id) ?? new Set();
    const done = () => { clearTimeout(timer); set.delete(done); resolve(); };
    const timer = setTimeout(done, ms);
    set.add(done);
    waiters.set(id, set);
    req.once?.('close', done);
  });
}
// « … écrit » : éphémère (pas gardé), réveille la boîte du destinataire
const typing = new Map(); // id destinataire -> [{ from, gid, at }]
function setTyping(to, from, gid = null) {
  const now = Date.now();
  typing.set(to, [...(typing.get(to) ?? []).filter((x) => now - x.at < 6000 && !(x.from === from && x.gid === gid)), { from, gid, at: now }]);
  wake(to);
}
const typingFor = (id) => (typing.get(id) ?? []).filter((x) => Date.now() - x.at < 6000);
function pushInbox(d, to, item) {
  const now = Date.now();
  // Horodatage strictement croissant : deux éléments de la même milliseconde ne se perdent pas avec « apres »
  const last = listOf(d.inbox, to).at(-1)?.at ?? 0;
  const at = Math.max(now, last + 1);
  d.inbox[to] = [...listOf(d.inbox, to), { id: randomUUID(), at, ...item }].filter((x) => now - x.at < INBOX_TTL).slice(-MAX_INBOX);
  setImmediate(() => wake(to));
}

function view(d, accs, id) {
  const now = Date.now();
  const person = (fid) => {
    const a = accs[fid];
    const p = d.presence[fid] ?? {};
    const online = now - (p.seen ?? 0) < ONLINE_MS;
    return a ? { id: fid, pseudo: a.pseudo, code: friendCode(a), ...profileOf(a), online, status: p.status ?? null, dnd: online && Boolean(p.dnd), bench: p.bench ?? null, playing: online ? p.playing ?? null : null, join: online && p.playing ? p.join ?? null : null, since: online && p.playing ? p.since ?? null : null, dispo: online && p.playing ? p.dispo ?? null : null, week: p.week ?? 0, top: p.top ?? null } : null;
  };
  return {
    code: friendCode(accs[id]),
    amis: listOf(d.friends, id).map(person).filter(Boolean).sort((a, b) => (b.online - a.online) || a.pseudo.localeCompare(b.pseudo, 'fr')),
    demandes: listOf(d.requests, id).map((fid) => accs[fid] && { id: fid, pseudo: accs[fid].pseudo, code: friendCode(accs[fid]), ...profileOf(accs[fid]) }).filter(Boolean),
    moi: { week: d.presence[id]?.week ?? 0, top: d.presence[id]?.top ?? null, pseudo: accs[id]?.pseudo, ...profileOf(accs[id]) },
    groupes: Object.values(d.groups).filter((g) => g.members.includes(id)).map((g) => ({ id: g.id, name: g.name, owner: g.owner === id, members: g.members.filter((m) => accs[m]).map((m) => ({ id: m, pseudo: accs[m].pseudo, ...profileOf(accs[m]), online: now - (d.presence[m]?.seen ?? 0) < ONLINE_MS, playing: now - (d.presence[m]?.seen ?? 0) < ONLINE_MS ? d.presence[m]?.playing ?? null : null })) })),
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

export async function handleSocialApi(req, res, url, { readJson, readBinary, send }) {
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
  if (!allowAttempt('compte-social', id, 3000, 60 * 60_000)) return send(res, 429, { error: 'Trop de demandes, réessaie plus tard.' });
  const binary = await fileRoutes(req, res, url, route, id, { readBinary, send });
  if (binary !== undefined) return binary;
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
      dispo: playing && Number(body.dispo) > Date.now() && Number(body.dispo) < Date.now() + 12 * 3_600_000 ? Math.round(Number(body.dispo)) : null,
      status: body.status ? text(body.status, 60) : null, dnd: Boolean(body.dnd),
      bench: Number.isFinite(Number(body.bench)) && Number(body.bench) > 0 ? Math.min(20_000, Math.round(Number(body.bench))) : prev.bench ?? null,
      top: body.top ? text(body.top, 80) : null, seen: Date.now(),
      level: Number.isFinite(Number(body.level)) ? Math.max(1, Math.min(999, Math.round(Number(body.level)))) : prev.level ?? null,
    };
    return done(200, { ok: true });
  }

  // Boîte de réception (messages, « on joue ? », invitations) + amis, en un seul appel (interrogé toutes les ~15 s)
  if (route === 'GET /api/compte/boite') {
    const after = Number(url.searchParams.get('apres')) || 0;
    const wait = Math.max(0, Math.min(25, Number(url.searchParams.get('attente')) || 0)) * 1000;
    if (d.presence[id]) d.presence[id].seen = Date.now();
    const fresh = () => listOf(d.inbox, id).filter((x) => x.at > after);
    if (wait && !fresh().length) {
      await waitInbox(id, wait, req);
      if (d.presence[id]) d.presence[id].seen = Date.now();
    }
    const names = wait ? await accounts() : accs;
    const items = fresh().map((x) => ({ ...x, pseudo: names[x.from]?.pseudo ?? '?' }));
    // « now » = dernier élément vu (et pas l'heure du serveur) : rien ne peut passer entre deux attentes
    const now = Math.max(after, ...items.map((x) => x.at));
    const lus = Object.fromEntries(listOf(d.friends, id).map((fid) => [fid, d.reads[`${fid}>${id}`] ?? 0]).filter(([, t]) => t));
    return done(200, { items, now, typing: typingFor(id), lus, ...view(d, accs, id) });
  }

  const friendOf = (fid) => listOf(d.friends, id).includes(fid) && accs[fid];

  // Identifiant du message choisi par le launcher : un renvoi (réseau coupé, serveur qui redémarre) ne crée pas de doublon
  const msgId = (v) => (/^[\w-]{8,64}$/.test(String(v ?? '')) ? String(v) : randomUUID());
  const withIds = (fil) => fil.map((m) => (m.id ? m : { ...m, id: `${m.at}-${String(m.from).slice(0, 8)}` }));

  // Réponse à un message précis et image jointe (capture), pour les amis comme pour les groupes
  const quote = (fil, reId) => { const m = fil.find((x) => x.id === String(reId ?? '')); return m ? { id: m.id, from: m.from, text: String(m.text || (m.img ? '📷 Image' : '')).slice(0, 90) } : null; };
  const attach = (raw) => {
    if (!raw) return { img: null };
    if (!allowAttempt('launcher-img', id, 40, 86_400_000)) return { error: 'Trop d’images aujourd’hui.' };
    const img = checkImage(raw, 1_200_000);
    if (typeof img === 'string') return { error: img };
    const imgId = randomUUID();
    save(`launcher-img-${imgId}`, img);
    return { img: imgId };
  };
  const dropImg = (m) => { if (m?.img) save(`launcher-img-${m.img}`, {}); };

  if (route === 'POST /api/compte/messages') {
    const to = String(body.to ?? '');
    const msg = text(body.text, 500);
    if (!friendOf(to)) return send(res, 404, { error: 'Ce joueur n’est pas dans tes amis.' });
    if (!msg && !body.image) return send(res, 400, { error: 'Message vide.' });
    const key = pairKey(id, to);
    const mid = msgId(body.cid);
    const fil = listOf(d.threads, key);
    if (fil.some((m) => m.id === mid)) return send(res, 200, { ok: true, id: mid, fil: withIds(fil) });
    if (!allowAttempt('launcher-msg', id, 40, 60_000)) return send(res, 429, { error: 'Doucement : trop de messages d’un coup.' });
    const a = attach(body.image);
    if (a.error) return send(res, 400, { error: a.error });
    const m = { id: mid, from: id, text: msg, at: Date.now(), ...(quote(fil, body.re) ? { re: quote(fil, body.re) } : {}), ...(a.img ? { img: a.img, imgUrl: `${PUBLIC_BASE}/api/compte/img/${a.img}` } : {}) };
    const kept = [...fil, m];
    for (const old of kept.slice(0, -MAX_THREAD)) dropImg(old);
    d.threads[key] = kept.slice(-MAX_THREAD);
    d.reads[`${id}>${to}`] = m.at; // écrire = avoir lu ce qui précède
    pushInbox(d, to, { type: 'msg', from: id, text: msg || '📷 Image', msg: mid, sentAt: m.at });
    return done(200, { ok: true, id: mid, message: m, fil: withIds(d.threads[key]) });
  }

  // Lu : « Vu à 21 h 04 » chez l'ami
  if (route === 'POST /api/compte/messages/lu') {
    const fid = String(body.avec ?? '');
    if (!friendOf(fid)) return send(res, 404, { error: 'Ce joueur n’est pas dans tes amis.' });
    const k = `${id}>${fid}`;
    const last = (d.threads[pairKey(id, fid)] ?? []).filter((m) => m.from === fid).at(-1)?.at ?? 0;
    if (last && (d.reads[k] ?? 0) < last) { d.reads[k] = Date.now(); wake(fid); return done(200, { ok: true }); }
    return send(res, 200, { ok: true });
  }
  // « … écrit » (ami ou groupe), éphémère
  if (route === 'POST /api/compte/messages/ecrit') {
    if (!allowAttempt('launcher-ecrit', id, 40, 60_000)) return send(res, 200, { ok: true });
    if (body.groupe) { const g = d.groups[String(body.groupe)]; if (g?.members.includes(id)) for (const m of g.members.filter((x) => x !== id)) setTyping(m, id, g.id); }
    else if (friendOf(String(body.to ?? ''))) setTyping(String(body.to), id);
    return send(res, 200, { ok: true });
  }
  // Réactions 👍 😂 🔥 ❤️ 😮 😢 (ami ou groupe)
  if (route === 'POST /api/compte/messages/reagir') {
    const emoji = ['👍', '😂', '🔥', '❤️', '😮', '😢'].find((e) => e === body.emoji);
    if (!emoji) return send(res, 400, { error: 'Réaction inconnue.' });
    let fil; let targets;
    if (body.groupe) { const g = d.groups[String(body.groupe)]; if (!g?.members.includes(id)) return send(res, 404, { error: 'Groupe introuvable.' }); fil = listOf(d.gthreads, g.id); targets = g.members.filter((x) => x !== id).map((to) => [to, { gid: g.id }]); }
    else { const fid = String(body.avec ?? ''); if (!friendOf(fid)) return send(res, 404, { error: 'Ce joueur n’est pas dans tes amis.' }); fil = withIds(listOf(d.threads, pairKey(id, fid))); d.threads[pairKey(id, fid)] = fil; targets = [[fid, {}]]; }
    const m = fil.find((x) => x.id === String(body.id ?? ''));
    if (!m) return send(res, 404, { error: 'Message introuvable.' });
    if (!allowAttempt('launcher-react', id, 60, 60_000)) return send(res, 429, { error: 'Doucement.' });
    const who = new Set(m.reacts?.[emoji] ?? []);
    if (who.has(id)) who.delete(id); else who.add(id);
    m.reacts = { ...(m.reacts ?? {}), [emoji]: [...who] };
    if (!who.size) delete m.reacts[emoji];
    for (const [to, extra] of targets) pushInbox(d, to, { type: 'react', from: id, msg: m.id, emoji, on: who.has(id), ...extra });
    return done(200, { ok: true, message: m });
  }

  if (route === 'GET /api/compte/messages') {
    const fid = String(url.searchParams.get('avec') ?? '');
    if (!friendOf(fid)) return send(res, 404, { error: 'Ce joueur n’est pas dans tes amis.' });
    return send(res, 200, { fil: withIds(d.threads[pairKey(id, fid)] ?? []), lu: d.reads[`${fid}>${id}`] ?? 0 });
  }

  // Supprimer un de ses messages (pour les deux)
  if (route === 'POST /api/compte/messages/supprimer') {
    const fid = String(body.avec ?? '');
    const mid = String(body.id ?? '');
    if (!friendOf(fid)) return send(res, 404, { error: 'Ce joueur n’est pas dans tes amis.' });
    const key = pairKey(id, fid);
    const fil = withIds(listOf(d.threads, key));
    const m = fil.find((x) => x.id === mid);
    if (!m) return send(res, 200, { ok: true, fil });
    if (m.from !== id) return send(res, 403, { error: 'Tu ne peux supprimer que tes messages.' });
    d.threads[key] = fil.filter((x) => x.id !== mid);
    dropImg(m);
    pushInbox(d, fid, { type: 'msgdel', from: id, msg: mid });
    return done(200, { ok: true, fil: d.threads[key] });
  }

  // Groupes de jeu (« Squad RL ») : créés avec ses amis, un message prévient tout le groupe d'un coup
  if (route === 'POST /api/compte/groupes') {
    const name = text(body.nom, 40);
    if (!name) return send(res, 400, { error: 'Donne un nom au groupe.' });
    if (Object.values(d.groups).filter((g) => g.owner === id).length >= 20) return send(res, 400, { error: 'Trop de groupes (20 maximum).' });
    const members = [...new Set((Array.isArray(body.membres) ? body.membres : []).map(String))].filter((fid) => friendOf(fid)).slice(0, 30);
    if (!members.length) return send(res, 400, { error: 'Ajoute au moins un ami.' });
    const g = { id: randomUUID(), name, owner: id, members: [id, ...members], at: Date.now() };
    d.groups[g.id] = g;
    for (const m of members) pushInbox(d, m, { type: 'group', from: id, group: name, text: `Tu as été ajouté au groupe « ${name} ».` });
    return done(200, { ok: true, ...view(d, accs, id) });
  }
  // Discussion de groupe
  const groupOf = (gid) => { const g = d.groups[String(gid ?? '')]; return g && g.members.includes(id) ? g : null; };
  if (route === 'GET /api/compte/groupes/messages') {
    const g = groupOf(url.searchParams.get('id'));
    if (!g) return send(res, 404, { error: 'Groupe introuvable.' });
    return send(res, 200, { fil: d.gthreads[g.id] ?? [] });
  }
  if (route === 'POST /api/compte/groupes/messages') {
    const g = groupOf(body.id);
    if (!g) return send(res, 404, { error: 'Groupe introuvable.' });
    const msg = text(body.text, 500);
    if (!msg && !body.image) return send(res, 400, { error: 'Message vide.' });
    const mid = msgId(body.cid);
    const fil = listOf(d.gthreads, g.id);
    if (fil.some((m) => m.id === mid)) return send(res, 200, { ok: true, id: mid, fil });
    if (!allowAttempt('launcher-msg', id, 40, 60_000)) return send(res, 429, { error: 'Doucement : trop de messages d’un coup.' });
    const a = attach(body.image);
    if (a.error) return send(res, 400, { error: a.error });
    const m = { id: mid, from: id, text: msg, at: Date.now(), ...(quote(fil, body.re) ? { re: quote(fil, body.re) } : {}), ...(a.img ? { img: a.img, imgUrl: `${PUBLIC_BASE}/api/compte/img/${a.img}` } : {}) };
    const kept = [...fil, m];
    for (const old of kept.slice(0, -MAX_GTHREAD)) dropImg(old);
    d.gthreads[g.id] = kept.slice(-MAX_GTHREAD);
    for (const to of g.members.filter((x) => x !== id)) pushInbox(d, to, { type: 'gmsg', from: id, gid: g.id, group: g.name, text: msg || '📷 Image', msg: mid, sentAt: m.at });
    return done(200, { ok: true, id: mid, message: m, fil: d.gthreads[g.id] });
  }
  if (route === 'POST /api/compte/groupes/messages/supprimer') {
    const g = groupOf(body.id);
    if (!g) return send(res, 404, { error: 'Groupe introuvable.' });
    const mid = String(body.msg ?? '');
    const fil = listOf(d.gthreads, g.id);
    const m = fil.find((x) => x.id === mid);
    if (!m) return send(res, 200, { ok: true, fil });
    if (m.from !== id) return send(res, 403, { error: 'Tu ne peux supprimer que tes messages.' });
    d.gthreads[g.id] = fil.filter((x) => x.id !== mid);
    dropImg(m);
    for (const to of g.members.filter((x) => x !== id)) pushInbox(d, to, { type: 'gmsgdel', from: id, gid: g.id, msg: mid });
    return done(200, { ok: true, fil: d.gthreads[g.id] });
  }
  if (route === 'POST /api/compte/groupes/prevenir') {
    const g = d.groups[String(body.id ?? '')];
    if (!g || !g.members.includes(id)) return send(res, 404, { error: 'Groupe introuvable.' });
    const msg = text(body.text, 200) || 'On joue ?';
    if (!allowAttempt('launcher-groupe', id, 10, 10 * 60_000)) return send(res, 429, { error: 'Doucement : réessaie dans quelques minutes.' });
    for (const m of g.members.filter((x) => x !== id)) pushInbox(d, m, { type: 'group', from: id, gid: g.id, group: g.name, text: msg, game: d.presence[id]?.playing ?? null, join: d.presence[id]?.join ?? null });
    return done(200, { ok: true, sent: g.members.length - 1 });
  }
  if (route === 'POST /api/compte/groupes/quitter') {
    const g = d.groups[String(body.id ?? '')];
    if (!g || !g.members.includes(id)) return send(res, 404, { error: 'Groupe introuvable.' });
    if (g.owner === id) { delete d.groups[g.id]; delete d.gthreads[g.id]; } else g.members = g.members.filter((m) => m !== id);
    return done(200, { ok: true, ...view(d, accs, id) });
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
    // Benchmark v2 (« extrême ») : classement séparé, les scores de la v1 ne sont pas comparables
    const v2 = Number(body.v) === 2;
    const table = v2 ? (d.bench2 ??= {}) : (d.bench ??= {});
    const prev = table[id];
    const raw = v2 && body.raw && typeof body.raw === 'object' ? { geometry: num(body.raw.gpu?.geometry), shader: num(body.raw.gpu?.shader), post: num(body.raw.gpu?.post), ramLat: num(body.raw.ramLat) } : null;
    if (!prev || total >= prev.total) table[id] = { total, cpu1: num(sc.cpu1), cpuN: num(sc.cpuN), ram: num(sc.ram), disk: num(sc.disk), gpu: num(sc.gpu), cpu: text(body.cpu, 80) || null, gpuName: text(body.gpu, 80) || null, raw, at: Date.now() };
    return done(200, { ok: true, best: table[id].total });
  }
  if (route === 'GET /api/compte/benchmark/classement') {
    const all = Object.entries(d.bench2 ?? {}).filter(([k]) => accs[k]).map(([k, v]) => ({ id: k, pseudo: accs[k].pseudo, ...v })).sort((a, b) => b.total - a.total);
    const rank = all.findIndex((x) => x.id === id);
    const friends = listOf(d.friends, id);
    return send(res, 200, { top: all.slice(0, 50).map(({ id: k, raw, ...x }) => ({ ...x, moi: k === id, ami: friends.includes(k) })), rang: rank >= 0 ? rank + 1 : null, total: all.length });
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

  // Promos : prix suivis et liste de souhaits Steam, vérifiés aussi par le bot (message privé Discord, même PC éteint)
  if (route === 'POST /api/compte/alertes') {
    const steam = /^\d{17}$/.test(String(body.steam ?? '')) ? String(body.steam) : null;
    const alerts = (Array.isArray(body.prix) ? body.prix : []).slice(0, 50).map((a) => ({ appId: String(a?.appId ?? ''), name: text(a?.name, 80), target: Math.max(0, Math.min(1000, Number(a?.target) || 0)) })).filter((a) => /^\d{1,10}$/.test(a.appId));
    const prev = (d.watch ??= {})[id] ?? {};
    d.watch[id] = { steam, alerts, dm: body.mp !== false, seen: prev.seen ?? {}, at: Date.now() };
    return done(200, { ok: true, suivis: alerts.length });
  }

  // FPS mesurés en jeu (PresentMon) : partagés avec la commande /launcher fps
  if (route === 'POST /api/compte/fps') {
    const game = text(body.jeu, 80);
    const avg = Math.round(Number(body.avg)); const low1 = Math.round(Number(body.low1));
    if (!game || !(avg > 0 && avg < 2000) || !(low1 >= 0 && low1 <= avg) || !(Number(body.minutes) >= 5)) return send(res, 400, { error: 'Mesure invalide.' });
    const k = gameKey(game);
    const g = ((d.fps ??= {})[k] ??= { name: game, by: {} });
    g.by[id] = { avg, low1, at: Date.now() };
    const keys = Object.keys(d.fps);
    if (keys.length > 300) for (const old of keys.sort((a, b) => lastAt(d.fps[a]) - lastAt(d.fps[b])).slice(0, keys.length - 300)) delete d.fps[old];
    return done(200, { ok: true });
  }

  // Lancer une partie avec un groupe : le bot mentionne sur Discord les membres qui ont lié leur compte
  if (route === 'POST /api/compte/groupes/partie') {
    const g = d.groups[String(body.id ?? '')];
    if (!g || !g.members.includes(id)) return send(res, 404, { error: 'Groupe introuvable.' });
    if (!allowAttempt('launcher-partie', id, 6, 30 * 60_000)) return send(res, 429, { error: 'Doucement : réessaie dans quelques minutes.' });
    const game = text(body.jeu, 80) || d.presence[id]?.playing || null;
    const msg = text(body.texte, 200) || (game ? `On lance ${game} !` : 'On lance une partie !');
    const members = g.members.filter((m) => accs[m]).map((m) => ({ id: m, pseudo: accs[m].pseudo, discordId: accs[m].discordId ?? null }));
    const r = await (await import('./launcherDiscord.js')).postParty({ group: g.name, owner: members.find((m) => m.id === id), members, game, text: msg })
      .catch((err) => ({ ok: false, error: `Discord injoignable (${err.message}).` }));
    for (const m of g.members.filter((x) => x !== id)) pushInbox(d, m, { type: 'group', from: id, group: g.name, text: msg, game, join: d.presence[id]?.join ?? null });
    return done(r.ok ? 200 : 502, { ...r, sent: g.members.length - 1 });
  }

  return send(res, 404, { error: 'route inconnue' });
}

const gameKey = (name) => String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const lastAt = (g) => Math.max(0, ...Object.values(g?.by ?? {}).map((x) => x.at));
export { gameKey };

// ---------- Fichiers : clips vers Discord, sauvegardes partagées entre amis ----------
const CLIP_MAX = 60 * 1024 * 1024;
const SHARE_MAX = 25 * 1024 * 1024;
const SHARE_TTL = 24 * 3_600_000;
const SHARE_TOTAL = 300 * 1024 * 1024;
const shares = new Map(); // id -> { id, from, to, game, name, buf, at } (en mémoire : valable 24 h)
function sweepShares() {
  const now = Date.now();
  for (const [k, x] of shares) if (now - x.at > SHARE_TTL) shares.delete(k);
  let total = [...shares.values()].reduce((n, x) => n + x.buf.length, 0);
  for (const [k, x] of [...shares].sort((a, b) => a[1].at - b[1].at)) { if (total <= SHARE_TOTAL) break; total -= x.buf.length; shares.delete(k); }
}
async function fileRoutes(req, res, url, route, id, { readBinary, send: rawSend }) {
  const send = (...a) => { rawSend(...a); return true; };
  if (route === 'POST /api/compte/discord/clip') {
    const accs = await accounts();
    const acc = accs[id];
    if (!acc?.discordId) return send(res, 403, { error: 'Lie d’abord ton compte Discord (Paramètres › Compte › Lier Discord).' });
    if (!allowAttempt('launcher-clip', id, 12, 60 * 60_000)) return send(res, 429, { error: 'Trop de clips envoyés, réessaie dans un moment.' });
    const ext = String(url.searchParams.get('type') ?? '').toLowerCase();
    if (!['png', 'jpg', 'webm', 'mp4'].includes(ext)) return send(res, 400, { error: 'Format non pris en charge.' });
    const buf = await readBinary(req, CLIP_MAX).catch(() => null);
    if (!buf?.length) return send(res, 413, { error: 'Fichier trop gros (60 Mo maximum).' });
    const r = await (await import('./launcherDiscord.js')).postClip({ discordId: acc.discordId, pseudo: acc.pseudo, buf, ext, game: text(url.searchParams.get('jeu'), 80) || null, note: text(url.searchParams.get('texte'), 200) || null })
      .catch((err) => ({ ok: false, error: `Envoi impossible (${err.message}).` }));
    return send(res, r.ok ? 200 : 502, r);
  }
  if (route === 'POST /api/compte/partage') {
    const to = String(url.searchParams.get('a') ?? '');
    const d = await data();
    const accs = await accounts();
    if (!listOf(d.friends, id).includes(to) || !accs[to]) return send(res, 404, { error: 'Ce joueur n’est pas dans tes amis.' });
    if (!allowAttempt('launcher-partage', id, 10, 60 * 60_000)) return send(res, 429, { error: 'Trop de partages, réessaie dans un moment.' });
    const buf = await readBinary(req, SHARE_MAX).catch(() => null);
    if (!buf?.length) return send(res, 413, { error: 'Sauvegarde trop grosse (25 Mo maximum).' });
    sweepShares();
    const s = { id: randomUUID(), from: id, to, game: text(url.searchParams.get('jeu'), 80) || 'Jeu', name: text(url.searchParams.get('nom'), 80) || 'Sauvegarde', buf, at: Date.now() };
    shares.set(s.id, s);
    pushInbox(d, to, { type: 'share', from: id, share: s.id, game: s.game, text: s.name, size: buf.length });
    save(KEY, d);
    return send(res, 200, { ok: true });
  }
  if (route === 'GET /api/compte/partage') {
    sweepShares();
    const s = shares.get(String(url.searchParams.get('id') ?? ''));
    if (!s || s.to !== id) return send(res, 404, { error: 'Partage introuvable ou expiré (24 h).' });
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': s.buf.length, 'Cache-Control': 'no-store' });
    res.end(s.buf);
    return true;
  }
  return undefined;
}

/** Pour le bot : message dans la boîte du launcher d'un compte (ex. « X vient à ta partie »). */
export async function notifyAccount(to, item) {
  const d = await data();
  pushInbox(d, to, item);
  save(KEY, d);
}
/** Pour le bot : suivis de prix, FPS partagés. */
export async function socialData() { return data(); }
export const saveSocial = (d) => save(KEY, d);
