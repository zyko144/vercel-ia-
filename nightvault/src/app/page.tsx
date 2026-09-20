import Link from 'next/link';
import { GameCard } from '@/components/lobby/GameCard';
import { Jackpots } from '@/components/lobby/Jackpots';
import { Row } from '@/components/lobby/Row';
import { Hero } from '@/components/lobby/Hero';
import { DailyStrip } from '@/components/lobby/DailyStrip';
import { catalog } from '@/lib/games/catalog';
import { currentUser } from '@/lib/auth';

export default async function LobbyPage() {
  const user = await currentUser();
  const games = catalog();
  const playable = games.filter((game) => game.playable);
  const byCategory = (category: string) => games.filter((game) => game.category === category);

  return (
    <div className="space-y-8">
      <Hero connected={Boolean(user)} featured={playable.slice(0, 5)} />

      <Jackpots />

      {user && <DailyStrip />}

      <Row title="Populaires" subtitle="Ce qui tourne le plus en ce moment" href="/jeux">
        {playable.map((game) => (
          <GameCard key={game.id} game={game} size="md" />
        ))}
      </Row>

      <Row title="Machines à sous" subtitle="Rouleaux, wilds, tours gratuits" href="/jeux?c=slots">
        {byCategory('slots').map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </Row>

      <Row title="Arcade & Risk" subtitle="Tu choisis quand encaisser" href="/jeux?c=arcade">
        {byCategory('arcade').map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </Row>

      <Row title="Jeux de table" subtitle="Les classiques du casino" href="/jeux?c=table">
        {byCategory('table').map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </Row>

      <Row title="Dés & jeux rapides" subtitle="Une manche en dix secondes" href="/jeux?c=quick">
        {[...byCategory('dice'), ...byCategory('quick')].map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </Row>

      <section className="panel mt-10 flex flex-col items-start gap-4 p-6 md:flex-row md:items-center">
        <div>
          <h2 className="display text-lg">Équité vérifiable</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Chaque manche est calculée à partir d’un <strong>server seed</strong> dont le hash t’est donné avant de
            jouer, de ton <strong>client seed</strong> et d’un compteur. Tu peux rejouer n’importe quelle partie et
            vérifier le résultat toi-même.
          </p>
        </div>
        <Link href="/fairness" className="btn btn-gold ml-auto shrink-0">
          Vérifier une manche
        </Link>
      </section>
    </div>
  );
}
