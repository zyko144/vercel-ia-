// Roulette : on choisit un jeton, on clique sur le tapis pour le poser. Tout le salon
// joue sur le même tapis ; la bille part quand tout le monde a lancé.
import { chipRack, chipStyle, chipSvg, esc, fmt, short, signed, saved, toast } from '../kit.js';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const pocketColor = (n) => (n === 0 ? '#1f8a55' : RED.has(n) ? '#c21f43' : '#1a1016');
const traits = (n) => (n === 0 ? 'ZÉRO' : [RED.has(n) ? 'ROUGE' : 'NOIR', n % 2 ? 'IMPAIR' : 'PAIR', n <= 18 ? '1 – 18' : '19 – 36'].join(' · '));
const CHANCES = ['manque', 'pair', 'rouge', 'noir', 'impair', 'passe'];
const RULES = {
  rouge: ['Rouge', 2, 18], noir: ['Noir', 2, 18], pair: ['Pair', 2, 18], impair: ['Impair', 2, 18],
  manque: ['Manque (1 à 18)', 2, 18], passe: ['Passe (19 à 36)', 2, 18],
  douzaine1: ['1re douzaine (1 à 12)', 3, 12], douzaine2: ['2e douzaine (13 à 24)', 3, 12], douzaine3: ['3e douzaine (25 à 36)', 3, 12],
  colonne1: ['1re colonne (1, 4, 7… 34)', 3, 12], colonne2: ['2e colonne (2, 5, 8… 35)', 3, 12], colonne3: ['3e colonne (3, 6, 9… 36)', 3, 12],
};
const ruleOf = (spot) => (spot.startsWith('plein-') ? [`Numéro ${spot.slice(6)}`, 36, 1] : RULES[spot]);
const ALL_SPOTS = [...Array.from({ length: 37 }, (_, n) => `plein-${n}`), ...Object.keys(RULES)];
const HINT = 'Choisis un jeton en bas, puis clique sur le tapis pour le poser · clic droit (ou appui long) pour le retirer';

// ------------------------------------------------------------------ Le tapis
// Unités du tapis horizontal : le zéro, 12 colonnes de numéros, la colonne « 2 à 1 »,
// puis les douzaines et les chances sur deux bandes plus basses.
function logicalBox(spot) {
  if (spot === 'plein-0') return { x: 0, y: 0, w: 1, h: 3 };
  if (spot.startsWith('plein-')) {
    const n = Number(spot.slice(6));
    return { x: 1 + Math.floor((n - 1) / 3), y: 2 - ((n - 1) % 3), w: 1, h: 1 };
  }
  if (spot.startsWith('colonne')) return { x: 13, y: 3 - Number(spot.slice(7)), w: 1, h: 1 };
  if (spot.startsWith('douzaine')) return { x: 1 + (Number(spot.slice(8)) - 1) * 4, y: 3, w: 4, h: 0.8 };
  const i = CHANCES.indexOf(spot);
  return { x: 1 + i * 2, y: 3.8, w: 2, h: 0.8 };
}

/** À plat sur un écran large ; debout (le zéro en haut) sur un téléphone. */
function geometry(vertical) {
  if (!vertical) return { width: 14 * 64, height: 4.6 * 66, box: (s) => { const b = logicalBox(s); return { x: b.x * 64, y: b.y * 66, w: b.w * 64, h: b.h * 66 }; } };
  return { width: 4.6 * 70, height: 14 * 44, box: (s) => { const b = logicalBox(s); return { x: (4.6 - b.y - b.h) * 70, y: b.x * 44, w: b.h * 70, h: b.w * 44 }; } };
}

const isBand = (spot) => spot.startsWith('douzaine') || CHANCES.includes(spot);

/** Où poser la pile, et où pousser le libellé quand une pile est là. */
function anchors(spot, b, vertical) {
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (spot.startsWith('plein-') && spot !== 'plein-0') return { chip: { x: b.x + b.w * 0.58, y: b.y + b.h * 0.6 }, label: { x: b.x + b.w * 0.27, y: b.y + b.h * 0.28 } };
  if (spot === 'plein-0' || spot.startsWith('colonne')) {
    return vertical || spot.startsWith('colonne')
      ? { chip: { x: vertical ? b.x + b.w * 0.7 : c.x, y: vertical ? c.y : b.y + b.h * 0.62 }, label: { x: vertical ? b.x + b.w * 0.3 : c.x, y: vertical ? c.y : b.y + b.h * 0.24 } }
      : { chip: { x: c.x, y: b.y + b.h - 42 }, label: { x: c.x, y: b.y + 44 } };
  }
  return vertical
    ? { chip: { x: c.x, y: b.y + b.h - 30 }, label: { x: c.x, y: b.y + (b.h - 44) / 2 } }
    : { chip: { x: b.x + b.w - 32, y: c.y }, label: { x: b.x + (b.w - 50) / 2, y: c.y } };
}

