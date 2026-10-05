// 0.54 : petites logiques pures (testées sur Linux) pour la bibliothèque, Mon PC et les vérifications.
import { cpuScore, matchGpu, psuFor } from './upgrade.js';

/** Options de lancement écrites par le joueur (« -novid -high "C:\a b" ») → liste d'arguments, sans retour à la ligne. */
export function parseArgs(text) {
  const s = String(text ?? '').replace(/[\r\n]/g, ' ').slice(0, 300);
  return (s.match(/"[^"]*"|\S+/g) ?? []).map((a) => a.replace(/^"|"$/g, '')).filter(Boolean).slice(0, 20);
}

/** Année de sortie approximative d'un processeur ou d'une carte graphique, d'après son nom. */
export function hwYear(name) {
  const n = String(name ?? '');
  let m;
  if ((m = n.match(/Core\(TM\)\s*i\d[- ](\d{4,5})|\bi[3579][- ](\d{4,5})/i))) { const num = m[1] ?? m[2]; const gen = num.length === 5 ? Number(num.slice(0, 2)) : Number(num[0]); return { 2: 2011, 3: 2012, 4: 2013, 5: 2015, 6: 2015, 7: 2017, 8: 2017, 9: 2018, 10: 2020, 11: 2021, 12: 2021, 13: 2022, 14: 2023 }[gen] ?? null; }
  if (/Core\s*Ultra\s*\d\s*2\d\d/i.test(n)) return 2024;
  if (/Core\s*Ultra/i.test(n)) return 2023;
  if ((m = n.match(/Ryzen\s*\d\s*(\d)\d{3}/i))) return { 1: 2017, 2: 2018, 3: 2019, 4: 2020, 5: 2020, 7: 2022, 8: 2024, 9: 2024 }[m[1]] ?? null;
  if ((m = n.match(/RTX\s*(\d{2})\d{2}/i))) return { 20: 2018, 30: 2020, 40: 2022, 50: 2025 }[m[1]] ?? null;
  if ((m = n.match(/GTX\s*(\d{2})\d{2}/i))) return { 9: 2014, 10: 2016, 16: 2019 }[m[1]] ?? null;
  if ((m = n.match(/GTX\s*9\d0/i))) return 2014;
  if ((m = n.match(/RX\s*(\d)\d{2,3}/i))) return { 4: 2016, 5: 2019, 6: 2020, 7: 2022, 9: 2025 }[m[1]] ?? null;
  if (/Arc\s*B/i.test(n)) return 2024;
  if (/Arc\s*A/i.test(n)) return 2022;
  return null;
}

// Prix d'occasion moyens constatés en France (€, 2026), carte graphique par carte graphique
const USED_GPU = { 'GTX 1050 Ti': 50, 'GTX 1650': 70, 'GTX 1060': 60, 'RX 580': 50, 'GTX 1660': 90, 'GTX 1660 Super': 100, 'RTX 3050': 130, 'RTX 2060': 120, 'RX 6600': 140, 'RTX 2070': 150, 'RTX 2070 Super': 170, 'RTX 3060': 180,
  'RX 7600': 180, 'RTX 4060': 220, 'Arc B580': 200, 'RX 6650 XT': 170, 'RTX 3060 Ti': 210, 'RTX 5060': 250, 'RTX 4060 Ti': 280, 'RTX 3070': 240, 'RX 6700 XT': 230, 'RTX 3080': 330, 'RX 7700 XT': 300, 'RTX 4070': 430,
  'RX 7800 XT': 380, 'RTX 4070 Super': 480, 'RTX 5070': 470, 'RX 9070': 520, 'RTX 4070 Ti Super': 600, 'RX 9070 XT': 580, 'RTX 5070 Ti': 680, 'RTX 4080 Super': 800, 'RX 7900 XTX': 700, 'RTX 5080': 950, 'RTX 4090': 1400, 'RTX 5090': 2100 };
const USED_CPU = [[/9800x3d/, 400], [/7800x3d/, 290], [/9950x3d|9950x/, 450], [/7950x3d|7950x/, 380], [/9900x|7900x3d/, 300], [/7900x|7900\b/, 230], [/9700x/, 230], [/7700x|7700\b/, 190], [/9600x/, 170], [/7600x|7600\b/, 140], [/5800x3d/, 220], [/5700x3d/, 160], [/5950x/, 220], [/5900x/, 170], [/5800x/, 130], [/5700x/, 110], [/5600x|5600\b/, 80], [/5500/, 60], [/3600/, 50],
  [/ultra 9 285k/, 480], [/ultra 7 265k/, 280], [/ultra 5 245k/, 200], [/i9-14900k/, 400], [/i9-13900k/, 330], [/i7-14700k/, 300], [/i7-13700k/, 250], [/i5-14600k/, 200], [/i5-13600k/, 170], [/i5-14400/, 140], [/i5-13400/, 120], [/i5-12600k/, 130], [/i5-12400/, 90], [/i7-12700k/, 180], [/i9-12900k/, 230], [/i3-1[234]100/, 60], [/i7-10700|i7-9700|i9-9900/, 120], [/i5-10400|i5-9400|i5-11400/, 60]];
const USED_BOARD = [[/x870|x670/, 170], [/b850|b650/, 100], [/a620/, 60], [/z890|z790/, 140], [/b860|b760/, 85], [/z690/, 110], [/h610|h770|h670/, 55], [/x570/, 90], [/b550/, 65], [/a520|b450|b350/, 40], [/z590|z490/, 70], [/b560|b460|h510|h410/, 40]];
/** Valeur de revente d'occasion, composant par composant (le vrai modèle de TON PC) : fourchette ±12 %. */
export function resaleValue({ cpu = '', gpu = '', ram = [], disks = [], board = '', laptop = false } = {}) {
  const GB = 1073741824, parts = [];
  const g = matchGpu(gpu);
  if (gpu) parts.push([gpu.replace(/^(NVIDIA|AMD|Intel\(R\))\s*/i, ''), g ? USED_GPU[g.name] ?? Math.round(g.score * 2.2) : 40, 'Carte graphique']);
  const c = String(cpu).toLowerCase();
  if (cpu) parts.push([cpu.replace(/\s*\d+-Core Processor|\(R\)|\(TM\)|\s+CPU\s*@.*$/gi, '').replace(/\s+/g, ' ').trim(), USED_CPU.find(([re]) => re.test(c))?.[1] ?? Math.round((cpuScore(cpu) ?? 70) * 0.9), 'Processeur']);
  const gb = Math.round(ram.reduce((n, m) => n + (m.size ?? 0), 0) / GB), type = ram[0]?.type ?? 'DDR4';
  if (gb) parts.push([`${gb} Go ${type}`, Math.round(gb * ({ DDR5: 3, DDR4: 1.6, DDR3: 0.6 }[type] ?? 1.6)), 'Mémoire vive']);
  for (const d of disks.filter((x) => x.size && x.bus !== 'USB')) { const tb = d.size / 1e12; parts.push([d.name, Math.max(15, Math.round(tb * (d.media === 'HDD' ? 12 : d.bus === 'NVMe' ? 45 : 35))), d.media === 'HDD' ? 'Disque dur' : 'SSD']); }
  if (laptop) parts.push(['Écran, clavier, batterie et châssis du portable', 150, 'Portable']);
  else { if (board) parts.push([board, USED_BOARD.find(([re]) => re.test(board.toLowerCase()))?.[1] ?? 70, 'Carte mère']); parts.push(['Alimentation, boîtier et ventirad', 120, 'Le reste (estimé)']); }
  const total = parts.reduce((n, [, v]) => n + v, 0);
  return { parts: parts.map(([name, price, type]) => ({ name, price, type })), total, low: Math.round((total * 0.88) / 10) * 10, high: Math.round((total * 1.12) / 10) * 10 };
}

/** Écran conseillé pour une carte graphique (résolution et fréquence qu'elle tient vraiment en jeu). */
export function screenAdvice(gpu) {
  const s = matchGpu(gpu)?.score ?? null;
  if (s == null) return null;
  if (s < 80) return { res: '1080p', hz: '75 à 144 Hz', why: 'Ta carte graphique tient bien le 1080p ; au-delà de 144 Hz elle ne suivra pas dans les jeux récents.' };
  if (s < 140) return { res: '1080p', hz: '144 à 165 Hz', why: 'Le 1080p rapide est l’idéal : en 1440p les jeux récents descendraient sous 60 FPS.' };
  if (s < 220) return { res: '1440p', hz: '144 à 165 Hz', why: 'Ta carte graphique est faite pour le 1440p rapide : plus net qu’en 1080p, toujours fluide.' };
  return { res: '1440p 240 Hz ou 4K', hz: '144 à 240 Hz', why: 'Carte haut de gamme : 1440p très rapide pour la compétition, ou 4K pour la beauté.' };
}

/** Alimentation conseillée pour ce PC (aucun capteur ne lit la puissance de l'alimentation : c'est un calcul). */
export function psuAdvice(gpu, cpu) {
  const g = matchGpu(gpu);
  const cpuW = /X3D|K\b|KF\b|Ryzen 9|i9/i.test(cpu) ? 125 : 90;
  return { watts: psuFor(g?.watts ?? 180, cpuW), gpuW: g?.watts ?? null };
}

/** Vérifications de Mon PC à partir de la lecture Windows (CHECKS_PS). Chaque point : ok (vert), warn (orange), info. */
export function parseChecks(j = {}, diag = {}) {
  const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  const out = [];
  const add = (id, level, title, detail, fix = null) => out.push({ id, level, title, detail, fix });
  const video = arr(j.video);
  const isIgpu = (v) => /intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/i.test(`${v.Name}`) && !/arc/i.test(`${v.Name}`);
  const driving = video.filter((v) => v.CurrentRefreshRate);
  for (const v of driving) {
    const cur = Number(v.CurrentRefreshRate), max = Number(v.MaxRefreshRate);
    if (max > cur + 5) add('hz', 'warn', `Écran à ${cur} Hz au lieu de ${max} Hz`, `${v.Name} peut afficher ${max} images par seconde mais Windows est réglé sur ${cur} Hz. Paramètres › Affichage › Affichage avancé › Fréquence d’actualisation.`, 'display');
    else if (cur) add('hz', 'ok', `Écran à ${cur} Hz`, 'Windows utilise la fréquence la plus haute de ton écran.');
  }
  const dgpu = video.find((v) => !isIgpu(v) && /nvidia|radeon|arc/i.test(`${v.Name}`));
  if (dgpu && !dgpu.CurrentRefreshRate && driving.some(isIgpu)) add('igpu', 'warn', 'Écran branché sur la carte mère', `Ton écran est relié à la puce graphique du processeur, pas à ta ${dgpu.Name}. Branche le câble sur la carte graphique (sortie plus basse, à l’horizontale) : souvent 2 à 5 fois plus de FPS.`);
  else if (dgpu) add('igpu', 'ok', 'Écran branché sur la carte graphique', `${dgpu.Name} affiche bien l’image.`);
  const pcie = String(j.pcie ?? '').split(',').map((x) => Number(String(x).trim()));
  if (pcie.length >= 2 && pcie[0] && pcie[1]) {
    if (pcie[0] < pcie[1]) add('pcie', 'warn', `Carte graphique en PCIe x${pcie[0]} au lieu de x${pcie[1]}`, 'Elle est peut-être dans le mauvais emplacement ou mal enfoncée : le port du haut (le plus proche du processeur) est en général le bon.');
    else add('pcie', 'ok', `Carte graphique en PCIe x${pcie[0]}`, 'Elle utilise toutes ses lignes PCIe.');
  }
  const mem = arr(j.mem), sticks = mem.length;
  const rated = Math.max(0, ...arr(diag.ram).map((m) => m.speed ?? 0)), now = Math.min(...arr(diag.ram).map((m) => m.configured || m.speed || Infinity));
  if (sticks === 1) add('dual', 'warn', 'Une seule barrette de RAM (simple canal)', 'Ajouter une 2e barrette identique double la bande passante : souvent +10 à 20 % de FPS minimum.');
  else if (sticks >= 2) {
    const chan = (m) => (String(m.DeviceLocator ?? m.BankLabel ?? '').match(/(?:DIMM|CHANNEL|Chan)\s*_?([A-D])/i)?.[1] ?? '').toUpperCase();
    const ch = new Set(mem.map(chan).filter(Boolean));
    if (ch.size === 1) add('dual', 'warn', 'Barrettes sur le même canal', `Tes ${sticks} barrettes sont sur le canal ${[...ch][0]} : mets-les dans les emplacements conseillés par le manuel (souvent A2 et B2) pour passer en double canal.`);
    else add('dual', 'ok', `${sticks} barrettes en double canal`, 'La mémoire travaille sur deux canaux.');
  }
  if (rated && now !== Infinity && now + 100 < rated) add('xmp', 'warn', `RAM à ${now} MHz au lieu de ${rated} MHz`, 'Le profil XMP / EXPO n’est pas activé dans le BIOS : un seul réglage, souvent +5 à 15 % de FPS minimum. Le ticket Opti Pro te guide.');
  else if (rated) add('xmp', 'ok', `RAM à sa vitesse (${now} MHz)`, 'XMP / EXPO est bien activé.');
  const secure = j.secure == null ? null : Number(j.secure) === 1;
  if (secure != null) add('secureboot', secure ? 'ok' : 'warn', secure ? 'Secure Boot activé' : 'Secure Boot désactivé', secure ? 'Démarrage protégé, demandé par Valorant, Battlefield 6, Call of Duty…' : 'Certains anti-triche (Valorant, BF6, Call of Duty) le demandent : à activer dans le BIOS (menu Boot / Security).');
  const tpm = String(j.tpm ?? '');
  const tpmVer = tpm.match(/2\.0/) ? '2.0' : /1\.2/.test(tpm) ? '1.2' : null;
  if (tpm) add('tpm', tpmVer === '2.0' ? 'ok' : 'warn', tpmVer ? `TPM ${tpmVer}` : 'TPM non trouvé', tpmVer === '2.0' ? 'Puce de sécurité active (Windows 11, anti-triche).' : 'Active fTPM (AMD) ou PTT (Intel) dans le BIOS : demandé par Windows 11 et certains anti-triche.');
  const pnp = arr(j.pnp).filter((p) => p.Name);
  if (pnp.length) add('drivers', 'warn', `${pnp.length} périphérique${pnp.length > 1 ? 's' : ''} sans pilote correct`, pnp.slice(0, 5).map((p) => p.Name).join(', '), 'devmgmt');
  else if (j.pnp !== undefined) add('drivers', 'ok', 'Tous les pilotes sont installés', 'Aucun point jaune dans le Gestionnaire de périphériques.');
  const biosDate = String(j.bios ?? '').match(/(\d{4})(\d{2})(\d{2})|(\d{4})-(\d{2})-(\d{2})/);
  if (biosDate) {
    const y = Number(biosDate[1] ?? biosDate[4]);
    if (new Date().getFullYear() - y >= 2) add('bios', 'warn', `BIOS de ${y}`, 'Une mise à jour apporte souvent stabilité et compatibilité (mémoire, processeurs récents). Le ticket Opti Pro donne le lien officiel de ta carte mère.');
    else add('bios', 'ok', `BIOS récent (${y})`, 'Rien à faire.');
  }
  for (const v of arr(j.vols).filter((x) => x.Size > 50e9)) {
    const free = Number(v.SizeRemaining) || 0, gb = Math.round(free / 1e9);
    if (free < 30e9 || free / v.Size < 0.08) add(`disk${v.DriveLetter}`, 'warn', `Disque ${v.DriveLetter}: presque plein (${gb} Go libres)`, 'Les grosses mises à jour de jeux (souvent 20 à 60 Go) risquent d’échouer. Optimisation › Nettoyage libère de la place.', 'clean');
  }
  if (j.batFull && j.batDesign) {
    const wear = Math.round(100 - (100 * j.batFull) / j.batDesign);
    add('battery', wear >= 30 ? 'warn' : 'ok', `Batterie usée à ${Math.max(0, wear)} %`, wear >= 30 ? 'Elle tient nettement moins qu’à l’achat : un remplacement redonne l’autonomie d’origine.' : 'Elle garde l’essentiel de sa capacité d’origine.');
  }
  const fans = arr(j.fans).filter((f) => f.Name);
  if (fans.length) add('fans', fans.some((f) => /error|degraded|pred fail/i.test(f.Status ?? '')) ? 'warn' : 'ok', `${fans.length} ventilateur${fans.length > 1 ? 's' : ''} lu${fans.length > 1 ? 's' : ''} par Windows`, fans.map((f) => `${f.Name} : ${f.Status ?? '?'}`).join(', '));
  for (const code of [...new Set(arr(j.bsod).map((c) => String(c).toLowerCase().replace(/^0x0*/, '0x')))].slice(0, 3)) {
    const why = BSOD[code];
    add(`bsod${code}`, 'warn', `Écran bleu ${code}${why ? ` : ${why[0]}` : ''}`, why ? why[1] : 'Code peu courant : le ticket Opti Pro ou le support peuvent l’analyser avec ton rapport PC.');
  }
  return out;
}

/** Écrans bleus les plus courants chez les joueurs : nom + piste concrète. */
export const BSOD = {
  '0x116': ['VIDEO_TDR_FAILURE', 'La carte graphique a cessé de répondre : pilote propre (DDU), overclock GPU retiré, température à vérifier.'],
  '0x117': ['VIDEO_TDR_TIMEOUT', 'La carte graphique a mis trop de temps à répondre : pilote propre, overclock retiré, alimentation suffisante ?'],
  '0x1a': ['MEMORY_MANAGEMENT', 'Souvent la RAM : désactive XMP pour tester, puis lance le test mémoire Windows.'],
  '0x50': ['PAGE_FAULT_IN_NONPAGED_AREA', 'RAM instable ou pilote défectueux : test mémoire, puis mise à jour des pilotes.'],
  '0x124': ['WHEA_UNCORRECTABLE_ERROR', 'Erreur matérielle : overclock / undervolt trop poussé, chauffe ou alimentation. Remets le BIOS par défaut.'],
  '0x9f': ['DRIVER_POWER_STATE_FAILURE', 'Un pilote gère mal la veille : mets à jour pilotes réseau / graphiques, désactive le démarrage rapide.'],
  '0xa': ['IRQL_NOT_LESS_OR_EQUAL', 'Pilote défectueux (souvent réseau ou graphique) ou RAM instable.'],
  '0xd1': ['DRIVER_IRQL_NOT_LESS_OR_EQUAL', 'Pilote défectueux, souvent réseau (Wi-Fi, Ethernet) : mets-le à jour depuis le site du fabricant.'],
  '0x3b': ['SYSTEM_SERVICE_EXCEPTION', 'Pilote ou fichier Windows abîmé : Optimisation › Réparer Windows, puis pilotes à jour.'],
  '0x7e': ['SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', 'Pilote incompatible : celui installé juste avant le premier écran bleu est le suspect.'],
  '0xef': ['CRITICAL_PROCESS_DIED', 'Un processus vital de Windows s’est arrêté : Réparer Windows (DISM + SFC).'],
  '0x133': ['DPC_WATCHDOG_VIOLATION', 'Souvent un pilote de stockage ou le firmware du SSD : mets à jour le firmware et le pilote chipset.'],
  '0x139': ['KERNEL_SECURITY_CHECK_FAILURE', 'Pilote ou RAM : test mémoire, pilotes à jour, Réparer Windows.'],
  '0x101': ['CLOCK_WATCHDOG_TIMEOUT', 'Processeur instable : overclock / undervolt retiré, BIOS à jour.'],
};

/** Températures : garde le maximum de chaque jour sur 30 jours. */
export function addTempDay(days = {}, t = {}, at = Date.now()) {
  const k = new Date(at).toISOString().slice(0, 10);
  const d = days[k] ?? {};
  if (t.cpuT != null) d.cpu = Math.max(d.cpu ?? 0, Math.round(t.cpuT));
  if (t.gpuT != null) d.gpu = Math.max(d.gpu ?? 0, Math.round(t.gpuT));
  const out = { ...days, [k]: d };
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)).slice(-30));
}

