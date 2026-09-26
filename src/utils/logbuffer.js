// Garde les derniers logs en mémoire pour pouvoir les lire à distance (Render gratuit n'a pas d'API de logs).
import { format } from 'node:util';

const MAX_LINES = 1500;
const lines = [];

// Aucun secret dans les journaux : les valeurs des variables sensibles et tout ce qui ressemble à un token,
// une clé d'API ou un mot de passe dans une URL est masqué avant d'être écrit (console de Render comprise).
const SECRET_ENV = /TOKEN|KEY|SECRET|PASSWORD|PASS|WEBHOOK|DATABASE_URL|CLIENT_SECRET/i;
const PATTERNS = [
  /\b[MNO][A-Za-z\d_-]{23,27}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,40}\b/g, // token Discord
  /\bAIza[\dA-Za-z_-]{35}\b/g, // clé Google
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z\d]{16,}\b/g, // clés Stripe
  /\bsk-(?:ant-)?[A-Za-z\d_-]{32,}\b/g, // clés OpenAI / Anthropic
  /\bsb_secret_[A-Za-z\d_-]{16,}\b/g, // clé Supabase
  /\beyJ[A-Za-z\d_-]{10,}\.[A-Za-z\d_-]{10,}\.[A-Za-z\d_-]{10,}\b/g, // JWT
  /\bgh[pousr]_[A-Za-z\d]{36,}\b/g, // jeton GitHub
  /([?&](?:key|token|secret|code|access_token|client_secret)=)[^&\s"']+/gi, // secret dans une URL
  /(Bearer\s+)[A-Za-z\d._~+/-]{16,}=*/gi,
];
let secrets = null;
function knownSecrets() {
  secrets ??= Object.entries(process.env)
    .filter(([k, v]) => SECRET_ENV.test(k) && v && v.length >= 8)
    .flatMap(([, v]) => v.split(/[;,\s]+/).filter((x) => x.length >= 8))
    .sort((a, b) => b.length - a.length);
  return secrets;
}
export function redact(text) {
  let out = String(text);
  for (const re of PATTERNS) out = out.replace(re, (m, prefix) => (typeof prefix === 'string' && prefix.length < m.length ? `${prefix}[masqué]` : '[secret masqué]'));
  for (const secret of knownSecrets()) out = out.split(secret).join('[secret masqué]');
  return out;
}

for (const level of ['log', 'info', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    const line = redact(format(...args));
    lines.push(`${new Date().toISOString().slice(11, 23)} ${level === 'log' || level === 'info' ? ' ' : level[0].toUpperCase()} ${line}`);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    original(line);
  };
}

/** Derniers logs (filtrés si besoin). */
export function recentLogs({ count = 300, grep = '' } = {}) {
  const filtered = grep ? lines.filter((line) => line.toLowerCase().includes(grep.toLowerCase())) : lines;
  return filtered.slice(-count).join('\n');
}
