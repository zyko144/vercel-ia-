import { economySnapshot } from '@/lib/economy/analytics';
import { economy } from '@/lib/economy/config';

export const dynamic = 'force-dynamic';

const nv = (value: number) => `${Math.round(value).toLocaleString('fr-FR')} NV`;

export default async function AdminDashboard() {
  const data = await economySnapshot();
  const net = data.today.in - data.today.out;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Monnaie en circulation" value={nv(data.supply)} accent="var(--gold-bright)" />
        <Card label="Joueurs" value={data.players.toLocaleString('fr-FR')} />
        <Card label="Solde moyen" value={nv(data.average)} />
        <Card label="Solde médian" value={nv(data.median)} />
        <Card label="Créé aujourd’hui" value={nv(data.today.in)} accent="var(--success)" />
        <Card label="Détruit aujourd’hui" value={nv(data.today.out)} accent="var(--danger)" />
        <Card label="Flux net du jour" value={nv(net)} accent={net >= 0 ? 'var(--success)' : 'var(--danger)'} />
        <Card label="Avantage maison réel" value={`${(data.houseEdge * 100).toFixed(2)} %`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel-2 p-5">
          <h2 className="display mb-3 text-sm tracking-[0.2em]">Distribution des soldes</h2>
          <div className="flex h-40 items-end gap-1.5">
            {data.deciles.map((value, index) => {
              const max = Math.max(...data.deciles, 1);
              return (
                <div key={index} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${Math.max(2, (value / max) * 100)}%`, background: 'linear-gradient(180deg,#ff62b4,#b3005f)' }}
                    title={nv(value)}
                  />
                  <span className="text-[0.55rem] text-[var(--dim)]">D{index + 1}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            {data.broke} joueur(s) sous 500 NV — le filet de sécurité leur redonne {economy.safetyNet.amount.toLocaleString('fr-FR')} NV par jour.
          </p>
        </section>

        <section className="panel-2 p-5">
          <h2 className="display mb-3 text-sm tracking-[0.2em]">Jackpots</h2>
          <div className="space-y-2">
            {data.jackpots.map((jackpot) => (
              <div key={jackpot.id} className="flex items-center justify-between rounded-lg bg-[var(--surface)] px-4 py-3">
                <span className="text-sm">{jackpot.name}</span>
                <span className="num font-semibold text-[var(--gold-bright)]">{nv(jackpot.amount)}</span>
              </div>
            ))}
          </div>

          <h2 className="display mb-2 mt-5 text-sm tracking-[0.2em]">Réglages actuels</h2>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            {[
              ['Multiplicateur faucets', economy.faucetMultiplier],
              ['Multiplicateur récompenses', economy.rewardMultiplier],
              ['Contribution jackpot', `${(economy.jackpotContribution * 100).toFixed(1)} %`],
              ['Inflation cible', `${(economy.inflationTarget * 100).toFixed(0)} % / jour`],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-[var(--surface)] px-3 py-2">
                <dt className="text-[var(--muted)]">{label}</dt>
                <dd className="num font-semibold">{String(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[0.68rem] text-[var(--dim)]">
            Ces valeurs vivent dans <code>src/lib/economy/config.ts</code>. Le pilotage depuis l’interface arrive
            avec la persistance des réglages.
          </p>
        </section>
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="panel-2 p-4">
      <div className="text-[0.6rem] uppercase tracking-widest text-[var(--muted)]">{label}</div>
      <div className="num mt-1 text-xl font-semibold" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}
