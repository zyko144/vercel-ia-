// Offres du bot, par serveur : gratuit, Veilleur, Gardien (les mêmes que sur le site).
// - Essai gratuit de 7 jours du Gardien, une fois par serveur (depuis /serveur › Premium).
// - Le chef du bot active un plan payé pour un serveur (après paiement sur le site).
// - Ce que chaque plan débloque : minutes d'IA vocale par mois, choix de la voix, cartes aux couleurs
//   du serveur, rapport de la semaine, surveillance vocale étendue.
// Tout est gardé dans le stockage du bot (Supabase conseillé).
import { config } from '../config.js';
import { load, save } from '../storage.js';

const KEY = 'serveurs';
const DAY = 86_400_000;
export const TRIAL_DAYS = 7;

export const PLANS = {
  gratuit: { label: 'Gratuit', emoji: '🌱', price: '0 €', voiceMinutes: 30, aiPerDay: 60, voices: false, branding: false, report: false, guard: false },
  veilleur: { label: 'Veilleur', emoji: '🌙', price: '6,99 €/mois', voiceMinutes: 150, aiPerDay: 500, voices: true, branding: true, report: true, guard: false },
  gardien: { label: 'Gardien', emoji: '🛡️', price: '14,99 €/mois', voiceMinutes: 400, aiPerDay: 1000, voices: true, branding: true, report: true, guard: true },
};

// Voix de Gemini Live proposées aux serveurs premium (le gratuit garde la voix de base)
export const VOICES = {
  Puck: 'Enjouée', Charon: 'Grave et posée', Kore: 'Douce et claire', Fenrir: 'Énergique', Aoede: 'Chaleureuse',
  Leda: 'Jeune et vive', Orus: 'Assurée', Zephyr: 'Lumineuse',
};

let servers = {};
let loaded = false;

export async function loadServers() {
  servers = (await load(KEY, {}).catch(() => ({}))) ?? {};
  loaded = true;
  return servers;
}
const persist = () => save(KEY, servers);
const entry = (guildId) => (servers[guildId] ??= {});
export const serversLoaded = () => loaded;
export const allServers = () => servers;

/** Le plan en cours d'un serveur, avec sa date de fin ; « essai » si c'est l'essai gratuit. */
export function planOf(guildId) {
  const s = servers[guildId] ?? {};
  const now = Date.now();
  if (s.paidUntil && s.paidUntil > now && PLANS[s.plan]) return { key: s.plan, ...PLANS[s.plan], until: s.paidUntil, trial: false };
  if (s.trialUntil && s.trialUntil > now) return { key: 'gardien', ...PLANS.gardien, until: s.trialUntil, trial: true };
  return { key: 'gratuit', ...PLANS.gratuit, until: null, trial: false };
}
export const isPremium = (guildId) => planOf(guildId).key !== 'gratuit';

/** Essai gratuit de 7 jours du Gardien : une seule fois par serveur. */
export function startTrial(guildId, byUserId) {
  const s = entry(guildId);
  if (s.trialUsed) return { error: 'L’essai gratuit a déjà été utilisé sur ce serveur.' };
  if (isPremium(guildId)) return { error: 'Ce serveur a déjà une offre en cours.' };
  s.trialUsed = true;
  s.trialUntil = Date.now() + TRIAL_DAYS * DAY;
  s.trialBy = byUserId;
  persist();
  return { plan: planOf(guildId) };
}

/** Le chef active (ou prolonge) un plan payé. days = 0 : retire le plan. */
export function setPlan(guildId, plan, days) {
  if (!PLANS[plan] || plan === 'gratuit') {
    const s = entry(guildId);
    delete s.plan;
    delete s.paidUntil;
    persist();
    return planOf(guildId);
  }
  const s = entry(guildId);
  const from = s.plan === plan && s.paidUntil > Date.now() ? s.paidUntil : Date.now();
  s.plan = plan;
  s.paidUntil = from + days * DAY;
  persist();
  return planOf(guildId);
}

// ===================== Marque du serveur (cartes personnalisées) =====================

/** Nom, couleur et logo du serveur, seulement s'il a une offre qui le permet. */
export function brandingOf(guildId) {
  if (!guildId || !planOf(guildId).branding) return null;
  const b = servers[guildId]?.branding;
  if (!b || !(b.name || b.color || b.logoData)) return null;
  // Le logo est servi par le bot lui-même (les liens des fichiers Discord expirent)
  const logo = b.logoData && config.publicUrl ? `${config.publicUrl}/logo/${guildId}.png?v=${b.logoVersion ?? 1}` : null;
  return { name: b.name ?? null, color: b.color ?? null, logo };
}

