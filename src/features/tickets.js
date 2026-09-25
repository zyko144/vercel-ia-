// Tickets : un panneau « Ouvrir un ticket » créé depuis /pannel, avec aperçu avant publication.
// - Création : titre, message, image, texte du bouton, salon → aperçu privé → couleur, réglages
//   (rôle du staff, catégorie, salon des archives, message d'accueil) → Publier.
// - Ouverture : un salon privé par ticket (le membre + le staff), numéroté, avec un message d'accueil.
// - Dans le ticket : prendre en charge, ajouter quelqu'un, fermer (confirmation, puis transcription
//   envoyée aux archives et au membre, et le salon est supprimé).
// Tout est gardé dans le stockage du bot (clé « tickets »).
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags,
  OverwriteType, PermissionFlagsBits as P, StringSelectMenuBuilder,
} from 'discord.js';
import { load, save } from '../storage.js';
import { art, buildModal, field as f, readModal } from '../panels/ui.js';
import { brandingOf } from './premium.js';
import { countEvent } from './weekly.js';

const KEY = 'tickets';
const PRIVATE = { flags: MessageFlags.Ephemeral };
const DRAFT_TTL = 30 * 60_000;
const MAX_IMAGE = 8 * 1024 * 1024;

export const COLORS = {
  cyan: { label: 'Cyan néon', value: 0x5ff0ff, emoji: '🩵' },
  or: { label: 'Or', value: 0xffc94d, emoji: '💛' },
  violet: { label: 'Violet', value: 0xa58bff, emoji: '💜' },
  rose: { label: 'Rose', value: 0xff5fd2, emoji: '🩷' },
  vert: { label: 'Vert', value: 0x3dff9a, emoji: '💚' },
  rouge: { label: 'Rouge', value: 0xff3355, emoji: '❤️' },
  bleu: { label: 'Bleu Discord', value: 0x5865f2, emoji: '💙' },
  noir: { label: 'Noir', value: 0x1e1f22, emoji: '🖤' },
};

const drafts = new Map(); // id -> brouillon (aperçu en cours)
let store = null;
async function data() {
  store ??= (await load(KEY, {}).catch(() => ({}))) ?? {};
  return store;
}
const persist = () => save(KEY, store);
async function guildData(guildId) {
  const all = await data();
  return (all[guildId] ??= { counter: 0, panels: {}, open: {} });
}
const newId = () => Math.random().toString(36).slice(2, 10);
const cut = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const isTicketComponent = (interaction) => /^(tk|tkd):/.test(interaction.customId ?? '');

// ===================== Brouillon et aperçu =====================

export const TICKET_FIELDS = (d = {}) => [
  f.text('titre', 'Titre', { req: true, max: 200, value: d.title ?? '🎫 Besoin d’aide ?' }),
  f.para('message', 'Message', { req: true, max: 3000, value: d.message ?? 'Clique sur le bouton ci-dessous pour ouvrir un ticket.\nUn membre du staff te répond au plus vite, en privé.' }),
  f.file('image', 'Image de l’embed (facultatif)'),
  f.text('bouton', 'Texte du bouton', { max: 60, value: d.button ?? 'Ouvrir un ticket' }),
  f.channel('salon', 'Salon où publier le panneau', { req: !d.channelId, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] }),
];

const SETTINGS_FIELDS = () => [
  f.role('staff', 'Rôle du staff (voit et gère les tickets)'),
  f.channel('categorie', 'Catégorie des tickets (vide = créée)', { types: [ChannelType.GuildCategory] }),
  f.channel('archives', 'Salon des archives (transcriptions)', { types: [ChannelType.GuildText] }),
  f.para('accueil', 'Message d’accueil dans le ticket', { max: 1000, ph: 'Explique ton problème, un membre du staff arrive.' }),
  f.bool('unique', 'Un seul ticket ouvert par membre ?'),
];

