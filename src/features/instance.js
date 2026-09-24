// Une seule copie du bot à la fois.
// Si le bot tourne sur Render ET sur un PC avec le même token, Discord envoie chaque clic aux deux :
// l'une répond, l'autre échoue (« Unknown interaction ») et les rappels partent en double.
// Chaque copie pose donc un « bail » dans Supabase et le renouvelle toutes les 15 s :
//  - Render passe devant : c'est lui qui fait tourner le bot et le tableau de bord (vercel-ia.onrender.com) ;
//  - le PC n'ouvre que le site sur localhost, et ne prend le relais du bot que si Render est arrêté ;
//  - à priorité égale (nouvelle version sur Render), la plus récente gagne.
// Sans Supabase, les copies ne peuvent pas se voir : pas de garde (un message le rappelle au démarrage).
import crypto from 'node:crypto';
import os from 'node:os';
import { readFresh, sharedStorage, writeNow } from '../storage.js';

const KEY = 'instance-lock';
const BEAT_MS = 15_000;
const STALE_MS = 60_000;

export const instance = {
  id: crypto.randomBytes(8).toString('hex'),
  startedAt: Date.now(),
  where: process.env.RENDER ? 'Render' : `PC (${os.hostname()})`,
  priority: process.env.RENDER ? 2 : 1,
  guarded: sharedStorage,
  waitingFor: null,
};

const alive = (lock) => lock && Date.now() - (lock.at ?? 0) < STALE_MS;
const other = (lock) => lock && lock.id !== instance.id;
/** L'autre copie passe-t-elle devant nous ? */
const outranks = (lock) => lock.priority > instance.priority || (lock.priority === instance.priority && lock.startedAt > instance.startedAt);

async function readLock() {
  try {
    return await readFresh(KEY);
  } catch (err) {
    console.warn('[instance] bail illisible :', err.message);
    return undefined; // Supabase injoignable : on ne bloque pas le bot pour autant
  }
}

async function beat() {
  const { id, startedAt, where, priority } = instance;
  await writeNow(KEY, { id, startedAt, where, priority, at: Date.now() }).catch((err) => console.warn('[instance] bail :', err.message));
}

// Adresse du bot sur Render : le PC lui demande s'il tourne, même sans Supabase
const PRIMARY_URL = (process.env.PRIMARY_URL || 'https://vercel-ia.onrender.com').replace(/\/+$/, '');

/** Sur le PC : le bot de Render est-il connecté à Discord ? (sa page /health répond « ready ») */
async function renderOnline() {
  if (process.env.RENDER) return false;
  try {
    const res = await fetch(`${PRIMARY_URL}/health`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return false;
    const health = await res.json();
    return health.discord === 'ready' && (health.instance ?? 'Render') === 'Render';
  } catch {
    return false; // Render endormi, arrêté ou injoignable : le PC peut prendre le relais
  }
}

/** Une copie prioritaire tourne-t-elle déjà ? Renvoie son nom, ou null. */
async function ahead() {
  if (instance.guarded) {
    const lock = await readLock();
    if (other(lock) && alive(lock) && outranks(lock)) return lock.where;
  }
  if (await renderOnline()) return 'Render';
  return null;
}

/** À appeler avant de se connecter à Discord : attend son tour si une copie prioritaire tourne déjà. */
export async function waitForTurn() {
  if (!instance.guarded) console.log('ℹ️ Sans Supabase, la garde « une seule copie » se contente de demander à Render s\'il tourne (PRIMARY_URL).');
  let announced = false;
  for (;;) {
    const first = await ahead();
    if (!first) break;
    instance.waitingFor = first;
    if (!announced) console.log(`⏸️ Le bot tourne déjà sur ${first} : cette copie ne se connecte pas à Discord (site en local seulement) et prendra le relais s'il s'arrête.`);
    announced = true;
    await new Promise((resolve) => setTimeout(resolve, BEAT_MS));
  }
  instance.waitingFor = null;
  if (instance.guarded) await beat();
  console.log(`🔒 Copie active : ${instance.where}`);
  setInterval(async () => {
    const first = await ahead();
    if (first) {
      console.log(`🔁 Le bot tourne aussi sur ${first} : cette copie s'arrête pour ne pas répondre en double (ni se disputer le vocal).`);
      process.kill(process.pid, 'SIGTERM'); // arrêt propre ; Render la relancera, et elle attendra son tour
      return;
    }
    if (instance.guarded) await beat();
  }, BEAT_MS).unref();
}

// Pour le banc d'essai (tools/test-instance.mjs)
export const _test = { ahead };
