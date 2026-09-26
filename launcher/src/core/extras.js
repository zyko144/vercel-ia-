// Bibliothèque en plus : captures d'écran par jeu, succès détaillés, durée pour finir, jeux Xbox (Game Pass),
// jeux ajoutés à la main.
import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { MODELS } from './ai.js';
import { norm } from './sort.js';

const run = promisify(execFile);
const IMAGE = /\.(png|jpe?g)$/i;
const VIDEO = /\.(mp4|mkv|webm)$/i;

// ===================== Captures =====================

/** Captures d'un jeu : Steam (par compte), NVIDIA (Vidéos\<jeu>) et barre de jeu Xbox (Vidéos\Captures). */
export async function capturesOf(item, { steamRoot = null, accountIds = [], videosDir = path.join(os.homedir(), 'Videos') } = {}) {
  const out = [];
  const add = async (dir, filter = () => true) => {
    for (const f of await readdir(dir).catch(() => [])) {
      if (!(IMAGE.test(f) || VIDEO.test(f)) || !filter(f)) continue;
      const full = path.join(dir, f);
      const s = await stat(full).catch(() => null);
      if (s?.isFile()) out.push({ file: full, at: s.mtimeMs, video: VIDEO.test(f) });
    }
  };
  if (item.source === 'steam' && steamRoot && /^\d+$/.test(item.steamId ?? '')) {
    for (const acc of accountIds) await add(path.join(steamRoot, 'userdata', String(acc), '760', 'remote', item.steamId, 'screenshots'));
  }
  const name = norm(item.name);
  if (name.length >= 3) {
    for (const d of await readdir(videosDir, { withFileTypes: true }).catch(() => [])) {
      if (d.isDirectory() && norm(d.name) === name) await add(path.join(videosDir, d.name));
    }
    // Barre de jeu Xbox : « Rocket League® 2024-05-01 21-14-03.png » (nom de la fenêtre du jeu au début)
    await add(path.join(videosDir, 'Captures'), (f) => norm(f.replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '')) === name);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 80);
}

// ===================== Succès Steam détaillés =====================

