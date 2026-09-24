// Réglages de l'IA modifiables depuis le tableau de bord, sans redémarrer le bot.
// Chaque réglage a sa règle de validation : une valeur hors règle est refusée, jamais corrigée en silence.
// Ils sont gardés dans le stockage du bot (Supabase ou fichiers) et réappliqués au démarrage.
import { ActivityType } from 'discord.js';
import { config } from '../config.js';
import { load, save } from '../storage.js';

const KEY = 'dashboard-settings';

const MODEL = /^[a-z0-9][a-z0-9.\-]{2,63}$/;
const THINKING = ['minimal', 'low', 'medium', 'high'];

/**
 * Description de chaque réglage : où il vit dans la config, comment le vérifier, et le texte d'aide
 * affiché dans le tableau de bord.
 */
export const SETTINGS = {
  chatModel: {
    label: 'Modèle principal', group: 'Modèles',
    help: 'Le modèle Gemini qui répond aux messages. Si tu le changes, fais un test juste après.',
    get: () => config.models.chat,
    set: (v) => { config.models.chat = v; },
    check: (v) => (typeof v === 'string' && MODEL.test(v) ? null : 'Nom de modèle invalide (lettres minuscules, chiffres, points et tirets).'),
  },
  fallbackModel: {
    label: 'Modèle de secours', group: 'Modèles',
    help: 'Utilisé automatiquement quand le modèle principal est saturé ou en panne.',
    get: () => config.models.fallback,
    set: (v) => { config.models.fallback = v; },
    check: (v) => (typeof v === 'string' && MODEL.test(v) ? null : 'Nom de modèle invalide.'),
  },
  thinkingLevel: {
    label: 'Niveau de réflexion', group: 'Modèles', options: THINKING,
    help: 'Plus haut = réponses plus réfléchies mais plus lentes et plus coûteuses. « medium » est un bon équilibre.',
    get: () => config.models.thinkingLevel,
    set: (v) => { config.models.thinkingLevel = v; },
    check: (v) => (THINKING.includes(v) ? null : 'Choisis minimal, low, medium ou high.'),
  },
  webSearch: {
    label: 'Recherche Google', group: 'Modèles', type: 'bool',
    help: 'Permet à l’IA de chercher sur Google. Demande la facturation activée chez Google AI Studio.',
    get: () => config.models.webSearch,
    set: (v) => { config.models.webSearch = v; },
    check: (v) => (typeof v === 'boolean' ? null : 'Oui ou non.'),
  },
  imagesEnabled: {
    label: 'Génération d’images', group: 'Limites', type: 'bool',
    help: '/image et /modifier-image. Payant chez Google : laisse coupé sans facturation.',
    get: () => config.limits.imagesEnabled,
    set: (v) => { config.limits.imagesEnabled = v; },
    check: (v) => (typeof v === 'boolean' ? null : 'Oui ou non.'),
  },
  imagesPerDay: {
    label: 'Images par personne et par jour', group: 'Limites', type: 'int', min: 0, max: 100,
    help: 'Le chef n’a pas de limite.',
    get: () => config.limits.imagesPerDay,
    set: (v) => { config.limits.imagesPerDay = v; },
    check: (v) => (Number.isInteger(v) && v >= 0 && v <= 100 ? null : 'Entre 0 et 100.'),
  },
  chatCooldownSeconds: {
    label: 'Délai entre deux messages (secondes)', group: 'Limites', type: 'int', min: 0, max: 120,
    help: 'Anti-spam : temps minimum entre deux questions d’une même personne.',
    get: () => Math.round(config.limits.chatCooldownMs / 1000),
    set: (v) => { config.limits.chatCooldownMs = v * 1000; },
    check: (v) => (Number.isInteger(v) && v >= 0 && v <= 120 ? null : 'Entre 0 et 120 secondes.'),
  },
  privateReplies: {
    label: 'Réponses privées', group: 'Comportement', type: 'bool',
    help: 'Les conversations du salon IA partent dans un fil privé, et les commandes répondent en « visible seulement par toi ».',
    get: () => config.privateReplies,
    set: (v) => { config.privateReplies = v; },
    check: (v) => (typeof v === 'boolean' ? null : 'Oui ou non.'),
  },
  extraInstructions: {
    label: 'Consignes du serveur', group: 'Comportement', type: 'text', max: 1500,
    help: 'Ajoutées à chaque conversation. Exemple : « Le serveur organise un tournoi samedi à 20 h, inscriptions dans #events. »',
    get: () => config.ai.extraInstructions,
    set: (v) => { config.ai.extraInstructions = v; },
    check: (v) => (typeof v === 'string' && v.length <= 1500 ? null : '1500 caractères maximum.'),
  },
  botStatus: {
    label: 'Statut du bot', group: 'Comportement', type: 'text', max: 128,
    help: 'Le petit texte affiché sous le nom du bot dans Discord.',
    get: () => config.botStatus,
    set: (v) => { config.botStatus = v; },
    check: (v) => (typeof v === 'string' && v.trim().length >= 1 && v.length <= 128 ? null : 'Entre 1 et 128 caractères.'),
    apply: (client) => client?.user?.setPresence({ activities: [{ name: 'custom', type: ActivityType.Custom, state: config.botStatus }], status: 'online' }),
  },
  paused: {
    label: 'IA en pause', group: 'Maintenance', type: 'bool', danger: true,
    help: 'L’IA ne répond plus aux messages ni aux commandes : elle affiche le message de pause. Les jeux et la musique continuent.',
    get: () => config.ai.paused,
    set: (v) => { config.ai.paused = v; },
    check: (v) => (typeof v === 'boolean' ? null : 'Oui ou non.'),
  },
  pauseMessage: {
    label: 'Message pendant la pause', group: 'Maintenance', type: 'text', max: 300,
    help: 'Laissé vide : « L’IA est en pause pour une maintenance, reviens un peu plus tard 🙏 ».',
    get: () => config.ai.pauseMessage,
    set: (v) => { config.ai.pauseMessage = v; },
    check: (v) => (typeof v === 'string' && v.length <= 300 ? null : '300 caractères maximum.'),
  },
};

