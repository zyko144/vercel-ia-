// Actions du tableau de bord : ce que le chef fait sur Discord depuis la page
// (écrire en tant que le bot, sondages, modération, musique, rappels, pièces d'or, redémarrage).
// Même règle que le reste : chaque entrée est vérifiée, chaque action est limitée et notée au journal.
import { ChannelType, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { config } from '../config.js';
import { addGold, economyOverview, giftEffect, resetPurse } from '../features/economy.js';
import { topLevels } from '../features/levels.js';
import { addReminder, listReminders, removeReminder } from '../features/reminders.js';
import { homeChannel, lockedChannel } from '../features/voice.js';
import { blindTestActive } from '../music/blindtest.js';
import { getOrCreatePlayer, getPlayer } from '../music/player.js';
import { resolveQuery } from '../music/sources.js';
import { instance } from '../features/instance.js';
import { load, save, storageBackend } from '../storage.js';
import { allServers, planOf } from '../features/premium.js';
import { paymentHistory, paypalMode } from '../features/payments.js';
import { SECTIONS, guildSettings, setGuildSettings } from '../features/guildConfig.js';

const MINUTE = 60_000;
const ID = /^\d{15,21}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const TEXT_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
const VOICE_TYPES = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);

class Refus extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const refuse = (message, status) => { throw new Refus(message, status); };
const texte = (value, max, name, { required = false } = {}) => {
  const v = typeof value === 'string' ? value.trim() : '';
  if (required && !v) refuse(`${name} : obligatoire.`);
  if (v.length > max) refuse(`${name} : ${max} caractères maximum.`);
  return v;
};
const entier = (value, min, max, name) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) refuse(`${name} : un nombre entier entre ${min} et ${max}.`);
  return n;
};
const httpsUrl = (value, name) => {
  const v = texte(value, 500, name);
  if (!v) return '';
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:') throw new Error();
    return u.href;
  } catch {
    return refuse(`${name} : une adresse qui commence par https://.`);
  }
};

/**
 * @param {import('discord.js').Client} client
 * @param {{ json: Function, audit: Function, allowAttempt: Function, who: Function }} tools
 */
