import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '@/lib/db';
import { economy } from '@/lib/economy/config';
import { hashSeed, newClientSeed, newServerSeed } from '@/lib/fairness';

const COOKIE = 'casinho_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours
const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? 'dev-secret-change-me');

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  level: number;
  xp: number;
  avatarSeed: string;
  balance: bigint;
};

async function sign(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret);
}

export async function setSession(userId: string) {
  const token = await sign(userId);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Utilisateur connecté (null si la session est absente ou invalide). */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const user = await db.user.findUnique({
      where: { id: String(payload.sub) },
      include: { wallet: true },
    });
    if (!user || user.banned) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      level: user.level,
      xp: user.xp,
      avatarSeed: user.avatarSeed,
      balance: user.wallet?.balance ?? 0n,
    };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Response('Non connecté', { status: 401 });
  return user;
}

const USERNAME = /^[a-zA-Z0-9_]{3,16}$/;

export function checkCredentials(username: string, password: string) {
  if (!USERNAME.test(username)) return 'Le pseudo doit faire 3 à 16 caractères (lettres, chiffres, _).';
  if (password.length < 6) return 'Le mot de passe doit faire au moins 6 caractères.';
  return null;
}

/** Inscription : crée le joueur, son portefeuille, son bonus de bienvenue et sa première paire de seeds. */
export async function register(username: string, password: string, displayName?: string) {
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) return { error: 'Ce pseudo est déjà pris.' as const };

  const passwordHash = await bcrypt.hash(password, 10);
  const serverSeed = newServerSeed();

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username,
        passwordHash,
        displayName: displayName?.trim() || username,
        avatarSeed: Math.random().toString(36).slice(2, 10),
        wallet: { create: { balance: BigInt(economy.welcomeBonus) } },
      },
    });
    await tx.transaction.create({
      data: {
        userId: created.id,
        kind: 'WELCOME',
        amount: BigInt(economy.welcomeBonus),
        balance: BigInt(economy.welcomeBonus),
        ref: 'welcome',
      },
    });
    await tx.fairnessSeed.create({
      data: {
        userId: created.id,
        serverSeed,
        serverSeedHash: hashSeed(serverSeed),
        clientSeed: newClientSeed(),
      },
    });
    await tx.notification.create({
      data: {
        userId: created.id,
        kind: 'WELCOME',
        title: 'Bienvenue au CASINHO',
        body: `${economy.welcomeBonus.toLocaleString('fr-FR')} NV t'attendent. Bonne chance.`,
      },
    });
    return created;
  });

  await setSession(user.id);
  return { user };
}

export async function login(username: string, password: string) {
  const user = await db.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: 'Pseudo ou mot de passe incorrect.' as const };
  }
  if (user.banned) return { error: 'Ce compte est suspendu.' as const };
  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  await setSession(user.id);
  return { user };
}
