// Upgrade : compatibilité (socket, mémoire), marques, plafond processeur / écran, FPS mesurés ou estimés
import assert from 'node:assert/strict';
import { cpuOptions, gpuOptions, matchGpu, platformOf, ramOptions, simulate } from '../src/core/upgrade.js';

assert.equal(matchGpu('NVIDIA GeForce RTX 4070 SUPER').name, 'RTX 4070 Super');
assert.deepEqual(platformOf('AMD Ryzen 5 3600 6-Core Processor'), { socket: 'AM4', mem: 'DDR4' });
assert.equal(platformOf('13th Gen Intel(R) Core(TM) i5-13400F').socket, 'LGA1700');
const g = gpuOptions({ gpuName: 'GTX 1660 SUPER', cpuName: 'Ryzen 5 3600', width: 1920, hz: 144, budget: 600, brand: 'amd' });
assert.ok(g.options.length && g.options.every((o) => o.brand === 'amd' && o.price <= 600), 'seulement AMD, dans le budget');
assert.ok(!g.best.wasted, 'la carte conseillée n’est pas bridée par le processeur');
const c = cpuOptions({ cpuName: 'AMD Ryzen 5 3600', ramGb: 16, budget: 600 });
const x3d = c.options.find((o) => o.name === 'Ryzen 7 5700X3D');
assert.ok(x3d?.same && !x3d.board && !x3d.ram, 'AM4 → AM4 : même carte mère, même RAM');
const am5 = c.options.find((o) => o.socket === 'AM5');
assert.ok(am5.board && am5.ram && am5.total === am5.price + am5.board.price + am5.ram.price, 'AM5 : carte mère + DDR5 comptées');
assert.equal(ramOptions({ cpuName: 'Ryzen 7 7800X3D', ramGb: 16 }).type, 'DDR5');
const s = simulate({ games: [{ name: 'Rocket League', avg: 160, bound: 'cpu' }, { name: 'Fortnite' }, { name: 'Jeu inconnu' }], gpu: matchGpu('GTX 1660 Super'), newGpu: matchGpu('RTX 4070'), cpu: 90, newCpu: 90 });
assert.ok(s[0].measured && s[0].after - s[0].now < 20, 'jeu limité par le processeur : peu de gain');
assert.ok(!s[1].measured && s[1].after > s[1].now, 'Fortnite estimé');
assert.ok(s[2].unknown);
console.log('✅ Upgrade : compatibilité socket/mémoire, marques, plafond, FPS mesurés et estimés');
