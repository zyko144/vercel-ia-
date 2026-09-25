// L'IA peut lancer les actions des panneaux (/jeux, /musique, /sanction, /serveur, /pannel, /ia) quand on lui demande.
//
// 1. Le prompt de l'IA contient la liste des actions possibles.
// 2. Si la personne demande de FAIRE quelque chose, l'IA termine sa réponse par [[ACTION panneau.action {"champ": "valeur"}]].
// 3. Le bot enlève cette ligne et ajoute un bouton « Lancer ». Le clic est une vraie interaction : mêmes permissions
//    que le panneau. Si tout est rempli, l'action part tout de suite ; sinon la fenêtre s'ouvre, déjà préremplie.
import crypto from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { config } from '../config.js';
import { PANELS, findAction } from '../panels/catalog.js';
import { buildModal } from '../panels/ui.js';

const PRIVATE = { flags: MessageFlags.Ephemeral };
const TTL = 15 * 60_000;
const pending = new Map(); // jeton -> { userId, key, id, values, at }
const TAG = /\[\[\s*ACTION\s+([^\s.{\]]+)\.([^\s{\]]+)\s*(\{[\s\S]*?\})?\s*\]\]/i;

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Toutes les actions que l'IA a le droit de proposer (pas celles réservées au chef, pas les envois de fichier). */
export function aiCatalog() {
  const out = [];
  for (const [key, panel] of Object.entries(PANELS)) {
    for (const group of panel.groups) {
      for (const a of group.actions) {
        if (a.owner) continue;
        const fields = Array.isArray(a.fields) ? a.fields.filter((f) => f.kind !== 'file') : [];
        const describe = (f) => {
          const kind = f.kind === 'choice' ? (f.bool ? 'oui/non' : `choix : ${f.options.slice(0, 10).map((o) => o.value).join('|')}`)
            : f.kind === 'int' ? 'nombre' : f.kind === 'user' ? 'membre' : f.kind === 'channel' ? 'salon' : f.kind === 'role' ? 'rôle' : 'texte';
          return `${f.id} (${kind}${f.req ? ', obligatoire' : ''})`;
        };
        out.push({
          ref: `${key}.${a.id}`,
          line: `- ${key}.${a.id} : ${a.label}${a.desc ? ` (${a.desc})` : ''}${fields.length ? ` · champs : ${fields.map(describe).join(', ')}` : ''}${typeof a.fields === 'function' ? ' · fenêtre à remplir' : ''}`,
        });
      }
    }
  }
  return out;
}

// Mots qui annoncent une demande d'action (jeu, musique, sanction, outil…). Sinon, pas besoin d'envoyer la liste.
const ACTION_WORDS = /\b(lance[rz]?|jou(e|er|ez)|met[sz]?|mettre|d[ée]marre[rz]?|commence[rz]?|organise[rz]?|fai[st]|faire|ouvr(e|ir)|cr[ée]{1,2}[rz]?|mute|ban(nis?)?|kick|expulse|avertis|warn|exclu[st]?|supprime|nettoie|verrouille|d[ée]verrouille|affiche|montre|donne|retire|arr[eê]te|passe|skip|pause|stop|play|musique|son|jeu|jeux|partie|game|ticket|sondage|rappel|annonce|profil|classement|boutique|radio|playlist|quiz|blind|undercover|loup|imposteur|bac|v[ée]rit[ée]|pendu|casier|note|sauvegarde|bienvenue|niveau|r[ée]compense)\b/i;
export const wantsAction = (text) => ACTION_WORDS.test(String(text ?? ''));

