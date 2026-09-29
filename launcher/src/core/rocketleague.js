// Rocket League en direct : l'API de statistiques officielle du jeu (Psyonix, port local 49123) donne le score,
// les équipes et le vainqueur de chaque match ; le rang et le MMR viennent du profil public (tracker.gg).
// Rien n'est inventé : sans profil trouvé, l'overlay montre seulement victoires, défaites et série.
import path from 'node:path';
import { iniGet, iniSet } from './gameopti.js';

export const RL_PORT = 49123;
export const statsIni = (installDir) => path.join(installDir, 'TAGame', 'Config', 'DefaultStatsAPI.ini');
/** Active l'API (PacketSendRate > 0) sans toucher au reste du fichier ; null si déjà active. */
export function enableStatsIni(text) {
  const rate = Number(iniGet(text, 'PacketSendRate') ?? 0);
  if (rate > 0 && iniGet(text, 'Port')) return null;
  return iniSet(text, { PacketSendRate: '30', Port: String(RL_PORT) }, 'TAGame.MatchStatsExporter_TA');
}

/** Découpe un flux TCP en objets JSON complets (les messages arrivent collés ou coupés). */
export function jsonStream(onObject) {
  let buf = ''; let depth = 0; let inStr = false; let esc = false; let start = -1;
  return (chunk) => {
    const base = buf.length; buf += chunk;
    for (let i = base; i < buf.length; i++) {
      const c = buf[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') { if (depth++ === 0) start = i; } else if (c === '}' && depth > 0 && --depth === 0) {
        try { onObject(JSON.parse(buf.slice(start, i + 1))); } catch { /* message abîmé : ignoré */ }
        buf = buf.slice(i + 1); i = -1; start = -1;
      }
    }
    if (depth === 0) buf = '';
    if (buf.length > 1e6) { buf = ''; depth = 0; inStr = false; }
  };
}

/**
 * Suit un match à partir des messages de l'API. me = { ids: [...identifiants Epic/Steam connus], name }.
 * Renvoie { event(msg) → résultat du match quand il se termine (sinon null), player (Nom + plateforme reconnus) }.
 */
export function matchTracker(me = {}) {
  let m = null; const t = { player: null };
  const mine = (p) => {
    const id = String(p.PrimaryId ?? '').split('|');
    const name = me.name ?? t.player?.name;
    return (id[1] && (me.ids ?? []).some((x) => String(x).toLowerCase() === id[1].toLowerCase())) || (name && p.Name === name);
  };
  t.event = (msg) => {
    const ev = msg?.Event; let d = msg?.Data;
    if (typeof d === 'string') try { d = JSON.parse(d); } catch { d = null; }
    // Résultat donné une seule fois, au tout premier signal de fin (gagnant annoncé ou fin du match)
    const finish = (winner) => {
      const us = m.teams.find((x) => x.TeamNum === m.team)?.Score ?? 0;
      const them = m.teams.find((x) => x.TeamNum !== m.team)?.Score ?? 0;
      m.done = true;
      return { at: Date.now(), win: winner != null ? winner === m.team : us > them, us, them, mode: `${m.size}v${m.size}` };
    };
    if (ev === 'UpdateState' && d?.Game) {
      if (d.Game.bReplay) return null;
      if (m?.done) { if (d.Game.bHasWinner) return null; m = null; } // podium, puis partie suivante
      const players = d.Players ?? [];
      // Vraie partie seulement : deux équipes avec des joueurs (pas l'entraînement libre ni le menu)
      if (!m && (players.length < 2 || new Set(players.map((p) => p.TeamNum)).size < 2)) return null;
      // Joueur suivi par la caméra seulement pour se reconnaître la 1re fois (après une démo, la caméra suit un autre joueur)
      const self = players.find(mine) ?? (!t.player && d.Game.bHasTarget && players.find((p) => p.Name === d.Game.Target?.Name));
      if (self) {
        const [plat, id] = String(self.PrimaryId ?? '').split('|');
        t.player = { name: self.Name, platform: (plat ?? '').toLowerCase(), id: id ?? null };
      }
      m = { guid: d.MatchGuid ?? m?.guid, team: self?.TeamNum ?? m?.team ?? null, teams: d.Game.Teams ?? m?.teams ?? [], size: Math.max(m?.size ?? 1, Math.ceil(players.length / 2)) };
      // Gagnant annoncé dans l'état du jeu : résultat tout de suite, sans attendre l'écran de fin
      if (d.Game.bHasWinner && m.team != null) return finish(m.teams.find((x) => x.Name && x.Name === d.Game.Winner)?.TeamNum);
    }
    if (ev === 'MatchEnded' && m && !m.done && m.team != null) return finish(d?.WinnerTeamNum);
    if (ev === 'MatchDestroyed') m = null; // quitté avant la fin : pas compté
    return null;
  };
  t.match = () => (m && !m.done ? { guid: m.guid ?? 'match', mode: `${m.size}v${m.size}` } : null); // partie en cours
  return t;
}

