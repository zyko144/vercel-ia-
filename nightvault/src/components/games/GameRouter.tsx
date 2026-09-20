'use client';

import Link from 'next/link';
import { GameMark } from '@/components/brand/GameMark';
import { CrashGame } from './Crash';
import { DiceGame } from './Dice';
import { MinesGame } from './Mines';
import { PlinkoGame } from './Plinko';
import { SlotGame, type SlotView } from './Slot';

export type GameMeta = {
  id: string;
  name: string;
  tagline: string;
  accent: string;
  rtp: number;
  volatility: string;
  maxWin: number;
};

/** Interface non encore réalisée : on le dit clairement plutôt que de faire semblant. */
function NotReady({ meta }: { meta: GameMeta }) {
  return (
    <div className="panel grid min-h-[60dvh] place-items-center p-10 text-center">
      <div>
        <GameMark id={meta.id} size={120} />
        <h1 className="display mt-6 text-2xl">{meta.name}</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
          Le moteur de ce jeu est prêt et vérifié côté serveur (RTP {(meta.rtp * 100).toFixed(2)} %), mais son
          interface est encore en construction. Elle arrive très vite.
        </p>
        <Link href="/jeux" className="btn btn-primary mt-6">
          Voir les jeux jouables
        </Link>
      </div>
    </div>
  );
}

export function GameRouter({ meta, slot }: { meta: GameMeta; slot: SlotView | null }) {
  if (slot) return <SlotGame view={slot} />;
  switch (meta.id) {
    case 'mines':
      return <MinesGame meta={meta} />;
    case 'crash':
      return <CrashGame meta={meta} />;
    case 'plinko':
      return <PlinkoGame meta={meta} />;
    case 'dice':
      return <DiceGame meta={meta} />;
    default:
      return <NotReady meta={meta} />;
  }
}
