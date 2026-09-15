// Quiz perso : le message est visible seulement par la personne, qui répond avec les boutons.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { chatJson } from '../ai/gemini.js';
import { toolPrompt } from '../ai/persona.js';
import { truncate } from '../utils/discord.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const TTL_MS = 2 * 60 * 60_000;
const quizzes = new Map();
const scores = new Map(); // userId -> { good, total }

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

export async function createQuiz({ botName, userId, topic, difficulty }) {
  const data = await chatJson({
    system: toolPrompt(botName, 'Tu crées des QCM fiables et vérifiables, en français.'),
    prompt: `Crée UNE question de quiz (QCM) sur le sujet : "${topic}". Difficulté : ${difficulty}.
- 4 choix plausibles, une seule bonne réponse, placée à une position aléatoire.
- Choix courts (max 80 caractères).
- "explanation" : 2-3 phrases qui expliquent pourquoi c'est la bonne réponse, ton sympa.
- Varie les questions, évite les plus classiques.`,
    schema: SCHEMA,
    thinking: 'high',
  });

  if (!data?.question || data.choices?.length !== 4 || !(data.correct_index >= 0 && data.correct_index <= 3)) {
    throw new Error('Quiz invalide renvoyé par Gemini');
  }

  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  quizzes.set(id, { ...data, id, userId, topic, difficulty, createdAt: Date.now() });
  for (const [key, q] of quizzes) if (Date.now() - q.createdAt > TTL_MS) quizzes.delete(key);

  const quiz = quizzes.get(id);
  return { embeds: [quizEmbed(quiz)], components: [answerRow(quiz)] };
}

function scoreText(userId) {
  const s = scores.get(userId);
  return s ? ` · Score : ${s.good}/${s.total}` : '';
}

function quizEmbed(quiz, footerExtra = '') {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🧠 Quiz : ${truncate(quiz.topic, 200)}`)
    .setDescription(`**${quiz.question}**\n\n${quiz.choices.map((c, i) => `**${LETTERS[i]}.** ${c}`).join('\n')}${footerExtra}`)
    .setFooter({ text: `Difficulté : ${quiz.difficulty}${scoreText(quiz.userId)}` });
}

function answerRow(quiz, chosen = null) {
  return new ActionRowBuilder().addComponents(
    LETTERS.map((letter, i) => {
      const button = new ButtonBuilder().setCustomId(`quiz:${quiz.id}:${i}`).setLabel(letter);
      if (chosen === null) return button.setStyle(ButtonStyle.Secondary);
      const style = i === quiz.correct_index ? ButtonStyle.Success : i === chosen ? ButtonStyle.Danger : ButtonStyle.Secondary;
      return button.setStyle(style).setDisabled(true);
    }),
  );
}

export async function handleQuizButton(client, interaction) {
  const [kind, id, rawIndex] = interaction.customId.split(':');
  const quiz = quizzes.get(id);
  if (!quiz) {
    return interaction.reply({ content: 'Ce quiz a expiré, relance-en un avec `/quiz` 😉', flags: MessageFlags.Ephemeral });
  }

  if (kind === 'quiz-next') {
    await interaction.deferUpdate();
    const payload = await createQuiz({
      botName: client.user.username,
      userId: interaction.user.id,
      topic: quiz.topic,
      difficulty: quiz.difficulty,
    });
    return interaction.editReply(payload);
  }

  const chosen = Number(rawIndex);
  const correct = chosen === quiz.correct_index;
  const score = scores.get(interaction.user.id) ?? { good: 0, total: 0 };
  score.total++;
  if (correct) score.good++;
  scores.set(interaction.user.id, score);

  const result = correct
    ? `\n\n✅ **Bonne réponse, bien joué !**\n${quiz.explanation}`
    : `\n\n❌ **Raté**, c'était **${LETTERS[quiz.correct_index]}. ${quiz.choices[quiz.correct_index]}**\n${quiz.explanation}`;

  const nextRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`quiz-next:${quiz.id}`).setLabel('Autre question').setEmoji('🔁').setStyle(ButtonStyle.Primary),
  );
  await interaction.update({
    embeds: [quizEmbed(quiz, result).setColor(correct ? 0x57f287 : 0xed4245)],
    components: [answerRow(quiz, chosen), nextRow],
  });
}
