// Lancement direct : ouvrir le jeu sans passer par Steam, Epic ou EA.
// Beaucoup de jeux démarrent très bien seuls. Ceux protégés par leur plateforme (Steamworks, connexion Epic, EA app…)
// ont besoin du client : dans ce cas le launcher le démarre en arrière-plan, sans fenêtre, et retient le choix pour ce jeu.

/** Ordre des méthodes à essayer : 'exe' (le jeu seul) puis 'client' (plateforme en arrière-plan). */
export function launchPlan(item, { direct = true, memo = null } = {}) {
  const hasClient = item.source === 'steam' || item.source === 'epic';
  if (!hasClient) return ['exe'];
  // Mise à jour en attente : Steam doit la faire avant de lancer le jeu
  if (!direct || memo === 'client' || item.updatePending) return ['client'];
  return ['exe', 'client'];
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
