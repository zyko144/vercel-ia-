// Mon PC › Stockage : ce qui prend de la place, élément par élément (jeux, applis, dossiers, fichiers), trié par taille,
// avec la dernière utilisation réelle (fichier le plus récemment ouvert ou modifié) pour repérer ce qui ne sert plus.
import { lstat, opendir } from 'node:fs/promises';
import path from 'node:path';

// Jamais listés : Windows et ce dont il a besoin pour démarrer
const SKIP_ROOT = /^(\$recycle\.bin|\$windows\.~(bt|ws)|\$winreagent|system volume information|windows|windows\.old|recovery|boot|config\.msi|programdata|perflogs|msocache|users|program files|program files \(x86\)|pagefile\.sys|hiberfil\.sys|swapfile\.sys|dumpstack\.log(\.tmp)?|bootmgr|bootnxt)$/i;
const SKIP_HOME = /^(appdata|ntuser.*|\..*|application data|cookies|local settings|nethood|printhood|recent|sendto|start menu|templates|mes documents|my documents)$/i;
const USER_DIRS = { desktop: 'Bureau', documents: 'Documents', downloads: 'Téléchargements', videos: 'Vidéos', pictures: 'Images', music: 'Musique' };
const TYPES = [
  ['video', /\.(mp4|mkv|avi|mov|wmv|webm|flv|m4v)$/i], ['image', /\.(jpe?g|png|gif|bmp|webp|heic|psd|tiff?|raw|cr2|nef)$/i],
  ['music', /\.(mp3|flac|wav|ogg|m4a|aac|wma)$/i], ['archive', /\.(zip|rar|7z|tar|gz|iso|img|vhdx?)$/i],
  ['installer', /\.(exe|msi|msix|appx)$/i], ['doc', /\.(pdf|docx?|xlsx?|pptx?|odt|txt|rtf|epub|csv)$/i],
];
export const typeOf = (name, dir) => (dir ? 'folder' : TYPES.find(([, re]) => re.test(name))?.[0] ?? 'file');
const norm = (p) => path.win32.normalize(String(p)).replace(/\\+$/, '').toLowerCase();

/** Taille et dernière utilisation d'un fichier ou d'un dossier entier (sans suivre les raccourcis ni les jonctions). */
export async function measure(p, { skip = new Set(), signal, onFile = () => {} } = {}) {
  let size = 0, last = 0, files = 0;
  const walk = async (q) => {
    if (signal?.aborted) return;
    let st; try { st = await lstat(q); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (!st.isDirectory()) { size += st.size; files += 1; last = Math.max(last, st.mtimeMs, st.atimeMs); onFile(st.size); return; }
    if (skip.has(norm(q))) return;
    let dir; try { dir = await opendir(q); } catch { return; }
    for await (const e of dir) await walk(path.join(q, e.name));
  };
  await walk(p);
  return { size, last: last || null, files };
}

/**
 * Liste ce qu'on peut trier : jeux et applis de la bibliothèque, contenu des dossiers perso (Bureau, Téléchargements…),
 * autres dossiers de l'utilisateur et racines des autres disques. Program Files hors bibliothèque : protégé (désinstaller proprement).
 */
export async function storagePlan({ volumes = [], home, systemDrive = 'C:', library = [], list = () => [] }) {
  const sys = systemDrive.slice(0, 1).toUpperCase();
  const plan = [];
  const lib = library.filter((i) => i.installed && /^[a-z]:\\/i.test(String(i.installDir ?? '')) && !/^[a-z]:\\?$/i.test(String(i.installDir)));
  const libDirs = new Set(lib.map((i) => norm(i.installDir)));
  for (const i of lib) plan.push({ path: i.installDir, name: i.name, kind: i.kind === 'game' ? 'game' : 'app', where: i.kind === 'game' ? 'Jeu' : 'Appli', id: i.id, lastPlayed: i.lastPlayed || 0 });
  const add = async (dir, where, kind = null) => { for (const e of await list(dir)) { const p = path.win32.join(dir, e.name); if (!libDirs.has(norm(p))) plan.push({ path: p, name: e.name, kind: kind ?? typeOf(e.name, e.dir), where }); } };
  for (const [k, label] of Object.entries(USER_DIRS)) await add(path.win32.join(home, k), label);
  for (const e of await list(home)) if (e.dir && !SKIP_HOME.test(e.name) && !USER_DIRS[e.name.toLowerCase()]) plan.push({ path: path.win32.join(home, e.name), name: e.name, kind: 'folder', where: 'Dossier perso' });
  for (const pf of ['Program Files', 'Program Files (x86)']) await add(`${sys}:\\${pf}`, 'Programmes', 'protected');
  for (const v of volumes) {
    const root = `${String(v.letter).toUpperCase()}:\\`;
    for (const e of await list(root)) if (!SKIP_ROOT.test(e.name)) { const p = root + e.name; if (!libDirs.has(norm(p))) plan.push({ path: p, name: e.name, kind: typeOf(e.name, e.dir), where: `Disque ${root.slice(0, 2)}` }); }
  }
  return { plan, skip: libDirs };
}
