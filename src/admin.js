// API d'admin (protégée par la clé dérivée du token) : lire les logs, voir l'état du bot, tester le blind test.
import { lavalink } from './music/lavalink.js';
import { allPlayers } from './music/player.js';
import { config } from './config.js';
import { FFMPEG_PATH } from './music/binaries.js';
import { bilanPayload } from './features/tribunal.js';
import { ffmpegStartupCost, lastTimings } from './features/tribunalgif.js';
import { blindTestState, handleBlindTestMessage, openBlindTestSetup, startGame, stopBlindTest } from './music/blindtest.js';
import { recentLogs } from './utils/logbuffer.js';
import { startVoiceSession, stopVoiceSession, voiceAssistantState } from './voice-ai/assistant.js';
import { randomBytes } from 'node:crypto';
import { EndSensitivity, GoogleGenAI, Modality, StartSensitivity } from '@google/genai';
import { getOrCreatePlayer } from './music/player.js';

// Fichiers audio de test (question parlée) servis quelques minutes au serveur audio
const testAudio = new Map(); // id -> { buffer, at }
const TEST_AUDIO_TTL_MS = 10 * 60_000;

/** Fichier audio de test demandé par le serveur audio (public, identifiant aléatoire, expire vite). */
export function testAudioFile(pathname) {
  const id = pathname.match(/^\/voice-test\/([a-f0-9]{32})\.wav$/)?.[1];
  const entry = id && testAudio.get(id);
  if (!entry || Date.now() - entry.at > TEST_AUDIO_TTL_MS) return null;
  return entry.buffer;
}

