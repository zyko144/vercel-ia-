// Duel : on choisit un joueur présent dans la salle, une mise, et on le défie. Il
// reçoit le défi où qu'il soit dans la salle ; s'il accepte, une pièce tranche et
// le gagnant prend les deux mises.
import { betBuilder, esc, flash, fmt, signed } from '../kit.js';

export async function mount(el, ctx) {
  el.innerHTML = `
    <div class="game">
      <div class="status" data-part="status">Chargement…</div>
      <div class="panel" style="text-align:center">
        <div class="hint" style="margin-bottom:8px">Joueurs dans la salle (dans ce salon)</div>
        <div class="duel-list" data-part="present"></div>
      </div>
      <div class="coin-stage" style="flex:0 0 auto;min-height:170px"><div class="coin" data-part="coin" style="width:140px"><div class="coin-face">PILE</div><div class="coin-face back">FACE</div></div></div>
      <div class="duel-log" data-part="log"></div>
      <div class="controls">
        <div data-part="bet"></div>
        <div class="actions"><button type="button" data-do="defier" class="primary big">⚔️ Défier</button></div>
      </div>
    </div>`;
  const part = (name) => el.querySelector(`[data-part="${name}"]`);
  const bet = betBuilder(part('bet'), { key: 'duel', onChange: () => state && render() });
  let state = null;
  let target = null;
  let turns = 0;
  const played = new Set(); // duels dont on a déjà montré la pièce

  function render() {
    const present = state.present;
    if (target && !present.some((p) => p.id === target)) target = null;
    part('present').innerHTML = present.length
      ? present.map((p) => `<button type="button" class="duel-player${p.id === target ? ' on' : ''}" data-id="${p.id}">${esc(p.name)}</button>`).join('')
      : '<span class="hint">Personne d’autre pour l’instant : invite quelqu’un à ouvrir la salle depuis ce salon.</span>';
    const waiting = state.duels.find((duel) => duel.mine && duel.status === 'attente');
    const defy = el.querySelector('[data-do="defier"]');
    defy.disabled = !target || !bet.value || Boolean(waiting);
    defy.textContent = target ? `⚔️ Défier ${present.find((p) => p.id === target)?.name ?? ''} · ${fmt(bet.value)}` : '⚔️ Choisis un adversaire';
    bet.limit(state.me.balance, !waiting);

    const now = state.now;
    part('log').innerHTML = state.duels.map((duel) => {
      if (duel.status === 'attente') {
        const left = Math.max(0, Math.ceil((duel.expiresAt - now) / 1000));
        return duel.mine
          ? `<div>⏳ Tu défies <b>${esc(duel.to)}</b> pour ${fmt(duel.bet)} jetons — réponse dans ${left} s <button type="button" class="mini" data-cancel="${duel.id}">Annuler</button></div>`
          : `<div>⚔️ <b>${esc(duel.from)}</b> te défie pour ${fmt(duel.bet)} jetons (la fenêtre s’ouvre partout dans la salle)</div>`;
      }
      if (duel.status === 'fini') {
        const won = duel.result.iWon;
        return `<div>${won ? '✅' : '❌'} ${duel.mine ? `Contre <b>${esc(duel.to)}</b>` : `Contre <b>${esc(duel.from)}</b>`} : ${duel.result.side} — ${won ? `tu gagnes ${signed(duel.bet)}` : `tu perds ${fmt(duel.bet)}`}</div>`;
      }
      const why = { refuse: 'refusé', expire: 'sans réponse', annule: 'annulé' }[duel.status] ?? duel.status;
      return `<div>➖ Défi ${duel.mine ? `à <b>${esc(duel.to)}</b>` : `de <b>${esc(duel.from)}</b>`} ${why} · mise rendue</div>`;
    }).join('') || '';

    const status = part('status');
    status.textContent = waiting ? `En attente de la réponse de ${waiting.to}…` : 'Choisis un adversaire et une mise : pile, tu gagnes ; face, il gagne. Aucun avantage de la maison.';

    // Un duel vient de se jouer : la pièce tourne pour les deux joueurs.
    const fresh = state.duels.find((duel) => duel.status === 'fini' && !played.has(duel.id));
    if (fresh) {
      played.add(fresh.id);
      turns += 6;
      const coin = part('coin');
      coin.style.transition = 'transform 1.8s cubic-bezier(0.2, 0.7, 0.2, 1)';
      coin.style.transform = `rotateY(${turns * 360 + (fresh.result.side === 'face' ? 180 : 0)}deg)`;
      setTimeout(() => flash(el.querySelector('.game'), {
        title: fresh.result.iWon ? 'DUEL GAGNÉ' : 'DUEL PERDU',
        sub: fresh.result.iWon ? `+${fmt(fresh.bet)} jetons` : `−${fmt(fresh.bet)} jetons`,
        tone: fresh.result.iWon ? 'win' : 'lose',
      }), 1900);
    }
  }

  part('present').addEventListener('click', (event) => {
    const id = event.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    target = id;
    render();
  });
  part('log').addEventListener('click', async (event) => {
    const id = event.target.closest('[data-cancel]')?.dataset.cancel;
    if (!id) return;
    const reply = await ctx.act({ action: 'annuler', id });
    if (reply.state) { state = reply.state; render(); }
  });
  el.querySelector('[data-do="defier"]').addEventListener('click', async () => {
    if (!target) return;
    const reply = await ctx.act({ action: 'defier', to: target, bet: bet.value });
    if (reply.state) { state = reply.state; render(); }
  });

  state = await ctx.get();
  // Les duels déjà joués avant d'arriver ne rejouent pas leur animation…
  for (const duel of state.duels) if (duel.status === 'fini' && Date.now() - duel.expiresAt > 70_000) played.add(duel.id);
  render();
  ctx.every(1500, async () => {
    state = await ctx.get();
    render();
  });
}
