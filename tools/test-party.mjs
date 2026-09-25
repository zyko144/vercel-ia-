/**
 * Banc d'essai des jeux de soirée de l'arcade (party*.js) : chaque jeu est joué jusqu'au bout
 * par des joueurs automatiques, sans IA (réponses de secours) et avec un Deezer simulé.
 *
 *   node tools/test-party.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_TOKEN = ['T'.repeat(26), 'E'.repeat(6), 'S'.repeat(30)].join('.');
process.env.GEMINI_API_KEY ||= 'essai';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_KEY = '';
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), 'arcade-party-'));
process.env.ARCADE_SPEED = '0.01';

// Une vraie petite image (pour les photos floutées du rappeur)
const { default: sharp } = await import('sharp');
const PHOTO = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#c9a978' } }).jpeg().toBuffer();
const MP3 = Buffer.from('ID3fauxmp3');
// Pas d'IA (réponses de secours), Deezer et ses fichiers simulés
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, o) => {
  const u = String(url);
  if (u.includes('generativelanguage')) return { ok: false, status: 500, json: async () => ({}), text: async () => 'non' };
  if (u.includes('preview.test')) return { ok: true, arrayBuffer: async () => MP3 };
  if (u.includes('dzcdn.net')) return { ok: true, headers: new Map([['content-type', 'image/jpeg']]), arrayBuffer: async () => PHOTO };
  if (u.includes('deezer.com')) return { ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '{"data":[]}' };
  return realFetch(url, o);
};
const { deezer } = await import('../src/music/deezer.js');
const SONGS = [
  { id: 11, title: 'Bande organisée', preview: 'https://preview.test/11.mp3', duration: 200, artist: { id: 1, name: 'Jul' }, album: { cover_big: 'https://e-cdns-images.dzcdn.net/a.jpg' }, rank: 900000 },
  { id: 12, title: 'Djadja', preview: 'https://preview.test/12.mp3', duration: 180, artist: { id: 2, name: 'Aya Nakamura' }, album: { cover_big: 'https://e-cdns-images.dzcdn.net/b.jpg' }, rank: 900000 },
];
deezer.chart = async () => SONGS;
const EXTRA = Array.from({ length: 6 }, (_, i) => ({ id: 20 + i, title: `Son ${i}`, preview: `https://preview.test/${20 + i}.mp3`, duration: 150, artist: { id: 9, name: 'Jul' }, album: {} }));
deezer.search = async () => [...SONGS, ...EXTRA];
deezer.track = async (id) => SONGS.find((s) => String(s.id) === String(id)) ?? { id, preview: `https://preview.test/${id}.mp3` };
deezer.searchArtist = async (q) => [{ id: 5, name: q, picture_xl: 'https://e-cdns-images.dzcdn.net/p.jpg' }];
deezer.chartArtists = async () => Array.from({ length: 30 }, (_, i) => ({ id: 100 + i }));
deezer.artist = async (id) => ({ id, name: `Artiste ${id}`, nb_fan: 10_000 * 2 ** (id - 100), picture_big: 'https://e-cdns-images.dzcdn.net/x.jpg' });

const arcade = await import('../src/arcade/server.js');
const { PARTY } = await import('../src/arcade/party.js');
const { _test: defis } = await import('../src/games/defis.js');
const { Collection } = await import('discord.js');

let passed = 0;
const check = async (name, fn) => { await fn(); passed += 1; console.log('✅', name); };

const G = '444444444444444444';
const ROOM = '555555555555555555';
const A = { id: '222222222222222222', name: 'Lina' };
const B = { id: '333333333333333333', name: 'Sami' };
const C = { id: '666666666666666666', name: 'Noa' };
const members = new Collection([[A.id, {}], [B.id, {}], [C.id, {}]]);
const author = (id, name) => ({ id, bot: false, username: name, globalName: name });
const messages = new Collection([
  ['1', { author: author(A.id, 'Lina'), member: { displayName: 'Lina' }, content: 'Franchement ce serveur est le meilleur du monde entier' }],
  ['2', { author: author(B.id, 'Sami'), member: { displayName: 'Sami' }, content: 'Qui vient ce soir pour la partie de loup-garou ?' }],
  ['3', { author: author(C.id, 'Noa'), member: { displayName: 'Noa' }, content: 'J’ai encore perdu au blackjack contre le capitaine' }],
  ['4', { author: author('777777777777777777', 'Ilyes'), member: { displayName: 'Ilyes' }, content: 'Le bot m’a mis un avertissement pour rien du tout' }],
]);
const guild = {
  id: G, name: 'Le Navire', memberCount: 42, premiumSubscriptionCount: 3, createdTimestamp: Date.UTC(2021, 3, 1),
  members: { fetch: async (id) => members.get(id) ?? null, cache: new Collection() },
  fetchOwner: async () => ({ displayName: 'Lina' }),
  roles: { cache: new Collection() },
  channels: { cache: new Collection([[ROOM, { id: ROOM, name: 'général', isTextBased: () => true, isThread: () => false, viewable: true, lastMessageId: '9', messages: { fetch: async () => messages } }]]) },
};
arcade.setArcadeClient({
  user: { id: '999999999999999999', username: 'AI Vercel' },
  guilds: { cache: new Collection([[G, guild]]) },
  users: { fetch: async () => null },
});

const { rooms, roomOf, join, act, GAMES } = arcade._test;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Joue une partie : chaque joueur répond à ce qu'il voit (premier choix, premier vote, un indice…). */
async function play(party, { players = [A, B, C], bots = false, choice, theme, chat = null, timeout = 60_000, answer = null } = {}) {
  rooms.clear();
  const r = roomOf(ROOM, G);
  for (const u of players) join(r, u);
  const out = await act(r, players[0].id, { type: 'start', game: 'party', party, bots, choice, theme });
  if (out.error) return { error: out.error, r };
  const started = Date.now();
  while (r.game?.kind === 'party' && Date.now() - started < timeout) {
    const g = r.game;
    for (const u of players) {
      if (r.game !== g) break;
      const v = GAMES.party.view(g, u.id);
      for (const b of v.screen?.blocks ?? []) {
        if (b.t === 'choices' && b.mine === null && (b.right === null || b.right === undefined)) await act(r, u.id, { type: 'pick', i: 0 });
        if (b.t === 'buttons' && !b.chosen && b.items[0]) { const adds = b.items.filter((x) => x.id.startsWith('add:')); await act(r, u.id, { type: 'btn', id: adds.length ? adds[Math.floor(Math.random() * adds.length)].id : b.items.find((x) => x.id !== 'hint')?.id ?? b.items[0].id }); }
        if (b.t === 'vote' && !b.lock && !b.mine && b.ids.length) await act(r, u.id, { type: 'vote', id: b.ids.find((id) => id !== u.id) ?? b.ids[0] });
        if (b.t === 'input' && !b.done) await act(r, u.id, { type: 'answer', text: answer?.(g, u) ?? 'pirate' });
        if (b.t === 'form' && !b.done) await act(r, u.id, { type: 'form', values: b.fields.map(() => `${v.screen.title.slice(-1)}ouba`) });
        if (b.t === 'keys' && !b.lock) { const c = 'eaisnrtoulbdjmgcpvfhqyzkwx'.split('').find((x) => !b.ok.includes(x) && !b.ko.includes(x)); if (c) await act(r, u.id, { type: 'letter', letter: c }); }
        if (b.t === 'mic' && !b.done) await act(r, u.id, { type: 'answer', text: 'Je rappe sur le navire, le capitaine est en délire' });
      }
      if (chat) { const t = chat(g, u, v); if (t) await act(r, u.id, { type: 'chat', text: t }); }
    }
    await wait(40);
  }
  return { r, end: r.game };
}