/** Rappel de dépoussiérage : tous les 6 mois, ou plus tôt si le processeur chauffe de 8 °C de plus qu'au début du mois. */
export function dustDue(days = {}, lastDust = 0, now = Date.now()) {
  const v = Object.values(days).map((d) => d.cpu).filter(Boolean);
  const avg = (a) => a.reduce((n, x) => n + x, 0) / a.length;
  const hotter = v.length >= 14 && avg(v.slice(-7)) - avg(v.slice(0, 7)) >= 8;
  return hotter ? 'hot' : now - (lastDust || now) > 182 * 86400000 ? 'time' : null;
}

/** Version d'un jeu : garde les 20 dernières (pour l'historique dans la fiche). */
export function logVersion(log = [], version, at = Date.now()) {
  if (!version || log.at(-1)?.v === version) return log;
  return [...log, { v: String(version).slice(0, 40), at }].slice(-20);
}

/** FPS moyens avant / après un changement (pilote graphique ou version de Windows) sur les parties enregistrées. */
export function fpsAround(records = [], key) {
  const withKey = records.filter((r) => r.avg && r[key]);
  if (withKey.length < 2) return null;
  const last = withKey.at(-1)[key];
  const after = withKey.filter((r) => r[key] === last), before = withKey.filter((r) => r[key] !== last);
  if (!before.length || !after.length) return null;
  const avg = (a) => Math.round(a.reduce((n, r) => n + r.avg, 0) / a.length);
  const prev = before.at(-1)[key];
  const b = avg(before.filter((r) => r[key] === prev).slice(-5)), a = avg(after.slice(-5));
  return { from: prev, to: last, before: b, after: a, delta: Math.round(((a - b) / b) * 100) };
}

