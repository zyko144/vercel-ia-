import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { economy } from '@/lib/economy/config';
import { grantXp, InsufficientFunds, move } from '@/lib/economy/wallet';
import { hashSeed, newClientSeed, newServerSeed, rng } from '@/lib/fairness';
import { bumpMissions } from '@/lib/economy/missions';
import { getGame } from './registry';

export class GameError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Seeds actifs du joueur (créés au besoin). */
export async function activeSeed(userId: string) {
  const existing = await db.fairnessSeed.findFirst({ where: { userId, active: true } });
  if (existing) return existing;
  const serverSeed = newServerSeed();
  return db.fairnessSeed.create({
    data: { userId, serverSeed, serverSeedHash: hashSeed(serverSeed), clientSeed: newClientSeed() },
  });
}

function checkBet(gameId: string, bet: number, game: { meta: { minBet?: number; maxBet?: number } }) {
  const min = game.meta.minBet ?? economy.bet.min;
  const max = game.meta.maxBet ?? economy.bet.max;
  if (!Number.isInteger(bet)) throw new GameError('La mise doit être un nombre entier de NV.');
  if (bet < min) throw new GameError(`Mise minimum : ${min.toLocaleString('fr-FR')} NV.`);
  if (bet > max) throw new GameError(`Mise maximum : ${max.toLocaleString('fr-FR')} NV.`);
  if (!gameId) throw new GameError('Jeu inconnu.', 404);
}

/** Contribution aux jackpots + tirage (indépendant du provably fair du jeu). */
async function jackpots(tx: Prisma.TransactionClient, userId: string, gameId: string, bet: number) {
  const pots = await tx.jackpot.findMany();
  const share = Math.floor((bet * economy.jackpotContribution) / Math.max(1, pots.length));
  let won: { id: string; name: string; amount: bigint } | null = null;

  for (const pot of pots) {
    if (won) {
      await tx.jackpot.update({ where: { id: pot.id }, data: { amount: { increment: BigInt(share) } } });
      continue;
    }
    // probabilité proportionnelle à la mise : 1 chance sur (odds / mise)
    const chance = Math.min(0.01, bet / pot.odds);
    if (randomInt(0, 1_000_000) / 1_000_000 < chance) {
      const amount = pot.amount + BigInt(share);
      won = { id: pot.id, name: pot.name, amount };
      await tx.jackpot.update({ where: { id: pot.id }, data: { amount: pot.seed } });
      await tx.jackpotWin.create({ data: { jackpotId: pot.id, userId, amount, gameId } });
      await move(tx, userId, amount, 'JACKPOT', `jackpot-${pot.id}`, { gameId });
      await tx.notification.create({
        data: { userId, kind: 'JACKPOT', title: `${pot.name} remporté !`, body: `${amount.toLocaleString('fr-FR')} NV` },
      });
    } else {
      await tx.jackpot.update({ where: { id: pot.id }, data: { amount: { increment: BigInt(share) } } });
    }
  }
  return won;
}

type PlayInput = {
  userId: string;
  gameId: string;
  bet: number;
  options: unknown;
  idempotencyKey: string;
};

/** Manche complète en une requête (slots, dice, plinko, roulette…). */
export async function playInstant({ userId, gameId, bet, options, idempotencyKey }: PlayInput) {
  const game = getGame(gameId);
  if (!game || game.kind !== 'instant') throw new GameError('Jeu introuvable.', 404);
  checkBet(gameId, bet, game);

  const existing = await db.gameRound.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
  if (existing) {
    const wallet = await db.wallet.findUnique({ where: { userId } });
    return {
      replay: true,
      round: existing,
      result: JSON.parse(existing.resultJson),
      balance: wallet?.balance ?? 0n,
      multiplier: existing.multiplier,
      payout: Number(existing.payout),
      jackpot: null,
    };
  }

  const parsed = game.options.safeParse(options);
  if (!parsed.success) throw new GameError('Options de jeu invalides.');

  const seed = await activeSeed(userId);
  const nonce = seed.nonce + 1;
  const random = rng(seed.serverSeed, seed.clientSeed, nonce);
  const { multiplier, result } = game.play(random, parsed.data as never);
  const payout = Math.floor(bet * multiplier);

  try {
    return await db.$transaction(async (tx) => {
      await move(tx, userId, BigInt(-bet), 'BET', idempotencyKey, { gameId });
      const jackpot = await jackpots(tx, userId, gameId, bet);
      if (payout > 0) await move(tx, userId, BigInt(payout), 'WIN', idempotencyKey, { gameId, multiplier });

      const round = await tx.gameRound.create({
        data: {
          userId,
          gameId,
          bet: BigInt(bet),
          payout: BigInt(payout),
          multiplier,
          state: 'SETTLED',
          resultJson: JSON.stringify({ options: parsed.data, result }),
          serverSeedHash: seed.serverSeedHash,
          clientSeed: seed.clientSeed,
          nonce,
          idempotencyKey,
          settledAt: new Date(),
        },
      });
      await tx.fairnessSeed.update({ where: { id: seed.id }, data: { nonce } });
      await tx.game.update({ where: { id: gameId }, data: { playCount: { increment: 1 } } }).catch(() => {});
      await grantXp(tx, userId, economy.xpPerBet(bet));
      await bumpMissions(tx, userId, { rounds: 1, wager: bet, win: payout, gameId });

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      return { replay: false, round, result, multiplier, payout, balance: wallet?.balance ?? 0n, jackpot };
    });
  } catch (error) {
    if (error instanceof InsufficientFunds) throw new GameError('Solde insuffisant.', 402);
    throw error;
  }
}

