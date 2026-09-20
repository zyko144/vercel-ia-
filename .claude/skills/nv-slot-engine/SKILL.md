---
name: nv-slot-engine
description: Moteur de machines à sous NIGHTVAULT : reel strips, lignes/ways, wild, scatter, free spins, cascades, réglage du RTP. À utiliser pour créer ou modifier un slot.
---

# SlotEngine NIGHTVAULT

## Configuration d'un slot (`src/lib/games/slots/<id>.config.ts`)
```ts
export const config: SlotConfig = {
  id: 'neon-fortune', name: 'Neon Fortune',
  reels: 5, rows: 3,
  symbols: [...],            // id, nom, payouts {3,4,5}, type: normal|wild|scatter
  strips: [[...], [...]],    // une bande par rouleau : la probabilité vient des bandes
  lines: PAYLINES_25,        // ou { ways: true }
  features: { freeSpins: {...}, multiplier: {...}, expanding: {...}, sticky: {...}, cascade: {...} },
  math: { rtp: 0.962, volatility: 'medium', maxWin: 5000, hitFrequency: 0.28 },
};
```

## Réglage du RTP
Le RTP se règle **par les bandes** (nombre d'occurrences de chaque symbole), pas par un facteur appliqué au gain. Boucle : modifier les bandes → simuler 1 M de spins → ajuster. Documenter la bande finale.

## États d'un spin (ReelEngine, client)
`IDLE → SPIN_START → SPINNING → DECELERATION → STOPPING (rouleau par rouleau) → RESULT → WIN → BONUS`
Timings de référence : démarrage 120 ms, vitesse de croisière ~28 symboles/s, arrêt du rouleau n à `600 ms + n × 180 ms`, rebond (overshoot) 60 ms sur 8 px.

## Sensation obligatoire
- les symboles défilent vraiment (translation continue), jamais un simple remplacement d'image
- anticipation : si 2 scatters sont tombés, le rouleau suivant ralentit 900 ms de plus
- flou de mouvement léger pendant SPINNING, net à l'arrêt
- chaque arrêt = un son distinct + une micro-secousse (2 px, 80 ms)
- lignes gagnantes animées une par une, puis toutes ensemble

## Interdits
- décider du résultat côté client
- rejouer le même timing exact à chaque spin (varier ±40 ms)
