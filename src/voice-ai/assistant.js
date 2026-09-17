// IA vocale : un 2e bot (« IA Vocal Vercel ») reste 24h/24 dans le vocal du bot.
// Avec /vocal, il écoute la personne et lui répond à voix haute en direct (Gemini Live),
// et peut piloter la musique du bot principal. Il ne va dans aucun autre salon.
import { PassThrough, Readable } from 'node:stream';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  generateDependencyReport,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { EndSensitivity, GoogleGenAI, Modality, StartSensitivity, Type } from '@google/genai';
import { ActivityType, Client, EmbedBuilder, Events, GatewayIntentBits } from 'discord.js';
import prism from 'prism-media';
import { config } from '../config.js';
import { blindTestActive } from '../music/blindtest.js';
import { getOrCreatePlayer, getPlayer } from '../music/player.js';
import { resolveQuery } from '../music/sources.js';
import { truncate } from '../utils/discord.js';

const GROUP = 'ia-vocale'; // connexion vocale séparée de celle du bot principal
const CHECK_EVERY_MS = 20_000;
const SEND_CHUNK_BYTES = 3_200; // 100 ms de voix à 16 kHz mono
const SILENCE_AFTER_SPEECH_MS = 1_500; // silence envoyé quand la personne se tait (Discord n'envoie plus rien)
const DUCK_VOLUME = 25; // musique baissée pendant que l'IA parle
const MAX_RECONNECTS = 3;
const PRIME_FRAMES = 25; // 0,5 s de silence émis pour que Discord commence à nous envoyer la voix des autres

const ai = new GoogleGenAI({ apiKey: config.geminiKey });
const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
const load = { cpu: 0, lastUsage: process.cpuUsage(), lastAt: Date.now() };
setInterval(() => {
  const usage = process.cpuUsage(load.lastUsage);
  const elapsed = Date.now() - load.lastAt;
  load.cpu = Math.round(((usage.user + usage.system) / 1000 / elapsed) * 100);
  load.lastUsage = process.cpuUsage();
  load.lastAt = Date.now();
}, 5_000).unref();
const state = { client: null, mainClient: null, player: null, session: null, checker: null };

// ===================== Conversion audio =====================

/** Voix de Gemini (24 kHz mono) -> 48 kHz stéréo pour Discord (interpolation entre deux échantillons). */
function toDiscord(pcm, previous) {
  const samples = Math.floor(pcm.length / 2);
  const out = Buffer.alloc(samples * 8);
  let last = previous;
  for (let i = 0; i < samples; i++) {
    const current = pcm.readInt16LE(i * 2);
    const middle = (last + current) >> 1;
    const o = i * 8;
    out.writeInt16LE(middle, o);
    out.writeInt16LE(middle, o + 2);
    out.writeInt16LE(current, o + 4);
    out.writeInt16LE(current, o + 6);
    last = current;
  }
  return { out, last };
}

// ===================== Bot vocal =====================

/** Émet un court silence : sans ça, Discord n'envoie jamais la voix des autres au bot. */
function primeReceive() {
  if (!state.player || state.session?.speaking) return;
  state.player.play(createAudioResource(Readable.from([Buffer.alloc(3_840 * PRIME_FRAMES)]), { inputType: StreamType.Raw }));
}

function homeGuildChannel() {
  const channel = state.client?.channels.cache.get(config.voice.channelId);
  return channel?.isVoiceBased?.() ? channel : null;
}

function connection() {
  const channel = homeGuildChannel();
  return channel ? getVoiceConnection(channel.guild.id, GROUP) : undefined;
}

/** Le bot vocal reste dans son salon (sourdine quand personne ne lui parle). */
function ensureInVoice() {
  const channel = homeGuildChannel();
  if (!channel) return;
  const existing = getVoiceConnection(channel.guild.id, GROUP);
  const alive = existing && ![VoiceConnectionStatus.Destroyed, VoiceConnectionStatus.Disconnected].includes(existing.state.status);
  if (alive && existing.joinConfig.channelId === channel.id) return;
  existing?.destroy();

  const conn = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    group: GROUP,
    selfDeaf: !state.session,
    selfMute: false,
  });
  conn.on('error', (err) => console.warn('[vocal] connexion :', err.message));
  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      if (conn.state.status !== VoiceConnectionStatus.Destroyed) conn.destroy();
      setTimeout(ensureInVoice, 3_000);
    }
  });
  conn.subscribe(state.player);
  entersState(conn, VoiceConnectionStatus.Ready, 30_000)
    .then(() => {
      console.log(`[vocal] IA vocale dans #${channel.name} 🎙️`);
      primeReceive();
    })
    .catch(() => {});
}