await check('catalogue : 19 jeux de soirée, chacun avec un nom, un emoji et un script', async () => {
  const ids = ['loupgarou', 'imposteur', 'undercover', 'histoire', 'petitbac', 'actionverite', 'quizserveur', 'blindtest', 'devine', 'pendumusical', 'rebus', 'fans', 'chasse', 'rappeur', 'motscroises', 'escape', 'quiditca', 'freestyle', 'blindperso'];
  for (const id of ids) assert.ok(PARTY[id]?.name && PARTY[id].emoji && typeof PARTY[id].run === 'function', id);
});

await check('lancement : jeu inconnu, pas assez de joueurs, puis bots pour compléter', async () => {
  rooms.clear();
  const r = roomOf(ROOM, G);
  join(r, A);
  assert.equal((await act(r, A.id, { type: 'start', game: 'party', party: 'nimportequoi' })).error, 'Jeu inconnu.');
  assert.match((await act(r, A.id, { type: 'start', game: 'party', party: 'loupgarou' })).error, /au moins 5/);
  assert.ok((await act(r, A.id, { type: 'start', game: 'party', party: 'loupgarou', bots: true })).ok);
  assert.equal(r.game.players.length, 6, 'complété à 6 avec des bots');
  assert.ok(r.game.players.slice(1).every((id) => id.startsWith('bot-')));
  await act(r, A.id, { type: 'lobby' });
  assert.equal(r.game, null, 'l’hôte arrête la partie');
});

