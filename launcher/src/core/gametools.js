// Outils par jeu : sauvegardes des parties, caches de shaders, déplacement d'un jeu Steam, alertes de prix,
// dernier pilote NVIDIA, mode économie sur batterie, notifications Windows pendant une partie.
import { execFile } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const win = process.platform === 'win32';
const clean = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// ===================== 3. Sauvegardes des parties =====================

/** Dossiers où les jeux rangent leurs sauvegardes (Documents, Saved Games, AppData, Steam userdata). */
export function saveRoots(env = process.env) {
  const home = env.USERPROFILE ?? '';
  const docs = path.join(home, 'Documents');
  return [
    path.join(docs, 'My Games'), docs, path.join(home, 'Saved Games'),
    env.LOCALAPPDATA, env.APPDATA, env.LOCALAPPDATA && path.join(path.dirname(env.LOCALAPPDATA), 'LocalLow'),
  ].filter(Boolean);
}
/** Dossiers de sauvegarde probables d'un jeu : même nom que le jeu (sans accents ni ponctuation), ou Steam userdata. */
export async function findSaveDirs(game, { env = process.env, steamRoot = null } = {}) {
  const want = clean(game.name).replace(/^(the|tom clancys)/, '');
  const short = want.slice(0, Math.max(6, Math.min(want.length, 14)));
  const found = [];
  for (const root of saveRoots(env)) {
    for (const d of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory()) continue;
      const n = clean(d.name);
      if (n.length >= 4 && (n === want || (short.length >= 6 && n.startsWith(short)) || (n.length >= 6 && want.startsWith(n)))) found.push(path.join(root, d.name));
      // LocalLow et AppData ont souvent un dossier « Éditeur\Jeu »
      if (/locallow|roaming|local$/i.test(root) && !found.length) {
        for (const s of await readdir(path.join(root, d.name), { withFileTypes: true }).catch(() => [])) {
          if (s.isDirectory() && clean(s.name) === want) found.push(path.join(root, d.name, s.name));
        }
      }
    }
  }
  if (steamRoot && game.steamId) {
    for (const u of await readdir(path.join(steamRoot, 'userdata')).catch(() => [])) {
      const p = path.join(steamRoot, 'userdata', u, String(game.steamId));
      if ((await stat(p).catch(() => null))?.isDirectory()) found.push(p);
    }
  }
  return [...new Set(found)];
}
const stamp = (t = Date.now()) => new Date(t).toISOString().slice(0, 23).replace(/[:T.]/g, '-');
/** Copie les dossiers de sauvegarde dans Documents\History\Sauvegardes de jeux\<jeu>\<date> ; garde les `keep` dernières. */
export async function backupSaves(game, dirs, destRoot, keep = 5) {
  if (!dirs.length) return { ok: false, error: 'Aucun dossier de sauvegarde connu pour ce jeu.' };
  const base = path.join(destRoot, clean(game.name) || 'jeu');
  const dest = path.join(base, stamp());
  let bytes = 0;
  for (const [i, d] of dirs.entries()) {
    const to = path.join(dest, `${i}-${path.basename(d)}`);
    await cp(d, to, { recursive: true, force: true, errorOnExist: false }).catch(() => {});
    bytes += await dirSize(to);
  }
  await writeFile(path.join(dest, 'history.json'), JSON.stringify({ game: game.name, dirs, at: Date.now() }));
  const all = (await readdir(base).catch(() => [])).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) await rm(path.join(base, old), { recursive: true, force: true }).catch(() => {});
  return { ok: true, dest, bytes };
}
export async function listBackups(game, destRoot) {
  const base = path.join(destRoot, clean(game.name) || 'jeu');
  const out = [];
  for (const d of (await readdir(base).catch(() => [])).sort().reverse()) {
    const meta = JSON.parse(await readFile(path.join(base, d, 'history.json'), 'utf8').catch(() => 'null') ?? 'null');
    if (meta) out.push({ id: d, at: meta.at, dirs: meta.dirs, bytes: await dirSize(path.join(base, d)) });
  }
  return out;
}
/** Restaure une sauvegarde : l'état actuel est d'abord sauvegardé (rien n'est perdu), puis remplacé. */
export async function restoreBackup(game, destRoot, id) {
  if (!/^[\w-]{10,40}$/.test(String(id))) return { ok: false, error: 'Sauvegarde inconnue.' };
  const base = path.join(destRoot, clean(game.name) || 'jeu');
  const meta = JSON.parse(await readFile(path.join(base, id, 'history.json'), 'utf8').catch(() => 'null') ?? 'null');
  if (!meta) return { ok: false, error: 'Sauvegarde introuvable.' };
  await backupSaves(game, meta.dirs, destRoot, 8);
  for (const [i, d] of meta.dirs.entries()) {
    const from = path.join(base, id, `${i}-${path.basename(d)}`);
    if (!(await stat(from).catch(() => null))) continue;
    await rm(d, { recursive: true, force: true }).catch(() => {});
    await cp(from, d, { recursive: true, force: true });
  }
  return { ok: true };
}
export async function dirSize(dir) {
  let n = 0;
  for (const d of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) n += await dirSize(p); else n += (await stat(p).catch(() => null))?.size ?? 0;
  }
  return n;
}

