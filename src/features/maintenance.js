// Mode maintenance (tableau de bord du chef) : le bot répond seulement au chef, les autres voient un message.
import { load, save } from '../storage.js';

const KEY = 'maintenance';
let state = { on: false, message: '', since: null };
export async function loadMaintenance() {
  state = { ...state, ...((await load(KEY, {}).catch(() => ({}))) ?? {}) };
  return state;
}
export const maintenance = () => state;
export function setMaintenance(on, message = '') {
  state = { on: Boolean(on), message: String(message ?? '').slice(0, 300), since: on ? Date.now() : null };
  save(KEY, state);
  return state;
}
export const maintenanceText = () => state.message || '🛠️ Le bot est en maintenance quelques minutes, on revient vite !';
