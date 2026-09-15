// Mise en forme des réponses de l'IA : 1 seul message (embeds) + bouton pour copier le code.
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { splitMessage, truncate } from './discord.js';

export const BRAND_COLOR = 0x5865f2;
const EMBED_TEXT_MAX = 4000; // limite Discord : 4096 par embed
const MESSAGE_TEXT_MAX = 5800; // limite Discord : 6000 pour tous les embeds d'un message
const FULL_FILE_NAME = 'reponse-complete.md';
const MODAL_TEXT_MAX = 4000;

const EXTENSIONS = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', java: 'java', csharp: 'cs', cs: 'cs',
  cpp: 'cpp', c: 'c', php: 'php', ruby: 'rb', go: 'go', rust: 'rs', lua: 'lua', html: 'html', css: 'css', json: 'json',
  sql: 'sql', bash: 'sh', sh: 'sh', shell: 'sh', powershell: 'ps1', yaml: 'yml', yml: 'yml', kotlin: 'kt', swift: 'swift',
};

export function extractCodeBlocks(text) {
  const blocks = [];
  for (const [, lang, code] of text.matchAll(/```([\w+#-]*)[^\S\n]*\n([\s\S]*?)```/g)) {
    const trimmed = code.replace(/\n$/, '');
    if (trimmed.trim()) blocks.push({ lang: lang.toLowerCase(), code: trimmed });
  }
  return blocks;
}

function sourcesField(sources) {
  if (!sources?.length) return null;
  let value = '';
  for (const s of sources.slice(0, 5)) {
    const link = `[${s.title.replace(/[[\]]/g, '')}](${s.url})`;
    if (value.length + link.length + 3 > 1024) break;
    value += `${value ? ' · ' : ''}${link}`;
  }
  return value ? { name: '🔗 Sources', value } : null;
}

/**
 * Construit un message Discord unique pour une réponse de l'IA.
 * @param {object} opts
 * @param {string} opts.text           réponse en markdown
 * @param {Array}  [opts.sources]      liens sources
 * @param {string} [opts.mentionLine]  texte hors embed (pour pinger quelqu'un)
 * @param {string[]} [opts.allowedUsers]
 */
export function buildAnswerPayload({ text, sources = [], mentionLine = '', allowedUsers = [] }) {
  const files = [];
  let parts;
  if (text.length <= EMBED_TEXT_MAX) {
    parts = [text];
  } else {
    parts = splitMessage(text, EMBED_TEXT_MAX);
    if (parts.length > 2 || parts.join('').length > MESSAGE_TEXT_MAX) {
      // Vraiment trop long : le début dans le message + la réponse entière en fichier
      parts = [`${splitMessage(text, EMBED_TEXT_MAX - 120)[0]}\n\n📄 *La suite est dans le fichier joint.*`];
      files.push(new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: FULL_FILE_NAME }));
    }
  }

  const embeds = parts.map((part) => new EmbedBuilder().setColor(BRAND_COLOR).setDescription(part));
  const field = sourcesField(sources);
  const used = parts.join('').length;
  if (field && used + field.value.length + field.name.length <= 6000) embeds.at(-1).addFields(field);

  const components = [];
  if (extractCodeBlocks(text).length) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('copy:code').setLabel('Copier le code').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    ));
  }

  return {
    content: mentionLine || undefined,
    embeds,
    components,
    files,
    allowedMentions: { parse: [], users: allowedUsers, repliedUser: true },
  };
}

/** Récupère le texte complet d'une réponse du bot à partir du message Discord. */
async function answerTextFromMessage(message) {
  const full = message.attachments.find((a) => a.name === FULL_FILE_NAME);
  if (full) {
    const res = await fetch(full.url).catch(() => null);
    if (res?.ok) return res.text();
  }
  const descriptions = message.embeds.map((e) => e.description ?? '');
  // recolle les blocs de code coupés entre deux embeds
  return descriptions.join('\n').replace(/\n```\n```[\w+#-]*\n/g, '\n');
}

export async function handleCopyButton(interaction) {
  const blocks = extractCodeBlocks(await answerTextFromMessage(interaction.message));
  if (!blocks.length) {
    return interaction.reply({ content: "J'ai pas trouvé de code à copier dans ce message.", flags: MessageFlags.Ephemeral });
  }

  if (blocks.length <= 5 && blocks.every((b) => b.code.length <= MODAL_TEXT_MAX)) {
    const modal = new ModalBuilder().setCustomId('copy-modal').setTitle('📋 Sélectionne tout puis copie');
    blocks.forEach((block, i) => {
      const label = `${blocks.length > 1 ? `Bloc ${i + 1}` : 'Code'}${block.lang ? ` (${block.lang})` : ''}`;
      modal.addLabelComponents(
        new LabelBuilder()
          .setLabel(truncate(label, 45))
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId(`bloc-${i}`)
              .setStyle(TextInputStyle.Paragraph)
              .setValue(block.code)
              .setRequired(false),
          ),
      );
    });
    return interaction.showModal(modal);
  }

  // Trop long pour la fenêtre de copie : on envoie le code en fichiers
  const files = blocks.slice(0, 10).map((block, i) =>
    new AttachmentBuilder(Buffer.from(block.code, 'utf8'), { name: `code-${i + 1}.${EXTENSIONS[block.lang] ?? 'txt'}` }));
  return interaction.reply({
    content: '📋 Le code est trop long pour la fenêtre de copie, le voilà en fichier :',
    files,
    flags: MessageFlags.Ephemeral,
  });
}

/** La fenêtre de copie sert juste à copier : on ferme sans rien faire. */
export async function handleCopyModal(interaction) {
  await interaction.deferUpdate().catch(() =>
    interaction.reply({ content: '👍', flags: MessageFlags.Ephemeral }).catch(() => {}));
}
