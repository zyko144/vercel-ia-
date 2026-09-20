---
name: nv-casino-economy
description: Économie virtuelle NIGHTVAULT : NV Coins, faucets, sinks, inflation, jackpots, progression. À utiliser pour toute récompense, tout prix, tout réglage d'équilibrage.
---

# Économie NIGHTVAULT (NV Coins)

## Principes
- monnaie **100 % virtuelle** : aucun achat, aucune conversion, aucun retrait. Jamais de lien avec de l'argent réel.
- entiers uniquement, stockés en `BigInt`/`Decimal` côté base
- toute création ou destruction de NV passe par `src/lib/economy/wallet.ts` et crée une `Transaction` typée

## Faucets (sources) — valeurs de départ
| Source | Montant |
|---|---|
| Bonus de bienvenue | 10 000 NV |
| Récompense quotidienne (J1→J7) | 1 000 → 10 000 NV |
| Mission quotidienne | 500 → 5 000 NV |
| Mission hebdo | 10 000 NV |
| Passage de niveau | 1 000 × niveau |
| Succès | 500 → 50 000 NV |
| Filet de sécurité (solde < 500, 1×/jour) | 2 000 NV |

## Sinks (puits)
- **house edge des jeux** : le sink principal (~3 % de chaque mise en moyenne)
- cosmétiques : 2 000 → 500 000 NV (cadres, thèmes, titres, avatars)
- contribution jackpot : 1 % de chaque mise (redistribué plus tard → sink temporaire)
- frais d'entrée d'événements

## Équation de santé
`inflation_jour = (faucets_jour − sinks_jour) / masse_monétaire`
Cible : **−1 % à +3 % par jour**. Au-delà, baisser `faucetMultiplier` dans `economy.config.ts`.

## Réglages centralisés
Tout est dans `src/lib/economy/config.ts` : `faucetMultiplier`, `rewardMultiplier`, `jackpotContribution`, `sinkMultiplier`, `inflationTarget`. L'admin modifie ces valeurs, jamais les montants en dur dans les jeux.

## Avant de changer un montant
Lancer `npm run simulate:economy -- --players=10000 --days=30` et vérifier : masse monétaire, solde médian, inflation, part des joueurs à sec (< 5 % visé).
