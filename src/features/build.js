// Construction de salons depuis /pannel : un thème, combien de salons écrits et vocaux, le nom de la
// catégorie, privé ou non → aperçu de ce qui va être créé → « Construire ». Le bot crée tout d'un coup.
// Thème « libre » : l'IA propose des noms qui collent à ta description.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, OverwriteType, PermissionFlagsBits as P } from 'discord.js';
import { chatJson } from '../ai/gemini.js';
import { art, buildModal, field as f, readModal } from '../panels/ui.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const TTL = 30 * 60_000;
const plans = new Map();

// Noms prêts à l'emploi : [emoji, nom] pour l'écrit, puis pour le vocal
export const THEMES = {
  communaute: {
    label: 'Communauté', emoji: '🏡',
    text: [['👋', 'bienvenue'], ['📜', 'règles'], ['📢', 'annonces'], ['💬', 'général'], ['📸', 'médias'], ['😂', 'memes'], ['🎨', 'créations'], ['💡', 'suggestions'], ['🎉', 'événements'], ['🤖', 'commandes'], ['🗳️', 'sondages'], ['🔗', 'partages'], ['🎂', 'anniversaires'], ['⭐', 'présentations'], ['🌙', 'nocturne']],
    voice: [['🔊', 'Salon vocal'], ['🎮', 'Gaming'], ['🎶', 'Musique'], ['☕', 'Détente'], ['📚', 'Travail'], ['🎤', 'Karaoké'], ['🌙', 'Nuit'], ['👥', 'Entre potes'], ['🎧', 'Écoute'], ['🔒', 'Privé']],
  },
  gaming: {
    label: 'Gaming', emoji: '🎮',
    text: [['🎮', 'discussions-jeux'], ['🔎', 'recherche-de-joueurs'], ['🏆', 'tournois'], ['🎬', 'clips'], ['📰', 'patch-notes'], ['💡', 'astuces'], ['🛒', 'bons-plans'], ['📸', 'captures'], ['🤝', 'team-up'], ['🎲', 'jeux-du-moment'], ['⚔️', 'valorant'], ['🧱', 'fortnite'], ['⛏️', 'minecraft'], ['⚽', 'fc'], ['🚀', 'rocket-league']],
    voice: [['🎮', 'Partie 1'], ['🎮', 'Partie 2'], ['🎮', 'Partie 3'], ['🏆', 'Tournoi'], ['🎧', 'Stream'], ['🔇', 'AFK'], ['⚔️', 'Ranked'], ['🤝', 'Duo'], ['👥', 'Squad'], ['🎯', 'Entraînement']],
  },
  rp: {
    label: 'Jeu de rôle (RP)', emoji: '🎭',
    text: [['📜', 'lore'], ['🧾', 'fiches-perso'], ['🏙️', 'ville'], ['🏰', 'château'], ['🌲', 'forêt'], ['🍺', 'taverne'], ['⚔️', 'arène'], ['🏪', 'marché'], ['🕯️', 'crypte'], ['🚓', 'commissariat'], ['🏥', 'hôpital'], ['💼', 'hors-rp'], ['🗺️', 'carte'], ['📰', 'journal'], ['🎲', 'dés']],
    voice: [['🎭', 'Scène RP'], ['🍺', 'Taverne'], ['🏙️', 'Ville'], ['⚔️', 'Combat'], ['🗣️', 'Hors RP'], ['🕯️', 'Mystère'], ['🏰', 'Cour royale'], ['🌲', 'Expédition'], ['🚓', 'Patrouille'], ['🎲', 'Maître du jeu']],
  },
  etude: {
    label: 'Études', emoji: '📚',
    text: [['📌', 'infos'], ['❓', 'questions'], ['📐', 'maths'], ['🧪', 'sciences'], ['🌍', 'histoire-géo'], ['🇬🇧', 'anglais'], ['✍️', 'français'], ['💻', 'informatique'], ['📝', 'fiches'], ['📅', 'planning'], ['🎯', 'objectifs'], ['📚', 'ressources'], ['🧠', 'méthodes'], ['🗂️', 'devoirs'], ['🏅', 'réussites']],
    voice: [['📚', 'Révisions'], ['🤫', 'Silence'], ['🧑‍🏫', 'Cours'], ['❓', 'Entraide'], ['☕', 'Pause'], ['🎧', 'Focus'], ['📝', 'Exam blanc'], ['👥', 'Groupe 1'], ['👥', 'Groupe 2'], ['🌙', 'Nuit blanche']],
  },
  musique: {
    label: 'Musique', emoji: '🎵',
    text: [['🎵', 'partage-de-sons'], ['🔥', 'nouveautés'], ['🎤', 'freestyle'], ['🎹', 'prods'], ['🎧', 'playlists'], ['💿', 'albums'], ['📢', 'sorties'], ['🎼', 'paroles'], ['🎚️', 'mixage'], ['🎬', 'clips'], ['🗳️', 'votes'], ['🏆', 'classement'], ['🤝', 'collabs'], ['📻', 'radio'], ['💬', 'avis']],
    voice: [['🎧', 'Écoute'], ['🎤', 'Studio'], ['🎹', 'Prod'], ['📻', 'Radio'], ['🎶', 'Blind test'], ['🎼', 'Karaoké'], ['🔊', 'Soirée'], ['🎚️', 'Mix'], ['👥', 'Collab'], ['🌙', 'Chill']],
  },
  staff: {
    label: 'Staff', emoji: '🛡️',
    text: [['📋', 'staff-infos'], ['💬', 'staff-discussion'], ['🚨', 'signalements'], ['🗒️', 'sanctions'], ['📊', 'rapports'], ['🗳️', 'votes-staff'], ['🧾', 'candidatures'], ['📅', 'réunions'], ['🔧', 'config'], ['🤖', 'logs-bot'], ['🗄️', 'archives'], ['📌', 'à-faire'], ['🎫', 'suivi-tickets'], ['💡', 'idées'], ['🔒', 'admin']],
    voice: [['🛡️', 'Réunion staff'], ['🔒', 'Admin'], ['🚨', 'Urgence'], ['🎫', 'Support vocal'], ['☕', 'Pause staff'], ['📋', 'Entretien'], ['👥', 'Modérateurs'], ['🔧', 'Technique'], ['🗳️', 'Vote'], ['🌙', 'Garde de nuit']],
  },
  libre: { label: 'Libre (l’IA invente)', emoji: '✨', text: [], voice: [] },
};

