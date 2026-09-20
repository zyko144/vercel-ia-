'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BetControls } from './BetControls';
import { GameShell } from './GameShell';
import { useInstantGame } from './useGame';
import { audio } from '@/lib/audio/engine';

type Meta = { id: string; name: string; tagline: string; accent: string; rtp: number; volatility: string; maxWin: number };
type Result = { path: ('L' | 'R')[]; slot: number; rows: number; risk: string; table: number[] };

type Ball = { x: number; y: number; vx: number; vy: number; row: number; path: ('L' | 'R')[]; slot: number; done: boolean; multiplier: number };

const GRAVITY = 1600; // px/s²
const BOUNCE = 0.42;

/**
 * PLINKO — la bille tombe vraiment (physique simple), mais son chemin est celui
 * décidé par le serveur : à chaque rangée elle part du côté indiqué par le résultat.
 */
export function PlinkoGame({ meta }: { meta: Meta }) {
  const { play, busy, error } = useInstantGame<Result>('plinko');
  const [bet, setBet] = useState(1_000);
  const [rows, setRows] = useState<8 | 12 | 16>(12);
  const [risk, setRisk] = useState<'faible' | 'moyen' | 'eleve'>('moyen');
  const [table, setTable] = useState<number[]>([]);
  const [hits, setHits] = useState<{ slot: number; multiplier: number; at: number }[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const balls = useRef<Ball[]>([]);
  const raf = useRef(0);
  const last = useRef(0);

  // Table d'affichage (identique à celle du serveur, purement visuelle ici)
  useEffect(() => {
    const TABLES: Record<string, Record<number, number[]>> = {
      faible: {
        8: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
        12: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
        16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
      },
      moyen: {
        8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
        12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
        16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
      },
      eleve: {
        8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
        12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
        16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
      },
    };
    setTable(TABLES[risk][rows]);
  }, [risk, rows]);

  const geometry = useCallback(
    (width: number, height: number) => {
      const top = 34;
      const bottom = height - 54;
      const gapY = (bottom - top) / rows;
      const gapX = Math.min(gapY * 1.05, (width * 0.9) / (rows + 1));
      return { top, bottom, gapX, gapY, centerX: width / 2 };
    },
    [rows],
  );

  const render = useCallback(() => {
    const node = canvas.current;
    const ctx = node?.getContext('2d');
    if (!node || !ctx) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = node.clientWidth;
    const height = node.clientHeight;
    if (node.width !== width * ratio) {
      node.width = width * ratio;
      node.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    ctx.clearRect(0, 0, width, height);
    const { top, gapX, gapY, centerX } = geometry(width, height);

    // plots
    for (let row = 0; row < rows; row++) {
      const count = row + 2;
      for (let index = 0; index < count; index++) {
        const x = centerX + (index - (count - 1) / 2) * gapX;
        const y = top + row * gapY;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 7);
        glow.addColorStop(0, 'rgba(255,255,255,0.9)');
        glow.addColorStop(1, 'rgba(123,92,255,0.15)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // billes
    for (const ball of balls.current) {
      const gradient = ctx.createRadialGradient(ball.x - 2, ball.y - 3, 1, ball.x, ball.y, 9);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.5, '#ff7ac2');
      gradient.addColorStop(1, '#b3005f');
      ctx.fillStyle = gradient;
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#ff2d9b';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [geometry, rows]);

  // Boucle physique
  useEffect(() => {
    const step = (now: number) => {
      const delta = Math.min(0.032, (now - (last.current || now)) / 1000);
      last.current = now;
      const node = canvas.current;
      if (node) {
        const { top, gapX, gapY, centerX, bottom } = geometry(node.clientWidth, node.clientHeight);
        for (const ball of balls.current) {
          if (ball.done) continue;
          ball.vy += GRAVITY * delta;
          ball.x += ball.vx * delta;
          ball.y += ball.vy * delta;

          const nextRowY = top + ball.row * gapY;
          if (ball.y >= nextRowY && ball.row < ball.path.length) {
            // rebond sur la rangée : la direction vient du serveur
            const direction = ball.path[ball.row] === 'R' ? 1 : -1;
            ball.vx = direction * (gapX / (gapY / 260)) * 0.0042 * 60;
            ball.vy *= BOUNCE;
            ball.y = nextRowY;
            audio.plinko.peg(ball.row);
            ball.row += 1;
          }
          if (ball.y >= bottom) {
            ball.done = true;
            const slots = rows + 1;
            const targetX = centerX + (ball.slot - (slots - 1) / 2) * gapX;
            ball.x = targetX;
            ball.y = bottom;
            audio.plinko.land(ball.multiplier);
            setHits((values) => [{ slot: ball.slot, multiplier: ball.multiplier, at: Date.now() }, ...values].slice(0, 10));
          }
        }
        balls.current = balls.current.filter((ball) => !ball.done || Date.now() - 0 < Number.MAX_SAFE_INTEGER);
        if (balls.current.length > 12) balls.current = balls.current.slice(-12);
      }
      render();
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [geometry, render, rows]);

  const drop = async () => {
    const data = await play(bet, { rows, risk });
    if (!data) return;
    audio.plinko.drop();
    const node = canvas.current;
    if (!node) return;
    const { centerX } = geometry(node.clientWidth, node.clientHeight);
    balls.current.push({
      x: centerX,
      y: 6,
      vx: 0,
      vy: 0,
      row: 0,
      path: data.result.path,
      slot: data.result.slot,
      done: false,
      multiplier: data.multiplier,
    });
  };

  return (
    <GameShell
      {...meta}
      rules={
        <>
          <p>La bille tombe dans la pyramide et atterrit dans une case multiplicatrice.</p>
          <p>Plus la case est sur les bords, plus elle paie — et plus elle est rare (loi binomiale).</p>
          <p>Le chemin affiché est exactement celui calculé par le serveur.</p>
        </>
      }
      side={
        <BetControls bet={bet} setBet={setBet} disabled={busy} action="Lâcher la bille" onAction={drop}>
          <div>
            <div className="mb-1.5 text-[0.62rem] uppercase tracking-[0.28em] text-[var(--muted)]">Rangées</div>
            <div className="grid grid-cols-3 gap-1.5">
              {([8, 12, 16] as const).map((value) => (
                <button
                  key={value}
                  className="btn py-1.5 text-xs"
                  onClick={() => {
                    setRows(value);
                    audio.ui.click();
                  }}
                  style={rows === value ? { borderColor: meta.accent, color: meta.accent } : undefined}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[0.62rem] uppercase tracking-[0.28em] text-[var(--muted)]">Risque</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['faible', 'moyen', 'eleve'] as const).map((value) => (
                <button
                  key={value}
                  className="btn py-1.5 text-[0.68rem]"
                  onClick={() => {
                    setRisk(value);
                    audio.ui.click();
                  }}
                  style={risk === value ? { borderColor: meta.accent, color: meta.accent } : undefined}
                >
                  {value === 'eleve' ? 'élevé' : value}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        </BetControls>
      }
    >
      <div className="flex h-full flex-col">
        <canvas ref={canvas} className="min-h-[320px] w-full flex-1" />
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {table.map((multiplier, index) => {
            const recent = hits.find((hit) => hit.slot === index && Date.now() - hit.at < 1400);
            const heat = Math.min(1, multiplier / 30);
            return (
              <div
                key={index}
                className="num flex-1 rounded-lg px-1 py-2 text-center text-[0.62rem] font-semibold transition-all"
                style={{
                  background: recent
                    ? 'linear-gradient(180deg, #ffe9b0, #c8a24a)'
                    : `linear-gradient(180deg, rgba(255,45,155,${0.12 + heat * 0.5}), rgba(20,24,39,0.9))`,
                  color: recent ? '#22180a' : '#eef1f8',
                  transform: recent ? 'translateY(-4px) scale(1.06)' : undefined,
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                {multiplier}×
              </div>
            );
          })}
        </div>
      </div>
    </GameShell>
  );
}
