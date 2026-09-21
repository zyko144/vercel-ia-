// Outils partagés par les jeux de la salle (la version cliquable du casino).
// Chaque jeu expose la même interface, utilisée par web.js :
//   view(roomId, user)        → ce que le joueur voit (ou null si le salon est invalide)
//   act(roomId, user, input)  → { ok: true } ou { ok: false, error }
// `roomId` est le salon Discord : les jeux « à plusieurs » y ont une table commune.
import { config } from '../../config.js';
import { balance } from '../economy.js';
import { CHIPS, PLAYER_COLORS } from '../render/tapis.js';

export const refuse = (error) => ({ ok: false, error });
export const accepted = (extra = {}) => ({ ok: true, ...extra });
export const isRoomId = (id) => typeof id === 'string' && /^[0-9]{5,25}$/.test(id);
export const CHIP_VALUES = CHIPS.map((chip) => chip.value);
export const fmt = (n) => Math.round(n).toLocaleString('fr-FR');

/** Une mise valable : un entier positif, sous le plafond, et que le solde couvre. Renvoie le refus, ou null. */
export async function checkBet(userId, bet, { extra = 0 } = {}) {
  if (!Number.isInteger(bet) || bet < 1) return 'Pose au moins un jeton.';
  if (bet > config.casinho.maxBet) return `Mise maximum : ${fmt(config.casinho.maxBet)} jetons.`;
  const available = await balance(userId);
  if (bet + extra > available) return `Il te faut ${fmt(bet + extra)} jetons et tu en as ${fmt(available)}. Passe par /quotidien si tu es à court.`;
  return null;
}

/** Une couleur de jetons par joueur à une table : la première qui n'est pas prise. */
export function freeColour(taken) {
  const used = new Set(taken);
  return PLAYER_COLORS.find((colour) => !used.has(colour)) ?? PLAYER_COLORS[used.size % PLAYER_COLORS.length];
}

// ---- Fin de tour : prévient le message Discord du salon (roulette, crash, blackjack).
const roundEndListeners = new Set();
export function onRoundEnd(listener) {
  roundEndListeners.add(listener);
  return () => roundEndListeners.delete(listener);
}
export function announceRoundEnd(summary) {
  for (const listener of roundEndListeners) {
    Promise.resolve()
      .then(() => listener(summary))
      .catch((err) => console.warn(`[casinho] ${summary.game} (fin de tour) :`, err.message));
  }
}

/**
 * Les tables d'un jeu, une par salon. Une table sans visite disparaît au bout de
 * `idleMs` ; `cleanup` range ses minuteurs.
 */
export function tableStore(create, { idleMs = 30 * 60_000, cleanup = () => {} } = {}) {
  const tables = new Map();
  return {
    get(id) {
      let table = tables.get(id);
      if (!table) {
        table = create(id);
        tables.set(id, table);
      }
      clearTimeout(table.idle);
      table.idle = setTimeout(() => {
        cleanup(table);
        tables.delete(id);
      }, idleMs).unref();
      return table;
    },
    peek: (id) => tables.get(id) ?? null,
    get size() {
      return tables.size;
    },
    reset() {
      for (const table of tables.values()) {
        clearTimeout(table.idle);
        cleanup(table);
      }
      tables.clear();
    },
  };
}

// ---- Qui est dans la salle, par salon (pour les duels, et le hall).
const presence = new Map(); // salon → Map(joueur → { name, seen })
const PRESENT_MS = 60_000;

export function markPresent(roomId, user) {
  if (!isRoomId(roomId)) return;
  if (!presence.has(roomId)) presence.set(roomId, new Map());
  presence.get(roomId).set(user.id, { id: user.id, name: user.name, seen: Date.now() });
}

export function presentIn(roomId) {
  const here = presence.get(roomId);
  if (!here) return [];
  const now = Date.now();
  for (const [id, entry] of here) if (now - entry.seen > PRESENT_MS) here.delete(id);
  return [...here.values()];
}
