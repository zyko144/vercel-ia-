'use client';

import { useEffect, useState } from 'react';
import { Counter } from '@/components/ui/Balance';

type Jackpot = { id: string; name: string; amount: number };
type Win = { id: string; amount: number; createdAt: string; user: { displayName: string }; jackpot: { name: string } };

const STYLE: Record<string, { color: string; glow: string; icon: string }> = {
  mega: { color: '#f0d38a', glow: 'rgba(240,211,138,0.35)', icon: '👑' },
  major: { color: '#b06bff', glow: 'rgba(176,107,255,0.3)', icon: '💜' },
  mini: { color: '#35d0ff', glow: 'rgba(53,208,255,0.3)', icon: '💎' },
};

/** Bandeau des jackpots : les compteurs montent en direct (rafraîchis toutes les 10 s). */
export function Jackpots() {
  const [jackpots, setJackpots] = useState<Jackpot[]>([]);
  const [wins, setWins] = useState<Win[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await fetch('/api/jackpots', { cache: 'no-store' }).then((response) => response.json());
        if (!alive) return;
        setJackpots(data.jackpots ?? []);
        setWins(data.wins ?? []);
      } catch {
        // le bandeau reste sur sa dernière valeur
      }
    };
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!jackpots.length) return null;
  const [top, ...others] = [...jackpots].sort((a, b) => b.amount - a.amount);
  const topStyle = STYLE[top.id] ?? STYLE.mega;

  return (
    <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
      <div
        className="panel shine relative overflow-hidden p-6 md:p-8"
        style={{ background: `radial-gradient(90% 120% at 15% 0%, ${topStyle.glow}, transparent 60%), linear-gradient(180deg, var(--surface-2), var(--surface))` }}
      >
        <div className="text-[0.68rem] uppercase tracking-[0.35em]" style={{ color: topStyle.color }}>
          {top.name}
        </div>
        <div className="display mt-2 text-4xl md:text-6xl">
          <Counter value={top.amount} className="gold-text" suffix="" duration={1200} />
          <span className="ml-2 text-xl text-[var(--muted)] md:text-2xl">NV</span>
        </div>
        <p className="mt-3 max-w-md text-sm text-[var(--muted)]">
          Alimenté par 1 % de chaque mise du casino. Il peut tomber sur n’importe quelle partie — plus la mise est
          grosse, plus la chance augmente.
        </p>
        {wins[0] && (
          <p className="mt-4 text-xs text-[var(--dim)]">
            Dernier gagnant : <span className="text-[var(--text)]">{wins[0].user.displayName}</span> ·{' '}
            {wins[0].amount.toLocaleString('fr-FR')} NV ({wins[0].jackpot.name})
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {others.map((jackpot) => {
          const style = STYLE[jackpot.id] ?? STYLE.mini;
          return (
            <div key={jackpot.id} className="panel-2 flex items-center gap-4 p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl text-lg" style={{ background: `linear-gradient(160deg, ${style.color}33, transparent)`, border: `1px solid ${style.color}44` }}>
                {style.icon}
              </span>
              <div>
                <div className="text-[0.62rem] uppercase tracking-[0.3em]" style={{ color: style.color }}>
                  {jackpot.name}
                </div>
                <Counter value={jackpot.amount} className="text-lg font-semibold" duration={1000} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
