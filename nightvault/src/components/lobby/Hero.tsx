'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GameMark } from '@/components/brand/GameMark';
import { GeneratedImage, hasAsset } from '@/components/ui/GeneratedImage';
import type { CatalogEntry } from '@/lib/games/catalog';
import { audio } from '@/lib/audio/engine';

/**
 * Bandeau d'accueil : une machine mise en avant qui change toutes les 6 secondes,
 * avec fondu, halo coloré et reflet. Le premier clic ouvre aussi l'ambiance sonore.
 */
export function Hero({ connected, featured }: { connected: boolean; featured: CatalogEntry[] }) {
  const [index, setIndex] = useState(0);
  const game = featured[index % Math.max(1, featured.length)];

  useEffect(() => {
    if (featured.length < 2) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % featured.length), 6000);
    return () => clearInterval(timer);
  }, [featured.length]);

  useEffect(() => {
    const start = () => {
      audio.startAmbience();
      window.removeEventListener('pointerdown', start);
    };
    window.addEventListener('pointerdown', start);
    return () => window.removeEventListener('pointerdown', start);
  }, []);

  if (!game) return null;

  return (
    <section
      className="panel relative overflow-hidden p-6 md:p-10"
      style={{ background: `radial-gradient(75% 110% at 80% 0%, ${game.accent}2e, transparent 62%), linear-gradient(180deg, var(--surface-2), var(--surface))` }}
    >
      <div className="relative z-10 grid items-center gap-8 md:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="text-[0.66rem] uppercase tracking-[0.42em] text-[var(--muted)]">À l’affiche</div>
          <h1 className="display mt-3 text-3xl leading-[1.06] md:text-5xl">
            Ta soirée.
            <br />
            <span className="pink-text">Ton casino.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm text-[var(--muted)] md:text-base">
            Des machines à sous aux jackpots progressifs, des mines au crash : tout se joue en{' '}
            <strong className="text-[var(--gold-bright)]">NV Coins</strong>, la monnaie virtuelle du casino.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/jeu/${game.id}`} className="btn btn-primary px-6 py-3" onClick={() => audio.ui.click()}>
              Jouer à {game.name}
            </Link>
            <Link href="/jeux" className="btn px-6 py-3" onClick={() => audio.ui.click()}>
              Voir les 50 jeux
            </Link>
            {!connected && (
              <Link href="/login?mode=register" className="btn btn-gold px-6 py-3" onClick={() => audio.ui.click()}>
                10 000 NV offerts
              </Link>
            )}
          </div>
        </div>

        <div className="relative grid place-items-center">
          <div
            aria-hidden
            className="absolute h-56 w-56 rounded-full blur-3xl"
            style={{ background: `radial-gradient(circle, ${game.accent}55, transparent 70%)`, animation: 'glow-pulse 4s ease-in-out infinite' }}
          />
          <Link key={game.id} href={`/jeu/${game.id}`} className="rise relative" onClick={() => audio.ui.click()}>
            {hasAsset(`game/${game.id}`) ? (
              <span className="relative block h-[230px] w-[180px] overflow-hidden rounded-2xl border border-[var(--border)] shadow-[var(--shadow-lg)]">
                <GeneratedImage slug={`game/${game.id}`} alt={game.name} priority sizes="180px" className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: 'linear-gradient(180deg, transparent, rgba(6,7,12,0.92))' }} />
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2">
                  <GameMark id={game.id} size={56} />
                </span>
              </span>
            ) : (
              <GameMark id={game.id} size={190} />
            )}
          </Link>
          <div className="mt-3 text-center">
            <div className="display text-sm tracking-[0.2em]">{game.name}</div>
            <div className="text-xs text-[var(--muted)]">{game.tagline}</div>
          </div>
          <div className="mt-4 flex gap-1.5">
            {featured.map((entry, position) => (
              <button
                key={entry.id}
                aria-label={entry.name}
                onClick={() => setIndex(position)}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: position === index % featured.length ? 26 : 10,
                  background: position === index % featured.length ? game.accent : 'var(--border-bright)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