function labelSvg(spot, at, vertical, busy) {
  const rotate = vertical && isBand(spot) ? ` transform="rotate(-90 ${at.x} ${at.y})"` : '';
  const text = (content, size) => `<text x="${at.x}" y="${at.y}" font-size="${size}" fill="#fff" text-anchor="middle" dominant-baseline="central"${rotate}>${content}</text>`;
  if (spot.startsWith('plein-')) return text(spot.slice(6), busy ? 17 : vertical ? 21 : 27);
  if (spot.startsWith('colonne')) return text('2:1', busy ? 13 : 17);
  if (spot === 'rouge' || spot === 'noir') {
    const s = busy ? 0.7 : 1;
    const [w, h] = vertical ? [14 * s, 24 * s] : [24 * s, 14 * s];
    return `<polygon points="${at.x},${at.y - h} ${at.x + w},${at.y} ${at.x},${at.y + h} ${at.x - w},${at.y}" fill="${spot === 'rouge' ? '#c21f43' : '#141014'}" stroke="#e6c47a" stroke-width="1.5"/>`;
  }
  const words = { manque: '1–18', passe: '19–36', pair: 'PAIR', impair: 'IMPAIR', douzaine1: '1–12', douzaine2: '13–24', douzaine3: '25–36' };
  return text(words[spot], busy ? 15 : 19);
}

const OFFSETS = [[0, 0], [15, -5], [-15, 5], [8, 8], [-8, -8], [21, 3], [-21, -3], [0, -9], [12, 9], [-12, -9]];

// ------------------------------------------------------------------ La roue
const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const STEP = 360 / ORDER.length;
const angleFor = (n) => -(ORDER.indexOf(n) * STEP + STEP / 2);
const polar = (deg, radius) => [radius * Math.cos(((deg - 90) * Math.PI) / 180), radius * Math.sin(((deg - 90) * Math.PI) / 180)];

function wheelSvg() {
  const R = 100;
  const inner = 62;
  const sectors = ORDER.map((n, i) => {
    const [x0, y0] = polar(i * STEP, R);
    const [x1, y1] = polar((i + 1) * STEP, R);
    const [x2, y2] = polar((i + 1) * STEP, inner);
    const [x3, y3] = polar(i * STEP, inner);
    const [tx, ty] = polar((i + 0.5) * STEP, 86);
    return `<path d="M${x3} ${y3} L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${inner} ${inner} 0 0 0 ${x3} ${y3} Z" fill="${pocketColor(n)}" stroke="#d9b56a" stroke-width="0.6"/>
      <text x="${tx}" y="${ty}" font-size="8" fill="#fff" text-anchor="middle" dominant-baseline="central" transform="rotate(${(i + 0.5) * STEP} ${tx} ${ty})">${n}</text>`;
  }).join('');
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const [x, y] = polar(i * 45, inner * 0.9);
    return `<line x1="0" y1="0" x2="${x}" y2="${y}" stroke="#e6c47a" stroke-width="3" stroke-linecap="round"/>`;
  }).join('');
  return `
    <defs><radialGradient id="cone" cx="45%" cy="40%" r="60%"><stop offset="0%" stop-color="#8a5a24"/><stop offset="100%" stop-color="#3b220b"/></radialGradient>
      <radialGradient id="ballShade" cx="35%" cy="30%" r="70%"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#b9b3ac"/></radialGradient></defs>
    <circle r="110" fill="#3a1f0a" stroke="#d9b56a" stroke-width="3"/>
    <g class="rotor" font-weight="700">${sectors}
      <circle r="${inner}" fill="url(#cone)" stroke="#d9b56a" stroke-width="1.5"/>${spokes}<circle r="10" fill="#e6c47a"/></g>
    <circle class="ball" r="5.5" fill="url(#ballShade)"/>`;
}

