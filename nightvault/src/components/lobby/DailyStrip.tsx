'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/components/session/SessionProvider';
import { audio } from '@/lib/audio/engine';

type Daily = { day: number; claimedToday: boolean; amounts: number[] };

/** Récompense quotidienne : 7 paliers, série qui repart à zéro si on saute un jour. */
export function DailyStrip() {
  const { setBalance } = useSession();
  const [daily, setDaily] = useState<Daily | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetch('/api/daily', { cache: 'no-store' }).then((response) => response.json());
      setDaily(data);
    } catch {
      // silencieux : le bandeau disparaît simplement
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async () => {
    setBusy(true);
    audio.ui.click();
    try {
      const response = await fetch('/api/daily', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        setBalance(data.balance);
        setFlash(`+${data.amount.toLocaleString('fr-FR')} NV`);
        audio.win('medium');
        setTimeout(() => setFlash(null), 2600);
        await load();
      } else {
        audio.ui.error();
      }
    } finally {
      setBusy(false);
    }
  };

  if (!daily) return null;

  return (
    <section className="panel flex flex-col gap-4 p-5 md:flex-row md:items-center">
      <div className="min-w-[190px]">
        <div className="text-[0.62rem] uppercase tracking-[0.34em] text-[var(--muted)]">Récompense du jour</div>
        <div className="display mt-1 text-lg">Jour {daily.day} / 7</div>
      </div>

      <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
        {daily.amounts.map((amount, index) => {
          const day = index + 1;
          const done = day < daily.day || (day === daily.day && daily.claimedToday);
          const current = day === daily.day && !daily.claimedToday;
          return (
            <div
              key={day}
              className="flex min-w-[78px] flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-all"
              style={{
                borderColor: current ? 'var(--gold)' : 'var(--border)',
                background: done
                  ? 'linear-gradient(180deg, rgba(46,224,138,0.12), transparent)'
                  : current
                    ? 'linear-gradient(180deg, rgba(240,211,138,0.16), transparent)'
                    : 'var(--surface-2)',
                boxShadow: current ? '0 0 24px -8px rgba(240,211,138,0.6)' : undefined,
              }}
            >
              <span className="text-[0.6rem] uppercase tracking-widest text-[var(--muted)]">J{day}</span>
              <span className="num text-xs font-semibold" style={{ color: done ? 'var(--success)' : current ? 'var(--gold-bright)' : 'var(--text)' }}>
                {amount.toLocaleString('fr-FR')}
              </span>
              {done && <span className="text-[0.6rem] text-[var(--success)]">✓</span>}
            </div>
          );
        })}
      </div>

      <button className="btn btn-gold shrink-0 px-5 py-3" onClick={claim} disabled={busy || daily.claimedToday}>
        {daily.claimedToday ? 'Reviens demain' : flash ?? 'Récupérer'}
      </button>
    </section>
  );
}