// ===================== 2. Saccades : caches de shaders =====================
/** Caches de shaders : celui du jeu dans Steam (propre au jeu) + caches généraux DirectX / NVIDIA / AMD (en option). */
export function shaderCaches(game, { env = process.env, library = null } = {}) {
  const local = env.LOCALAPPDATA ?? '';
  const list = [];
  if (game.source === 'steam' && game.steamId && library) list.push({ id: 'steam', label: 'Cache de shaders Steam de ce jeu', dir: path.join(library, 'shadercache', String(game.steamId)), own: true });
  // FiveM : seulement ce que FiveM retélécharge tout seul. Jamais game-storage (fichiers de GTA), mods, plugins ni citizen :
  // les packs graphiques et mods restent intacts.
  if (game.source === 'fivem' && game.installDir) for (const d of ['cache', 'server-cache', 'server-cache-priv']) list.push({ id: `fivem-${d}`, label: `FiveM : ${d} (retéléchargé tout seul, mods et packs graphiques gardés)`, dir: path.join(game.installDir, 'FiveM.app', 'data', d), own: true });
  list.push(
    { id: 'd3d', label: 'Cache de shaders DirectX (tous les jeux)', dir: path.join(local, 'D3DSCache') },
    { id: 'nv', label: 'Cache de shaders NVIDIA (tous les jeux)', dir: path.join(local, 'NVIDIA', 'DXCache') },
    { id: 'nvgl', label: 'Cache OpenGL/Vulkan NVIDIA', dir: path.join(local, 'NVIDIA', 'GLCache') },
    { id: 'amd', label: 'Cache de shaders AMD (tous les jeux)', dir: path.join(local, 'AMD', 'DxCache') },
  );
  return list;
}
export async function clearDir(dir) {
  const before = await dirSize(dir);
  for (const d of await readdir(dir).catch(() => [])) await rm(path.join(dir, d), { recursive: true, force: true }).catch(() => {});
  return Math.max(0, before - await dirSize(dir));
}

