// Captures d'écran et clips : rangés dans Vidéos\<nom du jeu> (la fiche du jeu les retrouve toute seule),
// ou Vidéos\History Launcher hors partie.
import os from 'node:os';
import path from 'node:path';

/** Nom de dossier Windows valide (caractères interdits retirés). */
export function safeName(name) {
  const s = String(name ?? '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/, '').trim().slice(0, 80);
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s) ? `${s}_` : s;
}
export function captureDir(game, videosDir = path.join(os.homedir(), 'Videos')) {
  return path.join(videosDir, safeName(game) || 'History Launcher');
}
/** « Rocket League 2026-09-26 21-14-03.png » */
export function captureName(game, ext, d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  return `${safeName(game) || 'Capture'} ${stamp}.${ext}`;
}
