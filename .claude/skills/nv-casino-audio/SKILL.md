---
name: nv-casino-audio
description: Identité sonore NIGHTVAULT : synthèse Web Audio par jeu, bus de mixage, ducking, règles de licence. À utiliser pour tout son du casino.
---

# Audio NIGHTVAULT

## Approche : synthèse procédurale d'abord
Les sons sont **générés en Web Audio** (`src/lib/audio/`) : aucun problème de licence, poids nul, variation infinie (chaque clic est légèrement différent : pitch ±3 %, durée ±5 %).
Un échantillon n'est importé que s'il est **licencié** et documenté (voir plus bas).

## Bus
`MASTER → { MUSIC, SFX, UI, AMBIENCE, WIN, JACKPOT }`
- ducking : pendant WIN/JACKPOT, AMBIENCE et MUSIC descendent de 6 dB en 150 ms, remontent en 400 ms
- chaque bus a son gain réglable ; l'état est persisté côté client

## Signature par jeu (obligatoirement différente)
| Jeu | Matière sonore |
|---|---|
| Slots | moteur (saw filtré + LFO), cliquetis de rouleau, butée métallique, pluie de pièces |
| Mines | métal frappé, ouverture de plaque, cristal pour la gemme, explosion (bruit + sub) |
| Roulette | roulement continu, bille (impacts aléatoires), cliquetis du diamant, jetons |
| Blackjack | glissement de carte (bruit filtré), flip, pile de jetons |
| Plinko | bois/métal courts et pitchés selon la rangée |
| Crash | drone montant en pitch, tension, rupture large bande |

## Règles
- jamais deux jeux avec le même son
- un son UI ne dépasse jamais −18 dBFS ; un jackpot ne dépasse pas −6 dBFS
- tout son se déclenche par un `AudioEvent` nommé, jamais par un appel direct à un oscillateur depuis un composant
- premier son uniquement après une interaction utilisateur (politique navigateur)

## Import d'un échantillon (si jamais)
Enregistrer dans `AudioAsset` : source, url, auteur, licence, attribution requise, date, hash SHA-256, jeu. **Aucun son propriétaire sans licence.**
