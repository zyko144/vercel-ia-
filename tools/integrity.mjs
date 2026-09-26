/**
 * Fabrique security/manifest.json : l'empreinte de chaque fichier du code, pour détecter une modification.
 *
 *   npm run integrity
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { MANIFEST, fingerprints } from '../src/utils/integrity.js';

const files = await fingerprints();
let version = 'local';
try { version = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* pas de git */ }
await mkdir('security', { recursive: true });
await writeFile(MANIFEST, `${JSON.stringify({ version, at: new Date().toISOString(), files }, null, 2)}\n`);
console.log(`✅ ${Object.keys(files).length} fichiers dans ${MANIFEST}`);