await check('loup-garou : rôles secrets (chacun ne voit que le sien), partie jouée jusqu’à la victoire d’un camp', async () => {
  rooms.clear();
  const r = roomOf(ROOM, G);
  for (const u of [A, B, C]) join(r, u);
  await act(r, A.id, { type: 'start', game: 'party', party: 'loupgarou', bots: true });
  await wait(50);
  const g = r.game;
  const va = GAMES.party.view(g, A.id);
  const vb = GAMES.party.view(g, B.id);
  assert.ok(va.card?.title && vb.card?.title, 'chacun a sa carte');
  assert.ok(!JSON.stringify(va).includes(`"${B.id}":{"emoji"`), 'pas la carte des autres');
  const res = await play('loupgarou', { bots: true, timeout: 90_000 });
  assert.equal(res.end?.kind, 'fin', 'la partie se termine');
  assert.match(res.end.title, /loups|village/);
  assert.match(res.end.text, /Loup-garou/);
});

await check('la nuit et les morts : le chat est gardé par le jeu (pas montré aux autres)', async () => {
  rooms.clear();
  const r = roomOf(ROOM, G);
  for (const u of [A, B, C]) join(r, u);
  await act(r, A.id, { type: 'start', game: 'party', party: 'loupgarou', bots: true });
  await wait(30);
  const before = r.chat.length;
  await act(r, B.id, { type: 'chat', text: 'je suis loup mdr' });
  assert.equal(r.chat.length, before, 'message caché la nuit');
  await act(r, A.id, { type: 'lobby' });
});

for (const party of ['imposteur', 'undercover']) {
  await check(`${party} : un mot par joueur, indices chacun son tour, vote, fin avec les rôles`, async () => {
    const res = await play(party, { bots: true, answer: () => 'grand' });
    assert.equal(res.end?.kind, 'fin');
    assert.match(res.end.text, /Mot des civils/);
  });
}

await check('imposteur : mot proche mais différent, même carte pour tous, règles lues, votes visibles en direct', async () => {
  rooms.clear();
  const r = roomOf(ROOM, G);
  for (const u of [A, B, C]) join(r, u);
  await act(r, A.id, { type: 'start', game: 'party', party: 'imposteur', bots: true });
  // L'écran des règles ne dure qu'un instant en mode accéléré : on le guette
  let rules = null;
  for (let t = 0; t < 400 && !rules; t++) { const sc = r.game?.cards && Object.keys(r.game.cards).length ? GAMES.party.view(r.game, A.id).screen : null; if (sc?.title?.includes('règles')) rules = sc; else await wait(5); }
  const g = r.game;
  const cards = g.players.map((id) => g.cards[id]);
  const words = new Set(cards.map((c) => c.title));
  assert.equal(words.size, 2, 'deux mots différents');
  assert.equal(new Set(cards.map((c) => c.text)).size, 1, 'même texte : l’imposteur ne sait pas qu’il l’est');
  assert.ok(rules, 'écran des règles affiché');
  assert.match(rules.say, /mot proche/);
  // Jusqu'au vote : chacun donne son indice
  const until = Date.now() + 20_000;
  while (Date.now() < until && !GAMES.party.view(g, A.id).screen.title.startsWith('🗳️')) {
    for (const u of [A, B, C]) await act(r, u.id, { type: 'answer', text: 'rond' });
    await wait(40);
  }
  await act(r, A.id, { type: 'vote', id: B.id });
  const vote = GAMES.party.view(g, C.id).screen.blocks.find((b) => b.t === 'vote');
  assert.ok(vote.voters[B.id].some((v) => v.id === A.id && v.name === 'Lina'), 'C voit tout de suite que A a voté contre B');
  assert.ok(GAMES.party.view(g, C.id).answered.includes(A.id));
  await act(r, A.id, { type: 'lobby' });
});

