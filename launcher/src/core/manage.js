// Gestion des jeux par le launcher lui-même, sans ouvrir les fenêtres de Steam ou d'Epic :
//  - lancer un jeu Steam en arrière-plan (steam.exe -silent -applaunch) ;
//  - désinstaller en supprimant les fichiers du jeu et sa fiche d'installation (Steam / Epic) ;
//  - vérification rapide : l'exécutable est là et la taille sur le disque correspond à celle attendue.
// Chaque suppression est encadrée : le dossier doit être exactement celui du jeu, dans une bibliothèque connue.
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const inside = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** Le dossier peut-il être supprimé sans risque ? (jamais une racine, un dossier système ou un dossier trop haut) */
export function safeGameDir(item) {
  const dir = item?.installDir ? path.resolve(item.installDir) : '';
  if (!dir) return { ok: false, why: 'dossier inconnu' };
  const parts = dir.split(/[\\/]+/).filter(Boolean);
  if (parts.length < 3) return { ok: false, why: 'dossier trop proche de la racine du disque' };
  if (/\\(windows|program files( \(x86\))?|users|programdata|system32)\\?$/i.test(dir)) return { ok: false, why: 'dossier système' };
  if (item.source === 'steam') {
    const common = path.join(item.steamLibrary ?? '', 'common');
    if (!item.steamLibrary || !inside(dir, common) || path.dirname(dir).toLowerCase() !== path.resolve(common).toLowerCase()) return { ok: false, why: 'le dossier n’est pas dans une bibliothèque Steam' };
  }
  return { ok: true, dir };
}

/** Taille d'un dossier (octets) et nombre de fichiers. */
export async function folderSize(dir) {
  let bytes = 0;
  let files = 0;
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) { bytes += (await stat(full).catch(() => ({ size: 0 }))).size; files++; }
    }
  };
  await walk(dir);
  return { bytes, files };
}

/** Désinstallation Steam : dossier du jeu + fiche appmanifest (Steam le verra comme désinstallé). */
async function uninstallSteam(item) {
  const check = safeGameDir(item);
  if (!check.ok) throw new Error(check.why);
  if (!item.manifest || !/appmanifest_\d+\.acf$/i.test(item.manifest) || !same(path.dirname(item.manifest), item.steamLibrary)) throw new Error('fiche Steam introuvable');
  await rm(check.dir, { recursive: true, force: true });
  await rm(item.manifest, { force: true });
  return { removed: check.dir };
}

/** Désinstallation Epic : dossier du jeu + fiche .item + entrée de LauncherInstalled.dat. */
async function uninstallEpic(item, launcherInstalled) {
  const check = safeGameDir(item);
  if (!check.ok) throw new Error(check.why);
  if (!item.manifest || !/\.item$/i.test(item.manifest)) throw new Error('fiche Epic introuvable');
  // La fiche doit bien parler de ce dossier
  const m = JSON.parse(await readFile(item.manifest, 'utf8'));
  if (!same(m.InstallLocation ?? '', check.dir)) throw new Error('la fiche Epic ne correspond pas au dossier');
  await rm(check.dir, { recursive: true, force: true });
  await rm(item.manifest, { force: true });
  if (launcherInstalled) {
    try {
      const dat = JSON.parse(await readFile(launcherInstalled, 'utf8'));
      dat.InstallationList = (dat.InstallationList ?? []).filter((e) => !(e.AppName === m.AppName || same(e.InstallLocation ?? '', check.dir)));
      await writeFile(launcherInstalled, JSON.stringify(dat, null, '\t'));
    } catch { /* fichier absent : rien à retirer */ }
  }
  return { removed: check.dir };
}

export async function uninstallFiles(item, { launcherInstalled } = {}) {
  if (item.source === 'steam') return uninstallSteam(item);
  if (item.source === 'epic') return uninstallEpic(item, launcherInstalled);
  throw new Error('désinstallation par fichiers réservée à Steam et Epic');
}

/** Vérification rapide par le launcher : exécutable présent, taille réelle comparée à la taille attendue. */
export async function quickVerify(item) {
  const dir = item.installDir;
  if (!dir || !(await stat(dir).catch(() => null))?.isDirectory()) return { ok: false, problems: ['Le dossier du jeu est introuvable.'] };
  const { bytes, files } = await folderSize(dir);
  const problems = [];
  if (item.exe && !(await stat(item.exe).catch(() => null))) problems.push('L’exécutable du jeu est introuvable.');
  if (!files) problems.push('Le dossier est vide.');
  if (item.size && bytes < item.size * 0.97) problems.push(`Il manque environ ${((item.size - bytes) / 1e9).toFixed(1).replace('.', ',')} Go de fichiers.`);
  return { ok: problems.length === 0, bytes, files, expected: item.size ?? 0, problems };
}
