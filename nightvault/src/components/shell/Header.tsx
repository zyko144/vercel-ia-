'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { Counter } from '@/components/ui/Balance';
import { useSession } from '@/components/session/SessionProvider';
import { audio } from '@/lib/audio/engine';

const LINKS = [
  { href: '/', label: 'Accueil' },
  { href: '/jeux', label: 'Jeux' },
  { href: '/missions', label: 'Missions' },
  { href: '/recompenses', label: 'Récompenses' },
  { href: '/classement', label: 'Classement' },
];

export function Header() {
  const { me, logout } = useSession();
  const path = usePathname();
  const [sound, setSound] = useState(true);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    setSound(audio.enabled);
  }, []);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    audio.setEnabled(next);
    if (next) audio.ui.toggle();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[rgb(6_7_12/0.82)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3 md:gap-6 md:px-7">
        <Link href="/" aria-label="Accueil" onClick={() => audio.ui.click()}>
          <Logo size={38} />
        </Link>

        <nav className="ml-2 hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => {
            const active = link.href === '/' ? path === '/' : path.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onMouseEnter={() => audio.ui.hover()}
                onClick={() => audio.ui.click()}
                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          {me ? (
            <>
              <div className="panel-2 flex items-center gap-2 px-3 py-2">
                <span
                  aria-hidden
                  className="grid h-6 w-6 place-items-center rounded-full text-[0.7rem] font-bold"
                  style={{ background: 'linear-gradient(180deg,#ffe9b0,#c8a24a)', color: '#22180a' }}
                >
                  N
                </span>
                <Counter value={me.balance} className="text-sm font-semibold text-[var(--gold-bright)]" />
              </div>

              <button className="btn px-3 py-2" onClick={toggleSound} aria-label={sound ? 'Couper le son' : 'Activer le son'} title="Son">
                {sound ? '🔊' : '🔇'}
              </button>

              <div className="relative">
                <button
                  className="btn px-2 py-1.5"
                  onClick={() => {
                    setMenu((open) => !open);
                    audio.ui.click();
                  }}
                  aria-haspopup="menu"
                  aria-expanded={menu}
                >
                  <span
                    className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
                    style={{ background: `linear-gradient(140deg, ${me.tierColor ?? '#ff2d9b'}, #1a1f2e)` }}
                  >
                    {me.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden text-sm md:inline">{me.displayName}</span>
                </button>

                {menu && (
                  <div className="panel absolute right-0 mt-2 w-60 overflow-hidden p-2 text-sm">
                    <div className="px-3 py-2">
                      <div className="font-semibold">{me.displayName}</div>
                      <div className="text-xs text-[var(--muted)]">
                        Niveau {me.level} · {me.tier ?? 'Novice'}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round(((me.intoLevel ?? 0) / Math.max(1, me.needed ?? 1)) * 100)}%`,
                            background: 'linear-gradient(90deg,#ff2d9b,#ff7ac2)',
                          }}
                        />
                      </div>
                    </div>
                    <Link href="/profil" className="block rounded-lg px-3 py-2 hover:bg-[var(--surface-2)]" onClick={() => setMenu(false)}>
                      Mon profil
                    </Link>
                    <Link href="/historique" className="block rounded-lg px-3 py-2 hover:bg-[var(--surface-2)]" onClick={() => setMenu(false)}>
                      Historique
                    </Link>
                    <Link href="/fairness" className="block rounded-lg px-3 py-2 hover:bg-[var(--surface-2)]" onClick={() => setMenu(false)}>
                      Équité vérifiable
                    </Link>
                    {me.role === 'ADMIN' && (
                      <Link href="/admin" className="block rounded-lg px-3 py-2 hover:bg-[var(--surface-2)]" onClick={() => setMenu(false)}>
                        Administration
                      </Link>
                    )}
                    <button className="w-full rounded-lg px-3 py-2 text-left text-[var(--danger)] hover:bg-[var(--surface-2)]" onClick={logout}>
                      Se déconnecter
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn px-4 py-2 text-sm" onClick={() => audio.ui.click()}>
                Se connecter
              </Link>
              <Link href="/login?mode=register" className="btn btn-primary px-4 py-2 text-sm" onClick={() => audio.ui.click()}>
                Créer un compte
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
