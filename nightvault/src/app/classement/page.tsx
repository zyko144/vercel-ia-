import { db } from '@/lib/db';
import { tierOf } from '@/lib/economy/config';

export const metadata = { title: 'Classement' };
export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const wallets = await db.wallet.findMany({
    orderBy: { balance: 'desc' },
    take: 25,
    include: { user: { select: { displayName: true, level: true } } },
  });
  const biggest = await db.gameRound.findMany({
    where: { payout: { gt: 0 } },
    orderBy: { multiplier: 'desc' },
    take: 10,
    include: { user: { select: { displayName: true } } },
  });

  return (
    <div className="space-y-5">
      <section className="panel p-6">
        <h1 className="display text-2xl">Classement</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Les plus gros soldes et les plus gros coups du casino.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel-2 overflow-hidden">
          <h2 className="display border-b border-[var(--border)] px-5 py-3 text-sm tracking-[0.2em]">Fortunes</h2>
          <div className="divide-y divide-[var(--border)]">
            {wallets.map((wallet, index) => {
              const tier = tierOf(wallet.user.level);
              return (
                <div key={wallet.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="num w-6 text-sm font-bold" style={{ color: index < 3 ? 'var(--gold-bright)' : 'var(--dim)' }}>
                    {index + 1}
                  </span>
                  <span
                    className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold"
                    style={{ background: `linear-gradient(140deg, ${tier.color}, #1a1f2e)` }}
                  >
                    {wallet.user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{wallet.user.displayName}</div>
                    <div className="text-[0.64rem] text-[var(--muted)]">
                      Niveau {wallet.user.level} · {tier.tier}
                    </div>
                  </div>
                  <span className="num text-sm font-semibold text-[var(--gold-bright)]">
                    {Number(wallet.balance).toLocaleString('fr-FR')} NV
                  </span>
                </div>
              );
            })}
            {!wallets.length && <p className="p-5 text-sm text-[var(--muted)]">Personne n’a encore joué.</p>}
          </div>
        </section>

        <section className="panel-2 overflow-hidden">
          <h2 className="display border-b border-[var(--border)] px-5 py-3 text-sm tracking-[0.2em]">Plus gros multiplicateurs</h2>
          <div className="divide-y divide-[var(--border)]">
            {biggest.map((round) => (
              <div key={round.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="num w-16 font-bold text-[var(--success)]">{round.multiplier.toFixed(2)}×</span>
                <span className="min-w-0 flex-1 truncate">{round.user.displayName}</span>
                <span className="text-xs text-[var(--muted)]">{round.gameId}</span>
                <span className="num text-xs text-[var(--gold-bright)]">+{Number(round.payout).toLocaleString('fr-FR')}</span>
              </div>
            ))}
            {!biggest.length && <p className="p-5 text-sm text-[var(--muted)]">Aucun gain pour l’instant.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
