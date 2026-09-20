---
name: nv-casino-math
description: Mathématiques des jeux de casino : RTP, volatilité, hit frequency, tables de gains, espérance, simulation Monte-Carlo. À utiliser pour créer ou régler les maths de tout jeu NIGHTVAULT.
---

# Mathématiques NIGHTVAULT

## Jamais de probabilités « au feeling »
Tout jeu doit avoir un fichier `math.md` (ou un bloc de config commenté) avec :
- espace des résultats et probabilité exacte de chacun
- table de gains (multiplicateurs)
- **RTP théorique** = Σ (p_i × payout_i), calculé, pas estimé
- **house edge** = 1 − RTP
- **hit frequency** = Σ p_i pour payout_i > 0
- **volatilité** = écart-type des payouts (faible < 1,5 ; moyenne 1,5–4 ; haute > 4)
- gain maximum

## Cibles NIGHTVAULT
| Catégorie | RTP | Volatilité |
|---|---|---|
| Slots | 94 – 96,5 % | faible à très haute selon le jeu |
| Table (blackjack, baccarat) | 98 – 99,5 % | faible |
| Roulette européenne | 97,3 % (exact : 36/37) | moyenne |
| Arcade/Risk (mines, crash, plinko) | 96 – 99 % | choisie par le joueur |
| Quick games | 94 – 97 % | moyenne |

## Formules de référence
- Mines (n cases, m mines, k révélations) : p(survie) = Π_{i=0..k-1} (n−m−i)/(n−i) ; multiplicateur équitable = 1/p ; appliquer `× RTP`
- Crash : distribution 1/x tronquée → multiplicateur = max(1, floor(rtp·2^52 / (2^52 − h)) ) avec h uniforme
- Plinko : binomiale C(n,k)/2^n ; les multiplicateurs doivent vérifier Σ p_k × mult_k = RTP
- Slots : RTP = Σ sur toutes les combinaisons gagnantes (produit des poids / total) × payout

## Vérification obligatoire
`npm run simulate -- --game=<id> --rounds=1000000`
Le RTP simulé doit être à ±0,5 % du RTP théorique (1 M de manches). Sinon : bug dans le moteur ou dans la table.
Consigner le résultat dans `docs/math/<id>.md`.
