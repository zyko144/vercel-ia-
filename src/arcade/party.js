// Les « jeux de soirée » de l'arcade : ils se jouent entièrement dans l'Activité.
// Chaque jeu est un petit script asynchrone (run) qui montre des écrans et attend les joueurs :
//   p.show(écran)       l'écran commun (ou une fonction (joueur) => écran, pour ce que chacun voit)
//   p.collect({...})    attend les réponses (boutons, choix, textes, votes) jusqu'au temps imparti
//   p.race({...})       le premier qui écrit la bonne réponse dans le chat
//   p.listen / p.until  écoute libre du chat pendant un temps donné
// Un écran = { title, sub, endsAt, blocks: [...] } ; le navigateur sait afficher chaque bloc
// (texte, image, son, choix, boutons, saisie, formulaire, vote, clavier, grille, micro, carte).
import { chatJson } from '../ai/gemini.js';
import { isBot, makeBots, botName } from '../games/bots.js';
import { PARTY_DATA } from '../games/soirees.js';
import { REBUS_PARTS } from '../games/rebus.js';
import { FANS_PARTS } from '../games/fans.js';
import { _test as defis } from '../games/defis.js';
import { matchRatio } from '../music/deezer.js';
import { playedGame } from '../features/treasury.js';

export const PARTY = {};
export const STOP = Symbol('arrêt');
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const shuffle = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms).unref?.(); });
/** Une réponse de l'IA, ou null si elle échoue ou met trop de temps : le jeu ne reste jamais bloqué. */
export const within = (promise, ms = 15_000) => Promise.race([Promise.resolve(promise).catch(() => null), wait(ms).then(() => null)]);
export const ask = (opts, ms) => within(chatJson({ tag: 'jeux', thinking: 'minimal', exactThinking: true, ...opts }), ms);
/** La réponse couvre-t-elle le nom attendu ? (fautes tolérées, petits mots ignorés) */
export function covers(expected, guess) {
  const all = norm(expected).split(' ').filter(Boolean);
  const big = all.filter((t) => t.length >= 3);
  const words = big.length ? big : all;
  if (!words.length || !norm(guess)) return false;
  if (norm(guess).replace(/ /g, '') === norm(expected).replace(/ /g, '')) return true;
  return matchRatio(words.join(' '), guess) >= (words.length === 1 ? 1 : 0.75);
}
/** « Pyramide » -> « P _ _ _ _ _ _ _ » */
export const maskText = (text) => String(text).split(/\s+/).map((w) => [...w].map((c, i) => (i === 0 || !/[\p{L}\p{N}]/u.test(c) ? c : '_')).join(' ')).join('   ');

// Images servies par l'arcade (photos floutées, pochettes) : gardées en mémoire le temps de la partie
export const images = new Map();

// ------------------------------------------------------------------ Moteur
// Les bancs d'essai accélèrent le temps (ARCADE_SPEED=0.02 : 75 s deviennent 1,5 s)
const SPEED = Number(process.env.ARCADE_SPEED) || 1;
function nap(g, ms) {
  ms *= SPEED;
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); g.wakers.delete(done); resolve(); };
    const timer = setTimeout(done, ms);
    g.wakers.add(done);
  });
}
const wakeAll = (g) => { for (const w of [...g.wakers]) w(); };

