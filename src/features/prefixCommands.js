// Commandes rapides en « !! » : !!clear 20, !!ban @membre raison, !!close, !!roles, !!play son…
// Elles passent par les mêmes fonctions que les commandes slash (casier, MP de sanction, journal du staff) :
// on leur donne une « interaction » construite à partir du message.
import { EmbedBuilder, MessageFlags, PermissionFlagsBits as P } from 'discord.js';
import { load, save } from '../storage.js';

export const PREFIX = '!!';
const PRIVATE_MS = 10_000; // réponses « privées » des commandes slash : visibles 10 s dans le salon

/** Une fausse interaction à partir d'un message (réponses envoyées dans le salon). */
function fromMessage(message, commandName, values = {}) {
  let sent = null;
  const out = async (payload) => {
    const body = typeof payload === 'string' ? { content: payload } : { ...payload };
    const ephemeral = Boolean(body.ephemeral || (Number(body.flags ?? 0) & MessageFlags.Ephemeral));
    delete body.ephemeral;
    delete body.flags;
    delete body.fetchReply;
    delete body.withResponse;
    body.allowedMentions ??= { parse: [] };
    if (sent) { await sent.edit(body).catch(() => {}); return sent; }
    sent = await message.channel.send(body).catch(() => null);
    if (sent && ephemeral) setTimeout(() => sent.delete().catch(() => {}), PRIVATE_MS);
    return sent;
  };
  const get = (name, required) => {
    const v = values[name];
    if ((v === undefined || v === null) && required) throw new Error(`il manque « ${name} »`);
    return v ?? null;
  };
  const i = {
    commandName, customId: values.customId ?? null, client: message.client,
    user: message.author, member: message.member, guild: message.guild, guildId: message.guildId,
    channel: message.channel, channelId: message.channelId,
    memberPermissions: message.member?.permissions ?? null,
    replied: false, deferred: false,
    inGuild: () => true, isChatInputCommand: () => true, isButton: () => false, isStringSelectMenu: () => false, isRepliable: () => true,
    options: {
      getUser: (n, r) => get(n, r)?.user ?? get(n, r),
      getMember: (n) => (values[n]?.user ? values[n] : null),
      getString: (n, r) => get(n, r), getInteger: (n, r) => get(n, r), getNumber: (n, r) => get(n, r), getBoolean: (n) => values[n] ?? null,
      getChannel: (n, r) => get(n, r), getRole: (n, r) => get(n, r), getSubcommand: () => values.sub ?? null, getFocused: () => '',
    },
    reply: async (p) => { i.replied = true; return out(p); },
    deferReply: async (p) => { i.deferred = true; if (!(Number(p?.flags ?? 0) & MessageFlags.Ephemeral)) await out('⏳ …'); },
    editReply: async (p) => out(p),
    followUp: async (p) => out(p),
    update: async (p) => out(p),
    deferUpdate: async () => {},
    showModal: async () => out({ content: 'Cette action a besoin d’une fenêtre : utilise la commande slash.', ephemeral: true }),
    fetchReply: async () => sent,
  };
  return i;
}

