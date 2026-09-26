// Diagnostic complet du PC : inventaire réel (Windows : CIM/WMI, Storage, Defender), santé et durée de vie estimée
// des composants qui s'usent (SSD, disque dur, batterie), points faibles et conseils d'amélioration chiffrés.
// Tout vient de Windows ; quand une donnée n'est pas lisible (souvent sans droits administrateur), on le dit.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const DIAG_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$o = [ordered]@{}
$o.cpu = @(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,CurrentClockSpeed,LoadPercentage)
$o.gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,DriverDate,CurrentHorizontalResolution,CurrentVerticalResolution,CurrentRefreshRate)
$o.ram = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity,Speed,ConfiguredClockSpeed,Manufacturer,PartNumber,SMBIOSMemoryType)
$o.board = @(Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer,Product)
$o.os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,LastBootUpTime
$o.disks = @(Get-PhysicalDisk | Select-Object DeviceId,FriendlyName,MediaType,BusType,Size,HealthStatus)
$o.rel = @(Get-PhysicalDisk | Get-StorageReliabilityCounter | Select-Object DeviceId,Wear,Temperature,TemperatureMax,PowerOnHours,ReadErrorsTotal,WriteErrorsTotal)
$o.sysdisk = (Get-Partition -DriveLetter $env:SystemDrive[0] | Select-Object -First 1).DiskNumber
$o.vols = @(Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,Size,SizeRemaining)
$o.battDesign = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData | Select-Object DesignedCapacity)
$o.battFull = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargedCapacity | Select-Object FullChargedCapacity)
$o.battCycles = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryCycleCount | Select-Object CycleCount)
$o.power = (powercfg /getactivescheme) -join ' '
$o.gameMode = (Get-ItemProperty HKCU:\Software\Microsoft\GameBar -Name AutoGameModeEnabled).AutoGameModeEnabled
$o.hags = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' -Name HwSchMode).HwSchMode
$o.av = Get-MpComputerStatus | Select-Object AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureAge,QuickScanAge,FullScanAge
$o.threats = @(Get-MpThreatDetection | Select-Object ThreatID,InitialDetectionTime,Resources,ActionSuccess -First 20)
$o.thermal = @(Get-CimInstance -Namespace root\wmi MSAcpi_ThermalZoneTemperature | Select-Object CurrentTemperature)
$o | ConvertTo-Json -Depth 5 -Compress
`;

const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const psDate = (v) => { const m = String(v ?? '').match(/\/Date\((\d+)/); return m ? Number(m[1]) : Date.parse(v) || null; };
const HIGH_PERF = ['8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', 'e9a42b02-d5df-448d-aa00-03f14749eb61'];

/** Remet en forme la sortie brute de PowerShell. */
export function parseDiag(raw, now = Date.now()) {
  const j = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw ?? {};
  const cpu = arr(j.cpu)[0] ?? {};
  const rel = arr(j.rel);
  const disks = arr(j.disks).map((d) => {
    const r = rel.find((x) => String(x.DeviceId) === String(d.DeviceId)) ?? {};
    const media = { 3: 'HDD', 4: 'SSD', 0: null }[d.MediaType] ?? (typeof d.MediaType === 'string' ? d.MediaType : null);
    return {
      id: String(d.DeviceId), name: String(d.FriendlyName ?? 'Disque').trim(), media: media === 'Unspecified' ? null : media,
      bus: { 17: 'NVMe', 11: 'SATA', 7: 'USB', 8: 'RAID' }[d.BusType] ?? (typeof d.BusType === 'string' ? d.BusType : null),
      size: num(d.Size), health: { 0: 'Healthy', 1: 'Warning', 2: 'Unhealthy' }[d.HealthStatus] ?? d.HealthStatus ?? null,
      wear: num(r.Wear), temp: num(r.Temperature), tempMax: num(r.TemperatureMax), hours: num(r.PowerOnHours),
      readErrors: num(r.ReadErrorsTotal), writeErrors: num(r.WriteErrorsTotal), system: String(d.DeviceId) === String(j.sysdisk),
    };
  });
  const design = num(arr(j.battDesign)[0]?.DesignedCapacity);
  const full = num(arr(j.battFull)[0]?.FullChargedCapacity);
  const thermal = arr(j.thermal).map((t) => num(t.CurrentTemperature)).filter((t) => t > 2732).map((t) => Math.round(t / 10 - 273.15));
  const boot = psDate(j.os?.LastBootUpTime);
  return {
    cpu: { name: String(cpu.Name ?? '').replace(/\s+/g, ' ').trim(), cores: num(cpu.NumberOfCores), threads: num(cpu.NumberOfLogicalProcessors), maxMhz: num(cpu.MaxClockSpeed), load: num(cpu.LoadPercentage), temp: thermal.length ? Math.max(...thermal) : null },
    gpus: arr(j.gpu).filter((g) => !/basic|virtual|parsec|remote|meta/i.test(g.Name ?? '')).map((g) => ({
      name: String(g.Name ?? ''), vram: num(g.AdapterRAM), driver: String(g.DriverVersion ?? ''), driverDate: psDate(g.DriverDate),
      width: num(g.CurrentHorizontalResolution), height: num(g.CurrentVerticalResolution), hz: num(g.CurrentRefreshRate),
    })),
    ram: arr(j.ram).map((m) => ({ size: num(m.Capacity), speed: num(m.Speed), configured: num(m.ConfiguredClockSpeed), maker: String(m.Manufacturer ?? '').trim(), part: String(m.PartNumber ?? '').trim(), type: { 26: 'DDR4', 34: 'DDR5', 24: 'DDR3' }[m.SMBIOSMemoryType] ?? null })),
    board: arr(j.board)[0] ? `${arr(j.board)[0].Manufacturer ?? ''} ${arr(j.board)[0].Product ?? ''}`.trim() : null,
    os: { name: String(j.os?.Caption ?? '').trim(), build: String(j.os?.BuildNumber ?? ''), uptimeDays: boot ? Math.floor((now - boot) / 86_400_000) : null },
    disks,
    volumes: arr(j.vols).map((v) => ({ letter: String(v.DriveLetter), size: num(v.Size), free: num(v.SizeRemaining) })).filter((v) => v.size > 0),
    battery: design && full ? { design, full, cycles: num(arr(j.battCycles)[0]?.CycleCount) } : null,
    power: HIGH_PERF.some((g) => String(j.power ?? '').toLowerCase().includes(g)) ? 'high' : String(j.power ?? '') ? 'other' : null,
    gameMode: j.gameMode == null ? null : Number(j.gameMode) !== 0,
    hags: j.hags == null ? null : Number(j.hags) === 2,
    av: j.av ? { on: Boolean(j.av.AntivirusEnabled), realtime: Boolean(j.av.RealTimeProtectionEnabled), sigAge: num(j.av.AntivirusSignatureAge), quickAge: num(j.av.QuickScanAge), fullAge: num(j.av.FullScanAge) } : null,
    threats: arr(j.threats).map((t) => ({ id: String(t.ThreatID), at: psDate(t.InitialDetectionTime), files: arr(t.Resources).map(String).slice(0, 5), removed: Boolean(t.ActionSuccess) })),
  };
}

const GB = 1024 ** 3;
const years = (h, perDay) => Math.max(0, h / (perDay * 365));
const fmtYears = (y) => (y >= 10 ? 'plus de 10 ans' : y >= 1 ? `≈ ${Math.round(y * 2) / 2} an${y >= 1.5 ? 's' : ''}`.replace('.', ',') : y > 0.08 ? `≈ ${Math.round(y * 12)} mois` : 'à remplacer bientôt');

/** Durée de vie estimée d'un disque, à partir de son usure réelle (SSD) ou de ses heures de fonctionnement (HDD). */
export function diskLife(d, hoursPerDay = 8) {
  if (d.media === 'SSD' || d.bus === 'NVMe') {
    if (d.wear == null) return { pct: null, text: 'Usure non lisible (lance le launcher en administrateur pour la voir)' };
    const left = Math.max(0, 100 - d.wear);
    // Rythme d'usure réel : % consommés par heure d'allumage → heures restantes au même rythme
    const rate = d.hours > 200 && d.wear > 0 ? d.wear / d.hours : null;
    const y = rate ? years(left / rate, hoursPerDay) : null;
    return { pct: left, years: y, text: `${left} % de durée de vie restante${y != null ? ` · ${fmtYears(y)} au rythme actuel` : d.wear === 0 ? ' · usure encore nulle' : ''}` };
  }
  if (d.media === 'HDD') {
    if (d.hours == null) return { pct: null, text: 'Heures de fonctionnement non lisibles' };
    const TYPICAL = 43_800; // ≈ 5 ans allumé en continu : durée de service courante d'un disque dur
    const left = Math.max(0, Math.round(100 * (1 - d.hours / TYPICAL)));
    return { pct: left, years: years(Math.max(0, TYPICAL - d.hours), hoursPerDay), text: `${d.hours.toLocaleString('fr-FR')} h de fonctionnement · ${fmtYears(years(Math.max(0, TYPICAL - d.hours), hoursPerDay))} estimés` };
  }
  return { pct: null, text: 'Type de disque inconnu' };
}

/** Santé de la batterie (portables) : capacité actuelle / capacité d'origine, cycles. */
export function batteryLife(b) {
  if (!b) return null;
  const pct = Math.min(100, Math.round((100 * b.full) / b.design));
  const cyclesLeft = b.cycles != null ? Math.max(0, 800 - b.cycles) : null;
  return { pct, text: `${pct} % de sa capacité d’origine${b.cycles != null ? ` · ${b.cycles} cycles (≈ ${cyclesLeft} restants avant l’usure normale)` : ''}` };
}

/** Composants, points faibles et conseils, triés du plus utile au moins utile. */
export function analyze(d, { snap = null, drivers = null, now = Date.now() } = {}) {
  const comps = [];
  const advice = [];
  const add = (prio, title, text, gain = '') => advice.push({ prio, title, text, gain });
  const ramTotal = d.ram.reduce((n, m) => n + (m.size ?? 0), 0);
  const ramGb = Math.round(ramTotal / GB);

  // Processeur
  const cpuTemp = snap?.cpu?.temp ?? d.cpu.temp;
  comps.push({ key: 'cpu', icon: '🧠', title: 'Processeur', name: d.cpu.name || 'Processeur', specs: [`${d.cpu.cores ?? '?'} cœurs / ${d.cpu.threads ?? '?'} threads`, d.cpu.maxMhz ? `${(d.cpu.maxMhz / 1000).toFixed(2).replace('.', ',')} GHz` : null, cpuTemp != null ? `${cpuTemp} °C` : 'Température : Windows ne la donne qu’en administrateur'].filter(Boolean), status: cpuTemp >= 90 ? 'bad' : cpuTemp >= 80 ? 'warn' : 'ok', life: { pct: null, text: 'Un processeur ne s’use pas en usage normal (la chaleur est le seul vrai danger).' } });
  if (cpuTemp >= 85) add(1, 'Processeur trop chaud', `${cpuTemp} °C : nettoie la poussière, vérifie le ventilateur, change la pâte thermique si le PC a plus de 3 ans.`, 'évite les baisses de fréquence (jusqu’à −30 % de performances)');
  if (d.cpu.cores != null && d.cpu.cores < 6) add(3, 'Processeur un peu juste pour les jeux récents', `${d.cpu.cores} cœurs : les jeux de 2024-2026 en utilisent 6 à 8. C’est la prochaine pièce à changer après la mémoire et le disque.`);

  // Carte graphique
  for (const g of d.gpus) {
    const gs = snap?.gpu && g.name.includes(snap.gpu.name?.split(' ').slice(-2).join(' ') ?? '§') ? snap.gpu : null;
    const vram = gs?.vramTotal ? gs.vramTotal * 1024 * 1024 : g.vram && g.vram > 0 ? g.vram : null;
    const drvAge = g.driverDate ? Math.floor((now - g.driverDate) / 86_400_000) : null;
    comps.push({ key: 'gpu', icon: '🎮', title: 'Carte graphique', name: g.name, specs: [vram ? `${Math.round(vram / GB)} Go de mémoire vidéo` : null, g.width ? `${g.width}×${g.height} à ${g.hz ?? '?'} Hz` : null, gs?.temp != null ? `${gs.temp} °C` : null, drvAge != null ? `pilote de ${drvAge} jours` : null].filter(Boolean), status: (gs?.temp ?? 0) >= 85 ? 'bad' : drvAge > 180 ? 'warn' : 'ok', life: { pct: null, text: 'Pas d’usure mesurable ; surveille surtout la température (au-delà de 85 °C).' } });
    if (drvAge > 120) add(2, 'Pilote graphique ancien', `Ton pilote a ${Math.round(drvAge / 30)} mois : les jeux récents gagnent souvent des FPS avec le dernier.`, 'souvent +5 à +15 % sur les jeux récents');
    if (vram && vram < 6 * GB && !/intel|uhd|iris|radeon\(tm\) graphics|vega/i.test(g.name)) add(3, 'Mémoire vidéo limitée', `${Math.round(vram / GB)} Go : baisse la qualité des textures dans les jeux récents pour éviter les saccades.`);
    if (g.hz === 60) add(4, 'Écran à 60 Hz', 'Si ton écran monte à 144 Hz ou plus : Paramètres Windows › Affichage › Paramètres d’affichage avancés › Taux de rafraîchissement.', 'image bien plus fluide si l’écran le permet');
  }
  if (!d.gpus.some((g) => !/intel|uhd|iris/i.test(g.name))) add(3, 'Pas de carte graphique dédiée', 'Le processeur graphique intégré limite fortement les jeux 3D. Une carte dédiée d’entrée de gamme multiplie les FPS.');

  // Mémoire
  const sticks = d.ram.length;
  const speed = Math.max(0, ...d.ram.map((m) => m.speed ?? 0));
  const conf = Math.max(0, ...d.ram.map((m) => m.configured ?? 0));
  comps.push({ key: 'ram', icon: '🧩', title: 'Mémoire vive', name: `${ramGb} Go ${d.ram[0]?.type ?? ''}`.trim(), specs: [`${sticks} barrette${sticks > 1 ? 's' : ''}${sticks === 1 ? ' (simple canal)' : ' (double canal)'}`, conf ? `${conf} MHz${speed > conf ? ` (prévue pour ${speed})` : ''}` : null, snap?.ram ? `${Math.round((100 * snap.ram.used) / snap.ram.total)} % utilisée` : null].filter(Boolean), status: ramGb < 8 ? 'bad' : ramGb < 16 || sticks === 1 ? 'warn' : 'ok', life: { pct: null, text: 'La mémoire ne s’use pas.' } });
  if (ramGb && ramGb < 16) add(1, `Passer à ${ramGb < 12 ? 16 : 32} Go de mémoire`, `${ramGb} Go, c’est le principal point faible : les jeux récents et Discord ouvert en même temps en demandent 16.`, 'moins de saccades, chargements plus rapides');
  if (sticks === 1) add(1, 'Ajouter une 2e barrette identique (double canal)', 'Une seule barrette = moitié de la bande passante : ajoute la même pour passer en double canal.', 'souvent +10 à +25 % de FPS dans les jeux limités par le processeur');
  if (speed && conf && conf < speed - 100) add(1, 'Activer le profil XMP / EXPO dans le BIOS', `Ta mémoire tourne à ${conf} MHz au lieu des ${speed} MHz prévus. Active XMP (Intel) ou EXPO (AMD) dans le BIOS.`, 'gain gratuit : +5 à +15 % de FPS');

  // Disques
  for (const disk of d.disks) {
    const life = diskLife(disk);
    const bad = disk.health === 'Unhealthy' || (disk.readErrors ?? 0) > 0 || (life.pct != null && life.pct < 10);
    const warn = disk.health === 'Warning' || (life.pct != null && life.pct < 30) || (disk.temp ?? 0) >= 60;
    comps.push({ key: `disk${disk.id}`, icon: disk.media === 'HDD' ? '💿' : '💾', title: disk.system ? 'Disque système' : 'Disque', name: disk.name, specs: [[disk.bus, disk.media].filter(Boolean).join(' ') || null, disk.size ? `${Math.round(disk.size / 1e9)} Go` : null, disk.temp != null ? `${disk.temp} °C` : null, disk.hours != null ? `${disk.hours.toLocaleString('fr-FR')} h allumé` : null, disk.health ? `état Windows : ${{ Healthy: 'bon', Warning: 'à surveiller', Unhealthy: 'mauvais' }[disk.health] ?? disk.health}` : null].filter(Boolean), status: bad ? 'bad' : warn ? 'warn' : 'ok', life });
    if (bad) add(0, `Sauvegarde ton disque « ${disk.name} » maintenant`, 'Windows signale un problème (erreurs de lecture ou usure presque totale). Copie tes fichiers importants et prévois son remplacement.', 'évite de perdre tes données');
    if (disk.system && disk.media === 'HDD') add(1, 'Mettre Windows sur un SSD', 'Ton système est sur un disque dur : un SSD (même SATA, ~40 €) rend le démarrage et les chargements 5 à 10 fois plus rapides.', 'démarrage en ~15 s au lieu d’une minute');
  }
  for (const v of d.volumes) {
    const pct = (100 * v.free) / v.size;
    if (pct < 12) add(1, `Libérer de la place sur ${v.letter}:`, `Il reste ${Math.round(v.free / 1e9)} Go (${Math.round(pct)} %) : sous 10-15 %, Windows et les jeux ralentissent. Lance l’optimisation ou désinstalle un jeu.`, 'évite les ralentissements et les mises à jour bloquées');
  }

  // Batterie
  const bl = batteryLife(d.battery);
  if (bl) {
    comps.push({ key: 'bat', icon: '🔋', title: 'Batterie', name: 'Batterie', specs: [`${Math.round(d.battery.full / 1000)} / ${Math.round(d.battery.design / 1000)} Wh`, d.battery.cycles != null ? `${d.battery.cycles} cycles` : null].filter(Boolean), status: bl.pct < 60 ? 'bad' : bl.pct < 80 ? 'warn' : 'ok', life: bl });
    if (bl.pct < 70) add(2, 'Batterie usée', `${bl.pct} % de sa capacité d’origine : l’autonomie a fondu. Une batterie neuve la rend comme au premier jour.`);
  }

  // Windows et jeux
  if (d.power && d.power !== 'high') add(2, 'Mode d’alimentation « Performances élevées »', 'Windows économise l’énergie au détriment des FPS. Le Boost de jeu (plus haut) le bascule pendant tes parties.', 'fréquences maximales pendant les jeux');
  if (d.gameMode === false) add(2, 'Activer le Mode Jeu de Windows', 'Paramètres › Jeux › Mode Jeu : Windows donne la priorité au jeu et bloque les mises à jour pendant la partie.');
  if (d.hags === false) add(3, 'Activer la planification GPU accélérée', 'Paramètres › Affichage › Graphiques : moins de latence avec les cartes récentes (NVIDIA 10xx+, AMD 5000+).', 'un peu moins de latence');
  if (d.os.uptimeDays >= 7) add(3, 'Redémarrer le PC', `Allumé depuis ${d.os.uptimeDays} jours sans redémarrage : un redémarrage vide la mémoire et applique les mises à jour.`);

  // Sécurité
  if (d.av) {
    if (!d.av.on || !d.av.realtime) add(0, 'Protection antivirus désactivée', 'La protection en temps réel de Windows est coupée : réactive-la (Sécurité Windows) ou installe un autre antivirus.');
    if (d.av.sigAge > 7) add(1, 'Définitions de virus anciennes', `Dernière mise à jour il y a ${d.av.sigAge} jours : lance une mise à jour de Sécurité Windows.`);
  }
  const active = d.threats.filter((t) => !t.removed);
  if (active.length) add(0, `${active.length} menace${active.length > 1 ? 's' : ''} détectée${active.length > 1 ? 's' : ''}`, 'Windows a trouvé des fichiers dangereux pas encore supprimés : utilise « Supprimer les menaces » dans la section Sécurité.');

  advice.sort((a, b) => a.prio - b.prio);
  // Score : 100 − pénalités des points faibles
  const penalty = advice.reduce((n, a) => n + [25, 10, 5, 3, 1][a.prio], 0);
  return { components: comps, advice, score: Math.max(0, Math.min(100, 100 - penalty)), ramGb };
}

export async function pcDiagnostic() {
  if (process.platform !== 'win32') return null;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', DIAG_PS], { windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  return parseDiag(r.stdout);
}

// ---------- Processus : ce qui consomme, et ce qui est louche ----------
export const PROC_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$a = Get-Process | Where-Object { $_.Path } | Select-Object Id,ProcessName,Path,WorkingSet64,CPU
Start-Sleep -Milliseconds 1500
$b = Get-Process | Where-Object { $_.Path } | Select-Object Id,CPU
$out = foreach ($p in $a) { $q = $b | Where-Object Id -eq $p.Id; if ($q) { [pscustomobject]@{ id=$p.Id; name=$p.ProcessName; path=$p.Path; ram=$p.WorkingSet64; cpu=[math]::Round((($q.CPU - $p.CPU) / 1.5) * 100 / $cores, 1) } } }
$top = $out | Sort-Object -Property @{Expression={$_.cpu * 50000000 + $_.ram}; Descending=$true} | Select-Object -First 25
$sig = foreach ($p in $top) { $s = Get-AuthenticodeSignature -LiteralPath $p.path; $p | Add-Member -NotePropertyName signed -NotePropertyValue ($s.Status -eq 'Valid') -PassThru | Add-Member -NotePropertyName signer -NotePropertyValue ($s.SignerCertificate.Subject -replace '^CN=([^,]+).*','$1') -PassThru }
@($sig) | ConvertTo-Json -Compress
`;
const SUSPECT_DIRS = /\\(appdata\\local\\temp|temp|downloads|t[ée]l[ée]chargements|public|programdata)\\/i;
/** Processus les plus gourmands ; « louche » = non signé ET lancé depuis un dossier temporaire / téléchargements. */
export function parseProcesses(raw) {
  const list = arr(typeof raw === 'string' ? JSON.parse(raw || '[]') : raw);
  return list.map((p) => ({ id: num(p.id), name: String(p.name ?? ''), path: String(p.path ?? ''), ram: num(p.ram) ?? 0, cpu: num(p.cpu) ?? 0, signed: Boolean(p.signed), signer: String(p.signer ?? '') || null }))
    .map((p) => ({ ...p, suspect: !p.signed && SUSPECT_DIRS.test(p.path) }));
}
export async function processes() {
  if (process.platform !== 'win32') return [];
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PROC_PS], { windowsHide: true, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  return parseProcesses(r.stdout);
}

