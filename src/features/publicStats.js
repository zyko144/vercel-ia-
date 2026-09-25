// Chiffres publics du bot (site vitrine) : serveurs, membres, messages et parties de la semaine,
// et le classement des serveurs qui ont accepté d'apparaître (réglage « Apparaître dans le classement public »).
import { cfg } from './guildConfig.js';
import { planOf } from './premium.js';
import { weekBucket } from './weekly.js';

let client = null;
export const setPublicClient = (c) => { client = c; };
let cache = { at: 0, stats: null, ranking: null };

async function compute() {
  if (Date.now() - cache.at < 60_000 && cache.stats) return cache;
  const guilds = [...(client?.guilds.cache.values() ?? [])];
  let messages = 0;
  let games = 0;
  let music = 0;
  const ranking = [];
  for (const g of guilds) {
    const w = await weekBucket(g.id);
    messages += w.messages ?? 0;
    games += w.jeux ?? 0;
    music += w.musique ?? 0;
    if (cfg(g.id, 'public.listed')) {
      ranking.push({
        name: g.name, icon: g.iconURL({ size: 128 }), members: g.memberCount, messages: w.messages ?? 0, active: Object.keys(w.users ?? {}).length,
        premium: planOf(g.id).key !== 'gratuit',
        invite: g.vanityURLCode ? `https://discord.gg/${g.vanityURLCode}` : null,
      });
    }
  }
  ranking.sort((a, b) => b.messages - a.messages || b.members - a.members);
  cache = {
    at: Date.now(),
    stats: {
      online: Boolean(client?.isReady()), servers: guilds.length, members: guilds.reduce((n, g) => n + (g.memberCount ?? 0), 0),
      messagesWeek: messages, gamesWeek: games, musicWeek: music, ping: client?.isReady() ? Math.round(client.ws.ping) : null,
    },
    ranking: ranking.slice(0, 50).map((r, i) => ({ rank: i + 1, ...r })),
  };
  return cache;
}

export const publicStats = async () => (await compute()).stats;
export const publicRanking = async () => ({ servers: (await compute()).ranking });
