'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GameMark } from '@/components/brand/GameMark';
import { useSession } from '@/components/session/SessionProvider';
import { Counter } from '@/components/ui/Balance';

type Round = { id: string; multiplier: number; bet: number; payout: number; createdAt: string };

/** Cadre commun d'une page de jeu : marque, chiffres clés, zone de jeu, panneau latéral, historique. */
export function GameShell({
  id,
  name,
  tagline,
  accent,
  rtp,
  volatility,
  maxWin,
  rules,
  side,
  children,
}: {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  rtp: number;
  volatility: string;
  maxWin: number;
  rules: React.ReactNode;
  side: React.ReactNode;
  children: React.ReactNode;
}) {
  const { me } = useSession();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [tab, setTab] = useState<'history' | 'rules'>('history');

  useEffect(() => {
    if (!me) return;
    const load = () =>
      fetch(`/api/history?game=${id}&take=12`, { cache: 'no-store' })
        .then((response) => response.json())
        .then((data) => setRounds(data.rounds ?? []))
        .catch(() => {});
    void load();
    const timer = setInterval(load, 6000);
    return () => clearInterval(timer);
  }, [id, me]);

  return (
    <div className="space-y-4">
      {/* En-tête du jeu */}
      <div className="panel flex flex-wrap items-center gap-4 p-4" style={{ background: `radial-gradient(90% 140% at 0% 0%, ${accent}1f, transparent 60%), linear-gradient(180deg, var(--surface-2), var(--surface))` }}>
        <GameMark id={id} size={56} />
        <div className="min-w-[180px]">
          <div className="text-[0.6rem] uppercase tracking-[0.3em] text-[var(--muted)]">
            <Link href="/jeux" className="hover:text-[var(--text)]">
              Jeux
            </Link>{' '}
            /
          </div>
          <h1 className="display text-xl tracking-[0.12em] md:text-2xl">{name}</h1>
          <p className="text-xs text-[var(--muted)]">{tagline}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          <span className="panel-2 px-3 py-2">RTP <strong className="text-[var(--text)]">{(rtp * 100).toFixed(2)} %</strong></span>
          <span className="panel-2 px-3 py-2">Volatilité <strong className="text-[var(--text)]">{volatility}</strong></span>
          <span className="panel-2 px-3 py-2">Max <strong className="text-[var(--text)]">{maxWin.toLocaleString('fr-FR')}×</strong></span>
          {me && (
            <span className="panel-2 px-3 py-2">
              Solde <Counter value={me.balance} className="font-semibold text-[var(--gold-bright)]" />
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        {/* Zone de jeu */}
        <div className="panel relative min-h-[420px] overflow-hidden p-4 md:p-6">{children}</div>

        {/* Panneau latéral */}
        <div className="space-y-4">
          {side}

          <div className="panel-2 overflow-hidden">
            <div className="flex border-b border-[var(--border)]">
              {(['history', 'rules'] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setTab(value)}
                  className="flex-1 px-4 py-2.5 text-xs font-semibold transition-colors"
                  style={{
                    color: tab === value ? 'var(--text)' : 'var(--muted)',
                    background: tab === value ? 'var(--surface-3)' : 'transparent',
                  }}
                >
                  {value === 'history' ? 'Historique' : 'Règles'}
                </button>
              ))}
            </div>

            {tab === 'history' ? (
              <div className="max-h-[320px] overflow-y-auto p-2">
                {rounds.length === 0 && <p className="p-3 text-xs text-[var(--muted)]">Aucune partie pour l’instant.</p>}
                {rounds.map((round) => (
                  <div key={round.id} className="flex items-center justify-between rounded-lg px-3 py-2 text-xs hover:bg-[var(--surface-3)]">
                    <span className="num text-[var(--muted)]">{round.bet.toLocaleString('fr-FR')} NV</span>
                    <span
                      className="num rounded-md px-2 py-0.5 font-semibold"
                      style={{
                        color: round.payout > 0 ? 'var(--success)' : 'var(--danger)',
                        background: round.payout > 0 ? 'rgba(46,224,138,0.1)' : 'rgba(255,77,94,0.08)',
                      }}
                    >
                      {round.multiplier > 0 ? `${round.multiplier.toFixed(2)}×` : '0×'}
                    </span>
                    <span className="num" style={{ color: round.payout > 0 ? 'var(--success)' : 'var(--dim)' }}>
                      {round.payout > 0 ? `+${round.payout.toLocaleString('fr-FR')}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2 p-4 text-xs leading-relaxed text-[var(--muted)]">{rules}</div>
            )}
          </div>

          <Link href="/fairness" className="block rounded-xl border border-[var(--border)] px-4 py-3 text-center text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]">
            🔒 Équité vérifiable — contrôle tes manches
          </Link>
        </div>
      </div>
    </div>
  );
}