export async function startVoiceAssistant(mainClient) {
  if (!config.voiceAi.token) {
    console.log('🎙️ IA vocale désactivée : pas de token pour le 2e bot (DISCORD_TOKEN=token1;token2 ou VOICE_BOT_TOKEN)');
    return;
  }
  console.log(`🎙️ IA vocale : token lu dans ${config.voiceAi.tokenSource} · ${generateDependencyReport().split('\n').filter((line) => /opus/i.test(line)).map((line) => line.trim()).join(' ')}`);
  state.mainClient = mainClient;
  state.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: 250 } });
  state.player.on('error', (err) => console.warn('[vocal] lecture :', err.message));
  state.player.on(AudioPlayerStatus.Idle, () => onPlayerIdle());

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  state.client = client;
  client.once(Events.ClientReady, (c) => {
    console.log(`🎙️ IA vocale connectée : ${c.user.tag}`);
    c.user.setPresence({ activities: [{ name: 'custom', type: ActivityType.Custom, state: '🎙️ /vocal pour me parler' }], status: 'online' });
    ensureInVoice();
    state.checker = setInterval(ensureInVoice, CHECK_EVERY_MS);
  });
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    // Déplacé ou éjecté : retour dans son salon
    if (newState.id === client.user.id && newState.channelId !== config.voice.channelId) setTimeout(ensureInVoice, 2_000);
    // La personne quitte le salon : fin de la conversation
    const session = state.session;
    if (session && newState.id === session.userId && newState.channelId !== session.channelId) {
      stopSession('tu as quitté le vocal').catch(() => {});
    }
  });
  client.on(Events.Error, (err) => console.warn('[vocal] discord :', err.message));
  await client.login(config.voiceAi.token).catch((err) => console.error('❌ IA vocale : connexion impossible :', err.message));
}

export function voiceAssistantState() {
  const conn = connection();
  const s = state.session;
  return {
    enabled: Boolean(config.voiceAi.token),
    tokenSource: config.voiceAi.tokenSource,
    bot: state.client?.user?.tag ?? null,
    voice: conn?.state.status ?? 'déconnecté',
    model: config.voiceAi.model,
    load: { cpu: `${load.cpu} %`, loopDelayMs: Math.round(loopDelay.mean / 1e6), loopDelayMaxMs: Math.round(loopDelay.max / 1e6) },
    session: s ? { userId: s.userId, since: Math.round((Date.now() - s.startedAt) / 1000), speaking: s.speaking, turns: s.turns, stats: s.stats } : null,
  };
}

// ===================== Conversation =====================

function systemPrompt(session) {
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  return [
    `Tu es « IA Vocal Vercel », l'assistante vocale du serveur Discord DDV. Tu parles en direct avec ${session.userName} dans le salon vocal.`,
    'Réponds TOUJOURS en français, à l\'oral : phrases courtes et naturelles, une à trois phrases, sans liste, sans émoji, sans markdown.',
    'Style jeune et détendu, tutoiement, quelques expressions courantes mais sans en faire trop.',
    'Si tu ne sais pas quelque chose, dis-le franchement au lieu d\'inventer.',
    'Tu peux piloter la musique du serveur avec tes outils (lancer un son, pause, reprendre, passer, arrêter, volume, dire ce qui joue). Utilise-les dès qu\'on te le demande puis confirme en une phrase courte.',
    'Corrige l\'orthographe des artistes de rap français quand tu cherches un son (Jul, Ninho, PNL, Werenoi, Tiakola, Gazo, SDM, Damso...).',
    'Si la personne dit au revoir ou qu\'elle a fini, réponds brièvement puis appelle l\'outil terminer_conversation.',
    `Nous sommes le ${date}.`,
  ].join('\n');
}

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'jouer_musique',
      description: 'Lance un son, un artiste ou une playlist dans le vocal (ajouté à la file si de la musique joue déjà).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          recherche: { type: Type.STRING, description: 'Titre et/ou artiste, ou lien' },
          maintenant: { type: Type.BOOLEAN, description: 'true pour le jouer tout de suite au lieu de l\'ajouter à la file' },
        },
        required: ['recherche'],
      },
    },
    { name: 'pause_musique', description: 'Met la musique en pause' },
    { name: 'reprendre_musique', description: 'Reprend la musique en pause' },
    { name: 'passer_musique', description: 'Passe au son suivant' },
    { name: 'arreter_musique', description: 'Arrête la musique et vide la file' },
    { name: 'son_en_cours', description: 'Donne le son en cours et le suivant' },
    {
      name: 'volume_musique',
      description: 'Change le volume de la musique',
      parameters: { type: Type.OBJECT, properties: { niveau: { type: Type.NUMBER, description: 'De 0 à 100' } }, required: ['niveau'] },
    },
    { name: 'terminer_conversation', description: 'Termine la conversation vocale quand la personne a fini' },
  ],
}];

