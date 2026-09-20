'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { audio } from '@/lib/audio/engine';

/** Carrousel horizontal : molette, glisser-déposer, flèches, inertie native et accroche. */
export function Row({
  title,
  subtitle,
  href,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  children: React.ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; left: number } | null>(null);

  const scrollBy = (direction: 1 | -1) => {
    audio.ui.click();
    track.current?.scrollBy({ left: direction * Math.max(320, (track.current.clientWidth ?? 600) * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="mt-9">
      <div className="mb-3 flex items-end gap-3">
        <div>
          <h2 className="display text-lg tracking-[0.14em] md:text-xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {href && (
            <Link href={href} className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]">
              Tout voir →
            </Link>
          )}
          <div className="hidden gap-1 md:flex">
            <button className="btn px-2.5 py-1.5 text-xs" onClick={() => scrollBy(-1)} aria-label="Précédent">
              ‹
            </button>
            <button className="btn px-2.5 py-1.5 text-xs" onClick={() => scrollBy(1)} aria-label="Suivant">
              ›
            </button>
          </div>
        </div>
      </div>

      <div
        ref={track}
        className="no-scrollbar flex snap-x snap-mandatory gap-3.5 overflow-x-auto pb-2"
        style={{ cursor: drag ? 'grabbing' : undefined, scrollBehavior: drag ? 'auto' : 'smooth' }}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch') return; // le défilement tactile natif est meilleur
          setDrag({ x: event.clientX, left: track.current?.scrollLeft ?? 0 });
        }}
        onPointerMove={(event) => {
          if (!drag || !track.current) return;
          track.current.scrollLeft = drag.left - (event.clientX - drag.x);
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {children}
      </div>
    </section>
  );
}
