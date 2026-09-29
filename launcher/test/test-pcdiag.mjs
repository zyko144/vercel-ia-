import assert from 'node:assert/strict';
import { analyze, batteryLife, diskLife, parseDiag, parseProcesses } from '../src/core/pcdiag.js';
import { scores, tier } from '../src/core/bench.js';

const now = Date.parse('2026-09-26T12:00:00Z');
const raw = {
  cpu: { Name: 'AMD Ryzen 5 5600X 6-Core Processor  ', NumberOfCores: 6, NumberOfLogicalProcessors: 12, MaxClockSpeed: 3701 },
  gpu: [{ Name: 'NVIDIA GeForce RTX 3060', AdapterRAM: 4293918720, DriverVersion: '32.0.15.6094', DriverDate: '/Date(1700000000000)/', CurrentHorizontalResolution: 1920, CurrentVerticalResolution: 1080, CurrentRefreshRate: 60 }, { Name: 'Parsec Virtual Display Adapter' }],
  ram: [{ Capacity: 8589934592, Speed: 3200, ConfiguredClockSpeed: 2133, SMBIOSMemoryType: 26 }],
  os: { Caption: 'Microsoft Windows 11 Famille', BuildNumber: '26100', LastBootUpTime: `/Date(${now - 9 * 86_400_000})/` },
  disks: [{ DeviceId: 0, FriendlyName: 'Samsung SSD 980', MediaType: 4, BusType: 17, Size: 1e12, HealthStatus: 0 }, { DeviceId: 1, FriendlyName: 'ST2000DM008', MediaType: 3, BusType: 11, Size: 2e12, HealthStatus: 0 }],
  rel: [{ DeviceId: 0, Wear: 10, Temperature: 41, PowerOnHours: 4000 }, { DeviceId: 1, PowerOnHours: 21900, ReadErrorsTotal: 0 }],
  sysdisk: 0, vols: [{ DriveLetter: 'C', Size: 1e12, SizeRemaining: 5e10 }],
  battDesign: { DesignedCapacity: 50000 }, battFull: { FullChargedCapacity: 34000 }, battCycles: { CycleCount: 420 },
  power: 'GUID du mode de gestion de l’alimentation : 381b4222-f694-41f0-9685-ff5bb260df2e  (Utilisation normale)',
  gameMode: 0, hags: 1, av: { AntivirusEnabled: true, RealTimeProtectionEnabled: true, AntivirusSignatureAge: 12, QuickScanAge: 2, FullScanAge: 90 },
  threats: [{ ThreatID: 42, Resources: ['file:_C:\\Users\\x\\Downloads\\crack.exe'], ActionSuccess: false }],
  thermal: [{ CurrentTemperature: 3332 }],
};
const d = parseDiag(raw, now);
assert.equal(d.cpu.name, 'AMD Ryzen 5 5600X 6-Core Processor');
assert.equal(d.cpu.temp, 60);
assert.equal(d.gpus.length, 1, 'adaptateur virtuel ignoré');
assert.equal(d.disks[0].bus, 'NVMe');
assert.equal(d.disks[0].system, true);
assert.equal(d.os.uptimeDays, 9);
assert.equal(d.power, 'other');

// Durée de vie : SSD 10 % usé en 4000 h → 90 % restants, 36 000 h au même rythme ≈ 12 ans à 8 h/jour
const ssd = diskLife(d.disks[0]);
assert.equal(ssd.pct, 90);
assert.match(ssd.text, /plus de 10 ans/);
const hdd = diskLife(d.disks[1]);
assert.equal(hdd.pct, 50, '21 900 h sur ≈ 43 800 h');
assert.equal(diskLife({ media: 'SSD' }).pct, null);
assert.equal(batteryLife(d.battery).pct, 68);

const a = analyze(d, { now });
const titles = a.advice.map((x) => x.title);
assert.ok(titles.some((t) => /2e barrette/.test(t)), 'simple canal');
assert.ok(titles.some((t) => /XMP/.test(t)), 'mémoire sous sa fréquence');
assert.ok(titles.some((t) => /16 Go/.test(t)), '8 Go');
assert.ok(titles.some((t) => /Libérer de la place sur C/.test(t)));
assert.ok(titles.some((t) => /menace/.test(t)));
assert.ok(titles.some((t) => /Mode Jeu/.test(t)));
assert.ok(titles.some((t) => /Redémarrer/.test(t)));
assert.equal(a.advice[0].prio, 0, 'le plus urgent en premier (menace)');
assert.ok(a.score < 60);
assert.ok(a.components.some((c) => c.key === 'bat' && c.status === 'warn'));

const procs = parseProcesses([{ id: 1, name: 'x', path: 'C:\\Users\\a\\AppData\\Local\\Temp\\x.exe', ram: 1e8, cpu: 12, signed: false }, { id: 2, name: 'chrome', path: 'C:\\Program Files\\Google\\chrome.exe', ram: 5e8, cpu: 3, signed: true, signer: 'Google LLC' }]);
assert.equal(procs[0].suspect, true);
assert.equal(procs[1].suspect, false);

const sc = scores({ cpu: { single: 1500, multi: 7000 }, ram: { gbps: 12 }, disk: { write: 1500, read: 2000, iops: 20000 }, gpu: { fps: 120 } });
assert.equal(sc.total, 1000, 'PC de référence = 1000');
assert.equal(tier(sc.total), 'Bon PC de jeu');
console.log('✅ Diagnostic du PC et benchmark : 29 vérifications');

{
  // Plus de conseil HAGS (fait bugger FiveM), boutons « Corriger » sur ce qui se règle sans risque
  const t = analyze(d, { now }).advice;
  assert.ok(!t.some((x) => /planification GPU/i.test(x.title)), 'HAGS jamais conseillée');
  assert.equal(t.find((x) => /Mode Jeu/.test(x.title))?.fix, 'gamemode');
  assert.equal(t.find((x) => /Définitions de virus/.test(x.title))?.fix, 'sigs');
  assert.equal(t.find((x) => /barrette/.test(x.title))?.fix, null, 'matériel : pas de bouton');
  // Autre antivirus actif, ou âge 65535 (« inconnu ») : pas de fausse alerte
  const off = parseDiag({ ...raw, av: { AntivirusEnabled: false, RealTimeProtectionEnabled: false, AntivirusSignatureAge: 65535 } }, now);
  assert.ok(!analyze(off, { now }).advice.some((x) => /Définitions/.test(x.title)), '65535 jours ignoré');
  assert.ok(analyze(off, { now }).advice.some((x) => /antivirus désactivée/.test(x.title)), 'sans autre antivirus : alerte');
  const other = parseDiag({ ...raw, av: { AntivirusEnabled: false, RealTimeProtectionEnabled: false, AntivirusSignatureAge: 65535 }, avOther: ['Avast Antivirus'] }, now);
  assert.ok(!analyze(other, { now }).advice.some((x) => /antivirus/.test(x.title)), 'Avast actif : pas d’alerte');
  console.log('✅ Conseils fiables (antivirus, pas de HAGS) et boutons « Corriger »');
}
