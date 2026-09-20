'use client';

import { useCallback, useState } from 'react';
import { useSession } from '@/components/session/SessionProvider';
import { audio } from '@/lib/audio/engine';

const key = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);

export type PlayResponse<R = unknown> = {
  result: R;
  multiplier: number;
  payout: number;
  balance: number;
  jackpot: { name: string; amount: number } | null;
};

/** Jeux en une requête (slots, dice, plinko…). */
export function useInstantGame<R = unknown>(gameId: string) {
  const { setBalance, me } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<PlayResponse<R> | null>(null);

  const play = useCallback(
    async (bet: number, options?: unknown): Promise<PlayResponse<R> | null> => {
      if (busy) return null;
      if (!me) {
        setError('Connecte-toi pour jouer.');
        return null;
      }
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/games/${gameId}/play`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bet, options, idempotencyKey: key() }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? 'Impossible de jouer.');
          audio.ui.error();
          return null;
        }
        setLast(data);
        setBalance(data.balance);
        if (data.jackpot) audio.jackpot();
        return data as PlayResponse<R>;
      } catch {
        setError('Le serveur ne répond pas.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, gameId, me, setBalance],
  );

  return { play, busy, error, setError, last };
}

/** Jeux à étapes (mines, crash, tower) : une manche reste ouverte côté serveur. */
export function useStatefulGame<V = unknown>(gameId: string) {
  const { setBalance, me } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<V | null>(null);
  const [bet, setBet] = useState(0);
  const [outcome, setOutcome] = useState<{ done: boolean; multiplier: number; payout: number } | null>(null);

  const open = useCallback(
    async (amount: number, options?: unknown) => {
      if (busy) return null;
      if (!me) {
        setError('Connecte-toi pour jouer.');
        return null;
      }
      setBusy(true);
      setError(null);
      setOutcome(null);
      try {
        const response = await fetch(`/api/games/${gameId}/round`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bet: amount, options, idempotencyKey: key() }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? 'Impossible de lancer la partie.');
          audio.ui.error();
          return null;
        }
        setView(data.view);
        setBet(amount);
        setBalance(data.balance);
        if (data.jackpot) audio.jackpot();
        return data.view as V;
      } finally {
        setBusy(false);
      }
    },
    [busy, gameId, me, setBalance],
  );

  const act = useCallback(
    async (action: unknown) => {
      if (busy) return null;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`/api/games/${gameId}/round`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? 'Action impossible.');
          audio.ui.error();
          return null;
        }
        setView(data.view);
        setBalance(data.balance);
        if (data.done) setOutcome({ done: true, multiplier: data.multiplier, payout: data.payout });
        return data;
      } finally {
        setBusy(false);
      }
    },
    [busy, gameId, setBalance],
  );

  /** Reprend une manche laissée ouverte (rechargement de page). */
  const resume = useCallback(async () => {
    const response = await fetch(`/api/games/${gameId}/round`, { cache: 'no-store' });
    const data = await response.json();
    if (data.round) {
      setView(data.round.view);
      setBet(data.round.bet);
    }
  }, [gameId]);

  return { open, act, resume, view, setView, bet, busy, error, setError, outcome, setOutcome };
}
