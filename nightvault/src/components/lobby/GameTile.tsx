'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { GameMark } from '@/components/brand/GameMark';
import { GeneratedImage, hasAsset } from '@/components/ui/GeneratedImage';
import type { CatalogEntry } from '@/lib/games/catalog';
import { audio } from '@/lib/audio/engine';

const CATEGORY_LABEL: Record<string, string> = {
  slots: 'Machine à sous',
  table: 'Jeu de table',
  dice: 'Dés',
  arcade: 'Arcade',
  quick: 'Jeu rapide',
};

/**
 * Vignette de jeu : illustration carrée plein cadre, titre en dessous.
 * Au survol : zoom léger, halo coloré, reflet qui balaie et bouton Jouer.
 */
export function GameTile({ game, size = 'md' }: { game: CatalogEntry; size?: 'sm' | 'md' | 'lg' }) {
  const box = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, active: false });
  const art = hasAsset(`game/${game.id}`);

  const width = { sm: 132, md: 168, lg: 208 }[size];

  const move = (event: React.MouseEvent) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -8, y: x * 10, active: true });
  };

  const tile = (
    <div className="shrink-0" style={{ width }}>
      <div
        ref={box}
        onMouseMove={move}
        onMouseEnter={() => audio.ui.hover()}
        onMouseLeave={() => setTilt({ x: 0, y: 0, active: false })}
        className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--border)]"
        style={{
          background: `radial-gradient(120% 90% at 50% 0%, ${game.accent}33, transparent 62%), linear-gradient(180deg, var(--surface-2), var(--surface))`,
          transform: `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(${tilt.active ? -5 : 0}px)`,
          transition: 'transform 0.18s ease-out, box-shadow 0.3s ease',
          boxShadow: tilt.active
            ? `0 22px 44px -18px ${game.accent}99, inset 0 1px 0 rgb(255 255 255 / 0.1)`
            : '0 12px 26px -18px rgb(0 0 0 / 0.9), inset 0 1px 0 rgb(255 255 255 / 0.05)',
        }}
      >
        {art ? (
          <>
            <GeneratedImage
              slug={`game/${game.id}`}
              alt={game.name}
              small
              sizes="220px"
              className="h-full w-full object-cover transition-transform duration-[900ms] group-hover:scale-[1.08]"
            />
            {/* voile bas pour la lisibilité du badge */}
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: 'linear-gradient(180deg, transparent, rgba(6,7,12,0.8))' }} />
          </>
        ) : (
          <div className="grid h-full w-full place-items-center">
            <GameMark id={game.id} size={Math.round(width * 0.46)} />
          </div>
        )}

        {/* reflet qui balaie */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-1/3 top-0 h-full w-1/3 -translate-x-full opacity-0 transition-all duration-700 group-hover:translate-x-[420%] group-hover:opacity-100"
          style={{ background: 'linear-gradient(100deg, transparent, rgb(255 255 255 / 0.2), transparent)' }}
        />

        {/* badges */}
        {game.playable ? (
          <span
            className="absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider backdrop-blur-sm"
            style={{ background: 'rgba(6,7,12,0.62)', color: 'var(--gold-bright)' }}
          >
            RTP {(game.rtp! * 100).toFixed(1)}%
          </span>
        ) : (
          <span className="absolute inset-0 grid place-items-center bg-[rgb(6_7_12/0.62)] backdrop-blur-[2px]">
            <span className="rounded-lg border border-[var(--border-bright)] px-3 py-1 text-[0.6rem] uppercase tracking-[0.25em] text-[var(--muted)]">
              bientôt
            </span>
          </span>
        )}

        {/* bouton au survol */}
        {game.playable && (
          <span className="pointer-events-none absolute inset-x-2 bottom-2 translate-y-3 rounded-lg py-1.5 text-center text-[0.68rem] font-bold uppercase tracking-wider opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
            style={{ background: 'linear-gradient(180deg,#ff62b4,var(--pink))', color: '#fff', boxShadow: '0 8px 20px -10px rgba(255,45,155,0.9)' }}
          >
            Jouer
          </span>
        )}
      </div>

      <div className="mt-1.5 px-0.5">
        <div className="truncate text-[0.76rem] font-semibold" style={{ color: game.playable ? 'var(--text)' : 'var(--muted)' }}>
          {game.name}
        </div>
        <div className="truncate text-[0.6rem] uppercase tracking-wider text-[var(--dim)]">
          {CATEGORY_LABEL[String(game.category)] ?? game.category}
        </div>
      </div>
    </div>
  );

  if (!game.playable) return <div className="cursor-not-allowed">{tile}</div>;
  return (
    <Link href={`/jeu/${game.id}`} onClick={() => audio.ui.click()} aria-label={game.name}>
      {tile}
    </Link>
  );
}
