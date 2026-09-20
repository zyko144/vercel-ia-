'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/session/SessionProvider';
import { audio } from '@/lib/audio/engine';

type Item = { id: string; name: string; kind: string; price: number; rarity: string; owned: boolean; equipped: boolean; data: Record<string, string> };

const RARITY: Record<string, { label: string; color: string }> = {
  common: { label: 'Commun', color: '#8a93a8' },
  rare: { label: 'Rare', color: '#35d0ff' },
  epic: { label: 'Épique', color: '#b06bff' },
  legendary: { label: 'Légendaire', color: '#f0d38a' },
};

export function ShopPanel() {
  const { me, setBalance } = useSession();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const data = await fetch('/api/shop', { cache: 'no-store' }).then((response) => response.json());
    setItems(data.items ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const act = async (item: Item) => {
    setBusy(item.id);
    audio.ui.click();
    try {
      const response = await fetch('/api/shop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, action: item.owned ? 'equip' : 'buy' }),
      });
      const data = await response.json();
      if (response.ok) {
        if (typeof data.balance === 'number') setBalance(data.balance);
        audio.win('small');
        await load();
      } else audio.ui.error();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="display text-sm tracking-[0.2em]">Boutique cosmétique</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const rarity = RARITY[item.rarity] ?? RARITY.common;
          const affordable = (me?.balance ?? 0) >= item.price;
          return (
            <div key={item.id} className="panel-2 flex items-center gap-3 p-4">
              <span
                className="h-12 w-12 shrink-0 rounded-xl"
                style={{ background: `linear-gradient(140deg, ${item.data.from ?? rarity.color}, ${item.data.to ?? '#0f131d'})`, border: `1px solid ${rarity.color}55` }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{item.name}</div>
                <div className="text-[0.66rem]" style={{ color: rarity.color }}>
                  {rarity.label}
                </div>
                <div className="num text-xs text-[var(--gold-bright)]">{item.price.toLocaleString('fr-FR')} NV</div>
              </div>
              <button
                className={`btn shrink-0 px-3 py-2 text-xs ${item.equipped ? '' : item.owned ? 'btn-success' : affordable ? 'btn-gold' : ''}`}
                disabled={busy === item.id || item.equipped || (!item.owned && !affordable)}
                onClick={() => act(item)}
              >
                {item.equipped ? 'Équipé' : item.owned ? 'Équiper' : 'Acheter'}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
