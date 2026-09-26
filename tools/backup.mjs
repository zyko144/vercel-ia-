/**
 * Sauvegarde et restauration de toutes les données du bot (Supabase ou dossier data/).
 *
 *   node tools/backup.mjs                 → écrit backups/sauvegarde-AAAA-MM-JJ.json (chiffré si BACKUP_KEY est défini)
 *   node tools/backup.mjs --restore FICHIER   → remet toutes les clés du fichier (demande --oui pour confirmer)
 *
 * Avec BACKUP_KEY (32 caractères ou plus), le fichier est chiffré (AES-256-GCM) : à garder hors du dépôt.
 */
import 'dotenv/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
const headers = key ? { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) } : null;
const DATA = path.resolve(process.env.STORAGE_DIR || 'data');
const secret = process.env.BACKUP_KEY ? createHash('sha256').update(process.env.BACKUP_KEY).digest() : null;

async function dump() {
  if (url && key) {
    const rows = [];
    for (let from = 0; ; from += 500) {
      const res = await fetch(`${url}/rest/v1/bot_kv?select=key,value,updated_at&order=key&offset=${from}&limit=500`, { headers });
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      const page = await res.json();
      rows.push(...page);
      if (page.length < 500) break;
    }
    return rows;
  }
  const files = (await readdir(DATA).catch(() => [])).filter((f) => f.endsWith('.json'));
  return Promise.all(files.map(async (f) => ({ key: f.slice(0, -5), value: JSON.parse(await readFile(path.join(DATA, f), 'utf8')) })));
}

function seal(text) {
  if (!secret) return text;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', secret, iv);
  const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return JSON.stringify({ chiffre: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: body.toString('base64') });
}
function open(text) {
  const box = JSON.parse(text);
  if (!box.chiffre) return box;
  if (!secret) throw new Error('fichier chiffré : BACKUP_KEY manquant');
  const d = createDecipheriv('aes-256-gcm', secret, Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8'));
}

async function restore(file) {
  const { rows } = open(await readFile(file, 'utf8'));
  if (!process.argv.includes('--oui')) {
    console.log(`${rows.length} clés à restaurer depuis ${file}. Relance avec --oui pour confirmer (les valeurs actuelles seront remplacées).`);
    return;
  }
  for (const row of rows) {
    if (url && key) {
      const res = await fetch(`${url}/rest/v1/bot_kv`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ key: row.key, value: row.value, updated_at: new Date().toISOString() }]) });
      if (!res.ok) throw new Error(`Supabase ${res.status} sur ${row.key}`);
    } else {
      if (!/^[\w.-]+$/.test(row.key)) throw new Error(`clé refusée : ${row.key}`);
      await mkdir(DATA, { recursive: true });
      await writeFile(path.join(DATA, `${row.key}.json`), JSON.stringify(row.value, null, 2));
    }
  }
  console.log(`✅ ${rows.length} clés restaurées.`);
}

const i = process.argv.indexOf('--restore');
if (i > 0) await restore(process.argv[i + 1]);
else {
  const rows = await dump();
  await mkdir('backups', { recursive: true });
  const out = path.join('backups', `sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
  await writeFile(out, seal(JSON.stringify({ at: new Date().toISOString(), rows })), { mode: 0o600 });
  console.log(`✅ ${rows.length} clés sauvegardées dans ${out}${secret ? ' (chiffré)' : ' (non chiffré : définis BACKUP_KEY pour chiffrer)'}`);
}
