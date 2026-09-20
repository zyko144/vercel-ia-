---
name: nv-fairness-security
description: Provably fair et sécurité NIGHTVAULT : seeds HMAC, nonce, vérificateur public, autorité serveur, idempotence, anti-triche. À utiliser pour toute route de jeu ou de solde.
---

# Fairness & sécurité NIGHTVAULT

## Provably fair (HMAC-SHA256)
- `serverSeed` (32 octets aléatoires) généré côté serveur, **hash publié avant** la première manche
- `clientSeed` choisi par le joueur (modifiable : cela crée une nouvelle paire de seeds et révèle l'ancienne)
- `nonce` incrémenté à chaque manche
- flux d'aléa : `HMAC(serverSeed, `${clientSeed}:${nonce}:${cursor}`)` → octets → floats [0,1)
- à la rotation, l'ancien `serverSeed` est révélé : n'importe qui peut rejouer chaque manche sur `/fairness`

## Autorité serveur
Le client n'envoie que : `gameId`, `bet`, options du jeu, `idempotencyKey`. Tout le reste est calculé serveur.
Chaque route de jeu : `auth → zod → rate limit → idempotence → transaction (solde + manche) → réponse`.

## Idempotence
`idempotencyKey` (uuid client) unique par manche : une clé déjà vue renvoie la réponse d'origine sans rejouer ni redébiter.

## Anti-triche à journaliser
double requête, rafale anormale (> 10 manches/s), nonce incohérent, session invalide, mise hors bornes, état impossible (cash-out d'une manche déjà terminée), solde négatif évité par contrainte SQL.

## Contraintes base
- `balance >= 0` en contrainte CHECK
- toute écriture de solde dans la même transaction que la `Transaction` correspondante
- `@@unique([userId, idempotencyKey])` sur GameRound
