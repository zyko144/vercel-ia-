// IA : mémoire des membres, salons traduits automatiquement, note de punchline, FAQ apprise.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { chat, chatJson } from '../ai/gemini.js';
import { load, save } from '../storage.js';
import { truncate } from '../utils/discord.js';
import { cfg, parseTranslateChannels } from './guildConfig.js';


// ===================== Mémoire des membres =====================
// L'IA retient quelques faits utiles sur chaque membre (goûts, jeux, pseudo en jeu), 20 au maximum.
// Chacun peut voir et effacer ce qu'elle sait (/ia › Ce que l'IA sait de moi).

const MEMORY_KEY = 'memoire-membres';
const PERSONAL = /\b(?:j'?(?:aime|adore|kiffe|d[ée]teste|joue|[ée]coute|habite)|je\s+(?:suis|joue|m'appelle|fais|kiffe|pr[ée]f[èe]re)|mon\s+(?:pseudo|jeu|rappeur|son|artiste|pr[ée]f[ée]r[ée])|ma\s+(?:passion|ville|console)|mes\s+(?:jeux|sons)|pr[ée]f[ée]r[ée]e?s?)\b/i;
let memory = null;
async function memoryData() {
  memory ??= (await load(MEMORY_KEY, {}).catch(() => ({}))) ?? {};
  return memory;
}

export async function factsOf(userId) {
  return (await memoryData())[userId]?.facts ?? [];
}

/** Texte à ajouter aux consignes de l'IA pour ce membre (vide si rien). */
export async function factsPrompt(guildId, userId, name) {
  if (guildId && !cfg(guildId, 'memory.enabled')) return '';
  const facts = await factsOf(userId);
  return facts.length ? `\n\nCE QUE TU SAIS DE ${name.toUpperCase()} (utilise-le naturellement, sans le réciter)\n${facts.map((x) => `- ${x.text}`).join('\n')}` : '';
}

/** Après une question : si le membre parle de lui, l'IA note ce qu'il faut retenir. */
export async function learnFacts(guildId, user, text) {
  if (!text || text.length < 12 || (guildId && !cfg(guildId, 'memory.enabled')) || !PERSONAL.test(text)) return;
  const all = await memoryData();
  const known = all[user.id]?.facts ?? [];
  const data = await chatJson({
    system: 'Tu extrais des faits durables et utiles sur une personne (goûts, jeux, musique, pseudo en jeu, ville, projets). Jamais d’info sensible (santé, religion, politique, orientation, adresse précise, mots de passe).',
    prompt: `Déjà connu :\n${known.map((x) => `- ${x.text}`).join('\n') || '(rien)'}\n\nNouveau message de ${user.username} :\n"""${truncate(text, 800)}"""\n\nDonne 0 à 3 NOUVEAUX faits courts (moins de 80 caractères), à la 3e personne.`,
    schema: { type: 'object', properties: { faits: { type: 'array', items: { type: 'string' } } }, required: ['faits'] },
    thinking: 'low', exactThinking: true, tag: 'tâches',
  }).catch(() => null);
  const fresh = (data?.faits ?? []).map((x) => String(x).trim()).filter((x) => x && x.length <= 120 && !known.some((k) => k.text.toLowerCase() === x.toLowerCase()));
  if (!fresh.length) return;
  all[user.id] = { facts: [...known, ...fresh.map((t) => ({ text: t, at: Date.now() }))].slice(-20), updated: Date.now() };
  save(MEMORY_KEY, all);
}

/** Remplace les souvenirs d'un membre (modifiés par lui sur le site). */
export async function setFacts(userId, facts) {
  const all = await memoryData();
  const clean = [...new Set(facts.map((x) => String(x).replace(/\s+/g, ' ').trim()).filter((x) => x && x.length <= 120))].slice(0, 20);
  if (clean.length) all[userId] = { facts: clean.map((text) => ({ text, at: Date.now() })), updated: Date.now() };
  else delete all[userId];
  save(MEMORY_KEY, all);
  return clean;
}

export async function forgetFacts(userId) {
  const all = await memoryData();
  delete all[userId];
  save(MEMORY_KEY, all);
}

export async function memoryMessage(user) {
  const facts = await factsOf(user.id);
  return {
    embeds: [new EmbedBuilder().setColor(0xa58bff).setTitle('🧠 Ce que l’IA sait de toi')
      .setDescription(facts.length ? facts.map((x) => `• ${x.text}`).join('\n') : 'Rien pour l’instant. Parle-lui de tes goûts (« j’adore Jul », « je joue à Valo ») et elle s’en souviendra.')
      .setFooter({ text: '20 souvenirs maximum · rien de sensible n’est gardé' })],
    components: facts.length ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mem:forget').setLabel('Tout effacer').setEmoji('🧽').setStyle(ButtonStyle.Danger))] : [],
  };
}

// ===================== Salons traduits automatiquement =====================

/** Traduit un message si son salon est réglé pour ça (réponse discrète en dessous). */
export async function autoTranslate(message) {
  if (!message.inGuild() || message.author.bot || (message.content ?? '').length < 3) return false;
  const target = parseTranslateChannels(cfg(message.guildId, 'translate.channels'))[message.channelId];
  if (!target) return false;
  const { text } = await chat({
    system: `Tu es un traducteur. Traduis le message en ${target}, naturellement, en gardant le ton, les emojis et l'argot. S'il est DÉJÀ en ${target}, réponds exactement : IDEM`,
    content: [{ type: 'text', text: message.content }],
    web: false, thinking: 'minimal', exactThinking: true, tag: 'outils',
  });
  if (!text || /^IDEM\b/.test(text.trim())) return false;
  await message.reply({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription(truncate(text, 4000)).setFooter({ text: `🌍 Traduit en ${target}` })], allowedMentions: { parse: [] } }).catch(() => {});
  return true;
}

