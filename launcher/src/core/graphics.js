// Réglages graphiques conseillés pour un jeu, à partir du benchmark du PC (1000 = PC de jeu milieu de gamme,
// carte type RTX 3060), des FPS vraiment mesurés sur ce jeu et de l'écran. Aucune donnée envoyée.
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Score de carte graphique nécessaire pour du 1080p « élevé » à ~60 FPS (esport : pour ~144 FPS),
// et les jeux qui dépendent surtout du processeur.
const GAMES = [
  [/cyberpunk/, { gpu: 1500 }], [/alan wake 2/, { gpu: 1900 }], [/wukong/, { gpu: 1600 }], [/starfield/, { gpu: 1400, cpu: true }],
  [/hogwarts/, { gpu: 1300, cpu: true }], [/red dead redemption 2|rdr ?2/, { gpu: 1100 }], [/last of us/, { gpu: 1300 }],
  [/grand theft auto v|gta ?(v|5)\b/, { gpu: 350, cpu: true }], [/elden ring/, { gpu: 800 }], [/baldur/, { gpu: 900, cpu: true }],
  [/warzone|call of duty/, { gpu: 1000, esport: true }], [/apex legends/, { gpu: 600, esport: true }], [/fortnite/, { gpu: 700, esport: true }],
  [/valorant/, { gpu: 150, esport: true, cpu: true }], [/counter-strike|cs2/, { gpu: 300, esport: true, cpu: true }], [/rocket league/, { gpu: 250, esport: true }],
  [/league of legends/, { gpu: 100, esport: true, cpu: true }], [/overwatch/, { gpu: 450, esport: true }], [/rainbow six/, { gpu: 350, esport: true }],
  [/marvel rivals/, { gpu: 800, esport: true }], [/pubg|battlegrounds/, { gpu: 600, esport: true, cpu: true }], [/minecraft/, { gpu: 250, cpu: true }],
  [/fivem|five m/, { gpu: 600, cpu: true }], [/garry|gmod/, { gpu: 300, cpu: true }], [/forza horizon 5/, { gpu: 900 }], [/forza horizon 6|forza motorsport/, { gpu: 1300 }],
  [/assassin.*(shadows)/, { gpu: 1500 }], [/assassin.*(valhalla|mirage)/, { gpu: 950 }], [/flight simulator/, { gpu: 1600, cpu: true }],
  [/cities.*skylines ii|cities.*skylines 2/, { gpu: 1400, cpu: true }], [/helldivers/, { gpu: 1000, cpu: true }], [/palworld/, { gpu: 900 }],
  [/witcher 3/, { gpu: 700 }], [/stalker 2|s\.t\.a\.l\.k\.e\.r\. 2/, { gpu: 1700, cpu: true }], [/battlefield/, { gpu: 1150, cpu: true }],
  [/ea sports fc|fifa/, { gpu: 400 }], [/efootball/, { gpu: 300 }], [/^rust$|rust\b/, { gpu: 900, cpu: true }], [/tarkov/, { gpu: 1000, cpu: true }],
  [/dayz/, { gpu: 700, cpu: true }], [/arma 3/, { gpu: 700, cpu: true }], [/dead by daylight/, { gpu: 400 }], [/sea of thieves/, { gpu: 600 }],
  [/destiny 2/, { gpu: 600 }], [/diablo iv|diablo 4/, { gpu: 800 }], [/path of exile 2/, { gpu: 900 }], [/monster hunter wilds/, { gpu: 1600, cpu: true }],
  [/final fantasy xvi|final fantasy 16/, { gpu: 1500 }], [/indiana jones/, { gpu: 1700 }], [/doom.*dark ages/, { gpu: 1400 }], [/the finals/, { gpu: 800, esport: true }],
];
const PRESETS = ['Très bas', 'Bas', 'Moyen', 'Élevé', 'Ultra'];

export function gameDemand(name) {
  const n = norm(name);
  const hit = GAMES.find(([re]) => re.test(n));
  return hit ? { ...hit[1], known: true } : { gpu: 800, known: false };
}

/**
 * @param {{ name: string, gpuScore?: number, cpu1?: number, gpuName?: string, vramGb?: number, hz?: number, width?: number, perf?: Array<{avg?: number, bound?: string}> }} o
 */