/** Télécharge l'image envoyée dans la fenêtre : les liens de ces fichiers expirent, on la republie. */
async function grabImage(attachment) {
  if (!attachment) return null;
  if (!/^image\//.test(attachment.contentType ?? '') || attachment.size > MAX_IMAGE) return { error: 'L’image doit être un fichier image de 8 Mo maximum.' };
  const res = await fetch(attachment.url).catch(() => null);
  if (!res?.ok) return { error: 'Impossible de récupérer l’image, réessaie.' };
  const ext = (attachment.name?.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  return { buffer: Buffer.from(await res.arrayBuffer()), name: `image.${ext}` };
}

function draftEmbed(d) {
  const embed = new EmbedBuilder().setColor(d.color).setTitle(cut(d.title, 256)).setDescription(cut(d.message, 4000));
  const brand = brandingOf(d.guildId);
  embed.setFooter({ text: brand?.name ?? d.guildName ?? 'Support', iconURL: brand?.logo ?? d.guildIcon ?? undefined });
  if (d.image) embed.setImage(`attachment://${d.image.name}`);
  return embed;
}
const draftFiles = (d) => (d.image ? [new AttachmentBuilder(d.image.buffer, { name: d.image.name })] : []);

function previewMessage(d) {
  const kindLabel = d.kind === 'ticket' ? 'panneau de tickets' : 'annonce';
  const info = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setDescription([
      `👀 **Aperçu de ton ${kindLabel}** (visible que par toi). Ajuste, puis publie.`,
      `📍 Sera publié dans <#${d.channelId}>`,
      d.kind === 'ticket'
        ? `🛡️ Staff : ${d.staffRoleId ? `<@&${d.staffRoleId}>` : 'les admins seulement'} · 📁 Catégorie : ${d.categoryId ? `<#${d.categoryId}>` : 'créée à la première ouverture'} · 🗄️ Archives : ${d.logChannelId ? `<#${d.logChannelId}>` : 'aucune'} · ${d.unique === false ? 'plusieurs tickets possibles' : '1 ticket par membre'}`
        : `📣 Mention : ${d.ping ? (d.ping === 'everyone' ? '@everyone' : `<@&${d.ping}>`) : 'personne'}`,
    ].join('\n'));
  const demo = d.kind === 'ticket'
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tkd:demo').setLabel(cut(d.button, 80)).setEmoji('🎫').setStyle(ButtonStyle.Success).setDisabled(true))]
    : [];
  const controls = [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`tkd:color:${d.id}`).setPlaceholder('🎨 Couleur de l’embed')
      .addOptions(Object.entries(COLORS).map(([value, c]) => ({ label: c.label, value, emoji: c.emoji, default: c.value === d.color })))),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tkd:edit:${d.id}`).setLabel('Modifier le texte').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      ...(d.kind === 'ticket' ? [new ButtonBuilder().setCustomId(`tkd:settings:${d.id}`).setLabel('Réglages').setEmoji('⚙️').setStyle(ButtonStyle.Secondary)] : []),
      new ButtonBuilder().setCustomId(`tkd:publish:${d.id}`).setLabel('Publier').setEmoji('📤').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`tkd:cancel:${d.id}`).setLabel('Annuler').setEmoji('✖️').setStyle(ButtonStyle.Danger),
    ),
  ];
  return { embeds: [info, draftEmbed(d)], files: draftFiles(d), components: [...demo, ...controls] };
}

/** Action de /pannel : ouvre (ou reprend) un brouillon après la fenêtre. */
export async function startDraft(interaction, values, kind) {
  const image = await grabImage(values.image);
  if (image?.error) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${image.error}`)], ...PRIVATE });
  const d = {
    id: newId(), kind, userId: interaction.user.id, guildId: interaction.guildId, guildName: interaction.guild?.name, guildIcon: interaction.guild?.iconURL() ?? null,
    title: values.titre, message: values.message, button: values.bouton || 'Ouvrir un ticket', channelId: values.salon?.id ?? interaction.channelId,
    color: kind === 'ticket' ? COLORS.cyan.value : COLORS.or.value, image, staffRoleId: null, categoryId: null, logChannelId: null, welcome: null, unique: true,
    ping: values.mention === 'everyone' ? 'everyone' : values.mention?.id ?? null, at: Date.now(),
  };
  drafts.set(d.id, d);
  for (const [id, old] of drafts) if (Date.now() - old.at > DRAFT_TTL) drafts.delete(id);
  return interaction.reply({ ...previewMessage(d), ...PRIVATE });
}

