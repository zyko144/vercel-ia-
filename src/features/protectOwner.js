// Protection du chef : quelqu'un qui l'insulte (en le pingant, en lui répondant, en parlant de lui
// ou pendant une conversation avec lui) prend un avertissement, et dès le 2e une exclusion d'1 min.
// Les insultes entre autres membres ne sont pas concernées.
import { EmbedBuilder } from 'discord.js';
import { config } from '../config.js';
import { chatJson } from '../ai/gemini.js';
import { load, save } from '../storage.js';
import { truncate } from '../utils/discord.js';

const TIMEOUT_MS = 60_000;
const WARN_KIND = 'insulte-chef';
const CONVERSATION_MS = 3 * 60_000; // le chef a parlé il y a moins de 3 min dans le salon
const HISTORY_SIZE = 40;

// Insultes claires (abréviations comprises) : sanctionnées même si l'IA de vérification est indispo
const STRONG = [
  'fdp', 'fils de pute', 'fils de chien', 'ntm', 'nique ta mere', 'nik ta mere', 'niquer ta mere', 'nique ta grand mere', 'ntgm', 'nsm',
  'nique ta race', 'ntr', 'nique tes morts', 'nik tes morts', 'ftg', 'ferme ta gueule', 'tg', 'ta gueule', 'ta geule', 'vtff',
  'va te faire foutre', 'va te faire enculer', 'vtfe', 'encule', 'enculer', 'connard', 'conard', 'connasse', 'conasse', 'batard',
  'btrd', 'salope', 'salopard', 'pute', 'tepu', 'pd', 'pede', 'tapette', 'tarlouze', 'tafiole', 'lopette', 'fiotte',
  'abruti', 'cretin', 'imbecile', 'mongol', 'mongolien', 'gogol', 'golmon', 'triso', 'trisomique', 'attarde', 'bouffon', 'boloss',
  'bolosse', 'bolos', 'cassos', 'tocard', 'toquard', 'sous merde', 'grosse merde', 'petite merde', 'tas de merde', 'sac a merde',
  'sale merde', 'raclure', 'enfoire', 'fumier', 'salaud', 'petasse', 'pouffiasse', 'poufiasse', 'grognasse', 'chienne', 'sale chien',
  'sale pute', 'grosse vache', 'gros porc', 'sale arabe', 'sale noir', 'sale juif', 'sale renoi', 'sale rebeu', 'sale blanc', 'baltringue', 'teube', 'zamel', 'zemel', 'qahba', 'kahba', 'nardinamouk', 'nik mok', 'negre', 'bougnoule', 'youpin',
  'chinetoque', 'bamboula', 'fuck you', 'fuck u', 'fck u', 'fk u', 'fuck off', 'stfu', 'shut the fuck up', 'bitch', 'son of a bitch',
  'motherfucker', 'asshole', 'dumbass', 'retard', 'moron', 'kys', 'kill yourself', 'nigger', 'faggot', 'cunt', 'dickhead',
];
// Mots qui peuvent être des insultes selon le contexte (« c'est con », « le son est nul ») : l'IA tranche
const CONTEXTUAL = [
  'con', 'conne', 'idiot', 'debile', 'nul', 'nulle', 'nullos', 'naze', 'moche', 'victime', 'rat', 'rate', 'une merde', 'de la merde',
  'bete', 'porc', 'un chien', 'autiste', 'noob', 'loser', 'boulet', 'clown', 'guignol', 'blaireau', 'ordure', 'dechet', 'clochard',
  'clodo', 'ta mere', 'ta race', 'degage', 'casse toi', 'tais toi', 'ferme la', 'degueulasse', 'rageux', 'puceau', 'fragile',
  'pauvre type', 'pauvre con', 'pedale', 'miskine', 'mskn', 'hmar', 'sheitan', 'tete de',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '€': 'e' };

