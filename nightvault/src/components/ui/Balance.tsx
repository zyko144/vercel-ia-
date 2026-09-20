'use client';

import { useEffect, useRef, useState } from 'react';

const format = (value: number) => Math.round(value).toLocaleString('fr-FR').replace(/ | /g, ' ');

/**
 * Compteur de NV : la valeur monte progressivement (easeOutExpo) au lieu de sauter,
 * avec un éclat doré et une légère pulsation quand le gain est gros.
 */
export function Counter({
  value,
  duration = 850,
  className = '',
  prefix = '',
  suffix = ' NV',
  celebrate = 0,
}: {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  /** Multiplicateur du dernier gain : au-delà de 5×, l'animation est plus marquée. */
  celebrate?: number;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (value === shown) return;
    const start = performance.now();
    from.current = shown;
    const delta = value - from.current;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - 2 ** (-10 * progress);
      setShown(from.current + delta * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else setShown(value);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const big = celebrate >= 5;
  return (
    <span
      className={`num tabular-nums ${className} ${big ? 'pop' : ''}`}
      style={big ? { textShadow: '0 0 18px rgba(240,211,138,0.65)' } : undefined}
    >
      {prefix}
      {format(shown)}
      {suffix}
    </span>
  );
}

export { format as formatNumber };