function context(r, g, h) {
  const alive = () => { if (g.stopped || r.game !== g) throw STOP; };
  const humansHere = () => g.players.filter((id) => !isBot(id) && r.players.has(id));
  const p = {
    r, g, host: g.host, opts: g.opts,
    get players() { return g.players; },
    humans: () => g.players.filter((id) => !isBot(id)),
    name: (id) => g.names[id] ?? h.nameOf(r, id),
    say: (text, kind) => { h.say(r, text, kind); h.bump(r); },
    bump: () => h.bump(r),
    alive,
    show(screen) { alive(); g.screen = screen; h.bump(r); },
    card(id, card) { g.cards[id] = card; },
    points(id, n = 1) { g.scores[id] = (g.scores[id] ?? 0) + n; },
    async sleep(ms) { alive(); await nap(g, ms); alive(); },
    next() { wakeAll(g); },
    async until(ms) { alive(); await nap(g, ms); alive(); },
    listen(fn) { g.chatHook = fn; },
    unlisten() { g.chatHook = null; },
    onButton(fn) { g.extra = fn; },
    /**
     * Attend les réponses : accept(joueur, action, reçues) renvoie la valeur gardée (ou undefined pour ignorer).
     * who : les joueurs attendus (par défaut tous ceux de la partie). Les bots répondent avec bot(id).
     * Fini quand tout le monde a répondu (ou enough(reçues)), ou au bout de ms.
     */
    async collect({ ms, who = null, accept, bot = null, enough = null, keep = false }) {
      alive();
      const got = new Map();
      g.live = got;
      const expected = () => (who ?? g.players).filter((id) => isBot(id) || r.players.has(id));
      const complete = () => (enough ? enough(got) : expected().length > 0 && expected().every((id) => got.has(id)));
      let finish;
      const done = new Promise((resolve) => { finish = resolve; });
      g.onInput = (me, body) => {
        if (who && !who.includes(me)) return false;
        const value = accept(me, body, got);
        if (value === undefined) return false;
        if (got.has(me) && !keep) return false;
        got.set(me, value);
        if (complete()) setTimeout(finish, 350 * SPEED);
        return true;
      };
      const timers = [];
      if (bot) {
        for (const id of (who ?? g.players).filter(isBot)) {
          timers.push(setTimeout(() => {
            if (got.has(id)) return;
            const value = bot(id, got);
            if (value === undefined) return;
            got.set(id, value);
            h.bump(r);
            if (complete()) setTimeout(finish, 350 * SPEED);
          }, (1200 + Math.random() * Math.min(ms * 0.4, 5000)) * SPEED));
        }
      }
      const timer = setTimeout(finish, ms * SPEED);
      g.wakers.add(finish);
      await done;
      clearTimeout(timer);
      timers.forEach(clearTimeout);
      g.wakers.delete(finish);
      g.onInput = null;
      alive();
      return got;
    },
    /** Le premier qui écrit la bonne réponse dans le chat (check renvoie une valeur vraie). */
    async race({ ms, who = null, check }) {
      let win = null;
      p.listen((me, text) => {
        if (win || (who && !who.includes(me))) return false;
        const value = check(me, text);
        if (!value) return false;
        win = { id: me, text, value, at: Date.now() };
        wakeAll(g);
        return true;
      });
      try { await p.until(ms); } finally { p.unlisten(); }
      return win;
    },
    humansHere,
    guild: () => h.client?.()?.guilds.cache.get(r.guildId ?? '') ?? null,
  };
  return p;
}

async function finish(r, g, h, out = {}) {
  const podium = Object.entries(g.scores).sort((a, b) => b[1] - a[1]);
  const humans = g.players.filter((id) => !isBot(id));
  const winners = (out.winners ?? (podium[0] && podium[0][1] > 0 ? [podium[0][0]] : [])).filter((id) => !isBot(id));
  r.game = { kind: 'fin', from: 'party', party: g.game, podium, names: g.names, title: out.title ?? null, text: out.text ?? null, at: Date.now() };
  if (out.say !== false) h.say(r, out.title ?? (podium[0] && podium[0][1] > 0 ? `🏆 ${g.names[podium[0][0]] ?? h.nameOf(r, podium[0][0])} gagne ${PARTY[g.game].name} !` : `${PARTY[g.game].name} : partie terminée.`), 'good');
  if (winners.length) for (const w of winners) h.reward(r, w, out.prize ?? PARTY[g.game].prize ?? 60, `Arcade : ${PARTY[g.game].name}`, humans, { solo: humans.length < 2 });
  else playedGame(r.guildId, humans).catch(() => {});
  h.bump(r);
}

/** Branche les jeux de soirée dans l'arcade. h : { say, bump, nameOf, reward, client } */
export function registerParty(GAMES, h) {
  GAMES.party = {
    min: 1,
    label: (g) => PARTY[g.game].name,
    check(r, body) {
      const spec = PARTY[body.party];
      if (!spec) return 'Jeu inconnu.';
      const humans = r.players.size;
      if (humans + (spec.bots && body.bots ? 99 : 0) < spec.min) return `Il faut au moins ${spec.min} joueurs dans l’arcade${spec.bots ? ' (ou coche « compléter avec des bots »)' : ''}.`;
      if (spec.max && humans > spec.max) return `${spec.max} joueurs maximum pour ce jeu.`;
      return null;
    },
    start(r, host, body) {
      const spec = PARTY[body.party];
      const humans = [...r.players.keys()];
      const bots = spec.bots && body.bots ? makeBots(Math.max(0, (spec.fill ?? spec.min) - humans.length)) : [];
      const names = Object.fromEntries([...humans.map((id) => [id, h.nameOf(r, id)]), ...bots.map((id) => [id, botName(id)])]);
      const g = {
        kind: 'party', game: body.party, host, players: [...humans, ...bots], names, scores: {}, cards: {}, wakers: new Set(),
        screen: { title: `${spec.emoji} ${spec.name}`, blocks: [{ t: 'text', text: 'Préparation de la partie…', cls: 'big' }] },
        opts: { theme: String(body.theme ?? '').slice(0, 60), choice: String(body.choice ?? '').slice(0, 30) }, over: false, stopped: false, imageKeys: [],
      };
      setTimeout(() => run(r, g, h), 0);
      return g;
    },
    view(g, me) {
      const spec = PARTY[g.game];
      const screen = typeof g.screen === 'function' ? g.screen(me) : g.screen;
      return {
        kind: 'party', game: g.game, name: spec.name, emoji: spec.emoji, screen, card: g.cards[me] ?? null, scores: g.scores, names: g.names,
        players: g.players, you: g.players.includes(me), host: g.host,
      };
    },
    over: (g) => g.over,
    act(r, g, me, body) {
      if (PARTY[g.game].open && !g.players.includes(me) && r.players.has(me)) { g.players.push(me); g.names[me] = h.nameOf(r, me); }
      return Boolean(g.onInput?.(me, body) || g.extra?.(me, body));
    },
    /** Un message du chat : true s'il est gardé par le jeu (bonne réponse cachée, nuit, joueur mort…). */
    chat(r, g, me, text) {
      if (PARTY[g.game].open && !g.players.includes(me)) { g.players.push(me); g.names[me] = h.nameOf(r, me); }
      return Boolean(g.chatHook?.(me, text));
    },
    stop(g) { g.stopped = true; wakeAll(g); },
    tick(r, g) {
      if (!r.players.size && !g.stopped) GAMES.party.stop(g);
      return false;
    },
  };
}