async function handleDraft(client, interaction) {
  const [, what, id] = interaction.customId.split(':');
  const d = drafts.get(id);
  if (!d || d.userId !== interaction.user.id) {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Ce brouillon a expiré. Recommence depuis **/pannel**.')], ...PRIVATE });
  }
  d.at = Date.now();
  if (what === 'color') {
    d.color = COLORS[interaction.values[0]]?.value ?? d.color;
    return interaction.update({ ...previewMessage(d), attachments: [] });
  }
  if (what === 'edit' || what === 'editsave') {
    const fields = d.kind === 'ticket'
      ? [...TICKET_FIELDS(d).filter((x) => x.id !== 'salon' && x.id !== 'image'), f.text('categories', 'Catégories (séparées par | , vide = aucune)', { max: 400, value: (d.categories ?? []).join(' | '), ph: '🛒 Achat | 🐛 Bug | 🚨 Signalement | ❓ Question' })]
      : ANNOUNCE_FIELDS(d).filter((x) => !['salon', 'image', 'mention'].includes(x.id));
    if (what === 'edit') return interaction.showModal(buildModal(`tkd:editsave:${d.id}`, '✏️ Modifier le texte', fields));
    const { values, error } = await readModal(interaction, fields);
    if (error) return interaction.reply({ content: `❌ ${error}`, ...PRIVATE });
    d.title = values.titre ?? d.title;
    d.message = values.message ?? d.message;
    d.button = values.bouton ?? d.button;
    if (d.kind === 'ticket') d.categories = String(values.categories ?? '').split('|').map((x) => x.trim()).filter(Boolean).slice(0, 25);
    return interaction.update({ ...previewMessage(d), attachments: [] });
  }
  if (what === 'settings') return interaction.showModal(buildModal(`tkd:settingssave:${d.id}`, '⚙️ Réglages des tickets', SETTINGS_FIELDS()));
  if (what === 'settingssave') {
    const { values, error } = await readModal(interaction, SETTINGS_FIELDS());
    if (error) return interaction.reply({ content: `❌ ${error}`, ...PRIVATE });
    d.staffRoleId = values.staff?.id ?? d.staffRoleId;
    d.categoryId = values.categorie?.id ?? d.categoryId;
    d.logChannelId = values.archives?.id ?? d.logChannelId;
    d.welcome = values.accueil ?? d.welcome;
    if (values.unique !== undefined) d.unique = values.unique;
    return interaction.update({ ...previewMessage(d), attachments: [] });
  }
  if (what === 'cancel') {
    drafts.delete(id);
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('✖️ Brouillon annulé, rien n’a été publié.')], components: [], files: [], attachments: [] });
  }
  if (what === 'publish') return publish(client, interaction, d);
  return undefined;
}

/** Publie un brouillon (panneau de tickets ou annonce). Renvoie { channel, message } ou { error }. */
async function sendDraft(client, d) {
  const channel = client.channels.cache.get(d.channelId);
  const me = channel?.guild?.members.me;
  if (!channel?.isTextBased?.() || (channel.guildId ?? channel.guild?.id) !== d.guildId || !channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles])) {
    return { error: `Je ne peux pas écrire dans <#${d.channelId}> (il me faut Voir, Envoyer, Intégrer des liens et Joindre des fichiers).` };
  }
  const panelId = newId();
  // Avec des catégories : un menu pour choisir le motif du ticket ; sinon un simple bouton
  const components = d.kind !== 'ticket' ? [] : d.categories?.length
    ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`tk:cat:${panelId}`).setPlaceholder(`🎫 ${cut(d.button, 100)} : choisis le motif`)
      .addOptions(d.categories.map((c, i) => ({ label: cut(c, 100), value: String(i) }))))]
    : [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`tk:open:${panelId}`).setLabel(cut(d.button, 80)).setEmoji('🎫').setStyle(ButtonStyle.Success))];
  const content = d.kind === 'annonce' && d.ping ? (d.ping === 'everyone' ? '@everyone' : `<@&${d.ping}>`) : undefined;
  const message = await channel.send({
    content, embeds: [draftEmbed(d)], files: draftFiles(d), components,
    allowedMentions: d.ping === 'everyone' ? { parse: ['everyone'] } : d.ping ? { roles: [d.ping] } : { parse: [] },
  });
  if (d.kind === 'ticket') {
    const g = await guildData(d.guildId);
    g.panels[panelId] = {
      id: panelId, channelId: channel.id, messageId: message.id, staffRoleId: d.staffRoleId, categoryId: d.categoryId,
      logChannelId: d.logChannelId, welcome: d.welcome, unique: d.unique !== false, color: d.color, title: d.title, createdBy: d.userId, at: Date.now(), categories: d.categories ?? [],
    };
    persist();
  }
  return { channel, message };
}

