// Statistiques de l'IA pour le tableau de bord : combien de demandes, combien d'erreurs,
// en combien de temps, et à quoi elles servent. Rien du contenu des messages n'est gardé.
import { load, save } from '../storage.js';

const KEY = 'dashboard-metrics';
const HOUR = 60 * 60_000;
const KEEP_DAYS = 30;
const LATENCY_SAMPLES = 300;
const ERRORS_KEPT = 30;

const state = {
  hours: new Map(), // début de l'heure (ms) -> { requests, errors, fallback, ms }
  days: {}, // « 2026-09-24 » -> { requests, errors, fallback, tags: { conversation: 12, … } }
  latencies: [], // dernières durées (ms) des réponses réussies
  errors: [], // dernières erreurs { at, tag, detail }
  lastModel: null,
  lastFallbackAt: 0,
};

const dayKey = (at = Date.now()) => new Date(at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const hourKey = (at = Date.now()) => Math.floor(at / HOUR) * HOUR;

/** Masque tout ce qui ressemble à une clé ou un token dans un texte (erreurs, logs). */
export function redact(text) {
  return String(text ?? '')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza…[masqué]')
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g, '[token masqué]')
    .replace(/(sb_secret_|eyJ)[A-Za-z0-9._-]{20,}/g, '[clé masquée]')
    .replace(/(Bearer|Bot)\s+[A-Za-z0-9._-]{20,}/gi, '$1 [masqué]');
}

let saveTimer = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const cutoff = dayKey(Date.now() - KEEP_DAYS * 24 * HOUR);
    for (const day of Object.keys(state.days)) if (day < cutoff) delete state.days[day];
    save(KEY, { days: state.days, errors: state.errors.slice(-ERRORS_KEPT) });
  }, 60_000);
  saveTimer.unref?.();
}

/** Recharge l'historique des jours précédents (au démarrage). */
export async function loadMetrics() {
  const saved = await load(KEY, null).catch(() => null);
  if (saved?.days) state.days = { ...saved.days, ...state.days };
  if (Array.isArray(saved?.errors)) state.errors = [...saved.errors, ...state.errors].slice(-ERRORS_KEPT);
}

/**
 * Une demande à l'IA vient de se terminer.
 * @param {{ tag?: string, ms: number, ok: boolean, model?: string, fallback?: boolean, error?: string }} event
 */
export function recordAi({ tag = 'autre', ms, ok, model, fallback = false, error }) {
  const now = Date.now();
  const hour = hourKey(now);
  const h = state.hours.get(hour) ?? { requests: 0, errors: 0, fallback: 0, ms: 0 };
  h.requests++;
  if (!ok) h.errors++;
  if (fallback) h.fallback++;
  if (ok) h.ms += ms;
  state.hours.set(hour, h);
  for (const key of state.hours.keys()) if (key < now - 48 * HOUR) state.hours.delete(key);

  const d = (state.days[dayKey(now)] ??= { requests: 0, errors: 0, fallback: 0, tags: {} });
  d.requests++;
  if (!ok) d.errors++;
  if (fallback) d.fallback++;
  d.tags[tag] = (d.tags[tag] ?? 0) + 1;

  if (ok) {
    state.latencies.push(ms);
    if (state.latencies.length > LATENCY_SAMPLES) state.latencies.shift();
    if (model) state.lastModel = model;
    if (fallback) state.lastFallbackAt = now;
  } else {
    state.errors.push({ at: now, tag, detail: redact(error).slice(0, 300) });
    if (state.errors.length > ERRORS_KEPT) state.errors.shift();
  }
  persist();
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/** Tout ce que le tableau de bord affiche sur l'IA. */
export function aiMetrics() {
  const now = Date.now();
  const hours = [];
  for (let i = 23; i >= 0; i--) {
    const at = hourKey(now - i * HOUR);
    const h = state.hours.get(at) ?? { requests: 0, errors: 0, fallback: 0, ms: 0 };
    hours.push({ at, requests: h.requests, errors: h.errors, fallback: h.fallback });
  }
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(now - i * 24 * HOUR);
    const d = state.days[key] ?? { requests: 0, errors: 0, fallback: 0 };
    days.push({ day: key, requests: d.requests, errors: d.errors, fallback: d.fallback ?? 0 });
  }
  const today = state.days[dayKey(now)] ?? { requests: 0, errors: 0, fallback: 0, tags: {} };
  const last24 = hours.reduce((acc, h) => ({ requests: acc.requests + h.requests, errors: acc.errors + h.errors }), { requests: 0, errors: 0 });
  return {
    today: { requests: today.requests, errors: today.errors, fallback: today.fallback ?? 0, tags: today.tags ?? {} },
    last24,
    hours,
    days,
    latency: {
      median: percentile(state.latencies, 50),
      p95: percentile(state.latencies, 95),
      samples: state.latencies.length,
    },
    errors: [...state.errors].reverse(),
    lastModel: state.lastModel,
    lastFallbackAt: state.lastFallbackAt || null,
  };
}