async function run(r, g, h) {
  const p = context(r, g, h);
  try {
    const out = await PARTY[g.game].run(p);
    if (r.game === g && !g.stopped) await finish(r, g, h, out ?? {});
  } catch (err) {
    if (err !== STOP) {
      console.warn(`[arcade] ${g.game} :`, err);
      if (r.game === g) { h.say(r, `😕 ${PARTY[g.game].name} a rencontré un problème, partie arrêtée.`); r.game = null; h.bump(r); }
    }
  } finally {
    g.over = true;
    g.onInput = null;
    g.chatHook = null;
    for (const key of g.imageKeys) images.delete(key);
  }
}

// ------------------------------------------------------------------ Petits outils communs
export const T = (text, cls = '') => ({ t: 'text', text, cls });
/** Questions à 4 choix jouées tous ensemble : +1 la bonne réponse, +1 la plus rapide. */
export async function quizRounds(p, questions, { ms = 20_000, title = '❓' } = {}) {
  for (const [i, q] of questions.entries()) {
    const endsAt = Date.now() + ms;
    const screen = (right = null) => (me) => ({
      title: `${title} ${i + 1}/${questions.length}`, endsAt: right === null ? endsAt : null, sub: right === null ? `${p.g.live?.size ?? 0} réponse(s)` : '',
      blocks: [T(q.question, 'big'), ...(q.img ? [{ t: 'img', src: q.img }] : []), { t: 'choices', options: q.choix, mine: p.g.live?.get(me)?.i ?? null, right }],
    });
    p.show(screen());
    const got = await p.collect({ ms, accept: (me, b) => (b.type === 'pick' && b.i >= 0 && b.i < q.choix.length ? { i: Number(b.i), at: Date.now() } : undefined) });
    const good = [...got.entries()].filter(([, a]) => a.i === q.bonne).sort((a, b) => a[1].at - b[1].at);
    for (const [id] of got) p.points(id, 0);
    good.forEach(([id], k) => p.points(id, k === 0 ? 2 : 1));
    p.g.live = got;
    p.show(screen(q.bonne));
    p.say(`✅ ${q.choix[q.bonne]}${good.length ? ` · ⚡ ${p.name(good[0][0])} le plus rapide` : ' · personne 😅'}`);
    await p.sleep(3500);
  }
}

// =====================================================================
// LOT A : jeux de mots et de réflexion
// =====================================================================

