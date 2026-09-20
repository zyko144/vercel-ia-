'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GameMark } from '@/components/brand/GameMark';

type Round = {
  id: string;
  gameId: string;
  bet: number;
  payout: number;
  multiplier: number;
  createdAt: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
};

export function HistoryPanel() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [filter, setFilter] = useState<'all' | 'win' | 'loss'>('all');

  useEffect(() => {
    fetch('/api/history?take=100', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setRounds(data.rounds ?? []))
      .catch(() => {});
  }, []);

  const shown = rounds.filter((round) => (filter === 'win' ? round.payout > 0 : filter === 'loss' ? round.payout === 0 : true));
  const totalBet = rounds.reduce((sum, round) => sum + round.bet, 0);
  const totalWon = rounds.reduce((sum, round) => sum + round.payout, 0);

  return (
    <div className="space-y-4">
      <section className="panel flex flex-wrap items-center gap-4 p-5">
        <div>
          <h1 className="display text-xl">Historique</h1>
          <p className="text-xs text-[var(--muted)]">Tes {rounds.length} dernières manches, avec leurs données d’équité.</p>
        </div>
        <div className="ml-auto flex gap-4 text-xs">
          <div>
            <div className="text-[var(--muted)]">Misé</div>
            <div className="num font-semibold">{totalBet.toLocaleString('fr-FR')} NV</div>
          </div>
          <div>
            <div className="text-[var(--muted)]">Gagné</div>
            <div className="num font-semibold text-[var(--success)]">{totalWon.toLocaleString('fr-FR')} NV</div>
          </div>
          <div>
            <div className="text-[var(--muted)]">Bilan</div>
            <div className="num font-semibold" style={{ color: totalWon - totalBet >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {(totalWon - totalBet).toLocaleString('fr-FR')} NV
            </div>
          </div>
        </div>
      </section>

      <div className="flex gap-2">
        {([['all', 'Tout'], ['win', 'Gagnées'], ['loss', 'Perdues']] as const).map(([value, label]) => (
          <button
            key={value}
            className="btn px-4 py-2 text-xs"
            onClick={() => setFilter(value)}
            style={filter === value ? { borderColor: 'var(--pink)', color: 'var(--pink)' } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="panel divide-y divide-[var(--border)] overflow-hidden">
        {shown.map((round) => (
          <div key={round.id} className="flex items-center gap-3 p-3 text-sm">
            <GameMark id={round.gameId} size={32} animated={false} />
            <Link href={`/jeu/${round.gameId}`} className="w-32 truncate text-xs hover:text-[var(--pink)]">
              {round.gameId}
            </Link>
            <span className="num w-24 text-right text-xs text-[var(--muted)]">{round.bet.toLocaleString('fr-FR')} NV</span>
            <span
              className="num w-16 rounded-md px-2 py-0.5 text-center text-xs font-semibold"
              style={{ color: round.payout > 0 ? 'var(--success)' : 'var(--danger)', background: round.payout > 0 ? 'rgba(46,224,138,0.1)' : 'rgba(255,77,94,0.08)' }}
            >
              {round.multiplier.toFixed(2)}×
            </span>
            <span className="num w-28 text-right text-xs" style={{ color: round.payout > 0 ? 'var(--success)' : 'var(--dim)' }}>
              {round.payout > 0 ? `+${round.payout.toLocaleString('fr-FR')}` : '—'}
            </span>
            <span className="ml-auto hidden truncate font-mono text-[0.62rem] text-[var(--dim)] md:block">
              #{round.nonce} · {round.serverSeedHash.slice(0, 12)}…
            </span>
          </div>
        ))}
        {!shown.length && <p className="p-6 text-sm text-[var(--muted)]">Aucune manche pour l’instant.</p>}
      </div>
    </div>
  );
}
