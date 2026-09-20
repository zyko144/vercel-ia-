'use client';

import { useEffect, useState } from 'react';
import { BetControls } from './BetControls';
import { GameShell } from './GameShell';
import { useStatefulGame } from './useGame';
import { audio } from '@/lib/audio/engine';
import { Counter } from '@/components/ui/Balance';

type View = {
  count: number;
  revealed: number[];
  multiplier: number;
  dead: boolean;
  cashed: boolean;
  mines?: number[];
  next: number;
};

const SIZE = 25;

/** Gemme facettée (une vraie forme, pas un emoji). */
function Gem({ bright = false }: { bright?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className="h-[62%] w-[62%]" aria-hidden>
      <defs>
        <linearGradient id="gem-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#8fe6ff" />
        </linearGradient>
        <linearGradient id="gem-body" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#6fd9ff" />
          <stop offset="60%" stopColor="#1d8fc4" />
          <stop offset="100%" stopColor="#0b4a6b" />
        </linearGradient>
      </defs>
      <path d="M20 4 33 15 20 36 7 15z" fill="url(#gem-body)" />
      <path d="M20 4 33 15H7z" fill="url(#gem-top)" opacity="0.95" />
      <path d="M20 4 14 15h12z" fill="#ffffff" opacity="0.6" />
      <path d="M7 15h26L20 36z" fill="none" stroke="#063349" strokeWidth="0.7" opacity="0.6" />
      {bright && <circle cx="20" cy="18" r="17" fill="#8fe6ff" opacity="0.25" />}
    </svg>
  );
}

/** Mine : corps métallique, mèche, éclats. */
function Mine() {
  return (
    <svg viewBox="0 0 40 40" className="h-[62%] w-[62%]" aria-hidden>
      <defs>
        <radialGradient id="mine-body" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#6b7385" />
          <stop offset="55%" stopColor="#2a3040" />
          <stop offset="100%" stopColor="#0a0c14" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="22" r="12" fill="url(#mine-body)" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <rect
            key={angle}
            x="19"
            y="6.5"
            width="2"
            height="6"
            rx="1"
            fill="#3a4257"
            transform={`rotate(${angle} 20 22) translate(0 ${Math.cos(rad) * 0})`}
          />
        );
      })}
      <circle cx="16" cy="18" r="3" fill="#ffffff" opacity="0.18" />
      <path d="M20 10c2-2 4-1 4-3" stroke="#c8a24a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="24.4" cy="6.6" r="1.6" fill="#ff8a3d" />
    </svg>
  );
}

