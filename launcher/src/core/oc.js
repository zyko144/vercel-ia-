// Opti Pro : ce que le BIOS de CE PC permet vraiment (overclocking processeur, mémoire, profil XMP/EXPO).
// Logique pure, testée sur Linux ; l'IA s'appuie dessus pour le guide pas à pas. Rien n'est appliqué automatiquement.
export function ocPlan({ cpu = '', board = '', ram = [] } = {}) {
  const c = String(cpu), b = String(board).toUpperCase();
  const amd = /ryzen/i.test(c), x3d = /x3d/i.test(c), intelK = /\d{4,5}K[FS]?\b/i.test(c) || /Ultra \d+ \d{3}K/i.test(c);
  const chip = (b.match(/\b([ABHXZQ])\d{3}[EM]?\b/) ?? [])[1] ?? null; // Z790, B650, X670E, H610…
  let cpuOc, cpuHow;
  if (amd && x3d) { cpuOc = 'limité'; cpuHow = ['PBO activé (si proposé par le BIOS)', 'Curve Optimizer négatif par cœur (-10 à -30) : plus de boost, moins de chaleur', 'Pas de hausse de tension : les X3D ne le supportent pas']; }
  else if (amd) { cpuOc = chip === 'A' ? 'limité' : 'oui'; cpuHow = ['PBO (Precision Boost Overdrive) sur « Advanced »', 'Curve Optimizer négatif (-15 à -30), testé cœur par cœur', 'Limites PPT/TDC/EDC sur « Motherboard » si le refroidissement suit']; }
  else if (intelK) { cpuOc = chip === 'Z' ? 'oui' : 'limité'; cpuHow = chip === 'Z' ? ['Multiplicateur P-cores +1 à +3 (tous cœurs)', 'Load-Line Calibration modérée, tension surveillée (< 1,40 V)', 'Undervolt léger (offset -0,05 V) pour garder le boost plus longtemps'] : ['Carte mère sans chipset Z : multiplicateur bloqué', 'Limites de puissance PL1 = PL2 (boost tenu en continu)', 'Undervolt si le BIOS le permet']; }
  else { cpuOc = 'non'; cpuHow = ['Processeur non débloqué : on règle le BIOS pour le boost', 'Limites de puissance PL1 = PL2 au maximum supporté par la carte mère', 'C-States conservés, profil d’alimentation « Hautes performances »']; }
  const mods = ram.filter((m) => m?.speed), rated = Math.max(0, ...mods.map((m) => m.speed)), cur = Math.min(...mods.map((m) => m.configured || m.speed), Infinity);
  const type = mods.find((m) => m.type)?.type ?? null;
  const ramHow = [];
  if (mods.length && cur < rated) ramHow.push(`${amd ? 'EXPO' : 'XMP'} à activer : ta RAM tourne à ${cur} MHz au lieu de ${rated} MHz`);
  if (mods.length === 1) ramHow.push('Une seule barrette : passer en double canal (2 barrettes) donne souvent +10 à 20 % de FPS min');
  if (mods.length) ramHow.push(type === 'DDR5' ? 'Après EXPO/XMP : tRFC et tREFI resserrés, testés avec TestMem5' : 'Après XMP : fréquence +200 MHz et timings primaires serrés, testés avec TestMem5');
  if (amd && type === 'DDR5') ramHow.push('Ryzen 7000/9000 : viser 6000 MHz avec FCLK 2000 (rapport 1:1)');
  return { cpuOc, cpuHow, chip, ramType: type, ramNow: mods.length ? cur : null, ramRated: rated || null, ramSticks: mods.length, ramHow, ramLimited: !mods.length || cur >= rated };
}
/** RAM écrite à la main (« 2x8 Go DDR4 3200 ») → barrettes lisibles par ocPlan. */
export function parseRam(text = '') {
  const t = String(text), n = Number(t.match(/(\d)\s*[x×*]\s*\d+/i)?.[1] ?? (/\bune? (?:seule )?barrette|1 barrette/i.test(t) ? 1 : 2));
  const speed = Number(t.match(/\b([2-9]\d{3})\b/)?.[1] ?? 0) || null, type = t.match(/DDR\s?([345])/i)?.[1];
  return speed ? Array.from({ length: Math.min(n, 4) }, () => ({ speed, configured: speed, type: type ? `DDR${type}` : null })) : [];
}
/** Faut-il overclocker ? Jamais sur portable, ni avec le refroidissement d'origine, ni si ça chauffe déjà. */
export function ocAdvice(plan, { laptop = false, cooling = '', cpuTempMax = null } = {}) {
  const weak = /origine|stock|box|d.?origine|wraith|laminar|aucun/i.test(cooling);
  const hot = Number(cpuTempMax) >= 85;
  if (laptop) return { cpu: 'déconseillé', why: 'PC portable : pas d’overclocking (chaleur, batterie). On gagne avec le mode performances et un undervolt si le fabricant le permet.' };
  if (hot) return { cpu: 'déconseillé', why: `Le processeur monte déjà à ${cpuTempMax} °C : on règle d’abord le refroidissement, puis undervolt plutôt qu’overclocking.` };
  if (plan.cpuOc === 'oui' && !weak) return { cpu: 'recommandé', why: 'Processeur débloqué, carte mère et refroidissement compatibles : overclocking possible, testé pas à pas.' };
  if (plan.cpuOc === 'oui') return { cpu: 'BIOS seulement', why: 'Processeur débloqué mais refroidissement d’origine : réglages BIOS légers (PBO / undervolt), pas de hausse de fréquence.' };
  return { cpu: 'BIOS seulement', why: plan.cpuOc === 'limité' ? 'Overclocking limité par le processeur ou la carte mère : on va chercher les gains dans le BIOS (boost, limites de puissance, undervolt).' : 'Processeur non débloqué : le BIOS est réglé pour tenir le boost au maximum.' };
}
/** Page officielle des BIOS de la carte mère (le fabricant y publie la dernière version). */
export function biosLink(board = '', cpu = '') {
  const b = String(board).replace(/\s*\(MS-\w+\)|Micro-Star International|Co\.,? Ltd\.?|ASUSTeK COMPUTER INC\.?|Gigabyte Technology|ASRock|\bInc\.?/gi, '').replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, '');
  const q = encodeURIComponent(b);
  if (/micro-star|\bmsi\b/i.test(board)) return `https://www.msi.com/Motherboard/${b.replace(/^MSI\s+/i, '').replace(/[^\w]+/g, '-')}/support#bios`;
  if (/asus/i.test(board)) return `https://www.asus.com/supportonly/${q}/helpdesk_bios/`;
  if (/gigabyte|aorus/i.test(board)) return `https://www.gigabyte.com/fr/Search?kw=${q}`;
  if (/asrock/i.test(board)) return `https://www.asrock.com/mb/${/ryzen|amd/i.test(cpu) ? 'AMD' : 'Intel'}/${b.replace(/\s+/g, ' ')}/index.asp#BIOS`.replace(/ /g, '%20');
  return b ? `https://www.google.com/search?q=${encodeURIComponent(`${b} BIOS download site officiel`)}` : null;
}
