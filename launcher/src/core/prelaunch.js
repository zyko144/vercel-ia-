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
export function prelaunchChecks({ apps = [], ramUsedPct = null, power = null, high = null, diskFreeGb = null, temp = null, driver = null, fpsOn = false, tweaks = [], game = null, fnPerf = null, fivem = null, overlays = null, hogs = [] } = {}) {
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
  // FiveM : taille du cache (alerte au-dessus de 5 Go) ; mods et packs graphiques (ReShade, ENB) jamais touchés
  if (game === 'fivem') {
    const go = fivem?.bytes ? Math.round(fivem.bytes / 1e8) / 10 : null;
    const packs = fivem?.packs?.length ? ` · ${fivem.packs.join(', ')} détecté : gardé tel quel` : '';
    c.push({ id: 'fivemcache', level: go >= 5 ? 'warn' : 'act', label: go >= 5 ? `Cache FiveM énorme (${String(go).replace('.', ',')} Go) : à vider` : `Vider le cache FiveM${go ? ` (${String(go).replace('.', ',')} Go)` : ''}`, detail: `Moins de saccades et de bugs de chargement · il se retélécharge, mods et packs graphiques gardés${packs}`, on: false, act: true });
  }
  c.push({ id: 'quiet', level: 'act', label: 'Couper les notifications Windows pendant la partie', detail: 'Plus de bulles qui font sortir du plein écran', on: true });
  c.push({ id: 'perfbar', level: 'act', label: 'Mini-compteur de performances en jeu', detail: fpsOn ? 'Tes FPS et le gain par rapport à tes parties d’avant · Ctrl+Alt+P pour le cacher' : 'Coché : la mesure des FPS s’active aussi (Windows demande l’autorisation une seule fois) · Ctrl+Alt+P pour le cacher', on: true });
  if (ramUsedPct != null) c.push(ramUsedPct >= 85 ? { id: 'ram', level: 'warn', label: `Mémoire presque pleine (${ramUsedPct} %)`, detail: 'Ferme les onglets et applis inutiles : le jeu risque de saccader' } : { id: 'ram', level: 'ok', label: `Mémoire OK (${ramUsedPct} % utilisée)`, detail: '' });
  if (diskFreeGb != null && diskFreeGb < 15) c.push({ id: 'disk', level: 'warn', label: `Disque presque plein (${Math.round(diskFreeGb)} Go libres)`, detail: 'Les mises à jour du jeu peuvent échouer · Optimisation › Nettoyage' });
  if (temp != null && temp >= 85) c.push({ id: 'heat', level: 'warn', label: `Processeur chaud (${Math.round(temp)}°)`, detail: 'Aère le PC : il risque de ralentir pour se protéger' });
  if (driver) c.push({ id: 'driver', level: 'warn', label: driver.latest ? `Pilote graphique ${driver.version} → ${driver.latest} disponible` : `Pilote graphique vieux de ${driver.age} jours`, detail: 'Un pilote récent donne souvent plus de FPS · lien officiel dans Mon PC (rien n’est installé tout seul)' });
  if (overlays) c.push(overlays);
  for (const h of hogs) c.push({ id: `hog-${h.name}`, level: 'warn', label: `${h.name} prend ${String(Math.round(h.bytes / 1e8) / 10).replace('.', ',')} Go de mémoire`, detail: 'Ferme-le avant de jouer si tu n’en as pas besoin : moins de saccades' });
  return c;
}