/** Succès avec nom, description, icône et rareté ; les plus faciles à débloquer d'abord parmi ceux qui manquent. */
export async function achievementsOf(appid, apiKey, steamId, fetchImpl = fetch) {
  if (!apiKey || !steamId || !/^\d{1,8}$/.test(String(appid))) return null;
  const get = (u) => fetchImpl(u, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const key = encodeURIComponent(apiKey);
  const [mine, schema, global] = await Promise.all([
    get(`https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?appid=${appid}&key=${key}&steamid=${encodeURIComponent(steamId)}&l=french`),
    get(`https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?appid=${appid}&key=${key}&l=french`),
    get(`https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`),
  ]);
  const list = mine?.playerstats?.achievements;
  if (!Array.isArray(list) || !list.length) return null;
  return mergeAchievements(list, schema?.game?.availableGameStats?.achievements ?? [], global?.achievementpercentages?.achievements ?? []);
}

export function mergeAchievements(player, schema, global) {
  const info = new Map(schema.map((s) => [s.name, s]));
  const pct = new Map(global.map((g) => [g.name, Number(g.percent)]));
  const all = player.map((a) => {
    const s = info.get(a.apiname) ?? {};
    return {
      name: s.displayName ?? a.name ?? a.apiname, desc: s.description ?? a.description ?? '', done: Boolean(a.achieved),
      at: (a.unlocktime ?? 0) * 1000, icon: (a.achieved ? s.icon : s.icongray) ?? null, pct: pct.get(a.apiname) ?? null, hidden: Boolean(s.hidden),
    };
  });
  const locked = all.filter((a) => !a.done).sort((x, y) => (y.pct ?? -1) - (x.pct ?? -1));
  return { done: all.length - locked.length, total: all.length, easy: locked.slice(0, 5), recent: all.filter((a) => a.done).sort((x, y) => y.at - x.at).slice(0, 5), locked, unlocked: all.filter((a) => a.done) };
}

// ===================== Durée pour finir =====================

const HLTB_SCHEMA = { type: 'object', properties: { main: { type: 'number' }, extra: { type: 'number' }, complete: { type: 'number' }, found: { type: 'boolean' } }, required: ['main', 'extra', 'complete', 'found'] };
/** Temps moyens (heures) d'après HowLongToBeat, cherchés par l'IA sur internet. */
export async function timeToBeat(ai, name) {
  if (!ai || !name) return null;
  const r = await ai.ask({
    web: true, model: MODELS.search, schema: HLTB_SCHEMA,
    system: 'Tu donnes les temps de jeu moyens publiés par howlongtobeat.com. Jamais inventés : found=false si tu ne trouves pas.',
    text: `Jeu : « ${name} ». Donne en heures : main (histoire principale), extra (histoire + à côtés), complete (100 %). Cherche sur howlongtobeat.com.`,
  }).catch(() => null);
  return cleanTimes(r);
}
export function cleanTimes(r) {
  if (!r?.found) return null;
  const h = (v) => (Number.isFinite(v) && v > 0 && v < 5000 ? Math.round(v * 10) / 10 : null);
  const t = { main: h(r.main), extra: h(r.extra), complete: h(r.complete) };
  return t.main || t.extra || t.complete ? t : null;
}

// ===================== Jeux Xbox (Game Pass) =====================

/** Lit MicrosoftGame.config : nom affiché et exécutable du jeu. */
export function parseMicrosoftGameConfig(xml) {
  const text = String(xml ?? '');
  const attr = (tag, name) => text.match(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`, 'i'))?.[1] ?? null;
  const exe = text.match(/<Executable\b([^>]*)\/?>/i)?.[1] ?? '';
  const pick = (name) => exe.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))?.[1] ?? null;
  const display = attr('ShellVisuals', 'DefaultDisplayName');
  return { name: display && !/^ms-resource:/i.test(display) ? display : null, exe: pick('Name'), appId: pick('Id') ?? 'Game' };
}

const PFN = /^[\w.-]{3,100}_[a-z0-9]{13}$/;
export async function scanXbox() {
  if (process.platform !== 'win32') return [];
  const ps = "Get-AppxPackage | Where-Object { $_.InstallLocation -and (Test-Path (Join-Path $_.InstallLocation 'MicrosoftGame.config')) } | ForEach-Object { \"$($_.PackageFamilyName)|$($_.InstallLocation)\" }";
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }).catch(() => null);
  const out = [];
  for (const line of String(r?.stdout ?? '').split(/\r?\n/)) {
    const [pfn, dir] = line.trim().split('|');
    if (!PFN.test(pfn ?? '') || !dir) continue;
    const cfg = parseMicrosoftGameConfig(await readFile(path.join(dir, 'MicrosoftGame.config'), 'utf8').catch(() => ''));
    const name = cfg.name ?? path.basename(path.dirname(dir));
    if (!/^[\w.-]+$/.test(cfg.appId)) continue;
    out.push({
      id: `xbox:${pfn}`, source: 'xbox', kind: 'game', category: 'jeu', name, installed: true, installDir: dir,
      exe: cfg.exe ? path.join(dir, cfg.exe) : null, aumid: `${pfn}!${cfg.appId}`, size: 0, minutes: 0, lastPlayed: 0, art: {}, known: true,
    });
  }
  return out;
}
export const validAumid = (a) => /^[\w.-]{3,100}_[a-z0-9]{13}![\w.-]{1,64}$/.test(String(a ?? ''));

// ===================== Jeux ajoutés à la main =====================

/** Nom lisible tiré d'un .exe (« RocketLeague.exe » → « Rocket League »). */
export function nameFromExe(file) {
  return path.win32.basename(String(file)).replace(/\.exe$/i, '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+(win64|x64|shipping|launcher)$/i, '').trim() || 'Jeu';
}
export function customItem(entry) {
  return {
    id: entry.id, source: 'custom', kind: 'game', category: 'jeu', name: entry.name, installed: true,
    installDir: path.win32.dirname(entry.exe), exe: entry.exe, size: 0, minutes: 0, lastPlayed: 0, art: {}, known: true, custom: true,
  };
}
