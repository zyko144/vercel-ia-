/**
 * Notes de version du launcher, tirées du CHANGELOG de l'appli (launcher/src/ui/app.js) :
 *   node tools/launcher-notes.mjs <version> notes   → texte Markdown (chaque nouveauté en « # » pour écrire en grand)
 *   node tools/launcher-notes.mjs <version> shotjs [n] → script qui ouvre l'écran de la n-ième nouveauté illustrée
 *   node tools/launcher-notes.mjs <version> shots   → nombre de nouveautés illustrées (une capture chacune)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function readChangelog(src = readFileSync(path.join(here, '..', 'launcher', 'src', 'ui', 'app.js'), 'utf8')) {
  const m = src.match(/const CHANGELOG = (\{[\s\S]*?\n\});/);
  if (!m) throw new Error('CHANGELOG introuvable');
  return Function(`"use strict"; return (${m[1]});`)();
}

export function notesFor(version, log = readChangelog()) {
  const entries = log[version] ?? [];
  const lines = [`# 🚀 History Launcher v${version} est disponible`];
  for (const [icon, title, text] of entries) lines.push('', `# ${icon} ${title}`, text);
  lines.push('', 'La mise à jour arrive toute seule dans le launcher (« Mettre à jour maintenant ? »).');
  return lines.join('\n');
}

const illustrated = (version, log) => (log[version] ?? []).filter((e) => Array.isArray(e[3]) && e[3].length);
export const shotCount = (version, log = readChangelog()) => illustrated(version, log).length;

/** Script de mise en scène : ferme l'écran de connexion puis clique les éléments demandés par la n-ième nouveauté. */
export function shotScript(version, log = readChangelog(), n = 0) {
  const clicks = illustrated(version, log)[n]?.[3] ?? [];
  const safe = clicks.filter((c) => typeof c === 'string' && /^[#.\w\s\-=[\]"']{1,80}$/.test(c));
  // La fenêtre « Quoi de neuf » (premier lancement) est fermée avant de cliquer
  return `document.getElementById('auth').hidden = true; const shut = () => ['modal', 'recapDlg'].forEach((id) => document.getElementById(id)?.open && document.getElementById(id).close()); [150, 700, 1100].forEach((t) => setTimeout(shut, t)); const sels = ${JSON.stringify(safe)}; sels.forEach((sel, i) => setTimeout(() => { if (i === 0) shut(); const el = document.querySelector(sel); el?.click(); if (i > 0) el?.scrollIntoView({ block: 'center' }); }, 300 + 250 * i)); new Promise((r) => setTimeout(r, 1500 + 250 * sels.length));`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, what = 'notes', n = '0'] = process.argv.slice(2);
  process.stdout.write(what === 'shotjs' ? shotScript(version, readChangelog(), Number(n)) : what === 'shots' ? String(shotCount(version)) : notesFor(version));
}
