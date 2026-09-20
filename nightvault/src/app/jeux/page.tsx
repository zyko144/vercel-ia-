import { GameBrowser } from '@/components/lobby/GameBrowser';
import { catalog } from '@/lib/games/catalog';

export const metadata = { title: 'Tous les jeux' };

export default function GamesPage() {
  return <GameBrowser games={catalog()} />;
}
