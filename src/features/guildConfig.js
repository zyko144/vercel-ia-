// Réglages propres à chaque serveur : sécurité, niveaux, boutique, bienvenue, vocal, IA, suggestions…
// Un seul schéma décrit chaque réglage (section, type, aide) : le tableau de bord en fait ses formulaires,
// et chaque fonction lit ses valeurs ici avec cfg(guildId). Gardé dans le stockage (clé « config-serveurs »).
import { load, save } from '../storage.js';

const KEY = 'config-serveurs';

/**
 * Types : bool, int (min/max), text (max), channel (salon texte), voice (salon vocal), category, role,
 * choice (options), list (lignes de texte), ids (identifiants).
 */
export const SECTIONS = {
  securite: { label: 'Sécurité', emoji: '🛡️', intro: 'Anti-raid, vérification à l’arrivée, filtres de liens, anti-spam, anti-arnaque et journal.' },
  niveaux: { label: 'Niveaux et récompenses', emoji: '📈', intro: 'XP pour les messages et le vocal, rôles gagnés par niveau, récompense du jour, membre de la semaine.' },
  boutique: { label: 'Boutique, trésor et salons', emoji: '🛒', intro: 'Le comptoir du capitaine, le trésor (loterie, enchères, marché) et les salons dédiés du bot.' },
  accueil: { label: 'Bienvenue et suggestions', emoji: '👋', intro: 'Carte de bienvenue et salon des suggestions votées.' },
  vocal: { label: 'Vocal', emoji: '🔊', intro: 'Salons vocaux temporaires, radio 24 h/24, micros saturés.' },
  ia: { label: 'IA du serveur', emoji: '🧠', intro: 'Mémoire des membres, salons traduits automatiquement, FAQ apprise.' },
};

