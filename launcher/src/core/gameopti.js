// Profils d'optimisation par jeu : FiveM, Garry's Mod, Fortnite, Rainbow Six Siege, Rocket League, et un profil
// générique pour les autres jeux. Chaque action dit ce qu'elle touche (chemin exact), son risque et si un redémarrage
// est nécessaire. Rien n'est appliqué sans accord, et chaque fichier ou valeur du registre modifié est gardé avant
// (« n'existait pas » compris) dans un journal : « Annuler la dernière optimisation » remet tout exactement comme avant.
// Jamais touchés : anti-triche, fichiers du jeu, mods, plugins (ReShade/ENB), addons, sauvegardes, configs du joueur.
import { execFile } from 'node:child_process';
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { folderSize } from './manage.js';

const run = promisify(execFile);
export const RISK = { safe: 'Sûr', moderate: 'Modéré', advanced: 'Avancé' };

// ===================== Fichiers .ini =====================
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Valeur d'une clé (première trouvée, toutes sections), sinon null. */
export function iniGet(text, key) {
  const m = String(text).match(new RegExp(`^[ \\t]*${esc(key)}[ \\t]*=[ \\t]*(.*?)[ \\t]*$`, 'im'));
  return m ? m[1] : null;
}
/**
 * Change des clés : celles qui existent sont modifiées sur place (le reste du fichier ne bouge pas).
 * Une clé absente n'est ajoutée que si `section` est donnée (créée au besoin) : sinon on ne l'invente pas.
 */
export function iniSet(text, set, section = null) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = String(text).split(/\r?\n/);
  for (const [k, v] of Object.entries(set)) {
    const re = new RegExp(`^([ \\t]*${esc(k)}[ \\t]*=[ \\t]*).*$`, 'i');
    let hit = false;
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) { lines[i] = lines[i].replace(re, `$1${v}`); hit = true; }
    if (hit || !section) continue;
    const at = lines.findIndex((l) => l.trim().toLowerCase() === `[${section.toLowerCase()}]`);
    if (at >= 0) lines.splice(at + 1, 0, `${k}=${v}`); else lines.push('', `[${section}]`, `${k}=${v}`);
  }
  return lines.join(eol);
}
const iniApplied = (text, set) => Object.entries(set).every(([k, v]) => String(iniGet(text, k) ?? '').toLowerCase() === String(v).toLowerCase());

// ===================== Dossiers qu'on a le droit de vider =====================
// Seulement ces caches (ils se recréent tout seuls). Tout le reste est refusé, même si on nous le demande.
export const CLEAN_TAILS = ['FiveM.app/data/cache', 'FiveM.app/data/server-cache', 'FiveM.app/data/server-cache-priv', 'FiveM.app/data/nui-storage', 'garrysmod/cache', 'garrysmod/download'];
export function safeCleanDir(dir) {
  const d = String(dir ?? '').replace(/[\\/]+/g, '/').replace(/\/$/, '');
  return path.isAbsolute(dir ?? '') && !d.split('/').includes('..') && CLEAN_TAILS.some((t) => d.toLowerCase().endsWith(`/${t.toLowerCase()}`));
}

// ===================== Ce qu'on propose, jeu par jeu =====================
const GPU_KEY = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
const GMOD_CFG = ['// Réglages de performance ajoutés par History Launcher (retire-les : Optimisation › Annuler).', 'gmod_mcore_test 1', 'mat_queue_mode -1', 'cl_threaded_bone_setup 1', ''].join('\r\n');
const GMOD_LINE = 'exec history_perf // History Launcher';
const iniAct = (o) => ({ kind: 'ini', reboot: false, ...o });

/** Paquets graphiques (ReShade, ENB) dans un dossier : on les signale, on n'y touche jamais. */
export async function graphicsPacks(dirs) {
  const found = new Set();
  for (const d of dirs) {
    for (const e of await readdir(d).catch(() => [])) {
      if (/^reshade|reshade-shaders|dxgi\.dll$/i.test(e)) found.add('ReShade');
      if (/^enb(series|local)|^d3d11\.dll$/i.test(e)) found.add('ENB');
    }
  }
  return [...found];
}