PARTY.petitbac = {
  emoji: '📝', name: 'Petit Bac', desc: 'Une lettre, 5 catégories, l’IA vérifie', min: 1, open: true, prize: 60,
  async run(p) {
    const { CATEGORIES, LETTERS } = PARTY_DATA;
    for (let round = 1; round <= 3; round++) {
      const letter = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      const cats = shuffle(CATEGORIES).slice(0, 5);
      const endsAt = Date.now() + 75_000;
      p.show((me) => ({
        title: `📝 Manche ${round}/3 · lettre ${letter}`, endsAt, sub: `${p.g.live?.size ?? 0} grille(s) rendue(s)`,
        blocks: [T(letter, 'huge'), { t: 'form', fields: cats, done: p.g.live?.has(me) ?? false, button: 'Rendre ma grille' }],
      }));
      const got = await p.collect({ ms: 75_000, who: null, accept: (me, b) => (b.type === 'form' && Array.isArray(b.values) ? cats.map((_, i) => String(b.values[i] ?? '').trim().slice(0, 40)) : undefined) });
      p.show({ title: `📝 Manche ${round}/3 · lettre ${letter}`, blocks: [T('L’IA vérifie les réponses…', 'big')] });
      const entries = [...got.entries()];
      const table = entries.map(([id, a]) => `${id} : ${cats.map((c, i) => `${c} = ${a[i] || '-'}`).join(' ; ')}`).join('\n');
      const verdict = entries.length ? await ask({
        system: 'Tu es l’arbitre d’un Petit Bac en français. Tu es juste : la réponse doit commencer par la lettre et correspondre vraiment à la catégorie (orthographe approximative acceptée).',
        prompt: `Lettre : ${letter}\nCatégories : ${cats.join(', ')}\nRéponses (identifiant : catégorie = réponse) :\n${table}\n\nPour chaque joueur, donne la liste des 5 validités (true/false) dans l'ordre des catégories.`,
        schema: { type: 'object', properties: { joueurs: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, valides: { type: 'array', items: { type: 'boolean' } } }, required: ['id', 'valides'] } } }, required: ['joueurs'] },
      }, 20_000) : null;
      const valid = (id, i) => {
        const answer = got.get(id)?.[i] ?? '';
        if (!answer || norm(answer)[0] !== letter.toLowerCase()) return false;
        const ai = verdict?.joueurs?.find((j) => j.id === id)?.valides?.[i];
        return ai === undefined ? answer.length >= 2 : Boolean(ai);
      };
      const lines = entries.map(([id, a]) => {
        let pts = 0;
        const cells = cats.map((c, i) => {
          if (!valid(id, i)) return `~~${a[i] || '—'}~~`;
          const shared = entries.some(([o]) => o !== id && valid(o, i) && norm(got.get(o)[i]) === norm(a[i]));
          pts += shared ? 1 : 2;
          return shared ? `${a[i]} (1)` : `**${a[i]}** (2)`;
        });
        p.points(id, pts);
        return `**${p.name(id)}** +${pts} · ${cells.join(' · ')}`;
      });
      p.show({ title: `✅ Manche ${round} · lettre ${letter}`, blocks: [{ t: 'list', items: lines.length ? lines : ['Personne n’a répondu 😴'] }] });
      await p.sleep(9000);
    }
  },
};

PARTY.actionverite = {
  emoji: '🎲', name: 'Action ou vérité', desc: 'Défis gentils validés par les autres', min: 2, open: false, prize: 40,
  async run(p) {
    const { ACTIONS, TRUTHS } = PARTY_DATA;
    const rounds = Math.min(12, p.players.length * 2);
    let last = null;
    for (let round = 1; round <= rounds; round++) {
      const here = p.humansHere();
      if (here.length < 2) break;
      const player = pick(here.filter((id) => id !== last)) ?? pick(here);
      last = player;
      let endsAt = Date.now() + 25_000;
      p.show((me) => ({
        title: `🎲 Tour ${round}/${rounds}`, endsAt,
        blocks: [T(`${p.name(player)} : action ou vérité ?`, 'big'), ...(me === player ? [{ t: 'buttons', items: [{ id: 'action', label: '🔥 Action', cls: 'red' }, { id: 'verite', label: '💬 Vérité' }] }] : [T('Il ou elle choisit…', 'small')])],
      }));
      const choice = (await p.collect({ ms: 25_000, who: [player], accept: (me, b) => (b.type === 'btn' && ['action', 'verite'].includes(b.id) ? b.id : undefined) })).get(player) ?? pick(['action', 'verite']);
      p.show({ title: `🎲 Tour ${round}/${rounds}`, blocks: [T('L’IA prépare le défi…', 'big')] });
      const ai = await ask({
        system: 'Tu animes un action ou vérité bienveillant entre amis sur Discord (15-25 ans). Jamais rien de dangereux, sexuel, humiliant ou qui force à révéler une info privée. Faisable depuis Discord.',
        prompt: `Donne ${choice === 'action' ? 'une ACTION drôle à faire sur Discord ou dans l’arcade (écrire dans le chat, faire un vocal court, changer son pseudo…)' : 'une question VÉRITÉ drôle mais pas gênante'} pour ${p.name(player)}. Une phrase.`,
        schema: { type: 'object', properties: { defi: { type: 'string' } }, required: ['defi'] },
      }, 12_000);
      const challenge = ai?.defi || pick(choice === 'action' ? ACTIONS : TRUTHS);
      endsAt = Date.now() + 75_000;
      const judges = p.players.filter((id) => id !== player);
      p.show((me) => ({
        title: choice === 'action' ? '🔥 ACTION' : '💬 VÉRITÉ', endsAt, sub: `${p.g.live?.size ?? 0}/${judges.length} vote(s)`,
        blocks: [T(`${p.name(player)} : ${challenge}`, 'big'), T(me === player ? 'Réponds dans le chat (ou en vocal) : les autres valident.' : 'Validé ?', 'small'),
          ...(me !== player ? [{ t: 'buttons', items: [{ id: 'yes', label: '👍 Validé', cls: 'green' }, { id: 'no', label: '👎 Pas validé' }], chosen: p.g.live?.get(me) === true ? 'yes' : p.g.live?.get(me) === false ? 'no' : null }] : [])],
      }));
      const votes = await p.collect({ ms: 75_000, who: judges, accept: (me, b) => (b.type === 'btn' && ['yes', 'no'].includes(b.id) ? b.id === 'yes' : undefined) });
      const yes = [...votes.values()].filter(Boolean).length;
      const ok = yes >= votes.size - yes;
      p.points(player, ok ? 1 : 0);
      p.say(ok ? `✅ Validé pour ${p.name(player)} (+1) · 👍 ${yes} / 👎 ${votes.size - yes}` : `❌ Pas validé pour ${p.name(player)} · 👍 ${yes} / 👎 ${votes.size - yes}`);
      await p.sleep(2500);
    }
  },
};