async function publish(client, interaction, d) {
  const sent = await sendDraft(client, d);
  if (sent.error) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${sent.error}`)], ...PRIVATE });
  const { channel, message } = sent;
  drafts.delete(d.id);
  const done = new EmbedBuilder().setColor(0x3dff9a).setDescription(`✅ ${d.kind === 'ticket' ? 'Panneau de tickets' : 'Annonce'} publié${d.kind === 'ticket' ? '' : 'e'} dans ${channel} · [voir le message](${message.url})`);
  return interaction.update({ embeds: [done], components: [], files: [], attachments: [] });
}

// ===================== Annonce (même aperçu) =====================

export const ANNOUNCE_FIELDS = (d = {}) => [
  f.text('titre', 'Titre', { req: true, max: 200, value: d.title }),
  f.para('message', 'Message (le markdown Discord marche)', { req: true, max: 3500, value: d.message }),
  f.file('image', 'Image (facultatif)'),
  f.channel('salon', 'Salon où publier', { req: !d.channelId, types: [ChannelType.GuildText, ChannelType.GuildAnnouncement] }),
  f.role('mention', 'Rôle à mentionner (facultatif)'),
];

// ===================== Tickets ouverts =====================

const slug = (text) => String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'membre';

async function openTicket(client, interaction, panelId, categoryIndex = null) {
  const g = await guildData(interaction.guildId);
  const panel = g.panels[panelId];
  const topic = categoryIndex !== null ? panel?.categories?.[Number(categoryIndex)] ?? null : null;
  if (!panel) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Ce panneau de tickets n’existe plus. Préviens le staff.')], ...PRIVATE });
  const mine = Object.entries(g.open).find(([channelId, t]) => t.userId === interaction.user.id && interaction.guild.channels.cache.has(channelId));
  if (panel.unique && mine) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffc94d).setDescription(`🎫 Tu as déjà un ticket ouvert : <#${mine[0]}>`)], ...PRIVATE });
  await interaction.deferReply(PRIVATE);

  const guild = interaction.guild;
  const me = guild.members.me;
  if (!me.permissions.has([P.ManageChannels, P.ManageRoles])) {
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Il me faut les permissions **Gérer les salons** et **Gérer les rôles** pour créer les tickets.')] });
  }
  let category = panel.categoryId ? guild.channels.cache.get(panel.categoryId) : null;
  if (!category) {
    category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && /tickets?/i.test(c.name))
      ?? await guild.channels.create({ name: '🎫 Tickets', type: ChannelType.GuildCategory });
    panel.categoryId = category.id;
  }
  g.counter += 1;
  const number = String(g.counter).padStart(4, '0');
  const overwrites = [
    { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [P.ViewChannel] },
    { id: interaction.user.id, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.EmbedLinks, P.ReadMessageHistory] },
    { id: me.id, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory, P.ManageMessages] },
  ];
  if (panel.staffRoleId && guild.roles.cache.has(panel.staffRoleId)) {
    overwrites.push({ id: panel.staffRoleId, type: OverwriteType.Role, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.EmbedLinks, P.ReadMessageHistory, P.ManageMessages] });
  }
  const channel = await guild.channels.create({
    name: `${topic ? slug(topic).slice(0, 12) : 'ticket'}-${number}-${slug(interaction.member?.displayName ?? interaction.user.username)}`,
    type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites,
    topic: `Ticket n°${number} de ${interaction.user.tag ?? interaction.user.username}${topic ? ` · ${cut(topic, 60)}` : ''} · ouvert via le panneau « ${cut(panel.title, 60)} »`,
  });
  g.open[channel.id] = { userId: interaction.user.id, number, panelId, openedAt: Date.now(), claimedBy: null, topic };
  countEvent(guild.id, 'tickets');
  persist();

  const gif = art('panneaux', 'ticket');
  const welcome = new EmbedBuilder()
    .setColor(panel.color ?? COLORS.cyan.value)
    .setTitle(`🎫 Ticket n°${number}${topic ? ` · ${cut(topic, 80)}` : ''}`)
    .setDescription([
      `Salut ${interaction.user} ! ${panel.welcome ?? 'Explique ton problème ici, un membre du staff te répond au plus vite.'}`,
      '',
      '• Seuls toi et le staff voient ce salon.',
      '• **Fermer** quand c’est réglé : tu recevras la transcription en MP.',
    ].join('\n'))
    .setImage(gif.url)
    .setFooter({ text: brandingOf(guild.id)?.name ?? guild.name, iconURL: brandingOf(guild.id)?.logo ?? guild.iconURL() ?? undefined })
    .setTimestamp();
  await channel.send({
    content: `${interaction.user}${panel.staffRoleId ? ` · <@&${panel.staffRoleId}>` : ''}`,
    embeds: [welcome], files: gif.files, components: [ticketButtons()],
    allowedMentions: { users: [interaction.user.id], roles: panel.staffRoleId ? [panel.staffRoleId] : [] },
  });
  return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setDescription(`✅ Ton ticket est ouvert : ${channel}`)] });
}

