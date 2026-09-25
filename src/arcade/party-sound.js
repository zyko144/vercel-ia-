// Jeux de soirée avec du son, dans l'arcade : l'extrait est joué par le navigateur de chaque joueur
// (servi par l'arcade depuis Deezer), les réponses s'écrivent dans le chat.
// Blind test, devine l'œuvre, pendu musical, devine le rappeur, battle de freestyle.
import { spawn } from 'node:child_process';
import { chat } from '../ai/gemini.js';
import { deezer } from '../music/deezer.js';
import { buildPool, cleanTitle, THEMES } from '../music/blindpools.js';
import { resolveWorkSong, worksOf } from '../music/blindworks.js';
import { FFMPEG_PATH } from '../music/binaries.js';
import { blurStages } from '../games/defis.js';
import { _test as defis } from '../games/defis.js';
import { PARTY, T, covers, images, maskText, norm, pick, shuffle, within } from './party.js';

const audio = (id) => ({ t: 'audio', src: `api/audio/${id}.mp3` });
const cover = (url) => (url ? { t: 'img', src: `api/img?u=${encodeURIComponent(url)}` } : null);
const hasPreview = (id) => within(deezer.track(id).then((t) => Boolean(t?.preview)), 6000);

/** Choix du thème par vote (l'hôte peut aussi l'imposer au lancement). */
async function voteTheme(p, list, fallback) {
  if (list.some(([k]) => k === p.opts.choice)) return p.opts.choice;
  const endsAt = Date.now() + 15_000;
  p.show((me) => ({ title: `${PARTY[p.g.game].emoji} Choisissez le thème`, endsAt, blocks: [{ t: 'buttons', items: list.map(([k, label]) => ({ id: k, label })), chosen: p.g.live?.get(me) ?? null }] }));
  const got = await p.collect({ ms: 15_000, keep: true, accept: (me, b) => (b.type === 'btn' && list.some(([k]) => k === b.id) ? b.id : undefined) });
  const count = {};
  for (const v of got.values()) count[v] = (count[v] ?? 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

/** Une manche « écoute et devine » : title (+2), artist (+1), rapide (+1). */
async function listenRound(p, { n, total, title, id, answers, img = null, ms = 30_000, hintAt = 15_000 }) {
  const started = Date.now();
  const endsAt = started + ms;
  const found = new Map(); // clé de réponse -> joueur
  let hint = false;
  const screen = () => ({
    title: `${title} ${n}/${total}`, endsAt, sub: 'Écris dans le chat',
    blocks: [audio(id), ...(hint ? answers.filter((a) => a.hint && !found.has(a.key)).map((a) => T(`💡 ${a.label} : ${maskText(a.value)}`, 'mono')) : []),
      { t: 'list', items: answers.map((a) => `${a.label} : ${found.has(a.key) ? `✅ ${a.value} (${p.name(found.get(a.key))})` : '…'}`) }],
  });
  p.show(screen);
  p.listen((me, text) => {
    const hit = answers.find((a) => !found.has(a.key) && a.match(text));
    if (!hit) return false;
    found.set(hit.key, me);
    p.points(me, hit.points + (Date.now() - started < 8000 ? 1 : 0));
    p.say(`✅ ${p.name(me)} trouve ${hit.label.toLowerCase()} : ${hit.value}`, 'good');
    p.show(screen);
    if (answers.every((a) => found.has(a.key))) p.next();
    return true;
  });
  try {
    await p.until(hintAt);
    if (answers.some((a) => !found.has(a.key))) {
      hint = true;
      p.show(screen);
      await p.until(Math.max(0, endsAt - Date.now()));
    }
  } finally { p.unlisten(); }
  p.show({ title: `${title} ${n}/${total}`, blocks: [...(img ? [img] : []), T(answers.map((a) => a.value).join(' · '), 'big')] });
  await p.sleep(4500);
}

// =====================================================================
// BLIND TEST
// =====================================================================
const BT_THEMES = ['moment', 'tiktok', 'genz', 'recent', 'hits', 'usrap', 'afro'];
PARTY.blindtest = {
  emoji: '🎧', name: 'Blind test', desc: 'Rap FR, TikTok, années 2010… 10 extraits', min: 1, open: true, prize: 80,
  async run(p) {
    const theme = await voteTheme(p, BT_THEMES.map((k) => [k, `${THEMES[k].emoji} ${THEMES[k].label}`]), 'moment');
    p.show({ title: '🎧 Blind test', blocks: [T(`${THEMES[theme].emoji} ${THEMES[theme].label}`, 'big'), T('Je prépare les sons…', 'small')] });
    const pool = (await within(buildPool({ theme, difficulty: 'facile', mode: 'classique', rounds: 10 }, p.r.guildId), 60_000) ?? []).filter((t) => t.deezerId).slice(0, 10);
    if (pool.length < 3) return { title: 'Impossible de préparer les sons, réessaie dans un moment.' };
    for (const [i, track] of pool.entries()) {
      const name = cleanTitle(track.title);
      await listenRound(p, {
        n: i + 1, total: pool.length, title: '🎧', id: track.deezerId, img: cover(track.thumbnail),
        answers: [
          { key: 'title', label: 'Titre', value: name, points: 2, hint: true, match: (t) => covers(name, t) },
          { key: 'artist', label: 'Artiste', value: track.artist, points: 1, hint: false, match: (t) => covers(track.artist, t) },
        ],
      });
    }
  },
};

// =====================================================================
// DEVINE LE FILM, LA SÉRIE, L'ANIMÉ…
// =====================================================================
const WORK_THEMES = [['films', '🎬 Films'], ['disney', '🏰 Disney'], ['series', '📺 Séries'], ['anime', '🍥 Animés'], ['games', '🎮 Jeux vidéo'], ['all', '🎲 Tout']];
PARTY.devine = {
  emoji: '🎬', name: 'Devine le film, la série, l’animé', desc: 'Un extrait, trouve l’œuvre', min: 1, open: true, prize: 70,
  async run(p) {
    const theme = await voteTheme(p, WORK_THEMES, 'all');
    p.show({ title: '🎬 Devine l’œuvre', blocks: [T('Je prépare les extraits…', 'big')] });
    const entries = shuffle(worksOf(theme === 'all' ? ['films', 'disney', 'series', 'anime', 'games'] : [theme], { sounds: false }));
    const rounds = [];
    for (let i = 0; i < entries.length && rounds.length < 8 && i < 40; i += 6) {
      const batch = await Promise.all(entries.slice(i, i + 6).map((e) => within(resolveWorkSong(e), 8000)));
      rounds.push(...batch.filter((t) => t?.deezerId));
    }
    if (rounds.length < 3) return { title: 'Impossible de préparer les extraits, réessaie.' };
    for (const [i, track] of rounds.slice(0, 8).entries()) {
      await listenRound(p, {
        n: i + 1, total: Math.min(8, rounds.length), title: '🎬', id: track.deezerId, img: cover(track.thumbnail),
        answers: [{ key: 'work', label: 'Œuvre', value: track.work, points: 2, hint: true, match: (t) => track.aliases.some((a) => covers(a, t)) }],
      });
    }
  },
};

// =====================================================================
// BLIND TEST PERSO : chacun ajoute 2 sons, on devine qui les a choisis
// =====================================================================
PARTY.blindperso = {
  emoji: '🎁', name: 'Blind test perso', desc: 'Chacun ajoute 2 sons, devinez qui les a choisis', min: 2, prize: 70,
  async run(p) {
    const PER = 2;
    const results = {}; // joueur -> derniers résultats de recherche
    const picks = new Map(); // joueur -> [sons]
    const endsAt = Date.now() + 120_000;
    const mine = (me) => picks.get(me) ?? [];
    p.show((me) => ({
      title: '🎁 Choisis tes 2 sons', endsAt, sub: `${[...picks.values()].filter((x) => x.length >= PER).length}/${p.players.length} prêt(s)`,
      say: 'Chacun choisit deux sons en secret. Ensuite, devinez qui a choisi quoi !',
      blocks: [
        T('Choisis 2 sons en secret : les autres devront deviner que c’est toi !', 'big'),
        ...(mine(me).length ? [{ t: 'list', items: mine(me).map((x) => `🎵 **${x.title}** · ${x.artist}`) }] : []),
        ...(mine(me).length < PER ? [
          { t: 'input', ph: 'Cherche un son ou un artiste…', button: '🔎 Chercher', keep: true },
          { t: 'buttons', items: (results[me] ?? []).map((x) => ({ id: `add:${x.id}`, label: `➕ ${x.title} · ${x.artist}` })), column: true },
        ] : [T('✅ C’est bon ! On attend les autres…', 'small')]),
      ],
    }));
    await p.collect({
      ms: 120_000, keep: true,
      enough: () => p.humansHere().every((id) => mine(id).length >= PER),
      accept: (me, b) => {
        if (b.type === 'answer' && String(b.text ?? '').trim() && mine(me).length < PER) {
          deezer.search(String(b.text).slice(0, 80), 8).then((list) => {
            results[me] = (list ?? []).filter((t) => t.preview).slice(0, 6).map((t) => ({ id: t.id, title: cleanTitle(t.title), artist: t.artist?.name ?? '?', cover: t.album?.cover_big ?? null }));
            p.bump();
          }).catch(() => {});
          return undefined;
        }
        if (b.type === 'btn' && String(b.id).startsWith('add:') && mine(me).length < PER) {
          const song = (results[me] ?? []).find((x) => `add:${x.id}` === b.id);
          if (!song || [...picks.values()].flat().some((x) => x.id === song.id)) return undefined;
          picks.set(me, [...mine(me), song]);
          results[me] = [];
          return mine(me).length;
        }
        return undefined;
      },
    });
    const rounds = shuffle([...picks.entries()].flatMap(([id, list]) => list.map((song) => ({ owner: id, song }))));
    if (rounds.length < 2) return { title: 'Pas assez de sons choisis pour jouer.' };
    const players = [...picks.keys()];
    for (const [i, { owner, song }] of rounds.entries()) {
      const voters = players.filter((id) => id !== owner);
      const until = Date.now() + 30_000;
      p.show((me) => ({
        title: `🎁 Son ${i + 1}/${rounds.length} · qui l’a choisi ?`, endsAt: until, sub: `${p.g.live?.size ?? 0}/${voters.length} vote(s)`,
        blocks: [audio(song.id), T(`🎵 ${song.title} · ${song.artist}`, 'big'),
          ...(me === owner ? [T('🤫 C’est ton son ! Fais genre…', 'small')] : [{ t: 'vote', ids: players.filter((x) => x !== me), names: Object.fromEntries(players.map((x) => [x, p.name(x)])), mine: p.g.live?.get(me) ?? null, counts: null, voters: null, label: 'C’est lui !' }])],
      }));
      const votes = await p.collect({ ms: 30_000, who: voters, keep: true, accept: (me, b) => (b.type === 'vote' && players.includes(b.id) && b.id !== me ? b.id : undefined) });
      const good = [...votes.entries()].filter(([, v]) => v === owner).map(([id]) => id);
      good.forEach((id) => p.points(id, 1));
      p.points(owner, voters.length - good.length); // un point par joueur trompé
      p.show({ title: `🎁 Son ${i + 1}/${rounds.length}`, blocks: [cover(song.cover), { t: 'who', id: owner, name: p.name(owner), text: `a choisi « ${song.title} » · ${good.length ? `trouvé par ${good.map(p.name).join(', ')}` : 'personne n’a trouvé !'}`, big: true }].filter(Boolean), say: `C’était le son de ${p.name(owner)} !` });
      await p.sleep(6000);
    }
  },
};

// =====================================================================
// PENDU MUSICAL
// =====================================================================
PARTY.pendumusical = {
  emoji: '🎵', name: 'Pendu musical', desc: 'Le titre lettre par lettre, l’extrait en indice', min: 1, open: true, prize: 50,
  async run(p) {
    p.show({ title: '🎵 Pendu musical', blocks: [T('Je choisis un son…', 'big')] });
    const list = [...(await within(deezer.chart(), 8000) ?? []), ...(await within(deezer.search('rap francais', 40), 8000) ?? [])]
      .filter((t) => t.preview && cleanTitle(t.title).length >= 3 && cleanTitle(t.title).length <= 30);
    const song = pick(list);
    if (!song) return { title: 'Impossible de trouver un son, réessaie.' };
    const title = cleanTitle(song.title);
    const letters = new Set([...norm(title)].filter((c) => /[a-z0-9]/.test(c)));
    const found = new Set();
    const wrong = [];
    let winner = null;
    const MAX = 8;
    const endsAt = Date.now() + 4 * 60_000;
    const screen = () => ({
      title: '🎵 Quel est ce son ?', endsAt, sub: `${MAX - wrong.length} erreur(s) restante(s) · lettre au clavier, ou le titre entier dans le chat`,
      blocks: [
        { t: 'word', letters: [...title].map((c) => (/[a-zà-ÿ0-9]/i.test(c) ? (found.has(norm(c)) || winner ? c.toUpperCase() : '_') : c)) },
        ...(wrong.length >= 3 && !winner ? [audio(song.id), T(`🎤 Artiste : ${song.artist?.name ?? '?'}`, 'small')] : []),
        { t: 'keys', ok: [...found], ko: wrong.filter((x) => x.length === 1), lock: Boolean(winner) },
        T(`Erreurs : ${'❌'.repeat(wrong.length)}${'▫️'.repeat(Math.max(0, MAX - wrong.length))}`, 'small'),
      ],
    });
    p.show(screen);
    const done = () => winner || wrong.length >= MAX || [...letters].every((c) => found.has(c));
    const letter = (me, c) => {
      if (found.has(c) || wrong.includes(c)) return false;
      if (letters.has(c)) found.add(c); else wrong.push(c);
      if ([...letters].every((x) => found.has(x))) winner = me;
      p.show(screen);
      if (done()) p.next();
      return true;
    };
    p.onButton((me, b) => (b.type === 'letter' && /^[a-z0-9]$/.test(norm(b.letter)) ? letter(me, norm(b.letter)) : false));
    p.listen((me, text) => {
      const t = norm(text);
      if (t.length === 1 && /[a-z0-9]/.test(t)) return letter(me, t);
      if (t.length < 3) return false;
      if (t === norm(title) || covers(title, text)) { winner = me; p.show(screen); p.next(); return true; }
      wrong.push('✗');
      p.show(screen);
      if (done()) p.next();
      return false;
    });
    while (!done() && Date.now() < endsAt) await p.until(endsAt - Date.now());
    p.unlisten();
    p.onButton(null);
    if (winner) p.points(winner, 1);
    p.show({ title: winner ? '🏆 Trouvé !' : '💀 Pendu !', blocks: [cover(song.album?.cover_big), T(`${title} · ${song.artist?.name ?? ''}`, 'big'), audio(song.id)].filter(Boolean) });
    p.say(winner ? `🏆 ${p.name(winner)} trouve : ${title}` : `💀 C’était : ${title}`, winner ? 'good' : 'info');
    await p.sleep(12_000);
  },
};

// =====================================================================
// DEVINE LE RAPPEUR : la photo floutée se dévoile
// =====================================================================
PARTY.rappeur = {
  emoji: '🎤', name: 'Devine le rappeur', desc: 'La photo floutée se dévoile en 4 étapes', min: 1, open: true, prize: 60,
  async run(p) {
    const names = shuffle(defis.RAPPERS).slice(0, 8);
    let n = 0;
    for (const name of names) {
      if (n >= 5) break;
      p.show({ title: '🎤 Devine le rappeur', blocks: [T('Je développe la photo…', 'big')] });
      const artist = (await within(deezer.searchArtist(name, 3), 8000) ?? [])[0];
      if (!artist?.picture_xl) continue;
      const buf = await within(fetch(artist.picture_xl).then((r) => r.arrayBuffer()).then((b) => Buffer.from(b)), 8000);
      const stages = buf ? await within(blurStages(buf), 10_000) : null;
      if (!stages) continue;
      n += 1;
      const keys = stages.map((img, k) => { const key = `${p.g.game}-${Math.random().toString(36).slice(2, 10)}-${k}`; images.set(key, img); p.g.imageKeys.push(key); return key; });
      const full = `${p.g.game}-${Math.random().toString(36).slice(2, 10)}-net`;
      images.set(full, buf);
      p.g.imageKeys.push(full);
      let win = null;
      for (let k = 0; k < 4 && !win; k++) {
        p.show({ title: `🎤 Rappeur ${n}/5 · photo ${k + 1}/4`, endsAt: Date.now() + 12_000, sub: `Écris son nom dans le chat · ${4 - k} pt(s)`, blocks: [{ t: 'img', src: `api/pimg/${keys[k]}.jpg`, cls: 'photo' }] });
        win = await p.race({ ms: 12_000, check: (me, text) => covers(artist.name, text) || covers(name, text) });
        if (win) p.points(win.id, 4 - k);
      }
      p.say(win ? `✅ ${p.name(win.id)} trouve ${artist.name} !` : `⌛ C’était ${artist.name}.`, win ? 'good' : 'info');
      p.show({ title: `🎤 Rappeur ${n}/5`, blocks: [{ t: 'img', src: `api/pimg/${full}.jpg`, cls: 'photo' }, T(artist.name, 'big')] });
      await p.sleep(4000);
    }
    if (!n) return { title: 'Deezer ne répond pas, réessaie dans un moment.' };
  },
};

// =====================================================================
// BATTLE DE FREESTYLE : l'instru joue chez tout le monde, chacun rappe au micro, l'IA juge
// =====================================================================
const BEATS = { trap: 'trap instrumental beat', drill: 'drill instrumental beat', boombap: 'boom bap instrumental', afro: 'afrobeat instrumental', melo: 'melodic rap instrumental' };
function toMp3(buffer) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-ac', '1', '-ar', '22050', '-f', 'mp3', 'pipe:1'], { windowsHide: true });
    const out = [];
    proc.stdout.on('data', (c) => out.push(c));
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}`))));
    proc.stdin.on('error', () => {});
    proc.stdin.end(buffer);
  });
}
PARTY.freestyle = {
  emoji: '🎙️', name: 'Battle de freestyle', desc: 'Au micro sur une instru, l’IA désigne le gagnant', min: 2, prize: 80,
  async run(p) {
    // Les deux premiers qui se lèvent rappent
    let endsAt = Date.now() + 30_000;
    p.show((me) => ({ title: '🎙️ Qui monte sur scène ?', endsAt, sub: `${p.g.live?.size ?? 0}/2`, blocks: [T('Les deux premiers qui appuient s’affrontent.', 'big'), { t: 'buttons', items: [{ id: 'go', label: '🎤 Je rappe !', cls: 'green' }], chosen: p.g.live?.has(me) ? 'go' : null }] }));
    const seats = await p.collect({ ms: 30_000, accept: (me, b) => (b.type === 'btn' && b.id === 'go' ? Date.now() : undefined), enough: (got) => got.size >= 2 });
    const rappers = [...seats.entries()].sort((a, b) => a[1] - b[1]).slice(0, 2).map(([id]) => id);
    if (rappers.length < 2) return { title: 'Il faut deux rappeurs pour une battle.' };
    const style = pick(Object.keys(BEATS));
    const beat = pick((await within(deezer.search(BEATS[style], 25), 8000) ?? []).filter((t) => t.preview && t.duration > 60));
    const takes = {};
    for (const id of rappers) {
      endsAt = Date.now() + 8000;
      p.show({ title: `🎙️ Au tour de ${p.name(id)}`, endsAt, blocks: [T(`Instru ${style} · prépare-toi…`, 'big')] });
      await p.sleep(8000);
      endsAt = Date.now() + 40_000;
      p.show((me) => ({
        title: `🎙️ ${p.name(id)} rappe !`, endsAt,
        blocks: [...(beat ? [audio(beat.id)] : []), ...(me === id ? [{ t: 'mic', seconds: 30, ph: 'Pas de micro ? Écris ton texte ici', done: p.g.live?.has(me) ?? false }] : [T('🎧 Écoute (en vocal) et prépare ta réplique…', 'small')])],
      }));
      const got = await p.collect({
        ms: 42_000, who: [id],
        accept: (me, b) => {
          if (b.type === 'audio' && typeof b.data === 'string' && b.data.length < 2_700_000) return { audio: Buffer.from(b.data, 'base64') };
          if (b.type === 'answer' && String(b.text ?? '').trim()) return { text: String(b.text).trim().slice(0, 800) };
          return undefined;
        },
      });
      takes[id] = got.get(id) ?? { text: '' };
    }
    p.show({ title: '🎙️ Le jury délibère…', blocks: [T('L’IA écoute les deux passages.', 'big')] });
    const content = [{ type: 'text', text: `Battle de freestyle rap entre deux amis sur une instru ${style}. Pour chacun (A puis B) : ce que tu as compris (quelques vers), des notes de 0 à 10 pour les rimes, les punchlines, le flow et l'originalité, et un commentaire taquin mais jamais méchant. Si un passage est vide ou inaudible, notes très basses. Puis le gagnant (A, B ou egalite) et un verdict de 2 phrases.` }];
    for (const [i, id] of rappers.entries()) {
      content.push({ type: 'text', text: `Passage ${'AB'[i]} : ${p.name(id)}` });
      const mp3 = takes[id].audio ? await within(toMp3(takes[id].audio), 20_000) : null;
      if (mp3) content.push({ type: 'audio', mime_type: 'audio/mp3', data: mp3.toString('base64') });
      else content.push({ type: 'text', text: `(texte écrit) ${takes[id].text || '(rien)'}` });
    }
    const schema = { type: 'object', properties: { rappeurs: { type: 'array', items: { type: 'object', properties: { lettre: { type: 'string' }, compris: { type: 'string' }, note: { type: 'number' }, commentaire: { type: 'string' } }, required: ['lettre', 'note', 'commentaire'] } }, gagnant: { type: 'string', enum: ['A', 'B', 'egalite'] }, verdict: { type: 'string' } }, required: ['rappeurs', 'gagnant', 'verdict'] };
    const res = await within(chat({ tag: 'jeux', content, system: 'Tu es un juge de battle de rap français, expert et drôle. Tu réponds uniquement en JSON.', web: false, thinking: 'low', exactThinking: true, responseFormat: { type: 'text', mime_type: 'application/json', schema } })
      .then(({ text }) => JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''))), 60_000);
    const empty = rappers.map((id) => !takes[id].audio && !takes[id].text);
    let win = res?.gagnant === 'A' ? rappers[0] : res?.gagnant === 'B' ? rappers[1] : null;
    if (empty[0] && !empty[1]) win = rappers[1];
    if (empty[1] && !empty[0]) win = rappers[0];
    if (empty.every(Boolean)) win = null;
    const lines = rappers.map((id, i) => { const x = res?.rappeurs?.find((y) => y.lettre === 'AB'[i]); return `**${p.name(id)}** · ${x ? `${Math.round(Number(x.note) * 10) / 10}/10 · ${x.commentaire}` : empty[i] ? 'rien entendu 😶' : 'le jury n’a rien compris'}`; });
    if (win) p.points(win, 1);
    p.show({ title: win ? `🏆 ${p.name(win)} gagne la battle !` : '🤝 Égalité', blocks: [{ t: 'list', items: lines }, T(res?.verdict ?? 'Le jury a perdu sa voix…', 'quote')] });
    await p.sleep(15_000);
    return { title: win ? `🏆 ${p.name(win)} gagne la battle !` : '🤝 Égalité', text: res?.verdict ?? null, winners: win ? [win] : [] };
  },
};

// ------------------------------------------------------------------ Fichiers servis (son et images)
const previewCache = new Map(); // deezerId -> { at, buf }
/** L'extrait Deezer (30 s) d'un son, servi par l'arcade (l'Activité ne peut pas joindre Deezer directement). */
export async function previewAudio(id) {
  const hit = previewCache.get(id);
  if (hit && Date.now() - hit.at < 20 * 60_000) return hit.buf;
  const track = await deezer.track(id).catch(() => null);
  if (!track?.preview) return null;
  const res = await fetch(track.preview).catch(() => null);
  if (!res?.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  previewCache.set(id, { at: Date.now(), buf });
  if (previewCache.size > 60) previewCache.delete(previewCache.keys().next().value);
  return buf;
}
/** Une image Deezer (photo d'artiste, pochette), seulement depuis leurs serveurs d'images. */
export async function deezerImage(u) {
  let url;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== 'https:' || !/(^|\.)dzcdn\.net$/.test(url.hostname)) return null;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  return { type: res.headers.get('content-type') ?? 'image/jpeg', buf: Buffer.from(await res.arrayBuffer()) };
}
export { hasPreview };
