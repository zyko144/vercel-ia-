// API d'admin (protégée par la clé dérivée du token) : lire les logs, voir l'état du bot, tester le blind test.
import { lavalink } from './music/lavalink.js';
import { allPlayers } from './music/player.js';
import { config } from './config.js';
import { blindTestState, handleBlindTestMessage, openBlindTestSetup, startGame, stopBlindTest } from './music/blindtest.js';
import { recentLogs } from './utils/logbuffer.js';

export function adminRoutes(client) {
  const guildOf = (id) => client.guilds.cache.get(id) ?? client.guilds.cache.first();

  return {
    'GET /admin/logs': async (url) => recentLogs({
      count: Number(url.searchParams.get('n') ?? 300),
      grep: url.searchParams.get('grep') ?? '',
    }),

    'GET /admin/state': async () => ({
      uptime: Math.round(process.uptime()),
      voice: client.guilds.cache.map((guild) => ({
        guild: guild.name,
        bot: guild.members.me?.voice.channel?.name ?? null,
      })),
      players: allPlayers().map((player) => ({
        guild: player.guild.name,
        current: player.current ? `${player.current.artist} - ${player.current.title}` : null,
        position: Math.round(player.position()),
        queue: player.queue.length,
        blind: player.blind,
        backend: player.backend?.name ?? null,
        voiceChannel: player.guild.channels.cache.get(player.botVoiceChannelId)?.name ?? null,
      })),
      nodes: lavalink.status(),
      nodeLog: lavalink.logs?.slice(-25) ?? [],
      blindtests: blindTestState(),
    }),

    // Partie de test dans un salon précis (ex : { action: 'start', textChannelId, voiceChannelId, theme, rounds, difficulty })
    'POST /admin/blindtest': async (url, body) => {
      const guild = guildOf(body.guildId);
      if (body.action === 'stop') return { stopped: stopBlindTest(guild.id) };
      // Envoie le vrai menu de réglages dans un salon (vérifie que Discord l'accepte)
      if (body.action === 'menu') {
        const replies = [];
        const fake = { guildId: guild.id, guild, channelId: body.textChannelId, user: { id: body.userId ?? config.ownerId }, member: { displayName: 'test admin' }, reply: async (p) => replies.push(p.content), followUp: async (p) => replies.push(p.content) };
        await openBlindTestSetup(client, fake, body.settings ?? {}, { channelId: body.textChannelId });
        return { replies };
      }
      if (body.action === 'guess') {
        const channel = await client.channels.fetch(body.textChannelId);
        const handled = handleBlindTestMessage({
          guildId: guild.id,
          channelId: body.textChannelId,
          content: String(body.text ?? ''),
          author: { id: body.userId ?? client.user.id },
          react: async () => {},
          reply: (payload) => channel.send(payload),
        });
        return { handled, state: blindTestState() };
      }
      if (body.action === 'start') {
        const voiceChannel = guild.channels.cache.get(body.voiceChannelId);
        if (!voiceChannel) throw new Error('salon vocal introuvable');
        await startGame(client, {
          guild,
          channelId: body.textChannelId,
          voiceChannel,
          hostId: body.userId ?? client.user.id,
          settings: { theme: body.theme ?? 'moment', customTheme: body.customTheme ?? '', mode: body.mode ?? 'classique', difficulty: body.difficulty ?? 'normal', rounds: body.rounds ?? 3 },
          allowEmptyVoice: true,
        });
        return { state: blindTestState() };
      }
      throw new Error('action inconnue (start, guess, stop)');
    },
  };
}
