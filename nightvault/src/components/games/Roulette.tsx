'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameShell } from './GameShell';
import { useInstantGame } from './useGame';
import { useSession } from '@/components/session/SessionProvider';
import { audio } from '@/lib/audio/engine';

type Meta = { id: string; name: string; tagline: string; accent: string; rtp: number; volatility: string; maxWin: number };
type Bet = { kind: string; value?: number; amount: number };
type Result = { number: number; color: string; wheelIndex: number; wins: { kind: string; value?: number; amount: number; payout: number }[] };

const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const CHIPS = [100, 500, 1_000, 5_000, 25_000];

const colorOf = (n: number) => (n === 0 ? '#2ee08a' : RED.has(n) ? '#c0182b' : '#14161f');

/** ROULETTE EUROPÉENNE — roue dessinée en canvas, bille qui ralentit et retombe sur le numéro du serveur. */
export function RouletteGame({ meta }: { meta: Meta }) {
  const { play, busy, error } = useInstantGame<Result>('european-roulette');
  const { me } = useSession();
  const [chip, setChip] = useState(500);
  const [bets, setBets] = useState<Bet[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [last, setLast] = useState<Result | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const angle = useRef(0);
  const ball = useRef({ angle: 0, radius: 0.86 });
  const raf = useRef(0);

  const total = bets.reduce((sum, bet) => sum + bet.amount, 0);

  const draw = useCallback(() => {
    const node = canvas.current;
    const ctx = node?.getContext('2d');
    if (!node || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.min(node.clientWidth, node.clientHeight);
    if (node.width !== size * ratio) {
      node.width = size * ratio;
      node.height = size * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    const c = size / 2;
    const R = size * 0.46;
    ctx.clearRect(0, 0, size, size);

    // plateau extérieur
    const rim = ctx.createRadialGradient(c, c, R * 0.82, c, c, R);
    rim.addColorStop(0, '#2a2016');
    rim.addColorStop(0.5, '#6b4f22');
    rim.addColorStop(1, '#241a10');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.fill();

    // cases
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(angle.current);
    const step = (Math.PI * 2) / WHEEL.length;
    WHEEL.forEach((number, index) => {
      const a0 = index * step - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R * 0.82, a0, a0 + step);
      ctx.closePath();
      ctx.fillStyle = colorOf(number);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,162,74,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // numéro
      ctx.save();
      ctx.rotate(a0 + step / 2);
      ctx.translate(R * 0.71, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#f3f5fb';
      ctx.font = `600 ${Math.max(9, size * 0.032)}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(String(number), 0, 0);
      ctx.restore();
    });
    // moyeu
    const hub = ctx.createRadialGradient(0, -R * 0.1, 2, 0, 0, R * 0.42);
    hub.addColorStop(0, '#ffe9b0');
    hub.addColorStop(0.5, '#c8a24a');
    hub.addColorStop(1, '#5c451a');
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // bille
    const bx = c + Math.cos(ball.current.angle - Math.PI / 2) * R * ball.current.radius;
    const by = c + Math.sin(ball.current.angle - Math.PI / 2) * R * ball.current.radius;
    const glow = ctx.createRadialGradient(bx - 2, by - 2, 0.5, bx, by, size * 0.022);
    glow.addColorStop(0, '#ffffff');
    glow.addColorStop(1, '#8b93a6');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bx, by, size * 0.019, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const addBet = (kind: string, value?: number) => {
    if (spinning) return;
    audio.roulette.chips();
    setBets((current) => {
      const found = current.find((bet) => bet.kind === kind && bet.value === value);
      if (found) return current.map((bet) => (bet === found ? { ...bet, amount: bet.amount + chip } : bet));
      return [...current, { kind, value, amount: chip }];
    });
  };

  const spin = async () => {
    if (!bets.length || spinning) return;
    if ((me?.balance ?? 0) < total) return;
    setSpinning(true);
    setLast(null);
    audio.roulette.spin(5200);

    const data = await play(total, { bets });
    if (!data) {
      setSpinning(false);
      return;
    }

    // Animation : la roue tourne, la bille ralentit et se cale sur la case tirée
    const target = data.result.wheelIndex;
    const step = (Math.PI * 2) / WHEEL.length;
    const started = performance.now();
    const duration = 5200;
    const startAngle = angle.current;
    const finalAngle = startAngle + Math.PI * 2 * 6;
    const ballStart = ball.current.angle;
    const ballFinal = ballStart + Math.PI * 2 * 11 + (target * step + step / 2) - (finalAngle % (Math.PI * 2));
    let lastTick = 0;

    const loop = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      angle.current = startAngle + (finalAngle - startAngle) * eased;
      ball.current.angle = ballStart + (ballFinal - ballStart) * eased;
      ball.current.radius = 0.86 - 0.2 * eased ** 2;
      draw();
      if (now - lastTick > 70 && progress < 0.92) {
        lastTick = now;
        audio.roulette.tick();
      }
      if (progress < 1) raf.current = requestAnimationFrame(loop);
      else {
        audio.roulette.ball();
        setSpinning(false);
        setLast(data.result);
        setHistory((values) => [data.result.number, ...values].slice(0, 14));
        if (data.payout > 0) audio.win(data.multiplier >= 10 ? 'big' : 'medium');
        setBets([]);
      }
    };
    raf.current = requestAnimationFrame(loop);
  };

  const outside: { label: string; kind: string; value?: number; color?: string }[] = [
    { label: 'Rouge', kind: 'red', color: '#c0182b' },
    { label: 'Noir', kind: 'black', color: '#14161f' },
    { label: 'Pair', kind: 'even' },
    { label: 'Impair', kind: 'odd' },
    { label: '1-18', kind: 'low' },
    { label: '19-36', kind: 'high' },
    { label: '1ʳᵉ douzaine', kind: 'dozen', value: 1 },
    { label: '2ᵉ douzaine', kind: 'dozen', value: 2 },
    { label: '3ᵉ douzaine', kind: 'dozen', value: 3 },
  ];

  return (
    <GameShell
      {...meta}
      rules={
        <>
          <p>37 cases (0 à 36), un seul zéro : l’avantage de la maison est de 2,70 % sur toutes les mises.</p>
          <p>Plein : ×36 · Douzaine et colonne : ×3 · Rouge/Noir, Pair/Impair, 1-18/19-36 : ×2.</p>
          <p>Choisis un jeton, clique sur le tapis pour miser, puis lance la roue.</p>
        </>
      }
      side={
        <div className="panel-2 space-y-3 p-4">
          <div>
            <div className="mb-1.5 text-[0.62rem] uppercase tracking-[0.28em] text-[var(--muted)]">Jeton</div>
            <div className="grid grid-cols-5 gap-1.5">
              {CHIPS.map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    setChip(value);
                    audio.ui.click();
                  }}
                  className="btn px-1 py-2 text-[0.62rem]"
                  style={chip === value ? { borderColor: 'var(--gold)', color: 'var(--gold-bright)' } : undefined}
                >
                  {value >= 1000 ? `${value / 1000}k` : value}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Mise totale</span>
              <span className="num font-semibold">{total.toLocaleString('fr-FR')} NV</span>
            </div>
            <div className="mt-2 max-h-24 space-y-1 overflow-y-auto">
              {bets.map((bet, index) => (
                <div key={index} className="flex justify-between text-[0.68rem] text-[var(--muted)]">
                  <span>
                    {bet.kind === 'straight' ? `N° ${bet.value}` : bet.kind}
                    {bet.kind === 'dozen' ? ` ${bet.value}` : ''}
                  </span>
                  <span className="num">{bet.amount.toLocaleString('fr-FR')}</span>
                </div>
              ))}
              {!bets.length && <p className="text-[0.68rem] text-[var(--dim)]">Clique sur le tapis pour miser.</p>}
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn flex-1 py-2 text-xs" onClick={() => setBets([])} disabled={spinning || !bets.length}>
              Annuler
            </button>
            <button className="btn btn-gold flex-[2] py-3" onClick={spin} disabled={busy || spinning || !bets.length}>
              {spinning ? 'La roue tourne…' : 'Tourner'}
            </button>
          </div>
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </div>
      }
    >
      <div className="grid h-full gap-4 lg:grid-cols-[minmax(240px,340px)_1fr]">
        <div className="relative grid place-items-center">
          <canvas ref={canvas} className="aspect-square w-full max-w-[340px]" />
          {last && (
            <div
              className="pop absolute left-1/2 top-2 -translate-x-1/2 rounded-xl px-4 py-2 text-center"
              style={{ background: 'rgba(6,7,12,0.86)', border: `1px solid ${colorOf(last.number)}` }}
            >
              <div className="num text-2xl font-bold" style={{ color: last.number === 0 ? 'var(--success)' : RED.has(last.number) ? '#ff6b7a' : 'var(--text)' }}>
                {last.number}
              </div>
              <div className="text-[0.6rem] uppercase tracking-widest text-[var(--muted)]">{last.color}</div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          {/* Tapis : numéros */}
          <div className="grid grid-cols-[28px_repeat(12,1fr)] gap-1">
            <button
              onClick={() => addBet('straight', 0)}
              className="row-span-3 rounded-lg text-xs font-bold"
              style={{ background: 'linear-gradient(180deg,#2ee08a,#12784b)', color: '#04200f' }}
            >
              0
            </button>
            {[2, 1, 0].map((row) =>
              Array.from({ length: 12 }, (_, column) => {
                const number = column * 3 + row + 1;
                return (
                  <button
                    key={number}
                    onClick={() => addBet('straight', number)}
                    className="aspect-square rounded-md text-[0.62rem] font-semibold transition-transform hover:scale-105"
                    style={{
                      background: RED.has(number) ? 'linear-gradient(180deg,#e0263c,#8e1220)' : 'linear-gradient(180deg,#2b3145,#0f131d)',
                      color: '#fff',
                      outline: bets.some((bet) => bet.kind === 'straight' && bet.value === number) ? '2px solid var(--gold)' : undefined,
                    }}
                  >
                    {number}
                  </button>
                );
              }),
            )}
          </div>

          {/* Tapis : mises extérieures */}
          <div className="grid grid-cols-3 gap-1.5">
            {outside.map((bet) => (
              <button
                key={`${bet.kind}-${bet.value ?? ''}`}
                onClick={() => addBet(bet.kind, bet.value)}
                className="btn py-2 text-[0.68rem]"
                style={{
                  ...(bet.color ? { background: `linear-gradient(180deg, ${bet.color}, #0f131d)` } : {}),
                  outline: bets.some((entry) => entry.kind === bet.kind && entry.value === bet.value) ? '2px solid var(--gold)' : undefined,
                }}
              >
                {bet.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1 pt-1">
            {history.map((number, index) => (
              <span
                key={index}
                className="num grid h-7 w-7 place-items-center rounded-md text-[0.66rem] font-semibold"
                style={{ background: colorOf(number), color: '#fff' }}
              >
                {number}
              </span>
            ))}
          </div>
        </div>
      </div>
    </GameShell>
  );
}