/** Jeux à réinstaller : ceux de la dernière liste sauvegardée qui ne sont plus installés sur ce PC. */
export function toReinstall(saved = [], items = []) {
  const here = new Set(items.filter((i) => i.installed).map((i) => i.id));
  const known = new Map(items.map((i) => [i.id, i]));
  return saved.filter((s) => !here.has(s.id)).map((s) => ({ ...s, canInstall: Boolean(known.get(s.id)) }));
}

// ---------- Lectures et scripts Windows (texte fixe : rien ne vient de l'interface) ----------
export const CHECKS_PS = String.raw`
$ErrorActionPreference='SilentlyContinue'
$o=[ordered]@{}
$o.video=@(Get-CimInstance Win32_VideoController | Select-Object Name,CurrentRefreshRate,MaxRefreshRate,CurrentHorizontalResolution)
$o.pnp=@(Get-CimInstance Win32_PnPEntity -Filter 'ConfigManagerErrorCode<>0' | Select-Object Name,ConfigManagerErrorCode)
$o.secure=(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State').UEFISecureBootEnabled
$o.tpm=((& tpmtool getdeviceinformation) 2>$null) -join ' '
$o.mem=@(Get-CimInstance Win32_PhysicalMemory | Select-Object BankLabel,DeviceLocator)
$o.bios=[string](Get-CimInstance Win32_BIOS).ReleaseDate
$o.vols=@(Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' } | Select-Object DriveLetter,SizeRemaining,Size)
$o.fans=@(Get-CimInstance Win32_Fan | Select-Object Name,Status)
$o.bsod=@(Get-WinEvent -FilterHashtable @{LogName='System';Id=1001;StartTime=(Get-Date).AddDays(-60)} -MaxEvents 20 | Where-Object { $_.ProviderName -match 'WER-SystemErrorReporting|BugCheck' } | ForEach-Object { if($_.Message -match '0x[0-9a-fA-F]{8}'){ $matches[0] } })
$smi=Join-Path $env:SystemRoot 'System32\nvidia-smi.exe'; if(Test-Path $smi){ $o.pcie=(& $smi --query-gpu=pcie.link.width.current,pcie.link.width.max --format=csv,noheader) -join '' }
$o | ConvertTo-Json -Depth 4 -Compress`;
/** Garde seulement le dernier point de restauration (les autres prennent souvent plusieurs Go). */
export const RESTORE_CLEAN_PS = "$ErrorActionPreference='SilentlyContinue'; $n=0; while(@(Get-CimInstance Win32_ShadowCopy).Count -gt 1 -and $n -lt 60){ vssadmin delete shadows /for=$env:SystemDrive /oldest /quiet | Out-Null; $n++ }";
/** DNS de la carte réseau active : serveurs de la table (validés), ou retour au DNS automatique de la box. */
export const DNS_PAIRS = { Cloudflare: ['1.1.1.1', '1.0.0.1'], Google: ['8.8.8.8', '8.8.4.4'], Quad9: ['9.9.9.9', '149.112.112.112'], OpenDNS: ['208.67.222.222', '208.67.220.220'] };
export function dnsScript(name) {
  const pair = DNS_PAIRS[name];
  const target = pair ? `-ServerAddresses ('${pair[0]}','${pair[1]}')` : '-ResetServerAddresses';
  return `$ErrorActionPreference='SilentlyContinue'; Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex ${target} }; Clear-DnsClientCache`;
}

