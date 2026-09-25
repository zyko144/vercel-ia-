// Moteur des panneaux : /sanction, /jeux, /musique, /ia, /serveur, /pannel.
// 1. La commande ouvre un panneau (embed + bannière animée + menus d'actions), visible seulement par toi.
// 2. Choisir une action ouvre une fenêtre à remplir (ou lance tout de suite s'il n'y a rien à remplir).
// 3. L'action réutilise la commande existante : ses réponses texte sont mises en forme dans un embed
//    aux couleurs du panneau, avec son image animée (ou le tampon AVERTISSEMENT / SANCTION).
import { ActionRowBuilder, EmbedBuilder, MessageFlags, StringSelectMenuBuilder } from 'discord.js';
import { config } from '../config.js';
import { PANELS, PANEL_COMMANDS, findAction } from './catalog.js';
import './extra.js'; // actions dédiées : tickets, construction, premium…
import { art, buildModal, panelEmbed, readModal } from './ui.js';
import { brandingOf } from '../features/premium.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const cut = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const isPanelCommand = (interaction) => interaction.isChatInputCommand?.() && Boolean(PANEL_COMMANDS[interaction.commandName]);
export const isPanelComponent = (interaction) => /^p[nm]:/.test(interaction.customId ?? '');

function allowed(interaction, need) {
  if (!need || interaction.user.id === config.ownerId) return true;
  return Boolean(interaction.memberPermissions?.has(need));
}

/** Le panneau : présentation, bannière, un menu par groupe d'actions. */
export function panelMessage(interaction, key) {
  const panel = PANELS[key];
  const visible = panel.groups
    .map((g) => ({ ...g, actions: g.actions.filter((a) => !a.owner || interaction.user.id === config.ownerId) }))
    .filter((g) => g.actions.length);
  const count = visible.reduce((n, g) => n + g.actions.length, 0);
  const { embed, files } = panelEmbed(interaction.guildId, panel, {
    title: `${panel.emoji} ${panel.title}`,
    description: `${panel.intro}\n\n${visible.map((g) => `**${g.label}** · ${g.actions.slice(0, 6).map((a) => `${a.emoji} ${a.label}`).join(' · ')}${g.actions.length > 6 ? ` · … (+${g.actions.length - 6})` : ''}`).join('\n')}`,
  });
  embed.setFooter({ text: `${count} actions · choisis dans le menu ci-dessous${brandingOf(interaction.guildId)?.name ? ` · ${brandingOf(interaction.guildId).name}` : ''}` });
  const rows = visible.slice(0, 5).map((g) => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`pn:${key}:${panel.groups.indexOf(panel.groups.find((x) => x.label === g.label))}`)
      .setPlaceholder(cut(`${g.label} : choisis une action`, 150))
      .addOptions(g.actions.slice(0, 25).map((a) => ({ label: cut(a.label, 100), value: a.id, emoji: a.emoji, ...(a.desc ? { description: cut(a.desc, 100) } : {}) }))),
  ));
  return { embeds: [embed], files, components: rows };
}

export async function openPanel(client, interaction) {
  const key = PANEL_COMMANDS[interaction.commandName];
  // /jeux ouvre directement l'arcade (Activité Discord)
  if (key === 'jeux') {
    const { openArcade } = await import('../arcade/discord.js');
    return openArcade(interaction);
  }
  const panel = PANELS[key];
  if (!allowed(interaction, panel.perm)) {
    return interaction.reply({ ...errorEmbed('Il te faut la permission de gérer ça sur le serveur.'), ...PRIVATE });
  }
  return interaction.reply({ ...panelMessage(interaction, key), ...PRIVATE });
}