/**
 * Démarre une conversation avec la personne (elle doit être dans le salon du bot).
 * @returns {Promise<{ error?: string, stopped?: boolean, started?: boolean }>}
 */
export async function startVoiceSession({ guildId, userId, userName, memberChannelId, force = false }) {
  if (!state.client?.isReady()) return { error: "🎙️ L'IA vocale est pas connectée pour le moment (token du 2e bot manquant ou invalide)." };
  const channel = homeGuildChannel();
  if (!channel || channel.guild.id !== guildId) return { error: "🎙️ L'IA vocale trouve pas son salon." };
  if (!force && memberChannelId !== channel.id) return { error: `🎧 Rejoins <#${channel.id}> pour parler à l'IA vocale.` };
  if (state.session) {
    if (state.session.userId === userId) {
      await stopSession('arrêtée');
      return { stopped: true };
    }
    return { error: `🎙️ L'IA vocale parle déjà avec <@${state.session.userId}>, attends qu'ils aient fini.` };
  }

  ensureInVoice();
  const conn = connection();
  try {
    await entersState(conn, VoiceConnectionStatus.Ready, 10_000);
  } catch {
    return { error: "🎙️ L'IA vocale arrive pas à se connecter au vocal, réessaie dans quelques secondes." };
  }

  const session = {
    guildId, userId, userName, channelId: channel.id, startedAt: Date.now(), lastActivity: Date.now(),
    live: null, handle: null, closing: false, reconnects: 0, turns: 0,
    carry: Buffer.alloc(0), pending: Buffer.alloc(0), lastPacketAt: 0, silenceSent: 0, streamEnded: true,
    output: null, outLast: 0, speaking: false, turnAudioAt: null, speechEndAt: null,
    heard: '', said: '', actions: [], endAfterTurn: false, ducked: false, opus: null, decoder: null, ticker: null,
    stats: { packets: 0, chunks: 0, messages: 0, audioParts: 0 },
  };
  state.session = session;

  try {
    await connectLive(session);
  } catch (err) {
    state.session = null;
    console.warn('[vocal] Gemini Live :', err.message);
    return { error: `🎙️ L'IA vocale est indispo (${truncate(err.message, 120)}).` };
  }

  // On ne se met plus en sourdine : il faut entendre la personne
  conn.rejoin({ ...conn.joinConfig, selfDeaf: false, selfMute: false });
  primeReceive();
  listen(session, conn);
  console.log(`[vocal] conversation avec ${userName} (${userId})`);
  return { started: true };
}

export async function stopVoiceSession(userId = null) {
  if (!state.session || (userId && state.session.userId !== userId)) return false;
  await stopSession('arrêtée');
  return true;
}

async function connectLive(session) {
  session.live = await ai.live.connect({
    model: config.voiceAi.model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: systemPrompt(session),
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceAi.voice } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Fin de phrase détectée vite (0,4 s de silence) : réponse sans attendre
      realtimeInputConfig: {
        automaticActivityDetection: {
          silenceDurationMs: 400,
          prefixPaddingMs: 100,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        },
      },
      sessionResumption: session.handle ? { handle: session.handle } : {},
      contextWindowCompression: { slidingWindow: {} },
      thinkingConfig: { thinkingBudget: 0 },
      tools: TOOLS,
    },
    callbacks: {
      onmessage: (message) => onLiveMessage(session, message),
      onerror: (event) => console.warn('[vocal] Gemini :', event?.message ?? event),
      onclose: (event) => onLiveClose(session, event),
    },
  });
}

