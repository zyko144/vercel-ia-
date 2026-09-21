// Mines : 20 cases, des bombes cachées. Chaque case sûre fait monter le gain ;
// on encaisse quand on veut, ou on saute sur une bombe.
import { betBuilder, flash, fmt, mult, saved, signed } from '../kit.js';

export async function mount(el, ctx) {
  el.innerHTML = `
    <div class="game">
      <div class="status" data-part="status">Chargement…</div>
      <div class="mines-grid" data-part="grid"></div>
      <div class="controls">
        <div data-part="setup">
          <div data-part="bet"></div>
          <div class="picker" data-part="bombs"></div>
        </div>
        <div class="actions">
          <button type="button" data-do="jouer" class="primary big">Jouer</button>
          <button type="button" data-do="encaisser" class="primary go big" hidden>Encaisser</button>
        </div>
      </div>
    </div>`;
  const part = (name) => el.querySelector(`[data-part="${name}"]`);
  const button = (name) => el.querySelector(`[data-do="${name}"]`);
  const bet = betBuilder(part('bet'), { key: 'mines', onChange: () => state && render() });
  let bombs = Number(saved.get('salle:mines:bombes')) || 3;
  let state = null;
  let busy = false;

  const playing = () => state?.round && !state.round.over;

  function render() {
    const round = state.round;
    const grid = part('grid');
    grid.innerHTML = Array.from({ length: state.cells }, (_, cell) => {
      const opened = round?.opened.includes(cell);
      const bomb = round?.bombs?.includes(cell);
      const cls = opened ? 'safe' : bomb ? 'bomb' : '';
      const face = opened ? '💎' : bomb ? '💣' : '';
      return `<button type="button" class="tile ${cls}${round?.hit === cell ? ' hit' : ''}" data-cell="${cell}" ${playing() && !opened ? '' : 'disabled'}>${face}</button>`;
    }).join('');

    part('bombs').innerHTML = `Bombes : ${state.bombChoices.map((n) => `<button type="button" data-bombs="${n}" class="${n === bombs ? 'on' : ''}">${n}</button>`).join('')}`;
    part('setup').hidden = playing();
    button('jouer').hidden = playing();
    button('jouer').textContent = round?.over ? `Rejouer · ${fmt(bet.value)}` : `Jouer · ${fmt(bet.value)}`;
    button('jouer').disabled = !bet.value;
    const cash = button('encaisser');
    cash.hidden = !playing();
    if (playing()) cash.textContent = `Encaisser ${mult(round.multiplier)} · ${signed(Math.round(round.bet * round.multiplier) - round.bet)}`;
    bet.limit(state.me.balance, !playing());

    const status = part('status');
    status.classList.toggle('hot', Boolean(playing()));
    if (!round) status.textContent = 'Choisis ta mise et le nombre de bombes, puis « Jouer » : clique ensuite sur les cases.';
    else if (playing()) {
      status.textContent = round.next
        ? `Mise ${fmt(round.bet)} · ${round.bombCount} bombe(s) · prochaine case ${mult(round.next)} (${Math.round(round.survival * 100)} % de chances)`
        : 'Toutes les cases sûres sont trouvées !';
    } else if (round.over === 'bombe') status.textContent = `💥 Bombe ! Mise perdue (${signed(round.net)}).`;
    else status.textContent = `💰 Encaissé à ${mult(round.multiplier)} : ${signed(round.net)} jetons.`;
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
        if (round?.over && !was) {
          flash(el.querySelector('.game'), round.over === 'bombe'
            ? { title: 'BOUM !', sub: `${signed(round.net)} jetons`, tone: 'lose' }
            : { title: `ENCAISSÉ ${mult(round.multiplier)}`, sub: `${signed(round.net)} jetons`, tone: round.net > 0 ? 'win' : 'push' });
        }
      }
    } finally {
      busy = false;
    }
  }

  part('grid').addEventListener('click', (event) => {
    const tile = event.target.closest('[data-cell]');
    if (tile && !tile.disabled) send({ action: 'ouvrir', cell: Number(tile.dataset.cell) });
  });
  part('bombs').addEventListener('click', (event) => {
    const choice = event.target.closest('[data-bombs]');
    if (!choice) return;
    bombs = Number(choice.dataset.bombs);
    saved.set('salle:mines:bombes', String(bombs));
    render();
  });
  button('jouer').addEventListener('click', () => send({ action: 'jouer', bet: bet.value, bombs }));
  button('encaisser').addEventListener('click', () => send({ action: 'encaisser' }));

  state = await ctx.get();
  render();
}
