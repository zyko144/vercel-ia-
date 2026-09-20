---
name: nv-casino-ui
description: UI/UX du casino NIGHTVAULT : lobby, page de jeu, cartes, carrousels, compteurs animés, mobile. À utiliser pour tout écran du site.
---

# UI NIGHTVAULT

## Ce qu'on ne fait jamais
Cartes plates sans profondeur · boutons rectangulaires gris · emoji comme icône de marque · glow partout · dégradés violet→rose criards · tableaux bruts · plus de 2 polices.

## Ce qu'on fait
- **profondeur** : chaque carte = surface + bordure 1 px + liseré interne + ombre + reflet subtil au survol (translation 2 px, échelle 1,02, 200 ms)
- **verre fumé** pour les panneaux flottants : `backdrop-filter: blur(20px) saturate(140%)`
- **or** utilisé avec parcimonie : titres, gains, bordures d'éléments premium
- fond animé très discret : dégradé radial qui respire (20 s) + grain 2 % + quelques particules lentes
- `prefers-reduced-motion` respecté partout

## Compteur de solde
Jamais de saut sec : interpolation `easeOutExpo` 800 ms, chiffres tabulaires, pulsation dorée + particules si le gain dépasse 50× la mise.

## Page de jeu
En haut : brand mark du jeu + RTP + volatilité + solde. Au centre : le jeu (plein écran possible). En bas : mise, actions, auto. À côté : historique, règles, fairness, stats. Rien d'autre.

## Mobile
Barre basse : Accueil · Jeux · Missions · Récompenses · Profil. Zone tactile ≥ 44 px. Le jeu occupe la largeur, les contrôles restent accessibles au pouce.