/** Ouvre une manche à étapes (mines, crash, tower) : la mise est débitée tout de suite. */
export async function openRound({ userId, gameId, bet, options, idempotencyKey }: PlayInput) {
  const game = getGame(gameId);
  if (!game || game.kind !== 'stateful') throw new GameError('Jeu introuvable.', 404);
  checkBet(gameId, bet, game);

  const open = await db.gameRound.findFirst({ where: { userId, gameId, state: 'OPEN' } });
  if (open) throw new GameError('Tu as déjà une partie en cours sur ce jeu.', 409);

  const parsed = game.options.safeParse(options);
  if (!parsed.success) throw new GameError('Options de jeu invalides.');

  const seed = await activeSeed(userId);
  const nonce = seed.nonce + 1;
  const state = game.open(rng(seed.serverSeed, seed.clientSeed, nonce), parsed.data as never);

  try {
    return await db.$transaction(async (tx) => {
      await move(tx, userId, BigInt(-bet), 'BET', idempotencyKey, { gameId });
      const jackpot = await jackpots(tx, userId, gameId, bet);
      const round = await tx.gameRound.create({
        data: {
          userId,
          gameId,
          bet: BigInt(bet),
          payout: 0n,
          multiplier: 0,
          state: 'OPEN',
          resultJson: JSON.stringify({ options: parsed.data, state }),
          serverSeedHash: seed.serverSeedHash,
          clientSeed: seed.clientSeed,
          nonce,
          idempotencyKey,
        },
      });
      await tx.fairnessSeed.update({ where: { id: seed.id }, data: { nonce } });
      await tx.game.update({ where: { id: gameId }, data: { playCount: { increment: 1 } } }).catch(() => {});
      await grantXp(tx, userId, economy.xpPerBet(bet));
      await bumpMissions(tx, userId, { rounds: 1, wager: bet, win: 0, gameId });
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      return { round, view: game.redact(state as never), balance: wallet?.balance ?? 0n, jackpot };
    });
  } catch (error) {
    if (error instanceof InsufficientFunds) throw new GameError('Solde insuffisant.', 402);
    throw error;
  }
}

/** Action sur une manche ouverte (révéler une case, encaisser…). */
export async function actOnRound({ userId, gameId, action }: { userId: string; gameId: string; action: unknown }) {
  const game = getGame(gameId);
  if (!game || game.kind !== 'stateful') throw new GameError('Jeu introuvable.', 404);

  const round = await db.gameRound.findFirst({ where: { userId, gameId, state: 'OPEN' } });
  if (!round) throw new GameError('Aucune partie en cours.', 404);

  const parsed = game.actions.safeParse(action);
  if (!parsed.success) throw new GameError('Action invalide.');

  const saved = JSON.parse(round.resultJson) as { options: unknown; state: unknown };
  const step = game.act(saved.state as never, parsed.data as never, Date.now());
  const payout = step.done ? Math.floor(Number(round.bet) * step.multiplier) : 0;

  return db.$transaction(async (tx) => {
    if (step.done && payout > 0) await move(tx, userId, BigInt(payout), 'WIN', round.idempotencyKey, { gameId, multiplier: step.multiplier });
    const updated = await tx.gameRound.update({
      where: { id: round.id },
      data: {
        resultJson: JSON.stringify({ options: saved.options, state: step.state }),
        state: step.done ? 'SETTLED' : 'OPEN',
        multiplier: step.done ? step.multiplier : 0,
        payout: BigInt(payout),
        settledAt: step.done ? new Date() : null,
      },
    });
    if (step.done && payout > 0) await bumpMissions(tx, userId, { rounds: 0, wager: 0, win: payout, gameId });
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    return {
      view: game.redact(step.state as never),
      done: step.done,
      multiplier: step.done ? step.multiplier : 0,
      payout,
      balance: wallet?.balance ?? 0n,
      round: updated,
    };
  });
}

/** Manche à étapes encore ouverte (reprise après un rechargement de page). */
export async function currentRound(userId: string, gameId: string) {
  const game = getGame(gameId);
  if (!game || game.kind !== 'stateful') return null;
  const round = await db.gameRound.findFirst({ where: { userId, gameId, state: 'OPEN' } });
  if (!round) return null;
  const saved = JSON.parse(round.resultJson) as { state: unknown };
  return { bet: Number(round.bet), view: game.redact(saved.state as never), roundId: round.id };
}