function onLiveClose(session, event) {
  if (session.closing || state.session !== session) return;
  console.warn(`[vocal] Gemini Live fermé (${event?.code ?? '?'} ${event?.reason ?? ''})`);
  if (session.reconnects >= MAX_RECONNECTS) {
    stopSession(/quota|resource|exhausted|limit/i.test(event?.reason ?? '') ? 'quota gratuit de Gemini atteint, réessaie plus tard' : 'connexion à Gemini perdue').catch(() => {});
    return;
  }
  session.reconnects++;
  // Reprise de la même conversation (Gemini garde le contexte grâce au jeton de reprise)
  setTimeout(() => {
    if (session.closing || state.session !== session) return;
    connectLive(session).then(() => { session.reconnects = 0; }).catch((err) => {
      console.warn('[vocal] reconnexion impossible :', err.message);
      stopSession('connexion à Gemini perdue').catch(() => {});
    });
  }, 300);
}

/** Écoute la personne : sa voix part en direct vers Gemini, par morceaux de 100 ms. */
function listen(session, conn) {
  const opus = conn.receiver.subscribe(session.userId, { end: { behavior: EndBehaviorType.Manual } });
  // Le décodeur Opus sort directement du 16 kHz mono : 6 fois moins de données à traiter
  const decoder = new prism.opus.Decoder({ rate: 16_000, channels: 1, frameSize: 320 });
  session.opus = opus;
  session.decoder = decoder;
  opus.on('error', (err) => console.warn('[vocal] réception :', err.message));
  decoder.on('error', (err) => console.warn('[vocal] décodage :', err.message));
  opus.pipe(decoder);

  decoder.on('data', (pcm) => {
    if (session.closing) return;
    session.stats.packets++;
    const out = pcm;
    session.pending = session.pending.length ? Buffer.concat([session.pending, out]) : out;
    if (!session.burst) session.burst = { at: Date.now(), frames: 0, energy: 0 };
    session.burst.frames++;
    session.burst.energy += rms(out);
    session.lastPacketAt = Date.now();
    session.lastActivity = Date.now();
    session.silenceSent = 0;
    session.streamEnded = false;
    while (session.pending.length >= SEND_CHUNK_BYTES) {
      sendAudio(session, session.pending.subarray(0, SEND_CHUNK_BYTES));
      session.pending = session.pending.subarray(SEND_CHUNK_BYTES);
    }
  });

  // Discord n'envoie rien quand la personne se tait : on envoie du silence comme un vrai micro,
  // pour que Gemini sache tout de suite que la phrase est finie
  session.ticker = setInterval(() => {
    if (session.closing || session.streamEnded || Date.now() - session.lastPacketAt < 120) return;
    if (session.pending.length) {
      sendAudio(session, session.pending);
      session.pending = Buffer.alloc(0);
    }
    if (session.silenceSent === 0) {
      session.speechEndAt = session.lastPacketAt;
      if (session.burst) {
        console.log(`[vocal] voix reçue : ${(session.burst.frames * 0.02).toFixed(1)} s, niveau moyen ${Math.round(session.burst.energy / session.burst.frames)}`);
        session.burst = null;
      }
    }
    if (session.silenceSent < SILENCE_AFTER_SPEECH_MS) {
      sendAudio(session, Buffer.alloc(SEND_CHUNK_BYTES));
      session.silenceSent += 100;
    } else {
      session.live?.sendRealtimeInput({ audioStreamEnd: true });
      session.streamEnded = true;
    }
    // Plus personne ne parle depuis longtemps : fin de la conversation
    if (!session.speaking && Date.now() - session.lastActivity > config.voiceAi.idleSeconds * 1000) {
      stopSession(`${config.voiceAi.idleSeconds} s sans parler`).catch(() => {});
    }
  }, 100);
}

function rms(pcm) {
  let sum = 0;
  const samples = Math.floor(pcm.length / 2);
  for (let i = 0; i < samples; i++) {
    const v = pcm.readInt16LE(i * 2);
    sum += v * v;
  }
  return samples ? Math.round(Math.sqrt(sum / samples)) : 0;
}

