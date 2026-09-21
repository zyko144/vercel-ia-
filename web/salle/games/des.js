// Dés : trois zones sur le tapis (moins de 7, 7, plus de 7). On choisit un jeton,
// on clique sur une ou plusieurs zones pour l'y poser, puis on lance les deux dés.
import { chipRack, chipStyle, chipSvg, flash, fmt, saved, short, signed, toast } from '../kit.js';

const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]] };
const die = (n, rolling = false) => `<svg class="die${rolling ? ' roll' : ''}" viewBox="0 0 100 100">
  <rect x="4" y="4" width="92" height="92" rx="18" fill="#fffaf2" stroke="#d9cfc6" stroke-width="3"/>
  ${PIPS[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${n === 1 ? '#c21f43' : '#1a1016'}"/>`).join('')}</svg>`;
const ZONE_TEXT = { moins: ['Moins de 7', '2 à 6'], sept: ['Exactement 7', 'le chiffre magique'], plus: ['Plus de 7', '8 à 12'] };

export async function mount(el, ctx) {
  el.innerHTML = `
    <div class="game">
      <div class="status" data-part="status">Pose tes jetons sur une ou plusieurs zones, puis lance les dés.</div>
      <div class="dice-stage">
        <div class="dice" data-part="dice">${die(3)}${die(4)}</div>
        <div class="zones" data-part="zones"></div>
      </div>
      <div class="controls">
        <div data-part="rack"></div>
        <div class="actions">
          <button type="button" data-do="effacer">Effacer</button>
          <button type="button" data-do="lancer" class="primary big">🎲 Lancer les dés</button>
        </div>
      </div>
    </div>`;
  const part = (name) => el.querySelector(`[data-part="${name}"]`);
  let state = await ctx.get();
  let chip = Number(saved.get('salle:des:jeton')) || 1_000;
  let bets = { moins: [], sept: [], plus: [] };
  let rolling = false;
  let outcome = null;

  const total = () => Object.values(bets).flat().reduce((a, v) => a + v, 0);
  const rack = chipRack(part('rack'), {
    selected: chip,
    onPick(value) {
      chip = value;
      saved.set('salle:des:jeton', String(value));
      rack.select(value);
    },
  });

  function renderZones() {
    const order = ['moins', 'sept', 'plus']; // de gauche à droite, comme les totaux
    part('zones').innerHTML = [...state.zones].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)).map((zone) => {
      const values = bets[zone.key];
      const amount = values.reduce((a, v) => a + v, 0);
      const result = outcome?.zones.find((z) => z.key === zone.key);
      const cls = result ? (result.won ? 'won' : 'lost') : '';
      return `<div class="zone ${cls}" data-zone="${zone.key}">
        <b>${ZONE_TEXT[zone.key][0]}</b><small>${ZONE_TEXT[zone.key][1]} · paie ×${String(zone.pays).replace('.', ',')} · ${zone.ways} chances sur 36</small>
        ${amount ? `<svg class="stack" width="52" height="52" viewBox="-26 -26 52 60">${chipSvg(0, 0, 20, short(amount), { layers: values.map(chipStyle) })}</svg>` : ''}
        ${result?.won ? `<small class="win-text">+${fmt(result.payout)}</small>` : ''}</div>`;
    }).join('');
    rack.limit(state.me.balance - total(), !rolling);
    el.querySelector('[data-do="lancer"]').disabled = rolling || !total();
    el.querySelector('[data-do="effacer"]').disabled = rolling || !total();
    if (!rolling && !outcome) part('status').textContent = total() ? `${fmt(total())} sur le tapis — « Lancer les dés » quand tu es prêt` : 'Choisis un jeton, clique sur une ou plusieurs zones, puis lance les dés.';
  }

  part('zones').addEventListener('click', (event) => {
    const zone = event.target.closest('[data-zone]')?.dataset.zone;
    if (!zone || rolling) return;
    if (chip > state.me.balance - total()) return toast(`Il te reste ${fmt(state.me.balance - total())} jetons : prends un plus petit jeton.`);
    outcome = null;
    bets[zone].push(chip);
    renderZones();
  });
  part('zones').addEventListener('contextmenu', (event) => {
    event.preventDefault();
    const zone = event.target.closest('[data-zone]')?.dataset.zone;
    if (!zone || rolling) return;
    bets[zone].pop();
    outcome = null;
    renderZones();
  });
  el.querySelector('[data-do="effacer"]').addEventListener('click', () => {
    bets = { moins: [], sept: [], plus: [] };
    outcome = null;
    renderZones();
  });
  el.querySelector('[data-do="lancer"]').addEventListener('click', async () => {
    if (rolling || !total()) return;
    rolling = true;
    outcome = null;
    renderZones();
    part('status').textContent = 'Les dés roulent…';
    const tumble = setInterval(() => {
      part('dice').innerHTML = die(1 + Math.floor(Math.random() * 6), true) + die(1 + Math.floor(Math.random() * 6), true);
    }, 90);
    const amounts = Object.fromEntries(Object.entries(bets).map(([key, values]) => [key, values.reduce((a, v) => a + v, 0)]));
    const [reply] = await Promise.all([ctx.act({ action: 'lancer', bets: amounts }), new Promise((resolve) => setTimeout(resolve, 1100))]);
    clearInterval(tumble);
    rolling = false;
    if (!reply.ok || !reply.draw) {
      part('dice').innerHTML = die(3) + die(4);
      renderZones();
      return;
    }
    const { a, b, total: sum, net } = reply.draw;
    outcome = reply.draw;
    part('dice').innerHTML = die(a) + die(b);
    state = reply.state;
    part('status').textContent = `${a} + ${b} = ${sum} · ${net > 0 ? `gagné ${signed(net)}` : net < 0 ? `perdu ${signed(net)}` : 'mise rendue'} jetons`;
    flash(el.querySelector('.game'), { title: `${sum}`, sub: `${signed(net)} jetons`, tone: net > 0 ? 'win' : net < 0 ? 'lose' : 'push' });
    renderZones();
  });

  renderZones();
}
