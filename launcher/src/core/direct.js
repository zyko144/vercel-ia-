// Lancement direct : ouvrir le jeu sans passer par Steam, Epic ou EA.
// Beaucoup de jeux démarrent très bien seuls. Ceux protégés par leur plateforme (Steamworks, connexion Epic, EA app…)
// ont besoin du client : dans ce cas le launcher le démarre en arrière-plan, sans fenêtre, et retient le choix pour ce jeu.

/** Ordre des méthodes à essayer : 'exe' (le jeu seul) puis 'client' (plateforme en arrière-plan). */
export function launchPlan(item, { direct = true, memo = null, antiCheat = false } = {}) {
  const hasClient = item.source === 'steam' || item.source === 'epic';
  if (!hasClient) return ['exe'];
  // Mise à jour en attente, ou anti-triche : le jeu doit passer par sa plateforme (qui démarre l'anti-triche)
  if (!direct || memo === 'client' || item.updatePending || antiCheat || ANTICHEAT_GAMES.has(String(item.steamId ?? item.epicKey ?? ''))) return ['client'];
  return ['exe', 'client'];
}

// Jeux à anti-triche (Easy Anti-Cheat, BattlEye, Vanguard…) : lancés seuls, ils refusent de jouer en ligne
// (« le jeu n'a pas été lancé avec l'anti-triche »). Numéros Steam connus + dossiers d'anti-triche repérés.
export const ANTICHEAT_GAMES = new Set(['252950', '359550', '578080', '1172470', '230410', '2507950', '1938090', '252490', '1086940', '440900', '1085660', '1203220', '1665460', '2073850', '1517290']);
export const ANTICHEAT_DIRS = ['EasyAntiCheat', 'EasyAntiCheat_EOS', 'BattlEye', 'BattlEyeLauncher', 'EAC', 'AntiCheat', 'Anti-Cheat'];

/** Le dossier du jeu contient-il un anti-triche ? (on regarde la racine et un niveau en dessous) */
export async function hasAntiCheat(dir, readdirImpl) {
  if (!dir) return false;
  const want = new Set(ANTICHEAT_DIRS.map((d) => d.toLowerCase()));
  const look = async (d) => (await readdirImpl(d, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory());
  const top = await look(dir);
  if (top.some((e) => want.has(e.name.toLowerCase()))) return true;
  for (const e of top.slice(0, 40)) if ((await look(`${dir}/${e.name}`)).some((x) => want.has(x.name.toLowerCase()))) return true;
  return false;
}

/** Variables pour qu'un jeu Steam lancé seul ne se relance pas via Steam (il sait quel jeu il est). */
export function directEnv(item, base = process.env) {
  if (item.source !== 'steam' || !item.steamId) return { ...base };
  return { ...base, SteamAppId: String(item.steamId), SteamGameId: String(item.steamId) };
}

/** Un processus appartient-il au dossier du jeu ? (comparaison sans casse, jamais un dossier voisin au nom proche) */
export function insideDir(exePath, dir) {
  if (!exePath || !dir) return false;
  const a = String(exePath).toLowerCase().replace(/[\\/]+/g, '\\');
  const b = String(dir).toLowerCase().replace(/[\\/]+/g, '\\').replace(/\\$/, '') + '\\';
  return a.startsWith(b);
}