/** Texte simplifié : minuscules sans accents, leet speak (c0nn4rd), lettres espacées (f d p), lettres répétées (fdppp). */
function simplify(text) {
  return text
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .toLowerCase()
    .replace(/<a?:\w+:\d+>|<[@#][!&]?\d+>|https?:\/\/\S+/g, ' ')
    .replace(/(?<=[a-z])[0134578@$€]|[0134578@$€](?=[a-z])/g, (c) => LEET[c])
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (letters) => letters.replace(/ /g, ''))
    .replace(/([a-z])\1+/g, '$1')
    .trim();
}

const toPattern = (entry) => {
  const words = simplify(entry).split(' ');
  // mots collés ou séparés (« tagueule », « ta gueule »), pluriel / féminin (« connards », « abrutie »)
  return `${words.join(' ?')}(?:e|s|es|x)?`;
};
const STRONG_RE = new RegExp(`(?:^| )(${STRONG.map(toPattern).join('|')})(?= |$)`, 'g');
const CONTEXTUAL_RE = new RegExp(`(?:^| )(${CONTEXTUAL.map(toPattern).join('|')})(?= |$)`, 'g');

export function findInsults(text) {
  const simple = simplify(text);
  const strong = [...simple.matchAll(STRONG_RE)].map((m) => m[1]);
  const contextual = [...simple.matchAll(CONTEXTUAL_RE)].map((m) => m[1]);
  return { strong: [...new Set(strong)], contextual: [...new Set(contextual)] };
}

// ===== Conversations en cours, par salon =====

const history = new Map(); // salon -> [{ authorId, name, content, at, targets }]

function remember(message) {
  const list = history.get(message.channelId) ?? [];
  const targets = new Set([...message.mentions.users.keys()]);
  if (message.mentions.repliedUser) targets.add(message.mentions.repliedUser.id);
  list.push({ authorId: message.author.id, name: message.member?.displayName ?? message.author.username, content: message.content, at: Date.now(), targets });
  if (list.length > HISTORY_SIZE) list.shift();
  history.set(message.channelId, list);
}

function ownerNames(guild) {
  const member = guild.members.cache.get(config.ownerId);
  const user = member?.user ?? guild.client.users.cache.get(config.ownerId);
  return [member?.displayName, user?.username, user?.globalName].filter((n) => n && simplify(n).length >= 3).map(simplify);
}

/** Le message vise-t-il le chef ? « direct » : ping, réponse, ou son nom ; « conversation » : échange en cours avec lui. */
function relationToOwner(message) {
  const owner = config.ownerId;
  if (message.mentions.users.has(owner) || message.mentions.repliedUser?.id === owner) return 'direct';
  const simple = ` ${simplify(message.content)} `;
  if (ownerNames(message.guild).some((name) => simple.includes(` ${name} `))) return 'direct';

  const now = Date.now();
  const recent = (history.get(message.channelId) ?? []).filter((m) => now - m.at < CONVERSATION_MS);
  const fromOwner = recent.filter((m) => m.authorId === owner);
  if (!fromOwner.length) return null;
  // Le chef lui a parlé (ping / réponse), ou ils échangent tous les deux dans le salon
  if (fromOwner.some((m) => m.targets.has(message.author.id))) return 'conversation';
  if (recent.some((m) => m.authorId === message.author.id && m.targets.has(owner))) return 'conversation';
  const previous = recent.at(-2); // le message juste avant celui-ci
  if (previous?.authorId === owner) return 'conversation';
  if (recent.some((m) => m.authorId === message.author.id && m !== recent.at(-1))) return 'conversation';
  return null;
}

// ===== Vérification par l'IA =====

const SCHEMA = {
  type: 'object',
  properties: {
    insulte_le_chef: { type: 'boolean' },
    mot: { type: 'string' },
    raison: { type: 'string' },
  },
  required: ['insulte_le_chef', 'mot', 'raison'],
};

async function aimedAtOwner(message, relation, words) {
  const ownerName = message.guild.members.cache.get(config.ownerId)?.displayName ?? 'le chef';
  const context = (history.get(message.channelId) ?? []).slice(-10, -1)
    .map((m) => `${m.authorId === config.ownerId ? `[CHEF] ${m.name}` : m.name} : ${truncate(m.content, 200)}`).join('\n');
  const repliedTo = message.mentions.repliedUser?.id === config.ownerId ? ' (en réponse à un message du CHEF)' : '';
  return chatJson({
    system: 'Tu es le modérateur automatique d\'un serveur Discord français. Tu protèges le chef du serveur contre les insultes. Tu connais l\'argot, le verlan, les abréviations (fdp, ntm, tg, ftg, pd...) et les fautes volontaires.',
    prompt: `Le chef s'appelle « ${ownerName} ». ${relation === 'direct' ? 'Le message le ping, lui répond ou parle de lui.' : 'Le chef est en pleine conversation avec l\'auteur dans ce salon.'}

CONVERSATION JUSTE AVANT :
"""${context || '(rien)'}"""

MESSAGE À VÉRIFIER (de ${message.member?.displayName ?? message.author.username})${repliedTo} :
"""${message.content}"""

Mots repérés : ${words.join(', ')}

Est-ce que ce message insulte le CHEF (directement, en parlant de lui, ou en lui répondant) ? Même pour rire, une insulte envers le chef compte.
Ne compte PAS : une insulte envers quelqu'un d'autre, se rabaisser soi-même (« jsuis con »), un juron sans cible (« putain », « merde j'ai perdu »), rapporter ce qu'un autre a dit (« il m'a traité de fdp »), ou un mot pas insultant ici (« c'est con », « le son est nul », « le chien de ma voisine »).
Réponds : insulte_le_chef, mot (l'insulte exacte, vide sinon), raison (une phrase courte).`,
    schema: SCHEMA,
    thinking: 'low',
    exactThinking: true,
  });
}

// ===== Sanction =====

async function punish(client, message, word) {
  const all = await load('warnings', {});
  all[message.guildId] ??= {};
  const list = (all[message.guildId][message.author.id] ??= []);
  const reason = `Insulte envers le chef (« ${truncate(word, 60)} »)`;
  list.push({ reason, by: client.user.id, at: Date.now(), kind: WARN_KIND, message: truncate(message.content, 300) });
  save('warnings', all);
  const count = list.filter((w) => w.kind === WARN_KIND).length;

  let timedOut = false;
  if (count >= 2) {
    const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
    if (member?.moderatable) {
      timedOut = await member.timeout(TIMEOUT_MS, `${reason} · ${count}e avertissement`).then(() => true).catch((err) => {
        console.warn('[protection] exclusion impossible :', err.message);
        return false;
      });
    }
  }

  console.log(`[protection] ${message.author.username} insulte le chef (« ${word} ») · avertissement ${count}${timedOut ? ' · exclu 1 min' : ''}`);
  const embed = new EmbedBuilder()
    .setColor(count >= 2 ? 0xed4245 : 0xfee75c)
    .setDescription([
      `⚠️ ${message.author}, on insulte pas le chef.`,
      count >= 2
        ? timedOut ? `🔇 **${count}e avertissement : exclu 1 minute.**` : `**${count}e avertissement** (exclusion impossible : son rôle est au-dessus du mien).`
        : '**1er avertissement.** La prochaine fois c\'est une exclusion d\'1 minute.',
    ].join('\n'));
  await message.reply({ embeds: [embed], allowedMentions: { users: [message.author.id], repliedUser: false } }).catch(() => {});
  message.author.send({
    embeds: [new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(count >= 2 ? (timedOut ? '🔇 Exclusion temporaire (1 min)' : '⚠️ Avertissement') : '⚠️ Avertissement')
      .addFields(
        { name: 'Serveur', value: message.guild.name, inline: true },
        { name: 'Total', value: `${count} avertissement(s) pour insulte envers le chef`, inline: true },
        { name: 'Raison', value: reason },
      )
      .setTimestamp()],
  }).catch(() => {});
}

/** À appeler pour chaque message du serveur. */
export async function protectOwner(client, message) {
  if (!message.inGuild() || message.author.bot || !config.ownerId) return;
  remember(message);
  if (message.author.id === config.ownerId || !message.content) return;

  const { strong, contextual } = findInsults(message.content);
  if (!strong.length && !contextual.length) return;
  const relation = relationToOwner(message);
  if (!relation) return;

  const words = [...strong, ...contextual];
  let verdict;
  try {
    verdict = await aimedAtOwner(message, relation, words);
  } catch (err) {
    // IA indispo : on ne sanctionne que les insultes claires adressées directement au chef
    console.warn('[protection] vérification IA impossible :', err.message);
    verdict = { insulte_le_chef: relation === 'direct' && strong.length > 0, mot: strong[0] ?? '' };
  }
  if (!verdict?.insulte_le_chef) {
    console.log(`[protection] « ${truncate(message.content, 80)} » de ${message.author.username} : pas une insulte envers le chef (${verdict?.raison ?? '?'})`);
    return;
  }
  await punish(client, message, verdict.mot || words[0]);
}
