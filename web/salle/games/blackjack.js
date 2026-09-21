// Blackjack : une table de cinq places par salon, un seul croupier. On mise sur sa
// place, « Distribuer », puis chacun joue ses mains en même temps : tirer, rester,
// doubler, séparer. Le croupier retourne sa carte et tire devant tout le monde.
import { betBuilder, cardSvg, esc, flash, fmt, signed } from '../kit.js';

export async function mount(el, ctx) {
  el.innerHTML = `
    <div class="game">
      <div class="status" data-part="status">Chargement…</div>
      <div class="bj-table">
        <div class="bj-dealer"><span class="bj-label" data-part="dealer-label">Croupier</span><div class="bj-cards" data-part="dealer"></div></div>
        <div class="bj-rule">LE CROUPIER RESTE SUR 17 · BLACKJACK PAYÉ 3 POUR 2</div>
        <div class="bj-seats" data-part="seats"></div>
      </div>
      <div class="timer" data-part="timer"><i></i></div>
      <div class="controls">
        <div data-part="bet"></div>
        <div class="actions" data-part="betting">
          <button type="button" data-do="miser" class="primary">Miser</button>
          <button type="button" data-do="remettre">Remettre</button>
          <button type="button" data-do="distribuer" class="go">Distribuer</button>
          <button type="button" data-do="quitter">Quitter la place</button>
        </div>
        <div class="actions" data-part="playing" hidden>
          <button type="button" data-do="tirer" class="primary big">Tirer</button>
          <button type="button" data-do="rester" class="big">Rester</button>
          <button type="button" data-do="doubler" class="big">Doubler</button>
          <button type="button" data-do="separer" class="big">Séparer</button>
        </div>
      </div>
    </div>`;
  const part = (name) => el.querySelector(`[data-part="${name}"]`);
  const button = (name) => el.querySelector(`[data-do="${name}"]`);
  const bet = betBuilder(part('bet'), { key: 'blackjack', onChange: () => state && renderControls() });
  let state = null;
  let inflight = 0;
  let flashed = null;
  const shown = new Map(); // cartes déjà affichées, pour n'animer que les nouvelles

  const me = () => state?.players.find((p) => p.me) ?? null;
  const myHand = () => me()?.hands.find((hand) => hand.active) ?? null;

  function cards(key, list, { width, hidden = 0 } = {}) {
    const before = shown.get(key) ?? 0;
    shown.set(key, list.length + hidden);
    return list.map((c, i) => cardSvg(c, { width, extra: i >= before ? 'deal' : '' })).join('')
      + Array.from({ length: hidden }, () => cardSvg(null, { width, hidden: true })).join('');
  }

  const totalLabel = (hand) => {
    if (hand.blackjack) return '<span class="bj-total bj">Blackjack !</span>';
    if (hand.bust) return `<span class="bj-total bust">${hand.total} · sautée</span>`;
    return `<span class="bj-total">${hand.soft && hand.total < 21 ? `${hand.total - 10}/${hand.total}` : hand.total}${hand.doubled ? ' · doublée' : ''}</span>`;
  };

  function renderTable() {
    const { dealer } = state;
    const dealerTotal = dealer.cards.length ? (dealer.hidden ? `${dealer.total} + ?` : dealer.bust ? `${dealer.total} · sauté` : dealer.total) : '';
    part('dealer-label').textContent = dealer.cards.length ? `Croupier · ${dealerTotal}` : 'Croupier';
    if (!dealer.cards.length) shown.clear();
    part('dealer').innerHTML = cards('croupier', dealer.cards, { width: 70, hidden: dealer.hidden });

    const seats = [...state.players];
    while (seats.length < state.seats) seats.push(null);
    part('seats').innerHTML = seats.map((seat, index) => {
      if (!seat) return '<div class="bj-seat"><span class="name" style="opacity:.5">Place libre</span></div>';
      const width = seat.me ? 62 : 48;
      const hands = seat.hands.map((hand, i) => `
        <div class="bj-hand${hand.active ? ' active' : ''}">
          <div class="bj-cards">${cards(`${index}:${i}`, hand.cards, { width })}</div>
          ${totalLabel(hand)}
          ${seat.result ? `<span class="bj-result ${seat.result.labels[i] === 'perdue' || seat.result.labels[i] === 'sautée' ? 'lose-text' : seat.result.labels[i] === 'égalité' ? '' : 'win-text'}">${seat.result.labels[i]}</span>` : ''}
        </div>`).join('');
      const money = seat.result ? `<b class="${seat.result.net > 0 ? 'win-text' : seat.result.net < 0 ? 'lose-text' : ''}">${signed(seat.result.net)}</b>` : seat.hands.length ? fmt(seat.hands.reduce((sum, hand) => sum + hand.bet, 0)) : seat.bet ? `mise ${fmt(seat.bet)}${seat.ready ? ' ✓' : ''}` : '';
      return `<div class="bj-seat${seat.me ? ' me' : ''}">
        <div style="display:flex;gap:6px;align-items:flex-end">${hands}</div>
        <span class="name"><i style="background:${seat.color}"></i>${esc(seat.name)}${seat.me ? ' (toi)' : ''}${money ? ` · ${money}` : ''}</span></div>`;
    }).join('');
  }

  function renderStatus() {
    const status = part('status');
    const set = (text, hot = false) => { status.textContent = text; status.classList.toggle('hot', hot); };
    const seat = me();
    const timer = part('timer');
    timer.style.visibility = 'hidden';
    if (state.phase === 'mises') {
      if (state.closesAt) {
        set(`⏳ Distribution dans ${Math.max(0, Math.ceil((state.closesAt - ctx.now()) / 1000))} s`, true);
      } else if (seat?.ready) set('✅ Prêt ! On attend que les autres distribuent aussi…');
      else if (seat?.bet) set(`Mise posée : ${fmt(seat.bet)}. Appuie sur « Distribuer » quand tu es prêt.`);
      else set('Pose ta mise avec les jetons, puis « Miser » pour prendre une place');
    } else if (state.phase === 'jeu') {
      const left = Math.max(0, state.deadline - ctx.now());
      timer.style.visibility = 'visible';
      timer.firstElementChild.style.width = `${(left / 40_000) * 100}%`;
      if (myHand()) set(`À toi : tirer ou rester ? (${Math.ceil(left / 1000)} s)`, true);
      else if (seat?.hands.length) set('Tu as joué : on attend les autres joueurs…');
      else set('Une donne est en cours : tu joueras à la prochaine.');
    } else if (state.phase === 'croupier') {
      set('Le croupier retourne sa carte et tire…', true);
    } else {
      const result = seat?.result;
      set(result ? `${result.net > 0 ? 'Gagné' : result.net < 0 ? 'Perdu' : 'Égalité'} : ${signed(result.net)} jetons · prochaine donne dans un instant` : 'Donne terminée · prochaine donne dans un instant');
    }
  }

  function renderControls() {
    const seat = me();
    const betting = state.phase === 'mises';
    const hand = myHand();
    part('bet').hidden = !betting;
    part('betting').hidden = !betting;
    part('playing').hidden = !hand;
    button('miser').textContent = seat?.bet ? `Changer ma mise (${fmt(bet.value)})` : `Miser ${fmt(bet.value)}`;
    button('miser').disabled = !bet.value || seat?.ready;
    button('remettre').hidden = !state.me.previous || Boolean(seat?.bet);
    button('distribuer').disabled = !seat?.bet || seat?.ready;
    button('quitter').hidden = !seat;
    button('doubler').disabled = !state.me.canDouble;
    button('separer').disabled = !state.me.canSplit;
    bet.limit(state.me.balance, betting);
  }

  function apply(next) {
    const before = state;
    state = next;
    renderTable();
    renderControls();
    renderStatus();
    const result = me()?.result;
    if (next.phase === 'resultats' && result && flashed !== next.round) {
      flashed = next.round;
      const tone = result.net > 0 ? 'win' : result.net < 0 ? 'lose' : 'push';
      const title = result.labels.includes('blackjack !') && result.net > 0 ? 'BLACKJACK !' : result.net > 0 ? 'GAGNÉ' : result.net < 0 ? 'PERDU' : 'ÉGALITÉ';
      flash(el.querySelector('.game'), { title, sub: `${signed(result.net)} jetons`, tone });
    }
    if (before && before.round !== next.round) shown.clear();
  }

  async function send(body) {
    inflight += 1;
    try {
      const reply = await ctx.act(body);
      if (reply.state) apply(reply.state);
    } finally {
      inflight -= 1;
    }
  }

  el.querySelector('.controls').addEventListener('click', (event) => {
    const action = event.target.closest('[data-do]')?.dataset.do;
    if (!action) return;
    send(action === 'miser' ? { action, bet: bet.value } : { action });
  });

  const ticker = setInterval(() => { if (state) renderStatus(); }, 250);
  ctx.onLeave(() => clearInterval(ticker));
  ctx.every(() => (state?.phase === 'mises' ? 900 : 500), async () => {
    if (inflight) return;
    const next = await ctx.get();
    if (!inflight) apply(next);
  });
}
