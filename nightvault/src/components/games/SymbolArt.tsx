'use client';

/**
 * Symboles des rouleaux : chacun est dessiné (SVG), avec relief et lumière.
 * Rien n'est un emoji : ce sont les pièces de la machine.
 */
type Symbols = { id: string; name: string; color: string; kind?: string }[];

export function SymbolArt({ id, symbols, size = 64 }: { id: string; symbols: Symbols; size?: number }) {
  const symbol = symbols.find((entry) => entry.id === id);
  const color = symbol?.color ?? '#c9d3e4';
  const gid = `sym-${id}`;

  const body = () => {
    switch (id) {
      case 'seven':
        return (
          <>
            <path d="M18 18h28l-14 34h-8l11-26H18z" fill={`url(#${gid}-g)`} />
            <path d="M18 18h28l-2 5H18z" fill="#fff" opacity="0.45" />
          </>
        );
      case 'diamond':
      case 'blue':
      case 'white':
      case 'pink':
        return (
          <>
            <path d="M32 12 50 30 32 54 14 30z" fill={`url(#${gid}-g)`} />
            <path d="M32 12 50 30H14z" fill="#fff" opacity="0.4" />
            <path d="M14 30h36L32 54z" fill="none" stroke="#04222f" strokeWidth="0.8" opacity="0.5" />
          </>
        );
      case 'bell':
        return (
          <>
            <path d="M32 12c8 0 13 6 13 14v10l4 6H15l4-6V26c0-8 5-14 13-14z" fill={`url(#${gid}-g)`} />
            <circle cx="32" cy="50" r="4" fill={`url(#${gid}-g)`} />
            <path d="M24 20c1-4 4-6 8-6" stroke="#fff" strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" />
          </>
        );
      case 'cherry':
        return (
          <>
            <path d="M32 14c6 6 12 8 16 8" stroke="#2ee08a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <circle cx="24" cy="42" r="10" fill={`url(#${gid}-g)`} />
            <circle cx="42" cy="38" r="8" fill={`url(#${gid}-g)`} opacity="0.85" />
            <circle cx="20" cy="38" r="3" fill="#fff" opacity="0.45" />
          </>
        );
      case 'bar':
        return (
          <>
            <rect x="12" y="24" width="40" height="16" rx="4" fill={`url(#${gid}-g)`} />
            <text x="32" y="36" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0a0c14" fontFamily="system-ui">
              BAR
            </text>
          </>
        );
      case 'grape':
        return (
          <>
            {[[32, 24], [26, 32], [38, 32], [32, 40], [22, 42], [42, 42], [32, 50]].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="6" fill={`url(#${gid}-g)`} />
            ))}
            <path d="M32 24c0-6 4-9 8-10" stroke="#2ee08a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </>
        );
      case 'lemon':
        return (
          <>
            <ellipse cx="32" cy="34" rx="17" ry="13" fill={`url(#${gid}-g)`} />
            <path d="M15 34c4-4 10-6 17-6s13 2 17 6" stroke="#fff" strokeWidth="1.5" fill="none" opacity="0.4" />
            <path d="M49 21c2-2 4-2 5-1" stroke="#2ee08a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </>
        );
      case 'wild':
        return (
          <>
            <path d="M32 10 40 26l18 2-13 12 3 18-16-9-16 9 3-18L6 28l18-2z" fill={`url(#${gid}-g)`} />
            <text x="32" y="40" textAnchor="middle" fontSize="11" fontWeight="800" fill="#0a0c14" fontFamily="system-ui">
              WILD
            </text>
          </>
        );
      case 'scatter':
        return (
          <>
            <circle cx="32" cy="32" r="18" fill="none" stroke={color} strokeWidth="3" strokeDasharray="6 5" />
            <circle cx="32" cy="32" r="10" fill={`url(#${gid}-g)`} />
            <text x="32" y="36" textAnchor="middle" fontSize="9" fontWeight="800" fill="#0a0c14" fontFamily="system-ui">
              SC
            </text>
          </>
        );
      case 'crown':
        return (
          <>
            <path d="M12 46 16 20l10 10 6-14 6 14 10-10 4 26z" fill={`url(#${gid}-g)`} />
            <rect x="12" y="46" width="40" height="6" rx="2" fill="#8a6a24" />
            <circle cx="32" cy="18" r="3" fill="#fff" opacity="0.7" />
          </>
        );
      case 'vault':
        return (
          <>
            <rect x="12" y="14" width="40" height="38" rx="6" fill={`url(#${gid}-g)`} />
            <circle cx="32" cy="33" r="12" fill="none" stroke="#0a0c14" strokeWidth="2.5" />
            <circle cx="32" cy="33" r="5" fill="#0a0c14" />
            <path d="M32 21v-4M32 49v-4M20 33h-4M48 33h-4" stroke="#0a0c14" strokeWidth="2.5" strokeLinecap="round" />
          </>
        );
      case 'ruby':
      case 'emerald':
      case 'green':
        return (
          <>
            <path d="M20 16h24l8 12-20 22-20-22z" fill={`url(#${gid}-g)`} />
            <path d="M20 16h24l8 12H12z" fill="#fff" opacity="0.35" />
          </>
        );
      case 'coin':
      case 'gold':
        return (
          <>
            <ellipse cx="32" cy="34" rx="17" ry="17" fill={`url(#${gid}-g)`} />
            <ellipse cx="32" cy="34" rx="11" ry="11" fill="none" stroke="#8a6a24" strokeWidth="2" />
            <text x="32" y="39" textAnchor="middle" fontSize="13" fontWeight="800" fill="#6a4f14" fontFamily="system-ui">
              N
            </text>
          </>
        );
      case 'ring':
        return (
          <>
            <circle cx="32" cy="38" r="13" fill="none" stroke={`url(#${gid}-g)`} strokeWidth="6" />
            <path d="M32 14 38 24H26z" fill={`url(#${gid}-g)`} />
          </>
        );
      case 'key':
        return (
          <>
            <circle cx="24" cy="26" r="9" fill="none" stroke={`url(#${gid}-g)`} strokeWidth="5" />
            <path d="M30 32 46 48M40 42l5 5M36 38l5 5" stroke={`url(#${gid}-g)`} strokeWidth="5" strokeLinecap="round" />
          </>
        );
      case 'pick':
        return (
          <>
            <path d="M10 22c14-8 30-8 44 0" stroke={`url(#${gid}-g)`} strokeWidth="6" fill="none" strokeLinecap="round" />
            <rect x="29" y="22" width="6" height="30" rx="3" fill={`url(#${gid}-g)`} />
          </>
        );
      case 'cart':
        return (
          <>
            <path d="M12 26h40l-5 16H17z" fill={`url(#${gid}-g)`} />
            <circle cx="22" cy="48" r="5" fill="#2b3348" />
            <circle cx="42" cy="48" r="5" fill="#2b3348" />
          </>
        );
      default:
        return <circle cx="32" cy="32" r="18" fill={`url(#${gid}-g)`} />;
    }
  };

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-label={symbol?.name ?? id} role="img">
      <defs>
        <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="28%" stopColor={color} />
          <stop offset="78%" stopColor={color} stopOpacity="0.85" />
          <stop offset="100%" stopColor="#0a0c14" />
        </linearGradient>
        <filter id={`${gid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000" floodOpacity="0.6" />
        </filter>
      </defs>
      <g filter={`url(#${gid}-shadow)`}>{body()}</g>
    </svg>
  );
}
