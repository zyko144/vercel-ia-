// Freestyle Battle : le bot lance une instru dans Dictature, deux personnes rappent chacune leur tour,
// l'IA vocale enregistre, puis l'IA note les rimes, les punchlines et le flow et désigne le gagnant.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { chat } from '../ai/gemini.js';
import { config } from '../config.js';
import { lockedChannel } from '../features/voice.js';
import { blindTestActive } from '../music/blindtest.js';
import { lavalink } from '../music/lavalink.js';
import { getOrCreatePlayer } from '../music/player.js';
import { load, save } from '../storage.js';
import { borrowVoiceAi, createNarrator, recordVoice, toWav, voiceAiFree } from '../voice-ai/assistant.js';
import { MEDALS, PRIVATE, pick, rulesLink, shortId, sleep } from './common.js';

const KEY = 'jeu-freestyle';
const ACCEPT_MS = 60_000;
const BEAT_VOLUME = 55; // l'instru reste en fond : on doit entendre le rappeur
const battles = new Map(); // id -> battle
let running = null; // une seule battle à la fois (une seule IA vocale)

export const BEAT_STYLES = {
  trap: { label: 'Trap', emoji: '🔥', query: 'hard trap type beat instrumental freestyle' },
  drill: { label: 'Drill', emoji: '🔪', query: 'uk drill type beat instrumental freestyle' },
  boombap: { label: 'Boom bap', emoji: '🥁', query: 'boom bap type beat instrumental old school freestyle' },
  afro: { label: 'Afro', emoji: '🌴', query: 'afro type beat instrumental freestyle' },
  melo: { label: 'Mélo', emoji: '🌙', query: 'melodic sad type beat instrumental freestyle' },
};

const SCHEMA = {
  type: 'object',
  properties: {
    rappeurs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          lettre: { type: 'string' },
          compris: { type: 'string' },
          rimes: { type: 'number' },
          punchlines: { type: 'number' },
          flow: { type: 'number' },
          originalite: { type: 'number' },
          meilleure_phrase: { type: 'string' },
          commentaire: { type: 'string' },
        },
        required: ['lettre', 'compris', 'rimes', 'punchlines', 'flow', 'originalite', 'commentaire'],
      },
    },
    gagnant: { type: 'string', enum: ['A', 'B', 'egalite'] },
    verdict: { type: 'string' },
  },
  required: ['rappeurs', 'gagnant', 'verdict'],
};

const name = (guild, id) => guild.members.cache.get(id)?.displayName ?? guild.client.users.cache.get(id)?.username ?? 'Rappeur';

/** /jeu-freestyle : défi lancé à quelqu'un, qui doit accepter. */
export async function startFreestyle(interaction, { opponent, style = 'trap', seconds = 45 }) {
  const { guild } = interaction;
  const home = lockedChannel(guild) ?? guild.channels.cache.get(config.voice.channelId);
  if (!home) return interaction.reply({ content: '😕 Je trouve pas le vocal de la musique.', ...PRIVATE });
  if (!opponent || opponent.bot || opponent.id === interaction.user.id) return interaction.reply({ content: 'Choisis un vrai adversaire (pas toi, pas un bot) 😅', ...PRIVATE });
  if (running) return interaction.reply({ content: '🎤 Une battle est déjà en cours, attends la fin !', ...PRIVATE });
  if (blindTestActive(guild.id)) return interaction.reply({ content: '🎧 Un blind test utilise la musique en ce moment, attends la fin.', ...PRIVATE });
  const free = voiceAiFree();
  if (!free.ok) return interaction.reply({ content: `🎙️ Impossible pour l'instant : ${free.why}.`, ...PRIVATE });

  const battle = {
    id: shortId(), guild, channel: interaction.channel, home, style, seconds,
    a: interaction.user.id, b: opponent.id,
  };
  battles.set(battle.id, battle);
  const beat = BEAT_STYLES[style] ?? BEAT_STYLES.trap;
  await interaction.reply({
    content: `<@${battle.b}>`,
    embeds: [new EmbedBuilder().setColor(0xe67e22).setAuthor({ name: '🎤 FREESTYLE BATTLE' })
      .setTitle(`${name(guild, battle.a)} te défie en freestyle !`)
      .setDescription([
        `${beat.emoji} Instru **${beat.label}** · **${seconds} s** chacun, l'un après l'autre.`,
        `🔊 Ça se passe dans <#${home.id}> : rejoignez-le tous les deux, l'IA vous écoute et note **rimes, punchlines, flow et originalité**.`,
        `<@${battle.b}>, t'acceptes ? Réponse <t:${Math.ceil((Date.now() + ACCEPT_MS) / 1000)}:R>.`,
        rulesLink('freestyle'),
      ].filter(Boolean).join('\n'))],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`g:fs:${battle.id}:ok`).setLabel("J'accepte").setEmoji('🎤').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`g:fs:${battle.id}:no`).setLabel('Refuser').setStyle(ButtonStyle.Secondary),
    )],
    allowedMentions: { users: [battle.b] },
  });
  battle.message = await interaction.fetchReply().catch(() => null);
  battle.expire = setTimeout(() => {
    if (!battles.has(battle.id)) return;
    battles.delete(battle.id);
    battle.message?.edit({ components: [], content: `⏱️ <@${battle.b}> a pas répondu, battle annulée.` }).catch(() => {});
  }, ACCEPT_MS);
  return undefined;
}

