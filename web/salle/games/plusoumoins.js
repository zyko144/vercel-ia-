// Plus ou moins : la carte suivante sera-t-elle plus haute ou plus basse ? Chaque
// bonne réponse multiplie le gain ; on encaisse quand on veut. L'égalité perd.
import { betBuilder, cardSvg, flash, fmt, mult, signed } from '../kit.js';

export async function mount(el, ctx) {
  el.innerHTML = `
    <div class="game">
      <div class="status" data-part="status">Chargement…</div>
      <div class="card-trail" data-part="trail"></div>
      <div class="card-stage" data-part="stage"></div>
      <div class="controls">
        <div data-part="bet"></div>
        <div class="actions">
          <button type="button" data-do="jouer" class="primary big">Jouer</button>
          <button type="button" data-do="plus" class="big choice" hidden>⬆ Plus haut</button>
          <button type="button" data-do="moins" class="big choice" hidden>⬇ Plus bas</button>
          <button type="button" data-do="encaisser" class="primary go big" hidden>Encaisser</button>
        </div>
      </div>
    </div>`;
  const part = (name) => el.querySelector(`[data-part="${name}"]`);
  const button = (name) => el.querySelector(`[data-do="${name}"]`);
  const bet = betBuilder(part('bet'), { key: 'plusoumoins', onChange: () => state && render() });
  let state = null;
  let busy = false;
  let lastCard = null;

  const playing = () => state?.round && !state.round.over;

  function render() {
    const round = state.round;
    const card = round?.card ?? null;
    const key = card ? `${card.rank}${card.suit}${round.history.length}` : null;
    part('stage').innerHTML = cardSvg(card, { width: 150, hidden: !card, extra: key && key !== lastCard ? 'flip' : '' });
    lastCard = key;
    part('trail').innerHTML = (round?.history ?? []).slice(-8).map((c) => cardSvg(c, { width: 40 })).join('');

    part('bet').hidden = playing();
    button('jouer').hidden = playing();
    button('jouer').textContent = round?.over ? `Rejouer · ${fmt(bet.value)}` : `Jouer · ${fmt(bet.value)}`;
    button('jouer').disabled = !bet.value;
    for (const side of ['plus', 'moins']) {
      const choice = button(side);
      choice.hidden = !playing();
      const odds = round?.odds?.[side];
      choice.disabled = !odds?.multiplier;
      if (odds) choice.textContent = `${side === 'plus' ? '⬆ Plus haut' : '⬇ Plus bas'} ${odds.multiplier ? mult(odds.multiplier) : '—'}`;
    }
    const cash = button('encaisser');
    cash.hidden = !playing();
    if (playing()) cash.textContent = `Encaisser ${mult(round.multiplier)} · ${signed(Math.round(round.bet * round.multiplier) - round.bet)}`;
    bet.limit(state.me.balance, !playing());

    const status = part('status');
    status.classList.toggle('hot', Boolean(playing()));
    if (!round) status.textContent = 'Choisis ta mise, puis « Jouer » : le croupier retourne une carte.';
    else if (playing()) status.textContent = round.streak ? `Série de ${round.streak} · gain actuel ${mult(round.multiplier)} — la suivante ?` : 'La carte suivante sera-t-elle plus haute ou plus basse ? (l’as est la plus haute, l’égalité perd)';
    else if (round.over === 'encaisse') status.textContent = `💰 Encaissé après ${round.streak} bonne(s) réponse(s) : ${signed(round.net)} jetons.`;
    else status.textContent = `${round.over === 'egalite' ? 'Égalité : perdu.' : 'Raté !'} Série de ${round.streak} · ${signed(round.net)} jetons.`;
  }

  async function send(body) {
    if (busy) return;
    busy = true;
    try {
      const reply = await ctx.act(body);
      if (reply.state) {
        const was = state?.round?.over;
        state = reply.state;
        render();
        const round = state.round;
        if (round?.over && !was && body.action !== 'jouer') {
          flash(el.querySelector('.game'), round.over === 'encaisse'
            ? { title: `ENCAISSÉ ${mult(round.multiplier)}`, sub: `${signed(round.net)} jetons`, tone: round.net > 0 ? 'win' : 'push' }
            : { title: round.over === 'egalite' ? 'ÉGALITÉ : PERDU' : 'PERDU', sub: `${signed(round.net)} jetons`, tone: 'lose' });
        }
      }
    } finally {
      busy = false;
    }
  }

  el.querySelector('.actions').addEventListener('click', (event) => {
    const action = event.target.closest('[data-do]')?.dataset.do;
    if (!action) return;
    send(action === 'jouer' ? { action, bet: bet.value } : { action });
  });

  state = await ctx.get();
  render();
}