export function graphicsAdvice({ name, gpuScore = null, cpu1 = null, gpuName = '', vramGb = null, hz = null, width = null, perf = [] }) {
  if (!gpuScore) return { need: 'benchmark' };
  const g = gameDemand(name);
  const ratio = gpuScore / g.gpu;
  let level = ratio >= 1.8 ? 4 : ratio >= 1.2 ? 3 : ratio >= 0.8 ? 2 : ratio >= 0.5 ? 1 : 0;
  const tips = [];
  // FPS réellement mesurés sur ce jeu : ils corrigent l'estimation
  const runs = perf.filter((x) => x.avg).slice(-5);
  const avg = runs.length ? Math.round(runs.reduce((n, x) => n + x.avg, 0) / runs.length) : null;
  const target = g.esport ? Math.max(144, hz ?? 0) : 60;
  const bound = runs.length ? (runs.filter((x) => x.bound === 'cpu').length > runs.length / 2 ? 'cpu' : runs.filter((x) => x.bound === 'gpu').length > runs.length / 2 ? 'gpu' : null) : null;
  if (avg != null && bound !== 'cpu') {
    if (avg < target * 0.8 && level > 0) { level -= 1; tips.push(`Tes parties tournent à ${avg} FPS en moyenne : un cran plus bas vise ${target} FPS stables.`); }
    else if (avg > target * 1.8 && level < 4 && !g.esport) { level += 1; tips.push(`Tu as de la marge (${avg} FPS mesurés) : tu peux monter d’un cran.`); }
  }
  const rtx = /rtx/i.test(gpuName); const fg = /rtx\s*(40|50)\d{2}/i.test(gpuName); const amd = /radeon|rx\s?\d/i.test(gpuName);
  const upscaler = rtx ? 'DLSS' : amd ? 'FSR' : 'FSR ou XeSS';
  const big = (width ?? 1920) >= 2500;
  let res; let up;
  if (big) { res = `${width >= 3800 ? '4K' : '1440p'} (ton écran)`; up = ratio >= (width >= 3800 ? 3 : 1.8) ? `${upscaler} Qualité (ou natif)` : `${upscaler} ${ratio >= 1.1 ? 'Qualité' : ratio >= 0.7 ? 'Équilibré' : 'Performance'}`; }
  else { res = '1080p'; up = ratio >= 1 ? 'pas nécessaire (natif = plus net)' : `${upscaler} ${ratio >= 0.6 ? 'Qualité' : 'Équilibré'}`; }
  if (g.esport) {
    tips.unshift(`Jeu compétitif : vise ${target} FPS et plus. Ombres, effets et post-traitement au minimum, textures selon ta mémoire vidéo : c’est ce que font les pros.`);
    if (level > 2) level = 2;
  }
  if (fg && !g.esport && ratio < 1.6) tips.push('Ta carte gère la génération d’images DLSS : active-la si le jeu la propose (plus de fluidité, un peu plus de latence).');
  if (bound === 'cpu' || (g.cpu && cpu1 && cpu1 < 900)) tips.push('Ce jeu dépend beaucoup du processeur : baisse la distance d’affichage, la densité de foule / de trafic et la qualité de la physique ; monter la résolution ne coûte presque rien.');
  if (bound === 'gpu') tips.push('Ta carte graphique est le frein : les ombres, les nuages volumétriques, le lancer de rayons et la résolution sont les réglages qui rapportent le plus de FPS.');
  if (vramGb && vramGb < 8 && level >= 2) tips.push(`Ta carte n’a que ${vramGb} Go de mémoire vidéo : garde les textures en « Moyen » pour éviter les saccades.`);
  if (!rtx && level < 4) tips.push('Coupe le lancer de rayons (ray tracing) : c’est le réglage le plus gourmand.');
  const cap = hz ? `Limite les FPS à ${g.esport ? `${hz} (ou plus si tu vises la latence la plus basse)` : `${Math.min(hz, level >= 3 ? hz : 60)}`} et active le G-Sync / FreeSync si ton écran le gère.` : null;
  if (cap) tips.push(cap);
  return { preset: PRESETS[level], level, res, upscaler: up, ratio: Math.round(ratio * 100) / 100, known: g.known, esport: Boolean(g.esport), measured: avg, target, tips };
}