// ===================== 5. Déplacer un jeu Steam vers une autre bibliothèque =====================
/** Copie le dossier du jeu, déplace son manifeste, puis supprime l'ancien dossier (seulement si la copie est complète). */
export async function moveSteamGame({ appId, installDir, fromLib, toLib }, onProgress = () => {}) {
  const acf = `appmanifest_${appId}.acf`;
  const src = path.join(fromLib, 'common', installDir);
  const dst = path.join(toLib, 'common', installDir);
  if (!/^\d+$/.test(String(appId)) || path.basename(installDir) !== installDir) return { ok: false, error: 'Jeu invalide.' };
  if (path.resolve(fromLib).toLowerCase() === path.resolve(toLib).toLowerCase()) return { ok: false, error: 'Le jeu est déjà sur ce disque.' };
  if (await stat(dst).catch(() => null)) return { ok: false, error: 'Un dossier du même nom existe déjà sur ce disque.' };
  const total = await dirSize(src);
  let copied = 0;
  const walk = async (from, to) => {
    await mkdir(to, { recursive: true });
    for (const d of await readdir(from, { withFileTypes: true })) {
      const a = path.join(from, d.name); const b = path.join(to, d.name);
      if (d.isDirectory()) await walk(a, b);
      else { await cp(a, b); copied += (await stat(a)).size; onProgress({ copied, total, file: d.name }); }
    }
  };
  try { await walk(src, dst); } catch (err) { await rm(dst, { recursive: true, force: true }).catch(() => {}); return { ok: false, error: `Copie interrompue : ${err.message}` }; }
  if (await dirSize(dst) < total) { await rm(dst, { recursive: true, force: true }).catch(() => {}); return { ok: false, error: 'Copie incomplète : rien n’a été changé.' }; }
  await rename(path.join(fromLib, acf), path.join(toLib, acf)).catch(async () => { await cp(path.join(fromLib, acf), path.join(toLib, acf)); await rm(path.join(fromLib, acf), { force: true }); });
  await rm(src, { recursive: true, force: true }).catch(() => {});
  return { ok: true, bytes: total };
}

// ===================== 7. Alertes de prix =====================
/** Prix actuel d'un jeu sur Steam (en euros, magasin France). */
export async function steamPrice(appId, fetchImpl = fetch) {
  if (!/^\d+$/.test(String(appId))) return null;
  const j = await fetchImpl(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=fr&l=french&filters=price_overview`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const p = j?.[appId]?.data?.price_overview;
  if (j?.[appId]?.success && !p) return { price: 0, initial: 0, discount: 0, free: true };
  return p ? { price: p.final / 100, initial: p.initial / 100, discount: p.discount_percent, currency: p.currency } : null;
}
/** Meilleur prix toutes boutiques confondues (Steam, Epic, GOG, Humble…) via CheapShark, en dollars. */
export async function bestDeal(title, fetchImpl = fetch) {
  const j = await fetchImpl(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(String(title).slice(0, 80))}&limit=1`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const g = Array.isArray(j) ? j[0] : null;
  if (!g) return null;
  const d = await fetchImpl(`https://www.cheapshark.com/api/1.0/games?id=${encodeURIComponent(g.gameID)}`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const STORES = { 1: 'Steam', 25: 'Epic Games', 7: 'GOG', 11: 'Humble', 3: 'GreenManGaming', 23: 'GameBillet', 27: 'Gamesplanet', 35: 'DreamGame' };
  const best = (d?.deals ?? []).map((x) => ({ store: STORES[x.storeID] ?? 'autre boutique', price: Number(x.price), retail: Number(x.retailPrice) })).sort((a, b) => a.price - b.price)[0];
  return best ? { ...best, cheapest: Number(d?.cheapestPriceEver?.price) || null, currency: 'USD' } : null;
}
/** Doit-on prévenir ? (prix sous le seuil, une seule fois par baisse). */
export function priceAlert(alert, now) {
  if (!now || now.price == null || alert.target == null) return false;
  return now.price <= alert.target && (alert.lastNotified == null || now.price < alert.lastNotified);
}

// ===================== 12. Dernier pilote NVIDIA pour LA carte du PC =====================
// Avant : toujours le pilote de la gamme la plus récente, proposé même à une GTX 1660 qui n'en veut pas.
// Maintenant : on retrouve la carte dans la liste officielle NVIDIA (série + produit), puis son pilote à elle.
const normGpu = (v) => String(v ?? '').replace(/^nvidia\s+/i, '').replace(/&amp;/g, '&').replace(/[^a-z0-9]/gi, '').toLowerCase();
/** { psid, pfid } de la carte dans la liste NVIDIA (XML de lookupValueSearch TypeID=3), ou null si inconnue. */
export function nvidiaProduct(xml, gpuName) {
  const want = normGpu(gpuName);
  if (!want) return null;
  for (const m of String(xml ?? '').matchAll(/<LookupValue\b[^>]*ParentID="(\d+)"[^>]*>\s*<Name>([^<]+)<\/Name>\s*<Value>(\d+)<\/Value>/g)) if (normGpu(m[2]) === want) return { psid: m[1], pfid: m[3] };
  return null;
}
export async function nvidiaLatest(gpuName, fetchImpl = fetch) {
  const xml = await fetchImpl('https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=3', { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
  const p = nvidiaProduct(xml, gpuName);
  if (!p) return null; // carte pas trouvée : on ne propose rien plutôt qu'un pilote qui n'est peut-être pas le sien
  const url = `https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php?func=DriverManualLookup&psid=${p.psid}&pfid=${p.pfid}&osID=135&languageCode=1036&isWHQL=1&dch=1&sort1=0&numberOfResults=1`;
  const j = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const d = j?.IDS?.[0]?.downloadInfo;
  if (!d?.Version) return null;
  return { version: String(d.Version), date: d.ReleaseDateTime ?? null, notes: d.DetailsURL ? decodeURIComponent(d.DetailsURL) : null, download: d.DownloadURL ? decodeURIComponent(d.DownloadURL) : null, name: d.Name ? decodeURIComponent(d.Name) : 'GeForce Game Ready' };
}
/** Version NVIDIA lisible (ex. 581.29) à partir de la version Windows du pilote (ex. 32.0.15.8129). */
export function nvidiaVersion(winVersion) {
  const m = String(winVersion ?? '').match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const tail = `${m[3].slice(-1)}${m[4].padStart(4, '0')}`;
  return `${Number(tail.slice(0, 3))}.${tail.slice(3)}`;
}
export const newerVersion = (a, b) => { const x = String(a).split('.').map(Number); const y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); } return false; };

// ===================== 1. Notifications Windows coupées pendant une partie =====================
const TOASTS = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications';
export async function windowsToasts(on) {
  if (!win) return false;
  await run('reg', ['add', TOASTS, '/v', 'ToastEnabled', '/t', 'REG_DWORD', '/d', on ? '1' : '0', '/f'], { windowsHide: true }).catch(() => null);
  return true;
}

// ===================== 24. Économie sur batterie (portables) =====================
export const POWER_SAVER = 'a1841308-3168-11d0-9e32-6a88e6aa02df';
export const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e';
/** Luminosité de l'écran intégré (portables) : lecture et réglage via WMI. */
export async function brightness(set = null) {
  if (!win) return null;
  const ps = set == null
    ? '(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentBrightness'
    : `$m=Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue | Select-Object -First 1; if($m){ Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{Timeout=1; Brightness=${Math.max(5, Math.min(100, Math.round(Number(set))))}} | Out-Null; 'ok' }`;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 10_000 }).catch(() => null);
  const v = String(r?.stdout ?? '').trim();
  return set == null ? (Number(v) || null) : v === 'ok';
}