/**
 * Série en cours (+3 = 3 victoires d'affilée, -2 = 2 défaites), bilan du jour (net : MMR gagné, sinon victoires - défaites)
 * et victoires/défaites du jour par catégorie (classé, occa, tout) et par mode : chaque mode a ses compteurs.
 */
export function rlSummary(games = [], now = Date.now()) {
  let streak = 0;
  for (const g of games) { if (!streak || (streak > 0) === g.win) streak += g.win ? 1 : -1; else break; }
  const day = new Date(now).toDateString();
  const today = games.filter((g) => new Date(g.at).toDateString() === day);
  const wins = today.filter((g) => g.win).length; const losses = today.length - wins;
  const modes = { ranked: {}, casual: {}, all: {} };
  for (const g of today) for (const c of ['all', g.ranked === true ? 'ranked' : g.ranked === false ? 'casual' : null]) if (c) (modes[c][g.mode] ??= [0, 0])[g.win ? 0 : 1]++;
  const mmr = today.filter((g) => g.mmr != null);
  return { streak, wins, losses, net: mmr.length ? mmr.reduce((a, g) => a + g.mmr, 0) : wins - losses, modes };
}

const RANKED = { 10: '1v1', 11: '2v2', 13: '3v3' }; const CASUAL = { 1: '1v1', 2: '2v2', 3: '3v3', 4: '4v4' };
/** Profil tracker.gg → rang et MMR par mode classé, parties jouées par mode (classé et occa). */
export function parseTracker(json) {
  const d = json?.data; if (!d) return null;
  const ranked = {}; const casual = {};
  for (const s of d.segments ?? []) {
    const id = s.attributes?.playlistId; if (s.type !== 'playlist') continue;
    const x = { mmr: s.stats?.rating?.value ?? null, played: s.stats?.matchesPlayed?.value ?? null };
    if (RANKED[id]) ranked[RANKED[id]] = { ...x, tier: s.stats?.tier?.metadata?.name ?? null, division: s.stats?.division?.metadata?.name ?? null, icon: s.stats?.tier?.metadata?.iconUrl ?? null };
    else if (CASUAL[id]) casual[CASUAL[id]] = x;
  }
  return { name: d.platformInfo?.platformUserHandle ?? null, avatar: d.platformInfo?.avatarUrl ?? null, ranked, casual };
}
/**
 * Classé ou occa (le jeu ne le dit pas) : entre deux lectures du profil, le nombre de parties jouées de chaque mode
 * (classé / occa) dit à quelles parties non classées encore elles correspondent. Gain de MMR si une seule partie classée
 * du mode. Les parties restent enregistrées quoi qu'il arrive (« Tout ») ; games : du plus récent au plus ancien.
 */
