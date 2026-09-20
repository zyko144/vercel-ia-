'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { GameMark } from '@/components/brand/GameMark';
import { GeneratedImage, hasAsset } from '@/components/ui/GeneratedImage';
import type { CatalogEntry } from '@/lib/games/catalog';
import { audio } from '@/lib/audio/engine';

/**
 * Carte de jeu : fond dégradé propre au jeu, brand mark en relief, inclinaison 3D au survol,
 * reflet qui balaie. Jamais une simple vignette plate.
 */
export function GameCard({ game, size = 'md' }: { game: CatalogEntry; size?: 'sm' | 'md' | 'lg' }) {
  const box = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });

  const dimensions = {
    sm: { w: 'w-[150px]', h: 'h-[190px]', mark: 56 },
    md: { w: 'w-[184px]', h: 'h-[232px]', mark: 68 },
    lg: { w: 'w-[220px]', h: 'h-[276px]', mark: 84 },
  }[size];

  const move = (event: React.MouseEvent) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -10, y: x * 12, active: true });
  };

  const art = hasAsset(`game/${game.id}`);

  const content = (
    <div
      ref={box}
      onMouseMove={move}
      onMouseEnter={() => audio.ui.hover()}
      onMouseLeave={() => setTilt({ x: 0, y: 0, active: false })}
      className={`group relative ${dimensions.w} ${dimensions.h} shrink-0 overflow-hidden rounded-2xl border border-[var(--border)] transition-shadow duration-300`}
      style={{
        background: `radial-gradient(120% 80% at 50% 0%, ${game.accent}26, transparent 62%), linear-gradient(180deg, var(--surface-2), var(--surface))`,
        transform: `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(${tilt.active ? -4 : 0}px)`,
        transformStyle: 'preserve-3d',
        transition: 'transform 0.18s ease-out, box-shadow 0.3s ease',
        boxShadow: tilt.active ? `0 24px 50px -20px ${game.accent}66, inset 0 1px 0 rgb(255 255 255 / 0.08)` : 'var(--shadow), inset 0 1px 0 rgb(255 255 255 / 0.05)',
      }}
    >
      {/* illustration générée : elle occupe toute la carte, le brand mark reste par-dessus */}
      {art && (
        <div aria-hidden className="absolute inset-0">
          <GeneratedImage
            slug={`game/${game.id}`}
            alt=""
            small
            sizes="220px"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
          />
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(180deg, rgba(6,7,12,0.1) 0%, rgba(6,7,12,0.55) 52%, rgba(6,7,12,0.94) 100%)` }}
          />
        </div>
      )}

      {/* halo du jeu */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-2/3 opacity-70 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(60% 60% at 50% 25%, ${game.accent}33, transparent 70%)` }}
      />
      {/* reflet */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/3 -translate-x-full opacity-0 transition-all duration-700 group-hover:translate-x-[420%] group-hover:opacity-100"
        style={{ background: 'linear-gradient(100deg, transparent, rgb(255 255 255 / 0.16), transparent)' }}
      />

      <div className="relative flex h-full flex-col items-center justify-between p-4" style={{ transform: 'translateZ(24px)' }}>
        <div className={`grid place-items-center ${art ? 'mt-1' : 'mt-3'}`}>
          <GameMark id={game.id} size={art ? Math.round(dimensions.mark * 0.62) : dimensions.mark} />
        </div>

        <div className="w-full text-center">
          <div className="display truncate text-[0.78rem] tracking-[0.12em]" style={{ color: game.playable ? 'var(--text)' : 'var(--muted)' }}>
            {game.name}
          </div>
          <div className="mt-1 truncate text-[0.62rem] text-[var(--muted)]">{game.tagline}</div>
          {game.playable ? (
            <div className="mt-2 flex items-center justify-center gap-2 text-[0.6rem] text-[var(--dim)]">
              <span className="rounded-md bg-[var(--surface-3)] px-1.5 py-0.5">RTP {(game.rtp! * 100).toFixed(1)}%</span>
              <span className="rounded-md bg-[var(--surface-3)] px-1.5 py-0.5">{game.volatility}</span>
            </div>
          ) : (
            <div className="mt-2 inline-block rounded-md border border-[var(--border-bright)] px-2 py-0.5 text-[0.58rem] uppercase tracking-widest text-[var(--muted)]">
              bientôt
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!game.playable) return <div className="cursor-not-allowed opacity-75">{content}</div>;
  return (
    <Link href={`/jeu/${game.id}`} onClick={() => audio.ui.click()} aria-label={game.name}>
      {content}
    </Link>
  );
}
