import assert from 'node:assert/strict';
import { isFresh, mergeBackup, pickBackup } from '../src/core/backup.js';

const local = {
  settings: { autostart: true, theme: 'bleu', steamAccount: '111' }, art: { gros: 'cache' }, custom: { x: { exe: 'C:\\jeu.exe' } },
  items: { a: { favorite: true, launch: { exe: 'C:\\a.exe' } }, b: { launch: { exe: 'C:\\b.exe' } } },
  collections: { c1: { name: 'Potes', items: ['a'] } }, timeBy: { a: { principal: { minutes: 50, lastPlayed: 10 } } },
  days: { '2026-09-01': { items: { a: 30 } } }, fivemFavs: ['abc123'],
};
const b = pickBackup(local);
assert.equal(b.art, undefined, 'cache d’images pas envoyé');
assert.equal(b.custom, undefined, 'chemins perso pas envoyés');
assert.equal(b.settings.autostart, undefined, 'réglage propre au PC');
assert.equal(b.settings.steamAccount, undefined);
assert.equal(b.settings.theme, 'bleu');
assert.deepEqual(b.items, { a: { favorite: true } }, 'préférences sans chemins de lancement');

// Nouveau PC : on retrouve tout, les compteurs gardent le plus grand
const fresh = { settings: { autostart: false, steamAccount: '222' }, items: {}, timeBy: { a: { principal: { minutes: 80, lastPlayed: 5 } } } };
assert.equal(isFresh({ settings: {}, items: {} }), true);
assert.equal(isFresh(local), false);
const m = mergeBackup(fresh, b);
assert.equal(m.settings.theme, 'bleu');
assert.equal(m.settings.autostart, false, 'réglage du PC gardé');
assert.equal(m.settings.steamAccount, '222');
assert.equal(m.collections.c1.name, 'Potes');
assert.equal(m.items.a.favorite, true);
assert.equal(m.timeBy.a.principal.minutes, 80, 'plus grand compteur');
assert.equal(m.days['2026-09-01'].items.a, 30);
assert.deepEqual(m.fivemFavs, ['abc123']);
assert.equal(mergeBackup(fresh, null), fresh);
console.log('✅ Sauvegarde en ligne (tri, fusion) : 17 vérifications');
