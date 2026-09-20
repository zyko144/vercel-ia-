'use client';

import { useEffect, useRef, useState } from 'react';
import { BetControls } from './BetControls';
import { GameShell } from './GameShell';
import { useInstantGame } from './useGame';
import { audio } from '@/lib/audio/engine';

type Meta = { id: string; name: string; tagline: string; accent: string; rtp: number; volatility: string; maxWin: number };
type Result = { roll: number; target: number; direction: 'over' | 'under'; win: boolean; chance: number };

/** DICE : curseur de cible, aiguille animée, historique des tirages. */
export function DiceGame({ meta }: { meta: Meta }) {
  const { play, busy, error } = useInstantGame<Result>('dice');
  const [bet, setBet] = useState(1_000);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<'over' | 'under'>('over');
  const [roll, setRoll] = useState<number | null>(null);
  const [win, setWin] = useState<boolean | null>(null);
  const [history, setHistory] = useState<{ roll: number; win: boolean }[]>([]);
  const animation = useRef(0);

  const chance = direction === 'under' ? target : 100 - target;
  const multiplier = Math.floor((0.99 / (chance / 100)) * 100) / 100;

  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  const roulette = async () => {
    audio.dice.roll();
    setWin(null);
    // l'aiguille s'agite pendant l'aller-retour serveur
    const start = performance.now();
    const spin = (now: number) => {
      setRoll(Math.random() * 100);
      if (now - start < 550) animation.current = requestAnimationFrame(spin);
    };
    animation.current = requestAnimationFrame(spin);

    const data = await play(bet, { target, direction });
    cancelAnimationFrame(animation.current);
    if (!data) {
      setRoll(null);
      return;
    }
    setRoll(data.result.roll);
    setWin(data.result.win);
    setHistory((values) => [{ roll: data.result.roll, win: data.result.win }, ...values].slice(0, 14));
    audio.dice.settle(data.result.win);
  };

  return (
    <GameShell
      {...meta}
      rules={
        <>
          <p>Choisis un nombre cible et le sens : le tirage va de 0,00 à 99,99.</p>
          <p>Le multiplicateur vaut toujours 0,99 ÷ probabilité : plus c’est risqué, plus ça paie.</p>
          <p>RTP constant de 99 % quelle que soit la cible.</p>
        </>
      }
      side={
        <BetControls bet={bet} setBet={setBet} disabled={busy} action="Lancer les dés" onAction={roulette}>
          <div className="grid grid-cols-2 gap-2">
            {(['under', 'over'] as const).map((value) => (
              <button
                key={value}
                className="btn py-2 text-xs"
                onClick={() => {
                  setDirection(value);
                  audio.ui.toggle();
                }}
                style={direction === value ? { borderColor: meta.accent, color: meta.accent } : undefined}
              >
                {value === 'under' ? `Moins de ${target}` : `Plus de ${target}`}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[0.62rem] text-[var(--muted)]">
              <span>Cible</span>
              <span className="num">{target}</span>
            </div>
            <input
              type="range"
              min={2}
              max={98}
              value={target}
              onChange={(event) => setTarget(Number(event.target.value))}
              className="w-full accent-[var(--cyan)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="panel-2 p-2">
              <div className="text-[0.6rem] text-[var(--muted)]">Chance</div>
              <div className="num font-semibold">{chance.toFixed(2)} %</div>
            </div>
            <div className="panel-2 p-2">
              <div className="text-[0.6rem] text-[var(--muted)]">Gain</div>
              <div className="num font-semibold text-[var(--gold-bright)]">{multiplier.toFixed(2)}×</div>
            </div>
          </div>
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </BetControls>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-8">
        <div className="num text-6xl font-bold tabular-nums md:text-7xl" style={{ color: win === null ? 'var(--text)' : win ? 'var(--success)' : 'var(--danger)' }}>
          {roll === null ? '00.00' : roll.toFixed(2)}
        </div>

        {/* piste */}
        <div className="relative w-full max-w-2xl">
          <div className="relative h-4 overflow-hidden rounded-full" style={{ background: 'linear-gradient(90deg,#1b2030,#141827)' }}>
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all"
              style={{
                width: `${direction === 'under' ? target : 100 - target}%`,
                left: direction === 'under' ? 0 : `${target}%`,
                background: `linear-gradient(90deg, ${meta.accent}, ${meta.accent}66)`,
                boxShadow: `0 0 20px ${meta.accent}88`,
              }}
            />
          </div>
          {/* aiguille */}
          {roll !== null && (
            <div
              className="absolute -top-2 h-8 w-1 rounded-full transition-all duration-150"
              style={{ left: `calc(${roll}% - 2px)`, background: win ? 'var(--success)' : 'var(--danger)', boxShadow: `0 0 14px ${win ? 'var(--success)' : 'var(--danger)'}` }}
            />
          )}
          <div className="mt-3 flex justify-between text-[0.62rem] text-[var(--muted)]">
            {[0, 25, 50, 75, 100].map((value) => (
              <span key={value} className="num">
                {value}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {history.map((entry, index) => (
            <span
              key={index}
              className="num rounded-lg px-2.5 py-1 text-xs"
              style={{
                background: entry.win ? 'rgba(46,224,138,0.12)' : 'rgba(255,77,94,0.1)',
                color: entry.win ? 'var(--success)' : 'var(--danger)',
                border: `1px solid ${entry.win ? 'rgba(46,224,138,0.3)' : 'rgba(255,77,94,0.25)'}`,
              }}
            >
              {entry.roll.toFixed(2)}
            </span>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
