// Jeux de soirée à rôles secrets, dans l'arcade : chacun voit son rôle sur son propre écran (plus de MP).
// Loup-garou, l'imposteur, Undercover, et l'histoire dont vous êtes les héros.
import { isBot } from '../games/bots.js';
import { ROLES } from '../games/loupgarou.js';
import { IMPOSTOR_PARTS } from '../games/imposteur.js';
import { STORY_THEMES } from '../games/histoire.js';
import { PARTY, T, ask, norm, pick, shuffle, within } from './party.js';

/** Le plus voté (égalité : null, ou au hasard si tie = 'random'). */
function tally(votes, tie = null) {
  const count = new Map();
  for (const v of votes.values()) if (v) count.set(v, (count.get(v) ?? 0) + 1);
  const sorted = [...count.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  if (sorted[1] && sorted[1][1] === sorted[0][1]) return tie === 'random' ? pick(sorted.filter((x) => x[1] === sorted[0][1]))[0] : null;
  return sorted[0][0];
}
const counts = (votes) => { const c = {}; for (const v of votes?.values() ?? []) if (v) c[v] = (c[v] ?? 0) + 1; return c; };
/** Vote sur des joueurs : chacun voit en direct qui a voté pour qui (sauf votes secrets, show = false). */
const voteBlock = (p, ids, me, { label = 'Voter', show = true, lock = false } = {}) => {
  const voters = {};
  if (show) for (const [who, target] of p.g.live ?? []) if (typeof target === 'string') (voters[target] ??= []).push({ id: who, name: p.name(who) });
  return { t: 'vote', ids, names: Object.fromEntries(ids.map((id) => [id, p.name(id)])), mine: p.g.live?.get(me) ?? null, counts: show ? counts(p.g.live) : null, voters: show ? voters : null, label, lock };
};

// =====================================================================
// LOUP-GAROU
// =====================================================================
const NIGHT = [
  'La nuit tombe sur le village. Tout le monde ferme les yeux… Les loups-garous se réveillent.',
  'Le soleil disparaît derrière les collines. Le village s’endort, mais des yeux jaunes s’ouvrent dans le noir.',
  'Une brume épaisse recouvre les rues. Les bougies s’éteignent. Les loups sortent chasser.',
];
PARTY.loupgarou = {
  emoji: '🐺', name: 'Loup-garou', desc: 'Rôles secrets sur ton écran, nuits et votes', min: 5, fill: 6, bots: true, prize: 80,
  async run(p) {
    const ids = shuffle(p.players);
    const n = ids.length;
    const wolves = n >= 11 ? 3 : n >= 7 ? 2 : 1;
    const deck = [...Array(wolves).fill('loup'), 'voyante', ...(n >= 6 ? ['sorciere'] : []), ...(n >= 7 ? ['chasseur'] : [])];
    while (deck.length < n) deck.push('villageois');
    const role = Object.fromEntries(ids.map((id, i) => [id, deck[i]]));
    const alive = new Set(ids);
    const visions = {};
    const potions = { life: true, death: true };
    const wolfIds = () => ids.filter((id) => role[id] === 'loup' && alive.has(id));
    const living = () => ids.filter((id) => alive.has(id));
    const cardFor = (id) => {
      const R = ROLES[role[id]];
      const mates = role[id] === 'loup' ? ids.filter((x) => role[x] === 'loup' && x !== id).map(p.name) : [];
      return {
        emoji: R.emoji, title: R.name, color: R.team === 'loups' ? 'red' : 'green', img: `jeux/${role[id]}.gif`,
        text: [R.desc, mates.length ? `🐺 Ta meute : ${mates.join(', ')}` : '', visions[id]?.length ? `🔮 Visions : ${visions[id].join(' · ')}` : '', role[id] === 'sorciere' ? `🧪 Potions : ${potions.life ? 'vie ✅' : 'vie ❌'} · ${potions.death ? 'mort ✅' : 'mort ❌'}` : '', alive.has(id) ? '' : '💀 Tu es mort : tu regardes en silence.'].filter(Boolean).join('\n'),
      };
    };
    const refreshCards = () => { for (const id of ids) p.card(id, cardFor(id)); };
    refreshCards();
    let night = true;
    // Les morts ne parlent plus ; la nuit, tout le village se tait
    p.listen((me) => !alive.has(me) || night);
    const lgRules = ['Chaque nuit, les loups-garous choisissent une victime ; la voyante découvre un rôle ; la sorcière peut sauver ou empoisonner.', 'Le jour, le village débat puis vote pour éliminer un suspect. Le chasseur qui meurt tire une dernière flèche.', 'Le village gagne quand tous les loups sont morts ; les loups gagnent quand ils sont aussi nombreux que les villageois.'];
    p.show({ title: '🐺 Loup-garou · les règles', endsAt: Date.now() + 22_000, blocks: [T(`${n} joueurs · ${wolves} loup${wolves > 1 ? 's' : ''} parmi vous.`, 'big'), { t: 'list', items: lgRules }, T('Regarde ton rôle en haut de l’écran. Ne le montre à personne !', 'small')], say: `Bienvenue au village. ${n} joueurs, dont ${wolves} loup${wolves > 1 ? 's' : ''}. ${lgRules.join(' ')}` });
    await p.sleep(22_000);
    const reveal = (id) => `${p.name(id)} était ${ROLES[role[id]].emoji} ${ROLES[role[id]].name}`;
    const winner = () => {
      const w = wolfIds().length;
      if (!w) return 'village';
      if (w >= living().length - w) return 'loups';
      return null;
    };
    const hunter = async (id) => {
      if (role[id] !== 'chasseur') return [];
      const targets = living();
      if (!targets.length) return [];
      const endsAt = Date.now() + 25_000;
      p.show((me) => ({ title: '🏹 Le chasseur tire sa dernière flèche', endsAt, blocks: [T(`${p.name(id)} était chasseur !`, 'big'), ...(me === id ? [voteBlock(p, targets, me, { label: 'Tirer', show: false })] : [T('Il ou elle vise…', 'small')])] }));
      const shot = (await p.collect({ ms: 25_000, who: [id], accept: (me, b) => (b.type === 'vote' && targets.includes(b.id) ? b.id : undefined), bot: () => pick(targets) })).get(id);
      if (!shot) return [];
      alive.delete(shot);
      p.say(`🏹 La flèche touche ${reveal(shot)}`);
      return [shot, ...(await hunter(shot))];
    };
    for (let day = 1; day <= 12; day++) {
      // ---------- Nuit
      night = true;
      p.show({ title: `🌙 Nuit ${day}`, blocks: [T(pick(NIGHT), 'quote'), T('Le village dort…', 'small')] });
      await p.sleep(6000);
      const prey = living().filter((id) => role[id] !== 'loup');
      let endsAt = Date.now() + 40_000;
      p.show((me) => ({
        title: `🌙 Nuit ${day} · les loups chassent`, endsAt,
        blocks: role[me] === 'loup' && alive.has(me) ? [T('Choisis votre victime avec ta meute (tu vois leurs votes).', 'big'), voteBlock(p, prey, me, { label: 'Dévorer' })] : [T('Tu dors… 💤', 'big'), T('Les loups rôdent.', 'small')],
      }));
      const wolfVotes = await p.collect({ ms: 40_000, who: wolfIds(), keep: true, accept: (me, b) => (b.type === 'vote' && prey.includes(b.id) ? b.id : undefined), bot: () => pick(prey), enough: (got) => wolfIds().every((id) => got.has(id)) && new Set(got.values()).size === 1 });
      let victim = tally(wolfVotes, 'random') ?? (wolfIds().length ? pick(prey) : null);
      const seer = living().find((id) => role[id] === 'voyante');
      if (seer) {
        const others = living().filter((id) => id !== seer);
        endsAt = Date.now() + 25_000;
        p.show((me) => ({ title: `🌙 Nuit ${day} · la voyante`, endsAt, blocks: me === seer ? [T('De qui veux-tu voir le rôle ?', 'big'), voteBlock(p, others, me, { label: 'Voir', show: false })] : [T('Tu dors… 💤', 'big'), T('La voyante se réveille.', 'small')] }));
        const seen = (await p.collect({ ms: 25_000, who: [seer], accept: (me, b) => (b.type === 'vote' && others.includes(b.id) ? b.id : undefined), bot: () => pick(others) })).get(seer);
        if (seen) { (visions[seer] ??= []).push(`${p.name(seen)} = ${ROLES[role[seen]].emoji} ${ROLES[role[seen]].name}`); refreshCards(); }
      }
      let poisoned = null;
      const witch = living().find((id) => role[id] === 'sorciere');
      if (witch && (potions.life || potions.death)) {
        endsAt = Date.now() + 30_000;
        const targets = living().filter((id) => id !== witch);
        p.show((me) => ({
          title: `🌙 Nuit ${day} · la sorcière`, endsAt,
          blocks: me === witch ? [
            T(victim ? `Les loups ont attaqué ${p.name(victim)}.` : 'Les loups n’ont attaqué personne.', 'big'),
            { t: 'buttons', items: [...(potions.life && victim ? [{ id: 'save', label: `💚 Sauver ${p.name(victim)}`, cls: 'green' }] : []), { id: 'none', label: 'Ne rien faire' }] },
            ...(potions.death ? [T('Ou empoisonner quelqu’un :', 'small'), voteBlock(p, targets, me, { label: '☠️ Empoisonner', show: false })] : []),
          ] : [T('Tu dors… 💤', 'big'), T('La sorcière prépare ses potions.', 'small')],
        }));
        const choice = (await p.collect({ ms: 30_000, who: [witch], accept: (me, b) => (b.type === 'btn' && (b.id === 'none' || (b.id === 'save' && potions.life && victim)) ? b.id : b.type === 'vote' && potions.death && targets.includes(b.id) ? { kill: b.id } : undefined), bot: () => (Math.random() < 0.3 && potions.life && victim ? 'save' : 'none') })).get(witch);
        if (choice === 'save') { potions.life = false; victim = null; }
        if (choice?.kill) { potions.death = false; poisoned = choice.kill; }
        refreshCards();
      }
      // ---------- Aube
      night = false;
      const dead = [...new Set([victim, poisoned].filter(Boolean))];
      for (const id of dead) alive.delete(id);
      refreshCards();
      const dawn = dead.length ? `Le village se réveille… ${dead.length > 1 ? 'deux corps' : 'un corps'} sur la place.` : 'Le village se réveille… personne n’est mort cette nuit !';
      p.show({ title: `☀️ Jour ${day}`, blocks: [T(dawn, 'big'), { t: 'list', items: dead.map((id) => `💀 ${reveal(id)}`) }], say: `${dawn} ${dead.map(reveal).join('. ')}` });
      for (const id of dead) p.say(`💀 ${reveal(id)}`);
      await p.sleep(6000);
      for (const id of dead) { await hunter(id); refreshCards(); }
      let w = winner();
      if (w) return end(w);
      // ---------- Débat puis vote
      endsAt = Date.now() + 90_000;
      p.show((me) => ({ title: `☀️ Jour ${day} · débat`, endsAt, say: 'Place au débat. Qui est loup ?', sub: `${p.g.live?.size ?? 0}/${living().filter((id) => !isBot(id)).length} prêt(s)`, blocks: [T('Discutez dans le chat (ou en vocal) : qui est loup ?', 'big'), ...(alive.has(me) ? [{ t: 'buttons', items: [{ id: 'ready', label: '🗳️ Prêt à voter' }], chosen: p.g.live?.has(me) ? 'ready' : null }] : [])] }));
      await p.collect({ ms: 90_000, who: living().filter((id) => !isBot(id)), accept: (me, b) => (b.type === 'btn' && b.id === 'ready' ? true : undefined) });
      endsAt = Date.now() + 45_000;
      const voters = living();
      p.show((me) => ({ title: `🗳️ Jour ${day} · vote`, endsAt, sub: `${p.g.live?.size ?? 0}/${voters.length} vote(s)`, blocks: [T('Qui éliminer ?', 'big'), ...(alive.has(me) ? [voteBlock(p, voters.filter((id) => id !== me), me, { label: 'Éliminer' })] : [voteBlock(p, voters, me, { label: 'Éliminer', lock: true })])] }));
      const votes = await p.collect({ ms: 45_000, who: voters, keep: true, accept: (me, b) => (b.type === 'vote' && voters.includes(b.id) && b.id !== me ? b.id : undefined), bot: (id) => pick(voters.filter((x) => x !== id && !(role[id] === 'loup' && role[x] === 'loup'))) });
      const out = tally(votes);
      if (out) {
        alive.delete(out);
        refreshCards();
        p.show({ title: `🗳️ Jour ${day}`, blocks: [T(`Le village élimine ${reveal(out)}`, 'big')], say: `Le village a voté. ${reveal(out)}.` });
        p.say(`⚖️ Le village élimine ${reveal(out)}`);
        await p.sleep(5000);
        await hunter(out);
        refreshCards();
      } else {
        p.say('⚖️ Égalité : personne n’est éliminé.');
        p.show({ title: `🗳️ Jour ${day}`, blocks: [T('Égalité : personne n’est éliminé.', 'big')] });
        await p.sleep(4000);
      }
      w = winner();
      if (w) return end(w);
    }
    return end('village');

    function end(team) {
      const winners = ids.filter((id) => ROLES[role[id]].team === team);
      for (const id of winners) p.points(id, 1);
      p.unlisten();
      return { title: team === 'loups' ? '🐺 Les loups-garous dévorent le village !' : '🧑‍🌾 Le village a éliminé tous les loups !', text: ids.map((id) => `${alive.has(id) ? '' : '💀 '}${p.name(id)} : ${ROLES[role[id]].emoji} ${ROLES[role[id]].name}`).join('\n'), winners, prize: 80 };
    }
  },
};

// =====================================================================
// IMPOSTEUR et UNDERCOVER : même moteur (indices chacun son tour, puis vote)
// =====================================================================
const RULES = {
  imposteur: [
    'Tout le monde reçoit le même mot secret… sauf l’imposteur, qui a un mot proche mais différent. Il ne sait pas qu’il est l’imposteur !',
    'Chacun son tour, donne un indice de 1 à 5 mots sur ton mot, sans le dire. Trop précis, l’imposteur devine ; trop vague, on te soupçonne.',
    'Après chaque tour, votez. Le plus désigné est éliminé (égalité : personne, on refait un tour).',
    'Les civils gagnent s’ils éliminent l’imposteur… sauf s’il devine leur mot en dernière chance. L’imposteur gagne s’il survit jusqu’à ce qu’il ne reste que deux joueurs, ou pendant 6 tours.',
  ],
  undercover: [
    'Les civils ont tous le même mot. Les undercovers ont un mot proche mais différent, et ne savent pas qu’ils sont undercover. Mister White n’a aucun mot : il bluffe.',
    'Chacun son tour, donne un indice de 1 à 5 mots sur ton mot, sans le dire.',
    'Après chaque tour, votez : le plus désigné est éliminé et son rôle est révélé.',
    'Mister White éliminé peut gagner en devinant le mot des civils. Les civils gagnent quand tous les infiltrés sont éliminés ; les infiltrés gagnent s’ils sont aussi nombreux que les civils.',
  ],
};
const feed = (p, history) => ({ t: 'feed', items: history.map((x) => ({ id: x.id, name: p.name(x.id), text: x.text, note: x.note ?? null })) });

async function wordGame(p, { kind }) {
  const label = kind === 'undercover' ? 'Undercover' : 'L’imposteur';
  const ids = shuffle(p.players);
  const n = ids.length;
  const impostors = kind === 'undercover' ? (n >= 7 ? 2 : 1) : 1;
  const white = kind === 'undercover' && n >= 5;
  const maxRounds = kind === 'undercover' ? 7 : 6;
  // Deux mots proches mais jamais identiques
  let pair = await within(IMPOSTOR_PARTS.wordPair('tout'), 15_000);
  if (!pair || norm(pair[0]) === norm(pair[1])) pair = shuffle(pick([['Pizza', 'Burger'], ['Plage', 'Piscine'], ['Coca', 'Pepsi'], ['Chat', 'Chien'], ['Naruto', 'One Piece']]));
  const [civil, other] = pair;
  const spots = shuffle(ids);
  const role = Object.fromEntries(ids.map((id) => [id, 'civil']));
  spots.slice(0, impostors).forEach((id) => { role[id] = 'intrus'; });
  if (white) role[spots[impostors]] = 'white';
  const word = (id) => (role[id] === 'civil' ? civil : role[id] === 'intrus' ? other : null);
  const clues = await within(IMPOSTOR_PARTS.botClues(civil, other), 15_000) ?? { civil: ['connu'], imposteur: ['connu'] };
  const alive = new Set(ids);
  // La même carte pour tous (seul le mot change) : personne ne sait s'il est l'intrus
  for (const id of ids) {
    p.card(id, word(id)
      ? { emoji: '🔤', title: word(id), color: 'gold', img: 'jeux/motsecret.gif', text: kind === 'undercover' ? 'Ton mot secret. Civil ou undercover ? Toi seul ne le sais pas…' : 'Ton mot secret. L’imposteur a un mot proche… et c’est peut-être toi !' }
      : { emoji: '🎩', title: 'Mister White', color: 'red', img: 'jeux/imposteur.gif', text: 'Tu n’as pas de mot : écoute les indices et bluffe. Si tu es éliminé, devine le mot des civils pour gagner.' });
  }
  const rules = RULES[kind];
  const count = kind === 'undercover' ? `${n} joueurs · ${impostors} undercover${impostors > 1 ? 's' : ''}${white ? ' · 1 Mister White' : ''}` : `${n} joueurs · 1 imposteur`;
  p.show({ title: `📜 Les règles · ${label}`, endsAt: Date.now() + 25_000, blocks: [T(count, 'big'), { t: 'list', items: rules }, T('Ton mot est en haut de l’écran. Ne le montre à personne !', 'small')], say: `${label}. ${rules.join(' ')}` });
  await p.sleep(25_000);
  const history = [];
  const team = (id) => (role[id] === 'civil' ? 'civils' : 'infiltres');
  const roleName = (id) => (role[id] === 'civil' ? '🧑 civil' : role[id] === 'intrus' ? (kind === 'undercover' ? '🕶️ undercover' : '🕵️ l’imposteur') : '🎩 Mister White');
  const end = (winnerTeam, why = '') => ({
    title: winnerTeam === 'civils' ? '🧑 Les civils gagnent !' : kind === 'undercover' ? '🕶️ Les infiltrés gagnent !' : '🕵️ L’imposteur gagne !',
    text: `${why}${why ? '\n' : ''}Mot des civils : ${civil} · mot ${kind === 'undercover' ? 'des undercovers' : 'de l’imposteur'} : ${other}\n${ids.map((id) => `${p.name(id)} : ${roleName(id)}`).join('\n')}`,
    winners: ids.filter((id) => team(id) === winnerTeam),
  });
  const lastChance = async (id) => {
    const endsAt = Date.now() + 30_000;
    p.show((me) => ({ title: '🎯 Dernière chance', endsAt, blocks: [T(`${p.name(id)} peut encore gagner en devinant le mot des civils !`, 'big'), ...(me === id ? [{ t: 'input', ph: 'Le mot des civils', button: 'Deviner' }] : [])], say: `${p.name(id)} a une dernière chance : deviner le mot des civils.` }));
    const guess = (await p.collect({ ms: 30_000, who: [id], accept: (me, b) => (b.type === 'answer' ? String(b.text ?? '').trim().slice(0, 40) : undefined), bot: () => pick([civil, other, 'aucune idée']) })).get(id) ?? '';
    const ok = norm(guess) && norm(guess) === norm(civil);
    p.say(ok ? `🎯 ${p.name(id)} trouve « ${civil} » !` : `❌ Raté : « ${guess || '…'} »`, ok ? 'good' : 'info');
    return ok;
  };
  for (let round = 1; round <= maxRounds; round++) {
    // ---------- Indices, chacun son tour (visibles dès qu'ils sont donnés)
    for (const id of shuffle([...alive])) {
      const endsAt = Date.now() + 45_000;
      p.show((me) => ({
        title: `💬 Tour ${round} · au tour de ${p.name(id)}`, endsAt,
        blocks: [feed(p, history.slice(-14)), ...(me === id ? [T('À toi : un indice de 1 à 5 mots sur ton mot, sans le dire.', 'big'), { t: 'input', ph: 'Ton indice', button: 'Donner' }] : [{ t: 'who', id, name: p.name(id), text: 'réfléchit à son indice…' }])],
        say: me === id ? 'À toi de donner ton indice.' : null,
      }));
      const clue = (await p.collect({
        ms: 45_000, who: [id],
        accept: (me, b) => {
          const text = String(b.text ?? '').trim().slice(0, 60);
          if (b.type !== 'answer' || !text) return undefined;
          if (text.split(/\s+/).length > 5) return undefined;
          if (word(me) && norm(text).includes(norm(word(me)))) return undefined; // on ne dit pas son mot
          return text;
        },
        bot: (b) => pick(role[b] === 'civil' ? clues.civil : role[b] === 'intrus' ? clues.imposteur : ['je vois', 'classique', 'ça dépend']),
      })).get(id);
      history.push({ id, text: clue ?? '… (pas d’indice)' });
    }
    // ---------- Vote
    const voters = [...alive];
    const endsAt = Date.now() + 60_000;
    p.show((me) => ({ title: `🗳️ Tour ${round} · qui est ${kind === 'undercover' ? 'infiltré' : 'l’imposteur'} ?`, endsAt, sub: `${p.g.live?.size ?? 0}/${voters.length} vote(s)`, blocks: [feed(p, history.slice(-14)), alive.has(me) ? voteBlock(p, voters.filter((x) => x !== me), me, { label: 'Éliminer' }) : voteBlock(p, voters, me, { lock: true })], say: 'Place au vote !' }));
    const votes = await p.collect({ ms: 60_000, who: voters, keep: true, accept: (me, b) => (b.type === 'vote' && voters.includes(b.id) && b.id !== me ? b.id : undefined), bot: (b) => pick(voters.filter((x) => x !== b)) });
    const out = tally(votes);
    if (!out) {
      p.say('⚖️ Égalité : personne n’est éliminé, on refait un tour.');
      p.show({ title: `🗳️ Tour ${round}`, blocks: [T('Égalité : personne n’est éliminé. On refait un tour !', 'big')], say: 'Égalité : personne n’est éliminé. On refait un tour.' });
      await p.sleep(4000);
      continue;
    }
    alive.delete(out);
    history.push({ id: out, text: '❌ éliminé', note: 'out' });
    // L'imposteur : on dit seulement s'il était l'imposteur (jamais le mot des civils). Undercover : le rôle est révélé.
    const what = kind === 'undercover' ? `était ${roleName(out)}` : role[out] === 'intrus' ? 'était l’imposteur !' : 'n’était pas l’imposteur…';
    p.say(`⚖️ ${p.name(out)} est éliminé : il ${what}`);
    p.show({ title: `🗳️ Tour ${round}`, blocks: [{ t: 'who', id: out, name: p.name(out), text: what, big: true }], say: `${p.name(out)} est éliminé. Il ${what}` });
    await p.sleep(5000);
    if (kind === 'imposteur') {
      if (role[out] === 'intrus') return (await lastChance(out)) ? end('infiltres', `${p.name(out)} a deviné le mot des civils en dernière chance !`) : end('civils');
      if (alive.size <= 2) return end('infiltres', 'Il ne reste que deux joueurs.');
      continue;
    }
    if (role[out] === 'white' && await lastChance(out)) return { ...end('infiltres'), title: `🎩 Mister White trouve « ${civil} » et gagne !`, winners: [out] };
    const bad = [...alive].filter((id) => role[id] !== 'civil').length;
    if (!bad) return end('civils');
    if (alive.size - bad <= bad) return end('infiltres');
  }
  return end(kind === 'undercover' ? ([...alive].some((id) => role[id] !== 'civil') ? 'infiltres' : 'civils') : 'infiltres', `${maxRounds} tours sans démasquer ${kind === 'undercover' ? 'les infiltrés' : 'l’imposteur'}.`);
}

PARTY.imposteur = {
  emoji: '🕵️', name: 'L’imposteur', desc: 'Un mot secret, un intrus au mot proche (qui ne le sait pas)', min: 3, fill: 4, bots: true, prize: 60,
  run: (p) => wordGame(p, { kind: 'imposteur' }),
};
PARTY.undercover = {
  emoji: '🕶️', name: 'Undercover', desc: 'Undercovers et Mister White, 4 joueurs min', min: 4, fill: 5, bots: true, prize: 70,
  run: (p) => wordGame(p, { kind: 'undercover' }),
};

// =====================================================================
// HISTOIRE DONT VOUS ÊTES LES HÉROS
// =====================================================================
PARTY.histoire = {
  emoji: '📖', name: 'Histoire dont vous êtes les héros', desc: 'L’IA raconte, vous décidez', min: 1, prize: 40,
  async run(p) {
    const themes = Object.entries(STORY_THEMES);
    let endsAt = Date.now() + 20_000;
    p.show((me) => ({ title: '📖 Choisissez l’univers', endsAt, blocks: [{ t: 'buttons', items: themes.map(([k, t]) => ({ id: k, label: `${t.emoji} ${t.label}` })), chosen: p.g.live?.get(me) ?? null, tally: counts(p.g.live) }] }));
    const pickTheme = await p.collect({ ms: 20_000, keep: true, accept: (me, b) => (b.type === 'btn' && STORY_THEMES[b.id] ? b.id : undefined) });
    const theme = STORY_THEMES[tally(pickTheme, 'random') ?? pick(themes)[0]];
    const heroes = p.players.map(p.name);
    const chapters = 7;
    const story = [];
    const schema = { type: 'object', properties: { recit: { type: 'string' }, choix: { type: 'array', items: { type: 'string' } } }, required: ['recit', 'choix'] };
    const system = [
      `Tu es le maître du jeu d'une aventure interactive pour des jeunes Français. Univers : ${theme.pitch}.`,
      `Les héros sont les joueurs : ${heroes.join(', ')}. Tu les appelles par leur prénom.`,
      'Chaque chapitre fait 500 à 800 caractères, au présent, vivant, drôle quand il faut, avec du suspense. Les actions ont des conséquences logiques.',
      'Termine par une situation qui demande une décision, et propose 3 choix courts (moins de 60 caractères).',
      'Contenu adapté à un serveur entre amis : pas de violence détaillée ni de contenu sexuel.',
    ].join('\n');
    let decision = null;
    for (let ch = 1; ch <= chapters; ch++) {
      p.show({ title: `📖 ${theme.emoji} Chapitre ${ch}/${chapters}`, blocks: [...(story.length ? [T(story.at(-1), 'quote')] : []), T('✍️ Le maître du jeu écrit la suite…', 'big')] });
      const last = ch === chapters;
      const out = await ask({
        system,
        prompt: `${story.length ? `L’histoire jusqu’ici :\n${story.join('\n\n')}\n\n` : 'Commence l’aventure.\n'}${decision ? `Décision des joueurs : ${decision}\n` : ''}${last ? 'Écris le DERNIER chapitre : une vraie fin, épique ou drôle, sans nouveau choix (choix vide).' : `Écris le chapitre ${ch}.`}`,
        schema,
      }, 30_000);
      if (!out?.recit) return { title: '📖 Le maître du jeu a perdu sa plume… fin de l’histoire.', winners: p.humans() };
      story.push(out.recit.trim());
      if (last) {
        p.show({ title: `📖 ${theme.emoji} Fin`, blocks: [T(out.recit, 'quote')] });
        await p.sleep(25_000);
        break;
      }
      const choices = (out.choix ?? []).map((c) => String(c).slice(0, 80)).filter(Boolean).slice(0, 3);
      endsAt = Date.now() + 60_000;
      p.show((me) => ({
        title: `📖 ${theme.emoji} Chapitre ${ch}/${chapters}`, endsAt, sub: `${p.g.live?.size ?? 0} vote(s)`,
        blocks: [T(out.recit, 'quote'), { t: 'buttons', items: choices.map((c, i) => ({ id: String(i), label: c })), chosen: typeof p.g.live?.get(me) === 'string' && /^\d$/.test(p.g.live.get(me)) ? p.g.live.get(me) : null, tally: counts(p.g.live) },
          { t: 'input', ph: 'Ou propose ton idée…', button: 'Proposer', done: typeof p.g.live?.get(me) === 'string' && !/^\d$/.test(p.g.live.get(me)) }],
      }));
      const votes = await p.collect({ ms: 60_000, keep: true, accept: (me, b) => (b.type === 'btn' && /^\d$/.test(b.id) && choices[Number(b.id)] ? b.id : b.type === 'answer' && String(b.text ?? '').trim() ? String(b.text).trim().slice(0, 150) : undefined) });
      const ideas = [...votes.entries()].filter(([, v]) => !/^\d$/.test(v)).map(([id, v]) => `${p.name(id)} propose : ${v}`);
      const top = tally(new Map([...votes.entries()].filter(([, v]) => /^\d$/.test(v))), 'random');
      decision = [top !== null ? `la majorité choisit « ${choices[Number(top)]} »` : '', ...ideas].filter(Boolean).join(' ; ') || `personne ne décide, alors ${pick(heroes)} fonce au hasard`;
      for (const id of votes.keys()) p.points(id, 1);
      p.say(`📖 ${decision}`);
    }
    return { title: '📖 Fin de l’aventure !', winners: p.humans() };
  },
};
