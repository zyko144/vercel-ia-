/**
 * Brand marks des jeux : chaque jeu a son propre symbole, dessiné à la main en SVG.
 * Contraintes respectées : silhouette lisible à 24 px, construction géométrique,
 * dégradé métallique, reflet, et une version unique par jeu (aucune icône générique).
 */

type MarkProps = { size?: number; className?: string; animated?: boolean };

const defsFor = (id: string, from: string, to: string, dark = '#0a0c14') => (
  <defs>
    <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
      <stop offset="22%" stopColor={from} />
      <stop offset="70%" stopColor={to} />
      <stop offset="100%" stopColor={dark} />
    </linearGradient>
    <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stopColor="#242a3d" />
      <stop offset="60%" stopColor="#11141f" />
      <stop offset="100%" stopColor="#06070c" />
    </linearGradient>
    <radialGradient id={`${id}-glow`} cx="50%" cy="42%" r="55%">
      <stop offset="0%" stopColor={from} stopOpacity="0.55" />
      <stop offset="100%" stopColor={from} stopOpacity="0" />
    </radialGradient>
    <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
      <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
    </linearGradient>
  </defs>
);

function Frame({ id, children, size = 64, className = '', animated = true }: MarkProps & { id: string; children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      style={animated ? { animation: 'float-slow 5s ease-in-out infinite' } : undefined}
      role="img"
      aria-hidden
    >
      {children}
      <circle cx="32" cy="30" r="30" fill={`url(#${id}-glow)`} />
    </svg>
  );
}

/* ---------------- MINES : plaque d'acier hexagonale + gemme ---------------- */
function Mines(props: MarkProps) {
  const id = 'mk-mines';
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#7ee7ff', '#1479a8')}
      <path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill={`url(#${id}-body)`} />
      <path d="M32 3 57 17.5v29L32 61 7 46.5v-29z" fill="none" stroke="#35506b" strokeWidth="1.6" />
      <path d="M32 7.5 53 19.6v24.8L32 56.5 11 44.4V19.6z" fill="none" stroke="#1d2b3d" strokeWidth="1" />
      {/* gemme facettée */}
      <path d="M32 17 44 27l-12 20-12-20z" fill={`url(#${id}-metal)`} />
      <path d="M32 17 44 27H20z" fill="#bff0ff" opacity="0.85" />
      <path d="M32 17 26 27h12z" fill="#ffffff" opacity="0.55" />
      <path d="M20 27h24L32 47z" fill="none" stroke="#0b3348" strokeWidth="0.8" opacity="0.5" />
      {/* éclat */}
      <path d="M47 14l1.6 3.9L52.5 19l-3.9 1.6L47 24.5 45.4 20.6 41.5 19l3.9-1.4z" fill="#eaffff" opacity="0.9" />
    </Frame>
  );
}

/* ---------------- PLINKO : bille, plots, entonnoir ---------------- */
function Plinko(props: MarkProps) {
  const id = 'mk-plinko';
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#b49bff', '#5b34d6')}
      <path d="M12 6h40a4 4 0 0 1 4 4v33L32 60 8 43V10a4 4 0 0 1 4-4z" fill={`url(#${id}-body)`} stroke="#3a3560" strokeWidth="1.6" />
      {[
        [32, 22], [24, 31], [40, 31], [16, 40], [32, 40], [48, 40],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.6" fill="#9a8cd8" opacity="0.85" />
      ))}
      <circle cx="32" cy="12.5" r="5.6" fill={`url(#${id}-metal)`} />
      <circle cx="30.2" cy="10.8" r="1.8" fill="#ffffff" opacity="0.8" />
      <path d="M32 18v3.4M28 24l-3 4M36 24l3 4" stroke="#c9b8ff" strokeWidth="1.4" strokeLinecap="round" opacity="0.65" />
      <rect x="14" y="46" width="36" height="6" rx="3" fill="#221d3c" stroke="#4a3f7d" strokeWidth="1.2" />
      <rect x="29" y="46" width="6" height="6" rx="3" fill={`url(#${id}-metal)`} />
    </Frame>
  );
}

