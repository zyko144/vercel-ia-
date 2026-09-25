// Outils du serveur : candidatures staff avec vote, rôles par boutons, messages programmés,
// anniversaires, compteur de membres. Boutons : « st: ».
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { load, save } from '../storage.js';
import { buildModal, field as f, readModal } from '../panels/ui.js';
import { truncate } from '../utils/discord.js';
import { addGold } from './economy.js';
import { cfg, setInternal } from './guildConfig.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const GOLD = 0xc9a978;
const TZ = 'Europe/Paris';
const KEY = 'outils-serveur';
let store = null;
let loading = null;
async function data() {
  loading ??= load(KEY, {}).catch(() => ({})).then((d) => { store = d ?? {}; return store; });
  return loading;
}
const persist = () => save(KEY, store);
const g = (guildId) => ((store[guildId] ??= { applications: {}, schedules: [], birthdays: {} }));
const parisNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
const newId = () => Math.random().toString(36).slice(2, 9);

// ===================== Candidatures staff (idée 69) =====================

export const APPLY_FIELDS = () => [
  f.text('age', 'Ton âge', { req: true, max: 3 }),
  f.para('pourquoi', 'Pourquoi veux-tu rejoindre le staff ?', { req: true, max: 1000 }),
  f.para('experience', 'Ton expérience (modération, serveurs…)', { max: 800 }),
  f.text('dispo', 'Tes disponibilités', { req: true, max: 150, ph: 'Soirs de semaine, week-end…' }),
];
export async function submitApplication(interaction, values) {
  await data();
  const channel = interaction.guild.channels.cache.get(cfg(interaction.guildId, 'staff.applicationsChannelId') ?? '');
  if (!channel?.isTextBased?.()) return interaction.reply({ content: '❌ Le salon des candidatures n’est pas réglé (tableau de bord › Outils du serveur).', ...PRIVATE });
  const id = newId();
  g(interaction.guildId).applications[id] = { userId: interaction.user.id, at: Date.now(), votes: {}, status: 'attente' };
  persist();
  await channel.send({ embeds: [applicationEmbed(interaction.guildId, id, values, interaction.user)], components: [applicationRow(id)] });
  return interaction.reply({ content: '📨 Ta candidature est envoyée au staff. Tu recevras la réponse en MP.', ...PRIVATE });
}
function applicationEmbed(guildId, id, v, user) {
  return new EmbedBuilder().setColor(GOLD).setAuthor({ name: `📝 Candidature de ${user.username}`, iconURL: user.displayAvatarURL?.({ size: 64 }) })
    .addFields(
      { name: 'Âge', value: truncate(v.age, 10), inline: true },
      { name: 'Disponibilités', value: truncate(v.dispo, 200), inline: true },
      { name: 'Motivation', value: truncate(v.pourquoi, 1000) },
      { name: 'Expérience', value: truncate(v.experience || '—', 800) },
      { name: 'Votes', value: '✅ 0 · ❌ 0' },
    ).setFooter({ text: `${user.id} · ${id}` });
}
const applicationRow = (id, done = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`st:vote:${id}:oui`).setLabel('Pour').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(done),
  new ButtonBuilder().setCustomId(`st:vote:${id}:non`).setLabel('Contre').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(done),
  new ButtonBuilder().setCustomId(`st:decide:${id}:accepte`).setLabel('Accepter').setEmoji('🏴‍☠️').setStyle(ButtonStyle.Primary).setDisabled(done),
  new ButtonBuilder().setCustomId(`st:decide:${id}:refuse`).setLabel('Refuser').setStyle(ButtonStyle.Secondary).setDisabled(done),
);

// ===================== Rôles par boutons (idée 70) =====================