// ===================== Partage de sauvegardes entre amis =====================
// Paquet = JSON compressé (gzip) : { game, dirs: [{ name, files: [{ p: chemin relatif, d: base64 }] }] }.
const MAX_SHARE = 25 * 1024 * 1024;
async function walk(dir, base = dir, out = []) {
  for (const d of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) await walk(p, base, out);
    else if (d.isFile()) out.push(path.relative(base, p));
  }
  return out;
}
/** Compresse les dossiers de sauvegarde d'un jeu (25 Mo maximum une fois compressé). */
export async function packSaves(game, dirs) {
  const { gzipSync } = await import('node:zlib');
  let raw = 0;
  const packed = [];
  for (const dir of dirs) {
    const files = [];
    for (const rel of await walk(dir)) {
      const buf = await readFile(path.join(dir, rel));
      raw += buf.length;
      if (raw > 200 * 1024 * 1024) throw new Error('Sauvegarde trop grosse pour être partagée.');
      files.push({ p: rel.split(path.sep).join('/'), d: buf.toString('base64') });
    }
    packed.push({ name: path.basename(dir), files });
  }
  if (!packed.some((x) => x.files.length)) throw new Error('Aucun fichier de sauvegarde trouvé.');
  const out = gzipSync(Buffer.from(JSON.stringify({ v: 1, game: String(game ?? ''), dirs: packed })));
  if (out.length > MAX_SHARE) throw new Error('Sauvegarde trop grosse pour être partagée (25 Mo maximum une fois compressée).');
  return out;
}
/** Chemin relatif sûr (pas de « .. », pas de chemin absolu ni de lecteur Windows). */
export const safeRel = (p) => typeof p === 'string' && p.length > 0 && p.length < 400 && !/^([a-z]:|[\\/])/i.test(p) && !p.split(/[\\/]/).some((x) => x === '..' || x === '' || /[<>:"|?*\u0000-\u001f]/.test(x));
/** Lit un paquet reçu (et vérifie chaque chemin). */
export async function readPack(buf) {
  const { gunzipSync } = await import('node:zlib');
  const j = JSON.parse(gunzipSync(buf, { maxOutputLength: 300 * 1024 * 1024 }).toString('utf8'));
  if (j?.v !== 1 || !Array.isArray(j.dirs)) throw new Error('Paquet de sauvegarde illisible.');
  for (const d of j.dirs) {
    if (!Array.isArray(d.files) || !safeRel(d.name) || /[\\/]/.test(d.name)) throw new Error('Paquet de sauvegarde illisible.');
    for (const f of d.files) if (!safeRel(f.p) || typeof f.d !== 'string') throw new Error('Paquet de sauvegarde refusé (chemin interdit).');
  }
  return j;
}
/** Écrit un paquet dans les dossiers donnés (même nom de dossier sinon même position) ; renvoie le nombre de fichiers. */
export async function unpackSaves(pack, targets) {
  let n = 0;
  for (const [i, d] of pack.dirs.entries()) {
    const to = targets.find((t) => path.basename(t).toLowerCase() === d.name.toLowerCase()) ?? targets[i] ?? null;
    if (!to) continue;
    for (const f of d.files) {
      const dest = path.join(to, ...f.p.split('/'));
      if (!path.resolve(dest).startsWith(path.resolve(to) + path.sep)) continue;
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, Buffer.from(f.d, 'base64'));
      n += 1;
    }
  }
  return n;
}

// ===================== Fortnite : mode Performance =====================
// C'est le mode officiel du jeu (Paramètres › Vidéo › Mode de rendu › Performance) : PreferredFeatureLevel=es31.
// L'ancien fichier est copié à côté et remis tel quel quand on désactive.
export const fortniteIni = (env = process.env) => path.join(env.LOCALAPPDATA ?? '', 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini');
export const perfModeOn = (text) => /^\s*PreferredFeatureLevel\s*=\s*es31\s*$/im.test(String(text));
export function withPerfMode(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => !/^\s*Preferred(RHI|FeatureLevel)\s*=/i.test(l));
  const at = lines.findIndex((l) => /^\s*\[D3DRHIPreference\]\s*$/i.test(l));
  const add = ['PreferredRHI=dx11', 'PreferredFeatureLevel=es31'];
  if (at >= 0) lines.splice(at + 1, 0, ...add); else lines.push('', '[D3DRHIPreference]', ...add);
  return lines.join('\r\n');
}
export const fortniteState = async (file = fortniteIni()) => perfModeOn(await readFile(file, 'utf8').catch(() => ''));
export async function fortnitePerf(on, file = fortniteIni()) {
  const bak = `${file}.history-bak`;
  const text = await readFile(file, 'utf8').catch(() => null);
  if (text == null) return { ok: false, error: 'Lance Fortnite une fois pour créer ses réglages.' };
  if (on) {
    if (perfModeOn(text)) return { ok: true };
    await writeFile(bak, text);
    await writeFile(file, withPerfMode(text));
  } else {
    const old = await readFile(bak, 'utf8').catch(() => null);
    await writeFile(file, old ?? String(text).split(/\r?\n/).filter((l) => !/^\s*Preferred(RHI|FeatureLevel)\s*=/i.test(l)).join('\r\n'));
    await rm(bak, { force: true });
  }
  return { ok: true };
}
