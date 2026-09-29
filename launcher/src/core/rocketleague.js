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
    return (id[1] && (me.ids ?? []).some((x) => String(x).toLowerCase() === id[1].toLowerCase())) || (me.name && p.Name === me.name);
  };
  t.event = (msg) => {
    const ev = msg?.Event; let d = msg?.Data;
    if (typeof d === 'string') try { d = JSON.parse(d); } catch { d = null; }
    if (ev === 'UpdateState' && d?.Game) {
      if (d.Game.bReplay) return null;
      const players = d.Players ?? [];
      const self = players.find(mine) ?? (d.Game.bHasTarget && players.find((p) => p.Name === d.Game.Target?.Name));
      if (self) {
        const [plat, id] = String(self.PrimaryId ?? '').split('|');
        t.player = { name: self.Name, platform: (plat ?? '').toLowerCase(), id: id ?? null };
      }
      m = { guid: d.MatchGuid ?? m?.guid, team: self?.TeamNum ?? m?.team ?? null, teams: d.Game.Teams ?? m?.teams ?? [], size: Math.max(m?.size ?? 1, Math.ceil(players.length / 2)) };
    }
    if (ev === 'MatchEnded' && m && m.team != null) {
      const us = m.teams.find((x) => x.TeamNum === m.team)?.Score ?? 0;
      const them = m.teams.find((x) => x.TeamNum !== m.team)?.Score ?? 0;
      const res = { at: Date.now(), win: d?.WinnerTeamNum === m.team, us, them, mode: `${m.size}v${m.size}` };
      m = null;
      return res;
    }
    if (ev === 'MatchDestroyed') m = null; // quitté avant la fin : pas compté
    return null;
  };
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
/** Classé ou occa : le mode dont le profil a bougé juste après la partie (le jeu ne le dit pas) ; null tant qu'on ne sait pas. */
export function classify(g, before, after) {
  const moved = (a, b) => a && b && (a.played > b.played || a.mmr !== b.mmr);
  const rb = before?.ranked?.[g.mode]; const ra = after?.ranked?.[g.mode];
  if (moved(ra, rb)) return { ranked: true, mmr: ra.mmr != null && rb.mmr != null ? Math.round(ra.mmr - rb.mmr) : null };
  if (moved(after?.casual?.[g.mode], before?.casual?.[g.mode])) return { ranked: false, mmr: null };
  return null;
}
const PLATFORM = { steam: 'steam', epic: 'epic', ps4: 'psn', ps5: 'psn', xboxone: 'xbl', xbox: 'xbl' };
export const trackerUrl = (p) => { const pl = PLATFORM[p?.platform]; return pl && (p.id || p.name) ? `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${pl}/${encodeURIComponent(pl === 'steam' ? p.id : p.name)}` : null; };
