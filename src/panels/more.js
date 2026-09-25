// Actions des lots IA, modération, outils, vocal : chacune s'inscrit dans le panneau qui lui correspond.
import { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { addActions } from './catalog.js';
import { field as f } from './ui.js';
import { answerAloud, daySummary, draftAnnouncement, eventIdeas, translateAloud } from '../features/assistant.js';
import { lockdown, modReportEmbed, unlockdown } from '../features/moderation.js';
import { weekOf } from '../features/weekly.js';
import { ticketStaffEmbed } from '../features/tickets.js';
import {
  APPLY_FIELDS, birthdaysOf, parseWhen, postRolePanel, removeSchedule, scheduleMessage, schedulesOf, setBirthday, submitApplication,
} from '../features/serverTools.js';
import { RADIO_THEMES, karaoke, playlistVote, startThemeRadio, voiceLeaderboard } from '../features/voicePlus.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const GOLD = 0xc9a978;
const ok = (text, color = GOLD) => ({ embeds: [new EmbedBuilder().setColor(color).setDescription(text)], ...PRIVATE });
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// ===================== /ia : outils de l'IA =====================
addActions('ia', 'Outils de l’IA', [
  { id: 'voix', label: 'Réponse à voix haute', emoji: '🔊', desc: 'L’IA répond et lit sa réponse dans le vocal', fields: [f.para('question', 'Ta question', { req: true, max: 800 })], run: (c, i, v) => answerAloud(i, v.question) },
  {
    id: 'traduire-voix', label: 'Traduire à voix haute', emoji: '🌍', desc: 'Traduit un texte et le lit dans le vocal',
    fields: [f.para('texte', 'Texte à traduire', { req: true, max: 800 }), f.text('langue', 'Vers quelle langue ?', { req: true, max: 30, ph: 'anglais, espagnol, arabe, japonais…' })],
    run: (c, i, v) => translateAloud(i, v),
  },
  {
    id: 'resume-jour', label: 'Résumé de la journée', emoji: '🌙', desc: 'Ce qui s’est dit aujourd’hui, en quelques lignes', perm: P.ManageMessages,
    run: async (c, i) => {
      await i.deferReply(PRIVATE);
      const text = await daySummary(i.guild).catch(() => null);
      return i.editReply({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🌙 Le journal de bord du jour').setDescription(text ?? 'Pas assez de messages depuis le dernier redémarrage du bot pour faire un résumé.')] });
    },
  },
  {
    id: 'evenements', label: 'Idées d’événements', emoji: '🎉', desc: '5 idées concrètes avec récompenses', perm: P.ManageMessages,
    fields: [f.text('theme', 'Thème (facultatif)', { max: 100, ph: 'Halloween, tournoi, soirée chill…' })],
    run: async (c, i, v) => {
      await i.deferReply(PRIVATE);
      return i.editReply({ embeds: [await eventIdeas(i.guild, v.theme ?? '')] });
    },
  },
  {
    id: 'annonce-ia', label: 'Rédiger une annonce', emoji: '📜', desc: 'Tes idées en vrac, l’IA écrit, tu publies', perm: P.ManageMessages,
    fields: [
      f.para('points', 'Ce qu’il faut annoncer', { req: true, max: 1500, ph: 'Tournoi samedi 20 h, 5 000 pièces à gagner, inscription en réagissant…' }),
      f.choice('ton', 'Ton', [{ label: 'Enthousiaste', value: 'enthousiaste' }, { label: 'Sérieux', value: 'sérieux et clair' }, { label: 'Pirate', value: 'de capitaine pirate' }, { label: 'Drôle', value: 'drôle et léger' }]),
      f.channel('salon', 'Salon (vide = annonces du bot)', { types: TEXT }),
    ],
    run: (c, i, v) => draftAnnouncement(i, v),
  },
]);

// ===================== /sanction : urgence et rapports =====================
addActions('sanction', 'Urgence et rapports', [
  {
    id: 'confiner', label: 'Confinement d’urgence', emoji: '🚨', desc: 'Plus personne n’écrit (sauf le staff)', perm: P.ManageChannels,
    fields: [f.bool('confirmer', 'Fermer tous les salons à l’écriture ?', { req: true })],
    run: async (c, i, v) => {
      if (!v.confirmer) return i.reply(ok('Rien n’a changé.'));
      await i.deferReply(PRIVATE);
      const r = await lockdown(i.guild, i.user);
      return i.editReply(r.error ? `❌ ${r.error}` : `🚨 Serveur confiné : **${r.count}** salon(s) fermés à l’écriture. Fin avec **Lever le confinement**.`);
    },
  },
  {
    id: 'deconfiner', label: 'Lever le confinement', emoji: '✅', perm: P.ManageChannels,
    run: async (c, i) => {
      await i.deferReply(PRIVATE);
      const r = await unlockdown(i.guild, i.user);
      return i.editReply(r.error ? `❌ ${r.error}` : `✅ Confinement levé : **${r.count}** salon(s) rouverts.`);
    },
  },
  { id: 'rapport-modo', label: 'Rapport de modération', emoji: '📊', desc: 'Les chiffres de cette semaine', run: async (c, i) => i.reply({ embeds: [await modReportEmbed(i.guild, weekOf())], ...PRIVATE }) },
]);

// ===================== /serveur : communauté =====================
addActions('serveur', 'Communauté', [
  {
    id: 'anniversaire', label: 'Mon anniversaire', emoji: '🎂', desc: 'Le bot te le souhaite, avec 500 pièces d’or',
    fields: [f.int('jour', 'Jour (1-31)', { req: true, min: 1, top: 31 }), f.int('mois', 'Mois (1-12)', { req: true, min: 1, top: 12 })],
    run: async (c, i, v) => (await setBirthday(i.guildId, i.user.id, v.jour, v.mois)
      ? i.reply(ok(`🎂 Noté : le **${v.jour} ${MONTHS[v.mois - 1]}**. Le bot te le souhaitera ce jour-là !`))
      : i.reply(ok('❌ Cette date n’existe pas.', 0xe0433a))),
  },
  {
    id: 'anniversaires', label: 'Prochains anniversaires', emoji: '📅',
    run: async (c, i) => {
      const now = new Date();
      const next = Object.entries(await birthdaysOf(i.guildId)).map(([id, b]) => {
        let d = new Date(now.getFullYear(), b.month - 1, b.day);
        if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(now.getFullYear() + 1, b.month - 1, b.day);
        return { id, b, d };
      }).sort((a, b) => a.d - b.d).slice(0, 10);
      return i.reply({ embeds: [new EmbedBuilder().setColor(0xff5fa2).setTitle('📅 Prochains anniversaires').setDescription(next.length ? next.map((x) => `🎂 <@${x.id}> · ${x.b.day} ${MONTHS[x.b.month - 1]}`).join('\n') : 'Personne n’a encore donné sa date : **Mon anniversaire**.')], ...PRIVATE });
    },
  },
  { id: 'candidature', label: 'Candidater au staff', emoji: '📝', desc: 'Le staff vote et te répond en MP', fields: APPLY_FIELDS(), run: (c, i, v) => submitApplication(i, v) },
  { id: 'top-vocal', label: 'Classement du vocal', emoji: '🎙️', desc: 'Qui passe le plus de temps en vocal', run: async (c, i) => i.reply({ embeds: [await voiceLeaderboard(i.guild)], ...PRIVATE }) },
]);

// ===================== /pannel : outils du staff =====================
addActions('pannel', 'Outils du staff', [
  {
    id: 'roles-boutons', label: 'Rôles par boutons', emoji: '🎭', desc: 'Les membres prennent leurs rôles en un clic', perm: P.ManageRoles,
    fields: [f.channel('salon', 'Salon (vide = ici)', { types: TEXT }), f.text('titre', 'Titre', { max: 100, ph: '🎭 Choisis tes rôles' }), f.role('r1', 'Rôle 1', { req: true }), f.role('r2', 'Rôle 2'), f.role('r3', 'Rôle 3')],
    run: (c, i, v) => postRolePanel(i, { salon: v.salon, titre: v.titre, roles: [v.r1, v.r2, v.r3].filter(Boolean) }),
  },
  {
    id: 'programmer', label: 'Programmer un message', emoji: '⏰', desc: 'Une fois, chaque jour ou chaque semaine', perm: P.ManageMessages,
    fields: [
      f.channel('salon', 'Salon', { req: true, types: TEXT }),
      f.para('message', 'Message', { req: true, max: 1800 }),
      f.text('quand', 'Quand ? (heure de Paris)', { req: true, max: 30, ph: '18:30 · 25/12 20:00 · dans 2h' }),
      f.choice('repeter', 'Répéter', [{ label: 'Une seule fois', value: 'non' }, { label: 'Chaque jour', value: 'jour' }, { label: 'Chaque semaine', value: 'semaine' }]),
    ],
    run: async (c, i, v) => {
      const at = parseWhen(v.quand);
      if (!at) return i.reply(ok('❌ Je ne comprends pas la date. Exemples : **18:30**, **25/12 20:00**, **dans 2h**.', 0xe0433a));
      const s = await scheduleMessage(i.guildId, { channelId: v.salon.id, text: v.message, at, repeat: v.repeter ?? 'non', by: i.user.id });
      if (s.error) return i.reply(ok(`❌ ${s.error}`, 0xe0433a));
      return i.reply(ok(`⏰ Programmé dans ${v.salon} <t:${Math.round(at / 1000)}:F>${s.every ? (v.repeter === 'jour' ? ', puis chaque jour' : ', puis chaque semaine') : ''}.`));
    },
  },
  {
    id: 'programmes', label: 'Messages programmés', emoji: '🗓️', desc: 'Voir ou supprimer', perm: P.ManageMessages,
    fields: [f.int('retirer', 'Numéro à supprimer (vide = voir)', { min: 1, top: 25 })],
    run: async (c, i, v) => {
      let list = await schedulesOf(i.guildId);
      if (v.retirer && list[v.retirer - 1]) await removeSchedule(i.guildId, list[v.retirer - 1].id);
      list = await schedulesOf(i.guildId);
      return i.reply({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle(`🗓️ Messages programmés (${list.length})`).setDescription(list.length ? list.map((s, k) => `**${k + 1}.** <#${s.channelId}> · <t:${Math.round(s.at / 1000)}:R>${s.every ? ' 🔁' : ''}\n-# ${s.text.slice(0, 90)}`).join('\n') : 'Aucun.')], ...PRIVATE });
    },
  },
  { id: 'stats-tickets', label: 'Statistiques des tickets', emoji: '🎫', desc: 'Tickets pris, fermés et notes du staff', perm: P.ManageMessages, run: async (c, i) => i.reply({ embeds: [await ticketStaffEmbed(i.guild)], ...PRIVATE }) },
]);

// ===================== /musique : soirée vocale =====================
addActions('musique', 'Soirée vocale', [
  { id: 'vote-radio', label: 'Voter la radio', emoji: '🗳️', desc: '4 ambiances, le salon vote, la gagnante démarre', run: (c, i) => playlistVote(i) },
  {
    id: 'radio-theme', label: 'Radio à thème', emoji: '📻', desc: 'Chants de marins, lofi, années 2000…',
    fields: [f.choice('theme', 'Thème', Object.entries(RADIO_THEMES).map(([value, t]) => ({ label: t.label, value, emoji: t.emoji })), { req: true })],
    run: async (c, i, v) => {
      await i.deferReply(PRIVATE);
      const t = RADIO_THEMES[v.theme];
      const r = await startThemeRadio(c, i.guild, t.style).catch((err) => ({ error: err.message }));
      return i.editReply(r.error ? `😕 ${r.error}` : `${t.emoji} Radio **${t.label}** lancée dans ${r.home} (${r.count} sons).`);
    },
  },
  { id: 'karaoke-ia', label: 'Karaoké noté par l’IA', emoji: '🎤', desc: '40 s de chant, le jury IA te note', fields: [f.text('chanson', 'Quelle chanson ?', { req: true, max: 120 })], run: (c, i, v) => karaoke(i, v) },
]);

// ===================== /serveur › Premium : carte cadeau =====================
addActions('serveur', 'Premium', [
  {
    id: 'carte-cadeau', label: 'Utiliser une carte cadeau', emoji: '🎁', desc: 'Un code VERCEL-… active le premium', perm: P.ManageGuild,
    fields: [f.text('code', 'Code de la carte', { req: true, max: 40, ph: 'VERCEL-XXXX-XXXX' })],
    run: async (c, i, v) => {
      const { redeemGiftCard } = await import('../features/giftCards.js');
      const r = await redeemGiftCard(v.code, i.guildId, i.user.id);
      if (r.error) return i.reply(ok(`❌ ${r.error}`, 0xe0433a));
      return i.reply(ok(`🎁 Carte cadeau utilisée : **${r.plan.emoji} ${r.plan.label}** actif jusqu’au **${new Date(r.plan.until).toLocaleDateString('fr-FR')}** (${r.days} jours). Merci !`, 0xf2c14e));
    },
  },
]);