const ticketButtons = (claimed = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('tk:claim').setLabel(claimed ? 'Pris en charge' : 'Prendre en charge').setEmoji('🙋').setStyle(ButtonStyle.Primary).setDisabled(claimed),
  new ButtonBuilder().setCustomId('tk:add').setLabel('Ajouter quelqu’un').setEmoji('➕').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('tk:close').setLabel('Fermer').setEmoji('🔒').setStyle(ButtonStyle.Danger),
);

function isStaff(interaction, panel) {
  return Boolean(interaction.memberPermissions?.has(P.ManageChannels) || (panel?.staffRoleId && interaction.member?.roles?.cache?.has(panel.staffRoleId)));
}

async function transcript(channel) {
  const all = [];
  let before;
  for (let i = 0; i < 5; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    all.push(...batch.values());
    before = batch.last().id;
  }
  const lines = all.reverse().map((m) => {
    const when = new Date(m.createdTimestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    const extra = [m.embeds.length ? `[${m.embeds.length} embed]` : '', ...m.attachments.map((a) => a.url)].filter(Boolean).join(' ');
    return `[${when}] ${m.author?.username ?? '?'} : ${m.content}${extra ? ` ${extra}` : ''}`;
  });
  return Buffer.from(`Transcription de #${channel.name}\n${'='.repeat(40)}\n${lines.join('\n')}\n`, 'utf8');
}

const staffStats = (g, id) => ((g.stats ??= {})[id] ??= { claimed: 0, closed: 0, ratings: [] });

/** Les statistiques du staff sur les tickets (idée 68). */
export async function ticketStaffEmbed(guild) {
  const g = await guildData(guild.id);
  const rows = Object.entries(g.stats ?? {}).map(([id, s]) => ({ id, ...s, avg: s.ratings.length ? s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length : null }))
    .sort((a, b) => (b.closed + b.claimed) - (a.closed + a.claimed)).slice(0, 15);
  const stars = (n) => (n === null ? '—' : `${'⭐'.repeat(Math.round(n))} ${n.toFixed(1)}`);
  return new EmbedBuilder().setColor(0xc9a978).setTitle(`🎫 Le staff et les tickets · ${guild.name}`)
    .setDescription(rows.length ? rows.map((r, i) => `**${i + 1}.** <@${r.id}> · 🙋 ${r.claimed} pris · 🔒 ${r.closed} fermés · ${stars(r.avg)} (${r.ratings.length} note${r.ratings.length > 1 ? 's' : ''})`).join('\n') : 'Aucun ticket traité pour l’instant.')
    .setFooter({ text: `${g.counter} tickets ouverts depuis le début · ${Object.keys(g.open).length} ouverts maintenant` });
}

async function handleTicket(client, interaction) {
  const [, what, ref, a, b] = interaction.customId.split(':');
  if (what === 'open') return openTicket(client, interaction, ref);
  if (what === 'cat') return openTicket(client, interaction, ref, interaction.values[0]);
  if (what === 'rate') {
    // Note de satisfaction envoyée en MP : tk:rate:<serveur>:<étoiles>:<membre du staff>
    const g = await guildData(ref);
    if (b && b !== 'x') staffStats(g, b).ratings.push(Number(a));
    ((g.ratings ??= []).push({ at: Date.now(), stars: Number(a), staff: b !== 'x' ? b : null }));
    if (g.ratings.length > 500) g.ratings.shift();
    persist();
    return interaction.update({ components: [], embeds: [new EmbedBuilder().setColor(0x3fbf6a).setDescription(`Merci ! Tu as donné ${'⭐'.repeat(Number(a))} au support.`)] });
  }

  const g = await guildData(interaction.guildId);
  const ticket = g.open[interaction.channelId];
  if (!ticket) return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription('❌ Ce salon n’est pas (ou plus) un ticket ouvert.')], ...PRIVATE });
  const panel = g.panels[ticket.panelId];

  if (what === 'claim') {
    if (!isStaff(interaction, panel)) return interaction.reply({ content: '🔒 Réservé au staff.', ...PRIVATE });
    ticket.claimedBy = interaction.user.id;
    staffStats(g, interaction.user.id).claimed += 1;
    persist();
    await interaction.update({ components: [ticketButtons(true)] });
    return interaction.channel.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription(`🙋 ${interaction.user} prend ce ticket en charge.`)] });
  }
  if (what === 'add') {
    if (!isStaff(interaction, panel) && interaction.user.id !== ticket.userId) return interaction.reply({ content: '🔒 Réservé au staff et à l’auteur du ticket.', ...PRIVATE });
    return interaction.showModal(buildModal('tk:addsave', '➕ Ajouter quelqu’un au ticket', [f.user('membre', 'Membre à ajouter', { req: true })]));
  }
  if (what === 'addsave') {
    const { values } = await readModal(interaction, [f.user('membre', 'Membre', { req: true })]);
    if (!values?.membre) return interaction.reply({ content: '❌ Choisis un membre.', ...PRIVATE });
    await interaction.channel.permissionOverwrites.edit(values.membre.user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setDescription(`➕ ${values.membre.user} a été ajouté au ticket.`)] });
  }
  if (what === 'close') {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0xff3355).setDescription('🔒 Fermer ce ticket ? La transcription sera envoyée aux archives et à son auteur, puis le salon sera supprimé.')],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk:closeyes').setLabel('Oui, fermer').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('tk:closeno').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
      )],
      ...PRIVATE,
    });
  }
  if (what === 'closeno') return interaction.update({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setDescription('👌 Le ticket reste ouvert.')], components: [] });
  if (what === 'closeyes') {
    await interaction.update({ embeds: [new EmbedBuilder().setColor(0xff3355).setDescription('🔒 Fermeture dans 5 secondes…')], components: [] });
    const channel = interaction.channel;
    const file = await transcript(channel);
    const summary = new EmbedBuilder()
      .setColor(0xff3355)
      .setTitle(`🗄️ Ticket n°${ticket.number} fermé`)
      .addFields(
        { name: 'Ouvert par', value: `<@${ticket.userId}>`, inline: true },
        { name: 'Fermé par', value: `${interaction.user}`, inline: true },
        { name: 'Pris en charge', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
        { name: 'Durée', value: `<t:${Math.round(ticket.openedAt / 1000)}:R> → maintenant`, inline: false },
      )
      .setTimestamp();
    if (ticket.topic) summary.addFields({ name: 'Motif', value: cut(ticket.topic, 200), inline: true });
    // Résumé du ticket par l'IA (idée 55)
    const { summarizeTicket } = await import('./assistant.js');
    const resume = await summarizeTicket(file.toString('utf8'));
    if (resume) summary.addFields({ name: '🧠 Résumé', value: resume });
    staffStats(g, interaction.user.id).closed += 1;
    const attach = () => new AttachmentBuilder(file, { name: `ticket-${ticket.number}.txt` });
    const logs = panel?.logChannelId ? client.channels.cache.get(panel.logChannelId) : null;
    await logs?.send({ embeds: [summary], files: [attach()], allowedMentions: { parse: [] } }).catch(() => {});
    const author = await client.users.fetch(ticket.userId).catch(() => null);
    await author?.send({ embeds: [summary.setDescription(`Ton ticket sur **${interaction.guild.name}** est fermé. Voici la transcription.`)], files: [attach()] }).catch(() => {});
    // Note de satisfaction (idée 67)
    const { cfg } = await import('./guildConfig.js');
    if (author && cfg(interaction.guildId, 'tickets.rating')) {
      const helper = ticket.claimedBy ?? (interaction.user.id !== ticket.userId ? interaction.user.id : 'x');
      await author.send({
        embeds: [new EmbedBuilder().setColor(0xc9a978).setDescription(`⭐ Comment s’est passé ton ticket sur **${interaction.guild.name}** ?`)],
        components: [new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map((n) => new ButtonBuilder().setCustomId(`tk:rate:${interaction.guildId}:${n}:${helper}`).setLabel('⭐'.repeat(n)).setStyle(n >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary)))],
      }).catch(() => {});
    }
    delete g.open[channel.id];
    persist();
    setTimeout(() => channel.delete(`Ticket fermé par ${interaction.user.username}`).catch(() => {}), 5_000);
  }
  return undefined;
}