export const BUILD_FIELDS = () => [
  f.choice('theme', 'Thème', Object.entries(THEMES).map(([value, t]) => ({ label: t.label, value, emoji: t.emoji })), { req: true }),
  f.text('categorie', 'Nom de la catégorie', { req: true, max: 90, ph: 'Ex : ✦ COMMUNAUTÉ ✦' }),
  f.int('ecrits', 'Salons écrits (0 à 15)', { req: true, min: 0, top: 15, value: 5 }),
  f.int('vocaux', 'Salons vocaux (0 à 10)', { req: true, min: 0, top: 10, value: 2 }),
  f.text('idee', 'Thème libre / style (facultatif)', { max: 200, ph: 'Ex : serveur Naruto, style « │・nom »' }),
];

const STYLES = [(e, n) => `${e}・${n}`, (e, n) => `│${e}・${n}`, (e, n) => `${e}┃${n}`];

async function aiNames(idea, text, voice) {
  const data = await chatJson({
    system: 'Tu crées des noms de salons Discord en français : courts, clairs, avec un emoji chacun. Écrits en minuscules avec des tirets, vocaux avec majuscules et espaces.',
    prompt: `Thème du serveur : ${idea || 'communauté'}.\nDonne ${text} salons écrits et ${voice} salons vocaux.`,
    schema: {
      type: 'object',
      properties: {
        ecrits: { type: 'array', items: { type: 'object', properties: { emoji: { type: 'string' }, nom: { type: 'string' } }, required: ['emoji', 'nom'] } },
        vocaux: { type: 'array', items: { type: 'object', properties: { emoji: { type: 'string' }, nom: { type: 'string' } }, required: ['emoji', 'nom'] } },
      },
      required: ['ecrits', 'vocaux'],
    },
    thinking: 'low', exactThinking: true,
  });
  const clean = (list, n, lower) => (list ?? []).slice(0, n).map((x) => [String(x.emoji).slice(0, 4) || '•', String(lower ? x.nom.toLowerCase().replace(/\s+/g, '-') : x.nom).slice(0, 40)]);
  return { text: clean(data.ecrits, text, true), voice: clean(data.vocaux, voice, false) };
}

function pick(list, n, shift) {
  if (!list.length) return [];
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[(i + shift) % list.length]);
  return out;
}

async function makePlan(values, userId, guildId, shift = 0) {
  const theme = THEMES[values.theme] ?? THEMES.communaute;
  let names;
  if (values.theme === 'libre' || (values.idee && shift > 0)) {
    names = await aiNames(values.idee || theme.label, values.ecrits, values.vocaux).catch(() => null);
  }
  const base = THEMES[values.theme === 'libre' ? 'communaute' : values.theme] ?? THEMES.communaute;
  names ??= { text: pick(base.text, values.ecrits, shift * 3), voice: pick(base.voice, values.vocaux, shift * 2) };
  const style = STYLES[(/│/.test(values.idee ?? '') ? 1 : /┃/.test(values.idee ?? '') ? 2 : 0 + shift) % STYLES.length];
  return {
    id: Math.random().toString(36).slice(2, 10), userId, guildId, at: Date.now(), values, shift, style,
    category: values.categorie, text: names.text.map(([e, n]) => style(e, n)), voice: names.voice.map(([e, n]) => `${e} ${n}`),
    privateRoleId: null,
  };
}