export function MinesGame({ meta }: { meta: { id: string; name: string; tagline: string; accent: string; rtp: number; volatility: string; maxWin: number } }) {
  const { open, act, resume, view, bet, busy, error, outcome, setOutcome } = useStatefulGame<View>('mines');
  const [amount, setAmount] = useState(1_000);
  const [mines, setMines] = useState(3);
  const [shake, setShake] = useState(false);
  const [popped, setPopped] = useState<number | null>(null);

  useEffect(() => {
    void resume();
  }, [resume]);

  const playing = Boolean(view && !view.dead && !view.cashed);

  const start = async () => {
    audio.slots.button();
    await open(amount, { mines });
  };

  const reveal = async (tile: number) => {
    if (!playing || busy || view?.revealed.includes(tile)) return;
    audio.mines.reveal();
    setPopped(tile);
    const data = await act({ type: 'reveal', tile });
    const next = data?.view as View | undefined;
    if (!next) return;
    if (next.dead) {
      audio.mines.explode();
      setShake(true);
      setTimeout(() => setShake(false), 400);
    } else {
      audio.mines.gem(next.revealed.length);
    }
  };

  const cashout = async () => {
    if (!playing || !view?.revealed.length) return;
    const data = await act({ type: 'cashout' });
    if (data?.payout > 0) audio.mines.cashout();
  };

  const tiles = Array.from({ length: SIZE }, (_, index) => index);
  const revealed = new Set(view?.revealed ?? []);
  const bombs = new Set(view?.mines ?? []);
  const finished = Boolean(view?.dead || view?.cashed);

  return (
    <GameShell
      {...meta}
      rules={
        <>
          <p>Choisis le nombre de mines (1 à 24) puis révèle les cases une par une.</p>
          <p>Chaque case sûre augmente ton multiplicateur. Tu peux encaisser à tout moment.</p>
          <p>Une mine et la manche est perdue. Les mines sont tirées au départ et vérifiables ensuite.</p>
          <p className="text-[var(--dim)]">Multiplicateur = 0,99 / probabilité de survie.</p>
        </>
      }
      side={
        <BetControls
          bet={amount}
          setBet={setAmount}
          disabled={busy || playing}
          action={playing ? 'Partie en cours' : 'Lancer la partie'}
          onAction={start}
        >
          <div>
            <div className="mb-1.5 text-[0.62rem] uppercase tracking-[0.28em] text-[var(--muted)]">Mines</div>
            <div className="grid grid-cols-6 gap-1.5">
              {[1, 3, 5, 8, 12, 24].map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    setMines(value);
                    audio.ui.click();
                  }}
                  disabled={playing}
                  className="btn px-1 py-1.5 text-xs"
                  style={mines === value ? { borderColor: 'var(--cyan)', color: 'var(--cyan)' } : undefined}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {playing && (
            <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-[var(--muted)]">Multiplicateur</span>
                <span className="num text-lg font-bold text-[var(--cyan)]">{(view?.multiplier ?? 1).toFixed(2)}×</span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-[var(--muted)]">Case suivante</span>
                <span className="num text-[var(--text)]">{(view?.next ?? 1).toFixed(2)}×</span>
              </div>
              <button className="btn btn-success w-full py-2.5" onClick={cashout} disabled={busy || !view?.revealed.length}>
                Encaisser {Math.floor(bet * (view?.multiplier ?? 1)).toLocaleString('fr-FR')} NV
              </button>
            </div>
          )}

          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </BetControls>
      }
    >
      <div className="flex h-full flex-col items-center justify-center gap-5">
        {/* Bandeau résultat */}
        {outcome?.done && (
          <div
            className="pop absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-2xl px-6 py-3 text-center"
            style={{
              background: outcome.payout > 0 ? 'linear-gradient(180deg, rgba(46,224,138,0.22), rgba(6,7,12,0.9))' : 'linear-gradient(180deg, rgba(255,77,94,0.22), rgba(6,7,12,0.9))',
              border: `1px solid ${outcome.payout > 0 ? 'var(--success)' : 'var(--danger)'}`,
            }}
            onClick={() => setOutcome(null)}
          >
            <div className="display text-sm">{outcome.payout > 0 ? 'Encaissé' : 'Mine !'}</div>
            {outcome.payout > 0 && (
              <div className="num text-xl font-bold text-[var(--success)]">
                +<Counter value={outcome.payout} suffix=" NV" celebrate={outcome.multiplier} />
              </div>
            )}
          </div>
        )}

        <div
          className={`grid grid-cols-5 gap-2 md:gap-2.5 ${shake ? 'shake' : ''}`}
          style={{ perspective: '900px' }}
        >
          {tiles.map((tile) => {
            const isRevealed = revealed.has(tile);
            const isBomb = bombs.has(tile);
            const showBomb = finished && isBomb;
            const flipped = isRevealed || showBomb;
            return (
              <button
                key={tile}
                onClick={() => reveal(tile)}
                disabled={!playing || busy || isRevealed}
                aria-label={`Case ${tile + 1}`}
                className="relative h-[58px] w-[58px] rounded-xl transition-transform duration-150 md:h-[72px] md:w-[72px]"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: `rotateY(${flipped ? 180 : 0}deg) ${popped === tile && !flipped ? 'scale(0.94)' : ''}`,
                  transition: 'transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1)',
                }}
              >
                {/* face cachée : plaque d'acier */}
                <span
                  className="absolute inset-0 grid place-items-center rounded-xl"
                  style={{
                    backfaceVisibility: 'hidden',
                    background: 'linear-gradient(160deg, #222839 0%, #141827 45%, #0b0e18 100%)',
                    border: '1px solid #2b3348',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 18px -12px rgba(0,0,0,0.9)',
                  }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: 'radial-gradient(circle at 35% 30%, #3f4a66, #161b29)' }}
                  />
                </span>

                {/* face révélée */}
                <span
                  className="absolute inset-0 grid place-items-center rounded-xl"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    background: isBomb
                      ? 'radial-gradient(70% 70% at 50% 40%, rgba(255,77,94,0.35), rgba(10,7,10,0.95))'
                      : 'radial-gradient(70% 70% at 50% 35%, rgba(53,208,255,0.28), rgba(6,10,18,0.95))',
                    border: `1px solid ${isBomb ? 'rgba(255,77,94,0.5)' : 'rgba(53,208,255,0.35)'}`,
                    boxShadow: isBomb ? '0 0 28px -8px rgba(255,77,94,0.8)' : '0 0 22px -10px rgba(53,208,255,0.9)',
                  }}
                >
                  {isBomb ? <Mine /> : <Gem bright={isRevealed} />}
                </span>
              </button>
            );
          })}
        </div>

        {!view && (
          <p className="text-center text-sm text-[var(--muted)]">
            Choisis ta mise et ton nombre de mines, puis lance la partie.
          </p>
        )}
      </div>
    </GameShell>
  );
}
