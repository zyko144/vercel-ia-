// Rouge ou noir : une mise, un clic sur la couleur, le croupier retourne une carte.
import { betBuilder, cardSvg, flash, signed } from '../kit.js';

export async function mount(el, ctx) {
  el.innerHTML = `
    <div class="game">
      <div class="status" data-part="status">Choisis ta mise, puis la couleur de la prochaine carte : gain ×1,95.</div>
      <div class="card-stage" data-part="stage">${cardSvg(null, { width: 160, hidden: true })}</div>
      <div class="controls">
        <div data-part="bet"></div>
        <div class="actions">
          <button type="button" data-colour="rouge" class="big choice red">♥ ♦ Rouge</button>
          <button type="button" data-colour="noir" class="big choice black">♠ ♣ Noir</button>
        </div>
      </div>
    </div>`;
  const part = (name) => el.querySelector(`[data-part="${name}"]`);
  const bet = betBuilder(part('bet'), { key: 'rougenoir' });
  let drawing = false;

  el.querySelector('.actions').addEventListener('click', async (event) => {
    const colour = event.target.closest('[data-colour]')?.dataset.colour;
    if (!colour || drawing) return;
    drawing = true;
    for (const button of el.querySelectorAll('[data-colour]')) button.disabled = true;
    part('stage').innerHTML = cardSvg(null, { width: 160, hidden: true, extra: 'deal' });
    part('status').textContent = 'Le croupier retourne la carte…';
    const [reply] = await Promise.all([ctx.act({ action: 'jouer', bet: bet.value, colour }), new Promise((resolve) => setTimeout(resolve, 650))]);
    if (reply.ok && reply.draw) {
      const { card, net } = reply.draw;
      part('stage').innerHTML = cardSvg(card, { width: 160, extra: 'flip' });
      const drawn = card.suit === '♥' || card.suit === '♦' ? 'rouge' : 'noir';
      part('status').textContent = `${card.rank}${card.suit} : ${drawn} ! Tu avais choisi ${colour} : ${signed(net)} jetons.`;
      flash(el.querySelector('.game'), { title: net > 0 ? 'GAGNÉ' : 'PERDU', sub: `${signed(net)} jetons`, tone: net > 0 ? 'win' : 'lose' });
      ctx.balance(reply.draw.balance);
      bet.limit(reply.draw.balance);
    } else {
      part('stage').innerHTML = cardSvg(null, { width: 160, hidden: true });
    }
    drawing = false;
    for (const button of el.querySelectorAll('[data-colour]')) button.disabled = false;
  });

  const state = await ctx.get();
  bet.limit(state.me.balance);
  if (state.last?.card) part('stage').innerHTML = cardSvg(state.last.card, { width: 160 });
}
