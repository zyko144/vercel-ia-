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
      m = { guid: d.MatchGuid ?? m?.guid, team: self?.TeamNum ?? m?.team ?? null, teams: d.Game.Teams ?? m?.teams ?? [], size: Math.max(1, Math.ceil(players.length / 2)) || m?.size };
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

/** Série en cours (+3 = 3 victoires d'affilée, -2 = 2 défaites) et bilan du jour. */
export function rlSummary(games = [], now = Date.now()) {
  let streak = 0;
  for (const g of games) { if (!streak || (streak > 0) === g.win) streak += g.win ? 1 : -1; else break; }
  const day = new Date(now).toDateString();
  const today = games.filter((g) => new Date(g.at).toDateString() === day);
  return { streak, wins: today.filter((g) => g.win).length, losses: today.filter((g) => !g.win).length };
}

const PLAYLISTS = { 10: '1v1', 11: '2v2', 13: '3v3' };
/** Profil tracker.gg → rang et MMR par mode classé. */
export function parseTracker(json) {
  const d = json?.data; if (!d) return null;
  const ranked = {};
  for (const s of d.segments ?? []) {
    const mode = PLAYLISTS[s.attributes?.playlistId]; if (s.type !== 'playlist' || !mode) continue;
    ranked[mode] = { mmr: s.stats?.rating?.value ?? null, tier: s.stats?.tier?.metadata?.name ?? null, division: s.stats?.division?.metadata?.name ?? null, icon: s.stats?.tier?.metadata?.iconUrl ?? null };
  }
  return { name: d.platformInfo?.platformUserHandle ?? null, avatar: d.platformInfo?.avatarUrl ?? null, ranked };
}
export const trackerUrl = (p) => (p?.platform && (p.id || p.name) ? `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${p.platform === 'steam' ? 'steam' : 'epic'}/${encodeURIComponent(p.platform === 'steam' ? p.id : p.name)}` : null);
