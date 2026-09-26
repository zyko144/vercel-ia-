// Sauvegarde en ligne du launcher (réglages, collections, favoris, temps de jeu) liée au compte History :
// on retrouve tout sur un autre PC ou après une réinstallation. Une sauvegarde par compte, taille plafonnée.
import { allowAttempt } from '../dashboard/auth.js';
import { load, save } from '../storage.js';
import { me } from './launcherAccounts.js';

const MAX_BYTES = 1_500_000;
const key = (id) => `launcher-sauvegarde-${id}`;

export async function handleBackupApi(req, res, { readJson, send }) {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  const compte = await me(token);
  if (!compte) return send(res, 401, { error: 'Session expirée, reconnecte-toi.' });
  if (!allowAttempt('launcher-sauvegarde', compte.id, 60, 60 * 60_000)) return send(res, 429, { error: 'Trop de sauvegardes, réessaie plus tard.' });
  if (req.method === 'GET') {
    const b = await load(key(compte.id), null);
    return send(res, 200, b ? { at: b.at, data: b.data, pc: b.pc ?? null } : { at: null, data: null });
  }
  const body = await readJson(req);
  if (!body?.data || typeof body.data !== 'object' || Array.isArray(body.data)) return send(res, 400, { error: 'Sauvegarde illisible.' });
  const size = Buffer.byteLength(JSON.stringify(body.data));
  if (size > MAX_BYTES) return send(res, 413, { error: 'Sauvegarde trop grosse.' });
  const at = Date.now();
  save(key(compte.id), { at, pc: String(body.pc ?? '').replace(/[^\w .-]/g, '').slice(0, 40) || null, data: body.data });
  return send(res, 200, { ok: true, at, size });
}