let catalogText = null;
/** Consigne ajoutée au prompt de l'IA quand elle répond à un message. */
export function actionsPrompt() {
  catalogText ??= aiCatalog().map((a) => a.line).join('\n');
  return `

ACTIONS QUE TU PEUX LANCER (très important)
Quand la personne te demande de FAIRE quelque chose que le bot sait faire (lancer un jeu, mettre de la musique, sanctionner quelqu'un, ouvrir un ticket, voir son profil, faire une annonce…) :
- réponds en UNE phrase courte et naturelle (ex : « C'est parti pour un Undercover 🕵️ ») ;
- puis termine ta réponse par une ligne EXACTEMENT comme ça : [[ACTION panneau.action {"champ": "valeur"}]]
- Mets seulement les champs que la personne a donnés ou qui sont évidents ; pour un membre, recopie son pseudo tel qu'il est écrit ; pour un choix, une des valeurs proposées. Sans champ : [[ACTION jeux.undercover {}]]
- Une seule action par réponse, et uniquement un identifiant de la liste. Un bouton « Lancer » s'affiche, les permissions sont vérifiées au clic : tu n'as pas à refuser une sanction à ta place ni à prévenir le chef pour ça.
- Si la personne demande seulement COMMENT faire, explique (les 6 commandes : /jeux, /musique, /sanction, /serveur, /pannel, /ia) et ajoute l'action pour qu'elle puisse cliquer.
Liste :
${catalogText}`;
}

/** Enlève la ligne d'action de la réponse de l'IA. Renvoie { text, action } (action = null s'il n'y en a pas ou qu'elle est inconnue). */
export function extractAction(raw) {
  const m = String(raw ?? '').match(TAG);
  if (!m) return { text: raw, action: null };
  const text = raw.replace(m[0], '').replace(/\n{3,}/g, '\n\n').trim();
  const [, key, id, json] = m;
  const action = findAction(key.toLowerCase(), id.toLowerCase());
  if (!action || action.owner) return { text, action: null };
  let values = {};
  try {
    values = json ? JSON.parse(json) : {};
  } catch {
    values = {};
  }
  if (typeof values !== 'object' || Array.isArray(values) || values === null) values = {};
  return { text, action: { key: key.toLowerCase(), id: action.id, label: action.label, emoji: action.emoji, values } };
}

/** Garde l'action en attente et renvoie la rangée avec le bouton « Lancer ». */
export function actionRow(action, userId, mentions = {}) {
  for (const [token, p] of pending) if (Date.now() - p.at > TTL) pending.delete(token);
  const token = crypto.randomBytes(6).toString('hex');
  pending.set(token, { ...action, userId, mentions, at: Date.now() });
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`aia:${token}`).setLabel(`Lancer : ${action.label}`.slice(0, 80)).setEmoji(action.emoji || '▶️').setStyle(ButtonStyle.Success),
  );
}

// ===================== Au clic =====================

