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

async function data() {
  const d = (await load(KEY, null)) ?? {};
  d.friends ??= {}; // id -> [ids]
  d.requests ??= {}; // id destinataire -> [ids expéditeurs]
  d.presence ??= {}; // id -> { playing, week, top, seen }
  d.events ??= {}; // id soirée -> { id, owner, game, at, invites: { id: 'oui'|'non'|null } }
  return d;
}
const accounts = async () => (await load('launcher-comptes', null))?.accounts ?? {};
export const friendCode = (a) => `${a.pseudo}#${a.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const listOf = (obj, id) => (obj[id] ??= []);

function view(d, accs, id) {
  const now = Date.now();
  const person = (fid) => {
    const a = accs[fid];
    const p = d.presence[fid] ?? {};
    const online = now - (p.seen ?? 0) < ONLINE_MS;
    return a ? { id: fid, pseudo: a.pseudo, code: friendCode(a), online, playing: online ? p.playing ?? null : null, week: p.week ?? 0, top: p.top ?? null } : null;
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

export async function handleSocialApi(req, res, url, { readJson, send }) {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  const compte = await me(token);
  if (!compte) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
  const id = compte.id;
  if (!allowAttempt('compte-social', id, 240, 60 * 60_000)) return send(res, 429, { error: 'Trop de demandes, réessaie plus tard.' });
  const route = `${req.method} ${url.pathname}`;
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
    d.presence[id] = {
      playing: body.playing ? text(body.playing, 80) : null,
      week: Math.max(0, Math.min(10_080, Math.round(Number(body.week) || 0))), // minutes sur 7 jours, plafonnées
      top: body.top ? text(body.top, 80) : null, seen: Date.now(),
    };
    return done(200, { ok: true });
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