export const SCHEMA = [
  // ---------- Sécurité ----------
  { key: 'logs.channelId', section: 'securite', type: 'channel', label: 'Salon du journal', help: 'Messages supprimés ou modifiés, arrivées, départs, rôles, salons, sanctions.' },
  { key: 'antiRaid.enabled', section: 'securite', type: 'bool', label: 'Anti-raid', def: true, help: 'Beaucoup d’arrivées d’un coup : le serveur se verrouille et le staff est prévenu.' },
  { key: 'antiRaid.joins', section: 'securite', type: 'int', min: 3, max: 50, label: 'Arrivées pour déclencher', def: 8 },
  { key: 'antiRaid.seconds', section: 'securite', type: 'int', min: 5, max: 300, label: 'En combien de secondes', def: 15 },
  { key: 'antiRaid.action', section: 'securite', type: 'choice', options: ['verrouiller', 'expulser'], label: 'Pendant un raid', def: 'verrouiller', help: 'verrouiller : plus personne n’écrit ; expulser : les nouveaux comptes du raid sont expulsés.' },
  { key: 'verification.enabled', section: 'securite', type: 'bool', label: 'Vérification à l’arrivée', def: false, help: 'Un bouton « Je suis humain » avec un petit calcul avant d’accéder au serveur.' },
  { key: 'verification.roleId', section: 'securite', type: 'role', label: 'Rôle donné après vérification' },
  { key: 'verification.channelId', section: 'securite', type: 'channel', label: 'Salon de vérification' },
  { key: 'links.enabled', section: 'securite', type: 'bool', label: 'Filtre de liens', def: false, help: 'Supprime les liens des membres (le staff peut toujours en poster).' },
  { key: 'links.invites', section: 'securite', type: 'bool', label: 'Bloquer les invitations Discord', def: true },
  { key: 'links.allow', section: 'securite', type: 'list', label: 'Sites autorisés', def: ['youtube.com', 'youtu.be', 'spotify.com', 'tenor.com', 'deezer.com'], help: 'Un domaine par ligne.' },
  { key: 'antiSpam.enabled', section: 'securite', type: 'bool', label: 'Anti-spam', def: true, help: 'Messages en rafale, mentions de masse, messages en majuscules : avertissement puis muet.' },
  { key: 'antiSpam.messages', section: 'securite', type: 'int', min: 3, max: 20, label: 'Messages max', def: 6 },
  { key: 'antiSpam.seconds', section: 'securite', type: 'int', min: 2, max: 30, label: 'En combien de secondes', def: 5 },
  { key: 'antiSpam.mentions', section: 'securite', type: 'int', min: 2, max: 30, label: 'Mentions max dans un message', def: 5 },
  { key: 'antiSpam.caps', section: 'securite', type: 'bool', label: 'Limiter les MAJUSCULES', def: true },
  { key: 'antiScam.enabled', section: 'securite', type: 'bool', label: 'Anti-arnaque', def: true, help: 'Faux Nitro, faux cadeaux Steam, liens de vol de compte : supprimés, membre rendu muet 1 h.' },
  { key: 'appeals.enabled', section: 'securite', type: 'bool', label: 'Contester une sanction', def: true, help: 'Le MP de sanction propose « Contester » : un ticket s’ouvre pour le staff.' },
  { key: 'appeals.categoryId', section: 'securite', type: 'category', label: 'Catégorie des contestations' },
  { key: 'appeals.staffRoleId', section: 'securite', type: 'role', label: 'Rôle du staff (contestations)' },

  // ---------- Niveaux ----------
  { key: 'levels.enabled', section: 'niveaux', type: 'bool', label: 'Niveaux et XP', def: true },
  { key: 'levels.channelId', section: 'niveaux', type: 'channel', label: 'Salon des montées de niveau', help: 'Vide : dans le salon où le membre vient d’écrire.' },
  { key: 'levels.voiceXp', section: 'niveaux', type: 'int', min: 0, max: 50, label: 'XP par minute de vocal', def: 8 },
  { key: 'levels.roles', section: 'niveaux', type: 'list', label: 'Rôles par niveau', help: 'Une ligne par palier : « 5 = @Rôle » ou « 5 = identifiant du rôle ».' },
  { key: 'levels.noXpChannels', section: 'niveaux', type: 'list', label: 'Salons sans XP', help: 'Un salon (ou une catégorie) par ligne : #salon ou son identifiant. Utile pour le spam, les commandes, le salon mèmes.' },
  { key: 'levels.pingEvery', section: 'niveaux', type: 'int', min: 1, max: 50, label: 'Mentionner le membre tous les … niveaux', def: 5, help: 'Les autres niveaux sont annoncés sans notification.' },
  { key: 'daily.amount', section: 'niveaux', type: 'int', min: 0, max: 1000, label: 'Pièces d’or de la récompense du jour', def: 100, help: 'Chaque niveau rapporte aussi 200 pièces.' },
  { key: 'daily.streak', section: 'niveaux', type: 'int', min: 0, max: 200, label: 'Bonus par jour de série', def: 15, help: 'Plafonné à 7 jours de série.' },
  { key: 'weekMember.enabled', section: 'niveaux', type: 'bool', label: 'Membre de la semaine', def: true, help: 'Chaque lundi, le plus actif de la semaine est annoncé avec une carte.' },
  { key: 'weekMember.channelId', section: 'niveaux', type: 'channel', label: 'Salon de l’annonce' },
  { key: 'weekMember.roleId', section: 'niveaux', type: 'role', label: 'Rôle du membre de la semaine', help: 'Donné pour une semaine, repris au suivant.' },

  // ---------- Boutique ----------
  { key: 'shop.customRolePrice', section: 'boutique', type: 'int', min: 0, max: 10000000, label: 'Prix d’un rôle personnalisé (pièces d’or)', def: 20000, help: 'Le membre choisit le nom et la couleur, le staff accepte ou refuse (remboursé).' },
  { key: 'economy.channelId', section: 'boutique', type: 'channel', label: 'Salon du trésor', help: 'Classement des plus riches chaque soir, loterie, enchères, abordages.' },
  { key: 'games.channelId', section: 'boutique', type: 'channel', label: 'Salon des jeux', help: 'Les parties lancées depuis /jeux s’y ouvrent (vide : là où la commande est tapée).' },
  { key: 'announce.channelId', section: 'boutique', type: 'channel', label: 'Salon des annonces du bot', help: 'Nouveautés du bot, événements et grandes annonces.' },
  { key: 'shop.requestsChannelId', section: 'boutique', type: 'channel', label: 'Salon des demandes de rôle', help: 'Le staff y accepte ou refuse les demandes.' },

  // ---------- Bienvenue et suggestions ----------
  { key: 'welcome.enabled', section: 'accueil', type: 'bool', label: 'Carte de bienvenue', def: false },
  { key: 'welcome.channelId', section: 'accueil', type: 'channel', label: 'Salon de bienvenue' },
  { key: 'welcome.message', section: 'accueil', type: 'text', max: 300, label: 'Message', def: 'Bienvenue {membre} sur **{serveur}** ! Tu es le membre n°{numero}.', help: '{membre}, {serveur}, {numero} sont remplacés.' },
  { key: 'suggestions.channelId', section: 'accueil', type: 'channel', label: 'Salon des suggestions', help: 'Chaque message devient une suggestion avec votes 👍 👎 et un statut.' },

  // ---------- Vocal ----------
  { key: 'tempVoice.creatorId', section: 'vocal', type: 'voice', label: 'Salon « ➕ Créer ton vocal »', help: 'Le rejoindre crée un vocal à ton nom, supprimé quand il se vide.' },
  { key: 'tempVoice.categoryId', section: 'vocal', type: 'category', label: 'Catégorie des vocaux temporaires' },
  { key: 'radio.enabled', section: 'vocal', type: 'bool', label: 'Radio 24 h/24', def: false, help: 'Quand rien ne joue, le bot lance la radio dans son vocal.' },
  { key: 'radio.style', section: 'vocal', type: 'text', max: 60, label: 'Style de la radio', def: 'rap fr', help: 'Vide : le top du moment.' },
  { key: 'radio.channelId', section: 'vocal', type: 'channel', label: 'Salon « en ce moment »', help: 'Le son en cours y est affiché et mis à jour.' },
  { key: 'loudMic.enabled', section: 'vocal', type: 'bool', label: 'Micros saturés', def: true, help: 'Un micro qui sature en continu reçoit un avertissement amical en MP.' },

  // ---------- IA ----------
  { key: 'memory.enabled', section: 'ia', type: 'bool', label: 'L’IA se souvient des membres', def: true, help: 'Elle retient leurs goûts (rappeur, jeu, pseudo en jeu). Chacun peut voir et effacer ce qu’elle sait : /ia.' },
  { key: 'translate.channels', section: 'ia', type: 'list', label: 'Salons traduits automatiquement', help: 'Une ligne par salon : « #salon = langue » (ex : « 123… = français »). Chaque message est traduit dessous.' },
  { key: 'faq.channelId', section: 'ia', type: 'channel', label: 'Salon d’aide (FAQ automatique)', help: 'L’IA répond aux questions déjà posées. Les réponses du staff y sont apprises.' },
];

