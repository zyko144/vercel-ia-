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