export function errorEmbed(text) {
  return { embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${text}`)] };
}

/** Menus et fenêtres des panneaux. */
export async function handlePanelComponent(client, interaction) {
  const [kind, key, ref] = interaction.customId.split(':');
  const panel = PANELS[key];
  if (!panel) return undefined;

  if (kind === 'pn' && interaction.isStringSelectMenu()) {
    const action = findAction(key, interaction.values[0]);
    if (!action) return interaction.reply({ ...errorEmbed('Action inconnue.'), ...PRIVATE });
    if (!allowed(interaction, action.perm ?? panel.perm) || (action.owner && interaction.user.id !== config.ownerId)) {
      return interaction.reply({ ...errorEmbed('Tu n’as pas la permission pour cette action.'), ...PRIVATE });
    }
    // Des champs à remplir : on ouvre la fenêtre (préremplie si l'action le propose)
    const fields = typeof action.fields === 'function' ? await action.fields(interaction) : action.fields;
    if (fields?.length) return interaction.showModal(buildModal(`pm:${key}:${action.id}`, `${action.emoji} ${action.label}`, fields));
    return runAction(client, interaction, panel, action, {});
  }

  if (kind === 'pm' && interaction.isModalSubmit()) {
    const action = findAction(key, ref);
    if (!action) return interaction.reply({ ...errorEmbed('Action inconnue.'), ...PRIVATE });
    const fields = typeof action.fields === 'function' ? await action.fields(interaction) : action.fields;
    const { values, error } = await readModal(interaction, fields ?? []);
    if (error) return interaction.reply({ ...errorEmbed(error), ...PRIVATE });
    return runAction(client, interaction, panel, action, values);
  }
  return undefined;
}

export async function runAction(client, interaction, panel, action, values) {
  const all = { ...values, ...(action.fixed ?? {}) };
  if (action.run) return action.run(client, interaction, all, { panel, action });
  const { runCommand } = await import('../handlers/interactions.js');
  return runCommand(client, legacyInteraction(interaction, action.cmd, all, action.sub, { panel, action }));
}

// ===================== Adaptateur vers les commandes existantes =====================

function fakeOptions(values, sub) {
  const get = (name) => (values[name] === undefined ? null : values[name]);
  const text = (name) => (get(name) === null ? null : typeof get(name) === 'object' ? get(name) : String(get(name)));
  return {
    getString: (name) => text(name),
    getInteger: (name) => (get(name) === null ? null : Number.parseInt(get(name), 10)),
    getNumber: (name) => (get(name) === null ? null : Number(get(name))),
    getBoolean: (name) => (get(name) === null ? null : get(name) === true || get(name) === 'true'),
    getUser: (name) => get(name)?.user ?? null,
    getMember: (name) => get(name)?.member ?? null,
    getChannel: (name) => get(name),
    getRole: (name) => get(name),
    getAttachment: (name) => get(name),
    getMentionable: (name) => get(name)?.member ?? get(name)?.user ?? get(name),
    getSubcommand: () => sub ?? null,
    getSubcommandGroup: () => null,
    getFocused: () => '',
    data: Object.entries(values).map(([name, value]) => ({ name, value })),
  };
}

/**
 * Fait passer un menu ou une fenêtre pour la commande d'origine : mêmes options, mêmes réponses.
 * Les réponses et relances passent par l'interaction d'origine (ses états « répondu » restent justes).
 */
export function legacyInteraction(base, commandName, values, sub, ctx) {
  const proxy = Object.create(base);
  Object.defineProperties(proxy, {
    commandName: { value: commandName },
    options: { value: fakeOptions(values, sub) },
    isChatInputCommand: { value: () => true },
    isCommand: { value: () => true },
    isMessageContextMenuCommand: { value: () => false },
    isAutocomplete: { value: () => false },
  });
  for (const method of ['deferReply', 'deleteReply', 'fetchReply', 'showModal', 'awaitModalSubmit']) {
    if (typeof base[method] === 'function') proxy[method] = (...args) => base[method](...args);
  }
  for (const method of ['reply', 'editReply', 'followUp']) {
    proxy[method] = (payload) => base[method](styleReply(payload, base, ctx));
  }
  return proxy;
}

/**
 * Met une réponse texte en forme : embed aux couleurs du panneau, titre de l'action, image animée.
 * Les réponses déjà en embed, les sondages et les messages publics qui mentionnent quelqu'un restent tels quels.
 */
export function styleReply(payload, interaction, { panel, action }) {
  const p = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (!p.content || p.embeds?.length || p.poll) return payload;
  const ephemeral = Boolean((Number(p.flags ?? 0) & MessageFlags.Ephemeral) || p.ephemeral);
  if (!ephemeral && /<@!?\d+>/.test(p.content) && action.stamp === undefined) return payload;
  const brand = brandingOf(interaction.guildId);
  const failed = /^\s*(❌|🔒|⚠️ Il te faut)/.test(p.content);
  const gif = action.stamp && !failed ? art('sanction', action.stamp) : art('panneaux', panel.art ?? panel.key);
  const embed = new EmbedBuilder()
    .setColor(failed ? 0xed4245 : brand?.color ?? panel.color)
    .setAuthor({ name: `${action.emoji} ${action.label}` })
    .setDescription(cut(p.content, 4000))
    .setFooter({ text: brand?.name ? `${brand.name} · AI Vercel` : `AI Vercel · /${panel.command}` });
  // Les sanctions montrent le tampon en grand ; le reste, la bannière en petit
  if (action.stamp && !failed) embed.setImage(gif.url);
  else embed.setThumbnail(gif.url);
  delete p.content;
  p.embeds = [embed];
  p.files = [...(p.files ?? []), ...gif.files];
  return p;
}
