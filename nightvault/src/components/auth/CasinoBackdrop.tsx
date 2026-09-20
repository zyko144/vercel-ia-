'use client';

import { useEffect, useRef } from 'react';

/**
 * Fond de salle de casino : rangées de machines floutées, néons qui respirent,
 * bokeh de lumières qui dérive et poussière dorée. Tout est dessiné (canvas + CSS),
 * donc aucun poids d'image et une profondeur de champ crédible.
 */
export function CasinoBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const ctx = node.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let frame = 0;

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = node.clientWidth;
      height = node.clientHeight;
      node.width = Math.floor(width * ratio);
      node.height = Math.floor(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Bokeh : des lumières de machines, plus ou moins nettes selon leur profondeur
    const COLORS = ['#ff2d9b', '#7b5cff', '#35d0ff', '#f0d38a', '#2ee08a'];
    const lights = Array.from({ length: 42 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 18 + Math.random() * 90,
      depth: Math.random(), // 0 = loin (flou, lent), 1 = proche
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      phase: Math.random() * Math.PI * 2,
      speed: 0.00004 + Math.random() * 0.00012,
    }));

    // Rangées de machines à sous : des blocs sombres avec un écran lumineux
    const machines = Array.from({ length: 16 }, (_, i) => ({
      x: (i % 8) / 8 + (i > 7 ? 0.06 : 0),
      row: i > 7 ? 1 : 0,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      blink: Math.random() * Math.PI * 2,
    }));

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      // sol et perspective
      const floor = ctx.createLinearGradient(0, height * 0.45, 0, height);
      floor.addColorStop(0, 'rgba(10,12,22,0)');
      floor.addColorStop(1, 'rgba(255,45,155,0.16)');
      ctx.fillStyle = floor;
      ctx.fillRect(0, height * 0.45, width, height * 0.55);

      // machines (deux rangées, celle du fond plus petite et plus sombre)
      for (const machine of machines) {
        const far = machine.row === 0;
        const w = far ? width * 0.075 : width * 0.1;
        const h = far ? height * 0.2 : height * 0.29;
        const x = machine.x * width * 1.05 - w / 2;
        const y = far ? height * 0.42 : height * 0.52;
        const blink = 0.55 + 0.45 * Math.sin(time * 0.0012 + machine.blink);

        ctx.fillStyle = far ? 'rgba(18,22,38,0.95)' : 'rgba(12,15,26,0.98)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 10);
        ctx.fill();

        // écran lumineux
        const screen = ctx.createLinearGradient(x, y, x, y + h * 0.55);
        screen.addColorStop(0, `${machine.color}${far ? 'aa' : 'ee'}`);
        screen.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = screen;
        ctx.globalAlpha = blink;
        ctx.beginPath();
        ctx.roundRect(x + w * 0.12, y + h * 0.1, w * 0.76, h * 0.42, 6);
        ctx.fill();

        // liseré néon
        ctx.strokeStyle = machine.color;
        ctx.globalAlpha = blink * (far ? 0.55 : 0.85);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 10);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // bokeh
      for (const light of lights) {
        const drift = reduced ? 0 : Math.sin(time * light.speed + light.phase);
        const x = (light.x + drift * 0.03) * width;
        const y = (light.y + Math.cos(time * light.speed * 0.8 + light.phase) * 0.02) * height;
        const radius = light.r * (0.6 + light.depth * 0.8);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, `${light.color}${light.depth > 0.6 ? 'aa' : '66'}`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reduced) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* la salle, volontairement floue : profondeur de champ */}
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" style={{ filter: 'blur(22px) saturate(160%)', opacity: 1 }} />

      {/* halos lents par-dessus */}
      <div
        className="absolute -inset-1/4"
        style={{
          background:
            'radial-gradient(45% 35% at 20% 25%, rgba(255,45,155,0.18), transparent 60%), radial-gradient(40% 35% at 80% 30%, rgba(123,92,255,0.16), transparent 62%), radial-gradient(50% 40% at 50% 90%, rgba(53,208,255,0.1), transparent 65%)',
          filter: 'blur(20px)',
          animation: 'breathe 18s ease-in-out infinite alternate',
        }}
      />

      {/* poussière dorée qui monte doucement */}
      <div className="absolute inset-0">
        {Array.from({ length: 26 }).map((_, index) => (
          <span
            key={index}
            className="absolute rounded-full"
            style={{
              left: `${(index * 37) % 100}%`,
              bottom: `-${10 + (index % 5) * 6}%`,
              width: 2 + (index % 3),
              height: 2 + (index % 3),
              background: index % 3 === 0 ? 'rgba(240,211,138,0.8)' : 'rgba(255,122,194,0.65)',
              filter: 'blur(0.6px)',
              animation: `dust ${16 + (index % 7) * 3}s linear ${index * 0.6}s infinite`,
              opacity: 0.55,
            }}
          />
        ))}
      </div>

      {/* vignette + voile sombre pour garder le texte lisible */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(85% 75% at 50% 45%, rgba(6,7,12,0.05), rgba(3,4,10,0.72) 85%)' }}
      />

      <style jsx>{`
        @keyframes dust {
          0% {
            transform: translateY(0) translateX(0);
            opacity: 0;
          }
          12% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(-115vh) translateX(28px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
