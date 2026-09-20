import { notFound } from 'next/navigation';
import { GameRouter } from '@/components/games/GameRouter';
import { getGame } from '@/lib/games/registry';
import { SLOT_CONFIGS } from '@/lib/games/slots/configs';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  return { title: game?.meta.name ?? 'Jeu' };
}

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) notFound();

  const meta = {
    id: game.meta.id,
    name: game.meta.name,
    tagline: game.meta.tagline,
    accent: game.meta.accent,
    rtp: game.meta.math.rtp,
    volatility: game.meta.math.volatility,
    maxWin: game.meta.math.maxWin,
  };

  // Les machines à sous ont besoin de leur configuration (bandes, lignes, symboles) côté client
  const slot = SLOT_CONFIGS.find((config) => config.id === slug);
  const slotView = slot
    ? {
        id: slot.id,
        name: slot.name,
        tagline: slot.tagline,
        accent: slot.accent,
        reels: slot.reels,
        rows: slot.rows,
        symbols: slot.symbols,
        strips: slot.strips,
        paylines: slot.paylines,
        math: slot.math,
      }
    : null;

  return <GameRouter meta={meta} slot={slotView} />;
}
