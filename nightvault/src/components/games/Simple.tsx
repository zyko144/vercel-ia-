'use client';

import { useEffect, useRef, useState } from 'react';
import { BetControls } from './BetControls';
import { GameShell } from './GameShell';
import { useInstantGame, useStatefulGame } from './useGame';
import { Counter } from '@/components/ui/Balance';
import { audio } from '@/lib/audio/engine';

type Meta = { id: string; name: string; tagline: string; accent: string; rtp: number; volatility: string; maxWin: number };

/* ============================ LIMBO ============================ */

export function LimboGame({ meta }: { meta: Meta }) {
  const { play, busy, error } = useInstantGame<{ rolled: number; target: number; win: boolean }>('limbo');
  const [bet, setBet] = useState(1_000);
  const [target, setTarget] = useState(2);
  const [shown, setShown] = useState(1);
  const [win, setWin] = useState<boolean | null>(null);
  const [history, setHistory] = useState<{ value: number; win: boolean }[]>([]);
  const raf = useRef(0);

  const launch = async () => {
    setWin(null);
    audio.crash.launch();
    const start = performance.now();
    const tick = (now: number) => {
      setShown(1 + Math.random() * Math.min(20, target * 3));
      if (now - start < 700) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    const data = await play(bet, { target });
    cancelAnimationFrame(raf.current);
    if (!data) return;
    // le compteur monte jusqu'au résultat
    const from = 1;
    const to = data.result.rolled;
    const began = performance.now();
    const climb = (now: number) => {
      const progress = Math.min(1, (now - began) / 900);
      setShown(from + (to - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) raf.current = requestAnimationFrame(climb);
      else {
        setShown(to);
        setWin(data.result.win);
        setHistory((values) => [{ value: to, win: data.result.win }, ...values].slice(0, 12));
        if (data.result.win) audio.crash.cashout(data.multiplier);
        else audio.crash.boom();
      }
    };
    raf.current = requestAnimationFrame(climb);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <GameShell
      {...meta}
      rules={
        <>
          <p>Annonce un multiplicateur cible. Le serveur tire un multiplicateur : s’il atteint ta cible, tu gagnes.</p>
          <p>Probabilité = 0,99 ÷ cible. RTP constant de 99 %, jusqu’à 10 000×.</p>
        </>
      }
      side={
        <BetControls bet={bet} setBet={setBet} disabled={busy} action="Lancer" onAction={launch}>
          <div>
            <div className="mb-1.5 flex justify-between text-[0.62rem] uppercase tracking-[0.28em] text-[var(--muted)]">
              <span>Cible</span>
              <span className="num">{(0.99 / target * 100).toFixed(2)} % de chance</span>
            </div>
            <input
              type="number"
              step="0.1"
              min={1.01}
              max={10_000}
              value={target}
              onChange={(event) => setTarget(Math.max(1.01, Number(event.target.value)))}
              className="num w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-lg font-semibold"
            />
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {[1.5, 2, 5, 50].map((value) => (
                <button key={value} className="btn py-1.5 text-[0.65rem]" onClick={() => setTarget(value)}>
                  {value}×
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </BetControls>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-8">
        <div
          className="num text-7xl font-bold md:text-8xl"
          style={{ color: win === null ? 'var(--text)' : win ? 'var(--success)' : 'var(--danger)', textShadow: win ? '0 0 40px rgba(46,224,138,0.5)' : undefined }}
        >
          {shown.toFixed(2)}×
        </div>
        <div className="text-sm text-[var(--muted)]">
          Cible : <strong className="text-[var(--text)]">{target.toFixed(2)}×</strong>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {history.map((entry, index) => (
            <span
              key={index}
              className="num rounded-lg px-2 py-1 text-xs"
              style={{ background: entry.win ? 'rgba(46,224,138,0.12)' : 'rgba(255,77,94,0.1)', color: entry.win ? 'var(--success)' : 'var(--danger)' }}
            >
              {entry.value.toFixed(2)}×
            </span>
          ))}
        </div>
      </div>
    </GameShell>
  );
}

/* ============================ WHEEL ============================ */

export function WheelGame({ meta }: { meta: Meta }) {
  const { play, busy, error } = useInstantGame<{ segment: number; segments: number[]; risk: string }>('wheel');
  const [bet, setBet] = useState(1_000);
  const [risk, setRisk] = useState<'faible' | 'moyen' | 'eleve'>('moyen');
  const [segments, setSegments] = useState<number[]>([]);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ multiplier: number; payout: number } | null>(null);
  const spinning = useRef(false);

  useEffect(() => {
    const TABLES = {
      faible: [1.5, 1.2, 1.2, 0, 1.5, 1.2, 1.2, 0, 1.5, 1.2, 1.2, 0, 1.5, 1.2, 1.1, 0],
      moyen: [2, 1.5, 0, 1.7, 0, 2, 0, 1.5, 0, 3, 0, 1.5, 0, 1.7, 0, 0.62],
      eleve: [9.9, 0, 0, 0, 0, 0, 0, 0, 4.9, 0, 0, 0, 0, 0, 0, 0.72],
    };
    setSegments(TABLES[risk]);
  }, [risk]);

  const spin = async () => {
    if (spinning.current) return;
    spinning.current = true;
    setResult(null);
    const data = await play(bet, { risk });
    if (!data) {
      spinning.current = false;
      return;
    }
    const count = data.result.segments.length;
    const turns = 5;
    const target = 360 * turns + (360 / count) * data.result.segment;
    setRotation((current) => current + target - (current % 360));
    const ticks = setInterval(() => audio.wheel.tick(), 90);
    setTimeout(() => {
      clearInterval(ticks);
      spinning.current = false;
      setResult({ multiplier: data.multiplier, payout: data.payout });
      audio.wheel.stop(data.multiplier);
    }, 4200);
  };

  return (
    <GameShell
      {...meta}
      rules={
        <>
          <p>La roue compte 16 segments, tous équiprobables. Le risque change la répartition des multiplicateurs.</p>
          <p>RTP de 97 % dans les trois modes : plus le risque est élevé, plus les gains sont rares et gros.</p>
        </>
      }
      side={
        <BetControls bet={bet} setBet={setBet} disabled={busy} action="Tourner" onAction={spin}>
          <div className="grid grid-cols-3 gap-1.5">
            {(['faible', 'moyen', 'eleve'] as const).map((value) => (
              <button
                key={value}
                className="btn py-1.5 text-[0.68rem]"
                onClick={() => setRisk(value)}
                style={risk === value ? { borderColor: meta.accent, color: meta.accent } : undefined}
              >
                {value === 'eleve' ? 'élevé' : value}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </BetControls>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <div className="relative aspect-square w-full max-w-[380px]">
          <div
            className="absolute left-1/2 top-0 z-10 -translate-x-1/2"
            style={{ width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '18px solid var(--gold-bright)' }}
          />
          <div
            className="h-full w-full rounded-full"
            style={{
              transform: `rotate(-${rotation}deg)`,
              transition: 'transform 4.2s cubic-bezier(0.12, 0.8, 0.12, 1)',
              background: `conic-gradient(${segments
                .map((value, index) => {
                  const from = (index / segments.length) * 100;
                  const to = ((index + 1) / segments.length) * 100;
                  const color = value === 0 ? '#1b2030' : value >= 5 ? '#f0d38a' : value >= 2 ? '#7b5cff' : '#2ee08a';
                  return `${color} ${from}% ${to}%`;
                })
                .join(', ')})`,
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6), 0 20px 50px -20px rgba(0,0,0,0.9)',
              border: '6px solid #1a1f2e',
            }}
          />
          <div className="absolute inset-[32%] grid place-items-center rounded-full" style={{ background: 'linear-gradient(180deg,#1c2133,#0b0e18)', border: '2px solid var(--border-bright)' }}>
            <div className="num text-2xl font-bold" style={{ color: result ? (result.multiplier > 1 ? 'var(--success)' : 'var(--danger)') : 'var(--muted)' }}>
              {result ? `${result.multiplier}×` : '—'}
            </div>
          </div>
        </div>
        {result && result.payout > 0 && (
          <div className="pop num text-xl font-bold text-[var(--gold-bright)]">
            +<Counter value={result.payout} celebrate={result.multiplier} />
          </div>
        )}
      </div>
    </GameShell>
  );
}

/* ============================ KENO ============================ */

export function KenoGame({ meta }: { meta: Meta }) {
  const { play, busy, error } = useInstantGame<{ picks: number[]; drawn: number[]; hits: number; table: number[] }>('keno');
  const [bet, setBet] = useState(1_000);
  const [picks, setPicks] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [result, setResult] = useState<{ hits: number; payout: number; multiplier: number } | null>(null);

  const toggle = (number: number) => {
    audio.ui.click();
    setPicks((current) =>
      current.includes(number) ? current.filter((value) => value !== number) : current.length >= 10 ? current : [...current, number],
    );
  };

  const draw = async () => {
    if (!picks.length) return;
    setDrawn([]);
    setRevealed([]);
    setResult(null);
    const data = await play(bet, { picks });
    if (!data) return;
    setDrawn(data.result.drawn);
    // révélation une boule après l'autre
    data.result.drawn.forEach((number, index) => {
      setTimeout(() => {
        setRevealed((current) => [...current, number]);
        if (picks.includes(number)) audio.ui.coin(index);
        else audio.ui.click();
        if (index === data.result.drawn.length - 1) {
          setTimeout(() => {
            setResult({ hits: data.result.hits, payout: data.payout, multiplier: data.multiplier });
            if (data.payout > 0) audio.win(data.multiplier >= 20 ? 'big' : 'small');
          }, 250);
        }
      }, index * 220);
    });
  };

  const table = picks.length ? [1, 1.7, 3.8, 10, 13, 105, 111, 400, 500, 960][Math.min(9, picks.length - 1)] : 0;

  return (
    <GameShell
      {...meta}
      rules={
        <>
          <p>Coche 1 à 10 numéros sur 40. Le serveur en tire 10.</p>
          <p>Plus tu coches de numéros, plus il en faut pour gagner — mais plus le gain maximum est élevé.</p>
          <p>RTP d’environ 96 %, calculé exactement par la loi hypergéométrique.</p>
        </>
      }
      side={
        <BetControls bet={bet} setBet={setBet} disabled={busy || !picks.length} action="Tirer" onAction={draw}>
          <div className="flex gap-2">
            <button className="btn flex-1 py-2 text-xs" onClick={() => setPicks([])}>
              Effacer
            </button>
            <button
              className="btn flex-1 py-2 text-xs"
              onClick={() => {
                const pool = Array.from({ length: 40 }, (_, index) => index).sort(() => Math.random() - 0.5);
                setPicks(pool.slice(0, Math.max(1, picks.length || 5)));
                audio.ui.click();
              }}
            >
              Au hasard
            </button>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--muted)]">Numéros</span>
              <span className="num">{picks.length}/10</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-[var(--muted)]">Gain max</span>
              <span className="num text-[var(--gold-bright)]">{table}×</span>
            </div>
          </div>
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </BetControls>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: 40 }, (_, number) => {
            const picked = picks.includes(number);
            const hit = revealed.includes(number);
            return (
              <button
                key={number}
                onClick={() => toggle(number)}
                disabled={busy || drawn.length > 0}
                className="num grid h-10 w-10 place-items-center rounded-lg text-xs font-semibold transition-all md:h-12 md:w-12"
                style={{
                  background: hit && picked
                    ? 'linear-gradient(180deg,#ffe9b0,#c8a24a)'
                    : hit
                      ? 'linear-gradient(180deg,#2b3145,#151928)'
                      : picked
                        ? 'linear-gradient(180deg,#ff62b4,#b3005f)'
                        : 'var(--surface-2)',
                  color: hit && picked ? '#22180a' : '#eef1f8',
                  border: `1px solid ${hit ? 'var(--gold)' : picked ? 'transparent' : 'var(--border)'}`,
                  transform: hit ? 'scale(1.06)' : undefined,
                }}
              >
                {number + 1}
              </button>
            );
          })}
        </div>

        {result && (
          <div className="pop rounded-xl px-5 py-3 text-center" style={{ background: result.payout > 0 ? 'rgba(46,224,138,0.12)' : 'rgba(255,77,94,0.08)', border: `1px solid ${result.payout > 0 ? 'var(--success)' : 'var(--danger)'}` }}>
            <div className="text-sm">
              {result.hits} touché{result.hits > 1 ? 's' : ''} sur {picks.length}
            </div>
            {result.payout > 0 && (
              <div className="num text-xl font-bold text-[var(--gold-bright)]">
                +<Counter value={result.payout} celebrate={result.multiplier} />
              </div>
            )}
          </div>
        )}
      </div>
    </GameShell>
  );
}

/* ============================ TOWER ============================ */

type TowerView = { mode: string; tiles: number; floors: number; picks: number[]; floor: number; dead: boolean; cashed: boolean; multiplier: number; next: number; traps: number[][] };

export function TowerGame({ meta }: { meta: Meta }) {
  const { open, act, resume, view, bet, busy, error, outcome } = useStatefulGame<TowerView>('tower');
  const [amount, setAmount] = useState(1_000);
  const [mode, setMode] = useState<'facile' | 'moyen' | 'difficile' | 'extreme'>('moyen');

  useEffect(() => {
    void resume();
  }, [resume]);

  const playing = Boolean(view && !view.dead && !view.cashed);
  const tiles = view?.tiles ?? (mode === 'moyen' ? 3 : mode === 'difficile' ? 2 : 4);
  const floors = view?.floors ?? 8;

  return (
    <GameShell
      {...meta}
      rules={
        <>
          <p>Huit étages, une porte piégée par étage (trois en mode extrême).</p>
          <p>Chaque étage franchi augmente le multiplicateur. Encaisse quand tu veux.</p>
          <p>RTP de 99 % : multiplicateur = 0,99 ÷ (probabilité de survie).</p>
        </>
      }
      side={
        <BetControls
          bet={amount}
          setBet={setAmount}
          disabled={busy || playing}
          action={playing ? 'Partie en cours' : 'Entrer dans la tour'}
          onAction={() => open(amount, { mode })}
        >
          <div className="grid grid-cols-2 gap-1.5">
            {(['facile', 'moyen', 'difficile', 'extreme'] as const).map((value) => (
              <button
                key={value}
                className="btn py-1.5 text-[0.66rem]"
                onClick={() => setMode(value)}
                disabled={playing}
                style={mode === value ? { borderColor: meta.accent, color: meta.accent } : undefined}
              >
                {value}
              </button>
            ))}
          </div>
          {playing && (
            <button className="btn btn-success w-full py-2.5" onClick={() => act({ type: 'cashout' })} disabled={!view?.floor}>
              Encaisser {Math.floor(bet * (view?.multiplier ?? 1)).toLocaleString('fr-FR')} NV
            </button>
          )}
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </BetControls>
      }
    >
      <div className="flex h-full flex-col-reverse items-center justify-center gap-2">
        {Array.from({ length: floors }, (_, floor) => {
          const current = view?.floor === floor && playing;
          const passed = (view?.floor ?? 0) > floor;
          return (
            <div key={floor} className="flex items-center gap-2">
              <span className="num w-10 text-right text-[0.6rem] text-[var(--dim)]">
                {(0.99 / ((tiles - (mode === 'extreme' ? 3 : 1)) / tiles) ** (floor + 1)).toFixed(2)}×
              </span>
              <div className="flex gap-1.5">
                {Array.from({ length: tiles }, (_, tile) => {
                  const trapped = view?.traps?.[floor]?.includes(tile);
                  const chosen = view?.picks?.[floor] === tile;
                  return (
                    <button
                      key={tile}
                      disabled={!current || busy}
                      onClick={() => act({ type: 'pick', tile })}
                      className="h-9 w-16 rounded-lg text-xs font-semibold transition-all md:h-10 md:w-20"
                      style={{
                        background: trapped
                          ? 'linear-gradient(180deg,#ff4d5e,#7a1420)'
                          : passed && chosen
                            ? 'linear-gradient(180deg,#2ee08a,#12784b)'
                            : current
                              ? 'linear-gradient(180deg,#242a3d,#141827)'
                              : 'var(--surface-2)',
                        border: current ? '1px solid var(--gold)' : '1px solid var(--border)',
                        opacity: current || passed || view?.dead ? 1 : 0.45,
                        boxShadow: current ? '0 0 18px -6px rgba(240,211,138,0.7)' : undefined,
                      }}
                    >
                      {trapped ? '💥' : passed && chosen ? '✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {outcome?.done && outcome.payout > 0 && (
          <div className="pop num text-xl font-bold text-[var(--success)]">
            +<Counter value={outcome.payout} celebrate={outcome.multiplier} />
          </div>
        )}
      </div>
    </GameShell>
  );
}
