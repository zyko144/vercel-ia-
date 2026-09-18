// Tribunal des sons : chaque semaine, chaque membre doit déposer un son de lui dans │・sons.
// L'IA vérifie que ce n'est pas un faux (son de quelqu'un d'autre, repost, extrait commercial),
// les deux juges tranchent depuis │・tribunal, et ceux qui n'ont rien rendu deviennent Bouffon du Roi.
import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { chatJson } from '../ai/gemini.js';
import { deezer, matchRatio } from '../music/deezer.js';
import { load, save } from '../storage.js';
import { buildWeekGif } from './tribunalgif.js';
import { truncate } from '../utils/discord.js';

const KEY = 'tribunal';
const WEEK_MS = 7 * 24 * 60 * 60_000;
const COOLDOWN_MS = 3 * 24 * 60 * 60_000; // un dépôt par personne tous les 3 jours
const IMAGE_FILE = 'assets/tribunal.jpg';
const IMAGE_NAME = 'tribunal.jpg';
const IMAGE_URL = `attachment://${IMAGE_NAME}`;
const image = () => new AttachmentBuilder(IMAGE_FILE, { name: IMAGE_NAME });
const AUDIO_LINK = /(youtube\.com|youtu\.be|soundcloud\.com|spotify\.com|deezer\.com|music\.apple\.com|audiomack\.com|drive\.google\.com|dropbox\.com|on\.soundcloud\.com|vocaroo\.com|voca\.ro|fromsmash|wetransfer)/i;
const RELEASED = /(spotify\.com|deezer\.com|music\.apple\.com)/i;

export const isJudge = (userId) => config.tribunal.judges.includes(userId);

const emptyState = () => ({ weekStart: startOfWeek(Date.now()), submissions: {}, history: {} });

/** Lundi 00 h de la semaine d'un instant donné. */
function startOfWeek(at) {
  const date = new Date(at);
  const day = (date.getDay() + 6) % 7; // lundi = 0
  date.setHours(0, 0, 0, 0);
  return date.getTime() - day * 24 * 60 * 60_000;
}

async function state() {
  const saved = await load(KEY, null);
  const current = saved?.weekStart ? saved : emptyState();
  // Nouvelle semaine : on repart de zéro (l'ancienne reste dans l'historique)
  if (Date.now() - current.weekStart >= WEEK_MS) {
    current.history[String(current.weekStart)] = {
      accepted: Object.entries(current.submissions).filter(([, s]) => s.verdict === 'accepté').map(([id]) => id),
    };
    current.history[String(current.weekStart)].week = current.week ?? {};
    current.weekStart = startOfWeek(Date.now());
    current.submissions = {};
    current.week = {};
  }
  current.week ??= {};
  return current;
}

const deadline = (weekStart) => Math.floor((weekStart + WEEK_MS) / 1000);

// ===================== Règlement =====================