function sendAudio(session, chunk) {
  session.stats.chunks++;
  try {
    session.live?.sendRealtimeInput({ audio: { data: chunk.toString('base64'), mimeType: 'audio/pcm;rate=16000' } });
  } catch (err) {
    console.warn('[vocal] envoi :', err.message);
  }
}

async function onLiveMessage(session, message) {
  if (session.closing) return;
  session.stats.messages++;
  if (message.sessionResumptionUpdate?.newHandle) session.handle = message.sessionResumptionUpdate.newHandle;
  if (message.goAway) console.log(`[vocal] Gemini va couper la connexion (${message.goAway.timeLeft}), reprise automatique`);

  if (message.toolCall?.functionCalls?.length) {
    const responses = [];
    for (const call of message.toolCall.functionCalls) {
      const response = await runTool(session, call).catch((err) => ({ erreur: err.message }));
      console.log(`[vocal] outil ${call.name}(${JSON.stringify(call.args ?? {})}) -> ${JSON.stringify(response)}`);
      responses.push({ id: call.id, name: call.name, response });
    }
    session.live?.sendToolResponse({ functionResponses: responses });
  }

  const content = message.serverContent;
  if (!content) return;
  if (content.inputTranscription?.text) {
    session.heard += content.inputTranscription.text;
    console.log(`[vocal] Gemini entend : « ${content.inputTranscription.text.trim()} »`);
  }
  if (content.outputTranscription?.text) session.said += content.outputTranscription.text;

  for (const part of content.modelTurn?.parts ?? []) {
    if (part.inlineData?.data) {
      session.stats.audioParts++;
      playChunk(session, Buffer.from(part.inlineData.data, 'base64'));
    }
  }

  if (content.interrupted) {
    // La personne reparle pendant que l'IA répond : l'IA se tait tout de suite
    stopSpeaking(session);
  }
  if (content.turnComplete) {
    session.output?.end();
    session.output = null;
    session.turns++;
    postTranscript(session);
    session.lastActivity = Date.now();
    if (!session.speaking && session.endAfterTurn) stopSession('au revoir').catch(() => {});
  }
}

/** Voix de l'IA jouée au fur et à mesure qu'elle arrive (pas d'attente de la réponse complète). */
function playChunk(session, pcm) {
  if (!session.output) {
    session.output = new PassThrough({ highWaterMark: 1 << 22 });
    session.outLast = 0;
    session.speaking = true;
    session.turnAudioAt = Date.now();
    if (session.speechEndAt) console.log(`[vocal] réponse ${session.turnAudioAt - session.speechEndAt} ms après la fin de la phrase`);
    duckMusic(session, true);
    state.player.play(createAudioResource(session.output, { inputType: StreamType.Raw }));
  }
  const { out, last } = toDiscord(pcm, session.outLast);
  session.outLast = last;
  session.output.write(out);
}

function stopSpeaking(session) {
  session.output?.destroy();
  session.output = null;
  state.player.stop(true);
}

function onPlayerIdle() {
  const session = state.session;
  if (!session || !session.speaking) return;
  session.speaking = false;
  session.lastActivity = Date.now();
  duckMusic(session, false);
  if (session.endAfterTurn && !session.output) stopSession('au revoir').catch(() => {});
}

/** Musique baissée pendant que l'IA parle, puis remise au volume d'avant. */
function duckMusic(session, down) {
  const player = getPlayer(session.guildId);
  if (!player?.current || !player.backend?.applyVolume) {
    session.ducked = false;
    return;
  }
  if (down && !session.ducked) {
    session.ducked = true;
    player.backend.applyVolume(Math.min(DUCK_VOLUME, player.volume));
  } else if (!down && session.ducked) {
    session.ducked = false;
    player.backend.applyVolume(player.volume);
  }
}

