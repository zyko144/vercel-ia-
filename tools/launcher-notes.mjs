/**
 * Notes de version du launcher, tirées du CHANGELOG de l'appli (launcher/src/ui/app.js) :
 *   node tools/launcher-notes.mjs <version> notes   → texte Markdown (chaque nouveauté en « # » pour écrire en grand)
 *   node tools/launcher-notes.mjs <version> shotjs  → script qui ouvre l'écran à montrer pour la capture
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

/** Script de mise en scène : ferme l'écran de connexion puis clique les éléments demandés par la 1re nouveauté. */
export function shotScript(version, log = readChangelog()) {
  const clicks = (log[version] ?? []).find((e) => Array.isArray(e[3]))?.[3] ?? [];
  const safe = clicks.filter((c) => typeof c === 'string' && /^[#.\w\s\-=[\]"']{1,80}$/.test(c));
  // La fenêtre « Quoi de neuf » (premier lancement) est fermée avant de cliquer
  return `document.getElementById('auth').hidden = true; const shut = () => document.querySelectorAll('dialog[open]').forEach((d) => d.close()); setTimeout(shut, 150); ${JSON.stringify(safe)}.forEach((sel, i) => setTimeout(() => { if (i === 0) shut(); document.querySelector(sel)?.click(); }, 300 + 250 * i));`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version, what = 'notes'] = process.argv.slice(2);
  process.stdout.write(what === 'shotjs' ? shotScript(version) : notesFor(version));
}