async function liveSelfTest({ text, wavBase64, model, gapMs = 0 }) {
  const ai = new GoogleGenAI({ apiKey: config.geminiKey });
  const wav = wavBase64 ? Buffer.from(wavBase64, 'base64') : await speechWav(text);
  const rate = wav.readUInt32LE(24);
  const data = wav.subarray(wav.indexOf(Buffer.from('data')) + 8);
  const count = Math.floor((data.length / 2) * 16_000 / rate);
  const pcm = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) pcm.writeInt16LE(data.readInt16LE(Math.min(data.length / 2 - 1, Math.floor(i * rate / 16_000)) * 2), i * 2);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const result = { model, speechSeconds: Math.round(count / 1600) / 10 };
  let firstHeard = null;
  let firstAudio = null;
  let heard = '';
  let done;
  const t0 = Date.now();
  const live = await ai.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: 'Réponds en français en une phrase.',
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 400, prefixPaddingMs: 100, endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH, startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH } },
      thinkingConfig: { thinkingBudget: 0 },
    },
    callbacks: {
      onmessage: (message) => {
        if (message.serverContent?.inputTranscription?.text) {
          firstHeard ??= Date.now();
          heard += message.serverContent.inputTranscription.text;
        }
        for (const part of message.serverContent?.modelTurn?.parts ?? []) if (part.inlineData) firstAudio ??= Date.now();
        if (message.serverContent?.turnComplete) done?.();
      },
    },
  });
  result.connectMs = Date.now() - t0;
  if (gapMs) await sleep(gapMs);
  const finished = new Promise((resolve) => { done = resolve; });
  for (let i = 0; i < pcm.length; i += 3_200) {
    live.sendRealtimeInput({ audio: { data: pcm.subarray(i, i + 3_200).toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
    await sleep(100);
  }
  const speechEnd = Date.now();
  for (let i = 0; i < 15; i++) {
    live.sendRealtimeInput({ audio: { data: Buffer.alloc(3_200).toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
    await sleep(100);
  }
  live.sendRealtimeInput({ audioStreamEnd: true });
  await Promise.race([finished, sleep(30_000)]);
  live.close();
  return { ...result, heard: heard.trim(), transcriptionMs: firstHeard ? firstHeard - speechEnd : null, answerMs: firstAudio ? firstAudio - speechEnd : null };
}

async function speechWav(text) {
  const ai = new GoogleGenAI({ apiKey: config.geminiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-tts-preview',
    contents: [{ role: 'user', parts: [{ text }] }],
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
  });
  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error('pas de voix générée');
  const pcm = Buffer.from(part.inlineData.data, 'base64');
  const rate = Number(part.inlineData.mimeType.match(/rate=(\d+)/)?.[1] ?? 24000);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function adminRoutes(client) {
  const guildOf = (id) => client.guilds.cache.get(id) ?? client.guilds.cache.first();

  return {
    'GET /admin/logs': async (url) => recentLogs({
      count: Number(url.searchParams.get('n') ?? 300),
      grep: url.searchParams.get('grep') ?? '',
    }),

    'GET /admin/state': async () => {
      // Ce que le serveur audio joue vraiment (pour vérifier qu'il n'y a pas de décalage avec le jeu)
      const playing = {};
      for (const player of allPlayers()) {
        const state = await player.backend?.fetchState?.().catch(() => null);
        if (state?.track) playing[player.guild.id] = { title: `${state.track.info.author} - ${state.track.info.title}`, ping: state.state.ping, position: Math.round(state.state.position / 1000), connected: state.state.connected, paused: state.paused, volume: state.volume, filters: Object.keys(state.filters ?? {}).filter((key) => key !== 'pluginFilters' || Object.keys(state.filters.pluginFilters ?? {}).length) };
      }
      return {
      uptime: Math.round(process.uptime()),
      ownerId: config.ownerId,
      voiceAiUsers: config.voiceAi.allowedUsers,
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
        filters: player.filters,
        node: player.backend?.node?.name ?? null,
        backend: player.backend?.name ?? null,
        voiceChannel: player.guild.channels.cache.get(player.botVoiceChannelId)?.name ?? null,
      })),
      nodes: lavalink.status(),
      nodeLog: lavalink.logs?.slice(-25) ?? [],
      blindtests: blindTestState(),
      voiceAi: voiceAssistantState(),
      playing,
    };
    },

    // Partie de test dans un salon précis (ex : { action: 'start', textChannelId, voiceChannelId, theme, rounds, difficulty })
    // Test de l'IA vocale : { action: 'start', userId } pour écouter quelqu'un (le bot principal pour un test), 'stop'
    'POST /admin/vocal': async (url, body) => {
      const guild = guildOf(body.guildId);
      if (body.action === 'stop') return { stopped: await stopVoiceSession() };
      if (body.action === 'start') return startVoiceSession({ guildId: guild.id, userId: body.userId ?? client.user.id, userName: body.userName ?? 'test', memberChannelId: null, force: true });
      // Fait parler le bot principal (synthèse vocale du serveur audio) : sert de « personne » pour tester
      if (body.action === 'selftest') {
        return liveSelfTest({ text: String(body.text ?? 'Salut, quelle est la capitale du Japon ?'), wavBase64: body.wav, model: body.model ?? config.voiceAi.model, gapMs: Number(body.gapMs ?? 0) });
      }
      if (body.action === 'say') {
        const id = randomBytes(16).toString('hex');
        testAudio.set(id, { buffer: body.wav ? Buffer.from(body.wav, 'base64') : await speechWav(String(body.text ?? '')), at: Date.now() });
        for (const [key, entry] of testAudio) if (Date.now() - entry.at > TEST_AUDIO_TTL_MS) testAudio.delete(key);
        const player = getOrCreatePlayer(client, guild);
        await player.connect(guild.channels.cache.get(config.voice.channelId));
        const track = { title: 'Test IA vocale', artist: null, playUrl: `${config.publicUrl}/voice-test/${id}.wav`, url: null, source: 'web', requestedBy: client.user.id };
        if (player.current) {
          player.add([track], { next: true });
          player.skip();
        } else {
          player.add([track]);
        }
        return { ok: true, url: track.playUrl };
      }
      throw new Error('action inconnue (start, stop, say)');
    },

    'GET /admin/ffmpeg': async () => {
      const { spawnSync } = await import('node:child_process');
      const out = spawnSync(FFMPEG_PATH, ['-hide_banner', '-filters']).stdout?.toString() ?? '';
      const version = spawnSync(FFMPEG_PATH, ['-hide_banner', '-version']).stdout?.toString() ?? '';
      return {
        drawtext: /drawtext/.test(out),
        palettegen: /palettegen/.test(out),
        gif: /gif/.test(version),
        version: version.split('\n')[0],
        configuration: version.split('configuration:')[1]?.slice(0, 400) ?? '',
      };
    },

    'POST /admin/tribunal': async (url, body) => {
      const guild = guildOf(body.guildId);
      if (body.mesure) await ffmpegStartupCost();
      const payload = await bilanPayload(guild);
      if (body.publier) {
        const channel = await client.channels.fetch(config.tribunal.announceChannelId);
        await channel.send(payload);
      }
      const fichier = payload.files[0];
      return {
        ok: true,
        fichier: fichier.name,
        gifKo: Math.round(fichier.attachment.length / 1024),
        temps: lastTimings,
        contenu: payload.content,
        base64: body.renvoie ? fichier.attachment.toString('base64') : undefined,
      };
    },

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