function postTranscript(session) {
  const heard = session.heard.trim();
  const said = session.said.trim();
  const actions = session.actions;
  session.heard = '';
  session.said = '';
  session.actions = [];
  if (!heard && !said) return;
  const channel = homeGuildChannel();
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(truncate([
      heard ? `🎙️ **${session.userName}** : ${heard}` : null,
      said ? `🤖 **IA** : ${said}` : null,
      ...actions,
    ].filter(Boolean).join('\n'), 4000));
  channel?.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

async function stopSession(reason) {
  const session = state.session;
  if (!session) return;
  session.closing = true;
  state.session = null;
  clearInterval(session.ticker);
  session.opus?.destroy();
  session.decoder?.destroy();
  try {
    session.live?.close();
  } catch {
    // déjà fermé
  }
  stopSpeaking(session);
  duckMusic(session, false);
  const conn = connection();
  if (conn && conn.state.status === VoiceConnectionStatus.Ready) conn.rejoin({ ...conn.joinConfig, selfDeaf: true, selfMute: false });
  console.log(`[vocal] fin de la conversation (${reason})`);
  homeGuildChannel()?.send({
    content: `🎙️ Conversation terminée (${reason}). Relance \`/vocal\` pour me reparler.`,
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

// ===================== Outils (musique) =====================

async function runTool(session, call) {
  const args = call.args ?? {};
  if (call.name === 'terminer_conversation') {
    session.endAfterTurn = true;
    return { resultat: 'la conversation se termine après ta réponse' };
  }

  const guild = state.mainClient?.guilds.cache.get(session.guildId);
  if (!guild) return { erreur: 'serveur introuvable' };
  if (blindTestActive(session.guildId) && call.name !== 'son_en_cours') return { erreur: 'un blind test est en cours, la musique est bloquée' };
  const player = getPlayer(session.guildId);
  const describe = (track) => (track ? `${track.artist ? `${track.artist} - ` : ''}${track.title}` : 'rien');

  switch (call.name) {
    case 'jouer_musique': {
      const result = await resolveQuery(String(args.recherche ?? ''), { requestedBy: session.userId });
      if (!result.tracks.length) return { erreur: 'aucun son trouvé' };
      const target = getOrCreatePlayer(state.mainClient, guild);
      target.textChannelId ??= config.voice.channelId;
      await target.connect(guild.channels.cache.get(config.voice.channelId));
      const tracks = result.isPlaylist ? result.tracks : [result.tracks[0]];
      const wasPlaying = Boolean(target.current);
      if (args.maintenant && wasPlaying) {
        target.add(tracks, { next: true });
        target.skip();
      } else {
        target.add(tracks);
      }
      const label = result.isPlaylist ? `playlist ${result.name ?? ''} (${tracks.length} sons)` : describe(tracks[0]);
      session.actions.push(`🎵 ${wasPlaying && !args.maintenant ? 'Ajouté à la file' : 'Lancé'} : **${label}**`);
      return { resultat: `${wasPlaying && !args.maintenant ? 'ajouté à la file' : 'lancé'} : ${label}` };
    }
    case 'pause_musique':
      if (!player?.current) return { erreur: 'aucune musique en cours' };
      if (!player.paused) player.togglePause();
      session.actions.push('⏸️ Musique en pause');
      return { resultat: 'musique en pause' };
    case 'reprendre_musique':
      if (!player?.current) return { erreur: 'aucune musique en cours' };
      if (player.paused) player.togglePause();
      session.actions.push('▶️ Musique reprise');
      return { resultat: 'musique reprise' };
    case 'passer_musique':
      if (!player?.current) return { erreur: 'aucune musique en cours' };
      player.skip();
      session.actions.push('⏭️ Son passé');
      return { resultat: `son passé, suivant : ${describe(player.queue[0] ?? null)}` };
    case 'arreter_musique':
      if (!player?.current) return { erreur: 'aucune musique en cours' };
      await player.stop();
      session.actions.push('⏹️ Musique arrêtée');
      return { resultat: 'musique arrêtée' };
    case 'son_en_cours':
      return { en_cours: describe(player?.current ?? null), suivant: describe(player?.queue[0] ?? null), en_pause: Boolean(player?.paused) };
    case 'volume_musique': {
      if (!player) return { erreur: 'aucune musique en cours' };
      const volume = player.setVolume(Number(args.niveau));
      if (session.ducked) player.backend?.applyVolume?.(Math.min(DUCK_VOLUME, volume));
      session.actions.push(`🔊 Volume : ${volume} %`);
      return { resultat: `volume à ${volume} %` };
    }
    default:
      return { erreur: 'outil inconnu' };
  }
}