PARTY.quizserveur = {
  emoji: '🧭', name: 'Quiz du serveur', desc: 'Des questions sur le serveur et ses membres', min: 1, open: true, prize: 60,
  async run(p) {
    const guild = p.guild();
    if (!guild) return { title: 'Le quiz du serveur se joue depuis un serveur.', say: true };
    const facts = await within(PARTY_DATA.serverFacts(guild), 10_000);
    if (!facts) return { title: 'Impossible de lire les infos du serveur.' };
    p.show({ title: '🧭 Quiz du serveur', blocks: [T(`L’IA prépare des questions sur ${facts.nom}…`, 'big')] });
    const data = await ask({
      system: 'Tu crées un quiz amusant sur un serveur Discord, à partir de faits réels. Uniquement des questions dont la réponse est dans les faits.',
      prompt: `Faits sur le serveur :\n${JSON.stringify(facts)}\n\nCrée 6 questions à 4 choix (une seule bonne réponse, choix plausibles).`,
      schema: { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, choix: { type: 'array', items: { type: 'string' } }, bonne: { type: 'integer' } }, required: ['question', 'choix', 'bonne'] } } }, required: ['questions'] },
    }, 20_000);
    let questions = (data?.questions ?? []).filter((q) => q.choix?.length === 4 && q.bonne >= 0 && q.bonne < 4).slice(0, 6);
    if (questions.length < 3) {
      const mk = (question, answer, wrong) => { const choix = shuffle([answer, ...wrong].map(String)); return { question, choix, bonne: choix.indexOf(String(answer)) }; };
      questions = [
        mk(`En quelle année ${facts.nom} a été créé ?`, facts.cree_en, [facts.cree_en - 1, facts.cree_en + 1, facts.cree_en - 2]),
        mk(`Combien de membres environ sur ${facts.nom} ?`, facts.membres, [Math.round(facts.membres * 1.6) + 3, Math.max(2, Math.round(facts.membres * 0.5)), facts.membres + 17]),
        mk(`Combien de boosts a ${facts.nom} ?`, facts.boosts, [facts.boosts + 2, facts.boosts + 5, Math.max(0, facts.boosts - 1) === facts.boosts ? facts.boosts + 9 : Math.max(0, facts.boosts - 1)]),
      ];
    }
    await quizRounds(p, questions, { ms: 20_000, title: '🧭' });
  },
};

PARTY.quiditca = {
  emoji: '🗨️', name: 'Qui a dit ça ?', desc: 'Retrouvez l’auteur de vrais messages', min: 1, open: true, prize: 60,
  async run(p) {
    const guild = p.guild();
    if (!guild) return { title: 'Ce jeu se joue depuis un serveur.' };
    p.show({ title: '🗨️ Qui a dit ça ?', blocks: [T('Je fouille les messages du serveur…', 'big')] });
    const good = (m) => !m.author.bot && m.content && m.content.length >= 25 && m.content.length <= 300 && !/https?:\/\/|<@|<#|<:/.test(m.content);
    // Le salon de l'Activité d'abord, puis les salons écrits les plus actifs
    const texts = [guild.channels.cache.get(p.r.id), ...guild.channels.cache.filter((c) => c.isTextBased?.() && !c.isThread?.() && c.lastMessageId && c.viewable).sort((a, b) => (BigInt(b.lastMessageId) > BigInt(a.lastMessageId) ? 1 : -1)).values()].filter(Boolean).slice(0, 5);
    let pool = [];
    for (const c of texts) {
      const fetched = await within(c.messages?.fetch({ limit: 100 }), 6000);
      pool.push(...[...(fetched?.values() ?? [])].filter(good));
      if (new Set(pool.map((m) => m.author.id)).size >= 4 && pool.length >= 8) break;
    }
    pool = shuffle(pool);
    const authors = [...new Set(pool.map((m) => m.author.id))];
    if (authors.length < 3) return { title: 'Pas assez de messages variés sur le serveur (il faut 3 auteurs au moins).' };
    const names = new Map(pool.map((m) => [m.author.id, m.member?.displayName ?? m.author.globalName ?? m.author.username]));
    const questions = pool.slice(0, 6).map((m) => {
      const options = shuffle([m.author.id, ...shuffle(authors.filter((id) => id !== m.author.id)).slice(0, 3)]);
      return { question: `« ${m.content.replace(/\n/g, ' ').slice(0, 220)} »`, choix: options.map((id) => names.get(id)), bonne: options.indexOf(m.author.id) };
    });
    await quizRounds(p, questions, { ms: 15_000, title: '🗨️' });
  },
};

