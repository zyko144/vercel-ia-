// Garde les derniers logs en mémoire pour pouvoir les lire à distance (Render gratuit n'a pas d'API de logs).
import { format } from 'node:util';

const MAX_LINES = 1500;
const lines = [];

for (const level of ['log', 'info', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    lines.push(`${new Date().toISOString().slice(11, 23)} ${level === 'log' || level === 'info' ? ' ' : level[0].toUpperCase()} ${format(...args)}`);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    original(...args);
  };
}

/** Derniers logs (filtrés si besoin). */
export function recentLogs({ count = 300, grep = '' } = {}) {
  const filtered = grep ? lines.filter((line) => line.toLowerCase().includes(grep.toLowerCase())) : lines;
  return filtered.slice(-count).join('\n');
}
