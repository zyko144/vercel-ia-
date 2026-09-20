'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CasinoBackdrop } from '@/components/auth/CasinoBackdrop';
import { Logo } from '@/components/brand/Logo';
import { audio } from '@/lib/audio/engine';

const HIGHLIGHTS = [
  ['🎰', '50 jeux', 'Slots, roulette, blackjack, mines, crash, plinko…'],
  ['💎', '10 000 NV offerts', 'Ton solde de départ, crédité à l’inscription'],
  ['🏆', 'Jackpots progressifs', 'Mini, Major et Mega, alimentés par chaque mise'],
  ['🔒', 'Équité vérifiable', 'Chaque manche est rejouable et contrôlable'],
] as const;

export function AuthPanel({ initialMode }: { initialMode: 'login' | 'register' }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    audio.ui.click();
    try {
      const response = await fetch(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Impossible de continuer.');
        audio.ui.error();
        return;
      }
      audio.win('small');
      router.push('/');
      router.refresh();
    } catch {
      setError('Connexion au serveur impossible.');
      audio.ui.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-[78dvh] items-center gap-10 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
      <CasinoBackdrop />
      {/* Présentation */}
      <section className="rise relative z-10 order-2 lg:order-1">
        <Logo size={72} tagline />
        <h1 className="display mt-7 text-4xl leading-[1.05] md:text-6xl">
          Ta soirée.
          <br />
          <span className="pink-text">Ton casino.</span>
        </h1>
        <p className="mt-5 max-w-lg text-[var(--muted)]">
          Un casino 100 % virtuel : les <strong className="text-[var(--gold-bright)]">NV Coins</strong> sont une
          monnaie de jeu. Aucun dépôt, aucun retrait, aucun argent réel — juste le plaisir des machines,
          des jackpots et de la progression.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {HIGHLIGHTS.map(([icon, title, text]) => (
            <div key={title} className="panel-2 flex gap-3 p-4">
              <span className="text-xl" aria-hidden>
                {icon}
              </span>
              <div>
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs text-[var(--muted)]">{text}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Formulaire */}
      <section className="relative z-10 order-1 lg:order-2">
        <div className="panel shine mx-auto w-full max-w-md p-7">
          <div className="mb-6 flex gap-2 rounded-xl bg-[var(--surface-2)] p-1">
            {(['login', 'register'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setError(null);
                  audio.ui.toggle();
                }}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all"
                style={
                  mode === value
                    ? { background: 'linear-gradient(180deg,#ff62b4,var(--pink))', color: '#fff', boxShadow: '0 8px 24px -12px rgba(255,45,155,0.8)' }
                    : { color: 'var(--muted)' }
                }
              >
                {value === 'login' ? 'Connexion' : 'Inscription'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-widest text-[var(--muted)]">Pseudo</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
                minLength={3}
                maxLength={16}
                placeholder="ton_pseudo"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 outline-none transition-colors focus:border-[var(--pink)]"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-widest text-[var(--muted)]">Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                placeholder="••••••••"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 outline-none transition-colors focus:border-[var(--pink)]"
              />
            </label>

            {error && (
              <p className="rounded-xl border border-[var(--danger)] bg-[rgb(255_77_94/0.08)] px-4 py-3 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary w-full py-3.5 text-base" disabled={busy}>
              {busy ? 'Un instant…' : mode === 'login' ? 'Entrer dans le casino' : 'Créer mon compte'}
            </button>

            {mode === 'register' && (
              <p className="text-center text-xs text-[var(--muted)]">
                10 000 NV offerts · aucune carte bancaire, jamais
              </p>
            )}
          </form>
        </div>

        <p className="mx-auto mt-5 max-w-md text-center text-[0.7rem] leading-relaxed text-[var(--dim)]">
          Divertissement uniquement. Les NV Coins n’ont aucune valeur monétaire et ne peuvent être ni achetés,
          ni échangés, ni convertis.
        </p>
      </section>
    </div>
  );
}
