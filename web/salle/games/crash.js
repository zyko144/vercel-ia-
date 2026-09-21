// Crash : une fusée pour tout le salon. On mise pendant le compte à rebours, la
// fusée décolle, et on clique « Encaisser » avant qu'elle explose — ou on laisse
// l'encaissement automatique le faire à la cible choisie.
import { betBuilder, esc, flash, fmt, mult, saved, signed } from '../kit.js';

export async function mount(el, ctx) {
  el.innerHTML = `
    <div class="game">
      <div class="history" data-part="history" title="Derniers crashs"></div>
      <div class="status" data-part="status">Chargement…</div>
      <div class="stage">
        <div class="crash-screen"><canvas></canvas><div class="crash-multiplier" data-part="big">×1,00</div><div class="crash-note" data-part="note"></div></div>
        <aside class="players" data-part="players"></aside>
      </div>
      <div class="controls">
        <div data-part="bet"></div>
        <div class="auto-picker" data-part="auto"></div>
        <div class="actions">
          <button type="button" data-do="miser" class="primary">Miser</button>
          <button type="button" data-do="remettre">Remettre</button>
          <button type="button" data-do="retirer">Retirer ma mise</button>
          <button type="button" data-do="encaisser" class="primary go cash" hidden>Encaisser</button>
        </div>
      </div>
    </div>`;
  const part = (name) => el.querySelector(`[data-part="${name}"]`);
  const button = (name) => el.querySelector(`[data-do="${name}"]`);
  const canvas = el.querySelector('canvas');
  const bet = betBuilder(part('bet'), { key: 'crash', onChange: () => state && renderControls() });
  let state = null;
  let auto = saved.get('salle:crash:auto') === 'manuel' ? null : Number(saved.get('salle:crash:auto')) || null;
  let inflight = 0;

  const mine = () => state?.me.bet ?? null;
  const multiplierNow = () => (state?.start ? Math.max(1, Math.exp(Math.max(0, ctx.now() - state.start) / state.speed)) : 1);

  function renderAuto() {
    const targets = state?.autoTargets ?? [1.5, 2, 3, 5, 10];
    part('auto').innerHTML = `Encaissement auto :
      <button type="button" data-auto="" class="${auto ? '' : 'on'}">Manuel</button>
      ${targets.map((t) => `<button type="button" data-auto="${t}" class="${auto === t ? 'on' : ''}">${mult(t).replace(',00', '')}</button>`).join('')}`;
  }
  part('auto').addEventListener('click', (event) => {
    const choice = event.target.closest('[data-auto]');
    if (!choice) return;
    auto = choice.dataset.auto ? Number(choice.dataset.auto) : null;
    saved.set('salle:crash:auto', auto ? String(auto) : 'manuel');
    renderAuto();
  });

  // ---- Le dessin : la courbe du multiplicateur, et la fusée au bout.
  function draw() {
    if (!state) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const left = 54;
    const bottom = height - 30;
    const top = 70;
    const right = width - 24;

    const flying = state.phase === 'vol' && state.start && ctx.now() >= state.start;
    const exploded = state.phase === 'explose';
    const m = exploded ? state.point : flying ? multiplierNow() : 1;
    const t = state.speed * Math.log(m);
    const tMax = Math.max(8_000, t * 1.15);
    const mMax = Math.max(2, m * 1.2);
    const X = (time) => left + (time / tMax) * (right - left);
    const Y = (value) => bottom - ((value - 1) / (mMax - 1)) * (bottom - top);

    // Graduations
    g.font = '700 12px "Noto Sans", sans-serif';
    g.fillStyle = 'rgba(255,230,245,0.6)';
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.setLineDash([5, 7]);
    for (const step of [1.5, 2, 3, 5, 10, 20, 50, 100]) {
      if (step >= mMax) continue;
      g.beginPath();
      g.moveTo(left, Y(step));
      g.lineTo(right, Y(step));
      g.stroke();
      g.fillText(`×${step}`, 8, Y(step) + 4);
    }
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.moveTo(left, bottom);
    g.lineTo(right, bottom);
    g.stroke();

    // Ma cible d'encaissement automatique
    const target = mine()?.auto;
    if (target && target < mMax) {
      g.strokeStyle = '#49e08c';
      g.setLineDash([10, 7]);
      g.beginPath();
      g.moveTo(left, Y(target));
      g.lineTo(right, Y(target));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#49e08c';
      g.fillText(`AUTO ${mult(target)}`, right - 90, Y(target) - 6);
    }

    if (flying || exploded) {
      const color = exploded ? '#ff5a77' : '#ff3fa6';
      const points = [];
      for (let i = 0; i <= 60; i++) {
        const time = (t * i) / 60;
        points.push([X(time), Y(Math.exp(time / state.speed))]);
      }
      const gradient = g.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, exploded ? 'rgba(255,90,119,0.45)' : 'rgba(255,63,166,0.45)');
      gradient.addColorStop(1, 'rgba(255,63,166,0.02)');
      g.beginPath();
      g.moveTo(left, bottom);
      for (const [x, y] of points) g.lineTo(x, y);
      g.lineTo(points.at(-1)[0], bottom);
      g.closePath();
      g.fillStyle = gradient;
      g.fill();
      g.beginPath();
      points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.strokeStyle = color;
      g.lineWidth = 5;
      g.shadowColor = color;
      g.shadowBlur = 12;
      g.stroke();
      g.shadowBlur = 0;
      g.lineWidth = 1;

      // Les encaissements : un point vert sur la courbe, avec le nom.
      for (const player of state.players) {
        if (!player.cashedAt || player.cashedAt > m) continue;
        const x = X(state.speed * Math.log(player.cashedAt));
        const y = Y(player.cashedAt);
        g.fillStyle = '#49e08c';
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#eafff2';
        g.fillText(`${player.name.slice(0, 10)} ${mult(player.cashedAt)}`, x - 30, y - 12);
      }

      const [tipX, tipY] = points.at(-1);
      g.font = `${exploded ? 46 : 38}px serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (exploded) g.fillText('💥', tipX, tipY);
      else {
        const [px, py] = points.at(-2);
        g.save();
        g.translate(tipX, tipY);
        g.rotate(Math.atan2(tipY - py, tipX - px) + Math.PI / 4);
        g.fillText('🚀', 0, 0);
        g.restore();
      }
      g.textAlign = 'start';
      g.textBaseline = 'alphabetic';
    } else {
      g.font = '38px serif';
      g.fillText('🚀', left + 4, bottom - 18);
    }

    // Le multiplicateur en grand, et ce que vaut ma mise en ce moment.
    const big = part('big');
    const cashed = mine()?.cashedAt;
    big.textContent = mult(cashed && !exploded ? Math.min(m, cashed) : m);
    big.classList.toggle('boom', exploded);
    big.classList.toggle('cashed', Boolean(cashed) && !exploded);
    if (flying && mine() && !cashed) button('encaisser').textContent = `Encaisser ${mult(m)} · +${fmt(Math.round(mine().bet * (Math.floor(m * 100) / 100)) - mine().bet)}`;
  }

  function renderStatus() {
    const status = part('status');
    const note = part('note');
    const set = (text, hot = false) => { status.textContent = text; status.classList.toggle('hot', hot); };
    const my = mine();
    note.textContent = '';
    if (state.phase === 'mises') {
      if (state.countdownEnds) {
        const left = Math.max(0, Math.ceil((state.countdownEnds - ctx.now()) / 1000));
        note.textContent = `Décollage dans ${left} s`;
        set(my ? `Ta mise : ${fmt(my.bet)}${my.auto ? ` · auto ${mult(my.auto)}` : ''} — décollage dans ${left} s` : `Mise maintenant : décollage dans ${left} s`, true);
      } else {
        note.textContent = 'Mise pour lancer le compte à rebours';
        set('Pose ta mise : la fusée part 10 s après la première mise');
      }
    } else if (state.phase === 'vol') {
      if (ctx.now() < state.start) note.textContent = 'Allumage…';
      set(my ? (my.cashedAt ? `✅ Encaissé à ${mult(my.cashedAt)} : +${fmt(my.net ?? 0)}` : 'Encaisse avant l’explosion !') : 'La fusée vole… mise au prochain tour', !my?.cashedAt && Boolean(my));
    } else {
      set(my ? (my.cashedAt ? `✅ Encaissé à ${mult(my.cashedAt)} : ${signed(my.net ?? 0)} — explosion à ${mult(state.point)}` : `💥 Explosion à ${mult(state.point)} : ${signed(my.net ?? -my.bet)}`) : `💥 Explosion à ${mult(state.point)}`);
    }
  }

  function renderControls() {
    const my = mine();
    const betting = state.phase === 'mises';
    button('miser').hidden = !betting;
    button('miser').textContent = my ? `Changer ma mise (${fmt(bet.value)})` : `Miser ${fmt(bet.value)}`;
    button('miser').disabled = !bet.value;
    button('retirer').hidden = !betting || !my;
    button('remettre').hidden = !betting || my || !state.me.previous;
    button('encaisser').hidden = !(state.phase === 'vol' && my && !my.cashedAt);
    bet.limit(state.me.balance, betting);
    part('auto').style.display = betting ? '' : 'none';
  }

  function renderPlayers() {
    part('players').innerHTML = state.players.map((p) => {
      const tone = p.net > 0 ? 'win' : p.net < 0 ? 'lose' : '';
      const right = p.cashedAt ? `${mult(p.cashedAt)} ${signed(p.net ?? 0)}` : state.phase === 'explose' ? signed(p.net ?? -p.bet) : `${fmt(p.bet)}${p.auto ? ` · ${mult(p.auto)}` : ''}`;
      return `<div class="player${p.me ? ' me' : ''}"><i style="background:${p.color}"></i><span>${esc(p.name)}${p.me ? ' (toi)' : ''}</span><em class="${tone}">${right}</em></div>`;
    }).join('') || '<div class="empty">Personne n’a encore misé</div>';
    part('history').innerHTML = state.history.map((point) => `<b style="background:${point >= 10 ? '#8a6a12' : point >= 2 ? '#1f7a52' : '#7a1c2c'}">${mult(point)}</b>`).join('');
  }

  function apply(next) {
    const before = state;
    state = next;
    // Fin du tour : le bandeau de mon résultat, une seule fois.
    if (before?.phase === 'vol' && next.phase === 'explose' && before.me.bet && !before.me.bet.cashedAt) {
      flash(el.querySelector('.game'), { title: `💥 ${mult(next.point)}`, sub: `${signed(next.me.bet?.net ?? -before.me.bet.bet)} jetons`, tone: 'lose' });
    }
    renderAuto();
    renderControls();
    renderPlayers();
    renderStatus();
  }

  async function send(body) {
    inflight += 1;
    try {
      const reply = await ctx.act(body);
      if (reply.state) apply(reply.state);
      if (reply.ok && body.action === 'encaisser' && reply.state?.me.bet) {
        flash(el.querySelector('.game'), { title: `ENCAISSÉ ${mult(reply.state.me.bet.cashedAt)}`, sub: `+${fmt(reply.state.me.bet.net)} jetons`, tone: 'win' });
      }
    } finally {
      inflight -= 1;
    }
  }

  el.querySelector('.actions').addEventListener('click', (event) => {
    const action = event.target.closest('[data-do]')?.dataset.do;
    if (!action) return;
    if (action === 'miser') return send({ action, bet: bet.value, auto });
    if (action === 'remettre') {
      bet.value = state.me.previous.bet;
      auto = state.me.previous.auto;
      renderAuto();
      return send({ action: 'miser', bet: state.me.previous.bet, auto: state.me.previous.auto });
    }
    return send({ action });
  });

  let frame = 0;
  const loop = () => {
    draw();
    if (state) renderStatus();
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
  ctx.onLeave(() => cancelAnimationFrame(frame));
  ctx.every(() => (state?.phase === 'vol' ? 300 : 800), async () => {
    if (inflight) return;
    const next = await ctx.get();
    if (!inflight) apply(next);
  });
}
