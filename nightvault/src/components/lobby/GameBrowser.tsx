'use client';

import { useMemo, useState } from 'react';
import { GameTile } from './GameTile';
import { CATEGORIES, type CatalogEntry } from '@/lib/games/catalog';
import { audio } from '@/lib/audio/engine';

/** Catalogue complet : recherche, filtres par catégorie, et tri jouables d'abord. */
export function GameBrowser({ games }: { games: CatalogEntry[] }) {
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyPlayable, setOnlyPlayable] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return games
      .filter((game) => (category === 'all' ? true : game.category === category))
      .filter((game) => (onlyPlayable ? game.playable : true))
      .filter((game) => (needle ? game.name.toLowerCase().includes(needle) || game.tagline.toLowerCase().includes(needle) : true))
      .sort((a, b) => Number(b.playable) - Number(a.playable) || a.name.localeCompare(b.name));
  }, [category, games, onlyPlayable, search]);

  const playableCount = games.filter((game) => game.playable).length;

  return (
    <div className="space-y-5">
      <div className="panel flex flex-wrap items-center gap-3 p-4">
        <div>
          <h1 className="display text-xl tracking-[0.14em]">Tous les jeux</h1>
          <p className="text-xs text-[var(--muted)]">
            {games.length} jeux au catalogue · <span className="text-[var(--success)]">{playableCount} jouables</span> maintenant
          </p>
        </div>
        <div className="ml-auto flex flex-1 items-center gap-2 md:max-w-sm">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un jeu…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm outline-none focus:border-[var(--pink)]"
          />
          <button
            className="btn shrink-0 px-3 py-2.5 text-xs"
            onClick={() => {
              setOnlyPlayable((value) => !value);
              audio.ui.toggle();
            }}
            style={onlyPlayable ? { borderColor: 'var(--success)', color: 'var(--success)' } : undefined}
          >
            Jouables
          </button>
        </div>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            onClick={() => {
              setCategory(entry.id);
              audio.ui.click();
            }}
            className="btn shrink-0 gap-2 px-4 py-2.5 text-xs"
            style={category === entry.id ? { borderColor: 'var(--pink)', color: 'var(--pink)' } : undefined}
          >
            <span aria-hidden>{entry.icon}</span>
            {entry.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3 md:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
        {filtered.map((game) => (
          <GameTile key={game.id} game={game} size="lg" />
        ))}
        {filtered.length === 0 && <p className="p-6 text-sm text-[var(--muted)]">Aucun jeu ne correspond.</p>}
      </div>
    </div>
  );
}