async function findMember(guild, value, mentions) {
  if (!guild || value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  const id = raw.match(/\d{15,21}/)?.[0] ?? mentions[plain(raw.replace(/^@/, ''))];
  if (id) {
    const member = await guild.members.fetch(id).catch(() => null);
    return member ? { user: member.user, member } : null;
  }
  const wanted = plain(raw.replace(/^@/, ''));
  const names = (m) => [m.displayName, m.user.username, m.user.globalName].filter(Boolean).map(plain);
  let members = guild.members.cache;
  if (!members.some((m) => names(m).includes(wanted))) {
    members = await guild.members.fetch({ query: raw.replace(/^@/, '').slice(0, 32), limit: 10 }).catch(() => guild.members.cache);
  }
  const member = members.find((m) => names(m).includes(wanted)) ?? members.find((m) => names(m).some((n) => n.startsWith(wanted)));
  return member ? { user: member.user, member } : null;
}

function findNamed(cache, value) {
  const raw = String(value ?? '').trim();
  const id = raw.match(/\d{15,21}/)?.[0];
  if (id) return cache.get(id) ?? null;
  const wanted = plain(raw.replace(/^[#@]/, ''));
  return cache.find((x) => plain(x.name) === wanted) ?? cache.find((x) => plain(x.name).includes(wanted)) ?? null;
}

/** Transforme ce que l'IA a rempli en valeurs prêtes pour l'action (comme si la fenêtre avait été remplie). */
export async function resolveValues(fields, given, guild, mentions = {}) {
  const values = {};
  const lower = Object.fromEntries(Object.entries(given ?? {}).map(([k, v]) => [plain(k), v]));
  for (const f of fields) {
    const v = lower[plain(f.id)];
    if (v === undefined || v === null || v === '') continue;
    if (f.kind === 'text') values[f.id] = String(v).slice(0, f.max ?? 4000);
    else if (f.kind === 'int') {
      const n = Number(String(v).replace(',', '.'));
      if (Number.isInteger(n) && (f.min === undefined || n >= f.min) && (f.top === undefined || n <= f.top)) values[f.id] = n;
    } else if (f.kind === 'choice') {
      if (f.bool) {
        const b = plain(v);
        if (['true', 'oui', 'yes', '1'].includes(b)) values[f.id] = true;
        else if (['false', 'non', 'no', '0'].includes(b)) values[f.id] = false;
      } else {
        const o = f.options.find((x) => plain(x.value) === plain(v)) ?? f.options.find((x) => plain(x.label) === plain(v))
          ?? f.options.find((x) => plain(x.label).includes(plain(v)));
        if (o) values[f.id] = o.value;
      }
    } else if (f.kind === 'user') {
      const found = await findMember(guild, v, mentions);
      if (found) values[f.id] = found;
    } else if (f.kind === 'channel') {
      const c = guild && findNamed(guild.channels.cache, v);
      if (c) values[f.id] = c;
    } else if (f.kind === 'role') {
      const r = guild && findNamed(guild.roles.cache, v);
      if (r) values[f.id] = r;
    }
  }
  return values;
}

const fail = (text) => ({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ ${text}`)], ...PRIVATE });

export const isAiActionComponent = (interaction) => /^aia:/.test(interaction.customId ?? '');

export async function handleAiActionComponent(client, interaction) {
  const token = interaction.customId.slice(4);
  const p = pending.get(token);
  if (!p || Date.now() - p.at > TTL) return interaction.reply(fail('Ce bouton a expiré. Redemande à l’IA, ou passe par le panneau.'));
  if (p.userId !== interaction.user.id && interaction.user.id !== config.ownerId) return interaction.reply(fail('Ce bouton est pour la personne qui a fait la demande.'));
  const panel = PANELS[p.key];
  const action = findAction(p.key, p.id);
  if (!panel || !action) return interaction.reply(fail('Action inconnue.'));
  const need = action.perm ?? panel.perm;
  if (need && interaction.user.id !== config.ownerId && !interaction.memberPermissions?.has(need)) {
    return interaction.reply(fail('Tu n’as pas la permission pour cette action.'));
  }
  const fields = (typeof action.fields === 'function' ? await action.fields(interaction) : action.fields) ?? [];
  const values = await resolveValues(fields, p.values, interaction.guild, p.mentions);
  const complete = fields.every((f) => !f.req || values[f.id] !== undefined) && !fields.some((f) => f.kind === 'file' && f.req);
  // Il manque quelque chose d'obligatoire : la fenêtre s'ouvre, avec ce que l'IA a déjà rempli.
  if (!complete) {
    const prefilled = fields.map((f) => {
      const v = values[f.id];
      if (v === undefined) return f;
      if (f.kind === 'user') return { ...f, value: v.user.id };
      if (f.kind === 'channel' || f.kind === 'role') return { ...f, value: v.id };
      if (f.kind === 'choice' && f.bool) return { ...f, value: String(v) };
      return { ...f, value: v };
    });
    return interaction.showModal(buildModal(`pm:${p.key}:${action.id}`, `${action.emoji} ${action.label}`, prefilled));
  }
  pending.delete(token);
  const { runAction } = await import('../panels/index.js');
  return runAction(client, interaction, panel, action, values);
}

export const _test = { pending };
