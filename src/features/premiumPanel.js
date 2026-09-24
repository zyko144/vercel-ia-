// Le groupe « Premium » du panneau /serveur : offre en cours et essai gratuit, cartes aux couleurs du serveur,
// voix de l'IA vocale, rapport de la semaine, surveillance vocale Gardien, et l'activation d'une offre (chef).
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import sharp from 'sharp';
import { config } from '../config.js';
import { addActions, PANELS } from '../panels/catalog.js';
import { art, field as f, panelEmbed } from '../panels/ui.js';
import { COLORS } from './tickets.js';
import {
  PLANS, TRIAL_DAYS, VOICES, brandingOf, clearBranding, planOf, rawGuardOptions, reportWanted, setBranding, setGuardOptions,
  setPlan, setReportWanted, setVoice, startTrial, voiceUsage,
} from './premium.js';
import { buildReport } from './weekly.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const siteUrl = () => (config.site.url ? `${config.site.url}/#pacte` : 'https://vercel-ia.onrender.com/#pacte');
const fail = (text) => ({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${text}`)], ...PRIVATE });

const FEATURES = [
  ['voiceMinutes', (v) => `🎙️ IA vocale : **${v === Infinity ? 'illimitée' : `${v} min/mois`}**`],
  ['voices', (v) => `${v ? '✅' : '❌'} Choix de la voix de l’IA`],
  ['branding', (v) => `${v ? '✅' : '❌'} Cartes et embeds aux couleurs du serveur (logo, couleur, nom)`],
  ['report', (v) => `${v ? '✅' : '❌'} Rapport de la semaine en MP au propriétaire`],
  ['guard', (v) => `${v ? '✅' : '❌'} Surveillance vocale Gardien (staff protégé, mots interdits)`],
];

function statusMessage(interaction) {
  const plan = planOf(interaction.guildId);
  const usage = voiceUsage(interaction.guildId);
  const { embed, files } = panelEmbed(interaction.guildId, PANELS.serveur, {
    title: `⭐ Offre du serveur : ${plan.emoji} ${plan.label}${plan.trial ? ' (essai gratuit)' : ''}`,
    description: [
      plan.until ? `⏳ Jusqu’au <t:${Math.round(plan.until / 1000)}:D> (<t:${Math.round(plan.until / 1000)}:R>)` : 'Offre gratuite, sans limite de durée.',
      `🎙️ IA vocale ce mois-ci : **${usage.used} min** utilisées${usage.limit === Infinity ? '' : ` sur ${usage.limit}`}`,
      '',
      ...FEATURES.map(([key, line]) => line(plan[key])),
      '',
      Object.entries(PLANS).filter(([k]) => k !== 'gratuit').map(([, p]) => `${p.emoji} **${p.label}** · ${p.price}`).join('  ·  '),
    ].join('\n'),
  });
  const buttons = [];
  if (plan.key === 'gratuit' && interaction.memberPermissions?.has(P.ManageGuild)) {
    buttons.push(new ButtonBuilder().setCustomId('pr:trial').setLabel(`Essai gratuit ${TRIAL_DAYS} jours`).setEmoji('🎁').setStyle(ButtonStyle.Success));
  }
  buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteUrl()).setLabel('Voir les offres').setEmoji('🌐'));
  return { embeds: [embed], files, components: [new ActionRowBuilder().addComponents(buttons)] };
}

const needs = (feature, label) => (interaction) => {
  if (planOf(interaction.guildId)[feature]) return null;
  return fail(`${label} fait partie des offres premium. Essai gratuit de ${TRIAL_DAYS} jours : **/serveur** › Offre du serveur.`);
};

addActions('serveur', 'Premium', [
  { id: 'premium', label: 'Offre du serveur (premium)', emoji: '⭐', desc: `Ce qui est inclus, essai gratuit ${TRIAL_DAYS} jours`, run: (client, interaction) => interaction.reply({ ...statusMessage(interaction), ...PRIVATE }) },
  {
    id: 'couleurs', label: 'Cartes aux couleurs du serveur', emoji: '🎨', desc: 'Nom, couleur et logo sur les embeds', perm: P.ManageGuild,
    fields: [
      f.text('nom', 'Nom affiché (vide = garder)', { max: 60 }),
      f.choice('couleur', 'Couleur', Object.entries(COLORS).map(([value, c]) => ({ label: c.label, value, emoji: c.emoji }))),
      f.file('logo', 'Logo (image carrée conseillée)'),
      f.bool('effacer', 'Tout effacer (revenir au style AI Vercel) ?'),
    ],
    run: async (client, interaction, values) => {
      const blocked = needs('branding', 'Les cartes aux couleurs du serveur')(interaction);
      if (blocked) return interaction.reply(blocked);
      if (values.effacer) {
        clearBranding(interaction.guildId);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3dff9a).setDescription('✅ Style AI Vercel rétabli.')], ...PRIVATE });
      }
      let logoPng;
      if (values.logo) {
        if (!/^image\//.test(values.logo.contentType ?? '') || values.logo.size > 8 * 1024 * 1024) return interaction.reply(fail('Le logo doit être une image de 8 Mo maximum.'));
        await interaction.deferReply(PRIVATE);
        const res = await fetch(values.logo.url).catch(() => null);
        if (!res?.ok) return interaction.editReply(fail('Impossible de récupérer le logo, réessaie.'));
        logoPng = await sharp(Buffer.from(await res.arrayBuffer())).resize(128, 128, { fit: 'cover' }).png().toBuffer().catch(() => null);
        if (!logoPng) return interaction.editReply(fail('Cette image n’est pas lisible.'));
      }
      setBranding(interaction.guildId, { name: values.nom, color: values.couleur ? COLORS[values.couleur].value : undefined, logoPng });
      const brand = brandingOf(interaction.guildId);
      const gif = art('panneaux', 'serveur');
      const preview = new EmbedBuilder()
        .setColor(brand?.color ?? 0x4db8ff)
        .setAuthor({ name: brand?.name ?? interaction.guild.name, iconURL: brand?.logo ?? undefined })
        .setTitle('🎨 Voilà le nouveau style')
        .setDescription(`Les panneaux, tickets, annonces et rapports prennent maintenant ces couleurs.${brand?.logo ? '' : values.logo ? '\n-# Le logo apparaîtra une fois le bot en ligne sur Render (il est servi par le bot).' : ''}`)
        .setThumbnail(brand?.logo ?? null)
        .setImage(gif.url)
        .setFooter({ text: brand?.name ? `${brand.name} · propulsé par AI Vercel` : 'AI Vercel' });
      const payload = { embeds: [preview], files: gif.files };
      return interaction.deferred ? interaction.editReply(payload) : interaction.reply({ ...payload, ...PRIVATE });
    },
  },
  {
    id: 'voix', label: 'Voix de l’IA vocale', emoji: '🗣️', desc: 'Choisis la voix qui te répond', perm: P.ManageGuild,
    fields: [f.choice('voix', 'Voix', Object.entries(VOICES).map(([value, label]) => ({ label: `${value} · ${label}`, value })), { req: true })],
    run: async (client, interaction, values) => {
      const blocked = needs('voices', 'Le choix de la voix')(interaction);
      if (blocked) return interaction.reply(blocked);
      setVoice(interaction.guildId, values.voix);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xa58bff).setDescription(`🗣️ L’IA vocale parlera avec la voix **${values.voix}** (${VOICES[values.voix]}) à la prochaine conversation.`)], ...PRIVATE });
    },
  },
  {
    id: 'rapport', label: 'Rapport de la semaine', emoji: '📊', desc: 'Le voir maintenant, l’activer ou le couper', perm: P.ManageGuild,
    run: async (client, interaction) => {
      const blocked = needs('report', 'Le rapport de la semaine')(interaction);
      if (blocked) return interaction.reply(blocked);
      const report = await buildReport(interaction.guild);
      const on = reportWanted(interaction.guildId);
      return interaction.reply({
        ...report,
        content: `-# Envoyé chaque dimanche à 20 h en MP au propriétaire du serveur : **${on ? 'activé' : 'coupé'}**.`,
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`pr:report:${on ? 'off' : 'on'}`).setLabel(on ? 'Couper l’envoi du dimanche' : 'Activer l’envoi du dimanche').setStyle(on ? ButtonStyle.Secondary : ButtonStyle.Success))],
        ...PRIVATE,
      });
    },
  },
  {
    id: 'gardien', label: 'Surveillance vocale Gardien', emoji: '🛡️', desc: 'Protéger le staff, interdire des mots', perm: P.ManageGuild,
    fields: (interaction) => {
      const g = rawGuardOptions(interaction.guildId);
      return [
        f.para('membres', 'Membres protégés en plus du chef', { max: 1000, value: g.protectedIds.join('\n'), ph: 'Identifiants Discord, un par ligne' }),
        f.para('mots', 'Mots interdits en vocal', { max: 1500, value: g.words.join('\n'), ph: 'Un mot ou une expression par ligne' }),
      ];
    },
    run: async (client, interaction, values) => {
      const blocked = needs('guard', 'La surveillance vocale Gardien')(interaction);
      if (blocked) return interaction.reply(blocked);
      const ids = (values.membres ?? '').match(/\d{15,21}/g) ?? [];
      const words = (values.mots ?? '').split(/\n|,/);
      const saved = setGuardOptions(interaction.guildId, { protectedIds: ids, words });
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0xff3355).setTitle('🛡️ Surveillance vocale Gardien')
          .setDescription([
            `Protégés en plus du chef : ${saved.protectedIds.length ? saved.protectedIds.map((id) => `<@${id}>`).join(', ') : 'personne'}`,
            `Mots interdits : ${saved.words.length ? saved.words.map((w) => `||${w}||`).join(', ') : 'aucun'}`,
            '',
            'Comme pour le chef : la personne protégée doit être dans le vocal et nommée. Un mot interdit compte quel que soit qui est visé. 1er et 2e : avertissement, 3e : exclusion d’1 minute.',
          ].join('\n'))],
        ...PRIVATE,
      });
    },
  },
  {
    id: 'activer', label: 'Activer une offre (chef)', emoji: '👑', desc: 'Après paiement : offre + durée', owner: true,
    fields: (interaction) => [
      f.text('serveur', 'Identifiant du serveur', { req: true, max: 25, value: interaction.guildId }),
      f.choice('offre', 'Offre', Object.entries(PLANS).map(([value, p]) => ({ label: `${p.label} · ${p.price}`, value, emoji: p.emoji })), { req: true }),
      f.int('jours', 'Durée en jours (0 = retirer)', { req: true, min: 0, top: 3650, value: 30 }),
    ],
    run: async (client, interaction, values) => {
      if (interaction.user.id !== config.ownerId) return interaction.reply(fail('Réservé au chef.'));
      if (!/^\d{15,21}$/.test(values.serveur)) return interaction.reply(fail('Identifiant de serveur invalide.'));
      const plan = setPlan(values.serveur, values.jours ? values.offre : 'gratuit', values.jours);
      const name = client.guilds.cache.get(values.serveur)?.name ?? values.serveur;
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffc94d).setDescription(`👑 **${name}** : ${plan.emoji} ${plan.label}${plan.until ? ` jusqu’au <t:${Math.round(plan.until / 1000)}:D>` : ''}.`)], ...PRIVATE });
    },
  },
]);

export const isPremiumComponent = (interaction) => (interaction.customId ?? '').startsWith('pr:');

export async function handlePremiumComponent(client, interaction) {
  const [, what, arg] = interaction.customId.split(':');
  if (!interaction.memberPermissions?.has(P.ManageGuild) && interaction.user.id !== config.ownerId) return interaction.reply(fail('Il faut pouvoir gérer le serveur.'));
  if (what === 'trial') {
    const result = startTrial(interaction.guildId, interaction.user.id);
    if (result.error) return interaction.reply(fail(result.error));
    console.log(`[premium] essai gratuit lancé sur ${interaction.guild?.name} par ${interaction.user.username}`);
    return interaction.update({ ...statusMessage(interaction), attachments: [] });
  }
  if (what === 'report') {
    setReportWanted(interaction.guildId, arg === 'on');
    return interaction.update({ content: `-# Envoyé chaque dimanche à 20 h en MP au propriétaire du serveur : **${arg === 'on' ? 'activé' : 'coupé'}**.`, components: [] });
  }
  return undefined;
}