PARTY.rebus = {
  emoji: '🧩', name: 'Rébus en emojis', desc: 'Devinez le titre caché', min: 1, open: true, prize: 60,
  async run(p) {
    const theme = ['films', 'disney', 'series', 'anime', 'jeux', 'rapfr'].includes(p.opts.choice) ? p.opts.choice : 'tout';
    p.show({ title: '🧩 Rébus', blocks: [T('L’IA dessine les rébus en emojis…', 'big')] });
    const pool = shuffle(await within(REBUS_PARTS.answersFor(theme), 15_000) ?? []).slice(0, 14);
    const items = (await within(REBUS_PARTS.makeRebus(pool), 30_000) ?? []).slice(0, 8);
    if (items.length < 3) return { title: 'L’IA n’a pas réussi à faire les rébus, réessaie.' };
    for (const [i, item] of items.entries()) {
      const endsAt = Date.now() + 35_000;
      const started = Date.now();
      let hint = false;
      const screen = () => ({ title: `🧩 Rébus ${i + 1}/${items.length} · ${item.kind}`, endsAt, sub: 'Écris ta réponse dans le chat · +2, rapide +1', blocks: [T(item.emojis, 'huge'), ...(hint ? [T(`💡 ${maskText(item.answer)}${item.extra ? ` · ${item.extra}` : ''}`, 'mono')] : [])] });
      p.show(screen);
      let win = await p.race({ ms: 17_500, check: (me, text) => REBUS_PARTS.guesses(item, text) });
      if (!win) { hint = true; p.show(screen); win = await p.race({ ms: 17_500, check: (me, text) => REBUS_PARTS.guesses(item, text) }); }
      if (win) p.points(win.id, win.at - started < 10_000 ? 3 : 2);
      p.say(win ? `✅ ${p.name(win.id)} trouve : ${item.answer}` : `⌛ C’était : ${item.answer}`, win ? 'good' : 'info');
      p.show({ title: `🧩 Rébus ${i + 1}/${items.length}`, blocks: [T(item.emojis, 'huge'), T(item.answer, 'big')] });
      await p.sleep(3500);
    }
  },
};

PARTY.fans = {
  emoji: '📊', name: 'Plus ou moins de fans', desc: 'Quel artiste a le plus de fans ?', min: 1, open: true, prize: 50,
  async run(p) {
    const theme = ['rapfr', 'monde'].includes(p.opts.choice) ? p.opts.choice : 'tout';
    p.show({ title: '📊 Plus ou moins de fans', blocks: [T('Je choisis les artistes…', 'big')] });
    const pool = await within(FANS_PARTS.candidates(theme), 15_000) ?? [];
    if (pool.length < 10) return { title: 'Deezer ne répond pas, réessaie dans un moment.' };
    const run = { pool, seen: new Set(), streak: 0 };
    let left = null;
    for (let t = 0; t < 10 && !left; t++) { const id = pick(pool); run.seen.add(id); left = await within(FANS_PARTS.artistInfo(id), 6000); }
    if (!left) return { title: 'Deezer ne répond pas, réessaie dans un moment.' };
    const img = (a) => (a.picture ? `api/img?u=${encodeURIComponent(a.picture)}` : null);
    const fmt = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));
    for (let round = 1; round <= 10; round++) {
      run.streak = round;
      const right = await within(FANS_PARTS.nextArtist(run, left), 10_000);
      if (!right) break;
      const endsAt = Date.now() + 20_000;
      const duo = (reveal) => ({ t: 'duo', items: [{ img: img(left), name: left.name, value: `${fmt(left.fans)} fans` }, { img: img(right), name: right.name, value: reveal ? `${fmt(right.fans)} fans` : '❓ fans' }] });
      p.show((me) => ({
        title: `📊 Manche ${round}/10`, endsAt, sub: `${p.g.live?.size ?? 0} vote(s)`,
        blocks: [T(`${right.name} a-t-il plus ou moins de fans que ${left.name} sur Deezer ?`, 'big'), duo(false),
          { t: 'buttons', items: [{ id: 'plus', label: '⬆️ Plus', cls: 'green' }, { id: 'moins', label: '⬇️ Moins', cls: 'red' }], chosen: p.g.live?.get(me) ?? null }],
      }));
      const got = await p.collect({ ms: 20_000, accept: (me, b) => (b.type === 'btn' && ['plus', 'moins'].includes(b.id) ? b.id : undefined) });
      const answer = right.fans >= left.fans ? 'plus' : 'moins';
      const good = [...got.entries()].filter(([, v]) => v === answer).map(([id]) => id);
      for (const [id] of got) p.points(id, good.includes(id) ? 1 : 0);
      p.show({ title: `📊 Manche ${round}/10`, blocks: [T(answer === 'plus' ? '⬆️ Plus de fans !' : '⬇️ Moins de fans !', 'big'), duo(true), T(good.length ? `Bien joué : ${good.map(p.name).join(', ')}` : 'Personne n’a trouvé 😅', 'small')] });
      await p.sleep(4500);
      left = right;
    }
  },
};