/**
 * Ouvre un ticket sans panneau (contestation d'une sanction…) : salon privé membre + staff, mêmes boutons.
 * @returns {Promise<import('discord.js').TextChannel>}
 */
export async function openCustomTicket(guild, user, { title, description, categoryId, staffRoleId, prefix = 'ticket' }) {
  const g = await guildData(guild.id);
  const me = guild.members.me;
  let category = categoryId ? guild.channels.cache.get(categoryId) : null;
  category ??= guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && /tickets?|appels?|contestations?/i.test(c.name))
    ?? await guild.channels.create({ name: '⚖️ Contestations', type: ChannelType.GuildCategory });
  g.counter += 1;
  const number = String(g.counter).padStart(4, '0');
  const overwrites = [
    { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [P.ViewChannel] },
    { id: user.id, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory] },
    { id: me.id, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory] },
  ];
  if (staffRoleId && guild.roles.cache.has(staffRoleId)) overwrites.push({ id: staffRoleId, type: OverwriteType.Role, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] });
  const channel = await guild.channels.create({ name: `${prefix}-${number}-${slug(user.username)}`, parent: category.id, permissionOverwrites: overwrites, type: ChannelType.GuildText });
  g.open[channel.id] = { userId: user.id, number, panelId: null, openedAt: Date.now(), claimedBy: null };
  persist();
  countEvent(guild.id, 'tickets');
  await channel.send({
    content: `${user}${staffRoleId ? ` · <@&${staffRoleId}>` : ''}`,
    embeds: [new EmbedBuilder().setColor(0xffc94d).setTitle(`${title} · n°${number}`).setDescription(cut(description, 4000)).setTimestamp()],
    components: [ticketButtons()],
    allowedMentions: { users: [user.id], roles: staffRoleId ? [staffRoleId] : [] },
  });
  return channel;
}

