import { config } from '../config.js';
import { chat } from '../ai/gemini.js';
import { systemPrompt } from '../ai/persona.js';
import { detectEscalation, escalateToOwner } from './escalation.js';
import { getHistory, remember } from './memory.js';
import { displayName } from '../utils/discord.js';
import { buildAnswerPayload } from '../utils/reply.js';

/**
 * Pose une question à Gemini et renvoie un message Discord prêt à envoyer (1 seul message).
 * Gère la mémoire, les sources et l'escalade vers le chef.
 */
export async function askAI({
  client, user, member, guild, channel, link,
  prompt, extraContent = [], notes = [],
  historyKey = null, web = true, thinking, instructions = '', visibility = 'public',
}) {
  const who = `${displayName(member, user)}${user.id === config.ownerId ? ' (le chef)' : ''}`;
  const userText = `${who} : ${prompt || '(pas de texte)'}${notes.length ? ` ${notes.join(' ')}` : ''}`;
  const history = historyKey ? getHistory(historyKey) : [];

  let system = systemPrompt({ botName: client.user.username, guildName: guild?.name });
  if (instructions) system += `\n\nCONSIGNE POUR CETTE DEMANDE\n${instructions}`;

  const { text: raw, sources } = await chat({
    history,
    content: [{ type: 'text', text: userText }, ...extraContent],
    system,
    web,
    thinking,
  });

  const { escalate, text } = detectEscalation(raw);
  let answer = text || (escalate
    ? 'Là-dessus jpeux pas te répondre de façon fiable.'
    : "J'ai pas réussi à formuler une réponse, reformule stp 🙏");

  if (historyKey) remember(historyKey, userText, answer);

  let mentionLine = '';
  let allowedUsers = [];
  if (escalate) {
    const result = await escalateToOwner({ client, user, guild, channel, question: prompt, answer, link, visibility });
    answer += result.notice;
    mentionLine = result.mentionLine;
    allowedUsers = result.allowedUsers;
  }

  return buildAnswerPayload({ text: answer, sources, mentionLine, allowedUsers });
}

export function channelLink(guildId, channelId) {
  return `https://discord.com/channels/${guildId ?? '@me'}/${channelId}`;
}
