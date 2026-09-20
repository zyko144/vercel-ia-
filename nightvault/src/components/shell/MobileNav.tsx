'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { audio } from '@/lib/audio/engine';

const ITEMS = [
  { href: '/', label: 'Accueil', icon: 'home' },
  { href: '/jeux', label: 'Jeux', icon: 'games' },
  { href: '/missions', label: 'Missions', icon: 'missions' },
  { href: '/recompenses', label: 'Cadeaux', icon: 'rewards' },
  { href: '/profil', label: 'Profil', icon: 'profile' },
] as const;

function Icon({ name, active }: { name: string; active: boolean }) {
  const stroke = active ? 'var(--pink)' : 'var(--muted)';
  const common = { fill: 'none', stroke, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      {name === 'home' && <path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...common} />}
      {name === 'games' && (
        <>
          <rect x="2.5" y="7" width="19" height="11" rx="4" {...common} />
          <path d="M7 10.5v4M5 12.5h4M15.5 11.5h.01M18 14h.01" {...common} />
        </>
      )}
      {name === 'missions' && (
        <>
          <path d="M5 4h14v16l-7-4-7 4z" {...common} />
          <path d="M9 9.5l2 2 4-4" {...common} />
        </>
      )}
      {name === 'rewards' && (
        <>
          <rect x="3" y="9" width="18" height="12" rx="2" {...common} />
          <path d="M3 13h18M12 9v12M8.5 9C6 9 5 5 8 4.5c2.2-.4 3.4 2.3 4 4.5.6-2.2 1.8-4.9 4-4.5 3 .5 2 4.5-.5 4.5" {...common} />
        </>
      )}
      {name === 'profile' && (
        <>
          <circle cx="12" cy="8.5" r="3.7" {...common} />
          <path d="M4.5 20c1.3-3.8 4-5.7 7.5-5.7s6.2 1.9 7.5 5.7" {...common} />
        </>
      )}
    </svg>
  );
}

export function MobileNav() {
  const path = usePathname();
  if (path.startsWith('/login')) return null;

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {ITEMS.map((item) => {
        const active = item.href === '/' ? path === '/' : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => audio.ui.click()}
            className="flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-[0.62rem]"
            style={{ color: active ? 'var(--pink)' : 'var(--muted)' }}
          >
            <Icon name={item.icon} active={active} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