/* ---------------- CRASH : courbe qui monte et se brise ---------------- */
function Crash(props: MarkProps) {
  const id = 'mk-crash';
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#ff8d8d', '#c81f30')}
      <circle cx="32" cy="32" r="27" fill={`url(#${id}-body)`} stroke="#5c2330" strokeWidth="1.6" />
      <path d="M12 47c9 0 17-6 22-15" stroke={`url(#${id}-metal)`} strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <path d="M36 28.5 44 14" stroke={`url(#${id}-metal)`} strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.55" />
      {/* rupture */}
      <path d="m34 31 5.5 2.5-3 4.5 6 2" stroke="#ffd9dc" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M44 10.5 46.5 17l6.5 2-6.5 2.4L44 28l-2.4-6.6L35 19l6.6-2z" fill="#ffe3e6" opacity="0.9" />
      <circle cx="12" cy="47" r="3.4" fill={`url(#${id}-metal)`} />
    </Frame>
  );
}

/* ---------------- ROULETTE : secteurs + bille ---------------- */
function Roulette(props: MarkProps) {
  const id = 'mk-roulette';
  const wedges = Array.from({ length: 12 }, (_, i) => i);
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#ffd280', '#a8701f')}
      <circle cx="32" cy="32" r="28" fill={`url(#${id}-body)`} stroke="#6a4c18" strokeWidth="1.8" />
      <g>
        {wedges.map((i) => {
          const a0 = (i * 30 * Math.PI) / 180;
          const a1 = ((i + 1) * 30 * Math.PI) / 180;
          const r = 23;
          const x0 = 32 + r * Math.cos(a0);
          const y0 = 32 + r * Math.sin(a0);
          const x1 = 32 + r * Math.cos(a1);
          const y1 = 32 + r * Math.sin(a1);
          return (
            <path
              key={i}
              d={`M32 32 L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z`}
              fill={i % 2 ? '#8e1220' : '#14161f'}
              stroke="#c8a24a"
              strokeWidth="0.5"
            />
          );
        })}
      </g>
      <circle cx="32" cy="32" r="12" fill={`url(#${id}-metal)`} />
      <circle cx="32" cy="32" r="7" fill="#14161f" stroke="#c8a24a" strokeWidth="1.2" />
      <circle cx="32" cy="12" r="3.2" fill="#ffffff" />
      <circle cx="30.8" cy="10.8" r="1" fill="#ffffff" opacity="0.9" />
    </Frame>
  );
}

/* ---------------- DICE : deux dés isométriques ---------------- */
function Dice(props: MarkProps) {
  const id = 'mk-dice';
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#8ce4ff', '#1f7fb5')}
      <g transform="translate(4 2)">
        <path d="M30 6 46 14v18l-16 8-16-8V14z" fill={`url(#${id}-metal)`} />
        <path d="m30 6 16 8-16 8-16-8z" fill="#dff6ff" />
        <path d="M30 22v18l-16-8V14z" fill="#0f2a3c" opacity="0.65" />
        <circle cx="30" cy="14" r="2" fill="#0d3247" />
        <circle cx="24" cy="11" r="1.5" fill="#0d3247" opacity="0.8" />
        <circle cx="36" cy="11" r="1.5" fill="#0d3247" opacity="0.8" />
        <circle cx="20" cy="24" r="1.8" fill="#9fe4ff" />
        <circle cx="24" cy="31" r="1.8" fill="#9fe4ff" />
        <circle cx="40" cy="24" r="1.8" fill="#7fd0f5" opacity="0.8" />
      </g>
      <path d="M14 44 24 48.5 14 53 4 48.5z" fill={`url(#${id}-metal)`} opacity="0.9" />
      <circle cx="14" cy="48.5" r="1.4" fill="#0d3247" />
    </Frame>
  );
}