/** Rapport du mois précédent : heures de jeu, jeu le plus joué, score de santé, température max. */
export function monthReport({ days = {}, items = [], diagHistory = [], tempDays = {} } = {}, now = Date.now()) {
  const d = new Date(now); const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const byItem = {}; let games = 0;
  for (const [k, v] of Object.entries(days)) if (k.startsWith(prev)) { games += v.jeux ?? 0; for (const [id, m] of Object.entries(v.items ?? {})) byItem[id] = (byItem[id] ?? 0) + m; }
  const top = Object.entries(byItem).map(([id, m]) => [items.find((i) => i.id === id), m]).filter(([i]) => i?.kind === 'game').sort((a, b) => b[1] - a[1])[0];
  const scores = diagHistory.filter((x) => new Date(x.at).toISOString().startsWith(prev)).map((x) => x.score);
  const temps = Object.entries(tempDays).filter(([k]) => k.startsWith(prev)).map(([, v]) => v.cpu).filter(Boolean);
  return { month: prev, hours: Math.round(games / 60), top: top ? { name: top[0].name, hours: Math.round(top[1] / 60) } : null, score: scores.at(-1) ?? null, cpuMax: temps.length ? Math.max(...temps) : null };
}

// Marques des composants (vue éclatée de Mon PC) : nom écrit + couleur de la marque, d'après le nom ou la référence lue sur le PC
const BRANDS = [
  [/nvidia|geforce|\brtx\b|\bgtx\b/i, 'NVIDIA', '#76b900'], [/radeon|ryzen|\bamd\b|threadripper/i, 'AMD', '#ed1c24'], [/intel|core\(tm\)|core ultra|\bi[3579]-\d|\barc\b/i, 'Intel', '#0071c5'],
  [/\bmsi\b|micro-star|\bmag\b|\bmpg\b|\bmeg\b/i, 'MSI', '#e01e26'], [/\brog\b|strix/i, 'ROG', '#ff0029'], [/asus|\btuf\b|prime/i, 'ASUS', '#00a0e9'], [/aorus/i, 'AORUS', '#f28c28'], [/gigabyte/i, 'GIGABYTE', '#f28c28'], [/asrock/i, 'ASRock', '#00a0e9'],
  [/corsair|^cm[kwhtd]/i, 'CORSAIR', '#f3d63f'], [/g\.?\s?skill|^f[345]-/i, 'G.SKILL', '#e2231a'], [/kingston|fury|^kf\d|^khx/i, 'Kingston', '#c8102e'], [/crucial|^bl\d|^ct\d/i, 'Crucial', '#2f8bff'],
  [/team\s?group|^tf\d|^tl\d|t-force/i, 'TEAMGROUP', '#e4002b'], [/samsung|^m[34]\d{2}[ab]/i, 'SAMSUNG', '#3b6bff'], [/western digital|\bwdc?\b|wd_|wd (blue|black)/i, 'WD', '#2b9be0'], [/seagate|firecuda|barracuda/i, 'Seagate', '#6ebe49'],
  [/sk\s?hynix|^hma|^hmc/i, 'SK hynix', '#e4007f'], [/micron|^mt\d/i, 'Micron', '#4a90d9'], [/lexar/i, 'Lexar', '#0098d8'], [/sabrent/i, 'Sabrent', '#e94e1b'],
];
export function brandOf(...texts) {
  for (const t of texts.filter(Boolean)) for (const [re, name, color] of BRANDS) if (re.test(String(t).trim())) return { name, color };
  return null;
}