/** logoPng : image PNG déjà réduite (128 × 128), ou undefined pour garder l'ancienne. */
export function setBranding(guildId, { name, color, logoPng }) {
  const s = entry(guildId);
  const old = s.branding ?? {};
  s.branding = {
    name: name ?? old.name ?? null,
    color: color ?? old.color ?? null,
    logoData: logoPng ? logoPng.toString('base64') : old.logoData ?? null,
    logoVersion: logoPng ? (old.logoVersion ?? 0) + 1 : old.logoVersion ?? null,
  };
  persist();
  return brandingOf(guildId) ?? s.branding;
}
export function clearBranding(guildId) {
  delete entry(guildId).branding;
  persist();
}
/** Le logo enregistré d'un serveur (pour la route /logo/<id>.png). */
export function logoPng(guildId) {
  const data = servers[guildId]?.branding?.logoData;
  return data ? Buffer.from(data, 'base64') : null;
}
export const rawBranding = (guildId) => servers[guildId]?.branding ?? null;

// ===================== IA vocale : minutes du mois et voix =====================

const monthOf = (at = Date.now()) => new Date(at).toISOString().slice(0, 7);

/** Minutes d'IA vocale utilisées ce mois-ci, et ce qui reste. */
export function voiceUsage(guildId) {
  const s = servers[guildId] ?? {};
  const used = s.voiceMonth === monthOf() ? s.voiceMinutes ?? 0 : 0;
  const limit = planOf(guildId).voiceMinutes;
  return { used: Math.round(used), limit, left: limit === Infinity ? Infinity : Math.max(0, Math.round(limit - used)) };
}

export function addVoiceMinutes(guildId, minutes) {
  if (!guildId || !(minutes > 0)) return;
  const s = entry(guildId);
  if (s.voiceMonth !== monthOf()) {
    s.voiceMonth = monthOf();
    s.voiceMinutes = 0;
  }
  s.voiceMinutes = (s.voiceMinutes ?? 0) + minutes;
  persist();
}

// ===================== Questions à l'IA : plafond par jour =====================
// Compté en mémoire (remis à zéro chaque jour) : par serveur, ou par personne en MP.
const aiDay = new Map(); // serveur ou « mp:membre » -> { day, n }
const dayOf = () => new Date().toISOString().slice(0, 10);

/** Compte une question à l'IA. { ok, used, limit } ; ok = false quand le plafond du jour est atteint. */
export function takeAiQuestion(guildId, userId) {
  const key = guildId ?? `mp:${userId}`;
  const limit = guildId ? planOf(guildId).aiPerDay : PLANS.gratuit.aiPerDay;
  const today = dayOf();
  const c = aiDay.get(key);
  const used = c?.day === today ? c.n : 0;
  if (used >= limit) return { ok: false, used, limit };
  aiDay.set(key, { day: today, n: used + 1 });
  return { ok: true, used: used + 1, limit };
}
export const aiUsage = (guildId) => { const c = aiDay.get(guildId); return { used: c?.day === dayOf() ? c.n : 0, limit: planOf(guildId).aiPerDay }; };

/** La voix choisie par le serveur (premium), sinon celle par défaut. */
export function voiceOf(guildId, fallback) {
  const chosen = servers[guildId]?.voice;
  return planOf(guildId).voices && chosen && VOICES[chosen] ? chosen : fallback;
}
export function setVoice(guildId, voice) {
  if (!VOICES[voice]) return false;
  entry(guildId).voice = voice;
  persist();
  return true;
}

// ===================== Surveillance vocale étendue (Gardien) =====================

/** Réglages Gardien : membres protégés en plus du chef, mots interdits. Vides hors Gardien. */
export function guardOptionsOf(guildId) {
  if (!planOf(guildId).guard) return { protectedIds: [], words: [] };
  const g = servers[guildId]?.guard ?? {};
  return { protectedIds: g.protectedIds ?? [], words: g.words ?? [] };
}
export function setGuardOptions(guildId, { protectedIds, words }) {
  entry(guildId).guard = {
    protectedIds: [...new Set((protectedIds ?? []).filter((id) => /^\d{15,21}$/.test(id)))].slice(0, 25),
    words: [...new Set((words ?? []).map((w) => String(w).trim().toLowerCase()).filter((w) => w.length >= 2 && w.length <= 40))].slice(0, 50),
  };
  persist();
  return entry(guildId).guard;
}
export const rawGuardOptions = (guildId) => servers[guildId]?.guard ?? { protectedIds: [], words: [] };

// ===================== Rapport de la semaine =====================

/** Le propriétaire veut-il le rapport (activé par défaut pour les offres qui l'incluent) ? */
export function reportWanted(guildId) {
  return planOf(guildId).report && servers[guildId]?.report !== false;
}
export function setReportWanted(guildId, wanted) {
  entry(guildId).report = Boolean(wanted);
  persist();
}