/* ---------------- LIMBO : flèche qui perce un plafond ---------------- */
function Limbo(props: MarkProps) {
  const id = 'mk-limbo';
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#cbb3ff', '#5b34d6')}
      <rect x="6" y="6" width="52" height="52" rx="16" fill={`url(#${id}-body)`} stroke="#3c3266" strokeWidth="1.6" />
      <rect x="13" y="20" width="38" height="4" rx="2" fill="#4b3f80" />
      <path d="M32 50V27" stroke={`url(#${id}-metal)`} strokeWidth="5" strokeLinecap="round" />
      <path d="M32 12 43 27H21z" fill={`url(#${id}-metal)`} />
      <path d="M32 12 38 20h-12z" fill="#ffffff" opacity="0.5" />
      <path d="M18 44h6M40 44h6" stroke="#8e7bd6" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
    </Frame>
  );
}

/* ---------------- WHEEL : roue à segments + curseur ---------------- */
function Wheel(props: MarkProps) {
  const id = 'mk-wheel';
  const segments = Array.from({ length: 8 }, (_, i) => i);
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#8cf5c4', '#189a5f')}
      <circle cx="32" cy="34" r="25" fill={`url(#${id}-body)`} stroke="#1f6244" strokeWidth="1.6" />
      {segments.map((i) => {
        const a0 = (i * 45 * Math.PI) / 180;
        const a1 = ((i + 1) * 45 * Math.PI) / 180;
        const r = 21;
        return (
          <path
            key={i}
            d={`M32 34 L${32 + r * Math.cos(a0)} ${34 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${32 + r * Math.cos(a1)} ${34 + r * Math.sin(a1)} Z`}
            fill={i % 2 ? '#0f3d2c' : '#17624a'}
            stroke="#2ee08a"
            strokeWidth="0.6"
            opacity={i % 3 === 0 ? 1 : 0.75}
          />
        );
      })}
      <circle cx="32" cy="34" r="6.5" fill={`url(#${id}-metal)`} />
      <path d="M32 3.5 38 14H26z" fill={`url(#${id}-metal)`} />
    </Frame>
  );
}

/* ---------------- KENO : boules numérotées ---------------- */
function Keno(props: MarkProps) {
  const id = 'mk-keno';
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#ffe6a8', '#b8862a')}
      <rect x="5" y="9" width="54" height="46" rx="12" fill={`url(#${id}-body)`} stroke="#5f4a1c" strokeWidth="1.6" />
      {[[20, 24], [32, 21], [44, 24], [26, 40], [38, 40]].map(([cx, cy], i) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="7.5" fill={i === 1 ? `url(#${id}-metal)` : '#1b2030'} stroke="#c8a24a" strokeWidth="1.2" />
          <circle cx={cx - 2.4} cy={cy - 2.6} r="2" fill="#ffffff" opacity={i === 1 ? 0.75 : 0.25} />
        </g>
      ))}
      <path d="M22 41.5l3 3 6-6.5" stroke="#2ee08a" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Frame>
  );
}

/* ---------------- TOWER : coffre-fort en étages ---------------- */
function Tower(props: MarkProps) {
  const id = 'mk-tower';
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#ffe3a6', '#b0801f')}
      <path d="M14 58V26l18-18 18 18v32z" fill={`url(#${id}-body)`} stroke="#6b5219" strokeWidth="1.6" />
      <path d="M32 8 50 26H14z" fill={`url(#${id}-metal)`} opacity="0.95" />
      <path d="M32 8 41 17H23z" fill="#ffffff" opacity="0.35" />
      {[32, 42, 52].map((y) => (
        <rect key={y} x="19" y={y - 6} width="26" height="8" rx="2.5" fill="#1a1f2e" stroke="#c8a24a" strokeWidth="1" opacity="0.9" />
      ))}
      <circle cx="32" cy="40" r="5.5" fill={`url(#${id}-metal)`} />
      <rect x="31" y="40" width="2" height="6" rx="1" fill="#0f1320" />
      <circle cx="32" cy="39" r="1.8" fill="#0f1320" />
    </Frame>
  );
}

