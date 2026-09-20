'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { NavIcon } from '@/components/shell/NavIcon';
import { Counter } from '@/components/ui/Balance';
import { useSession } from '@/components/session/SessionProvider';
import { audio } from '@/lib/audio/engine';

const LINKS = [
  { href: '/', label: 'Accueil', icon: 'home' },
  { href: '/jeux', label: 'Casino', icon: 'casino' },
  { href: '/recompenses', label: 'Promotions', icon: 'promo' },
  { href: '/missions', label: 'Fidélité', icon: 'loyalty' },
] as const;

/** Entête : logo animé à gauche, menu à icônes centré, solde et profil à droite. */
export function Header() {
  const { me, logout } = useSession();
  const path = usePathname();
  const router = useRouter();
  const [sound, setSound] = useState(true);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => setSound(audio.enabled), []);
  useEffect(() => setMenu(false), [path]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    audio.setEnabled(next);
    if (next) audio.ui.toggle();
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!search.trim()) return;
    router.push(`/jeux?q=${encodeURIComponent(search.trim())}`);
    setSearching(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[rgb(6_7_12/0.86)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3 px-3 py-2 md:px-6">
        <Link href="/" aria-label="Accueil" onClick={() => audio.ui.click()} className="shrink-0">
          <Logo size={34} />
        </Link>

        {/* Menu centré à icônes */}
        <nav className="mx-auto hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = link.href === '/' ? path === '/' : path.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onMouseEnter={() => audio.ui.hover()}
                onClick={() => audio.ui.click()}
                className="flex min-w-[76px] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors"
                style={{
                  background: active ? 'linear-gradient(180deg, rgba(255,45,155,0.16), rgba(255,45,155,0.04))' : undefined,
                  boxShadow: active ? 'inset 0 0 0 1px rgba(255,45,155,0.35)' : undefined,
                }}
              >
                <NavIcon name={link.icon} active={active} />
                <span className="text-[0.66rem] font-medium" style={{ color: active ? 'var(--text)' : 'var(--muted)' }}>
                  {link.label}
                </span>
              </Link>
            );
          })}

          {/* Recherche */}
          <div className="relative">
            {searching ? (
              <form onSubmit={submitSearch} className="flex items-center">
                <input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onBlur={() => !search && setSearching(false)}
                  placeholder="Rechercher un jeu…"
                  className="w-56 rounded-xl border border-[var(--border-bright)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                />
              </form>
            ) : (
              <button
                onClick={() => {
                  setSearching(true);
                  audio.ui.click();
                }}
                className="flex min-w-[76px] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5"
              >
                <NavIcon name="search" active={false} />
                <span className="text-[0.66rem] font-medium text-[var(--muted)]">Recherche</span>
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => {
                setMenu((open) => !open);
                audio.ui.click();
              }}
              className="flex min-w-[76px] flex-col items-center gap-0.5 rounded-xl px-3 py-1.5"
              aria-haspopup="menu"
              aria-expanded={menu}
            >
              <NavIcon name="more" active={menu} />
              <span className="text-[0.66rem] font-medium" style={{ color: menu ? 'var(--text)' : 'var(--muted)' }}>
                Plus
              </span>
            </button>
            {menu && (
              <div className="panel absolute left-1/2 mt-2 w-52 -translate-x-1/2 p-2 text-sm">
                {[
                  ['/classement', 'Classement'],
                  ['/historique', 'Historique'],
                  ['/fairness', 'Équité vérifiable'],
                  ['/profil', 'Mon profil'],
                ].map(([href, label]) => (
                  <Link key={href} href={href} className="block rounded-lg px-3 py-2 hover:bg-[var(--surface-2)]">
                    {label}
                  </Link>
                ))}
                {me?.role === 'ADMIN' && (
                  <Link href="/admin" className="block rounded-lg px-3 py-2 hover:bg-[var(--surface-2)]">
                    Administration
                  </Link>
                )}
              </div>
            )}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {me ? (
            <>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5">
                <span
                  aria-hidden
                  className="grid h-5 w-5 place-items-center rounded-full text-[0.62rem] font-bold"
                  style={{ background: 'linear-gradient(180deg,#ffe9b0,#c8a24a)', color: '#22180a' }}
                >
                  N
                </span>
                <Counter value={me.balance} className="text-sm font-semibold text-[var(--gold-bright)]" />
              </div>

              <button className="btn px-2.5 py-2 text-xs" onClick={toggleSound} aria-label={sound ? 'Couper le son' : 'Activer le son'}>
                {sound ? '🔊' : '🔇'}
              </button>

              <Link href="/profil" className="btn px-2 py-1.5" aria-label="Mon profil">
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold"
                  style={{ background: `linear-gradient(140deg, ${me.tierColor ?? '#ff2d9b'}, #1a1f2e)` }}
                >
                  {me.displayName.slice(0, 1).toUpperCase()}
                </span>
              </Link>

              <button className="btn hidden px-3 py-2 text-xs lg:inline-flex" onClick={logout}>
                Quitter
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn px-4 py-2 text-sm" onClick={() => audio.ui.click()}>
                Se connecter
              </Link>
              <Link href="/login?mode=register" className="btn btn-primary px-4 py-2 text-sm" onClick={() => audio.ui.click()}>
                S’inscrire
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
