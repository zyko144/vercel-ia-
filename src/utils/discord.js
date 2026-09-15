import { config } from '../config.js';

const MAX_LEN = 1950;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'image/gif']);
const TEXT_EXT = /\.(txt|md|js|mjs|cjs|ts|tsx|jsx|py|java|c|cpp|h|cs|go|rs|php|rb|html|css|json|csv|xml|yml|yaml|sql|sh|lua|kt|swift|log|env\.example)$/i;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024;

/** Découpe un texte en messages <= 2000 caractères sans casser les blocs de code. */
export function splitMessage(text, max = MAX_LEN) {
  const chunks = [];
  let current = '';
  let openFence = null; // ex: "```js"

  const pushCurrent = () => {
    if (!current.trim()) return;
    if (openFence) {
      chunks.push(`${current}\n\`\`\``);
      current = `${openFence}\n`;
    } else {
      chunks.push(current);
      current = '';
    }
  };

  for (const rawLine of text.split('\n')) {
    // Ligne trop longue : on la coupe en morceaux
    const pieces = rawLine.length > max - 100 ? rawLine.match(new RegExp(`[\\s\\S]{1,${max - 100}}`, 'g')) : [rawLine];
    for (const line of pieces) {
      if (current.length + line.length + 1 > max - 10) pushCurrent();
      current += (current && !current.endsWith('\n') ? '\n' : '') + line;
      const fence = line.trim().match(/^```(\S*)/);
      if (fence) openFence = openFence ? null : `\`\`\`${fence[1]}`;
    }
  }
  if (current.trim() && current.trim() !== openFence) chunks.push(current);
  return chunks.length ? chunks : ['(réponse vide)'];
}

export function formatSources(sources, limit = 5) {
  if (!sources?.length) return '';
  const links = sources.slice(0, limit).map((s) => `[${s.title.replace(/[[\]]/g, '')}](<${s.url}>)`);
  return `-# 🔗 Sources : ${links.join(' · ')}`;
}

/** Ajoute les sources à la fin des morceaux (ou dans un morceau à part si ça dépasse). */
export function withSources(chunks, sources) {
  const line = formatSources(sources);
  if (!line) return chunks;
  const last = chunks.length - 1;
  if (chunks[last].length + line.length + 2 <= 2000) chunks[last] += `\n${line}`;
  else chunks.push(line.slice(0, 2000));
  return chunks;
}

/** Récupère les pièces jointes utilisables par Gemini (images, PDF, fichiers texte). */
export async function attachmentsToContent(attachments, { maxImages = 4 } = {}) {
  const content = [];
  const notes = [];
  let images = 0;

  for (const att of attachments.values()) {
    const type = (att.contentType ?? '').split(';')[0];
    try {
      if (IMAGE_TYPES.has(type) && att.size <= MAX_IMAGE_BYTES && images < maxImages) {
        content.push({ type: 'image', mime_type: type, data: await fetchBase64(att.url) });
        images++;
        notes.push('[image jointe]');
      } else if (type === 'application/pdf' && att.size <= MAX_PDF_BYTES) {
        content.push({ type: 'document', mime_type: 'application/pdf', data: await fetchBase64(att.url) });
        notes.push(`[PDF joint : ${att.name}]`);
      } else if ((type.startsWith('text/') || TEXT_EXT.test(att.name)) && att.size <= MAX_TEXT_BYTES) {
        const res = await fetch(att.url);
        content.push({ type: 'text', text: `Fichier joint "${att.name}" :\n\`\`\`\n${await res.text()}\n\`\`\`` });
        notes.push(`[fichier joint : ${att.name}]`);
      }
    } catch (err) {
      console.warn(`[attachments] ${att.name} ignoré :`, err.message);
    }
  }
  return { content, notes };
}

export async function fetchBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString('base64');
}

export function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Le salon (ou un fil de ce salon) fait-il partie de la liste ? */
export function inChannelList(ids, channel, channelId) {
  return ids.includes(channelId) || Boolean(channel?.isThread?.() && ids.includes(channel.parentId));
}

/** Le bot a-t-il le droit de répondre ici ? (ALLOWED_CHANNEL_IDS vide = partout) */
export function isAllowedChannel(channel, channelId) {
  return !config.allowedChannelIds.length || inChannelList(config.allowedChannelIds, channel, channelId);
}

export function allowedChannelsMention() {
  return config.allowedChannelIds.map((id) => `<#${id}>`).join(', ');
}

export function displayName(member, user) {
  return member?.displayName ?? user.globalName ?? user.username;
}
