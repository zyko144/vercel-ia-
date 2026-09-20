import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { economy } from './config';
import { move } from './wallet';

/** Clé de période : les missions quotidiennes se réinitialisent chaque jour, les hebdo chaque lundi. */
export function periodKey(period: string, date = new Date()) {
  if (period === 'WEEKLY') {
    const monday = new Date(date);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return `W${monday.toISOString().slice(0, 10)}`;
  }
  return date.toISOString().slice(0, 10);
}

type Progress = { rounds: number; wager: number; win: number; gameId: string };

/** Avance les missions en cours après une manche. */
export async function bumpMissions(tx: Prisma.TransactionClient, userId: string, progress: Progress) {
  const missions = await tx.mission.findMany({ where: { enabled: true } });
  for (const mission of missions) {
    const key = periodKey(mission.period);
    let value = 0;
    if (mission.metric === 'ROUNDS') value = progress.rounds;
    else if (mission.metric === 'WAGER') value = progress.wager;
    else if (mission.metric === 'WIN') value = progress.win;
    else if (mission.metric === 'GAMES_EXPLORED') value = 0; // traité séparément (jeux distincts)
    if (value <= 0) continue;

    await tx.missionProgress.upsert({
      where: { userId_missionId_periodKey: { userId, missionId: mission.id, periodKey: key } },
      create: { userId, missionId: mission.id, periodKey: key, value },
      update: { value: { increment: value } },
    });
  }

  // Missions « découvrir des jeux » : on compte les jeux distincts joués sur la période
  const explore = missions.filter((mission) => mission.metric === 'GAMES_EXPLORED');
  if (explore.length && progress.rounds > 0) {
    for (const mission of explore) {
      const key = periodKey(mission.period);
      const since = mission.period === 'WEEKLY' ? new Date(Date.now() - 7 * 864e5) : new Date(new Date().setHours(0, 0, 0, 0));
      const played = await tx.gameRound.findMany({
        where: { userId, createdAt: { gte: since } },
        distinct: ['gameId'],
        select: { gameId: true },
      });
      await tx.missionProgress.upsert({
        where: { userId_missionId_periodKey: { userId, missionId: mission.id, periodKey: key } },
        create: { userId, missionId: mission.id, periodKey: key, value: played.length },
        update: { value: played.length },
      });
    }
  }
}

/** Missions du joueur pour la période en cours, avec leur état. */
export async function missionsFor(userId: string) {
  const missions = await db.mission.findMany({ where: { enabled: true }, orderBy: { period: 'asc' } });
  const keys = missions.map((mission) => periodKey(mission.period));
  const progress = await db.missionProgress.findMany({
    where: { userId, missionId: { in: missions.map((m) => m.id) }, periodKey: { in: keys } },
  });
  return missions.map((mission) => {
    const key = periodKey(mission.period);
    const found = progress.find((p) => p.missionId === mission.id && p.periodKey === key);
    const value = Math.min(found?.value ?? 0, mission.target);
    return {
      id: mission.id,
      title: mission.title,
      description: mission.description,
      period: mission.period,
      target: mission.target,
      reward: Math.round(mission.reward * economy.rewardMultiplier),
      value,
      done: value >= mission.target,
      claimed: Boolean(found?.claimedAt),
    };
  });
}

export async function claimMission(userId: string, missionId: string) {
  const mission = await db.mission.findUnique({ where: { id: missionId } });
  if (!mission) return { error: 'Mission inconnue.' };
  const key = periodKey(mission.period);
  const progress = await db.missionProgress.findUnique({
    where: { userId_missionId_periodKey: { userId, missionId, periodKey: key } },
  });
  if (!progress || progress.value < mission.target) return { error: 'Mission pas encore terminée.' };
  if (progress.claimedAt) return { error: 'Récompense déjà récupérée.' };

  const amount = Math.round(mission.reward * economy.rewardMultiplier * economy.faucetMultiplier);
  const balance = await db.$transaction(async (tx) => {
    await tx.missionProgress.update({ where: { id: progress.id }, data: { claimedAt: new Date() } });
    return move(tx, userId, BigInt(amount), 'MISSION', mission.id);
  });
  return { amount, balance };
}
