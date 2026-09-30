// Pont entre l'interface et l'appli (preload.cjs) : chaque fonction appelée par l'interface doit exister,
// et aucun nom ne doit être défini deux fois (le second écrase le premier sans erreur).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pre = readFileSync(new URL('../src/preload.cjs', import.meta.url), 'utf8');
const app = ['app.js','settings.js','personal.js','quick-support.js'].map((name) => readFileSync(new URL(`../src/ui/${name}`, import.meta.url), 'utf8')).join('\n');
const keys = [...pre.matchAll(/^ {2}([A-Za-z0-9]+):/gm)].map((m) => m[1]);
const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
assert.deepEqual(dup, [], `noms en double dans preload.cjs : ${dup.join(', ')}`);
const used = [...new Set([...app.matchAll(/api\.([A-Za-z0-9]+)/g)].map((m) => m[1]))];
const missing = used.filter((k) => !keys.includes(k));
assert.deepEqual(missing, [], `fonctions appelées par l'interface mais absentes du pont : ${missing.join(', ')}`);
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const handled = new Set([...main.matchAll(/ipcMain\.(?:handle|on)\(`?'?([\w:]+)/g)].map((m) => m[1]));
const invoked = [...pre.matchAll(/ipcRenderer\.(?:invoke|send)\('([\w:]+)'/g)].map((m) => m[1]);
const orphan = invoked.filter((c) => !handled.has(c) && !/^account:(inscription|connexion)$/.test(c));
assert.deepEqual(orphan, [], `canaux sans traitement dans main.js : ${orphan.join(', ')}`);
console.log(`✅ Pont interface ↔ appli : ${used.length} fonctions, ${invoked.length} canaux vérifiés`);