const DEFAULTS = {};
for (const s of SCHEMA) if (s.def !== undefined) DEFAULTS[s.key] = s.def;

let data = null;
export async function loadGuildConfig() {
  data = (await load(KEY, {}).catch(() => ({}))) ?? {};
  return data;
}
const ensure = () => (data ??= {});

/** Une valeur de réglage (ou sa valeur par défaut). */
export function cfg(guildId, key) {
  const v = ensure()[guildId]?.[key];
  return v === undefined ? DEFAULTS[key] : v;
}

/** Tous les réglages d'un serveur, avec leurs valeurs (pour le tableau de bord). */
export function guildSettings(guildId) {
  return SCHEMA.map((s) => ({ ...s, value: cfg(guildId, s.key) ?? null }));
}

const ID = /^\d{15,21}$/;
function check(s, v) {
  if (v === null || v === '') return { value: null };
  switch (s.type) {
    case 'bool': return typeof v === 'boolean' ? { value: v } : { error: 'Oui ou non.' };
    case 'int': {
      const n = Number(v);
      return Number.isInteger(n) && n >= s.min && n <= s.max ? { value: n } : { error: `Entre ${s.min} et ${s.max}.` };
    }
    case 'text': return typeof v === 'string' && v.length <= (s.max ?? 300) ? { value: v.trim() } : { error: `${s.max ?? 300} caractères maximum.` };
    case 'choice': return s.options.includes(v) ? { value: v } : { error: `Choisis : ${s.options.join(', ')}.` };
    case 'channel': case 'voice': case 'category': case 'role':
      return typeof v === 'string' && ID.test(v) ? { value: v } : { error: 'Identifiant invalide.' };
    case 'list': {
      const lines = (Array.isArray(v) ? v : String(v).split('\n')).map((x) => String(x).trim()).filter(Boolean);
      return lines.length <= 50 && lines.every((x) => x.length <= 200) ? { value: lines } : { error: '50 lignes de 200 caractères maximum.' };
    }
    default: return { error: 'Type inconnu.' };
  }
}