export function actionRoutes(client, { json, audit, allowAttempt, who }) {
  const guildOf = (id) => (ID.test(String(id ?? '')) ? client.guilds.cache.get(String(id)) : null) ?? refuse('Serveur inconnu.', 404);

  /** Un salon textuel d'un serveur du bot, où il a le droit d'écrire. */
  function writableChannel(id) {
    const channel = ID.test(String(id ?? '')) ? client.channels.cache.get(String(id)) : null;
    if (!channel?.guild || !TEXT_TYPES.has(channel.type)) refuse('Salon inconnu.', 404);
    const perms = channel.permissionsFor(channel.guild.members.me);
    if (!perms?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) refuse(`Le bot n’a pas le droit d’écrire dans #${channel.name}.`, 403);
    return channel;
  }

  const limit = (session, bucket, max, windowMs) => {
    if (!allowAttempt(bucket, session.id, max, windowMs)) refuse('Doucement : trop d’actions d’affilée, attends un peu.', 429);
  };

  /** Les mentions autorisées pour un envoi (personne par défaut). */
  function mentions(guild, ping) {
    if (!ping || ping === 'aucune') return { content: '', allowed: { parse: [] } };
    if (ping === 'everyone' || ping === 'here') return { content: `@${ping}`, allowed: { parse: ['everyone'] } };
    const role = ID.test(ping) ? guild.roles.cache.get(ping) : null;
    if (!role) refuse('Rôle à mentionner inconnu.');
    return { content: `<@&${role.id}>`, allowed: { roles: [role.id] } };
  }

  // Les erreurs Discord (permissions, salon supprimé…) sont traduites en un message clair.
  const wrap = (fn) => async (req, res, body, session, url) => {
    try {
      return await fn(req, res, body, session, url);
    } catch (err) {
      if (err instanceof Refus) return json(res, err.status, { error: err.message });
      const code = err?.code;
      const known = { 50013: 'Le bot n’a pas la permission de faire ça sur Discord.', 50001: 'Le bot n’a pas accès à ce salon.', 10007: 'Ce membre n’est plus sur le serveur.', 10013: 'Compte Discord inconnu.', 10026: 'Ce membre n’est pas banni.', 50035: 'Discord a refusé le contenu (trop long ou mal formé).' };
      console.warn('[tableau de bord] action :', err.message);
      return json(res, known[code] ? 400 : 500, { error: known[code] ?? 'Discord a refusé l’action. Regarde les journaux du bot.' });
    }
  };

  const routes = {
    // ---------- Ce que le bot voit : serveurs, salons, rôles ----------
    'GET serveurs': async (req, res) => json(res, 200, {
      instance: { where: instance.where, guarded: instance.guarded, storage: storageBackend },
      guilds: client.guilds.cache.map((g) => {
        const me = g.members.me;
        const sorted = [...g.channels.cache.values()].sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));
        const category = (c) => (c.parentId ? g.channels.cache.get(c.parentId)?.name ?? null : null);
        return {
          id: g.id, name: g.name, icon: g.iconURL({ size: 64 }), members: g.memberCount,
          channels: sorted.filter((c) => TEXT_TYPES.has(c.type)).map((c) => ({
            id: c.id, name: c.name, category: category(c),
            canSend: Boolean(c.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages])),
          })),
          voices: sorted.filter((c) => VOICE_TYPES.has(c.type)).map((c) => ({
            id: c.id, name: c.name, category: category(c), people: c.members.filter((m) => !m.user.bot).size,
            home: c.id === homeChannel(g)?.id, bot: c.id === me?.voice?.channelId,
          })),
          categories: sorted.filter((c) => c.type === ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name })),
          roles: g.roles.cache.filter((r) => r.id !== g.id && !r.managed).sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
          perms: {
            moderate: Boolean(me?.permissions.has(P.ModerateMembers)), kick: Boolean(me?.permissions.has(P.KickMembers)),
            ban: Boolean(me?.permissions.has(P.BanMembers)), manageMessages: Boolean(me?.permissions.has(P.ManageMessages)),
          },
        };
      }),
    }),

    // ---------- Écrire en tant que le bot ----------
    'POST envoyer': wrap(async (req, res, body, session) => {
      limit(session, 'envoyer', 12, MINUTE);
      const channel = writableChannel(body.channelId);
      const content = texte(body.content, 1800, 'Message');
      const e = body.embed && typeof body.embed === 'object' ? body.embed : null;
      const embed = e ? {
        title: texte(e.title, 256, 'Titre'), description: texte(e.description, 4000, 'Texte de la carte'),
        color: e.color ? (COLOR.test(e.color) ? e.color : refuse('Couleur : format #RRGGBB.')) : '', image: httpsUrl(e.image, 'Image'),
        footer: texte(e.footer, 200, 'Bas de carte'),
      } : null;
      if (embed && !embed.title && !embed.description && !embed.image) refuse('La carte est vide : mets au moins un titre, un texte ou une image.');
      if (!content && !embed) refuse('Écris un message ou remplis la carte.');
      const ping = mentions(channel.guild, body.ping);
      const payload = {
        content: [ping.content, content].filter(Boolean).join(' ') || undefined,
        allowedMentions: ping.allowed,
        embeds: embed ? [new EmbedBuilder()
          .setColor(embed.color ? parseInt(embed.color.slice(1), 16) : 0xf2c46d)
          .setTitle(embed.title || null).setDescription(embed.description || null)
          .setImage(embed.image || null).setFooter(embed.footer ? { text: embed.footer } : null)] : [],
      };
      const message = await channel.send(payload);
      audit({ userId: session.userId, action: 'Message envoyé par le bot', detail: `#${channel.name} · ${(content || embed?.title || embed?.description || '').slice(0, 70)}`, req });
      return json(res, 200, { ok: true, url: message.url });
    }),

    'POST sondage': wrap(async (req, res, body, session) => {
      limit(session, 'envoyer', 12, MINUTE);
      const channel = writableChannel(body.channelId);
      const question = texte(body.question, 300, 'Question', { required: true });
      const answers = (Array.isArray(body.answers) ? body.answers : []).map((a) => texte(a, 55, 'Réponse')).filter(Boolean);
      if (answers.length < 2 || answers.length > 10) refuse('Entre 2 et 10 réponses.');
      const hours = entier(body.hours ?? 24, 1, 768, 'Durée (heures)');
      const message = await channel.send({ poll: { question: { text: question }, answers: answers.map((text) => ({ text })), duration: hours, allowMultiselect: body.multiple === true }, allowedMentions: { parse: [] } });
      audit({ userId: session.userId, action: 'Sondage publié', detail: `#${channel.name} · ${question.slice(0, 70)}`, req });
      return json(res, 200, { ok: true, url: message.url });
    }),

    // ---------- Modération ----------
    'GET membres': wrap(async (req, res, body, session, url) => {
      limit(session, 'membres', 40, MINUTE);
      const guild = guildOf(url.searchParams.get('serveur'));
      const q = String(url.searchParams.get('q') ?? '').trim().slice(0, 50);
      if (!q) return json(res, 200, { members: [] });
      const found = ID.test(q)
        ? [await guild.members.fetch(q).catch(() => null)].filter(Boolean)
        : [...(await guild.members.search({ query: q, limit: 12 }).catch(() => guild.members.cache.filter((m) => m.displayName.toLowerCase().includes(q.toLowerCase()) || m.user.username.includes(q.toLowerCase())))).values()].slice(0, 12);
      // Un identifiant qui n'est plus sur le serveur : peut-être banni (pour pouvoir le débannir)
      const ban = ID.test(q) && !found.length ? await guild.bans.fetch(q).catch(() => null) : null;
      const banned = ban ? [{ id: q, name: ban.user.username, avatar: ban.user.displayAvatarURL({ size: 64 }), banned: true, reason: ban.reason ?? null }] : [];
      return json(res, 200, {
        members: [...found.map((m) => ({
          id: m.id, name: m.displayName, username: m.user.username, avatar: m.displayAvatarURL({ size: 64 }), bot: m.user.bot,
          owner: m.id === config.ownerId, mutedUntil: m.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > Date.now() ? m.communicationDisabledUntilTimestamp : null,
          joinedAt: m.joinedTimestamp, topRole: m.roles.highest.id === guild.id ? null : m.roles.highest.name,
          can: { mute: m.moderatable, kick: m.kickable, ban: m.bannable },
        })), ...banned],
      });
    }),

    'POST moderation': wrap(async (req, res, body, session) => {
      limit(session, 'moderation', 20, MINUTE);
      const guild = guildOf(body.guildId);
      const userId = String(body.userId ?? '');
      if (!ID.test(userId)) refuse('Membre inconnu.');
      if (userId === config.ownerId) refuse('On ne touche pas au chef.', 403);
      if (userId === client.user.id) refuse('Le bot ne peut pas se sanctionner lui-même.');
      const reason = `${texte(body.reason, 300, 'Raison') || 'Sans raison donnée'} · depuis le tableau de bord`;
      const act = String(body.action ?? '');
      let detail;
      if (act === 'deban') {
        await guild.bans.remove(userId, reason);
        detail = 'débanni';
      } else {
        const member = await guild.members.fetch(userId).catch(() => null) ?? refuse('Ce membre n’est pas sur le serveur.', 404);
        if (act === 'mute') {
          const minutes = entier(body.minutes, 1, 40320, 'Durée (minutes)');
          if (!member.moderatable) refuse('Le bot ne peut pas rendre muet ce membre (rôle trop haut ou permission manquante).', 403);
          await member.timeout(minutes * MINUTE, reason);
          detail = `muet ${minutes} min`;
        } else if (act === 'demute') {
          if (!member.moderatable) refuse('Le bot ne peut pas modifier ce membre.', 403);
          await member.timeout(null, reason);
          detail = 'plus muet';
        } else if (act === 'expulser') {
          if (!member.kickable) refuse('Le bot ne peut pas expulser ce membre (rôle trop haut ou permission manquante).', 403);
          await member.kick(reason);
          detail = 'expulsé';
        } else if (act === 'bannir') {
          if (!member.bannable) refuse('Le bot ne peut pas bannir ce membre (rôle trop haut ou permission manquante).', 403);
          const days = entier(body.deleteDays ?? 0, 0, 7, 'Jours de messages à supprimer');
          await member.ban({ reason, deleteMessageSeconds: days * 86400 });
          detail = `banni${days ? `, ${days} j de messages supprimés` : ''}`;
        } else {
          refuse('Action inconnue.');
        }
      }
      audit({ userId: session.userId, action: 'Modération', detail: `${who(client, userId).name} (${userId}) ${detail} sur ${guild.name}`, req });
      return json(res, 200, { ok: true, detail });
    }),

    'POST nettoyer': wrap(async (req, res, body, session) => {
      limit(session, 'nettoyer', 6, MINUTE);
      const channel = writableChannel(body.channelId);
      if (!channel.permissionsFor(channel.guild.members.me)?.has([P.ManageMessages, P.ReadMessageHistory])) refuse(`Le bot n’a pas le droit de supprimer des messages dans #${channel.name}.`, 403);
      const count = entier(body.count, 1, 100, 'Nombre de messages');
      const deleted = await channel.bulkDelete(count, true); // Discord refuse ceux de plus de 14 jours
      audit({ userId: session.userId, action: 'Messages supprimés', detail: `${deleted.size} dans #${channel.name}`, req });
      return json(res, 200, { ok: true, count: deleted.size });
    }),

    // ---------- Musique ----------
    'POST musique/jouer': wrap(async (req, res, body, session) => {
      limit(session, 'musique', 15, MINUTE);
      const guild = guildOf(body.guildId);
      const query = texte(body.query, 500, 'Recherche', { required: true });
      if (blindTestActive(guild.id)) refuse('Un blind test est en cours sur ce serveur : attends la fin.', 409);
      const wanted = body.voiceId ? guild.channels.cache.get(String(body.voiceId)) : null;
      if (body.voiceId && !VOICE_TYPES.has(wanted?.type)) refuse('Salon vocal inconnu.');
      const voice = lockedChannel(guild, wanted) ?? wanted ?? guild.members.me?.voice?.channel ?? homeChannel(guild) ?? refuse('Choisis un salon vocal.');
      const result = await resolveQuery(query, { requestedBy: session.userId });
      if (!result.tracks.length) refuse('Rien trouvé : essaie un autre nom ou un lien.', 404);
      const player = getOrCreatePlayer(client, guild);
      player.textChannelId ??= config.jukeboxChannelIds.find((id) => guild.channels.cache.has(id)) ?? null;
      await player.connect(voice);
      player.add(result.tracks, { next: body.next === true });
      const label = result.tracks.length === 1 ? result.tracks[0].title : `${result.tracks.length} sons${result.name ? ` (${result.name})` : ''}`;
      audit({ userId: session.userId, action: 'Musique lancée', detail: `${guild.name} · ${label.slice(0, 80)}`, req });
      return json(res, 200, { ok: true, label, voice: voice.name });
    }),

    'POST musique/file': wrap(async (req, res, body, session) => {
      limit(session, 'musique', 60, MINUTE);
      const player = getPlayer(String(body.guildId ?? '')) ?? refuse('Aucun lecteur sur ce serveur.', 404);
      const act = String(body.action ?? '');
      let detail;
      if (act === 'volume') {
        detail = `volume ${player.setVolume(entier(body.volume, 0, 100, 'Volume'))} %`;
      } else if (act === 'melanger') {
        player.shuffle();
        detail = 'file mélangée';
      } else if (act === 'retirer') {
        const removed = player.remove(entier(body.position, 1, 10_000, 'Position')) ?? refuse('Ce son n’est plus dans la file.', 404);
        detail = `retiré : ${removed.title}`;
      } else if (act === 'vider') {
        detail = `${player.queue.splice(0).length} son(s) retirés de la file`;
      } else if (act === 'precedent') {
        if (!(await player.previous())) refuse('Pas de son précédent.');
        detail = 'son précédent';
      } else if (act === 'boucle') {
        detail = `boucle : ${player.cycleLoop()}`;
      } else {
        refuse('Action inconnue.');
      }
      player.refreshPanel?.();
      audit({ userId: session.userId, action: 'Musique', detail: `${player.guild.name} · ${detail.slice(0, 90)}`, req });
      return json(res, 200, { ok: true, detail });
    }),

    // ---------- Rappels ----------
    'GET rappels': async (req, res) => json(res, 200, {
      reminders: (await listReminders()).map((r) => ({
        id: r.id, at: r.at, text: r.text, user: who(client, r.userId),
        channel: client.channels.cache.get(r.channelId)?.name ?? null,
      })),
    }),
    'POST rappels/creer': wrap(async (req, res, body, session) => {
      limit(session, 'rappels', 10, MINUTE);
      const channel = writableChannel(body.channelId);
      const text = texte(body.text, 500, 'Rappel', { required: true });
      const userId = String(body.userId || session.userId);
      if (!ID.test(userId)) refuse('Identifiant Discord invalide.');
      const minutes = entier(body.minutes, 1, 60 * 24 * 60, 'Dans combien de minutes');
      const { error, reminder } = await addReminder({ userId, channelId: channel.id, guildId: channel.guild.id, text, delayMs: minutes * MINUTE });
      if (error) refuse(error);
      audit({ userId: session.userId, action: 'Rappel créé', detail: `pour ${who(client, userId).name} dans ${minutes} min · ${text.slice(0, 60)}`, req });
      return json(res, 200, { ok: true, id: reminder.id, at: reminder.at });
    }),
    'POST rappels/supprimer': wrap(async (req, res, body, session) => {
      const id = String(body.id ?? '');
      if (!/^[a-z0-9]{4,20}$/.test(id)) refuse('Rappel inconnu.');
      if (!(await removeReminder(id))) refuse('Ce rappel est déjà passé.', 404);
      audit({ userId: session.userId, action: 'Rappel supprimé', detail: id, req });
      return json(res, 200, { ok: true });
    }),

    // ---------- Pièces d'or (économie de chaque serveur) ----------
    'GET or': wrap(async (req, res, body, session, url) => {
      const guild = guildOf(url.searchParams.get('serveur'));
      const eco = await economyOverview(guild.id);
      const levels = Object.fromEntries((await topLevels(guild.id, 200)).map((l) => [l.userId, l.level]));
      return json(res, 200, { guildId: guild.id, ...eco, top: eco.top.map((p) => ({ ...p, user: who(client, p.userId), level: levels[p.userId] ?? 0 })) });
    }),
    'POST or/pieces': wrap(async (req, res, body, session) => {
      limit(session, 'or', 30, MINUTE);
      const guild = guildOf(body.guildId);
      const userId = String(body.userId ?? '');
      if (!ID.test(userId)) refuse('Identifiant Discord invalide.');
      let detail;
      if (body.remise === true) {
        detail = `bourse remise à zéro (${await resetPurse(guild.id, userId)} pièces)`;
      } else if (body.effet) {
        const until = await giftEffect(guild.id, userId, String(body.effet)).catch((err) => refuse(err.message));
        detail = `effet « ${body.effet} » offert jusqu’au ${until.toLocaleString('fr-FR')}`;
      } else {
        const amount = entier(body.amount, -10_000_000, 10_000_000, 'Pièces');
        if (!amount) refuse('Pièces : un nombre différent de 0.');
        detail = `${amount > 0 ? '+' : ''}${amount} pièces d’or → bourse ${await addGold(guild.id, userId, amount)}`;
      }
      audit({ userId: session.userId, action: 'Pièces d’or', detail: `${guild.name} · ${who(client, userId).name} : ${detail}`, req });
      return json(res, 200, { ok: true, detail });
    }),

    // ---------- Réglages de chaque serveur (sécurité, niveaux, boutique…) ----------
    'GET serveur/reglages': wrap(async (req, res, body, session, url) => {
      const guild = guildOf(url.searchParams.get('serveur'));
      return json(res, 200, { guildId: guild.id, sections: SECTIONS, settings: guildSettings(guild.id) });
    }),
    'POST serveur/reglages': wrap(async (req, res, body, session) => {
      const guild = guildOf(body.guildId);
      const result = setGuildSettings(guild.id, body.changes);
      if (!result.ok) return json(res, 400, { error: 'Certains réglages sont refusés.', errors: result.errors });
      if (result.changed.length) audit({ userId: session.userId, action: 'Réglages du serveur', detail: `${guild.name} · ${result.changed.join(', ').slice(0, 120)}`, req });
      return json(res, 200, { ok: true, changed: result.changed });
    }),

    // ---------- Historique des sanctions (avertissements écrits, vocaux et manuels) ----------
    'GET sanctions': async (req, res) => {
      const all = (await load('warnings', {}).catch(() => ({}))) ?? {};
      const rows = [];
      for (const [guildId, users] of Object.entries(all)) {
        for (const [userId, list] of Object.entries(users ?? {})) {
          for (const w of list ?? []) rows.push({ guildId, guild: client.guilds.cache.get(guildId)?.name ?? guildId, user: who(client, userId), userId, at: w.at, reason: w.reason, kind: w.kind ?? 'manuel', by: w.by ? who(client, w.by).name : null });
        }
      }
      rows.sort((a, b) => b.at - a.at);
      return json(res, 200, { sanctions: rows.slice(0, 300), total: rows.length });
    },
    'POST sanctions/effacer': wrap(async (req, res, body, session) => {
      const guildId = String(body.guildId ?? '');
      const userId = String(body.userId ?? '');
      const at = Number(body.at);
      if (!ID.test(guildId) || !ID.test(userId) || !Number.isFinite(at)) refuse('Sanction inconnue.');
      const all = (await load('warnings', {}).catch(() => ({}))) ?? {};
      const list = all[guildId]?.[userId] ?? [];
      const index = list.findIndex((w) => w.at === at);
      if (index < 0) refuse('Cette sanction n’existe plus.', 404);
      const [removed] = list.splice(index, 1);
      save('warnings', all);
      audit({ userId: session.userId, action: 'Sanction effacée', detail: `${who(client, userId).name} · ${String(removed.reason ?? '').slice(0, 80)}`, req });
      return json(res, 200, { ok: true });
    }),

    // ---------- Offres premium des serveurs ----------
    'GET premium': async (req, res) => json(res, 200, {
      servers: client.guilds.cache.map((g) => {
        const plan = planOf(g.id);
        const s = allServers()[g.id] ?? {};
        return { id: g.id, name: g.name, plan: plan.label, emoji: plan.emoji, trial: plan.trial, until: plan.until, trialUsed: Boolean(s.trialUsed) };
      }),
      paypal: paypalMode(),
      payments: (await paymentHistory()).slice(0, 50).map((x) => ({ ...x, guild: client.guilds.cache.get(x.guildId)?.name ?? x.guildId, payer: undefined })),
    }),

    // ---------- Le bot ----------
    'POST bot/redemarrer': wrap(async (req, res, body, session) => {
      if (session.userId !== config.ownerId) refuse('Seul le chef peut redémarrer le bot.', 403);
      audit({ userId: session.userId, action: 'Redémarrage du bot', detail: instance.where, req });
      json(res, 200, { ok: true, where: instance.where, render: Boolean(process.env.RENDER) });
      // Laisse le temps à la réponse et au journal de partir ; Render relance le bot tout seul.
      setTimeout(() => process.kill(process.pid, 'SIGTERM'), 1500);
    }),
  };
  return routes;
}
