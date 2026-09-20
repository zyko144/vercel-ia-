import { gameStats } from '@/lib/economy/analytics';
import { GameMark } from '@/components/brand/GameMark';

export const dynamic = 'force-dynamic';

export default async function AdminGames() {
  const stats = await gameStats();

  return (
    <section className="panel overflow-hidden">
      <h2 className="display border-b border-[var(--border)] px-5 py-3 text-sm tracking-[0.2em]">
        RTP réel par jeu (mesuré sur les manches jouées)
      </h2>
      <div className="divide-y divide-[var(--border)]">
        {stats.map((game) => {
          const delta = (game.realRtp - game.targetRtp) * 100;
          const enough = game.rounds >= 500;
          return (
            <div key={game.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <GameMark id={game.id} size={30} animated={false} />
              <span className="w-40 truncate">{game.name}</span>
              <span className="num w-20 text-right text-xs text-[var(--muted)]">{game.rounds.toLocaleString('fr-FR')} manches</span>
              <span className="num w-28 text-right text-xs">{Math.round(game.bet).toLocaleString('fr-FR')} misés</span>
              <span className="num w-28 text-right text-xs">{Math.round(game.payout).toLocaleString('fr-FR')} rendus</span>
              <span className="num w-20 text-right font-semibold">{(game.realRtp * 100).toFixed(2)} %</span>
              <span className="num w-20 text-right text-xs text-[var(--muted)]">cible {(game.targetRtp * 100).toFixed(1)} %</span>
              <span
                className="num w-20 rounded-md px-2 py-0.5 text-center text-xs"
                style={{
                  background: !enough ? 'var(--surface-3)' : Math.abs(delta) < 3 ? 'rgba(46,224,138,0.12)' : 'rgba(255,159,67,0.12)',
                  color: !enough ? 'var(--dim)' : Math.abs(delta) < 3 ? 'var(--success)' : '#ff9f43',
                }}
              >
                {enough ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pt` : 'peu de data'}
              </span>
            </div>
          );
        })}
        {!stats.length && <p className="p-5 text-sm text-[var(--muted)]">Aucune manche jouée pour l’instant.</p>}
      </div>
      <p className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted)]">
        L’écart n’a de sens qu’avec beaucoup de manches : sur 500 parties, un écart de ±3 points est normal.
        Les RTP théoriques sont vérifiés par <code>npm run simulate</code> sur des centaines de milliers de manches.
      </p>
    </section>
  );
}
