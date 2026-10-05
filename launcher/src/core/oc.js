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
// Jeux où le processeur limite souvent les FPS (compétitif, monde ouvert peuplé) : là, pousser le CPU rapporte vraiment
const CPU_BOUND = /fortnite|valorant|cs ?2|counter|fivem|gta|rust|warzone|call of duty|apex|minecraft|league|overwatch|rainbow|r6|rocket|tarkov|pubg|dota|wow|warcraft|cities|anno|total war|arma|dayz/i;
/**
 * Plan Opti Pro propre à CHAQUE demande, d'après le vrai PC, les jeux et le besoin.
 * auto = le launcher le fait en 1 clic ; optin = seulement si le joueur le veut vraiment (avertissement avant).
 */
export function personalPlan(s = {}) {
  const p = s.plan ?? ocPlan(s), a = s.advice ?? ocAdvice(p, s), txt = `${s.games ?? ''} ${s.need ?? ''}`;
  const cpuBound = CPU_BOUND.test(txt) || /\b(1[4-9]\d|2[0-9]\d|3[0-6]\d)\s*hz|compétiti|fps (min|stable)|max(imum)? de fps/i.test(txt);
  const hot = Number(s.cpuTempMax) >= 85 || Number(s.gpuTempMax) >= 83;
  const out = [];
  const add = (id, icon, label, why, extra = {}) => out.push({ id, icon, label, why, ...extra });
  if (hot) add('refroidissement', '🌡', 'Refroidissement d’abord', `Ton PC chauffe déjà (${s.cpuTempMax ?? '?'} °C processeur, ${s.gpuTempMax ?? '?'} °C carte graphique) : dépoussiérage, courbe des ventilateurs, pâte thermique. Sinon il baisse sa fréquence tout seul.`, { prio: 1 });
  if (/lent|bug|plant|crash|écran bleu|vieux|virus|ram(e|é)|freeze/i.test(txt)) add('format', '🧹', 'Formatage propre conseillé', 'Tu parles de lenteurs ou de plantages : repartir d’un Windows propre règle souvent plus que n’importe quel réglage.', { prio: 2 });
  add('windows', '⚡', 'Windows optimisé pour le jeu', 'Mode Jeu, priorité aux jeux, debloat, confidentialité, nettoyage et réglages de tes jeux. Réversible, avec point de restauration.', { auto: 'optimiser', prio: 3 });
  if (!s.laptop) add('alimentation', '🔋', 'Plan d’alimentation Performances optimales', 'Le processeur reste à sa fréquence max, sans temps de réveil.', { auto: 'alimentation', prio: 4 });
  else add('portable', '💻', 'Mode performances du portable', 'Branché sur secteur + mode performances du fabricant (Armoury Crate, Vantage, Omen…) : souvent +20 % sur portable.', { prio: 4 });
  if (p.ramSticks && !p.ramLimited) add('xmp', '🧩', `${/ryzen|amd/i.test(s.cpu) ? 'EXPO' : 'XMP'} : RAM à ${p.ramRated} MHz au lieu de ${p.ramNow}`, 'Un seul réglage dans le BIOS, souvent +5 à 15 % de FPS minimum.', { prio: 5 });
  if (p.ramSticks === 1) add('dual', '🧩', 'Passer en double canal', 'Une seule barrette : en ajouter une 2e identique donne souvent +10 à 20 % de FPS min dans les jeux qui chargent le processeur.', { prio: 6, buy: true });
  if (a.cpu === 'recommandé' && cpuBound) add('cpu_oc', '🔥', 'Overclocking du processeur', `${a.why} Tes jeux sont limités par le processeur : gain attendu 5 à 10 % de FPS. Risques : chaleur, stabilité, garantie. Seulement si tu le veux vraiment.`, { prio: 7, optin: true });
  else if (p.cpuOc !== 'non' || /ryzen/i.test(s.cpu)) add('cpu_bios', '🧠', /ryzen/i.test(s.cpu) ? 'PBO + Curve Optimizer' : 'Boost du processeur via le BIOS', `${a.why}${a.cpu === 'recommandé' && !cpuBound ? ' Tes jeux sont surtout limités par la carte graphique : un overclocking ne rapporterait presque rien, on garde des réglages sûrs.' : ''}`, { prio: 7 });
  else add('cpu_bios', '🧠', 'Boost du processeur tenu au maximum', a.why, { prio: 7 });
  add('gpu', '🟩', 'Dernier pilote + réglages de la carte graphique', 'Pilote propre, mode faible latence, limite de FPS calée sur ton écran.', { auto: 'pilote_gpu', prio: 8 });
  if (/ping|lag|latence|réseau|wifi|wi-fi|connexion/i.test(txt)) add('reseau', '🌐', 'Connexion et ping', 'Câble Ethernet plutôt que Wi-Fi, QoS de la box, serveurs les plus proches.', { prio: 9 });
  if (/stream|obs|twitch|enregistr|clip/i.test(txt)) add('stream', '🎥', 'Réglages stream / enregistrement', 'Encodeur de la carte graphique (NVENC / AMF), débit adapté : le jeu garde ses FPS.', { prio: 9 });
  add('mesure', '🏁', 'Mesure avant / après', 'On compare tes FPS et tes températures à la fin, pour valider chaque réglage.', { auto: 'mesure', prio: 10 });
  return out.sort((x, y) => x.prio - y.prio);
}

