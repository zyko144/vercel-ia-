// Machine à sous : trois rouleaux qui tournent puis s'arrêtent l'un après l'autre
// sur le tirage du serveur. Trois 7 paient ×200.
import { betBuilder, esc, flash, fmt, mult, signed } from '../kit.js';

// Les symboles, dessinés dans une boîte de 100 × 100 (les mêmes que les images Discord).
const ART = {
  cerise: `<path d="M52 18 C46 34 38 44 31 56" stroke="#4d9a36" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M52 18 C60 32 66 42 69 53" stroke="#4d9a36" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M52 18 C62 12 72 14 76 20 C68 24 60 23 52 18 Z" fill="#5fb83e"/>
    <circle cx="30" cy="68" r="18" fill="#d11f3c"/><circle cx="70" cy="65" r="18" fill="#e02449"/>
    <circle cx="24" cy="62" r="5" fill="#ff9aac"/><circle cx="64" cy="59" r="5" fill="#ff9aac"/>`,
  citron: `<path d="M12 52 C18 30 40 20 60 24 C78 27 90 40 90 52 C90 66 76 80 54 81 C34 82 16 72 12 52 Z" fill="#ffd23f" stroke="#e0a800" stroke-width="2"/>
    <path d="M86 44 L95 38 L92 50 Z" fill="#e0a800"/><ellipse cx="40" cy="42" rx="12" ry="6" fill="#fff3b0" opacity="0.8"/>`,
  cloche: `<path d="M50 14 C30 14 26 34 26 50 C26 62 20 68 14 74 L86 74 C80 68 74 62 74 50 C74 34 70 14 50 14 Z" fill="#f2c14e" stroke="#b8860b" stroke-width="2.5"/>
    <rect x="44" y="8" width="12" height="9" rx="3" fill="#b8860b"/><circle cx="50" cy="82" r="8" fill="#b8860b"/>
    <path d="M36 28 C34 40 34 52 36 62" stroke="#fff4c7" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>`,
  etoile: `<polygon points="50,6 62,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 38,38" fill="#ffcc33" stroke="#d9971a" stroke-width="3" stroke-linejoin="round"/>
    <polygon points="50,20 57,40 42,40" fill="#fff4c2" opacity="0.8"/>`,
  diamant: `<polygon points="22,32 36,14 64,14 78,32 50,90" fill="#57d2ff" stroke="#1d8ec2" stroke-width="2.5" stroke-linejoin="round"/>
    <polygon points="22,32 78,32 50,90" fill="#2fb3ec"/><polygon points="36,14 50,32 64,14" fill="#b8ecff"/>
    <polygon points="22,32 36,14 50,32" fill="#8fe0ff"/>`,
  sept: `<text x="50" y="56" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="92" fill="#ff3fa6" stroke="#ffd98a" stroke-width="4"
    paint-order="stroke" text-anchor="middle" dominant-baseline="middle">7</text>`,
};
const FROM_EMOJI = { '🍒': 'cerise', '🍋': 'citron', '🔔': 'cloche', '⭐': 'etoile', '💎': 'diamant', '7️⃣': 'sept' };
const NAMES = Object.keys(ART);
const STRIP = 22; // symboles par rouleau pendant un tour
const symbol = (name) => `<svg viewBox="-8 -8 116 116" xmlns="http://www.w3.org/2000/svg">${ART[name]}</svg>`;
const randomName = () => NAMES[Math.floor(Math.random() * NAMES.length)];

