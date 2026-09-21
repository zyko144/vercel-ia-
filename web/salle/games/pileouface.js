// Pile ou face : une mise, un clic sur « Pile » ou « Face », la pièce tourne en l'air.
import { betBuilder, flash, signed } from '../kit.js';

export async function mount(el, ctx) {
  el.innerHTML = `
    <div class="game">
      <div class="status" data-part="status">Choisis ta mise, puis pile ou face : une chance sur deux, gain ×1,95.</div>
      <div class="coin-stage"><div class="coin" data-part="coin"><div class="coin-face">PILE</div><div class="coin-face back">FACE</div></div></div>
      <div class="controls">
        <div data-part="bet"></div>
        <div class="actions">
          <button type="button" data-side="pile" class="primary big choice">Pile</button>
          <button type="button" data-side="face" class="primary big choice">Face</button>
        </div>
      </div>
    </div>`;
  const part = (name) => el.querySelector(`[data-part="${name}"]`);
  const bet = betBuilder(part('bet'), { key: 'pileouface' });
  const coin = part('coin');
  let turns = 0;
  let flipping = false;

  el.querySelector('.actions').addEventListener('click', async (event) => {
    const side = event.target.closest('[data-side]')?.dataset.side;
    if (!side || flipping) return;
    flipping = true;
    for (const button of el.querySelectorAll('[data-side]')) button.disabled = true;
    const reply = await ctx.act({ action: 'jouer', bet: bet.value, side });
    if (reply.ok && reply.draw) {
      // Plusieurs tours complets, puis la face tirée vers le joueur.
      turns += 6;
      coin.style.transition = 'transform 1.8s cubic-bezier(0.2, 0.7, 0.2, 1)';
      coin.style.transform = `rotateY(${turns * 360 + (reply.draw.side === 'face' ? 180 : 0)}deg)`;
      part('status').textContent = 'La pièce tourne en l’air…';
      await new Promise((resolve) => setTimeout(resolve, 1900));
      const { net } = reply.draw;
      part('status').textContent = `${reply.draw.side === 'pile' ? 'Pile' : 'Face'} ! Tu avais choisi ${side} : ${signed(net)} jetons.`;
      flash(el.querySelector('.game'), { title: net > 0 ? 'GAGNÉ' : 'PERDU', sub: `${signed(net)} jetons`, tone: net > 0 ? 'win' : 'lose' });
      ctx.balance(reply.draw.balance);
      bet.limit(reply.draw.balance);
    }
    flipping = false;
    for (const button of el.querySelectorAll('[data-side]')) button.disabled = false;
  });

  const state = await ctx.get();
  bet.limit(state.me.balance);
  if (state.last?.side === 'face') coin.style.transform = 'rotateY(180deg)';
  part('status').textContent += state.last ? ` Dernier lancer : ${state.last.side}.` : '';
}