export function classifyAll(games, before, after) {
  if (!before || !after) return 0;
  const left = {}; const n = (cat, m) => (left[`${cat}${m}`] ??= (() => {
    const a = after[cat]?.[m]; const b = before[cat]?.[m];
    if (!a || !b) return 0;
    return a.played != null && b.played != null ? a.played - b.played : Number(a.mmr !== b.mmr);
  })());
  const done = [];
  // Parties non classées encore, et parties classées (vu dans le journal du jeu) sans gain de MMR
  for (const g of games.filter((x) => (x.ranked == null || (x.ranked === true && x.mmr == null)) && (!before.at || x.at > before.at - 60_000)).reverse()) {
    if (g.ranked !== false && n('ranked', g.mode) > 0) { left[`ranked${g.mode}`]--; g.ranked = true; done.push(g); } else if (g.ranked == null && n('casual', g.mode) > 0) { left[`casual${g.mode}`]--; g.ranked = false; done.push(g); }
  }
  // Gain de MMR (classé ou occa) quand une seule partie de ce mode et de ce type
  for (const g of done) {
    const cat = g.ranked ? 'ranked' : 'casual'; const a = after[cat]?.[g.mode]?.mmr; const b = before[cat]?.[g.mode]?.mmr;
    if (done.filter((x) => x.ranked === g.ranked && x.mode === g.mode).length === 1 && a != null && b != null) g.mmr = Math.round(a - b);
  }
  return done.length;
}
// Mode lancé (classé ou occa) : lu dans le journal du jeu (Launch.log) dès le début de la partie
const RANKED_IDS = new Set([10, 11, 13, 27, 28, 29, 30, 34]); const CASUAL_IDS = new Set([1, 2, 3, 4]);
// Plein écran exclusif : aucune fenêtre ne passe par-dessus. « Sans bordure » est identique à l'œil et garde les overlays.
export const rlSettingsFile = (documents) => path.join(documents, 'My Games', 'Rocket League', 'TAGame', 'Config', 'TASystemSettings.ini');
export function borderlessIni(text) {
  if (!/^\s*true\s*$/i.test(iniGet(text, 'Fullscreen') ?? '') || /^\s*true\s*$/i.test(iniGet(text, 'Borderless') ?? '')) return null;
  return iniSet(text, { Fullscreen: 'False', Borderless: 'True' }, 'SystemSettings');
}
// « Optimisations plein écran » de Windows désactivées pour le jeu (compatibilité) : le plein écran devient exclusif
export const LAYERS_KEY = 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
/** Sortie de « reg query » → { path, value } de Rocket League si l'option est désactivée, sinon null. */
export function fsoOff(regOutput = '') {
  for (const line of String(regOutput).split(/\r?\n/)) {
    const m = /^\s+(.*rocketleague\.exe)\s+REG_SZ\s+(.*)$/i.exec(line);
    if (m && /\bDISABLEDXMAXIMIZEDWINDOWEDMODE\b/i.test(m[2])) return { path: m[1].trim(), value: m[2].trim() };
  }
  return null;
}
/** Valeur sans l'option (null = supprimer la valeur, il ne reste rien d'autre). */
export function fsoOn(value) {
  const rest = String(value).split(/\s+/).filter((x) => x && !/^DISABLEDXMAXIMIZEDWINDOWEDMODE$/i.test(x));
  return rest.filter((x) => x !== '~').length ? rest.join(' ') : null;
}
export const rlLogFile = (documents) => path.join(documents, 'My Games', 'Rocket League', 'TAGame', 'Logs', 'Launch.log');
export function playlistFromLog(text = '') {
  const all = [...String(text).matchAll(/playlist\s*(?:id)?\s*[:=]?\s*(\d{1,3})\b/gi)];
  for (let i = all.length - 1; i >= 0; i--) {
    const id = Number(all[i][1]);
    if (RANKED_IDS.has(id) || CASUAL_IDS.has(id)) return { id, cat: RANKED_IDS.has(id) ? 'ranked' : 'casual' };
  }
  return null;
}
const PLATFORM = { steam: 'steam', epic: 'epic', ps4: 'psn', ps5: 'psn', xboxone: 'xbl', xbox: 'xbl' };
/** Page publique du profil : ouverte en fond, elle passe la protection du site et lit l'API depuis le navigateur. */
export const trackerPage = (p) => trackerUrl(p)?.replace(/^https:\/\/api\.tracker\.gg\/api\/v2\/rocket-league\/standard\/profile\/(.+)$/, 'https://rocketleague.tracker.network/rocket-league/profile/$1/overview') ?? null;
export const trackerUrl = (p) => { const pl = PLATFORM[p?.platform]; return pl && (p.id || p.name) ? `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${pl}/${encodeURIComponent(pl === 'steam' ? p.id : p.name)}` : null; };
