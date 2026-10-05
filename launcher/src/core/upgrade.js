// Upgrade : simulateur de carte graphique et conseil d'achat selon le budget.
// Indice = performances relatives en jeu (1080p/1440p, RTX 3060 = 100), d'après les moyennes des tests publics.
// Prix = prix neuf indicatif en euros (null = plus vendue neuve). Tout est affiché comme une ESTIMATION.
export const GPUS = [
  ['GTX 1050 Ti', 34, null], ['GTX 1650', 42, null], ['GTX 1060', 52, null], ['RX 580', 50, null], ['GTX 1660', 62, null], ['GTX 1660 Super', 68, null],
  ['RTX 3050', 75, 200], ['RTX 2060', 82, null], ['RX 6600', 105, 200], ['RTX 2070', 98, null], ['RTX 2070 Super', 108, null], ['RTX 3060', 100, 270],
  ['RX 7600', 118, 250], ['RTX 4060', 118, 290], ['Arc B580', 125, 270], ['RX 6650 XT', 120, null], ['RTX 3060 Ti', 128, null], ['RTX 5060', 135, 300],
  ['RTX 4060 Ti', 140, 400], ['RTX 3070', 145, null], ['RX 6700 XT', 145, null], ['RTX 3080', 190, null], ['RX 7700 XT', 175, 400], ['RTX 4070', 180, 550],
  ['RX 7800 XT', 210, 480], ['RTX 4070 Super', 210, null], ['RTX 5070', 215, 560], ['RX 9070', 245, 600], ['RTX 4070 Ti Super', 245, null],
  ['RX 9070 XT', 270, 680], ['RTX 5070 Ti', 270, 800], ['RTX 4080 Super', 290, null], ['RX 7900 XTX', 300, null], ['RTX 5080', 310, 1100], ['RTX 4090', 360, null], ['RTX 5090', 450, 2300],
].map(([name, score, price]) => ({ name, score, price }));

