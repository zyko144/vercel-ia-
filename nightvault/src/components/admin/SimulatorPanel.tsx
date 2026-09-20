'use client';

import { useState } from 'react';
import type { SimulationResult } from '@/lib/economy/simulator';

const nv = (value: number) => `${Math.round(value).toLocaleString('fr-FR')} NV`;

/** Simulateur : fait vivre des joueurs virtuels avec les vrais moteurs de jeu. */
export function SimulatorPanel() {
  const [players, setPlayers] = useState(1_000);
  const [days, setDays] = useState(30);
  const [faucet, setFaucet] = useState(1);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ players, days, faucetMultiplier: faucet }),
      });
      setResult(await response.json());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="panel flex flex-wrap items-end gap-4 p-5">
        <Field label="Joueurs">
          <select value={players} onChange={(event) => setPlayers(Number(event.target.value))} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
            {[100, 1_000, 10_000, 100_000].map((value) => (
              <option key={value} value={value}>
                {value.toLocaleString('fr-FR')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Durée">
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
            {[1, 7, 30, 90].map((value) => (
              <option key={value} value={value}>
                {value} jour{value > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Multiplicateur de faucets">
          <input
            type="number"
            step="0.1"
            min={0}
            max={5}
            value={faucet}
            onChange={(event) => setFaucet(Number(event.target.value))}
            className="num w-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
        </Field>
        <button className="btn btn-primary px-6 py-2.5" onClick={run} disabled={busy}>
          {busy ? 'Simulation…' : 'Lancer la simulation'}
        </button>
        <p className="w-full text-xs text-[var(--muted)]">
          La simulation rejoue les vrais moteurs de jeu : 100 000 joueurs sur 90 jours peut prendre une minute.
        </p>
      </section>

      {result && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card label="Masse monétaire finale" value={nv(result.supply)} accent="var(--gold-bright)" />
            <Card label="Solde moyen" value={nv(result.average)} />
            <Card label="Solde médian" value={nv(result.median)} />
            <Card
              label="Inflation par jour"
              value={`${(result.inflationPerDay * 100).toFixed(2)} %`}
              accent={Math.abs(result.inflationPerDay) < 0.03 ? 'var(--success)' : 'var(--danger)'}
            />
            <Card label="NV créés (faucets)" value={nv(result.faucets)} accent="var(--success)" />
            <Card label="NV détruits (sinks)" value={nv(result.sinks)} accent="var(--danger)" />
            <Card label="Total misé" value={nv(result.wagered)} />
            <Card label="Joueurs à sec" value={`${(result.brokeShare * 100).toFixed(1)} %`} accent={result.brokeShare > 0.1 ? 'var(--danger)' : undefined} />
          </section>

          <section className="panel-2 p-5">
            <h2 className="display mb-3 text-sm tracking-[0.2em]">Évolution de la masse monétaire</h2>
            <div className="flex h-44 items-end gap-0.5">
              {result.timeline.map((point) => {
                const max = Math.max(...result.timeline.map((entry) => entry.supply), 1);
                return (
                  <div
                    key={point.day}
                    className="flex-1 rounded-t"
                    style={{ height: `${(point.supply / max) * 100}%`, background: 'linear-gradient(180deg,#f0d38a,#8a6a24)' }}
                    title={`Jour ${point.day} : ${nv(point.supply)}`}
                  />
                );
              })}
            </div>
          </section>

          <section className="panel-2 p-5">
            <h2 className="display mb-3 text-sm tracking-[0.2em]">Répartition des richesses (déciles)</h2>
            <div className="flex h-32 items-end gap-1.5">
              {result.deciles.map((value, index) => {
                const max = Math.max(...result.deciles, 1);
                return (
                  <div key={index} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t" style={{ height: `${Math.max(2, (value / max) * 100)}%`, background: 'linear-gradient(180deg,#7b5cff,#35204f)' }} title={nv(value)} />
                    <span className="text-[0.55rem] text-[var(--dim)]">D{index + 1}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6rem] uppercase tracking-widest text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="panel-2 p-4">
      <div className="text-[0.6rem] uppercase tracking-widest text-[var(--muted)]">{label}</div>
      <div className="num mt-1 text-lg font-semibold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}