/** Tous les boutons, menus et fenêtres des tickets et des annonces. */
export async function handleTicketComponent(client, interaction) {
  if (interaction.customId.startsWith('tkd:')) return handleDraft(client, interaction);
  return handleTicket(client, interaction);
}

/** Les tickets ouverts d'un serveur (tableau de bord, liste dans /pannel). */
/**
 * Publication depuis le tableau de bord du site : panneau de tickets ou annonce, sans passer par Discord.
 * opts : { kind: 'ticket'|'annonce', channelId, title, message, button, color (clé de COLORS), staffRoleId, categoryId, logChannelId, welcome, unique, ping }
 */
export async function publishFromWeb(client, guild, userId, opts) {
  const kind = opts.kind === 'annonce' ? 'annonce' : 'ticket';
  const d = {
    id: newId(), kind, userId, guildId: guild.id, guildName: guild.name, guildIcon: guild.iconURL() ?? null,
    title: cut(String(opts.title ?? '').trim(), 256), message: cut(String(opts.message ?? '').trim(), 4000), button: cut(String(opts.button || 'Ouvrir un ticket'), 80),
    channelId: String(opts.channelId ?? ''), color: COLORS[opts.color]?.value ?? (kind === 'ticket' ? COLORS.cyan.value : COLORS.or.value), image: null,
    staffRoleId: opts.staffRoleId || null, categoryId: opts.categoryId || null, logChannelId: opts.logChannelId || null,
    welcome: opts.welcome ? cut(String(opts.welcome), 1000) : null, unique: opts.unique !== false, ping: kind === 'annonce' ? opts.ping || null : null, at: Date.now(),
  };
  if (!d.title || !d.message) return { error: 'Le titre et le message sont obligatoires.' };
  const sent = await sendDraft(client, d);
  return sent.error ? sent : { ok: true, url: sent.message.url };
}

/** Panneaux de tickets publiés sur un serveur. */
export async function ticketPanels(guildId) {
  return Object.values((await guildData(guildId)).panels);
}

export async function openTickets(guildId) {
  const g = await guildData(guildId);
  return Object.entries(g.open).map(([channelId, t]) => ({ channelId, ...t }));
}