/** Composants à montrer un par un (Mon PC › Composants) : image 3D adaptée au vrai matériel + nom exact + marque + détails. */
export function pcParts(d = {}) {
  const GB = 1073741824, cpu = d.cpu?.name ?? '', ram = d.ram ?? [], laptop = Boolean(d.battery);
  const gpus = (d.gpus ?? []).filter((g) => g.name), dgpu = gpus.find((g) => /nvidia|geforce|rtx|gtx|\brx\s?\d|radeon rx|radeon pro|arc\s?[ab]\d/i.test(g.name)) ?? gpus[0];
  const out = [];
  const add = (key, type, art, name, specs, brand = brandOf(name)) => out.push({ key, type, art, name: name || type, brand, specs: specs.filter(Boolean) });
  const amd = /ryzen|athlon|amd/i.test(cpu);
  add('cpu', 'Processeur', amd ? (/ryzen\s*\d\s*(?:pro\s*)?[1-5]\d{3}/i.test(cpu) ? 'cpu-am4' : 'cpu-am5') : 'cpu-intel', cpu,
    [d.cpu?.cores && `${d.cpu.cores} cœurs · ${d.cpu.threads ?? '?'} threads`, d.cpu?.maxMhz && `${(d.cpu.maxMhz / 1000).toFixed(1).replace('.', ',')} GHz de base`, d.cpu?.temp && `${Math.round(d.cpu.temp)} °C maintenant`]);
  if (dgpu) {
    const n = dgpu.name, igpu = !/nvidia|geforce|rtx|gtx|\brx\s?\d|radeon rx|radeon pro|arc\s?[ab]\d/i.test(n);
    add('gpu', igpu ? 'Graphique intégré' : 'Carte graphique', igpu ? (amd ? 'cpu-am5' : 'cpu-intel') : /radeon|\brx\s?\d/i.test(n) ? 'gpu-radeon' : /arc/i.test(n) ? 'gpu-arc' : /gtx|\bgt\s?\d/i.test(n) ? 'gpu-gtx' : 'gpu-rtx', n,
      [dgpu.vram && `${Math.round(dgpu.vram / GB)} Go de mémoire vidéo`, dgpu.driver && `Pilote ${dgpu.driver}`, igpu && 'Intégrée au processeur']);
  }
  if (ram.length) {
    const gb = Math.round(ram.reduce((n, m) => n + (m.size ?? 0), 0) / GB), type = ram[0].type;
    add('ram', 'Mémoire vive', laptop ? 'ram-sodimm' : type === 'DDR5' ? 'ram-ddr5' : 'ram-ddr4', `${gb} Go ${type ?? ''}`.trim(),
      [`${ram.length} barrette${ram.length > 1 ? 's' : ''} de ${Math.round((ram[0].size ?? 0) / GB)} Go${ram.length === 1 ? ' (simple canal)' : ''}`, (ram[0].configured || ram[0].speed) && `${ram[0].configured || ram[0].speed} MHz${ram[0].speed > ram[0].configured + 100 ? ` (prévue pour ${ram[0].speed})` : ''}`, ram[0].part && `Réf. ${ram[0].part}`],
      brandOf(ram[0].maker, ram[0].part));
  }
  for (const k of (d.disks ?? []).filter((x) => x.bus !== 'USB').slice(0, 3)) {
    add(`disk${k.id}`, k.media === 'HDD' ? 'Disque dur' : 'SSD', k.media === 'HDD' ? 'disk-hdd' : k.bus === 'NVMe' ? 'disk-nvme' : 'disk-sata', k.name,
      [k.size && `${Math.round(k.size / 1e9)} Go${k.bus ? ` · ${k.bus}` : ''}`, k.wear != null && `Usure ${k.wear} %`, k.temp && `${k.temp} °C`, k.system && 'Disque de Windows']);
  }
  if (laptop) add('bat', 'Batterie', 'battery', 'Batterie du portable', [d.battery.full && d.battery.design && `${Math.round((100 * d.battery.full) / d.battery.design)} % de sa capacité d’origine`, d.battery.cycles != null && `${d.battery.cycles} cycles`], null);
  else {
    if (d.board) add('board', 'Carte mère', 'board', d.board.replace(/Micro-Star International Co\.,? Ltd\.?/i, 'MSI').replace(/ASUSTeK COMPUTER INC\.?/i, 'ASUS'), [d.bios?.version && `BIOS ${d.bios.version}`]);
    add('psu', 'Alimentation', 'psu', 'Alimentation', ['Non lisible par Windows : vérifie l’étiquette sur le côté', `Conseillée pour ton PC : ${psuAdvice(dgpu?.name ?? '', cpu).watts} W minimum`], null);
    add('cooler', 'Refroidissement', 'cooler', 'Ventirad / watercooling', [d.cpu?.temp && `Processeur à ${Math.round(d.cpu.temp)} °C`], null);
  }
  return out;
}