// ---------- Antivirus de Windows (Microsoft Defender) : analyse et suppression ----------
const MPCMD = () => `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\Windows Defender\\MpCmdRun.exe`;
/** type : 'quick' (quelques minutes) ou 'full' (tout le PC, souvent 30 min à plus d'une heure). */
export async function defenderScan(type = 'quick') {
  const r = await run(MPCMD(), ['-Scan', '-ScanType', type === 'full' ? '2' : '1'], { windowsHide: true, timeout: 3 * 3_600_000 }).catch((err) => ({ stdout: String(err.stdout ?? ''), code: err.code }));
  return { found: /found \d+ threats|threat/i.test(r.stdout) && !/found no threats/i.test(r.stdout), text: String(r.stdout ?? '').trim().split(/\r?\n/).slice(-6).join('\n') };
}
/** Met à jour les définitions puis supprime les menaces trouvées (Windows demande l'autorisation administrateur). */
export async function defenderRemove() {
  await run(MPCMD(), ['-SignatureUpdate'], { windowsHide: true, timeout: 180_000 }).catch(() => null);
  const direct = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Remove-MpThreat'], { windowsHide: true, timeout: 300_000 }).then(() => true).catch(() => false);
  if (direct) return { ok: true };
  // Sans droits : même commande en administrateur (fenêtre d'autorisation de Windows)
  const elevated = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '-NoProfile','-Command','Remove-MpThreat'"], { windowsHide: true, timeout: 300_000 }).then(() => true).catch(() => false);
  return { ok: elevated, needAdmin: !elevated };
}
