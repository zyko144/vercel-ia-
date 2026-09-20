'use client';

import { useSession } from '@/components/session/SessionProvider';
import { audio } from '@/lib/audio/engine';

/** Bloc de mise commun à tous les jeux : saisie, ½, ×2, max, et bouton d'action. */
export function BetControls({
  bet,
  setBet,
  min = 10,
  max = 100_000,
  disabled,
  action,
  onAction,
  variant = 'primary',
  children,
}: {
  bet: number;
  setBet: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  action: string;
  onAction: () => void;
  variant?: 'primary' | 'gold' | 'success';
  children?: React.ReactNode;
}) {
  const { me } = useSession();
  const ceiling = Math.min(max, Math.max(min, me?.balance ?? max));

  const change = (value: number) => {
    setBet(Math.max(min, Math.min(ceiling, Math.round(value))));
    audio.ui.click();
  };

  return (
    <div className="panel-2 space-y-3 p-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[0.62rem] uppercase tracking-[0.28em] text-[var(--muted)]">Mise</span>
          <span className="text-[0.62rem] text-[var(--dim)]">max {ceiling.toLocaleString('fr-FR')} NV</span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={bet}
            min={min}
            max={ceiling}
            onChange={(event) => setBet(Number(event.target.value))}
            onBlur={() => change(bet)}
            className="num w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-lg font-semibold outline-none focus:border-[var(--pink)]"
          />
          <button className="btn px-3 text-xs" onClick={() => change(bet / 2)} aria-label="Diviser la mise par deux">
            ½
          </button>
          <button className="btn px-3 text-xs" onClick={() => change(bet * 2)} aria-label="Doubler la mise">
            ×2
          </button>
          <button className="btn px-3 text-xs" onClick={() => change(ceiling)} aria-label="Mise maximum">
            max
          </button>
        </div>
        <div className="mt-2 flex gap-1.5">
          {[100, 500, 1_000, 5_000, 25_000].map((amount) => (
            <button
              key={amount}
              className="btn flex-1 px-2 py-1.5 text-[0.65rem]"
              onClick={() => change(amount)}
              disabled={amount > ceiling}
            >
              {amount >= 1000 ? `${amount / 1000}k` : amount}
            </button>
          ))}
        </div>
      </div>

      {children}

      <button
        className={`btn btn-${variant} w-full py-3.5 text-base`}
        onClick={() => {
          audio.ui.click();
          onAction();
        }}
        disabled={disabled}
      >
        {action}
      </button>
    </div>
  );
}