export async function postRolePanel(interaction, { salon, titre, texte, roles }) {
  const me = interaction.guild.members.me;
  const usable = roles.filter((r) => r && !r.managed && r.id !== interaction.guild.id && r.position < me.roles.highest.position);
  if (!usable.length) return interaction.reply({ content: '❌ Aucun de ces rôles n’est donnable (mon rôle doit être au-dessus d’eux).', ...PRIVATE });
  const channel = salon ?? interaction.channel;
  await channel.send({
    embeds: [new EmbedBuilder().setColor(GOLD).setTitle(titre || '🎭 Choisis tes rôles').setDescription(`${texte || 'Clique sur un bouton pour prendre ou enlever un rôle.'}\n\n${usable.map((r) => `• ${r}`).join('\n')}`)],
    components: [new ActionRowBuilder().addComponents(usable.slice(0, 5).map((r) => new ButtonBuilder().setCustomId(`st:role:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary)))],
    allowedMentions: { parse: [] },
  });
  return interaction.reply({ content: `✅ Panneau de rôles publié dans ${channel}.`, ...PRIVATE });
}

// ===================== Messages programmés (idée 71) =====================

const REPEAT = { non: 0, jour: 86_400_000, semaine: 7 * 86_400_000 };
/** « 25/12 18:30 », « 18:30 » (aujourd'hui ou demain), « dans 2h ». Renvoie une date (ms) ou null. */
export function parseWhen(text, now = Date.now()) {
  const t = String(text).trim().toLowerCase();
  const rel = t.match(/^dans\s+(\d+)\s*(min|m|h|j)/);
  if (rel) return now + Number(rel[1]) * { min: 60_000, m: 60_000, h: 3_600_000, j: 86_400_000 }[rel[2]];
  const m = t.match(/^(?:(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+)?(\d{1,2})[:h](\d{2})$/);
  if (!m) return null;
  // L'heure est celle de Paris : on part de « maintenant à Paris » et on corrige le décalage
  const paris = new Date(new Date(now).toLocaleString('en-US', { timeZone: TZ }));
  const offset = paris.getTime() - now;
  const target = new Date(paris);
  if (m[1]) { target.setMonth(Number(m[2]) - 1, Number(m[1])); if (m[3]) target.setFullYear(Number(m[3])); }
  target.setHours(Number(m[4]), Number(m[5]), 0, 0);
  let at = target.getTime() - offset;
  if (!m[1] && at <= now) at += 86_400_000;
  return at > now ? at : null;
}
export async function scheduleMessage(guildId, { channelId, text, at, repeat = 'non', by }) {
  await data();
  const list = g(guildId).schedules;
  if (list.length >= 25) return { error: '25 messages programmés maximum par serveur.' };
  const s = { id: newId(), channelId, text, at, every: REPEAT[repeat] ?? 0, by };
  list.push(s);
  persist();
  return s;
}
export async function schedulesOf(guildId) {
  await data();
  return g(guildId).schedules;
}
export async function removeSchedule(guildId, id) {
  await data();
  const list = g(guildId).schedules;
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  persist();
  return true;
}

// ===================== Anniversaires (idée 72) =====================

export async function setBirthday(guildId, userId, day, month) {
  await data();
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= new Date(2024, month, 0).getDate())) return false;
  g(guildId).birthdays[userId] = { day, month };
  persist();
  return true;
}
export async function birthdaysOf(guildId) {
  await data();
  return g(guildId).birthdays;
}

// ===================== Boutons =====================

export const isToolComponent = (interaction) => /^st:/.test(interaction.customId ?? '');
export async function handleToolComponent(client, interaction) {
  await data();
  const [, what, id, arg] = interaction.customId.split(':');
  if (what === 'role') {
    const role = interaction.guild.roles.cache.get(id);
    if (!role) return interaction.reply({ content: 'Ce rôle n’existe plus.', ...PRIVATE });
    const has = interaction.member.roles.cache.has(id);
    const ok = await (has ? interaction.member.roles.remove(id, 'Rôles par boutons') : interaction.member.roles.add(id, 'Rôles par boutons')).then(() => true, () => false);
    return interaction.reply({ content: ok ? `${has ? '➖ Rôle retiré' : '➕ Rôle ajouté'} : ${role}` : '❌ Je ne peux pas donner ce rôle.', allowedMentions: { parse: [] }, ...PRIVATE });
  }
  const a = g(interaction.guildId).applications[id];
  if (!a) return interaction.reply({ content: 'Candidature introuvable.', ...PRIVATE });
  if (!interaction.memberPermissions?.has(P.ManageMessages)) return interaction.reply({ content: '🔒 Réservé au staff.', ...PRIVATE });
  const embed = () => {
    const e = EmbedBuilder.from(interaction.message.embeds[0]);
    const votes = Object.values(a.votes);
    const fields = e.data.fields.map((x) => (x.name === 'Votes' ? { ...x, value: `✅ ${votes.filter((v) => v === 'oui').length} · ❌ ${votes.filter((v) => v === 'non').length}` } : x));
    return e.setFields(fields);
  };
  if (what === 'vote') {
    if (a.status !== 'attente') return interaction.reply({ content: 'La décision est déjà prise.', ...PRIVATE });
    a.votes[interaction.user.id] = arg;
    persist();
    return interaction.update({ embeds: [embed()] });
  }
  if (what === 'decide') {
    if (!interaction.memberPermissions.has(P.ManageRoles)) return interaction.reply({ content: '🔒 Il faut pouvoir gérer les rôles pour décider.', ...PRIVATE });
    a.status = arg;
    persist();
    const user = await client.users.fetch(a.userId).catch(() => null);
    await user?.send(arg === 'accepte' ? `🏴‍☠️ Bonne nouvelle : ta candidature au staff de **${interaction.guild.name}** est **acceptée** ! Un membre du staff va te contacter.` : `📝 Ta candidature au staff de **${interaction.guild.name}** n’a pas été retenue cette fois. Merci d’avoir proposé ton aide !`).catch(() => {});
    return interaction.update({ embeds: [embed().setColor(arg === 'accepte' ? 0x3fbf6a : 0x6b5a45).addFields({ name: 'Décision', value: `${arg === 'accepte' ? '✅ Acceptée' : '❌ Refusée'} par ${interaction.user}` })], components: [applicationRow(id, true)] });
  }
  return undefined;
}

// ===================== Minuteries =====================

async function tick(client) {
  await data();
  const now = Date.now();
  const paris = parisNow();
  const day = paris.toISOString().slice(0, 10);
  for (const guild of client.guilds.cache.values()) {
    const gd = store[guild.id];
    // Messages programmés
    for (const s of [...(gd?.schedules ?? [])]) {
      if (s.at > now) continue;
      const channel = guild.channels.cache.get(s.channelId);
      await channel?.send?.({ content: s.text, allowedMentions: { parse: ['roles', 'users'] } }).catch(() => {});
      if (s.every) while (s.at <= now) s.at += s.every;
      else gd.schedules = gd.schedules.filter((x) => x.id !== s.id);
      persist();
    }
    // Anniversaires, à 9 h
    if (cfg(guild.id, 'birthdays.enabled') && paris.getHours() >= 9 && cfg(guild.id, 'birthdays.lastDay') !== day) {
      setInternal(guild.id, 'birthdays.lastDay', day);
      const today = Object.entries(gd?.birthdays ?? {}).filter(([, b]) => b.day === paris.getDate() && b.month === paris.getMonth() + 1).map(([id]) => id);
      const roleId = cfg(guild.id, 'birthdays.roleId');
      if (roleId && guild.roles.cache.has(roleId)) for (const m of guild.roles.cache.get(roleId).members.values()) await m.roles.remove(roleId).catch(() => {});
      if (today.length) {
        const channel = guild.channels.cache.get(cfg(guild.id, 'birthdays.channelId') ?? cfg(guild.id, 'announce.channelId') ?? '');
        for (const id of today) {
          await addGold(guild.id, id, 500, 'Cadeau d’anniversaire').catch(() => {});
          if (roleId) await (await guild.members.fetch(id).catch(() => null))?.roles.add(roleId).catch(() => {});
        }
        await channel?.send?.({ embeds: [new EmbedBuilder().setColor(0xff5fa2).setTitle('🎂 Joyeux anniversaire !').setDescription(`Tout l’équipage souhaite un joyeux anniversaire à ${today.map((id) => `<@${id}>`).join(', ')} ! 🎉\n**+🪙 500 pièces d’or** en cadeau.`)], allowedMentions: { users: today } }).catch(() => {});
      }
    }
    // Compteur de membres (toutes les 10 minutes au plus : Discord limite les renommages)
    const counterId = cfg(guild.id, 'counter.channelId');
    const counter = counterId ? guild.channels.cache.get(counterId) : null;
    if (counter && now - (cfg(guild.id, 'counter.lastAt') ?? 0) > 10 * 60_000) {
      const name = `👥 Membres : ${guild.memberCount.toLocaleString('fr-FR')}`;
      if (counter.name !== name) {
        setInternal(guild.id, 'counter.lastAt', now);
        await counter.setName(name, 'Compteur de membres').catch(() => {});
      }
    }
  }
}

export function startServerTools(client) {
  setInterval(() => tick(client).catch((err) => console.warn('[outils]', err.message)), 60_000).unref();
}

export const _test = { tick, data: () => data(), store: () => store, ChannelType };
