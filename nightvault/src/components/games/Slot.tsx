'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BetControls } from './BetControls';
import { GameShell } from './GameShell';
import { useInstantGame } from './useGame';
import { Counter } from '@/components/ui/Balance';
import { audio } from '@/lib/audio/engine';
import { SymbolArt } from './SymbolArt';

type Win = { line: number; symbol: string; count: number; pay: number };
type SpinResult = {
  window: string[][];
  wins: Win[];
  scatters: number;
  lineMultiplier: number;
  freeSpins?: { spins: SpinResult[]; multiplier: number; total: number };
};

export type SlotView = {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  reels: number;
  rows: number;
  symbols: { id: string; name: string; pays: number[]; kind?: string; color: string }[];
  strips: string[][];
  paylines: number[][];
  math: { rtp: number; volatility: string; maxWin: number };
};

const SYMBOL_HEIGHT = 92; // px, taille d'une case sur un rouleau
const SPIN_BASE = 900; // durée du premier rouleau
const SPIN_STEP = 190; // décalage entre deux rouleaux

/**
 * ReelEngine côté client.
 * Les rouleaux défilent vraiment (translation continue d'une bande de symboles),
 * accélèrent, décélèrent et s'arrêtent l'un après l'autre sur le résultat du serveur.
 */
function Reel({
  strip,
  rows,
  target,
  spinning,
  delay,
  symbols,
  onStop,
}: {
  strip: string[];
  rows: number;
  target: string[] | null;
  spinning: boolean;
  delay: number;
  symbols: SlotView['symbols'];
  onStop: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [settled, setSettled] = useState<string[] | null>(null);
  const raf = useRef(0);
  const started = useRef(0);
  const stopAt = useRef(0);

  // Bande longue : on boucle dessus pendant la rotation
  const loop = useMemo(() => {
    const repeats = Math.ceil(28 / strip.length) + 1;
    return Array.from({ length: repeats }, () => strip).flat();
  }, [strip]);

  useEffect(() => {
    if (!spinning) return;
    started.current = performance.now();
    stopAt.current = started.current + delay;
    setSettled(null);

    const tick = (now: number) => {
      const elapsed = now - started.current;
      const remaining = stopAt.current - now;
      // vitesse : montée rapide, palier, puis freinage sur les 420 dernières ms
      const speed =
        remaining > 420
          ? Math.min(1, elapsed / 220) * 2.1
          : Math.max(0.12, (remaining / 420) ** 1.6 * 2.1);
      setOffset((value) => (value + speed * SYMBOL_HEIGHT * 0.06) % (loop.length * SYMBOL_HEIGHT));
      if (remaining > 0) raf.current = requestAnimationFrame(tick);
      else {
        setSettled(target);
        setOffset(0);
        onStop();
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, delay]);

  const visible = settled ?? target ?? strip.slice(0, rows);
  const blur = spinning && !settled;

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{
        height: rows * SYMBOL_HEIGHT,
        width: SYMBOL_HEIGHT,
        background: 'linear-gradient(180deg, #0b0e18, #10141f 40%, #0b0e18)',
        border: '1px solid #232a3d',
        boxShadow: 'inset 0 12px 20px -14px rgba(0,0,0,0.95), inset 0 -12px 20px -14px rgba(0,0,0,0.95)',
      }}
    >
      {blur ? (
        <div style={{ transform: `translateY(${-offset}px)`, filter: 'blur(1.6px)' }}>
          {loop.map((symbol, index) => (
            <div key={`${symbol}-${index}`} className="grid place-items-center" style={{ height: SYMBOL_HEIGHT }}>
              <SymbolArt id={symbol} symbols={symbols} size={SYMBOL_HEIGHT - 20} />
            </div>
          ))}
        </div>
      ) : (
        <div>
          {visible.map((symbol, index) => (
            <div key={`${symbol}-${index}`} className="grid place-items-center" style={{ height: SYMBOL_HEIGHT }}>
              <SymbolArt id={symbol} symbols={symbols} size={SYMBOL_HEIGHT - 20} />
            </div>
          ))}
        </div>
      )}
      {/* reflet vitré */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(105deg, rgba(255,255,255,0.07) 0%, transparent 42%, transparent 60%, rgba(255,255,255,0.04) 100%)' }}
      />
    </div>
  );
}

export function SlotGame({ view }: { view: SlotView }) {
  const { play, busy, error } = useInstantGame<SpinResult>(view.id);
  const [bet, setBet] = useState(1_000);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [payout, setPayout] = useState<number | null>(null);
  const [multiplier, setMultiplier] = useState(0);
  const [stopped, setStopped] = useState(0);
  const [highlight, setHighlight] = useState<Win | null>(null);
  const [auto, setAuto] = useState(0);

  const columns = useMemo(() => {
    if (!result) return null;
    return result.window;
  }, [result]);

  const spin = useCallback(async () => {
    if (busy || spinning) return;
    audio.slots.button();
    setHighlight(null);
    setPayout(null);
    setResult(null);
    setStopped(0);
    setSpinning(true);
    audio.slots.spin(SPIN_BASE + SPIN_STEP * (view.reels - 1) + 200);

    const data = await play(bet, undefined);
    if (!data) {
      setSpinning(false);
      return;
    }
    setResult(data.result);
    setMultiplier(data.multiplier);
    setPayout(data.payout);
  }, [bet, busy, play, spinning, view.reels]);

  // Fin d'un rouleau : son + révélation des lignes quand tout est arrêté
  const onReelStop = useCallback(
    (index: number) => {
      audio.slots.reelStop(index);
      setStopped((value) => {
        const next = value + 1;
        if (next >= view.reels) {
          setSpinning(false);
          setTimeout(() => {
            if (!result) return;
            if (result.freeSpins) audio.slots.anticipation();
            const best = [...result.wins].sort((a, b) => b.pay - a.pay)[0] ?? null;
            setHighlight(best);
            if (multiplier >= 20) audio.win('big');
            else if (multiplier >= 5) audio.win('medium');
            else if (multiplier > 0) audio.win('small');
          }, 120);
        }
        return next;
      });
    },
    [multiplier, result, view.reels],
  );

  // Tours automatiques
  useEffect(() => {
    if (auto <= 0 || spinning || busy) return;
    const timer = setTimeout(() => {
      setAuto((value) => value - 1);
      void spin();
    }, 700);
    return () => clearTimeout(timer);
  }, [auto, busy, spin, spinning]);

  const litCells = useMemo(() => {
    if (!highlight) return new Set<string>();
    const line = view.paylines[highlight.line];
    const cells = new Set<string>();
    for (let reel = 0; reel < highlight.count; reel++) cells.add(`${reel}-${line[reel]}`);
    return cells;
  }, [highlight, view.paylines]);

  return (
    <GameShell
      id={view.id}
      name={view.name}
      tagline={view.tagline}
      accent={view.accent}
      rtp={view.math.rtp}
      volatility={view.math.volatility}
      maxWin={view.math.maxWin}
      rules={
        <>
          <p>{view.paylines.length} lignes de gain, {view.reels} rouleaux. La mise est répartie sur toutes les lignes.</p>
          <p>Le <strong>Wild</strong> remplace tous les symboles sauf le <strong>Scatter</strong>.</p>
          <p>3 Scatters ou plus déclenchent les tours gratuits, avec un multiplicateur.</p>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {view.symbols.filter((symbol) => symbol.kind !== 'scatter').slice(0, 6).map((symbol) => (
              <div key={symbol.id} className="flex items-center gap-2">
                <SymbolArt id={symbol.id} symbols={view.symbols} size={22} />
                <span className="num text-[0.68rem]">{symbol.pays[3] ?? symbol.pays[2]}× (×5)</span>
              </div>
            ))}
          </div>
        </>
      }
      side={
        <BetControls
          bet={bet}
          setBet={setBet}
          disabled={busy || spinning}
          action={spinning ? 'Ça tourne…' : 'SPIN'}
          onAction={spin}
        >
          <div className="flex gap-2">
            <button
              className="btn flex-1 py-2 text-xs"
              onClick={() => setAuto(auto > 0 ? 0 : 10)}
              disabled={busy}
              style={auto > 0 ? { borderColor: 'var(--pink)', color: 'var(--pink)' } : undefined}
            >
              {auto > 0 ? `Auto (${auto})` : 'Auto ×10'}
            </button>
            <button className="btn flex-1 py-2 text-xs" onClick={() => setAuto(auto > 0 ? 0 : 50)} disabled={busy}>
              Auto ×50
            </button>
          </div>
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </BetControls>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-5">
        {/* Écran de la machine */}
        <div
          className="relative rounded-3xl p-4 md:p-5"
          style={{
            background: `radial-gradient(120% 90% at 50% -10%, ${view.accent}33, transparent 60%), linear-gradient(180deg, #11141f, #080a12)`,
            border: '1px solid #2a3category'.replace('2a3category', '#2a3145'),
            boxShadow: `0 30px 60px -30px ${view.accent}80, inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}
        >
          {/* enseigne */}
          <div className="mb-3 text-center">
            <div className="display text-sm tracking-[0.3em]" style={{ color: view.accent, textShadow: `0 0 18px ${view.accent}` }}>
              {view.name}
            </div>
          </div>

          <div className="flex gap-2">
            {Array.from({ length: view.reels }, (_, reel) => (
              <div key={reel} className="relative">
                <Reel
                  strip={view.strips[reel]}
                  rows={view.rows}
                  target={columns ? columns[reel] : null}
                  spinning={spinning}
                  delay={SPIN_BASE + reel * SPIN_STEP}
                  symbols={view.symbols}
                  onStop={() => onReelStop(reel)}
                />
                {/* surbrillance des cases gagnantes */}
                {litCells.size > 0 &&
                  Array.from({ length: view.rows }, (_, row) =>
                    litCells.has(`${reel}-${row}`) ? (
                      <span
                        key={row}
                        className="pointer-events-none absolute left-0 w-full rounded-lg"
                        style={{
                          top: row * SYMBOL_HEIGHT,
                          height: SYMBOL_HEIGHT,
                          border: `2px solid ${view.accent}`,
                          boxShadow: `0 0 22px ${view.accent}aa, inset 0 0 20px ${view.accent}55`,
                          animation: 'glow-pulse 1s ease-in-out infinite',
                        }}
                      />
                    ) : null,
                  )}
              </div>
            ))}
          </div>

          {/* bandeau de gain */}
          <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[rgb(6_7_12/0.7)] px-4 py-2.5">
            <div className="text-[0.6rem] uppercase tracking-[0.28em] text-[var(--muted)]">Gain</div>
            <div className="num text-lg font-bold" style={{ color: payout ? 'var(--gold-bright)' : 'var(--dim)' }}>
              {payout !== null ? <Counter value={payout} celebrate={multiplier} /> : '—'}
            </div>
            {multiplier > 0 && <div className="num text-sm" style={{ color: view.accent }}>{multiplier.toFixed(2)}×</div>}
          </div>

          {result?.freeSpins && (
            <div className="pop mt-3 rounded-xl border px-4 py-2 text-center text-sm" style={{ borderColor: view.accent, background: `${view.accent}1a` }}>
              🎁 {result.freeSpins.spins.length} tours gratuits joués · multiplicateur ×{result.freeSpins.multiplier} ·{' '}
              <strong>{result.freeSpins.total.toFixed(2)}×</strong> de gains bonus
            </div>
          )}
        </div>

        {highlight && (
          <div className="rise text-xs text-[var(--muted)]">
            Ligne {highlight.line + 1} · {highlight.count}× {view.symbols.find((symbol) => symbol.id === highlight.symbol)?.name} ·{' '}
            <strong className="text-[var(--gold-bright)]">{highlight.pay}</strong> par ligne
          </div>
        )}
      </div>
    </GameShell>
  );
}
