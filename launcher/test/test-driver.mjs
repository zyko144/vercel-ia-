import assert from 'node:assert/strict';
import { oldDriver, parseDriverDate, parseDrivers } from '../src/core/monitor.js';

assert.equal(parseDriverDate('/Date(1700000000000)/'), 1700000000000);
assert.equal(parseDriverDate('20240115000000.000000-000'), Date.UTC(2024, 0, 15));
assert.equal(parseDriverDate('2024-01-15T00:00:00'), Date.parse('2024-01-15T00:00:00'));
assert.equal(parseDriverDate('n’importe quoi'), null);
const list = parseDrivers([
  { Name: 'Intel(R) UHD Graphics 770', DriverVersion: '31.0.101', DriverDate: '/Date(1600000000000)/' },
  { Name: 'NVIDIA GeForce RTX 4070', DriverVersion: '32.0.15.6094', DriverDate: '/Date(1700000000000)/' },
  { Name: 'Parsec Virtual Display Adapter', DriverVersion: '1', DriverDate: '/Date(1000)/' },
]);
assert.deepEqual(list.map((g) => g.vendor), ['intel', 'nvidia'], 'adaptateur virtuel ignoré');
const old = oldDriver(list, 1700000000000 + 200 * 86_400_000);
assert.equal(old.vendor, 'nvidia', 'la carte dédiée passe avant Intel');
assert.equal(old.age, 200);
assert.match(old.link, /^https:\/\/www\.nvidia\.com\//);
assert.equal(oldDriver(list, 1700000000000 + 30 * 86_400_000), null, 'pilote récent : rien');
assert.deepEqual(parseDrivers({ Name: 'AMD Radeon RX 7800 XT', DriverVersion: 'x', DriverDate: '20240101000000.000000-000' }).map((g) => g.vendor), ['amd']);
assert.deepEqual(parseDrivers(null), []);
console.log('✅ Pilote graphique (date, marque, alerte) : 11 vérifications');
