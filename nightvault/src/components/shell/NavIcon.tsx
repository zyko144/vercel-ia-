'use client';

/** Icônes du menu principal : traits fins, cohérentes entre elles, lisibles à 22 px. */
export function NavIcon({ name, active }: { name: string; active: boolean }) {
  const color = active ? 'var(--pink)' : 'var(--muted)';
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden>
      {name === 'home' && <path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" {...common} />}
      {name === 'casino' && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" {...common} />
          <circle cx="8.5" cy="8.5" r="1.4" fill={color} stroke="none" />
          <circle cx="15.5" cy="15.5" r="1.4" fill={color} stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill={color} stroke="none" />
        </>
      )}
      {name === 'promo' && (
        <>
          <rect x="3" y="9" width="18" height="12" rx="2" {...common} />
          <path d="M3 13h18M12 9v12" {...common} />
          <path d="M8.5 9C6 9 5 5 8 4.5c2.2-.4 3.4 2.3 4 4.5.6-2.2 1.8-4.9 4-4.5 3 .5 2 4.5-.5 4.5" {...common} />
        </>
      )}
      {name === 'loyalty' && (
        <>
          <path d="M12 3.6 14.5 9l5.9.6-4.4 4 1.3 5.8L12 16.6 6.7 19.4 8 13.6 3.6 9.6 9.5 9z" {...common} />
        </>
      )}
      {name === 'search' && (
        <>
          <circle cx="11" cy="11" r="6.4" {...common} />
          <path d="m16 16 4.2 4.2" {...common} />
        </>
      )}
      {name === 'more' && (
        <>
          <circle cx="5.5" cy="12" r="1.5" fill={color} stroke="none" />
          <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
          <circle cx="18.5" cy="12" r="1.5" fill={color} stroke="none" />
        </>
      )}
      {name === 'missions' && (
        <>
          <path d="M5 4h14v16l-7-4-7 4z" {...common} />
          <path d="m9 9.5 2 2 4-4" {...common} />
        </>
      )}
    </svg>
  );
}