function planMessage(plan) {
  const gif = art('panneaux', 'build');
  const embed = new EmbedBuilder()
    .setColor(0xffa04d)
    .setTitle('🏗️ Aperçu de la construction')
    .setDescription(`📁 **${plan.category}**\n${plan.text.map((n) => `┣ 💬 ${n}`).join('\n')}${plan.voice.length ? `\n${plan.voice.map((n) => `┣ 🔊 ${n}`).join('\n')}` : ''}`)
    .addFields({ name: 'Total', value: `${plan.text.length} écrit(s) · ${plan.voice.length} vocal(aux) · ${plan.privateRoleId ? `visible seulement par <@&${plan.privateRoleId}>` : 'visible par tout le monde'}` })
    .setImage(gif.url)
    .setFooter({ text: 'Rien n’est créé tant que tu n’as pas cliqué sur Construire' });
  return {
    embeds: [embed], files: gif.files, attachments: [],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bd:go:${plan.id}`).setLabel('Construire').setEmoji('🏗️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`bd:again:${plan.id}`).setLabel('Autres noms').setEmoji('🎲').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`bd:private:${plan.id}`).setLabel(plan.privateRoleId ? 'Changer le rôle' : 'Rendre privé').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`bd:cancel:${plan.id}`).setLabel('Annuler').setEmoji('✖️').setStyle(ButtonStyle.Danger),
    )],
  };
}

/** Action de /pannel après la fenêtre : prépare l'aperçu. */
export async function startBuild(interaction, values) {
  if ((values.ecrits ?? 0) + (values.vocaux ?? 0) === 0) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Demande au moins un salon.')], ...PRIVATE });
  await interaction.deferReply(PRIVATE);
  const plan = await makePlan(values, interaction.user.id, interaction.guildId);
  plans.set(plan.id, plan);
  for (const [id, old] of plans) if (Date.now() - old.at > TTL) plans.delete(id);
  return interaction.editReply(planMessage(plan));
}

export const isBuildComponent = (interaction) => (interaction.customId ?? '').startsWith('bd:');

export async function handleBuildComponent(client, interaction) {
  const [, what, id] = interaction.customId.split(':');
  const plan = plans.get(id);
  if (!plan || plan.userId !== interaction.user.id) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Cet aperçu a expiré. Recommence depuis **/pannel**.')], ...PRIVATE });
  if (what === 'cancel') {
    plans.delete(id);
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('✖️ Construction annulée, rien n’a été créé.')], components: [], files: [], attachments: [] });
  }
  if (what === 'private') return interaction.showModal(buildModal(`bd:privatesave:${id}`, '🔒 Catégorie privée', [f.role('role', 'Seul ce rôle verra la catégorie', { req: true })]));
  if (what === 'privatesave') {
    const { values } = await readModal(interaction, [f.role('role', 'Rôle', { req: true })]);
    plan.privateRoleId = values?.role?.id ?? plan.privateRoleId;
    return interaction.update(planMessage(plan));
  }
  if (what === 'again') {
    await interaction.deferUpdate();
    const next = await makePlan(plan.values, plan.userId, plan.guildId, plan.shift + 1);
    next.id = plan.id;
    next.privateRoleId = plan.privateRoleId;
    plans.set(id, next);
    return interaction.editReply(planMessage(next));
  }
  if (what === 'go') {
    const guild = interaction.guild;
    if (!guild.members.me.permissions.has(P.ManageChannels)) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Il me faut la permission **Gérer les salons**.')], ...PRIVATE });
    await interaction.update({ embeds: [new EmbedBuilder().setColor(0xffa04d).setDescription('🏗️ Construction en cours…')], components: [], files: [], attachments: [] });
    plans.delete(id);
    const overwrites = plan.privateRoleId
      ? [{ id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [P.ViewChannel] }, { id: plan.privateRoleId, type: OverwriteType.Role, allow: [P.ViewChannel] }]
      : [];
    const category = await guild.channels.create({ name: plan.category, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: `Construction demandée par ${interaction.user.username}` });
    const made = [];
    for (const name of plan.text) made.push(await guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id }).catch(() => null));
    for (const name of plan.voice) made.push(await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: category.id }).catch(() => null));
    const ok = made.filter(Boolean);
    const gif = art('panneaux', 'build');
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x3dff9a).setTitle('✅ Construction terminée')
        .setDescription(`📁 **${category.name}**\n${ok.map((c) => `┣ ${c}`).join('\n')}${ok.length < made.length ? `\n\n⚠️ ${made.length - ok.length} salon(s) n’ont pas pu être créés (nom refusé par Discord ?).` : ''}`)
        .setImage(gif.url)],
      files: gif.files,
    });
  }
  return undefined;
}