PARTY.chasse = {
  emoji: '🗺️', name: 'Chasse au trésor', desc: '3 énigmes, 3 morceaux de carte', min: 1, open: true, prize: 80,
  async run(p) {
    p.show({ title: '🗺️ Chasse au trésor', blocks: [T('Le capitaine cache le trésor…', 'big')] });
    const ai = await ask({
      system: 'Tu écris des énigmes de pirate en français, courtes et justes, dont la réponse est UN seul mot courant (sans article).',
      prompt: 'Écris 3 énigmes de difficulté croissante pour une chasse au trésor.',
      schema: { type: 'object', properties: { enigmes: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } }, required: ['q', 'a'] } } }, required: ['enigmes'] },
    }, 15_000);
    const riddles = (ai?.enigmes ?? []).filter((x) => x.q && x.a && !/\s/.test(x.a.trim())).slice(0, 3);
    while (riddles.length < 3) riddles.push(pick(defis.RIDDLES.filter((x) => !riddles.includes(x))));
    const pieces = ['🧩', '🧩', '🧩'];
    for (const [i, rd] of riddles.entries()) {
      const endsAt = Date.now() + 90_000;
      const answer = norm(rd.a);
      p.show({ title: `📜 Énigme ${i + 1}/3`, endsAt, sub: 'Écris ta réponse (un mot) dans le chat', blocks: [T(rd.q, 'quote'), T('▢ '.repeat(answer.length).trim() + ` (${answer.length} lettres)`, 'mono'), T(`Carte : ${pieces.map((x, k) => (k < i ? '🗺️' : x)).join(' ')}`, 'small')] });
      const win = await p.race({ ms: 90_000, check: (me, text) => norm(text) === answer || norm(text).replace(/ /g, '') === answer.replace(/ /g, '') });
      if (win) p.points(win.id, 1);
      p.say(win ? `🧩 ${p.name(win.id)} trouve ${rd.a.toUpperCase()} et gagne un morceau de carte !` : `⌛ Personne… c’était ${rd.a.toUpperCase()}.`, win ? 'good' : 'info');
      await p.sleep(2500);
    }
  },
};

