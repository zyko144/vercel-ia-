// Briques des panneaux : les images animées, les fenêtres à remplir (modals) et la lecture de ce qui y a été saisi.
import {
  AttachmentBuilder, ChannelSelectMenuBuilder, EmbedBuilder, FileUploadBuilder, LabelBuilder, ModalBuilder,
  RoleSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder,
} from 'discord.js';
import { config } from '../config.js';
import { brandingOf } from '../features/premium.js';

// ===================== Images animées =====================

/**
 * Une image animée des assets (panneaux/xxx.gif, sanction/xxx.gif) à mettre dans un embed.
 * En ligne : un lien vers le bot (rien à envoyer). En local : le fichier est joint.
 */
export function art(folder, name) {
  if (config.publicUrl) return { url: `${config.publicUrl}/${folder}/${name}.gif?v=1`, files: [] };
  return { url: `attachment://${name}.gif`, files: [new AttachmentBuilder(`assets/${folder}/${name}.gif`, { name: `${name}.gif` })] };
}

/** Embed aux couleurs du panneau (ou de la marque du serveur, en premium). */
export function panelEmbed(guildId, panel, { title, description, image = true, thumbnail = false } = {}) {
  const brand = brandingOf(guildId);
  const gif = art('panneaux', panel.art ?? panel.key);
  const embed = new EmbedBuilder()
    .setColor(brand?.color ?? panel.color)
    .setFooter({ text: brand?.name ? `${brand.name} · propulsé par AI Vercel` : 'AI Vercel', iconURL: brand?.logo ?? undefined });
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (image) embed.setImage(gif.url);
  if (thumbnail) embed.setThumbnail(gif.url);
  if (brand?.logo && !thumbnail) embed.setThumbnail(brand.logo);
  return { embed, files: gif.files };
}

// ===================== Champs des fenêtres =====================
// Chaque action décrit ses champs ; au maximum 5 par fenêtre (limite de Discord).

export const field = {
  text: (id, label, o = {}) => ({ kind: 'text', id, label, ...o }),
  para: (id, label, o = {}) => ({ kind: 'text', id, label, para: true, ...o }),
  int: (id, label, o = {}) => ({ kind: 'int', id, label, ...o }),
  user: (id, label, o = {}) => ({ kind: 'user', id, label, ...o }),
  channel: (id, label, o = {}) => ({ kind: 'channel', id, label, ...o }),
  role: (id, label, o = {}) => ({ kind: 'role', id, label, ...o }),
  choice: (id, label, options, o = {}) => ({ kind: 'choice', id, label, options, ...o }),
  bool: (id, label, o = {}) => ({ kind: 'choice', id, label, bool: true, options: [{ label: 'Oui', value: 'true', emoji: '✅' }, { label: 'Non', value: 'false', emoji: '❌' }], ...o }),
  file: (id, label, o = {}) => ({ kind: 'file', id, label, ...o }),
};

const cut = (text, max) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Construit la fenêtre d'une action. */
export function buildModal(customId, title, fields) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(cut(title, 45));
  for (const f of fields.slice(0, 5)) {
    const label = new LabelBuilder().setLabel(cut(f.label, 45));
    if (f.help) label.setDescription(cut(f.help, 100));
    const required = Boolean(f.req);
    if (f.kind === 'text' || f.kind === 'int') {
      const input = new TextInputBuilder().setCustomId(f.id).setStyle(f.para ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(required);
      input.setMaxLength(f.kind === 'int' ? 10 : f.max ?? (f.para ? 4000 : 300));
      if (f.ph) input.setPlaceholder(cut(f.ph, 100));
      if (f.value !== undefined && f.value !== null && f.value !== '') input.setValue(String(f.value).slice(0, f.kind === 'int' ? 10 : f.max ?? 4000));
      label.setTextInputComponent(input);
    } else if (f.kind === 'user') {
      label.setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId(f.id).setRequired(required).setMaxValues(1));
    } else if (f.kind === 'channel') {
      const select = new ChannelSelectMenuBuilder().setCustomId(f.id).setRequired(required).setMaxValues(1);
      if (f.types) select.setChannelTypes(...f.types);
      label.setChannelSelectMenuComponent(select);
    } else if (f.kind === 'role') {
      label.setRoleSelectMenuComponent(new RoleSelectMenuBuilder().setCustomId(f.id).setRequired(required).setMaxValues(1));
    } else if (f.kind === 'choice') {
      const select = new StringSelectMenuBuilder().setCustomId(f.id).setRequired(required).setMaxValues(1)
        .addOptions(f.options.slice(0, 25).map((o) => ({ label: cut(o.label, 100), value: o.value, ...(o.emoji ? { emoji: o.emoji } : {}), ...(o.description ? { description: cut(o.description, 100) } : {}), default: f.value !== undefined && String(f.value) === o.value })));
      if (f.ph) select.setPlaceholder(cut(f.ph, 150));
      label.setStringSelectMenuComponent(select);
    } else if (f.kind === 'file') {
      label.setFileUploadComponent(new FileUploadBuilder().setCustomId(f.id).setRequired(required).setMinValues(required ? 1 : 0).setMaxValues(1));
    }
    modal.addLabelComponents(label);
  }
  return modal;
}

/**
 * Lit ce qui a été rempli. Renvoie { values } (prêt pour les commandes) ou { error } (message clair).
 * values : textes, nombres, booléens, et les objets Discord (utilisateur + membre, salon, rôle, fichier).
 */
export async function readModal(interaction, fields) {
  const values = {};
  for (const f of fields.slice(0, 5)) {
    try {
      if (f.kind === 'text') {
        const v = interaction.fields.getTextInputValue(f.id)?.trim();
        if (v) values[f.id] = v;
      } else if (f.kind === 'int') {
        const raw = interaction.fields.getTextInputValue(f.id)?.trim();
        if (!raw) continue;
        const n = Number(raw.replace(',', '.'));
        if (!Number.isInteger(n) || (f.min !== undefined && n < f.min) || (f.top !== undefined && n > f.top)) {
          return { error: `« ${f.label} » : un nombre entier${f.min !== undefined ? ` entre ${f.min} et ${f.top}` : ''}.` };
        }
        values[f.id] = n;
      } else if (f.kind === 'user') {
        const user = interaction.fields.getSelectedUsers(f.id)?.first();
        if (user) values[f.id] = { user, member: interaction.guild ? await interaction.guild.members.fetch(user.id).catch(() => null) : null };
      } else if (f.kind === 'channel') {
        const channel = interaction.fields.getSelectedChannels(f.id)?.first();
        if (channel) values[f.id] = interaction.client.channels.cache.get(channel.id) ?? channel;
      } else if (f.kind === 'role') {
        const role = interaction.fields.getSelectedRoles(f.id)?.first();
        if (role) values[f.id] = interaction.guild?.roles.cache.get(role.id) ?? role;
      } else if (f.kind === 'choice') {
        const v = interaction.fields.getStringSelectValues(f.id)?.[0];
        if (v !== undefined) values[f.id] = f.bool ? v === 'true' : v;
      } else if (f.kind === 'file') {
        const file = interaction.fields.getUploadedFiles(f.id)?.first();
        if (file) values[f.id] = file;
      }
    } catch {
      // champ laissé vide
    }
    if (f.req && values[f.id] === undefined) return { error: `« ${f.label} » est obligatoire.` };
  }
  return { values };
}
