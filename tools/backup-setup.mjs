/**
 * Prépare la sauvegarde en une commande (sur ton PC) :
 *  - complète le .env de ce dossier avec les réglages qui manquent, pris dans les autres .env trouvés
 *    dans les sous-dossiers (ancienne copie du bot…) ;
 *  - crée une BACKUP_KEY aléatoire si elle n'existe pas ;
 *  - lance la sauvegarde chiffrée.
 * Aucune valeur secrète n'est affichée, sauf la BACKUP_KEY créée (à noter une fois, elle ne réapparaîtra plus).
 *
 *   npm run backup:setup
 */
import { randomBytes } from 'node:crypto';
import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const MAIN = path.join(ROOT, '.env');
const parse = (text) => {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[2].trim() !== '') map.set(m[1], m[2].trim());
  }
  return map;
};

const mainText = await readFile(MAIN, 'utf8').catch(() => '');
const mine = parse(mainText);
const added = [];

// Les autres .env : dans les sous-dossiers directs (ancienne copie du bot)
for (const entry of await readdir(ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory() || ['node_modules', '.git', 'backups', 'data'].includes(entry.name)) continue;
  const other = await readFile(path.join(ROOT, entry.name, '.env'), 'utf8').catch(() => null);
  if (!other) continue;
  for (const [k, v] of parse(other)) {
    if (!mine.has(k)) { mine.set(k, v); added.push(`${k} (depuis ${entry.name}\\.env)`); }
  }
}

let newKey = null;
if (!mine.has('BACKUP_KEY') || mine.get('BACKUP_KEY').length < 32) {
  newKey = randomBytes(32).toString('base64url');
  mine.set('BACKUP_KEY', newKey);
  added.push('BACKUP_KEY (créée)');
}

if (added.length) {
  if (mainText) await copyFile(MAIN, `${MAIN}.avant-sauvegarde`);
  const lines = added.map((a) => a.split(' ')[0]).map((k) => `${k}=${mine.get(k)}`);
  await writeFile(MAIN, `${mainText.replace(/\s*$/, '')}\n\n# Ajouté par npm run backup:setup\n${lines.join('\n')}\n`);
  console.log(`✅ .env complété : ${added.join(', ')}`);
  if (mainText) console.log('   (ancienne version gardée dans .env.avant-sauvegarde)');
} else {
  console.log('✅ .env déjà complet.');
}

if (!mine.get('SUPABASE_URL') || !mine.get('SUPABASE_SERVICE_KEY')) {
  console.log('\n⚠️  SUPABASE_URL ou SUPABASE_SERVICE_KEY introuvable : la sauvegarde ne lira que le dossier data\\ de ce PC.');
  console.log('   Recopie-les depuis Render › ton service › Environment dans le .env de ce dossier, puis relance.');
}
if (newKey) {
  console.log('\n🔑 Ta clé de sauvegarde (note-la dans un endroit sûr, sans elle impossible de restaurer) :');
  console.log(`   ${newKey}\n`);
}

execFileSync(process.execPath, [path.join(ROOT, 'tools', 'backup.mjs')], { stdio: 'inherit' });