/** Applique des changements (tout est vérifié avant). */
export function setGuildSettings(guildId, changes) {
  if (!ID.test(String(guildId))) return { ok: false, errors: { _: 'Serveur inconnu.' } };
  const errors = {};
  const clean = {};
  for (const [key, raw] of Object.entries(changes ?? {})) {
    const s = SCHEMA.find((x) => x.key === key);
    if (!s) { errors[key] = 'Réglage inconnu.'; continue; }
    const r = check(s, raw);
    if (r.error) errors[key] = r.error;
    else clean[key] = r.value;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const g = (ensure()[guildId] ??= {});
  const changed = [];
  for (const [key, value] of Object.entries(clean)) {
    if (JSON.stringify(g[key] ?? DEFAULTS[key] ?? null) === JSON.stringify(value)) continue;
    if (value === null) delete g[key];
    else g[key] = value;
    changed.push(key);
  }
  if (changed.length) save(KEY, data);
  return { ok: true, changed };
}

/** Réglage écrit directement par une fonction du bot (ex. : dernier membre de la semaine). */
export function setInternal(guildId, key, value) {
  const g = (ensure()[guildId] ??= {});
  g[key] = value;
  save(KEY, data);
}

/** « 5 = <@&123> » -> [{ level: 5, roleId: '123' }] */
export function parseLevelRoles(lines = []) {
  return lines.map((line) => {
    const m = String(line).match(/^\s*(\d+)\s*[=:>-]+\s*(?:<@&)?(\d{15,21})>?/);
    return m ? { level: Number(m[1]), roleId: m[2] } : null;
  }).filter(Boolean).sort((a, b) => a.level - b.level);
}

/** « 5000 | <@&123> | 🎨 Couleur Or » -> { price, roleId, name } */
export function parseShopItems(lines = []) {
  return lines.map((line, i) => {
    const [price, role, ...name] = String(line).split('|').map((x) => x.trim());
    const roleId = role?.match(/\d{15,21}/)?.[0];
    const n = Number(price);
    return Number.isInteger(n) && n >= 0 && roleId ? { id: String(i), price: n, roleId, name: name.join(' | ') || 'Rôle' } : null;
  }).filter(Boolean);
}

/** « <#123> = anglais » -> { '123': 'anglais' } */
export function parseTranslateChannels(lines = []) {
  const out = {};
  for (const line of lines) {
    const m = String(line).match(/(\d{15,21})\D*=\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim().slice(0, 30);
  }
  return out;
}