export async function mount(el, ctx) {
  el.innerHTML = `
    <div class="game">
      <div class="status" data-part="status">Trois rouleaux : trois 7 paient ×200.</div>
      <div class="slot"><div class="slot-frame" data-part="frame">
        ${[0, 1, 2].map(() => '<div class="reel"><div class="reel-strip"></div></div>').join('')}
      </div></div>
      <div class="paytable" data-part="paytable"></div>
      <div class="controls">
        <div data-part="bet"></div>
        <div class="actions"><button type="button" data-do="jouer" class="primary big">🎰 Tourner</button></div>
      </div>
    </div>`;
  const part = (name) => el.querySelector(`[data-part="${name}"]`);
  const spinButton = el.querySelector('[data-do="jouer"]');
  const bet = betBuilder(part('bet'), { key: 'machine', onChange: () => { spinButton.textContent = `🎰 Tourner · ${fmt(bet.value)}`; } });
  const strips = [...el.querySelectorAll('.reel-strip')];
  let current = ['sept', 'diamant', 'etoile'];
  let spinning = false;

  /** Pose un rouleau : `names[1]` est la ligne du milieu, celle du tirage. */
  function setReel(index, names, offset = 0, duration = 0) {
    const strip = strips[index];
    const height = strip.parentElement.clientHeight / 3;
    strip.style.transition = duration ? `transform ${duration}ms cubic-bezier(0.12, 0.8, 0.25, 1)` : 'none';
    strip.innerHTML = names.map((name) => `<div style="height:${height}px">${symbol(name)}</div>`).join('');
    strip.querySelectorAll('svg').forEach((svg) => { svg.style.height = `${height}px`; });
    strip.style.transform = `translateY(${-offset * height}px)`;
  }
  const idle = () => current.forEach((name, i) => setReel(i, [randomName(), name, randomName()]));

  async function spin() {
    if (spinning) return;
    spinning = true;
    spinButton.disabled = true;
    part('frame').classList.remove('win');
    const reply = await ctx.act({ action: 'jouer', bet: bet.value });
    if (!reply.ok || !reply.draw) {
      spinning = false;
      spinButton.disabled = false;
      return;
    }
    const final = reply.draw.reels.map((emoji) => FROM_EMOJI[emoji] ?? 'etoile');
    // Chaque rouleau part de ce qu'il montrait et défile jusqu'au tirage.
    final.forEach((name, i) => {
      const names = [randomName(), current[i], randomName()];
      while (names.length < STRIP - 2) names.push(randomName());
      names.push(name, randomName());
      setReel(i, names, 0, 0);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const height = strips[i].parentElement.clientHeight / 3;
        strips[i].style.transition = `transform ${1300 + i * 450}ms cubic-bezier(0.12, 0.8, 0.25, 1)`;
        strips[i].style.transform = `translateY(${-(STRIP - 2 - 1) * height}px)`;
      }));
    });
    await new Promise((resolve) => setTimeout(resolve, 1300 + 2 * 450 + 150));
    current = final;
    idle();
    const { net, multiplier, label } = reply.draw;
    part('status').textContent = multiplier ? `${label} → ${mult(multiplier)} : ${signed(net)} jetons` : `${label} ${signed(net)} jetons`;
    if (net > 0) {
      part('frame').classList.add('win');
      flash(el.querySelector('.game'), { title: multiplier >= 30 ? `JACKPOT ${mult(multiplier)}` : 'GAGNÉ', sub: `${signed(net)} jetons`, tone: 'win' });
    }
    ctx.balance(reply.draw.balance);
    bet.limit(reply.draw.balance);
    spinning = false;
    spinButton.disabled = false;
  }

  spinButton.addEventListener('click', spin);
  const state = await ctx.get();
  part('paytable').innerHTML = esc(state.paytable).replace(/\n/g, '<br>');
  bet.limit(state.me.balance);
  spinButton.textContent = `🎰 Tourner · ${fmt(bet.value)}`;
  if (state.last?.reels) current = state.last.reels.map((emoji) => FROM_EMOJI[emoji] ?? 'etoile');
  requestAnimationFrame(idle);
  const onResize = () => { if (!spinning) idle(); };
  window.addEventListener('resize', onResize);
  ctx.onLeave(() => window.removeEventListener('resize', onResize));
}
