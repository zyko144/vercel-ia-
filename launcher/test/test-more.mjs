// 0.54 : logique pure de la bibliothèque, de Mon PC et des vérifications
import assert from 'node:assert/strict';
import { addTempDay, dustDue, fpsAround, hwYear, logVersion, parseArgs, parseChecks, psuAdvice, resaleValue, screenAdvice, toReinstall } from '../src/core/more.js';

assert.deepEqual(parseArgs('-novid -high "C:\\Jeux\\a b"\n-x'), ['-novid', '-high', 'C:\\Jeux\\a b', '-x']);
assert.equal(hwYear('Intel(R) Core(TM) i5-12400F'), 2021); assert.equal(hwYear('AMD Ryzen 7 7800X3D 8-Core Processor'), 2022);
assert.equal(hwYear('NVIDIA GeForce RTX 3060'), 2020); assert.equal(hwYear('AMD Radeon RX 6600'), 2020); assert.equal(hwYear('GTX 1060'), 2016);
const v = resaleValue({ cpu: 'Ryzen 5 5600', gpu: 'RTX 3060', ramGb: 16, diskGb: 1000, now: 2026 });
assert.ok(v.low > 150 && v.high < 900 && v.low < v.high, JSON.stringify(v));
assert.equal(screenAdvice('NVIDIA GeForce RTX 4070').res, '1440p'); assert.equal(screenAdvice('GTX 1650').res, '1080p');
assert.ok(psuAdvice('RTX 4070', 'Ryzen 7 7800X3D').watts >= 500);
const c = parseChecks({
  video: [{ Name: 'NVIDIA GeForce RTX 4070', CurrentRefreshRate: 60, MaxRefreshRate: 165 }],
  mem: [{ DeviceLocator: 'DIMM_A2' }], secure: 0, tpm: 'TPM Version: 2.0', pnp: [], pcie: '8, 16', bios: '20210510000000.000000+000',
}, { ram: [{ speed: 3200, configured: 2133 }] });
const lv = Object.fromEntries(c.map((x) => [x.id, x.level]));
assert.equal(lv.hz, 'warn'); assert.equal(lv.dual, 'warn'); assert.equal(lv.xmp, 'warn'); assert.equal(lv.secureboot, 'warn'); assert.equal(lv.tpm, 'ok'); assert.equal(lv.pcie, 'warn'); assert.equal(lv.drivers, 'ok'); assert.equal(lv.bios, 'warn');
const ig = parseChecks({ video: [{ Name: 'Intel(R) UHD Graphics 770', CurrentRefreshRate: 60, MaxRefreshRate: 60 }, { Name: 'NVIDIA GeForce RTX 3060' }] });
assert.equal(ig.find((x) => x.id === 'igpu').level, 'warn');
const two = parseChecks({ mem: [{ DeviceLocator: 'DIMM_A1' }, { DeviceLocator: 'DIMM_A2' }] });
assert.equal(two.find((x) => x.id === 'dual').level, 'warn');
let days = {}; for (let i = 0; i < 20; i++) days = addTempDay(days, { cpuT: i < 10 ? 60 : 75 }, Date.UTC(2026, 9, 1 + i));
assert.equal(Object.keys(days).length, 20); assert.equal(dustDue(days, Date.now()), 'hot');
assert.equal(logVersion(logVersion([], '1.0', 1), '1.0', 2).length, 1);
const f = fpsAround([{ avg: 100, driver: 'a' }, { avg: 104, driver: 'a' }, { avg: 120, driver: 'b' }], 'driver');
assert.equal(f.before, 102); assert.equal(f.after, 120); assert.equal(f.delta, 18);
assert.deepEqual(toReinstall([{ id: 'x' }, { id: 'y' }], [{ id: 'x', installed: true }, { id: 'y', installed: false }]).map((r) => r.id), ['y']);
console.log('✅ 0.54 : arguments, âge et revente, écran, alimentation, vérifications, températures, versions, FPS pilote, réinstallation');
{
  const x = parseChecks({ vols: [{ DriveLetter: 'C', SizeRemaining: 12e9, Size: 500e9 }, { DriveLetter: 'D', SizeRemaining: 400e9, Size: 1000e9 }], batFull: 30000, batDesign: 50000, bsod: ['0x00000116', '0x00000116'] });
  assert.equal(x.filter((c) => c.id.startsWith('disk')).length, 1);
  assert.equal(x.find((c) => c.id === 'battery').level, 'warn');
  assert.ok(x.find((c) => c.id === 'bsod0x116').title.includes('VIDEO_TDR_FAILURE'));
  assert.equal(x.filter((c) => c.id.startsWith('bsod')).length, 1);
}
console.log('more 0.54 ok');
{
  const { filterSort } = await import('../src/core/sort.js');
  const { merge } = await import('../src/core/library.js');
  assert.deepEqual(filterSort([{ id: 'a', name: 'A', kind: 'game', installed: true, minutes: 0, lastPlayed: 0 }, { id: 'b', name: 'B', kind: 'game', installed: true, minutes: 5, lastPlayed: 1 }], { installed: 'jamais' }).map((i) => i.id), ['a']);
  const m = merge([{ id: 'x', name: 'GTA V', kind: 'game', source: 'epic', installed: true }, { id: 'y', name: 'Grand Theft Auto V', kind: 'game', source: 'custom', installed: false }], { items: { x: { mergeWith: 'Grand Theft Auto V' } } });
  assert.equal(m.length, 1); assert.equal(m[0].alsoOn.length, 1);
  console.log('jamais lancés + fusion ok');
}
{
  const { monthReport } = await import('../src/core/more.js');
  const r = monthReport({ days: { '2026-09-03': { jeux: 120, items: { a: 120 } }, '2026-10-01': { jeux: 60 } }, items: [{ id: 'a', name: 'Fortnite', kind: 'game' }], tempDays: { '2026-09-03': { cpu: 81 } } }, Date.UTC(2026, 9, 2));
  assert.deepEqual([r.month, r.hours, r.top.name, r.cpuMax], ['2026-09', 2, 'Fortnite', 81]);
  console.log('rapport du mois ok');
}
{
  const { brandOf } = await import('../src/core/more.js');
  assert.equal(brandOf('NVIDIA GeForce RTX 4070').name, 'NVIDIA'); assert.equal(brandOf('AMD Ryzen 7 7800X3D').name, 'AMD'); assert.equal(brandOf('13th Gen Intel(R) Core(TM) i5-13600K').name, 'Intel');
  assert.equal(brandOf('04CD', 'F5-6000J3038F16G').name, 'G.SKILL'); assert.equal(brandOf('', 'CMK32GX5M2B5600C36').name, 'CORSAIR'); assert.equal(brandOf('Micro-Star International Co., Ltd. MAG B650 TOMAHAWK WIFI (MS-7D75)').name, 'MSI');
  assert.equal(brandOf('Samsung SSD 980 PRO 1TB').name, 'SAMSUNG'); assert.equal(brandOf('ROG STRIX B550-F').name, 'ROG'); assert.equal(brandOf('Unknown'), null);
  console.log('marques ok');
}
{
  const { pcParts } = await import('../src/core/more.js');
  const GB = 1073741824;
  const p = pcParts({ cpu: { name: 'AMD Ryzen 7 7800X3D 8-Core Processor', cores: 8, threads: 16 }, gpus: [{ name: 'AMD Radeon(TM) Graphics' }, { name: 'NVIDIA GeForce RTX 4070', vram: 12 * GB }], ram: [{ size: 16 * GB, type: 'DDR5', speed: 6000, configured: 4800, maker: 'G Skill Intl', part: 'F5-6000J3038F16G' }, { size: 16 * GB, type: 'DDR5' }], disks: [{ id: '0', name: 'Samsung SSD 980 PRO 1TB', media: 'SSD', bus: 'NVMe', size: 1e12 }, { id: '1', name: 'ST2000DM008', media: 'HDD', bus: 'SATA', size: 2e12 }], board: 'Micro-Star International Co., Ltd. MAG B650 TOMAHAWK WIFI (MS-7D75)' });
  const by = Object.fromEntries(p.map((x) => [x.key, x]));
  assert.deepEqual([by.cpu.art, by.gpu.art, by.ram.art, by.disk0.art, by.disk1.art], ['cpu-am5', 'gpu-rtx', 'ram-ddr5', 'disk-nvme', 'disk-hdd']);
  assert.equal(by.gpu.brand.name, 'NVIDIA'); assert.equal(by.ram.brand.name, 'G.SKILL'); assert.equal(by.ram.name, '32 Go DDR5'); assert.match(by.ram.specs[1], /prévue pour 6000/); assert.equal(by.board.name.startsWith('MSI'), true);
  const l = pcParts({ cpu: { name: 'AMD Ryzen 5 5600H' }, gpus: [{ name: 'AMD Radeon RX 6500M' }], ram: [{ size: 8 * GB, type: 'DDR4' }], battery: { full: 40000, design: 50000 } });
  assert.deepEqual(l.map((x) => x.art), ['cpu-am4', 'gpu-radeon', 'ram-sodimm', 'battery']);
  assert.equal(pcParts({ cpu: { name: 'Intel(R) Core(TM) i5-12400F' }, gpus: [{ name: 'NVIDIA GeForce GTX 1660 SUPER' }] })[1].art, 'gpu-gtx');
  console.log('composants un par un ok');
}
