---
name: nv-qa-admin
description: QA et administration NIGHTVAULT : matrice de tests par jeu, tests Playwright, tableau de bord admin, simulateur d'économie. À utiliser avant de déclarer une phase terminée.
---

# QA & Admin NIGHTVAULT

## Aucune phase n'est « finie » sans
1. `npx tsc --noEmit` sans erreur
2. `npm run lint` sans erreur
3. `npm run build` qui passe
4. `npm run simulate -- --game=<id>` conforme au RTP annoncé (±0,5 %)
5. le jeu joué à la main : mise, résultat, solde, historique, rechargement de page

## Matrice par jeu
| Test | Attendu |
|---|---|
| mise < min / > max / non entière | refus 400, aucun débit |
| solde insuffisant | refus, message clair |
| double clic sur Jouer | une seule manche (idempotence) |
| rechargement pendant une manche | état repris ou manche close proprement |
| réponse serveur falsifiée côté client | sans effet (le solde vient du serveur) |
| clavier seul | jeu entièrement jouable |
| mobile 390 px | aucun débordement, contrôles accessibles |

## Playwright
`tests/e2e/` : inscription, connexion, solde initial, lancement de chaque jeu, une mise, historique, déconnexion. Un test par catégorie de jeu minimum.

## Admin (`/admin`)
Dashboard (masse monétaire, NV créés/dépensés aujourd'hui, solde moyen/médian, mises, gains, house edge réel, jackpots, inflation) · Jeux (RTP réel vs théorique) · Joueurs · Économie (multiplicateurs) · Simulateur · Jackpots · Missions · Récompenses · Événements · Assets · Audio · Logs · Paramètres.

## Simulateur d'économie
`/admin/economy/simulator` : 1 000 / 10 000 / 100 000 joueurs × 1 / 7 / 30 / 90 jours → masse monétaire, solde moyen et médian, inflation, distribution (déciles), joueurs à sec, faucets, sinks, jackpots. Sert à valider tout changement de réglage.