// ---------------------------------------------------------------- Lecture des arguments
const idOf = (s) => String(s ?? '').match(/^<@!?(\d{15,21})>$|^(\d{15,21})$/)?.slice(1).find(Boolean) ?? null;
const roleIdOf = (s) => String(s ?? '').match(/^<@&(\d{15,21})>$|^(\d{15,21})$/)?.slice(1).find(Boolean) ?? null;
const chanIdOf = (s) => String(s ?? '').match(/^<#(\d{15,21})>$/)?.[1] ?? null;
async function memberArg(message, arg) {
  const id = idOf(arg);
  return id ? message.guild.members.fetch(id).catch(() => null) : null;
}
function roleArg(message, args) {
  const id = roleIdOf(args[0]);
  if (id) return message.guild.roles.cache.get(id) ?? null;
  const name = args.join(' ').toLowerCase();
  return name ? message.guild.roles.cache.find((r) => r.name.toLowerCase() === name) ?? message.guild.roles.cache.find((r) => r.name.toLowerCase().includes(name)) ?? null : null;
}

// ---------------------------------------------------------------- Les commandes
// Chaque commande : usage, description, groupe, et run(message, args) qui renvoie les valeurs pour le handler
// (ou gère tout elle-même).
const C = {};
const def = (names, spec) => { for (const n of [names].flat()) C[n] = { ...spec, name: [names].flat()[0] }; };
const mod = async (name, message, values) => {
  const { MODERATION_HANDLERS } = await import('../handlers/moderation.js');
  return MODERATION_HANDLERS[name](message.client, fromMessage(message, name, values));
};
const util = async (name, message, values = {}) => {
  const { UTILITY_HANDLERS } = await import('../handlers/utility.js');
  return UTILITY_HANDLERS[name](message.client, fromMessage(message, name, values));
};
const music = async (name, message, values = {}) => {
  const { handleMusicCommand } = await import('../music/handlers.js');
  return handleMusicCommand(message.client, fromMessage(message, name, values));
};
const need = (message, text) => message.channel.send({ content: `❓ ${text}`, allowedMentions: { parse: [] } }).then((m) => setTimeout(() => m.delete().catch(() => {}), PRIVATE_MS)).catch(() => {});

// ===== Modération
def(['clear', 'clean', 'purge'], {
  group: '🛡️ Modération', usage: '!!clear 20 [@membre]', desc: 'Efface les derniers messages du salon (100 max)',
  async run(message, [n, who]) {
    const amount = Math.min(100, Math.max(1, Number(n) || 0));
    if (!Number(n)) return need(message, 'Combien ? Exemple : `!!clear 20`');
    if (!message.member.permissionsIn(message.channel).has(P.ManageMessages)) return need(message, 'Il te faut la permission **Gérer les messages**.');
    const target = idOf(who);
    await message.delete().catch(() => {});
    const fetched = await message.channel.messages.fetch({ limit: target ? 100 : amount }).catch(() => null);
    const list = [...(fetched?.values() ?? [])].filter((x) => x.id !== message.id && (!target || x.author.id === target)).slice(0, amount);
    const deleted = list.length ? await message.channel.bulkDelete(list, true).catch(() => null) : null;
    const done = deleted?.size ?? 0;
    const old = list.length - done;
    return need(message, `🧹 **${done}** message${done > 1 ? 's' : ''} supprimé${done > 1 ? 's' : ''}${target ? ` de <@${target}>` : ''}.${old > 0 ? `\n-# ${old} ignoré${old > 1 ? 's' : ''} : plus de 14 jours.` : ''}`);
  },
});
def('ban', { group: '🛡️ Modération', usage: '!!ban @membre [raison]', desc: 'Bannit un membre (il est prévenu en MP)',
  async run(message, [who, ...reason]) {
    const member = await memberArg(message, who);
    const user = member?.user ?? await message.client.users.fetch(idOf(who) ?? '0').catch(() => null);
    if (!user) return need(message, 'Qui ? Exemple : `!!ban @membre spam`');
    return mod('ban', message, { membre: member ?? user, raison: reason.join(' ') || null, messages: '0' });
  } });
def('unban', { group: '🛡️ Modération', usage: '!!unban identifiant', desc: 'Débannit quelqu’un',
  run: (message, [id]) => (idOf(id) ? mod('unban', message, { id: idOf(id) }) : need(message, 'Donne l’identifiant : `!!unban 123456789012345678`')) });
def('kick', { group: '🛡️ Modération', usage: '!!kick @membre [raison]', desc: 'Expulse un membre',
  async run(message, [who, ...reason]) {
    const member = await memberArg(message, who);
    return member ? mod('kick', message, { membre: member, raison: reason.join(' ') || null }) : need(message, 'Qui ? Exemple : `!!kick @membre`');
  } });
def(['mute', 'timeout', 'tempmute'], { group: '🛡️ Modération', usage: '!!mute @membre 10m [raison]', desc: 'Rend muet un moment (10m, 2h, 1j…)',
  async run(message, [who, duree, ...reason]) {
    const member = await memberArg(message, who);
    if (!member || !duree) return need(message, 'Exemple : `!!mute @membre 10m spam`');
    return mod('mute', message, { membre: member, duree, raison: reason.join(' ') || null });
  } });
def('unmute', { group: '🛡️ Modération', usage: '!!unmute @membre', desc: 'Rend la parole',
  async run(message, [who]) { const member = await memberArg(message, who); return member ? mod('unmute', message, { membre: member }) : need(message, 'Exemple : `!!unmute @membre`'); } });
def('warn', { group: '🛡️ Modération', usage: '!!warn @membre raison', desc: 'Avertit (sanctions progressives automatiques)',
  async run(message, [who, ...reason]) {
    const member = await memberArg(message, who);
    if (!member || !reason.length) return need(message, 'Exemple : `!!warn @membre insultes`');
    return mod('warn', message, { membre: member, raison: reason.join(' ') });
  } });
def(['warns', 'casier'], { group: '🛡️ Modération', usage: '!!warns @membre', desc: 'Voir les avertissements d’un membre',
  async run(message, [who]) { const member = await memberArg(message, who); return member ? mod('warns', message, { membre: member }) : need(message, 'Exemple : `!!warns @membre`'); } });
def(['slowmode', 'lent'], { group: '🛡️ Modération', usage: '!!slowmode 10', desc: 'Mode lent en secondes (0 pour l’enlever)',
  run: (message, [n]) => (Number.isFinite(Number(n)) ? mod('slowmode', message, { secondes: Math.min(21600, Math.max(0, Number(n))) }) : need(message, 'Exemple : `!!slowmode 10`')) });
def('lock', { group: '🛡️ Modération', usage: '!!lock [#salon]', desc: 'Verrouille le salon', run: (message, [c]) => mod('lock', message, { salon: message.guild.channels.cache.get(chanIdOf(c)) ?? null }) });
def('unlock', { group: '🛡️ Modération', usage: '!!unlock [#salon]', desc: 'Déverrouille le salon', run: (message, [c]) => mod('unlock', message, { salon: message.guild.channels.cache.get(chanIdOf(c)) ?? null }) });
def('role', { group: '🛡️ Modération', usage: '!!role @membre @rôle', desc: 'Donne le rôle (ou l’enlève s’il l’a déjà)',
  async run(message, [who, ...rest]) {
    const member = await memberArg(message, who);
    const role = roleArg(message, rest);
    if (!member || !role) return need(message, 'Exemple : `!!role @membre @VIP`');
    return mod('role', message, { membre: member, role, action: member.roles.cache.has(role.id) ? 'remove' : 'add' });
  } });
def('say', { group: '🛡️ Modération', usage: '!!say texte', desc: 'Le bot écrit le message à ta place',
  async run(message, args) { if (!args.length) return need(message, 'Exemple : `!!say Bienvenue à tous !`'); await message.delete().catch(() => {}); return mod('say', message, { message: args.join(' ') }); } });

// ===== Tickets
def(['close', 'fermer'], { group: '🎫 Tickets', usage: '!!close', desc: 'Ferme le ticket (transcription envoyée)',
  async run(message) {
    const { handleTicketComponent } = await import('./tickets.js');
    return handleTicketComponent(message.client, fromMessage(message, 'close', { customId: 'tk:closeyes' }));
  } });

// ===== Infos
def(['roles', 'rôles'], { group: '🧭 Infos', usage: '!!roles', desc: 'Les rôles du serveur et combien de membres les ont',
  async run(message) {
    await message.guild.members.fetch().catch(() => {});
    const roles = [...message.guild.roles.cache.values()].filter((r) => r.id !== message.guild.id).sort((a, b) => b.position - a.position);
    const lines = roles.map((r) => `${r} · **${r.members.size}**${r.managed ? ' 🤖' : ''}`);
    const pages = [];
    for (let k = 0; k < lines.length; k += 40) pages.push(lines.slice(k, k + 40).join('\n'));
    for (const [n, page] of pages.slice(0, 3).entries()) {
      await message.channel.send({ embeds: [new EmbedBuilder().setColor(0xc9a978).setTitle(n ? '🎭 Rôles (suite)' : `🎭 Les ${roles.length} rôles de ${message.guild.name}`).setDescription(page || 'Aucun rôle.')], allowedMentions: { parse: [] } });
    }
  } });
def(['userinfo', 'ui', 'profil'], { group: '🧭 Infos', usage: '!!userinfo [@membre]', desc: 'Infos sur un membre',
  async run(message, [who]) { const member = await memberArg(message, who); return util('userinfo', message, { membre: member ?? null }); } });
def(['serverinfo', 'si', 'serveur'], { group: '🧭 Infos', usage: '!!serverinfo', desc: 'Infos sur le serveur', run: (message) => util('serverinfo', message) });
def(['avatar', 'pp', 'pdp'], { group: '🧭 Infos', usage: '!!avatar [@membre]', desc: 'La photo de profil en grand',
  async run(message, [who]) { const member = await memberArg(message, who); return util('avatar', message, { membre: member ?? null }); } });
def('ping', { group: '🧭 Infos', usage: '!!ping', desc: 'Latence du bot',
  run: (message) => message.channel.send(`🏓 Pong ! **${Math.round(message.client.ws.ping)} ms**`) });
def(['aide', 'help', 'commandes'], { group: '🧭 Infos', usage: '!!aide', desc: 'La liste de toutes les commandes « !! »',
  run: (message) => message.channel.send({ embeds: helpEmbeds(), allowedMentions: { parse: [] } }) });

// ===== Musique
def(['play', 'p'], { group: '🎵 Musique', usage: '!!play titre ou lien', desc: 'Joue un son (Spotify, YouTube, Deezer…)',
  run: (message, args) => (args.length ? music('play', message, { recherche: args.join(' ') }) : need(message, 'Exemple : `!!play Jul bande organisée`')) });
def(['skip', 's'], { group: '🎵 Musique', usage: '!!skip', desc: 'Son suivant', run: (message) => music('skip', message) });
def('stop', { group: '🎵 Musique', usage: '!!stop', desc: 'Arrête la musique et vide la file', run: (message) => music('stop', message) });
def('pause', { group: '🎵 Musique', usage: '!!pause', desc: 'Met en pause', run: (message) => music('pause', message) });
def(['resume', 'reprendre'], { group: '🎵 Musique', usage: '!!resume', desc: 'Reprend la lecture', run: (message) => music('resume', message) });
def(['queue', 'q', 'file'], { group: '🎵 Musique', usage: '!!queue', desc: 'La file d’attente', run: (message) => music('queue', message) });
def(['np', 'nowplaying'], { group: '🎵 Musique', usage: '!!np', desc: 'Le son en cours', run: (message) => music('nowplaying', message) });
def(['volume', 'vol'], { group: '🎵 Musique', usage: '!!volume 50', desc: 'Volume de 0 à 150',
  run: (message, [n]) => (Number.isFinite(Number(n)) ? music('volume', message, { niveau: Math.max(0, Math.min(150, Number(n))) }) : need(message, 'Exemple : `!!volume 50`')) });
def(['shuffle', 'melanger'], { group: '🎵 Musique', usage: '!!shuffle', desc: 'Mélange la file', run: (message) => music('shuffle', message) });
def(['lyrics', 'paroles'], { group: '🎵 Musique', usage: '!!lyrics', desc: 'Les paroles du son en cours', run: (message) => music('lyrics', message) });
def('join', { group: '🎵 Musique', usage: '!!join', desc: 'Le bot rejoint ton vocal', run: (message) => music('join', message) });
def('leave', { group: '🎵 Musique', usage: '!!leave', desc: 'Le bot quitte le vocal', run: (message) => music('leave', message) });

// ---------------------------------------------------------------- Aide et résumé dans #agora
const unique = () => [...new Map(Object.values(C).map((c) => [c.name, c])).values()];
export function helpEmbeds() {
  const groups = new Map();
  for (const c of unique()) (groups.get(c.group) ?? groups.set(c.group, []).get(c.group)).push(c);
  return [...groups.entries()].map(([title, list], i) => new EmbedBuilder().setColor([0xed4245, 0x5865f2, 0xc9a978, 0x3fbf6a][i % 4]).setTitle(title)
    .setDescription(list.map((c) => `\`${c.usage}\` · ${c.desc}`).join('\n'))
    .setFooter(i === groups.size - 1 ? { text: 'Les commandes de modération demandent les mêmes permissions que dans /sanction.' } : null));
}
const HELP_KEY = 'prefix-help';
const helpVersion = () => unique().map((c) => c.usage).join('|');
/** Au démarrage : publie le résumé des commandes dans le salon « agora » (une seule fois par version). */
export async function postCommandSummary(client) {
  const done = await load(HELP_KEY, {}).catch(() => ({}));
  const version = helpVersion();
  for (const guild of client.guilds.cache.values()) {
    if (done[guild.id] === version) continue;
    const channel = guild.channels.cache.find((c) => c.isTextBased?.() && !c.isThread?.() && /agora/i.test(c.name));
    if (!channel?.permissionsFor(guild.members.me)?.has([P.SendMessages, P.EmbedLinks])) continue;
    const ok = await channel.send({
      content: '📜 **Les commandes rapides du bot** · tape `!!aide` pour revoir cette liste. Les commandes slash (`/play`, `/musique`, `/sanction`, `/jeux`…) marchent toujours.',
      embeds: helpEmbeds(), allowedMentions: { parse: [] },
    }).catch(() => null);
    if (ok) done[guild.id] = version;
  }
  await save(HELP_KEY, done);
}

/** true si le message était une commande « !! » (traitée ici, le reste du bot l'ignore). */
export async function prefixCommand(message) {
  if (!message.content.startsWith(PREFIX)) return false;
  const [word, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = C[String(word ?? '').toLowerCase()];
  if (!cmd) return false;
  try {
    await cmd.run(message, args.filter(Boolean));
  } catch (err) {
    console.warn(`[!!${cmd.name}]`, err.message);
    await need(message, `Ça a pas marché : ${err.message}`);
  }
  return true;
}

export const _test = { C, fromMessage, idOf };