export function reglementPayload(guild) {
  const juges = config.tribunal.judges.map((id) => `<@${id}>`).join(' et ');
  const sons = config.tribunal.sonsChannelId ? `<#${config.tribunal.sonsChannelId}>` : '#sons';
  const annonces = config.tribunal.announceChannelId ? `<#${config.tribunal.announceChannelId}>` : null;
  const bouffon = config.tribunal.jesterRoleId ? `<@&${config.tribunal.jesterRoleId}>` : '**Bouffon du Roi**';
  const embed = new EmbedBuilder()
    .setColor(0xc8a24a)
    .setAuthor({ name: '⚖️ TRIBUNAL DES SONS · DÉCRET' })
    .setTitle('Article unique : tout le monde fait un son. Chaque semaine.')
    .setDescription([
      `> *« La démocratie, c'est nous qui la rendons. »*`,
      '',
      `Ici, on n'écoute pas que de la musique : **on en fait**. À partir d'aujourd'hui, **chaque membre du serveur doit déposer un son par semaine** dans ${sons}. Rap, chant, prod, freestyle sérieux : peu importe le style, tant que **c'est toi qui l'as fait**.`,
      '',
      '**📜 Ce qui est demandé**',
      '• **Un son par semaine et par personne.** Pas deux, pas zéro. Un.',
      '• **Sérieux.** Un truc travaillé, pas 10 secondes de bruit pour cocher la case.',
      '• **De toi.** Ta voix, ta prod, ton texte. Une reprise passe si tu la chantes vraiment.',
      '• **45 secondes minimum.** En dessous, c\'est refusé d\'office.',
      '• **Format** : fichier audio ou vidéo déposé ici, ou lien YouTube / SoundCloud / Vocaroo.',
      '',
      '**⏳ Le délai**',
      `• La semaine se termine **<t:${deadline(startOfWeek(Date.now()))}:F>** (<t:${deadline(startOfWeek(Date.now()))}:R>).`,
      '• Le salon est en **mode lent** : un dépôt par personne tous les **3 jours**. Réfléchis avant de poster.',
      '',
      '**🔍 La vérification**',
      `• Dès qu'un son arrive, **l'IA l'analyse** : elle regarde si c'est bien un son perso, si ce n'est pas un morceau déjà sorti, un repost, un extrait piqué ailleurs ou un contournement.`,
      `• Elle transmet son rapport aux juges. **${juges}** tranchent : accepté ou refusé.`,
      '• **Toute tentative de triche** (son de quelqu\'un d\'autre, morceau commercial, repost d\'une semaine passée, fichier trafiqué) est refusée et comptée comme **aucun son rendu**.',
      '',
      '**📊 Le barème, chiffres en main**',
      `• **0 son validé** à la fin de la semaine → ${bouffon}, sans discussion.`,
      '• **1 son validé** → tu es **sauvé** : rien à signaler, tu as fait ton devoir.',
      `• **3 sons validés ou plus** → **bonus**, dont la nature est décidée par ${juges} au cas par cas.`,
      '• Le compte est public : le bilan hebdomadaire affiche la photo, le nom et le nombre exact de sons de chacun.',
      '',
      '**🤡 Les sanctions**',
      `• Pas de son à la fin de la semaine → tu reçois le rôle ${bouffon}, affiché en haut de la liste des membres, jusqu'à ce que tu rendes un son.`,
      '• Le Bouffon est traité comme tel : on ne prend pas son avis au sérieux, il passe après tout le monde, et il assume publiquement son statut.',
      '• Les récidivistes s\'exposent à des mesures que le tribunal jugera utiles, sans avoir à se justifier.',
      '',
      '**👑 Le pouvoir**',
      `• **${juges}** sont les seuls juges. Leur décision est finale, sans appel, sans débat.`,
      '• Personne d\'autre ne peut ouvrir le tribunal, valider un son, ou retirer un rôle.',
      '• Tout le reste du serveur est **égal devant le décret** : tout le monde doit rendre un son, sans exception.',
      '',
      annonces ? `• Les verdicts de fin de semaine sont publiés dans ${annonces}.` : null,
      '',
      '**🎯 En résumé**',
      'Tu fais un son. Tu le déposes ici. Le tribunal vérifie. Tu passes, ou tu portes le chapeau.',
    ].join('\n'))
    .setImage(IMAGE_URL)
    .setFooter({ text: `${guild?.name ?? 'Le serveur'} · décret applicable immédiatement` })
    .setTimestamp();
  return { embeds: [embed], files: [image()], allowedMentions: { parse: [] } };
}

// ===================== Analyse d'un dépôt =====================

const SCHEMA = {
  type: 'object',
  properties: {
    authentique: { type: 'boolean' },
    confiance: { type: 'number' },
    probleme: { type: 'string' },
    resume: { type: 'string' },
  },
  required: ['authentique', 'confiance', 'probleme', 'resume'],
};