/** Statistiques avancées (Premium) : jour de la semaine préféré, heure de pointe, durée moyenne et record de session, tendance du mois. */
export function advancedStats(sessions = [], days = {}, items = [], now = Date.now()) {
  const games = sessions.filter((s) => s.end > s.start && items.find((i) => i.id === s.id)?.kind === 'game');
  const len = (s) => (s.end - s.start) / 60000;
  const byDay = Array(7).fill(0), byHour = Array(24).fill(0);
  for (const s of games) { byDay[(new Date(s.start).getDay() + 6) % 7] += len(s); byHour[new Date(s.start).getHours()] += len(s); }
  const best = games.reduce((b, s) => (len(s) > (b ? len(b) : 0) ? s : b), null);
  const sum = (from, to) => Object.entries(days).filter(([k]) => { const t = Date.parse(k); return t >= now - from && t < now - to; }).reduce((n, [, v]) => n + (v.jeux ?? 0), 0);
  const cur = sum(30 * 86400000, 0), prev = sum(60 * 86400000, 30 * 86400000);
  return {
    byDay: byDay.map(Math.round), topDay: byDay.indexOf(Math.max(...byDay)), topHour: byHour.indexOf(Math.max(...byHour)),
    avg: games.length ? Math.round(games.reduce((n, s) => n + len(s), 0) / games.length) : 0,
    longest: best ? { name: items.find((i) => i.id === best.id)?.name, minutes: Math.round(len(best)) } : null,
    trend: prev ? Math.round(((cur - prev) / prev) * 100) : null, month: Math.round(cur / 60),
  };
}

/** Ton année History (récap de fin d'année) : heures, jours joués, top 5 des jeux, meilleur jour. */
export function wrapped(days = {}, items = [], year = new Date().getFullYear()) {
  const list = Object.entries(days).filter(([k]) => k.startsWith(String(year)));
  const by = {};
  for (const [, d] of list) for (const [id, m] of Object.entries(d.items ?? {})) by[id] = (by[id] ?? 0) + m;
  const top = Object.entries(by).map(([id, m]) => ({ name: items.find((i) => i.id === id && i.kind === 'game')?.name, hours: Math.round(m / 60) })).filter((x) => x.name).sort((a, b) => b.hours - a.hours).slice(0, 5);
  const best = list.reduce((b, [k, d]) => ((d.jeux ?? 0) > (b?.[1] ?? 0) ? [k, d.jeux] : b), null);
  return { year, hours: Math.round(list.reduce((n, [, d]) => n + (d.jeux ?? 0), 0) / 60), days: list.filter(([, d]) => d.jeux > 0).length, top, best: best ? { day: best[0], hours: Math.round(best[1] / 6) / 10 } : null };
}
