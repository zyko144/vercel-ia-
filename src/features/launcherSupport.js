// Private account reports. Existing dashboard authentication protects staff access.
import { randomUUID } from 'node:crypto';
import { readFresh, writeNow, putBlob, getBlob, delBlob } from '../storage.js';
import { me, checkImage } from './launcherAccounts.js';
import { allowAttempt } from '../dashboard/auth.js';

const KEY = 'launcher-support';
export const SUPPORT_STATES = ['received', 'investigating', 'resolved'];
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);
export function cleanReport(body) {
  const title = clean(body?.title, 100); const description = clean(body?.description, 4000);
  if (title.length < 4 || description.length < 10) throw new Error('Ajoute un titre de 4 caractères et une description de 10 caractères minimum.');
  const diagnostic = {};
  // Explicit allowlist: no paths, account identifiers, logs or credentials.
  for (const key of ['version', 'platform', 'release', 'arch', 'memoryGB', 'games', 'apps', 'cpu', 'gpu', 'driver', 'windows', 'uptimeDays', 'health', 'cpuTempMax', 'gpuTempMax', 'diskFreeGB']) if (body?.diagnostic?.[key] != null) diagnostic[key] = clean(body.diagnostic[key], 80);
  return { title, description, diagnostic, app: body?.app === 'clips' ? 'clips' : 'launcher' };
}
let queue = Promise.resolve();
export function mutateSupport(fn) {
  const result = queue.then(async () => {
    const all = structuredClone((await readFresh(KEY)) ?? {});
    const value = await fn(all);
    await writeNow(KEY, all);
    return value;
  });
  queue = result.catch(() => {});
  return result;
}
const summary = ({ image, ...ticket }) => ({ ...ticket, hasImage: !!image });
export async function supportList(owner = null) {
  const all = (await readFresh(KEY)) ?? {};
  return Object.values(all).filter((ticket) => owner === null || ticket.owner === owner).sort((a, b) => b.updatedAt - a.updatedAt).map(summary);
}
export async function supportDetail(id, owner = null) {
  if (!/^[a-f0-9-]{36}$/.test(String(id))) return null;
  const all = (await readFresh(KEY)) ?? {};
  const ticket = Object.hasOwn(all, id) ? all[id] : null;
  if (!ticket || (owner !== null && ticket.owner !== owner)) return null;
  const blob = ticket.image ? await getBlob(`support/${ticket.id}`) : null;
  return { ...summary(ticket), img: blob ? `data:${blob.mime};base64,${blob.buf.toString('base64')}` : null };
}
export async function supportUpdate(body) {
  if (!SUPPORT_STATES.includes(body?.status)) throw new Error('Statut inconnu.');
  const result = await mutateSupport((all) => {
    if (!Object.hasOwn(all, String(body.id))) throw new Error('Signalement introuvable.');
    const ticket = all[body.id];
    ticket.status = body.status; ticket.reply = clean(body.reply, 2000); ticket.updatedAt = Date.now();
    return { ok: true, ticket: summary(ticket) };
  });
  import('./supportDiscord.js').then(m => m.queueSupport(result.ticket.id)).catch(() => {});
  return result;
}
/** Nouvelle demande (appli, site ou /launcher aide sur Discord) : enregistrée puis envoyée dans les salons support. */
export async function createTicket(account, report, image = null, id = randomUUID()) {
  const { supportIdentity } = await import('./supportDiscord.js');
  const identity = await supportIdentity(account, report.app);
  const ticket = await mutateSupport(async (all) => {
    if (Object.keys(all).length >= 2000 || Object.values(all).filter((t) => t.owner === account.id && t.status !== 'resolved').length >= 20) throw new Error('Trop de signalements ouverts. Attends la réponse à tes demandes.');
    if (image) await putBlob(`support/${id}`, Buffer.from(image.data, 'base64'), image.mime);
    return all[id] = { id, owner: account.id, name: clean(account.pseudo, 40), ...identity, ...report, image: !!image, status: 'received', reply: '', at: Date.now(), updatedAt: Date.now() };
  });
  import('./supportDiscord.js').then(m => m.queueSupport(ticket.id)).catch(() => {});
  return ticket;
}
export async function handleSupportApi(req, res, url, { readJson, send }) {
  const account = await me(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
  if (!account) return send(res, 401, { error: 'Connecte-toi à ton compte History pour contacter l’aide.' });
  if (!allowAttempt('support-read', account.id, 60, 60000)) return send(res, 429, { error: 'Réessaie dans une minute.' });
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const id = url.searchParams.get('id');
    if (id) { const ticket = await supportDetail(id, account.id); return send(res, ticket ? 200 : 404, ticket ? { ticket } : { error: 'Signalement introuvable.' }); }
    return send(res, 200, { tickets: await supportList(account.id) });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Méthode non prise en charge.' });
  if (!allowAttempt('support-create', account.id, 5, 3600000)) return send(res, 429, { error: 'Cinq signalements par heure maximum. Réessaie plus tard.' });
  let id;
  try {
    const body = await readJson(req); const report = cleanReport(body);
    let image = null;
    if (body.img) { image = checkImage(body.img, 1400000); if (!image || typeof image === 'string') throw new Error('Capture invalide : PNG, JPG ou WebP, 1,4 Mo maximum.'); }
    id = randomUUID();
    const ticket = await createTicket(account, report, image, id);
    return send(res, 200, { ok: true, ticket: summary(ticket) });
  } catch (error) {
    if (id) await delBlob(`support/${id}`).catch(() => {});
    return send(res, 400, { error: /signalements ouverts|titre de|Capture invalide/.test(error.message) ? error.message : 'Signalement non enregistré. Réessaie.' });
  }
}