PARTY.motscroises = {
  emoji: '📰', name: 'Mots croisés de l’IA', desc: '6 définitions, des lettres qui se dévoilent', min: 1, open: true, prize: 60,
  async run(p) {
    const theme = p.opts.theme;
    p.show({ title: '📰 Mots croisés', blocks: [T('L’IA prépare la grille…', 'big')] });
    const ai = await ask({
      system: 'Tu crées des mots croisés en français. Mots courants de 4 à 9 lettres, sans accent ni espace ni tiret, en minuscules. Définitions courtes façon mots fléchés.',
      prompt: `Thème : ${theme || 'la mer et les pirates'}. Donne 6 mots et leurs définitions.`,
      schema: { type: 'object', properties: { mots: { type: 'array', items: { type: 'object', properties: { mot: { type: 'string' }, def: { type: 'string' } }, required: ['mot', 'def'] } } }, required: ['mots'] },
    }, 15_000);
    let words = (ai?.mots ?? []).map((w) => ({ mot: norm(w.mot).replace(/ /g, ''), def: w.def })).filter((w) => /^[a-z]{4,9}$/.test(w.mot)).slice(0, 6);
    if (words.length < 4) words = [{ mot: 'boussole', def: 'Elle indique le nord' }, { mot: 'galion', def: 'Gros navire espagnol chargé d’or' }, { mot: 'ancre', def: 'On la jette pour s’arrêter' }, { mot: 'vigie', def: 'Il guette du haut du mât' }, { mot: 'tresor', def: 'Ce que cherche tout pirate' }, { mot: 'recif', def: 'Rochers à fleur d’eau' }];
    words.forEach((w) => { w.shown = []; w.by = null; });
    const endsAt = Date.now() + 6 * 60_000;
    const key = words.map((w) => Math.floor(w.mot.length / 2));
    const leftPad = Math.max(...key);
    const screen = (all = false) => ({
      title: `📰 Mots croisés${theme ? ` · ${theme}` : ''}`, endsAt: all ? null : endsAt, sub: all ? '' : 'Écris les mots dans le chat · une lettre se dévoile toutes les 30 s',
      blocks: [
        { t: 'grid', rows: words.map((w, i) => [...Array(leftPad - key[i]).fill(null), ...[...w.mot].map((c, j) => ({ c: all || w.by || w.shown.includes(j) ? c.toUpperCase() : '', key: j === key[i], n: j === 0 ? i + 1 : null }))]) },
        { t: 'list', items: words.map((w, i) => `**${i + 1}.** ${w.def} (${w.mot.length})${w.by ? ` · ✅ ${p.name(w.by)}` : ''}`) },
      ],
    });
    p.show(screen());
    p.listen((me, text) => {
      const t = norm(text).replace(/ /g, '');
      const w = words.find((x) => !x.by && x.mot === t);
      if (!w) return false;
      w.by = me;
      p.points(me, 1);
      p.say(`✅ ${p.name(me)} trouve ${w.mot.toUpperCase()}`, 'good');
      p.show(screen());
      if (words.every((x) => x.by)) p.next();
      return true;
    });
    while (Date.now() < endsAt && !words.every((x) => x.by)) {
      await p.until(Math.min(30_000, endsAt - Date.now()));
      for (const w of words) {
        if (w.by) continue;
        const hidden = [...w.mot].map((_, j) => j).filter((j) => !w.shown.includes(j));
        if (hidden.length > 1) w.shown.push(pick(hidden));
      }
      p.show(screen());
    }
    p.unlisten();
    p.show(screen(true));
    await p.sleep(5000);
  },
};

PARTY.escape = {
  emoji: '🗝️', name: 'Escape game', desc: '3 salles, 10 minutes, en équipe', min: 1, open: true, prize: 80,
  async run(p) {
    const theme = p.opts.theme;
    p.show({ title: '🗝️ Escape game', blocks: [T('Les portes se referment…', 'big')] });
    const ai = theme ? await ask({
      system: 'Tu écris un petit escape game en français : 3 salles, chacune avec une énigme logique dont la réponse est un mot ou un nombre court, et un indice.',
      prompt: `Thème : ${theme}.`,
      schema: { type: 'object', properties: { titre: { type: 'string' }, intro: { type: 'string' }, salles: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, texte: { type: 'string' }, reponse: { type: 'string' }, indice: { type: 'string' } }, required: ['nom', 'texte', 'reponse', 'indice'] } } }, required: ['titre', 'intro', 'salles'] },
    }, 20_000) : null;
    const story = ai?.salles?.length >= 3 && ai.salles.every((s) => norm(s.reponse).length <= 20) ? { ...ai, salles: ai.salles.slice(0, 3) } : defis.ESCAPE;
    let deadline = Date.now() + 10 * 60_000;
    p.show({ title: `🗝️ ${story.titre}`, endsAt: deadline, blocks: [T(story.intro, 'quote'), T('Écrivez vos réponses dans le chat. Un indice coûte 1 minute.', 'small')] });
    await p.sleep(6000);
    for (const [i, room] of story.salles.entries()) {
      let hint = false;
      const screen = () => ({ title: `🚪 Salle ${i + 1}/3 · ${room.nom}`, endsAt: deadline, blocks: [T(room.texte, 'quote'), ...(hint ? [T(`💡 ${room.indice}`, 'small')] : [{ t: 'buttons', items: [{ id: 'hint', label: '💡 Indice (-1 min)' }] }])] });
      p.show(screen);
      p.onButton((me, b) => {
        if (b.type !== 'btn' || b.id !== 'hint' || hint) return false;
        hint = true;
        deadline -= 60_000;
        p.say(`💡 ${p.name(me)} demande un indice (-1 min)`);
        p.show(screen);
        return true;
      });
      const answer = norm(room.reponse);
      let win = null;
      while (!win && Date.now() < deadline) win = await p.race({ ms: Math.max(1000, deadline - Date.now()), check: (me, text) => norm(text) === answer || norm(text).replace(/ /g, '') === answer.replace(/ /g, '') });
      p.onButton(null);
      if (!win) return { title: `🌊 L’eau a tout envahi… La réponse était « ${room.reponse} ».`, winners: [] };
      p.points(win.id, 1);
      p.say(`🔓 ${p.name(win.id)} ouvre la porte : ${room.reponse} !`, 'good');
      await p.sleep(2500);
    }
    return { title: '🏝️ Vous êtes libres !', text: 'Tout l’équipage s’est échappé à temps.', winners: p.humans() };
  },
};
