// Contrôle du PC depuis l'appli téléphone, relayé par le serveur (pas besoin d'être sur le même Wi-Fi) :
// le launcher envoie son état (toutes les 10 s, 3 s quand le téléphone regarde) et reçoit en réponse les ordres en attente.
// Rien n'est stocké sur disque : tout vit en mémoire, par compte, et seul le propriétaire du compte y accède.
const pcs = new Map(); // compte -> Map(pc -> { nom, etat, at, vu, ordres })
const ACTS = new Set(['launch', 'install', 'close', 'sleep', 'shutdown', 'cancel', 'clip', 'shot', 'wake']);
const clean = (v, n = 40) => String(v ?? '').replace(/[^\w .'-]/g, '').slice(0, n);

export async function pcRoute(req, res, url, compte, { readJson, send }) {
  const mine = pcs.get(compte.id) ?? new Map(); pcs.set(compte.id, mine);
  const now = Date.now();
  if (url.pathname === '/api/compte/pc/etat' && req.method === 'POST') { // le launcher
    const b = await readJson(req), id = clean(b.pc);
    if (!id) return send(res, 400, { error: 'PC inconnu.' });
    const etat = b.etat && JSON.stringify(b.etat).length < 40_000 ? b.etat : null;
    const p = mine.get(id) ?? { ordres: [] };
    Object.assign(p, { nom: clean(b.nom) || 'PC', etat, at: now });
    mine.set(id, p);
    return send(res, 200, { ordres: p.ordres.splice(0), rapide: now - (p.vu ?? 0) < 120_000 });
  }
  if (url.pathname === '/api/compte/pc' && req.method === 'GET') { // le téléphone
    return send(res, 200, { pcs: [...mine].map(([id, p]) => { p.vu = now; return { id, nom: p.nom, enLigne: now - p.at < 60_000, at: p.at, etat: p.etat }; }) });
  }
  if (url.pathname === '/api/compte/pc/ordre' && req.method === 'POST') {
    const b = await readJson(req), p = mine.get(clean(b.pc));
    if (!p || now - p.at > 60_000) return send(res, 409, { error: 'Ton PC est éteint ou History Launcher est fermé.' });
    if (!ACTS.has(b.do)) return send(res, 400, { error: 'Action inconnue.' });
    if (b.do === 'wake' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.id))) return send(res, 400, { error: 'Heure de réveil invalide.' });
    p.ordres = [...p.ordres, { do: b.do, id: clean(b.id, 120), at: now }].slice(-10); p.vu = now;
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'route inconnue' });
}