/** Simulateur « où cliquer » : chemin des menus du BIOS par marque (repères à vérifier pour le modèle exact). */
export const BIOS_PATHS = {
  msi: { name: 'MSI Click BIOS', enter: 'Suppr', adv: 'F7', tabs: ['Settings', 'OC', 'M-Flash', 'OC Profile', 'Hardware Monitor'], tasks: {
    xmp: ['OC', 'DRAM Setting', 'A-XMP / EXPO', 'Profil 1'], update: ['M-Flash', 'Oui (redémarrer)', 'Fichier sur la clé USB'], pbo: ['OC', 'Advanced CPU Configuration', 'AMD Overclocking', 'Precision Boost Overdrive'],
    tpm: ['Settings', 'Security', 'Trusted Computing', 'AMD fTPM / Intel PTT'], secure: ['Settings', 'Security', 'Secure Boot', 'Enabled'] } },
  asus: { name: 'ASUS UEFI', enter: 'Suppr ou F2', adv: 'F7', tabs: ['Main', 'Ai Tweaker', 'Advanced', 'Boot', 'Tool'], tasks: {
    xmp: ['Ai Tweaker', 'Ai Overclock Tuner', 'XMP I / EXPO I'], update: ['Tool', 'ASUS EZ Flash 3 Utility', 'Fichier sur la clé USB'], pbo: ['Ai Tweaker', 'Precision Boost Overdrive', 'Enabled'],
    tpm: ['Advanced', 'AMD fTPM / PCH-FW Configuration', 'Firmware TPM / PTT'], secure: ['Boot', 'Secure Boot', 'OS Type : Windows UEFI'] } },
  gigabyte: { name: 'GIGABYTE / AORUS', enter: 'Suppr', adv: 'F2', tabs: ['Tweaker', 'Settings', 'System Info', 'Boot', 'Save & Exit'], tasks: {
    xmp: ['Tweaker', 'Extreme Memory Profile (X.M.P.)', 'Profile 1'], update: ['Q-Flash (F8)', 'Update BIOS', 'Fichier sur la clé USB'], pbo: ['Tweaker', 'Advanced CPU Settings', 'Precision Boost Overdrive'],
    tpm: ['Settings', 'Miscellaneous', 'AMD CPU fTPM / Intel PTT'], secure: ['Boot', 'Secure Boot', 'Enabled'] } },
  asrock: { name: 'ASRock UEFI', enter: 'Suppr ou F2', adv: 'F6', tabs: ['Main', 'OC Tweaker', 'Advanced', 'Tool', 'Security', 'Boot'], tasks: {
    xmp: ['OC Tweaker', 'DRAM Configuration', 'Load XMP / EXPO Setting'], update: ['Tool', 'Instant Flash', 'Fichier sur la clé USB'], pbo: ['OC Tweaker', 'CPU Configuration', 'Precision Boost Overdrive'],
    tpm: ['Security', 'AMD fTPM switch / Intel PTT'], secure: ['Security', 'Secure Boot', 'Enabled'] } },
};
export const BIOS_TASKS = { xmp: 'Activer XMP / EXPO', update: 'Mettre à jour le BIOS', pbo: 'PBO (AMD)', tpm: 'TPM (Windows 11)', secure: 'Secure Boot' };
export function biosBrand(board = '') {
  const b = String(board).toLowerCase();
  return /\bmsi\b|mag |mpg |meg |pro [abhxz]\d/.test(b) ? 'msi' : /asus|rog|tuf|prime|strix/.test(b) ? 'asus' : /gigabyte|aorus|gaming x\b/.test(b) ? 'gigabyte' : /asrock|steel legend|phantom|taichi/.test(b) ? 'asrock' : null;
}
