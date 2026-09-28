import assert from 'node:assert/strict';
import { knownSteamId } from '../src/core/art.js';
import { crashCause, crashesFor, diskAlerts, loadVerdict, netAdvice, parseDiskHealth, parsePing } from '../src/core/gamecare.js';
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n += 1; };

// Plantages : bon jeu retrouvé, cause lisible
const ev = JSON.stringify([
  { id: 1000, at: 5, app: 'FiveM_GTAProcess.exe', module: 'citizen-scripting-core.dll', code: '0xc0000005', path: 'C:\\Users\\N\\AppData\\Local\\FiveM\\FiveM.app\\FiveM_GTAProcess.exe' },
  { id: 1000, at: 6, app: 'chrome.exe', module: 'ntdll.dll', code: '0xc0000005', path: 'C:\\Program Files\\Google\\Chrome\\chrome.exe' },
  { id: 1002, at: 7, app: 'RocketLeague.exe', module: '', code: '', path: 'D:\\Epic\\rocketleague\\Binaries\\Win64\\RocketLeague.exe' },
]);
const fv = crashesFor(ev, { dir: 'C:\\Users\\N\\AppData\\Local\\FiveM\\FiveM.app' });
ok(fv.length === 1 && /FiveM/.test(fv[0].cause), 'plantage FiveM repéré, cause FiveM');
ok(crashesFor(ev, { dir: 'D:\\Epic\\rocketleague' })[0].cause.includes('figé'), 'jeu figé (1002)');
ok(!crashesFor(ev, { dir: 'C:\\' }).length, 'dossier trop large : rien');
ok(/NVIDIA/.test(crashCause({ module: 'nvwgf2umx.dll' }).cause), 'pilote NVIDIA');
ok(/overlay/i.test(crashCause({ module: 'discord_hook64.dll' }).cause), 'overlay Discord');
ok(crashesFor('pas du json', {}).length === 0, 'journal illisible : pas d’erreur');

// Temps de démarrage
ok(!loadVerdict([{ ms: 20000 }], 60000).slow, 'pas assez d’historique');
ok(loadVerdict([{ ms: 20000 }, { ms: 22000 }, { ms: 21000 }], 60000).slow, 'démarrage bien plus lent que d’habitude');
ok(!loadVerdict([{ ms: 20000 }, { ms: 22000 }, { ms: 21000 }], 25000).slow, 'démarrage normal');

// Disques pleins
const now = Date.now();
const items = [{ id: 'a', kind: 'game', installed: true, size: 80e9, installDir: 'D:\\Jeux\\A', lastPlayed: now - 200 * 86_400_000, name: 'A' }, { id: 'b', kind: 'game', installed: true, size: 90e9, installDir: 'D:\\Jeux\\B', lastPlayed: now - 86_400_000, name: 'B' }];
const al = diskAlerts([{ drive: 'D:\\', free: 8e9, total: 1e12 }, { drive: 'C:\\', free: 300e9, total: 500e9 }], items, now);
ok(al.length === 1 && al[0].drive === 'D:' && al[0].idle.map((x) => x.id).join() === 'a', 'disque plein + jeux oubliés seulement');

// Santé des disques
const h = parseDiskHealth(JSON.stringify([{ name: 'Samsung 980', media: 'SSD', bus: 'NVMe', health: 'Healthy', wear: 92, temp: 45 }, { name: 'WD', media: 'HDD', bus: 'SATA', health: 'Healthy', wear: null, readErr: 3 }]));
ok(h[0].state === 'bad' && h[0].ssd, 'SSD en fin de vie');
ok(h[1].state === 'warn' && h[1].errors === 3, 'erreurs de lecture');

// Réseau
const p = parsePing('Réponse de 1.1.1.1 : octets=32 temps=12 ms TTL=58\nRéponse de 1.1.1.1 : octets=32 temps=40 ms TTL=58\nRéponse de 1.1.1.1 : octets=32 temps=14 ms TTL=58\nPaquets : envoyés = 4, reçus = 3, perdus = 1 (perte 25%)');
ok(p.avg === 22 && p.loss === 25 && p.jitter === 27, 'ping français lu');
ok(parsePing('Reply from 1.1.1.1: bytes=32 time=9ms TTL=58\nPackets: Sent = 1, Received = 1, Lost = 0').avg === 9, 'ping anglais lu');
ok(netAdvice({ ping: 12, jitter: 2, loss: 0, down: 300, up: 50, wifi: false }).grade === 'Excellente', 'connexion parfaite');
const bad = netAdvice({ ping: 95, jitter: 30, loss: 8, down: 10, wifi: true });
ok(bad.grade === 'Mauvaise' && bad.tips.some((t) => /câble/.test(t)), 'connexion mauvaise en Wi-Fi : conseil câble');
// Images : jeux renommés / installés ailleurs retrouvés sur Steam
ok(knownSteamId("Tom Clancy's Rainbow Six® Siege") === '359550' && knownSteamId('Rainbow Six Siege X') === '359550', 'Rainbow Six Siege (même renommé)');
ok(knownSteamId('Grand Theft Auto V Enhanced') === '271590' && knownSteamId('FiveM') === '271590', 'GTA V et FiveM');
ok(knownSteamId('Left 4 Dead 2') === '550' && knownSteamId('Counter-Strike 2') === '730' && knownSteamId('Portal 2') === null, 'L4D2, CS2, et pas les autres');
console.log(`✅ Plantages, démarrage, disques, connexion : ${n} vérifications`);