export async function handleFreestyleButton(interaction) {
  const [, , id, action] = interaction.customId.split(':');
  const battle = battles.get(id);
  if (!battle) return interaction.reply({ content: 'Ce défi a expiré.', ...PRIVATE });
  if (interaction.user.id !== battle.b) return interaction.reply({ content: `C'est à <@${battle.b}> de répondre 😉`, ...PRIVATE });
  clearTimeout(battle.expire);
  battles.delete(battle.id);
  if (action === 'no') {
    return interaction.update({ components: [], content: `🐔 <@${battle.b}> a refusé le défi de <@${battle.a}>.`, allowedMentions: { parse: [] } });
  }
  // Les deux rappeurs doivent être dans le vocal
  const inVoice = (userId) => battle.home.members.has(userId);
  const missing = [battle.a, battle.b].filter((userId) => !inVoice(userId));
  if (missing.length) {
    battles.set(battle.id, battle);
    return interaction.reply({ content: `🎧 ${missing.map((u) => `<@${u}>`).join(' et ')} ${missing.length > 1 ? 'doivent' : 'doit'} d'abord rejoindre <#${battle.home.id}>, puis réappuyer sur **J'accepte**.`, ...PRIVATE });
  }
  if (running) return interaction.reply({ content: '🎤 Une battle est déjà en cours.', ...PRIVATE });
  await interaction.update({ components: [], content: `🔥 <@${battle.b}> relève le défi ! Direction <#${battle.home.id}>.`, allowedMentions: { parse: [] } });
  running = battle;
  runBattle(battle)
    .catch(async (err) => {
      console.warn('[freestyle] battle :', err.message);
      await battle.channel.send({ content: `❌ La battle a planté (${err.message}). Réessayez dans un instant.`, allowedMentions: { parse: [] } }).catch(() => {});
    })
    .finally(() => { running = null; });
  return undefined;
}

/** Une instru qui dure assez longtemps pour les deux passages. */
async function findBeat(style, seconds) {
  const beat = BEAT_STYLES[style] ?? BEAT_STYLES.trap;
  for (const prefix of ['ytsearch', 'scsearch']) {
    const found = await lavalink.loadAny(`${prefix}:${beat.query}`).catch(() => null);
    const items = found?.result?.loadType === 'search' ? found.result.data : [];
    const good = items.filter((item) => !item.info.isStream && item.info.length / 1000 >= seconds + 20 && item.info.length / 1000 <= 420
      && !/\b(slowed|sped|8d|reverb|1 hour|hour|mix|compilation)\b/i.test(item.info.title));
    if (good.length) {
      const item = pick(good.slice(0, 6));
      return { title: item.info.title, artist: item.info.author, duration: Math.round(item.info.length / 1000), url: item.info.uri, playUrl: item.info.uri, source: 'youtube', requestedBy: 'freestyle', thumbnail: item.info.artworkUrl ?? null };
    }
  }
  return null;
}

