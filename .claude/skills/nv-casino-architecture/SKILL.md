---
name: nv-casino-architecture
description: Architecture du casino NIGHTVAULT : contrat GameEngine, autorité serveur, structure des dossiers, flux d'une manche. À utiliser avant d'ajouter un jeu, une route API ou un module au projet nightvault/.
---

# Architecture NIGHTVAULT

## Règle d'or
**Le serveur décide de tout.** Le client affiche. Une manche n'existe que si le serveur l'a créée, résolue et écrite en base dans une transaction.

## Contrat commun (src/lib/games/engine.ts)
Chaque jeu implémente :
```ts
interface GameEngine<Bet, Result> {
  id: string;                    // 'mines', 'neon-fortune'…
  category: GameCategory;        // slots | table | dice | arcade | quick
  math: GameMath;                // rtp, volatility, maxWin, hitFrequency
  validateBet(bet: unknown): Bet;              // zod, lève si invalide
  play(ctx: RoundContext, bet: Bet): Result;   // pur : (seed, nonce, bet) -> résultat
  payout(bet: Bet, result: Result): number;    // en NV, entier
  describe(result: Result): string;            // pour l'historique
}
```
`play()` doit être **pure et déterministe** : mêmes seeds + même nonce + même mise = même résultat. Aucun `Math.random()`, aucune date, aucun accès réseau ou base dans `play()`.

## Flux d'une manche
1. `POST /api/games/[id]/play` (auth requise, zod, rate limit, clé d'idempotence)
2. transaction : verrou wallet → débit de la mise → `engine.play()` → `engine.payout()` → crédit → contribution jackpot → écriture `GameRound` → incrément du nonce
3. réponse : résultat + nouveau solde + données de fairness (hash du server seed, client seed, nonce)
4. le client **rejoue l'animation** du résultat reçu ; il ne le calcule jamais

## Dossiers (nightvault/)
- `src/lib/games/<id>/` : engine.ts (maths pures), config.ts, index.ts
- `src/lib/economy/` : wallet, faucets, sinks, jackpots, niveaux
- `src/lib/fairness/` : HMAC, seeds, vérificateur
- `src/components/games/<id>/` : rendu + animations (client)
- `src/app/(game)/game/[slug]/` : page de jeu
- `scripts/simulate.ts` : simulations de RTP et d'économie

## Interdits
- calculer un gain côté client
- stocker un solde ailleurs que dans la table Wallet
- `float` pour la monnaie (toujours des entiers NV)
- deux écritures de solde hors transaction