/* ---------------- SLOTS : 7 néon, coffre royal, diamant ---------------- */
function SlotNeon(props: MarkProps) {
  const id = 'mk-neon';
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#ff8fd0', '#c40b6d')}
      <rect x="7" y="8" width="50" height="48" rx="13" fill={`url(#${id}-body)`} stroke="#6d1246" strokeWidth="1.8" />
      <rect x="12" y="13" width="40" height="38" rx="9" fill="none" stroke="#ff2d9b" strokeWidth="1.6" opacity="0.8" />
      <path d="M22 20h22l-11 26h-6l9-20H22z" fill={`url(#${id}-metal)`} />
      <path d="M22 20h22l-2.5 5H22z" fill="#ffd9ee" opacity="0.6" />
      <circle cx="17" cy="48" r="1.6" fill="#ff7ac2" />
      <circle cx="32" cy="50" r="1.6" fill="#ff7ac2" opacity="0.7" />
      <circle cx="47" cy="48" r="1.6" fill="#ff7ac2" />
    </Frame>
  );
}

function SlotRoyal(props: MarkProps) {
  const id = 'mk-royal';
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#ffe7ae', '#a87c1c')}
      <rect x="9" y="18" width="46" height="40" rx="10" fill={`url(#${id}-body)`} stroke="#6b5219" strokeWidth="1.6" />
      <circle cx="32" cy="38" r="13" fill="none" stroke="#c8a24a" strokeWidth="2" />
      <circle cx="32" cy="38" r="6" fill={`url(#${id}-metal)`} />
      <path d="M32 25v-4M32 55v-4M19 38h-4M49 38h4" stroke="#c8a24a" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 15 20 6l6 6 6-9 6 9 6-6 6 9z" fill={`url(#${id}-metal)`} />
      <path d="M14 15h36v3H14z" fill="#8a6a24" />
    </Frame>
  );
}

function SlotDiamond(props: MarkProps) {
  const id = 'mk-diamond';
  return (
    <Frame id={id} {...props}>
      {defsFor(id, '#9fe9ff', '#1180b5')}
      <path d="M16 12h32l10 14-26 30L6 26z" fill={`url(#${id}-body)`} stroke="#1c5f80" strokeWidth="1.6" />
      <path d="M16 12h32l10 14H6z" fill={`url(#${id}-metal)`} />
      <path d="M22 26 32 56 42 26z" fill="#9fe9ff" opacity="0.55" />
      <path d="M16 12 22 26h-8zM48 12l-6 14h10z" fill="#ffffff" opacity="0.35" />
      <path d="M6 26h52" stroke="#0b3f5a" strokeWidth="0.9" opacity="0.7" />
    </Frame>
  );
}

const MARKS: Record<string, (props: MarkProps) => React.ReactElement> = {
  mines: Mines,
  plinko: Plinko,
  crash: Crash,
  'european-roulette': Roulette,
  'american-roulette': Roulette,
  dice: Dice,
  'double-dice': Dice,
  'lucky-dice': Dice,
  'dice-duel': Dice,
  'hi-lo-dice': Dice,
  limbo: Limbo,
  wheel: Wheel,
  'mystery-wheel': Wheel,
  keno: Keno,
  tower: Tower,
  'safe-vault': Tower,
  'neon-fortune': SlotNeon,
  'royal-vault': SlotRoyal,
  'diamond-rush': SlotDiamond,
};

/** Symbole par défaut pour les jeux encore en préparation. */
function Generic({ size = 64, className = '', animated = true }: MarkProps) {
  const id = 'mk-generic';
  return (
    <Frame id={id} size={size} className={className} animated={animated}>
      {defsFor(id, '#c9d3e4', '#5b6480')}
      <rect x="9" y="9" width="46" height="46" rx="14" fill={`url(#${id}-body)`} stroke="#39405a" strokeWidth="1.6" />
      <path d="M32 18 44 32 32 46 20 32z" fill={`url(#${id}-metal)`} opacity="0.9" />
      <path d="M32 18 38 25h-12z" fill="#ffffff" opacity="0.35" />
    </Frame>
  );
}

export function GameMark({ id, ...props }: MarkProps & { id: string }) {
  const Mark = MARKS[id] ?? Generic;
  return <Mark {...props} />;
}

export const hasMark = (id: string) => id in MARKS;