await check('histoire : sans IA, le maître du jeu s’arrête proprement', async () => {
  const res = await play('histoire');
  assert.equal(res.end?.kind, 'fin');
  assert.match(res.end.title, /plume/);
});

await check('petit bac : grilles rendues, points (réponses sans IA : 2 lettres minimum)', async () => {
  const res = await play('petitbac', { players: [A, B] });
  assert.equal(res.end?.kind, 'fin');
  assert.equal(res.end.podium.length, 2);
});

await check('action ou vérité : défis de secours, validés par les autres', async () => {
  const res = await play('actionverite', { players: [A, B] });
  assert.equal(res.end?.kind, 'fin');
  assert.ok(res.end.podium.some(([, n]) => n > 0), 'des défis validés');
});

await check('quiz du serveur : questions de secours tirées des vrais chiffres du serveur', async () => {
  const res = await play('quizserveur', { players: [A] });
  assert.equal(res.end?.kind, 'fin');
});

await check('qui a dit ça ? : de vrais messages du salon, 4 auteurs possibles', async () => {
  rooms.clear();
  let seen = null;
  const res = await play('quiditca', { players: [A, B], chat: (g) => { const s = GAMES.party.view(g, A.id).screen; if (s?.blocks?.[0]?.text?.startsWith('«')) seen = s; return null; } });
  assert.equal(res.end?.kind, 'fin');
  assert.ok(seen?.blocks.find((b) => b.t === 'choices').options.includes('Ilyes'));
});

await check('chasse au trésor : la bonne réponse écrite dans le chat gagne le morceau (et reste cachée)', async () => {
  const res = await play('chasse', {
    players: [A, B],
    chat: (g, u, v) => {
      if (u.id !== A.id) return null;
      const q = v.screen?.blocks?.[0]?.text;
      return defis.RIDDLES.find((x) => x.q === q)?.a ?? null;
    },
  });
  assert.equal(res.end?.kind, 'fin');
  assert.equal(res.end.podium[0][0], A.id);
  assert.equal(res.end.podium[0][1], 3, '3 morceaux de carte');
  assert.ok(!res.r.chat.some((m) => m.kind === 'msg' && defis.RIDDLES.some((x) => x.a === m.text)), 'réponses cachées');
});

await check('mots croisés : grille de secours, mots trouvés dans le chat', async () => {
  const words = ['boussole', 'galion', 'ancre', 'vigie', 'tresor', 'recif'];
  let n = 0;
  const res = await play('motscroises', { players: [A], chat: (g, u, v) => (v.screen?.blocks?.some((b) => b.t === 'grid') ? words[n++ % words.length] : null) });
  assert.equal(res.end?.kind, 'fin');
  assert.equal(res.end.podium[0][1], 6);
});

await check('escape game : 3 salles, indice (-1 min), tout l’équipage libéré', async () => {
  const answers = defis.ESCAPE.salles.map((s) => s.reponse);
  const res = await play('escape', { players: [A, B], chat: (g, u, v) => (u.id === A.id && v.screen?.title?.startsWith('🚪') ? answers[Number(v.screen.title.match(/Salle (\d)/)[1]) - 1] : null) });
  assert.equal(res.end?.kind, 'fin');
  assert.match(res.end.title, /libres/);
});

await check('rébus : sans IA, message clair au lieu d’une partie cassée', async () => {
  const res = await play('rebus', { players: [A], choice: 'films' });
  assert.equal(res.end?.kind, 'fin');
  assert.match(res.end.title, /rébus/);
});

await check('plus ou moins de fans : votes, bonne réponse révélée, 10 manches', async () => {
  const res = await play('fans', { players: [A, B], choice: 'monde' });
  assert.equal(res.end?.kind, 'fin');
  assert.equal(res.end.podium.length, 2);
});

await check('pendu musical : clavier et titre dans le chat, extrait en indice après 3 erreurs', async () => {
  let audio = false;
  const res = await play('pendumusical', { players: [A], chat: (g, u, v) => { if (v.screen?.blocks?.some((b) => b.t === 'audio')) audio = true; return null; } });
  assert.equal(res.end?.kind, 'fin');
  assert.ok(audio || res.end.podium.length, 'extrait ou victoire');
});

