// Petit stockage clé/valeur : Supabase si configuré, sinon fichiers JSON dans ./data
// (sur Render gratuit le disque est effacé à chaque redémarrage -> Supabase conseillé).
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

// STORAGE_DIR : un autre dossier (les bancs d'essai s'en servent pour ne pas toucher aux vraies données)
const DATA_DIR = path.resolve(process.env.STORAGE_DIR || 'data');
const useSupabase = Boolean(config.supabase.url && config.supabase.key);
const cache = new Map();
const pendingWrites = new Map();

function supabaseHeaders() {
  const { key } = config.supabase;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Les anciennes clés service_role sont des JWT ; les nouvelles clés "sb_secret_" passent uniquement par apikey
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function readRemote(key) {
  if (useSupabase) {
    const res = await fetch(
      `${config.supabase.url}/rest/v1/bot_kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: supabaseHeaders() },
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    return rows[0]?.value;
  }
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, `${key}.json`), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
}

async function writeRemote(key, value) {
  if (useSupabase) {
    const res = await fetch(`${config.supabase.url}/rest/v1/bot_kv`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, `${key}.json`), JSON.stringify(value, null, 2));
}

const loading = new Map();
export async function load(key, fallback) {
  if (cache.has(key)) return cache.get(key);
  // Deux lectures en même temps (démarrage) : une seule copie en mémoire, sinon les écritures de l'une écrasent l'autre
  if (!loading.has(key)) {
    loading.set(key, (async () => {
      let value;
      try {
        value = await readRemote(key);
      } catch (err) {
        console.error(`[storage] lecture "${key}" impossible :`, err.message);
      }
      if (!cache.has(key)) cache.set(key, value ?? fallback);
      return cache.get(key);
    })().finally(() => loading.delete(key)));
  }
  return loading.get(key);
}

// Écriture groupée (1 s) pour éviter de spammer Supabase
export function save(key, value) {
  cache.set(key, value);
  clearTimeout(pendingWrites.get(key));
  pendingWrites.set(
    key,
    setTimeout(() => {
      pendingWrites.delete(key);
      writeRemote(key, cache.get(key)).catch((err) =>
        console.error(`[storage] écriture "${key}" impossible :`, err.message),
      );
    }, 1000),
  );
}

/** Écrit tout de suite ce qui attendait (arrêt du serveur : rien ne se perd pendant une mise à jour). */
export async function flushAll() {
  const keys = [...pendingWrites.keys()];
  for (const k of keys) clearTimeout(pendingWrites.get(k));
  pendingWrites.clear();
  await Promise.all(keys.map((k) => writeRemote(k, cache.get(k)).catch((err) => console.error(`[storage] écriture "${k}" impossible :`, err.message))));
}

// ---------- Tables et fichiers Supabase (comptes lisibles dans le tableau de bord, images dans Storage) ----------
const warned = new Set();
const warnOnce = (k, msg) => { if (!warned.has(k)) { warned.add(k); console.warn(msg); } };
/** Insère ou met à jour des lignes dans une vraie table Supabase (ignoré sans Supabase). */
export async function upsertRows(table, rows, onConflict = 'id') {
  if (!useSupabase || !rows.length) return false;
  const res = await fetch(`${config.supabase.url}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST', headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows),
  }).catch((err) => ({ ok: false, status: 0, text: async () => err.message }));
  if (!res.ok) { warnOnce(`t:${table}`, `[storage] table « ${table} » inaccessible (${res.status}) : lance supabase.sql dans Supabase > SQL Editor. ${String(await res.text()).slice(0, 160)}`); return false; }
  return true;
}
export async function deleteRows(table, ids, col = 'id') {
  if (!useSupabase || !ids.length) return false;
  const list = ids.map((x) => `"${String(x).replace(/"/g, '')}"`).join(',');
  const res = await fetch(`${config.supabase.url}/rest/v1/${table}?${col}=in.(${encodeURIComponent(list)})`, { method: 'DELETE', headers: supabaseHeaders() }).catch(() => ({ ok: false }));
  return res.ok;
}
// Fichiers (photos de profil, bannières, images des discussions) : bucket privé Supabase Storage, sinon dossier local
const BUCKET = 'launcher';
let bucketReady = null;
function ensureBucket() {
  bucketReady ??= fetch(`${config.supabase.url}/storage/v1/bucket`, { method: 'POST', headers: supabaseHeaders(), body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 5 * 1024 * 1024 }) })
    .then(() => true).catch(() => true);
  return bucketReady;
}
const blobFile = (name) => path.join(DATA_DIR, 'fichiers', name.replace(/[^\w.-]/g, '_'));
export async function putBlob(name, buf, mime) {
  if (useSupabase) {
    await ensureBucket();
    const res = await fetch(`${config.supabase.url}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, { method: 'POST', headers: { ...supabaseHeaders(), 'Content-Type': mime, 'x-upsert': 'true', 'cache-control': '31536000' }, body: buf });
    if (!res.ok) throw new Error(`Supabase Storage ${res.status}: ${String(await res.text()).slice(0, 160)}`);
    return true;
  }
  await fs.mkdir(path.dirname(blobFile(name)), { recursive: true });
  await fs.writeFile(blobFile(name), buf);
  await fs.writeFile(`${blobFile(name)}.type`, mime);
  return true;
}
export async function getBlob(name) {
  if (useSupabase) {
    const res = await fetch(`${config.supabase.url}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`, { headers: supabaseHeaders() }).catch(() => null);
    if (!res?.ok) return null;
    return { buf: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') || 'application/octet-stream' };
  }
  const buf = await fs.readFile(blobFile(name)).catch(() => null);
  return buf ? { buf, mime: String(await fs.readFile(`${blobFile(name)}.type`, 'utf8').catch(() => 'application/octet-stream')) } : null;
}
export async function delBlob(name) {
  if (useSupabase) { await fetch(`${config.supabase.url}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: supabaseHeaders(), body: JSON.stringify({ prefixes: [name] }) }).catch(() => {}); return; }
  await fs.rm(blobFile(name), { force: true }).catch(() => {});
  await fs.rm(`${blobFile(name)}.type`, { force: true }).catch(() => {});
}

export const storageBackend = useSupabase ? 'Supabase' : 'fichiers locaux';

/** Stockage partagé entre plusieurs machines (Supabase) : sinon, chaque copie du bot a ses propres fichiers. */
export const sharedStorage = useSupabase;

/** Lecture directe, sans cache (pour voir ce qu'une autre copie du bot vient d'écrire). */
export async function readFresh(key) {
  return readRemote(key);
}

/** Écriture immédiate, sans attendre le regroupement d'une seconde. */
export async function writeNow(key, value) {
  cache.set(key, value);
  await writeRemote(key, value);
}