/** Lance l'instru et attend qu'elle sorte vraiment dans le vocal. */
async function playBeat(player, beat) {
  beat.seekTo = 0;
  await player.playNow({ ...beat });
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const state = await player.backend?.fetchState?.().catch(() => null);
    if ((state?.state?.position ?? 0) > 400) return true;
    await sleep(300);
  }
  return Boolean(player.current);
}

async function runBattle(battle) {
  const { guild, channel, home } = battle;
  const release = await borrowVoiceAi('freestyle battle', { channelId: home.id, listen: true });
  const narrator = createNarrator({ voice: 'Fenrir', style: "Tu es l'animateur survolté d'une battle de freestyle rap entre potes." });
  const player = getOrCreatePlayer(guild.client, guild);
  const previous = { volume: player.volume, blind: player.blind };
  try {
    const beat = await findBeat(battle.style, battle.seconds);
    if (!beat) throw new Error("pas trouvé d'instru, les serveurs audio font la tête");
    player.queue = [];
    player.loop = 'off';
    player.autoplay = false;
    player.filters = [];
    player.blind = true;
    player.volume = BEAT_VOLUME;
    await player.connect(home, { force: true });

    // Pile ou face pour savoir qui commence
    const order = Math.random() < 0.5 ? [battle.a, battle.b] : [battle.b, battle.a];
    await channel.send({
      embeds: [new EmbedBuilder().setColor(0xe67e22).setAuthor({ name: '🎤 FREESTYLE BATTLE' })
        .setTitle(`${name(guild, battle.a)} 🆚 ${name(guild, battle.b)}`)
        .setDescription(`🪙 Pile ou face : <@${order[0]}> ouvre le bal.\n🎹 Instru : **${beat.title}**\n⏱️ **${battle.seconds} s** chacun. Micros ouverts dans <#${home.id}>, les autres en silence 🤫`)],
      allowedMentions: { parse: [] },
    }).catch(() => {});
    await narrator.say(`Bienvenue dans la battle ! ${name(guild, order[0])} contre ${name(guild, order[1])}. ${name(guild, order[0])}, c'est toi qui commences. Trois, deux, un, envoie !`);

    const takes = [];
    for (const [i, userId] of order.entries()) {
      if (i === 1) {
        await channel.send({ content: `🔁 À <@${userId}> maintenant !`, allowedMentions: { users: [userId] } }).catch(() => {});
        await narrator.say(`Merci ! Au tour de ${name(guild, userId)}. Trois, deux, un, envoie !`);
      }
      const ok = await playBeat(player, beat);
      if (!ok) throw new Error("l'instru ne se lance pas");
      const live = await channel.send({ content: `🔴 <@${userId}> rappe… fin <t:${Math.ceil((Date.now() + battle.seconds * 1000) / 1000)}:R>`, allowedMentions: { users: [userId] } }).catch(() => null);
      const take = await recordVoice(userId, battle.seconds * 1000);
      takes.push({ userId, ...take });
      // Pause (pas d'arrêt : le lecteur reste prêt pour le passage suivant)
      if (player.current && !player.paused) player.togglePause();
      live?.edit({ content: `✅ <@${userId}> a fini (${Math.round(take.spokenMs / 1000)} s de voix captée).`, allowedMentions: { parse: [] } }).catch(() => {});
      console.log(`[freestyle] ${name(guild, userId)} : ${Math.round(take.spokenMs / 1000)} s de voix`);
    }

    const thinking = await channel.send({ content: '⚖️ Le jury délibère…' }).catch(() => null);
    narrator.say('Les deux ont posé. Le jury délibère…').catch(() => {});
    const verdict = await judge(guild, takes);
    thinking?.delete().catch(() => {});
    const winnerId = verdict.gagnant === 'A' ? takes[0].userId : verdict.gagnant === 'B' ? takes[1].userId : null;
    const board = await recordWin(winnerId, takes.map((t) => t.userId));
    await channel.send(verdictPayload(guild, takes, verdict, winnerId, board)).catch(() => {});
    await narrator.say(`${verdict.verdict} ${winnerId ? `Victoire de ${name(guild, winnerId)} !` : 'Égalité parfaite !'}`);
  } finally {
    narrator.close();
    player.volume = previous.volume;
    player.blind = previous.blind;
    if (player.current) await Promise.resolve(player.stop()).catch(() => {});
    await release();
  }
}