// ===================== Note de punchline =====================

const bar = (n) => `${'█'.repeat(Math.round(n))}${'░'.repeat(10 - Math.round(n))}`;

export async function ratePunchline(text, author) {
  const data = await chatJson({
    system: 'Tu es juré d’un concours de rap français, exigeant mais bienveillant. Tu notes des punchlines écrites.',
    prompt: `Punchline de ${author} :\n"""${truncate(text, 800)}"""\n\nNote sur 10 : rimes, jeu de mots, originalité, impact. Donne une note globale et un commentaire court et drôle (2 phrases max).`,
    schema: {
      type: 'object',
      properties: { note: { type: 'number' }, rimes: { type: 'number' }, jeu_de_mots: { type: 'number' }, originalite: { type: 'number' }, impact: { type: 'number' }, commentaire: { type: 'string' } },
      required: ['note', 'rimes', 'jeu_de_mots', 'originalite', 'impact', 'commentaire'],
    },
    thinking: 'low', exactThinking: true, tag: 'tâches',
  });
  const clamp = (n) => Math.max(0, Math.min(10, Number(n) || 0));
  const note = clamp(data.note);
  return new EmbedBuilder()
    .setColor(note >= 8 ? 0x3dff9a : note >= 5 ? 0xffc94d : 0xff3355)
    .setTitle(`🎤 ${note.toFixed(1).replace('.', ',')} / 10`)
    .setDescription(`> ${truncate(text, 500).replace(/\n/g, '\n> ')}\n\n${data.commentaire}`)
    .addFields(
      { name: 'Rimes', value: `\`${bar(clamp(data.rimes))}\` ${clamp(data.rimes)}`, inline: true },
      { name: 'Jeu de mots', value: `\`${bar(clamp(data.jeu_de_mots))}\` ${clamp(data.jeu_de_mots)}`, inline: true },
      { name: '​', value: '​', inline: false },
      { name: 'Originalité', value: `\`${bar(clamp(data.originalite))}\` ${clamp(data.originalite)}`, inline: true },
      { name: 'Impact', value: `\`${bar(clamp(data.impact))}\` ${clamp(data.impact)}`, inline: true },
    )
    .setFooter({ text: `Punchline de ${author} · jury IA` });
}

// ===================== FAQ apprise =====================
// Dans le salon d'aide : l'IA répond aux questions déjà posées. Quand le staff répond (en réponse à un
// message), le couple question/réponse est appris. Le staff gère la FAQ depuis /pannel.

const FAQ_KEY = 'faq';
let faq = null;
async function faqData() {
  faq ??= (await load(FAQ_KEY, {}).catch(() => ({}))) ?? {};
  return faq;
}
export async function faqEntries(guildId) {
  return (await faqData())[guildId] ?? [];
}
export async function addFaq(guildId, question, answer) {
  const all = await faqData();
  const list = (all[guildId] ??= []);
  list.push({ q: truncate(question, 300), a: truncate(answer, 1500), at: Date.now() });
  if (list.length > 60) list.shift();
  save(FAQ_KEY, all);
  return list.length;
}
export async function removeFaq(guildId, index) {
  const all = await faqData();
  const removed = (all[guildId] ?? []).splice(index, 1)[0];
  save(FAQ_KEY, all);
  return removed ?? null;
}

const QUESTION = /\?\s*$|^(?:comment|pourquoi|quand|o[uù]|qui|quel(?:le)?s?|est[- ]ce|c'?est quoi|combien|on peut|je peux|y a)\b/i;

/** Un message du salon d'aide : apprendre (réponse du staff) ou répondre (question connue). */
export async function faqMessage(message) {
  if (!message.inGuild() || message.author.bot || message.channelId !== cfg(message.guildId, 'faq.channelId')) return false;
  const staff = message.member?.permissions?.has(P.ManageMessages);
  if (staff && message.reference?.messageId) {
    const question = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (question && !question.author.bot && QUESTION.test(question.content)) {
      await addFaq(message.guildId, question.content, message.content);
      await message.react('📚').catch(() => {});
    }
    return false;
  }
  if (staff || !QUESTION.test(message.content ?? '')) return false;
  const entries = await faqEntries(message.guildId);
  if (!entries.length) return false;
  const data = await chatJson({
    system: 'Tu cherches si une question a déjà une réponse dans la FAQ d’un serveur Discord. Sois strict : seulement si c’est vraiment la même question.',
    prompt: `QUESTION : """${truncate(message.content, 500)}"""\n\nFAQ :\n${entries.map((e, i) => `${i}. ${e.q}`).join('\n')}\n\nDonne l'index qui répond à la question, ou -1 si aucun.`,
    schema: { type: 'object', properties: { index: { type: 'integer' } }, required: ['index'] },
    thinking: 'minimal', exactThinking: true, tag: 'tâches',
  }).catch(() => null);
  const entry = entries[data?.index];
  if (!entry) return false;
  await message.reply({ embeds: [new EmbedBuilder().setColor(0x5ff0ff).setAuthor({ name: '📚 Réponse de la FAQ' }).setDescription(entry.a).setFooter({ text: `Question proche : ${truncate(entry.q, 80)} · pas la bonne réponse ? Un membre du staff va t’aider.` })], allowedMentions: { parse: [] } }).catch(() => {});
  return true;
}

export const isMemoryComponent = (interaction) => interaction.customId === 'mem:forget';
export async function handleMemoryComponent(client, interaction) {
  await forgetFacts(interaction.user.id);
  return interaction.update({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setDescription('🧽 C’est effacé : l’IA ne se souvient plus de rien sur toi.')], components: [] });
}