// ===================== Superpositions en jeu, mémoire, saccades, avant / après =====================
// Superpositions connues qui coûtent des FPS : où les couper (on ne les coupe jamais nous-mêmes)
const OVERLAYS = [
  [/^nvidia (share|overlay)\.exe$/, 'NVIDIA', 'Alt+Z › Paramètres › décoche « Superposition en jeu »'],
  [/^gamebar(ftserver)?\.exe$/, 'Xbox Game Bar', 'Paramètres Windows › Jeux › Xbox Game Bar : désactivée'],
  [/^overwolf\.exe$/, 'Overwolf', 'ferme-le ou coupe ses applis en jeu'],
  [/^medal\.exe$/, 'Medal', 'il enregistre en continu : ferme-le si tu utilises History Clips'],
  [/^(msiafterburner|rtss)\.exe$/, 'RivaTuner', 'coupe son affichage si tu vois des saccades'],
  [/^obs(32|64)\.exe$/, 'OBS', 'un stream ou un enregistrement prend de la carte graphique'],
  [/^discord\.exe$/, 'Discord', 'si sa superposition est active : Paramètres › Superposition de jeu'],
];
/** Superpositions ouvertes (noms des programmes en cours) → une seule vérification, avec comment les couper. */
export function overlayCheck(names = []) {
  const set = new Set(names.map((n) => String(n).toLowerCase().split(/[\\/]/).pop()));
  const found = OVERLAYS.filter(([re]) => [...set].some((n) => re.test(n)));
  if (!found.length) return null;
  return { id: 'overlays', level: 'warn', label: `Superposition${found.length > 1 ? 's' : ''} en jeu : ${found.map((f) => f[1]).join(', ')}`, detail: found.map((f) => `${f[1]} : ${f[2]}`).join(' · ') };
}
/** Programmes qui prennent plus de 2 Go de mémoire (hors jeu et Windows) : « nom|octets » par ligne. */
export function memoryHogs(text, exclude = [], min = 2e9) {
  const skip = new Set(['system', 'memory compression', 'registry', 'idle', ...exclude.map((e) => String(e).toLowerCase().replace(/\.exe$/, ''))]);
  return String(text).split(/\r?\n/).map((l) => l.split('|')).filter(([n, b]) => n && Number(b) >= min && !skip.has(n.trim().toLowerCase()))
    .map(([n, b]) => ({ name: n.trim(), bytes: Number(b) }));
}
export const HOGS_PS = "Get-Process | Sort-Object WS -Descending | Select-Object -First 8 | ForEach-Object { $_.ProcessName + '|' + $_.WS }";
/** D'où viennent les saccades d'une partie (mesures prises pendant le jeu). */
export function stutterCause(samples = [], stutters = 0) {
  if (!(stutters >= 5) || !samples.length) return null;
  const max = (k) => Math.max(0, ...samples.map((s) => s[k] ?? 0));
  const avg = (k) => samples.reduce((a, s) => a + (s[k] ?? 0), 0) / samples.length;
  if (max('ram') >= 90) return 'la mémoire était pleine : ferme les applis lourdes avant de jouer';
  if (avg('core') >= 95) return 'le processeur était au maximum : baisse les réglages qui le chargent (distance d’affichage, foule, ombres)';
  if (avg('gpu') >= 98) return 'la carte graphique était à fond : baisse la qualité ou limite les FPS';
  return 'ni la mémoire ni le processeur : souvent le disque ou le chargement des textures (jeu sur SSD conseillé)';
}
/** Avant / après la dernière optimisation d'un jeu : FPS moyens et 1 % low (au moins 1 partie de chaque côté). */
export function beforeAfter(records = [], mark = null) {
  if (!mark) return null;
  const withFps = records.filter((r) => r?.avg > 0);
  const pick = (l) => (l.length ? { avg: Math.round(l.reduce((a, r) => a + r.avg, 0) / l.length), low1: Math.round(l.reduce((a, r) => a + (r.low1 ?? 0), 0) / l.length) || null, games: l.length } : null);
  const before = pick(withFps.filter((r) => r.at < mark).slice(-5)); const after = pick(withFps.filter((r) => r.at >= mark));
  return before && after ? { before, after, delta: perfDelta(after.avg, before.avg), deltaLow: perfDelta(after.low1, before.low1) } : null;
}
