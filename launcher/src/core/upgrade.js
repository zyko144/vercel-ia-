// Upgrade : conseil d'achat (carte graphique, processeur, carte mère, RAM, stockage), compatibilité et FPS estimés.
// Indices de performance d'après les moyennes des tests publics ; prix neufs indicatifs en euros (null = plus vendu neuf).
// Tout est affiché comme une ESTIMATION ; quand un jeu a de vrais FPS mesurés, on part de ces mesures.
const brandOf = (n) => (/^(RTX|GTX)/.test(n) ? 'nvidia' : /^RX/.test(n) ? 'amd' : 'intel');
export const GPUS = [
  ['GTX 1050 Ti', 34, null, 75], ['GTX 1650', 42, null, 75], ['GTX 1060', 52, null, 120], ['RX 580', 50, null, 185], ['GTX 1660', 62, null, 120], ['GTX 1660 Super', 68, null, 125],
  ['RTX 3050', 75, 200, 130], ['RTX 2060', 82, null, 160], ['RX 6600', 105, 200, 132], ['RTX 2070', 98, null, 175], ['RTX 2070 Super', 108, null, 215], ['RTX 3060', 100, 270, 170],
  ['RX 7600', 118, 250, 165], ['RTX 4060', 118, 290, 115], ['Arc B580', 125, 270, 190], ['RX 6650 XT', 120, null, 180], ['RTX 3060 Ti', 128, null, 200], ['RTX 5060', 135, 300, 145],
  ['RTX 4060 Ti', 140, 400, 160], ['RTX 3070', 145, null, 220], ['RX 6700 XT', 145, null, 230], ['RTX 3080', 190, null, 320], ['RX 7700 XT', 175, 400, 245], ['RTX 4070', 180, 550, 200],
  ['RX 7800 XT', 210, 480, 263], ['RTX 4070 Super', 210, null, 220], ['RTX 5070', 215, 560, 250], ['RX 9070', 245, 600, 220], ['RTX 4070 Ti Super', 245, null, 285],
  ['RX 9070 XT', 270, 680, 304], ['RTX 5070 Ti', 270, 800, 300], ['RTX 4080 Super', 290, null, 320], ['RX 7900 XTX', 300, null, 355], ['RTX 5080', 310, 1100, 360], ['RTX 4090', 360, null, 450], ['RTX 5090', 450, 2300, 575],
].map(([name, score, price, watts]) => ({ name, score, price, watts, brand: brandOf(name) }));

// Processeurs à acheter (même échelle que cpuScore) : socket, type de mémoire, consommation
export const CPUS = [
  ['Ryzen 5 5600', 110, 100, 'AM4', 65], ['Ryzen 7 5700X3D', 145, 190, 'AM4', 105], ['Ryzen 5 7600', 130, 180, 'AM5', 65], ['Ryzen 5 9600X', 145, 220, 'AM5', 65],
  ['Ryzen 7 7800X3D', 172, 360, 'AM5', 120], ['Ryzen 7 9800X3D', 191, 480, 'AM5', 120], ['Core i5-12400F', 120, 110, 'LGA1700', 65], ['Core i5-13400F', 130, 170, 'LGA1700', 65],
  ['Core i5-14600KF', 150, 230, 'LGA1700', 125], ['Core i7-14700KF', 160, 340, 'LGA1700', 125], ['Core Ultra 7 265K', 150, 300, 'LGA1851', 125],
].map(([name, score, price, socket, watts]) => ({ name, score, price, socket, watts }));
// Nouvelle plateforme : carte mère d'entrée de gamme correcte + mémoire du bon type
const BOARDS = { AM5: ['carte mère B650', 130, 'DDR5'], LGA1700: ['carte mère B760 DDR5', 120, 'DDR5'], LGA1851: ['carte mère B860', 150, 'DDR5'], AM4: ['carte mère B550', 90, 'DDR4'] };
const RAM_PRICE = { DDR4: { 16: 40, 32: 70 }, DDR5: { 16: 55, 32: 95 } };

