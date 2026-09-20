'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

type Props = {
  size?: number;
  withWordmark?: boolean;
  tagline?: boolean;
  className?: string;
};

/**
 * Logo CASINHO animé : halo qui respire, reflet qui balaie le C, et inclinaison 3D
 * qui suit la souris. Le monogramme reste lisible à 24 px (favicon, entête mobile).
 */
export function Logo({ size = 44, withWordmark = true, tagline = false, className = '' }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const follow = (event: React.MouseEvent) => {
    const box = holder.current?.getBoundingClientRect();
    if (!box) return;
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    setTilt({ x: y * -18, y: x * 22 });
  };

  return (
    <div
      className={`flex items-center gap-3 select-none ${className}`}
      onMouseMove={follow}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      ref={holder}
    >
      <div
        className="relative shrink-0"
        style={{
          width: size,
          height: size,
          perspective: 500,
        }}
      >
        {/* halo */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full blur-xl"
          style={{
            background: 'radial-gradient(circle, rgba(255,45,155,0.75), transparent 68%)',
            animation: 'glow-pulse 3.4s ease-in-out infinite',
          }}
        />
        {/* anneau qui tourne lentement */}
        <span
          aria-hidden
          className="absolute -inset-[14%] rounded-full opacity-70"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0 62%, rgba(255,122,194,0.55) 74%, transparent 86%)',
            animation: 'spin 9s linear infinite',
            maskImage: 'radial-gradient(circle, transparent 58%, #000 60%)',
            WebkitMaskImage: 'radial-gradient(circle, transparent 58%, #000 60%)',
          }}
        />
        <div
          className="relative h-full w-full transition-transform duration-200 ease-out"
          style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transformStyle: 'preserve-3d' }}
        >
          <Image
            src="/brand/casinho-c.png"
            alt="CASINHO"
            width={size * 2}
            height={size * 2}
            priority
            className="h-full w-full object-contain drop-shadow-[0_6px_18px_rgba(255,45,155,0.45)]"
          />
          {/* reflet qui balaie */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{
              maskImage: 'url(/brand/casinho-c.png)',
              WebkitMaskImage: 'url(/brand/casinho-c.png)',
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
              maskPosition: 'center',
              WebkitMaskPosition: 'center',
            }}
          >
            <span
              className="absolute top-[-60%] h-[220%] w-[45%] rotate-[14deg]"
              style={{
                background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.85), transparent)',
                animation: 'sweep 4.2s ease-in-out infinite',
              }}
            />
          </span>
        </div>
      </div>

      {withWordmark && (
        <div className="leading-none">
          <div
            className="display pink-text font-semibold"
            style={{ fontSize: size * 0.46, letterSpacing: '0.16em' }}
          >
            CASINHO
          </div>
          {tagline && (
            <div className="mt-1 text-[0.6rem] uppercase tracking-[0.42em]" style={{ color: 'var(--dim)' }}>
              play · win · rise
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
