'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BetControls } from './BetControls';
import { GameShell } from './GameShell';
import { useStatefulGame } from './useGame';
import { audio } from '@/lib/audio/engine';

type Meta = { id: string; name: string; tagline: string; accent: string; rtp: number; volatility: string; maxWin: number };
type View = { startedAt: number; autoCashout?: number; crashAt?: number; multiplier: number; done: boolean; growth: number };

/**
 * CRASH — la fusée monte, le multiplicateur grimpe, elle explose à un moment inconnu.
 * La courbe est dessinée en canvas (60 fps) ; le point de crash vient du serveur.
 */
export function CrashGame({ meta }: { meta: Meta }) {
  const { open, act, view, bet, busy, error, outcome, setOutcome } = useStatefulGame<View>('crash');
  const [amount, setAmount] = useState(1_000);
  const [autoTarget, setAutoTarget] = useState(2);
  const [useAuto, setUseAuto] = useState(false);
  const [multiplier, setMultiplier] = useState(1);
  const [flying, setFlying] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);
  const tickRef = useRef(0);

  // Dessin de la courbe
  const draw = useCallback(
    (value: number, crashed: boolean) => {
      const node = canvas.current;
      const ctx = node?.getContext('2d');
      if (!node || !ctx) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (node.width !== width * ratio) {
        node.width = width * ratio;
        node.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      ctx.clearRect(0, 0, width, height);

      // grille
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (height / 5) * i);
        ctx.lineTo(width, (height / 5) * i);
        ctx.stroke();
      }

      const span = Math.max(2, value * 1.15);
      const points = 120;
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const progress = i / points;
        const current = 1 + (value - 1) * progress;
        const x = progress * width * 0.94;
        const y = height - ((current - 1) / (span - 1)) * height * 0.86 - 10;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      const stroke = ctx.createLinearGradient(0, height, width, 0);
      stroke.addColorStop(0, crashed ? '#7a1420' : '#ff2d9b');
      stroke.addColorStop(1, crashed ? '#ff4d5e' : '#ffd166');
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 22;
      ctx.shadowColor = crashed ? '#ff4d5e' : '#ff2d9b';
      ctx.stroke();

      // remplissage sous la courbe
      ctx.lineTo(width * 0.94, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, 0, 0, height);
      fill.addColorStop(0, crashed ? 'rgba(255,77,94,0.22)' : 'rgba(255,45,155,0.22)');
      fill.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fill;
      ctx.shadowBlur = 0;
      ctx.fill();

      // fusée
      const x = width * 0.94;
      const y = height - ((value - 1) / (span - 1)) * height * 0.86 - 10;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.5);
      ctx.fillStyle = crashed ? '#ff4d5e' : '#ffe3a6';
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(6, 7);
      ctx.lineTo(0, 3);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    [],
  );

  // Boucle d'animation pendant le vol
  useEffect(() => {
    if (!flying || !view) return;
    const growth = view.growth ?? 0.12;
    const started = view.startedAt;
    const loop = () => {
      const elapsed = Date.now() - started;
      const value = Math.exp(growth * (elapsed / 1000));
      setMultiplier(value);
      draw(value, false);
      if (Date.now() - tickRef.current > 220) {
        tickRef.current = Date.now();
        audio.crash.tick(value);
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [draw, flying, view]);

  const launch = async () => {
    setOutcome(null);
    setMultiplier(1);
    audio.crash.launch();
    const opened = await open(amount, useAuto ? { autoCashout: autoTarget } : {});
    if (!opened) return;

    if (useAuto) {
      // le serveur a déjà tranché : on rejoue l'animation jusqu'au point de sortie
      const target = opened.crashAt ?? autoTarget;
      const end = Math.min(target, autoTarget);
      const won = (opened.crashAt ?? 0) >= autoTarget;
      animateTo(won ? autoTarget : opened.crashAt ?? end, !won);
      setHistory((values) => [opened.crashAt ?? end, ...values].slice(0, 12));
    } else {
      setFlying(true);
    }
  };

  /** Rejoue une courbe déjà résolue (mode automatique). */
  const animateTo = (value: number, crashed: boolean) => {
    const started = performance.now();
    const duration = (Math.log(value) / 0.12) * 1000;
    const loop = (now: number) => {
      const progress = Math.min(1, (now - started) / Math.max(400, duration));
      const current = Math.exp(Math.log(value) * progress);
      setMultiplier(current);
      draw(current, false);
      if (progress < 1) raf.current = requestAnimationFrame(loop);
      else {
        draw(value, crashed);
        if (crashed) audio.crash.boom();
        else audio.crash.cashout(value);
      }
    };
    raf.current = requestAnimationFrame(loop);
  };

  const cashout = async () => {
    if (!flying) return;
    const data = await act({ type: 'cashout' });
    setFlying(false);
    cancelAnimationFrame(raf.current);
    const crashAt = (data?.view as View | undefined)?.crashAt ?? multiplier;
    setHistory((values) => [crashAt, ...values].slice(0, 12));
    if (data?.payout > 0) {
      draw(data.multiplier, false);
      setMultiplier(data.multiplier);
      audio.crash.cashout(data.multiplier);
    } else {
      draw(crashAt, true);
      setMultiplier(crashAt);
      audio.crash.boom();
    }
  };

  // Le serveur fait foi : si le joueur n'a pas encaissé et que la fusée a explosé, on ferme la manche
  useEffect(() => {
    if (!flying || !view?.crashAt) return;
    if (multiplier >= view.crashAt) {
      setFlying(false);
      void act({ type: 'cashout' });
    }
  }, [act, flying, multiplier, view]);

  return (
    <GameShell
      {...meta}
      rules={
        <>
          <p>La fusée décolle et le multiplicateur grimpe. Encaisse avant l’explosion.</p>
          <p>En mode automatique, ta cible est fixée avant le départ : aucune latence réseau ne peut te pénaliser.</p>
          <p>Le point de crash suit une loi en 1/x : P(crash ≥ m) = 0,99 / m.</p>
        </>
      }
      side={
        <BetControls
          bet={amount}
          setBet={setAmount}
          disabled={busy || flying}
          action={flying ? 'En vol…' : 'Décoller'}
          onAction={launch}
        >
          <button
            className="btn w-full py-2 text-xs"
            onClick={() => {
              setUseAuto((value) => !value);
              audio.ui.toggle();
            }}
            style={useAuto ? { borderColor: meta.accent, color: meta.accent } : undefined}
          >
            {useAuto ? `Encaissement auto à ${autoTarget}×` : 'Encaissement manuel'}
          </button>
          {useAuto && (
            <input
              type="number"
              step="0.1"
              min={1.01}
              value={autoTarget}
              onChange={(event) => setAutoTarget(Math.max(1.01, Number(event.target.value)))}
              className="num w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            />
          )}
          {flying && (
            <button className="btn btn-success w-full py-3" onClick={cashout}>
              Encaisser {(bet * multiplier).toFixed(0)} NV ({multiplier.toFixed(2)}×)
            </button>
          )}
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </BetControls>
      }
    >
      <div className="flex h-full flex-col">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {history.map((value, index) => (
            <span
              key={index}
              className="num rounded-lg px-2 py-1 text-[0.68rem]"
              style={{
                background: value >= 2 ? 'rgba(46,224,138,0.12)' : 'rgba(255,77,94,0.1)',
                color: value >= 2 ? 'var(--success)' : 'var(--danger)',
              }}
            >
              {value.toFixed(2)}×
            </span>
          ))}
        </div>

        <div className="relative flex-1">
          <canvas ref={canvas} className="h-full min-h-[300px] w-full" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div
              className="num text-6xl font-bold md:text-8xl"
              style={{
                color: outcome && outcome.payout === 0 ? 'var(--danger)' : 'var(--text)',
                textShadow: flying ? '0 0 40px rgba(255,45,155,0.55)' : undefined,
              }}
            >
              {multiplier.toFixed(2)}
              <span className="text-3xl md:text-5xl">×</span>
            </div>
          </div>
        </div>
      </div>
    </GameShell>
  );
}