/** Les valeurs actuelles, avec leur description (pour l'affichage). */
export function currentSettings() {
  return Object.entries(SETTINGS).map(([key, s]) => ({
    key, label: s.label, group: s.group, help: s.help, type: s.type ?? 'string',
    options: s.options ?? null, min: s.min ?? null, max: s.max ?? null, danger: Boolean(s.danger),
    value: s.get(),
  }));
}

/**
 * Applique des changements. Tout est vérifié avant d'appliquer quoi que ce soit : soit tout
 * passe, soit rien ne change.
 * @returns {{ ok: true, changed: { key: string, from: unknown, to: unknown }[] } | { ok: false, errors: Record<string, string> }}
 */
export function updateSettings(changes, client) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return { ok: false, errors: { _: 'Demande invalide.' } };
  const errors = {};
  const clean = {};
  for (const [key, raw] of Object.entries(changes)) {
    const setting = SETTINGS[key];
    if (!setting) { errors[key] = 'Réglage inconnu.'; continue; }
    const value = typeof raw === 'string' ? raw.trim() : raw;
    const problem = setting.check(value);
    if (problem) errors[key] = problem;
    else clean[key] = value;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const changed = [];
  for (const [key, value] of Object.entries(clean)) {
    const setting = SETTINGS[key];
    const from = setting.get();
    if (from === value) continue;
    setting.set(value);
    setting.apply?.(client);
    changed.push({ key, from, to: value });
  }
  if (changed.length) save(KEY, Object.fromEntries(Object.keys(SETTINGS).map((k) => [k, SETTINGS[k].get()])));
  return { ok: true, changed };
}

/** Réapplique les réglages enregistrés (au démarrage). Une valeur devenue invalide est ignorée. */
export async function loadSettings(client) {
  const saved = await load(KEY, null).catch(() => null);
  if (!saved || typeof saved !== 'object') return;
  for (const [key, value] of Object.entries(saved)) {
    const setting = SETTINGS[key];
    if (setting && !setting.check(value)) setting.set(value);
  }
  SETTINGS.botStatus.apply(client);
}
