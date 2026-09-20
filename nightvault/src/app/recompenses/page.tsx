import { DailyStrip } from '@/components/lobby/DailyStrip';
import { ShopPanel } from '@/components/progress/ShopPanel';

export const metadata = { title: 'Récompenses' };

export default function RewardsPage() {
  return (
    <div className="space-y-5">
      <section className="panel p-6">
        <h1 className="display text-2xl">Récompenses</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Connexion quotidienne, boutique de cosmétiques : tout se paie en NV Coins, et rien ne s’achète avec de l’argent réel.
        </p>
      </section>
      <DailyStrip />
      <ShopPanel />
    </div>
  );
}