/**
 * Actions proposées pour les jeux installés. `docs` = dossier Documents, `env` = variables de Windows.
 * Chaque action : { id, game, itemId, kind, label, help, risk, reboot, on (coché par défaut), applied, paths }.
 */
export async function gameActions(items, { env = process.env, docs = '' } = {}) {
  const out = [];
  const exists = async (p) => Boolean(await stat(p).catch(() => null));
  const find = (re, src) => items.find((i) => i.kind === 'game' && i.installed && re.test(i.name) && (!src || i.source === src));
  const push = (a) => out.push({ risk: 'safe', reboot: false, on: a.risk ? a.risk === 'safe' : true, applied: false, ...a });

  // FiveM : seulement les caches retéléchargés tout seuls. Jamais mods/, plugins/, citizen/, CitizenFX.ini ni GTA V.
  const fivem = items.find((i) => i.source === 'fivem' && i.installDir);
  if (fivem) {
    const app = path.join(fivem.installDir, 'FiveM.app');
    const packs = await graphicsPacks([path.join(app, 'plugins'), fivem.gtaDir].filter(Boolean));
    const note = `Mods, plugins${packs.length ? ` (${packs.join(', ')} détecté : gardé tel quel)` : ''} et GTA V ne sont jamais touchés.`;
    for (const [d, label, risk] of [['cache', 'Cache des serveurs FiveM', 'safe'], ['server-cache', 'Cache des ressources serveur', 'safe'], ['server-cache-priv', 'Cache privé des serveurs', 'safe'], ['nui-storage', 'Données des menus des serveurs (NUI)', 'moderate']]) {
      const dir = path.join(app, 'data', d);
      if (await exists(dir)) push({ id: `fivem-${d}`, game: 'FiveM', itemId: fivem.id, kind: 'clean', dir, label, risk, help: `${risk === 'safe' ? 'Retéléchargé tout seul en rejoignant un serveur (1er chargement plus long).' : 'Certains serveurs y gardent tes réglages de menus : à vider seulement si un serveur bug.'} ${note}`, paths: [dir] });
    }
  }

  // Garry's Mod : cache (sûr), téléchargements des serveurs (sur demande), petit fichier de réglages à nous
  const gmod = items.find((i) => i.source === 'steam' && String(i.steamId) === '4000' && i.installDir);
  if (gmod) {
    const g = path.join(gmod.installDir, 'garrysmod');
    for (const [d, label, risk, help] of [['cache', 'Cache de Garry’s Mod', 'safe', 'Se recrée tout seul.'], ['download', 'Fichiers téléchargés des serveurs', 'moderate', 'Retéléchargés en rejoignant les serveurs (ça prend du temps). addons/, data/, cfg/ et le Workshop ne sont jamais touchés.']]) {
      const dir = path.join(g, d);
      if (await exists(dir)) push({ id: `gmod-${d}`, game: 'Garry’s Mod', itemId: gmod.id, kind: 'clean', dir, label, risk, help, paths: [dir] });
    }
    const cfg = path.join(g, 'cfg');
    if (await exists(cfg)) {
      const auto = await readFile(path.join(cfg, 'autoexec.cfg'), 'utf8').catch(() => '');
      push({ id: 'gmod-autoexec', game: 'Garry’s Mod', itemId: gmod.id, kind: 'autoexec', dir: cfg, risk: 'moderate', on: false, label: 'Réglages multi-cœurs (gmod_mcore_test, mat_queue_mode, cl_threaded_bone_setup)', help: 'Dans un fichier à part (history_perf.cfg), appelé par une seule ligne ajoutée à autoexec.cfg : ta config reste intacte. Conseil (non appliqué) : option de lancement Steam « -high ».', applied: auto.includes(GMOD_LINE), paths: [path.join(cfg, 'history_perf.cfg'), path.join(cfg, 'autoexec.cfg')] });
    }
  }

  // Fortnite : GameUserSettings.ini (sauvegardé avant). Jamais EAC ni les fichiers du jeu.
  const fn = find(/fortnite/i);
  const fnIni = path.join(env.LOCALAPPDATA ?? '', 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini');
  const fnText = fn && await readFile(fnIni, 'utf8').catch(() => null);
  if (fnText != null && fn) {
    const warn = ' Fortnite peut réécrire ce fichier depuis ses paramètres.';
    push(iniAct({ id: 'fn-perf', game: 'Fortnite', itemId: fn.id, file: fnIni, set: { PreferredRHI: 'dx11', PreferredFeatureLevel: 'es31' }, section: 'D3DRHIPreference', risk: 'moderate', on: false, label: 'Mode de rendu « Performance »', help: `Le mode officiel du jeu pour les PC modestes : beaucoup plus de FPS, graphismes simplifiés.${warn}` }));
    if (iniGet(fnText, 'bUseVSync') != null) push(iniAct({ id: 'fn-vsync', game: 'Fortnite', itemId: fn.id, file: fnIni, set: { bUseVSync: 'False' }, label: 'Synchronisation verticale coupée', help: `Moins de latence d’affichage.${warn}` }));
    if (iniGet(fnText, 'bMotionBlur') != null) push(iniAct({ id: 'fn-blur', game: 'Fortnite', itemId: fn.id, file: fnIni, set: { bMotionBlur: 'False' }, label: 'Flou de mouvement coupé', help: `Image plus nette en mouvement.${warn}` }));
  }

  // Rainbow Six Siege : un GameSettings.ini par compte. Jamais BattlEye.
  const r6 = find(/rainbow six/i);
  const r6Root = path.join(docs, 'My Games', 'Rainbow Six - Siege');
  if (r6 && docs) {
    for (const acc of await readdir(r6Root).catch(() => [])) {
      const file = path.join(r6Root, acc, 'GameSettings.ini');
      const text = await readFile(file, 'utf8').catch(() => null);
      if (text != null && iniGet(text, 'VSync') != null) push(iniAct({ id: `r6-vsync-${acc}`, game: 'Rainbow Six Siege', itemId: r6.id, file, set: { VSync: '0' }, label: `Synchronisation verticale coupée (compte ${acc.slice(0, 8)})`, help: 'Moins de latence en compétitif.' }));
    }
  }

  // Rocket League : TASystemSettings.ini (effets inutiles en partie)
  const rl = find(/rocket league/i);
  const rlIni = path.join(docs, 'My Games', 'Rocket League', 'TAGame', 'Config', 'TASystemSettings.ini');
  const rlText = rl && docs && await readFile(rlIni, 'utf8').catch(() => null);
  if (rlText != null && rl) {
    const ro = ((await stat(rlIni).catch(() => null))?.mode ?? 0o666) & 0o200 ? '' : ' Fichier en lecture seule : on ne le modifiera pas.';
    const has = (set) => Object.keys(set).every((k) => iniGet(rlText, k) != null);
    for (const [id, set, label, risk, help] of [
      ['rl-vsync', { UseVsync: 'False' }, 'Synchronisation verticale coupée', 'safe', 'Moins de latence.'],
      ['rl-blur', { MotionBlur: 'False' }, 'Flou de mouvement coupé', 'safe', 'Image plus nette.'],
      ['rl-fx', { DepthOfField: 'False', Bloom: 'False', LensFlares: 'False', LightShafts: 'False' }, 'Effets de lumière coupés (profondeur de champ, bloom, reflets)', 'moderate', 'Plus de FPS, image moins « cinéma ».'],
    ]) if (has(set)) push(iniAct({ id, game: 'Rocket League', itemId: rl.id, file: rlIni, set, label, risk, help: help + ro, readonly: Boolean(ro) }));
  }

  // Autres jeux : préférence carte graphique « hautes performances » (utile sur les PC à deux cartes graphiques)
  for (const i of items) {
    if (i.kind !== 'game' || !i.installed || !/^[a-z]:\\.+\.exe$/i.test(String(i.exe ?? ''))) continue;
    push({ id: `gpu-${i.id}`, game: 'Autres jeux', itemId: i.id, kind: 'gpu', exe: i.exe, risk: 'safe', label: `${i.name} : carte graphique la plus puissante`, help: 'Réglage officiel de Windows (Paramètres › Affichage › Graphiques). Utile sur les PC portables à deux cartes graphiques, sans effet ailleurs.', paths: [`${GPU_KEY}\\${i.exe}`] });
  }
  for (const a of out) if (a.kind === 'ini') { a.paths = [a.file]; a.applied = iniApplied(await readFile(a.file, 'utf8').catch(() => ''), a.set); }
  return out;
}

// ===================== Appliquer / annuler =====================
const defaultIo = {
  readFile: (f) => readFile(f, 'utf8').catch(() => null),
  writeFile: (f, t) => writeFile(f, t),
  rmFile: (f) => rm(f, { force: true }),
  regGet: async (key, name) => { const r = await run('reg', ['query', key, '/v', name], { windowsHide: true }).catch(() => null); return r?.stdout.match(/REG_SZ\s+(.*)\r?\n/)?.[1]?.trim() ?? null; },
  regSet: (key, name, v) => run('reg', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', v, '/f'], { windowsHide: true }),
  regDel: (key, name) => run('reg', ['delete', key, '/v', name, '/f'], { windowsHide: true }).catch(() => {}),
  emptyDir: async (dir) => { const before = (await folderSize(dir)).bytes; for (const e of await readdir(dir).catch(() => [])) await rm(path.join(dir, e), { recursive: true, force: true }).catch(() => {}); return Math.max(0, before - (await folderSize(dir)).bytes); },
};

/** Applique une action. Renvoie { entries (ce qu'il faut pour annuler), freed }. Refait deux fois : ne change plus rien. */
export async function applyAction(a, io = defaultIo) {
  const entries = [];
  const setFile = async (file, text) => { const before = await io.readFile(file); if (before === text) return; entries.push({ kind: 'file', file, before }); await io.writeFile(file, text); };
  if (a.kind === 'clean') {
    if (!safeCleanDir(a.dir)) throw new Error('dossier refusé (hors des caches connus)');
    return { entries, freed: await io.emptyDir(a.dir) };
  }
  if (a.kind === 'ini') {
    if (a.readonly) throw new Error('fichier en lecture seule');
    const text = await io.readFile(a.file);
    if (text == null) throw new Error('fichier introuvable');
    if (text.length > 512 * 1024) throw new Error('fichier trop gros');
    await setFile(a.file, iniSet(text, a.set, a.section ?? null));
  }
  if (a.kind === 'autoexec') {
    await setFile(path.join(a.dir, 'history_perf.cfg'), GMOD_CFG);
    const auto = (await io.readFile(path.join(a.dir, 'autoexec.cfg'))) ?? '';
    if (!auto.includes(GMOD_LINE)) await setFile(path.join(a.dir, 'autoexec.cfg'), `${auto}${auto && !/\n$/.test(auto) ? '\r\n' : ''}${GMOD_LINE}\r\n`);
  }
  if (a.kind === 'gpu') {
    const before = await io.regGet(GPU_KEY, a.exe);
    if (before !== 'GpuPreference=2;') { entries.push({ kind: 'reg', key: GPU_KEY, name: a.exe, before }); await io.regSet(GPU_KEY, a.exe, 'GpuPreference=2;'); }
  }
  return { entries, freed: 0 };
}

/** Remet exactement l'état d'avant (du plus récent au plus ancien). « N'existait pas » = supprimé. */
export async function revertEntries(entries, io = defaultIo) {
  for (const e of [...entries].reverse()) {
    if (e.kind === 'file') await (e.before == null ? io.rmFile(e.file) : io.writeFile(e.file, e.before));
    if (e.kind === 'reg') await (e.before == null ? io.regDel(e.key, e.name) : io.regSet(e.key, e.name, e.before));
  }
}
