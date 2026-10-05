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