const norm = (s) => String(s ?? '').toLowerCase().replace(/nvidia|geforce|amd|radeon|intel|graphics|\(tm\)|\(r\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Carte de la table qui correspond au nom Windows (« NVIDIA GeForce RTX 4070 SUPER » → RTX 4070 Super). */
export function matchGpu(name) {
  const n = ` ${norm(name)} `;
  return [...GPUS].sort((a, b) => b.name.length - a.name.length).find((g) => n.includes(` ${norm(g.name)} `)) ?? null;
}

/** Niveau du processeur d'après son nom (Ryzen / Core), 110 ≈ Ryzen 5 5600. null si inconnu. */
export function cpuScore(name) {
  const n = String(name ?? '').toLowerCase();
  const exact = CPUS.find((c) => n.includes(c.name.toLowerCase().replace('core ', '')));
  if (exact) return exact.score;
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
  if (/core\s*ultra/.test(n)) return 150;
  return null;
}
/** Socket et type de mémoire du processeur actuel (pour savoir ce qui se pose sans changer de carte mère). */
export function platformOf(name) {
  const n = String(name ?? '').toLowerCase();
  let m = n.match(/ryzen\s*[3579]\s*(\d)\d{3}/);
  if (m) return Number(m[1]) <= 5 ? { socket: 'AM4', mem: 'DDR4' } : { socket: 'AM5', mem: 'DDR5' };
  m = n.match(/i[3579][- ]?(\d{4,5})/);
  if (m) {
    const g = m[1].length === 5 ? Number(m[1].slice(0, 2)) : Number(m[1][0]);
    return g >= 12 ? { socket: 'LGA1700', mem: 'DDR4/DDR5' } : g >= 10 ? { socket: 'LGA1200', mem: 'DDR4' } : g >= 6 ? { socket: 'LGA1151', mem: 'DDR4' } : { socket: 'ancien', mem: 'DDR3' };
  }
  if (/core\s*ultra/.test(n)) return { socket: 'LGA1851', mem: 'DDR5' };
  return { socket: null, mem: null };
}
/** Plafond utile de carte graphique : ce que le processeur peut suivre et ce que l'écran peut afficher. */
export function balance({ cpuName, width = null, hz = null }) {
  const cpu = cpuScore(cpuName);
  const cpuCap = cpu ? Math.round(cpu * 1.75) : null;
  const screenCap = !width ? null : width <= 1920 && (hz ?? 60) <= 75 ? 150 : width <= 1920 ? 230 : width <= 2560 ? 300 : null;
  return { cpu, cpuCap, screenCap, cap: Math.min(cpuCap ?? Infinity, screenCap ?? Infinity) };
}
/** Alimentation conseillée (W) pour une carte et un processeur, avec marge. */
export const psuFor = (gpuW = 200, cpuW = 105) => Math.ceil((gpuW + cpuW + 150) / 50) * 50;

// FPS de référence des jeux populaires (1080p, réglages élevés, RTX 3060 + Ryzen 5 5600) ; cpu = jeu surtout limité par le processeur
const GAME_BASE = [
  [/fortnite/, 120], [/valorant/, 350, true], [/counter.?strike|cs2/, 260, true], [/rocket league/, 250, true], [/apex/, 140], [/grand theft auto|gta/, 120, true], [/fivem/, 90, true],
  [/warzone|call of duty/, 100], [/cyberpunk/, 60], [/elden ring/, 60, false, 60], [/minecraft/, 250, true], [/roblox/, 220, true], [/rainbow six|r6/, 220], [/overwatch/, 200],
  [/league of legends/, 300, true], [/fall guys/, 144], [/the finals/, 100], [/marvel rivals/, 90], [/helldivers/, 70], [/baldur/, 80], [/red dead/, 70], [/ea sports fc|fifa/, 150],
  [/rust/, 90, true], [/dayz/, 80, true], [/palworld/, 80], [/destiny/, 130], [/valheim/, 120], [/garry/, 150, true], [/sea of thieves/, 100], [/dead by daylight/, 130],
];
/** FPS estimés pour un jeu (sans mesure) avec une carte et un processeur donnés. null si le jeu est inconnu. */
export function estimateFps(name, gpuScore, cpu = 110) {
  const n = String(name ?? '').toLowerCase();
  const hit = GAME_BASE.find(([re]) => re.test(n));
  if (!hit || !gpuScore) return null;
  const [, base, cpuHeavy, cap] = hit;
  const fps = base * Math.min(gpuScore / 100, ((cpu || 110) / 110) * (cpuHeavy ? 1 : 1.7));
  return { fps: Math.round(Math.min(cap ?? Infinity, fps)), cpuHeavy: Boolean(cpuHeavy) };
}

/** FPS avant / après pour chaque jeu : vraies mesures si possible (gain selon ce qui limite), sinon estimation des tests publics. */
export function simulate({ games = [], gpu, newGpu = gpu, cpu, newCpu = cpu, cap = Infinity }) {
  return games.map((g) => {
    if (g.avg) {
      const gpuBound = g.bound === 'gpu' || (g.gpuAvg ?? 0) >= 90;
      const gpuR = Math.min(newGpu.score, cap) / gpu.score, cpuR = (newCpu || 1) / (cpu || 1);
      const k = gpuBound ? Math.min(gpuR, cpuR * 1.6) : Math.min(cpuR * (gpuR > 1 ? 1.05 : 1), gpuR * 1.6);
      return { id: g.id, name: g.name, now: Math.round(g.avg), after: Math.round(g.avg * Math.max(1, k)), limit: gpuBound ? 'gpu' : 'cpu', measured: true };
    }
    const a = estimateFps(g.name, gpu?.score, cpu), b = estimateFps(g.name, Math.min(newGpu?.score ?? 0, cap === Infinity ? 1e9 : cap * 1.1), newCpu);
    return a && b ? { id: g.id, name: g.name, now: a.fps, after: Math.max(a.fps, b.fps), limit: a.cpuHeavy ? 'cpu' : 'gpu', measured: false } : { id: g.id, name: g.name, unknown: true };
  });
}

/** Cartes graphiques possibles (marque, budget) : compatibles, classées par puissance, avec la meilleure affaire repérée. */
export function gpuOptions({ gpuName, cpuName, width, hz, budget, brand = 'all' }) {
  const cur = matchGpu(gpuName);
  const bal = balance({ cpuName, width, hz });
  const cpuW = CPUS.find((c) => c.score === cpuScore(cpuName))?.watts ?? 105;
  const list = GPUS.filter((g) => g.price && g.price <= budget && (brand === 'all' || g.brand === brand) && (!cur || g.score >= cur.score * 1.15))
    .map((g) => ({ ...g, gain: cur ? Math.round((Math.min(g.score, bal.cap) / cur.score - 1) * 100) : null, value: (Math.min(g.score, bal.cap) - (cur?.score ?? 0)) / g.price, psu: psuFor(g.watts, cpuW), wasted: g.score > bal.cap * 1.1 }));
  const useful = list.filter((g) => !g.wasted);
  const best = (useful.length ? useful : list).sort((a, b) => b.score - a.score || a.price - b.price)[0] ?? null;
  const value = [...list].sort((a, b) => b.value - a.value)[0] ?? null;
  return { current: cur, balance: bal, best, value, options: list.sort((a, b) => b.score - a.score).slice(0, 6) };
}
/** Processeurs possibles : ceux qui se posent sur la carte mère actuelle, ou une nouvelle plateforme (processeur + carte mère + RAM). */
export function cpuOptions({ cpuName, ramGb = 16, budget }) {
  const cur = cpuScore(cpuName), plat = platformOf(cpuName);
  const opts = [];
  for (const c of CPUS) {
    if (cur && c.score < cur * 1.12) continue;
    const same = plat.socket === c.socket;
    const board = same ? null : BOARDS[c.socket];
    const memType = board ? board[2] : null;
    const ramSize = Math.max(16, ramGb >= 32 ? 32 : ramGb >= 16 ? 32 : 16);
    const ram = memType && !(plat.mem ?? '').includes(memType) ? { label: `${ramSize} Go ${memType}`, price: RAM_PRICE[memType][ramSize] } : null;
    const total = c.price + (board?.[1] ?? 0) + (ram?.price ?? 0);
    if (total > budget) continue;
    opts.push({ ...c, same, board: board ? { label: board[0], price: board[1] } : null, ram, total, gain: cur ? Math.round((c.score / cur - 1) * 100) : null, value: (c.score - (cur ?? 0)) / total,
      notes: [same ? '✅ Se pose sur ta carte mère actuelle' : `🔁 Nouvelle plateforme ${c.socket}`, same && c.socket === 'AM4' && 'Mise à jour du BIOS peut-être nécessaire avant de l’installer', !same && board && `${board[0]} (~${board[1]} €)`, ram && `${ram.label} (~${ram.price} €, ton ancienne RAM n’est pas compatible)`].filter(Boolean) });
  }
  const best = [...opts].sort((a, b) => b.score - a.score || a.total - b.total)[0] ?? null;
  const value = [...opts].sort((a, b) => b.value - a.value)[0] ?? null;
  return { current: cur, platform: plat, best, value, options: opts.sort((a, b) => b.score - a.score).slice(0, 6) };
}
/** Mémoire et stockage : options compatibles avec la carte mère actuelle. */
export function ramOptions({ cpuName, ramGb = null, ramSpeed = null }) {
  const mem = platformOf(cpuName).mem ?? 'DDR4';
  const type = mem.includes('DDR5') ? 'DDR5' : 'DDR4';
  const out = [];
  if (ramGb == null || ramGb < 16) out.push({ title: `16 Go ${type} (2 × 8 Go)`, price: RAM_PRICE[type][16], gain: 'le minimum pour jouer sans saccades en 2025', notes: [`✅ ${type} : le type de ta carte mère`, 'Deux barrettes identiques (double canal)'] });
  if (ramGb == null || ramGb < 32) out.push({ title: `32 Go ${type} (2 × 16 Go)`, price: RAM_PRICE[type][32], gain: 'confortable : jeux lourds + Discord + navigateur ouverts', notes: [`✅ ${type} : le type de ta carte mère`, 'Remplace les barrettes actuelles (même vitesse conseillée)'] });
  if (ramSpeed && ramSpeed < (type === 'DDR5' ? 5600 : 3200)) out.unshift({ title: 'Activer le profil XMP / EXPO dans le BIOS', price: 0, gain: `ta mémoire tourne à ${ramSpeed} MHz : souvent +5 à 15 % de FPS gratuitement`, notes: ['Gratuit, réglage du BIOS'] });
  return { type, options: out };
}
export function diskOptions({ systemHdd = false, freeGb = null }) {
  const out = [];
  if (systemHdd) out.push({ title: 'SSD NVMe 1 To pour Windows et les jeux', price: 60, gain: 'chargements 3 à 5× plus rapides, plus de saccades au démarrage', notes: ['Emplacement M.2 sur presque toutes les cartes mères depuis 2016', 'Sinon : SSD SATA 2,5" (~55 €)'] });
  out.push({ title: 'SSD NVMe 2 To', price: 110, gain: freeGb != null && freeGb < 100 ? `tu n’as plus que ${freeGb} Go libres : de la place pour 10+ gros jeux` : 'de la place pour 10+ gros jeux', notes: ['Le meilleur rapport prix / Go pour les jeux'] });
  return { options: out };
}