/** L'IA écoute les deux passages et note. */
async function judge(guild, takes) {
  const letters = ['A', 'B'];
  const content = [{
    type: 'text',
    text: `Voici une battle de freestyle rap entre deux amis. Écoute les deux passages (A puis B), sur la même instru.
Pour chacun : ce que tu as compris (quelques vers), des notes de 0 à 10 pour les rimes, les punchlines, le flow (placement sur le rythme) et l'originalité, sa meilleure phrase, et un commentaire de 1 à 2 phrases style juge de battle, taquin mais jamais méchant ni insultant.
Si un passage est vide, inaudible ou que la personne n'a presque rien dit, mets des notes très basses et dis-le.
Puis désigne le gagnant (A, B ou egalite) et écris un verdict final de 2 phrases maximum, à lire à voix haute.`,
  }];
  takes.forEach((take, i) => {
    content.push({ type: 'text', text: `Passage ${letters[i]} : ${name(guild, take.userId)} (${Math.round(take.spokenMs / 1000)} s de voix détectée)` });
    content.push({ type: 'audio', mime_type: 'audio/wav', data: toWav(take.pcm).toString('base64') });
  });
  const { text } = await chat({
    content,
    system: 'Tu es un juge de battle de rap français, expert et drôle. Tu réponds uniquement en JSON.',
    web: false,
    thinking: 'low',
    exactThinking: true,
    responseFormat: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
  });
  const data = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  // Personne n'a rien dit : égalité, sans laisser l'IA inventer
  const silent = takes.map((take) => take.spokenMs < 3_000);
  if (silent.every(Boolean)) data.gagnant = 'egalite';
  else if (silent[0]) data.gagnant = 'B';
  else if (silent[1]) data.gagnant = 'A';
  return data;
}

async function recordWin(winnerId, players) {
  const data = await load(KEY, { wins: {}, battles: {} });
  data.wins ??= {};
  data.battles ??= {};
  for (const id of players) data.battles[id] = (data.battles[id] ?? 0) + 1;
  if (winnerId) data.wins[winnerId] = (data.wins[winnerId] ?? 0) + 1;
  save(KEY, data);
  return Object.entries(data.wins).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, wins], i) => `${MEDALS[i] ?? `\`${i + 1}.\``} <@${id}> · **${wins}** victoire${wins > 1 ? 's' : ''} sur ${data.battles[id] ?? wins}`).join('\n');
}

function verdictPayload(guild, takes, verdict, winnerId, board) {
  const score = (r) => Math.round(((Number(r.rimes) || 0) + (Number(r.punchlines) || 0) + (Number(r.flow) || 0) + (Number(r.originalite) || 0)) * 2.5);
  const embed = new EmbedBuilder()
    .setColor(winnerId ? 0xfee75c : 0x95a5a6)
    .setAuthor({ name: '🎤 FREESTYLE BATTLE · VERDICT' })
    .setTitle(winnerId ? `🏆 ${name(guild, winnerId)} remporte la battle !` : '🤝 Égalité parfaite')
    .setDescription(`> ${verdict.verdict}`);
  takes.forEach((take, i) => {
    const r = verdict.rappeurs?.find((x) => x.lettre === ['A', 'B'][i]) ?? verdict.rappeurs?.[i] ?? {};
    embed.addFields({
      name: `${take.userId === winnerId ? '👑 ' : ''}${name(guild, take.userId)} · ${score(r)}/100`,
      value: [
        `🎯 Rimes **${r.rimes ?? 0}**/10 · 💥 Punchlines **${r.punchlines ?? 0}**/10 · 🌊 Flow **${r.flow ?? 0}**/10 · ✨ Originalité **${r.originalite ?? 0}**/10`,
        r.meilleure_phrase ? `💬 « ${String(r.meilleure_phrase).slice(0, 200)} »` : null,
        r.commentaire ? `🧑‍⚖️ ${String(r.commentaire).slice(0, 300)}` : null,
      ].filter(Boolean).join('\n').slice(0, 1024),
    });
  });
  if (board) embed.addFields({ name: '🏆 Classement des battles', value: board });
  return {
    content: takes.map((t) => `<@${t.userId}>`).join(' 🆚 '),
    embeds: [embed],
    allowedMentions: { users: takes.map((t) => t.userId) },
  };
}