/** Titre et auteur d'un lien YouTube / SoundCloud (sans clé d'API). */
async function linkInfo(url) {
  const endpoints = [
    ['youtube', `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`],
    ['soundcloud', `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`],
  ];
  for (const [kind, endpoint] of endpoints) {
    if (kind === 'youtube' && !/youtu/i.test(url)) continue;
    if (kind === 'soundcloud' && !/soundcloud/i.test(url)) continue;
    const data = await fetch(endpoint, { signal: AbortSignal.timeout(8_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (data?.title) return { title: data.title, author: data.author_name ?? '' };
  }
  return null;
}

/** Ce titre correspond-il à un morceau déjà sorti dans le commerce ? */
async function releasedTrack(text) {
  const clean = text.replace(/\.(mp3|wav|m4a|ogg|mp4|mov)$/i, '').replace(/[_-]+/g, ' ').trim();
  if (clean.length < 4) return null;
  const results = await deezer.search(clean, 5).catch(() => []);
  const hit = results.find((track) => matchRatio(clean, `${track.title} ${track.artist?.name ?? ''}`) >= 0.8 && (track.rank ?? 0) > 200_000);
  return hit ? `${hit.artist?.name} - ${hit.title}` : null;
}

async function analyse({ member, message, file, link, info, released, repost }) {
  return chatJson({
    system: "Tu es l'huissier du « tribunal des sons » d'un serveur Discord entre potes. Tu vérifies qu'un son déposé a bien été fait par la personne, sans être parano : un enregistrement amateur, un freestyle au téléphone ou une prod maison sont normaux et authentiques.",
    prompt: `Dépôt à vérifier.

Membre : ${member}
Message : """${message || '(aucun texte)'}"""
${file ? `Fichier : ${file.name} · ${file.contentType ?? 'type inconnu'} · ${Math.round((file.size ?? 0) / 1024)} Ko${file.duration ? ` · ${file.duration} s` : ''}` : ''}
${link ? `Lien : ${link}${info ? ` · titre « ${info.title} » · chaîne « ${info.author} »` : ''}` : ''}
${released ? `⚠️ Un morceau commercial très proche existe : « ${released} »` : ''}
${repost ? `⚠️ Ce fichier ou ce lien a déjà été déposé ici (${repost}).` : ''}

Signaux de triche : morceau connu déjà sorti, chaîne/artiste qui n'est pas la personne, repost, extrait très court, lien vers une playlist ou un album, fichier qui n'est pas de l'audio.
Signaux normaux : petit fichier amateur, titre bricolé, lien YouTube/SoundCloud d'une chaîne au nom de la personne, message qui explique son son.

Réponds : authentique (le son semble fait par la personne), confiance (0 à 1), probleme (le souci en une phrase, vide si tout va bien), resume (une phrase pour les juges).`,
    schema: SCHEMA,
    thinking: 'low',
    exactThinking: true,
  });
}

// ===================== Dépôt dans │・sons =====================

const fileOf = (message) => [...message.attachments.values()].find((a) => /^(audio|video)\//i.test(a.contentType ?? '') || /\.(mp3|wav|m4a|ogg|flac|mp4|mov)$/i.test(a.name ?? ''));
const linkOf = (text) => text.match(/https?:\/\/\S+/g)?.find((url) => AUDIO_LINK.test(url)) ?? null;

/** Message posté dans le salon des sons. Renvoie true si le message a été traité. */
export async function handleSonMessage(client, message) {
  if (message.channelId !== config.tribunal.sonsChannelId || message.author.bot) return false;
  const file = fileOf(message);
  const link = linkOf(message.content ?? '');
  if (!file && !link) {
    // Discussion : on laisse passer, mais on rappelle la règle une fois
    if (/\?|quand|comment/i.test(message.content ?? '')) {
      await message.reply({ content: `⚖️ Ici on dépose **un son de soi** (fichier ou lien). Le règlement est épinglé.`, allowedMentions: { parse: [] } }).catch(() => {});
    }
    return true;
  }

  const data = await state();
  const previous = data.submissions[message.author.id];
  // Un dépôt tous les 3 jours
  if (previous && Date.now() - previous.at < COOLDOWN_MS && previous.verdict !== 'refusé') {
    const when = Math.floor((previous.at + COOLDOWN_MS) / 1000);
    await message.delete().catch(() => {});
    await message.channel.send({
      content: `⏳ <@${message.author.id}> t'as déjà déposé un son. Prochain dépôt possible <t:${when}:R>.`,
      allowedMentions: { users: [message.author.id] },
    }).then((sent) => setTimeout(() => sent.delete().catch(() => {}), 20_000)).catch(() => {});
    return true;
  }

  await message.react('⏳').catch(() => {});
  const key = file ? `${file.name}|${file.size}` : link.toLowerCase();
  const repost = Object.entries(data.submissions).find(([id, s]) => s.key === key && id !== message.author.id)
    ?? Object.values(data.history).flatMap((h) => h.keys ?? []).includes(key);
  const info = link ? await linkInfo(link).catch(() => null) : null;
  const released = await releasedTrack(info?.title ?? file?.name ?? '').catch(() => null);

  let verdictIa = { authentique: true, confiance: 0.4, probleme: '', resume: 'analyse indisponible' };
  try {
    verdictIa = await analyse({
      member: message.member?.displayName ?? message.author.username,
      message: message.content ?? '',
      file,
      link,
      info,
      released,
      repost: repost ? 'déjà déposé' : null,
    });
  } catch (err) {
    console.warn('[tribunal] analyse impossible :', err.message);
  }

  data.week ??= {};
  data.week[message.author.id] = { ...(data.week[message.author.id] ?? { sent: 0, accepted: 0 }) };
  data.week[message.author.id].sent += 1;
  data.submissions[message.author.id] = {
    at: Date.now(),
    messageId: message.id,
    url: message.url,
    key,
    file: file?.name ?? null,
    link: link ?? null,
    verdict: 'en attente',
    ia: verdictIa,
  };
  save(KEY, data);

  await message.reactions.cache.get('⏳')?.users.remove(client.user.id).catch(() => {});
  await message.react('🎤').catch(() => {});
  await sendToTribunal(client, message, { file, link, info, released, repost, ia: verdictIa });
  return true;
}

function verdictLine(ia, released, repost) {
  if (repost) return '🚫 **Repost** : ce son a déjà été déposé.';
  if (released) return `🚫 **Morceau déjà sorti** : très proche de « ${released} ».`;
  if (!ia.authentique) return `❌ **Suspect** : ${ia.probleme || 'ça ne ressemble pas à un son perso'}`;
  if (ia.confiance < 0.5) return `⚠️ **À vérifier à l'oreille** : ${ia.resume}`;
  return `✅ **Semble authentique** : ${ia.resume}`;
}

async function sendToTribunal(client, message, { file, link, info, released, repost, ia }) {
  const channel = client.channels.cache.get(config.tribunal.tribunalChannelId) ?? await client.channels.fetch(config.tribunal.tribunalChannelId).catch(() => null);
  if (!channel?.send) return;
  const embed = new EmbedBuilder()
    .setColor(repost || released || !ia.authentique ? 0xed4245 : 0xfee75c)
    .setAuthor({ name: `${message.member?.displayName ?? message.author.username} a déposé un son`, iconURL: message.author.displayAvatarURL() })
    .setTitle('⚖️ À juger')
    .setDescription([
      `👤 **Qui** : <@${message.author.id}>`,
      `📦 **Quoi** : ${file ? `fichier \`${file.name}\` (${Math.round((file.size ?? 0) / 1024)} Ko)` : `lien ${link}`}`,
      info ? `🎬 **Titre** : ${truncate(info.title, 120)}${info.author ? ` · chaîne **${info.author}**` : ''}` : null,
      `💬 **Message** : ${truncate(message.content || '(rien)', 300)}`,
      '',
      `🔍 **Analyse de l'IA** (confiance ${Math.round((ia.confiance ?? 0) * 100)} %)`,
      verdictLine(ia, released, repost),
      '',
      `[Aller au message](${message.url})`,
    ].filter(Boolean).join('\n'))
    .setFooter({ text: 'Verdict des juges : accepté ou refusé' })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trib:ok:${message.author.id}`).setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`trib:no:${message.author.id}`).setLabel('Refuser').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
  await channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } }).catch(() => {});
}

// ===================== Verdict =====================

export const isTribunalComponent = (interaction) => (interaction.customId ?? '').startsWith('trib:');

export async function handleTribunalComponent(client, interaction) {
  if (!isJudge(interaction.user.id)) {
    return interaction.reply({ content: "⚖️ Seuls les juges peuvent trancher.", flags: 64 });
  }
  const [, action, userId] = interaction.customId.split(':');
  const data = await state();
  const submission = data.submissions[userId];
  if (!submission) return interaction.reply({ content: 'Ce dépôt a expiré (nouvelle semaine).', flags: 64 });

  submission.verdict = action === 'ok' ? 'accepté' : 'refusé';
  submission.judgedBy = interaction.user.id;
  data.totals ??= {};
  data.week ??= {};
  data.week[userId] ??= { sent: 1, accepted: 0 };
  if (action === 'ok' && !submission.counted) {
    data.totals[userId] = (data.totals[userId] ?? 0) + 1;
    data.week[userId].accepted = (data.week[userId].accepted ?? 0) + 1;
    submission.counted = true;
  }
  save(KEY, data);

  // Réaction sur le message d'origine + annonce publique
  const sons = client.channels.cache.get(config.tribunal.sonsChannelId);
  const original = await sons?.messages.fetch(submission.messageId).catch(() => null);
  await original?.reactions.removeAll().catch(() => {});
  await original?.react(action === 'ok' ? '✅' : '❌').catch(() => {});
  await sons?.send({
    content: action === 'ok'
      ? `✅ Le tribunal **valide** le son de <@${userId}>. Semaine en règle.`
      : `❌ Le tribunal **refuse** le son de <@${userId}>. Il faut en redéposer un avant la fin de la semaine.`,
    allowedMentions: { users: [userId] },
  }).catch(() => {});

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(action === 'ok' ? 0x57f287 : 0xed4245)
    .setTitle(action === 'ok' ? '✅ Accepté' : '❌ Refusé')
    .setFooter({ text: `Jugé par ${interaction.member?.displayName ?? interaction.user.username}` });
  return interaction.update({ embeds: [embed], components: [] });
}

// ===================== Bilan animé =====================

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const frDate = (at) => {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};


// Les polices du GIF ne connaissent que l'alphabet latin : un pseudo en arabe, en japonais ou
// en petites capitales s'afficherait en carrés. Dans ce cas on prend le pseudo Discord, toujours simple.
function gifName(member) {
  const keep = (text) => String(text ?? '').replace(/[^ -ɏ]/g, '').replace(/\s+/g, ' ').trim();
  const shown = keep(member.displayName);
  const original = String(member.displayName ?? '').trim();
  if (shown.length >= 3 && shown.length >= original.length * 0.6) return shown;
  return keep(member.user.username) || `membre ${member.id.slice(-4)}`;
}

/** Ce qui s'écrit à droite de la ligne : combien de sons déposés, validés, et le total. */
function detailOf(person) {
  const week = person.sent === 0
    ? 'aucun dépôt'
    : `${person.accepted}/${person.sent} validé${person.accepted > 1 ? 's' : ''}`;
  return person.total > 0 ? `${week} · ${person.total} au total` : week;
}

/** GIF du bilan : photo, nom, statut et sons de la semaine de chacun, qui défilent un par un. */
export async function bilanPayload(guild) {
  const { data, people } = await weekReport(guild);
  const lines = people.map((p) => ({
    text: `${STATUSES[p.status].label} · ${gifName(p.member)}`,
    detail: detailOf(p),
    color: STATUSES[p.status].color,
    avatar: p.member.displayAvatarURL({ extension: 'png', size: 64, forceStatic: true }),
  }));
  const image = await buildWeekGif({
    title: 'TRIBUNAL DES SONS',
    subtitle: `Semaine du ${frDate(data.weekStart)}`,
    lines,
  });
  const group = (status) => {
    const list = people.filter((p) => p.status === status);
    if (!list.length) return null;
    const { emoji, label, short } = STATUSES[status];
    return `${emoji} **${label}** (${short}) : ${list.map((p) => `<@${p.id}> \`${p.accepted}\``).join(' · ')}`;
  };
  const content = [
    `⚖️ **Bilan de la semaine** · fin <t:${deadline(data.weekStart)}:R>`,
    group('bonus'),
    group('sauve'),
    group('attente'),
    group('bouffon'),
    '_Règle : 0 son validé = Bouffon du Roi · 1 son = sauvé · 3 sons et plus = bonus décidé par les juges._',
  ].filter(Boolean).join('\n');
  return {
    content: truncate(content, 1900),
    files: [image],
    allowedMentions: { users: people.map((p) => p.id).slice(0, 50) },
  };
}

// ===================== Semaine =====================

// Le sort de chacun en fin de semaine, selon le nombre de sons validés
export const STATUSES = {
  bonus: { label: 'BONUS', color: '#e3c37a', emoji: '👑', short: 'bonus à décider par les juges' },
  sauve: { label: 'SAUVE', color: '#3ef08a', emoji: '✅', short: 'en règle' },
  attente: { label: 'EN ATTENTE', color: '#ffe066', emoji: '⏳', short: 'en attente de jugement' },
  bouffon: { label: 'BOUFFON', color: '#ed4245', emoji: '🤡', short: 'Bouffon du Roi' },
};

/** 0 son = Bouffon, 1 ou 2 = sauvé, 3 et plus = bonus décidé par les juges. */
export function statusOf({ accepted = 0, pending = false }) {
  if (accepted >= 3) return 'bonus';
  if (accepted >= 1) return 'sauve';
  return pending ? 'attente' : 'bouffon';
}

/** Qui a rendu, qui n'a rien rendu, et combien de sons chacun a validé cette semaine. */
export async function weekReport(guild) {
  const data = await state();
  // Sans l'autorisation « Server Members », members.fetch() reste bloqué 2 minutes : on ne l'attend pas
  const members = await Promise.race([
    guild.members.fetch().catch(() => guild.members.cache),
    new Promise((resolve) => setTimeout(() => resolve(guild.members.cache), 8000)),
  ]);
  const dispensés = new Set(config.tribunal.exempt ?? []);
  const humans = [...members.values()].filter((m) => !m.user.bot && !dispensés.has(m.id));
  const totals = data.totals ?? {};
  const week = data.week ?? {};
  const count = (id) => totals[id] ?? 0;
  const weekOf = (id) => ({ sent: week[id]?.sent ?? 0, accepted: week[id]?.accepted ?? 0 });

  const people = humans.map((member) => {
    const submission = data.submissions[member.id];
    const { sent, accepted } = weekOf(member.id);
    const pending = submission?.verdict === 'en attente';
    return {
      member,
      id: member.id,
      name: member.displayName ?? member.user.username,
      sent,
      accepted,
      total: count(member.id),
      pending,
      jester: Boolean(config.tribunal.jesterRoleId && member.roles.cache.has(config.tribunal.jesterRoleId)),
      status: statusOf({ accepted, pending }),
    };
  });
  // D'abord les meilleurs, ensuite ceux qui attendent, les bouffons à la fin
  const rank = { bonus: 0, sauve: 1, attente: 2, bouffon: 3 };
  people.sort((a, b) => rank[a.status] - rank[b.status] || b.accepted - a.accepted || a.name.localeCompare(b.name));

  const of = (status) => people.filter((p) => p.status === status);
  return {
    data, people, count, weekOf,
    done: of('sauve').concat(of('bonus')).map((p) => p.member),
    waiting: of('attente').map((p) => p.member),
    missing: of('bouffon').map((p) => p.member),
    jesters: people.filter((p) => p.jester).map((p) => p.member),
  };
}

export async function weekPayload(guild) {
  const { data, people } = await weekReport(guild);
  const list = (status) => {
    const found = people.filter((p) => p.status === status);
    if (!found.length) return '—';
    return found.map((p) => `<@${p.id}> · **${p.accepted}** validé${p.accepted > 1 ? 's' : ''} sur ${p.sent} déposé${p.sent > 1 ? 's' : ''}${p.jester ? ' · 🤡' : ''}`).join('\n');
  };
  const field = (status) => {
    const { emoji, label, short } = STATUSES[status];
    const n = people.filter((p) => p.status === status).length;
    return { name: `${emoji} ${label} — ${short} (${n})`, value: truncate(list(status), 1000) };
  };
  const embed = new EmbedBuilder()
    .setColor(0xc8a24a)
    .setAuthor({ name: '⚖️ TRIBUNAL DES SONS' })
    .setTitle('État de la semaine')
    .setDescription([
      `Fin de la semaine : <t:${deadline(data.weekStart)}:F> (<t:${deadline(data.weekStart)}:R>)`,
      '**0 son validé** → Bouffon du Roi · **1 son** → sauvé · **3 sons et +** → bonus décidé par les juges.',
    ].join('\n'))
    .addFields(field('bonus'), field('sauve'), field('attente'), field('bouffon'))
    .setThumbnail(IMAGE_URL)
    .setTimestamp();
  return { embeds: [embed], files: [image()], allowedMentions: { parse: [] } };
}

/** Fin de semaine : le rôle du Bouffon pour ceux qui n'ont rien rendu. */
export async function closeWeek(guild) {
  const { data, done, waiting, missing } = await weekReport(guild);
  const role = guild.roles.cache.get(config.tribunal.jesterRoleId);
  const jesters = [];
  const freed = [];
  if (role) {
    for (const member of missing) {
      if (member.roles.cache.has(role.id) || !member.manageable) continue;
      await member.roles.add(role, 'Aucun son rendu cette semaine').then(() => jesters.push(member)).catch(() => {});
    }
    for (const member of done) {
      if (!member.roles.cache.has(role.id)) continue;
      await member.roles.remove(role, 'Son rendu et validé').then(() => freed.push(member)).catch(() => {});
    }
  }
  // Nouvelle semaine
  data.totals ??= {};
  data.history[String(data.weekStart)] = {
    week: data.week ?? {},
    accepted: done.map((m) => m.id),
    jesters: missing.map((m) => m.id),
    keys: Object.values(data.submissions).map((s) => s.key).filter(Boolean),
  };
  data.weekStart = startOfWeek(Date.now());
  data.submissions = {};
  data.week = {};
  save(KEY, data);

  const embed = new EmbedBuilder()
    .setColor(0xc8a24a)
    .setAuthor({ name: '⚖️ TRIBUNAL DES SONS · VERDICT DE LA SEMAINE' })
    .setTitle(jesters.length ? `${jesters.length} bouffon(s) désigné(s)` : 'Tout le monde a rendu son son')
    .setDescription([
      `✅ **En règle** : ${done.length ? done.map((m) => `<@${m.id}>`).join(' · ') : '—'}`,
      `🤡 **Bouffons du Roi** : ${jesters.length ? jesters.map((m) => `<@${m.id}>`).join(' · ') : '—'}`,
      freed.length ? `🕊️ **Libérés du chapeau** : ${freed.map((m) => `<@${m.id}>`).join(' · ')}` : null,
      waiting.length ? `⏳ Dépôts non jugés à temps : ${waiting.map((m) => `<@${m.id}>`).join(' · ')}` : null,
      '',
      `Nouvelle semaine ouverte. Prochaine échéance : <t:${deadline(data.weekStart)}:F>.`,
    ].filter(Boolean).join('\n'))
    .setImage(IMAGE_URL)
    .setTimestamp();
  return { embeds: [embed], files: [image()], allowedMentions: { parse: [] } };
}