const norm = (s) => String(s ?? '').toLowerCase().replace(/nvidia|geforce|amd|radeon|intel|graphics|\(tm\)|\(r\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Carte de la table qui correspond au nom Windows (« NVIDIA GeForce RTX 4070 SUPER » → RTX 4070 Super). */
export function matchGpu(name) {
  const n = ` ${norm(name)} `;
  return [...GPUS].sort((a, b) => b.name.length - a.name.length).find((g) => n.includes(` ${norm(g.name)} `)) ?? null;
}
/** FPS estimés avec une autre carte : gain complet si le jeu est limité par la carte graphique, faible sinon (processeur). */
export function simulate(current, target, games = [], cap = Infinity) {
  const ratio = Math.min(target.score, cap) / current.score;
  return games.filter((g) => g.avg).map((g) => {
    const gpuBound = g.bound === 'gpu' || (g.gpuAvg ?? 0) >= 90;
    const k = gpuBound ? ratio : Math.min(ratio, 1.12);
    return { id: g.id, name: g.name, now: Math.round(g.avg), after: Math.round(g.avg * k), cpuBound: !gpuBound && ratio > 1.12, measured: true };
  });
}
/** Meilleur achat pour un budget : la carte la plus rapide qui rentre, si elle apporte au moins +20 %. Plus RAM / SSD si utile. */
export function budgetAdvice({ gpuName, ramGb = null, systemHdd = false, budget, cpuName = '', width = null, hz = null, cpuBoundShare = 0 }) {
  const out = [];
  let left = budget;
  if (systemHdd && left >= 60) { out.push({ kind: 'ssd', title: 'SSD 1 To pour Windows et les jeux', price: 60, gain: 'chargements 3 à 5× plus rapides, plus de saccades au démarrage' }); left -= 60; }
  if (ramGb != null && ramGb < 16 && left >= 45) { out.push({ kind: 'ram', title: `Passer à 16 Go de RAM (tu as ${ramGb} Go)`, price: 45, gain: 'moins de saccades, plus d’applis ouvertes en jouant' }); left -= 45; }
  const cur = matchGpu(gpuName);
  const bal = balance({ cpuName, width, hz });
  // Le processeur limite déjà la carte actuelle (ou la plupart de tes jeux) : on conseille d'abord le processeur
  const cpuFirst = cur && bal.cpuCap && (bal.cpuCap < cur.score * 1.25 || cpuBoundShare >= 0.6);
  if (cpuFirst) { const c = cpuAdvice(cpuName); if (c.price <= left) { out.push(c); left -= c.price; } }
  const fits = (g) => g.price && g.price <= left && (!cur || g.score >= cur.score * 1.2);
  const useful = GPUS.filter((g) => fits(g) && g.score <= bal.cap * 1.1); // pas de carte que le PC ou l'écran ne pourront pas exploiter
  const best = (useful.length ? useful : GPUS.filter(fits)).sort((a, b) => b.score - a.score || a.price - b.price)[0];
  if (best) out.push({ kind: 'gpu', title: best.name, price: best.price, gain: cur ? `environ +${Math.round((Math.min(best.score, bal.cap) / cur.score - 1) * 100)} % de FPS dans les jeux limités par la carte graphique` : 'grosse hausse des FPS', gpu: best, capped: !useful.length });
  return { current: cur, balance: bal, cpuFirst: Boolean(cpuFirst), items: out, total: out.reduce((a, x) => a + x.price, 0), best: best ?? null };
}

/** Niveau du processeur d'après son nom (Ryzen / Core), 100 ≈ Ryzen 5 3600. null si inconnu. */
export function cpuScore(name) {
  const n = String(name ?? '').toLowerCase();
  let m = n.match(/ryzen\s*([3579])\s*(\d)(\d)\d\d(x3d)?/);
  if (m) {
    const gen = { 1: 0.7, 2: 0.75, 3: 0.9, 4: 0.95, 5: 1.1, 7: 1.3, 8: 1.3, 9: 1.45 }[m[2]] ?? 1;
    return Math.round(100 * gen * ({ 3: 0.8, 5: 1, 7: 1.1, 9: 1.15 }[m[1]]) * (m[4] ? 1.2 : 1));
  }
  m = n.match(/i([3579])[- ]?(\d{4,5})/);
  if (m) {
    const g = m[2].length === 5 ? Number(m[2].slice(0, 2)) : Number(m[2][0]);
    const gen = g <= 4 ? 0.5 : g <= 7 ? 0.65 : g <= 9 ? 0.8 : g <= 11 ? 0.95 : g <= 12 ? 1.2 : 1.3;
    return Math.round(100 * gen * ({ 3: 0.8, 5: 1, 7: 1.1, 9: 1.15 }[m[1]]));
  }
  if (/core\s*ultra/.test(n)) return 135;
  return null;
}
/** Plafond utile de carte graphique : ce que le processeur peut suivre et ce que l'écran peut afficher. */
export function balance({ cpuName, width = null, hz = null }) {
  const cpu = cpuScore(cpuName);
  const cpuCap = cpu ? Math.round(cpu * 1.9) : null;
  const screenCap = !width ? null : width <= 1920 && (hz ?? 60) <= 75 ? 150 : width <= 1920 ? 230 : width <= 2560 ? 300 : null;
  return { cpu, cpuCap, screenCap, cap: Math.min(cpuCap ?? Infinity, screenCap ?? Infinity) };
}
/** Processeur conseillé quand c'est lui qui limite (AM4 : un X3D se pose sans changer de carte mère). */
export function cpuAdvice(cpuName) {
  return /ryzen\s*[3579]\s*[1-5]\d{3}/i.test(cpuName ?? '')
    ? { kind: 'cpu', title: 'Ryzen 7 5700X3D (même carte mère)', price: 190, gain: 'le processeur qui suit les cartes récentes, sans rien changer d’autre' }
    : { kind: 'cpu', title: 'Ryzen 5 7600 + carte mère B650 + 16 Go DDR5', price: 420, gain: 'une base moderne qui suit les cartes graphiques actuelles' };
}