// ------------------------------------------------------------------ La table
export async function mount(el, ctx) {
  el.innerHTML = `
    <div class="game">
      <div class="history" data-part="history" title="Derniers numéros sortis"></div>
      <div class="status" data-part="status">Faites vos jeux</div>
      <div class="hint" data-part="hint">${HINT}</div>
      <div class="stage">
        <div class="board-wrap"><svg id="board" xmlns="http://www.w3.org/2000/svg" aria-label="Tapis de roulette"></svg></div>
        <aside class="players" data-part="players"></aside>
      </div>
      <div class="controls">
        <div data-part="rack"></div>
        <div class="actions">
          <button type="button" data-do="annuler">↩ Annuler</button>
          <button type="button" data-do="effacer">Effacer</button>
          <button type="button" data-do="doubler">×2</button>
          <button type="button" data-do="remettre">Remettre</button>
          <button type="button" data-do="lancer" class="primary">Lancer</button>
        </div>
      </div>
      <div class="overlay" data-part="overlay" hidden>
        <svg id="wheel" viewBox="-110 -110 220 220" xmlns="http://www.w3.org/2000/svg">${wheelSvg()}</svg>
        <div class="result" data-part="result"></div>
      </div>
    </div>`;
  const part = (name) => el.querySelector(`[data-part="${name}"]`);
  const board = el.querySelector('#board');
  let state = null;
  let chip = Number(saved.get('salle:roulette:jeton')) || 1_000;
  let inflight = 0;
  let animatedRound = null;
  let wheelDone = false;
  let portrait = null;
  let hideTimer = null;

  const me = () => state?.players.find((p) => p.me) ?? null;
  const available = () => (state ? (state.phase === 'mises' ? state.me.balance - state.me.onTable : state.me.balance) : 0);
  const rack = chipRack(part('rack'), {
    selected: chip,
    onPick(value) {
      chip = value;
      saved.set('salle:roulette:jeton', String(value));
      rack.select(value);
    },
  });

  function choosePortrait() {
    const wrap = board.parentElement;
    const w = wrap.clientWidth || 1;
    const h = wrap.clientHeight || 1;
    return Math.min(w / 322, h / 616) > Math.min(w / 896, h / 304) * 1.15;
  }

  function renderBoard() {
    const vertical = choosePortrait();
    portrait = vertical;
    const g = geometry(vertical);
    board.setAttribute('viewBox', `-10 -10 ${g.width + 20} ${g.height + 20}`);
    board.classList.toggle('closed', state.phase !== 'mises');
    const bySpot = new Map();
    for (const player of [...state.players].sort((a, b) => Number(a.me) - Number(b.me))) {
      for (const [spot, values] of player.bets) {
        if (!values.length) continue;
        if (!bySpot.has(spot)) bySpot.set(spot, []);
        bySpot.get(spot).push({ player, values });
      }
    }
    const revealed = state.phase === 'resultats' && state.spin;
    const winning = new Set(revealed ? state.spin.winning : []);
    const pocketSpot = revealed ? `plein-${state.spin.pocket}` : null;
    let out = `<rect x="-10" y="-10" width="${g.width + 20}" height="${g.height + 20}" rx="16" fill="#0f3b2b" stroke="#e6c47a" stroke-width="3"/>`;
    let chips = '';
    const r = vertical ? 14 : 17;
    for (const spot of ALL_SPOTS) {
      const b = g.box(spot);
      const busy = bySpot.has(spot);
      const at = anchors(spot, b, vertical);
      const fill = spot.startsWith('plein-') ? pocketColor(Number(spot.slice(6))) : 'transparent';
      const lit = winning.has(spot)
        ? `<rect x="${b.x + 2}" y="${b.y + 2}" width="${b.w - 4}" height="${b.h - 4}" rx="4" fill="#ffe27a" fill-opacity="${spot === pocketSpot ? 0.4 : 0.16}" stroke="#ffe27a" stroke-width="${spot === pocketSpot ? 5 : 2.5}"/>`
        : '';
      out += `<g class="cell" data-spot="${spot}">
        <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${fill}" stroke="#e6c47a" stroke-width="1.4"/>
        ${lit}${labelSvg(spot, busy ? at.label : { x: b.x + b.w / 2, y: b.y + b.h / 2 }, vertical, busy)}
        <rect class="hit" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="transparent"/></g>`;
      if (!busy) continue;
      bySpot.get(spot).forEach(({ player, values }, i) => {
        const [dx, dy] = OFFSETS[i % OFFSETS.length];
        const layers = values.map((value) => (player.me ? chipStyle(value) : { color: player.color, ink: player.ink }));
        chips += chipSvg(at.chip.x + dx * (vertical ? 0.8 : 1), at.chip.y + dy * (vertical ? 0.6 : 1), r, short(values.reduce((a, v) => a + v, 0)), {
          layers,
          faded: revealed && !winning.has(spot),
          glow: revealed && winning.has(spot),
        });
      });
    }
    board.innerHTML = `<g font-family="'Noto Sans', sans-serif" font-weight="700">${out}</g><g pointer-events="none" font-family="'Noto Sans', sans-serif">${chips}</g>`;
  }

  function statusText() {
    const status = part('status');
    const set = (text, hot = false) => { status.textContent = text; status.classList.toggle('hot', hot); };
    if (state.phase === 'mises') {
      if (state.closesAt) return set(`⏳ Dernier appel : la bille part dans ${Math.max(0, Math.ceil((state.closesAt - ctx.now()) / 1000))} s`, true);
      if (me()?.ready) return set('✅ Prêt ! On attend que les autres lancent aussi…');
      if (state.me.onTable) return set(`${fmt(state.me.onTable)} sur le tapis · ${fmt(available())} disponibles — « Lancer » quand tu es prêt`);
      return set('Faites vos jeux : choisis un jeton, puis clique sur le tapis');
    }
    if (state.phase === 'tirage' || !wheelDone) return set('🎡 Rien ne va plus !', true);
    const result = me()?.result;
    const gain = result && !result.dropped ? ` · ${result.net > 0 ? `tu gagnes +${fmt(result.net)}` : result.net < 0 ? `tu perds ${fmt(-result.net)}` : 'tu récupères ta mise'}` : '';
    return set(`La bille est sur le ${state.spin.pocket} (${traits(state.spin.pocket).toLowerCase()})${gain}`);
  }

  function renderPlayers() {
    const revealed = state.phase === 'resultats' && wheelDone;
    part('players').innerHTML = state.players
      .filter((p) => p.total || p.result || p.me)
      .map((p) => {
        let right = p.total ? fmt(p.total) : '—';
        let tone = '';
        if (revealed && p.result && !p.result.dropped) {
          right = signed(p.result.net);
          tone = p.result.net > 0 ? 'win' : p.result.net < 0 ? 'lose' : '';
        }
        return `<div class="player${p.me ? ' me' : ''}"><i style="background:${p.color}"></i>
          <span>${esc(p.name)}${p.me ? ' (toi)' : ''}${p.ready && state.phase === 'mises' ? ' <b class="ready">✓</b>' : ''}</span><em class="${tone}">${right}</em></div>`;
      })
      .join('') || '<div class="empty">Personne à la table</div>';
  }

  function renderControls() {
    const open = state.phase === 'mises';
    const has = Boolean(state.me.onTable);
    const button = (name) => el.querySelector(`[data-do="${name}"]`);
    button('annuler').disabled = !open || !has;
    button('effacer').disabled = !open || !has;
    button('doubler').disabled = !open || !has;
    button('remettre').disabled = !open || !state.me.canRebet;
    const spin = button('lancer');
    const ready = Boolean(me()?.ready) && open;
    spin.disabled = !open || !has || ready;
    spin.classList.toggle('ready', ready);
    spin.textContent = ready ? 'Prêt ✓' : 'Lancer';
    rack.limit(available(), open);
    rack.select(chip);
  }

  function renderResult() {
    const overlay = part('overlay');
    if (overlay.hidden || !wheelDone || !state.spin) return;
    const n = state.spin.pocket;
    const result = me()?.result;
    let gain = '';
    if (result && !result.dropped && state.phase === 'resultats') {
      gain = result.net > 0 ? `<div class="gain win">+${fmt(result.net)} jetons</div>` : result.net < 0 ? `<div class="gain lose">−${fmt(-result.net)} jetons</div>` : '<div class="gain">Mise récupérée</div>';
    } else if (result?.dropped) gain = '<div class="gain lose">Solde insuffisant au lancement : tes jetons ne jouaient pas.</div>';
    part('result').innerHTML = `<div class="number" style="color:${n === 0 ? '#49e08c' : RED.has(n) ? '#ff5a77' : '#fff'}">${n}</div><div>${traits(n)}</div>${gain}`;
  }

  function render() {
    if (!state) return;
    part('history').innerHTML = state.history.map((n) => `<b style="background:${pocketColor(n)}">${n}</b>`).join('');
    renderBoard();
    renderPlayers();
    renderControls();
    statusText();
    renderResult();
  }

  function hideOverlay() {
    clearTimeout(hideTimer);
    part('overlay').hidden = true;
  }

  /** La roue tourne et s'arrête sur le numéro tiré par le serveur (on rejoint l'animation en cours si besoin). */
  function spinWheel(spin) {
    part('overlay').hidden = false;
    wheelDone = false;
    part('result').innerHTML = '';
    clearTimeout(hideTimer);
    const start = performance.now() - Math.min(spin.elapsed ?? 0, spin.duration);
    const end = angleFor(spin.pocket);
    const from = end + 360 * 3;
    const ballFrom = -360 * 5;
    const rotor = el.querySelector('.rotor');
    const ball = el.querySelector('.ball');
    const frame = (t) => {
      if (!el.isConnected) return;
      const p = Math.min(1, (t - start) / spin.duration);
      const e = 1 - (1 - p) ** 3;
      rotor.setAttribute('transform', `rotate(${from + (end - from) * e})`);
      const depth = p < 0.72 ? 94 : p < 0.88 ? 94 - 20 * ((p - 0.72) / 0.16) + Math.sin(((p - 0.72) / 0.16) * Math.PI * 2) * 4 : 74;
      const [bx, by] = polar(ballFrom * (1 - e), depth);
      ball.setAttribute('cx', bx.toFixed(2));
      ball.setAttribute('cy', by.toFixed(2));
      if (p < 1) return requestAnimationFrame(frame);
      wheelDone = true;
      render();
      hideTimer = setTimeout(hideOverlay, 2500);
    };
    requestAnimationFrame(frame);
  }

  function apply(next) {
    state = next;
    if (next.spin && next.round !== animatedRound && (next.phase === 'tirage' || next.phase === 'resultats')) {
      animatedRound = next.round;
      spinWheel(next.spin);
    }
    if (next.phase === 'mises') hideOverlay();
    render();
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

  // Les clics sur le tapis
  function place(spot) {
    if (state?.phase !== 'mises') return;
    if (chip > available()) return toast(`Il te reste ${fmt(available())} jetons : prends un plus petit jeton.`);
    const mine = me();
    if (mine) {
      // On montre le jeton tout de suite ; le serveur confirme (ou refuse) juste après.
      const entry = mine.bets.find(([key]) => key === spot);
      if (entry) entry[1].push(chip);
      else mine.bets.push([spot, [chip]]);
      mine.total += chip;
      mine.ready = false;
      state.me.onTable += chip;
      render();
    }
    send({ action: 'poser', spot, value: chip });
  }
  const remove = (spot) => state?.phase === 'mises' && send({ action: 'retirer', spot });
  const spotAt = (event) => event.target.closest?.('[data-spot]')?.dataset.spot ?? null;
  let pressTimer = null;
  let longPress = false;
  board.addEventListener('click', (event) => {
    if (longPress) { longPress = false; return; }
    const spot = spotAt(event);
    if (spot) place(spot);
  });
  board.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const spot = spotAt(event);
    if (spot) remove(spot);
  });
  board.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    const spot = spotAt(event);
    if (spot) pressTimer = setTimeout(() => { longPress = true; remove(spot); }, 550);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) board.addEventListener(type, () => clearTimeout(pressTimer));
  board.addEventListener('pointerover', (event) => {
    const spot = spotAt(event);
    if (!spot) return;
    const [label, pays, count] = ruleOf(spot);
    part('hint').textContent = `${label} · paie ×${pays} · ${count} numéro${count > 1 ? 's' : ''} sur 37`;
  });
  board.addEventListener('pointerleave', () => { part('hint').textContent = HINT; });
  el.querySelector('.actions').addEventListener('click', (event) => {
    const action = event.target.closest('[data-do]')?.dataset.do;
    if (action) send({ action });
  });

  const onResize = () => { if (state && choosePortrait() !== portrait) renderBoard(); };
  window.addEventListener('resize', onResize);
  ctx.onLeave(() => window.removeEventListener('resize', onResize));
  const ticker = setInterval(() => { if (state) statusText(); }, 250);
  ctx.onLeave(() => clearInterval(ticker));
  ctx.every(900, async () => {
    if (inflight) return;
    const next = await ctx.get();
    if (!inflight) apply(next);
  });
}