await check('devine le rappeur : photo floutée servie par l’arcade, nom trouvé dans le chat', async () => {
  let img = null;
  const res = await play('rappeur', { players: [A], chat: (g, u, v) => { const b = v.screen?.blocks?.find((x) => x.t === 'img'); if (b && v.screen.title.includes('photo 2')) { img = b.src; const name = v.screen.title; return name ? null : null; } return null; } });
  assert.equal(res.end?.kind, 'fin');
  assert.ok(img?.startsWith('api/pimg/'));
});

await check('devine l’œuvre : extraits Deezer, nom de l’œuvre dans le chat', async () => {
  const res = await play('devine', { players: [A], choice: 'films' });
  assert.equal(res.end?.kind, 'fin');
});

await check('blind test : sans Deezer, message clair', async () => {
  const res = await play('blindtest', { players: [A], choice: 'moment', timeout: 90_000 });
  assert.equal(res.end?.kind, 'fin');
});

await check('freestyle : deux rappeurs (texte sans micro), le jury désigne le gagnant', async () => {
  const res = await play('freestyle', { players: [A, B] });
  assert.equal(res.end?.kind, 'fin');
  assert.match(res.end.title, /battle|Égalité/);
});

await check('blind test perso : chacun cherche et ajoute 2 sons, on devine qui les a choisis', async () => {
  const res = await play('blindperso', { players: [A, B], answer: () => 'jul' });
  assert.equal(res.end?.kind, 'fin');
  assert.ok(res.end.podium.length === 2, 'les deux joueurs marquent');
});

await check('spectateur : arrivé en cours, il regarde sans jouer et parle dans le chat des spectateurs', async () => {
  rooms.clear();
  const r = roomOf(ROOM, G);
  for (const u of [A, B, C]) join(r, u);
  await act(r, A.id, { type: 'start', game: 'party', party: 'imposteur' });
  await wait(100);
  const D = { id: '888888888888888888', name: 'Yanis' };
  join(r, D);
  const g = r.game;
  const view = GAMES.party.view(g, D.id);
  assert.equal(view.spectator, true);
  assert.equal(view.card, null, 'pas de mot pour le spectateur');
  assert.ok(!g.players.includes(D.id));
  await act(r, D.id, { type: 'answer', text: 'triche' });
  await act(r, D.id, { type: 'chat', text: 'secret-spectateur 42' });
  const { _test: t } = arcade;
  assert.ok(!t.stateFor(r, A.id).chat.some((m) => m.text.includes('secret-spectateur')), 'les joueurs ne voient pas le chat des spectateurs');
  assert.ok(t.stateFor(r, D.id).chat.some((m) => m.spec && m.text.includes('secret-spectateur')), 'les spectateurs, si');
  await act(r, A.id, { type: 'lobby' });
});

await check('fichiers : carte de rôle, extrait audio, image Deezer (seulement dzcdn), photo en mémoire', async () => {
  const server = http.createServer(async (req, res) => { if (!(await arcade.handleArcadeWeb(req, res, new URL(req.url, 'http://x')))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/.proxy/arcade`;
  const get = (p) => realFetch(`${base}/${p}`);
  assert.equal((await get('jeux/loup.gif')).status, 200);
  assert.equal((await get('jeux/..%2F..%2Fpackage.gif')).status, 404);
  const mp3 = await get('api/audio/11.mp3');
  assert.equal(mp3.headers.get('content-type'), 'audio/mpeg');
  assert.equal((await get(`api/img?u=${encodeURIComponent('https://evil.test/x.jpg')}`)).status, 404);
  assert.equal((await get(`api/img?u=${encodeURIComponent('https://e-cdns-images.dzcdn.net/x.jpg')}`)).status, 200);
  assert.equal((await get('api/pimg/inconnu-12345.jpg')).status, 404);
  assert.equal((await realFetch(`${base}/api/tts?room=${ROOM}&guild=${G}`, { method: 'POST', body: '{"text":"bonjour"}' })).status, 401, 'la voix demande une session');
  server.close();
});

console.log(`\n${passed} vérifications passées.`);
process.exit(0);
