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

/** À appeler avant de se connecter à Discord : attend son tour si une copie prioritaire tourne déjà. */
export async function waitForTurn() {
  if (!instance.guarded) {
    console.log('ℹ️ Sans Supabase, rien n\'empêche une 2e copie du bot (Render + PC) : ne lance pas les deux en même temps.');
    return;
  }
  let announced = false;
  for (;;) {
    const lock = await readLock();
    if (!(other(lock) && alive(lock) && outranks(lock))) break;
    instance.waitingFor = lock.where;
    if (!announced) console.log(`⏸️ Le bot tourne déjà sur ${lock.where} : cette copie attend qu'il s'arrête pour prendre le relais.`);
    announced = true;
    await new Promise((resolve) => setTimeout(resolve, BEAT_MS));
  }
  instance.waitingFor = null;
  await beat();
  console.log(`🔒 Copie active : ${instance.where}`);
  setInterval(async () => {
    const lock = await readLock();
    if (other(lock) && alive(lock) && outranks(lock)) {
      console.log(`🔁 Le bot vient de démarrer sur ${lock.where} : cette copie s'arrête pour ne pas répondre en double.`);
      process.kill(process.pid, 'SIGTERM'); // arrêt propre ; Render la relancera, et elle attendra son tour
      return;
    }
    await beat();
  }, BEAT_MS).unref();
}
