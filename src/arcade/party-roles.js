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
const voteBlock = (p, ids, me, { label = 'Voter', show = true, lock = false } = {}) => ({
  t: 'vote', ids, names: Object.fromEntries(ids.map((id) => [id, p.name(id)])), mine: p.g.live?.get(me) ?? null, counts: show ? counts(p.g.live) : null, label, lock,
});

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
    p.show({ title: '🐺 Loup-garou', blocks: [T(`${n} joueurs · ${wolves} loup${wolves > 1 ? 's' : ''} parmi vous.`, 'big'), T('Regarde ton rôle en haut de l’écran. Ne le montre à personne !')] });
    await p.sleep(8000);
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
      await p.sleep(3000);
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
      p.show({ title: `☀️ Jour ${day}`, blocks: [T(dead.length ? `Le village se réveille… ${dead.length > 1 ? 'deux corps' : 'un corps'} sur la place.` : 'Le village se réveille… personne n’est mort cette nuit !', 'big'), { t: 'list', items: dead.map((id) => `💀 ${reveal(id)}`) }] });
      for (const id of dead) p.say(`💀 ${reveal(id)}`);
      await p.sleep(6000);
      for (const id of dead) { await hunter(id); refreshCards(); }
      let w = winner();
      if (w) return end(w);
      // ---------- Débat puis vote
      endsAt = Date.now() + 90_000;
      p.show((me) => ({ title: `☀️ Jour ${day} · débat`, endsAt, sub: `${p.g.live?.size ?? 0}/${living().filter((id) => !isBot(id)).length} prêt(s)`, blocks: [T('Discutez dans le chat (ou en vocal) : qui est loup ?', 'big'), ...(alive.has(me) ? [{ t: 'buttons', items: [{ id: 'ready', label: '🗳️ Prêt à voter' }], chosen: p.g.live?.has(me) ? 'ready' : null }] : [])] }));
      await p.collect({ ms: 90_000, who: living().filter((id) => !isBot(id)), accept: (me, b) => (b.type === 'btn' && b.id === 'ready' ? true : undefined) });
      endsAt = Date.now() + 45_000;
      const voters = living();
      p.show((me) => ({ title: `🗳️ Jour ${day} · vote`, endsAt, sub: `${p.g.live?.size ?? 0}/${voters.length} vote(s)`, blocks: [T('Qui éliminer ?', 'big'), ...(alive.has(me) ? [voteBlock(p, voters.filter((id) => id !== me), me, { label: 'Éliminer' })] : [voteBlock(p, voters, me, { label: 'Éliminer', lock: true })])] }));
      const votes = await p.collect({ ms: 45_000, who: voters, keep: true, accept: (me, b) => (b.type === 'vote' && voters.includes(b.id) && b.id !== me ? b.id : undefined), bot: (id) => pick(voters.filter((x) => x !== id && !(role[id] === 'loup' && role[x] === 'loup'))) });
      const out = tally(votes);
      if (out) {
        alive.delete(out);
        refreshCards();
        p.show({ title: `🗳️ Jour ${day}`, blocks: [T(`Le village élimine ${reveal(out)}`, 'big')] });
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
async function wordGame(p, { impostors, white, clueRounds, maxRounds, label }) {
  const ids = shuffle(p.players);
  const [civil, other] = await within(IMPOSTOR_PARTS.wordPair('tout'), 15_000) ?? shuffle(['Pizza', 'Burger']);
  const spots = shuffle(ids);
  const role = Object.fromEntries(ids.map((id) => [id, 'civil']));
  spots.slice(0, impostors).forEach((id) => { role[id] = 'intrus'; });
  if (white) role[spots[impostors]] = 'white';
  const word = (id) => (role[id] === 'civil' ? civil : role[id] === 'intrus' ? other : null);
  const clues = await within(IMPOSTOR_PARTS.botClues(civil, other), 15_000) ?? { civil: ['connu'], imposteur: ['connu'] };
  const alive = new Set(ids);
  for (const id of ids) {
    p.card(id, word(id)
      ? { emoji: '🔤', title: word(id), color: 'gold', img: 'jeux/motsecret.gif', text: `Ton mot secret. ${label === 'Undercover' ? 'Tu ne sais pas si tu es civil ou undercover !' : 'Un intrus a un mot proche… démasquez-le.'}` }
      : { emoji: '🎩', title: 'Mister White', color: 'red', img: 'jeux/imposteur.gif', text: 'Tu n’as pas de mot : écoute les indices et bluffe. Si tu es éliminé, devine le mot des civils pour gagner.' });
  }
  const history = [];
  const team = (id) => (role[id] === 'civil' ? 'civils' : 'infiltres');
  const status = () => {
    const bad = [...alive].filter((id) => role[id] !== 'civil').length;
    const good = alive.size - bad;
    if (!bad) return 'civils';
    if (good <= bad) return 'infiltres';
    return null;
  };
  p.show({ title: `🕵️ ${label}`, blocks: [T('Regarde ton mot en haut de l’écran. Chacun son tour, donne un indice sans trop en dire.', 'big')] });
  await p.sleep(7000);
  const end = (winnerTeam, why = '') => ({
    title: winnerTeam === 'civils' ? '🧑 Les civils gagnent !' : label === 'Undercover' ? '🕶️ Les infiltrés gagnent !' : '🕵️ L’imposteur gagne !',
    text: `${why}${why ? '\n' : ''}Mot des civils : ${civil} · mot de l’intrus : ${other}\n${ids.map((id) => `${p.name(id)} : ${role[id] === 'civil' ? '🧑 civil' : role[id] === 'intrus' ? (label === 'Undercover' ? '🕶️ undercover' : '🕵️ imposteur') : '🎩 Mister White'}`).join('\n')}`,
    winners: ids.filter((id) => team(id) === winnerTeam),
  });
  for (let round = 1; round <= maxRounds; round++) {
    for (let turn = 1; turn <= clueRounds; turn++) {
      for (const id of shuffle([...alive])) {
        const endsAt = Date.now() + 30_000;
        p.show((me) => ({
          title: `💬 Manche ${round} · indice de ${p.name(id)}`, endsAt,
          blocks: [{ t: 'list', items: history.length ? history.slice(-12) : ['Pas encore d’indice.'] }, ...(me === id ? [{ t: 'input', ph: 'Ton indice (1 à 3 mots)', button: 'Donner' }] : [T(`${p.name(id)} réfléchit…`, 'small')])],
        }));
        const clue = (await p.collect({ ms: 30_000, who: [id], accept: (me, b) => (b.type === 'answer' && String(b.text ?? '').trim() ? String(b.text).trim().slice(0, 40) : undefined), bot: (b) => pick(role[b] === 'civil' ? clues.civil : role[b] === 'intrus' ? clues.imposteur : ['je vois', 'classique', 'ça dépend']) })).get(id) ?? '…';
        history.push(`**${p.name(id)}** : ${clue}`);
        p.say(`💬 ${p.name(id)} : ${clue}`);
      }
    }
    const voters = [...alive];
    const endsAt = Date.now() + 45_000;
    p.show((me) => ({ title: `🗳️ Manche ${round} · qui est l’intrus ?`, endsAt, sub: `${p.g.live?.size ?? 0}/${voters.length} vote(s)`, blocks: [{ t: 'list', items: history.slice(-12) }, alive.has(me) ? voteBlock(p, voters.filter((x) => x !== me), me, { label: 'Éliminer' }) : voteBlock(p, voters, me, { lock: true })] }));
    const votes = await p.collect({ ms: 45_000, who: voters, keep: true, accept: (me, b) => (b.type === 'vote' && voters.includes(b.id) && b.id !== me ? b.id : undefined), bot: (b) => pick(voters.filter((x) => x !== b)) });
    const out = tally(votes);
    if (!out) {
      p.say('⚖️ Égalité : personne n’est éliminé.');
      if (label !== 'Undercover') return end('infiltres', 'Le village n’a pas réussi à se décider.');
      continue;
    }
    alive.delete(out);
    const what = role[out] === 'civil' ? '🧑 civil' : role[out] === 'intrus' ? (label === 'Undercover' ? '🕶️ undercover' : '🕵️ l’imposteur') : '🎩 Mister White';
    p.say(`⚖️ ${p.name(out)} est éliminé : ${what}`);
    p.show({ title: `🗳️ Manche ${round}`, blocks: [T(`${p.name(out)} était ${what}`, 'big')] });
    await p.sleep(4000);
    if (role[out] === 'white') {
      const endsAt2 = Date.now() + 30_000;
      p.show((me) => ({ title: '🎩 Dernière chance', endsAt: endsAt2, blocks: [T('Mister White peut gagner en trouvant le mot des civils.', 'big'), ...(me === out ? [{ t: 'input', ph: 'Le mot des civils', button: 'Deviner' }] : [])] }));
      const guess = (await p.collect({ ms: 30_000, who: [out], accept: (me, b) => (b.type === 'answer' ? String(b.text ?? '') : undefined), bot: () => pick([civil, other, 'aucune idée']) })).get(out) ?? '';
      if (norm(guess) === norm(civil)) return { ...end('infiltres'), title: `🎩 Mister White trouve « ${civil} » et gagne !`, winners: [out] };
      p.say(`🎩 Raté : « ${guess || '…'} »`);
    }
    if (label !== 'Undercover') return end(role[out] === 'intrus' ? 'civils' : 'infiltres');
    const s = status();
    if (s) return end(s);
  }
  return end(status() ?? 'infiltres');
}

PARTY.imposteur = {
  emoji: '🕵️', name: 'L’imposteur', desc: 'Un mot secret, un intrus au mot proche', min: 3, fill: 4, bots: true, prize: 60,
  run: (p) => wordGame(p, { impostors: 1, white: false, clueRounds: 2, maxRounds: 1, label: 'L’imposteur' }),
};
PARTY.undercover = {
  emoji: '🕶️', name: 'Undercover', desc: 'Undercovers et Mister White, 4 joueurs min', min: 4, fill: 5, bots: true, prize: 70,
  run: (p) => wordGame(p, { impostors: p.players.length >= 7 ? 2 : 1, white: p.players.length >= 5, clueRounds: 1, maxRounds: 6, label: 'Undercover' }),
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
