// Optimiser avant de jouer : liste des vérifications (rien d'irréversible) et comparaison des FPS avec tes parties d'avant.
// Tout ce qui est appliqué est remis comme avant à la fin de la partie (mode d'alimentation, applis rouvertes, priorités).

/** FPS de référence d'un jeu : moyenne de tes parties SANS optimisation (sinon toutes), sur les 10 dernières. */
export function perfBaseline(records = []) {
  const withFps = records.filter((r) => r && r.avg > 0);
  const plain = withFps.filter((r) => !r.boost);
  const pick = (plain.length >= 2 ? plain : withFps).slice(-10);
  if (!pick.length) return null;
  const mean = (k) => Math.round(pick.reduce((a, r) => a + (r[k] ?? 0), 0) / pick.length);
  return { avg: mean('avg'), low1: mean('low1') || null, games: pick.length, plain: plain.length >= 2 };
}
/** Gain ou perte en % par rapport à la référence (null si pas de référence ou mesure absurde). */
export function perfDelta(now, base) {
  if (!(now > 0) || !(base > 0)) return null;
  const d = Math.round(((now - base) / base) * 100);
  return Math.abs(d) > 300 ? null : d;
}
/** Texte de la mini-barre en jeu, le plus court possible : « 144 FPS ▲ +9 % » (sans mesure des FPS : « GPU 97 % »). */
export function perfLine({ fps = null, delta = null, gpu = null } = {}) {
  if (fps) return `${Math.round(fps)} FPS${delta != null && delta !== 0 ? ` ${delta > 0 ? '▲ +' : '▼ '}${delta} %` : ''}`;
  if (gpu != null) return `GPU ${Math.round(gpu)} %`;
  return '…';
}
/**
 * Vérifications avant de jouer. Entrée : ce qui tourne et l'état du PC. Sortie : une liste lisible, avec une action
 * proposée (cochée par défaut seulement si elle est sans risque pour le jeu).
 */
export function prelaunchChecks({ apps = [], ramUsedPct = null, power = null, high = null, diskFreeGb = null, temp = null, driverOld = false, fpsOn = false, tweaks = [], game = null, fnPerf = null } = {}) {
  const c = [];
  // Réglages Windows sûrs et utiles aux FPS (réversibles : Optimisation › Remettre Windows comme avant)
  const off = tweaks.filter((t) => ['gamemode', 'dvr'].includes(t.id) && !t.on);
  c.push(off.length
    ? { id: 'wintweaks', level: 'act', label: off.length === 2 ? 'Mode Jeu de Windows + capture Xbox en fond coupée' : off[0].label, detail: 'Gain de FPS réel sur tous les jeux · réversible dans Optimisation', on: true }
    : { id: 'wintweaks', level: 'ok', label: 'Mode Jeu de Windows déjà prêt', detail: 'Capture Xbox en fond déjà coupée' });
  c.push(apps.length
    ? { id: 'close', level: 'act', label: `Fermer ${apps.length} appli${apps.length > 1 ? 's' : ''} qui ralenti${apps.length > 1 ? 'ssent' : 't'} le jeu`, detail: `${apps.map((a) => a.label).join(', ')} · rouvertes à la fin de la partie`, on: true, apps: apps.map((a) => a.id) }
    : { id: 'close', level: 'ok', label: 'Aucune appli lourde ouverte', detail: 'Navigateurs, cloud, Office… rien ne tourne pour rien' });
  c.push(power && high && power !== high
    ? { id: 'power', level: 'act', label: 'Mode « Performances élevées » pendant la partie', detail: 'Le processeur ne ralentit plus pour économiser · remis comme avant ensuite', on: true }
    : { id: 'power', level: 'ok', label: 'Mode d’alimentation déjà au maximum', detail: '' });
  c.push({ id: 'priority', level: 'act', label: 'Priorité au jeu + carte graphique puissante', detail: 'Le jeu passe devant les autres programmes, et utilise la vraie carte graphique sur les PC portables', on: true });
  if (game === 'fortnite' && fnPerf === false) c.push({ id: 'fnperf', level: 'act', label: 'Mode Performance de Fortnite', detail: 'Souvent 2× plus de FPS, graphismes simplifiés · tes réglages sont gardés à côté', on: false });
  if (game === 'fortnite' && fnPerf === true) c.push({ id: 'fnperf', level: 'ok', label: 'Mode Performance de Fortnite déjà actif', detail: '' });
  if (game === 'fivem') c.push({ id: 'fivemcache', level: 'act', label: 'Vider le cache FiveM', detail: 'Moins de saccades et de bugs de chargement · il se retélécharge, mods et packs graphiques gardés', on: false });
  c.push({ id: 'quiet', level: 'act', label: 'Couper les notifications Windows pendant la partie', detail: 'Plus de bulles qui font sortir du plein écran', on: true });
  c.push({ id: 'perfbar', level: 'act', label: 'Mini-compteur de performances en jeu', detail: fpsOn ? 'Tes FPS et le gain par rapport à tes parties d’avant · Ctrl+Alt+P pour le cacher' : 'Coché : la mesure des FPS s’active aussi (Windows demande l’autorisation une seule fois) · Ctrl+Alt+P pour le cacher', on: true });
  if (ramUsedPct != null) c.push(ramUsedPct >= 85 ? { id: 'ram', level: 'warn', label: `Mémoire presque pleine (${ramUsedPct} %)`, detail: 'Ferme les onglets et applis inutiles : le jeu risque de saccader' } : { id: 'ram', level: 'ok', label: `Mémoire OK (${ramUsedPct} % utilisée)`, detail: '' });
  if (diskFreeGb != null && diskFreeGb < 15) c.push({ id: 'disk', level: 'warn', label: `Disque presque plein (${Math.round(diskFreeGb)} Go libres)`, detail: 'Les mises à jour du jeu peuvent échouer · Optimisation › Nettoyage' });
  if (temp != null && temp >= 85) c.push({ id: 'heat', level: 'warn', label: `Processeur chaud (${Math.round(temp)}°)`, detail: 'Aère le PC : il risque de ralentir pour se protéger' });
  if (driverOld) c.push({ id: 'driver', level: 'warn', label: 'Pilote graphique pas à jour', detail: 'Un pilote récent donne souvent plus de FPS · Mon PC' });
  return c;
}
