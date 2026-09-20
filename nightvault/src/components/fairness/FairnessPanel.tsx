'use client';

import { useCallback, useEffect, useState } from 'react';
import { audio } from '@/lib/audio/engine';

type Seeds = {
  active: { serverSeedHash: string; clientSeed: string; nonce: number } | null;
  revealed: { serverSeed: string; serverSeedHash: string; clientSeed: string; nonce: number }[];
};

/** Page d'équité : hash publié à l'avance, seeds révélés, et vérificateur pour rejouer une manche. */
export function FairnessPanel() {
  const [seeds, setSeeds] = useState<Seeds>({ active: null, revealed: [] });
  const [newClientSeed, setNewClientSeed] = useState('');
  const [form, setForm] = useState({ serverSeed: '', clientSeed: '', nonce: 1, gameId: 'dice' });
  const [check, setCheck] = useState<{ serverSeedHash: string; values: number[]; replay: unknown } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await fetch('/api/fairness', { cache: 'no-store' }).then((response) => response.json());
    setSeeds(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rotate = async () => {
    setBusy(true);
    audio.ui.click();
    try {
      const response = await fetch('/api/fairness', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientSeed: newClientSeed }),
      });
      const data = await response.json();
      if (response.ok) {
        setForm((current) => ({ ...current, serverSeed: data.revealed.serverSeed, clientSeed: data.revealed.clientSeed, nonce: data.revealed.nonce }));
        setNewClientSeed('');
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/fairness/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, options: { target: 50, direction: 'over' } }),
      });
      setCheck(await response.json());
      audio.ui.toggle();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="panel p-6">
        <h1 className="display text-2xl">Équité vérifiable</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Avant chaque manche, le casino s’engage sur un <strong>server seed</strong> secret en publiant son
          empreinte (SHA-256). Le résultat vient de{' '}
          <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[0.75rem]">HMAC-SHA256(serverSeed, clientSeed:nonce:curseur)</code>.
          Quand tu changes de seed, l’ancien server seed est révélé : tu peux alors recalculer toutes tes
          manches et vérifier que rien n’a été modifié après coup.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Seeds actifs */}
        <section className="panel-2 space-y-3 p-5">
          <h2 className="display text-sm tracking-[0.2em]">Tes seeds actuels</h2>
          {seeds.active ? (
            <>
              <Field label="Empreinte du server seed (publiée avant de jouer)" value={seeds.active.serverSeedHash} />
              <Field label="Client seed" value={seeds.active.clientSeed} />
              <Field label="Nonce (nombre de manches jouées)" value={String(seeds.active.nonce)} />
              <div className="flex gap-2 pt-1">
                <input
                  value={newClientSeed}
                  onChange={(event) => setNewClientSeed(event.target.value)}
                  placeholder="Nouveau client seed (optionnel)"
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--pink)]"
                />
                <button className="btn btn-primary px-4 text-sm" onClick={rotate} disabled={busy}>
                  Changer et révéler
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Connecte-toi pour voir tes seeds.</p>
          )}
        </section>

        {/* Vérificateur */}
        <section className="panel-2 space-y-3 p-5">
          <h2 className="display text-sm tracking-[0.2em]">Vérifier une manche</h2>
          <input
            value={form.serverSeed}
            onChange={(event) => setForm({ ...form, serverSeed: event.target.value })}
            placeholder="Server seed révélé"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--pink)]"
          />
          <input
            value={form.clientSeed}
            onChange={(event) => setForm({ ...form, clientSeed: event.target.value })}
            placeholder="Client seed"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--pink)]"
          />
          <div className="flex gap-2">
            <input
              type="number"
              value={form.nonce}
              onChange={(event) => setForm({ ...form, nonce: Number(event.target.value) })}
              placeholder="Nonce"
              className="num w-28 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
            <button className="btn btn-gold flex-1" onClick={verify} disabled={busy}>
              Recalculer
            </button>
          </div>

          {check && (
            <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
              <Field label="Empreinte recalculée" value={check.serverSeedHash} />
              <div>
                <div className="mb-1 text-[0.6rem] uppercase tracking-widest text-[var(--muted)]">Nombres tirés</div>
                <div className="num flex flex-wrap gap-1.5">
                  {check.values.map((value, index) => (
                    <span key={index} className="rounded-md bg-[var(--surface-2)] px-2 py-0.5">
                      {value.toFixed(6)}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-[var(--dim)]">
                Si cette empreinte correspond à celle publiée avant ta manche, le server seed n’a pas été changé.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Seeds révélés */}
      {seeds.revealed.length > 0 && (
        <section className="panel-2 p-5">
          <h2 className="display mb-3 text-sm tracking-[0.2em]">Seeds révélés</h2>
          <div className="space-y-2">
            {seeds.revealed.map((seed) => (
              <button
                key={seed.serverSeedHash}
                onClick={() => setForm({ ...form, serverSeed: seed.serverSeed, clientSeed: seed.clientSeed, nonce: seed.nonce })}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left font-mono text-[0.68rem] transition-colors hover:border-[var(--pink)]"
              >
                <div className="truncate text-[var(--muted)]">server : {seed.serverSeed}</div>
                <div className="truncate text-[var(--dim)]">client : {seed.clientSeed} · {seed.nonce} manches</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[0.6rem] uppercase tracking-widest text-[var(--muted)]">{label}</div>
      <div className="break-all rounded-lg bg-[var(--surface)] px-3 py-2 font-mono text-[0.7rem]">{value}</div>
    </div>
  );
}
