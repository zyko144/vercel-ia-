import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { levelFromXp, tierOf } from '@/lib/economy/config';
import { GameMark } from '@/components/brand/GameMark';

export const metadata = { title: 'Mon profil' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const [rounds, wallet, favourites, achievements] = await Promise.all([
    db.gameRound.count({ where: { userId: user.id } }),
    db.wallet.findUnique({ where: { userId: user.id } }),
    db.gameRound.groupBy({ by: ['gameId'], where: { userId: user.id }, _count: { gameId: true }, orderBy: { _count: { gameId: 'desc' } }, take: 5 }),
    db.userAchievement.findMany({ where: { userId: user.id }, include: { achievement: true } }),
  ]);

  const tier = tierOf(user.level);
  const { intoLevel, needed } = levelFromXp(user.xp);
  const best = await db.gameRound.findFirst({ where: { userId: user.id }, orderBy: { payout: 'desc' } });

  return (
    <div className="space-y-5">
      <section className="panel flex flex-wrap items-center gap-5 p-6">
        <span
          className="grid h-20 w-20 place-items-center rounded-2xl text-2xl font-bold"
          style={{ background: `linear-gradient(140deg, ${tier.color}, #12151f)`, border: '1px solid var(--border-bright)' }}
        >
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-[200px]">
          <h1 className="display text-2xl">{user.displayName}</h1>
          <div className="text-sm" style={{ color: tier.color }}>
            Niveau {user.level} · {tier.tier}
          </div>
          <div className="mt-2 h-2 w-48 overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div className="h-full rounded-full" style={{ width: `${Math.round((intoLevel / needed) * 100)}%`, background: 'linear-gradient(90deg,#ff2d9b,#ff7ac2)' }} />
          </div>
          <div className="num mt-1 text-[0.66rem] text-[var(--dim)]">{intoLevel} / {needed} XP</div>
        </div>
        <div className="ml-auto grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Stat label="Solde" value={`${Number(wallet?.balance ?? 0).toLocaleString('fr-FR')} NV`} accent="var(--gold-bright)" />
          <Stat label="Parties" value={rounds.toLocaleString('fr-FR')} />
          <Stat label="Total misé" value={`${Number(wallet?.totalBet ?? 0).toLocaleString('fr-FR')} NV`} />
          <Stat label="Total gagné" value={`${Number(wallet?.totalWon ?? 0).toLocaleString('fr-FR')} NV`} accent="var(--success)" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel-2 p-5">
          <h2 className="display mb-3 text-sm tracking-[0.2em]">Jeux favoris</h2>
          <div className="space-y-2">
            {favourites.map((entry) => (
              <div key={entry.gameId} className="flex items-center gap-3">
                <GameMark id={entry.gameId} size={30} animated={false} />
                <span className="flex-1 text-sm">{entry.gameId}</span>
                <span className="num text-xs text-[var(--muted)]">{entry._count.gameId} parties</span>
              </div>
            ))}
            {!favourites.length && <p className="text-sm text-[var(--muted)]">Joue une partie pour voir apparaître tes préférés.</p>}
          </div>
        </section>

        <section className="panel-2 p-5">
          <h2 className="display mb-3 text-sm tracking-[0.2em]">Meilleur coup</h2>
          {best && best.payout > 0n ? (
            <div className="flex items-center gap-4">
              <GameMark id={best.gameId} size={44} />
              <div>
                <div className="num text-2xl font-bold text-[var(--gold-bright)]">+{Number(best.payout).toLocaleString('fr-FR')} NV</div>
                <div className="text-xs text-[var(--muted)]">
                  {best.gameId} · {best.multiplier.toFixed(2)}× · mise {Number(best.bet).toLocaleString('fr-FR')} NV
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Pas encore de gain marquant.</p>
          )}

          <h2 className="display mb-2 mt-5 text-sm tracking-[0.2em]">Succès ({achievements.length})</h2>
          <div className="flex flex-wrap gap-2">
            {achievements.map((entry) => (
              <span key={entry.id} className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[0.68rem]">
                {entry.achievement.title}
              </span>
            ))}
            {!achievements.length && <p className="text-sm text-[var(--muted)]">Aucun succès débloqué pour l’instant.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div className="text-[0.62rem] uppercase tracking-widest text-[var(--muted)]">{label}</div>
      <div className="num font-semibold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}
