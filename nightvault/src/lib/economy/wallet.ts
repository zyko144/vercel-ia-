import type { Prisma, PrismaClient } from '@prisma/client';
import { db } from '@/lib/db';
import { economy, levelFromXp } from './config';

export type TxKind =
  | 'BET' | 'WIN' | 'DAILY' | 'MISSION' | 'LEVEL' | 'ACHIEVEMENT'
  | 'SHOP' | 'JACKPOT' | 'WELCOME' | 'SAFETY_NET' | 'ADMIN';

type Client = PrismaClient | Prisma.TransactionClient;

export class InsufficientFunds extends Error {
  constructor() {
    super('Solde insuffisant');
    this.name = 'InsufficientFunds';
  }
}

/**
 * Seul endroit où un solde bouge. Toujours appelé dans une transaction quand il est lié à une manche.
 * `amount` > 0 = création de NV, < 0 = destruction.
 */
export async function move(
  tx: Client,
  userId: string,
  amount: bigint,
  kind: TxKind,
  ref?: string,
  meta?: Record<string, unknown>,
) {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new Error('Portefeuille introuvable');
  const balance = wallet.balance + amount;
  if (balance < 0n) throw new InsufficientFunds();

  await tx.wallet.update({
    where: { userId },
    data: {
      balance,
      ...(kind === 'BET' ? { totalBet: { increment: -amount } } : {}),
      ...(kind === 'WIN' || kind === 'JACKPOT' ? { totalWon: { increment: amount } } : {}),
    },
  });
  await tx.transaction.create({
    data: { userId, kind, amount, balance, ref, meta: meta ? JSON.stringify(meta) : undefined },
  });
  return balance;
}

/** Récompense simple (hors manche de jeu), avec le multiplicateur d'économie. */
export async function reward(userId: string, amount: number, kind: TxKind, ref?: string) {
  const value = BigInt(Math.round(amount * economy.faucetMultiplier * economy.rewardMultiplier));
  return db.$transaction((tx) => move(tx, userId, value, kind, ref));
}

/** XP gagné en jouant : renvoie les niveaux passés (et crédite la récompense de niveau). */
export async function grantXp(tx: Client, userId: string, xp: number) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { xp: true, level: true } });
  if (!user) return { level: 1, levelsGained: 0 };
  const total = user.xp + xp;
  const { level } = levelFromXp(total);
  const levelsGained = Math.max(0, level - user.level);
  await tx.user.update({ where: { id: userId }, data: { xp: total, level } });
  for (let l = user.level + 1; l <= level; l++) {
    await move(tx, userId, BigInt(economy.levelReward(l)), 'LEVEL', `level-${l}`);
    await tx.notification.create({
      data: { userId, kind: 'LEVEL', title: `Niveau ${l} atteint`, body: `+${economy.levelReward(l).toLocaleString('fr-FR')} NV` },
    });
  }
  return { level, levelsGained };
}

export const formatNV = (value: bigint | number) =>
  `${Number(value).toLocaleString('fr-FR').replace(/ | /g, ' ')} NV`;
