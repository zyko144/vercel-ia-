# CASINHO — casino virtuel

Casino web premium **100 % virtuel** : les **NV Coins** sont une monnaie de jeu.
Aucun dépôt, aucun retrait, aucune conversion, aucun paiement. Jamais.

## Lancer en local

```bash
cd nightvault
npm install
npx prisma migrate dev      # crée la base SQLite (dev.db)
npm run db:seed             # catalogue des jeux, jackpots, missions, succès
npm run dev                 # http://localhost:3030
```

Variables (`.env`) :

```
DATABASE_URL="file:./dev.db"      # en production : URL Postgres
AUTH_SECRET="…"                   # 32 octets aléatoires
CASINO_NAME="CASINHO"
AI_IMAGE_PROVIDER="none"          # none | gemini | openai (génération d'assets hors-ligne)
```

## Vérifier les mathématiques

```bash
npm run simulate                     # tous les jeux, 200 000 manches par profil
npm run simulate -- --game=mines --rounds=1000000
npx tsx scripts/calibrate.ts         # calcul exact (Keno, Wheel) + facteur d'échelle des slots
npx tsx scripts/autotune.ts          # recale les tables de gains des slots sur le RTP visé
```

Les RTP annoncés dans le catalogue sont **mesurés**, pas déclarés : toute modification d'un jeu doit
repasser par `npm run simulate`.

## Architecture

```
src/lib/fairness.ts          HMAC-SHA256 : serverSeed + clientSeed + nonce (provably fair)
src/lib/games/types.ts       contrat commun InstantGame / StatefulGame
src/lib/games/instant/*      dice, limbo, plinko, wheel, keno, roulette (fonctions pures)
src/lib/games/stateful/*     mines, crash, tower (manche ouverte, état en base)
src/lib/games/slots/*        moteur de machines à sous + configurations + paytables.json
src/lib/games/play.ts        débit, résultat, gain, jackpot, XP, missions — en une transaction
src/lib/economy/*            NV Coins, faucets, sinks, niveaux, missions
src/lib/audio/engine.ts      tous les sons, synthétisés en Web Audio (aucun fichier)
src/components/brand/*       logo animé + brand marks SVG de chaque jeu
src/components/games/*       interfaces de jeu (rouleaux, grille de mines, courbe de crash…)
```

**Règle d'or** : le client n'invente jamais un résultat. Il envoie une mise, le serveur calcule,
écrit en base et renvoie le résultat ; le client se contente de l'animer.

## Déploiement Render

Le dépôt contient `render.yaml`. Dans Render :

1. **New → Blueprint**, choisir ce dépôt : le service `casinho` est détecté (racine `nightvault`).
2. Renseigner les variables : `DATABASE_URL` (Postgres), `AUTH_SECRET`, `CASINO_NAME`.
3. Passer le datasource Prisma en `postgresql` (`prisma/schema.prisma`) puis `npx prisma migrate deploy`.

SQLite convient au développement local ; en production, Postgres est nécessaire
(le disque de Render est éphémère).

## État d'avancement

| Domaine | État |
|---|---|
| Authentification, sessions, solde persistant | ✅ |
| Économie (faucets, sinks, XP, niveaux, missions, quotidien) | ✅ |
| Provably fair + rotation des seeds | ✅ |
| Jackpots progressifs (mini / major / mega) | ✅ |
| Moteurs de jeu vérifiés par simulation | ✅ 11 jeux |
| Interfaces jouables | ✅ Mines, Crash, Plinko, Dice, 3 machines à sous |
| Interfaces à faire | Limbo, Wheel, Keno, Roulette, Tower, puis les 39 jeux annoncés |
| Audio | ✅ synthèse par jeu (slots, mines, crash, plinko, roulette, cartes) |
| Admin, analytics, simulateur d'économie | ⏳ en cours |
| Profil, inventaire, classement, événements | ⏳ en cours |
