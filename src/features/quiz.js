import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { chatJson } from '../ai/gemini.js';
import { toolPrompt } from '../ai/persona.js';
import { truncate } from '../utils/discord.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const TTL_MS = 2 * 60 * 60_000;
const quizzes = new Map();

const SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
    correct_index: { type: 'integer', minimum: 0, maximum: 3 },
    explanation: { type: 'string' },
  },
  required: ['question', 'choices', 'correct_index', 'explanation'],
};

export async function createQuiz({ botName, topic, difficulty }) {
  const data = await chatJson({
    system: toolPrompt(botName, 'Tu crées des QCM fiables et vérifiables, en français.'),
    prompt: `Crée UNE question de quiz (QCM) sur le sujet : "${topic}". Difficulté : ${difficulty}.
- 4 choix plausibles, une seule bonne réponse, placée à une position aléatoire.
- Choix courts (max 80 caractères).
- "explanation" : 2-3 phrases qui expliquent pourquoi c'est la bonne réponse, ton sympa.`,
    schema: SCHEMA,
    thinking: 'high',
  });

  if (!data?.question || data.choices?.length !== 4 || !(data.correct_index >= 0 && data.correct_index <= 3)) {
    throw new Error('Quiz invalide renvoyé par Gemini');
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const quiz = { ...data, id, topic, difficulty, answers: new Map(), createdAt: Date.now() };
  quizzes.set(id, quiz);
  for (const [key, q] of quizzes) if (Date.now() - q.createdAt > TTL_MS) quizzes.delete(key);

  return { embeds: [quizEmbed(quiz)], components: [quizButtons(quiz)] };
}

function quizEmbed(quiz) {
  const total = quiz.answers.size;
  const good = [...quiz.answers.values()].filter((i) => i === quiz.correct_index).length;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🧠 Quiz : ${truncate(quiz.topic, 200)}`)
    .setDescription(`**${quiz.question}**\n\n${quiz.choices.map((c, i) => `**${LETTERS[i]}.** ${c}`).join('\n')}`)
    .setFooter({ text: `Difficulté : ${quiz.difficulty} · ${total} réponse(s) · ${good} bonne(s)` });
}

function quizButtons(quiz) {
  return new ActionRowBuilder().addComponents(
    LETTERS.map((letter, i) =>
      new ButtonBuilder().setCustomId(`quiz:${quiz.id}:${i}`).setLabel(letter).setStyle(ButtonStyle.Secondary),
    ),
  );
}

export async function handleQuizButton(interaction) {
  const [, id, rawIndex] = interaction.customId.split(':');
  const quiz = quizzes.get(id);
  if (!quiz) {
    return interaction.reply({ content: 'Ce quiz a expiré, relance-en un avec `/quiz` 😉', flags: MessageFlags.Ephemeral });
  }
  if (quiz.answers.has(interaction.user.id)) {
    return interaction.reply({ content: "T'as déjà répondu à ce quiz, pas de triche 👀", flags: MessageFlags.Ephemeral });
  }

  const index = Number(rawIndex);
  quiz.answers.set(interaction.user.id, index);
  const correct = index === quiz.correct_index;
  const answerLine = `**${LETTERS[quiz.correct_index]}. ${quiz.choices[quiz.correct_index]}**`;

  await interaction.reply({
    content: correct
      ? `✅ Bonne réponse, bien joué ! ${answerLine}\n\n${quiz.explanation}`
      : `❌ Raté, c'était ${answerLine}\n\n${quiz.explanation}`,
    flags: MessageFlags.Ephemeral,
  });
  await interaction.message.edit({ embeds: [quizEmbed(quiz)] }).catch(() => {});
}
