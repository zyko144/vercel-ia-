/**
 * Réglages centraux de l'économie CASINHO.
 * Toute valeur monétaire est en NV Coins, en entier. Aucun lien avec de l'argent réel.
 * L'admin modifie ces multiplicateurs : jamais de montant en dur ailleurs dans le code.
 */
export const economy = {
  currency: { code: 'NV', name: 'NV Coins' },

  // Faucets (création de monnaie)
  welcomeBonus: 10_000,
  daily: [1_000, 1_500, 2_000, 3_000, 4_000, 6_000, 10_000], // J1 → J7
  safetyNet: { threshold: 500, amount: 2_000, cooldownHours: 24 },
  levelReward: (level: number) => 1_000 * level,
  xpPerBet: (bet: number) => Math.max(1, Math.floor(bet / 100)),
  xpForLevel: (level: number) => Math.floor(120 * level ** 1.45),

  // Sinks (destruction de monnaie) : le principal reste l'avantage de la maison
  jackpotContribution: 0.01, // 1 % de chaque mise va aux jackpots

  // Multiplicateurs pilotables depuis l'admin
  faucetMultiplier: 1,
  rewardMultiplier: 1,
  sinkMultiplier: 1,
  inflationTarget: 0.02, // +2 %/jour visé au maximum

  // Bornes de mise par défaut (chaque jeu peut les resserrer)
  bet: { min: 10, max: 100_000, step: 10 },
} as const;

export const LEVELS = [
  { tier: 'Novice', from: 1, color: '#8a93a8' },
  { tier: 'Bronze', from: 5, color: '#c2703e' },
  { tier: 'Argent', from: 12, color: '#c9d3e4' },
  { tier: 'Or', from: 22, color: '#e9bf5a' },
  { tier: 'Platine', from: 35, color: '#6fe3d2' },
  { tier: 'Diamant', from: 50, color: '#63b8ff' },
  { tier: 'Maître', from: 70, color: '#b06bff' },
  { tier: 'Élite', from: 90, color: '#ff5fa2' },
  { tier: 'Légende', from: 120, color: '#ffd166' },
] as const;

export function tierOf(level: number) {
  return [...LEVELS].reverse().find((entry) => level >= entry.from) ?? LEVELS[0];
}

/** XP cumulé nécessaire pour atteindre un niveau. */
export function xpToReach(level: number) {
  let total = 0;
  for (let l = 1; l < level; l++) total += economy.xpForLevel(l);
  return total;
}

export function levelFromXp(xp: number) {
  let level = 1;
  let remaining = xp;
  while (remaining >= economy.xpForLevel(level) && level < 999) {
    remaining -= economy.xpForLevel(level);
    level += 1;
  }
  return { level, intoLevel: remaining, needed: economy.xpForLevel(level) };
}
