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

export async function load(key, fallback) {
  if (cache.has(key)) return cache.get(key);
  let value;
  try {
    value = await readRemote(key);
  } catch (err) {
    console.error(`[storage] lecture "${key}" impossible :`, err.message);
  }
  value ??= fallback;
  cache.set(key, value);
  return value;
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

// Serialized locally, optimistic compare-and-swap on Supabase. The callback must
// have no external side effects: a concurrent writer can make it run again.
const transactions = new Map();
export function updateAtomic(key, change) {
  const task = (transactions.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      let previous, revision;
      const endpoint = `${config.supabase.url}/rest/v1/bot_kv`;
      if (useSupabase) {
        const r = await fetch(`${endpoint}?key=eq.${encodeURIComponent(key)}&select=value,updated_at`, { headers: supabaseHeaders(), signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(`Social storage read: ${r.status}`);
        const row = (await r.json())[0];
        previous = row?.value; revision = row?.updated_at;
      } else previous = await readRemote(key);
      const value = structuredClone(previous ?? {});
      const result = await change(value);
      if (JSON.stringify(value) === JSON.stringify(previous ?? {})) return result;
      if (!useSupabase) { await writeNow(key, value); return result; }
      const updated_at = new Date(Math.max(Date.now(), (Date.parse(revision) || 0) + 1)).toISOString();
      const r = await fetch(revision
        ? `${endpoint}?key=eq.${encodeURIComponent(key)}&updated_at=eq.${encodeURIComponent(revision)}` : endpoint, {
        method: revision ? 'PATCH' : 'POST', signal: AbortSignal.timeout(8000),
        headers: { ...supabaseHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(revision ? { value, updated_at } : { key, value, updated_at }),
      });
      if (r.status === 409) continue;
      if (!r.ok) throw new Error(`Social storage write: ${r.status}`);
      if ((await r.json()).length) { cache.set(key, value); return result; }
    }
    throw new Error('Social storage busy, retry');
  });
  transactions.set(key, task);
  task.finally(() => { if (transactions.get(key) === task) transactions.delete(key); }).catch(() => {});
  return task;
}
