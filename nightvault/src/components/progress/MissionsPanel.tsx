'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/components/session/SessionProvider';
import { audio } from '@/lib/audio/engine';

type Mission = {
  id: string;
  title: string;
  description: string;
  period: string;
  target: number;
  reward: number;
  value: number;
  done: boolean;
  claimed: boolean;
};

export function MissionsPanel() {
  const { me, setBalance } = useSession();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetch('/api/missions', { cache: 'no-store' }).then((response) => response.json());
    setMissions(data.missions ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async (id: string) => {
    setBusy(id);
    audio.ui.click();
    try {
      const response = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ missionId: id }),
      });
      const data = await response.json();
      if (response.ok) {
        setBalance(data.balance);
        audio.win('medium');
        await load();
      } else audio.ui.error();
    } finally {
      setBusy(null);
    }
  };

  const groups = [
    { key: 'DAILY', label: 'Missions du jour', hint: 'Remises à zéro chaque nuit' },
    { key: 'WEEKLY', label: 'Missions de la semaine', hint: 'Remises à zéro le lundi' },
  ];

  if (!me) return <p className="panel p-6 text-sm text-[var(--muted)]">Connecte-toi pour voir tes missions.</p>;

  return (
    <div className="space-y-5">
      <section className="panel p-6">
        <h1 className="display text-2xl">Missions</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Joue, gagne, récupère tes NV. Les missions se cumulent avec les récompenses quotidiennes.</p>
      </section>

      {groups.map((group) => {
        const list = missions.filter((mission) => mission.period === group.key);
        if (!list.length) return null;
        return (
          <section key={group.key} className="space-y-3">
            <div className="flex items-end gap-3">
              <h2 className="display text-sm tracking-[0.2em]">{group.label}</h2>
              <span className="text-xs text-[var(--muted)]">{group.hint}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((mission) => {
                const progress = Math.min(100, (mission.value / mission.target) * 100);
                return (
                  <div key={mission.id} className="panel-2 flex items-center gap-4 p-4">
                    <div className="relative grid h-12 w-12 shrink-0 place-items-center">
                      <svg viewBox="0 0 40 40" className="absolute h-full w-full -rotate-90">
                        <circle cx="20" cy="20" r="17" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
                        <circle
                          cx="20"
                          cy="20"
                          r="17"
                          fill="none"
                          stroke={mission.done ? 'var(--success)' : 'var(--pink)'}
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={`${(progress / 100) * 106.8} 106.8`}
                        />
                      </svg>
                      <span className="num text-[0.62rem] font-bold">{Math.round(progress)}%</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{mission.title}</div>
                      <div className="truncate text-xs text-[var(--muted)]">{mission.description}</div>
                      <div className="num mt-1 text-[0.68rem] text-[var(--dim)]">
                        {mission.value.toLocaleString('fr-FR')} / {mission.target.toLocaleString('fr-FR')}
                      </div>
                    </div>

                    <button
                      className={`btn shrink-0 px-3 py-2 text-xs ${mission.done && !mission.claimed ? 'btn-gold' : ''}`}
                      disabled={!mission.done || mission.claimed || busy === mission.id}
                      onClick={() => claim(mission.id)}
                    >
                      {mission.claimed ? 'Récupéré' : `+${mission.reward.toLocaleString('fr-FR')} NV`}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
